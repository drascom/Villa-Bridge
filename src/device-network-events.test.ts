import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DeviceNetworkEventLog, type DeviceNetworkEvent } from "./device-network-events.js";
import { DeviceStore } from "./device-store.js";
import { DirectZigbeeSource } from "./direct-zigbee-source.js";

async function directory(context: { after(fn: () => unknown): void }): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "villa-network-events-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function fileLines(path: string): Promise<string[]> {
  return (await readFile(path, "utf8")).split("\n").filter((line) => line.trim() !== "");
}

/** Sahte koordinatör: canlı donanıma hiç dokunulmaz. */
function coordinatorFixture() {
  const device = {
    ieeeAddr: "0x00124b00net01",
    type: "Router",
    powerSource: "Mains (single phase)",
    lastSeen: undefined as number | undefined,
    meta: {} as Record<string, unknown>,
    endpoints: [] as unknown[],
    getEndpoint: () => undefined,
    interviewState: "SUCCESSFUL",
    async removeFromNetwork(): Promise<void> {},
    removeFromDatabase(): void {}
  };
  const handlers = new Map<string, (payload: never) => unknown>();
  const controller = {
    on(event: string, handler: (payload: never) => unknown) {
      handlers.set(event, handler);
    },
    getDeviceByIeeeAddr(id: string) {
      return id === device.ieeeAddr ? device : undefined;
    },
    getDevicesByType() {
      return [];
    },
    getDevicesIterator() {
      return [device].values();
    }
  };
  return { controller, device, handlers };
}

test("katılma, ayrılma ve silme kalıcı günlüğe yazılır; çevrimdışı geçişi yazılmaz", async (context) => {
  const path = await directory(context);
  const configurationFile = join(path, "configuration.yaml");
  await writeFile(
    configurationFile,
    "devices:\n  '0x00124b00net01':\n    friendly_name: Hall Switch\n",
    "utf8"
  );
  const fixture = coordinatorFixture();
  const log = new DeviceNetworkEventLog(join(path, "device-network-events.jsonl"));
  const source = new DirectZigbeeSource(
    {
      devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } },
      groups: {},
      dataDir: path,
      configurationFile
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map()),
    false,
    new Map(),
    undefined,
    { enabled: false, spacingMs: 0 },
    log
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);

  await fixture.handlers.get("deviceJoined")?.({ device: fixture.device } as never);
  // Pilli cihazların gün boyu ürettiği gürültü: günlükte iz bırakmamalı.
  const availability = source as unknown as {
    setAvailability(id: string, state: "online" | "offline"): void;
  };
  availability.setAvailability(fixture.device.ieeeAddr, "offline");
  availability.setAvailability(fixture.device.ieeeAddr, "online");
  await fixture.handlers.get("deviceLeave")?.({ ieeeAddr: fixture.device.ieeeAddr } as never);
  await source.removeDevice(fixture.device.ieeeAddr);
  await log.flush();

  const events = await log.read();
  assert.deepEqual(events.map((event) => event.reason), ["removed", "left", "joined"]);
  assert.deepEqual(
    new Set(events.map((event) => event.id)),
    new Set([fixture.device.ieeeAddr])
  );
  assert.equal(events[0]?.name, "Hall Switch");
  // Kısa ömürlü bellek kaydı yerinde kalır; kalıcı günlük onun yerine geçmez.
  assert.equal(source.recentDeparture(fixture.device.ieeeAddr)?.reason, "removed");
});

test("silmenin ardından gelen ayrılma yankısı günlüğe ikinci satır yazmaz", async (context) => {
  const path = await directory(context);
  const configurationFile = join(path, "configuration.yaml");
  await writeFile(
    configurationFile,
    "devices:\n  '0x00124b00net01':\n    friendly_name: Hall Switch\n",
    "utf8"
  );
  const fixture = coordinatorFixture();
  const log = new DeviceNetworkEventLog(join(path, "device-network-events.jsonl"));
  const source = new DirectZigbeeSource(
    {
      devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } },
      groups: {},
      dataDir: path,
      configurationFile
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map()),
    false,
    new Map(),
    undefined,
    { enabled: false, spacingMs: 0 },
    log
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);

  await source.removeDevice(fixture.device.ieeeAddr);
  await fixture.handlers.get("deviceLeave")?.({ ieeeAddr: fixture.device.ieeeAddr } as never);
  await log.flush();

  assert.deepEqual((await log.read()).map((event) => event.reason), ["removed"]);
});

test("kayıtlar yeniden başlatmadan sonra da durur", async (context) => {
  const path = join(await directory(context), "device-network-events.jsonl");
  const first = new DeviceNetworkEventLog(path);
  first.record({ id: "0xAAA", reason: "joined", name: "Salon Lamba" });
  first.record({ id: "0xAAA", reason: "left" });
  await first.flush();

  // Yeni süreç, aynı dosya: günlüğün asıl değeri burada.
  const second = new DeviceNetworkEventLog(path);
  const events = await second.read();
  assert.deepEqual(events.map((event) => event.reason), ["left", "joined"]);
  assert.equal(events[1]?.name, "Salon Lamba");
  assert.equal(events[0]?.id, "0xaaa");

  second.record({ id: "0xBBB", reason: "removed" });
  await second.flush();
  assert.deepEqual((await second.read()).map((event) => event.id), ["0xbbb", "0xaaa", "0xaaa"]);
});

test("tavan aşılınca en eski kayıt düşer", async (context) => {
  const path = join(await directory(context), "device-network-events.jsonl");
  const log = new DeviceNetworkEventLog(path, { maxRecords: 3 });
  for (let index = 0; index < 12; index += 1) {
    log.record({ id: `0x${index}`, reason: "joined" });
  }
  await log.flush();

  const events = await log.read();
  assert.deepEqual(events.map((event) => event.id), ["0x11", "0x10", "0x9"]);
  // Dosya da büyümez: sıkıştırma tavanın %40 üstünde bir kez çalışır.
  assert.ok((await fileLines(path)).length <= Math.ceil(3 * 1.4) + 1);
});

test("bozuk satır günlüğü okunmaz hale getirmez, yazma hatası sessiz kalmaz", async (context) => {
  const path = join(await directory(context), "device-network-events.jsonl");
  await writeFile(path, `{ bozuk\n${JSON.stringify({
    at: new Date().toISOString(),
    id: "0xccc",
    reason: "left"
  } satisfies DeviceNetworkEvent)}\n`, "utf8");
  const log = new DeviceNetworkEventLog(path);
  assert.deepEqual((await log.read()).map((event) => event.id), ["0xccc"]);

  const errors: string[] = [];
  const broken = new DeviceNetworkEventLog(join(path, "yol", "yok.jsonl"), {
    onError: (message) => errors.push(message)
  });
  broken.record({ id: "0xddd", reason: "joined" });
  await broken.flush();
  assert.equal(errors.length, 1);
  assert.match(errors[0] as string, /Cihaz ağ günlüğü yazılamadı/);
});

test("ağ olayları ucu yönetici yetkisinde kalır", async () => {
  const server = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const accessControl = await readFile(new URL("../src/access-control.ts", import.meta.url), "utf8");

  assert.match(server, /app\.get<\{ Querystring: \{ limit\?: string \} \}>\("\/api\/debug\/network-events"/);
  assert.match(server, /deviceNetworkEventLog\.read\(/);
  // Yetki tablolarında yer almayan yol yöneticiye kapalıdır — `/api/debug/errors` ile aynı kural.
  assert.doesNotMatch(accessControl, /\/api\/debug\//);
});
