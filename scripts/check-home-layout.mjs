import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

/* ANA EKRAN 1024x640 — YAPISAL DENETIM.
   Denetimin amaci bir tane: TABLETIN GERCEK CSS ALANINDA (1024x640) ana ekranin tasmamasi.
   Yerlesim degisti, amac degismedi — bu dosya yeni yerlesimi ayni titizlikle dogrular.

   YENI YERLESIM (not §6.1 + §7):
     1) Baslik UC BOLUM: sol = baglam + ekran basligi, orta = birlesik saat/hava, sag = evin
        sagligi (+ pano eylemleri). Saat/hava artik panonun bir KARTI degil, basligin ORTA
        hucresi: ayri kart yok, ikinci satir yok, hub sutunu yok.
     2) Panonun tek sutunu var; ray ve grup paneli tam genislikte. Eski 340px'lik `--hub-column`
        ve rayin ona bagli `padding-left` payi kalkti, hub'i sonduren `hub-hidden` mantigi da.
     3) Ana ekranin boyu SAYIYLA DEGIL AKISLA bulunur: `main` sutun akisi, `#home` esneyen
        eleman. Ustteki seritler (sistem uyarisi, mod seridi, PIN uyarisi) kendi GERCEK boylarini
        alir; panelde onlari taklit eden sabit (`--home-top`, `--admin-strip-h`) YOKTUR.

   ESKI DENETIMIN DEVRALINAN DERSI: metin karsilastirmasi tek basina yetmiyor. Burada iki katman
   var — (a) yapinin kendisi (hangi kural hangi medya blogunda, ne diyor), (b) SAYISAL BUTCE:
   bildirilmis `clamp()`/`calc()` degerleri 1024x640'ta gercekten cozulur ve mod seridinin UC
   halinde de (hic yok / tek satir / iki satir) toplam 640px'e sigar mi diye toplanir. Ikincisi
   olmasa "akis kuruldu ama icerik zaten sigmiyor" hatasi sessizce gecerdi. */

const VIEWPORT = { width: 1024, height: 640 };

/* Kart panosunun altinda kalmasi gereken en az bos alan: panonun kendi `min-height` bildirimi.
   Butce bunun altina duserse kartlar ezilir — sayiyi buraya gomuyoruz, CSS'ten okuyoruz. */
const BODY_FONT_PX = 16; // panelin taban yazi boyu
const TEXT_LINE_RATIO = 1.35; // sarmayan tek satirin kabaca kapladigi yukseklik carpani
const TOUCH_TARGET = 44; // not §7: temel dokunma hedefi

const squeeze = (value) => String(value).replace(/\s+/g, "");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/* --- CSS'i kurallara ayirma -------------------------------------------------------------
   Minik bir ayristirici: her kuralin secicileri, govdesi ve icinde bulundugu medya kosullari.
   `indexOf` ile secici aramak yaniltiyordu (`.home-hub{` metni `#home .home-hub{` icinde de
   geciyor); burada secici TAM olarak eslesir. */
function parseRules(css) {
  const rules = [];
  const media = [];
  let prelude = "";
  let index = 0;
  while (index < css.length) {
    const char = css[index];
    if (char === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head.startsWith("@")) {
        media.push(head);
        index += 1;
        continue;
      }
      let depth = 1;
      let end = index + 1;
      while (end < css.length && depth > 0) {
        if (css[end] === "{") depth += 1;
        else if (css[end] === "}") depth -= 1;
        end += 1;
      }
      rules.push({
        selectors: splitSelectors(head),
        media: media.slice(),
        body: css.slice(index + 1, end - 1),
        at: index
      });
      index = end;
      continue;
    }
    if (char === "}") {
      prelude = "";
      if (media.length) media.pop();
      index += 1;
      continue;
    }
    prelude += char;
    index += 1;
  }
  return rules;
}

/* Secici listesi UST DUZEY virgulden ayrilir: `:where(a,b)` icindeki virgul ayirac degildir.
   Duz `split(",")` burada `.home-hub`i `:where(...)` listesinin icinden cikarip ayri bir kural
   sanryordu — denetim yanlis kurali okuyordu. */
function splitSelectors(head) {
  const out = [];
  let depth = 0;
  let buffer = "";
  for (const char of head) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }
  out.push(buffer.trim());
  return out.filter(Boolean);
}

/** `@media` kosulu verilen goruntu alaninda gecerli mi. Virgul = VEYA, `and` = VE. */
function mediaApplies(condition, viewport) {
  const text = condition.replace(/^@media/, "").trim();
  if (!text) return true;
  return text.split(",").some((arm) =>
    arm
      .split(/\band\b/)
      .map((one) => one.trim())
      .filter(Boolean)
      .every((feature) => featureApplies(feature, viewport))
  );
}

function featureApplies(feature, viewport) {
  const match = /^\(([a-z-]+)\s*:\s*([^)]+)\)$/.exec(squeeze(feature).replace(/\(([a-z-]+):/, "($1:"));
  if (!match) return false;
  const [, name, rawValue] = match;
  const value = rawValue.trim();
  const px = Number.parseFloat(value);
  switch (name) {
    case "orientation":
      return value === "landscape" ? viewport.width >= viewport.height : viewport.width < viewport.height;
    case "min-width":
      return viewport.width >= px;
    case "max-width":
      return viewport.width <= px;
    case "min-height":
      return viewport.height >= px;
    case "max-height":
      return viewport.height <= px;
    case "pointer":
      return value === "coarse"; // duvar tableti dokunmatik
    case "hover":
      return value === "none";
    case "prefers-reduced-motion":
      return false;
    case "prefers-color-scheme":
      return false;
    default:
      return false;
  }
}

/** Govdedeki ust duzey `ad:deger` ciftleri (parantez icindeki `;` yok, ama yine de guvenli). */
function declarations(body) {
  const out = [];
  let depth = 0;
  let buffer = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === ";" && depth === 0) {
      out.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  out.push(buffer);
  return out
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(":");
      return { name: entry.slice(0, at).trim(), value: entry.slice(at + 1).trim() };
    })
    .filter((entry) => entry.name && entry.value);
}

function rulesFor(rules, selector, viewport) {
  return rules.filter(
    (rule) =>
      rule.selectors.includes(selector) &&
      (!viewport || rule.media.every((condition) => mediaApplies(condition, viewport)))
  );
}

/** Verilen goruntu alaninda, kaynak sirasina gore SON kazanan bildirim. */
function declaredValue(rules, selector, property, viewport) {
  let found = null;
  for (const rule of rulesFor(rules, selector, viewport)) {
    for (const entry of declarations(rule.body)) {
      if (entry.name === property) found = entry.value;
    }
  }
  return found;
}

function requireValue(rules, selector, property, viewport, label) {
  const value = declaredValue(rules, selector, property, viewport);
  assert(value !== null, `${label}: \`${selector}\` kuralinda \`${property}\` bildirimi yok.`);
  return value;
}

/* --- Uzunluk cozumleyici ----------------------------------------------------------------
   `clamp()`, `min()`, `max()`, `calc()`, `var()`, px/vh/vw/dvh — hepsi 1024x640'ta gercek sayiya
   iner. Bu olmadan "clamp yazdik, sigar herhalde" demis olurduk; butce sayilari CSS'ten gelmeli. */
function evaluateLength(expression, context) {
  const tokens = tokenize(String(expression));
  const parser = { tokens, index: 0, context };
  const value = parseSum(parser);
  assert(parser.index === tokens.length, `Uzunluk ifadesi cozulemedi: ${expression}`);
  return value;
}

function tokenize(text) {
  const tokens = [];
  const pattern = /\s*(var\(|clamp\(|min\(|max\(|calc\(|\(|\)|,|\+|\*|\/|--[a-zA-Z0-9-]+|-?[\d.]+(?:px|vh|vw|dvh|dvw|%)?|-(?![\d.]))/gy;
  let index = 0;
  while (index < text.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match) break;
    tokens.push(match[1]);
    index = pattern.lastIndex;
  }
  return tokens;
}

function parseSum(parser) {
  let value = parseProduct(parser);
  while (parser.tokens[parser.index] === "+" || parser.tokens[parser.index] === "-") {
    const operator = parser.tokens[parser.index];
    parser.index += 1;
    const right = parseProduct(parser);
    value = operator === "+" ? value + right : value - right;
  }
  return value;
}

function parseProduct(parser) {
  let value = parseTerm(parser);
  while (parser.tokens[parser.index] === "*" || parser.tokens[parser.index] === "/") {
    const operator = parser.tokens[parser.index];
    parser.index += 1;
    const right = parseTerm(parser);
    value = operator === "*" ? value * right : value / right;
  }
  return value;
}

function parseTerm(parser) {
  const token = parser.tokens[parser.index];
  assert(token !== undefined, "Uzunluk ifadesi beklenmedik yerde bitti.");
  if (token === "clamp(" || token === "min(" || token === "max(") {
    parser.index += 1;
    const args = parseArguments(parser);
    if (token === "clamp(") {
      assert(args.length === 3, "clamp() uc deger ister.");
      return Math.min(Math.max(args[1], args[0]), args[2]);
    }
    return token === "min(" ? Math.min(...args) : Math.max(...args);
  }
  if (token === "calc(" || token === "(") {
    parser.index += 1;
    const value = parseSum(parser);
    assert(parser.tokens[parser.index] === ")", "Kapanmayan parantez.");
    parser.index += 1;
    return value;
  }
  if (token === "var(") {
    parser.index += 1;
    const name = parser.tokens[parser.index];
    parser.index += 1;
    let fallback = null;
    if (parser.tokens[parser.index] === ",") {
      parser.index += 1;
      fallback = parseSum(parser);
    }
    assert(parser.tokens[parser.index] === ")", `var(${name}) kapanmiyor.`);
    parser.index += 1;
    const declared = parser.context.vars[name];
    if (declared === undefined) {
      assert(fallback !== null, `Tanimsiz degisken: ${name}`);
      return fallback;
    }
    return evaluateLength(declared, parser.context);
  }
  parser.index += 1;
  return toPixels(token, parser.context.viewport);
}

function parseArguments(parser) {
  const args = [];
  for (;;) {
    args.push(parseSum(parser));
    if (parser.tokens[parser.index] === ",") {
      parser.index += 1;
      continue;
    }
    assert(parser.tokens[parser.index] === ")", "Fonksiyon kapanmiyor.");
    parser.index += 1;
    return args;
  }
}

function toPixels(token, viewport) {
  const number = Number.parseFloat(token);
  assert(Number.isFinite(number), `Sayiya cevrilemedi: ${token}`);
  if (token.endsWith("vh") || token.endsWith("dvh")) return (number * viewport.height) / 100;
  if (token.endsWith("vw") || token.endsWith("dvw")) return (number * viewport.width) / 100;
  return number;
}

/** `padding:14px 20px 20px` gibi kisayollarin UST ve ALT degeri. */
function boxSides(shorthand) {
  const parts = splitTopLevel(shorthand);
  const top = parts[0];
  const bottom = parts.length >= 3 ? parts[2] : parts[0];
  return { top, bottom };
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let buffer = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (buffer) parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  if (buffer) parts.push(buffer);
  return parts;
}

export async function assertHomeLayout(projectRoot) {
  const rawCss = await readFile(path.join(projectRoot, "public", "css", "panel.css"), "utf8");
  const css = stripComments(rawCss);
  const flat = squeeze(css);
  const html = await readFile(path.join(projectRoot, "public", "index.html"), "utf8");
  const widgets = await readFile(path.join(projectRoot, "public", "js", "50-widgets.js"), "utf8");
  const homeJs = await readFile(path.join(projectRoot, "public", "js", "40-home.js"), "utf8");
  const coreJs = await readFile(path.join(projectRoot, "public", "js", "10-core.js"), "utf8");
  const rules = parseRules(css);

  /* 1) SAAT/HAVA BASLIGIN ICINDE, PANONUN ICINDE DEGIL.
     Bu tek cumle yerlesimin tamami: blok basliktan cikip panoya donerse ana ekran yeniden bir
     kart boyu kaybeder ve 1024x640'ta alt serit sikisir. */
  const homeSection = between(html, '<section id="home" class=', '<section id="devices"');
  const head = section(homeSection, '<header class="page-head">', "</header>");
  const board = homeSection.slice(homeSection.indexOf('<div id="widgetBoard"'));
  assert(head.includes('id="homeHub"'), "Birlesik saat/hava blogu (#homeHub) ana ekran basliginda degil.");
  assert(!board.includes('id="homeHub"'), "Saat/hava blogu hala panonun (widgetBoard) icinde.");
  assert(head.includes('class="home-heading"'), "Basligin sol bolumu (baglam + ekran basligi) yok.");
  assert(head.includes('class="home-title"'), "Ekran basligi (.home-title) yok: sol bolum yalniz baglam yazisi olamaz.");
  assert(head.includes('class="home-status"'), "Basligin sag bolumu (evin sagligi) yok.");
  assert(head.indexOf('class="home-heading"') < head.indexOf('id="homeHub"'), "Sol bolum saat/hava blogundan sonra geliyor.");
  assert(head.indexOf('id="homeHub"') < head.indexOf('class="home-status"'), "Sag bolum saat/hava blogundan once geliyor.");

  /* 2) IKI AYRI TIKLANABILIR BOLGE VE ARADAKI CIZGI. Pencereler AYNEN korunur: yalniz tetikleyici
     tasindi, `#clockDialog`/`#weatherDialog` yerinde. */
  const hub = section(head, '<section id="homeHub"', "</section>");
  for (const [id, label] of [["hubClockZone", "saat"], ["hubWeatherZone", "hava"]]) {
    const at = hub.indexOf(`id="${id}"`);
    assert(at >= 0, `Hub'da ${label} bolgesi yok.`);
    const tag = hub.slice(hub.lastIndexOf("<", at), hub.indexOf(">", at));
    assert(tag.startsWith("<button"), `${label} bolgesi dugme degil: tiklanabilir olmali.`);
    assert(tag.includes('aria-haspopup="dialog"'), `${label} bolgesi pencere actigini soylemiyor.`);
  }
  const dividerAt = hub.indexOf('class="hub-divider"');
  assert(dividerAt > hub.indexOf('id="hubClockZone"'), "Iki bolge arasindaki cizgi yok ya da yanlis yerde.");
  assert(dividerAt < hub.indexOf('id="hubWeatherZone"'), "Ayrac cizgisi iki bolgenin ARASINDA degil.");
  assert(!html.includes("hub-locked"), "Kaldirilan `.hub-locked` rozeti hala isaretlemede.");
  for (const dialog of ["clockDialog", "weatherDialog"]) {
    assert(html.includes(`id="${dialog}"`), `Korunmasi gereken pencere kaybolmus: #${dialog}.`);
  }

  /* 3) HUB SUTUNU VE SONME MANTIGI TAMAMEN KALKTI. Ikisi de eski iki sutunlu panonun parcasiydi;
     biri geri gelirse ray yeniden dar kalir ve kartlar saat/hava blogunun ustune biner. */
  assert(!flat.includes("--hub-column"), "Kaldirilan hub sutunu (--hub-column) hala tanimli.");
  assert(!flat.includes("hub-hidden"), "Kaldirilan hub sonme mantigi (.hub-hidden) hala CSS'te.");
  assert(!widgets.includes("hub-hidden"), "50-widgets.js hala hub'i sonduruyor (hub-hidden).");
  assert(!widgets.includes("updateHubVisibility"), "50-widgets.js'te `updateHubVisibility` hala duruyor.");

  /* 4) BASLIK IZGARASI UC BOLUM VE ORTA HUCRE GERCEKTEN ORTADA.
     Yan hucreler BIREBIR ayni belirtec olmali: biri `auto` olsaydi orta hucre icerik genisligine
     gore kayardi ve "ortada" iddiasi yalnizca goze bagli kalirdi. */
  const railViewport = VIEWPORT;
  const headColumns = requireValue(rules, "#home .page-head", "grid-template-columns", railViewport, "Ana ekran basligi");
  const tracks = splitTopLevel(headColumns);
  assert.equal(tracks.length, 3, `Ana ekran basligi uc bolum degil: ${headColumns}`);
  assert.equal(squeeze(tracks[0]), squeeze(tracks[2]), "Basligin iki yan hucresi esit degil: orta hucre ortalanmaz.");
  assert.equal(squeeze(tracks[0]), "minmax(0,1fr)", "Yan hucreler daralabilir olmali (minmax(0,1fr)).");
  const middle = evaluateLength(tracks[1], { viewport: railViewport, vars: {} });
  assert(
    /clamp\(/.test(tracks[1]) && /vw/.test(tracks[1]),
    "Orta hucre sabit px: `clamp()` + goruntu birimi olmali."
  );
  assert(middle >= 280 && middle <= 460, `Orta hucre 1024px'te ${Math.round(middle)}px: saat/hava alani icin uygun degil.`);
  assert.equal(declaredValue(rules, "#home .home-heading", "grid-column", railViewport), "1", "Sol bolum birinci hucrede degil.");
  assert.equal(declaredValue(rules, "#home .home-hub", "grid-column", railViewport), "2", "Saat/hava blogu orta hucrede degil.");
  assert.equal(declaredValue(rules, "#home .home-status", "grid-column", railViewport), "3", "Ev sagligi ucuncu hucrede degil.");

  /* 5) HUB KART DEGIL: seffaf zemin, ince bordur, hafif ic isik — ve TEK SATIR. */
  const hubRule = rulesFor(rules, ".home-hub", null)[0];
  assert(hubRule, "`.home-hub` kurali bulunamadi.");
  const hubBody = squeeze(hubRule.body);
  assert(hubBody.includes("background:transparent"), "Saat/hava blogunun zemini seffaf degil: ayri bir kart olur.");
  assert(/border:1pxsolid/.test(hubBody), "Saat/hava blogunda ince bordur yok.");
  assert(hubBody.includes("box-shadow:var(--glass-sheen)"), "Saat/hava blogunda hafif ic isik (--glass-sheen) yok.");
  assert(!/box-shadow:[^;]*var\(--card-shadow\)/.test(hubBody), "Saat/hava blogu kart golgesi tasiyor: kart gorunumu.");
  assert(hubBody.includes("display:flex"), "Saat/hava blogu tek satirlik serit degil.");
  assert(!/flex-direction:column/.test(hubBody), "Saat/hava blogu alt alta diziliyor: basligin ikinci satirini acar.");
  const dividerBody = squeeze(rulesFor(rules, ".hub-divider", null)[0]?.body || "");
  assert(dividerBody.includes("width:1px"), "Ayrac dikey degil: iki bolgeyi degil, alt/ust ayirir.");

  /* 6) DOKUNMA HEDEFLERI (not §7: 44px taban, ana ekran dugmeleri 56px). */
  const zoneMin = evaluateLength(
    requireValue(rules, ".hub-zone", "min-height", railViewport, "Hub bolgesi"),
    { viewport: railViewport, vars: {} }
  );
  assert(zoneMin >= TOUCH_TARGET, `Hub bolgesi ${zoneMin}px: dokunma hedefi 44px'in altinda.`);
  const vars = collectVariables(rules, railViewport);
  const actionHeight = evaluateLength(vars["--head-action-h"], { viewport: railViewport, vars });
  assert(actionHeight >= 56, `Ana ekran basligindaki dugmeler ${Math.round(actionHeight)}px: 56px hedefinin altinda.`);

  /* 7) ANA EKRANIN BOYU AKISTAN GELIYOR — mod seridinin payi elde sayilmiyor.
     Bu maddenin sebebi somut bir hata: `--home-top` seridi TEK satir varsayiyordu, varsayilan PIN
     uyarisi acilinca serit iki satira cikiyor ve 1024x640'ta ana ekranin alti sikisiyordu. */
  assert(!flat.includes("--home-top"), "Elde sayilan serit payi (--home-top) geri gelmis.");
  assert(!flat.includes("--admin-strip-h"), "Elde sayilan mod seridi boyu (--admin-strip-h) geri gelmis.");
  const homeHeight = declaredValue(rules, "#home.active", "height", railViewport);
  assert(
    !homeHeight || !/dvh|vh/.test(homeHeight),
    `Ana ekranin boyu hala goruntu alanindan cikarilan bir hesap: ${homeHeight}`
  );
  assert.equal(
    squeeze(requireValue(rules, "#home.active", "flex", railViewport, "Ana ekran")),
    "1 1 auto".replace(/\s/g, ""),
    "Ana ekran akisin esneyen elemani degil: ustteki seritler payini kendiliginden alamaz."
  );
  assert.equal(
    declaredValue(rules, "#home.active", "min-height", railViewport),
    "0",
    "Ana ekran `min-height:0` degil: esneme calismaz, tasma alta kacar."
  );
  const mainSelector = 'body[data-active-view="home"] main';
  assert.equal(
    declaredValue(rules, mainSelector, "display", railViewport),
    "flex",
    "Ana ekranin kabi (`main`) sutun akisi degil."
  );
  assert.equal(declaredValue(rules, mainSelector, "flex-direction", railViewport), "column", "`main` sutun yonunde akmiyor.");
  assert(
    /dvh/.test(declaredValue(rules, mainSelector, "min-height", railViewport) || ""),
    "`main` en az bir ekran boyu degil: kisa icerikte ana ekran ekrani doldurmaz."
  );

  /* 8) SAYISAL BUTCE — 1024x640, mod seridinin UC HALI.
     Toplananlarin hepsi CSS'ten okunur; buradaki tek varsayim iki tane ve ikisi de yazili:
     sarmayan bir yazi satiri ~ yazi boyu x 1.35, PIN uyarisi satirinin boyunu ise icindeki
     dugmenin dokunma hedefi (44px) belirler. */
  const context = { viewport: railViewport, vars };
  const px = (value) => evaluateLength(value, context);
  const mainPadding = boxSides(requireValue(rules, "main", "padding", railViewport, "Sayfa kabi"));
  const mainPadTop = px(mainPadding.top);
  const mainPadBottom = px(
    declaredValue(rules, mainSelector, "padding-bottom", railViewport) || mainPadding.bottom
  );

  const stripPadding = boxSides(requireValue(rules, ".admin-mode-strip", "padding", railViewport, "Mod seridi"));
  const stripMargin = boxSides(requireValue(rules, ".admin-mode-strip", "margin", railViewport, "Mod seridi"));
  const stripRow = px(requireValue(rules, ".admin-mode-strip-row", "min-height", railViewport, "Mod seridi satiri"));
  const stripGap = px(requireValue(rules, ".admin-mode-strip", "gap", railViewport, "Mod seridi"));
  const pinPadding = boxSides(
    requireValue(rules, ".admin-mode-strip>.default-pin-banner", "padding", railViewport, "Varsayilan PIN uyarisi")
  );
  const pinRow = Math.max(TOUCH_TARGET, 2 * BODY_FONT_PX * TEXT_LINE_RATIO);
  const stripOneLine = px(stripPadding.top) + px(stripPadding.bottom) + stripRow + px(stripMargin.bottom);
  const stripTwoLine = stripOneLine + stripGap + px(pinPadding.top) + 1 /* ayrac cizgisi */ + pinRow;

  const headingHeight =
    px(requireValue(rules, ".eyebrow", "font-size", railViewport, "Baglam yazisi")) * TEXT_LINE_RATIO +
    px(splitTopLevel(requireValue(rules, ".home-title", "font", railViewport, "Ekran basligi").split("/")[0]).pop()) *
      TEXT_LINE_RATIO;
  const statusHeight =
    px(requireValue(rules, ".summary-chip", "min-height", railViewport, "Ev sagligi gostergesi")) +
    px(requireValue(rules, ".home-status", "gap", railViewport, "Ev sagligi hucresi")) +
    actionHeight;
  const hubPadding = boxSides(requireValue(rules, ".home-hub", "padding", railViewport, "Saat/hava blogu"));
  const hubLine = px(vars["--hub-line"]);
  const hubTime = px(vars["--hub-time-size"]);
  const zonePadding = boxSides(requireValue(rules, ".hub-zone", "padding", railViewport, "Hub bolgesi"));
  const hubContent = Math.max(
    zoneMin,
    hubTime + 2 * hubLine * TEXT_LINE_RATIO + px(zonePadding.top) + px(zonePadding.bottom),
    px(requireValue(rules, ".hub-zone-weather", "--weather-scene-size", railViewport, "Hava ikonu"))
  );
  const hubHeight = px(hubPadding.top) + px(hubPadding.bottom) + hubContent;
  const headHeight = Math.max(headingHeight, statusHeight, hubHeight);
  const headGap = px(vars["--home-head-gap"]);

  const boardMin = px(requireValue(rules, "#home .widget-board", "min-height", railViewport, "Kart panosu"));
  const boardRowGap = px(requireValue(rules, "#home .widget-board", "row-gap", railViewport, "Kart panosu"));
  const quickHeight = px(
    requireValue(rules, '#home [data-widget="quick"]', "min-height", railViewport, "Hizli erisim seridi")
  );

  const fixed = mainPadTop + headHeight + headGap + boardRowGap + quickHeight + mainPadBottom;
  const states = [
    { label: "mod seridi yok (ev modu)", strip: 0 },
    { label: "mod seridi tek satir", strip: stripOneLine },
    { label: "mod seridi iki satir (varsayilan PIN uyarisi acik)", strip: stripTwoLine }
  ];
  for (const state of states) {
    const total = fixed + state.strip + boardMin;
    assert(
      total <= VIEWPORT.height,
      `1024x640 tasiyor — ${state.label}: gereken ${Math.round(total)}px, ekran ${VIEWPORT.height}px. ` +
        `(baslik ${Math.round(headHeight)}px, serit ${Math.round(state.strip)}px, pano en az ${Math.round(boardMin)}px)`
    );
  }

  /* 9) HIZLI ERISIM SERIDI AKISTA: sabit katman olsaydi butce yalan olurdu (serit icerigin
     ustune biner, tasma goze gorunur ama hesaba girmez). */
  const quickPosition = declaredValue(rules, '#home [data-widget="quick"]', "position", railViewport);
  assert.equal(quickPosition, "relative", "Hizli erisim seridi 1024x640'ta akista degil.");
  assert.equal(
    declaredValue(rules, '#home [data-widget="quick"]', "grid-row", railViewport),
    "2",
    "Hizli erisim seridi panonun ikinci satirinda degil."
  );
  assert(html.includes('data-widget="quick"'), "Hizli erisim widget'i panel isaretlemesinde bulunamadi.");

  /* 10) RAY TAM GENISLIK VE KART BIRIMI RAYIN GENISLIGINI DUSUYOR.
     Eski birim hub sutununu dusuyordu; sol sabit ray geldiginde o pay yanlis ada bagli kaldi. */
  const railRule = rulesFor(rules, "#home .widget-rail", railViewport);
  for (const rule of railRule) {
    for (const entry of declarations(rule.body)) {
      assert(
        !/^padding-left$|^scroll-padding-left$/.test(entry.name),
        "Ray hala sol sutun payi tasiyor: hub sutunu kalkti, pay da kalkmali."
      );
    }
  }
  const railUnit = vars["--rail-unit"];
  assert(railUnit && railUnit.includes("--rail-gap"), "Kart birimi (--rail-unit) sol rayin genisligini dusmuyor.");
  const railGap = declaredValue(rules, "#home", "--rail-gap", railViewport);
  assert.equal(squeeze(railGap || ""), "var(--rail-w)", "1024px'te ray payi rayin gercek genisligine bagli degil.");
  assert(
    !flat.includes(".group-panel") && !flat.includes("#groupPanel"),
    "Kaldirilan grup paneli (.group-panel) hala CSS'te: ray tam genisligin tek katmani olmali."
  );
  assert(!html.includes('id="groupPanel"'), "Kaldirilan grup paneli hala isaretlemede.");

  /* 10b) HIZLI SAHNE SERIDI — DORT SUTUN, ~62px KART, ACIKLAMA YOK (not §6.2 + §12).
     Serit oda sekmesi olmaktan cikti; eski sekme kabugunun (kaydirma oklari, "yeni grup"
     dugmesi, tablist) geri gelmesi hem 1024x640 butcesini hem de "tek dokunusta rutin" akisini
     bozar, o yuzden yoklugu de denetlenir. */
  const strip = section(homeSection, '<section class="dashboard-widget widget-wide quick-control-widget"', "</section>");
  assert(strip.includes('id="quickScenes"'), "Hizli sahne seridi (#quickScenes) panel isaretlemesinde yok.");
  for (const [needle, label] of [
    ['id="homeTabs"', "eski sekme kaydiricisi"],
    ['id="homeTabList"', "eski sekme listesi"],
    ['id="createHomeGroup"', '"yeni grup" dugmesi'],
    ['id="quickScrollLeft"', "sol kaydirma oku"],
    ['id="quickScrollRight"', "sag kaydirma oku"],
    ['role="tablist"', "sekme rolu"],
    ["<small", "aciklama satiri"],
    ["<p", "aciklama paragrafi"]
  ]) {
    assert(!strip.includes(needle), `Hizli sahne seridinde olmamasi gereken oge: ${label}.`);
  }
  assert(!flat.includes("villa-home-tab"), "Kaldirilan sekme kaydi (villa-home-tab) geri gelmis.");
  const sceneColumns = squeeze(
    requireValue(rules, ".quick-scene-grid", "grid-template-columns", railViewport, "Hizli sahne seridi")
  );
  assert.equal(sceneColumns, "repeat(4,minmax(0,1fr))", `Serit dort sutun degil: ${sceneColumns}`);
  const sceneHeightRaw = vars["--scene-h"];
  assert(sceneHeightRaw, "Sahne kartinin boyu (--scene-h) tanimli degil.");
  assert(
    /clamp\(/.test(sceneHeightRaw) && /vh/.test(sceneHeightRaw),
    "Sahne kartinin boyu sabit px: `clamp()` + goruntu birimi olmali."
  );
  const sceneHeight = px(sceneHeightRaw);
  assert(sceneHeight >= TOUCH_TARGET, `Sahne karti ${Math.round(sceneHeight)}px: dokunma hedefi 44px'in altinda.`);
  assert(
    sceneHeight >= 58 && sceneHeight <= 66,
    `Sahne karti 1024x640'ta ${Math.round(sceneHeight)}px: not §6.2 ~62px istiyor.`
  );
  /* Seridin bildirilen boyu kartin GERCEK boyunu tasimali: butce `min-height`i okuyor, kart
     ondan tasarsa hesap dogru ama ekran yanlis olurdu. */
  assert(
    quickHeight >= sceneHeight,
    `Serit ${Math.round(quickHeight)}px, kart ${Math.round(sceneHeight)}px: kart seride sigmiyor.`
  );
  for (const selector of ["#home .quick-control-widget .strip-row", "#home .quick-scene"]) {
    assert.equal(
      squeeze(declaredValue(rules, selector, "height", railViewport) || ""),
      "var(--scene-h)",
      `\`${selector}\` boyunu tek kaynaktan (--scene-h) almiyor: iki yerde yazilan sayi kayar.`
    );
  }

  /* 11) JS KOSULU = CSS KOSULU. Hub sonme mantigi kalkti ama kaydirma oklari hala bu kosula
     bagli; ayrisirsa oklar yanlis kirilimda calisir. */
  const twoColumnMedia = "(orientation:landscape) and (max-height:900px),(orientation:landscape) and (min-width:1000px)";
  const boardRule = rulesFor(rules, "#home .widget-board", null).find((rule) =>
    rule.media.some((condition) => squeeze(condition) === `@media${squeeze(twoColumnMedia)}`)
  );
  assert(boardRule, "Panonun yatay kip kurali beklenen kirilimda degil; JS tarafi da guncellenmeli.");
  const guard = widgets.match(/const\s+homeOverlayMediaQuery\s*=\s*"([^"]+)"/);
  assert(guard, "50-widgets.js icinde homeOverlayMediaQuery tanimi yok.");
  assert.equal(
    squeeze(guard[1]),
    squeeze(twoColumnMedia),
    "JS'teki yerlesim kosulu CSS blogunun kosulundan farkli: kaydirma oklari yanlis kirilimda calisir."
  );
  assert(widgets.includes("matchMedia(homeOverlayMediaQuery)"), "Kaydirma mantigi ortak yerlesim kosulunu kullanmiyor.");

  /* 12) ODA KARTLARI URETILIYOR — elle kurulan pano degil.
     Ana ekranin ve Odalar gorunumunun kartlari `35-generator.js`ten dogar. Panelin ikinci bir
     "odada ne var" kurali yazmasi bu asamanin tam tersi olurdu, o yuzden dogrudan denetlenir. */
  for (const [needle, label] of [
    ["genCardModelForGroup", "oda karti modeli"],
    ["genUngroupedCardModel", "grupsuz cihaz karti modeli"]
  ]) {
    assert(homeJs.includes(needle), `40-home.js jeneratoru kullanmiyor: ${label} (${needle}).`);
  }
  assert(
    /const cardModelForGroup\s*=/.test(homeJs),
    "Oda karti modeli tek bir kaynaktan (`cardModelForGroup`) alinmiyor: paralel model riski."
  );

  /* 12b) CIHAZ GORUNURLUGU KART SEVIYESINDE. Anahtar KAPSAM almazsa bir kartta gizlenen cihaz
     yine her kartta gizlenir — bu asamanin duzelttigi hata tam olarak buydu. Kapsamsiz ESKI
     anahtar da okunabilir kalmali, yoksa kullanicinin bugunku tercihleri sessizce silinir. */
  const visibilityKeyFn = coreJs.match(/const\s+tileVisibilityKey\s*=\s*\(([^)]*)\)/);
  assert(visibilityKeyFn, "10-core.js icinde `tileVisibilityKey` tanimi yok.");
  const visibilityKeyArgs = visibilityKeyFn[1].split(",").map((one) => one.trim());
  assert.equal(
    visibilityKeyArgs[0],
    "scope",
    `Gorunurluk anahtari kapsam almiyor (ilk parametre \`${visibilityKeyArgs[0]}\`): kartlar birbirinden ayrilamaz.`
  );
  assert(
    /const\s+legacyTileVisibilityKey\s*=/.test(coreJs),
    "Kapsamsiz eski gorunurluk anahtari (`legacyTileVisibilityKey`) kalkmis: eski tercihler kaybolur."
  );
  assert(
    /const\s+parseVisibilityKey\s*=/.test(coreJs),
    "Gorunurluk anahtari cozumleyicisi (`parseVisibilityKey`) yok: sunucuya kapsam yazilamaz."
  );
  assert(
    homeJs.includes("tileVisibilityScopes"),
    "Kapsamsiz kaydin gocu (`tileVisibilityScopes`) yok: eski tercih ilk dokunusta kaybolur."
  );

  /* 12c) SOL RAYDA ODALAR SATIRI, TEK GEZINME MEKANIZMASI ILE.
     Satir `.nav-button` + `data-view` tasimali; ayri bir tiklama/isaret mekanizmasi acilirsa
     "aktif satir" iki yerden yazilir ve kaciniz. Ev modunun uc satiri da yonetici kisitsizdir. */
  const rail = section(html, '<aside class="side-rail">', "</aside>");
  for (const view of ["home", "rooms", "routines"]) {
    const at = rail.indexOf(`data-view="${view}"`);
    assert(at >= 0, `Sol rayda ev modu satiri yok: ${view}.`);
    const tag = rail.slice(rail.lastIndexOf("<button", at), rail.indexOf(">", at));
    assert(
      tag.includes("nav-button") && tag.includes("rail-button"),
      `Ray satiri ortak gezinme sinifini tasimiyor (${view}): ikinci bir mekanizma acilmis.`
    );
    assert(
      !tag.includes("data-admin-only"),
      `Ev modunun satiri yonetici kisitli olmus: ${view}.`
    );
  }
  assert(
    rail.indexOf('data-view="home"') < rail.indexOf('data-view="rooms"'),
    "Rayda Odalar satiri Ev'den once geliyor."
  );
  assert(
    rail.indexOf('class="rail-bottom"') > rail.indexOf('data-view="rooms"'),
    "Profil rayin en altinda degil."
  );

  /* 12d) ODALAR GORUNUMU ANA EKRANIN DISINDA. Icerideyse 1024x640 butcesi yalan soyler:
     kartlar ana ekranin payini yer ama hesaba girmez. */
  assert(html.includes('<section id="rooms" class="view">'), "Odalar gorunumu (#rooms) yok.");
  assert(
    html.indexOf('<section id="rooms"') > html.indexOf('<section id="devices"'),
    "Odalar gorunumu ana ekran diliminin icinde: butce hesabi bozulur."
  );
  assert(html.includes('id="roomCards"'), "Odalar gorunumunde kart kabi (#roomCards) yok.");
  const roomGrid = squeeze(
    requireValue(rules, ".room-card-grid", "grid-template-columns", railViewport, "Oda kart izgarasi")
  );
  assert(
    roomGrid.includes("minmax(") && /clamp\(|vw|%/.test(roomGrid),
    `Oda kart izgarasi sabit sutun: ${roomGrid}`
  );

  /* 12e) PANO DUZENLEME EV MODUNDAN CEKILDI — ama KOD SILINMEDI (geri donus yolu).
     Iki dugme de isaretlemede DURMALI ve `hidden` olmali. Silinirlerse `50-widgets.js`in
     etiket/sinif yazan satirlari ilk turda patlar. */
  for (const id of ["addWidget", "editDashboard"]) {
    const at = html.indexOf(`id="${id}"`);
    assert(at >= 0, `Emekli edilen dugme isaretlemeden SILINMIS: #${id} (kod silinmeyecekti).`);
    const tag = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at));
    assert(tag.includes("hidden"), `#${id} hala ev modunun basliginda gorunuyor: pano duzenleme emekli.`);
  }

  /* 12f) GOZ VE YILDIZ ULASILABILIR KALMALI. Ikisi de bugune kadar YALNIZ duzenleme kipinde
     goruntuleniyordu; kip ev modundan cekildigine gore kalici yerleri Odalar gorunumudur.
     Bu madde olmasa "kart gorunurlugu KALIR" karari sessizce olur bir ozellige donerdi. */
  for (const selector of [".room-card .tile-eye", ".room-card .tile-star"]) {
    assert.equal(
      declaredValue(rules, selector, "display", railViewport),
      "grid",
      `\`${selector}\` gorunmuyor: cihaz gorunurlugu ulasilamaz hale gelmis.`
    );
  }

  /* 12g) ODANIN ANA ANAHTARI AYRI VE DOKUNULABILIR (not §6.3 + §7). Kart govdesi odaya girer,
     anahtar ayri hedeftir; ikisi de 44px'in altina inemez. Hap bicimli anahtarlar kare ikon
     olcusune (`.group-widget-actions button`) sikismamali. */
  const masterMin = evaluateLength(
    requireValue(rules, ".room-master", "min-height", railViewport, "Odanin ana anahtari"),
    { viewport: railViewport, vars: {} }
  );
  assert(masterMin >= TOUCH_TARGET, `Odanin ana anahtari ${masterMin}px: dokunma hedefi 44px'in altinda.`);
  for (const selector of [".group-widget-actions .ov-switch", ".group-widget-actions .room-master"]) {
    assert.equal(
      declaredValue(rules, selector, "width", railViewport),
      "auto",
      `\`${selector}\` kare ikon olcusune sikisiyor: \`.group-widget-actions button\` geri alinmali.`
    );
  }
  assert(
    /data-room-master=/.test(homeJs),
    "Odanin ana aç/kapat eylemi yok: oda karti sozlesmesinin dorduncu maddesi eksik."
  );
  assert(
    homeJs.includes("roomMasterKinds"),
    "Ana anahtarin hedef kumesi yazili degil: kilit/perde toplu surulme riski."
  );

  /* 12h) YONETICI GEZINMESI (Asama 6, not §4.2): Genel Bakis · Cihazlar · Otomasyonlar ·
     Baglantilar · Sistem. Dordu yonetici kisitli; "Cihazlar" IKI modda da AYNI satirdir —
     yonetici icin ikinci bir kopya acilirsa "aktif satir" iki yerden yazilir ve kacinilir. */
  for (const view of ["adminOverview", "automations", "connections", "settings"]) {
    const at = rail.indexOf(`data-view="${view}"`);
    assert(at >= 0, `Sol rayda yonetici satiri yok: ${view}.`);
    const tag = rail.slice(rail.lastIndexOf("<button", at), rail.indexOf(">", at));
    assert(
      tag.includes("nav-button") && tag.includes("rail-button"),
      `Yonetici ray satiri ortak gezinme sinifini tasimiyor (${view}): ikinci bir mekanizma acilmis.`
    );
    assert(
      tag.includes("data-admin-only"),
      `Yonetici satiri ev modunda da ciziliyor: ${view}.`
    );
  }
  assert.equal(
    rail.split('data-view="devices"').length - 1,
    1,
    "Rayda ikinci bir Cihazlar satiri var: yonetici icin ayri kopya acilmis."
  );
  assert(
    rail.indexOf('data-view="devices"') < rail.indexOf('data-view="adminOverview"'),
    "Genel Bakis, ev modu satirlarinin arasina girmis."
  );
  assert(
    rail.indexOf('data-view="adminOverview"') < rail.indexOf('data-view="automations"'),
    "Genel Bakis yonetici satirlarinin basinda degil."
  );
  assert(
    rail.indexOf('data-view="settings"') > rail.indexOf('data-view="connections"'),
    "Sistem satiri yonetici gezinmesinin sonunda degil."
  );
  assert(
    /data-view="settings"[\s\S]{0,600}data-i18n="navSystem"/.test(rail),
    "Sistem satiri hala \"Ayarlar\" diyor: yonetici gezinmesinin dili tek olmali."
  );

  /* 12i) GENEL BAKIS GORUNUMU ANA EKRANIN DISINDA, YONETICI KISITLI VE UC KABI YERINDE.
     Icerideyse 1024x640 butcesi yalan soyler (bkz. 12d, Odalar). */
  assert(
    html.includes('<section id="adminOverview" class="view" data-admin-only>'),
    "Genel Bakis gorunumu (#adminOverview) yok ya da yonetici kisitli degil."
  );
  assert(
    html.indexOf('<section id="adminOverview"') > html.indexOf('<section id="devices"'),
    "Genel Bakis ana ekran diliminin icinde: butce hesabi bozulur."
  );
  for (const [id, label] of [
    ["adminOverviewStats", "sayi doselemeleri"],
    ["adminServiceList", "servis sagligi"],
    ["adminAttentionList", "dikkat isteyenler"]
  ]) {
    assert(html.includes(`id="${id}"`), `Genel Bakis'ta ${label} kabi yok: #${id}.`);
  }

  /* 12j) GENEL BAKIS BES SEYI DE GOSTERIR VE SAYIYI KENDI UYDURMAZ: cihaz sayisi, cevrimici,
     otomasyon, dusuk pil, servis sagligi. Cihaz tarafinin tek dogrusu `genHomeHealthModel`,
     otomasyon tarafinin `genSceneCatalog` (35-generator.js) — ikinci bir sayim kurali yazilamaz. */
  const overviewJs = await readFile(path.join(projectRoot, "public", "js", "72-admin-overview.js"), "utf8");
  for (const [needle, label] of [
    ["genHomeHealthModel(", "cihaz sagligi modeli"],
    ["genSceneCatalog(", "otomasyon katalogu"],
    ["adminStatDevices", "cihaz sayisi"],
    ["adminStatOnline", "cevrimici"],
    ["adminStatAutomations", "otomasyon"],
    ["adminStatLowBattery", "dusuk pil"],
    ["adminServiceMqtt", "servis sagligi"]
  ]) {
    assert(overviewJs.includes(needle), `Genel Bakis eksik: ${label} (${needle}).`);
  }
  assert(
    overviewJs.includes("adminServiceUnknown"),
    "Okunmamis servis \"bilinmiyor\" demiyor: yalan bir saglik isareti basilir."
  );

  /* 12k) YENI PANEL DOSYASI UC YERDE BIRDEN KAYITLI: diskte, `index.html`'de ve `src/index.ts`
     icindeki `panelAssetRoutes` tablosunda. Ucu birlikte guncellenmezse dosya ya hic yuklenmez
     ya da 404 doner (panel-graph.mjs ilk ikisini goruyor, ucuncusunu bu madde tutuyor). */
  const serverIndex = await readFile(path.join(projectRoot, "src", "index.ts"), "utf8");
  assert(
    html.includes('<script src="/js/72-admin-overview.js"></script>'),
    "index.html'de 72-admin-overview.js etiketi yok."
  );
  assert(
    serverIndex.includes('"/js/72-admin-overview.js"'),
    "src/index.ts icindeki panelAssetRoutes tablosunda 72-admin-overview.js yok: dosya 404 doner."
  );

  /* 12l) MOD SERIDI HER YONETICI EKRANINDA. Serit TEK ornektir ve `main`in icinde, butun
     gorunumlerin DISINDA durur: bir gorunumun icine tasinsa yalniz o ekranda gorunurdu.
     Gorunur "Ev moduna don" dugmesi de seridin icinde kalir (Asama 2). */
  assert.equal(
    html.split('id="adminModeStrip"').length - 1,
    1,
    "Mod seridi ikinci kez kurulmus: iki serit iki farkli dogru soyler."
  );
  const stripAt = html.indexOf('id="adminModeStrip"');
  assert(
    stripAt > html.indexOf("<main>") && stripAt < html.indexOf('<section id="home"'),
    "Mod seridi bir gorunumun icine tasinmis: yalniz o ekranda gorunur."
  );
  assert(
    html.indexOf('id="leaveAdminModeButton"') > stripAt,
    "Gorunur \"Ev moduna don\" dugmesi mod seridinin icinde degil."
  );
  const stripTag = html.slice(html.lastIndexOf("<div", stripAt), html.indexOf(">", stripAt));
  assert(stripTag.includes("data-admin-only"), "Mod seridi ev modunda da ciziliyor.");

  /* 12m) "SISTEM" BUGUNKU AYARLAR EKRANIDIR: kimligi (#settings) ve IKI SEKMESI korunur.
     Sekmeler kaybolursa kalabalik tek sayfaya doner ve `activateSettingsTab` ilk turda patlar. */
  for (const id of ["settingsTabUsage", "settingsTabSetup", "settingsPanelUsage", "settingsPanelSetup"]) {
    assert(html.includes(`id="${id}"`), `Ayarlar'in korunmasi gereken sekme parcasi kaybolmus: #${id}.`);
  }

  /* 12n) RISKLI ISLEMLER ONAYSIZ CALISMAZ. Belirtecler sunucunun sozlesmesidir; biri dususe
     islem tek dokunusla, onaysiz calisir hale gelir. */
  const settingsJs = await readFile(path.join(projectRoot, "public", "js", "70-settings.js"), "utf8");
  const zigbeeJs = await readFile(path.join(projectRoot, "public", "js", "80-zigbee-tools.js"), "utf8");
  const guarded = `${settingsJs}\n${zigbeeJs}`;
  for (const token of ["APPLY", "RESTART", "RESTORE", "CHANGE"]) {
    assert(
      guarded.includes(`"${token}"`),
      `Riskli islemin onay belirteci kaybolmus: ${token}.`
    );
  }

  /* 12p) YONETICI EKRANLARINDA 44px KURALI (not §7). Taban dugme bicimi dolgudan 43px'e
     dusuyordu; kurulum ekranlarinin dugmeleri dokunma hedefinin altina inemez. Kural yonetici
     gorunumlerine baglidir, ana ekranin butcesine dokunmaz. */
  for (const selector of [
    "#adminOverview .secondary",
    "#automations .secondary",
    "#connections .secondary",
    "#settings .secondary",
    "#settings .danger-button"
  ]) {
    const buttonMin = evaluateLength(
      requireValue(rules, selector, "min-height", railViewport, `Yonetici dugmesi (${selector})`),
      { viewport: railViewport, vars: {} }
    );
    assert(buttonMin >= TOUCH_TARGET, `\`${selector}\` ${buttonMin}px: dokunma hedefi 44px'in altinda.`);
  }

  /* 12o) GENEL BAKIS'IN OLCULERI: 44px dokunma hedefi ve AKISKAN izgara (sabit sutun yok). */
  for (const selector of [".admin-service-row", ".admin-attention-row"]) {
    const rowMin = evaluateLength(
      requireValue(rules, selector, "min-height", railViewport, `Genel Bakis satiri (${selector})`),
      { viewport: railViewport, vars: {} }
    );
    assert(rowMin >= TOUCH_TARGET, `\`${selector}\` ${rowMin}px: dokunma hedefi 44px'in altinda.`);
  }
  for (const [selector, label] of [
    [".admin-stat-grid", "Genel Bakis sayi izgarasi"],
    [".admin-overview-columns", "Genel Bakis sutunlari"]
  ]) {
    const columns = squeeze(requireValue(rules, selector, "grid-template-columns", railViewport, label));
    assert(
      columns.includes("minmax(") && /clamp\(|vw|%/.test(columns),
      `${label} sabit sutun: ${columns}`
    );
  }

  return {
    head: Math.round(headHeight),
    strip: [0, stripOneLine, stripTwoLine].map((value) => Math.round(value)),
    board: Math.round(VIEWPORT.height - fixed - stripTwoLine)
  };
}

/** `:root` ve `#home` gibi yerlerde tanimli uzunluk degiskenleri (goruntu alanina gore son hali). */
function collectVariables(rules, viewport) {
  const vars = {};
  for (const rule of rules) {
    if (rule.media.some((condition) => !mediaApplies(condition, viewport))) continue;
    for (const entry of declarations(rule.body)) {
      if (entry.name.startsWith("--")) vars[entry.name] = entry.value;
    }
  }
  return vars;
}

/** `start` isaretinden `end` isaretine kadarki dilim (bitis DISARIDA kalir). */
function between(html, start, end) {
  const from = html.indexOf(start);
  assert(from >= 0, `Isaretlemede bulunamadi: ${start}`);
  const to = html.indexOf(end, from);
  assert(to >= 0, `Isaretlemede bulunamadi: ${end}`);
  return html.slice(from, to);
}

/** `start` ile `end` arasindaki HTML dilimi (ilk eslesme). */
function section(html, start, end) {
  const from = html.indexOf(start);
  assert(from >= 0, `Isaretlemede bulunamadi: ${start}`);
  const to = html.indexOf(end, from);
  assert(to >= 0, `Kapanmayan blok: ${start}`);
  return html.slice(from, to + end.length);
}
