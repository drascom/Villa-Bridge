import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isHomeFavoriteControlKind } from "./home-favorites.js";
import type { HomeGroup } from "./home-groups.js";
import type { DeviceControlView, DeviceView, JsonObject } from "./types.js";

/**
 * Model Context Protocol ucu — sürüm **2026-07-28**, durumsuz.
 *
 * Bu sürümde oturum yoktur: `Mcp-Session-Id`, GET akışı, `initialize` el sıkışması ve
 * `Last-Event-ID` **kullanılmaz**. Tek yol `POST /mcp`; her istek kendi başına doğrulanır ve
 * yanıtı tek bir JSON nesnesidir. Resmî SDK bilerek kullanılmaz: `apps/runtime` kendi kilitli ve
 * daha eski bağımlılık setiyle çalışıyor, Android paketlemesi ondan besleniyor — yeni npm
 * bağımlılığı iki tarafta da yeniden paketleme demek. JSON-RPC elle yazılır, ayrı süreç yoktur.
 */

/** Uç adresi tek yerde: yetki kapısı (`access-control.ts`) da buradan okur. */
export const mcpRoutePath = "/mcp";

/** Desteklenen protokol sürümleri; yükseltme yalnız bu listeye dokunur. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2026-07-28"] as const;

/** `params._meta` içinde protokol sürümünün taşındığı anahtar. */
export const protocolVersionMetaKey = "io.modelcontextprotocol/protocolVersion";

/** `params._meta` içinde istemci yeteneklerinin taşındığı anahtar; sürümle birlikte zorunludur. */
export const clientCapabilitiesMetaKey = "io.modelcontextprotocol/clientCapabilities";

/** Sonucun `_meta` alanında sunucu kimliğinin döndüğü anahtar (spesifikasyon: SHOULD). */
export const serverInfoMetaKey = "io.modelcontextprotocol/serverInfo";

/**
 * Sunucu kimliği. Sürüm bilerek **sabit**: `package.json` çalışma anında okunsaydı yol çözümü
 * dist/ , tsx ve Android paketlemesi için üç ayrı davranış demek olurdu. Sürüm sürüklenmesini
 * `mcp.test.ts` içindeki `package.json` karşılaştırması yakalar.
 */
export const mcpServerInfo = { name: "villa-bridge", version: "0.1.0" } as const;

export const mcpErrorCodes = {
  /** Zorunlu başlık eksik ya da gövdeyle uyuşmuyor (HeaderMismatch). */
  headerMismatch: -32020,
  /** İstemcinin istediği protokol sürümü desteklenmiyor (UnsupportedProtocolVersion). */
  unsupportedProtocolVersion: -32022,
  /*
   * Aşağıdaki üçü spesifikasyonun tanımladığı bir durum değil, bu sunucunun taşıma katmanı
   * hataları. Spesifikasyon `-32000`..`-32019` aralığını "legacy" ilan etti ve yeni kodların
   * JSON-RPC'nin ayrılmış aralığı olan `-32768`..`-32000` **dışında** tahsis edilmesini istiyor.
   * Şema: kod = HTTP durum kodu × 100. Böylece kod okunur kalıyor (40100 → 401), ayrılmış
   * aralığın çok dışında ve ileride aynı HTTP durumunun alt sebeplerine yer bırakıyor.
   */
  /** Taşıma katmanı: token yok/geçersiz (HTTP 401). */
  unauthorized: 40100,
  /** Taşıma katmanı: `Origin` reddedildi (HTTP 403). */
  forbiddenOrigin: 40300,
  /** Taşıma katmanı: `POST` dışında bir yöntem (HTTP 405). */
  methodNotAllowed: 40500,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602
} as const;

export interface McpErrorBody extends JsonObject {
  jsonrpc: "2.0";
  id: null;
  error: { code: number; message: string; data?: JsonObject };
}

/** Taşıma katmanı hataları da JSON-RPC hata nesnesiyle döner; `id` bilinmediği için `null`. */
export const mcpErrorBody = (code: number, message: string, data?: JsonObject): McpErrorBody => ({
  jsonrpc: "2.0",
  id: null,
  error: data === undefined ? { code, message } : { code, message, data }
});

/**
 * `Origin` doğrulaması (DNS rebinding). İzinli köken listesi yapılandırmadan gelir; boşsa
 * tarayıcı dışından gelen istemci (Origin göndermeyen) çalışır, Origin gönderen reddedilir.
 */
export const isAllowedMcpOrigin = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean => (origin === undefined ? true : allowedOrigins.includes(origin));

/**
 * Başlık değeri `=?base64?...?=` (ya da RFC 2047 `=?utf-8?B?...?=`) sentinel biçimindeyse çözer.
 * ASCII dışı cihaz adları başlıkta bu şekilde taşınır; gövdeyle karşılaştırma çözülmüş değer
 * üzerinden yapılır.
 */
export const decodeHeaderSentinel = (value: string): string => {
  const match = /^=\?([^?]+)\?(?:([Bb])\?)?([A-Za-z0-9+/=_-]*)\?=$/.exec(value);
  if (!match) return value;
  const [, charset, encoding, data] = match;
  if (charset.toLowerCase() !== "base64" && encoding === undefined) return value;
  return Buffer.from(data, "base64").toString("utf8");
};

const headerValue = (
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined => {
  // Fastify başlık adlarını küçük harfe indirir; değerler duyarlı kalır.
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

export interface McpEndpointDependencies {
  devices: () => DeviceView[];
  homeGroups: () => Promise<HomeGroup[]>;
}

export interface McpHttpResponse {
  status: number;
  body: JsonObject | null;
}

interface ToolResult {
  structuredContent?: JsonObject;
  isError: boolean;
  text: string;
}

/** Modelin düzeltebileceği hata: JSON-RPC hatası değil, `isError: true` olan başarılı sonuç. */
class ToolInputError extends Error {}

const deviceCategories = ["light", "switch", "cover", "lock", "climate", "fan", "unknown"];
const availabilityValues = ["online", "offline", "unknown"];

const controlValueSchema = {
  type: ["boolean", "number", "string", "null"]
};

const primaryChannelSchema = {
  type: ["object", "null"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: { type: "string" },
    value: controlValueSchema,
    unit: { type: "string" }
  },
  required: ["id", "name", "kind", "value"],
  additionalProperties: false
};

const controlSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: { type: "string" },
    value: controlValueSchema,
    min: { type: "number" },
    max: { type: "number" },
    step: { type: "number" },
    unit: { type: "string" },
    values: { type: "array", items: { type: ["string", "number", "boolean"] } },
    adminOnly: { type: "boolean" }
  },
  required: ["id", "name", "kind", "value"],
  additionalProperties: false
};

const listDevicesInputSchema = {
  type: "object",
  properties: {
    room: { type: "string", description: "Only devices whose room name contains this text (case-insensitive)." },
    category: { type: "string", enum: deviceCategories, description: "Only devices of this category." },
    onlineOnly: { type: "boolean", description: "Only devices that are currently reachable." },
    search: { type: "string", description: "Free text matched against the device name and address." }
  },
  additionalProperties: false
};

const listDevicesOutputSchema = {
  type: "object",
  properties: {
    count: { type: "integer" },
    devices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Immutable IEEE address; the only identity accepted by other tools." },
          name: { type: "string" },
          room: { type: ["string", "null"] },
          category: { type: "string", enum: deviceCategories },
          availability: { type: "string", enum: availabilityValues },
          primary: primaryChannelSchema
        },
        required: ["id", "name", "room", "category", "availability", "primary"],
        additionalProperties: false
      }
    }
  },
  required: ["count", "devices"],
  additionalProperties: false
};

const getDeviceInputSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: "IEEE address of the device, for example 0x00158d0007a1b2c3."
    }
  },
  required: ["id"],
  additionalProperties: false
};

const getDeviceOutputSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    room: { type: ["string", "null"] },
    category: { type: "string", enum: deviceCategories },
    availability: { type: "string", enum: availabilityValues },
    lastSeen: { type: ["string", "null"] },
    linkquality: { type: "number" },
    powerSource: { type: "string" },
    controls: { type: "array", items: controlSchema }
  },
  required: ["id", "name", "room", "category", "availability", "lastSeen", "controls"],
  additionalProperties: false
};

/**
 * Araç kataloğu. Sıra **belirlenimcidir**: istemci önbelleği ve modelin prompt önbelleği aynı
 * baytları görsün diye liste sabit tutulur. Açıklamalar modelin okuyacağı metindir, İngilizce
 * yazılır; sunucunun günlük/hata metinleri projenin kuralı gereği Türkçe kalır.
 */
export const mcpTools = [
  {
    name: "list_devices",
    title: "List home devices",
    description:
      "List the devices of the home with their room, category, reachability and the value of "
      + "their main channel. Use this first when the user names a device in words: the returned "
      + "`id` (IEEE address) is the only identity the other tools accept. Raw device state is "
      + "deliberately not exposed; ask for a single device when you need every channel.",
    inputSchema: listDevicesInputSchema,
    outputSchema: listDevicesOutputSchema
  },
  {
    name: "get_device",
    title: "Get one device",
    description:
      "Return one device with all of its controllable channels (name, kind, current value, "
      + "range and unit). The `id` argument must be the IEEE address, never a friendly name: if "
      + "the user gave a name, call `list_devices` first and map it to an address.",
    inputSchema: getDeviceInputSchema,
    outputSchema: getDeviceOutputSchema
  }
] as const;

/**
 * Ana kanal seçimi. Panelin kart mantığıyla aynı önceliği izler: ev ekranı döşemesi cihazın
 * aç/kapa kanalını çizer (kullanıcının cihaza dair ilk sorusu "açık mı" olduğu için), o yoksa
 * pano kanalı sayılan diğer kumandalara düşer, o da yoksa cihazın ilk kumandasına. Hiç kumanda
 * olmayan (salt sensör) cihazda `null` döner — uydurulmuş bir özet yerine "özeti yok" demek daha
 * dürüst, ayrıntıyı `get_device` verir.
 */
export const primaryControl = (controls: DeviceControlView[]): DeviceControlView | null =>
  controls.find((control) => control.kind === "switch")
  ?? controls.find((control) => isHomeFavoriteControlKind(control.kind))
  ?? controls[0]
  ?? null;

const primaryChannelView = (control: DeviceControlView | null): JsonObject | null =>
  control === null
    ? null
    : {
      id: control.id,
      name: control.name,
      kind: control.kind,
      value: control.value,
      ...(control.unit === undefined ? {} : { unit: control.unit })
    };

const controlDetailView = (control: DeviceControlView): JsonObject => ({
  id: control.id,
  name: control.name,
  kind: control.kind,
  value: control.value,
  ...(control.min === undefined ? {} : { min: control.min }),
  ...(control.max === undefined ? {} : { max: control.max }),
  ...(control.step === undefined ? {} : { step: control.step }),
  ...(control.unit === undefined ? {} : { unit: control.unit }),
  ...(control.values === undefined ? {} : { values: control.values }),
  ...(control.adminOnly === true ? { adminOnly: true } : {})
});

/**
 * Cihaz → oda adı. Oda kavramının kodda karşılığı ana ekran grubudur (`home-groups.json`).
 * Bir cihaz birden çok kartta görünebilir; ilk kart kazanır, çünkü panelde de kartlar yukarıdan
 * aşağı çizilir ve kullanıcının gördüğü ilk oda odur.
 */
const roomLookup = (groups: HomeGroup[]): Map<string, string> => {
  const rooms = new Map<string, string>();
  for (const group of groups) {
    for (const item of group.items) {
      if (!rooms.has(item.deviceId)) rooms.set(item.deviceId, group.name);
    }
  }
  return rooms;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ToolInputError(`\`${field}\` must be a string.`);
  return value;
};

const toolArguments = (value: unknown): JsonObject => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError("`arguments` must be an object.");
  }
  return value as JsonObject;
};

const listDevices = (
  argumentsValue: unknown,
  devices: DeviceView[],
  rooms: Map<string, string>
): JsonObject => {
  const input = toolArguments(argumentsValue);
  const room = optionalString(input.room, "room")?.trim().toLowerCase();
  const category = optionalString(input.category, "category")?.trim().toLowerCase();
  const search = optionalString(input.search, "search")?.trim().toLowerCase();
  if (input.onlineOnly !== undefined && typeof input.onlineOnly !== "boolean") {
    throw new ToolInputError("`onlineOnly` must be a boolean.");
  }
  if (category !== undefined && !deviceCategories.includes(category)) {
    throw new ToolInputError(
      `Unknown category \`${category}\`. Known categories: ${deviceCategories.join(", ")}.`
    );
  }
  const rows = devices
    .filter((device) => {
      const deviceRoom = rooms.get(device.id) ?? null;
      if (room !== undefined && !(deviceRoom ?? "").toLowerCase().includes(room)) return false;
      if (category !== undefined && device.category !== category) return false;
      if (input.onlineOnly === true && device.availability !== "online") return false;
      if (
        search !== undefined
        && !device.name.toLowerCase().includes(search)
        && !device.id.toLowerCase().includes(search)
      ) return false;
      return true;
    })
    .map((device) => ({
      id: device.id,
      name: device.name,
      room: rooms.get(device.id) ?? null,
      category: device.category,
      availability: device.availability,
      primary: primaryChannelView(primaryControl(device.controls))
    }));
  return { count: rows.length, devices: rows };
};

const getDevice = (
  argumentsValue: unknown,
  devices: DeviceView[],
  rooms: Map<string, string>
): JsonObject => {
  const input = toolArguments(argumentsValue);
  const id = optionalString(input.id, "id")?.trim().toLowerCase();
  if (!id) throw new ToolInputError("`id` is required and must be the IEEE address of a device.");
  const device = devices.find((candidate) => candidate.id === id);
  if (!device) {
    throw new ToolInputError(
      `No device with address \`${id}\`. Call \`list_devices\` and use the \`id\` field from `
      + "there; friendly names are not accepted."
    );
  }
  return {
    id: device.id,
    name: device.name,
    room: rooms.get(device.id) ?? null,
    category: device.category,
    availability: device.availability,
    lastSeen: device.lastSeen,
    ...(device.linkquality === undefined ? {} : { linkquality: device.linkquality }),
    ...(device.powerSource === undefined ? {} : { powerSource: device.powerSource }),
    controls: device.controls.map(controlDetailView)
  };
};

const callTool = async (
  name: string,
  argumentsValue: unknown,
  dependencies: McpEndpointDependencies
): Promise<ToolResult> => {
  const rooms = roomLookup(await dependencies.homeGroups());
  const devices = dependencies.devices();
  try {
    const structuredContent = name === "list_devices"
      ? listDevices(argumentsValue, devices, rooms)
      : getDevice(argumentsValue, devices, rooms);
    // Geriye uyum deseni: yapısal sonucun aynı JSON'u metin olarak da taşınır.
    return { structuredContent, isError: false, text: JSON.stringify(structuredContent) };
  } catch (error) {
    if (error instanceof ToolInputError) return { isError: true, text: error.message };
    throw error;
  }
};

export interface McpRequestInput {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

const jsonRpcError = (
  id: unknown,
  code: number,
  message: string,
  data?: JsonObject
): JsonObject => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: data === undefined ? { code, message } : { code, message, data }
});

const unsupportedProtocolVersion = (id: unknown, requested: string | undefined): McpHttpResponse => ({
  status: 400,
  body: jsonRpcError(
    id,
    mcpErrorCodes.unsupportedProtocolVersion,
    "UnsupportedProtocolVersionError",
    {
      error: "UnsupportedProtocolVersionError",
      supported: [...SUPPORTED_PROTOCOL_VERSIONS],
      ...(requested === undefined ? {} : { requested })
    }
  )
});

const headerMismatch = (id: unknown, message: string): McpHttpResponse => ({
  status: 400,
  body: jsonRpcError(id, mcpErrorCodes.headerMismatch, message)
});

/**
 * Gövdedeki zorunlu alan eksik. `-32020` değil `-32602`: `HeaderMismatch` adı üstünde başlık
 * hatasıdır; başlıkta karşılığı olmayan bir `_meta` alanının eksikliği düpedüz geçersiz parametre.
 */
const invalidParams = (id: unknown, message: string): McpHttpResponse => ({
  status: 400,
  body: jsonRpcError(id, mcpErrorCodes.invalidParams, message)
});

/** Her sonuç sunucu kimliğini taşır (spesifikasyon: SHOULD). */
const resultMeta = (): JsonObject => ({
  [serverInfoMetaKey]: { name: mcpServerInfo.name, version: mcpServerInfo.version }
});

/**
 * Tek bir JSON-RPC isteğini (ya da bildirimini) işler. Fastify'dan bağımsız tutulur ki
 * doğrulama testleri HTTP sunucusu ayağa kaldırmadan da aynı yolu yürüsün.
 */
export const handleMcpRequest = async (
  request: McpRequestInput,
  dependencies: McpEndpointDependencies
): Promise<McpHttpResponse> => {
  if (request.method !== "POST") {
    return {
      status: 405,
      body: mcpErrorBody(
        mcpErrorCodes.methodNotAllowed,
        "MCP ucu yalnız POST kabul eder; bu sürümde GET akışı yoktur."
      )
    };
  }
  const body = request.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      status: 400,
      body: jsonRpcError(null, mcpErrorCodes.invalidRequest, "Request body must be a single JSON-RPC object.")
    };
  }
  const message = body as JsonObject;
  const id = message.id;
  const isNotification = id === undefined || id === null;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return {
      status: 400,
      body: jsonRpcError(id, mcpErrorCodes.invalidRequest, "`jsonrpc` must be \"2.0\" and `method` a string.")
    };
  }
  const method = message.method;
  const parameters = typeof message.params === "object" && message.params !== null && !Array.isArray(message.params)
    ? message.params as JsonObject
    : {};
  const meta = typeof parameters._meta === "object" && parameters._meta !== null && !Array.isArray(parameters._meta)
    ? parameters._meta as JsonObject
    : {};
  const bodyVersion = typeof meta[protocolVersionMetaKey] === "string"
    ? meta[protocolVersionMetaKey] as string
    : undefined;
  const capabilities = meta[clientCapabilitiesMetaKey];
  const headerVersion = headerValue(request.headers, "mcp-protocol-version");

  // Eski çağın el sıkışması bu sürümde yoktur; istemciye desteklenen sürüm bildirilir.
  if (method === "initialize") return unsupportedProtocolVersion(id, headerVersion ?? bodyVersion);

  const headerMethod = headerValue(request.headers, "mcp-method");
  if (headerMethod === undefined) {
    return headerMismatch(id, "`Mcp-Method` header is required on every request.");
  }
  if (headerMethod !== method) {
    return headerMismatch(id, `\`Mcp-Method\` header (${headerMethod}) does not match the body method (${method}).`);
  }
  if (headerVersion === undefined) {
    return headerMismatch(id, "`MCP-Protocol-Version` header is required on every request.");
  }
  // Sürümün başlıkta bir karşılığı var: başlık gelmiş ama gövde alanı yoksa bu bir
  // başlık↔gövde uyuşmazlığıdır, `-32020`. Karşılığı olmayan `_meta` alanları aşağıda `-32602`.
  if (bodyVersion === undefined) {
    return headerMismatch(
      id,
      `\`MCP-Protocol-Version\` header is present but \`params._meta["${protocolVersionMetaKey}"]\` is missing.`
    );
  }
  if (headerVersion !== bodyVersion) {
    return headerMismatch(
      id,
      `\`MCP-Protocol-Version\` header (${headerVersion}) does not match \`params._meta["${protocolVersionMetaKey}"]\` (${bodyVersion}).`
    );
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(headerVersion as typeof SUPPORTED_PROTOCOL_VERSIONS[number])) {
    return unsupportedProtocolVersion(id, headerVersion);
  }
  // Zorunlu ama başlıkta karşılığı olmayan alan: eksikse geçersiz parametre.
  if (capabilities === undefined) {
    return invalidParams(
      id,
      `\`params._meta["${clientCapabilitiesMetaKey}"]\` is required on every request.`
    );
  }
  if (typeof capabilities !== "object" || capabilities === null || Array.isArray(capabilities)) {
    return invalidParams(id, `\`params._meta["${clientCapabilitiesMetaKey}"]\` must be an object.`);
  }
  if (method === "tools/call") {
    const headerName = headerValue(request.headers, "mcp-name");
    if (headerName === undefined) {
      return headerMismatch(id, "`Mcp-Name` header is required for `tools/call`.");
    }
    const decoded = decodeHeaderSentinel(headerName);
    if (decoded !== parameters.name) {
      return headerMismatch(
        id,
        `\`Mcp-Name\` header (${decoded}) does not match \`params.name\` (${String(parameters.name)}).`
      );
    }
  }
  // Bildirime yanıt gövdesi yazılmaz; doğrulamayı geçmesi yeter.
  if (isNotification) return { status: 202, body: null };

  if (method === "tools/list") {
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: { resultType: "complete", tools: mcpTools, _meta: resultMeta() }
      }
    };
  }
  if (method === "tools/call") {
    const name = parameters.name;
    if (typeof name !== "string" || !mcpTools.some((tool) => tool.name === name)) {
      return {
        status: 400,
        body: jsonRpcError(
          id,
          mcpErrorCodes.invalidParams,
          `Unknown tool \`${String(name)}\`. Call \`tools/list\` for the available tools.`
        )
      };
    }
    const result = await callTool(name, parameters.arguments, dependencies);
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          resultType: "complete",
          content: [{ type: "text", text: result.text }],
          ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent }),
          isError: result.isError,
          _meta: resultMeta()
        }
      }
    };
  }
  return {
    status: 404,
    body: jsonRpcError(id, mcpErrorCodes.methodNotFound, `Unknown method \`${method}\`.`)
  };
};

/**
 * Ucu Fastify'a bağlar. Kimlik ve `Origin` denetimi `access-control.ts` içindeki tek yetki
 * kapısında yapılır — `/mcp` oraya açıkça yazılıdır, `/api/` muafiyetine düşmez.
 */
export const registerMcpEndpoint = (
  app: FastifyInstance,
  dependencies: McpEndpointDependencies
): void => {
  const notAllowed = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => reply
    .code(405)
    .header("Allow", "POST")
    .send(mcpErrorBody(
      mcpErrorCodes.methodNotAllowed,
      "MCP ucu yalnız POST kabul eder; bu sürümde GET akışı yoktur."
    ));
  app.route({
    method: ["GET", "DELETE", "PUT", "PATCH", "OPTIONS"],
    url: mcpRoutePath,
    handler: notAllowed
  });
  app.post(mcpRoutePath, async (request, reply) => {
    const response = await handleMcpRequest({
      method: request.method,
      headers: request.headers,
      body: request.body
    }, dependencies);
    if (response.body === null) return reply.code(response.status).send();
    return reply.code(response.status).send(response.body);
  });
};
