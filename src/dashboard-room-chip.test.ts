import assert from "node:assert/strict";
import test from "node:test";
import { panelStyles } from "./panel-source.js";

/* Cihazlar sayfasındaki oda süzgeci: seçili çip kendi koyu zeminini taşır. Arka plan fotoğrafını
   alt sayfalara yayan cam kural bir dönem TÜM çipleri saydam açık dolguya çevirdiği için seçili
   çipin yazısı zeminine gömülüyordu. Buradaki iddialar o kuralın seçili çipi kapsamadığını ve
   ortaya çıkan zemin/metin çiftinin iki temada da okunur kaldığını sabitler. */

interface CssRule {
  selector: string;
  declarations: string;
}

/** Stil metnini kaba kural listesine böler; iç içe brace olmadığı için @media içi kurallar da düşer. */
function readRules(styles: string): CssRule[] {
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, " "),
    declarations: match[2].trim()
  }));
}

/** `:root` bloklarından bir renk belirtecinin değerini okur. */
function readToken(styles: string, block: string, token: string): string {
  const rules = readRules(styles).filter((rule) => rule.selector.endsWith(block));
  for (const rule of rules) {
    const found = rule.declarations.match(new RegExp(`${token}:(#[0-9a-f]{3,6})`, "i"));
    if (found) return found[1];
  }
  throw new Error(`${block} içinde ${token} bulunamadı.`);
}

function channelLuminance(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const red = channelLuminance(Number.parseInt(full.slice(1, 3), 16));
  const green = channelLuminance(Number.parseInt(full.slice(3, 5), 16));
  const blue = channelLuminance(Number.parseInt(full.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG kontrast oranı; 1 (aynı renk) ile 21 (siyah–beyaz) arasında. */
function contrastRatio(first: string, second: string): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

test("seçili oda çipinin zemini cam kural tarafından ezilmiyor", async () => {
  const styles = await panelStyles();
  const glassRules = readRules(styles).filter((rule) => rule.declarations.includes("background:var(--home-control)"));

  assert.ok(glassRules.length > 0, "cam dolgu kuralı bulunamadı");
  const chipRules = glassRules.filter((rule) => rule.selector.includes("room-chip"));
  assert.equal(chipRules.length, 1, "çipe cam dolgu veren kural sayısı beklenenden farklı");
  for (const rule of chipRules) {
    // Negatif iddia: cam dolgunun hedefinde çıplak `.room-chip` yok, yalnız seçili olmayanı var.
    assert.doesNotMatch(rule.selector, /\.room-chip(?!:not\(\.active\))/, `cam dolgu seçili çipi kapsıyor: ${rule.selector}`);
  }
});

test("seçili oda çipi kendi koyu yeşil zeminini ve metin rengini koruyor", async () => {
  const styles = await panelStyles();

  assert.match(styles, /\.room-chip\.active\{border-color:var\(--forest\);color:var\(--on-forest\);background:var\(--forest\)\}/);
  // Gölge dışlamasız kaldı: seçili çip de diğerleriyle aynı düzlemde durur.
  assert.match(styles, /body:not\(\[data-active-view="home"\]\) \.view :where\(\.device-card,\.room-chip\)\{box-shadow:var\(--home-float-shadow\)\}/);
  assert.doesNotMatch(styles, /color-mix\(/);
});

test("seçili oda çipinin yazısı iki temada da okunur", async () => {
  const styles = await panelStyles();

  for (const block of [":root", ':root[data-theme="dark"]']) {
    const surface = readToken(styles, block, "--forest");
    const text = readToken(styles, block, "--on-forest");
    const ratio = contrastRatio(surface, text);
    assert.ok(ratio >= 4.5, `${block}: ${text} / ${surface} kontrastı yetersiz (${ratio.toFixed(2)})`);
  }

  // Cam dolgu geri gelirse yazı zemine gömülür; iki temada da eşiğin altına düşen çift budur.
  for (const [block, control] of [[":root", "#fbfcfc"], [':root[data-theme="dark"]', "#161f1b"]] as const) {
    const text = readToken(styles, block, "--on-forest");
    assert.ok(contrastRatio(control, text) < 4.5, `${block}: cam dolgu üstünde metin okunur çıktı, iddia anlamsız`);
  }
});
