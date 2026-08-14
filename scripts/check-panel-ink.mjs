/*
 * KOYU KALAN YUZEYLERIN MUREKKEBI — STATIK DENETIM.
 *
 * Panelde ayni hata iki kez cikti: kopru (`:root[data-theme-package]`) `--ink`/`--muted`/
 * `--glass-ink*` ailesini paketin O ANKI faz murekkebine bagliyor, ama yuzeyi gokyuzuyle
 * DONMEYEN oglelerde (menu levhasi, hizli kumanda penceresi) bu koyu ustune koyu demek.
 * Cozum tek iliskiye indirildi: "yuzey koyu kaliyorsa murekkep `--on-dark-*` kumesinden gelir."
 *
 * Bu denetim o iliskiyi ayakta tutar:
 *   1) panel.css icindeki KOYU YUZEY blogundaki her bildirim `var(--on-dark-*)` okumali —
 *      bloga ciplak renk (hex/rgb) ya da baska bir token sizarsa hata,
 *   2) kural koke degil YUZEY listesine uygulanmali (koke uygulanirsa tum panel koyu murekkebe
 *      doner),
 *   3) blogun okudugu her `--on-dark-*` adi gercekten uretilmeli ve iki kaynak (panel.css'teki
 *      ilk kare yedegi ile `public/js/82-theme-packages.js`) ayni kumeyi tanimlamali.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DARK_RULE_MARKER = "KOYU KALAN YÜZEYLER — TEK KURAL, TEK LİSTE";
const FALLBACK_MARKER = "İLK KARE YEDEĞİ.";

function blockAfter(css, marker, label) {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`panel.css icinde isaret bulunamadi (${label}): ${marker}`);
  const open = css.indexOf("{", at);
  if (open < 0) throw new Error(`${label}: isaretten sonra kural blogu yok.`);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return { selector: css.slice(at + marker.length, open), body: css.slice(open + 1, i) };
    }
  }
  throw new Error(`${label}: kural blogu kapanmiyor.`);
}

const declarations = (body) =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(":");
      return { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    })
    .filter((entry) => entry.name.startsWith("--"));

export async function assertPanelInk(projectRoot) {
  const css = await fs.readFile(path.join(projectRoot, "public", "css", "panel.css"), "utf8");
  const js = await fs.readFile(path.join(projectRoot, "public", "js", "82-theme-packages.js"), "utf8");

  const rule = blockAfter(css, DARK_RULE_MARKER, "koyu yuzey kurali");
  const fallback = blockAfter(css, FALLBACK_MARKER, "ilk kare yedegi");

  const used = new Set();
  const bad = [];
  for (const { name, value } of declarations(rule.body)) {
    const match = value.match(/^var\((--on-dark-[a-z-]+)\)$/);
    if (!match) bad.push(`${name}: ${value}`);
    else used.add(match[1]);
  }
  if (bad.length > 0) {
    throw new Error(
      `Koyu yuzey kuralindaki her deger var(--on-dark-*) olmali; su bildirimler degil -> ${bad.join(" | ")}`
    );
  }
  if (used.size === 0) throw new Error("Koyu yuzey kurali bos: hicbir --on-dark-* okunmuyor.");

  // Isaret bir yorumun ICINDE duruyor; secici listesi yorum kapandiktan sonra basliyor.
  const selectorText = rule.selector.slice(rule.selector.indexOf("*/") + 2);
  const selectors = selectorText.split(",").map((item) => item.trim()).filter(Boolean);
  const rootOnly = selectors.filter((item) => /^:root(\[[^\]]+\])*$/.test(item));
  if (rootOnly.length > 0) {
    throw new Error(`Koyu yuzey kurali koke uygulanamaz (yuzey listesi olmali): ${rootOnly.join(" | ")}`);
  }

  const declared = new Set(declarations(fallback.body).map((entry) => entry.name));
  const written = new Set();
  for (const match of js.matchAll(/"(--on-dark-[a-z-]+)"/g)) written.add(match[1]);

  const orphan = [...used].filter((name) => !declared.has(name) && !written.has(name));
  if (orphan.length > 0) {
    throw new Error(`Koyu yuzey kuralinin okudugu token hicbir yerde uretilmiyor: ${orphan.join(", ")}`);
  }
  const missingInJs = [...declared].filter((name) => !written.has(name));
  const missingInCss = [...written].filter((name) => !declared.has(name));
  if (missingInJs.length > 0 || missingInCss.length > 0) {
    throw new Error(
      "Koyu yuzey kumesi iki kaynakta ayni degil -> " +
        `yalniz CSS yedeginde: ${missingInJs.join(", ") || "-"} | yalniz JS'te: ${missingInCss.join(", ") || "-"}`
    );
  }
  return { tokens: [...declared].sort(), surfaces: selectors.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectRoot = path.resolve(path.dirname(process.argv[1]), "..");
  assertPanelInk(projectRoot)
    .then((result) =>
      console.log(`Koyu yuzey murekkep denetimi tamam: ${result.surfaces} yuzey, ${result.tokens.length} token.`)
    )
    .catch((error) => {
      console.error("Koyu yuzey murekkep denetimi basarisiz:", error.message ?? error);
      process.exitCode = 1;
    });
}
