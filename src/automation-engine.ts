import type { Automation, AutomationsStore } from "./automations.js";
import type { JsonObject } from "./types.js";

/** Tur aralığı: dakika kilidi sayesinde aynı dakikada yalnızca bir kez çalışır. */
export const automationTickIntervalMs = 20_000;
/** §8.2 — düğme gürültüsüne karşı otomasyon başına asgari aralık. */
export const automationMinimumRunGapMs = 2_000;

export type AutomationRunResult = "ok" | "failed" | "busy" | "missing";

export interface AutomationEngineSource {
  setDevice(id: string, command: JsonObject): Promise<void>;
}

export interface AutomationEngineOptions {
  store: AutomationsStore;
  source: AutomationEngineSource;
  /** Testler gerçek zamanı beklemesin diye saat enjekte edilebilir. */
  now?: () => Date;
  intervalMs?: number;
  logger?: { error(message: string): void };
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** Yerel dakika damgası — "YYYY-MM-DD HH:MM". */
export const localMinuteStamp = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** 1 = Pazartesi … 7 = Pazar. */
export const isoWeekday = (date: Date): number => date.getDay() === 0 ? 7 : date.getDay();

export const automationDueAt = (automation: Automation, date: Date): boolean => {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const weekday = isoWeekday(date);
  return automation.triggers.some((trigger) =>
    trigger.type === "time" && trigger.at === time && trigger.days.includes(weekday));
};

export class AutomationEngine {
  private timer: NodeJS.Timeout | null = null;
  private readonly firedMinutes = new Map<string, string>();
  private readonly running = new Set<string>();
  private readonly lastStartedAt = new Map<string, number>();
  private readonly now: () => Date;
  private readonly logger: { error(message: string): void };

  constructor(private readonly options: AutomationEngineOptions) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? { error: (message) => console.error(message) };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs ?? automationTickIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Bir tur: zamanı gelen otomasyonları sırayla çalıştırır. Geçmiş dakikalar telafi edilmez. */
  async tick(): Promise<void> {
    let automations: Automation[];
    try {
      automations = await this.options.store.get();
    } catch (error) {
      this.logger.error(`Otomasyonlar okunamadı: ${String(error)}`);
      return;
    }
    const date = this.now();
    const stamp = localMinuteStamp(date);
    for (const automation of automations) {
      if (!automation.enabled) continue;
      if (this.firedMinutes.get(automation.id) === stamp) continue;
      if (!automationDueAt(automation, date)) continue;
      this.firedMinutes.set(automation.id, stamp);
      await this.execute(automation);
    }
  }

  /** Elle çalıştırma — motorun kullandığı yolun aynısı. */
  async run(id: string): Promise<AutomationRunResult> {
    const normalizedId = id.trim().toLowerCase();
    let automations: Automation[];
    try {
      automations = await this.options.store.get();
    } catch (error) {
      this.logger.error(`Otomasyonlar okunamadı: ${String(error)}`);
      return "failed";
    }
    const automation = automations.find((entry) => entry.id === normalizedId);
    if (!automation) return "missing";
    return this.execute(automation);
  }

  private async execute(automation: Automation): Promise<AutomationRunResult> {
    if (this.running.has(automation.id)) return "busy";
    const startedAt = this.now().getTime();
    const previousStart = this.lastStartedAt.get(automation.id);
    if (previousStart !== undefined && startedAt - previousStart < automationMinimumRunGapMs) {
      return "busy";
    }
    this.running.add(automation.id);
    this.lastStartedAt.set(automation.id, startedAt);
    let ok = true;
    try {
      for (const action of automation.actions) {
        await this.options.source.setDevice(action.deviceId, { [action.property]: action.value });
      }
    } catch (error) {
      ok = false;
      this.logger.error(`Otomasyon "${automation.name}" çalıştırılamadı: ${String(error)}`);
    } finally {
      this.running.delete(automation.id);
    }
    try {
      await this.options.store.markRun(automation.id, ok, this.now());
    } catch (error) {
      this.logger.error(`Otomasyon son çalışma bilgisi yazılamadı: ${String(error)}`);
    }
    return ok ? "ok" : "failed";
  }
}
