import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);
const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

async function readDashboardBundle(): Promise<string> {
  const [dashboard, englishSource, turkishSource] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(englishLocaleUrl, "utf8"),
    readFile(turkishLocaleUrl, "utf8")
  ]);
  const catalogs = [englishSource, turkishSource].map((source) => JSON.parse(source).translations);
  const searchableTranslations = catalogs
    .flatMap((catalog) => Object.entries(catalog).map(([key, value]) => `${key}:${JSON.stringify(value)}`))
    .join(",");
  return `${dashboard}\n${searchableTranslations}`;
}

function dashboardScripts(dashboard: string): string {
  return [...dashboard.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join("\n");
}

test("bağlantılar ekranı yalnız Matter sistemlerini tarif eder", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /homePlatforms:"Matter systems"/);
  assert.match(dashboard, /homePlatforms:"Matter sistemleri"/);
  assert.match(dashboard, /connectPlatform:"Connect Matter system"/);
  assert.match(dashboard, /connectPlatform:"Matter sistemi bağla"/);
  assert.doesNotMatch(dashboard, />Home platforms</);
  assert.doesNotMatch(dashboard, />Ev platformları</);
  assert.doesNotMatch(dashboard, /Connect a platform/);
  assert.doesNotMatch(dashboard, /Yeni platform bağla/);
});

test("Home Assistant kartı LAN IP ve EN/TR sabitleme rehberi sunar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /state\.network\?\.preferredAddress/);
  assert.doesNotMatch(dashboard, /location\.hostname/);
  assert.match(dashboard, /haStableIpTitle:"Keep the tablet IP address stable"/);
  assert.match(dashboard, /haStableIpTitle:"Tabletin IP adresini sabit tutun"/);
  assert.match(dashboard, /DHCP reservation/);
  assert.match(dashboard, /DHCP rezervasyonu/);
  assert.match(dashboard, /MAC address Android uses for this network/);
  assert.match(dashboard, /Android’in bu ağ için kullandığı MAC adresini/);
  assert.match(dashboard, /Network & Internet → Internet → current network → pencil\/advanced → IP settings → Static/);
  assert.match(dashboard, /Ağ ve İnternet → İnternet → geçerli ağ → kalem\/gelişmiş → IP ayarları → Statik/);
  assert.match(dashboard, /IP ayarları → Statik/);
  assert.match(dashboard, /gateway, DNS and subnet/);
  assert.match(dashboard, /Ağ geçidi, DNS ve alt ağ/);
  assert.match(dashboard, /different from editing the MQTT URL/);
  assert.match(dashboard, /MQTT adresini düzenlemekten farklıdır/);
  assert.match(dashboard, /VillaAndroid\.openWifiSettings\(\)/);
  assert.match(dashboard, /button\.hidden=!available/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("cihaz kaldırma Android WebView uyumlu ve açıkça yıkıcı bir diyalog kullanır", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="removeDialog"/);
  assert.match(dashboard, /id="removeConfirmation"/);
  assert.match(dashboard, /Remove from Zigbee network\?/);
  assert.match(dashboard, /Zigbee ağından kaldırılsın mı\?/);
  assert.match(dashboard, /physical Zigbee device/);
  assert.match(dashboard, /fiziksel Zigbee cihazına/);
  assert.match(dashboard, /type yes or evet in lowercase/);
  assert.match(dashboard, /küçük harflerle yes veya evet yazın/);
  assert.match(dashboard, /autocapitalize="none"/);
  assert.match(dashboard, /\["yes","evet"\]\.includes/);
  assert.match(dashboard, /if\(Array\.isArray\(data\.favorites\)\)state\.favorites=data\.favorites/);
  assert.match(dashboard, /showModal\(\)/);
  assert.doesNotMatch(dashboard, /prompt\(t\("confirmRemoval"/);
});

test("cihaz ekleme arama, gizleme ve otomatik tamamlama modalı sunar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="pairingDialog"/);
  assert.match(dashboard, /class="pairing-ring"/);
  assert.match(dashboard, /id="hidePairing"/);
  assert.match(dashboard, /id="showPairing"/);
  assert.match(dashboard, /\.pairing-banner-actions button\[hidden\],\.modal-actions button\[hidden\]\{display:none\}/);
  assert.match(dashboard, /id="pairingDeviceName"/);
  assert.match(dashboard, /pairingFoundBanner:"Found \{name\}/);
  assert.match(dashboard, /pairingFoundBanner:"\{name\} bulundu/);
  assert.match(dashboard, /const found=state\.pairing\?\.device/);
  assert.match(dashboard, /found\.interviewCompleted===true\?"ready":"found"/);
  assert.doesNotMatch(dashboard, /baseline:state\.devices/);
  assert.match(dashboard, /overviewLoaded:false/);
  assert.match(dashboard, /button\.disabled=!state\.overviewLoaded/);
  assert.match(dashboard, /if\(open&&!state\.overviewLoaded\)return/);
  assert.match(dashboard, /api\("\/api\/pairing\/stop"/);
  assert.match(dashboard, /setTimeout\(async\(\)=>/);
  assert.match(dashboard, /options\.body===undefined\?\{\}:\{"content-type":"application\/json"\}/);
});

test("Devices görünümü mobil pull-to-refresh hareketi sunar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="pullRefresh"/);
  assert.match(dashboard, /pullToRefresh:"Pull to refresh"/);
  assert.match(dashboard, /pullToRefresh:"Yenilemek için aşağı çekin"/);
  assert.match(dashboard, /addEventListener\("touchmove"/);
  assert.match(dashboard, /\{passive:false\}/);
  assert.match(dashboard, /window\.scrollY>0/);
  assert.match(dashboard, /pullRefreshState\.distance>=pullRefreshThreshold/);
  assert.match(dashboard, /await refresh\(\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("başarılı eşleştirme yeni cihaz isimlendirme adımını açar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /nameNewDevice:"Name your new device"/);
  assert.match(dashboard, /nameNewDevice:"Yeni cihazınıza isim verin"/);
  assert.match(dashboard, /id="cancelName"/);
  assert.match(dashboard, /minlength="2"/);
  assert.match(dashboard, /openPairingName\(session\.foundId\)/);
  assert.match(dashboard, /state\.editing=\{id,channel:null,afterPairing:true\}/);
  assert.match(dashboard, /editing\?\.afterPairing/);
  assert.match(dashboard, /finishPairingFlow\(editing\.id\)/);
  assert.match(dashboard, /\$\("#cancelName"\)\.textContent=t\(afterPairing\?"skip":"cancel"\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("belirsiz cihaz görseli eşleştirme sonrasında kullanıcıya seçtirilir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="imageDialog"/);
  assert.match(dashboard, /chooseDeviceImage:"Which one looks like your device\?"/);
  assert.match(dashboard, /chooseDeviceImage:"Hangisi cihazınıza benziyor\?"/);
  assert.match(dashboard, /device\?\.image\?\.selectionRequired/);
  assert.match(dashboard, /openImageChooser\(id,true\)/);
  assert.match(dashboard, /data-change-image=/);
  assert.match(dashboard, /applyToModel:\$\("#applyImageToModel"\)\.checked/);
  assert.match(dashboard, /imageModel:editing\.selected/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("diller ayrı ve genişletilebilir JSON paketlerinden yüklenir", async () => {
  const [dashboard, englishSource, turkishSource] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(englishLocaleUrl, "utf8"),
    readFile(turkishLocaleUrl, "utf8")
  ]);
  const english = JSON.parse(englishSource);
  const turkish = JSON.parse(turkishSource);

  assert.equal(english.code, "en");
  assert.equal(turkish.code, "tr");
  assert.deepEqual(
    Object.keys(english.translations).sort(),
    Object.keys(turkish.translations).sort()
  );
  assert.match(dashboard, /api\("\/api\/locales"\)/);
  assert.match(dashboard, /Object\.keys\(translations\)/);
  assert.match(dashboard, /data-language="\$\{esc\(code\)\}"/);
  assert.doesNotMatch(dashboard, /const translations=\{\s*en:/);
});

test("tema seçimi açık, koyu ve sistem modlarını kalıcı ve canlı destekler", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /data-theme-mode="light"/);
  assert.match(dashboard, /data-theme-mode="dark"/);
  assert.match(dashboard, /data-theme-mode="system"/);
  assert.match(dashboard, /themeLight:"Light"/);
  assert.match(dashboard, /themeDark:"Dark"/);
  assert.match(dashboard, /themeSystem:"System"/);
  assert.match(dashboard, /themeLight:"Açık"/);
  assert.match(dashboard, /themeDark:"Koyu"/);
  assert.match(dashboard, /themeSystem:"Sistem"/);
  assert.match(dashboard, /localStorage\.getItem\("villa-theme"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-theme",state\.themeMode\)/);
  assert.match(dashboard, /document\.documentElement\.dataset\.theme=resolved/);
  assert.match(dashboard, /prefers-color-scheme: dark/);
  assert.match(dashboard, /addEventListener\("change",handleSystemThemeChange\)/);
  assert.match(dashboard, /document\.documentElement\.dataset\.theme=resolved/);
  assert.match(dashboard, /:root\[data-theme="dark"\]/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("Android ayarları tüm çalışma sistemini durdurur ve yatay Home hafif bir düzen kullanır", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="androidRuntimeCard"/);
  assert.match(dashboard, /id="runtimeStopDialog"/);
  assert.match(dashboard, /VillaAndroid\?\.stopRuntime/);
  assert.match(dashboard, /VillaAndroid\.stopRuntime\(\)/);
  assert.match(dashboard, /runtimeStopDialog"\)\.showModal\(\)/);
  assert.match(dashboard, /runtimeStopConfirm:"Stop Zigbee, MQTT and Matter/);
  assert.match(dashboard, /runtimeStopConfirm:"Bu tablette Zigbee, MQTT ve Matter/);
  assert.match(dashboard, /orientation:landscape/);
  assert.match(dashboard, /body\[data-active-view="home"\] \.topbar/);
  assert.match(dashboard, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /document\.body\.dataset\.activeView=viewName/);
  assert.match(dashboard, /body\.android-app \.quick-toggle\.on::before\{animation:none\}/);
  assert.match(dashboard, /signature!==state\.overviewSignature/);
  assert.match(dashboard, /if\(!document\.hidden\)refresh\(\)/);
  assert.match(dashboard, /setInterval\(\(\)=>\{if\(!document\.hidden\)refresh\(\)\},8000\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("dashboard widget düzenini hafif ve kalıcı olarak özelleştirir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="widgetBoard"/);
  assert.match(dashboard, /id="widgetDialog"/);
  assert.match(dashboard, /data-widget="status"/);
  assert.match(dashboard, /data-widget="quick"/);
  assert.match(dashboard, /data-widget="signal"/);
  assert.match(dashboard, /data-widget="availability"/);
  assert.match(dashboard, /data-widget="recent"/);
  assert.match(dashboard, /localStorage\.getItem\("villa-dashboard-widgets"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-widgets"/);
  assert.match(dashboard, /data-widget-move="up"/);
  assert.match(dashboard, /data-widget-remove/);
  assert.match(dashboard, /addWidgetTitle:"Add a dashboard widget"/);
  assert.match(dashboard, /addWidgetTitle:"Dashboard widget’ı ekle"/);
  assert.doesNotMatch(dashboard, /draggable="true"/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});
