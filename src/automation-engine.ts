import {
  isAutomationDeviceAction,
  isAutomationHeldStateTrigger,
  type Automation,
  type AutomationAction,
  type AutomationAutoOffEntry,
  type AutomationAutoOffStore,
  type AutomationCondition,
  type AutomationDeviceAction,
  type AutomationDeviceStateTrigger,
  type AutomationSunTrigger,
  type AutomationTimePoint,
  type AutomationTimeTrigger,
  type AutomationDeviceLookup,
  type AutomationsStore
} from "./automations.js";
import { normalizeControlValueOrRaw } from "./device-controls.js";
import type {
  AutomationRunActionResult,
  AutomationRunConditionResult,
  AutomationRunLog,
  AutomationRunRecord,
  AutomationRunTriggerInfo
} from "./automation-runs.js";
import type { HomeLocation } from "./location.js";
import { localNoon, sunTimes, type SunTimes } from "./sun.js";
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

/**
 * `skipped`: kural eşleşti ama `when` yüzünden çalışacak eylem kalmadı — hata değildir.
 * `blocked`: koşullar sağlanmadı; kural bilerek çalışmadı, sebebi çalışma günlüğünde.
 */
export type AutomationRunResult = "ok" | "failed" | "busy" | "missing" | "skipped" | "blocked";

export interface AutomationEngineSource {
  setDevice(id: string, command: JsonObject): Promise<void>;
  /** Grup eylemi için; kaynak desteklemiyorsa eylem hata olarak günlüğe düşer. */
  setGroup?(id: string, command: JsonObject): Promise<void>;
  /** Sahne eylemi için; aynı şekilde isteğe bağlıdır. */
  groupScene?(
    id: string,
    sceneId: number,
    action: "store" | "recall" | "remove",
    name?: string
  ): Promise<void>;
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
  /** Evin konumu — güneş tetikleyicisi için. Yoksa `sun` kuralları çalışmaz ve günlüğe düşer. */
  location?: () => HomeLocation | null;
  /** Koşulların okuduğu anlık cihaz durumu; verilmezse `deviceState` koşulu hep `false` olur. */
  deviceState?: (deviceId: string, property: string) => JsonScalar | undefined;
  /**
   * §4.1 — kanalın değeri ne zamandan beri aynı (`DeviceStore.stateSince`). Verilmezse
   * `forSeconds` taşıyan koşullar hep `false` olur; süresiz koşullar etkilenmez.
   */
  stateSince?: (deviceId: string, property: string) => Date | null;
  /** Çalışma günlüğü — "neden çalıştı / neden çalışmadı". */
  runLog?: Pick<AutomationRunLog, "append">;
  /**
   * Eylemin yazacağı değeri panelin geçtiği yoldan geçirmek için kumanda arayıcısı: renk
   * `#rrggbb`'den xy'ye çevrilir, sayısal değer `min`/`max`'a kırpılıp `step`'e yuvarlanır.
   * Verilmezse değer ham yazılır (eski davranış).
   */
  controls?: AutomationDeviceLookup;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** Yerel dakika damgası — "YYYY-MM-DD HH:MM". */
export const localMinuteStamp = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Yerel gün damgası — "YYYY-MM-DD". */
export const localDayStamp = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Yerel saat damgası — "HH:MM". */
export const localTimeStamp = (date: Date): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** 1 = Pazartesi … 7 = Pazar. */
export const isoWeekday = (date: Date): number => date.getDay() === 0 ? 7 : date.getDay();

const previousWeekday = (weekday: number): number => weekday === 1 ? 7 : weekday - 1;

/**
 * Güneş tetikleyicisinin yerel `HH:MM` karşılığı. Hesaplanan an mevcut saat yoluna böyle girer;
 * ayrı bir zamanlayıcı açılmaz ve `firedMinutes` dakika kilidi DST çift-ateşlemesini engeller.
 *
 * Kaydırma günü aşarsa (ör. gün doğumundan 4 saat önce, kutup dışı kışta) elde edilen `HH:MM`
 * yine o günün gün ölçütüyle karşılaştırılır — sınırdaki bu durum bilinçli olarak basit tutuldu.
 */
const sunMoment = (
  event: "sunrise" | "sunset",
  offsetMinutes: number,
  times: SunTimes | null
): Date | null => {
  const base = event === "sunrise" ? times?.sunrise : times?.sunset;
  if (!base) return null;
  return new Date(base.getTime() + offsetMinutes * 60_000);
};

export const automationSunTime = (
  trigger: AutomationSunTrigger,
  times: SunTimes | null
): string | null => {
  const moment = sunMoment(trigger.event, trigger.offsetMinutes, times);
  return moment ? localTimeStamp(moment) : null;
};

/** Gün içi dakika (0..1439) — sarma kontrolü dize değil, sayı karşılaştırmasıyla yapılır. */
const minutesOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/**
 * §2.3 — aralık ucunun gün içi dakikası. Güneş ucu konum yoksa ya da güneş o gün ufku kesmiyorsa
 * `null` döner; çağıran bunu koşulun `false` sebebine çevirir.
 */
export const automationTimePointMinutes = (
  point: AutomationTimePoint,
  times: SunTimes | null
): number | null => {
  if (point.kind === "clock") {
    const hour = Number(point.at.slice(0, 2));
    const minute = Number(point.at.slice(3, 5));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }
  const moment = sunMoment(point.event, point.offsetMinutes, times);
  return moment ? minutesOfDay(moment) : null;
};

/** Dakikadan "HH:MM" — günlükteki sebep metni güneş ucunu da okunur saatle yazsın diye. */
const minuteStampOf = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Zamanı gelen zaman/güneş tetikleyicisi — yoksa `null`. */
export const automationDueTrigger = (
  automation: Automation,
  date: Date,
  times: SunTimes | null = null
): AutomationTimeTrigger | AutomationSunTrigger | null => {
  const time = localTimeStamp(date);
  const weekday = isoWeekday(date);
  for (const trigger of automation.triggers) {
    if (trigger.type === "time") {
      if (trigger.at === time && trigger.days.includes(weekday)) return trigger;
      continue;
    }
    if (trigger.type !== "sun") continue;
    if (!trigger.days.includes(weekday)) continue;
    if (automationSunTime(trigger, times) === time) return trigger;
  }
  return null;
};

export const automationDueAt = (
  automation: Automation,
  date: Date,
  times: SunTimes | null = null
): boolean => automationDueTrigger(automation, date, times) !== null;

/** §4 — koşul değerlendirmesinin isteğe bağlı ayarları; sonraki adımlar bu nesneyi büyütür. */
export interface AutomationConditionOptions {
  /** §2.4 — `all` (varsayılan) hepsini, `any` en az birini arar. */
  mode?: "all" | "any";
  /** §2.3 — güneş uçlu aralıklar için o günün güneş saatleri; yoksa o koşul sağlanmaz. */
  times?: SunTimes | null;
  /**
   * §4.1 — kanalın şu anki değeri ne zamandan beri aynı (`DeviceStore` değişim defteri).
   * `null` "bilinmiyor" demektir; süre koşulu bunu kapalı tarafa yorumlar (§2.5).
   */
  stateSince?: (deviceId: string, property: string) => Date | null;
}

/**
 * §5.3 — koşullar varsayılan olarak **VE** ile değerlendirilir; `any` modunda en az biri yeter.
 * Sağlanmayan koşulun sebebi geri döner; çağıran bunu çalışma günlüğüne yazar (sessiz atlama yok).
 */
export const evaluateAutomationConditions = (
  conditions: AutomationCondition[],
  date: Date,
  readState: (deviceId: string, property: string) => JsonScalar | undefined,
  options: AutomationConditionOptions = {}
): { ok: boolean; results: AutomationRunConditionResult[] } => {
  const results: AutomationRunConditionResult[] = [];
  for (const condition of conditions) {
    if (condition.type === "timeRange") {
      const times = options.times ?? null;
      const from = automationTimePointMinutes(condition.from, times);
      const to = automationTimePointMinutes(condition.to, times);
      if (from === null || to === null) {
        // Güneş ucu hesaplanamıyor: kapalı tarafa düşülür ve sebebi günlükte durur.
        results.push({
          type: "timeRange",
          ok: false,
          reason: "Evin konumu ayarlı değil ya da güneş bugün ufku kesmiyor;"
            + " güneşe göre aralık hesaplanamadı."
        });
        continue;
      }
      const now = minutesOfDay(date);
      // Gece yarısını aşan aralık: 22:00→06:00 iki parçadan oluşur.
      const wraps = from > to;
      const inRange = wraps ? now >= from || now < to : now >= from && now < to;
      if (!inRange) {
        results.push({
          type: "timeRange",
          ok: false,
          reason: `Saat ${localTimeStamp(date)}, `
            + `${minuteStampOf(from)}-${minuteStampOf(to)} aralığının dışında.`
        });
        continue;
      }
      if (condition.days) {
        // Aralık geceyi aşıyorsa ve şu an sabah tarafındaysak, gün ölçütü dünü gösterir.
        const weekday = wraps && now < to
          ? previousWeekday(isoWeekday(date))
          : isoWeekday(date);
        if (!condition.days.includes(weekday)) {
          results.push({ type: "timeRange", ok: false, reason: "Aralığın günü tutmuyor." });
          continue;
        }
      }
      results.push({ type: "timeRange", ok: true });
      continue;
    }
    const value = readState(condition.deviceId, condition.property);
    if (value === undefined) {
      // Cihaz bilinmiyorsa ya da durum hiç bildirilmediyse koşul `false` sayılır.
      results.push({
        type: "deviceState",
        ok: false,
        reason: `${condition.deviceId} cihazının "${condition.property}" durumu bilinmiyor.`
      });
      continue;
    }
    // Önce değer ölçütü. Süre ölçütü (§2.1) bunun **üstüne** biner, yerine geçmez: değer
    // tutmuyorsa süreye hiç bakılmaz — "1 dakikadır hareket var" önce "hareket var" demektir.
    let ok: boolean;
    let reason: string | undefined;
    if (condition.above !== undefined || condition.below !== undefined) {
      // Koşulda semantik kenar değil, o anki değerdir: "şu an eşiğin üstünde/altında mı".
      const current = numericValue(value);
      if (current === null) {
        results.push({
          type: "deviceState",
          ok: false,
          reason: `${condition.deviceId} "${condition.property}" değeri sayısal değil: ${JSON.stringify(value)}.`
        });
        continue;
      }
      ok = (condition.above === undefined || current > condition.above)
        && (condition.below === undefined || current < condition.below);
      const limit = condition.above !== undefined && condition.below !== undefined
        ? `${condition.above}-${condition.below} aralığında değil`
        : condition.above !== undefined
          ? `${condition.above} üstünde değil`
          : `${condition.below} altında değil`;
      reason = ok
        ? undefined
        : `${condition.deviceId} "${condition.property}" değeri ${current}, ${limit}.`;
    } else {
      ok = condition.equals !== undefined
        ? value === condition.equals
        : value !== condition.not;
      reason = ok
        ? undefined
        : `${condition.deviceId} "${condition.property}" değeri ${JSON.stringify(value)}.`;
    }
    if (ok && condition.forSeconds !== undefined) {
      const since = options.stateSince?.(condition.deviceId, condition.property) ?? null;
      if (since === null) {
        // §2.5 — defter bellektedir. Bilgi yoksa kapalı tarafa düşülür ve sebebi açıkça yazılır;
        // sessiz `false` olmazsa kullanıcı yeniden başlatma penceresini günlükten görebilir.
        ok = false;
        reason = `${condition.deviceId} "${condition.property}" ne zamandır bu durumda`
          + ` bilinmiyor (yeniden başlatmadan beri kayıt yok),`
          + ` ${condition.forSeconds} saniye gerekiyor.`;
      } else {
        const elapsed = Math.floor((date.getTime() - since.getTime()) / 1_000);
        ok = elapsed >= condition.forSeconds;
        reason = ok
          ? undefined
          : `${condition.deviceId} "${condition.property}" ${elapsed} saniyedir bu durumda,`
            + ` ${condition.forSeconds} saniye gerekiyor.`;
      }
    }
    results.push({ type: "deviceState", ok, reason });
  }
  // `any` modunda da **tüm** koşullar değerlendirilip döner: günlükte hangisinin tuttuğu görünsün.
  // Koşul listesi boşsa kural koşulsuzdur; iki modda da geçer (`some` boş listede false döner).
  if (results.length === 0) return { ok: true, results };
  return {
    ok: options.mode === "any"
      ? results.some((result) => result.ok)
      : results.every((result) => result.ok),
    results
  };
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

/** Eşik karşılaştırması yalnız sayı üzerinde yapılır; "26.5" gibi metinler de kabul edilir. */
const numericValue = (value: JsonScalar | undefined): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const thresholdSatisfied = (trigger: AutomationDeviceStateTrigger, value: number): boolean => {
  if (trigger.above !== undefined && !(value > trigger.above)) return false;
  if (trigger.below !== undefined && !(value < trigger.below)) return false;
  return true;
};

/**
 * §2.1 — süreli tetikleyicinin hedefi şu an tutuluyor mu. Doğrulama `equals` ya da sayısal eşikten
 * birini şart koştuğu için üçüncü bir dal yoktur; hedefsiz süreli tetikleyici hiç kaydedilemez.
 */
export const automationHeldTriggerHolds = (
  trigger: AutomationDeviceStateTrigger,
  value: JsonScalar | undefined
): boolean => {
  if (value === undefined) return false;
  if (trigger.equals !== undefined) return value === trigger.equals;
  const current = numericValue(value);
  return current !== null && thresholdSatisfied(trigger, current);
};

/**
 * Eşleşmedi ise **neden** eşleşmediği: sayısal olmayan değer ya da karşılaştırılacak önceki
 * değerin olmaması sessizce yutulmaz, çalışma günlüğüne düşer.
 */
export type AutomationEventMatch =
  | { matched: true }
  | { matched: false; reason?: "nonNumericValue" | "noPreviousValue"; detail?: string };

const noMatch: AutomationEventMatch = { matched: false };

/**
 * Bir olay bu otomasyonu tetikliyor mu?
 * - `equals`/eşitliksiz durum tetikleyicisinde kenar kontrolü çağırana aittir (değer değişimi).
 * - Sayısal eşikte kenar **burada** aranır: değer eşiğin öbür tarafından bu tarafa geçmiş olmalı.
 *   26,1 → 26,2 → 26,3 akışında yalnız ilk geçiş tetikler.
 */
export const automationEventMatch = (
  automation: Automation,
  event: AutomationDeviceEvent,
  previous?: JsonScalar
): AutomationEventMatch => {
  let fallback: AutomationEventMatch = noMatch;
  for (const trigger of automation.triggers) {
    if (trigger.type === "deviceAction") {
      if (
        event.property === "action"
        && trigger.deviceId === event.deviceId
        && trigger.action === event.value
      ) return { matched: true };
      continue;
    }
    if (trigger.type !== "deviceState") continue;
    // §2.1 — süreli tetikleyici olay akışını dinlemez: kenar değil, turdaki süre ölçer ateşler.
    // (Tür koruyucusu burada `trigger`'ı `never`'a daraltacağı için alan doğrudan okunuyor.)
    if (trigger.forSeconds !== undefined) continue;
    if (trigger.deviceId !== event.deviceId || trigger.property !== event.property) continue;
    if (trigger.above === undefined && trigger.below === undefined) {
      if (trigger.equals === undefined || trigger.equals === event.value) return { matched: true };
      continue;
    }
    const current = numericValue(event.value);
    if (current === null) {
      fallback = {
        matched: false,
        reason: "nonNumericValue",
        detail: `"${trigger.property}" değeri sayı değil: ${JSON.stringify(event.value)}`
      };
      continue;
    }
    if (!thresholdSatisfied(trigger, current)) continue;
    const before = numericValue(previous);
    if (before === null) {
      // Karşılaştıracak önceki değer yok (ilk okuma ya da yeniden başlatma): bu okuma taban
      // sayılır. Aksi halde her yeniden başlatmada eşik üstündeki tüm sensörler ateşlerdi.
      fallback = {
        matched: false,
        reason: "noPreviousValue",
        detail: `"${trigger.property}" için önceki değer yok; bu okuma taban alındı.`
      };
      continue;
    }
    if (thresholdSatisfied(trigger, before)) continue;
    return { matched: true };
  }
  return fallback;
};

export const automationMatchesEvent = (
  automation: Automation,
  event: AutomationDeviceEvent,
  previous?: JsonScalar
): boolean => automationEventMatch(automation, event, previous).matched;

/**
 * §5.4 — `when` taşımayan eylem her zaman çalışır (geriye uyumluluk). `when` taşıyan eylem
 * yalnızca tetikleyen olayın değeri eşleşince çalışır; olay yoksa (zaman tetikleyicisi ya da
 * elle çalıştırma) eşleşecek değer de yoktur, eylem atlanır.
 *
 * §9.1 — cihaz olayı olmayan tek istisna `sun`: eşleşme değeri olay adıdır ("sunrise"/"sunset"),
 * böylece gün doğumu ve gün batımı tek kuralda iki ayrı işe bağlanır. `time` bilinçli olarak
 * dışarıdadır: eşleşecek değeri yoktur, `when` taşıyan eylemleri atlanmaya devam eder.
 */
export const automationActionApplies = (
  action: AutomationAction,
  event?: AutomationDeviceEvent,
  triggerValue?: JsonScalar
): boolean => {
  if (!action.when) return true;
  if (event !== undefined) return action.when.equals === event.value;
  return triggerValue !== undefined && action.when.equals === triggerValue;
};

/** §9.1 — zamanlı yolda eyleme eşleşecek değer; yalnız güneş tetikleyicisi üretir. */
export const automationTriggerMatchValue = (
  trigger: AutomationRunTriggerInfo
): JsonScalar | undefined => trigger.kind === "sun" ? trigger.value : undefined;

/** Aynı eylem kümesinin tekrarını tanımak için kararlı imza. */
export const automationActionSignature = (actions: AutomationAction[]): string =>
  JSON.stringify(actions.map((action) => {
    if (action.type === "device") return [action.deviceId, action.property, action.value];
    if (action.type === "group") return ["group", action.groupId, action.property, action.value];
    if (action.type === "scene") return ["scene", action.groupId, action.sceneId];
    return ["delay", action.seconds];
  }));

/** Günlükte insanın tanıyacağı hedef. */
const actionTarget = (action: AutomationAction): string => {
  if (action.type === "device") return `${action.deviceId}/${action.property}`;
  if (action.type === "group") return `${action.groupId}/${action.property}`;
  if (action.type === "scene") return `${action.groupId}#${action.sceneId}`;
  return `${action.seconds} sn`;
};

/** Çalışan iş bitince çalıştırılmak üzere bekletilen (birleştirilen) son istek. */
interface PendingRun {
  actions: AutomationAction[];
  signature: string;
  /** Tetikleyen olay — "hareket bitince kapat" izlemesi buradan kurulur. */
  event?: AutomationDeviceEvent;
  /** Çalışma günlüğüne yazılacak tetikleyici bilgisi. */
  trigger?: AutomationRunTriggerInfo;
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
  /**
   * §2.1 — süreli tetikleyicinin tek atış kilidi: `automationId|deviceId|property`. Aynı tutma
   * dönemi için yalnız bir kez ateşlenir; kanal hedeften çıkınca kilit düşer ve bir sonraki
   * seri sıfırdan sayılır.
   */
  private readonly heldFired = new Set<string>();
  /** Durum dosyası yazımları sıraya girer; son yazan kazansın diye zincirlenir. */
  private autoOffWrite: Promise<void> = Promise.resolve();
  /** Bekleyen `delay` sayaçları — motor durunca serbest bırakılır, kalıcı değildir. */
  private readonly delays = new Set<{ handle: unknown; resolve: () => void }>();
  /** `delay` taşıyan kurallar ortak döngüyü kilitlemesin diye arka planda yürür. */
  private readonly background = new Set<Promise<void>>();
  private stopped = false;
  /** Yerel gün başına güneş hesabı; her turda yeniden hesaplanmaz. */
  private sunCache: {
    day: string;
    latitude: number;
    longitude: number;
    times: SunTimes | null;
  } | null = null;
  /** Güneş sorununun günlüğe günde bir kez düşmesi için: otomasyon → yerel gün. */
  private readonly sunNotices = new Map<string, string>();
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

  /** Çalışma günlüğü kaydı; günlük yoksa sessizce atlanır (motorun akışını bloke etmez). */
  private record(record: Omit<AutomationRunRecord, "at">): void {
    this.options.runLog?.append({ at: this.now().toISOString(), ...record });
  }

  /**
   * Güneş hesabı yerel gün + konum başına bir kez yapılır. Konum yoksa ya da güneş o gün ufku
   * kesmiyorsa (kutup günü) sebep döner; çağıran bunu günlüğe yazar.
   */
  private resolveSun(date: Date): {
    times: SunTimes | null;
    reason: "locationMissing" | "sunUnavailable" | null;
  } {
    const location = this.options.location?.() ?? null;
    if (!location) return { times: null, reason: "locationMissing" };
    const day = localDayStamp(date);
    const cached = this.sunCache;
    if (
      !cached
      || cached.day !== day
      || cached.latitude !== location.latitude
      || cached.longitude !== location.longitude
    ) {
      const times = sunTimes(localNoon(date), location.latitude, location.longitude);
      this.sunCache = {
        day,
        latitude: location.latitude,
        longitude: location.longitude,
        times: times.sunrise && times.sunset ? times : null
      };
    }
    const times = this.sunCache?.times ?? null;
    return { times, reason: times ? null : "sunUnavailable" };
  }

  /**
   * Panelin "bu kural neden pasif" sorusuna yanıt; UI sonraki turda okuyacak.
   * Güneş yalnız tetikleyicide değil, §2.3 ile `timeRange` koşulunun ucunda da olabilir —
   * konum eksikse iki durumda da kural sessizce durur, ikisini de bildiririz.
   */
  inactiveReason(automation: Automation): { code: string; message: string } | null {
    const sunTrigger = automation.triggers.some((trigger) => trigger.type === "sun");
    const sunCondition = automation.conditions.some((condition) =>
      condition.type === "timeRange"
      && (condition.from.kind === "sun" || condition.to.kind === "sun"));
    if (!sunTrigger && !sunCondition) return null;
    const { reason } = this.resolveSun(this.now());
    if (reason === "locationMissing") {
      return {
        code: "locationMissing",
        message: sunTrigger
          ? "Evin konumu ayarlı değil; güneş tetikleyicisi çalışmıyor."
          : "Evin konumu ayarlı değil; güneşe göre saat aralığı hesaplanamıyor."
      };
    }
    if (reason === "sunUnavailable") {
      return {
        code: "sunUnavailable",
        message: sunTrigger
          ? "Güneş bugün bu enlemde ufku kesmiyor; güneş tetikleyicisi bugün atlanıyor."
          : "Güneş bugün bu enlemde ufku kesmiyor; güneşe göre saat aralığı bugün hesaplanamıyor."
      };
    }
    return null;
  }

  /** Bugünün güneş saatleri — panelin kuralı "05:41'de" diye gösterebilmesi için. */
  sunSummary(): { sunrise: string | null; sunset: string | null; reason: string | null } {
    const date = this.now();
    const { times, reason } = this.resolveSun(date);
    return {
      sunrise: times?.sunrise ? localTimeStamp(times.sunrise) : null,
      sunset: times?.sunset ? localTimeStamp(times.sunset) : null,
      reason
    };
  }

  /** Güneş kuralı çalışamadıysa günde bir kez günlüğe düşer; her turda kayıt üretmez. */
  private noteSunProblem(
    automation: Automation,
    date: Date,
    reason: "locationMissing" | "sunUnavailable"
  ): void {
    const day = localDayStamp(date);
    if (this.sunNotices.get(automation.id) === day) return;
    this.sunNotices.set(automation.id, day);
    const detail = reason === "locationMissing"
      ? "Evin konumu ayarlı değil; güneş tetikleyicisi hesaplanamıyor."
      : "Güneş bugün bu enlemde ufku kesmiyor; kural bugün atlandı.";
    this.note(`Otomasyon "${automation.name}" atlandı: ${detail}`);
    this.record({
      automationId: automation.id,
      automationName: automation.name,
      outcome: "blocked",
      reason,
      detail,
      trigger: { kind: "sun" }
    });
  }

  start(): void {
    this.stopped = false;
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs ?? automationTickIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    // Bekleyen kapatmalar durum dosyasında duruyor; süreç dönünce oradan devam eder.
    for (const pending of this.autoOff.values()) this.clearAutoOffTimer(pending);
    // Bekleyen `delay`'ler kalıcı değildir: serbest bırakılır, kalan eylemler çalışmaz.
    for (const delay of [...this.delays]) {
      this.timers.clear(delay.handle);
      this.delays.delete(delay);
      delay.resolve();
    }
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Arka planda yürüyen (`delay` taşıyan) kuralların bitmesini bekler — kapanış ve testler için. */
  async settle(): Promise<void> {
    while (this.background.size > 0) await Promise.all([...this.background]);
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
    const sun = this.resolveSun(date);
    for (const automation of automations) {
      if (!automation.enabled) continue;
      // §2.1 — süreli tetikleyiciler dakika kilidine tabi değildir: kendi tek atış kilitleri var.
      await this.tickHeldTriggers(automation, date);
      if (this.firedMinutes.get(automation.id) === stamp) continue;
      if (sun.reason && automation.triggers.some((trigger) => trigger.type === "sun")) {
        this.noteSunProblem(automation, date, sun.reason);
      }
      const trigger = automationDueTrigger(automation, date, sun.times);
      if (!trigger) continue;
      this.firedMinutes.set(automation.id, stamp);
      // §9.1 — güneş yolunda olay adı da yazılır: hem günlükte görünür hem `when` eşlemesini besler.
      await this.dispatch(
        automation,
        undefined,
        trigger.type === "sun" ? { kind: "sun", value: trigger.event } : { kind: "time" }
      );
    }
  }

  /** §2.1 — süreli tetikleyicinin tek atış kilidi: otomasyon + IEEE adresi + kanal. */
  private heldKey(automationId: string, deviceId: string, property: string): string {
    return `${automationId}|${deviceId}|${property}`;
  }

  /**
   * §2.1 — "değer N saniyedir hedefte" tetikleyicileri. Olay akışı değil, motorun turu değerlendirir.
   *
   * **Tur granülerliği:** tura 20 saniyede bir bakılır, o yüzden "60 saniye" pratikte 60–80 saniye
   * arasında ateşler. Bilinçli: ayrı bir zamanlayıcı açmak yerine mevcut tura binmek, DST ve
   * yeniden başlatma davranışını tek yerde tutuyor.
   *
   * **Yeniden başlatma (§2.5):** defter bellektedir; `since` yoksa ateşleme yok — kapalı taraf.
   * Süreç dönünce ilk taze değişimden itibaren sayılır.
   */
  private async tickHeldTriggers(automation: Automation, date: Date): Promise<void> {
    for (const trigger of automation.triggers) {
      if (!isAutomationHeldStateTrigger(trigger)) continue;
      const key = this.heldKey(automation.id, trigger.deviceId, trigger.property);
      const value = this.options.deviceState?.(trigger.deviceId, trigger.property);
      if (!automationHeldTriggerHolds(trigger, value)) {
        // Kanal hedeften çıktı: kilit düşer, bir sonraki hareket serisi yeniden sayılır.
        this.heldFired.delete(key);
        continue;
      }
      if (this.heldFired.has(key)) continue;
      const since = this.options.stateSince?.(trigger.deviceId, trigger.property) ?? null;
      if (since === null) continue;
      const elapsed = Math.floor((date.getTime() - since.getTime()) / 1_000);
      if (elapsed < (trigger.forSeconds ?? 0)) continue;
      this.heldFired.add(key);
      const detail = `${trigger.deviceId} "${trigger.property}" değeri`
        + ` ${JSON.stringify(value)} ve ${elapsed} saniyedir böyle;`
        + ` ${trigger.forSeconds} saniye isteniyordu.`;
      this.note(`Otomasyon "${automation.name}" süreli tetikleyiciyle çalıştı: ${detail}`);
      // Olay nesnesi verilir ki §5.4 `when` eşlemesi kanalın **o anki değerine** baksın ve
      // "hareket bitince kapat" izlemesi bu tetikleyiciden kurulabilsin.
      await this.dispatch(
        automation,
        { deviceId: trigger.deviceId, property: trigger.property, value: value as JsonScalar },
        {
          kind: "device",
          deviceId: trigger.deviceId,
          property: trigger.property,
          value: value as JsonScalar,
          heldSeconds: elapsed
        }
      );
    }
  }

  /**
   * `DeviceStore`'un olay geri çağrımına takılır — poll yok (§6).
   * `action` her seferinde tetikler (kullanıcı iki kez basarsa iki kez çalışır); diğer özellikler
   * yalnızca değer değiştiğinde, yani kenarda tetikler (§5.2). Gürültü koruması `execute`'taki
   * otomasyon başına 2 saniyelik aralıktır (§8.2).
   */
  async handleDeviceEvents(events: AutomationDeviceEvent[]): Promise<void> {
    // Önceki değer `isEdge` onu ezmeden yakalanır; sayısal eşik kenarı buna dayanıyor.
    const edges: Array<{ event: AutomationDeviceEvent; previous?: JsonScalar }> = [];
    for (const event of events) {
      const previous = this.lastStateValues.get(`${event.deviceId}|${event.property}`);
      if (!this.isEdge(event)) continue;
      edges.push({ event, previous });
    }
    if (edges.length === 0) return;
    let automations: Automation[];
    try {
      automations = await this.options.store.get();
    } catch (error) {
      this.logger.error(`Otomasyonlar okunamadı: ${String(error)}`);
      return;
    }
    for (const { event, previous } of edges) {
      // Bekleyen kapatmalar önce bakar: elle müdahale iptal eder, yeni hareket sayacı sıfırlar.
      this.observeAutoOff(event);
      for (const automation of automations) {
        if (!automation.enabled) continue;
        const match = automationEventMatch(automation, event, previous);
        if (!match.matched) {
          // Sayısal olmayan değer ve "önceki değer yok" sessizce yutulmaz.
          if (match.reason) {
            this.note(`Otomasyon "${automation.name}" tetiklenmedi: ${match.detail ?? match.reason}`);
            this.record({
              automationId: automation.id,
              automationName: automation.name,
              outcome: "blocked",
              reason: match.reason,
              detail: match.detail,
              trigger: {
                kind: "device",
                deviceId: event.deviceId,
                property: event.property,
                value: event.value
              }
            });
          }
          continue;
        }
        await this.dispatch(automation, event, {
          kind: "device",
          deviceId: event.deviceId,
          property: event.property,
          value: event.value
        });
      }
    }
  }

  /**
   * `delay` taşıyan kural ortak döngüyü kilitlemez: kendi sırası (`running` + `pending`
   * birleştirme) korunarak arka planda yürür, tur ve olay akışı beklemeden devam eder.
   * `delay`siz kurallarda davranış aynen eskisi gibidir — sırayla, bekleyerek.
   */
  private async dispatch(
    automation: Automation,
    event: AutomationDeviceEvent | undefined,
    trigger: AutomationRunTriggerInfo
  ): Promise<AutomationRunResult> {
    if (!automation.actions.some((action) => action.type === "delay")) {
      return this.execute(automation, event, trigger);
    }
    this.note(`Otomasyon "${automation.name}" arka planda yürüyor: bekleme içeriyor.`);
    const task = this.execute(automation, event, trigger)
      .then(() => undefined)
      .catch((error) => {
        this.logger.error(`Otomasyon "${automation.name}" arka planda başarısız: ${String(error)}`);
      });
    this.background.add(task);
    void task.then(() => this.background.delete(task));
    return "ok";
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
    action: AutomationDeviceAction,
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
      await this.setDevice(pending.deviceId, {
        [pending.property]: this.commandValue(pending.deviceId, pending.property, pending.value)
      });
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
    return this.dispatch(automation, undefined, { kind: "manual" });
  }

  private async execute(
    automation: Automation,
    event?: AutomationDeviceEvent,
    trigger: AutomationRunTriggerInfo = { kind: "manual" }
  ): Promise<AutomationRunResult> {
    const triggerValue = automationTriggerMatchValue(trigger);
    const actions = automation.actions
      .filter((action) => automationActionApplies(action, event, triggerValue));
    // Hiçbir eylem eşleşmediyse çalıştırma sayılmaz: ne kilit alınır ne de `lastRunOk` bozulur.
    if (actions.length === 0) {
      this.note(`Otomasyon "${automation.name}" atlandı: koşullara uyan eylem yok.`);
      this.record({
        automationId: automation.id,
        automationName: automation.name,
        outcome: "skipped",
        reason: "noMatchingAction",
        detail: "Tetikleyen değere uyan eylem yok.",
        trigger
      });
      return "skipped";
    }
    // §5.3 — koşullar kuralın bağlama biçimiyle; sağlanmazsa kural çalışmaz ve sebebi günlüğe düşer.
    if (automation.conditions.length > 0) {
      const anyMode = automation.conditionMode === "any";
      const now = this.now();
      // Güneş uçlu aralıklar için o günün güneş saatleri; hesap yerel gün başına önbelleklidir.
      const evaluation = evaluateAutomationConditions(
        automation.conditions,
        now,
        (deviceId, property) => this.options.deviceState?.(deviceId, property),
        {
          mode: automation.conditionMode,
          times: this.resolveSun(now).times,
          stateSince: (deviceId, property) =>
            this.options.stateSince?.(deviceId, property) ?? null
        }
      );
      if (!evaluation.ok) {
        const failed = evaluation.results.find((result) => !result.ok);
        // `any` modunda tek bir koşulun sebebini yazmak yanıltır: hiçbiri tutmadı demek gerekir.
        const detail = anyMode
          ? `Koşulların hiçbiri sağlanmadı. ${failed?.reason ?? ""}`.trim()
          : failed?.reason ?? "Koşul sağlanmadı.";
        this.note(`Otomasyon "${automation.name}" atlandı: ${detail}`);
        this.record({
          automationId: automation.id,
          automationName: automation.name,
          outcome: "blocked",
          reason: "conditionFalse",
          detail,
          trigger,
          conditions: evaluation.results
        });
        return "blocked";
      }
    }
    const signature = automationActionSignature(actions);
    // Kilit doluyken düşürmek yerine birleştir: çalışan iş bitince bu istek çalışır.
    if (this.running.has(automation.id)) {
      this.pending.set(automation.id, { actions, signature, event, trigger });
      this.note(`Otomasyon "${automation.name}" meşgul: son istek sıraya alındı (birleştirildi).`);
      this.record({
        automationId: automation.id,
        automationName: automation.name,
        outcome: "busy",
        reason: "busy",
        detail: "Kural çalışıyordu; son istek sıraya alındı.",
        trigger
      });
      return "busy";
    }
    if (this.suppressedAsRepeat(automation, signature, trigger)) return "busy";
    return this.runQueue(automation, { actions, signature, event, trigger });
  }

  /** Asgari aralık yalnızca aynı eylem kümesinin tekrarını bastırır — ters yön niyettir. */
  private suppressedAsRepeat(
    automation: Automation,
    signature: string,
    trigger?: AutomationRunTriggerInfo
  ): boolean {
    const previousStart = this.lastStartedAt.get(automation.id);
    if (previousStart === undefined) return false;
    if (this.lastSignatures.get(automation.id) !== signature) return false;
    if (this.now().getTime() - previousStart >= automationMinimumRunGapMs) return false;
    const detail = `Aynı eylem ${automationMinimumRunGapMs} ms içinde tekrarlandı.`;
    this.note(`Otomasyon "${automation.name}" bastırıldı: ${detail}`);
    this.record({
      automationId: automation.id,
      automationName: automation.name,
      outcome: "busy",
      reason: "repeatSuppressed",
      detail,
      trigger
    });
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
        current = next && !this.suppressedAsRepeat(automation, next.signature, next.trigger)
          ? next
          : undefined;
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
    const results: AutomationRunActionResult[] = [];
    let ok = true;
    let reason: string | undefined;
    let detail: string | undefined;
    for (const action of run.actions) {
      if (this.stopped) {
        // Bekleyen `delay` kalıcı değildir: süreç durunca kalan eylemler çalışmaz — ama iz kalır.
        ok = false;
        reason = "stopped";
        detail = "Motor durdu; kalan eylemler çalışmadı (bekleme kalıcı değildir).";
        results.push({ type: action.type, target: actionTarget(action), ok: false, error: detail });
        this.logger.error(`Otomasyon "${automation.name}" yarıda kesildi: ${detail}`);
        break;
      }
      try {
        await this.applyAction(automation, action, run.event);
        results.push({ type: action.type, target: actionTarget(action), ok: true });
      } catch (error) {
        ok = false;
        reason = "actionFailed";
        detail = String(error);
        results.push({
          type: action.type,
          target: actionTarget(action),
          ok: false,
          error: detail
        });
        this.logger.error(`Otomasyon "${automation.name}" çalıştırılamadı: ${detail}`);
        break;
      }
    }
    try {
      await this.options.store.markRun(automation.id, ok, this.now());
    } catch (error) {
      this.logger.error(`Otomasyon son çalışma bilgisi yazılamadı: ${String(error)}`);
    }
    this.record({
      automationId: automation.id,
      automationName: automation.name,
      outcome: ok ? "ok" : "failed",
      reason,
      detail,
      trigger: run.trigger,
      actions: results
    });
    return ok ? "ok" : "failed";
  }

  /** Tek eylemin uygulanması; tür ayrımı burada, sıralama `runOnce`'ta. */
  private async applyAction(
    automation: Automation,
    action: AutomationAction,
    event?: AutomationDeviceEvent
  ): Promise<void> {
    if (action.type === "delay") {
      // Zaman aşımı tek cihaz çağrısı içindir; bekleme onun kapsamına girmez.
      await this.wait(action.seconds * 1000);
      return;
    }
    if (action.type === "group") {
      const setGroup = this.options.source.setGroup?.bind(this.options.source);
      if (!setGroup) throw new Error("Bu kaynak grup komutunu desteklemiyor.");
      await this.withTimeout(setGroup(action.groupId, { [action.property]: action.value }));
      return;
    }
    if (action.type === "scene") {
      const groupScene = this.options.source.groupScene?.bind(this.options.source);
      if (!groupScene) throw new Error("Bu kaynak sahne komutunu desteklemiyor.");
      await this.withTimeout(groupScene(action.groupId, action.sceneId, "recall"));
      return;
    }
    await this.setDevice(action.deviceId, {
      [action.property]: this.commandValue(action.deviceId, action.property, action.value)
    });
    // Kapatma sözü ancak komut gerçekten gittiyse kurulur (§9).
    this.armAutoOff(automation, action, event);
  }

  /**
   * `delay` beklemesi — enjekte edilen zamanlayıcıyı kullanır, testler gerçek saati beklemez.
   * Motor durdurulursa bekleme serbest bırakılır ve `runOnce` kalan eylemleri çalıştırmaz.
   */
  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const entry: { handle: unknown; resolve: () => void } = { handle: null, resolve };
      entry.handle = this.timers.set(() => {
        this.delays.delete(entry);
        resolve();
      }, Math.max(ms, 0));
      this.delays.add(entry);
    });
  }

  /**
   * Yavaş ya da çevrimdışı bir cihaz kuralın tamamını kilitlemesin diye eylem başına zaman aşımı.
   * Komut iptal edilemez; yalnızca beklemeyi bırakırız.
   */
  private async withTimeout(call: Promise<void>): Promise<void> {
    const timeoutMs = this.options.actionTimeoutMs ?? automationActionTimeoutMs;
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

  private async setDevice(deviceId: string, command: JsonObject): Promise<void> {
    await this.withTimeout(this.options.source.setDevice(deviceId, command));
  }

  /**
   * Kuralda yazan değeri cihaza yazılacak değere çevirir. Arayıcı yoksa ya da kanal bulunmuyorsa
   * değer olduğu gibi gider — kural dosyası motorun bilmediği bir kanala yazıyorsa engellemeyiz.
   */
  private commandValue(deviceId: string, property: string, value: JsonScalar): unknown {
    const control = this.options.controls?.(deviceId)?.controls
      .find((item) => item.property === property);
    return control ? normalizeControlValueOrRaw(control, value) : value;
  }
}
