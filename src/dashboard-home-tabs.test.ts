import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);
const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

const readDashboard = (): Promise<string> => readFile(dashboardUrl, "utf8");

async function readCatalog(url: URL): Promise<Record<string, string>> {
  return JSON.parse(await readFile(url, "utf8")).translations as Record<string, string>;
}

/* Gönderilen kodun kendisi sınanıyor: ilgili işlev `public/index.html` içinden çıkarılıp
   sahte bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} bulunamadı`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} gövdesi kapanmıyor`);
}

type Entry = { device: { id: string }; control: { id: string } | null };

async function pickOverviewEntries(entries: Entry[], favorites: string[]): Promise<{ entries: Entry[]; fallback: boolean }> {
  const source = await readDashboard();
  const run = new Function(
    "entries",
    "favorites",
    `
    const isFavorite=(deviceId,controlId)=>favorites.includes(deviceId+"|"+controlId);
    ${extractFunction(source, "overviewGroupEntries")}
    return overviewGroupEntries(entries);
  `
  ) as (entries: Entry[], favorites: string[]) => { entries: Entry[]; fallback: boolean };
  return run(entries, favorites);
}

const device = (id: string, control: string | null): Entry => ({ device: { id }, control: control ? { id: control } : null });

test("Genel görünüm kartı favorileri süzer, favori yoksa tüm kontrolleri gösterir", async () => {
  const entries = [device("0x01", "main"), device("0x02", "main"), device("0x03", null)];

  const filtered = await pickOverviewEntries(entries, ["0x02|main"]);
  assert.deepEqual(filtered.entries.map((entry) => entry.device.id), ["0x02"]);
  assert.equal(filtered.fallback, false);

  // Hiç favori seçilmemişse kullanıcı henüz seçim yapmamıştır: boş kart yerine kontroller + ipucu.
  const fallback = await pickOverviewEntries(entries, []);
  assert.deepEqual(fallback.entries.map((entry) => entry.device.id), ["0x01", "0x02"]);
  assert.equal(fallback.fallback, true);

  // Yalnız sensörü olan grupta kart boş kalmaz: kontrol edilebilir cihaz yoksa hepsi görünür.
  const sensorsOnly = await pickOverviewEntries([device("0x09", null)], []);
  assert.deepEqual(sensorsOnly.entries.map((entry) => entry.device.id), ["0x09"]);
  assert.equal(sensorsOnly.fallback, true);
});

test("cihazı olmayan grup Genel görünümde kart basmaz, sekmesi durur", async () => {
  const source = await readDashboard();
  const rendered: string[] = [];
  const run = new Function(
    "rendered",
    `
    const groups=[{id:"auto:lights",items:[]},{id:"salon",items:["a"]},{id:"bos",items:[]}];
    const dashboardGroups=()=>groups;
    const groupControlEntries=group=>group.items;
    const groupWidgetHtml=group=>group.id;
    const $$=()=>[];
    const $=()=>({insertAdjacentHTML:(_position,html)=>rendered.push(html)});
    ${extractFunction(source, "renderGroupWidgets")}
    renderGroupWidgets();
  `
  ) as (rendered: string[]) => void;
  run(rendered);
  assert.deepEqual(rendered, ["salon"]);
});

test("grup görünürlüğü grup kimliğiyle widget düzeninde saklanır", async () => {
  const source = await readDashboard();
  const calls: string[] = [];
  const run = new Function(
    "calls",
    "widgets",
    `
    const groupWidgetPrefix="group:";
    const groupWidgetId=id=>\`\${groupWidgetPrefix}\${id}\`;
    const state={widgets};
    const addDashboardWidget=id=>calls.push("add:"+id);
    const removeDashboardWidget=id=>calls.push("remove:"+id);
    const touchDashboardEditing=()=>calls.push("touch");
    ${extractFunction(source, "toggleGroupOverview")}
    toggleGroupOverview("salon");
    toggleGroupOverview("auto:lights");
  `
  ) as (calls: string[], widgets: string[]) => void;
  run(calls, ["summary", "group:salon"]);
  assert.deepEqual(calls, ["remove:group:salon", "touch", "add:group:auto:lights", "touch"]);
});

test("alt şerit sekme çubuğu: Genel görünüm ilk ve kilitli, yeni grup düğmesi tablist dışında", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /<div id="homeTabs" class="device-grid quick-grid grid-view" role="tablist"/);
  // "+ yeni grup" tablist'in kardeşi: erişilebilirlik için sekme listesinin içine girmemeli.
  assert.match(dashboard, /<\/div>\s*<button id="createHomeGroup" class="quick-card quick-card-add" type="button"/);
  assert.match(dashboard, /const overviewTabId="overview"/);
  assert.match(dashboard, /id:overviewTabId,\s*name:t\("overviewTab"\),\s*icon:"overview",\s*locked:true/);
  // Roving tabindex + aria-selected: seçili sekme odak alır, diğerleri sıradan çıkar.
  assert.match(dashboard, /role="tab" id="hometab-\$\{esc\(item\.id\)\}" aria-selected="\$\{selected\?"true":"false"\}" tabindex="\$\{selected\?"0":"-1"\}"/);
  assert.match(dashboard, /aria-controls="\$\{item\.id===overviewTabId\?"widgetRail":"groupPanel"\}"/);
  assert.match(dashboard, /\$\("#homeTabs"\)\.addEventListener\("keydown",event=>\{if\(!\["ArrowLeft","ArrowRight","Home","End"\]\.includes\(event\.key\)\)return/);
  assert.match(dashboard, /function moveHomeTabFocus\(key\)\{/);
  assert.match(dashboard, /\$\("#createHomeGroup"\)\.onclick=\(\)=>openGroupEditor\(\)/);
  // Sekmeler düzenleme kipinde de dokunulabilir kalır.
  assert.doesNotMatch(dashboard, /\.widget-board\.editing \.quick-card\{pointer-events:none\}/);
});

test("sekme seçimi widget düzeninden ayrı bir kayıtta durur", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const homeTabStorageKey="villa-home-tab"/);
  assert.match(dashboard, /localStorage\.setItem\(homeTabStorageKey,state\.homeTab\)/);
  assert.match(dashboard, /function saveHomeTab\(\)\{/);
  // Widget düzeni kendi anahtarında kalır; iki kayıt karışmaz.
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-widgets",JSON\.stringify\(state\.widgets\)\)/);
  assert.doesNotMatch(extractFunction(dashboard, "saveWidgetLayout"), /homeTab/);
  // Bilinmeyen sekme kaydı Genel görünüme düşer.
  assert.match(dashboard, /if\(state\.homeTab!==overviewTabId&&!dashboardGroupById\(state\.homeTab\)\)\{state\.homeTab=overviewTabId;saveHomeTab\(\)\}/);
});

test("Işıklar grubu jenerik türetilir ve silinemez", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const lightsGroupId="auto:lights"/);
  // Sabit oda/isim listesi yok: sunucunun kategori çıkarımına dayanır.
  assert.match(dashboard, /state\.devices\.filter\(device=>device\.category==="light"\)/);
  assert.match(dashboard, /return\{id:lightsGroupId,name:t\("lightsGroup"\),items,locked:true\}/);
  assert.match(dashboard, /const dashboardGroups=\(\)=>\[lightsAutoGroup\(\),\.\.\.state\.groups\]/);
  // Kilitli grupta düzenle düğmesi basılmaz, katalogda da düzenleme ikonu çıkmaz.
  assert.match(dashboard, /const editButton=group\.locked\?"":`<button type="button" data-edit-group=/);
  assert.match(dashboard, /groupId:group\.locked\?null:group\.id/);
});

test("iki seviyeli filtre yalnız düzenleme kipinde görünür ve cihazı tetiklemez", async () => {
  const dashboard = await readDashboard();

  // Grup seviyesi: anahtar. Cihazsız grupta pasif ve sebebi yazılı.
  assert.match(dashboard, /class="ov-switch" type="button" role="switch" aria-checked="\$\{active\?"true":"false"\}"/);
  assert.match(dashboard, /\$\{empty\?" disabled aria-disabled=\\"true\\"":""\}/);
  assert.match(dashboard, /class="ov-switch-note">\$\{esc\(t\("showInOverviewEmpty"\)\)\}/);
  assert.match(dashboard, /state\.dashboardEditing\?overviewSwitchHtml\(group,entries\):""/);
  // Cihaz seviyesi: yıldız döşemenin kardeşi, kanonik kimlikle (cihaz UID + kontrol kimliği).
  assert.match(dashboard, /class="fav-star" type="button" role="switch" aria-checked="\$\{active\?"true":"false"\}" data-favorite-device="\$\{esc\(device\.id\)\}" data-favorite-control="\$\{esc\(control\.id\)\}"/);
  assert.match(dashboard, /\.fav-star\{position:absolute;z-index:6;right:56px;top:6px;width:44px;height:44px;display:none/);
  assert.match(dashboard, /\.widget-board\.editing \.fav-star\{display:grid\}/);
  assert.match(dashboard, /\.widget-board\.editing \.group-control-slot\.has-fav>\.group-control-tile\{padding-right:106px\}/);
  // Yıldız ve anahtar cihaza sızmaz: olay hem durdurulur hem de döşemenin dışındadır.
  assert.match(
    dashboard,
    /\$\$\("\.fav-star"\)\.forEach\(button=>button\.onclick=event=>\{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*toggleFavorite\(button\.dataset\.favoriteDevice,button\.dataset\.favoriteControl\);/
  );
  assert.match(
    dashboard,
    /\$\$\("\[data-overview-toggle\]"\)\.forEach\(button=>button\.onclick=event=>\{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*toggleGroupOverview\(button\.dataset\.overviewToggle\);/
  );
  assert.match(dashboard, /\$\$\("\[data-favorite-device\]:not\(\.fav-star\)"\)\.forEach/);
});

test("grup sekmesi tek kart, Genel görünüm rayı yerini alır ve şeridin üstünde biter", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /<section id="groupPanel" class="widget-card group-widget group-panel" role="tabpanel" tabindex="-1" hidden>/);
  assert.match(dashboard, /rail\.hidden=Boolean\(group\);\s*panel\.hidden=!group;/);
  assert.match(dashboard, /panel\.innerHTML=groupWidgetHtml\(group,\{variant:"panel"\}\)/);
  assert.match(dashboard, /#widgetRail\[hidden\],#groupPanel\[hidden\]\{display:none\}/);
  // Sekme panelinde grubun TÜM cihazları var: süzme yalnız Genel görünüm kartında yapılır.
  assert.match(dashboard, /const picked=overview\?overviewGroupEntries\(entries\):\{entries,fallback:false\}/);
  // Yükseklik mekanizması ikisinde de aynı: pano kalan alanı alır, şeride 18px pay kalır
  // (106px pay eksi 76px şerit eksi 12px alt boşluk).
  assert.match(
    dashboard,
    /#home\.active\{min-height:0;display:flex;flex-direction:column;height:calc\(100dvh - var\(--home-top\) - 106px - env\(safe-area-inset-bottom\)\)\}/
  );
  assert.match(dashboard, /#home \[data-widget="quick"\]\{position:fixed;[^}]*bottom:calc\(12px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(dashboard, /#home \[data-widget="quick"\]\{height:76px\}/);
  // Panel de rayla aynı yuvada, hub'ın sağında ve kendi içinde kayar.
  assert.match(dashboard, /#home \.group-panel\{grid-column:1\/-1;grid-row:1;min-height:0;height:100%;margin:0 0 0 calc\(var\(--hub-column\) \+ 10px\)/);
});

test("Genel görünümde widget ekleme, taşıma ve kaldırma yolları duruyor", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /function moveDashboardWidget\(id,direction\)\{/);
  assert.match(dashboard, /function reconcileWidgetLayout\(\)\{/);
  assert.match(dashboard, /function applyWidgetLayout\(\)\{/);
  // Sekme geçişi düzeni değil yalnız görünen paneli değiştirir: sıralama listesine dokunmaz.
  // Sekme geçişi düzeni değil yalnız görünen paneli değiştirir: sıralama listesine yazmaz.
  const applyHomeTab = extractFunction(dashboard, "applyHomeTab");
  assert.doesNotMatch(applyHomeTab, /state\.widgets/);
  assert.match(applyHomeTab, /rail\.hidden=Boolean\(group\)/);
  // Düzenleme kipinde gizlenmiş grup kartı da görünür ki anahtarı geri açılabilsin.
  assert.match(dashboard, /if\(state\.dashboardEditing\)for\(const widget of \$\$\("#widgetRail \[data-group-widget\]"\)\)/);
});

test("sekme çubuğu metinleri iki dilde de var", async () => {
  const [english, turkish] = await Promise.all([readCatalog(englishLocaleUrl), readCatalog(turkishLocaleUrl)]);

  for (const key of [
    "homeTabsLabel",
    "homeTabsWidget",
    "homeTabsWidgetLead",
    "overviewTab",
    "overviewTabSummary",
    "groupTabDevices",
    "lightsGroup",
    "showInOverview",
    "showInOverviewEmpty",
    "overviewFavoriteHint",
    "openGroupTab"
  ]) {
    assert.ok(english[key], `${key} İngilizce katalogda yok`);
    assert.ok(turkish[key], `${key} Türkçe katalogda yok`);
  }
  assert.equal(english.overviewTab, "Overview");
  assert.equal(turkish.overviewTab, "Genel görünüm");
  assert.equal(english.lightsGroup, "Lights");
  assert.equal(turkish.lightsGroup, "Işıklar");
  // Yerini kaybeden hızlı erişim metinleri katalogdan da düştü.
  for (const key of ["quickLead", "noQuickControls", "quickEmptyLead", "quickEmptyAction"]) {
    assert.equal(english[key], undefined, `${key} hâlâ İngilizce katalogda`);
    assert.equal(turkish[key], undefined, `${key} hâlâ Türkçe katalogda`);
  }
});
