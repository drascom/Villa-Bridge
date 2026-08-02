import { readFile, rename, writeFile } from "node:fs/promises";
import type { DeviceControlView, JsonScalar } from "./types.js";

export interface AutomationTimeTrigger {
  type: "time";
  /** Yerel saat, "HH:MM". */
  at: string;
  /** 1 = Pazartesi … 7 = Pazar. */
  days: number[];
}

export type AutomationTrigger = AutomationTimeTrigger;

/** Faz 1'de koşul türü yok; alan veri modelinde yer tutucu olarak duruyor. */
export type AutomationCondition = never;

export interface AutomationDeviceAction {
  type: "device";
  /** IEEE adresi — otomasyonun kalıcı bağı. */
  deviceId: string;
  /** MQTT özellik anahtarı. Kanonik hedef budur (örn. "state_l1"). */
  property: string;
  /** DeviceControlView.id — yalnızca sunum için, opsiyonel. */
  controlId?: string;
  value: JsonScalar;
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

/** §8.1 — otomasyonu onaylayacak insan yok; bu kontroller eylem olamaz. */
export const forbiddenAutomationControlKinds: ReadonlySet<string> = new Set(["lock", "siren"]);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const deviceIdPattern = /^0x[0-9a-f]{16}$/;
const propertyPattern = /^[A-Za-z0-9_]{1,64}$/;
const controlIdPattern = /^[a-z0-9:_@-]{1,64}$/;
const automationIdPattern = /^[a-z0-9-]{8,32}$/;

const isJsonScalar = (value: unknown): value is JsonScalar =>
  typeof value === "string"
  || typeof value === "boolean"
  || (typeof value === "number" && Number.isFinite(value));

const validateTriggers = (value: unknown): AutomationTrigger[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxAutomationTriggers) {
    throw new Error("Otomasyon tetikleyicileri geçersiz.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Otomasyon tetikleyicisi geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
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
    result.push({
      id,
      name,
      enabled: candidate.enabled !== false,
      triggers: validateTriggers(candidate.triggers),
      conditions: [],
      actions: validateActions(candidate.actions, lookup),
      lastRunAt: typeof lastRunAt === "string" ? lastRunAt : null,
      lastRunOk: typeof lastRunOk === "boolean" ? lastRunOk : null
    });
  }
  return result;
};

/** Cihaz silindiğinde eylemleri düşer; eylemi kalmayan otomasyon da silinir. */
export const removeDeviceFromAutomations = (
  automations: Automation[],
  deviceId: string
): Automation[] => {
  const normalizedId = deviceId.trim().toLowerCase();
  return automations
    .map((automation) => ({
      ...automation,
      actions: automation.actions.filter((action) => action.deviceId !== normalizedId)
    }))
    .filter((automation) => automation.actions.length > 0);
};

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
