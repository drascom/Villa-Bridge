import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AutomationEngine } from "./automation-engine.js";
import { AutomationsStore } from "./automations.js";
import type { JsonObject } from "./types.js";

const lampId = "0x00124b0011cc22dd";
/** Kullanıcının TS0043 sahne anahtarı — üç buton, tek IEEE adresi. */
const switchId = "0x20a716fffe6835f1";
const sensorId = "0x00124b0022ab34cd";

const automation = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "aksam-salon",
  name: "Akşam salon",
  enabled: true,
  triggers: [{ type: "time", at: "19:00", days: [1, 2, 3, 4, 5, 6, 7] }],
  conditions: [],
  actions: [{ type: "device", deviceId: lampId, property: "state_l1", value: "ON" }],
  lastRunAt: null,
  lastRunOk: null,
  ...overrides
});

/** Sahte kaynak — gerçek koordinatöre veya MQTT'ye dokunmaz. */
class FakeSource {
  readonly calls: Array<{ id: string; command: JsonObject }> = [];
  failNext = false;

  async setDevice(id: string, command: JsonObject): Promise<void> {
    this.calls.push({ id, command });
    if (this.failNext) throw new Error("Cihaz yanıt vermedi.");
  }
}

const harness = async (
  context: { after(fn: () => unknown): void },
  entries: Array<Record<string, unknown>>
) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-engine-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new AutomationsStore(join(directory, "automations.json"));
  await store.save(entries);
  const source = new FakeSource();
  const logs: string[] = [];
  let clock = new Date("2026-08-03T19:00:05");
  const engine = new AutomationEngine({
    store,
    source,
    now: () => clock,
    logger: { error: (message) => logs.push(message) }
  });
  context.after(() => engine.stop());
  return {
    store,
    source,
    engine,
    logs,
    setClock: (value: string) => {
      clock = new Date(value);
    }
  };
};

test("otomasyon doğru dakikada bir kez çalışır", async (context) => {
  const { engine, source, store, setClock } = await harness(context, [automation()]);

  await engine.tick();
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);
  const saved = await store.get();
  assert.equal(saved[0]?.lastRunOk, true);
  assert.equal(typeof saved[0]?.lastRunAt, "string");

  setClock("2026-08-03T19:00:45");
  await engine.tick();
  assert.equal(source.calls.length, 1);

  setClock("2026-08-03T19:01:05");
  await engine.tick();
  assert.equal(source.calls.length, 1);

  setClock("2026-08-04T19:00:05");
  await engine.tick();
  assert.equal(source.calls.length, 2);
});

test("kapalı otomasyon ve eşleşmeyen gün çalışmaz", async (context) => {
  const { engine, source, setClock } = await harness(context, [
    automation({ id: "kapali-otomasyon", enabled: false }),
    automation({
      id: "yalniz-pazartesi",
      triggers: [{ type: "time", at: "19:00", days: [1] }]
    })
  ]);

  // 2026-08-03 Pazartesi: yalnızca gün eşleşen otomasyon çalışır.
  await engine.tick();
  assert.equal(source.calls.length, 1);

  // 2026-08-05 Çarşamba: gün eşleşmiyor, hiçbiri çalışmaz.
  setClock("2026-08-05T19:00:05");
  await engine.tick();
  assert.equal(source.calls.length, 1);
});

test("eylemler sırayla çalışır, hata süreci çökertmez ve lastRunOk false yazılır", async (context) => {
  const { engine, source, store, logs } = await harness(context, [automation({
    actions: [
      { type: "device", deviceId: lampId, property: "state_l1", value: "ON" },
      { type: "device", deviceId: lampId, property: "state_l2", value: "ON" }
    ]
  })]);
  source.failNext = true;

  await engine.tick();
  assert.equal(source.calls.length, 1);
  const saved = await store.get();
  assert.equal(saved[0]?.lastRunOk, false);
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? "", /Akşam salon/);
});

test("elle çalıştırma motorun yolunu kullanır ve yeniden girişe karşı korunur", async (context) => {
  const { engine, source, setClock } = await harness(context, [automation()]);

  assert.equal(await engine.run("yok-boyle-bir"), "missing");
  assert.equal(await engine.run("AKSAM-SALON"), "ok");
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);

  // 2 saniyelik asgari aralık dolmadan yeniden tetiklenemez.
  assert.equal(await engine.run("aksam-salon"), "busy");
  assert.equal(source.calls.length, 1);

  setClock("2026-08-03T19:00:10");
  assert.equal(await engine.run("aksam-salon"), "ok");
  assert.equal(source.calls.length, 2);
});

test("düğme basışı olay akışından tetikler, iki basış iki kez çalışır", async (context) => {
  const { engine, source, store, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }]
  })]);

  // `action` kalıcı durumda yoktur; son-değer karşılaştırması değil, kenar olayıdır.
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_single" }]);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);

  // Aynı değer arka arkaya gelse de ikinci basış çalışmalı (2 sn aralık dolduktan sonra).
  setClock("2026-08-03T19:00:10");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_single" }]);
  assert.equal(source.calls.length, 2);

  // Başka bir buton bu otomasyonu tetiklemez (alt varlık kuralı).
  setClock("2026-08-03T19:00:20");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "2_single" }]);
  assert.equal(source.calls.length, 2);

  assert.equal((await store.get())[0]?.lastRunOk, true);
});

test("düğme gürültüsü 2 saniyelik aralıkla bastırılır", async (context) => {
  const { engine, source, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }]
  })]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_single" }]);
  setClock("2026-08-03T19:00:06");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_single" }]);
  assert.equal(source.calls.length, 1);

  setClock("2026-08-03T19:00:08");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_single" }]);
  assert.equal(source.calls.length, 2);
});

test("sensör tetikleyicisi yalnızca kenarda çalışır", async (context) => {
  const { engine, source, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }]
  })]);

  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.equal(source.calls.length, 1);

  // Aynı değer tekrar bildirilirse otomasyon yeniden çalışmaz — aralıktan bağımsız.
  setClock("2026-08-03T19:00:30");
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.equal(source.calls.length, 1);

  // false'a düşüp tekrar true olunca yeni bir kenar oluşur.
  setClock("2026-08-03T19:01:00");
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: false }]);
  assert.equal(source.calls.length, 1);
  setClock("2026-08-03T19:01:30");
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.equal(source.calls.length, 2);
});

test("kapalı otomasyon olay tetikleyicisiyle de çalışmaz", async (context) => {
  const { engine, source } = await harness(context, [automation({
    enabled: false,
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }]
  })]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_single" }]);
  assert.equal(source.calls.length, 0);
});

test("eşleşmeyen olaylar otomasyon dosyasını okumaya bile gerek bırakmaz", async (context) => {
  const { engine, source } = await harness(context, [automation({
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }]
  })]);

  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "battery_threshold", value: true }]);
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "action", value: "1_double" }]);
  assert.equal(source.calls.length, 0);
});

test("start ve stop zamanlayıcıyı sızdırmaz", async (context) => {
  const { engine } = await harness(context, [automation()]);
  engine.start();
  engine.start();
  engine.stop();
  engine.stop();
});
