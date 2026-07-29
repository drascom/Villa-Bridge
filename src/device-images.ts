import { readFile, rename, writeFile } from "node:fs/promises";
import type { DeviceImageCandidate, DeviceImageView } from "./types.js";

export interface DeviceImagePreferences {
  devices: Record<string, string | null>;
  models: Record<string, string | null>;
}

const emptyPreferences = (): DeviceImagePreferences => ({ devices: {}, models: {} });
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const genericCandidates = new Map<string, DeviceImageCandidate[]>([
  ["TS0001", [
    { model: "WHD02", label: "miniModule" },
    { model: "TS0001_switch_module_1", label: "switchModule" },
    { model: "TS0001_switch_1_gang", label: "wallSwitch" },
    { model: "TS0001", label: "otherSwitch" }
  ]]
]);

const canonicalModels = new Map<string, string>([
  ["TS0001::_TZ3000_i9oy2rdq", "WHD02"]
]);

function validateMap(value: unknown): Record<string, string | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Record<string, string | null> = {};
  for (const [key, selected] of Object.entries(value)) {
    if (typeof selected === "string" || selected === null) result[key] = selected;
  }
  return result;
}

export function validateDeviceImagePreferences(value: unknown): DeviceImagePreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return emptyPreferences();
  const candidate = value as Record<string, unknown>;
  return {
    devices: validateMap(candidate.devices),
    models: validateMap(candidate.models)
  };
}

export function deviceImageKey(
  reportedModel: string | null | undefined,
  manufacturer: string | null | undefined
): string {
  return `${reportedModel?.trim() || "unknown"}::${manufacturer?.trim() || "unknown"}`;
}

export function resolveDeviceImage(
  deviceId: string,
  reportedModel: string | null | undefined,
  manufacturer: string | null | undefined,
  preferences: DeviceImagePreferences
): DeviceImageView {
  const model = reportedModel?.trim() || null;
  const key = deviceImageKey(model, manufacturer);
  const canonicalModel = model ? canonicalModels.get(key) ?? model : null;
  const candidates = model
    ? genericCandidates.get(model)?.map((candidate) => ({ ...candidate }))
      ?? [{ model: canonicalModel as string, label: "catalogMatch" }]
    : [];
  if (canonicalModel && !candidates.some((candidate) => candidate.model === canonicalModel)) {
    candidates.unshift({ model: canonicalModel, label: "catalogMatch" });
  }
  const normalizedId = deviceId.toLowerCase();
  const deviceSelected = own(preferences.devices, normalizedId);
  const modelSelected = own(preferences.models, key);
  const selected = deviceSelected
    ? preferences.devices[normalizedId]
    : modelSelected
      ? preferences.models[key]
      : canonicalModel;
  return {
    model: selected ?? null,
    candidates,
    selectionRequired: candidates.length > 1 && !canonicalModels.has(key) && !deviceSelected && !modelSelected,
    userSelected: deviceSelected || modelSelected,
    preferenceKey: key
  };
}

export class DeviceImagesStore {
  constructor(private readonly path: string) {}

  async get(): Promise<DeviceImagePreferences> {
    try {
      return validateDeviceImagePreferences(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyPreferences();
      throw error;
    }
  }

  async save(preferences: DeviceImagePreferences): Promise<DeviceImagePreferences> {
    const validated = validateDeviceImagePreferences(preferences);
    const temporary = `${this.path}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    return validated;
  }

  async select(
    preferences: DeviceImagePreferences,
    deviceId: string,
    preferenceKey: string,
    imageModel: string | null,
    applyToModel: boolean
  ): Promise<DeviceImagePreferences> {
    const next = validateDeviceImagePreferences(preferences);
    next.devices[deviceId.toLowerCase()] = imageModel;
    if (applyToModel) next.models[preferenceKey] = imageModel;
    return this.save(next);
  }

  async removeDevice(
    preferences: DeviceImagePreferences,
    deviceId: string
  ): Promise<DeviceImagePreferences> {
    const next = validateDeviceImagePreferences(preferences);
    delete next.devices[deviceId.toLowerCase()];
    return this.save(next);
  }
}
