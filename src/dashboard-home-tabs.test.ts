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

interface VisibilityRun {
  hiddenTiles: string[];
  hiddenGroups: string[];
  storage: Record<string, string>;
  writes: unknown[];
  toasts: string[];
}

/* Görünürlük yükleme/göç akışı, gönderilen kodun kendisiyle çalıştırılıyor: sahte `api`,
   sahte `localStorage` ve sahte panel çizimiyle. */
async function runVisibilityLoad(options: {
  storage: Record<string, string>;
  response?: unknown;
  loadFails?: boolean;
  saveFails?: boolean;
}): Promise<VisibilityRun> {
  const source = await readDashboard();
  const result: VisibilityRun = {
    hiddenTiles: [],
    hiddenGroups: [],
    storage: { ...options.storage },
    writes: [],
    toasts: []
  };
  const factory = new Function(
    "options",
    "result",
    `
    const groupDeviceControlId="@device";
    const groupWidgetPrefix="group:";
    const hiddenTilesStorageKey="villa-hidden-tiles";
    const removedWidgetsKey="villa-dashboard-removed-widgets";
    const visibilityCacheKey="villa-home-visibility-cache";
    const tileVisibilityKey=(deviceId,controlId)=>\`\${deviceId}::\${controlId||groupDeviceControlId}\`;
    const localStorage={
      getItem:key=>Object.hasOwn(result.storage,key)?result.storage[key]:null,
      setItem:(key,value)=>{result.storage[key]=value},
      removeItem:key=>{delete result.storage[key]}
    };
    const state={hiddenTiles:new Set(),hiddenGroups:new Set(),removedWidgets:new Set(
      JSON.parse(result.storage[removedWidgetsKey]||"[]")
    )};
    const t=(key,values)=>key+":"+JSON.stringify(values||{});
    const showToast=message=>{result.toasts.push(message)};
    const applyWidgetLayout=()=>{};
    const render=()=>{};
    const saveRemovedWidgets=()=>{
      result.storage[removedWidgetsKey]=JSON.stringify([...state.removedWidgets]);
    };
    const api=async(url,init)=>{
      if(!init){
        if(options.loadFails)throw new Error("offline");
        return{visibility:options.response};
      }
      result.writes.push(JSON.parse(init.body).visibility);
      if(options.saveFails)throw new Error("disk dolu");
      return{ok:true};
    };
    ${extractFunction(source, "visibilityPayload")}
    ${extractFunction(source, "cacheVisibility")}
    ${extractFunction(source, "applyVisibility")}
    async ${extractFunction(source, "saveHomeVisibility")}
    ${extractFunction(source, "legacyVisibility")}
    ${extractFunction(source, "clearLegacyVisibility")}
    async ${extractFunction(source, "loadHomeVisibility")}
    return async()=>{
      await loadHomeVisibility();
      result.hiddenTiles=[...state.hiddenTiles];
      result.hiddenGroups=[...state.hiddenGroups];
    };
  `
  ) as (options: unknown, result: VisibilityRun) => () => Promise<void>;
  await factory(options, result)();
  return result;
}

type Entry = { device: { id: string }; control: { id: string } | null };

async function pickOverviewEntries(entries: Entry[], hidden: string[]): Promise<{ entries: Entry[]; hidden: number }> {
  const source = await readDashboard();
  const run = new Function(
    "entries",
    "hidden",
    `
    const isTileHidden=(deviceId,controlId)=>hidden.includes(deviceId+"::"+(controlId||"@device"));
    ${extractFunction(source, "overviewGroupEntries")}
    return overviewGroupEntries(entries);
  `
  ) as (entries: Entry[], hidden: string[]) => { entries: Entry[]; hidden: number };
  return run(entries, hidden);
}

const device = (id: string, control: string | null): Entry => ({ device: { id }, control: control ? { id: control } : null });

/* Varsayılan GÖRÜNÜR: yeni eklenen cihaz hiçbir şey yapılmadan odasının kartında çıkmalı.
   Kayıt yalnız kullanıcının gizlediklerini tutar. */
test("Genel görünüm kartı varsayılan olarak her cihazı gösterir, yalnız gizlenenleri süzer", async () => {
  const entries = [device("0x01", "main"), device("0x02", "main"), device("0x03", null)];

  const untouched = await pickOverviewEntries(entries, []);
  assert.deepEqual(untouched.entries.map((entry) => entry.device.id), ["0x01", "0x02", "0x03"]);
  assert.equal(untouched.hidden, 0);

  const filtered = await pickOverviewEntries(entries, ["0x02::main"]);
  assert.deepEqual(filtered.entries.map((entry) => entry.device.id), ["0x01", "0x03"]);
  assert.equal(filtered.hidden, 1);

  // Kontrolü olmayan cihaz (sensör) de gizlenebilir: anahtarı `@device`.
  const sensorHidden = await pickOverviewEntries(entries, ["0x03::@device"]);
  assert.deepEqual(sensorHidden.entries.map((entry) => entry.device.id), ["0x01", "0x02"]);
  assert.equal(sensorHidden.hidden, 1);
});

test("görünürlük kararı sunucuda durur, yerel kayıt yalnız göç ve çevrimdışı yansıdır", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const tileVisibilityKey=\(deviceId,controlId\)=>`\$\{deviceId\}::\$\{controlId\|\|groupDeviceControlId\}`/);
  // Kayıt yalnız gizlenenleri tutar: listede olmayan her şey görünür.
  assert.match(dashboard, /await api\("\/api\/home-visibility",\{method:"PUT",body:JSON\.stringify\(\{visibility:visibilityPayload\(\)\}\)\}\)/);
  assert.match(dashboard, /visibility=\(await api\("\/api\/home-visibility"\)\)\.visibility/);
  assert.match(dashboard, /hiddenGroups:\[\.\.\.state\.hiddenGroups\]/);
  // Döşeme genişliği ve kart sırası cihazda kalır: yerleşim tercihi, ev kararı değil.
  assert.match(dashboard, /const tileWidthStorageKey="villa-tile-widths"/);
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-widgets",JSON\.stringify\(state\.widgets\)\)/);
  // Eski favori uç noktası arayüzden çağrılmıyor; sunucudaki kayıt yerinde duruyor.
  assert.doesNotMatch(dashboard, /\/api\/favorites/);
});

test("eski yerel görünürlük kaydı bir kez sunucuya taşınır, sonra silinir", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const hiddenTilesStorageKey="villa-hidden-tiles"/);
  // Grup görünürlüğü eskiden kart sırasının içindeydi; göç onu `group:` önekinden toplar.
  assert.match(dashboard, /read\(removedWidgetsKey,"\[\]"\)\s*\.filter\(id=>id\.startsWith\(groupWidgetPrefix\)\)\s*\.map\(id=>id\.slice\(groupWidgetPrefix\.length\)\)/);
  assert.match(dashboard, /const serverEmpty=!\(visibility\?\.hiddenDevices\|\|\[\]\)\.length&&!\(visibility\?\.hiddenGroups\|\|\[\]\)\.length/);
  // Yazma başarısızsa yerel kayıt silinmez: seçim kaybolmaz, bir sonraki açılışta yeniden denenir.
  assert.match(dashboard, /if\(await saveHomeVisibility\(\)\)clearLegacyVisibility\(\)/);
  assert.match(dashboard, /localStorage\.removeItem\(hiddenTilesStorageKey\)/);
  // Çevrimdışı: son bilinen değerle çalışmaya devam eder, kayıt sıfırlanmaz.
  assert.match(dashboard, /showToast\(t\("visibilityLoadFailed",\{error:error\.message\}\),true\);\s*return;/);
  assert.match(dashboard, /const visibilityCacheKey="villa-home-visibility-cache"/);
});

test("bugün cihazda yapılmış seçimler göçte kaybolmuyor", async () => {
  const run = await runVisibilityLoad({
    storage: {
      "villa-hidden-tiles": JSON.stringify(["0xa4c138ea872c2c8e::l1", "0x20a716fffe6835f1::@device"]),
      // Grup görünürlüğü eskiden kart sırasının içindeydi; `group:` girdileri göçe dahil.
      "villa-dashboard-removed-widgets": JSON.stringify(["group:salon", "summary"])
    },
    response: { hiddenDevices: [], hiddenGroups: [] }
  });

  assert.deepEqual(run.writes, [{
    hiddenDevices: [
      { deviceId: "0xa4c138ea872c2c8e", controlId: "l1" },
      { deviceId: "0x20a716fffe6835f1", controlId: "@device" }
    ],
    hiddenGroups: ["salon"]
  }]);
  assert.deepEqual(run.hiddenGroups, ["salon"]);
  // Göç bitti: eski anahtar silinir, sıra kaydındaki `group:` girdisi düşer, bilgi kartı kalır.
  assert.equal(Object.hasOwn(run.storage, "villa-hidden-tiles"), false);
  assert.deepEqual(JSON.parse(run.storage["villa-dashboard-removed-widgets"] as string), ["summary"]);
});

test("göç yazması başarısızsa yerel kayıt silinmiyor", async () => {
  const run = await runVisibilityLoad({
    storage: { "villa-hidden-tiles": JSON.stringify(["0xa4c138ea872c2c8e::l1"]) },
    response: { hiddenDevices: [], hiddenGroups: [] },
    saveFails: true
  });

  assert.equal(run.writes.length, 1);
  assert.match(run.toasts.join(" "), /visibilitySaveFailed/);
  assert.ok(Object.hasOwn(run.storage, "villa-hidden-tiles"));
});

test("sunucuda kayıt varsa o kazanır, yerel kalıntı temizlenir", async () => {
  const run = await runVisibilityLoad({
    storage: {
      "villa-hidden-tiles": JSON.stringify(["0xa4c138ea872c2c8e::l1"]),
      "villa-dashboard-removed-widgets": JSON.stringify(["group:salon"])
    },
    response: {
      hiddenDevices: [{ deviceId: "0x20a716fffe6835f1", controlId: "main" }],
      hiddenGroups: ["mutfak"]
    }
  });

  assert.deepEqual(run.writes, []);
  assert.deepEqual(run.hiddenTiles, ["0x20a716fffe6835f1::main"]);
  assert.deepEqual(run.hiddenGroups, ["mutfak"]);
  assert.equal(Object.hasOwn(run.storage, "villa-hidden-tiles"), false);
  assert.deepEqual(JSON.parse(run.storage["villa-dashboard-removed-widgets"] as string), []);
});

test("çevrimdışıyken panel son bilinen değerle çalışmayı sürdürüyor", async () => {
  const cache = JSON.stringify({
    hiddenDevices: ["0xa4c138ea872c2c8e::l1"],
    hiddenGroups: ["salon"]
  });
  const run = await runVisibilityLoad({
    storage: {
      "villa-hidden-tiles": JSON.stringify(["0xa4c138ea872c2c8e::l1"]),
      "villa-home-visibility-cache": cache
    },
    loadFails: true
  });

  // Sunucuya yazılmaz, yerel kayıt sıfırlanmaz, kullanıcı görünür uyarı alır.
  assert.deepEqual(run.writes, []);
  assert.match(run.toasts.join(" "), /visibilityLoadFailed/);
  assert.equal(run.storage["villa-home-visibility-cache"], cache);
  assert.ok(Object.hasOwn(run.storage, "villa-hidden-tiles"));
});

test("gizli cihaz sayısı kartın altında duyurulur ve Cihazlar görünümüne götürür", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const hiddenNote=overview&&!state\.dashboardEditing&&picked\.hidden/);
  assert.match(dashboard, /<button class="ov-hidden-note" type="button" data-hidden-room="\$\{esc\(group\.id\)\}">\$\{esc\(t\("hiddenDevicesNote",\{count:picked\.hidden\}\)\)\}<\/button>/);
  assert.match(dashboard, /function openHiddenDevices\(groupId\)\{/);
  assert.match(dashboard, /const room=groupId&&state\.groups\.some\(group=>group\.id===groupId\)\?groupId:null/);
  assert.match(dashboard, /activateView\("devices"\);\s*setRoomFilter\(room\)/);
  // Grup sekmesinde gizli cihazlar görünmeye devam eder, yalnız soluk gösterilir.
  assert.match(dashboard, /const picked=overview\?overviewGroupEntries\(entries\):\{entries,hidden:0\}/);
  assert.match(dashboard, /\.group-control-slot\.is-hidden-tile>\.group-control-tile\{opacity:\.62\}/);
});

test("odasız cihazlar için türetilmiş kart var, boşsa hiç çıkmaz", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const noRoomGroupId="auto:noroom"/);
  assert.match(dashboard, /const deviceHasRoom=device=>state\.groups\.some\(group=>group\.items\.some\(item=>item\.deviceId===device\.id\)\)/);
  assert.match(dashboard, /return\{id:noRoomGroupId,name:t\("noRoomGroup"\),items,locked:true\}/);
  assert.match(dashboard, /return\[lightsAutoGroup\(\),\.\.\.state\.groups,\.\.\.\(noRoom\.items\.length\?\[noRoom\]:\[\]\)\]/);
  // Kart kullanıcıyı Cihazlar bölümüne yönlendirir: oda oradan seçilir.
  assert.match(dashboard, /const roomNote=overview&&!state\.dashboardEditing&&group\.id===noRoomGroupId/);
});

test("eşleştirme akışının son adımı oda seçimi", async () => {
  const dashboard = await readDashboard();

  // Ad → görsel → rol → oda. Rol atlanınca da oda adımı gelir.
  assert.match(dashboard, /if\(!deviceRoleAskable\(device\)\)\{if\(afterPairing\)askDeviceRoom\(id,true\);return\}/);
  assert.match(dashboard, /if\(editing\?\.afterPairing\)askDeviceRoom\(editing\.id,true\);else render\(\)/);
  assert.match(dashboard, /function askDeviceRoom\(id,afterPairing=false\)\{/);
  // "Sonra" denirse cihaz odasız kalır ve eşleştirme biter.
  assert.match(dashboard, /\$\("#deviceRoomDialog"\)\.onclose=\(\)=>\{const editing=state\.roomEditing;state\.roomEditing=null;if\(editing\?\.afterPairing\)finishPairingFlow\(editing\.id\);else render\(\)\}/);
  // Oda ataması mevcut grup üyeliğini kullanır, yeni depo açılmaz.
  assert.match(dashboard, /await toggleDeviceRoom\(editing\.id,groupId\)/);
  assert.match(dashboard, /function createDeviceRoom\(event\)\{/);
  assert.match(dashboard, /<dialog id="deviceRoomDialog">/);
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

/* Görünürlük artık kart sırasından ayrı: anahtar `hiddenGroups`'a yazar ve sunucuya gider,
   `state.widgets` (sıra) hiç değişmez. */
test("grup görünürlüğü kart sırasına dokunmadan sunucuya yazılır", async () => {
  const source = await readDashboard();
  const calls: string[] = [];
  const state = { widgets: ["summary", "group:salon"], hiddenGroups: new Set<string>() };
  const run = new Function(
    "calls",
    "state",
    `
    const groupWidgetPrefix="group:";
    const applyWidgetLayout=()=>calls.push("layout");
    const render=()=>calls.push("render");
    const saveHomeVisibility=async()=>{calls.push("save");return true};
    const touchDashboardEditing=()=>calls.push("touch");
    ${extractFunction(source, "setGroupOverview")}
    ${extractFunction(source, "toggleGroupOverview")}
    toggleGroupOverview("salon");
    toggleGroupOverview("auto:lights");
    toggleGroupOverview("salon");
  `
  ) as (calls: string[], state: { widgets: string[]; hiddenGroups: Set<string> }) => void;
  run(calls, state);

  assert.deepEqual([...state.hiddenGroups], ["auto:lights"]);
  assert.deepEqual(state.widgets, ["summary", "group:salon"]);
  assert.equal(calls.filter((call) => call === "save").length, 3);
});

test("oda kartında kaldır düğmesi sırayı değil görünürlüğü değiştirir", async () => {
  const source = await readDashboard();
  interface RemoveState {
    widgets: string[];
    removedWidgets: Set<string>;
    hiddenGroups: Set<string>;
  }
  const state: RemoveState = {
    widgets: ["summary", "group:salon"],
    removedWidgets: new Set<string>(),
    hiddenGroups: new Set<string>()
  };
  const run = new Function(
    "state",
    `
    const groupWidgetPrefix="group:";
    const applyWidgetLayout=()=>{};
    const render=()=>{};
    const saveHomeVisibility=async()=>true;
    const saveRemovedWidgets=()=>{};
    const saveWidgetLayout=()=>{};
    const touchDashboardEditing=()=>{};
    ${extractFunction(source, "setGroupOverview")}
    ${extractFunction(source, "removeDashboardWidget")}
    removeDashboardWidget("group:salon");
    removeDashboardWidget("summary");
  `
  ) as (state: RemoveState) => void;
  run(state);

  // Oda kartı sırasını korur (geri açılınca yeri kaymasın), bilgi kartı listeden düşer.
  assert.deepEqual(state.widgets, ["group:salon"]);
  assert.deepEqual([...state.hiddenGroups], ["salon"]);
  assert.deepEqual([...state.removedWidgets], ["summary"]);
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
  assert.match(dashboard, /const noRoom=noRoomAutoGroup\(\);\s*return\[lightsAutoGroup\(\),\.\.\.state\.groups/);
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
  // Cihaz seviyesi: göz döşemenin kardeşi, kanonik kimlikle (cihaz UID + kontrol kimliği).
  assert.match(dashboard, /class="tile-eye" type="button" role="switch" aria-checked="\$\{hidden\?"false":"true"\}" data-visibility-device="\$\{esc\(device\.id\)\}" data-visibility-control="\$\{esc\(control\?control\.id:groupDeviceControlId\)\}"/);
  assert.match(dashboard, /\.tile-eye\{position:absolute;z-index:6;right:56px;top:6px;width:44px;height:44px;display:none/);
  assert.match(dashboard, /\.widget-board\.editing \.tile-eye\{display:grid\}/);
  assert.match(dashboard, /\.widget-board\.editing \.group-control-slot\.has-eye>\.group-control-tile\{padding-right:106px\}/);
  // Göz ve anahtar cihaza sızmaz: olay hem durdurulur hem de döşemenin dışındadır.
  assert.match(
    dashboard,
    /\$\$\("\.tile-eye"\)\.forEach\(button=>button\.onclick=event=>\{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*toggleTileVisibility\(button\.dataset\.visibilityDevice,button\.dataset\.visibilityControl\);/
  );
  assert.match(
    dashboard,
    /\$\$\("\[data-overview-toggle\]"\)\.forEach\(button=>button\.onclick=event=>\{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*toggleGroupOverview\(button\.dataset\.overviewToggle\);/
  );
  assert.match(dashboard, /\$\$\("\[data-visibility-device\]:not\(\.tile-eye\)"\)\.forEach/);
});

/* Kullanıcı isteği: grup içinde bir cihaz açıkken kartın ZEMİNİ değişmesin. Döşemenin kendi
   "açık" rengi kalır — kaldırılan yalnız kartın geneline yayılan sarımsı görünüm. */
test("grup kartının zemini cihaz açıkken değişmez, döşemenin açık rengi kalır", async () => {
  const dashboard = await readDashboard();

  // Kart seviyesindeki "on" kuralı ve onu besleyen hesap tamamen kalktı: ölü CSS bırakılmadı.
  assert.doesNotMatch(dashboard, /\.group-widget\.on\{/);
  assert.doesNotMatch(dashboard, /groupAnyOn|anyOn/);
  assert.doesNotMatch(dashboard, /panel\.classList\.toggle\("on"/);
  assert.match(dashboard, /class="dashboard-widget widget-card group-widget\$\{groupInOverview\(group\)\?"":" is-off"\}"/);
  // Kart her durumda aynı dolguyu kullanır: %82 saydam ev dolgusu.
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.widget-card\{border-color:var\(--home-border\);background:var\(--home-control\)/);
  assert.match(dashboard, /\.group-widget\{grid-column:span 6;padding:22px\}/);
  // Döşemenin kendi açık rengi yerinde.
  assert.match(dashboard, /\.group-control-tile\.on\{border-color:#e1a33f;color:#70470e;background:#fff0c7\}/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.group-control-tile\.on\{border-color:rgba\(225,163,63,\.74\);background:rgba\(255,239,191,\.88\)\}/);
});

test("grup sekmesi tek kart, Genel görünüm rayı yerini alır ve şeridin üstünde biter", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /<section id="groupPanel" class="widget-card group-widget group-panel" role="tabpanel" tabindex="-1" hidden>/);
  assert.match(dashboard, /rail\.hidden=Boolean\(group\);\s*panel\.hidden=!group;/);
  assert.match(dashboard, /panel\.innerHTML=groupWidgetHtml\(group,\{variant:"panel"\}\)/);
  assert.match(dashboard, /#widgetRail\[hidden\],#groupPanel\[hidden\]\{display:none\}/);
  // Sekme panelinde grubun TÜM cihazları var: süzme yalnız Genel görünüm kartında yapılır.
  assert.match(dashboard, /const picked=overview\?overviewGroupEntries\(entries\):\{entries,hidden:0\}/);
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

/* Hata: bir grup sekmesindeyken kart içindeki döşemeye dokununca alt şerit başa kayıyordu.
   Kök neden ölçüldü: `innerHTML` yeniden yazımı konumu bozmuyor, ama düzen turundaki
   `board.insertBefore(quick,rail)` şeridi taşıyan bölümü DOM'dan çıkarıp geri koyuyor ve
   tarayıcı `scrollLeft`i sıfırlıyor. Düğüm zaten yerindeyse artık taşınmıyor. */
test("düzen turu yerinde duran kartı taşımıyor", async () => {
  const source = await readDashboard();
  const run = new Function(
    "moves",
    `
    const rail={};
    const quick={parentElement:null,nextElementSibling:null};
    const board={insertBefore(node,reference){moves.push("move");node.parentElement=board;node.nextElementSibling=reference}};
    ${extractFunction(source, "placeNode")}
    placeNode(board,quick,rail);
    placeNode(board,quick,rail);
    placeNode(board,quick,rail);
  `
  ) as (moves: string[]) => void;
  const moves: string[] = [];
  run(moves);
  // İlk turda gerçekten taşınır, sonraki her turda dokunulmaz.
  assert.deepEqual(moves, ["move"]);
});

test("kaydırma konumları düzen turu boyunca korunuyor", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /const scrollPositions=captureScrollPositions\(\);\s*reconcileWidgetLayout\(\);/);
  assert.match(dashboard, /restoreScrollPositions\(scrollPositions\);\s*requestAnimationFrame\(updateWidgetScrollHint\)/);
  assert.match(dashboard, /const scrollKeepers=\(\)=>\[\$\("#homeTabs"\),\$\("#widgetRail"\)\]\.filter\(Boolean\)/);
  // Kartın kendi dikey kaydırması da grup kimliğiyle saklanır: ızgara her turda yeniden yazılıyor.
  assert.match(dashboard, /const gridScrollKey=grid=>grid\.closest\("\[data-group-widget\]"\)\?\.dataset\.groupWidget\|\|\(grid\.closest\("#groupPanel"\)\?"panel":null\)/);
  // Taşıma artık koşullu: `insertBefore` yerine `placeNode`.
  const layout = extractFunction(dashboard, "applyWidgetLayout");
  assert.doesNotMatch(layout, /insertBefore/);
  assert.match(layout, /placeNode\(board,widget,rail\)/);
  assert.match(layout, /placeNode\(rail,widget,\$\("#widgetEmpty"\)\)/);
  // Odak ve görüş alanına kaydırma yalnız kullanıcı sekme değiştirdiğinde: her render'da değil.
  assert.match(extractFunction(dashboard, "selectHomeTab"), /tab\.scrollIntoView\(\{[^}]*\}\);\s*tab\.focus\(\)/);
  assert.doesNotMatch(extractFunction(dashboard, "renderHomeTabs"), /focus\(\)|scrollIntoView/);
  assert.doesNotMatch(extractFunction(dashboard, "applyHomeTab"), /focus\(\)|scrollIntoView/);
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
    "hiddenDevicesNote",
    "noRoomGroup",
    "noRoomCardHint",
    "showOnRoomCard",
    "hideFromRoomCard",
    "deviceRoomTitle",
    "deviceRoomLead",
    "deviceRoomNone",
    "deviceRoomNewLabel",
    "deviceRoomCreate",
    "deviceRoomLater",
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
  assert.equal(english.noRoomGroup, "No room");
  assert.equal(turkish.noRoomGroup, "Odasız");
  // Favori dili tamamen kalktı: yerini göster/gizle aldı.
  for (const key of ["quickLead", "noQuickControls", "quickEmptyLead", "quickEmptyAction", "showOnHome", "removeFromHome", "overviewFavoriteHint"]) {
    assert.equal(english[key], undefined, `${key} hâlâ İngilizce katalogda`);
    assert.equal(turkish[key], undefined, `${key} hâlâ Türkçe katalogda`);
  }
});
