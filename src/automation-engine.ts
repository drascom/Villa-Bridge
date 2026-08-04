import type {
  Automation,
  AutomationAction,
  AutomationAutoOffEntry,
  AutomationAutoOffStore,
  AutomationDeviceStateTrigger,
  AutomationsStore
} from "./automations.js";
import type { JsonObject, JsonScalar } from "./types.js";

/** Tur aralığı: dakika kilidi sayesinde aynı dakikada yalnızca bir kez çalışır. */
export const automationTickIntervalMs = 20_000;
/**
 * §8.2 — düğme gürültüsüne karşı otomasyon başına asgari aralık. Yalnızca **aynı çözümlenmiş
 * eylem kümesinin** tekrarını bastırır; ON'dan sonra gelen OFF gürültü değil kullanıcı niyetidir.
 */
export const automationMinimumRunGapMs = 2_000;
/**
 * Tek bir eylemin bekleyebileceği azami süre. Çevrimdışı bir cihaz komutu dakikalarca askıda
 * kalabiliyor ve kuralın tamamını kilitliyordu; süre dolunca eylem hata sayılır, kural serbest kalır.
 */
export const automationActionTimeoutMs = 10_000;
/**
 * Yeniden başlatmada "hareket bitince kapat" beklemede yakalanmışsa hareketin bittiği haberini
 * kimse bizim yerimize saklamıyor. Işık sonsuza kadar açık kalmasın diye bu kadar sonra kapatılır;
 * bu sırada gelen yeni hareket sayacı yine sıfırlar.
 */
export const automationAutoOffRestartGraceMs = 60_000;

/** `skipped`: kural eşleşti ama `when` yüzünden çalışacak eylem kalmadı — hata değildir. */
export type AutomationRunResult = "ok" | "failed" | "busy" | "missing" | "skipped";

export interface AutomationEngineSource {
  setDevice(id: string, command: JsonObject): Promise<void>;
}

/** Testler gerçek `setTimeout` beklemesin diye zamanlayıcı da enjekte edilebilir. */
export interface AutomationTimers {
  set(handler: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const systemTimers: AutomationTimers = {
  set: (handler, ms) => {
    const timer = setTimeout(handler, ms);
    timer.unref?.();
    return timer;
  },
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout)
};

export interface AutomationEngineOptions {
  store: AutomationsStore;
  source: AutomationEngineSource;
  /** Testler gerçek zamanı beklemesin diye saat enjekte edilebilir. */
  now?: () => Date;
  intervalMs?: number;
  /** Tek eylem için azami bekleme; 0 verilirse zaman aşımı uygulanmaz. */
  actionTimeoutMs?: number;
  /** Bekleyen "sonra kapat" kayıtları; verilmezse yeniden başlatmada telafi edilmez. */
  autoOffStore?: AutomationAutoOffStore;
  timers?: AutomationTimers;
  logger?: { error(message: string): void; info?(message: string): void };
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

/**
 * `DeviceStore`'un olay akışından gelen tek olay. `action` anlık bir kenar olayıdır;
 * son-değer karşılaştırmasıyla değil, olay olarak ele alınır (§5.2).
 */
export interface AutomationDeviceEvent {
  /** IEEE adresi. */
  deviceId: string;
  property: string;
  value: JsonScalar;
}

/** Bir olay bu otomasyonu tetikliyor mu? `deviceState` kenar kontrolü çağırana aittir. */
export const automationMatchesEvent = (
  automation: Automation,
  event: AutomationDeviceEvent
): boolean => automation.triggers.some((trigger) => {
  if (trigger.type === "deviceAction") {
    return event.property === "action"
      && trigger.deviceId === event.deviceId
      && trigger.action === event.value;
  }
  if (trigger.type === "deviceState") {
    // `equals` yoksa özelliğin her değişimi tetikler; kenar kontrolü çağırana aittir.
    return trigger.deviceId === event.deviceId
      && trigger.property === event.property
      && (trigger.equals === undefined || trigger.equals === event.value);
  }
  return false;
});

/**
 * §5.4 — `when` taşımayan eylem her zaman çalışır (geriye uyumluluk). `when` taşıyan eylem
 * yalnızca tetikleyen olayın değeri eşleşince çalışır; olay yoksa (zaman tetikleyicisi ya da
 * elle çalıştırma) eşleşecek değer de yoktur, eylem atlanır.
 */
export const automationActionApplies = (
  action: AutomationAction,
  event?: AutomationDeviceEvent
): boolean => {
  if (!action.when) return true;
  return event !== undefined && action.when.equals === event.value;
};

/** Aynı eylem kümesinin tekrarını tanımak için kararlı imza. */
export const automationActionSignature = (actions: AutomationAction[]): string =>
  JSON.stringify(actions.map((action) => [action.deviceId, action.property, action.value]));

/** Çalışan iş bitince çalıştırılmak üzere bekletilen (birleştirilen) son istek. */
interface PendingRun {
  actions: AutomationAction[];
  signature: string;
  /** Tetikleyen olay — "hareket bitince kapat" izlemesi buradan kurulur. */
  event?: AutomationDeviceEvent;
}

/** Bekleyen bir "sonra kapat"; zamanlayıcı tutamacı kalıcı değildir. */
interface PendingAutoOff extends Omit<AutomationAutoOffEntry, "dueAt"> {
  /** Sayaç işliyorsa bitiş anı (ms); `idle` hareket beklerken null. */
  dueAt: number | null;
  handle: unknown;
}

export class AutomationEngine {
  private timer: NodeJS.Timeout | null = null;
  private readonly firedMinutes = new Map<string, string>();
  private readonly running = new Set<string>();
  private readonly lastStartedAt = new Map<string, number>();
  /** Otomasyon başına en son çalıştırılan eylem kümesinin imzası. */
  private readonly lastSignatures = new Map<string, string>();
  /** Otomasyon başına bekleyen son istek — kilit doluyken düşürmek yerine birleştiririz. */
  private readonly pending = new Map<string, PendingRun>();
  /** `deviceId|property` → son görülen değer; `deviceState` kenar tetiklemesi için. */
  private readonly lastStateValues = new Map<string, JsonScalar>();
  /** `automationId|deviceId|property` → bekleyen "sonra kapat"; otomasyon+kanal başına tekil. */
  private readonly autoOff = new Map<string, PendingAutoOff>();
  /** Durum dosyası yazımları sıraya girer; son yazan kazansın diye zincirlenir. */
  private autoOffWrite: Promise<void> = Promise.resolve();
  private readonly timers: AutomationTimers;
  private readonly now: () => Date;
  private readonly logger: { error(message: string): void; info?(message: string): void };

  constructor(private readonly options: AutomationEngineOptions) {
    this.now = options.now ?? (() => new Date());
    this.timers = options.timers ?? systemTimers;
    this.logger = options.logger ?? { error: (message) => console.error(message) };
  }

  /** Teşhis kaydı: düşürülen/bastırılan çalıştırmalar iz bırakmalı, ama hata sayılmamalı. */
  private note(message: string): void {
    if (this.logger.info) this.logger.info(message);
    else console.info(message);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs ?? automationTickIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    // Bekleyen kapatmalar durum dosyasında duruyor; süreç dönünce oradan devam eder.
    for (const pending of this.autoOff.values()) this.clearAutoOffTimer(pending);
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

  /**
   * `DeviceStore`'un olay geri çağrımına takılır — poll yok (§6).
   * `action` her seferinde tetikler (kullanıcı iki kez basarsa iki kez çalışır); diğer özellikler
   * yalnızca değer değiştiğinde, yani kenarda tetikler (§5.2). Gürültü koruması `execute`'taki
   * otomasyon başına 2 saniyelik aralıktır (§8.2).
   */
  async handleDeviceEvents(events: AutomationDeviceEvent[]): Promise<void> {
    const edges = events.filter((event) => this.isEdge(event));
    if (edges.length === 0) return;
    let automations: Automation[];
    try {
      automations = await this.options.store.get();
    } catch (error) {
      this.logger.error(`Otomasyonlar okunamadı: ${String(error)}`);
      return;
    }
    for (const event of edges) {
      // Bekleyen kapatmalar önce bakar: elle müdahale iptal eder, yeni hareket sayacı sıfırlar.
      this.observeAutoOff(event);
      for (const automation of automations) {
        if (!automation.enabled) continue;
        if (!automationMatchesEvent(automation, event)) continue;
        await this.execute(automation, event);
      }
    }
  }

  /** §9 — bekleyen kapatmanın kanonik anahtarı: otomasyon + IEEE adresi + kanal. */
  private autoOffKey(automationId: string, deviceId: string, property: string): string {
    return `${automationId}|${deviceId}|${property}`;
  }

  private clearAutoOffTimer(pending: PendingAutoOff): void {
    if (pending.handle === null || pending.handle === undefined) return;
    this.timers.clear(pending.handle);
    pending.handle = null;
  }

  private scheduleAutoOff(key: string, pending: PendingAutoOff, delayMs: number): void {
    this.clearAutoOffTimer(pending);
    const delay = Math.max(delayMs, 0);
    pending.dueAt = this.now().getTime() + delay;
    pending.handle = this.timers.set(() => {
      void this.fireAutoOff(key);
    }, delay);
  }

  private cancelAutoOff(key: string, reason: string): void {
    const pending = this.autoOff.get(key);
    if (!pending) return;
    this.clearAutoOffTimer(pending);
    this.autoOff.delete(key);
    this.note(`Otomasyon "${pending.automationName}" otomatik kapatması iptal edildi: ${reason}.`);
    this.persistAutoOff();
  }

  /**
   * "Hareket bitince" ölçütü kuralın kendi tetikleyicisinden gelir: tetikleyen değerden çıkış.
   * Cihaz adı ya da modeli tahmin edilmez; doğrulama zaten `equals` taşıyan bir durum
   * tetikleyicisi olmasını şart koşar.
   */
  private autoOffWatch(
    automation: Automation,
    event?: AutomationDeviceEvent
  ): AutomationAutoOffEntry["watch"] {
    const states = automation.triggers.filter((trigger): trigger is AutomationDeviceStateTrigger =>
      trigger.type === "deviceState" && trigger.equals !== undefined);
    const matched = event
      ? states.find((trigger) =>
        trigger.deviceId === event.deviceId && trigger.property === event.property)
      : undefined;
    const trigger = matched ?? states[0];
    if (!trigger || trigger.equals === undefined) return null;
    return { deviceId: trigger.deviceId, property: trigger.property, activeValue: trigger.equals };
  }

  /** Eylem çalıştıktan sonra kapatma sözünü kurar; aynı otomasyon+kanalda sayaç sıfırlanır. */
  private armAutoOff(
    automation: Automation,
    action: AutomationAction,
    event?: AutomationDeviceEvent
  ): void {
    const key = this.autoOffKey(automation.id, action.deviceId, action.property);
    const existing = this.autoOff.get(key);
    if (existing) this.clearAutoOffTimer(existing);
    if (!action.autoOff) {
      // Aynı kanala kapatmasız yeni bir komut geldiyse eski söz düşer.
      if (existing) this.autoOff.delete(key);
      if (existing) this.persistAutoOff();
      return;
    }
    const watch = action.autoOff.mode === "idle" ? this.autoOffWatch(automation, event) : null;
    if (action.autoOff.mode === "idle" && !watch) {
      this.autoOff.delete(key);
      this.logger.error(
        `Otomasyon "${automation.name}" otomatik kapatması kurulamadı: izlenecek tetikleyici yok.`
      );
      this.persistAutoOff();
      return;
    }
    const pending: PendingAutoOff = {
      automationId: automation.id,
      automationName: automation.name,
      deviceId: action.deviceId,
      property: action.property,
      value: action.autoOff.value,
      appliedValue: action.value,
      mode: action.autoOff.mode,
      seconds: action.autoOff.seconds,
      dueAt: null,
      watch,
      handle: null
    };
    this.autoOff.set(key, pending);
    // `after` hemen saymaya başlar; `idle` hareket bitene kadar sayaç açmaz.
    if (pending.mode === "after") this.scheduleAutoOff(key, pending, pending.seconds * 1000);
    this.persistAutoOff();
  }

  /**
   * Olay akışının bekleyen kapatmalara etkisi:
   * 1. Hedefin durumu bizim yazdığımız değerden çıktıysa — panel, Alexa, Apple Home ya da duvar
   *    anahtarı fark etmez — niyet kullanıcınındır, otomatik kapatma iptal olur.
   * 2. İzlenen tetikleyici yine tetikleyen değeri bildiriyorsa sayaç sıfırlanır.
   * 3. Tetikleyen değerden çıktıysa (hareket bitti) ek bekleme sayacı başlar.
   */
  private observeAutoOff(event: AutomationDeviceEvent): void {
    for (const [key, pending] of this.autoOff) {
      if (
        pending.deviceId === event.deviceId
        && pending.property === event.property
        && event.value !== pending.appliedValue
      ) {
        this.cancelAutoOff(key, "hedefin durumu dışarıdan değiştirildi");
        continue;
      }
      const watch = pending.watch;
      if (!watch || watch.deviceId !== event.deviceId || watch.property !== event.property) continue;
      if (event.value === watch.activeValue) {
        if (pending.dueAt === null) continue;
        this.clearAutoOffTimer(pending);
        pending.dueAt = null;
        this.note(
          `Otomasyon "${pending.automationName}" otomatik kapatma sayacı sıfırlandı: hareket sürüyor.`
        );
        this.persistAutoOff();
        continue;
      }
      if (pending.dueAt !== null) continue;
      this.scheduleAutoOff(key, pending, pending.seconds * 1000);
      this.persistAutoOff();
    }
  }

  private async fireAutoOff(key: string): Promise<void> {
    const pending = this.autoOff.get(key);
    if (!pending) return;
    this.clearAutoOffTimer(pending);
    this.autoOff.delete(key);
    this.persistAutoOff();
    try {
      await this.setDevice(pending.deviceId, { [pending.property]: pending.value });
      this.note(`Otomasyon "${pending.automationName}" hedefi otomatik olarak geri aldı.`);
    } catch (error) {
      this.logger.error(
        `Otomasyon "${pending.automationName}" otomatik kapatması uygulanamadı: ${String(error)}`
      );
    }
  }

  private autoOffEntries(): AutomationAutoOffEntry[] {
    return [...this.autoOff.values()].map((pending) => ({
      automationId: pending.automationId,
      automationName: pending.automationName,
      deviceId: pending.deviceId,
      property: pending.property,
      value: pending.value,
      appliedValue: pending.appliedValue,
      mode: pending.mode,
      seconds: pending.seconds,
      dueAt: pending.dueAt === null ? null : new Date(pending.dueAt).toISOString(),
      watch: pending.watch
    }));
  }

  private persistAutoOff(): void {
    const store = this.options.autoOffStore;
    if (!store) return;
    const entries = this.autoOffEntries();
    this.autoOffWrite = this.autoOffWrite
      .then(() => store.save(entries))
      .catch((error) => {
        this.logger.error(`Bekleyen otomatik kapatmalar kaydedilemedi: ${String(error)}`);
      });
  }

  /**
   * Yeniden başlatma: bekleyen kapatmalar düşmez. Süresi geçmişse hemen uygulanır, geçmemişse
   * kalan süreyle devam eder. Hareket bitişini bekleyen kayıtlarda ise kimse bizim yerimize
   * "hareket bitti" haberini saklamadığı için bir üst sınır kurulur — yeni hareket yine sıfırlar.
   */
  async restoreAutoOff(): Promise<void> {
    const store = this.options.autoOffStore;
    if (!store) return;
    let entries: AutomationAutoOffEntry[];
    try {
      entries = await store.get();
    } catch (error) {
      this.logger.error(`Bekleyen otomatik kapatmalar okunamadı: ${String(error)}`);
      return;
    }
    if (entries.length === 0) return;
    const now = this.now().getTime();
    for (const entry of entries) {
      const key = this.autoOffKey(entry.automationId, entry.deviceId, entry.property);
      const pending: PendingAutoOff = { ...entry, dueAt: null, handle: null };
      this.autoOff.set(key, pending);
      const due = entry.dueAt === null ? null : Date.parse(entry.dueAt);
      const delay = due !== null && Number.isFinite(due)
        ? due - now
        : Math.max(entry.seconds * 1000, automationAutoOffRestartGraceMs);
      this.scheduleAutoOff(key, pending, delay);
    }
    this.note(`Bekleyen otomatik kapatma sürdürüldü: ${entries.length} adet.`);
    this.persistAutoOff();
  }

  /** `action` anlık kenar olayıdır, hiç bastırılmaz; durum özellikleri değer değişince geçer. */
  private isEdge(event: AutomationDeviceEvent): boolean {
    // Çok kanallı cihazlarda tuş olayı `action_l1` gibi kanal ekiyle de gelebilir.
    if (event.property === "action" || event.property.startsWith("action_")) return true;
    const key = `${event.deviceId}|${event.property}`;
    if (this.lastStateValues.get(key) === event.value) return false;
    this.lastStateValues.set(key, event.value);
    return true;
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

  private async execute(
    automation: Automation,
    event?: AutomationDeviceEvent
  ): Promise<AutomationRunResult> {
    const actions = automation.actions.filter((action) => automationActionApplies(action, event));
    // Hiçbir eylem eşleşmediyse çalıştırma sayılmaz: ne kilit alınır ne de `lastRunOk` bozulur.
    if (actions.length === 0) {
      this.note(`Otomasyon "${automation.name}" atlandı: koşullara uyan eylem yok.`);
      return "skipped";
    }
    const signature = automationActionSignature(actions);
    // Kilit doluyken düşürmek yerine birleştir: çalışan iş bitince bu istek çalışır.
    if (this.running.has(automation.id)) {
      this.pending.set(automation.id, { actions, signature, event });
      this.note(`Otomasyon "${automation.name}" meşgul: son istek sıraya alındı (birleştirildi).`);
      return "busy";
    }
    if (this.suppressedAsRepeat(automation, signature)) return "busy";
    return this.runQueue(automation, { actions, signature, event });
  }

  /** Asgari aralık yalnızca aynı eylem kümesinin tekrarını bastırır — ters yön niyettir. */
  private suppressedAsRepeat(automation: Automation, signature: string): boolean {
    const previousStart = this.lastStartedAt.get(automation.id);
    if (previousStart === undefined) return false;
    if (this.lastSignatures.get(automation.id) !== signature) return false;
    if (this.now().getTime() - previousStart >= automationMinimumRunGapMs) return false;
    this.note(
      `Otomasyon "${automation.name}" bastırıldı: aynı eylem `
      + `${automationMinimumRunGapMs} ms içinde tekrarlandı.`
    );
    return true;
  }

  /** Kilidi alır, isteği çalıştırır ve bu sırada birikmiş son isteği de boşaltır. */
  private async runQueue(automation: Automation, first: PendingRun): Promise<AutomationRunResult> {
    this.running.add(automation.id);
    let result: AutomationRunResult = "ok";
    try {
      let current: PendingRun | undefined = first;
      while (current) {
        result = await this.runOnce(automation, current);
        const next = this.pending.get(automation.id);
        this.pending.delete(automation.id);
        current = next && !this.suppressedAsRepeat(automation, next.signature) ? next : undefined;
      }
    } finally {
      this.running.delete(automation.id);
      this.pending.delete(automation.id);
    }
    return result;
  }

  private async runOnce(automation: Automation, run: PendingRun): Promise<AutomationRunResult> {
    this.lastStartedAt.set(automation.id, this.now().getTime());
    this.lastSignatures.set(automation.id, run.signature);
    let ok = true;
    try {
      for (const action of run.actions) {
        await this.setDevice(action.deviceId, { [action.property]: action.value });
        // Kapatma sözü ancak komut gerçekten gittiyse kurulur (§9).
        this.armAutoOff(automation, action, run.event);
      }
    } catch (error) {
      ok = false;
      this.logger.error(`Otomasyon "${automation.name}" çalıştırılamadı: ${String(error)}`);
    }
    try {
      await this.options.store.markRun(automation.id, ok, this.now());
    } catch (error) {
      this.logger.error(`Otomasyon son çalışma bilgisi yazılamadı: ${String(error)}`);
    }
    return ok ? "ok" : "failed";
  }

  /**
   * Yavaş ya da çevrimdışı bir cihaz kuralın tamamını kilitlemesin diye eylem başına zaman aşımı.
   * Komut iptal edilemez; yalnızca beklemeyi bırakırız.
   */
  private async setDevice(deviceId: string, command: JsonObject): Promise<void> {
    const timeoutMs = this.options.actionTimeoutMs ?? automationActionTimeoutMs;
    const call = this.options.source.setDevice(deviceId, command);
    if (timeoutMs <= 0) return call;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        call,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Cihaz ${timeoutMs} ms içinde yanıt vermedi.`)),
            timeoutMs
          );
          timer.unref?.();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
