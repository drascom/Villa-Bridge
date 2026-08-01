import { readFile, rename, writeFile } from "node:fs/promises";

export interface HomeGroupItem {
  deviceId: string;
  controlId: string;
}

export interface HomeGroup {
  id: string;
  name: string;
  items: HomeGroupItem[];
}

export const homeGroupDeviceControlId = "@device";
export const maxHomeGroups = 32;
export const maxHomeGroupItems = 64;
export const maxHomeGroupNameLength = 64;

export const validateHomeGroups = (value: unknown): HomeGroup[] => {
  if (!Array.isArray(value) || value.length > maxHomeGroups) {
    throw new Error("Ana ekran grupları geçersiz.");
  }
  const result: HomeGroup[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Ana ekran grubu geçersiz.");
    }
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().toLowerCase() : "";
    if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error("Ana ekran grubu kimliği geçersiz.");
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name || name.length > maxHomeGroupNameLength) {
      throw new Error("Ana ekran grubu adı geçersiz.");
    }
    if (!Array.isArray(candidate.items) || candidate.items.length > maxHomeGroupItems) {
      throw new Error("Ana ekran grubu öğeleri geçersiz.");
    }
    const items: HomeGroupItem[] = [];
    const keys = new Set<string>();
    for (const item of candidate.items) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error("Ana ekran grubu öğesi geçersiz.");
      }
      const member = item as Record<string, unknown>;
      const deviceId = typeof member.deviceId === "string" ? member.deviceId.trim().toLowerCase() : "";
      const controlId = typeof member.controlId === "string" ? member.controlId.trim().toLowerCase() : "";
      if (!/^0x[0-9a-f]{16}$/.test(deviceId) || !/^[a-z0-9:_@-]{1,64}$/.test(controlId)) {
        throw new Error("Ana ekran grubu öğesi UID veya kontrol kimliği geçersiz.");
      }
      const key = `${deviceId}|${controlId}`;
      if (keys.has(key)) continue;
      keys.add(key);
      items.push({ deviceId, controlId });
    }
    if (ids.has(id)) continue;
    ids.add(id);
    result.push({ id, name, items });
  }
  return result;
};

export const removeDeviceFromHomeGroups = (groups: HomeGroup[], deviceId: string): HomeGroup[] => {
  const normalizedId = deviceId.trim().toLowerCase();
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.deviceId !== normalizedId)
  }));
};

export class HomeGroupsStore {
  constructor(private readonly path: string) {}

  async get(): Promise<HomeGroup[]> {
    try {
      return validateHomeGroups(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(value: unknown): Promise<HomeGroup[]> {
    const groups = validateHomeGroups(value);
    const temporary = `${this.path}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(groups, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    return groups;
  }

  async removeDevice(deviceId: string): Promise<HomeGroup[]> {
    return this.save(removeDeviceFromHomeGroups(await this.get(), deviceId));
  }
}
