import { readFile, stat } from "node:fs/promises";
import { writeJsonAtomic } from "./atomic-file.js";
import type { DeviceControlView, JsonScalar } from "./types.js";

export interface AutomationTimeTrigger {
  type: "time";
  /** Yerel saat, "HH:MM". */
  at: string;
  /** 1 = Pazartesi … 7 = Pazar. */
  days: number[];
}

/**
 * Düğme basışı — anlık kenar olayı (§5.2). Alt varlık kuralı (§5.1.1): tetikleyici cihaza değil,
 * cihaz + buton çiftine bağlanır; üç butonlu anahtarın her butonu ayrı tetikleyicidir.
 */
export interface AutomationDeviceActionTrigger {
  type: "deviceAction";
  /** IEEE adresi — kanonik bağ. */
  deviceId: string;
  /** MQTT `action` değeri, örn. "1_single". */
  action: string;
}

/**
 * Gün doğumu / gün batımı. Hesaplanan an yerel `HH:MM`'e çevrilip mevcut zaman yoluna sokulur;
 * ayrı bir zamanlayıcı yolu yoktur. Konum ayarlı değilse kural çalışmaz ve sebebi günlüğe düşer.
 */
export interface AutomationSunTrigger {
  type: "sun";
  event: "sunrise" | "sunset";
  /** Güneş anına eklenecek dakika; negatif = önce. */
  offsetMinutes: number;
  /** 1 = Pazartesi … 7 = Pazar. Verilmezse her gün. */
  days: number[];
}

/**
 * Sensör/cihaz durumu — yalnızca kenarda, yani değer değiştiğinde tetiklenir.
 * `equals` verilirse yalnızca o değere geçişte, verilmezse **her** değişimde tetiklenir (§5.2).
 *
 * `above`/`below` sayısal eşiktir ve **kenarda** tetikler: değer eşiğin öbür tarafından bu tarafa
 * geçtiği anda bir kez. 26,1 → 26,2 → 26,3 akışı tek tetikleme üretir. İkisi birden verilirse
 * "aralığa girdi" anlamına gelir. `equals` ile birlikte kullanılamaz.
 */
export interface AutomationDeviceStateTrigger {
  type: "deviceState";
  /** IEEE adresi — kanonik bağ. */
  deviceId: string;
  /** MQTT özellik anahtarı, örn. "occupancy". */
  property: string;
  /** Yoksa özelliğin her değişimi tetikler. */
  equals?: JsonScalar;
  /** Değer bunun üstüne çıktığı anda. */
  above?: number;
  /** Değer bunun altına indiği anda. */
  below?: number;
}

export type AutomationTrigger =
  | AutomationTimeTrigger
  | AutomationSunTrigger
  | AutomationDeviceActionTrigger
  | AutomationDeviceStateTrigger;

/** Olay akışına bağlanan tetikleyiciler — zaman/güneş tetikleyicileri buraya girmez. */
export type AutomationEventTrigger =
  | AutomationDeviceActionTrigger
  | AutomationDeviceStateTrigger;

/** Zamana bağlı tetikleyiciler — olay akışına değil, 20 saniyelik tura bakarlar. */
export const isAutomationScheduleTrigger = (
  trigger: AutomationTrigger
): trigger is AutomationTimeTrigger | AutomationSunTrigger =>
  trigger.type === "time" || trigger.type === "sun";

/**
 * §5.3 — koşullar yalnızca **VE** ile değerlendirilir; VEYA bilinçli olarak yok.
 * `timeRange` gece yarısını aşabilir (22:00→06:00): `from > to` ise aralık ertesi güne taşar.
 */
export interface AutomationTimeRangeCondition {
  type: "timeRange";
  /** Yerel saat, "HH:MM" — dahil. */
  from: string;
  /** Yerel saat, "HH:MM" — hariç. */
  to: string;
  /**
   * 1 = Pazartesi … 7 = Pazar. Verilmezse her gün. Gece yarısını aşan aralıkta gün ölçütü
   * aralığın **başladığı** güne bakar: 22:00→06:00 + Cuma = "cuma gecesi".
   */
  days?: number[];
}

/** "Lamba zaten açıksa dokunma" — değer `DeviceStore`'dan okunur. */
export interface AutomationDeviceStateCondition {
  type: "deviceState";
  /** IEEE adresi — kanonik bağ. */
  deviceId: string;
  property: string;
  /** Değer buna eşitse koşul sağlanır. */
  equals?: JsonScalar;
  /** Değer buna eşit **değilse** koşul sağlanır. İkisinden tam biri verilir. */
  not?: JsonScalar;
}

export type AutomationCondition =
  | AutomationTimeRangeCondition
  | AutomationDeviceStateCondition;

/**
 * Eylem koşulu (§5.4) — eylemi **tetikleyen olayın değerine** bağlar. Anahtar durumu eylemlere
 * böyle eşlenir: `ON` gelince Aç, `OFF` gelince Kapat. Tek alanlı tutulur; başka alan yoktur.
 */
export interface AutomationActionWhen {
  /** Tetikleyen olayın değeri buna eşitse eylem çalışır. */
  equals: JsonScalar;
}

/**
 * §9 — "sonra kapat". Eylem çalıştıktan sonra hedefi kendiliğinden geri alır; kullanıcı biri açan
 * biri kapatan iki ayrı kural kurmak zorunda kalmaz.
 * - `after`: eylemden `seconds` saniye sonra geri alınır.
 * - `idle`: tetikleyici kanal tetikleyen değerinden çıkınca (hareket bitince) geri alınır;
 *   `seconds` burada isteğe bağlı **ek bekleme**dir, 0 olabilir.
 */
export interface AutomationAutoOff {
  mode: "after" | "idle";
  /** `after` için 1..86400; `idle` için 0..86400 ek bekleme. */
  seconds: number;
  /** Geri alınırken hedefe yazılacak değer (genelde kapatma değeri). */
  value: JsonScalar;
}

export interface AutomationDeviceAction {
  type: "device";
  /** IEEE adresi — otomasyonun kalıcı bağı. */
  deviceId: string;
  /** MQTT özellik anahtarı. Kanonik hedef budur (örn. "state_l1"). */
  property: string;
  /** DeviceControlView.id — yalnızca sunum için, opsiyonel. */
  controlId?: string;
  value: JsonScalar;
  /** Yoksa eylem her zaman çalışır — geriye tam uyumluluk. */
  when?: AutomationActionWhen;
  /** Yoksa geri alma yok — geriye tam uyumluluk. */
  autoOff?: AutomationAutoOff;
}

/**
 * Sıralı eylemler arasında bekleme (Alexa'nın "Wait"'i). Tek eylem zaman aşımı (10 sn) yalnızca
 * cihaz çağrısı içindir; `delay` onun kapsamına girmez. Motor, `delay` taşıyan kuralı ortak
 * döngüyü kilitlemesin diye arka planda yürütür — bkz. `automation-engine.ts`.
 *
 * Bekleyen bir `delay` süreç ölürse kaybolur (autoOff gibi kalıcı değildir); motor bunu
 * çalışma günlüğüne yazar.
 */
export interface AutomationDelayAction {
  type: "delay";
  /** 1..300 saniye. */
  seconds: number;
  when?: AutomationActionWhen;
}

/** Grup aç/kapat — `ZigbeeSource.setGroup()` üzerinden. */
export interface AutomationGroupAction {
  type: "group";
  /** `GroupView.id`, örn. "group-7". */
  groupId: string;
  property: string;
  value: JsonScalar;
  when?: AutomationActionWhen;
}

/** Sahne çağırma — `ZigbeeSource.groupScene(id, sceneId, "recall")` zaten var. */
export interface AutomationSceneAction {
  type: "scene";
  groupId: string;
  sceneId: number;
  when?: AutomationActionWhen;
}

export type AutomationAction =
  | AutomationDeviceAction
  | AutomationDelayAction
  | AutomationGroupAction
  | AutomationSceneAction;

/** Bir cihaz kanalına yazan eylemler — döngü koruması ve "sonra kapat" bunlara bakar. */
export const isAutomationDeviceAction = (
  action: AutomationAction
): action is AutomationDeviceAction => action.type === "device";

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  triggers: AutomationTrigger[];
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  lastRunAt: string | null;
  lastRunOk: boolean | null;
}

/** Kilit/siren doğrulaması için cihaz çözümleyici (enjekte edilir). */
export type AutomationDeviceLookup = (deviceId: string) =>
  { controls: DeviceControlView[] } | undefined;

/** Grup eylemlerinin üyelerini çözer; kilit/siren yasağı ve döngü koruması buna bakar. */
export type AutomationGroupLookup = (groupId: string) =>
  { memberIds: string[] } | undefined;

export const maxAutomations = 64;
export const maxAutomationTriggers = 8;
export const maxAutomationConditions = 4;
export const maxAutomationActions = 8;
export const maxAutomationNameLength = 64;
/** Güneş tetikleyicisi kaydırması: dört saat yeter, fazlası "güneş" olmaktan çıkar. */
export const maxAutomationSunOffsetMinutes = 240;
/** `delay` üst sınırı — beş dakikadan uzun bekleme kural değil, zamanlayıcıdır. */
export const maxAutomationDelaySeconds = 300;
/** Bir gün — bundan uzun bir "sonra kapat" süresi kullanıcı hatasıdır. */
export const maxAutomationAutoOffSeconds = 86_400;
/** Bekleyen kapatma sayısı; durum dosyası şişmesin. */
export const maxAutomationAutoOffEntries = 128;

/** §8.1 — otomasyonu onaylayacak insan yok; bu kontroller eylem olamaz. */
export const forbiddenAutomationControlKinds: ReadonlySet<string> = new Set(["lock", "siren"]);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const deviceIdPattern = /^0x[0-9a-f]{16}$/;
const propertyPattern = /^[A-Za-z0-9_]{1,64}$/;
const actionPattern = /^[A-Za-z0-9_-]{1,64}$/;
const controlIdPattern = /^[a-z0-9:_@-]{1,64}$/;
const automationIdPattern = /^[a-z0-9-]{8,32}$/;
/**
 * `GroupView.id` — `group-<zigbee id>`, dost isim düşerse `group-<isim>` olabildiği için
 * karakter kümesi geniş tutulur; yalnızca denetim karakterleri ve aşırı uzunluk elenir.
 */
const groupIdPattern = /^group-[^\x00-\x1f]{1,56}$/;

const isJsonScalar = (value: unknown): value is JsonScalar =>
  typeof value === "string"
  || typeof value === "boolean"
  || (typeof value === "number" && Number.isFinite(value));

const triggerDeviceId = (value: unknown): string => {
  const deviceId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!deviceIdPattern.test(deviceId)) {
    throw new Error("Otomasyon tetikleyicisi cihaz UID'si geçersiz.");
  }
  return deviceId;
};

/** 1 = Pazartesi … 7 = Pazar; yinelenenler ayıklanır, sıralanır. */
const validateDays = (value: unknown, label: string): number[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(label);
  const days: number[] = [];
  for (const day of value) {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error(label);
    }
    if (!days.includes(day)) days.push(day);
  }
  days.sort((left, right) => left - right);
  return days;
};

const validateTriggers = (value: unknown): AutomationTrigger[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxAutomationTriggers) {
    throw new Error("Otomasyon tetikleyicileri geçersiz.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Otomasyon tetikleyicisi geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
    // §8.1 — kilit/siren yalnızca EYLEM olarak yasak; tetikleyici olarak serbesttir.
    if (candidate.type === "deviceAction") {
      const deviceId = triggerDeviceId(candidate.deviceId);
      const action = typeof candidate.action === "string" ? candidate.action.trim() : "";
      if (!actionPattern.test(action)) {
        throw new Error("Otomasyon tetikleyicisi düğme eylemi geçersiz.");
      }
      return { type: "deviceAction", deviceId, action } satisfies AutomationDeviceActionTrigger;
    }
    if (candidate.type === "deviceState") {
      const deviceId = triggerDeviceId(candidate.deviceId);
      const property = typeof candidate.property === "string" ? candidate.property.trim() : "";
      if (!propertyPattern.test(property)) {
        throw new Error("Otomasyon tetikleyicisi cihaz özelliği geçersiz.");
      }
      const trigger: AutomationDeviceStateTrigger = { type: "deviceState", deviceId, property };
      // `equals` opsiyoneldir: yoksa özelliğin her değişimi tetikler.
      if (candidate.equals !== undefined && candidate.equals !== null) {
        if (!isJsonScalar(candidate.equals)) {
          throw new Error("Otomasyon tetikleyicisi hedef değeri geçersiz.");
        }
        trigger.equals = candidate.equals;
      }
      const threshold = (raw: unknown, label: string): number | undefined => {
        if (raw === undefined || raw === null) return undefined;
        const numeric = typeof raw === "string" ? Number(raw.trim()) : raw;
        if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
          throw new Error(`Otomasyon tetikleyicisi ${label} eşiği geçersiz.`);
        }
        return numeric;
      };
      const above = threshold(candidate.above, "üst");
      const below = threshold(candidate.below, "alt");
      if (above !== undefined) trigger.above = above;
      if (below !== undefined) trigger.below = below;
      // Eşitlik ile eşik aynı tetikleyicide iki ayrı kenar tanımı olurdu; biri seçilmeli.
      if (trigger.equals !== undefined && (above !== undefined || below !== undefined)) {
        throw new Error("Otomasyon tetikleyicisinde eşitlik ve sayısal eşik birlikte olamaz.");
      }
      if (above !== undefined && below !== undefined && above >= below) {
        throw new Error("Otomasyon tetikleyicisinde üst eşik alt eşikten küçük olmalıdır.");
      }
      return trigger;
    }
    if (candidate.type === "sun") {
      if (candidate.event !== "sunrise" && candidate.event !== "sunset") {
        throw new Error("Otomasyon güneş olayı geçersiz.");
      }
      const raw = candidate.offsetMinutes;
      const offsetMinutes = raw === undefined || raw === null
        ? 0
        : (typeof raw === "string" ? Number(raw.trim()) : raw);
      if (
        typeof offsetMinutes !== "number"
        || !Number.isInteger(offsetMinutes)
        || Math.abs(offsetMinutes) > maxAutomationSunOffsetMinutes
      ) {
        throw new Error("Otomasyon güneş kaydırması geçersiz.");
      }
      // Gün listesi opsiyoneldir; sihirbaz vermezse her gün.
      const days = candidate.days === undefined || candidate.days === null
        ? [1, 2, 3, 4, 5, 6, 7]
        : validateDays(candidate.days, "Otomasyon günleri geçersiz.");
      return {
        type: "sun",
        event: candidate.event,
        offsetMinutes,
        days
      } satisfies AutomationSunTrigger;
    }
    if (candidate.type !== "time") {
      throw new Error("Otomasyon tetikleyici türü bu sürümde desteklenmiyor.");
    }
    const at = typeof candidate.at === "string" ? candidate.at.trim() : "";
    if (!timePattern.test(at)) throw new Error("Otomasyon saati geçersiz.");
    const days = validateDays(candidate.days, "Otomasyon günleri geçersiz.");
    return { type: "time", at, days } satisfies AutomationTimeTrigger;
  });
};

/** §5.3 — koşullar VE ile değerlendirilir; bilinmeyen tür reddedilir. */
const validateConditions = (value: unknown): AutomationCondition[] => {
  if (!Array.isArray(value) || value.length > maxAutomationConditions) {
    throw new Error("Otomasyon koşulları geçersiz.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Otomasyon koşulu geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
    if (candidate.type === "timeRange") {
      const from = typeof candidate.from === "string" ? candidate.from.trim() : "";
      const to = typeof candidate.to === "string" ? candidate.to.trim() : "";
      if (!timePattern.test(from) || !timePattern.test(to)) {
        throw new Error("Otomasyon koşulu saat aralığı geçersiz.");
      }
      // Aynı iki saat "hiç" mi "hep" mi belirsizdir; kullanıcı hatasıdır.
      if (from === to) throw new Error("Otomasyon koşulu saat aralığı başlangıç ve bitişi aynı olamaz.");
      const condition: AutomationTimeRangeCondition = { type: "timeRange", from, to };
      if (candidate.days !== undefined && candidate.days !== null) {
        condition.days = validateDays(candidate.days, "Otomasyon koşulu günleri geçersiz.");
      }
      return condition;
    }
    if (candidate.type !== "deviceState") {
      throw new Error("Otomasyon koşul türü bu sürümde desteklenmiyor.");
    }
    const deviceId = typeof candidate.deviceId === "string"
      ? candidate.deviceId.trim().toLowerCase()
      : "";
    if (!deviceIdPattern.test(deviceId)) throw new Error("Otomasyon koşulu cihaz UID'si geçersiz.");
    const property = typeof candidate.property === "string" ? candidate.property.trim() : "";
    if (!propertyPattern.test(property)) {
      throw new Error("Otomasyon koşulu cihaz özelliği geçersiz.");
    }
    const hasEquals = candidate.equals !== undefined && candidate.equals !== null;
    const hasNot = candidate.not !== undefined && candidate.not !== null;
    if (hasEquals === hasNot) {
      throw new Error("Otomasyon koşulunda `equals` ya da `not` alanlarından tam biri olmalıdır.");
    }
    const raw = hasEquals ? candidate.equals : candidate.not;
    if (!isJsonScalar(raw)) throw new Error("Otomasyon koşulu değeri geçersiz.");
    return hasEquals
      ? { type: "deviceState", deviceId, property, equals: raw } satisfies AutomationDeviceStateCondition
      : { type: "deviceState", deviceId, property, not: raw } satisfies AutomationDeviceStateCondition;
  });
};

/** §5.2 — olay tetikleyicilerinin dinlediği cihaz kimlikleri. */
export const automationTriggerDeviceIds = (automation: Automation): string[] => {
  const ids: string[] = [];
  for (const trigger of automation.triggers) {
    if (isAutomationScheduleTrigger(trigger)) continue;
    if (!ids.includes(trigger.deviceId)) ids.push(trigger.deviceId);
  }
  return ids;
};

/**
 * Kuralın dokunduğu **tüm** IEEE adresleri: tetikleyiciler, koşullar ve cihaz eylemleri.
 * Yedek geri yükleme ve cihaz silme bu listeye bakar; grup eylemleri cihaz kimliği taşımaz.
 */
export const automationDeviceIds = (automation: Automation): string[] => {
  const ids = new Set(automationTriggerDeviceIds(automation));
  for (const condition of automation.conditions) {
    if (condition.type === "deviceState") ids.add(condition.deviceId);
  }
  for (const action of automation.actions) {
    if (isAutomationDeviceAction(action)) ids.add(action.deviceId);
  }
  return [...ids];
};

/**
 * §8.2 — döngü korumasının kanonik anahtarı: IEEE adresi + kanal (MQTT özelliği). Dost isim
 * kullanılmaz. Çok kanallı anahtarın `state_l1`/`state_l2` uçları ayrı kanal sayılır.
 */
const automationChannelKey = (
  entry: { deviceId: string; property: string }
): string => `${entry.deviceId}|${entry.property}`;

/** §5.4 — eylem koşulu yalnızca `equals` taşır; fazlası reddedilir. */
const validateActionWhen = (value: unknown): AutomationActionWhen => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Otomasyon eylemi koşulu geçersiz.");
  }
  const candidate = value as Record<string, unknown>;
  for (const key of Object.keys(candidate)) {
    if (key !== "equals") throw new Error("Otomasyon eylemi koşulunda bilinmeyen alan var.");
  }
  if (!isJsonScalar(candidate.equals)) {
    throw new Error("Otomasyon eylemi koşul değeri geçersiz.");
  }
  return { equals: candidate.equals };
};

/** §9 — "sonra kapat" yalnızca üç alan tanır; fazlası reddedilir. */
const validateAutoOff = (value: unknown, actionValue: JsonScalar): AutomationAutoOff => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Otomasyon otomatik kapatma ayarı geçersiz.");
  }
  const candidate = value as Record<string, unknown>;
  for (const key of Object.keys(candidate)) {
    if (key !== "mode" && key !== "seconds" && key !== "value") {
      throw new Error("Otomasyon otomatik kapatma ayarında bilinmeyen alan var.");
    }
  }
  if (candidate.mode !== "after" && candidate.mode !== "idle") {
    throw new Error("Otomasyon otomatik kapatma türü geçersiz.");
  }
  const seconds = candidate.seconds;
  if (
    typeof seconds !== "number"
    || !Number.isInteger(seconds)
    || seconds < 0
    || seconds > maxAutomationAutoOffSeconds
  ) {
    throw new Error("Otomasyon otomatik kapatma süresi geçersiz.");
  }
  // Süreyle kapatmada 0 saniye anlamsızdır; hareket bitince kapatmada 0 = ek bekleme yok.
  if (candidate.mode === "after" && seconds < 1) {
    throw new Error("Otomasyon otomatik kapatma süresi geçersiz.");
  }
  if (!isJsonScalar(candidate.value)) {
    throw new Error("Otomasyon otomatik kapatma değeri geçersiz.");
  }
  if (candidate.value === actionValue) {
    throw new Error("Otomasyon otomatik kapatma değeri eylemin değeriyle aynı olamaz.");
  }
  return { mode: candidate.mode, seconds, value: candidate.value };
};

/** §8.1 — yasak kontrol türü, hangi eylem türünden geçerse geçsin reddedilir. */
const rejectForbiddenControl = (
  deviceId: string,
  property: string | null,
  lookup?: AutomationDeviceLookup
): void => {
  const controls = lookup?.(deviceId)?.controls;
  if (!controls) return;
  const hit = controls.find((item) =>
    (property === null || item.property === property)
    && forbiddenAutomationControlKinds.has(item.kind));
  if (hit) throw new Error("Kilit ve siren bir otomasyon eylemi olamaz.");
};

const validateActions = (
  value: unknown,
  lookup?: AutomationDeviceLookup,
  groupLookup?: AutomationGroupLookup
): AutomationAction[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxAutomationActions) {
    throw new Error("Otomasyon eylemleri geçersiz.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Otomasyon eylemi geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
    const when = candidate.when !== undefined && candidate.when !== null
      ? validateActionWhen(candidate.when)
      : undefined;
    if (candidate.type === "delay") {
      const raw = candidate.seconds;
      const seconds = typeof raw === "string" ? Number(raw.trim()) : raw;
      if (
        typeof seconds !== "number"
        || !Number.isInteger(seconds)
        || seconds < 1
        || seconds > maxAutomationDelaySeconds
      ) {
        throw new Error("Otomasyon bekleme süresi geçersiz.");
      }
      const action: AutomationDelayAction = { type: "delay", seconds };
      if (when) action.when = when;
      return action;
    }
    if (candidate.type === "group" || candidate.type === "scene") {
      const groupId = typeof candidate.groupId === "string"
        ? candidate.groupId.trim().toLowerCase()
        : "";
      if (!groupIdPattern.test(groupId)) throw new Error("Otomasyon eylemi grup kimliği geçersiz.");
      // Grubun üyeleri arasında kilit/siren varsa grup ya da sahne komutu onu da kapsar.
      const members = groupLookup?.(groupId)?.memberIds ?? [];
      if (candidate.type === "group") {
        const property = typeof candidate.property === "string" ? candidate.property.trim() : "";
        if (!propertyPattern.test(property)) {
          throw new Error("Otomasyon eylemi grup özelliği geçersiz.");
        }
        if (!isJsonScalar(candidate.value)) throw new Error("Otomasyon eylemi değeri geçersiz.");
        for (const memberId of members) rejectForbiddenControl(memberId, property, lookup);
        const action: AutomationGroupAction = {
          type: "group",
          groupId,
          property,
          value: candidate.value
        };
        if (when) action.when = when;
        return action;
      }
      const raw = candidate.sceneId;
      const sceneId = typeof raw === "string" ? Number(raw.trim()) : raw;
      if (
        typeof sceneId !== "number"
        || !Number.isInteger(sceneId)
        || sceneId < 0
        || sceneId > 255
      ) {
        throw new Error("Otomasyon eylemi sahne kimliği geçersiz.");
      }
      // Sahne hangi kanalı yazacağını söylemez; grupta kilit/siren varsa tamamen reddedilir.
      for (const memberId of members) rejectForbiddenControl(memberId, null, lookup);
      const action: AutomationSceneAction = { type: "scene", groupId, sceneId };
      if (when) action.when = when;
      return action;
    }
    if (candidate.type !== "device") {
      throw new Error("Otomasyon eylem türü bu sürümde desteklenmiyor.");
    }
    const deviceId = typeof candidate.deviceId === "string"
      ? candidate.deviceId.trim().toLowerCase()
      : "";
    if (!deviceIdPattern.test(deviceId)) throw new Error("Otomasyon eylemi cihaz UID'si geçersiz.");
    const property = typeof candidate.property === "string" ? candidate.property.trim() : "";
    if (!propertyPattern.test(property)) throw new Error("Otomasyon eylemi cihaz özelliği geçersiz.");
    if (!isJsonScalar(candidate.value)) throw new Error("Otomasyon eylemi değeri geçersiz.");
    const action: AutomationDeviceAction = { type: "device", deviceId, property, value: candidate.value };
    if (candidate.controlId !== undefined && candidate.controlId !== null) {
      const controlId = typeof candidate.controlId === "string"
        ? candidate.controlId.trim().toLowerCase()
        : "";
      if (!controlIdPattern.test(controlId)) throw new Error("Otomasyon eylemi kontrol kimliği geçersiz.");
      action.controlId = controlId;
    }
    if (when) action.when = when;
    if (candidate.autoOff !== undefined && candidate.autoOff !== null) {
      action.autoOff = validateAutoOff(candidate.autoOff, action.value);
    }
    rejectForbiddenControl(deviceId, property, lookup);
    return action;
  });
};

export const validateAutomations = (
  value: unknown,
  lookup?: AutomationDeviceLookup,
  groupLookup?: AutomationGroupLookup
): Automation[] => {
  if (!Array.isArray(value) || value.length > maxAutomations) {
    throw new Error("Otomasyonlar geçersiz.");
  }
  const result: Automation[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Otomasyon geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().toLowerCase() : "";
    if (!automationIdPattern.test(id)) throw new Error("Otomasyon kimliği geçersiz.");
    if (ids.has(id)) throw new Error("Otomasyon kimliği yinelenmiş.");
    ids.add(id);
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name || name.length > maxAutomationNameLength) throw new Error("Otomasyon adı geçersiz.");
    // Eski dosyalarda alan hep var ve boş; yokluğunu da kabul ederiz (geriye dönük uyumluluk).
    const conditions = validateConditions(candidate.conditions ?? []);
    const lastRunAt = candidate.lastRunAt;
    if (lastRunAt !== undefined && lastRunAt !== null) {
      if (typeof lastRunAt !== "string" || Number.isNaN(Date.parse(lastRunAt))) {
        throw new Error("Otomasyon son çalışma zamanı geçersiz.");
      }
    }
    const lastRunOk = candidate.lastRunOk;
    if (lastRunOk !== undefined && lastRunOk !== null && typeof lastRunOk !== "boolean") {
      throw new Error("Otomasyon son çalışma sonucu geçersiz.");
    }
    const triggers = validateTriggers(candidate.triggers);
    const actions = validateActions(candidate.actions, lookup, groupLookup);
    // Yalnız beklemeden oluşan bir kural hiçbir şey yapmaz; kullanıcı hatasıdır.
    if (actions.every((action) => action.type === "delay")) {
      throw new Error("Otomasyonda en az bir gerçek eylem olmalıdır.");
    }
    // §9 — "hareket bitince kapat" ölçütü jeneriktir: kuralın kendi tetikleyicisinin **tetikleyen
    // değerinden çıkması** demektir. Bu yüzden `equals` taşıyan bir durum tetikleyicisi şart;
    // sensör modeli listesi yoktur. Her değişimde tetiklenen kuralda "bitiş" tanımsızdır.
    if (actions.some((action) => isAutomationDeviceAction(action) && action.autoOff?.mode === "idle")) {
      const watchable = triggers.some((trigger) =>
        trigger.type === "deviceState" && trigger.equals !== undefined);
      if (!watchable) {
        throw new Error(
          "Hareket bitince kapatma için durum bildiren bir tetikleyici gerekir."
        );
      }
    }
    // §8.2 — geri besleme döngüsü kaydetme anında reddedilir, çalışma zamanında değil.
    // Koruma kanal granülerliğinde: çok kanallı anahtarda bir kanal tetikleyip komşu kanalı
    // çalıştırmak geçerlidir; yasak olan yalnızca kanalın kendi kendini tetiklemesidir.
    // Düğme tetikleyicisinde kanal (property) yoktur; orada cihaz granülerliği korunur.
    const deviceActions = actions.filter(isAutomationDeviceAction);
    const actionDeviceIds = new Set(deviceActions.map((action) => action.deviceId));
    const actionChannels = new Set(deviceActions.map((action) => automationChannelKey(action)));
    // Grup eylemi de üyelerinin kanallarını yazar; üyeler çözülebiliyorsa döngü orada da aranır.
    for (const action of actions) {
      if (action.type !== "group") continue;
      for (const memberId of groupLookup?.(action.groupId)?.memberIds ?? []) {
        actionDeviceIds.add(memberId);
        actionChannels.add(automationChannelKey({ deviceId: memberId, property: action.property }));
      }
    }
    for (const trigger of triggers) {
      if (isAutomationScheduleTrigger(trigger)) continue;
      const looped = trigger.type === "deviceState"
        ? actionChannels.has(automationChannelKey(trigger))
        : actionDeviceIds.has(trigger.deviceId);
      if (looped) {
        throw new Error(
          "Bir otomasyon kendi çalıştırdığı kanal tarafından tetiklenemez; döngü oluşur."
        );
      }
    }
    result.push({
      id,
      name,
      enabled: candidate.enabled !== false,
      triggers,
      conditions,
      actions,
      lastRunAt: typeof lastRunAt === "string" ? lastRunAt : null,
      lastRunOk: typeof lastRunOk === "boolean" ? lastRunOk : null
    });
  }
  return result;
};

/**
 * Cihaz silindiğinde o cihaza bağlı eylemler ve olay tetikleyicileri düşer;
 * eylemi ya da tetikleyicisi kalmayan otomasyon da silinir.
 */
export const removeDeviceFromAutomations = (
  automations: Automation[],
  deviceId: string
): Automation[] => {
  const normalizedId = deviceId.trim().toLowerCase();
  return automations
    .map((automation) => ({
      ...automation,
      triggers: automation.triggers.filter((trigger) =>
        isAutomationScheduleTrigger(trigger) || trigger.deviceId !== normalizedId),
      // Silinen cihaza bakan bir koşul sonsuza kadar `false` kalır ve kuralı sessizce öldürürdü;
      // koşul düşer, kural görünür kalır.
      conditions: automation.conditions.filter((condition) =>
        condition.type !== "deviceState" || condition.deviceId !== normalizedId),
      actions: automation.actions.filter((action) =>
        !isAutomationDeviceAction(action) || action.deviceId !== normalizedId)
    }))
    .filter((automation) =>
      automation.triggers.length > 0
      && automation.actions.some((action) => action.type !== "delay"));
};

/**
 * Bekleyen bir "sonra kapat" — süreç yeniden başlasa da unutulmaz. Işığı açan komut zaten
 * çalıştı; kapatma sözü o komutun parçasıdır, bu yüzden kalıcı tutulur.
 */
export interface AutomationAutoOffEntry {
  automationId: string;
  /** Yalnızca günlük metni için; kural silinse bile söz yerine getirilir. */
  automationName: string;
  deviceId: string;
  property: string;
  /** Geri alınırken yazılacak değer. */
  value: JsonScalar;
  /** Eylemin yazdığı değer — hedef bunun dışına çıktıysa niyet kullanıcınındır. */
  appliedValue: JsonScalar;
  mode: "after" | "idle";
  seconds: number;
  /** Sayaç işliyorsa bitiş anı (ISO); `idle` hareket beklerken null. */
  dueAt: string | null;
  /** `idle` için izlenen tetikleyici kanal. */
  watch: { deviceId: string; property: string; activeValue: JsonScalar } | null;
}

const autoOffDeviceId = (value: unknown, label: string): string => {
  const deviceId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!deviceIdPattern.test(deviceId)) throw new Error(`${label} cihaz UID'si geçersiz.`);
  return deviceId;
};

const autoOffProperty = (value: unknown, label: string): string => {
  const property = typeof value === "string" ? value.trim() : "";
  if (!propertyPattern.test(property)) throw new Error(`${label} cihaz özelliği geçersiz.`);
  return property;
};

export const validateAutomationAutoOffEntries = (value: unknown): AutomationAutoOffEntry[] => {
  if (!Array.isArray(value) || value.length > maxAutomationAutoOffEntries) {
    throw new Error("Bekleyen otomatik kapatmalar geçersiz.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Bekleyen otomatik kapatma geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
    const automationId = typeof candidate.automationId === "string"
      ? candidate.automationId.trim().toLowerCase()
      : "";
    if (!automationIdPattern.test(automationId)) {
      throw new Error("Bekleyen otomatik kapatma otomasyon kimliği geçersiz.");
    }
    if (!isJsonScalar(candidate.value) || !isJsonScalar(candidate.appliedValue)) {
      throw new Error("Bekleyen otomatik kapatma değeri geçersiz.");
    }
    if (candidate.mode !== "after" && candidate.mode !== "idle") {
      throw new Error("Bekleyen otomatik kapatma türü geçersiz.");
    }
    const seconds = candidate.seconds;
    if (
      typeof seconds !== "number"
      || !Number.isInteger(seconds)
      || seconds < 0
      || seconds > maxAutomationAutoOffSeconds
    ) {
      throw new Error("Bekleyen otomatik kapatma süresi geçersiz.");
    }
    const dueAt = candidate.dueAt;
    if (dueAt !== undefined && dueAt !== null) {
      if (typeof dueAt !== "string" || Number.isNaN(Date.parse(dueAt))) {
        throw new Error("Bekleyen otomatik kapatma zamanı geçersiz.");
      }
    }
    let watch: AutomationAutoOffEntry["watch"] = null;
    if (candidate.watch !== undefined && candidate.watch !== null) {
      const raw = candidate.watch;
      if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Bekleyen otomatik kapatma izlemesi geçersiz.");
      }
      const source = raw as Record<string, unknown>;
      if (!isJsonScalar(source.activeValue)) {
        throw new Error("Bekleyen otomatik kapatma izleme değeri geçersiz.");
      }
      watch = {
        deviceId: autoOffDeviceId(source.deviceId, "Bekleyen otomatik kapatma izlemesi"),
        property: autoOffProperty(source.property, "Bekleyen otomatik kapatma izlemesi"),
        activeValue: source.activeValue
      };
    }
    const name = typeof candidate.automationName === "string"
      ? candidate.automationName.trim().slice(0, maxAutomationNameLength)
      : "";
    return {
      automationId,
      automationName: name || automationId,
      deviceId: autoOffDeviceId(candidate.deviceId, "Bekleyen otomatik kapatma"),
      property: autoOffProperty(candidate.property, "Bekleyen otomatik kapatma"),
      value: candidate.value,
      appliedValue: candidate.appliedValue,
      mode: candidate.mode,
      seconds,
      dueAt: typeof dueAt === "string" ? dueAt : null,
      watch
    } satisfies AutomationAutoOffEntry;
  });
};

/** Bekleyen kapatmaların durum dosyası — `aliases.ts` deseniyle atomik yazılır. */
export class AutomationAutoOffStore {
  constructor(private readonly path: string) {}

  async get(): Promise<AutomationAutoOffEntry[]> {
    try {
      return validateAutomationAutoOffEntries(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(entries: AutomationAutoOffEntry[]): Promise<void> {
    const validated = validateAutomationAutoOffEntries(entries);
    await writeJsonAtomic(this.path, validated, { mode: 0o600 });
  }
}

interface AutomationsCacheEntry {
  /** Nanosaniye çözünürlüklü değişiklik damgası ve boyut — ikisi de aynıysa dosya aynıdır. */
  mtimeNs: bigint;
  size: bigint;
  /** Doğrulamanın dayandığı cihaz topolojisi sürümü; değişirse yeniden doğrulanır. */
  lookupRevision: number;
  automations: Automation[];
}

export class AutomationsStore {
  private cache: AutomationsCacheEntry | null = null;

  constructor(
    private readonly path: string,
    private readonly lookup?: AutomationDeviceLookup,
    /**
     * Cihaz topolojisi sürümü. `lookup` yalnızca kumanda türlerine bakar; bunlar da yalnızca
     * cihaz listesi değişince değişir. Sürüm verilmezse önbellek dosya damgasına dayanır.
     */
    private readonly lookupRevision?: () => number,
    /** Grup eylemlerinin üyelerini çözer; verilmezse grup içi kilit/siren denetimi atlanır. */
    private readonly groupLookup?: AutomationGroupLookup
  ) {}

  /**
   * Otomasyonlar her cihaz olayında okunur (§6). Diskten okuyup 64 kuralı yeniden doğrulamak
   * olay başına milisaniyeler yiyordu; dosya damgası değişmedikçe önbellekten dönülür.
   */
  async get(): Promise<Automation[]> {
    let stamp: { mtimeNs: bigint; size: bigint } | null = null;
    try {
      const info = await stat(this.path, { bigint: true });
      stamp = { mtimeNs: info.mtimeNs, size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cache = null;
      return [];
    }
    const revision = this.lookupRevision?.() ?? 0;
    const cached = this.cache;
    if (
      cached
      && cached.mtimeNs === stamp.mtimeNs
      && cached.size === stamp.size
      && cached.lookupRevision === revision
    ) {
      return cached.automations.slice();
    }
    let automations: Automation[];
    try {
      automations = validateAutomations(
        JSON.parse(await readFile(this.path, "utf8")),
        this.lookup,
        this.groupLookup
      );
    } catch (error) {
      this.cache = null;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    this.cache = { ...stamp, lookupRevision: revision, automations };
    return automations.slice();
  }

  async save(value: unknown): Promise<Automation[]> {
    const automations = validateAutomations(value, this.lookup, this.groupLookup);
    await writeJsonAtomic(this.path, automations, { mode: 0o600 });
    await this.remember(automations);
    return automations;
  }

  /** Yazdıktan sonra önbelleği taze damgayla tazeler; aynı milisaniyede yazma yarışı kalmasın. */
  private async remember(automations: Automation[]): Promise<void> {
    try {
      const info = await stat(this.path, { bigint: true });
      this.cache = {
        mtimeNs: info.mtimeNs,
        size: info.size,
        lookupRevision: this.lookupRevision?.() ?? 0,
        automations
      };
    } catch {
      this.cache = null;
    }
  }

  async removeDevice(deviceId: string): Promise<Automation[]> {
    return this.save(removeDeviceFromAutomations(await this.get(), deviceId));
  }

  async markRun(id: string, ok: boolean, at: Date = new Date()): Promise<Automation[]> {
    const automations = await this.get();
    const normalizedId = id.trim().toLowerCase();
    if (!automations.some((automation) => automation.id === normalizedId)) return automations;
    return this.save(automations.map((automation) => automation.id === normalizedId
      ? { ...automation, lastRunAt: at.toISOString(), lastRunOk: ok }
      : automation));
  }
}
