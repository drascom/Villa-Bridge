import { readFile } from "node:fs/promises";

/* Panel kaynağını testler için tek noktadan okur. Panel parçalara ayrıldıkça yalnız bu dosya
   değişir; testlerdeki iddialar olduğu gibi kalır. Birleştirme sırası, tarayıcının yükleme
   sırasıyla birebir aynıdır. */

const panelDocumentUrl = new URL("../public/index.html", import.meta.url);
const panelStyleUrl = new URL("../public/css/panel.css", import.meta.url);
const panelStyleLink = '  <link rel="stylesheet" href="/css/panel.css">';
/* Belge sırasındaki `<script src>` etiketleri: anahtar etiketin kendisi, değer dosya adresi.
   Yeni bir panel dosyası çıktığında yalnız bu tabloya satır eklenir. */
const panelScriptFiles = new Map<string, URL>([
  ['<script src="/js/10-core.js"></script>', new URL("../public/js/10-core.js", import.meta.url)],
  ['<script src="/js/20-auth.js"></script>', new URL("../public/js/20-auth.js", import.meta.url)],
  ['<script src="/js/30-device-view.js"></script>', new URL("../public/js/30-device-view.js", import.meta.url)],
  ['<script src="/js/40-home.js"></script>', new URL("../public/js/40-home.js", import.meta.url)],
  ['<script src="/js/45-clock-weather.js"></script>', new URL("../public/js/45-clock-weather.js", import.meta.url)],
  ['<script src="/js/50-widgets.js"></script>', new URL("../public/js/50-widgets.js", import.meta.url)],
  ['<script src="/js/60-pairing.js"></script>', new URL("../public/js/60-pairing.js", import.meta.url)],
  ['<script src="/js/70-settings.js"></script>', new URL("../public/js/70-settings.js", import.meta.url)],
  ['<script src="/js/80-zigbee-tools.js"></script>', new URL("../public/js/80-zigbee-tools.js", import.meta.url)],
  ['<script src="/js/88-simple-link.js"></script>', new URL("../public/js/88-simple-link.js", import.meta.url)],
  ['<script src="/js/90-shell.js"></script>', new URL("../public/js/90-shell.js", import.meta.url)],
  ['<script src="/js/panel-automation.js"></script>', new URL("../public/js/panel-automation.js", import.meta.url)],
  ['<script src="/js/99-bind.js"></script>', new URL("../public/js/99-bind.js", import.meta.url)]
]);

/* Panelin tek çalışma anı kuralı: üst düzeyde iş yapan bütün kod son dosyadadır, ondan önceki
   hiçbir dosya yüklenirken bir diğerine dokunmaz. Sıra bozulursa panel hata vermeden ölür; bu
   yüzden sıra burada, paneli okuyan her testin geçtiği noktada doğrulanır. */
const lastPanelScriptTag = '<script src="/js/99-bind.js"></script>';

function assertPanelScriptOrder(document: string): void {
  const found = [...document.matchAll(/<script src="[^"]+"><\/script>/g)].map((match) => match[0]);
  const expected = [...panelScriptFiles.keys()];
  if (found.length !== expected.length || found.some((tag, index) => tag !== expected[index])) {
    throw new Error(`Panel script sırası tabloyla uyuşmuyor: ${found.join(" ")}`);
  }
  if (expected.at(-1) !== lastPanelScriptTag) {
    throw new Error(`Panel script sırasında son dosya ${lastPanelScriptTag} olmalı.`);
  }
}

const readPanelDocument = async (): Promise<string> => {
  const document = await readFile(panelDocumentUrl, "utf8");
  assertPanelScriptOrder(document);
  return document;
};

/** Panel belgesi: markup ve belge içindeki etiketler. */
export async function panelMarkup(): Promise<string> {
  return readPanelDocument();
}

/** Panel stilleri. */
export async function panelStyles(): Promise<string> {
  return readFile(panelStyleUrl, "utf8");
}

/** Panel script gövdeleri, yükleme sırasıyla. */
export async function panelScripts(): Promise<string> {
  const document = await readPanelDocument();
  const pattern = new RegExp(`<script>([\\s\\S]*?)</script>|${[...panelScriptFiles.keys()]
    .map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")}`, "g");
  const bodies = await Promise.all([...document.matchAll(pattern)]
    .map(async (match) => (match[1] === undefined ? readPanelScriptFile(match[0]) : match[1])));
  return bodies.join("\n");
}

async function readPanelScriptFile(tag: string): Promise<string> {
  const url = panelScriptFiles.get(tag);
  if (!url) throw new Error(`Panel script dosyası bilinmiyor: ${tag}`);
  return readFile(url, "utf8");
}

/** Panelin tamamı: parçalar yükleme sırasıyla birleştirilmiş hâli. */
export async function readPanelSource(): Promise<string> {
  const [document, styles] = await Promise.all([readPanelDocument(), panelStyles()]);
  if (!document.includes(panelStyleLink)) throw new Error("Panel stil bağlantısı bulunamadı.");
  // Değiştirici işlev: CSS ve script metnindeki `$` dizileri kalıp olarak yorumlanmasın.
  let source = document.replace(panelStyleLink, () => styles);
  for (const [tag, url] of panelScriptFiles) {
    if (!source.includes(tag)) throw new Error(`Panel script bağlantısı bulunamadı: ${tag}`);
    const body = await readFile(url, "utf8");
    source = source.replace(tag, () => body);
  }
  return source;
}
