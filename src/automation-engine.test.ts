import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AutomationEngine,
  automationSunTime,
  evaluateAutomationConditions
} from "./automation-engine.js";
import type { AutomationRunRecord } from "./automation-runs.js";
import { AutomationAutoOffStore, AutomationsStore } from "./automations.js";
import type { AutomationCondition, AutomationTimePoint } from "./automations.js";
import type { HomeLocation } from "./location.js";
import { sunTimes, type SunTimes } from "./sun.js";
import type { JsonObject, JsonScalar } from "./types.js";

/** §2.3 — aralık uçları artık nesne; sabit saatli testler bu kısayolla okunur kalır. */
const clockPoint = (at: string): AutomationTimePoint => ({ kind: "clock", at });
const sunPoint = (
  event: "sunrise" | "sunset",
  offsetMinutes = 0
): AutomationTimePoint => ({ kind: "sun", event, offsetMinutes });

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
  readonly groupCalls: Array<{ id: string; command: JsonObject }> = [];
  readonly sceneCalls: Array<{ id: string; sceneId: number; action: string }> = [];
  failNext = false;
  private gate: (() => void) | null = null;
  private blockNextCall = false;

  /** Bir sonraki komut, `release` çağrılana kadar askıda kalır (yavaş cihaz benzetimi). */
  blockNext(): void {
    this.blockNextCall = true;
  }

  release(): void {
    const gate = this.gate;
    this.gate = null;
    this.blockNextCall = false;
    gate?.();
  }

  async setGroup(id: string, command: JsonObject): Promise<void> {
    this.groupCalls.push({ id, command });
  }

  async groupScene(id: string, sceneId: number, action: string): Promise<void> {
    this.sceneCalls.push({ id, sceneId, action });
  }

  async setDevice(id: string, command: JsonObject): Promise<void> {
    this.calls.push({ id, command });
    if (this.failNext) throw new Error("Cihaz yanıt vermedi.");
    if (!this.blockNextCall) return;
    this.blockNextCall = false;
    await new Promise<void>((resolve) => {
      this.gate = resolve;
    });
  }
}

/**
 * Sahte zamanlayıcı — testler gerçek `setTimeout` beklemez, saat elle ilerletilir.
 * Otomatik kapatma sayaçları bunun üzerinden çalışır.
 */
class FakeTimers {
  private next = 1;
  private readonly entries = new Map<number, { at: number; handler: () => void }>();

  constructor(private readonly clock: () => number) {}

  set(handler: () => void, ms: number): unknown {
    const id = this.next;
    this.next += 1;
    this.entries.set(id, { at: this.clock() + ms, handler });
    return id;
  }

  clear(handle: unknown): void {
    this.entries.delete(handle as number);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Zamanı gelen sayaçları çalıştırır. */
  fire(): void {
    const now = this.clock();
    for (const [id, entry] of [...this.entries]) {
      if (entry.at > now) continue;
      this.entries.delete(id);
      entry.handler();
    }
  }
}

/** Olay işleme dosya okuması içerir; koşul sağlanana kadar mikro turlarla bekle. */
const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(predicate(), true);
};

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 40));
};

const harness = async (
  context: { after(fn: () => unknown): void },
  entries: Array<Record<string, unknown>>,
  engineOptions: {
    actionTimeoutMs?: number;
    location?: HomeLocation | null;
    start?: string;
  } = {}
) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-engine-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new AutomationsStore(join(directory, "automations.json"));
  await store.save(entries);
  const source = new FakeSource();
  const logs: string[] = [];
  const notes: string[] = [];
  /** Çalışma günlüğü diske değil belleğe yazılır; testler dosya beklemez. */
  const runs: AutomationRunRecord[] = [];
  /** Koşulların okuduğu anlık cihaz durumu — `DeviceStore` yerine sahte harita. */
  const states = new Map<string, JsonScalar>();
  let location: HomeLocation | null = engineOptions.location ?? null;
  let clock = new Date(engineOptions.start ?? "2026-08-03T19:00:05");
  const timers = new FakeTimers(() => clock.getTime());
  const autoOffStore = new AutomationAutoOffStore(join(directory, "automation-auto-off.json"));
  const engine = new AutomationEngine({
    store,
    source,
    now: () => clock,
    timers,
    autoOffStore,
    logger: { error: (message) => logs.push(message), info: (message) => notes.push(message) },
    location: () => location,
    deviceState: (deviceId, property) => states.get(`${deviceId}|${property}`),
    runLog: { append: (record) => runs.push(record) },
    ...(engineOptions.actionTimeoutMs === undefined
      ? {}
      : { actionTimeoutMs: engineOptions.actionTimeoutMs })
  });
  context.after(() => engine.stop());
  return {
    store,
    source,
    engine,
    logs,
    notes,
    runs,
    timers,
    autoOffStore,
    directory,
    setState: (deviceId: string, property: string, value: JsonScalar) => {
      states.set(`${deviceId}|${property}`, value);
    },
    setLocation: (value: HomeLocation | null) => {
      location = value;
    },
    setClock: (value: string) => {
      clock = new Date(value);
    },
    /** Saati ilerletip zamanı gelen sayaçları çalıştırır — gerçek bekleme yok. */
    advance: async (ms: number) => {
      clock = new Date(clock.getTime() + ms);
      timers.fire();
      await settle();
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

test("equals'sız deviceState tetikleyicisi her değişimde çalışır, tekrarda çalışmaz", async (context) => {
  const { engine, source, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }]
  })]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "ON" }]);
  assert.equal(source.calls.length, 1);

  // Aynı değer yeniden bildirilirse kenar yok — tetiklenmez.
  setClock("2026-08-03T19:00:30");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "ON" }]);
  assert.equal(source.calls.length, 1);

  // Kapanış da bir değişimdir; equals verilmediği için o da tetikler.
  setClock("2026-08-03T19:01:00");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "OFF" }]);
  assert.equal(source.calls.length, 2);
});

test("takip senaryosu: anahtar açılınca lamba açılır, kapanınca kapanır", async (context) => {
  const { engine, source, store, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "ON" } },
      { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "OFF" } }
    ]
  })]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "ON" }]);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "ON" } }]);

  setClock("2026-08-03T19:00:30");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "OFF" }]);
  assert.deepEqual(source.calls[1], { id: lampId, command: { state: "OFF" } });
  assert.equal(source.calls.length, 2);

  assert.equal((await store.get())[0]?.lastRunOk, true);
});

test("ters senaryo: kullanıcı açılışta kapatmayı seçebilir", async (context) => {
  const { engine, source, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "ON" } },
      { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "OFF" } }
    ]
  })]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "ON" }]);
  setClock("2026-08-03T19:00:30");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "OFF" }]);
  assert.deepEqual(source.calls, [
    { id: lampId, command: { state: "OFF" } },
    { id: lampId, command: { state: "ON" } }
  ]);
});

test("when taşımayan eylem her durumda çalışır (geriye uyumluluk)", async (context) => {
  const { engine, source, setClock } = await harness(context, [automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state_l1", value: "ON" },
      { type: "device", deviceId: lampId, property: "state_l2", value: "ON", when: { equals: "ON" } }
    ]
  })]);

  // Açılışta ikisi de çalışır.
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "ON" }]);
  assert.equal(source.calls.length, 2);

  // Kapanışta yalnızca koşulsuz eylem çalışır; koşullu olan atlanır.
  setClock("2026-08-03T19:00:30");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "OFF" }]);
  assert.deepEqual(source.calls[2], { id: lampId, command: { state_l1: "ON" } });
  assert.equal(source.calls.length, 3);
});

test("kullanıcının canlıdaki equals taşıyan kuralları aynen çalışır", async (context) => {
  const { engine, source, store, setClock } = await harness(context, [
    automation({
      id: "bahce-anahtari",
      name: "Bahçe anahtarı",
      triggers: [{ type: "deviceState", deviceId: switchId, property: "state", equals: "ON" }],
      actions: [{ type: "device", deviceId: lampId, property: "state", value: "TOGGLE" }]
    }),
    automation({
      id: "salon-sensoru",
      name: "Salon sensörü",
      triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }],
      actions: [{ type: "device", deviceId: lampId, property: "state_l1", value: "ON" }]
    })
  ]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "ON" }]);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "TOGGLE" } }]);

  // equals eşleşmeyen değer eskisi gibi hiçbir şey yapmaz.
  setClock("2026-08-03T19:00:30");
  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "OFF" }]);
  assert.equal(source.calls.length, 1);

  setClock("2026-08-03T19:01:00");
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.deepEqual(source.calls[1], { id: lampId, command: { state_l1: "ON" } });
  assert.equal((await store.get())[1]?.lastRunOk, true);
});

test("hiçbir when eşleşmezse çalıştırma başarısız sayılmaz", async (context) => {
  const { engine, source, store } = await harness(context, [automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "ON" } }
    ]
  })]);

  await engine.handleDeviceEvents([{ deviceId: switchId, property: "state", value: "OFF" }]);
  assert.equal(source.calls.length, 0);
  // lastRunOk/lastRunAt dokunulmadan kalır — atlama hata değildir.
  const saved = await store.get();
  assert.equal(saved[0]?.lastRunOk, null);
  assert.equal(saved[0]?.lastRunAt, null);
});

test("zaman tetikleyicisinde when taşıyan eylem atlanır", async (context) => {
  const { engine, source, store } = await harness(context, [automation({
    actions: [
      { type: "device", deviceId: lampId, property: "state_l1", value: "ON" },
      { type: "device", deviceId: lampId, property: "state_l2", value: "ON", when: { equals: "ON" } }
    ]
  })]);

  // Zaman tetikleyicisinde eşleşecek bir olay değeri yoktur; koşullu eylem atlanır.
  await engine.tick();
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);
  assert.equal((await store.get())[0]?.lastRunOk, true);
});

test("elle çalıştırma yalnızca koşullu eylem varsa atlanır", async (context) => {
  const { engine, source, store } = await harness(context, [automation({
    actions: [
      { type: "device", deviceId: lampId, property: "state_l1", value: "ON", when: { equals: "ON" } }
    ]
  })]);

  assert.equal(await engine.run("aksam-salon"), "skipped");
  assert.equal(source.calls.length, 0);
  assert.equal((await store.get())[0]?.lastRunAt, null);
});

/** Rocker anahtar: aynı düğme sırayla ON/OFF üretir; her basış gerçek kullanıcı niyetidir. */
const rocker = (): Record<string, unknown> => automation({
  triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }],
  actions: [
    { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "ON" } },
    { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "OFF" } }
  ]
});

const stateEvent = (value: string) => [{ deviceId: switchId, property: "state", value }];

test("ON'un hemen ardından gelen OFF düşmez — ters yön gürültü değildir", async (context) => {
  const { engine, source, notes } = await harness(context, [rocker()]);

  // Saat ilerlemiyor: iki basış da aynı 2 saniyelik pencerede. Eskiden OFF sessizce düşerdi.
  await engine.handleDeviceEvents(stateEvent("ON"));
  await engine.handleDeviceEvents(stateEvent("OFF"));

  assert.deepEqual(source.calls, [
    { id: lampId, command: { state: "ON" } },
    { id: lampId, command: { state: "OFF" } }
  ]);
  assert.equal(notes.length, 0);
});

test("aynı eylem kümesinin gerçek tekrarı hâlâ bastırılır ve loglanır", async (context) => {
  const { engine, source, notes } = await harness(context, [automation({
    triggers: [
      { type: "deviceState", deviceId: switchId, property: "state" },
      { type: "deviceState", deviceId: sensorId, property: "occupancy" }
    ],
    actions: [{ type: "device", deviceId: lampId, property: "state", value: "ON" }]
  })]);

  await engine.handleDeviceEvents(stateEvent("ON"));
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);

  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "ON" } }]);
  assert.equal(notes.length, 1);
  assert.match(notes[0] ?? "", /bastırıldı/);
});

test("hızlı ON→OFF→ON→OFF dizisi faz kaybı bırakmaz", async (context) => {
  const { engine, source } = await harness(context, [rocker()]);

  for (const value of ["ON", "OFF", "ON", "OFF"]) {
    await engine.handleDeviceEvents(stateEvent(value));
  }

  assert.deepEqual(source.calls.map((call) => call.command), [
    { state: "ON" }, { state: "OFF" }, { state: "ON" }, { state: "OFF" }
  ]);
});

test("koşu sürerken gelen basışlar birleştirilir: son basış kazanır (ON→OFF)", async (context) => {
  const { engine, source } = await harness(context, [rocker()]);
  source.blockNext();

  const first = engine.handleDeviceEvents(stateEvent("ON"));
  await waitFor(() => source.calls.length === 1);
  // Kilit doluyken gelen ters yön düşmez, sıraya alınır.
  await engine.handleDeviceEvents(stateEvent("OFF"));
  await settle();
  assert.equal(source.calls.length, 1);

  source.release();
  await first;
  assert.deepEqual(source.calls.map((call) => call.command), [{ state: "ON" }, { state: "OFF" }]);
});

test("koşu sürerken ON→OFF→ON gelirse yalnız son basış geçerlidir", async (context) => {
  const { engine, source } = await harness(context, [rocker()]);
  source.blockNext();

  const first = engine.handleDeviceEvents(stateEvent("ON"));
  await waitFor(() => source.calls.length === 1);
  await engine.handleDeviceEvents(stateEvent("OFF"));
  await engine.handleDeviceEvents(stateEvent("ON"));
  source.release();
  await first;
  await settle();

  // Ara OFF hiç çalışmaz (lamba yanıp sönmez); sonuç kullanıcının son basışı olan ON'dur.
  assert.deepEqual(source.calls.map((call) => call.command), [{ state: "ON" }]);
});

test("yavaş cihaz zaman aşımıyla kuralı kilitlemez", async (context) => {
  const { engine, source, logs } = await harness(context, [rocker()], { actionTimeoutMs: 20 });
  source.blockNext();

  await engine.handleDeviceEvents(stateEvent("ON"));
  assert.equal(source.calls.length, 1);
  assert.match(logs[0] ?? "", /yanıt vermedi/);

  // Kilit serbest kaldı: sonraki basış normal çalışır.
  await engine.handleDeviceEvents(stateEvent("OFF"));
  assert.deepEqual(source.calls.map((call) => call.command), [{ state: "ON" }, { state: "OFF" }]);
  source.release();
});

test("start ve stop zamanlayıcıyı sızdırmaz", async (context) => {
  const { engine } = await harness(context, [automation()]);
  engine.start();
  engine.start();
  engine.stop();
  engine.stop();
});

/** §9 — hareket sensörü lambayı açar; kapanış aynı kuralın içindedir. */
const motionRule = (autoOff: Record<string, unknown>): Record<string, unknown> => automation({
  id: "koridor-hareket",
  name: "Koridor hareket",
  triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }],
  actions: [{ type: "device", deviceId: lampId, property: "state", value: "ON", autoOff }]
});

const motion = (value: boolean): Array<{ deviceId: string; property: string; value: boolean }> =>
  [{ deviceId: sensorId, property: "occupancy", value }];

test("süre dolunca hedef kendiliğinden kapanır", async (context) => {
  const { engine, source, advance, timers } = await harness(context, [
    motionRule({ mode: "after", seconds: 300, value: "OFF" })
  ]);

  await engine.handleDeviceEvents(motion(true));
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "ON" } }]);
  assert.equal(timers.size, 1);

  // Süre dolmadan hiçbir şey olmaz.
  await advance(299_000);
  assert.equal(source.calls.length, 1);

  await advance(1_000);
  assert.deepEqual(source.calls.map((call) => call.command), [{ state: "ON" }, { state: "OFF" }]);
  assert.equal(timers.size, 0);
});

test("sayaç sürerken yeni hareket sayacı sıfırlar", async (context) => {
  const { engine, source, advance } = await harness(context, [
    motionRule({ mode: "after", seconds: 300, value: "OFF" })
  ]);

  await engine.handleDeviceEvents(motion(true));
  await advance(200_000);
  // Kenar kuralı: önce boşalma, sonra yeni hareket.
  await engine.handleDeviceEvents(motion(false));
  await engine.handleDeviceEvents(motion(true));
  assert.equal(source.calls.length, 2);

  // İlk sayaç dolsaydı burada kapanırdı; sıfırlandığı için kapanmaz.
  await advance(120_000);
  assert.equal(source.calls.length, 2);

  await advance(200_000);
  assert.deepEqual(source.calls.map((call) => call.command).at(-1), { state: "OFF" });
});

test("elle müdahale otomatik kapatmayı iptal eder", async (context) => {
  const { engine, source, advance, notes, timers } = await harness(context, [
    motionRule({ mode: "after", seconds: 300, value: "OFF" })
  ]);

  await engine.handleDeviceEvents(motion(true));
  // Kaynağı önemli değil: panel, Alexa, Apple Home ya da duvar anahtarı — hepsi aynı olay akışı.
  await engine.handleDeviceEvents([{ deviceId: lampId, property: "state", value: "OFF" }]);
  assert.equal(timers.size, 0);
  assert.ok(notes.some((note) => /iptal edildi/.test(note)));

  await advance(600_000);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "ON" } }]);
});

test("kendi yazdığımız değerin yankısı otomatik kapatmayı iptal etmez", async (context) => {
  const { engine, source, advance } = await harness(context, [
    motionRule({ mode: "after", seconds: 60, value: "OFF" })
  ]);

  await engine.handleDeviceEvents(motion(true));
  await engine.handleDeviceEvents([{ deviceId: lampId, property: "state", value: "ON" }]);

  await advance(60_000);
  assert.deepEqual(source.calls.map((call) => call.command), [{ state: "ON" }, { state: "OFF" }]);
});

test("hareket bitince kapatma tetikleyicinin kendi değerinden türer", async (context) => {
  const { engine, source, advance, timers } = await harness(context, [
    motionRule({ mode: "idle", seconds: 0, value: "OFF" })
  ]);

  await engine.handleDeviceEvents(motion(true));
  // Hareket sürerken sayaç hiç açılmaz.
  assert.equal(timers.size, 0);
  await advance(3_600_000);
  assert.equal(source.calls.length, 1);

  await engine.handleDeviceEvents(motion(false));
  await advance(0);
  assert.deepEqual(source.calls.map((call) => call.command), [{ state: "ON" }, { state: "OFF" }]);
});

test("hareket bitince kapatmada ek bekleme yeni hareketle sıfırlanır", async (context) => {
  const { engine, source, advance, notes } = await harness(context, [
    motionRule({ mode: "idle", seconds: 120, value: "OFF" })
  ]);

  await engine.handleDeviceEvents(motion(true));
  await engine.handleDeviceEvents(motion(false));
  await advance(60_000);
  assert.equal(source.calls.length, 1);

  // Odada biri var: sayaç sıfırlanır, ışık sönmez.
  await engine.handleDeviceEvents(motion(true));
  assert.ok(notes.some((note) => /sıfırlandı/.test(note)));
  await advance(120_000);
  assert.equal(source.calls.length, 2);

  await engine.handleDeviceEvents(motion(false));
  await advance(120_000);
  assert.deepEqual(source.calls.map((call) => call.command).at(-1), { state: "OFF" });
});

test("otomatik kapatmasız kurallar zamanlayıcı bırakmaz", async (context) => {
  const { engine, source, timers } = await harness(context, [automation()]);

  await engine.tick();
  assert.equal(source.calls.length, 1);
  assert.equal(timers.size, 0);
});

test("yeniden başlatmada bekleyen kapatma sürdürülür", async (context) => {
  const first = await harness(context, [motionRule({ mode: "after", seconds: 600, value: "OFF" })]);
  await first.engine.handleDeviceEvents(motion(true));
  await settle();
  first.engine.stop();

  const entries = await first.autoOffStore.get();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.mode, "after");

  // İkinci süreç aynı durum dosyasını okur: kalan süreyle devam eder.
  const store = new AutomationsStore(join(first.directory, "automations.json"));
  const source = new FakeSource();
  let clock = new Date("2026-08-03T19:05:05");
  const timers = new FakeTimers(() => clock.getTime());
  const engine = new AutomationEngine({
    store,
    source,
    now: () => clock,
    timers,
    autoOffStore: first.autoOffStore,
    logger: { error: () => {}, info: () => {} }
  });
  context.after(() => engine.stop());
  await engine.restoreAutoOff();

  clock = new Date("2026-08-03T19:09:00");
  timers.fire();
  await settle();
  assert.equal(source.calls.length, 0);

  // 19:00:05'te başlayan 600 saniye 19:10:05'te dolar.
  clock = new Date("2026-08-03T19:10:06");
  timers.fire();
  await settle();
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "OFF" } }]);
  assert.deepEqual(await first.autoOffStore.get(), []);
});

test("süresi geçmiş bekleyen kapatma yeniden başlatmada hemen uygulanır", async (context) => {
  const first = await harness(context, [motionRule({ mode: "after", seconds: 60, value: "OFF" })]);
  await first.engine.handleDeviceEvents(motion(true));
  await settle();
  first.engine.stop();

  const store = new AutomationsStore(join(first.directory, "automations.json"));
  const source = new FakeSource();
  // Süreç uzun süre kapalı kaldı: ışık sonsuza kadar açık kalmaz.
  const clock = new Date("2026-08-03T21:00:00");
  const timers = new FakeTimers(() => clock.getTime());
  const engine = new AutomationEngine({
    store,
    source,
    now: () => clock,
    timers,
    autoOffStore: first.autoOffStore,
    logger: { error: () => {}, info: () => {} }
  });
  context.after(() => engine.stop());
  await engine.restoreAutoOff();
  timers.fire();
  await settle();

  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "OFF" } }]);
});

test("hareket bekleyen kayıt yeniden başlatmada üst sınırla kapanır", async (context) => {
  const first = await harness(context, [motionRule({ mode: "idle", seconds: 0, value: "OFF" })]);
  await first.engine.handleDeviceEvents(motion(true));
  await settle();
  first.engine.stop();

  const entries = await first.autoOffStore.get();
  assert.equal(entries[0]?.dueAt, null);
  assert.deepEqual(entries[0]?.watch, {
    deviceId: sensorId,
    property: "occupancy",
    activeValue: true
  });

  const store = new AutomationsStore(join(first.directory, "automations.json"));
  const source = new FakeSource();
  let clock = new Date("2026-08-03T19:05:00");
  const timers = new FakeTimers(() => clock.getTime());
  const engine = new AutomationEngine({
    store,
    source,
    now: () => clock,
    timers,
    autoOffStore: first.autoOffStore,
    logger: { error: () => {}, info: () => {} }
  });
  context.after(() => engine.stop());
  await engine.restoreAutoOff();

  // Hareketin bittiği haberini kimse saklamıyor; bir dakikalık üst sınır devreye girer.
  clock = new Date("2026-08-03T19:05:59");
  timers.fire();
  await settle();
  assert.equal(source.calls.length, 0);

  clock = new Date("2026-08-03T19:06:01");
  timers.fire();
  await settle();
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "OFF" } }]);
});

// ---------------------------------------------------------------------------
// Güneş · koşullar · sayısal eşik · yeni eylemler · çalışma günlüğü
// ---------------------------------------------------------------------------

/** Kullanıcının evi olabilir; ürün çok evli olduğu için koordinat testten geliyor. */
const istanbul = { latitude: 41.0082, longitude: 28.9784 };
/** Kutup dairesinin üstü — yaz gündönümünde güneş batmaz. */
const tromso = { latitude: 69.6492, longitude: 18.9553 };

/** Beklenen yerel an, astronomi testinin değil motor yolunun sınandığından emin olmak için. */
const sunMoment = (
  location: HomeLocation,
  year: number,
  month: number,
  day: number,
  event: "sunrise" | "sunset",
  offsetMinutes: number
): Date => {
  const times = sunTimes(new Date(year, month - 1, day, 12, 0, 0), location.latitude, location.longitude);
  const base = event === "sunrise" ? times.sunrise : times.sunset;
  assert.ok(base, "Güneş anı hesaplanamadı.");
  return new Date(base.getTime() + offsetMinutes * 60_000);
};

const sunRule = (offsetMinutes: number): Record<string, unknown> => automation({
  id: "gun-batimi",
  name: "Gün batımı",
  triggers: [{ type: "sun", event: "sunset", offsetMinutes }]
});

test("güneş tetikleyicisi hesaplanan yerel dakikada çalışır", async (context) => {
  const target = sunMoment(istanbul, 2026, 6, 21, "sunset", -30);
  const { engine, source, setClock } = await harness(context, [sunRule(-30)], {
    location: istanbul,
    start: new Date(target.getTime() - 5 * 60_000).toISOString()
  });

  // Beş dakika önce: zamanı gelmedi.
  await engine.tick();
  assert.equal(source.calls.length, 0);

  setClock(target.toISOString());
  await engine.tick();
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);

  // Aynı dakikada ikinci tur: dakika kilidi tutuyor.
  await engine.tick();
  assert.equal(source.calls.length, 1);
});

/** §9.1 — gün doğumu ve gün batımı tek kuralda: iki tetikleyici, `when` taşıyan iki eylem. */
const sunMapRule = (): Record<string, unknown> => automation({
  id: "gun-dongusu",
  name: "Gün döngüsü",
  triggers: [
    { type: "sun", event: "sunset", offsetMinutes: 0 },
    { type: "sun", event: "sunrise", offsetMinutes: 0 }
  ],
  actions: [
    { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "sunset" } },
    { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "sunrise" } }
  ]
});

test("güneş tetikleyicisi eylemlere olay adını eşleştirir", async (context) => {
  const sunset = sunMoment(istanbul, 2026, 6, 21, "sunset", 0);
  const { engine, source, runs, setClock } = await harness(context, [sunMapRule()], {
    location: istanbul,
    start: sunset.toISOString()
  });

  // Gün batımı: yalnız "sunset" taşıyan eylem çalışır.
  await engine.tick();
  assert.deepEqual(source.calls, [{ id: lampId, command: { state: "ON" } }]);
  assert.equal(runs.at(-1)?.trigger?.kind, "sun");
  assert.equal(runs.at(-1)?.trigger?.value, "sunset");

  // Ertesi sabah gün doğumu: bu kez yalnız "sunrise" taşıyan eylem çalışır.
  const sunrise = sunMoment(istanbul, 2026, 6, 22, "sunrise", 0);
  setClock(sunrise.toISOString());
  await engine.tick();
  assert.deepEqual(source.calls, [
    { id: lampId, command: { state: "ON" } },
    { id: lampId, command: { state: "OFF" } }
  ]);
  assert.equal(runs.at(-1)?.trigger?.value, "sunrise");
});

test("güneş kuralında hiçbir eylem eşleşmezse çalıştırma başarısız sayılmaz", async (context) => {
  const sunset = sunMoment(istanbul, 2026, 6, 21, "sunset", 0);
  const { engine, source, store, runs } = await harness(context, [automation({
    id: "gun-dongusu",
    triggers: [{ type: "sun", event: "sunset", offsetMinutes: 0 }],
    actions: [
      { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "sunrise" } }
    ]
  })], { location: istanbul, start: sunset.toISOString() });

  await engine.tick();
  assert.equal(source.calls.length, 0);
  assert.equal(runs.at(-1)?.outcome, "skipped");
  // Atlama hata değildir: `lastRunAt`/`lastRunOk` dokunulmadan kalır.
  const saved = await store.get();
  assert.equal(saved[0]?.lastRunAt, null);
  assert.equal(saved[0]?.lastRunOk, null);
});

test("güneş kuralı elle çalıştırılınca when taşıyan eylemler atlanır", async (context) => {
  const sunset = sunMoment(istanbul, 2026, 6, 21, "sunset", 0);
  const { engine, source, store } = await harness(context, [sunMapRule()], {
    location: istanbul,
    start: new Date(sunset.getTime() - 60 * 60_000).toISOString()
  });

  // Elle çalıştırmada olay değeri yoktur; iki eylem de eşleşmez.
  assert.equal(await engine.run("gun-dongusu"), "skipped");
  assert.equal(source.calls.length, 0);
  assert.equal((await store.get())[0]?.lastRunAt, null);
});

test("konum yoksa güneş kuralı çalışmaz ve sebebi günde bir kez günlüğe düşer", async (context) => {
  const target = sunMoment(istanbul, 2026, 6, 21, "sunset", 0);
  const { engine, source, runs, notes, setClock } = await harness(context, [sunRule(0)], {
    start: target.toISOString()
  });

  await engine.tick();
  assert.equal(source.calls.length, 0);
  const blocked = runs.filter((run) => run.reason === "locationMissing");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.outcome, "blocked");
  assert.ok(notes.some((note) => note.includes("konumu ayarlı değil")));

  // Aynı gün içindeki turlar günlüğü şişirmez.
  setClock(new Date(target.getTime() + 60_000).toISOString());
  await engine.tick();
  assert.equal(runs.filter((run) => run.reason === "locationMissing").length, 1);
});

test("kutup gününde kural atlanır ve günlüğe yazılır", async (context) => {
  const { engine, source, runs } = await harness(context, [sunRule(0)], {
    location: tromso,
    start: new Date(2026, 5, 21, 21, 30, 0).toISOString()
  });

  await engine.tick();
  assert.equal(source.calls.length, 0);
  const blocked = runs.filter((run) => run.reason === "sunUnavailable");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.trigger?.kind, "sun");

  // Panelin "neden pasif" sorusu da aynı sebebi veriyor.
  const [saved] = await engine["options"].store.get();
  assert.ok(saved);
  assert.equal(engine.inactiveReason(saved)?.code, "sunUnavailable");
  assert.equal(engine.sunSummary().sunset, null);
});

test("güneş uçlu koşul taşıyan kural konum yoksa pasif sebebini bildirir", async (context) => {
  const dark = {
    type: "timeRange",
    from: { kind: "sun", event: "sunset", offsetMinutes: 0 },
    to: { kind: "sun", event: "sunrise", offsetMinutes: 0 }
  };
  const { engine, source, runs, setLocation } = await harness(context, [
    automation({ id: "karanlikta-salon", conditions: [dark] }),
    automation({ id: "saatli-salon", conditions: [{ type: "timeRange", from: "18:00", to: "23:00" }] })
  ]);
  const [sunRuled, clockRuled] = await engine["options"].store.get();
  assert.ok(sunRuled && clockRuled);

  const reason = engine.inactiveReason(sunRuled);
  assert.equal(reason?.code, "locationMissing");
  assert.match(reason?.message ?? "", /saat aralığı/);
  // Sabit saatli koşul güneşe bakmaz: o kural pasif sayılmaz.
  assert.equal(engine.inactiveReason(clockRuled), null);

  // Konum yokken kural gerçekten de durur; sabit saatli kardeşi çalışmaya devam eder.
  await engine.tick();
  assert.equal(source.calls.length, 1);
  const blocked = runs.filter((run) => run.automationId === "karanlikta-salon");
  assert.equal(blocked[0]?.outcome, "blocked");
  assert.equal(blocked[0]?.reason, "conditionFalse");
  assert.match(blocked[0]?.detail ?? "", /konumu ayarlı değil/);

  // Konum girilince pasiflik kalkar.
  setLocation(istanbul);
  assert.equal(engine.inactiveReason(sunRuled), null);
});

test("güneş anı yerel saate çevrilir ve kaydırma uygulanır", () => {
  const times = sunTimes(new Date(2026, 5, 21, 12, 0, 0), istanbul.latitude, istanbul.longitude);
  const withoutOffset = automationSunTime(
    { type: "sun", event: "sunset", offsetMinutes: 0, days: [1, 2, 3, 4, 5, 6, 7] },
    times
  );
  const withOffset = automationSunTime(
    { type: "sun", event: "sunset", offsetMinutes: -60, days: [1, 2, 3, 4, 5, 6, 7] },
    times
  );
  assert.ok(withoutOffset && withOffset);
  const minutes = (value: string): number =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  assert.equal(minutes(withoutOffset) - minutes(withOffset), 60);
  // Hesap yoksa (kutup günü) saat de yok.
  assert.equal(
    automationSunTime(
      { type: "sun", event: "sunrise", offsetMinutes: 0, days: [1] },
      { sunrise: null, sunset: null }
    ),
    null
  );
});

test("gece yarısını aşan saat aralığı doğru değerlendirilir", () => {
  const range = { type: "timeRange", from: clockPoint("22:00"), to: clockPoint("06:00") } as const;
  const at = (hour: number, minute = 0, day = 3): Date => new Date(2026, 7, day, hour, minute);
  const check = (date: Date): boolean =>
    evaluateAutomationConditions([range], date, () => undefined).ok;

  assert.equal(check(at(23)), true);
  assert.equal(check(at(22, 0)), true);
  assert.equal(check(at(0, 30)), true);
  assert.equal(check(at(5, 59)), true);
  assert.equal(check(at(6, 0)), false);
  assert.equal(check(at(12)), false);
  assert.equal(check(at(21, 59)), false);

  // Normal (aynı gün içi) aralık da bozulmadı.
  const day = { type: "timeRange", from: clockPoint("08:00"), to: clockPoint("20:00") } as const;
  assert.equal(evaluateAutomationConditions([day], at(12), () => undefined).ok, true);
  assert.equal(evaluateAutomationConditions([day], at(21), () => undefined).ok, false);
  assert.equal(evaluateAutomationConditions([day], at(7), () => undefined).ok, false);
});

test("gece yarısını aşan aralıkta gün ölçütü aralığın başladığı güne bakar", () => {
  // 2026-08-07 Cuma. "Cuma gecesi" = cuma 22:00 → cumartesi 06:00.
  const fridayNight: AutomationCondition = {
    type: "timeRange",
    from: clockPoint("22:00"),
    to: clockPoint("06:00"),
    days: [5]
  };
  const check = (date: Date): boolean =>
    evaluateAutomationConditions([fridayNight], date, () => undefined).ok;

  assert.equal(check(new Date(2026, 7, 7, 23, 0)), true);
  assert.equal(check(new Date(2026, 7, 8, 2, 0)), true);
  // Cumartesi gecesi (yani pazar sabahı) kapsam dışı.
  assert.equal(check(new Date(2026, 7, 8, 23, 0)), false);
  assert.equal(check(new Date(2026, 7, 9, 2, 0)), false);
});

/** Sahte güneş saatleri — konum ve gerçek hesap olmadan uçlar sabitlenir (doğuş 06:12, batış 19:44). */
const fakeSun = (): SunTimes => ({
  sunrise: new Date(2026, 7, 3, 6, 12),
  sunset: new Date(2026, 7, 3, 19, 44)
});

test("batıştan doğuşa aralık gece geçer, öğlen geçmez", () => {
  const dark: AutomationCondition = {
    type: "timeRange",
    from: sunPoint("sunset"),
    to: sunPoint("sunrise")
  };
  const times = fakeSun();
  const check = (hour: number, minute = 0): boolean =>
    evaluateAutomationConditions([dark], new Date(2026, 7, 3, hour, minute), () => undefined, { times }).ok;

  assert.equal(check(23), true);
  assert.equal(check(2), true);
  assert.equal(check(19, 44), true);
  assert.equal(check(19, 43), false);
  assert.equal(check(6, 11), true);
  // Bitiş ucu hariç: doğuşta karanlık biter.
  assert.equal(check(6, 12), false);
  assert.equal(check(12), false);
});

test("güneş ucunun dakika kaydırması aralığın sınırını taşır", () => {
  const times = fakeSun();
  const early: AutomationCondition = {
    type: "timeRange",
    from: sunPoint("sunset", -15),
    to: sunPoint("sunrise", 30)
  };
  const check = (hour: number, minute = 0): boolean =>
    evaluateAutomationConditions([early], new Date(2026, 7, 3, hour, minute), () => undefined, { times }).ok;

  // Batıştan 15 dk önce (19:29) başlar, doğuştan 30 dk sonra (06:42) biter.
  assert.equal(check(19, 29), true);
  assert.equal(check(19, 28), false);
  assert.equal(check(6, 41), true);
  assert.equal(check(6, 42), false);
});

test("karışık uçlu aralık: gün batımından 23:00'a", () => {
  const times = fakeSun();
  const evening: AutomationCondition = {
    type: "timeRange",
    from: sunPoint("sunset"),
    to: clockPoint("23:00")
  };
  const check = (hour: number, minute = 0): boolean =>
    evaluateAutomationConditions([evening], new Date(2026, 7, 3, hour, minute), () => undefined, { times }).ok;

  assert.equal(check(20), true);
  assert.equal(check(19, 44), true);
  assert.equal(check(19, 43), false);
  assert.equal(check(22, 59), true);
  assert.equal(check(23), false);
  assert.equal(check(2), false);
});

test("güneş uçlu aralıkta gün ölçütü aralığın başladığı güne bakar", () => {
  const times = fakeSun();
  // 2026-08-07 Cuma. Cuma gecesi = cuma batışı → cumartesi doğuşu.
  const fridayNight: AutomationCondition = {
    type: "timeRange",
    from: sunPoint("sunset"),
    to: sunPoint("sunrise"),
    days: [5]
  };
  const check = (date: Date): boolean =>
    evaluateAutomationConditions([fridayNight], date, () => undefined, { times }).ok;

  assert.equal(check(new Date(2026, 7, 7, 23, 0)), true);
  assert.equal(check(new Date(2026, 7, 8, 2, 0)), true);
  assert.equal(check(new Date(2026, 7, 8, 23, 0)), false);
  assert.equal(check(new Date(2026, 7, 9, 2, 0)), false);
});

test("güneş saatleri yoksa güneş uçlu aralık sağlanmaz ve sebebi yazılır", () => {
  const dark: AutomationCondition = {
    type: "timeRange",
    from: sunPoint("sunset"),
    to: sunPoint("sunrise")
  };
  const at = new Date(2026, 7, 3, 23, 0);

  for (const times of [null, { sunrise: null, sunset: null } as SunTimes]) {
    const result = evaluateAutomationConditions([dark], at, () => undefined, { times });
    assert.equal(result.ok, false);
    assert.match(result.results[0]?.reason ?? "", /konumu ayarlı değil/);
  }
  // Seçenek hiç verilmezse de aynı sonuç: kapalı tarafa düşülür.
  assert.equal(evaluateAutomationConditions([dark], at, () => undefined).ok, false);

  // Sabit saatli aralık güneş saatleri olmadan da çalışmaya devam eder.
  const fixed: AutomationCondition = {
    type: "timeRange",
    from: clockPoint("22:00"),
    to: clockPoint("06:00")
  };
  assert.equal(evaluateAutomationConditions([fixed], at, () => undefined).ok, true);
});

test("sayısal eşik koşulu o anki değere bakar; tam sınır dışarıda kalır", () => {
  const at = new Date(2026, 7, 3, 12, 0);
  const check = (condition: AutomationCondition, value: JsonScalar): boolean =>
    evaluateAutomationConditions([condition], at, () => value).ok;
  const above: AutomationCondition = {
    type: "deviceState", deviceId: sensorId, property: "temperature", above: 25
  };
  const below: AutomationCondition = {
    type: "deviceState", deviceId: sensorId, property: "temperature", below: 25
  };
  const between: AutomationCondition = {
    type: "deviceState", deviceId: sensorId, property: "temperature", above: 20, below: 25
  };

  assert.equal(check(above, 25.1), true);
  assert.equal(check(above, 25), false);
  assert.equal(check(above, 24.9), false);
  assert.equal(check(below, 24.9), true);
  assert.equal(check(below, 25), false);
  assert.equal(check(below, 25.1), false);
  assert.equal(check(between, 22), true);
  assert.equal(check(between, 20), false);
  assert.equal(check(between, 25), false);
  assert.equal(check(between, 26), false);
  // Dize okuma da sayıya çevrilir — MQTT bazı cihazlarda metin gönderir.
  assert.equal(check(above, "26.5"), true);

  // Sayıya çevrilemeyen değerde koşul false ve sebebi ayrı.
  const broken = evaluateAutomationConditions([above], at, () => "sıcak");
  assert.equal(broken.ok, false);
  assert.match(broken.results[0]?.reason ?? "", /sayısal değil/);
  // Eşik dışında kalan değerin sebebi sınırı da yazar.
  const outside = evaluateAutomationConditions([between], at, () => 30);
  assert.equal(outside.ok, false);
  assert.match(outside.results[0]?.reason ?? "", /20-25 aralığında değil/);
});

test("`any` modu tek koşulun tutmasıyla geçer; sonuçlar hepsini taşır", () => {
  const at = new Date(2026, 7, 3, 12, 0);
  // Biri tutan, biri tutmayan iki koşul: fark yalnız moddan gelir.
  const conditions: AutomationCondition[] = [
    { type: "timeRange", from: clockPoint("08:00"), to: clockPoint("20:00") },
    { type: "deviceState", deviceId: lampId, property: "state_l1", equals: "ON" }
  ];
  const read = (): JsonScalar => "OFF";

  const all = evaluateAutomationConditions(conditions, at, read);
  assert.equal(all.ok, false);
  const any = evaluateAutomationConditions(conditions, at, read, { mode: "any" });
  assert.equal(any.ok, true);
  // Günlükte "hangisi tuttu" görünmeli: `any` modunda da tüm koşullar döner.
  assert.equal(any.results.length, 2);
  assert.deepEqual(any.results.map((result) => result.ok), [true, false]);
  assert.match(any.results[1]?.reason ?? "", /state_l1/);

  // Hiçbiri tutmuyorsa `any` de geçmez.
  const none = evaluateAutomationConditions(
    [conditions[1] as AutomationCondition, conditions[1] as AutomationCondition],
    at,
    read,
    { mode: "any" }
  );
  assert.equal(none.ok, false);

  // Koşulsuz kural iki modda da geçer.
  assert.equal(evaluateAutomationConditions([], at, read).ok, true);
  assert.equal(evaluateAutomationConditions([], at, read, { mode: "any" }).ok, true);
  // Belirtilmeyen mod "all" ile aynıdır.
  assert.equal(evaluateAutomationConditions(conditions, at, read, {}).ok, false);
  assert.equal(evaluateAutomationConditions(conditions, at, read, { mode: "all" }).ok, false);
});

test("bilinmeyen cihaz durumu koşulu false yapar ve sebebi taşır", () => {
  const evaluation = evaluateAutomationConditions(
    [{ type: "deviceState", deviceId: lampId, property: "state_l1", equals: "ON" }],
    new Date(2026, 7, 3, 12, 0),
    () => undefined
  );
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.results[0]?.reason ?? "", /bilinmiyor/);
});

const conditionRule = (): Record<string, unknown> => automation({
  id: "kosullu-kural",
  name: "Koşullu kural",
  triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }],
  // "Lamba zaten açıksa dokunma."
  conditions: [{ type: "deviceState", deviceId: lampId, property: "state_l1", not: "ON" }]
});

test("koşul sağlanmazsa kural çalışmaz ve sebebi günlüğe düşer", async (context) => {
  const { engine, source, runs, notes, setState } = await harness(context, [conditionRule()]);

  setState(lampId, "state_l1", "ON");
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.equal(source.calls.length, 0);
  const blocked = runs.filter((run) => run.reason === "conditionFalse");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.outcome, "blocked");
  assert.equal(blocked[0]?.trigger?.deviceId, sensorId);
  assert.equal(blocked[0]?.conditions?.[0]?.ok, false);
  assert.ok(notes.some((note) => note.includes("Koşullu kural")));

  // Koşul sağlanınca aynı kural çalışır.
  setState(lampId, "state_l1", "OFF");
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: false }]);
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);
});

test("`any` modundaki kural tek koşul tutunca çalışır, hiçbiri tutmayınca sebebini yazar", async (context) => {
  const anyRule = automation({
    id: "herhangi-biri",
    name: "Herhangi biri",
    conditionMode: "any",
    triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }],
    conditions: [
      { type: "deviceState", deviceId: lampId, property: "state_l1", equals: "ON" },
      { type: "deviceState", deviceId: sensorId, property: "illuminance", below: 50 }
    ]
  });
  const { engine, source, runs, setState } = await harness(context, [anyRule]);

  // İkisi de tutmuyor: kural bloklanır ve sebep "hiçbiri" der.
  setState(lampId, "state_l1", "OFF");
  setState(sensorId, "illuminance", 300);
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.equal(source.calls.length, 0);
  const blocked = runs.filter((run) => run.reason === "conditionFalse");
  assert.equal(blocked.length, 1);
  assert.match(blocked[0]?.detail ?? "", /hiçbiri sağlanmadı/);
  assert.equal(blocked[0]?.conditions?.length, 2);

  // Yalnız ikinci koşul tutuyor: `all` olsaydı geçmezdi, `any` geçirir.
  setState(sensorId, "illuminance", 10);
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: false }]);
  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "occupancy", value: true }]);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);
});

const thresholdRule = (): Record<string, unknown> => automation({
  id: "sicaklik-esigi",
  name: "Sıcaklık eşiği",
  triggers: [{ type: "deviceState", deviceId: sensorId, property: "temperature", above: 26 }]
});

test("sayısal eşik yalnız kenarda bir kez tetikler", async (context) => {
  const { engine, source, advance } = await harness(context, [thresholdRule()]);
  const report = async (value: number): Promise<void> => {
    await engine.handleDeviceEvents([{ deviceId: sensorId, property: "temperature", value }]);
    // Aynı imzanın 2 sn'lik tekrar bastırması testi yanıltmasın.
    await advance(3_000);
  };

  await report(25.5);
  assert.equal(source.calls.length, 0, "İlk okuma taban alınmalı.");

  await report(26.1);
  assert.equal(source.calls.length, 1, "Eşik geçildiği anda bir kez.");

  await report(26.2);
  await report(26.3);
  assert.equal(source.calls.length, 1, "Eşiğin üstünde kalmak yeniden tetiklemez.");

  await report(25.0);
  assert.equal(source.calls.length, 1, "Eşiğin altına inmek eylemi çalıştırmaz.");

  await report(26.4);
  assert.equal(source.calls.length, 2, "Yeniden geçiş yeniden tetikler.");
});

test("sayısal olmayan değer tetiklemez ve günlüğe düşer", async (context) => {
  const { engine, source, runs } = await harness(context, [thresholdRule()]);

  await engine.handleDeviceEvents([{ deviceId: sensorId, property: "temperature", value: "sıcak" }]);
  assert.equal(source.calls.length, 0);
  const blocked = runs.filter((run) => run.reason === "nonNumericValue");
  assert.equal(blocked.length, 1);
  assert.match(blocked[0]?.detail ?? "", /sayı değil/);
});

test("alt ve üst eşik birlikte aralığa girişi tetikler", async (context) => {
  const { engine, source, advance } = await harness(context, [automation({
    id: "nem-araligi",
    name: "Nem aralığı",
    triggers: [{ type: "deviceState", deviceId: sensorId, property: "humidity", above: 40, below: 60 }]
  })]);
  const report = async (value: number): Promise<void> => {
    await engine.handleDeviceEvents([{ deviceId: sensorId, property: "humidity", value }]);
    await advance(3_000);
  };

  await report(30);
  await report(50);
  assert.equal(source.calls.length, 1);
  await report(55);
  assert.equal(source.calls.length, 1);
  await report(70);
  await report(50);
  assert.equal(source.calls.length, 2);
});

const delayRule = (): Record<string, unknown> => automation({
  id: "gecikmeli-kural",
  name: "Gecikmeli kural",
  actions: [
    { type: "device", deviceId: lampId, property: "state_l1", value: "ON" },
    { type: "delay", seconds: 10 },
    { type: "device", deviceId: lampId, property: "state_l2", value: "ON" }
  ]
});

test("bekleme eylemleri sıraya sokar ve zaman aşımına takılmaz", async (context) => {
  const { engine, source, timers, advance } = await harness(context, [delayRule()], {
    // Zaman aşımı beklemeyi kapsasaydı 10 sn'lik bekleme hata üretirdi.
    actionTimeoutMs: 1_000
  });

  await engine.tick();
  await waitFor(() => source.calls.length === 1);
  assert.deepEqual(source.calls, [{ id: lampId, command: { state_l1: "ON" } }]);

  // Bekleme sayacı kurulana kadar saati ilerletme; yoksa sayaç yeni saate göre kurulur.
  await waitFor(() => timers.size === 1);
  await advance(10_000);
  await engine.settle();
  assert.deepEqual(source.calls, [
    { id: lampId, command: { state_l1: "ON" } },
    { id: lampId, command: { state_l2: "ON" } }
  ]);
});

test("bekleme içeren kural turu kilitlemez; diğer kurallar beklemez", async (context) => {
  const { engine, source, notes } = await harness(context, [
    delayRule(),
    automation({ id: "hizli-kural", name: "Hızlı kural" })
  ]);

  await engine.tick();
  // Tur döndüğünde ikinci kural çoktan çalışmış olmalı — bekleme onu geciktirmiyor.
  await waitFor(() => source.calls.some((call) => call.command.state_l1 === "ON"));
  await waitFor(() => source.calls.length === 2);
  assert.ok(notes.some((note) => note.includes("arka planda yürüyor")));
});

test("motor durunca bekleyen eylem düşer ama iz bırakır", async (context) => {
  const { engine, source, runs, logs } = await harness(context, [delayRule()]);

  await engine.tick();
  await waitFor(() => source.calls.length === 1);
  engine.stop();
  await engine.settle();

  assert.equal(source.calls.length, 1);
  const stopped = runs.filter((run) => run.reason === "stopped");
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0]?.outcome, "failed");
  assert.ok(logs.some((line) => line.includes("yarıda kesildi")));
});

test("grup ve sahne eylemleri kaynağa iletilir", async (context) => {
  const { engine, source, runs } = await harness(context, [automation({
    id: "grup-kurali",
    name: "Grup kuralı",
    actions: [
      { type: "group", groupId: "group-7", property: "state", value: "ON" },
      { type: "scene", groupId: "group-7", sceneId: 4 }
    ]
  })]);

  await engine.tick();
  assert.deepEqual(source.groupCalls, [{ id: "group-7", command: { state: "ON" } }]);
  assert.deepEqual(source.sceneCalls, [{ id: "group-7", sceneId: 4, action: "recall" }]);
  const ok = runs.find((run) => run.outcome === "ok");
  assert.deepEqual(ok?.actions?.map((action) => action.type), ["group", "scene"]);
});

test("çalışma günlüğü başarıyı, tetikleyeni ve hatayı taşır", async (context) => {
  const { engine, source, runs, advance } = await harness(context, [automation()]);

  await engine.tick();
  const ok = runs.at(-1);
  assert.equal(ok?.outcome, "ok");
  assert.equal(ok?.trigger?.kind, "time");
  assert.deepEqual(ok?.actions, [{ type: "device", target: `${lampId}/state_l1`, ok: true }]);

  // Aynı imzanın 2 sn'lik tekrar bastırması elle çalıştırmayı yutmasın.
  await advance(3_000);
  source.failNext = true;
  await engine.run("aksam-salon");
  const failed = runs.at(-1);
  assert.equal(failed?.outcome, "failed");
  assert.equal(failed?.trigger?.kind, "manual");
  assert.equal(failed?.actions?.[0]?.ok, false);
});

// §2.1 + §2.5 — "şu kadar süredir böyleyse": değer ölçütünün üstüne binen süre ölçütü.
test("süre koşulu tam sınırda sağlanır, altında sağlanmaz", () => {
  const now = new Date(2026, 7, 7, 12, 0, 0);
  const condition: AutomationCondition = {
    type: "deviceState",
    deviceId: "0x00124b0022ab34cd",
    property: "occupancy",
    equals: true,
    forSeconds: 60
  };
  // `since` ne kadar geride olursa geçen süre o kadar uzundur.
  const check = (agoSeconds: number) => evaluateAutomationConditions(
    [condition],
    now,
    () => true,
    { stateSince: () => new Date(now.getTime() - agoSeconds * 1_000) }
  );

  assert.equal(check(59).ok, false);
  assert.equal(check(60).ok, true);
  assert.equal(check(61).ok, true);
  assert.equal(check(600).ok, true);
  // Sağlanmayan tur sebebini açıkça söyler: kaç saniye geçti, kaç gerekiyor.
  assert.match(check(40).results[0]?.reason ?? "", /40 saniyedir bu durumda, 60 saniye gerekiyor/);
  assert.equal(check(60).results[0]?.reason, undefined);
});

test("süre bilgisi yoksa koşul sağlanmaz ve sebebi yeniden başlatmayı söyler", () => {
  const now = new Date(2026, 7, 7, 12, 0, 0);
  const condition: AutomationCondition = {
    type: "deviceState",
    deviceId: "0x00124b0022ab34cd",
    property: "occupancy",
    equals: true,
    forSeconds: 60
  };
  // §2.5 — defter bellektedir; yeniden başlatmadan sonra kayıt yoktur. Kapalı tarafa düşülür.
  const missing = evaluateAutomationConditions([condition], now, () => true, { stateSince: () => null });
  assert.equal(missing.ok, false);
  assert.match(missing.results[0]?.reason ?? "", /yeniden başlatmadan beri kayıt yok/);
  // `stateSince` hiç bağlanmamışsa da aynı: sessiz `true` olmaz.
  const unwired = evaluateAutomationConditions([condition], now, () => true);
  assert.equal(unwired.ok, false);
  assert.match(unwired.results[0]?.reason ?? "", /60 saniye gerekiyor/);
});

test("değer ölçütü tutmuyorsa süreye bakılmadan sağlanmaz", () => {
  const now = new Date(2026, 7, 7, 12, 0, 0);
  let asked = false;
  const result = evaluateAutomationConditions(
    [{
      type: "deviceState",
      deviceId: "0x00124b0022ab34cd",
      property: "occupancy",
      equals: true,
      forSeconds: 60
    }],
    now,
    () => false,
    {
      stateSince: () => {
        asked = true;
        return new Date(2026, 7, 1);
      }
    }
  );
  assert.equal(result.ok, false);
  // Sebep değer ölçütünü anlatır, süreyi değil — defter hiç okunmaz.
  assert.match(result.results[0]?.reason ?? "", /değeri false/);
  assert.equal(asked, false);
});

test("süre ölçütü sayısal eşiğin üstüne biner", () => {
  const now = new Date(2026, 7, 7, 12, 0, 0);
  const condition: AutomationCondition = {
    type: "deviceState",
    deviceId: "0x00124b0022ab34cd",
    property: "temperature",
    above: 25,
    forSeconds: 300
  };
  const check = (value: number, agoSeconds: number) => evaluateAutomationConditions(
    [condition],
    now,
    () => value,
    { stateSince: () => new Date(now.getTime() - agoSeconds * 1_000) }
  );

  assert.equal(check(26, 300).ok, true);
  assert.equal(check(26, 299).ok, false);
  // Eşik tutmuyorsa süre uzun olsa da sağlanmaz.
  assert.equal(check(24, 3_600).ok, false);
  assert.match(check(24, 3_600).results[0]?.reason ?? "", /25 üstünde değil/);
});

test("süre alanı olmayan koşullar defterden etkilenmez", () => {
  const now = new Date(2026, 7, 7, 12, 0, 0);
  // Geriye uyumluluk: `forSeconds` yoksa `stateSince` hiç okunmaz, sonuç eskisiyle birebir aynı.
  let asked = false;
  const result = evaluateAutomationConditions(
    [{ type: "deviceState", deviceId: "0x00124b0022ab34cd", property: "occupancy", equals: true }],
    now,
    () => true,
    { stateSince: () => { asked = true; return null; } }
  );
  assert.equal(result.ok, true);
  assert.equal(asked, false);
});
