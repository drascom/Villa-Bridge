import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAccessControl } from "./access-control.js";
import { AgentTokenStore } from "./agent-tokens.js";
import { AuthStore } from "./auth-store.js";
import type { AutomationRunResult } from "./automation-engine.js";
import { type Automation, validateAutomations } from "./automations.js";
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  clientCapabilitiesMetaKey,
  mcpServerInfo,
  mcpTools,
  protocolVersionMetaKey,
  registerMcpEndpoint,
  serverInfoMetaKey
} from "./mcp.js";
import type { HomeGroup } from "./home-groups.js";
import type { DeviceControlView, DeviceView, JsonObject } from "./types.js";

const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];

/** Zorunlu `_meta` alanlarının ikisi de her istekte bulunur. */
const requiredMeta = {
  [protocolVersionMetaKey]: protocolVersion,
  [clientCapabilitiesMetaKey]: {}
};

const control = (control: Partial<DeviceControlView> & Pick<DeviceControlView, "id" | "kind">): DeviceControlView => ({
  property: control.id,
  name: control.id,
  value: null,
  ...control
} as DeviceControlView);

const device = (device: Partial<DeviceView> & Pick<DeviceView, "id" | "name">): DeviceView => ({
  sourceName: device.name,
  type: "EndDevice",
  category: "light",
  detectedCategory: "light",
  role: "auto",
  model: null,
  image: { model: null, candidates: [], selectionRequired: false, userSelected: false, preferenceKey: device.id },
  vendor: null,
  description: null,
  supported: true,
  interviewCompleted: true,
  preparing: false,
  availability: "online",
  lastSeen: "2026-08-06T09:00:00.000Z",
  stateUpdatedAt: null,
  otaSupported: false,
  options: { transition: 0, debounce: 0, retain: false },
  features: [],
  alerts: [],
  controls: [],
  state: { state: "ON", brightness: 120 },
  ...device
} as DeviceView);

const devices: DeviceView[] = [
  device({
    id: "0x0011111111111111",
    name: "Salon lambası",
    category: "light",
    linkquality: 84,
    powerSource: "Mains (single phase)",
    controls: [
      control({ id: "brightness", kind: "level", name: "Parlaklık", value: 120, min: 0, max: 254, unit: "%" }),
      control({ id: "main", kind: "switch", name: "Salon lambası", value: true, property: "state" }),
      control({ id: "power_on_behavior", kind: "select", name: "Açılış davranışı", value: "on", adminOnly: true }),
      control({ id: "main:color", kind: "color", name: "Renk", value: "#ffffff", property: "color" })
    ]
  }),
  device({
    id: "0x0022222222222222",
    name: "Mutfak perdesi",
    category: "cover",
    availability: "offline",
    controls: [control({ id: "cover:position", kind: "cover", name: "Perde", value: 40, min: 0, max: 100 })]
  }),
  device({ id: "0x0033333333333333", name: "Hol sensörü", category: "unknown", controls: [] }),
  // §8.1 — ajan yolundan yazılamayacak iki kanal; panelden elle kumanda edilebilirler.
  device({
    id: "0x0044444444444444",
    name: "Giriş kilidi",
    category: "lock",
    controls: [control({
      id: "lock:state",
      property: "state",
      kind: "lock",
      name: "Kilit",
      value: "LOCK",
      values: ["LOCK", "UNLOCK"]
    })]
  }),
  device({
    id: "0x0055555555555555",
    name: "Bahçe sireni",
    category: "unknown",
    controls: [control({
      id: "siren:alarm",
      property: "alarm",
      kind: "siren",
      name: "Alarm",
      value: false,
      valueOn: "ON",
      valueOff: "OFF"
    })]
  })
];

const homeGroups: HomeGroup[] = [
  { id: "salon", name: "Salon", items: [{ deviceId: "0x0011111111111111", controlId: "main" }] },
  { id: "mutfak", name: "Mutfak", items: [{ deviceId: "0x0022222222222222", controlId: "@device" }] }
];

/** Kural yazan testlerin başlangıç durumu; her koşum kendi kopyasını alır. */
const seedAutomations = (): Automation[] => [
  {
    id: "aaaabbbbcccc",
    name: "Akşam ışıkları",
    enabled: true,
    triggers: [{ type: "time", at: "19:30", days: [1, 2, 3, 4, 5, 6, 7] }],
    conditions: [],
    actions: [{ type: "device", deviceId: "0x0011111111111111", property: "state", value: "ON" }],
    lastRunAt: "2026-08-05T16:30:00.000Z",
    lastRunOk: true
  },
  // Damgasız, elle yazılmış eski kural: okunabilmeli ve yazılabilmeli (geriye uyumluluk).
  {
    id: "ddddeeeeffff",
    name: "Sabah perdesi",
    enabled: false,
    triggers: [{ type: "sun", event: "sunrise", offsetMinutes: -15, days: [1, 2, 3, 4, 5] }],
    conditions: [],
    actions: [{ type: "device", deviceId: "0x0022222222222222", property: "position", value: 100 }],
    lastRunAt: null,
    lastRunOk: null
  }
];

interface Harness {
  app: FastifyInstance;
  token: string;
  tokenRecord: { id: string; name: string };
  cookie: string;
  csrfToken: string;
  /** `set_device` çağrılarının izi; gerçek cihaza hiçbir şey gitmez. */
  writes: Array<{ deviceId: string; payload: JsonObject }>;
  /** Diskteki kural dosyasının yerine geçen bellek durumu. */
  automations: Automation[];
  /** Her yazmadan **önce** alınan anlık kopya — gerçek wiring'deki yedeğin karşılığı. */
  backups: Automation[][];
  runs: string[];
  /** `control_automation` çalıştırmasının döndüreceği sonuç; testler değiştirir. */
  runResult: AutomationRunResult;
}

const cookieFrom = (response: {
  headers: Record<string, string | string[] | number | undefined>;
}): string => {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string") throw new Error("Session cookie bulunamadı.");
  return header.split(";")[0];
};

const setupApp = async (
  context: { after: (callback: () => Promise<void>) => void },
  options: { allowedOrigins?: string[]; allowDangerousControls?: boolean } = {}
): Promise<Harness> => {
  const directory = await mkdtemp(join(tmpdir(), "villa-mcp-"));
  const app = Fastify();
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const authStore = new AuthStore(join(directory, "auth.json"), {
    scrypt: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 }
  });
  const agentTokens = new AgentTokenStore(join(directory, "agent-tokens.json"));
  await registerAccessControl(app, authStore, {
    agentTokens,
    mcpAllowedOrigins: options.allowedOrigins ?? []
  });
  // Tek nesne kurulur ve hep o taşınır: `save()` alan değiştirdiğinde test de aynı nesneyi görür.
  const harness = {
    app,
    token: "",
    tokenRecord: { id: "", name: "" },
    cookie: "",
    csrfToken: "",
    writes: [],
    automations: seedAutomations(),
    backups: [],
    runs: [],
    runResult: "ok"
  } satisfies Harness as Harness;
  registerMcpEndpoint(app, {
    devices: () => devices,
    homeGroups: async () => homeGroups,
    setDevice: async (deviceId, payload) => {
      harness.writes.push({ deviceId, payload });
    },
    automations: {
      list: async () => harness.automations.map((automation) => ({ ...automation })),
      // Gerçek wiring'in aynısı: **önce** yedek, sonra doğrulayıp kaydetme.
      save: async (next) => {
        harness.backups.push(harness.automations.map((automation) => ({ ...automation })));
        harness.automations = validateAutomations(next, (deviceId) =>
          devices.find((candidate) => candidate.id === deviceId));
        return harness.automations.map((automation) => ({ ...automation }));
      },
      run: async (id) => {
        harness.runs.push(id);
        return harness.runResult;
      }
    },
    allowDangerousControls: () => options.allowDangerousControls === true
  });
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { username: "owner", password: "correct horse battery", residentPin: "638251" }
  });
  const cookie = cookieFrom(setup);
  const created = await app.inject({
    method: "POST",
    url: "/api/agent-tokens",
    headers: { cookie, "x-villa-csrf": setup.json().csrfToken },
    payload: { name: "Asistan" }
  });
  assert.equal(created.statusCode, 200);
  harness.token = created.json().token;
  harness.tokenRecord = created.json().record as { id: string; name: string };
  harness.cookie = cookie;
  harness.csrfToken = setup.json().csrfToken;
  return harness;
};

const rpc = (method: string, params: Record<string, unknown> = {}, id: unknown = 1) => ({
  jsonrpc: "2.0",
  ...(id === undefined ? {} : { id }),
  method,
  params: { ...params, _meta: { ...requiredMeta, ...(params._meta as object ?? {}) } }
});

const callHeaders = (harness: Harness, method: string, name?: string) => ({
  authorization: `Bearer ${harness.token}`,
  "mcp-protocol-version": protocolVersion,
  "mcp-method": method,
  ...(name === undefined ? {} : { "mcp-name": name })
});

test("/mcp token olmadan korumasız değildir ve çerez oturumunu kabul etmez", async (context) => {
  const harness = await setupApp(context);
  const body = rpc("tools/list");

  const anonymous = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { "mcp-protocol-version": protocolVersion, "mcp-method": "tools/list" },
    payload: body
  });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().id, null);
  // Taşıma katmanı kodları JSON-RPC'nin ayrılmış aralığının dışında (HTTP durumu × 100).
  assert.equal(anonymous.json().error.code, 40100);

  // Çerez oturumu tarayıcıdan gelir; ajan ucu bilerek reddeder.
  const withCookie = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      cookie: harness.cookie,
      "x-villa-csrf": harness.csrfToken,
      "mcp-protocol-version": protocolVersion,
      "mcp-method": "tools/list"
    },
    payload: body
  });
  assert.equal(withCookie.statusCode, 401);

  const bogus = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { ...callHeaders(harness, "tools/list"), authorization: "Bearer nope" },
    payload: body
  });
  assert.equal(bogus.statusCode, 401);
});

test("iptal edilen token anında geçersizdir", async (context) => {
  const harness = await setupApp(context);
  const tokens = await harness.app.inject({
    method: "GET",
    url: "/api/agent-tokens",
    headers: { cookie: harness.cookie }
  });
  assert.equal(tokens.statusCode, 200);
  const [record] = tokens.json().tokens as Array<{ id: string; name: string }>;
  assert.equal(record.name, "Asistan");
  assert.equal(Object.hasOwn(record, "tokenHash"), false);

  const revoked = await harness.app.inject({
    method: "DELETE",
    url: `/api/agent-tokens/${record.id}`,
    headers: { cookie: harness.cookie, "x-villa-csrf": harness.csrfToken }
  });
  assert.equal(revoked.statusCode, 200);

  const denied = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: rpc("tools/list")
  });
  assert.equal(denied.statusCode, 401);
});

test("ajan token uçları ev kullanıcısına kapalıdır", async (context) => {
  const harness = await setupApp(context);
  const login = await harness.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { mode: "resident", secret: "638251" }
  });
  const cookie = cookieFrom(login);
  const denied = await harness.app.inject({
    method: "GET",
    url: "/api/agent-tokens",
    headers: { cookie }
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, "ADMIN_REQUIRED");
});

test("GET ve DELETE 405 döner, bilinmeyen metot 404 ve -32601 verir", async (context) => {
  const harness = await setupApp(context);
  for (const method of ["GET", "DELETE"] as const) {
    const response = await harness.app.inject({
      method,
      url: "/mcp",
      headers: { authorization: `Bearer ${harness.token}` }
    });
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
    assert.equal(response.json().error.code, 40500);
  }
  const unknown = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "resources/list"),
    payload: rpc("resources/list")
  });
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.json().error.code, -32601);
});

test("zorunlu başlıklar gövdeyle birebir eşleşmeli", async (context) => {
  const harness = await setupApp(context);

  const missingMethod = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${harness.token}`,
      "mcp-protocol-version": protocolVersion
    },
    payload: rpc("tools/list")
  });
  assert.equal(missingMethod.statusCode, 400);
  assert.equal(missingMethod.json().error.code, -32020);
  assert.match(missingMethod.json().error.message, /Mcp-Method/);

  const wrongMethod = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call"),
    payload: rpc("tools/list")
  });
  assert.equal(wrongMethod.statusCode, 400);
  assert.equal(wrongMethod.json().error.code, -32020);

  // Başlık gelmiş, gövdedeki sürüm alanı yok: başlık↔gövde uyuşmazlığı, `-32020`.
  const missingBodyVersion = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { [clientCapabilitiesMetaKey]: {} } }
    }
  });
  assert.equal(missingBodyVersion.statusCode, 400);
  assert.equal(missingBodyVersion.json().error.code, -32020);
  assert.match(missingBodyVersion.json().error.message, /MCP-Protocol-Version/);

  const nameMismatch = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call", "get_device"),
    payload: rpc("tools/call", { name: "list_devices", arguments: {} })
  });
  assert.equal(nameMismatch.statusCode, 400);
  assert.equal(nameMismatch.json().error.code, -32020);
  assert.match(nameMismatch.json().error.message, /Mcp-Name/);

  const missingName = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call"),
    payload: rpc("tools/call", { name: "list_devices", arguments: {} })
  });
  assert.equal(missingName.statusCode, 400);
  assert.equal(missingName.json().error.code, -32020);
});

test("gövdedeki zorunlu _meta alanı eksikse -32602 döner, -32020 değil", async (context) => {
  const harness = await setupApp(context);
  const withMeta = async (meta: Record<string, unknown>) => harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } }
  });

  const missing = await withMeta({ [protocolVersionMetaKey]: protocolVersion });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error.code, -32602);
  assert.match(missing.json().error.message, /clientCapabilities/);

  // `_meta` hiç yoksa önce başlıkta karşılığı olan sürüm alanı eksik sayılır: uyuşmazlık.
  const noMeta = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  });
  assert.equal(noMeta.json().error.code, -32020);

  const wrongType = await withMeta({
    [protocolVersionMetaKey]: protocolVersion,
    [clientCapabilitiesMetaKey]: []
  });
  assert.equal(wrongType.statusCode, 400);
  assert.equal(wrongType.json().error.code, -32602);
});

test("Mcp-Name sentinel biçimi çözülüp gövdeyle karşılaştırılır", async (context) => {
  const harness = await setupApp(context);
  const encoded = `=?base64?${Buffer.from("list_devices", "utf8").toString("base64")}?=`;
  const response = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call", encoded),
    payload: rpc("tools/call", { name: "list_devices", arguments: {} })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().result.isError, false);

  const rfc2047 = `=?utf-8?B?${Buffer.from("get_device", "utf8").toString("base64")}?=`;
  const mismatch = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call", rfc2047),
    payload: rpc("tools/call", { name: "list_devices", arguments: {} })
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.json().error.code, -32020);
});

test("desteklenmeyen protokol sürümü ve eski initialize desteklenen listeyi bildirir", async (context) => {
  const harness = await setupApp(context);
  const old = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { ...callHeaders(harness, "tools/list"), "mcp-protocol-version": "2025-06-18" },
    payload: {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/list",
      params: { _meta: { ...requiredMeta, [protocolVersionMetaKey]: "2025-06-18" } }
    }
  });
  assert.equal(old.statusCode, 400);
  assert.equal(old.json().error.code, -32022);
  assert.deepEqual(old.json().error.data.supported, [protocolVersion]);
  assert.equal(old.json().error.data.error, "UnsupportedProtocolVersionError");

  const initialize = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { authorization: `Bearer ${harness.token}` },
    payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }
  });
  assert.equal(initialize.statusCode, 400);
  assert.equal(initialize.json().error.code, -32022);
  assert.deepEqual(initialize.json().error.data.supported, [protocolVersion]);
});

test("Origin gönderen istemci izinli listede yoksa reddedilir", async (context) => {
  const harness = await setupApp(context, { allowedOrigins: ["https://home.example"] });
  const rejected = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { ...callHeaders(harness, "tools/list"), origin: "https://evil.example" },
    payload: rpc("tools/list")
  });
  assert.equal(rejected.statusCode, 403);
  assert.equal(rejected.json().error.code, 40300);

  const allowed = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { ...callHeaders(harness, "tools/list"), origin: "https://home.example" },
    payload: rpc("tools/list")
  });
  assert.equal(allowed.statusCode, 200);
});

test("bildirim gövdesi 202 ile gövdesiz yanıtlanır", async (context) => {
  const harness = await setupApp(context);
  const response = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "notifications/initialized"),
    // Bildirimde `id` üyesi hiç bulunmaz.
    payload: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: { _meta: requiredMeta }
    }
  });
  assert.equal(response.statusCode, 202);
  assert.equal(response.body, "");

  // Bildirim de olsa başlık doğrulaması işler.
  const mismatched = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: { _meta: requiredMeta }
    }
  });
  assert.equal(mismatched.statusCode, 400);
  assert.equal(mismatched.json().error.code, -32020);
});

test("tools/list belirlenimci sırada ve dolu şemalarla döner", async (context) => {
  const harness = await setupApp(context);
  const response = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: rpc("tools/list")
  });
  assert.equal(response.statusCode, 200);
  const result = response.json().result;
  assert.equal(result.resultType, "complete");
  assert.equal(Object.hasOwn(result, "nextCursor"), false);
  assert.deepEqual(result._meta[serverInfoMetaKey], {
    name: mcpServerInfo.name,
    version: mcpServerInfo.version
  });
  assert.deepEqual(result.tools.map((tool: { name: string }) => tool.name), [
    "list_devices",
    "get_device",
    "set_device",
    "list_automations",
    "get_automation",
    "write_automation",
    "control_automation"
  ]);
  assert.deepEqual(result.tools.map((tool: { name: string }) => tool.name), mcpTools.map((tool) => tool.name));
  for (const tool of result.tools as Array<Record<string, unknown>>) {
    assert.equal(typeof tool.title, "string");
    assert.ok(String(tool.description).length > 40);
    assert.equal((tool.inputSchema as { type: string }).type, "object");
    assert.equal((tool.outputSchema as { type: string }).type, "object");
  }
  // İkinci çağrı birebir aynı baytları vermeli (istemci ve model önbelleği).
  const again = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: rpc("tools/list")
  });
  assert.equal(again.body, response.body);
});

test("list_devices süzgeçleri çalışır ve satırlar ana kanalı özetler", async (context) => {
  const harness = await setupApp(context);
  const call = async (args: Record<string, unknown>) => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/mcp",
      headers: callHeaders(harness, "tools/call", "list_devices"),
      payload: rpc("tools/call", { name: "list_devices", arguments: args })
    });
    assert.equal(response.statusCode, 200);
    return response.json().result;
  };

  const all = await call({});
  assert.equal(all.isError, false);
  assert.equal(all.resultType, "complete");
  // Sunucu kimliği araç sonucunda da bulunur.
  assert.deepEqual(all._meta[serverInfoMetaKey], {
    name: mcpServerInfo.name,
    version: mcpServerInfo.version
  });
  assert.equal(all.structuredContent.count, 5);
  // Metin içerik yapısal sonucun aynı JSON'u.
  assert.deepEqual(JSON.parse(all.content[0].text), all.structuredContent);
  const [salon, perde, sensor] = all.structuredContent.devices;
  assert.equal(salon.room, "Salon");
  // Ana kanal: aç/kapa kanalı, `controls` dizisinde ikinci sırada olsa bile önceliklidir.
  assert.deepEqual(salon.primary, { id: "main", name: "Salon lambası", kind: "switch", value: true });
  assert.equal(perde.primary.kind, "cover");
  assert.equal(sensor.room, null);
  assert.equal(sensor.primary, null);
  // Ham `state` hiçbir satırda görünmez.
  assert.equal(Object.hasOwn(salon, "state"), false);
  assert.equal(all.content[0].text.includes("brightness"), false);

  assert.deepEqual(
    (await call({ room: "salon" })).structuredContent.devices.map((row: { id: string }) => row.id),
    ["0x0011111111111111"]
  );
  assert.deepEqual(
    (await call({ category: "cover" })).structuredContent.devices.map((row: { id: string }) => row.id),
    ["0x0022222222222222"]
  );
  assert.deepEqual(
    (await call({ onlineOnly: true })).structuredContent.devices.map((row: { id: string }) => row.id),
    ["0x0011111111111111", "0x0033333333333333", "0x0044444444444444", "0x0055555555555555"]
  );
  assert.deepEqual(
    (await call({ search: "mutfak" })).structuredContent.devices.map((row: { id: string }) => row.id),
    ["0x0022222222222222"]
  );

  const badCategory = await call({ category: "lamba" });
  assert.equal(badCategory.isError, true);
  assert.equal(Object.hasOwn(badCategory, "structuredContent"), false);
  assert.match(badCategory.content[0].text, /Unknown category/);
});

test("get_device ham state yerine kanalları döner, bilinmeyen cihaz isError olur", async (context) => {
  const harness = await setupApp(context);
  const call = async (args: Record<string, unknown>) => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/mcp",
      headers: callHeaders(harness, "tools/call", "get_device"),
      payload: rpc("tools/call", { name: "get_device", arguments: args })
    });
    assert.equal(response.statusCode, 200);
    return response.json().result;
  };

  const found = await call({ id: "0x0011111111111111" });
  assert.equal(found.isError, false);
  const structured = found.structuredContent;
  assert.equal(structured.name, "Salon lambası");
  assert.equal(structured.room, "Salon");
  assert.equal(structured.linkquality, 84);
  assert.equal(structured.powerSource, "Mains (single phase)");
  assert.equal(structured.lastSeen, "2026-08-06T09:00:00.000Z");
  assert.equal(Object.hasOwn(structured, "state"), false);
  assert.deepEqual(structured.controls.map((item: { id: string }) => item.id), [
    "brightness",
    "main",
    "power_on_behavior",
    "main:color"
  ]);
  assert.deepEqual(structured.controls[0], {
    id: "brightness",
    name: "Parlaklık",
    kind: "level",
    value: 120,
    min: 0,
    max: 254,
    unit: "%"
  });
  // Yönetici kanalı okumada görünür ve işaretlidir.
  assert.equal(structured.controls[2].adminOnly, true);

  const missing = await call({ id: "0x00ffffffffffffff" });
  assert.equal(missing.isError, true);
  assert.equal(Object.hasOwn(missing, "structuredContent"), false);
  assert.match(missing.content[0].text, /list_devices/);

  const noArgument = await call({});
  assert.equal(noArgument.isError, true);
  assert.match(noArgument.content[0].text, /`id` is required/);
});

/** `tools/call` kısayolu; araç adı başlıkta ve gövdede aynı olmak zorunda. */
const callTool = async (
  harness: Harness,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, never> & { isError: boolean; structuredContent: any; content: Array<{ text: string }> }> => {
  const response = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call", name),
    payload: rpc("tools/call", { name, arguments: args })
  });
  assert.equal(response.statusCode, 200);
  return response.json().result;
};

test("set_device paylaşılan normalizasyondan geçer: kırpar, yuvarlar, rengi xy'ye çevirir", async (context) => {
  const harness = await setupApp(context);

  const on = await callTool(harness, "set_device", {
    id: "0x0011111111111111",
    control: "main",
    value: true
  });
  assert.equal(on.isError, false);
  assert.equal(on.structuredContent.applied, "ON");
  assert.deepEqual(harness.writes[0], { deviceId: "0x0011111111111111", payload: { state: "ON" } });

  // Aralık dışı değer reddedilmez, `min`/`max`'a **kırpılır** — panelin davranışının aynısı.
  const clamped = await callTool(harness, "set_device", {
    id: "0x0011111111111111",
    control: "brightness",
    value: 900
  });
  assert.equal(clamped.isError, false);
  assert.equal(clamped.structuredContent.requested, 900);
  assert.equal(clamped.structuredContent.applied, 254);
  assert.deepEqual(harness.writes[1].payload, { brightness: 254 });

  // Renk hex olarak alınır, cihaza xy olarak iner: dönüşüm `normalizeControlValue` içindedir.
  const colour = await callTool(harness, "set_device", {
    id: "0x0011111111111111",
    control: "main:color",
    value: "#ff0000"
  });
  assert.equal(colour.isError, false);
  const applied = colour.structuredContent.applied as { x: number; y: number };
  assert.equal(typeof applied.x, "number");
  assert.equal(typeof applied.y, "number");
  assert.ok(applied.x > applied.y);
  assert.deepEqual(harness.writes[2].payload, { color: applied });

  // Biçimsiz renk: düzeltilebilir hata, hangi biçimin beklendiğini söyler.
  const badColour = await callTool(harness, "set_device", {
    id: "0x0011111111111111",
    control: "main:color",
    value: "kırmızı"
  });
  assert.equal(badColour.isError, true);
  assert.match(badColour.content[0].text, /hex colour/);
  assert.equal(harness.writes.length, 3);

  // Yönetici işareti taşıyan kanal yazılabilir: token'ı zaten yönetici üretti.
  const adminOnly = await callTool(harness, "set_device", {
    id: "0x0011111111111111",
    control: "power_on_behavior",
    value: "off"
  });
  assert.equal(adminOnly.isError, false);
});

test("set_device bilinmeyen cihaz ve kanalda düzeltilebilir hata verir", async (context) => {
  const harness = await setupApp(context);

  const noDevice = await callTool(harness, "set_device", {
    id: "0x00ffffffffffffff",
    control: "main",
    value: true
  });
  assert.equal(noDevice.isError, true);
  assert.match(noDevice.content[0].text, /list_devices/);

  const noControl = await callTool(harness, "set_device", {
    id: "0x0011111111111111",
    control: "volume",
    value: 3
  });
  assert.equal(noControl.isError, true);
  // Hangi kanalların olduğu mesajın içinde: model kendi kendini düzeltebilsin.
  assert.match(noControl.content[0].text, /`brightness` \(level\)/);
  assert.match(noControl.content[0].text, /`main` \(switch\)/);
  assert.equal(harness.writes.length, 0);
});

test("kilit ve siren ajan yolundan yazılamaz, panel rotası bundan etkilenmez", async (context) => {
  const harness = await setupApp(context);

  for (const [id, control] of [
    ["0x0044444444444444", "lock:state"],
    ["0x0055555555555555", "siren:alarm"]
  ]) {
    const denied = await callTool(harness, "set_device", { id, control, value: "UNLOCK" });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /cannot be written through the agent endpoint/);
    assert.match(denied.content[0].text, /panel/);
  }
  // Hiçbiri cihaza inmedi.
  assert.equal(harness.writes.length, 0);

  // Aynı kanallar okumada görünmeye devam eder: yasak yazmadadır, gizleme değildir.
  const lock = await callTool(harness, "get_device", { id: "0x0044444444444444" });
  assert.equal(lock.isError, false);
  assert.equal(lock.structuredContent.controls[0].kind, "lock");

  // Yapılandırma açıkça izin verirse aynı çağrı geçer; varsayılan bu değildir.
  const permissive = await setupApp(context, { allowDangerousControls: true });
  const allowed = await callTool(permissive, "set_device", {
    id: "0x0044444444444444",
    control: "lock:state",
    value: "UNLOCK"
  });
  assert.equal(allowed.isError, false);
  assert.deepEqual(permissive.writes[0].payload, { state: "UNLOCK" });
});

test("panelin komut rotası kilit ve sireni kumanda etmeye devam eder", async () => {
  // Yasak yalnız ajan yolundadır: HTTP rotasında düğmeye basan insanın kendisidir. Rota kanal
  // türüne göre ayrım yapmaz; tek kapısı `adminOnly` ve ortak normalizasyondur.
  const server = await readFile(new URL("./index.js", import.meta.url), "utf8");
  const start = server.indexOf('"/api/devices/:id/command"');
  assert.ok(start > 0);
  const route = server.slice(start, server.indexOf("app.put", start));
  assert.doesNotMatch(route, /forbiddenAutomationControlKinds|allowDangerousControls|isAgentForbidden/);
  assert.match(route, /normalizeControlValue\(control, request\.body\?\.value, \{ booleanSwitch: true \}\)/);
  // Ajan yolu ise yasağı taşıyor ve yalnız yapılandırma bayrağıyla açılıyor.
  assert.match(server, /allowDangerousControls: \(\) => config\.mcp\.allowDangerousControls/);
});

test("list_automations okunur özet verir, get_automation ham şekli döner", async (context) => {
  const harness = await setupApp(context);

  const list = await callTool(harness, "list_automations", {});
  assert.equal(list.isError, false);
  assert.equal(list.structuredContent.count, 2);
  const [evening, morning] = list.structuredContent.automations;
  assert.equal(evening.id, "aaaabbbbcccc");
  assert.deepEqual(evening.triggers, ["at 19:30 every day"]);
  assert.deepEqual(evening.actions, ["set `state` on `0x0011111111111111` (Salon lambası) to \"ON\""]);
  assert.deepEqual(evening.lastRun, { at: "2026-08-05T16:30:00.000Z", ok: true });
  // Damgasız kural `agent: null` der; alan hiç kaybolmaz ki model ayrımı görebilsin.
  assert.equal(evening.agent, null);
  assert.deepEqual(morning.triggers, ["at sunrise-15m on Mon, Tue, Wed, Thu, Fri"]);
  assert.equal(morning.lastRun, null);
  // Ham iç yapı özet listesine dökülmez.
  assert.equal(list.content[0].text.includes("\"deviceId\""), false);

  assert.deepEqual(
    (await callTool(harness, "list_automations", { enabledOnly: true }))
      .structuredContent.automations.map((row: { id: string }) => row.id),
    ["aaaabbbbcccc"]
  );
  assert.deepEqual(
    (await callTool(harness, "list_automations", { search: "perde" }))
      .structuredContent.automations.map((row: { id: string }) => row.id),
    ["ddddeeeeffff"]
  );

  const full = await callTool(harness, "get_automation", { id: "aaaabbbbcccc" });
  assert.equal(full.isError, false);
  assert.deepEqual(full.structuredContent.triggers, [
    { type: "time", at: "19:30", days: [1, 2, 3, 4, 5, 6, 7] }
  ]);
  assert.deepEqual(full.structuredContent.actions, [
    { type: "device", deviceId: "0x0011111111111111", property: "state", value: "ON" }
  ]);

  const missing = await callTool(harness, "get_automation", { id: "yokboyle1234" });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /list_automations/);
});

test("write_automation oluşturur, günceller, siler; her yazmadan önce yedek alınır", async (context) => {
  const harness = await setupApp(context);

  const created = await callTool(harness, "write_automation", {
    action: "create",
    automation: {
      name: "Gece koridoru",
      triggers: [{ type: "deviceState", deviceId: "0x0033333333333333", property: "occupancy", equals: true }],
      actions: [{ type: "device", deviceId: "0x0011111111111111", property: "state", value: "ON" }]
    }
  });
  assert.equal(created.isError, false);
  assert.equal(created.structuredContent.action, "create");
  const id = created.structuredContent.id as string;
  assert.match(id, /^[a-z0-9-]{8,32}$/);
  assert.equal(harness.automations.length, 3);
  // Yedek yazmadan **önce** alındı: iki kurallı hâli taşıyor.
  assert.equal(harness.backups.length, 1);
  assert.equal(harness.backups[0].length, 2);

  // Damga: kim yazdı, ne zaman. Ham token hiçbir alanda yok.
  const stamp = created.structuredContent.automation.agent;
  assert.equal(stamp.tokenId, harness.tokenRecord.id);
  assert.equal(stamp.tokenName, "Asistan");
  assert.ok(!Number.isNaN(Date.parse(stamp.at)));
  assert.equal(JSON.stringify(harness.automations).includes(harness.token), false);
  assert.equal(created.content[0].text.includes(harness.token), false);

  const updated = await callTool(harness, "write_automation", {
    action: "update",
    id,
    automation: {
      name: "Gece koridoru (kısık)",
      triggers: [{ type: "deviceState", deviceId: "0x0033333333333333", property: "occupancy", equals: true }],
      actions: [{ type: "device", deviceId: "0x0011111111111111", property: "brightness", value: 40 }]
    }
  });
  assert.equal(updated.isError, false);
  assert.equal(updated.structuredContent.automation.name, "Gece koridoru (kısık)");
  assert.equal(harness.automations.length, 3);
  assert.equal(harness.backups.length, 2);

  const removed = await callTool(harness, "write_automation", { action: "delete", id });
  assert.equal(removed.isError, false);
  assert.equal(removed.structuredContent.automation, null);
  assert.equal(harness.automations.length, 2);

  // Var olmayan kimlik sessizce başarılı sayılmaz.
  const ghost = await callTool(harness, "write_automation", { action: "delete", id: "yokboyle1234" });
  assert.equal(ghost.isError, true);
  assert.equal(harness.backups.length, 3);
});

test("write_automation §8.1 ve §8.2'yi mevcut doğrulamadan geçirir", async (context) => {
  const harness = await setupApp(context);

  // §8.1 — kilit bir otomasyon eylemi olamaz.
  const lock = await callTool(harness, "write_automation", {
    action: "create",
    automation: {
      name: "Gece kilidi",
      triggers: [{ type: "time", at: "23:00", days: [1] }],
      actions: [{ type: "device", deviceId: "0x0044444444444444", property: "state", value: "UNLOCK" }]
    }
  });
  assert.equal(lock.isError, true);
  assert.match(lock.content[0].text, /rejected when saving/);
  assert.match(lock.content[0].text, /Kilit ve siren/);

  const siren = await callTool(harness, "write_automation", {
    action: "create",
    automation: {
      name: "Siren",
      triggers: [{ type: "time", at: "23:00", days: [1] }],
      actions: [{ type: "device", deviceId: "0x0055555555555555", property: "alarm", value: "ON" }]
    }
  });
  assert.equal(siren.isError, true);

  // §8.2 — kural kendi yazdığı kanaldan tetiklenemez.
  const loop = await callTool(harness, "write_automation", {
    action: "create",
    automation: {
      name: "Döngü",
      triggers: [{ type: "deviceState", deviceId: "0x0011111111111111", property: "state", equals: "ON" }],
      actions: [{ type: "device", deviceId: "0x0011111111111111", property: "state", value: "OFF" }]
    }
  });
  assert.equal(loop.isError, true);
  assert.match(loop.content[0].text, /döngü/);

  // Hiçbiri kaydedilmedi.
  assert.equal(harness.automations.length, 2);
});

test("damgasız eski kural okunur, güncellenince damgalanır, ham hâli bozulmaz", async (context) => {
  const harness = await setupApp(context);
  const before = await callTool(harness, "get_automation", { id: "ddddeeeeffff" });
  assert.equal(before.structuredContent.agent, null);
  assert.equal(before.structuredContent.enabled, false);

  const enabled = await callTool(harness, "control_automation", { id: "ddddeeeeffff", action: "enable" });
  assert.equal(enabled.isError, false);
  assert.equal(enabled.structuredContent.changed, true);
  assert.equal(enabled.structuredContent.enabled, true);
  const after = await callTool(harness, "get_automation", { id: "ddddeeeeffff" });
  assert.equal(after.structuredContent.agent.tokenId, harness.tokenRecord.id);
  // Kuralın kendisi değişmedi; yalnız anahtarı ve damgası.
  assert.deepEqual(after.structuredContent.triggers, before.structuredContent.triggers);
  assert.deepEqual(after.structuredContent.actions, before.structuredContent.actions);
  // Damgasız kuralın komşusu damgasız kaldı.
  assert.equal(harness.automations[0].agent, undefined);
});

test("control_automation açar, kapatır ve çalıştırır", async (context) => {
  const harness = await setupApp(context);

  const off = await callTool(harness, "control_automation", { id: "aaaabbbbcccc", action: "disable" });
  assert.equal(off.structuredContent.enabled, false);
  assert.equal(off.structuredContent.changed, true);

  // Zaten kapalıysa yeniden yazılmaz; yedek de büyümez.
  const backups = harness.backups.length;
  const again = await callTool(harness, "control_automation", { id: "aaaabbbbcccc", action: "disable" });
  assert.equal(again.structuredContent.changed, false);
  assert.equal(harness.backups.length, backups);

  const ran = await callTool(harness, "control_automation", { id: "aaaabbbbcccc", action: "run" });
  assert.equal(ran.isError, false);
  assert.equal(ran.structuredContent.outcome, "ok");
  assert.deepEqual(harness.runs, ["aaaabbbbcccc"]);

  // Koşulları tutmayan kural hata değildir: model sebebi okur.
  harness.runResult = "blocked";
  const blocked = await callTool(harness, "control_automation", { id: "aaaabbbbcccc", action: "run" });
  assert.equal(blocked.isError, false);
  assert.equal(blocked.structuredContent.outcome, "blocked");
  assert.equal(blocked.structuredContent.changed, false);

  // Meşgul ve başarısız düzeltilebilir hatadır.
  harness.runResult = "busy";
  const busy = await callTool(harness, "control_automation", { id: "aaaabbbbcccc", action: "run" });
  assert.equal(busy.isError, true);
  assert.match(busy.content[0].text, /already running/);

  const unknown = await callTool(harness, "control_automation", { id: "aaaabbbbcccc", action: "toggle" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /`enable`, `disable` or `run`/);
});

test("bilinmeyen araç JSON-RPC hatasıdır, isError sonucu değil", async (context) => {
  const harness = await setupApp(context);
  const response = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/call", "open_the_gate"),
    payload: rpc("tools/call", { name: "open_the_gate", arguments: {} })
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, -32602);
  assert.equal(Object.hasOwn(response.json(), "result"), false);
});

test("serverInfo sürümü package.json ile aynıdır", async () => {
  // Sürüm `mcp.ts` içinde sabit; sürüklenmeyi burada yakalarız. Test `dist/` içinden koşar.
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(mcpServerInfo.name, manifest.name);
  assert.equal(mcpServerInfo.version, manifest.version);
});

test("bozuk JSON-RPC gövdesi -32600 ile reddedilir", async (context) => {
  const harness = await setupApp(context);
  const response = await harness.app.inject({
    method: "POST",
    url: "/mcp",
    headers: callHeaders(harness, "tools/list"),
    payload: [rpc("tools/list")]
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, -32600);
});
