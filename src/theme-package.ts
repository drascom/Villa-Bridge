import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const themeColorTokens = [
  "page", "ink", "inkSoft", "glassCard", "glassTile", "glassNav", "glassEdge", "glassSheen",
  "accent", "accentSoft", "stateOn", "stateActive", "stateAlert", "stateOffline", "skyTop",
  "skyBottom", "sun", "moon", "stars", "mountainFar", "mountainNear"
] as const;

export type ThemeColorToken = (typeof themeColorTokens)[number];
export type ThemeColors = Record<ThemeColorToken, string>;

export interface ThemeMaterials {
  blur: number;
  saturation: number;
  brightness: number;
  shadow: "none" | "soft" | "floating";
}

export interface ThemePalette {
  colors: ThemeColors;
  materials: ThemeMaterials;
}

export interface ThemePackage {
  schemaVersion: 1;
  id: string;
  name: string;
  author: string;
  behaviors: {
    light: "fixed-light-v1";
    dark: "fixed-dark-v1";
    system: "system-v1";
    sun: "solar-v1";
  };
  palettes: {
    light: ThemePalette;
    dark: ThemePalette;
    solar: {
      anchors: Record<"night" | "dawn" | "day" | "dusk", ThemePalette>;
    };
  };
}

const colorPattern = /^(?:#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i;
const idPattern = /^[a-z0-9][a-z0-9-]{1,62}$/;

const record = (value: unknown, message: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
};

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[], label: string): void => {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new Error(`${label}: bilinmeyen ${key} alanı.`);
  for (const key of allowed) if (!(key in value)) throw new Error(`${label}: ${key} alanı eksik.`);
};

const normalizeColor = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length > 64 || !colorPattern.test(value.trim())) {
    throw new Error(`${label}: renk yalnız #RRGGBB, #RRGGBBAA, rgb() veya rgba() olabilir.`);
  }
  return value.trim().toLowerCase();
};

const validatePalette = (value: unknown, label: string): ThemePalette => {
  const palette = record(value, `${label}: palet geçersiz.`);
  exactKeys(palette, ["colors", "materials"], label);
  const colors = record(palette.colors, `${label}: renkler geçersiz.`);
  exactKeys(colors, themeColorTokens, `${label}.colors`);
  const normalizedColors = Object.fromEntries(
    themeColorTokens.map((token) => [token, normalizeColor(colors[token], `${label}.${token}`)])
  ) as unknown as ThemeColors;
  const materials = record(palette.materials, `${label}: malzeme geçersiz.`);
  exactKeys(materials, ["blur", "saturation", "brightness", "shadow"], `${label}.materials`);
  const blur = Number(materials.blur);
  const saturation = Number(materials.saturation);
  const brightness = Number(materials.brightness);
  const shadow = materials.shadow;
  if (!Number.isFinite(blur) || blur < 0 || blur > 30) throw new Error(`${label}: blur 0..30 olmalıdır.`);
  if (!Number.isFinite(saturation) || saturation < 0.5 || saturation > 2) {
    throw new Error(`${label}: saturation 0.5..2 olmalıdır.`);
  }
  if (!Number.isFinite(brightness) || brightness < 0.5 || brightness > 1.5) {
    throw new Error(`${label}: brightness 0.5..1.5 olmalıdır.`);
  }
  if (shadow !== "none" && shadow !== "soft" && shadow !== "floating") {
    throw new Error(`${label}: gölge profili geçersiz.`);
  }
  return { colors: normalizedColors, materials: { blur, saturation, brightness, shadow } };
};

export const validateThemePackage = (value: unknown): ThemePackage => {
  const source = record(value, "Tema paketi geçersiz.");
  exactKeys(source, ["schemaVersion", "id", "name", "author", "behaviors", "palettes"], "theme");
  if (source.schemaVersion !== 1) throw new Error("Tema şema sürümü desteklenmiyor.");
  if (typeof source.id !== "string" || !idPattern.test(source.id)) throw new Error("Tema kimliği geçersiz.");
  if (typeof source.name !== "string" || source.name.trim().length < 2 || source.name.length > 80) {
    throw new Error("Tema adı geçersiz.");
  }
  if (typeof source.author !== "string" || source.author.trim().length < 2 || source.author.length > 80) {
    throw new Error("Tema yazarı geçersiz.");
  }
  const behaviors = record(source.behaviors, "Tema davranışları geçersiz.");
  exactKeys(behaviors, ["light", "dark", "system", "sun"], "behaviors");
  if (
    behaviors.light !== "fixed-light-v1" || behaviors.dark !== "fixed-dark-v1"
    || behaviors.system !== "system-v1" || behaviors.sun !== "solar-v1"
  ) throw new Error("Tema paketi bilinmeyen davranış istiyor.");
  const palettes = record(source.palettes, "Tema paletleri geçersiz.");
  exactKeys(palettes, ["light", "dark", "solar"], "palettes");
  const solar = record(palettes.solar, "Solar palet geçersiz.");
  exactKeys(solar, ["anchors"], "palettes.solar");
  const anchors = record(solar.anchors, "Solar duraklar geçersiz.");
  exactKeys(anchors, ["night", "dawn", "day", "dusk"], "palettes.solar.anchors");
  return {
    schemaVersion: 1,
    id: source.id,
    name: source.name.trim(),
    author: source.author.trim(),
    behaviors: {
      light: "fixed-light-v1",
      dark: "fixed-dark-v1",
      system: "system-v1",
      sun: "solar-v1"
    },
    palettes: {
      light: validatePalette(palettes.light, "palettes.light"),
      dark: validatePalette(palettes.dark, "palettes.dark"),
      solar: {
        anchors: {
          night: validatePalette(anchors.night, "solar.night"),
          dawn: validatePalette(anchors.dawn, "solar.dawn"),
          day: validatePalette(anchors.day, "solar.day"),
          dusk: validatePalette(anchors.dusk, "solar.dusk")
        }
      }
    }
  };
};

export const loadThemePackages = async (directory: string): Promise<ThemePackage[]> => {
  const packages: ThemePackage[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(directory, entry.name, "theme.json");
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text, "utf8") > 64 * 1024) throw new Error(`${entry.name}: tema paketi 64 KB sınırını aşıyor.`);
    const theme = validateThemePackage(JSON.parse(text));
    if (packages.some((item) => item.id === theme.id)) throw new Error(`${theme.id}: yinelenen tema kimliği.`);
    packages.push(theme);
  }
  return packages;
};
