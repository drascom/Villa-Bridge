import { readFile } from "node:fs/promises";

/* Panel kaynağını testler için tek noktadan okur. Panel parçalara ayrıldıkça yalnız bu dosya
   değişir; testlerdeki iddialar olduğu gibi kalır. Birleştirme sırası, tarayıcının yükleme
   sırasıyla birebir aynıdır. */

const panelDocumentUrl = new URL("../public/index.html", import.meta.url);
const panelStyleUrl = new URL("../public/css/panel.css", import.meta.url);
const panelStyleLink = '  <link rel="stylesheet" href="/css/panel.css">';

const readPanelDocument = (): Promise<string> => readFile(panelDocumentUrl, "utf8");

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
  return [...document.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join("\n");
}

/** Panelin tamamı: parçalar yükleme sırasıyla birleştirilmiş hâli. */
export async function readPanelSource(): Promise<string> {
  const [document, styles] = await Promise.all([readPanelDocument(), panelStyles()]);
  if (!document.includes(panelStyleLink)) throw new Error("Panel stil bağlantısı bulunamadı.");
  // Değiştirici işlev: CSS metnindeki `$` dizileri kalıp olarak yorumlanmasın.
  return document.replace(panelStyleLink, () => styles);
}
