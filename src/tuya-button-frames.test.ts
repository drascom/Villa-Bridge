import assert from "node:assert/strict";
import test from "node:test";
import { findByDevice, setLogger } from "zigbee-herdsman-converters";
import { AutomationEngine } from "./automation-engine.js";
import { AutomationsStore } from "./automations.js";
import { DeviceStore, featureValues } from "./device-store.js";
import { decodeTuyaButtonFrame } from "./tuya-button-frames.js";
import type { JsonObject } from "./types.js";

const noopLogger = {
  debug: () => undefined,
  info: () => undefined,
  warning: () => undefined,
  error: () => undefined
};
setLogger(noopLogger);

/** Kullanıcının TS0043 sahne anahtarı. */
const switchId = "0x20a716fffe6835f1";
const lampId = "0x00124b0011cc22dd";

/** `[frame control, sıra no, komut, değer]` — canlıda görülen çerçeve düzeni. */
const frame = (sequence: number, pressType: number, commandId = 0xfd): Buffer =>
  Buffer.from([0x01, sequence, commandId, pressType]);

test("Tuya ham genOnOff çerçevesi buton olayına çevrilir", () => {
  assert.deepEqual(
    decodeTuyaButtonFrame({ data: frame(12, 0), endpointId: 1, endpointCount: 3, modelId: "TS0043" }),
    { ok: true, action: "1_single", sequence: 12 }
  );
  assert.deepEqual(
    decodeTuyaButtonFrame({ data: frame(13, 1), endpointId: 2, endpointCount: 3, modelId: "TS0043" }),
    { ok: true, action: "2_double", sequence: 13 }
  );
  assert.deepEqual(
    decodeTuyaButtonFrame({ data: frame(14, 2), endpointId: 3, endpointCount: 3, modelId: "TS0043" }),
    { ok: true, action: "3_hold", sequence: 14 }
  );
});

test("tek butonlu varyantlarda endpoint öneki kullanılmaz", () => {
  const single = decodeTuyaButtonFrame({
    data: frame(1, 0),
    endpointId: 1,
    endpointCount: 1,
    modelId: "TS0041"
  });
  assert.deepEqual(single, { ok: true, action: "single", sequence: 1 });
  // TS0041 birden çok endpoint bildirse de tek butonludur.
  assert.deepEqual(
    decodeTuyaButtonFrame({ data: frame(2, 2), endpointId: 2, endpointCount: 4, modelId: "TS0041A" }),
    { ok: true, action: "hold", sequence: 2 }
  );
});

test("üreticiye özel çerçevede sıra ve komut kaymalı okunur", () => {
  const manufacturerFrame = Buffer.from([0x05, 0x02, 0x11, 0x2a, 0xfd, 0x01]);
  assert.deepEqual(
    decodeTuyaButtonFrame({
      data: manufacturerFrame,
      endpointId: 2,
      endpointCount: 3,
      modelId: "TS0043"
    }),
    { ok: true, action: "2_double", sequence: 0x2a }
  );
});

test("tanınmayan çerçeveler sessizce düşmez, Türkçe gerekçe döner", () => {
  const cases = [
    { input: { data: frame(1, 7), endpointId: 1, endpointCount: 3 }, match: /bilinmeyen basış tipi 7/ },
    { input: { data: frame(1, 0), endpointId: 0, endpointCount: 3 }, match: /bilinmeyen buton endpoint/ },
    { input: { data: frame(1, 0), endpointId: 9, endpointCount: 9 }, match: /bilinmeyen buton endpoint/ },
    { input: { data: frame(1, 0, 0x02), endpointId: 1, endpointCount: 3 }, match: /Tuya buton komutu değil/ },
    { input: { data: Buffer.from([0x00, 0x01, 0xfd]), endpointId: 1, endpointCount: 3 }, match: /çerçeve çok kısa/ },
    { input: { data: Buffer.from([0x18, 0x01, 0x0b, 0xfd]), endpointId: 1, endpointCount: 3 }, match: /kümeye özel olmayan/ },
    { input: { data: undefined, endpointId: 1, endpointCount: 3 }, match: /çerçeve çok kısa/ }
  ];
  for (const item of cases) {
    const result = decodeTuyaButtonFrame(item.input);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, item.match);
  }
});

test("üretilen action değerleri TS004x ailesinin exposes sözlüğüyle birebir eşleşir", async () => {
  const family: Array<[string, number]> = [
    ["TS0041", 1],
    ["TS0042", 2],
    ["TS0043", 3],
    ["TS0044", 4]
  ];
  for (const [modelId, endpointCount] of family) {
    const device = {
      modelID: modelId,
      manufacturerName: "_TZ3000_qzjcsmar",
      manufacturerID: 0,
      type: "EndDevice",
      ieeeAddr: switchId,
      endpoints: Array.from({ length: endpointCount }, (_, index) => ({
        ID: index + 1,
        inputClusters: [6],
        outputClusters: []
      })),
      isDevice: () => true
    };
    const definition = await findByDevice(device as never);
    assert.ok(definition, `${modelId} tanımı bulunamadı`);
    const exposes = typeof definition.exposes === "function"
      ? definition.exposes(device as never, {})
      : definition.exposes;
    const expected = featureValues(exposes, "action");
    const produced = new Set<string>();
    for (let endpointId = 1; endpointId <= endpointCount; endpointId += 1) {
      for (const pressType of [0, 1, 2]) {
        const result = decodeTuyaButtonFrame({
          data: frame(endpointId * 10 + pressType, pressType),
          endpointId,
          endpointCount,
          modelId
        });
        assert.equal(result.ok, true);
        if (result.ok) produced.add(result.action);
      }
    }
    assert.deepEqual([...produced].sort(), expected, `${modelId} action sözlüğü uyuşmuyor`);
  }
});

test("çözümlenen action olay akışına girer ve deviceAction otomasyonunu tetikler", async (context) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "villa-tuya-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  const automations = new AutomationsStore(join(directory, "automations.json"));
  await automations.save([{
    id: "salon-butonu",
    name: "Salon butonu",
    enabled: true,
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }],
    conditions: [],
    actions: [{ type: "device", deviceId: lampId, property: "state_l1", value: "ON" }],
    lastRunAt: null,
    lastRunOk: null
  }]);
  const calls: Array<{ id: string; command: JsonObject }> = [];
  const engine = new AutomationEngine({
    store: automations,
    source: {
      setDevice: async (id: string, command: JsonObject) => {
        calls.push({ id, command });
      }
    },
    now: () => new Date("2026-08-03T19:00:05"),
    logger: { error: () => undefined }
  });
  context.after(() => engine.stop());

  const pending: Array<Promise<void>> = [];
  const store = new DeviceStore(new Map(), { devices: {}, models: {} }, [], (_events, added) => {
    const deviceEvents = added.flatMap((event) => {
      const deviceId = store.getDeviceIdBySourceName(event.sourceName);
      return deviceId ? [{ deviceId, property: event.property, value: event.value }] : [];
    });
    if (deviceEvents.length > 0) pending.push(engine.handleDeviceEvents(deviceEvents));
  });
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: switchId,
    friendly_name: "salon-anahtari",
    type: "EndDevice"
  }])));

  const decoded = decodeTuyaButtonFrame({
    data: frame(12, 0),
    endpointId: 1,
    endpointCount: 3,
    modelId: "TS0043"
  });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.ok ? decoded.action : "", "1_single");
  store.ingest("salon-anahtari", Buffer.from(JSON.stringify({
    battery: 100,
    action: decoded.ok ? decoded.action : ""
  })));
  await Promise.all(pending);

  assert.deepEqual(store.getEvents(10).filter((event) => event.property === "action").map((event) => event.value), ["1_single"]);
  assert.deepEqual(calls, [{ id: lampId, command: { state_l1: "ON" } }]);
});
