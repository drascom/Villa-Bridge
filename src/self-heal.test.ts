import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  SelfHealScheduler,
  SelfHealStateStore,
  selfHealBackoffMs,
  selfHealDecision,
  selfHealHourlyLimit,
  selfHealProbeBackoffMs,
  selfHealProbeDailyMs,
  selfHealProbeDecision,
  selfHealProbeDelayMs,
  selfHealProbeUnreachableAfter,
  selfHealSkipWindowMs,
  validateSelfHealState,
  type SelfHealDeviceState,
  type SelfHealOutcome,
  type SelfHealProbeResult
} from "./self-heal.js";

interface Harness {
  scheduler: SelfHealScheduler;
  outcomes: Array<[string, SelfHealOutcome]>;
  failures: Array<[string, string]>;
  runs: string[];
  waits: number[];
  states: Map<string, SelfHealDeviceState>;
  advance(ms: number): void;
}

function harness(options: {
  enabled?: boolean;
  blocked?: string | null;
  prepared?: boolean;
  fail?: boolean;
  states?: Map<string, SelfHealDeviceState>;
} = {}): Harness {
  const outcomes: Array<[string, SelfHealOutcome]> = [];
  const failures: Array<[string, string]> = [];
  const runs: string[] = [];
  const waits: number[] = [];
  const states = options.states ?? new Map<string, SelfHealDeviceState>();
  let clock = 1_000_000;
  const scheduler = new SelfHealScheduler({
    enabled: options.enabled !== false,
    initialState: states,
    now: () => clock,
    spacingMs: 5_000,
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    blockedReason: () => options.blocked ?? null,
    prepare: async (deviceId) => options.prepared === false ? null : async () => {
      runs.push(deviceId);
      if (options.fail) throw new Error("cihaz yanıt vermedi");
    },
    onOutcome: (deviceId, outcome) => outcomes.push([deviceId, outcome]),
    onFailure: (deviceId, message) => failures.push([deviceId, message])
  });
  return {
    scheduler,
    outcomes,
    failures,
    runs,
    waits,
    states,
    advance: (ms) => {
      clock += ms;
    }
  };
}

test("ilan gelince yapılandırma çalışır ve olay akışına iz bırakır", async () => {
  const test1 = harness();

  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, ["0xaaaa"]);
  assert.deepEqual(test1.outcomes, [["0xaaaa", "attempt"], ["0xaaaa", "ok"]]);
  assert.deepEqual(test1.failures, []);
  assert.equal(typeof test1.states.get("0xaaaa")?.lastConfiguredAt, "number");
});

test("60 saniye içindeki ikinci ilan atlanır, sonrası yeniden çalışır", async () => {
  const test1 = harness();

  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();
  test1.advance(selfHealSkipWindowMs - 1);
  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, ["0xaaaa"]);

  test1.advance(2);
  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, ["0xaaaa", "0xaaaa"]);
});

test("saatlik tavan aşılınca cihaz altı saat geri çekilir", async () => {
  const test1 = harness();

  for (let index = 0; index < selfHealHourlyLimit + 2; index += 1) {
    test1.scheduler.schedule("0xaaaa");
    await test1.scheduler.whenIdle();
    test1.advance(selfHealSkipWindowMs + 1);
  }

  assert.equal(test1.runs.length, selfHealHourlyLimit);
  const backoffUntil = test1.states.get("0xaaaa")?.backoffUntil;
  assert.equal(typeof backoffUntil, "number");

  // Geri çekilme dolmadan hiçbir deneme yapılmaz, dolduktan sonra yeniden başlar.
  test1.advance(Math.round(selfHealBackoffMs / 2));
  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();
  assert.equal(test1.runs.length, selfHealHourlyLimit);

  test1.advance(selfHealBackoffMs);
  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();
  assert.equal(test1.runs.length, selfHealHourlyLimit + 1);
});

test("kuyruk tek eşzamanlı iş çalıştırır ve araya beş saniye koyar", async () => {
  const test1 = harness();

  test1.scheduler.schedule("0xaaaa");
  test1.scheduler.schedule("0xbbbb");
  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, ["0xaaaa", "0xbbbb"]);
  assert.deepEqual(test1.waits, [5_000]);
});

test("engelli durumlarda hiç denenmez ve iz bırakılmaz", async () => {
  const test1 = harness({ blocked: "Eşleştirme açık." });

  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, []);
  assert.deepEqual(test1.outcomes, []);
  assert.equal(test1.states.size, 0);
});

test("yapılacak iş yoksa deneme sayılmaz", async () => {
  const test1 = harness({ prepared: false });

  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.outcomes, []);
  assert.equal(test1.states.size, 0);
});

test("başarısızlık olay akışına ve hata günlüğüne yazılır", async () => {
  const test1 = harness({ fail: true });

  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.outcomes, [["0xaaaa", "attempt"], ["0xaaaa", "failed"]]);
  assert.deepEqual(test1.failures, [["0xaaaa", "cihaz yanıt vermedi"]]);
  assert.equal(test1.states.get("0xaaaa")?.lastConfiguredAt, undefined);
});

test("ayar kapalıyken hiçbir şey yapılmaz", async () => {
  const test1 = harness({ enabled: false });

  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, []);
  assert.deepEqual(test1.outcomes, []);

  test1.scheduler.setEnabled(true);
  test1.scheduler.schedule("0xaaaa");
  await test1.scheduler.whenIdle();

  assert.deepEqual(test1.runs, ["0xaaaa"]);
});

test("kararlar cihazın kendi geçmişinden türetilir", () => {
  const now = 10_000_000;
  assert.equal(selfHealDecision(undefined, now), "run");
  assert.equal(selfHealDecision({ attempts: [], lastConfiguredAt: now - 10_000 }, now), "recently_configured");
  assert.equal(selfHealDecision({ attempts: [], backoffUntil: now + 10 }, now), "backoff");
  assert.equal(
    selfHealDecision({ attempts: [now - 3, now - 2, now - 1] }, now),
    "hourly_limit"
  );
  // Pencere dışındaki denemeler sayılmaz.
  assert.equal(
    selfHealDecision({ attempts: [now - 7_200_000, now - 7_200_001, now - 7_200_002] }, now),
    "run"
  );
});

interface ProbeHarness {
  scheduler: SelfHealScheduler;
  outcomes: Array<[string, SelfHealOutcome]>;
  failures: Array<[string, string]>;
  probes: string[];
  states: Map<string, SelfHealDeviceState>;
  control: { result: SelfHealProbeResult; eligible: boolean };
  now(): number;
  advance(ms: number): void;
  /** Bir yoklama turu: kuyruğa al, çalıştır, bitmesini bekle. */
  run(deviceId?: string): Promise<void>;
}

function probeHarness(options: {
  enabled?: boolean;
  probeEnabled?: boolean;
  blocked?: string | null;
} = {}): ProbeHarness {
  const outcomes: Array<[string, SelfHealOutcome]> = [];
  const failures: Array<[string, string]> = [];
  const probes: string[] = [];
  const states = new Map<string, SelfHealDeviceState>();
  const control = { result: { reachable: false } as SelfHealProbeResult, eligible: true };
  let clock = 1_000_000;
  const scheduler = new SelfHealScheduler({
    enabled: options.enabled !== false,
    probeEnabled: options.probeEnabled !== false,
    initialState: states,
    now: () => clock,
    spacingMs: 0,
    wait: async (ms) => {
      clock += ms;
    },
    blockedReason: () => options.blocked ?? null,
    prepare: async () => async () => undefined,
    probe: async (deviceId) => control.eligible
      ? async () => {
        probes.push(deviceId);
        return control.result;
      }
      : null,
    onOutcome: (deviceId, outcome) => outcomes.push([deviceId, outcome]),
    onFailure: (deviceId, message) => failures.push([deviceId, message])
  });
  return {
    scheduler,
    outcomes,
    failures,
    probes,
    states,
    control,
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    run: async (deviceId = "0xaaaa") => {
      scheduler.scheduleProbe(deviceId);
      await scheduler.whenIdle();
    }
  };
}

test("yoklamaya yanıt gelirse erişilebilirlik geri alınır ve tek iz bırakılır", async () => {
  const test1 = probeHarness();
  test1.control.result = { reachable: true, recovered: true };

  await test1.run();

  assert.deepEqual(test1.probes, ["0xaaaa"]);
  // Yoklamada "attempt" izi yok; yalnız gerçekten değişen sonuç yazılır.
  assert.deepEqual(test1.outcomes, [["0xaaaa", "ok"]]);
  assert.deepEqual(test1.failures, []);
  assert.equal(test1.states.get("0xaaaa")?.probeFailures, undefined);
  assert.equal(test1.states.get("0xaaaa")?.probeNextAt, undefined);
});

test("yanıt gelse de bir şey değişmediyse olay akışına yazılmaz", async () => {
  const test1 = probeHarness();
  test1.control.result = { reachable: true };

  await test1.run();

  assert.deepEqual(test1.probes, ["0xaaaa"]);
  assert.deepEqual(test1.outcomes, []);
});

test("yoklamadan sonra yapılandırma çalıştıysa iz bırakılır", async () => {
  const test1 = probeHarness();
  test1.control.result = { reachable: true, configured: true };

  await test1.run();

  assert.deepEqual(test1.outcomes, [["0xaaaa", "ok"]]);
  assert.equal(typeof test1.states.get("0xaaaa")?.lastConfiguredAt, "number");
});

test("yanıtsız yoklamada geri çekilme katlanır, olay akışı kirlenmez", async () => {
  const test1 = probeHarness();
  test1.control.result = { reachable: false, message: "cihaz yanıt vermedi" };

  const delays: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    await test1.run();
    const state = test1.states.get("0xaaaa");
    delays.push((state?.probeNextAt ?? 0) - test1.now());
    // Geri çekilme dolmadan ikinci deneme yapılmaz.
    await test1.run();
    test1.advance(delays[index] ?? 0);
  }

  assert.deepEqual(test1.probes.length, 4);
  assert.deepEqual(delays, selfHealProbeBackoffMs.slice(0, 4));
  assert.deepEqual(test1.outcomes, []);
  assert.equal(test1.failures.length, 4);
});

test("beş ardışık yanıtsızlıktan sonra cihaz günde bir yoklanır", async () => {
  const test1 = probeHarness();
  test1.control.result = { reachable: false, message: "cihaz yanıt vermedi" };

  for (let index = 0; index < selfHealProbeUnreachableAfter + 2; index += 1) {
    await test1.run();
    const state = test1.states.get("0xaaaa");
    test1.advance((state?.probeNextAt ?? test1.now()) - test1.now());
  }

  const state = test1.states.get("0xaaaa");
  assert.equal(state?.probeFailures, selfHealProbeUnreachableAfter + 2);
  assert.equal(typeof state?.probeUnreachableAt, "number");
  assert.equal(selfHealProbeDelayMs(state?.probeFailures ?? 0), selfHealProbeDailyMs);
  // Kalıcı ulaşılamaz durumu olay akışına yalnız bir kez düşer.
  assert.deepEqual(test1.outcomes, [["0xaaaa", "failed"]]);
  assert.equal(test1.failures.length, selfHealProbeUnreachableAfter + 2);
});

test("yoklanamayan cihaz için deneme sayılmaz", async () => {
  const test1 = probeHarness();
  test1.control.eligible = false;

  await test1.run();

  assert.deepEqual(test1.probes, []);
  assert.deepEqual(test1.outcomes, []);
  assert.equal(test1.states.size, 0);
});

test("yasak durumda ve yoklama kapalıyken hiç yoklanmaz", async () => {
  const blocked = probeHarness({ blocked: "Eşleştirme açık." });
  blocked.control.result = { reachable: true, recovered: true };
  await blocked.run();
  assert.deepEqual(blocked.probes, []);
  assert.equal(blocked.states.size, 0);

  const off = probeHarness({ probeEnabled: false });
  off.control.result = { reachable: true, recovered: true };
  await off.run();
  assert.deepEqual(off.probes, []);

  off.scheduler.setProbeEnabled(true);
  await off.run();
  assert.deepEqual(off.probes, ["0xaaaa"]);

  // Otomatik onarımın tümü kapalıysa yoklama da durur.
  off.scheduler.setEnabled(false);
  off.scheduler.setProbeEnabled(true);
  await off.run();
  assert.deepEqual(off.probes, ["0xaaaa"]);
});

test("yoklama kararı Faz 1 kısıtlarını devralır", () => {
  const now = 10_000_000;
  assert.equal(selfHealProbeDecision(undefined, now), "run");
  assert.equal(selfHealProbeDecision({ attempts: [], probeNextAt: now + 1 }, now), "probe_backoff");
  assert.equal(selfHealProbeDecision({ attempts: [], probeNextAt: now }, now), "run");
  assert.equal(selfHealProbeDecision({ attempts: [], backoffUntil: now + 10 }, now), "backoff");
  assert.equal(selfHealProbeDecision({ attempts: [now - 3, now - 2, now - 1] }, now), "hourly_limit");
  assert.equal(selfHealProbeDelayMs(1), 15 * 60_000);
  assert.equal(selfHealProbeDelayMs(selfHealProbeUnreachableAfter), selfHealProbeDailyMs);
});

test("kalıcı durum doğrulanarak okunur ve atomik yazılır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SelfHealStateStore(join(directory, "self-heal-state.json"));

  assert.equal((await store.get()).size, 0);

  await store.save(new Map([["0xaaaa", { attempts: [5], lastConfiguredAt: 7 }]]));
  const reloaded = await store.get();

  assert.deepEqual(reloaded.get("0xaaaa"), { attempts: [5], lastConfiguredAt: 7 });
  assert.match(await readFile(join(directory, "self-heal-state.json"), "utf8"), /0xaaaa/);

  await store.save(new Map([["0xbbbb", { attempts: [], probeFailures: 5, probeNextAt: 9, probeUnreachableAt: 8 }]]));
  assert.deepEqual((await store.get()).get("0xbbbb"), {
    attempts: [],
    probeFailures: 5,
    probeNextAt: 9,
    probeUnreachableAt: 8
  });

  assert.equal(validateSelfHealState({ "0xbbbb": { attempts: "hayır" } }).get("0xbbbb")?.attempts.length, 0);
  assert.equal(validateSelfHealState({ "0xbbbb": { attempts: [], probeFailures: "çok" } }).get("0xbbbb")?.probeFailures, undefined);
  assert.equal(validateSelfHealState({ "boşluk lu": { attempts: [] } }).size, 0);
  assert.equal(validateSelfHealState(["dizi"]).size, 0);
});
