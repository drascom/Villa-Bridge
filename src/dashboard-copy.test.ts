import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);
const dashboardBackgroundUrl = new URL("../public/assets/dashboard-landscape.jpg", import.meta.url);
const serverUrl = new URL("./index.js", import.meta.url);
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

  assert.match(dashboard, /\.connection-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /homePlatforms:"Matter systems"/);
  assert.match(dashboard, /homePlatforms:"Matter sistemleri"/);
  assert.match(dashboard, /connectPlatform:"Connect Matter system"/);
  assert.match(dashboard, /connectPlatform:"Matter sistemi bağla"/);
  assert.doesNotMatch(dashboard, /data-i18n="oneNameSystem"/);
  assert.match(dashboard, /id="toggleHaSetup"[^>]*aria-expanded="false"[^>]*aria-controls="haSetupDetails"/);
  assert.match(dashboard, /class="connection-card-head"[\s\S]*class="matter-logo"/);
  assert.match(dashboard, /class="connection-card-head"[\s\S]*class="home-assistant-logo"/);
  assert.match(dashboard, /class="secondary connection-action" data-i18n="connectPlatform"/);
  assert.match(dashboard, /class="secondary connection-action ha-connect-button"/);
  assert.match(dashboard, /\.connection-action\{[^}]*border:1px solid var\(--forest\)[^}]*background:transparent[^}]*box-shadow:none/);
  assert.doesNotMatch(dashboard, /class="device-icon">(?:⌁|HA)<\/div><h2/);
  assert.match(dashboard, /id="haSetupDetails" class="ha-setup-details" hidden/);
  assert.match(dashboard, /connectHomeAssistant:"Connect Home Assistant"/);
  assert.match(dashboard, /connectHomeAssistant:"Home Assistant’a bağlan"/);
  assert.match(dashboard, /hideHomeAssistantSetup:"Hide connection details"/);
  assert.match(dashboard, /hideHomeAssistantSetup:"Bağlantı ayrıntılarını gizle"/);
  const networkGuide = dashboard.indexOf('class="ha-network-guide connection-network-guide"');
  const matterCard = dashboard.indexOf('data-i18n="homePlatforms"');
  const homeAssistantCard = dashboard.indexOf('class="connection-card home-assistant-card"');
  assert.ok(networkGuide >= 0 && networkGuide < matterCard && matterCard < homeAssistantCard);
  assert.match(dashboard, /home-assistant-card"[\s\S]*?<\/article>\s*<div id="haSetupDetails" class="ha-setup-details" hidden>/);
  assert.match(dashboard, /\.ha-setup-details\{grid-column:1\/-1/);
  assert.match(dashboard, /\.ha-layout\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(dashboard, /details\.hidden=!details\.hidden/);
  assert.match(dashboard, /\$\("#toggleHaSetup"\)\.onclick=toggleHomeAssistantSetup/);
  assert.doesNotMatch(dashboard, />Home platforms</);
  assert.doesNotMatch(dashboard, />Ev platformları</);
  assert.doesNotMatch(dashboard, /Connect a platform/);
  assert.doesNotMatch(dashboard, /Yeni platform bağla/);
});

test("dashboard sabit ve hafif manzara arka planı üzerinde iki katmanlı saydam yüzeyler kullanır", async () => {
  const [dashboard, background, server] = await Promise.all([
    readDashboardBundle(),
    readFile(dashboardBackgroundUrl),
    readFile(serverUrl, "utf8")
  ]);

  assert.match(dashboard, /body\[data-active-view="home"\]\{background-color:#c5ccc7;background-image:[^}]*url\("\/assets\/dashboard-landscape\.jpg"\)[^}]*background-attachment:fixed/);
  assert.match(dashboard, /--home-glass:rgba\(247,250,248,.22\)/);
  assert.match(dashboard, /--home-control:rgba\(251,252,252,.82\)/);
  assert.match(dashboard, /body\[data-active-view="home"\] aside\{color:#f4f8f5;background:rgba\(23,65,54,.9\)/);
  assert.match(dashboard, /#home \.quick-control-widget,[^}]*#home \.widget-card\{[^}]*background:var\(--home-glass\)/);
  assert.match(dashboard, /#home \.quick-card,[^}]*#home \.group-control-tile,[^}]*background:var\(--home-control\)/);
  assert.equal(background[0], 0xff);
  assert.equal(background[1], 0xd8);
  assert.ok(background.length < 180_000);
  assert.match(server, /app\.get\("\/assets\/dashboard-landscape\.jpg"/);
  assert.match(server, /Cache-Control", "public, max-age=31536000, immutable"/);
});

test("Home Assistant kartı LAN IP ve EN/TR sabitleme rehberi sunar", async () => {
  const [dashboard, server] = await Promise.all([
    readDashboardBundle(),
    readFile(serverUrl, "utf8")
  ]);

  assert.match(dashboard, /state\.network\?\.preferredAddress/);
  assert.doesNotMatch(dashboard, /location\.hostname/);
  assert.match(dashboard, /id="tabletIpGuide" class="ha-network-guide connection-network-guide"/);
  assert.match(dashboard, /\$\("#tabletIpGuide"\)\.hidden=state\.androidMonitor/);
  assert.match(dashboard, /\.connection-network-guide\[hidden\]\{display:none\}/);
  assert.match(dashboard, /id="haProtocol"/);
  assert.match(dashboard, /id="haUsername"/);
  assert.match(dashboard, /id="haPassword"/);
  assert.match(dashboard, /id="toggleHaPassword"/);
  assert.match(dashboard, /mqttProtocol:"MQTT protocol"/);
  assert.match(dashboard, /mqttProtocol:"MQTT protokolü"/);
  assert.match(dashboard, /leaveBlank:"Not required — leave blank"/);
  assert.match(dashboard, /leaveBlank:"Gerekmiyor — boş bırakın"/);
  assert.match(dashboard, /state\.mqttAccess=data\.mqttAccess\|\|null/);
  assert.match(server, /protocol: "3\.1\.1"/);
  assert.match(server, /authenticationRequired/);
  assert.match(server, /app\.put\("\/api\/home-assistant\/discovery"/);
  assert.match(server, /await source\.setHomeAssistantDiscovery\(request\.body\.enabled\)/);
  assert.match(server, /restartRequired: false/);
  assert.match(dashboard, /api\("\/api\/home-assistant\/discovery",\{method:"PUT",body:JSON\.stringify\(\{enabled\}\)\}\)/);
  const discoveryToggle = dashboard.match(
    /async function toggleHomeAssistantDiscovery\(\)\{([\s\S]*?)\n  \}\n  async function loadFavorites/
  )?.[1] ?? "";
  assert.doesNotMatch(discoveryToggle, /settings\/apply|waitForRestart|confirm\(/);
  assert.match(dashboard, /enableDiscovery:"Start service"/);
  assert.match(dashboard, /disableDiscovery:"Stop service"/);
  assert.match(dashboard, /enableDiscovery:"Servisi başlat"/);
  assert.match(dashboard, /disableDiscovery:"Servisi durdur"/);
  assert.match(dashboard, /discoveryEnabledLive:"Home Assistant publishing service started\. MQTT stayed online\."/);
  assert.match(dashboard, /discoveryEnabledLive:"Home Assistant yayın servisi başlatıldı\. MQTT kesintisiz çalışıyor\."/);
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

test("aç/kapat komutları sonuçlanana kadar kontrolü kilitler ve spinner gösterir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /pendingCommands:new Set\(\)/);
  assert.match(dashboard, /if\(state\.pendingCommands\.has\(key\)\)return/);
  assert.match(dashboard, /state\.pendingCommands\.add\(key\);[\s\S]*?finally\{state\.pendingCommands\.delete\(key\);render\(\)\}/);
  assert.match(dashboard, /class="command-spinner"/);
  assert.match(dashboard, /\.switch\.pending::after/);
  assert.match(dashboard, /\.light-power\.pending::after/);
  assert.match(dashboard, /\(device\.availability==="offline"&&Boolean\(action\)\)\|\|pending\?" disabled":""/);
});

test("cihaz kaldırma Android WebView uyumlu ve açıkça yıkıcı bir diyalog kullanır", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="removeDialog"/);
  assert.match(dashboard, /id="removeConfirmation"/);
  assert.match(dashboard, /id="forceRemove"/);
  assert.match(dashboard, /Remove from Zigbee network\?/);
  assert.match(dashboard, /Zigbee ağından kaldırılsın mı\?/);
  assert.match(dashboard, /physical Zigbee device/);
  assert.match(dashboard, /fiziksel Zigbee cihazına/);
  assert.match(dashboard, /type yes or evet in lowercase/);
  assert.match(dashboard, /küçük harflerle yes veya evet yazın/);
  assert.match(dashboard, /autocapitalize="none"/);
  assert.match(dashboard, /\["yes","evet"\]\.includes/);
  assert.match(dashboard, /confirmDeviceRemoval\(force=false\)/);
  assert.match(dashboard, /JSON\.stringify\(\{confirmation,force\}\)/);
  assert.match(dashboard, /forceRemove:"Kaydı zorla sil"/);
  assert.match(dashboard, /forceRemove:"Force delete record"/);
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
  assert.match(dashboard, /addDevice:"Cihaz ekle"/);
  assert.match(dashboard, /addDevice:"Add device"/);
  assert.doesNotMatch(dashboard, /Yeni cihaz ekle/);
  assert.match(dashboard, /id="devicesAddDevice" class="primary add-device"[^>]*><svg class="page-action-glyph"/);
  assert.match(dashboard, /#devices \.page-head>\.add-device \.page-action-label\{position:static!important/);
  assert.match(dashboard, /id="refreshButton"><svg class="page-action-glyph"/);
  assert.match(dashboard, /#devices \.page-head>\.add-device,#refreshButton\{[^}]*background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /pullToRefresh:"Pull to refresh"/);
  assert.match(dashboard, /pullToRefresh:"Yenilemek için aşağı çekin"/);
  assert.match(dashboard, /@media\(min-width:561px\)\{#devices \.page-head>\.add-device\{margin-top:32px\}\}/);
  assert.match(dashboard, /addEventListener\("touchmove"/);
  assert.match(dashboard, /\{passive:false\}/);
  assert.match(dashboard, /window\.scrollY>0/);
  assert.match(dashboard, /pullRefreshState\.distance>=pullRefreshThreshold/);
  assert.match(dashboard, /await refresh\(\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("Devices kartları görsel ayrıntı düzeni ve koşullu dikkat bölümü sunar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="deviceAttention" class="device-attention" hidden/);
  assert.match(dashboard, /id="attentionDevices" class="device-grid devices-grid-view"/);
  assert.match(dashboard, /attentionDevices:"Needs attention"/);
  assert.match(dashboard, /attentionDevices:"Dikkat gerektiren cihazlar"/);
  assert.match(dashboard, /const deviceNeedsAttention=device=>device\.availability==="offline"/);
  assert.match(dashboard, /attention\.hidden=attentionDevices\.length===0/);
  assert.match(dashboard, /const regularDevices=devices\.filter\(device=>!deviceNeedsAttention\(device\)\)/);
  assert.match(dashboard, /<article class="device-card\$\{preparing\?" preparing":""\}"/);
  assert.doesNotMatch(dashboard, /class="device-card-layout"/);
  assert.match(dashboard, /class="image-edit-overlay"[^>]*data-change-image=/);
  assert.match(dashboard, /class="device-detail-photo" data-device-photo hidden/);
  assert.doesNotMatch(dashboard, /class="device-detail-photo"[\s\S]{0,400}?loading="lazy"/);
  assert.doesNotMatch(dashboard, /loading="lazy"/);
  assert.match(dashboard, /const succeed=\(\)=>\{if\(photo\)photo\.hidden=false\}/);
  assert.match(dashboard, /\$\{deviceDetailPhoto\(device\)\}/);
  assert.doesNotMatch(dashboard, /technical-body"><div class="device-image-stage"/);
  assert.match(dashboard, /target\.innerHTML=levelValueHtml\(input\.value,input\.dataset\.unit\)/);
  assert.match(dashboard, /select,textarea,input:not\(\[type="range"\]\)/);
  assert.match(dashboard, /const deviceDetailBodyHtml=device=>\{/);
  assert.match(dashboard, /class="device-name-edit"[^>]*data-rename=/);
  assert.match(dashboard, /class="device-meta-text">\$\{deviceKind\(device\)\} · /);
  assert.match(dashboard, /class="device-card-lead">\$\{deviceStatusIcon\(device,primaryStatus\)\}\$\{cardSignalBadge\(device\)\}<\/div>/);
  assert.match(dashboard, /\.device-card-lead\{width:46px;flex:none;display:flex;flex-direction:column/);
  assert.match(dashboard, /class="device-detail-topline">\$\{linkQualityBadge\(device\)\}/);
  assert.match(dashboard, /const primaryStatusForDevice=/);
  assert.match(dashboard, /value\.smoke!==undefined/);
  assert.match(dashboard, /value\.carbon_monoxide!==undefined/);
  assert.match(dashboard, /value\.occupancy!==undefined\?value\.occupancy:value\.presence/);
  assert.doesNotMatch(dashboard, /\.device-grid>\.device-card\[open\]/);
  assert.match(dashboard, /\.device-card,\.device-card-body,\.device-detail-body\{min-width:0\}/);
  assert.doesNotMatch(dashboard, /details\.style\.gridColumn/);
  assert.match(dashboard, /\.device-image-stage\{position:relative;width:100%;max-width:100%/);
  assert.match(dashboard, /\.device-grid\{display:grid;grid-template-columns:repeat\(var\(--device-columns,3\),minmax\(0,1fr\)\)/);
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
  assert.match(dashboard, /openPairingName\(session\.foundId,session\.reconnected\)/);
  assert.match(dashboard, /const preparing=device\.preparing===true/);
  assert.match(dashboard, /<dialog id="deviceDetailDialog" class="device-detail-dialog"/);
  assert.match(dashboard, /preparing\?' inert aria-busy="true"'/);
  assert.match(dashboard, /preparing\|\|\(device\.availability==="offline"&&Boolean\(action\)\)\|\|pending/);
  assert.match(dashboard, /pairingReconnectComplete:"Known device reconnected successfully\."/);
  assert.match(dashboard, /pairingReconnectComplete:"Kayıtlı cihaz yeniden bağlandı\."/);
  assert.match(dashboard, /state\.editing=\{id,channel:null,afterPairing:true,reconnected\}/);
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

test("ilk kurulum sihirbazı ve ilk kullanım rehberleri amatör kullanıcıyı yönlendirir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="onboardingDialog" class="onboarding-dialog"/);
  assert.match(dashboard, /const onboardingStepCount=6/);
  assert.match(dashboard, /villa-onboarding-complete-v1/);
  assert.match(dashboard, /villa-dashboard-tour-complete-v1/);
  assert.match(dashboard, /villa-device-hint-complete-v1/);
  assert.match(dashboard, /const locallyCompletedOnboarding=/);
  assert.match(dashboard, /let installationOnboardingComplete=null/);
  assert.match(dashboard, /api\("\/api\/onboarding"\)/);
  assert.match(dashboard, /if\(localComplete&&!installationOnboardingComplete\)/);
  assert.match(dashboard, /await markOnboardingComplete\(\)/);
  assert.match(dashboard, /if\(!onboardingComplete\(\)\)openOnboarding\(\)/);
  assert.match(dashboard, /const startup=\[refresh\(\),loadFavorites\(\),loadInstallationOnboarding\(\)\]/);
  assert.match(dashboard, /if\(state\.auth\.user\?\.role==="admin"\)startup\.push\(loadSettings\(\)\)/);
  assert.match(dashboard, /await Promise\.allSettled\(startup\)/);
  assert.match(dashboard, /data-onboarding-language="en"/);
  assert.match(dashboard, /onboardingZigbeeUrl/);
  assert.match(dashboard, /onboardingMqttUrl/);
  assert.match(dashboard, /onboardingMatterUrl/);
  assert.match(dashboard, /setupReadyTitle:"Congratulations, your home hub is ready"/);
  assert.match(dashboard, /setupReadyTitle:"Tebrikler, ev merkeziniz hazır"/);
  assert.match(dashboard, /emptyDevicesTitle:"Add your first device"/);
  assert.match(dashboard, /emptyDevicesTitle:"İlk cihazınızı ekleyin"/);
  assert.match(dashboard, /data-empty-add-device/);
  assert.match(dashboard, /const dashboardTourSteps=\(\)=>\[/);
  assert.match(dashboard, /target:"#quickDevices"/);
  assert.match(dashboard, /target:"#addWidget"/);
  assert.match(dashboard, /target:"#editDashboard"/);
  assert.match(dashboard, /target:'.nav-button\[data-view="devices"\]'/);
  assert.match(dashboard, /box-shadow:0 0 0 9999px rgba\(10,23,17,.68\)/);
  assert.match(dashboard, /\.onboarding-actions button\[hidden\],\.coach-actions button\[hidden\]\{display:none\}/);
  assert.match(dashboard, /\.onboarding-actions\.final\{justify-content:flex-end\}/);
  assert.match(dashboard, /id="restartOnboarding"/);
  assert.match(dashboard, /id="restartDashboardTour"/);
});

test("yerel admin ve ev kullanıcısı rolleri arayüzde güvenli giriş ve yetki ayrımı sunar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="authSetupDialog"/);
  assert.match(dashboard, /id="authLoginDialog"/);
  assert.match(dashboard, /id="authSetupDialog" class="auth-gate" role="dialog" aria-modal="true"/);
  assert.match(dashboard, /id="authLoginDialog" class="auth-gate" role="dialog" aria-modal="true"/);
  assert.doesNotMatch(dashboard, /<dialog id="auth(?:Setup|Login)Dialog"/);
  assert.doesNotMatch(dashboard, /auth(?:Setup|Login)Dialog"\)\.showModal/);
  assert.match(dashboard, /id="authSetupError" class="auth-error" role="alert" aria-live="assertive" hidden/);
  assert.match(dashboard, /id="authLoginError" class="auth-error" role="alert" aria-live="assertive" hidden/);
  assert.match(dashboard, /serverAccountTitle:"Server account"/);
  assert.match(dashboard, /serverAccountTitle:"Sunucu hesabı"/);
  assert.match(dashboard, /"authLoginRuntimeContext"/);
  assert.match(dashboard, /"authSetupRuntimeContext"/);
  assert.match(dashboard, /login\.hidden=!state\.androidMonitor/);
  assert.match(dashboard, /setup\.hidden=!runtimeAvailable/);
  assert.match(dashboard, /configureAndroidActions\(\);\s*try\{await loadAuthSession\(\)\}/);
  assert.match(dashboard, /id="authSetupPassword" type="password" minlength="8"/);
  assert.match(dashboard, /id="authSetupPin" type="password" inputmode="numeric" pattern="\[0-9\]\{6\}"/);
  assert.match(dashboard, /if\(admin\)secret\.removeAttribute\("pattern"\)/);
  assert.match(dashboard, /else secret\.setAttribute\("pattern","\[0-9\]\{6\}"\)/);
  assert.doesNotMatch(dashboard, /secret\.pattern=admin\?"":/);
  assert.match(dashboard, /api\("\/api\/auth\/session"\)/);
  assert.match(dashboard, /api\("\/api\/auth\/setup",\{method:"POST"/);
  assert.match(dashboard, /api\("\/api\/auth\/login",\{method:"POST"/);
  assert.match(dashboard, /api\("\/api\/auth\/logout",\{method:"POST"/);
  assert.match(dashboard, /catch\(error\)\{setAuthFormError\("authSetupError",error\.message\)\}/);
  assert.match(dashboard, /catch\(error\)\{setAuthFormError\("authLoginError",error\.message\)\}/);
  assert.match(dashboard, /authSetupForm"\)\.addEventListener\("input",\(\)=>setAuthFormError\("authSetupError"\)\)/);
  assert.match(dashboard, /authLoginForm"\)\.addEventListener\("input",\(\)=>setAuthFormError\("authLoginError"\)\)/);
  assert.match(dashboard, /"x-villa-csrf":state\.auth\.csrfToken/);
  assert.match(dashboard, /body\.resident-session \[data-admin-only\]\{display:none!important\}/);
  assert.match(dashboard, /#loginUsernameField\[hidden\]\{display:none\}/);
  assert.match(dashboard, /username:state\.loginMode==="admin"\?\$\("#authLoginUsername"\)\.value:""/);
  assert.match(dashboard, /data-view="connections" data-admin-only/);
  assert.match(dashboard, /data-view="settings" data-admin-only/);
  assert.match(dashboard, /data-admin-only data-remove=/);
  assert.match(dashboard, /if\(!state\.auth\.authenticated\)\{openAuthGate\(\);return\}/);
});

test("Settings rehberleri, eşit güvenlik kartları ve tek bağlantı kartıyla sıralanır", async () => {
  const dashboard = await readDashboardBundle();
  const settingsStart = dashboard.indexOf('<section id="settings"');
  const settings = dashboard.slice(
    settingsStart,
    dashboard.indexOf("</section>\n  </main>", settingsStart) + 10
  );

  assert.ok(settings.indexOf("onboarding-settings-card") < settings.indexOf("settings-security-grid"));
  assert.ok(settings.indexOf("settings-security-grid") < settings.indexOf('id="settingsForm"'));
  assert.ok(settings.indexOf('id="settingsForm"') < settings.indexOf('id="androidRuntimeCard"'));
  assert.match(settings, /class="settings-security-grid"/);
  assert.match(settings, /class="settings-server-notice"/);
  assert.match(settings, /id="connectedServerAddress"/);
  assert.ok(settings.indexOf('class="settings-server-notice"') < settings.indexOf('class="setting-card onboarding-settings-card"'));
  assert.match(dashboard, /serverSettingsTitle:"You are editing the active server"/);
  assert.match(dashboard, /serverSettingsTitle:"Aktif sunucu ayarlarını değiştiriyorsunuz"/);
  assert.match(dashboard, /serverSettingsLead:"Zigbee, MQTT and Matter changes are saved on the Villa Bridge server/);
  assert.match(dashboard, /serverSettingsLead:"Zigbee, MQTT ve Matter değişiklikleri bu tarayıcıda açık olan Villa Bridge sunucusuna kaydedilir/);
  assert.match(dashboard, /serverAddress:"Server IP"/);
  assert.match(dashboard, /serverAddress:"Sunucu IP"/);
  assert.match(dashboard, /VillaAndroid\?\.connectedServerAddress/);
  assert.match(dashboard, /String\(window\.VillaAndroid\.connectedServerAddress\(\)\|\|""\)\.trim\(\)/);
  assert.match(dashboard, /return discoveredAddress\|\|state\.network\?\.preferredAddress\|\|state\.network\?\.addresses\?\.\[0\]\|\|t\("ipUnavailable"\)/);
  assert.match(dashboard, /state\.remoteOnboarding=state\.androidMonitor/);
  assert.match(dashboard, /serverSetupDetectedTitle:"This tablet is already connected"/);
  assert.match(dashboard, /serverSetupDetectedTitle:"Bu tablet zaten sunucuya bağlı"/);
  assert.match(dashboard, /if\(state\.remoteOnboarding\)\{/);
  assert.match(dashboard, /\$\("#onboardingNext"\)\.textContent=t\("openServerSettings"\)/);
  assert.match(dashboard, /activateView\("settings"\)/);
  assert.match(settings, /class="setting-card security-card"/);
  assert.match(settings, /id="adminPasswordForm"/);
  assert.doesNotMatch(settings, /id="currentAdminPassword"/);
  assert.match(settings, /id="newAdminPassword"[\s\S]*id="confirmAdminPassword"/);
  assert.match(settings, /id="settingsForm" class="setting-card connection-settings-card"/);
  assert.match(settings, /class="connection-settings-grid"/);
  assert.match(settings, /class="connection-settings-section"><h2>Zigbee2MQTT/);
  assert.match(settings, /class="connection-settings-section"><h2>MQTT/);
  assert.match(settings, /class="connection-settings-section"><h2>Matter/);
  assert.match(settings, /class="settings-actions"[\s\S]*id="saveSettings"/);
  assert.match(dashboard, /\.settings-security-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /\.connection-settings-section\+\.connection-settings-section\{border-left:1px solid var\(--line\)\}/);
  assert.match(dashboard, /api\("\/api\/auth\/admin-password",\{method:"PUT",body:JSON\.stringify\(\{newPassword:next\.value\}\)\}/);
  assert.match(settings, /class="setting-card zigbee-settings-card" data-admin-only/);
  assert.match(settings, /class="backup-card zigbee-settings-section"[\s\S]*class="zigbee-tools zigbee-settings-section"/);
  assert.match(dashboard, /\.zigbee-settings-section\+\.zigbee-settings-section\{border-top:1px solid var\(--line\)\}/);
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
  assert.match(dashboard, /status==="android-monitor"/);
  assert.match(dashboard, /id="serverConnectionMetric" class="server-connection-metric" hidden/);
  assert.match(dashboard, /state\.androidMonitor=status==="android-monitor"/);
  assert.match(dashboard, /serverMetric\.hidden=!state\.androidMonitor/);
  assert.match(dashboard, /const serverConnected=state\.overviewLoaded&&!state\.connectionError/);
  assert.match(dashboard, /serverConnected:"Server connected"/);
  assert.match(dashboard, /serverDisconnected:"Sunucu bağlantısı kesildi"/);
  assert.match(dashboard, /runtimeStopDialog"\)\.showModal\(\)/);
  assert.match(dashboard, /runtimeStopConfirm:"Stop Zigbee, MQTT and Matter/);
  assert.match(dashboard, /runtimeStopConfirm:"Bu tablette Zigbee, MQTT ve Matter/);
  assert.match(dashboard, /orientation:landscape/);
  assert.match(dashboard, /aside\{position:fixed;z-index:10;top:0;bottom:auto/);
  assert.match(dashboard, /grid-template-columns:repeat\(4,minmax\(120px,1fr\)\) auto/);
  assert.match(dashboard, /\.nav-utilities\{display:flex/);
  assert.match(dashboard, /\.topbar\{display:none\}main\{max-width:none;padding:82px 20px 20px\}/);
  assert.match(dashboard, /id="landscapeTheme"/);
  assert.match(dashboard, /id="landscapeLanguage"/);
  assert.match(dashboard, /id="mobileTheme" class="mobile-utility"[^>]*data-theme-toggle/);
  assert.match(dashboard, /id="mobileLanguage" class="mobile-utility"[^>]*data-language-cycle/);
  assert.match(dashboard, /\$\$\("\[data-theme-toggle\]"\)\.forEach\(button=>button\.onclick=\(\)=>setThemeMode/);
  assert.match(dashboard, /\$\$\("\[data-language-cycle\]"\)\.forEach\(button=>button\.onclick=cycleLanguage\)/);
  assert.match(dashboard, /\.mobile-utility\{[^}]*border:0[^}]*background:transparent\}/);
  assert.match(dashboard, /@media\(orientation:portrait\)\{\.topbar\{justify-content:flex-end\}\.theme-switch,\.language-switch\{display:none\}\.mobile-topbar-actions\{display:flex/);
  assert.match(dashboard, /document\.body\.dataset\.activeView=viewName/);
  assert.match(dashboard, /body\.android-app dialog::backdrop\{backdrop-filter:none\}/);
  assert.match(dashboard, /signature!==state\.overviewSignature/);
  assert.match(dashboard, /if\(!document\.hidden&&state\.auth\.authenticated\)refresh\(\)/);
  assert.match(dashboard, /setInterval\(\(\)=>\{if\(!document\.hidden&&state\.auth\.authenticated\)refresh\(\)\},8000\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("Settings debug modu son API hatalarını güvenli ve isteğe bağlı gösterir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="debugCard"/);
  assert.match(dashboard, /id="toggleDebug"/);
  assert.match(dashboard, /id="debugLogPanel"/);
  assert.match(dashboard, /id="debugErrorList"/);
  assert.match(dashboard, /api\("\/api\/debug\/errors"\)/);
  assert.match(dashboard, /api\("\/api\/debug\/errors",\{method:"DELETE"\}\)/);
  assert.match(dashboard, /debug:\{enabled:state\.settings\?\.debug\?\.enabled!==false\}/);
  assert.match(dashboard, /state\.settings\?\.debug\?\.enabled===true\?state\.debugErrors\.length:0/);
  assert.match(dashboard, /debugMode:"Debug mode"/);
  assert.match(dashboard, /debugMode:"Debug modu"/);
  assert.match(dashboard, /debugLogPanel"\)\.hidden=!enabled/);
  assert.match(dashboard, /if\(state\.auth\.user\?\.role==="admin"\)startup\.push\(loadSettings\(\)\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("dashboard widget düzenini hafif ve kalıcı olarak özelleştirir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="widgetBoard"/);
  assert.match(dashboard, /id="widgetDialog"/);
  assert.match(dashboard, /--paper:#edf0f2;--surface:#fbfcfc;--surface-soft:#f3f5f6/);
  assert.match(dashboard, /--card-shadow:0 2px 8px rgba\(35,45,41,.055\)/);
  assert.match(dashboard, /id="systemAlertBar" class="system-alert-bar" role="alert" hidden/);
  assert.match(dashboard, /\.system-alert-bar\[hidden\]\{display:none\}/);
  assert.match(dashboard, /body\.has-system-alert main\{padding-top:112px\}/);
  assert.match(dashboard, /\.device-card\{[^}]*border-radius:16px[^}]*box-shadow:var\(--card-shadow\)/);
  assert.match(dashboard, /\.widget-card\{[^}]*border-radius:16px[^}]*background:var\(--surface\)/);
  assert.match(dashboard, /addWidget:"＋ Add"/);
  assert.match(dashboard, /addWidget:"＋ Ekle"/);
  assert.match(dashboard, /editDashboard:"✎ Edit"/);
  assert.match(dashboard, /editDashboard:"✎ Düzenle"/);
  assert.doesNotMatch(dashboard, /Add widget|Widget ekle|Edit dashboard|Dashboard’u düzenle/);
  assert.doesNotMatch(dashboard, /data-widget="status"/);
  assert.match(dashboard, /data-widget="quick"/);
  assert.match(dashboard, /class="dashboard-widget widget-wide quick-control-widget" data-widget="quick"[\s\S]*?id="quickDevices"/);
  assert.doesNotMatch(dashboard, /data-widget="quick"[\s\S]*?<h2[\s\S]*?id="quickDevices"/);
  assert.match(dashboard, /data-widget="availability"/);
  assert.match(dashboard, /data-widget="recent"/);
  assert.match(dashboard, /data-widget="clock"[\s\S]*id="worldClockRows"/);
  assert.match(dashboard, /data-widget="weather"[\s\S]*id="weatherContent"/);
  assert.match(dashboard, /const defaultDashboardWidgets=\["quick","clock","weather","recent","activity"\]/);
  assert.match(dashboard, /if\(!Array\.isArray\(value\)\)return\[\.\.\.defaultDashboardWidgets\]/);
  assert.match(dashboard, /catch\{return\[\.\.\.defaultDashboardWidgets\]\}/);
  assert.doesNotMatch(dashboard, /data-widget="signal"/);
  assert.match(dashboard, /class="home-title-line"[\s\S]*id="homeGreeting"[\s\S]*class="home-metrics"/);
  assert.match(dashboard, /\.home-title-line\{[^}]*grid-template-columns:1fr auto 1fr[^}]*align-items:baseline/);
  assert.match(dashboard, /\.home-metrics\{justify-self:center/);
  assert.match(dashboard, /@media\(max-width:900px\)\{\.shell\{grid-template-columns:minmax\(0,1fr\)\}aside\{left:0;right:0;width:auto\}/);
  assert.match(dashboard, /main,\.view,\.page-head,\.home-heading,\.widget-board,\.widget-rail\{min-width:0\}#home \.page-head\{display:block;margin-bottom:18px\}/);
  assert.match(dashboard, /#home \.group-control-grid\{grid-template-columns:1fr\}/);
  assert.match(dashboard, /@media\(orientation:portrait\) and \(max-width:560px\)\{main\{padding:12px 14px 96px\}/);
  assert.match(dashboard, /#home \.home-actions\{display:flex;justify-content:flex-end;gap:4px\}/);
  assert.match(dashboard, /#home \.home-actions button,body\[data-active-view="home"\] #home \.home-actions button,#devices \.page-head>\.add-device,#refreshButton\{[^}]*background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /id="addWidget" class="secondary"><svg class="home-action-glyph"/);
  assert.match(dashboard, /id="editDashboardLabel" class="home-action-label"/);
  assert.match(dashboard, /@media\(orientation:landscape\) and \(max-height:900px\)\{#home \.home-actions\{gap:6px\}#home \.home-actions button,#devices \.page-head>\.add-device,#refreshButton\{[^}]*width:46px[^}]*background:var\(--forest-soft\)/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.home-actions button\{[^}]*background:rgba\(23,65,54,.76\)/);
  assert.match(dashboard, /\.clock-row span\{color:var\(--ink\);font:750 18px\/1 system-ui,sans-serif/);
  assert.match(dashboard, /\.weather-facts span\{padding:6px 9px[^}]*font-size:12px;font-weight:700\}/);
  assert.match(dashboard, /\[data-widget="activity"\] \.widget-list-row\{background:transparent;box-shadow:none\}/);
  assert.doesNotMatch(dashboard, /id="homeAddDevice"/);
  assert.match(dashboard, /\$\("#editDashboardLabel"\)\.textContent=editDashboardText/);
  assert.match(dashboard, /data-home-metric="devices"[\s\S]*id="deviceCount"/);
  assert.match(dashboard, /data-home-metric="alerts"[\s\S]*id="alertCount"/);
  assert.match(dashboard, /data-home-metric="signal"[\s\S]*id="signalAverage"/);
  assert.match(dashboard, /\.home-metric-link\{[^}]*border:0[^}]*color:var\(--muted\)[^}]*background:transparent/);
  assert.doesNotMatch(dashboard, /id="homeSignalIndicator"/);
  assert.doesNotMatch(dashboard, /id="homeSignalBars"/);
  assert.doesNotMatch(dashboard, /class="summary-item connectivity-summary"/);
  assert.match(dashboard, /data-i18n="signal">Signal/);
  assert.match(dashboard, /signal:"Sinyal"/);
  assert.match(dashboard, /id="deviceCount"[\s\S]*id="alertCount"[\s\S]*id="signalAverage"/);
  assert.doesNotMatch(dashboard, /id="homeState"/);
  assert.match(dashboard, /id="signalAverage"/);
  assert.match(dashboard, /`\$\{averageSignal\}%`/);
  assert.doesNotMatch(dashboard, /id="activeCount"/);
  assert.doesNotMatch(dashboard, /\$\("#activeCount"\)/);
  assert.doesNotMatch(dashboard, /data-i18n="homeStatus">Home status/);
  assert.match(dashboard, /function navigateHomeMetric\(metric\)/);
  assert.match(dashboard, /const alertDevice=state\.devices\.find\(isAlert\)/);
  assert.match(dashboard, /sort\(\(a,b\)=>Number\(a\.state\.linkquality\)-Number\(b\.state\.linkquality\)\)/);
  assert.match(dashboard, /\$\$\("\[data-home-metric\]"\)\.forEach\(button=>button\.onclick=\(\)=>navigateHomeMetric\(button\.dataset\.homeMetric\)\)/);
  assert.match(dashboard, /greetingKeyForHour=hour=>hour<5\?"greetingNight":hour<12\?"greetingMorning":hour<18\?"greetingAfternoon":hour<22\?"greetingEvening":"greetingNight"/);
  assert.match(dashboard, /setInterval\(updateGreeting,60000\)/);
  assert.match(dashboard, /function renderSystemAlertBar\(\)/);
  assert.doesNotMatch(dashboard, /function renderSystemAlertBar\(\)\{[\s\S]*?debugErrors\[0\]/);
  assert.match(dashboard, /bar\.hidden=!message/);
  assert.match(dashboard, /document\.body\.classList\.toggle\("has-system-alert",Boolean\(message\)\)/);
  assert.match(dashboard, /const fixedDashboardWidgets=new Set\(\["quick"\]\)/);
  assert.match(dashboard, /data-quick-controls=/);
  assert.match(dashboard, /\.layout-glyph\{position:relative;width:14px;height:14px/);
  assert.match(dashboard, /\.layout-glyph\.grid::before\{left:2px;top:2px/);
  assert.match(dashboard, /\.layout-glyph\.list::before\{left:0;top:1px/);
  assert.match(dashboard, /id="devices"[\s\S]*data-device-layout-toggle[\s\S]*data-device-layout="grid"[\s\S]*data-device-layout="list"[\s\S]*id="allDevices"/);
  assert.doesNotMatch(dashboard, /data-quick-layout/);
  assert.match(dashboard, /localStorage\.getItem\("villa-device-layout"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-device-layout",state\.deviceLayout\)/);
  assert.match(dashboard, /\[\$\("#allDevices"\),\$\("#attentionDevices"\)\]\.forEach\(container=>/);
  assert.match(dashboard, /container\.classList\.toggle\("devices-list-view",state\.deviceLayout==="list"\)/);
  assert.match(dashboard, /\.device-grid\.devices-list-view\{grid-template-columns:1fr\}/);
  assert.match(dashboard, /id="deviceColumns" type="range" min="1" max="6" step="1"/);
  assert.match(dashboard, /localStorage\.setItem\("villa-device-columns",String\(columns\)\)/);
  assert.match(dashboard, /\$\("\[data-device-columns-field\]"\)\.hidden=!gridMode/);
  assert.match(dashboard, /container\.dataset\.deviceColumns=String\(columns\)/);
  assert.match(dashboard, /\.device-grid\.devices-grid-view\[data-device-columns="5"\] \.device-card-header \.device-name,\.device-grid\.devices-grid-view\[data-device-columns="6"\] \.device-card-header \.device-name\{font-weight:600/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-grid\.devices-grid-view\[data-device-columns="5"\] \.device-card-header \.device-name,:root\[data-theme="dark"\] \.device-grid\.devices-grid-view\[data-device-columns="6"\] \.device-card-header \.device-name\{font-weight:650/);
  assert.match(dashboard, /devicesPerRow:"Cards per row"/);
  assert.match(dashboard, /devicesPerRow:"Satır başına kart"/);
  assert.match(dashboard, /deviceLayout:"Cihaz görünümü"/);
  assert.match(dashboard, /id="showLightDevice"/);
  assert.match(dashboard, /if\(lightControlsBusy\(\)\)return/);
  assert.match(dashboard, /\$\("#lightControls"\)\.addEventListener\("pointerdown"/);
  assert.match(dashboard, /bindBackdropClose\("#deviceDetailDialog","\.device-detail-modal",closeDeviceDetail\)/);
  assert.match(dashboard, /bindBackdropClose\("#lightDialog","\.light-modal"/);
  assert.match(dashboard, /bindBackdropClose\("#matterDialog","\.modal",closeMatterDialog\)/);
  assert.match(dashboard, /startedOutside=event\.target===dialog&&outside\(event\)/);
  assert.doesNotMatch(dashboard, /bindBackdropClose\("#(nameDialog|noteDialog|deviceOptionsDialog|removeDialog|imageDialog|widgetDialog|clockDialog|weatherLocationDialog|runtimeStopDialog|onboardingDialog|pairingDialog)"/);
  assert.match(dashboard, /class="device-card quick-card \$\{visualState\}"/);
  assert.doesNotMatch(dashboard, /class="quick-state /);
  assert.match(dashboard, /const batteryThreshold=state\.settings\?\.alerts\?\.lowBatteryThreshold\?\?15/);
  assert.match(dashboard, /class="quick-battery\$\{battery<=batteryThreshold\?" low":""\}"/);
  assert.match(dashboard, /class="battery-glyph"/);
  assert.match(dashboard, /const linkQualityPercent=device=>/);
  assert.match(dashboard, /class="device-name-row"><div class="device-name">\$\{esc\(device\.name\)\}<\/div><\/div>/);
  assert.match(dashboard, /class="device-header-status">\$\{deviceCardToggle\(device,preparing\)\}<\/div>/);
  assert.match(dashboard, /class="device-link-level\$\{tone\?`\ \$\{tone\}`:""\}"/);
  assert.match(dashboard, /\.device-link-level\.strong\{color:#24805a/);
  assert.match(dashboard, /\.device-link-level\.weak\{color:var\(--danger\)/);
  assert.match(dashboard, /\.quick-control-widget\{[^}]*padding:12px 10px 4px[^}]*border-radius:16px[^}]*background:var\(--surface\)[^}]*box-shadow:var\(--card-shadow\)/);
  assert.match(dashboard, /\.quick-control-widget \.quick-card\{min-height:44px;padding:5px 12px\}/);
  assert.match(dashboard, /class="quick-device-icon"/);
  assert.match(dashboard, /\.quick-toggle\{width:100%;height:100%;min-width:0;display:grid;grid-template-columns:26px minmax\(0,1fr\) auto/);
  assert.match(dashboard, /<button class="quick-toggle \$\{action\?\.active\?"on":""\}\$\{pending\?" pending":""\}" \$\{actionAttributes\}[\s\S]*?<span class="quick-device-icon" aria-hidden="true">\$\{deviceTypeIcon\(device\)\}<\/span><span class="device-name">\$\{esc\(displayName\)\}<\/span>\$\{preparing\|\|pending\?'<span class="command-spinner" aria-hidden="true"><\/span>':batteryPill\}<\/button>/);
  assert.match(dashboard, /\.quick-grid\.grid-view\{display:flex;align-items:stretch;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto/);
  assert.match(dashboard, /\.quick-grid\.grid-view \.quick-card\{width:max-content;min-width:144px;flex:0 0 auto;aspect-ratio:auto;scroll-snap-align:start\}/);
  assert.match(dashboard, /\.quick-grid \.device-name\{display:block;min-width:0;overflow:visible;text-overflow:clip;white-space:nowrap;font-size:11px\}/);
  assert.match(dashboard, /\.quick-grid\.grid-view \.quick-card\{width:max-content;min-width:144px;flex-basis:auto\}/);
  assert.doesNotMatch(dashboard, /\.quick-grid \.device-name\{[^}]*text-overflow:ellipsis/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \[data-widget="recent"\] \.widget-list-row\{background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /#quickDevices\{cursor:grab\}#quickDevices\.mouse-dragging,#quickDevices\.mouse-dragging \*\{cursor:grabbing!important\}/);
  assert.match(dashboard, /function setupQuickMouseScrolling\(\)\{/);
  assert.match(dashboard, /if\(event\.pointerType!=="mouse"\|\|event\.button!==0\)return/);
  assert.match(dashboard, /if\(!dragged&&Math\.abs\(distance\)>6\)\{/);
  assert.match(dashboard, /startCard\?\.dispatchEvent\(new Event\("pointercancel"\)\)/);
  assert.match(dashboard, /scroller\.scrollLeft=startScrollLeft-distance/);
  assert.match(dashboard, /scroller\.dataset\.suppressMouseClick="true"/);
  assert.match(dashboard, /event\.stopImmediatePropagation\(\)/);
  assert.match(dashboard, /setupPullToRefresh\(\);setupQuickMouseScrolling\(\);configureAndroidActions\(\)/);
  assert.match(dashboard, /#home #editDashboard\.editing-active\{color:#fff!important;background:#16a765!important;box-shadow:0 0 0 3px rgba\(43,214,137,.32\),0 8px 22px rgba\(10,112,68,.34\)!important\}/);
  assert.match(dashboard, /editDashboard\.classList\.toggle\("editing-active",state\.dashboardEditing\)/);
  assert.match(dashboard, /body\[data-active-view="home"\]\{overflow:hidden\}/);
  assert.match(dashboard, /id="widgetRail" class="widget-rail"/);
  assert.match(dashboard, /#home \.widget-board\{height:auto;min-height:0;flex:1;display:flex;flex-direction:column;gap:10px;overflow:hidden\}/);
  assert.doesNotMatch(dashboard, /#home \[data-widget="status"\]/);
  assert.match(dashboard, /#home \[data-widget="quick"\]\{height:62px;flex-basis:62px\}/);
  assert.match(dashboard, /#home \.widget-rail\{min-height:0;flex:1;display:grid;grid-template-columns:repeat\(3,calc\(33\.333vw - 27px\)\)/);
  assert.match(dashboard, /grid-auto-columns:calc\(33\.333vw - 27px\)/);
  assert.match(dashboard, /#home \.widget-rail \.group-widget\{grid-column:span 2\}/);
  assert.match(dashboard, /const rail=\$\("#widgetRail"\)/);
  assert.match(dashboard, /rail\.insertBefore\(widget,\$\("#widgetEmpty"\)\)/);
  assert.match(dashboard, /\$\$\("#widgetRail \[data-widget\]"\)/);
  assert.match(dashboard, /\.group-widget\{grid-column:span 6;padding:22px/);
  assert.match(dashboard, /\.group-control-tile\{[^}]*min-height:100px[^}]*grid-template-columns:56px/);
  assert.match(dashboard, /class="group-control-visual" aria-hidden="true">\$\{deviceVisual\(device\)\}/);
  assert.match(dashboard, /\.group-control-visual,\.group-control-visual \.device-visual\{width:54px;height:54px\}/);
  assert.match(dashboard, /const deviceTypeIcon=device=>/);
  assert.match(dashboard, /function bindGroupControls\(\)\{\s*bindDeviceImages\(\)/);
  assert.match(dashboard, /clock:\{title:"worldClock",lead:"worldClockLead"\}/);
  assert.match(dashboard, /weather:\{title:"weather",lead:"weatherLead"\}/);
  assert.match(dashboard, /function renderWorldClock\(\)/);
  assert.match(dashboard, /localStorage\.getItem\("villa-world-clock-zones"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-world-clock-zones"/);
  assert.match(dashboard, /id="clockDialog"/);
  assert.match(dashboard, /id="clockCitySearch"/);
  assert.match(dashboard, /https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?\$\{params\}/);
  assert.match(dashboard, /function addWorldClockCity\(location\)/);
  assert.match(dashboard, /data-remove-clock-city=/);
  assert.match(dashboard, /id="weatherLocationDialog"/);
  assert.match(dashboard, /id="weatherLocationSearch"/);
  assert.match(dashboard, /function chooseWeatherLocation\(location\)/);
  assert.match(dashboard, /https:\/\/api\.open-meteo\.com\/v1\/forecast\?\$\{params\}/);
  assert.match(dashboard, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(dashboard, /setInterval\(renderWorldClock,60000\)/);
  assert.match(dashboard, /refreshWeatherIfNeeded\(\)/);
  assert.match(dashboard, /id="widgetScrollLeft" class="widget-scroll-hint scroll-hint-left"/);
  assert.match(dashboard, /id="widgetScrollHint" class="widget-scroll-hint scroll-hint-right"/);
  assert.match(dashboard, /id="quickScrollLeft" class="quick-scroll-hint scroll-hint-left"/);
  assert.match(dashboard, /id="quickScrollRight" class="quick-scroll-hint scroll-hint-right"/);
  assert.match(dashboard, /const hasBefore=scroller\.scrollLeft>8/);
  assert.match(dashboard, /const hasAfter=scroller\.scrollWidth-scroller\.clientWidth-scroller\.scrollLeft>8/);
  assert.match(dashboard, /function scrollWidgetRail\(direction\)\{scrollDashboardRow\(\$\("#widgetRail"\),direction,220,\.72\)\}/);
  assert.match(dashboard, /function scrollQuickControls\(direction\)\{scrollDashboardRow\(\$\("#quickDevices"\),direction,120,\.55\)\}/);
  assert.match(dashboard, /#home \.quick-scroll-hint\{top:calc\(50% - 16px\);width:28px;height:32px/);
  assert.match(dashboard, /const button=card\.querySelector\("\[data-command-value\],\[data-quick-show\]"\)/);
  assert.match(dashboard, /if\(!button\|\|button\.disabled\)return/);
  assert.match(dashboard, /const button=card\.querySelector\("\[data-command-value\],\[data-quick-show\]"\);[\s\S]*?button\.click\(\)/);
  assert.match(dashboard, /if\(!event\.target\.closest\("button,input"\)\)toggle\(\)/);
  assert.doesNotMatch(dashboard, /if\(!event\.target\.closest\("button,input"\)\)openLightControls/);
  assert.match(dashboard, /id="deviceActionDialog"/);
  assert.match(dashboard, /data-i18n="showDetails">Show Details/);
  assert.match(dashboard, /const longPressDelay=560/);
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openDeviceActions\(card\.dataset\.quickControls\)\)/);
  assert.match(dashboard, /event\.stopImmediatePropagation\(\)/);
  assert.match(dashboard, /showDetails:"Detayları Göster"/);
  assert.doesNotMatch(dashboard, /class="state-overlay"/);
  assert.doesNotMatch(dashboard, /class="view-device"/);
  assert.doesNotMatch(dashboard, /class="light-controls-button"/);
  assert.match(dashboard, /localStorage\.getItem\("villa-dashboard-widgets"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-widgets"/);
  assert.match(dashboard, /localStorage\.getItem\("villa-dashboard-groups"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-groups"/);
  assert.match(dashboard, /id="groupDialog"/);
  assert.match(dashboard, /id="groupDeviceChoices"/);
  assert.match(dashboard, /const groupItemKey=\(deviceId,controlId\)=>JSON\.stringify\(\[deviceId,controlId\]\)/);
  assert.match(dashboard, /group\.items\.map\(item=>/);
  assert.match(dashboard, /data-group-device=/);
  assert.match(dashboard, /const groupDeviceControlId="@device"/);
  assert.match(dashboard, /data-group-show-device=/);
  assert.match(dashboard, /groupDeviceVisualState\(device\)/);
  assert.match(dashboard, /data-group-power=/);
  assert.match(dashboard, /const groupPowerIcon=.*class="group-action-svg"/);
  assert.match(dashboard, /const groupEditIcon=.*class="group-action-svg"/);
  assert.doesNotMatch(dashboard, /groupPending\?[^:]+:"⏻"/);
  assert.match(dashboard, /createDeviceGroup:"Create device group"/);
  assert.match(dashboard, /createDeviceGroup:"Cihaz grubu oluştur"/);
  assert.match(dashboard, /data-widget-move="left">←/);
  assert.match(dashboard, /data-widget-move="right">→/);
  assert.match(dashboard, /data-widget-remove/);
  assert.match(dashboard, /moveWidgetLeft:"Move widget left"/);
  assert.match(dashboard, /moveWidgetRight:"Widget’ı sağa taşı"/);
  assert.match(dashboard, /direction==="left"\?-1:1/);
  assert.match(dashboard, /\.widget-board\.editing #widgetRail>\.dashboard-widget\{padding-top:78px\}/);
  assert.match(dashboard, /scrollIntoView\(\{behavior:"smooth",block:"nearest",inline:"center"\}\)/);
  assert.match(dashboard, /classList\.add\("widget-moved"\)/);
  assert.match(dashboard, /@keyframes widget-moved-pulse/);
  assert.match(dashboard, /animation:widget-jiggle/);
  assert.match(dashboard, /saveWidgetLayout\(\);\s*applyWidgetLayout\(\)/);
  assert.doesNotMatch(dashboard, /data-widget-drag-handle/);
  assert.doesNotMatch(dashboard, /widget-drag-overlay/);
  assert.doesNotMatch(dashboard, /document\.elementFromPoint/);
  assert.doesNotMatch(dashboard, /widget-dragging/);
  assert.doesNotMatch(dashboard, /dragWidget:/);
  assert.match(dashboard, /addWidgetTitle:"Add a dashboard widget"/);
  assert.match(dashboard, /addWidgetTitle:"Dashboard widget’ı ekle"/);
  assert.doesNotMatch(dashboard, /draggable="true"/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("perde, iklim, kilit, fan ve siren günlük kullanıcıya görsel kontrollerle sunulur", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /control\.kind==="cover"/);
  assert.match(dashboard, /control\.kind==="lock"/);
  assert.match(dashboard, /\["switch","fan","siren"\]\.includes\(control\.kind\)/);
  assert.match(dashboard, /const binaryControlActive=control=>/);
  assert.match(
    dashboard,
    /if\(\["switch","fan","siren"\]\.includes\(control\.kind\)\)return Boolean\(active\)/
  );
  assert.match(dashboard, /data-command-value="\$\{commandValue\(!active\)\}"/);
  assert.match(
    dashboard,
    /lightPower"\)\.onclick=\(\)=>power&&command\(device\.id,power\.property,!binaryControlActive\(power\)\)/
  );
  assert.doesNotMatch(
    dashboard,
    /data-command-value="\$\{commandValue\(active\?\(control\.valueOff\?\?false\):\(control\.valueOn\?\?true\)\)\}"/
  );
  assert.match(dashboard, /data-command-value=/);
  assert.match(dashboard, /data-select=/);
  assert.match(dashboard, /class="control-command stop"/);
  assert.match(dashboard, /control\.adminOnly\?" data-admin-only":""/);
});

test("karmaşık ağ ve sistem araçları yalnız yöneticiye, günlük özellikler ev kullanıcısına açıktır", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /<section id="connections" class="view" data-admin-only>/);
  assert.match(dashboard, /<section id="settings" class="view" data-admin-only>/);
  assert.match(dashboard, /body\.resident-session \[data-admin-only\]\{display:none!important\}/);
  assert.match(dashboard, /id="devicesAddDevice"[^>]*data-admin-only/);
  assert.match(dashboard, /class="setting-card zigbee-settings-card" data-admin-only/);
  assert.match(dashboard, /data-admin-only data-options=/);
  assert.match(dashboard, /data-admin-only data-reconfigure=/);
  assert.match(dashboard, /<dialog id="repairDialog" class="repair-dialog"/);
  assert.match(dashboard, /closeDeviceDetail\(\);\s*openRepairProgress\(device\?\.name\|\|id\)/);
  assert.match(dashboard, /finally\{closeRepairProgress\(\);if\(button\)button\.disabled=false\}/);
  assert.match(dashboard, /openRepairProgress\.timer=setTimeout\(closeRepairProgress,20000\)/);
  assert.match(dashboard, /\$\("#repairDialog"\)\.addEventListener\("cancel",event=>event\.preventDefault\(\)\)/);
  assert.doesNotMatch(dashboard, /bindBackdropClose\("#repairDialog"/);
  assert.match(dashboard, /repairInProgress:"Repairing device…"/);
  assert.match(dashboard, /repairInProgress:"Cihaz onarılıyor…"/);
  assert.match(dashboard, /showToast\.timer=setTimeout\(\(\)=>toast\.className="toast",error\?6000:3200\)/);
  assert.doesNotMatch(dashboard, /toastHost|appendChild\(toast\)/);
  assert.match(dashboard, /data-admin-only data-ota=/);
  assert.match(dashboard, /data-admin-only data-remove=/);

  assert.match(dashboard, /data-widget="activity"/);
  assert.match(dashboard, /defaultDashboardWidgets=\["quick","clock","weather","recent","activity"\]/);
  assert.match(dashboard, /<button class="secondary" data-note=/);
  assert.doesNotMatch(dashboard, /data-admin-only data-note=/);
});

test("kanal değişikliği ve düşük pil eşiği güvenli ayar akışında sunulur", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="lowBatteryThreshold" type="number" min="5" max="50"/);
  assert.match(dashboard, /function settingsWithChannelConfirmation\(settings\)/);
  assert.match(dashboard, /zigbeeChannelConfirmation:"CHANGE"/);
  assert.match(dashboard, /alerts:\{lowBatteryThreshold:Number\(\$\("#lowBatteryThreshold"\)\.value\)\}/);
  assert.match(dashboard, /const isAlert=device=>Array\.isArray\(device\.alerts\)&&device\.alerts\.length>0/);
});

test("Zigbee ağı hafif SVG grafiği ve açıklayıcı grup araçlarıyla gösterilir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="networkMapResults" class="network-graph-host"/);
  assert.match(dashboard, /function renderNetworkGraph\(map\)/);
  assert.match(dashboard, /class="network-graph-svg"/);
  assert.match(dashboard, /class="network-edge \$\{tone\}"/);
  assert.match(dashboard, /columns\[type==="coordinator"\?0:type==="router"\?1:2\]/);
  assert.match(dashboard, /networkGraphLead:"Devices are arranged by their role/);
  assert.match(dashboard, /networkGraphLead:"Cihazlar ağdaki rollerine göre dizilir/);
  assert.doesNotMatch(dashboard, /class="touchlink-device network-map-link"/);

  assert.match(dashboard, /class="zigbee-group-panel"/);
  assert.match(dashboard, /class="zigbee-binding-panel"/);
  assert.match(dashboard, /data-i18n="zigbeeGroupsLead"/);
  assert.match(dashboard, /data-i18n="directBindingLead"/);
  assert.match(dashboard, /id="bindSourceEndpoint"/);
  assert.match(dashboard, /id="bindTargetEndpoint"/);
  assert.match(dashboard, /id="zigbeeBindingList"/);
  assert.match(dashboard, /function renderBindingEndpoints\(\)/);
  assert.match(dashboard, /function renderBindingList\(\)/);
  assert.match(dashboard, /const bindingTarget=binding=>binding\.targetType==="group"/);
  assert.match(dashboard, /\.filter\(\(\{binding\}\)=>Boolean\(bindingTarget\(binding\)\)\)/);
  assert.match(dashboard, /directBindingLead:"Connect a button directly[\s\S]*Automatic reporting links to the coordinator stay hidden\."/);
  assert.match(dashboard, /directBindingLead:"Bir düğmeyi doğrudan[\s\S]*otomatik raporlama bağlantıları gizlenir\."/);
  assert.match(dashboard, /data-zgroup-existing-scene=/);
  assert.match(dashboard, /data-zgroup-scene-name=/);
  assert.match(dashboard, /class="zigbee-group-empty"/);
  assert.match(dashboard, /groupMembers:"\{count\} devices"/);
  assert.match(dashboard, /groupMembers:"\{count\} cihaz"/);
  assert.match(dashboard, /\.setting-field input,\.setting-field select\{/);
  assert.match(dashboard, /\.zigbee-tool input,\.zigbee-tool select/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});

test("günlük cihaz tipleri favori, Quick Control ve dashboard gruplarında kullanılabilir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /dashboardControlKinds=new Set\(\["switch","fan","siren","cover","position","lock","climate"\]\)/);
  assert.match(dashboard, /const dashboardControlForDevice=/);
  assert.match(dashboard, /const dashboardControlAction=/);
  assert.match(dashboard, /const mainControl=dashboardControlForDevice\(device\)/);
  assert.match(dashboard, /device\?\.controls\.find\(item=>item\.id===favorite\.controlId&&isDashboardControl\(item\)\)/);
  assert.match(dashboard, /const controls=device\.controls\.filter\(isDashboardControl\)/);
  assert.match(dashboard, /data-group-command-value=/);
  assert.match(dashboard, /JSON\.parse\(button\.dataset\.groupCommandValue\)/);
  assert.match(dashboard, /groupPowerControl=control=>\["switch","fan","siren","cover"\]\.includes\(control\.kind\)/);
  assert.match(dashboard, /function matchingZigbeePowerGroup\(entries\)/);
  assert.match(dashboard, /api\(`\/api\/groups\/\$\{encodeURIComponent\(zigbeeGroup\.id\)\}\/command`/);
  assert.match(dashboard, /data-ota-check=/);
  assert.match(dashboard, /function checkOta\(id\)/);
  assert.match(dashboard, /\/ota-check`/);
  assert.doesNotMatch(dashboard, /const controllable=devices\.filter\(device=>device\.controls\.some\(control=>control\.kind==="switch"\)\)/);
  assert.doesNotThrow(() => new Function(
    dashboardScripts(dashboard)
  ));
});
