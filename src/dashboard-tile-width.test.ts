import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);
const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

async function readDashboard(): Promise<string> {
  return readFile(dashboardUrl, "utf8");
}

async function readCatalog(url: URL): Promise<Record<string, string>> {
  return JSON.parse(await readFile(url, "utf8")).translations as Record<string, string>;
}

test("kart içi cihaz butonu iki genişlik kademesine sahip", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /\.group-control-grid\{--group-tile-span:2;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /\.group-control-slot\{position:relative;min-width:0;display:grid\}/);
  assert.match(dashboard, /\.group-control-slot\.is-wide\{grid-column:span var\(--group-tile-span\)\}/);
  assert.match(dashboard, /#home \.group-control-grid\{--group-tile-span:1;grid-template-columns:1fr\}/);
  assert.match(dashboard, /\.group-control-slot\.is-wide \.group-control-tile strong\{overflow:visible;text-overflow:clip;white-space:normal/);
  assert.match(dashboard, /\.group-control-tile strong\{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.doesNotMatch(dashboard, /color-mix\(/);
});

test("boyut simgesi yalnız düzenleme kipinde görünür", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /\.tile-width-toggle\{position:absolute;[^}]*width:44px;height:44px;display:none/);
  assert.match(dashboard, /\.widget-board\.editing \.tile-width-toggle\{display:grid\}/);
  assert.match(dashboard, /\.tile-width-toggle:focus-visible\{outline:3px solid var\(--forest-soft\)/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.tile-width-toggle:focus-visible/);
  assert.match(dashboard, /\.widget-board\.editing \.quick-card,\.widget-board\.editing \.group-control-tile\{pointer-events:none\}/);
});

test("boyut simgesi gerçek buton ve cihazı tetiklemiyor", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /<button class="tile-width-toggle" type="button" data-tile-width-toggle="\$\{esc\(key\)\}" aria-pressed=/);
  assert.match(
    dashboard,
    /\$\$\("\[data-tile-width-toggle\]"\)\.forEach\(button=>button\.onclick=event=>\{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*toggleTileWidth\(button\);/
  );
  // Simge döşemenin kardeşi: iç içe <button> geçersiz olurdu ve tıklama cihaza sızardı.
  assert.match(dashboard, /<div class="group-control-slot\$\{wide\?" is-wide":""\}[^`]*>\$\{tile\}\$\{tileWidthToggleHtml\(widthKey,wide\)\}<\/div>/);
  assert.match(dashboard, /aria-label="\$\{esc\(label\)\}"/);
  assert.match(dashboard, /const label=t\(wide\?"collapseTile":"expandTile"\)/);
});

test("uzun ad ölçülerek geniş kademeye geçiyor", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /label\.scrollWidth>label\.clientWidth\+1/);
  assert.match(dashboard, /const auto=slots\.filter\(slot=>slot\.dataset\.tileWidth==="auto"\)/);
  assert.match(dashboard, /if\(auto\.length&&grid\.clientWidth>0\)/);
  assert.match(dashboard, /typeof ResizeObserver!=="function"/);
  // Genişlik değişmediyse yeniden ölçme yok — sonsuz döngü koruması.
  assert.match(dashboard, /if\(tileGridWidths\.get\(entry\.target\)===width\)continue/);
  assert.match(dashboard, /observeTileWidths\(\);\s*applyAllTileWidths\(\);/);
});

test("elle seçim otomatiği eziyor ve kalıcı saklanıyor", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const tileWidthStorageKey="villa-tile-widths"/);
  assert.match(dashboard, /const tileWidthModes=new Set\(\["auto","narrow","wide"\]\)/);
  assert.match(dashboard, /const normalizeTileWidthMode=value=>tileWidthModes\.has\(value\)\?value:"narrow"/);
  assert.match(dashboard, /const tileWidthKey=\(deviceId,controlId\)=>`\$\{deviceId\}::\$\{controlId\|\|groupDeviceControlId\}`/);
  assert.match(dashboard, /const tileWidthPreference=key=>state\.tileWidths\[key\]\|\|"auto"/);
  assert.match(dashboard, /state\.tileWidths\[key\]=slot\.classList\.contains\("is-wide"\)\?"narrow":"wide"/);
  assert.match(dashboard, /localStorage\.setItem\(tileWidthStorageKey,JSON\.stringify\(state\.tileWidths\)\)/);
  assert.match(dashboard, /tileWidths:savedTileWidths/);
  // Kanonik anahtar cihaz kimliği (IEEE) + kontrol kimliği; dostane ad kullanılmıyor.
  assert.match(dashboard, /tileWidthKey\(device\.id,control\?control\.id:groupDeviceControlId\)/);
});

test("geniş buton kart içinde akıyor, kart kendi içinde kayabiliyor", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /#home \.widget-rail \.group-widget\{grid-column:span 2;display:grid;grid-template-rows:auto minmax\(0,1fr\)\}/);
  assert.match(dashboard, /#home \.widget-rail \.group-control-grid\{min-height:0;overflow-y:auto/);
  assert.match(dashboard, /\.group-control-grid\{--group-tile-span:2;[^}]*align-content:start/);
});

test("boyut simgesi metinleri iki dilde de var", async () => {
  const [english, turkish] = await Promise.all([readCatalog(englishLocaleUrl), readCatalog(turkishLocaleUrl)]);

  assert.equal(english.expandTile, "Widen button");
  assert.equal(english.collapseTile, "Narrow button");
  assert.equal(turkish.expandTile, "Butonu genişlet");
  assert.equal(turkish.collapseTile, "Butonu daralt");
});
