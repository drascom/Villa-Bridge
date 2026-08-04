import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AutomationEngine } from "./automation-engine.js";
import { AutomationAutoOffStore, AutomationsStore } from "./automations.js";
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
  engineOptions: { actionTimeoutMs?: number } = {}
) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-engine-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new AutomationsStore(join(directory, "automations.json"));
  await store.save(entries);
  const source = new FakeSource();
  const logs: string[] = [];
  const notes: string[] = [];
  let clock = new Date("2026-08-03T19:00:05");
  const timers = new FakeTimers(() => clock.getTime());
  const autoOffStore = new AutomationAutoOffStore(join(directory, "automation-auto-off.json"));
  const engine = new AutomationEngine({
    store,
    source,
    now: () => clock,
    timers,
    autoOffStore,
    logger: { error: (message) => logs.push(message), info: (message) => notes.push(message) },
    ...engineOptions
  });
  context.after(() => engine.stop());
  return {
    store,
    source,
    engine,
    logs,
    notes,
    timers,
    autoOffStore,
    directory,
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
