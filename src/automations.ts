import { readFile, rename, writeFile } from "node:fs/promises";
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
 * Sensör/cihaz durumu — yalnızca kenarda, yani değer değiştiğinde tetiklenir.
 * `equals` verilirse yalnızca o değere geçişte, verilmezse **her** değişimde tetiklenir (§5.2).
 */
export interface AutomationDeviceStateTrigger {
  type: "deviceState";
  /** IEEE adresi — kanonik bağ. */
  deviceId: string;
  /** MQTT özellik anahtarı, örn. "occupancy". */
  property: string;
  /** Yoksa özelliğin her değişimi tetikler. */
  equals?: JsonScalar;
}

export type AutomationTrigger =
  | AutomationTimeTrigger
  | AutomationDeviceActionTrigger
  | AutomationDeviceStateTrigger;

/** Olay akışına bağlanan tetikleyiciler — zaman tetikleyicisi buraya girmez. */
export type AutomationEventTrigger =
  | AutomationDeviceActionTrigger
  | AutomationDeviceStateTrigger;

/** Faz 1'de koşul türü yok; alan veri modelinde yer tutucu olarak duruyor. */
export type AutomationCondition = never;

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

export type AutomationAction = AutomationDeviceAction;

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

export const maxAutomations = 64;
export const maxAutomationTriggers = 8;
export const maxAutomationConditions = 4;
export const maxAutomationActions = 8;
export const maxAutomationNameLength = 64;
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
      return trigger;
    }
    if (candidate.type !== "time") {
      throw new Error("Otomasyon tetikleyici türü bu sürümde desteklenmiyor.");
    }
    const at = typeof candidate.at === "string" ? candidate.at.trim() : "";
    if (!timePattern.test(at)) throw new Error("Otomasyon saati geçersiz.");
    if (!Array.isArray(candidate.days) || candidate.days.length === 0) {
      throw new Error("Otomasyon günleri geçersiz.");
    }
    const days: number[] = [];
    for (const day of candidate.days) {
      if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 7) {
        throw new Error("Otomasyon günleri geçersiz.");
      }
      if (!days.includes(day)) days.push(day);
    }
    days.sort((left, right) => left - right);
    return { type: "time", at, days } satisfies AutomationTimeTrigger;
  });
};

/** §5.2 — olay tetikleyicilerinin dinlediği cihaz kimlikleri. */
export const automationTriggerDeviceIds = (automation: Automation): string[] => {
  const ids: string[] = [];
  for (const trigger of automation.triggers) {
    if (trigger.type === "time") continue;
    if (!ids.includes(trigger.deviceId)) ids.push(trigger.deviceId);
  }
  return ids;
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

const validateActions = (value: unknown, lookup?: AutomationDeviceLookup): AutomationAction[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxAutomationActions) {
    throw new Error("Otomasyon eylemleri geçersiz.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Otomasyon eylemi geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
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
    if (candidate.when !== undefined && candidate.when !== null) {
      action.when = validateActionWhen(candidate.when);
    }
    if (candidate.autoOff !== undefined && candidate.autoOff !== null) {
      action.autoOff = validateAutoOff(candidate.autoOff, action.value);
    }
    const control = lookup?.(deviceId)?.controls.find((item) => item.property === property);
    if (control && forbiddenAutomationControlKinds.has(control.kind)) {
      throw new Error("Kilit ve siren bir otomasyon eylemi olamaz.");
    }
    return action;
  });
};

export const validateAutomations = (
  value: unknown,
  lookup?: AutomationDeviceLookup
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
    if (
      !Array.isArray(candidate.conditions)
      || candidate.conditions.length > maxAutomationConditions
    ) {
      throw new Error("Otomasyon koşulları geçersiz.");
    }
    if (candidate.conditions.length > 0) {
      throw new Error("Otomasyon koşulları bu sürümde desteklenmiyor.");
    }
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
    const actions = validateActions(candidate.actions, lookup);
    // §9 — "hareket bitince kapat" ölçütü jeneriktir: kuralın kendi tetikleyicisinin **tetikleyen
    // değerinden çıkması** demektir. Bu yüzden `equals` taşıyan bir durum tetikleyicisi şart;
    // sensör modeli listesi yoktur. Her değişimde tetiklenen kuralda "bitiş" tanımsızdır.
    if (actions.some((action) => action.autoOff?.mode === "idle")) {
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
    const actionDeviceIds = new Set(actions.map((action) => action.deviceId));
    const actionChannels = new Set(actions.map((action) => automationChannelKey(action)));
    for (const trigger of triggers) {
      if (trigger.type === "time") continue;
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
      conditions: [],
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
        trigger.type === "time" || trigger.deviceId !== normalizedId),
      actions: automation.actions.filter((action) => action.deviceId !== normalizedId)
    }))
    .filter((automation) => automation.actions.length > 0 && automation.triggers.length > 0);
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
    const temporary = `${this.path}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export class AutomationsStore {
  constructor(
    private readonly path: string,
    private readonly lookup?: AutomationDeviceLookup
  ) {}

  async get(): Promise<Automation[]> {
    try {
      return validateAutomations(JSON.parse(await readFile(this.path, "utf8")), this.lookup);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(value: unknown): Promise<Automation[]> {
    const automations = validateAutomations(value, this.lookup);
    const temporary = `${this.path}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(automations, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    return automations;
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
