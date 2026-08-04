import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeviceRole, type DeviceRole } from "./device-category.js";

/**
 * Kullanıcının seçtiği cihaz rolleri. UID kuralı: anahtar her zaman değişmez IEEE adresidir,
 * asla dost isim değil. Dosya çözümlenen yapılandırmanın yanında tutulur (depoda değil).
 */
export type DeviceRoleMap = Map<string, DeviceRole>;

const deviceIdPattern = /^0x[0-9a-f]{16}$/;

export function normalizeDeviceRoleId(deviceId: string): string {
  const id = deviceId.trim().toLowerCase();
  if (!deviceIdPattern.test(id)) throw new Error("Cihaz kimliği geçersiz.");
  return id;
}

export function validateDeviceRole(value: unknown): DeviceRole {
  if (!isDeviceRole(value)) throw new Error("Cihaz rolü geçersiz.");
  return value;
}

export async function loadDeviceRoles(path: string): Promise<DeviceRoleMap> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isPlainObject(parsed)) return new Map();
    return new Map(
      Object.entries(parsed)
        .filter((entry): entry is [string, DeviceRole] =>
          deviceIdPattern.test(entry[0].toLowerCase()) && isDeviceRole(entry[1]) && entry[1] !== "auto"
        )
        .map(([id, role]) => [id.toLowerCase(), role])
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    console.warn(`Cihaz rolleri okunamadı: ${error instanceof Error ? error.message : String(error)}`);
    return new Map();
  }
}

export async function saveDeviceRoles(path: string, roles: DeviceRoleMap): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const sorted = Object.fromEntries(
    [...roles.entries()]
      .filter(([, role]) => role !== "auto")
      .sort(([left], [right]) => left.localeCompare(right, "en"))
  );
  await writeFile(temporaryPath, `${JSON.stringify(sorted, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

/** Rolü paylaşılan haritada günceller ve dosyaya atomik yazar. `auto` kaydı siler. */
export async function setDeviceRole(
  path: string,
  roles: DeviceRoleMap,
  deviceId: string,
  value: unknown
): Promise<DeviceRole> {
  const id = normalizeDeviceRoleId(deviceId);
  const role = validateDeviceRole(value);
  if (role === "auto") roles.delete(id);
  else roles.set(id, role);
  await saveDeviceRoles(path, roles);
  return role;
}

export async function removeDeviceRole(
  path: string,
  roles: DeviceRoleMap,
  deviceId: string
): Promise<void> {
  const id = deviceId.trim().toLowerCase();
  if (!roles.delete(id)) return;
  await saveDeviceRoles(path, roles);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
