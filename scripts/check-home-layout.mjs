import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

/* ANA EKRANIN İKİ SÜTUNLU DÜZENİ — yapısal denetim.
   Yerleşim üç parçadan kuruluyor ve üçü birbirine bağlı:
     1) `#home .widget-board` iki sütun: `var(--hub-column)` + kalanı, iki satır: kartlar + şerit.
     2) Hub birinci sütunda; ray `grid-column:1/-1` ile hub'ın ÜSTÜNDE duran tam genişlikte bir
        katman ve hub sütununu görünür tutan tek şey rayın `padding-left`i.
     3) Ray kaydırılınca kartlar hub'ın üstüne bindiği için hub sönerek çekilir; bunu açan koşul
        JS'te (`homeOverlayMediaQuery`, 50-widgets.js) CSS'teki blok koşuluyla AYNI olmalıdır.
   ESKİ DENETİMİN KÖR NOKTASI: yalnız iki metni `lastIndexOf` ile bulup sıralarına bakıyordu
   ("quick" barı `position:fixed`ten `position:relative`e geçmiş mi). Üç şeyi hiç görmüyordu —
   (a) kuralların HANGİ medya bloğunda olduğunu, (b) hub sütununun varlığını (sütun tanımı
   silinse bile denetim geçerdi), (c) JS koşulunun CSS koşuluyla aynı olup olmadığını. Üstelik
   `lastIndexOf('...position:fixed')` DİKEY TELEFON bloğundaki kuralı buluyordu, yatay bloktakini
   değil: karşılaştırma birbiriyle ilgisiz iki kırılım arasında yapılıyordu. */

const twoColumnMedia = "(orientation:landscape) and (max-height:900px),(orientation:landscape) and (min-width:1000px)";

/** Boşluk farkları anlamsız: koşullar ve bildirimler karşılaştırılmadan önce sadeleştirilir. */
const squeeze = (value) => value.replace(/\s+/g, "");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** `selector{...}` gövdesini döndürür (ilk eşleşme, verilen konumdan sonra). */
function ruleBody(css, selector, from = 0) {
  const start = css.indexOf(`${selector}{`, from);
  if (start < 0) return null;
  const open = start + selector.length;
  const end = css.indexOf("}", open);
  return end < 0 ? null : css.slice(open + 1, end);
}

/** Verilen konumu kapsayan `@media` bloğunun koşulu ve gövdesi. */
function enclosingMedia(css, position) {
  const head = css.lastIndexOf("@media", position);
  if (head < 0) return null;
  const open = css.indexOf("{", head);
  if (open < 0 || open > position) return null;
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        if (index < position) return null;
        return { condition: css.slice(head + 6, open), body: css.slice(open + 1, index) };
      }
    }
  }
  return null;
}

export async function assertHomeLayout(projectRoot) {
  const rawCss = await readFile(path.join(projectRoot, "public", "css", "panel.css"), "utf8");
  const css = squeeze(stripComments(rawCss));
  const html = await readFile(path.join(projectRoot, "public", "index.html"), "utf8");
  const widgets = await readFile(path.join(projectRoot, "public", "js", "50-widgets.js"), "utf8");

  // 1) İki sütunlu pano: hub sütunu tanımlı ve ızgaraya gerçekten yazılmış olmalı.
  assert(css.includes("#home{--hub-column:"), "Hub sutunu (--hub-column) tanimlanmamis.");
  const boardIndex = css.indexOf("#home.widget-board{");
  assert(boardIndex >= 0, "Ana ekran panosunun (#home .widget-board) kurali bulunamadi.");
  const board = ruleBody(css, "#home.widget-board", boardIndex);
  assert(
    board.includes("grid-template-columns:var(--hub-column)minmax(0,1fr)"),
    "Pano iki sutunlu degil: sol sutun --hub-column olmali."
  );
  const boardMedia = enclosingMedia(css, boardIndex);
  assert(boardMedia, "Iki sutunlu pano kurali bir medya blogunun icinde degil.");
  assert.equal(
    boardMedia.condition,
    squeeze(twoColumnMedia),
    "Iki sutunlu panonun kirilim kosulu degismis; JS tarafi da guncellenmeli."
  );

  // 2) Hub solda kendi sutununda, ray onun ustunde ama payi kadar iceriden basliyor.
  const hub = ruleBody(boardMedia.body, "#home.home-hub");
  assert(hub && hub.includes("grid-column:1;grid-row:1"), "Saat/hava blogu ilk sutunun ilk satirinda degil.");
  const rail = ruleBody(boardMedia.body, "#home.widget-rail");
  assert(rail && rail.includes("grid-column:1/-1"), "Widget rayi panonun tamamini kaplayan katman degil.");
  // `scroll-padding-left` de ayni degeri tasidigi icin sinir gerekiyor: duz `includes` onu de yakalardi.
  assert(
    /(^|;)padding-left:calc\(var\(--hub-column\)\+10px\)/.test(rail),
    "Ray hub sutunu kadar iceriden baslamiyor: kartlar saat/hava blogunun ustune biner."
  );
  assert(
    /(^|;)scroll-padding-left:calc\(var\(--hub-column\)\+10px\)/.test(rail),
    "Rayin tutunma yastigi hub sutununu hesaba katmiyor: kart hub'in altina yaslanir."
  );
  const groupPanel = ruleBody(boardMedia.body, "#home.group-panel");
  assert(
    groupPanel && groupPanel.includes("margin:000calc(var(--hub-column)+10px)"),
    "Grup paneli hub sutununun sagindan baslamiyor."
  );

  // 3) Hizli erisim bari sabit katmandan cikip izgaranin ikinci satirina tasindi.
  const fixedRule = css.indexOf('#home[data-widget="quick"]{position:fixed');
  const flowRule = css.lastIndexOf('#home[data-widget="quick"]{position:relative');
  assert(fixedRule >= 0, "Eski hizli erisim kurali bulunamadi; gecis denetimi guncellenmeli.");
  assert(flowRule > fixedRule, "Hizli erisim bari son kuralda normal akis icinde olmali.");
  const flowBlock = ruleBody(css, '#home[data-widget="quick"]', flowRule);
  assert(flowBlock.includes("grid-row:2"), "Hizli erisim bari kendine ayrilan ikinci satirda degil.");
  assert(flowBlock.includes("position:relative"), "Hizli erisim bari sabit katmandan ayrilmamis.");
  assert(css.includes("grid-template-rows:minmax(0,1fr)auto;row-gap:12px"), "Kart ve hizli erisim satirlari ayrilmamis.");
  const flowMedia = enclosingMedia(css, flowRule);
  assert(flowMedia, "Akis icindeki hizli erisim kurali bir medya blogunun icinde degil.");
  for (const arm of ["max-height:900px", "min-width:1000px"]) {
    assert(
      flowMedia.condition.includes(arm),
      `Hizli erisim satirinin kirilimi ${arm} kolunu kapsamiyor; tablet ya da genis ekran disarida kalir.`
    );
  }
  assert(css.includes("(min-width:1000px)"), "1024px yatay tablet kirilimi korunmuyor.");
  assert(html.includes('data-widget="quick"'), "Hizli erisim widget'i panel isaretlemesinde bulunamadi.");

  /* 4) JS koşulu = CSS koşulu. Ayrışırsa CSS iki sütuna geçmişken JS "yatay değil" der: kaydırma
     okları zorla gizlenir ve hub hiç sönmez, kaydırılan kartlar saat/hava blogunun ustunde kalir.
     Kullanicinin "widget'lar en solda, hava durumu altta kaldi" dedigi tablo tam olarak budur. */
  const guard = widgets.match(/const\s+homeOverlayMediaQuery\s*=\s*"([^"]+)"/);
  assert(guard, "50-widgets.js icinde homeOverlayMediaQuery tanimi yok.");
  assert.equal(
    squeeze(guard[1]),
    squeeze(twoColumnMedia),
    "JS'teki yerlesim kosulu CSS blogunun kosulundan farkli: hub gizleme ve kaydirma oklari yanlis kirilimda calisir."
  );
  assert(
    widgets.includes("matchMedia(homeOverlayMediaQuery)"),
    "Kaydirma/hub mantigi ortak yerlesim kosulunu kullanmiyor."
  );
}
