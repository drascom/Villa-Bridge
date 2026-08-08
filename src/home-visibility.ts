import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "./atomic-file.js";

/**
 * Görünürlük tercihleri — "bu cihazı oda kartında görmek istemiyorum", "bu oda Genel
 * görünümde çıkmasın".
 *
 * Kullanıcı bazlı hesap yok: karar bir kez verilir ve evdeki her ekranda aynıdır. Bu yüzden
 * kayıt sunucuda durur, tarayıcıda değil. Döşeme genişliği ve kart sırası gibi yerleşim
 * tercihleri hâlâ cihazda kalır; onlar ekrana göre değişir.
 *
 * Kayıt yalnız GİZLENENLERİ tutar ve boş başlar: varsayılan her şey görünür, yeni takılan
 * cihaz hiçbir şey yapılmadan odasının kartında çıkar.
 */
export interface HiddenDeviceControl {
  deviceId: string;
  controlId: string;
}

export interface HomeVisibility {
  hiddenDevices: HiddenDeviceControl[];
  hiddenGroups: string[];
}

/**
 * Favorilerdeki 64 sınırı burada dar kalır: favori "yıldızlanan birkaç şey", gizleme ise
 * ev genelinde kontrol başına verilebilen bir karar. Yüz küsur cihazlı bir evde her cihazın
 * birden çok kanalı olabilir; 1024 kayıt bunu rahat karşılar, dosyayı da şişirmez.
 */
export const maxHiddenDevices = 1024;
/** Oda sayısı `maxHomeGroups` (32) ile sınırlı; türetilen kartlarla birlikte 64 fazlasıyla yeter. */
export const maxHiddenGroups = 64;

const deviceIdPattern = /^0x[0-9a-f]{16}$/;
const controlIdPattern = /^[a-z0-9:_@-]{1,64}$/;
/** Oda kimliği ya kullanıcı grubudur (`a1b2-c3d4`) ya da türetilmiş karttır (`auto:lights`). */
const groupIdPattern = /^[a-z0-9:_-]{1,64}$/;
/** Türetilmiş kartlar hiçbir odaya bağlı değildir; oda silinince temizlikte düşmemeliler. */
export const derivedGroupPrefix = "auto:";

const knownKeys = new Set(["hiddenDevices", "hiddenGroups"]);

export const emptyHomeVisibility = (): HomeVisibility => ({ hiddenDevices: [], hiddenGroups: [] });

export const validateHomeVisibility = (value: unknown): HomeVisibility => {
  if (value === undefined || value === null) return emptyHomeVisibility();
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Görünürlük tercihleri geçersiz.");
  }
  const candidate = value as Record<string, unknown>;
  for (const key of Object.keys(candidate)) {
    if (!knownKeys.has(key)) throw new Error(`Görünürlük tercihinde tanınmayan alan: ${key}`);
  }
  const rawDevices = candidate.hiddenDevices ?? [];
  if (!Array.isArray(rawDevices) || rawDevices.length > maxHiddenDevices) {
    throw new Error("Gizlenen cihaz listesi geçersiz.");
  }
  const hiddenDevices: HiddenDeviceControl[] = [];
  const deviceKeys = new Set<string>();
  for (const item of rawDevices) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Gizlenen cihaz kaydı geçersiz.");
    }
    const entry = item as Record<string, unknown>;
    for (const key of Object.keys(entry)) {
      if (key !== "deviceId" && key !== "controlId") {
        throw new Error(`Gizlenen cihaz kaydında tanınmayan alan: ${key}`);
      }
    }
    const deviceId = typeof entry.deviceId === "string" ? entry.deviceId.trim().toLowerCase() : "";
    const controlId = typeof entry.controlId === "string" ? entry.controlId.trim().toLowerCase() : "";
    if (!deviceIdPattern.test(deviceId) || !controlIdPattern.test(controlId)) {
      throw new Error("Gizlenen cihaz UID veya kontrol kimliği geçersiz.");
    }
    const key = `${deviceId}|${controlId}`;
    if (deviceKeys.has(key)) continue;
    deviceKeys.add(key);
    hiddenDevices.push({ deviceId, controlId });
  }
  const rawGroups = candidate.hiddenGroups ?? [];
  if (!Array.isArray(rawGroups) || rawGroups.length > maxHiddenGroups) {
    throw new Error("Gizlenen oda listesi geçersiz.");
  }
  const hiddenGroups: string[] = [];
  for (const item of rawGroups) {
    const groupId = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!groupIdPattern.test(groupId)) throw new Error("Gizlenen oda kimliği geçersiz.");
    if (hiddenGroups.includes(groupId)) continue;
    hiddenGroups.push(groupId);
  }
  return { hiddenDevices, hiddenGroups };
};

export const removeDeviceFromHomeVisibility = (
  visibility: HomeVisibility,
  deviceId: string
): HomeVisibility => {
  const normalizedId = deviceId.trim().toLowerCase();
  return {
    hiddenDevices: visibility.hiddenDevices.filter((entry) => entry.deviceId !== normalizedId),
    hiddenGroups: [...visibility.hiddenGroups]
  };
};

/**
 * Silinen odanın gizleme kaydı düşer. Türetilmiş kartlar (`auto:`) oda listesinde hiç
 * bulunmadığı için korunur; yoksa "Işıklar kartını gizle" tercihi ilk oda kaydında silinirdi.
 */
export const pruneHomeVisibilityGroups = (
  visibility: HomeVisibility,
  knownGroupIds: string[]
): HomeVisibility => {
  const known = new Set(knownGroupIds.map((id) => id.trim().toLowerCase()));
  return {
    hiddenDevices: [...visibility.hiddenDevices],
    hiddenGroups: visibility.hiddenGroups.filter((groupId) =>
      groupId.startsWith(derivedGroupPrefix) || known.has(groupId))
  };
};

export class HomeVisibilityStore {
  constructor(private readonly path: string) {}

  async get(): Promise<HomeVisibility> {
    try {
      return validateHomeVisibility(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHomeVisibility();
      throw error;
    }
  }

  async save(value: unknown): Promise<HomeVisibility> {
    const visibility = validateHomeVisibility(value);
    await writeJsonAtomic(this.path, visibility, { mode: 0o600 });
    return visibility;
  }

  async removeDevice(deviceId: string): Promise<HomeVisibility> {
    return this.save(removeDeviceFromHomeVisibility(await this.get(), deviceId));
  }

  /** Oda listesi değiştiğinde çağrılır; hiçbir odaya karşılık gelmeyen kayıtlar düşer. */
  async pruneGroups(knownGroupIds: string[]): Promise<HomeVisibility> {
    const current = await this.get();
    const pruned = pruneHomeVisibilityGroups(current, knownGroupIds);
    if (pruned.hiddenGroups.length === current.hiddenGroups.length) return current;
    return this.save(pruned);
  }
}
