import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Faz 1 — cihaz kendini ilan edince (`deviceAnnounce`) raporlama ayarlarını yeniden kurar.
 *
 * Tetikleyici bilinçli olarak yalnız ilandır: ilan, cihazın o an erişilebilir olduğunun
 * kanıtıdır. Erişilemeyen cihazı yoklamak (ve `interview(true)` çağırmak) koordinatörü
 * dakikalarca meşgul edip hiçbir şey onarmadığı için bu katman **asla** görüşme başlatmaz;
 * yalnız dönüştürücünün `configure` adımını çalıştırır.
 */

/** Başarılı yapılandırmadan sonra bu süre içindeki ilanlar yok sayılır (ilan fırtınası). */
export const selfHealSkipWindowMs = 60_000;
/** Kuyruktaki iki iş arasında bırakılan en küçük aralık. */
export const selfHealQueueSpacingMs = 5_000;
/** Cihaz başına saatlik deneme tavanı. */
export const selfHealHourlyLimit = 3;
/** Tavan aşılınca uygulanan geri çekilme süresi. */
export const selfHealBackoffMs = 6 * 60 * 60 * 1_000;
/** Deneme sayacının penceresi. */
export const selfHealWindowMs = 60 * 60 * 1_000;

export type SelfHealOutcome = "attempt" | "ok" | "failed";
export type SelfHealSkip = "recently_configured" | "backoff" | "hourly_limit";

export interface SelfHealDeviceState {
  /** Son başarılı yapılandırma (epoch ms). */
  lastConfiguredAt?: number;
  /** Son penceredeki deneme zamanları (epoch ms); sonuçtan bağımsız sayılır. */
  attempts: number[];
  /** Bu ana kadar yeni deneme yapılmaz (epoch ms). */
  backoffUntil?: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const validateSelfHealState = (value: unknown): Map<string, SelfHealDeviceState> => {
  const result = new Map<string, SelfHealDeviceState>();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return result;
  for (const [deviceId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z0-9x:_-]{1,64}$/i.test(deviceId)) continue;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const candidate = entry as Partial<SelfHealDeviceState>;
    const attempts = Array.isArray(candidate.attempts)
      ? candidate.attempts.filter(isFiniteNumber).slice(-selfHealHourlyLimit * 4)
      : [];
    result.set(deviceId, {
      attempts,
      ...(isFiniteNumber(candidate.lastConfiguredAt) ? { lastConfiguredAt: candidate.lastConfiguredAt } : {}),
      ...(isFiniteNumber(candidate.backoffUntil) ? { backoffUntil: candidate.backoffUntil } : {})
    });
  }
  return result;
};

/** Bu cihaz için şimdi deneme yapılmalı mı? Yalnız cihazın kendi geçmişine bakar. */
export const selfHealDecision = (
  state: SelfHealDeviceState | undefined,
  now: number
): "run" | SelfHealSkip => {
  if (!state) return "run";
  if (
    isFiniteNumber(state.lastConfiguredAt)
    && now - state.lastConfiguredAt < selfHealSkipWindowMs
  ) {
    return "recently_configured";
  }
  if (isFiniteNumber(state.backoffUntil) && now < state.backoffUntil) return "backoff";
  const recent = state.attempts.filter((at) => now - at < selfHealWindowMs);
  return recent.length >= selfHealHourlyLimit ? "hourly_limit" : "run";
};

export class SelfHealStateStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async get(): Promise<Map<string, SelfHealDeviceState>> {
    try {
      return validateSelfHealState(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      console.warn(`Otomatik onarım durumu okunamadı: ${String(error)}`);
      return new Map();
    }
  }

  save(state: Map<string, SelfHealDeviceState>): Promise<void> {
    const snapshot = Object.fromEntries(
      [...state.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))
    );
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.tmp-${process.pid}`;
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    return this.writeQueue;
  }
}

export interface SelfHealSchedulerOptions {
  enabled: boolean;
  /**
   * Denemenin hiç yapılmaması gereken durumlarda Türkçe sebep döner (koordinatör hazır değil,
   * eşleştirme açık, OTA sürüyor, yedek geri yükleme bekliyor). Yoksa `null`.
   */
  blockedReason: (deviceId: string) => Promise<string | null> | string | null;
  /**
   * Yapılacak iş varsa onu çalıştıran işlevi döner, yoksa `null`. Hazırlık adımı yereldir:
   * koordinatöre hiç dokunmaz, bu yüzden iş yoksa deneme de sayılmaz.
   */
  prepare: (deviceId: string) => Promise<(() => Promise<void>) | null>;
  /** Olay akışına iz bırakır (`property: "self_heal"`). */
  onOutcome: (deviceId: string, outcome: SelfHealOutcome) => void;
  /** Başarısızlıkları hata günlüğüne yazar. */
  onFailure?: (deviceId: string, message: string) => void;
  initialState?: Map<string, SelfHealDeviceState>;
  persist?: (state: Map<string, SelfHealDeviceState>) => void;
  now?: () => number;
  spacingMs?: number;
  wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  timer.unref?.();
});

export class SelfHealScheduler {
  private readonly states: Map<string, SelfHealDeviceState>;
  private readonly queue: string[] = [];
  private enabled: boolean;
  private active: string | null = null;
  private running: Promise<void> | null = null;
  private lastRunAt = 0;
  private readonly now: () => number;
  private readonly spacingMs: number;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(private readonly options: SelfHealSchedulerOptions) {
    this.states = options.initialState ?? new Map();
    this.enabled = options.enabled;
    this.now = options.now ?? (() => Date.now());
    this.spacingMs = options.spacingMs ?? selfHealQueueSpacingMs;
    this.wait = options.wait ?? defaultWait;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.queue.length = 0;
  }

  /** Cihaz kendini ilan etti; sırayla ele alınmak üzere kuyruğa alınır. */
  schedule(deviceId: string): void {
    if (!this.enabled || !deviceId) return;
    if (this.active === deviceId || this.queue.includes(deviceId)) return;
    if (this.decide(deviceId) !== "run") return;
    this.queue.push(deviceId);
    this.kick();
  }

  /** Kararı verir ve tavanı aşan cihazı aynı anda geri çekilmeye alır. */
  private decide(deviceId: string): "run" | SelfHealSkip {
    const decision = selfHealDecision(this.states.get(deviceId), this.now());
    if (decision === "hourly_limit") this.enterBackoff(deviceId);
    return decision;
  }

  /** Testler için: kuyruk boşalana kadar bekler. */
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  private kick(): void {
    if (this.running) return;
    this.running = this.pump()
      .catch((error) => console.warn(`Otomatik onarım kuyruğu durdu: ${String(error)}`))
      .finally(() => {
        this.running = null;
      });
  }

  private async pump(): Promise<void> {
    while (this.queue.length > 0) {
      const deviceId = this.queue.shift();
      if (!deviceId) continue;
      if (!this.enabled) continue;
      const idle = this.spacingMs - (this.now() - this.lastRunAt);
      if (this.lastRunAt > 0 && idle > 0) await this.wait(idle);
      if (!this.enabled) continue;
      this.active = deviceId;
      try {
        await this.attempt(deviceId);
      } finally {
        this.active = null;
      }
    }
  }

  private async attempt(deviceId: string): Promise<void> {
    if (this.decide(deviceId) !== "run") return;
    let reason: string | null;
    try {
      reason = await this.options.blockedReason(deviceId);
    } catch (error) {
      reason = String(error);
    }
    if (reason) {
      console.info(`Otomatik onarım ertelendi (${deviceId}): ${reason}`);
      return;
    }
    let run: (() => Promise<void>) | null;
    try {
      run = await this.options.prepare(deviceId);
    } catch (error) {
      console.warn(`Otomatik onarım hazırlanamadı (${deviceId}): ${String(error)}`);
      return;
    }
    if (!run) return;
    this.markAttempt(deviceId);
    this.options.onOutcome(deviceId, "attempt");
    try {
      await run();
      const state = this.stateFor(deviceId);
      state.lastConfiguredAt = this.now();
      this.options.persist?.(this.states);
      this.options.onOutcome(deviceId, "ok");
      console.log(`Cihaz kendini ilan etti, raporlama ayarları yenilendi (${deviceId}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onOutcome(deviceId, "failed");
      this.options.onFailure?.(deviceId, message);
      console.warn(`Otomatik onarım başarısız (${deviceId}): ${message}`);
    } finally {
      this.lastRunAt = this.now();
    }
  }

  private stateFor(deviceId: string): SelfHealDeviceState {
    const existing = this.states.get(deviceId);
    if (existing) return existing;
    const created: SelfHealDeviceState = { attempts: [] };
    this.states.set(deviceId, created);
    return created;
  }

  private markAttempt(deviceId: string): void {
    const now = this.now();
    const state = this.stateFor(deviceId);
    state.attempts = [...state.attempts.filter((at) => now - at < selfHealWindowMs), now];
    this.lastRunAt = now;
    this.options.persist?.(this.states);
  }

  private enterBackoff(deviceId: string): void {
    const state = this.stateFor(deviceId);
    const until = this.now() + selfHealBackoffMs;
    if (state.backoffUntil === until) return;
    state.backoffUntil = until;
    this.options.persist?.(this.states);
    console.info(
      `Otomatik onarım saatlik tavana ulaştı, ${selfHealBackoffMs / 3_600_000} saat beklenecek (${deviceId}).`
    );
  }
}
