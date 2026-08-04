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
  assert.match(dashboard, /#devices \.page-head>\.add-device \.page-action-label\{position:static;/);
  assert.match(dashboard, /id="refreshButton"><svg class="page-action-glyph"/);
  assert.match(dashboard, /#home \.home-actions button,#refreshButton\{[^}]*background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /pullToRefresh:"Pull to refresh"/);
  assert.match(dashboard, /pullToRefresh:"Yenilemek için aşağı çekin"/);
  assert.match(dashboard, /@media\(min-width:561px\)\{#devices \.page-head>\.add-device\{width:88px;min-width:88px;height:88px;flex:none;align-self:flex-start;display:flex;flex-direction:column/);
  assert.doesNotMatch(dashboard, /#devices \.page-head>\.add-device\{width:auto!important/);
  assert.doesNotMatch(dashboard, /#devices \.page-head>\.add-device\{margin-top:32px\}/);
  assert.match(dashboard, /#devices #refreshButton \.page-action-label\{position:absolute!important/);
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
  assert.match(dashboard, /<details id="deviceAttention" class="device-attention" hidden><summary class="device-attention-head">/);
  assert.doesNotMatch(dashboard, /<section id="deviceAttention"/);
  assert.match(dashboard, /attention\.open=state\.attentionOpen/);
  assert.match(dashboard, /localStorage\.setItem\("villa-attention-open",String\(state\.attentionOpen\)\)/);
  assert.match(dashboard, /\.device-attention-head\{[^}]*list-style:none;cursor:pointer/);
  assert.match(dashboard, /id="attentionDevices" class="device-grid devices-grid-view"/);
  assert.match(dashboard, /attentionDevices:"Needs attention"/);
  assert.match(dashboard, /attentionDevices:"Dikkat gerektiren cihazlar"/);
  assert.match(dashboard, /const deviceNeedsAttention=device=>device\.availability==="offline"/);
  assert.match(dashboard, /attention\.hidden=attentionDevices\.length===0/);
  assert.match(dashboard, /const regularDevices=devices\.filter\(device=>!deviceNeedsAttention\(device\)\)/);
  assert.match(dashboard, /\.sort\(\(left,right\)=>String\(left\.name\)\.localeCompare\(String\(right\.name\),state\.language\)\)/);
  assert.match(dashboard, /<article class="device-card\$\{failed\?" command-failed":""\}\$\{offline\?" device-card-offline":""\}\$\{preparing\?" preparing":""\}"/);
  assert.match(dashboard, /const offline=device\.availability==="offline"/);
  assert.match(dashboard, /\.device-card\.device-card-offline\{filter:saturate\(\.7\);opacity:\.72\}/);
  assert.match(dashboard, /\.device-attention \.device-card\.device-card-offline\{filter:saturate\(\.85\);opacity:\.92\}/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-card\.device-card-offline\{opacity:\.8\}/);
  assert.match(dashboard, /const failed=commandFailed\(device\.id\)/);
  assert.match(dashboard, /const primaryStatus=failed\?\{label:t\("commandFailed"\),tone:"danger"\}:primaryStatusForDevice\(device,preparing\)/);
  assert.match(dashboard, /const commandErrorMs=3000/);
  assert.match(dashboard, /state\.commandErrors\.set\(id,setTimeout\(\(\)=>\{state\.commandErrors\.delete\(id\);render\(\)\},commandErrorMs\)\)/);
  assert.match(dashboard, /catch\(error\)\{flagCommandError\(id\);showToast\(error\.message,true\);await refresh\(\)\}/);
  assert.match(dashboard, /commandFailed:"Command failed"/);
  assert.match(dashboard, /commandFailed:"Komut başarısız"/);
  assert.match(dashboard, /const detailHint=`<span class="device-card-hint\$\{cardToggle\?" divided":""\}" aria-hidden="true">›<\/span>`/);
  assert.match(dashboard, /<div class="device-header-status">\$\{detailHint\}\$\{cardToggle\}<\/div>/);
  assert.match(dashboard, /\.device-card-hint\.divided\{margin-right:2px;padding-right:10px;border-right:1px solid var\(--line\)\}/);
  assert.match(dashboard, /\.device-grid\.devices-list-view\{justify-items:center\}\.device-grid\.devices-list-view>\.device-card\{width:min\(100%,760px\)\}/);
  assert.match(dashboard, /\.device-grid\.devices-list-view>\.empty\{width:100%\}/);
  assert.match(dashboard, /\.device-card\.command-failed,\.group-control-tile\.command-failed\{border-color:var\(--danger\)/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-card\.command-failed,:root\[data-theme="dark"\] \.group-control-tile\.command-failed\{border-color:#c86058/);
  assert.match(dashboard, /@media\(max-width:900px\)\{\.toast\{bottom:calc\(96px \+ env\(safe-area-inset-bottom\)\)\}\}/);
  assert.doesNotMatch(dashboard, /class="device-card-layout"/);
  assert.match(dashboard, /class="image-edit-overlay"[^>]*data-change-image=/);
  assert.match(dashboard, /class="device-detail-photo" data-device-photo hidden/);
  assert.doesNotMatch(dashboard, /class="device-detail-photo"[\s\S]{0,400}?loading="lazy"/);
  assert.doesNotMatch(dashboard, /loading="lazy"/);
  assert.match(dashboard, /const succeed=\(\)=>\{if\(photo\)photo\.hidden=false\}/);
  assert.match(dashboard, /\$\{deviceDetailPhoto\(device\)\}/);
  assert.match(dashboard, /const mediaHtml=`<div class="device-detail-media">\$\{photoHtml\}\$\{factsHtml\}\$\{rolesHtml\}<\/div>`/);
  assert.match(dashboard, /\.device-detail-roles \.control-select\{min-width:0;max-width:100%\}/);
  assert.match(dashboard, /<div class="device-detail-layout">\s*<div class="device-detail-controls"><div class="controls">\$\{controlsBodyHtml\|\|/);
  assert.match(dashboard, /#devices \.page-head \.lead,#home \.page-head \.lead\{display:none\}/);
  assert.match(dashboard, /<p class="lead" data-i18n="devicesLead">/);
  assert.match(dashboard, /<div class="card-actions card-actions-danger" data-admin-only><button class="remove" data-admin-only data-remove="\$\{esc\(device\.id\)\}">/);
  assert.match(dashboard, /\.card-actions-danger\{justify-content:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid var\(--line\)\}/);
  assert.match(dashboard, /\.device-detail-layout\{display:grid;gap:18px;margin-bottom:18px\}/);
  assert.match(dashboard, /@media\(min-width:900px\) and \(orientation:landscape\)\{dialog\.device-detail-dialog\{width:min\(94vw,940px\)\}\.device-detail-layout\{grid-template-columns:repeat\(auto-fit,minmax\(260px,1fr\)\);align-items:start\}\.device-detail-controls\{order:2\}\.device-detail-media\{order:1\}/);
  assert.match(dashboard, /\.device-detail-photo \.device-photo\{[^}]*max-height:min\(26vh,168px\)/);
  assert.doesNotMatch(dashboard, /max-height:min\(34vh,210px\)/);
  assert.doesNotMatch(dashboard, /technical-body"><div class="device-image-stage"/);
  assert.match(dashboard, /target\.innerHTML=levelValueHtml\(input\.value,input\.dataset\.unit\)/);
  assert.match(dashboard, /select,textarea,input:not\(\[type="range"\]\)/);
  assert.match(dashboard, /const deviceDetailBodyHtml=device=>\{/);
  assert.match(dashboard, /class="device-name-edit"[^>]*data-rename=/);
  assert.match(dashboard, /const renameControlButton=\(device,control\)=>\{\s*if\(!isNamedChannel\(control\)\|\|!deviceHasChannelNames\(device\)\)return""/);
  assert.match(dashboard, /class="control-rename" type="button" data-admin-only data-rename-channel="\$\{esc\(device\.id\)\}" data-channel="\$\{esc\(control\.id\)\}"/);
  assert.match(dashboard, /\.device-name-edit,\.control-rename\{width:40px;height:40px/);
  assert.match(dashboard, /\.control-rename\{width:44px;height:44px;display:inline-grid;vertical-align:middle;margin-left:7px\}/);
  assert.doesNotMatch(dashboard, /channel-rename/);
  assert.match(dashboard, /<div class="control-name">\$\{esc\(name\)\}\$\{renameControlButton\(device,control\)\}<\/div>/);
  // Kalem yalnız aç/kapa kanalı satırındadır: perde, kilit ve seviye satırlarında kanal adı diye bir
  // şey yok, oradaki kalem hiç okunmayan bir takma ad yazıyordu.
  assert.doesNotMatch(dashboard, /\$\{esc\(label\)\}\$\{renameControlButton\(device,control\)\}/);
  assert.doesNotMatch(dashboard, /t\("cover"\)\)\}\$\{renameControlButton/);
  assert.doesNotMatch(dashboard, /t\("lockDevice"\)\)\}\$\{renameControlButton/);
  assert.match(dashboard, /class="device-meta-text"><span class="device-primary-status \$\{primaryStatus\.tone\}">/);
  assert.match(dashboard, /class="device-card-lead">\$\{deviceStatusIcon\(device,primaryStatus\)\}\$\{cardStatusBadge\(device\)\}<\/div>/);
  assert.doesNotMatch(dashboard, /class="device-meta-text">\$\{deviceKind\(device\)\}/);
  assert.match(dashboard, /deviceDetailKind"\)\.textContent=`\$\{deviceKind\(device\)\} · \$\{primaryStatus\.label\}`/);
  assert.match(dashboard, /\.device-card-lead\{width:46px;flex:none;display:flex;flex-direction:column/);
  assert.match(dashboard, /@media\(max-width:560px\)\{\.device-grid\.devices-grid-view,\.device-grid\.devices-grid-view\[data-device-columns\]\{grid-template-columns:1fr;justify-items:center\}\.device-grid\.devices-grid-view>\.device-card\{width:min\(100%,760px\)\}\[data-device-columns-field\],\[data-device-layout-toggle\]\{display:none\}\}/);
  assert.doesNotMatch(dashboard, /@media\(max-width:560px\)\{\.device-grid\.devices-grid-view\[data-device-columns/);
  assert.match(dashboard, /@media\(max-width:900px\)\{\.device-grid\.devices-grid-view\[data-device-columns="4"\][^{]*\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\}/);
  assert.match(dashboard, /if\(width<=560\)return Math\.min\(value,2\);\s*if\(width<=900\)return Math\.min\(value,3\);\s*if\(width<=1150\)return Math\.min\(value,4\)/);
  assert.match(dashboard, /deviceColumnsValue"\)\.textContent=String\(effectiveDeviceColumns\(columns\)\)/);
  assert.match(dashboard, /id="deviceColumns" type="range" min="1" max="4"/);
  assert.match(dashboard, /const columns=Math\.min\(4,Math\.max\(1,Math\.round\(Number\(value\)\)\|\|1\)\)/);
  assert.match(dashboard, /const value=Math\.min\(4,Math\.max\(1,Math\.round\(Number\(columns\)\)\|\|1\)\)/);
  assert.match(dashboard, /savedDeviceColumns=\(\(\)=>\{try\{const value=Number\(localStorage\.getItem\("villa-device-columns"\)\);return Number\.isFinite\(value\)&&value>=1\?Math\.min\(4,Math\.round\(value\)\):null\}/);
  assert.doesNotMatch(dashboard, /data-device-columns="(?:5|6)"/);
  assert.match(dashboard, /if\(percent!==null&&percent<25\)/);
  assert.match(dashboard, /class="quick-battery low card-battery"/);
  assert.match(dashboard, /if\(hasLowBattery\(device\)\)return\{label:t\("batteryLow"\),tone:"danger"\}/);
  assert.match(dashboard, /alert\?\.code==="low_battery"/);
  assert.match(dashboard, /device\.lastSeen\?t\("unreachableSince",\{time:ago\(device\.lastSeen\)\}\):t\("unreachable"\)/);
  assert.match(dashboard, /unreachableSince:"Unreachable · \{time\}"/);
  assert.match(dashboard, /unreachableSince:"Ulaşılamıyor · \{time\}"/);
  assert.match(dashboard, /\.device-grid>\.device-card:active\{transform:scale\(\.985\)\}/);
  assert.match(dashboard, /\.device-card:focus-visible\{outline:3px solid var\(--forest-soft\);outline-offset:2px\}/);
  assert.match(dashboard, /html\{scroll-behavior:auto\}\.device-card\{transition:none\}/);
  assert.match(dashboard, /behavior:reducedMotion\(\)\?"auto":"smooth"/);
  assert.match(dashboard, /\.device-card-toggle\{width:56px;min-height:64px;align-self:stretch/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-link-level\.weak\{color:#ffc0ba;background:#432622\}/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-primary-status\.active\{color:#72d0a5\}/);
  assert.doesNotMatch(dashboard, /list\.push\(`\$\{t\("signal"\)\} \$\{percent\}% · \$\{quality\}`\)/);
  assert.match(dashboard, /return list\.filter\(fact=>fact!==primaryLabel\)\.slice\(0,5\)/);
  assert.match(dashboard, /<details class="technical-details" data-admin-only/);
  assert.match(dashboard, /#devices \.toolbar\{position:sticky;z-index:6;top:0/);
  assert.match(dashboard, /id="clearSearch" class="search-clear" type="button" hidden/);
  assert.match(dashboard, /clearSearch"\)\.onclick=\(\)=>\{\$\("#search"\)\.value="";syncSearchClear\(\);filterDevices\(\);bindCards\(\);\$\("#search"\)\.focus\(\)\}/);
  assert.match(dashboard, /clearSearch:"Clear search"/);
  assert.match(dashboard, /clearSearch:"Aramayı temizle"/);
  assert.match(dashboard, /function captureDeviceFocus\(\)\{/);
  assert.match(dashboard, /if\(!active\|\|!active\.closest\|\|!active\.closest\(deviceGridSelector\)\)return null/);
  assert.match(dashboard, /function filterDevices\(\)\{\s*const focusToken=captureDeviceFocus\(\)/);
  assert.match(dashboard, /restoreDeviceFocus\(focusToken\);/);
  assert.match(dashboard, /if\(active&&active!==document\.body&&active!==document\.documentElement\)return/);
  assert.match(dashboard, /if\(match\)match\.focus\(\)/);
  // Sinyal rozeti ve kalem başlıkta adın yanında; gövdede ayrı bir üst satır kalmadı.
  assert.doesNotMatch(dashboard, /device-detail-topline/);
  assert.match(dashboard, /const deviceDetailMetaHtml=device=>`\$\{linkQualityBadge\(device\)\}<button class="device-name-edit"/);
  assert.match(
    dashboard,
    /<div class="device-detail-nameline"><h2 id="deviceDetailName">Device<\/h2><span id="deviceDetailMeta" class="device-detail-meta"><\/span><\/div>/
  );
  assert.match(dashboard, /\.device-detail-nameline\{min-width:0;display:flex;align-items:center;gap:10px\}/);
  assert.match(dashboard, /\.device-detail-meta\{flex:none;display:flex;align-items:center;gap:6px\}/);
  assert.match(dashboard, /\.device-detail-title h2\{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(dashboard, /const metaSignature=`\$\{device\.id\}\|\$\{linkQualityPercent\(device\)\}\|\$\{state\.language\}`/);
  assert.match(dashboard, /meta\.innerHTML=deviceDetailMetaHtml\(device\);/);
  assert.match(dashboard, /if\(rename\)rename\.onclick=event=>\{event\.preventDefault\(\);event\.stopPropagation\(\);openRename\(rename\.dataset\.rename\)\}/);
  assert.match(dashboard, /data-admin-only data-rename="\$\{esc\(device\.id\)\}" aria-label="\$\{esc\(t\("changeName"\)\)\}" title="\$\{esc\(t\("changeName"\)\)\}"/);
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
  assert.match(dashboard, /const startup=\[refresh\(\),loadFavorites\(\),loadHomeGroups\(\),loadAutomations\(\),loadInstallationOnboarding\(\)\]/);
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

test("dokunmatik tablette bütün diyaloglar ekranı doldurur, masaüstünde ortalanmış kalır", async () => {
  const dashboard = await readDashboardBundle();

  // Tek tek diyaloğa değil, ortak `dialog`/`.modal` kuralına yazılıyor: yeni diyaloglar da uyar.
  assert.match(dashboard, /@media\(pointer:coarse\) and \(max-width:1400px\)\{/);
  assert.match(dashboard, /dialog\{width:100vw!important;max-width:100vw!important;margin:0;border-radius:0\}/);
  assert.match(dashboard, /dialog>\.modal\{max-height:100dvh;padding-left:clamp\(18px,4vw,44px\);padding-right:clamp\(18px,4vw,44px\);overflow-y:auto;overscroll-behavior:contain\}/);
  // Sabit yerleşimli içerik (QR, renk çarkı) genişleyince dağılmasın.
  assert.match(dashboard, /dialog>\.modal>\*\{max-width:920px;margin-left:auto;margin-right:auto\}/);
  // Masaüstü hali ve backdrop kurgusu bozulmadı.
  assert.match(dashboard, /dialog\{width:min\(92vw,560px\)/);
  assert.match(dashboard, /dialog::backdrop\{background:rgba\(15,30,23,\.5\)/);
  assert.match(dashboard, /dialog\.automation-dialog::backdrop\{background:rgba\(12,26,20,\.94\)/);
  // Dikey padding değişmiyor: yapışkan başlık şeritlerinin -24px kaydırması yerinde kalır.
  assert.doesNotMatch(dashboard, /dialog>\.modal\{[^}]*padding:\d/);
  // Sihirbaz dokunmatikte de sabit tam yükseklik: ortak kural onu yeniden kaydırıcı yapmıyor.
  assert.match(
    dashboard,
    /dialog\.automation-dialog>\.modal\{height:100dvh;max-height:100dvh;overflow:hidden;padding-bottom:calc\(24px \+ env\(safe-area-inset-bottom\)\)\}/
  );
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
  assert.match(dashboard, /grid-template-columns:repeat\(5,minmax\(104px,1fr\)\) auto/);
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(max-width:900px\) and \(max-height:700px\)\{aside\{[^}]*\}nav\{grid-template-columns:repeat\(5,1fr\) auto\}/,
  );
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
  assert.doesNotMatch(dashboard, /state\.settings\?\.debug\?\.enabled===true\?state\.debugErrors\.length:0/);
  assert.match(dashboard, /\$\("#alertCount"\)\.textContent=devices\.filter\(isAlert\)\.length;/);
  assert.match(dashboard, /\$\("#alertCount"\)\.textContent=state\.devices\.filter\(isAlert\)\.length;/);
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
  assert.match(dashboard, /\.system-alert-bar\{position:fixed;z-index:9;top:68px;[^}]*min-height:56px;[^}]*font-size:20px\}/);
  assert.match(dashboard, /body\.has-system-alert main\{padding-top:138px\}/);
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
  assert.doesNotMatch(dashboard, /data-widget="recent"/);
  assert.doesNotMatch(dashboard, /id="recentDevices"|recentWidgetLead|noRecentDevices/);
  assert.match(dashboard, /data-widget="clock"[\s\S]*id="worldClockRows"/);
  assert.match(dashboard, /data-widget="weather"[\s\S]*id="weatherContent"/);
  assert.match(dashboard, /const defaultDashboardWidgets=\["quick","summary","clock","weather","activity"\]/);
  assert.match(dashboard, /known\.some\(id=>!fixedDashboardWidgets\.has\(id\)\)\?known:\[\.\.\.defaultDashboardWidgets\]/);
  assert.match(dashboard, /const fixed=fixedDashboardWidgets\.has\(id\)/);
  assert.match(dashboard, /class="secondary" type="button" data-add-widget="\$\{esc\(id\)\}">\$\{widgetAddIcon\(\)\}\$\{t\("addWidgetAction"\)\}/);
  assert.match(dashboard, /class="danger-soft" type="button" data-remove-widget="\$\{esc\(id\)\}">\$\{widgetRemoveIcon\(\)\}\$\{t\("removeWidgetAction"\)\}/);
  assert.match(dashboard, /class="quiet" type="button" disabled>\$\{t\("widgetAlwaysOn"\)\}/);
  assert.match(dashboard, /\$\$\("#widgetCatalog \[data-remove-widget\]"\)\.forEach\(button=>button\.onclick=\(\)=>removeDashboardWidget\(button\.dataset\.removeWidget\)\)/);
  assert.doesNotMatch(dashboard, /widgetAdded/);
  assert.match(dashboard, /removeWidgetAction:"Remove"/);
  assert.match(dashboard, /removeWidgetAction:"Kaldır"/);
  assert.match(dashboard, /widgetAlwaysOn:"Always on"/);
  assert.match(dashboard, /widgetAlwaysOn:"Her zaman açık"/);
  assert.match(dashboard, /--danger-soft:#f8e9e7/);
  assert.match(dashboard, /--danger-soft:#40211f/);
  assert.match(dashboard, /\.danger-soft\{color:var\(--danger\);background:var\(--danger-soft\);box-shadow:inset 0 0 0 1px var\(--danger\)\}/);
  assert.match(dashboard, /const widgetAddIcon=\(\)=>'<svg class="widget-catalog-glyph"/);
  assert.match(dashboard, /const widgetRemoveIcon=\(\)=>'<svg class="widget-catalog-glyph"/);
  assert.match(dashboard, /summary:\{title:"summaryWidget",lead:"summaryWidgetLead"\}/);
  assert.match(dashboard, /data-widget="summary"[\s\S]*?id="homeSummary"/);
  assert.match(dashboard, /function renderHomeSummary\(\)\{/);
  assert.match(dashboard, /\{count:lightsOn,label:t\("summaryLightsOn"\),zero:t\("summaryAllOff"\),tone:lightsOn\?"active":"muted"\}/);
  assert.match(dashboard, /\{count:openings,label:t\("summaryOpenings"\),zero:t\("summaryAllClosed"\),tone:openings\?"alert":"muted"\}/);
  assert.match(dashboard, /\{count:motion,label:t\("summaryMotion"\),zero:t\("summaryNoMotion"\),tone:motion\?"active":"muted"\}/);
  assert.match(dashboard, /row\.count\?`<strong>\$\{row\.count\}<\/strong><span>\$\{esc\(row\.label\)\}<\/span>`:`<em>\$\{esc\(row\.zero\)\}<\/em>`/);
  assert.match(dashboard, /\.summary-row strong\{color:var\(--ink\);font:750 36px\/1 system-ui,sans-serif/);
  assert.match(dashboard, /#home \.summary-row strong\{font-size:44px\}/);
  assert.match(dashboard, /renderZigbeeGroups\(\);\s*renderHomeSummary\(\);/);
  assert.match(dashboard, /if\(!Array\.isArray\(value\)\)return\[\.\.\.defaultDashboardWidgets\]/);
  assert.match(dashboard, /catch\{return\[\.\.\.defaultDashboardWidgets\]\}/);
  assert.doesNotMatch(dashboard, /data-widget="signal"/);
  assert.match(dashboard, /<h1 class="eyebrow" data-i18n="homeEyebrow">Home control<\/h1><div class="home-title-line"><div class="home-metrics">/);
  assert.doesNotMatch(dashboard, /id="homeGreeting"/);
  assert.doesNotMatch(dashboard, /#home h1\{/);
  assert.match(dashboard, /\.home-title-line\{width:100%;display:flex;align-items:baseline;gap:18px\}/);
  assert.match(dashboard, /\.home-metrics\{display:flex;align-items:center/);
  assert.match(dashboard, /h1\.eyebrow\{margin:0;font-family:inherit;line-height:1\.45\}/);
  assert.match(dashboard, /@media\(max-width:900px\)\{\.shell\{grid-template-columns:minmax\(0,1fr\)\}aside\{left:0;right:0;width:auto\}/);
  assert.match(dashboard, /main,\.view,\.page-head,\.home-heading,\.widget-board,\.widget-rail\{min-width:0\}#home \.page-head\{display:block;margin-bottom:18px\}/);
  assert.match(dashboard, /#home \.group-control-grid\{grid-template-columns:1fr\}/);
  assert.match(dashboard, /@media\(orientation:portrait\) and \(max-width:560px\)\{main\{padding:12px 14px 96px\}/);
  assert.match(dashboard, /#home \.home-actions\{display:flex;justify-content:flex-end;gap:4px\}/);
  assert.match(dashboard, /#home \.home-actions button,body\[data-active-view="home"\] #home \.home-actions button,#refreshButton\{[^}]*background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /id="addWidget" class="secondary"><svg class="home-action-glyph"/);
  assert.match(dashboard, /id="editDashboardLabel" class="home-action-label"/);
  assert.match(dashboard, /@media\(orientation:landscape\) and \(max-height:900px\)\{#devices \.toolbar\{padding:6px 0;margin-bottom:8px\}#home \.home-actions\{gap:6px\}#home \.home-actions button,#refreshButton\{[^}]*width:46px[^}]*background:var\(--forest-soft\)/);
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
  assert.match(dashboard, /const signalToneForPercent=percent=>percent<25\?"weak":percent<50\?"fair":percent<75\?"good":"strong"/);
  assert.match(dashboard, /const signalToneKeys=\{weak:"homeSignalLow",fair:"homeSignalMedium",good:"homeSignalGood",strong:"homeSignalHigh"\}/);
  assert.match(dashboard, /signalStrength\.textContent=signalTone\?t\(signalToneKeys\[signalTone\]\):"—"/);
  assert.match(dashboard, /signalStrength\.className=signalTone\?`signal-\$\{signalTone\}`:""/);
  assert.match(dashboard, /\.home-metric-link strong\.signal-weak\{color:var\(--danger\)\}/);
  assert.match(dashboard, /\.home-metric-link strong\.signal-fair\{color:var\(--sun\)\}/);
  assert.match(dashboard, /homeSignalLow:"Low"/);
  assert.match(dashboard, /homeSignalLow:"Düşük"/);
  assert.match(dashboard, /homeSignalHigh:"Yüksek"/);
  assert.doesNotMatch(dashboard, /id="activeCount"/);
  assert.doesNotMatch(dashboard, /\$\("#activeCount"\)/);
  assert.doesNotMatch(dashboard, /data-i18n="homeStatus">Home status/);
  assert.match(dashboard, /function navigateHomeMetric\(metric\)/);
  assert.match(dashboard, /const criticalAlert=device=>Array\.isArray\(device\.alerts\)\?device\.alerts\.find\(alert=>alert\?\.severity==="critical"\)\|\|null:null/);
  assert.match(dashboard, /const criticalAlertKeys=\{smoke:"smokeAlarmDevice",carbon_monoxide:"carbonMonoxideAlarmDevice"\}/);
  assert.match(dashboard, /const alertDevice=state\.devices\.find\(isAlert\)/);
  assert.match(dashboard, /const message=criticalMessages\[0\]\|\|""/);
  assert.match(dashboard, /criticalMessages\.push\(t\(criticalAlertKeys\[alert\.code\]\|\|"deviceNeedsAttention",\{name:device\.name\}\)\)/);
  assert.match(dashboard, /const extra=criticalMessages\.length>1\?t\("moreCriticalAlerts",\{count:criticalMessages\.length-1\}\):""/);
  assert.match(dashboard, /const lowBatteryDevices=devices\.filter\(hasLowBattery\)\.length/);
  assert.match(dashboard, /lowBatteryFact\.hidden=lowBatteryDevices===0/);
  assert.match(dashboard, /id="lowBatteryCount" class="fact" hidden/);
  assert.match(dashboard, /\.system-alert-bar\{min-height:48px;[^}]*color:#fff;background:var\(--danger\);font-size:16px;font-weight:800\}/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.system-alert-bar\{color:#2a100e;background:var\(--danger\)/);
  assert.match(dashboard, /sort\(\(a,b\)=>Number\(a\.state\.linkquality\)-Number\(b\.state\.linkquality\)\)/);
  assert.match(dashboard, /\$\$\("\[data-home-metric\]"\)\.forEach\(button=>button\.onclick=\(\)=>navigateHomeMetric\(button\.dataset\.homeMetric\)\)/);
  assert.doesNotMatch(dashboard, /greetingKeyForHour/);
  assert.doesNotMatch(dashboard, /greetingMorning|greetingAfternoon|greetingEvening|greetingNight/);
  assert.doesNotMatch(dashboard, /updateTimeOfDay/);
  assert.doesNotMatch(dashboard, /nightModeActive/);
  assert.doesNotMatch(dashboard, /body\.night/);
  assert.doesNotMatch(dashboard, /classList\.(?:toggle|contains|add)\("night"/);
  assert.doesNotMatch(dashboard, /body\[data-active-view="home"\]::after/);
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
  assert.match(dashboard, /id="deviceColumns" type="range" min="1" max="4" step="1"/);
  assert.match(dashboard, /localStorage\.setItem\("villa-device-columns",String\(columns\)\)/);
  assert.match(dashboard, /\$\("\[data-device-columns-field\]"\)\.hidden=!gridMode/);
  assert.match(dashboard, /container\.dataset\.deviceColumns=String\(columns\)/);
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
  assert.match(dashboard, /bindBackdropClose\("#widgetDialog","\.add-modal",closeAddDialog\)/);
  assert.doesNotMatch(dashboard, /bindBackdropClose\("#(nameDialog|noteDialog|deviceOptionsDialog|removeDialog|imageDialog|clockDialog|weatherLocationDialog|runtimeStopDialog|onboardingDialog|pairingDialog)"/);
  assert.match(dashboard, /class="device-card quick-card \$\{visualState\}\$\{failed\?" command-failed":""\}"/);
  assert.match(dashboard, /const shown=pending\?!action\.active:action\?\.active===true/);
  assert.match(dashboard, /const shown=pending\?!controlAction\.active:controlAction\?\.active===true/);
  assert.match(dashboard, /class="group-control-tile \$\{visualState\}\$\{pending\?" pending":""\}\$\{failed\?" command-failed":""\}"/);
  assert.match(dashboard, /\.device-card\.command-failed,\.group-control-tile\.command-failed\{border-color:var\(--danger\)/);
  assert.match(dashboard, /catch\(error\)\{for\(const \{device\} of entries\)flagCommandError\(device\.id\);showToast\(error\.message,true\)\}/);
  assert.doesNotMatch(dashboard, /class="quick-state /);
  assert.match(dashboard, /const batteryThreshold=state\.settings\?\.alerts\?\.lowBatteryThreshold\?\?15/);
  assert.match(dashboard, /class="quick-battery\$\{battery<=batteryThreshold\?" low":""\}"/);
  assert.match(dashboard, /class="battery-glyph"/);
  assert.match(dashboard, /const linkQualityPercent=device=>/);
  assert.match(dashboard, /class="device-name-row"><div class="device-name">\$\{esc\(device\.name\)\}<\/div><\/div>/);
  assert.match(dashboard, /const cardToggle=deviceCardToggle\(device,preparing\)/);
  assert.match(dashboard, /class="device-link-level\$\{tone\?`\ \$\{tone\}`:""\}"/);
  assert.match(dashboard, /\.device-link-level\.strong\{color:#24805a/);
  assert.match(dashboard, /\.device-link-level\.weak\{color:var\(--danger\)/);
  assert.match(dashboard, /\.quick-control-widget\{[^}]*padding:12px 10px 4px[^}]*border-radius:16px[^}]*background:var\(--surface\)[^}]*box-shadow:var\(--card-shadow\)/);
  assert.match(dashboard, /\.quick-control-widget \.quick-card\{min-height:56px;padding:5px 12px\}/);
  assert.match(dashboard, /class="quick-device-icon"/);
  assert.match(dashboard, /\.quick-toggle\{width:100%;height:100%;min-width:0;display:grid;grid-template-columns:26px minmax\(0,1fr\) auto/);
  assert.match(dashboard, /<button class="quick-toggle \$\{shown\?"on":""\}\$\{pending\?" pending":""\}" \$\{actionAttributes\}[\s\S]*?<span class="quick-device-icon" aria-hidden="true">\$\{deviceTypeIcon\(device,control\)\}<\/span><span class="device-name">\$\{esc\(displayName\)\}<\/span>\$\{preparing\|\|pending\?'<span class="command-spinner" aria-hidden="true"><\/span>':batteryPill\}<\/button>/);
  assert.match(dashboard, /\.quick-grid\.grid-view\{display:flex;align-items:stretch;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto/);
  assert.match(dashboard, /\.quick-grid\.grid-view \.quick-card\{width:max-content;min-width:144px;flex:0 0 auto;aspect-ratio:auto;scroll-snap-align:start\}/);
  assert.match(dashboard, /\.quick-grid \.device-name\{display:block;min-width:0;overflow:visible;text-overflow:clip;white-space:nowrap;font-size:15px\}/);
  assert.match(dashboard, /\.quick-battery\{[^}]*font-size:11px;font-weight:750\}/);
  assert.match(dashboard, /\.quick-grid\.grid-view \.quick-card\{width:max-content;min-width:144px;flex-basis:auto\}/);
  assert.doesNotMatch(dashboard, /\.quick-grid \.device-name\{[^}]*text-overflow:ellipsis/);
  assert.doesNotMatch(dashboard, /quick\.length>=Math\.max\(8,state\.favorites\.length\)/);
  assert.match(dashboard, /if\(!quick\.length\)for\(const id of orderedIds\)\{/);
  assert.match(dashboard, /if\(quick\.length>=8\)break/);
  assert.match(dashboard, /quick\.map\(item=>quickDeviceHtml\(item\.device,item\.control\)\)\.join\(""\):quickEmptyHtml\(\)/);
  assert.match(dashboard, /const quickEmptyHtml=\(\)=>`<div class="empty quick-empty">[\s\S]*?data-quick-empty-action>\$\{t\("quickEmptyAction"\)\}<\/button><\/div>`/);
  assert.match(dashboard, /\$\$\("\[data-quick-empty-action\]"\)\.forEach\(button=>button\.onclick=\(\)=>activateView\("devices"\)\)/);
  assert.doesNotMatch(dashboard, /createGroupShortcut/);
  assert.doesNotMatch(dashboard, /tourGroupTitle|tourGroupLead/);
  assert.match(dashboard, /<div class="home-actions"><button id="addWidget"[\s\S]*?<button id="editDashboard"[\s\S]*?<\/div><\/header>/);
  assert.match(dashboard, /\$\("#addWidget"\)\.setAttribute\("aria-label",t\("addWidget"\)\)/);
  assert.match(dashboard, /editDashboard\.setAttribute\("aria-label",editDashboardText\);\s*editDashboard\.title=editDashboardText/);
  assert.match(dashboard, /const editDashboardText=t\(state\.dashboardEditing\?"finishEditing":"editDashboard"\)/);
  assert.match(dashboard, /\$\("#editDashboardGlyph"\)\.innerHTML=state\.dashboardEditing\?editDashboardGlyphs\.done:editDashboardGlyphs\.edit/);
  assert.match(dashboard, /finishEditing:"✓ Done"/);
  assert.match(dashboard, /finishEditing:"✓ Bitti"/);
  assert.match(dashboard, /\.widget-board\.editing \.quick-control-widget\{padding-bottom:12px\}/);
  assert.match(dashboard, /\.widget-board\.editing #widgetRail\{gap:26px\}/);
  assert.match(dashboard, /\.widget-board\.editing #widgetRail>\.dashboard-widget\{padding-top:78px;transform:translate\(var\(--widget-slide-x,0px\),var\(--widget-slide-y,0px\)\) scale\(\.955\)\}/);
  assert.match(dashboard, /@media\(prefers-reduced-motion:reduce\)\{\.widget-board\.editing #widgetRail>\.dashboard-widget\{transition:none!important\}\}/);
  assert.match(dashboard, /#home \.widget-board\.editing \.widget-rail\{gap:18px\}/);
  assert.doesNotMatch(dashboard, /widget-jiggle/);
  assert.match(dashboard, /const widgetSlideDuration=220/);
  assert.match(dashboard, /function playWidgetSlide\(positions\)\{\s*if\(reducedMotion\(\)\)return/);
  assert.match(dashboard, /widget\.style\.setProperty\("--widget-slide-x",`\$\{offsetX\}px`\)/);
  assert.match(dashboard, /const positions=captureWidgetPositions\(\);\s*saveWidgetLayout\(\);\s*applyWidgetLayout\(\);\s*touchDashboardEditing\(\);\s*scrollMovedWidgetIntoView\(id\);\s*playWidgetSlide\(positions\)/);
  assert.match(dashboard, /function moveDashboardWidget\(id,direction\)\{\s*if\(fixedDashboardWidgets\.has\(id\)\)return;\s*endWidgetSlide\(\)/);
  assert.match(dashboard, /behavior:reducedMotion\(\)\?"auto":"smooth"/);
  assert.match(dashboard, /#home \.widget-board\.editing \[data-widget="quick"\]\{height:84px;flex-basis:84px\}/);
  assert.match(dashboard, /data-open-group-create data-i18n="createGroupAction"/);
  assert.match(dashboard, /\$\$\("\[data-open-group-create\]"\)\.forEach\(button=>button\.onclick=\(\)=>openGroupEditor\(\)\)/);
  assert.match(dashboard, /async function loadHomeGroups\(\)\{/);
  assert.match(dashboard, /const data=await api\("\/api\/home-groups"\)/);
  assert.match(dashboard, /if\(!groups\.length&&!groupsMigrated\(\)&&savedGroups\.length\)\{state\.pendingGroupMigration=true;render\(\);return\}/);
  assert.match(dashboard, /const groupsMigrationKey="villa-dashboard-groups-migrated"/);
  assert.match(dashboard, /const groupsMigrated=\(\)=>\{try\{return localStorage\.getItem\(groupsMigrationKey\)==="true"\}catch\{return true\}\}/);
  assert.match(dashboard, /async function migrateLocalGroups\(\)\{\s*if\(!state\.pendingGroupMigration\)return;\s*state\.pendingGroupMigration=false;/);
  assert.match(dashboard, /function migratableLocalGroups\(\)\{\s*if\(!state\.devices\.length\)return savedGroups;/);
  assert.match(dashboard, /catch\(error\)\{showToast\(t\("groupsMigrationFailed",\{error:error\.message\}\),true\)\}/);
  assert.match(dashboard, /async function persistHomeGroups\(groups,successKey\)\{/);
  assert.match(dashboard, /await api\("\/api\/home-groups",\{method:"PUT",body:JSON\.stringify\(\{groups\}\)\}\)/);
  assert.match(dashboard, /catch\(error\)\{showToast\(t\("groupSaveFailed",\{error:error\.message\}\),true\)\}/);
  assert.match(dashboard, /const reload=\[refresh\(\),loadFavorites\(\),loadHomeGroups\(\),loadAutomations\(\)\]/);
  assert.match(dashboard, /await Promise\.allSettled\(startup\);\s*await migrateLocalGroups\(\)/);
  assert.match(dashboard, /if\(Array\.isArray\(data\.favorites\)\)state\.favorites=data\.favorites;\s*if\(Array\.isArray\(data\.groups\)\)\{state\.groups=data\.groups;saveDashboardGroups\(\);applyWidgetLayout\(\)\}/);
  assert.match(dashboard, /function saveDashboardGroups\(\)\{\s*try\{localStorage\.setItem\("villa-dashboard-groups"/);
  assert.match(dashboard, /const roomSuggestionKeys=\["roomLivingRoom","roomKitchen","roomBedroom","roomBathroom","roomHallway","roomBalcony","roomKidsRoom","roomGarden","roomAllLights","roomAllSecurity"\]/);
  assert.match(dashboard, /function renderRoomSuggestions\(\)\{/);
  assert.match(dashboard, /const taken=new Set\(state\.groups\.filter\(group=>group\.id!==editingId\)\.map\(group=>group\.name\.trim\(\)\.toLowerCase\(\)\)\)/);
  assert.match(dashboard, /data-room-suggestion="\$\{esc\(name\)\}"/);
  assert.match(dashboard, /\$\("#groupName"\)\.value=button\.dataset\.roomSuggestion/);
  assert.match(dashboard, /id="roomSuggestions" class="room-suggestions"/);
  assert.match(dashboard, /\.room-suggestion\.used\{color:var\(--muted\);background:var\(--surface-soft\);text-decoration:line-through;opacity:\.6\}/);
  assert.match(dashboard, /input id="groupName"[^>]*maxlength="32"/);
  assert.match(dashboard, /function groupSummaryHtml\(entries\)\{/);
  assert.match(dashboard, /\{tone:"active",text:t\("groupSummaryOn",\{count:onCount\}\)\}\s*:\{tone:"muted",text:t\("groupSummaryAllOff"\)\}/);
  assert.match(dashboard, /if\(offlineCount\)rows\.push\(\{tone:"alert",text:t\("groupSummaryOffline",\{count:offlineCount\}\)\}\)/);
  assert.match(dashboard, /<h2>\$\{esc\(group\.name\)\}<\/h2>\$\{groupSummaryHtml\(entries\)\}/);
  assert.match(dashboard, /\.group-summary \.active\{color:var\(--forest\)\}/);
  assert.match(dashboard, /#home \.group-summary span\{font-size:17px\}/);
  assert.match(dashboard, /id="groupDeleteDialog"/);
  assert.match(dashboard, /function requestGroupDelete\(\)\{/);
  assert.match(dashboard, /\$\("#groupDeleteLead"\)\.textContent=t\("deleteGroupWarning",\{name:group\.name\}\)/);
  assert.match(dashboard, /\$\("#deleteGroup"\)\.onclick=requestGroupDelete/);
  assert.doesNotMatch(dashboard, /\$\("#deleteGroup"\)\.onclick=deleteDashboardGroup/);
  assert.match(dashboard, /async function confirmGroupDelete\(\)\{/);
  assert.match(dashboard, /\$\("#confirmGroupDelete"\)\.onclick=confirmGroupDelete/);
  assert.match(dashboard, /await persistHomeGroups\(state\.groups\.filter\(group=>group\.id!==pending\.id\),"groupDeleted"\)/);
  assert.match(dashboard, /function syncGroupWidgetOrder\(groups\)\{/);
  assert.match(dashboard, /async function moveDashboardGroup\(direction\)\{/);
  assert.match(dashboard, /\$\("#groupMoveLeft"\)\.onclick=\(\)=>moveDashboardGroup\(-1\)/);
  assert.match(dashboard, /\$\("#groupMoveRight"\)\.onclick=\(\)=>moveDashboardGroup\(1\)/);
  assert.match(dashboard, /id="groupOrderRow" class="group-order-row" hidden/);
  assert.doesNotMatch(dashboard, /draggable="true"/);
  assert.match(dashboard, /\$\$\("\[data-i18n-aria\]"\)\.forEach\(element=>element\.setAttribute\("aria-label",t\(element\.dataset\.i18nAria\)\)\)/);
  assert.match(dashboard, /id="roomFilter" class="room-filter" role="group" data-i18n-aria="roomFilterLabel"[^>]*hidden/);
  assert.match(dashboard, /function renderRoomFilter\(\)\{/);
  assert.match(dashboard, /if\(state\.roomFilter&&!state\.groups\.some\(group=>group\.id===state\.roomFilter\)\)state\.roomFilter=null/);
  assert.match(dashboard, /container\.hidden=state\.groups\.length===0/);
  assert.match(dashboard, /const roomFilterMatches=device=>!state\.roomFilter\|\|deviceInRoom\(device,state\.roomFilter\)/);
  assert.match(dashboard, /const deviceInRoom=\(device,groupId\)=>\{[\s\S]*?group\.items\.some\(item=>item\.deviceId===device\.id\)/);
  assert.match(dashboard, /\.filter\(device=>device\.name\.toLowerCase\(\)\.includes\(query\)&&roomFilterMatches\(device\)\)/);
  assert.match(dashboard, /data-room-filter="\$\{esc\(group\.id\)\}" aria-pressed="\$\{active\}"/);
  assert.match(dashboard, /\$\$\("\[data-room-filter\]"\)\.forEach\(button=>button\.onclick=\(\)=>setRoomFilter\(button\.dataset\.roomFilter\)\)/);
  assert.match(dashboard, /state\.roomFilter&&!attentionDevices\.length\s*\?`<div class="empty room-filter-empty">/);
  assert.match(dashboard, /\$\$\("\[data-clear-room-filter\]"\)\.forEach\(button=>button\.onclick=\(\)=>setRoomFilter\(""\)\)/);
  assert.match(dashboard, /\.room-chip\.active\{border-color:var\(--forest\);color:var\(--on-forest\);background:var\(--forest\)\}/);
  assert.match(dashboard, /#devices \.room-chip\{min-height:34px;padding:6px 12px;font-size:12px\}/);
  assert.doesNotMatch(dashboard, /villa-room-filter/);
  assert.doesNotMatch(dashboard, /localStorage\.setItem\("[^"]*",\s*state\.roomFilter/);
  assert.match(dashboard, /pendingGroupMigration:false,roomFilter:null,/);
  assert.match(dashboard, /const attentionDevices=devices\.filter\(deviceNeedsAttention\)/);
  assert.match(dashboard, /\$\("#attentionDeviceCount"\)\.textContent=String\(attentionDevices\.length\)/);
  assert.match(dashboard, /const deviceRoomsHtml=device=>\{\s*if\(!state\.groups\.length\)return""/);
  assert.match(dashboard, /const member=deviceInRoom\(device,group\.id\)/);
  assert.match(dashboard, /data-toggle-room="\$\{esc\(group\.id\)\}" data-room-device="\$\{esc\(device\.id\)\}" aria-pressed="\$\{member\}"/);
  assert.match(dashboard, /\$\{deviceRoomsHtml\(device\)\}\s*<details class="technical-details"/);
  assert.match(dashboard, /async function toggleDeviceRoom\(deviceId,groupId\)\{/);
  assert.match(dashboard, /items:member\?item\.items\.filter\(entry=>entry\.deviceId!==deviceId\):\[\.\.\.item\.items,\{deviceId,controlId\}\]/);
  assert.match(dashboard, /const controlId=control\?control\.id:groupDeviceControlId/);
  assert.match(dashboard, /await persistHomeGroups\(groups\);\s*if\(\$\("#deviceDetailDialog"\)\.open\)renderDeviceDetail\(\)/);
  assert.match(dashboard, /\$\$\("\[data-toggle-room\]"\)\.forEach\(button=>button\.onclick=\(\)=>toggleDeviceRoom\(button\.dataset\.roomDevice,button\.dataset\.toggleRoom\)\)/);
  assert.match(dashboard, /\.room-membership\.active\{border-color:var\(--forest\);color:var\(--on-forest\);background:var\(--forest\)\}/);
  assert.doesNotMatch(dashboard, /data-toggle-room[^>]*data-admin-only/);
  assert.match(dashboard, /\.quick-empty\{display:flex/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \[data-widget="activity"\] \.widget-list-row\{background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /#quickDevices\{cursor:grab\}#quickDevices\.mouse-dragging,#quickDevices\.mouse-dragging \*\{cursor:grabbing!important\}/);
  assert.match(dashboard, /function setupQuickMouseScrolling\(\)\{/);
  assert.match(dashboard, /if\(event\.pointerType!=="mouse"\|\|event\.button!==0\)return/);
  assert.match(dashboard, /if\(!dragged&&Math\.abs\(distance\)>6\)\{/);
  assert.match(dashboard, /startCard\?\.dispatchEvent\(new Event\("pointercancel"\)\)/);
  assert.match(dashboard, /scroller\.scrollLeft=startScrollLeft-distance/);
  assert.match(dashboard, /scroller\.dataset\.suppressMouseClick="true"/);
  assert.match(dashboard, /event\.stopImmediatePropagation\(\)/);
  assert.match(dashboard, /setupPullToRefresh\(\);setupQuickMouseScrolling\(\);configureAndroidActions\(\);bindScreensaver\(\)/);
  assert.match(dashboard, /id="screensaver" class="screensaver" role="dialog" aria-modal="true" tabindex="-1" hidden/);
  assert.match(dashboard, /const screensaverDelay=120000/);
  assert.match(dashboard, /function screensaverAllowed\(\)\{\s*return document\.body\.dataset\.activeView==="home"\s*&&!document\.querySelector\("dialog\[open\]"\)/);
  assert.match(dashboard, /if\(screensaverAllowed\(\)\)openScreensaver\(\);\s*else scheduleScreensaver\(\)/);
  assert.match(dashboard, /\},\(60-now\.getSeconds\(\)\)\*1000-now\.getMilliseconds\(\)\+40\)/);
  assert.match(dashboard, /overlay\.addEventListener\("pointerdown",event=>\{event\.preventDefault\(\);event\.stopPropagation\(\)\}\)/);
  assert.match(dashboard, /\["pointerup","click","keydown","wheel"\]\.forEach\(type=>overlay\.addEventListener\(type,dismissScreensaver\)\)/);
  assert.match(dashboard, /function dismissScreensaver\(event\)\{\s*if\(event\)\{event\.preventDefault\(\);event\.stopPropagation\(\)\}\s*closeScreensaver\(\);\s*scheduleScreensaver\(\)/);
  assert.match(dashboard, /const critical=state\.devices\.filter\(device=>criticalAlert\(device\)\)/);
  assert.match(dashboard, /body\.screensaver-open \.shell\{visibility:hidden\}/);
  assert.match(dashboard, /\.screensaver\{position:fixed;z-index:11;inset:0/);
  assert.match(dashboard, /screensaverHint:"Devam etmek için ekrana dokunun"/);
  assert.match(dashboard, /screensaverTitle:"Screen saver"/);
  assert.match(dashboard, /#home #editDashboard\.editing-active\{color:#fff!important;background:#16a765!important;box-shadow:0 0 0 3px rgba\(43,214,137,.32\),0 8px 22px rgba\(10,112,68,.34\)!important\}/);
  assert.match(dashboard, /editDashboard\.classList\.toggle\("editing-active",state\.dashboardEditing\)/);
  assert.match(dashboard, /body\[data-active-view="home"\]\{overflow:hidden\}/);
  assert.match(dashboard, /id="widgetRail" class="widget-rail"/);
  assert.match(dashboard, /#home \.widget-board\{height:auto;min-height:0;flex:1;display:flex;flex-direction:column;gap:10px;overflow:hidden\}/);
  assert.doesNotMatch(dashboard, /#home \[data-widget="status"\]/);
  assert.match(dashboard, /#home \[data-widget="quick"\]\{height:76px;flex-basis:76px;order:2\}#home \.widget-board\.editing \[data-widget="quick"\]\{height:84px;flex-basis:84px\}#home \.widget-rail\{order:1\}/);
  assert.match(dashboard, /#home \.quick-grid\.grid-view,#home \.quick-grid\.grid-view \.quick-card\{height:56px\}/);
  assert.match(dashboard, /#home \.widget-rail\{min-height:0;flex:1;display:grid;grid-template-columns:repeat\(3,calc\(33\.333vw - 27px\)\)/);
  assert.match(dashboard, /grid-auto-columns:calc\(33\.333vw - 27px\)/);
  assert.match(dashboard, /#home \.widget-rail \.group-widget\{grid-column:span 2\}/);
  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 1\}/);
  assert.match(dashboard, /const rail=\$\("#widgetRail"\)/);
  assert.match(dashboard, /rail\.insertBefore\(widget,\$\("#widgetEmpty"\)\)/);
  assert.match(dashboard, /\$\$\("#widgetRail \[data-widget\]"\)/);
  assert.match(dashboard, /\.group-widget\{grid-column:span 6;padding:22px/);
  assert.match(dashboard, /\.group-control-tile\{[^}]*min-height:100px[^}]*grid-template-columns:56px/);
  assert.doesNotMatch(dashboard, /const deviceVisual=device=>/);
  assert.match(dashboard, /class="group-control-visual">\$\{deviceStatusIcon\(device,\{label:statusLabel,tone:statusTone\}\)\}<\/div><div class="group-control-copy"><strong>\$\{esc\(name\)\}<\/strong><small>\$\{esc\(statusLabel\)\}<\/small><\/div>/);
  assert.match(dashboard, /const primaryStatus=primaryStatusForDevice\(device,preparing\);\s*const statusLabel=preparing\?t\("preparing"\)/);
  assert.match(dashboard, /const label=controlAction\?`\$\{name\} · \$\{statusLabel\} · /);
  assert.match(dashboard, /\.group-control-visual\{width:46px;height:46px\}/);
  assert.match(dashboard, /\.group-control-copy small\{display:block;margin-top:3px/);
  assert.match(dashboard, /\.group-control-tile\.on \.group-control-visual \.device-status-icon\{color:#7d5210/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.group-control-tile\.alert \.group-control-visual \.device-status-icon\{color:#ffc0ba/);
  assert.match(dashboard, /const deviceTypeIcon=\(device,control\)=>/);
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
  assert.doesNotMatch(dashboard, /setInterval\(renderWorldClock,60000\)/);
  assert.match(dashboard, /function scheduleWorldClockTick\(\)\{\s*const now=new Date\(\);\s*setTimeout\(\(\)=>\{renderWorldClock\(\);scheduleWorldClockTick\(\)\},\(60-now\.getSeconds\(\)\)\*1000-now\.getMilliseconds\(\)\+40\)/);
  assert.match(dashboard, /const localTimeZone=\(\(\)=>\{try\{return Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone\|\|"UTC"\}catch\{return "UTC"\}\}\)\(\)/);
  assert.match(dashboard, /\{id:"default-local",label:"clockLocal",name:"Local time",country:"",timeZone:localTimeZone\}/);
  assert.match(dashboard, /const secondary=worldClockZones\.filter\(zone=>zone\.timeZone!==localTimeZone\)/);
  assert.match(dashboard, /\$\("#clockPrimaryTime"\)\.textContent=new Intl\.DateTimeFormat\(locale,\{hour:"2-digit",minute:"2-digit",hour12:false\}\)\.format\(now\)/);
  assert.match(dashboard, /<div class="clock-primary"><strong id="clockPrimaryTime">--:--<\/strong><span id="clockPrimaryDate"><\/span><\/div>/);
  assert.match(dashboard, /\.clock-primary strong\{display:block;color:var\(--ink\);font:750 52px\/1 system-ui,sans-serif/);
  assert.match(dashboard, /#home \.clock-primary strong\{font-size:58px\}/);
  assert.match(dashboard, /#home \.widget-card:not\(\.group-widget\) h2\{font:750 15px\/1\.2 system-ui,sans-serif;letter-spacing:\.06em;text-transform:uppercase;color:var\(--muted\)\}/);
  assert.match(dashboard, /#home \.widget-list-row\{padding-top:9px;font-size:20px\}#home \.widget-list-row strong\{font-weight:750\}#home \.widget-list-row span\{font-size:17px\}/);
  assert.match(dashboard, /function widgetListCapacity\(selector,fallback\)\{/);
  assert.match(dashboard, /return Math\.max\(fallback,Math\.min\(14,Math\.floor\(available\/62\)\)\)/);
  assert.match(dashboard, /const rows=latestEventPerDevice\(state\.events\|\|\[\],widgetListCapacity\("#activityEvents",5\)\)/);
  assert.match(dashboard, /applyWidgetLayout\(\);\s*renderWidgetLists\(\);\s*bindCards\(\)/);
  assert.match(dashboard, /refreshWeatherIfNeeded\(\)/);
  assert.match(dashboard, /id="widgetScrollLeft" class="widget-scroll-hint scroll-hint-left"/);
  assert.match(dashboard, /id="widgetScrollHint" class="widget-scroll-hint scroll-hint-right"/);
  assert.match(dashboard, /id="quickScrollLeft" class="quick-scroll-hint scroll-hint-left"/);
  assert.match(dashboard, /id="quickScrollRight" class="quick-scroll-hint scroll-hint-right"/);
  assert.match(dashboard, /const hasBefore=scroller\.scrollLeft>8/);
  assert.match(dashboard, /const hasAfter=scroller\.scrollWidth-scroller\.clientWidth-scroller\.scrollLeft>8/);
  assert.match(dashboard, /function scrollWidgetRail\(direction\)\{scrollDashboardRow\(\$\("#widgetRail"\),direction,220,\.72\)\}/);
  assert.match(dashboard, /function scrollQuickControls\(direction\)\{scrollDashboardRow\(\$\("#quickDevices"\),direction,120,\.55\)\}/);
  assert.match(dashboard, /#home \.widget-scroll-hint\{top:calc\(50% - 67px\);width:38px;height:48px;border-radius:15px\}/);
  assert.match(dashboard, /#home \.quick-scroll-hint\{top:calc\(50% - 20px\);width:30px;height:40px;border-radius:13px\}/);
  assert.doesNotMatch(dashboard, /scroll-hint-pulse/);
  assert.match(dashboard, /const button=card\.querySelector\("\[data-command-value\],\[data-quick-show\]"\)/);
  assert.match(dashboard, /if\(!button\|\|button\.disabled\)return/);
  assert.match(dashboard, /const button=card\.querySelector\("\[data-command-value\],\[data-quick-show\]"\);[\s\S]*?button\.click\(\)/);
  assert.match(dashboard, /if\(!event\.target\.closest\("button,input"\)\)toggle\(\)/);
  assert.doesNotMatch(dashboard, /if\(!event\.target\.closest\("button,input"\)\)openLightControls/);
  assert.match(dashboard, /id="deviceActionDialog"/);
  assert.match(dashboard, /data-i18n="showDetails">Show Details/);
  assert.match(dashboard, /id="confirmDeviceAction" class="danger-button" type="button" data-i18n="confirmAction" hidden/);
  assert.match(dashboard, /if\(control\.kind==="lock"\)return action\.active===true\?"confirmUnlockDevice":""/);
  assert.match(dashboard, /if\(control\.kind==="siren"\)return action\.active===true\?"":"confirmSirenDevice"/);
  assert.match(dashboard, /function runDashboardCommand\(button,deviceId,property,value\)\{\s*const messageKey=button\?\.dataset\.confirmCommand;\s*if\(messageKey\)\{confirmDashboardCommand\(deviceId,property,value,messageKey\);return\}/);
  assert.match(dashboard, /\$\$\("\[data-command-value\]"\)\.forEach\(button=>button\.onclick=\(\)=>runDashboardCommand\(button,button\.dataset\.device,button\.dataset\.property,JSON\.parse\(button\.dataset\.commandValue\)\)\)/);
  assert.match(dashboard, /\$\$\("\[data-group-device\]"\)\.forEach\(button=>button\.onclick=\(\)=>runDashboardCommand\(button,button\.dataset\.groupDevice/);
  assert.match(dashboard, /\$\("#confirmDeviceAction"\)\.onclick=\(\)=>\{const pending=state\.pendingConfirm;\$\("#deviceActionDialog"\)\.close\(\);if\(pending\)command\(pending\.id,pending\.property,pending\.value\)\}/);
  assert.match(dashboard, /confirmUnlockDevice:"Unlock \{name\}\? The door will open\."/);
  assert.match(dashboard, /confirmUnlockDevice:"\{name\} kilidi açılsın mı\? Kapı açılacak\."/);
  assert.match(dashboard, /const longPressDelay=560/);
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openDeviceDetail\(card\.dataset\.quickControls\)\)/);
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openDeviceDetail\(card\.dataset\.groupDevice\)\)/);
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openDeviceDetail\(card\.dataset\.groupShowDevice\)\)/);
  assert.doesNotMatch(dashboard, /openDeviceActions/);
  assert.match(dashboard, /event\.stopImmediatePropagation\(\)/);
  assert.match(dashboard, /showDetails:"Detayları Göster"/);
  assert.doesNotMatch(dashboard, /class="state-overlay"/);
  assert.doesNotMatch(dashboard, /class="view-device"/);
  assert.doesNotMatch(dashboard, /class="light-controls-button"/);
  assert.match(dashboard, /localStorage\.getItem\("villa-dashboard-widgets"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-widgets"/);
  assert.match(dashboard, /localStorage\.getItem\("villa-dashboard-groups"\)/);
  assert.match(dashboard, /localStorage\.setItem\("villa-dashboard-groups"/);
  assert.doesNotMatch(dashboard, /id="groupDialog"/);
  assert.match(dashboard, /<form id="groupForm" class="modal-tab-panel" role="tabpanel" aria-labelledby="addTabGroups" tabindex="0" hidden>/);
  assert.match(dashboard, /<div class="modal-tabs" role="tablist"[^>]*aria-label="Add to dashboard">/);
  assert.match(dashboard, /id="addTabWidgets"[^>]*role="tab" aria-selected="true" aria-controls="addPanelWidgets" data-add-tab="widgets"/);
  assert.match(dashboard, /id="addTabGroups"[^>]*role="tab" aria-selected="false" tabindex="-1" aria-controls="groupForm" data-add-tab="groups"/);
  assert.match(dashboard, /addWidgetsTab:"Widgets"/);
  assert.match(dashboard, /addGroupsTab:"Cihaz grupları"/);
  assert.match(dashboard, /function setAddDialogTab\(tab\)\{[\s\S]*?button\.setAttribute\("aria-selected",active\?"true":"false"\);[\s\S]*?button\.tabIndex=active\?0:-1;/);
  assert.match(dashboard, /const steps=\{ArrowRight:1,ArrowLeft:-1,ArrowDown:1,ArrowUp:-1\}/);
  assert.match(dashboard, /\$\("#widgetDialog"\)\.addEventListener\("close",resetAddDialog\)/);
  assert.match(dashboard, /function resetAddDialog\(\)\{\s*state\.groupEditing=null;\s*\$\("#groupForm"\)\.reset\(\);/);
  assert.match(dashboard, /setAddDialogTab\("widgets"\);\s*\}/);
  assert.match(dashboard, /setAddDialogTab\("groups"\);\s*if\(!\$\("#widgetDialog"\)\.open\)\$\("#widgetDialog"\)\.showModal\(\)/);
  assert.doesNotMatch(dashboard, /create-group-card/);
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
  assert.match(dashboard, /\.group-control-tile:focus-visible,\.widget-config-button:focus-visible,\.widget-edit-controls button:focus-visible,\.home-actions button:focus-visible\{outline:3px solid var\(--forest-soft\);outline-offset:2px\}/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.home-actions button:focus-visible\{outline:3px solid var\(--on-forest\);outline-offset:3px;box-shadow:0 0 0 6px var\(--forest\)\}/);
  assert.match(dashboard, /scrollIntoView\(\{behavior:reducedMotion\(\)\?"auto":"smooth",block:"nearest",inline:"center"\}\)/);
  assert.match(dashboard, /classList\.add\("widget-moved"\)/);
  assert.match(dashboard, /@keyframes widget-moved-pulse/);
  assert.match(dashboard, /\.widget-board\.editing \.dashboard-widget\{outline:2px dashed var\(--forest\);outline-offset:4px\}/);
  assert.match(dashboard, /const dashboardEditingIdleDelay=60000/);
  assert.match(dashboard, /function touchDashboardEditing\(\)\{[\s\S]*?if\(!state\.dashboardEditing\)return/);
  assert.match(dashboard, /if\(state\.dashboardEditing\)setDashboardEditing\(false\)/);
  assert.match(dashboard, /function setDashboardEditing\(enabled\)\{\s*state\.dashboardEditing=Boolean\(enabled\);\s*applyWidgetLayout\(\);\s*touchDashboardEditing\(\);\s*\}/);
  assert.match(dashboard, /function activateView\(viewName\)\{\s*if\(viewName!=="home"&&state\.dashboardEditing\)setDashboardEditing\(false\)/);
  assert.match(dashboard, /\$\("#widgetBoard"\)\.addEventListener\("pointerdown",touchDashboardEditing,\{passive:true\}\)/);
  assert.match(dashboard, /saveWidgetLayout\(\);\s*applyWidgetLayout\(\)/);
  assert.doesNotMatch(dashboard, /data-widget-drag-handle/);
  assert.doesNotMatch(dashboard, /widget-drag-overlay/);
  assert.doesNotMatch(dashboard, /document\.elementFromPoint/);
  assert.doesNotMatch(dashboard, /widget-dragging/);
  assert.doesNotMatch(dashboard, /dragWidget:/);
  assert.match(dashboard, /addToDashboard:"Add to dashboard"/);
  assert.match(dashboard, /addToDashboard:"Panoya ekle"/);
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
  assert.match(dashboard, /defaultDashboardWidgets=\["quick","summary","clock","weather","activity"\]/);
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
  assert.match(dashboard, /const favoriteButton=\(device,control\)=>\{/);
  assert.match(dashboard, /class="favorite-toggle \$\{active\?"active":""\}"/);
  assert.match(dashboard, /\$\{isDashboardControl\(control\)\?favoriteButton\(device,control\):""\}/);
  assert.doesNotMatch(dashboard, /favorite-main/);
  assert.doesNotMatch(dashboard, /favoriteButton\(device,mainControl/);
  assert.doesNotMatch(dashboard, /dashboardControlForDevice\(device\)\?\.id!==control\.id/);
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

test("ana ekran tipografi ve genişlik kuralları yükseklikten bağımsız yatay bloktadır", async () => {
  const dashboard = await readDashboardBundle();
  // Grup (b): her yatay ekranda (tablet + bilgisayar) geçerli olan tipografi/genişlik kuralları.
  assert.match(dashboard, /@media\(orientation:landscape\)\{#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 5\}#home \.widget-card:not\(\.group-widget\) h2\{font:750 15px\/1\.2 system-ui,sans-serif;letter-spacing:\.06em;text-transform:uppercase;color:var\(--muted\)\}#home \.widget-card>p,#home \[data-widget="clock"\] \.widget-title-row p\{display:none\}#home \.widget-list-row\{padding-top:9px;font-size:20px\}#home \.widget-list-row strong\{font-weight:750\}#home \.widget-list-row span\{font-size:17px\}#home \.clock-primary strong\{font-size:58px\}#home \.clock-primary span\{font-size:17px\}#home \.group-summary span\{font-size:17px\}#home \.summary-row strong\{font-size:44px\}#home \.summary-row span\{font-size:16px\}#home \.summary-row em\{font-size:17px\}#home \.widget-value strong\{font-size:46px\}#home \.widget-value span\{font-size:14px\}#home \.widget-facts \.fact,#home \.weather-facts span\{font-size:14px\}#home \.quick-battery\{font-size:14px\}#home \[data-widget="activity"\] \.widget-list-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:baseline;gap:2px 10px;font-size:17px\}#home \[data-widget="activity"\] \.widget-list-row strong\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}#home \[data-widget="activity"\] \.widget-list-row time\{color:var\(--muted\);font-size:14px\}#home \[data-widget="activity"\] \.widget-list-row span\{grid-column:1\/-1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px\}\}/);
  // Grup (b) bloğu, dar dikey alan bloğundan ÖNCE gelmeli ki tablette (a) kuralları hâlâ kazansın.
  const landscapeBlock = dashboard.indexOf("@media(orientation:landscape){#home .widget-rail [data-widget=\"activity\"]");
  const shortBlock = dashboard.indexOf("@media(orientation:landscape) and (max-height:900px){body[data-active-view=\"home\"]{overflow:hidden}");
  assert.ok(landscapeBlock > 0 && shortBlock > landscapeBlock);
  // Grup (a): tam ekran yerleşim, rail sığdırma ve sıkışık boşluklar yükseklik koşuluna bağlı kalır.
  assert.match(dashboard, /@media\(orientation:landscape\) and \(max-height:900px\)\{body\[data-active-view="home"\]\{overflow:hidden\}body\[data-active-view="home"\] main\{height:100vh;overflow:hidden\}#home\.active\{height:100%/);
  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 1\}/);
  assert.match(dashboard, /#home \.clock-primary\{margin-top:10px\}#home \.clock-rows\{gap:7px;margin-top:14px\}/);
  assert.match(dashboard, /#home \.group-summary\{margin-top:7px\}#home \.home-summary\{gap:14px;margin-top:12px\}#home \.widget-value\{margin-top:14px\}/);
  // Yükseklik koşullu blok artık tipografi kurallarını içermemeli.
  const shortBlockBody = dashboard.slice(shortBlock, dashboard.indexOf("\n", shortBlock));
  assert.doesNotMatch(shortBlockBody, /#home \.widget-list-row\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.clock-primary strong\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.summary-row strong\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.widget-value strong\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.widget-card:not\(\.group-widget\) h2\{/);
});

test("ana ekran hareket listesi cihaz başına yalnız en son olayı gösterir", async () => {
  const dashboard = await readDashboardBundle();
  assert.match(dashboard, /function latestEventPerDevice\(events,limit\)\{/);
  // Her cihaz bir kez: olaylar en yeniden eskiye geldiği için ilk görülen o cihazın en son olayı.
  assert.match(dashboard, /const seen=new Set\(\);\s*const rows=\[\];\s*for\(const event of events\)\{\s*if\(seen\.has\(event\.sourceName\)\)continue;\s*seen\.add\(event\.sourceName\);/);
  // Önce tekilleştir, sonra kapasiteye göre kes: tekrarlar limite sayılmaz.
  assert.match(dashboard, /rows\.push\(\{event,presentation:eventPresentation\(event\)\}\);\s*if\(rows\.length>=limit\)break;/);
  assert.match(dashboard, /const rows=latestEventPerDevice\(state\.events\|\|\[\],widgetListCapacity\("#activityEvents",5\)\)/);
  // Alt satır iki uçlu: durum solda, süre sağda, ayıraç yok.
  assert.match(dashboard, /<strong>\$\{esc\(device\?\.name\|\|row\.event\.sourceName\)\}<\/strong><time>\$\{ago\(row\.event\.at\)\}<\/time><span>\$\{row\.presentation\.icon\} \$\{esc\(row\.presentation\.label\)\}<\/span><\/div>/);
  // Süre üst satırda, durum satırında değil.
  assert.doesNotMatch(dashboard, /<em>\$\{row\.presentation\.icon\}/);
  assert.doesNotMatch(dashboard, /esc\(row\.presentation\.label\)\} · /);
  // Ardışık tekrar birleştirme ve ×N sayacı tamamen kaldırıldı.
  assert.doesNotMatch(dashboard, /collapseEventRuns/);
  assert.doesNotMatch(dashboard, /widget-list-repeat/);
  assert.doesNotMatch(dashboard, /eventRepeatCount/);
  // Sunucu tarafı olay üretimi değişmedi: ham olaylar hâlâ kırpılmadan geliyor.
  assert.doesNotMatch(dashboard, /\.slice\(0,widgetListCapacity\("#activityEvents",5\)\)/);
});

test("Ana Sayfa dışında 5 dakika boşta kalınca panel Ana Sayfa'ya döner", async () => {
  const dashboard = await readDashboardBundle();
  assert.match(dashboard, /const idleHomeReturnDelay=300000/);
  assert.match(dashboard, /if\(idleHomeReturnAllowed\(\)\)activateView\("home"\);\s*else scheduleIdleHomeReturn\(\)/);
  assert.match(dashboard, /\},idleHomeReturnDelay\)/);
  // Ana Sayfa'dayken zamanlayıcı hiç kurulmaz.
  assert.match(dashboard, /function scheduleIdleHomeReturn\(\)\{\s*clearIdleHomeReturn\(\);\s*if\(document\.body\.dataset\.activeView==="home"\)return;/);
  // Dönmemesi gereken durumlar: açık dialog, pairing, onboarding, metin alanı.
  assert.match(dashboard, /function idleHomeReturnAllowed\(\)\{\s*return document\.body\.dataset\.activeView!=="home"\s*&&!document\.querySelector\("dialog\[open\]"\)\s*&&!state\.pairingSession\s*&&!\$\("#onboardingDialog"\)\.open\s*&&!typingInField\(\);/);
  assert.match(dashboard, /return element\?\.tagName==="INPUT"\|\|element\?\.tagName==="TEXTAREA"/);
  // Ekran koruyucuyla aynı boşta kalma takibi; ikinci bir mekanizma yok.
  assert.match(dashboard, /\["pointerdown","keydown","wheel"\]\.forEach\(type=>document\.addEventListener\(type,\(\)=>\{if\(!state\.screensaverOpen\)\{scheduleScreensaver\(\);scheduleIdleHomeReturn\(\)\}\},\{capture:true,passive:true\}\)\)/);
  assert.doesNotMatch(dashboard, /setInterval\([^)]*idleHomeReturn/);
  // Görünüm değişince sıfırlanır ve Ana Sayfa'ya dönünce ekran koruyucu kendi süresini sayar.
  assert.match(dashboard, /closeScreensaver\(\);\s*scheduleScreensaver\(\);\s*scheduleIdleHomeReturn\(\);\s*\}\s*function showDevice\(id\)\{/);
  // Tek zamanlayıcı, sızıntısız.
  assert.match(dashboard, /function clearIdleHomeReturn\(\)\{if\(idleHomeReturnTimer!==null\)\{clearTimeout\(idleHomeReturnTimer\);idleHomeReturnTimer=null\}\}/);
  // Düzenleme modunun 60 saniyelik otomatik çıkışı ayrı ve değişmedi.
  assert.match(dashboard, /const dashboardEditingIdleDelay=60000/);
});

test("Groups sekmesine geçince cihaz listesi döngüsüz şekilde dolu gelir", async () => {
  const dashboard = await readDashboardBundle();
  // Durum kurulumu sekme değiştirmeyen ayrı bir fonksiyona alındı.
  assert.match(dashboard, /function prepareGroupEditor\(groupId=null\)\{/);
  assert.match(dashboard, /function openGroupEditor\(groupId=null\)\{\s*prepareGroupEditor\(groupId\);\s*renderWidgetCatalog\(\);\s*setAddDialogTab\("groups"\);/);
  // Sekme geçişi yalnız durum yoksa kurar; prepareGroupEditor setAddDialogTab çağırmaz (sonsuz döngü yok).
  assert.match(dashboard, /if\(tab==="groups"&&!state\.groupEditing\)prepareGroupEditor\(null\);/);
  const prepareBody = dashboard.slice(
    dashboard.indexOf("function prepareGroupEditor(groupId=null){"),
    dashboard.indexOf("function openGroupEditor(groupId=null){")
  );
  assert.ok(prepareBody.length > 0);
  assert.doesNotMatch(prepareBody, /setAddDialogTab/);
  assert.doesNotMatch(prepareBody, /openGroupEditor/);
  assert.match(prepareBody, /renderGroupDeviceChoices\(\)/);
  // Kapanışta temizlik korunuyor; sonraki açılışta sekme geçişi listeyi yeniden kuruyor.
  assert.match(dashboard, /function resetAddDialog\(\)\{\s*state\.groupEditing=null;/);
  assert.match(dashboard, /\$\("#groupDeviceChoices"\)\.innerHTML="";/);
});

test("widget kataloğu bilgi kutuları ve kullanıcı grupları olarak ayrılır", async () => {
  const dashboard = await readDashboardBundle();
  assert.match(dashboard, /function widgetCatalogSectionHtml\(headingId,labelKey,entries\)\{\s*if\(!entries\.length\)return"";/);
  assert.match(dashboard, /<div class="widget-catalog-section" role="group" aria-labelledby="\$\{headingId\}"><h3 id="\$\{headingId\}" class="widget-catalog-heading">\$\{esc\(t\(labelKey\)\)\}<\/h3>/);
  assert.match(dashboard, /widgetCatalogSectionHtml\("widgetCatalogInfoHeading","widgetCatalogInfoBoxes",infoBoxes\)\+widgetCatalogSectionHtml\("widgetCatalogGroupsHeading","widgetCatalogYourGroups",groupBoxes\)/);
  assert.match(dashboard, /const infoBoxes=Object\.entries\(dashboardWidgetTypes\)/);
  assert.match(dashboard, /const groupBoxes=state\.groups\.map\(group=>/);
  // Ekle/Kaldır, "Her zaman açık" ve grup düzenle ikonu aynı öğe şablonunda kaldı.
  assert.match(dashboard, /function widgetCatalogItemHtml\(entry\)\{/);
  assert.match(dashboard, /\$\{t\("widgetAlwaysOn"\)\}<\/button>/);
  assert.match(dashboard, /data-remove-widget="\$\{esc\(id\)\}"/);
  assert.match(dashboard, /data-add-widget="\$\{esc\(id\)\}"/);
  assert.match(dashboard, /data-edit-group="\$\{esc\(groupId\)\}"/);
  assert.match(dashboard, /\$\$\("\[data-edit-group\]"\)\.forEach\(button=>button\.onclick=\(\)=>openGroupEditor\(button\.dataset\.editGroup\)\)/);
  assert.match(dashboard, /\.widget-catalog-heading\{margin:0;color:var\(--muted\);font:750 12px\/1\.2 system-ui,sans-serif;letter-spacing:\.08em;text-transform:uppercase\}/);
  assert.equal(dashboard.split('widgetCatalogInfoBoxes:"').length - 1, 2);
  assert.equal(dashboard.split('widgetCatalogYourGroups:"').length - 1, 2);
});

test("taşınan widget rayda ortalanır ve FLIP transformundan önce kaydırılır", async () => {
  const dashboard = await readDashboardBundle();
  // Yatayda ortala, sayfayı dikey kaydırma; reduced-motion altında anında.
  assert.match(dashboard, /widget\.scrollIntoView\(\{behavior:reducedMotion\(\)\?"auto":"smooth",block:"nearest",inline:"center"\}\)/);
  // Kaydırma, FLIP transformu uygulanmadan ÖNCE olmalı: aksi halde scrollIntoView
  // widget'ın eski (transform edilmiş) kutusunu ölçer ve hiç kaydırmaz.
  assert.match(dashboard, /touchDashboardEditing\(\);\s*scrollMovedWidgetIntoView\(id\);\s*playWidgetSlide\(positions\);/);
  const moveBody = dashboard.slice(
    dashboard.indexOf("function moveDashboardWidget(id,direction){"),
    dashboard.indexOf("const dashboardEditingIdleDelay=")
  );
  assert.ok(moveBody.length > 0);
  assert.ok(moveBody.indexOf("scrollMovedWidgetIntoView(id)") < moveBody.indexOf("playWidgetSlide(positions)"));
  assert.doesNotMatch(moveBody, /scrollIntoView/);
  // Taşıma hâlâ 60 sn boşta kalma sayacını sıfırlıyor ve FLIP temizliği önde.
  assert.ok(moveBody.indexOf("touchDashboardEditing()") > 0);
  assert.match(moveBody, /if\(fixedDashboardWidgets\.has\(id\)\)return;\s*endWidgetSlide\(\);/);
  // Hızlı basmalarda ipucu zamanlayıcısı yığılmaz.
  assert.match(dashboard, /if\(widgetScrollHintTimer!==null\)clearTimeout\(widgetScrollHintTimer\);\s*widgetScrollHintTimer=setTimeout\(\(\)=>\{widgetScrollHintTimer=null;updateWidgetScrollHint\(\)\},420\)/);
  assert.match(dashboard, /function scrollMovedWidgetIntoView\(id\)\{\s*const widget=railWidgets\(\)\.find\(candidate=>candidate\.dataset\.widget===id\);\s*if\(!widget\)return;/);
});

test("yeni oluşturulan grup widget'ı görünüme alınır, düzenlenen grup alınmaz", async () => {
  const dashboard = await readDashboardBundle();
  // Yalnızca yeni grup: editing.id doluysa createdId null kalır.
  assert.match(dashboard, /let createdId=null;\s*if\(editing\.id\)\{\s*groups=state\.groups\.map\(group=>group\.id===editing\.id\?\{id:group\.id,name,items\}:group\);\s*\}else\{/);
  assert.match(dashboard, /createdId=id;\s*groups=\[\.\.\.state\.groups,\{id,name,items\}\];\s*state\.widgets\.push\(groupWidgetId\(id\)\);/);
  // Kaydırma, modal kapandıktan ve düzen uygulandıktan SONRA; mevcut yardımcı yeniden kullanılıyor.
  assert.match(dashboard, /closeAddDialog\(\);\s*await persistHomeGroups\(groups,editing\.id\?"groupUpdated":"groupCreated"\);\s*if\(createdId\)requestAnimationFrame\(\(\)=>scrollMovedWidgetIntoView\(groupWidgetId\(createdId\)\)\);/);
  const saveBody = dashboard.slice(
    dashboard.indexOf("async function saveDashboardGroup(){"),
    dashboard.indexOf("function syncGroupWidgetOrder(groups){")
  );
  assert.ok(saveBody.length > 0);
  // Yeni bir kaydırma yolu yazılmadı ve sıralama doğru.
  assert.doesNotMatch(saveBody, /scrollIntoView/);
  assert.ok(saveBody.indexOf("await persistHomeGroups") < saveBody.indexOf("scrollMovedWidgetIntoView"));
  assert.ok(saveBody.indexOf("closeAddDialog()") < saveBody.indexOf("scrollMovedWidgetIntoView"));
  // persistHomeGroups kaydırmadan önce düzeni uyguluyor, yani eleman DOM'da.
  assert.match(dashboard, /async function persistHomeGroups\(groups,successKey\)\{\s*state\.groups=groups;\s*saveDashboardGroups\(\);\s*applyWidgetLayout\(\);\s*render\(\);/);
  // Yardımcı hâlâ reduced-motion ve ipucu güncellemesini kendisi hallediyor.
  assert.match(dashboard, /function scrollMovedWidgetIntoView\(id\)\{/);
  assert.match(dashboard, /widget\.scrollIntoView\(\{behavior:reducedMotion\(\)\?"auto":"smooth",block:"nearest",inline:"center"\}\)/);
  assert.match(dashboard, /widgetScrollHintTimer=setTimeout\(\(\)=>\{widgetScrollHintTimer=null;updateWidgetScrollHint\(\)\},420\)/);
});

test("dar sütunda hareket satırları dikey yığılır ve kapasite yeni satır yüksekliğine uyar", async () => {
  const dashboard = await readDashboardBundle();
  // Activity widget'ı artık tablette de diğer kartlarla aynı genişlikte.
  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 1\}/);
  assert.doesNotMatch(dashboard, /\[data-widget="activity"\]\{grid-column:span 2\}/);
  // Geniş ekran değeri span 5'te kaldı.
  assert.match(dashboard, /@media\(orientation:landscape\)\{#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 5\}/);
  // Cihaz adı üstte, durum+zaman altta; yalnız activity listesi etkileniyor.
  assert.match(dashboard, /#home \[data-widget="activity"\] \.widget-list-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:baseline;gap:2px 10px;font-size:17px\}#home \[data-widget="activity"\] \.widget-list-row strong\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}#home \[data-widget="activity"\] \.widget-list-row time\{color:var\(--muted\);font-size:14px\}#home \[data-widget="activity"\] \.widget-list-row span\{grid-column:1\/-1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px\}/);
  // Diğer widget listeleri yan yana düzenini koruyor.
  assert.match(dashboard, /\.widget-list-row\{display:flex;justify-content:space-between;gap:12px/);
  // ×N sayacı hâlâ üretiliyor ve stili duruyor.
  assert.match(dashboard, /<time>\$\{ago\(row\.event\.at\)\}<\/time>/);
  // Satır yüksekliği ~57px + 6px boşluk; bölen buna göre büyütüldü.
  assert.match(dashboard, /return Math\.max\(fallback,Math\.min\(14,Math\.floor\(available\/62\)\)\)/);
  assert.doesNotMatch(dashboard, /Math\.floor\(available\/44\)/);
});

test("Otomasyon sekmesi ev diliyle basit bağlantı yolunu sunar", async () => {
  const dashboard = await readDashboardBundle();

  // Nav'da beşinci düğme: Home / Cihazlar / Otomasyon / Bağlantılar / Ayarlar.
  const automationNav = dashboard.indexOf('data-view="automations"');
  const devicesNav = dashboard.indexOf('data-view="devices"');
  const connectionsNav = dashboard.indexOf('data-view="connections"');
  assert.ok(devicesNav >= 0 && devicesNav < automationNav && automationNav < connectionsNav);
  assert.match(dashboard, /<button class="nav-button" data-view="automations" data-admin-only>/);
  assert.match(dashboard, /navAutomations:"Automations"/);
  assert.match(dashboard, /navAutomations:"Otomasyon"/);
  assert.match(dashboard, /nav\{margin:0;display:grid;grid-template-columns:repeat\(5,1fr\)\}/);
  assert.match(dashboard, /grid-template-columns:repeat\(5,minmax\(104px,1fr\)\) auto/);

  // Sayfa ve iki yollu giriş; yol seçimi artık sayfada değil, sihirbaz modalinin ilk adımında.
  assert.match(dashboard, /<section id="automations" class="view" data-admin-only>/);
  assert.match(dashboard, /id="newAutomation" class="primary"/);
  assert.doesNotMatch(dashboard, /id="automationPaths"/);
  assert.match(dashboard, /data-automation-path="\$\{path\}"/);
  assert.match(dashboard, /entry\("link","⚡","simpleLinkPath","simpleLinkPathLead"\)/);
  assert.match(dashboard, /\.automation-path\{min-height:88px/);
  assert.match(dashboard, /\.simple-link-choice\{min-height:88px/);
  assert.match(dashboard, /comingSoon:"Coming soon"/);
  assert.match(dashboard, /comingSoon:"Yakında"/);

  // Liste gerçek cihaz durumundan üretiliyor, ayrı kopya yok.
  assert.match(dashboard, /function simpleLinks\(\)\{/);
  assert.match(dashboard, /state\.devices\.filter\(isLinkStarter\)\.forEach\(device=>\{/);
  assert.match(dashboard, /if\(!linkClusterNames\.includes\(binding\.cluster\)\)return;/);
  assert.match(dashboard, /function renderAutomations\(\)\{/);

  // Sihirbaz iki adım; endpoint ve cluster kullanıcıya sorulmuyor.
  assert.match(dashboard, /<dialog id="simpleLinkDialog" class="simple-link-dialog">/);
  assert.match(dashboard, /const linkSourceEndpoint=device=>\(device\.endpoints\|\|\[\]\)\.find\(endpoint=>endpointClusterNames\(endpoint,"out"\)\.includes\("genOnOff"\)\)/);
  assert.match(dashboard, /const isLinkStarter=device=>\(device\.actionTypes\|\|\[\]\)\.length>0\|\|Boolean\(linkSourceEndpoint\(device\)\)/);
  assert.match(dashboard, /const linkClusterNames=\["genOnOff","genLevelCtrl"\]/);
  assert.match(dashboard, /t\("simpleLinkStepCount",\{step:link\.step,total:2\}\)/);

  // Güvenlik: kilit ve siren hedef listesinde görünmez.
  assert.match(dashboard, /const isProtectedDevice=device=>\(device\.controls\|\|\[\]\)\.some\(control=>control\.kind==="lock"\|\|control\.kind==="siren"\)/);
  assert.match(dashboard, /const isLinkTarget=device=>!isProtectedDevice\(device\)&&/);

  // Kaydetme mevcut bind uç noktasını kullanıyor, yeni sunucu yolu yok.
  assert.match(dashboard, /async function saveSimpleLink\(\)\{[\s\S]*?api\("\/api\/zigbee\/bind",\{method:"POST"/);
  assert.match(dashboard, /simpleLinkDirectNote:"This link is created straight between the devices/);
  assert.match(dashboard, /simpleLinkDirectNote:"Bu bağlantı doğrudan cihazların arasına kurulur/);
  assert.match(dashboard, /simpleLinkRemoveConfirm:"Remove this link\?"/);
  assert.match(dashboard, /simpleLinkRemoveConfirm:"Bu bağlantı kaldırılsın mı\?"/);

  // Yönetici teknik paneli yerinde kalıyor.
  assert.match(dashboard, /class="zigbee-binding-panel"/);
  assert.match(dashboard, /id="zigbeeBindingList"/);

  // Arayüz sözlüğü: teknik kelimeler ev halkına görünmüyor.
  const catalogs = ["simpleLink", "automation", "rulePath", "comingSoon", "navAutomations"];
  assert.ok(catalogs.every((key) => dashboard.includes(key)));
  assert.doesNotMatch(dashboard, /simpleLink[A-Za-z]*:"[^"]*(?:tetikleyici|senaryo|cluster|endpoint)/i);
  assert.doesNotMatch(dashboard, /automations?[A-Za-z]*:"[^"]*(?:tetikleyici|senaryo|cluster|endpoint)/i);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("saat kuralı sihirbazı üç adımda cihaz+özellik çiftini kaydeder", async () => {
  const dashboard = await readDashboardBundle();

  // "Kural kur" yolu artık açık; yerinde "Yakında" rozeti kalmadı.
  assert.match(dashboard, /entry\("rule","🧩","rulePath","rulePathLead"\)/);
  assert.doesNotMatch(dashboard, /data-automation-path="rule" disabled/);
  // "Yeni otomasyon" doğrudan modalı açar; yol seçimi modalin ilk adımıdır (adım 0).
  assert.match(dashboard, /\$\("#newAutomation"\)\.onclick=\(\)=>openAutomationWizard\(\)/);
  assert.match(dashboard, /step:existing\?1:0,/);
  assert.match(dashboard, /const paths=wizard\.step===0;/);
  assert.match(dashboard, /\$\("#automationBody"\)\.innerHTML=paths\s*\?automationPathHtml\(\)/);
  assert.match(dashboard, /function chooseAutomationPath\(path\)\{[\s\S]*?if\(path==="link"\)\{openSimpleLink\(\);return\}[\s\S]*?wizard\.step=1;/);
  // İki diyalog üst üste binmez: bağlantı yolu seçilince sihirbaz kapanır.
  assert.match(dashboard, /const wizardDialog=\$\("#automationDialog"\);\s*if\(wizardDialog\.open\)wizardDialog\.close\(\);/);
  // Arkadaki liste görünmesin: sihirbazın backdrop'ı opak.
  assert.match(dashboard, /dialog\.automation-dialog::backdrop\{background:rgba\(12,26,20,\.94\)/);
  // Yol adımında ray ve İleri düğmeleri yok: panel tek başına kalır.
  assert.match(dashboard, /flow\.classList\.toggle\("solo",paths\);/);
  assert.match(dashboard, /if\(paths\)return;\s*panel\.insertAdjacentHTML\("beforebegin",automationRailHtml\(wizard\)\);/);
  assert.match(dashboard, /\.automation-flow\.solo\{display:block\}/);
  assert.match(dashboard, /automationPathTitle:"Bunu nasıl kurmak istersiniz\?"/);
  assert.match(dashboard, /automationPathTitle:"How do you want to set this up\?"/);
  // Adım 1'de dönülecek yer yok: düğme kapatıyor, etiketi de "Vazgeç". Alt öğe ekranındaysa
  // dönülecek yer var (cihaz listesi), orada etiket "Geri" olur.
  assert.match(dashboard, /\$\("#automationBack"\)\.textContent=t\(wizard\.step<=1&&!automationDetailOpen\(wizard\)\?"cancel":"back"\)/);
  assert.match(dashboard, /if\(wizard&&automationDetailOpen\(wizard\)\)\{automationPickBack\(wizard\.step===1\?"trigger":"target"\);return\}/);
  assert.match(dashboard, /if\(!wizard\|\|wizard\.step<=1\)\{\$\("#automationDialog"\)\.close\(\);return\}/);

  // Üç adımlı sihirbaz kabuğu.
  assert.match(dashboard, /<dialog id="automationDialog" class="automation-dialog">/);
  assert.match(dashboard, /id="automationBody"/);
  assert.match(dashboard, /id="automationNext" class="primary"/);
  assert.match(dashboard, /t\("automationStepCount",\{step:entry\.step,total:3\}\)/);
  assert.match(dashboard, /automationStepCount:"Step \{step\} of \{total\}"/);
  assert.match(dashboard, /automationStepCount:"Adım \{step\} \/ \{total\}"/);
  assert.match(
    dashboard,
    /const titles=\["automationWhenTitle",mapping\?"automationTargetTitle":"automationThenTitle",mapping\?"automationMapTitle":"automationReviewTitle"\]/
  );
  assert.match(dashboard, /automationWhenTitle:"Ne zaman çalışsın\?"/);
  assert.match(dashboard, /automationThenTitle:"Ne yapsın\?"/);

  // Ekran 1: beş dokunma hedefi, yalnızca saat etkin, diğer dördü "Yakında" ve devre dışı.
  assert.match(dashboard, /\{kind:"time",glyph:"🕐",label:"automationTriggerTime",ready:true\}/);
  assert.match(dashboard, /\{kind:"sun",glyph:"🌅",label:"automationTriggerSun",ready:false\}/);
  assert.match(dashboard, /\{kind:"button",glyph:"🔘",label:"automationTriggerButton",ready:true\}/);
  assert.match(dashboard, /\{kind:"sensor",glyph:"🚪",label:"automationTriggerSensor",ready:true\}/);
  assert.match(dashboard, /\{kind:"deviceState",glyph:"💡",label:"automationTriggerDeviceState",ready:true\}/);
  // Bu yol somut adıyla anılır: soyut "cihaz" değil, evdeki anahtar ve priz.
  assert.match(dashboard, /automationTriggerDeviceState:"Bir anahtar veya priz açılınca \/ kapanınca"/);
  assert.match(dashboard, /automationTriggerDeviceState:"When a switch or plug turns on or off"/);
  assert.doesNotMatch(dashboard, /automationTriggerDeviceState:"[^"]*(?:Bir cihaz açıl|a device turns on)/);
  assert.match(dashboard, /entry\.ready\?"":' disabled aria-disabled="true"'/);
  assert.match(dashboard, /entry\.ready\?"":`<span class="automation-soon">\$\{t\("comingSoon"\)\}<\/span>`/);
  assert.match(dashboard, /\.automation-trigger\{min-height:88px/);

  // Saat seçimi iri artır/azalt düğmeleriyle; sayısal klavye yok, dakika 5'er adım.
  assert.match(dashboard, /data-automation-time="\$\{name\}:\$\{amount\}"/);
  assert.match(dashboard, /unit\("hour",wizard\.hour,1,"automationHourUp","automationHourDown"\)/);
  assert.match(dashboard, /unit\("minute",wizard\.minute,5,"automationMinuteUp","automationMinuteDown"\)/);
  assert.match(dashboard, /function stepAutomationTime\(unit,amount\)\{/);
  assert.doesNotMatch(dashboard, /type="time"/);

  // Gün çipleri; varsayılan "Her gün".
  assert.match(dashboard, /const automationWeekDays=\[1,2,3,4,5,6,7\]/);
  assert.match(dashboard, /days:timed\?\[\.\.\.trigger\.days\]:\[\.\.\.automationWeekDays\]/);
  assert.match(dashboard, /automationEveryDayChip:"Her gün"/);
  assert.match(dashboard, /automationEveryDayChip:"Every day"/);
  assert.match(dashboard, /automationDay1:"Pzt"/);
  assert.match(dashboard, /automationDay7:"Sun"/);

  // Ekran 2 iki aşamalı: önce cihaz kartı, sonra o cihazın alt öğeleri. Oda süzgeci kalktı,
  // odaya erişim aramadan geliyor.
  assert.doesNotMatch(dashboard, /data-automation-room/);
  assert.doesNotMatch(dashboard, /id="automationRooms"/);
  assert.match(dashboard, /function chooseAutomationTargetDevice\(deviceId\)\{/);
  assert.match(dashboard, /const single=controls\.length===1;/);
  assert.match(dashboard, /\.automation-pick\.active\{border-color:var\(--forest\);background:var\(--forest-soft\)\}/);

  // §8.1 güvenlik: kilit ve siren hiç listelenmez, yalnızca switch kontrolleri hedef.
  assert.match(dashboard, /const isAutomationControl=control=>control\.kind==="switch"&&control\.adminOnly!==true/);
  assert.match(dashboard, /const automationControls=device=>isProtectedDevice\(device\)\?\[\]:\(device\?\.controls\|\|\[\]\)\.filter\(isAutomationControl\)/);

  // §5.1.1 alt varlık: kaydedilen eylem kanonik property taşır, controlId yalnızca sunum.
  assert.match(
    dashboard,
    /wizard\.action=\{type:"device",deviceId,property:control\.property,controlId:control\.id,value\}/
  );
  assert.match(dashboard, /const automationControl=action=>automationDevice\(action\)\?\.controls\.find\(control=>control\.property===action\?\.property\)/);

  // Ekran 3: özet cümlesi tam şablon anahtarıyla kuruluyor, parça birleştirme yok.
  assert.match(dashboard, /automationEveryDay\(trigger\.days\)\?"automationSummaryTime":"automationSummaryTimeDays",/);
  // Kapanış sözü ayrı bir tam cümledir; özet cümlesine parça olarak eklenmiyor.
  assert.match(
    dashboard,
    /<div class="automation-sentence">\$\{esc\(sentence\)\}\$\{autoOff\?`<span class="automation-sentence-line">\$\{esc\(autoOff\)\}<\/span>`:""\}<\/div>/
  );
  assert.match(dashboard, /automationSummaryTime:"Every day at \{time\}, \{device\} will \{action\}\."/);
  assert.match(dashboard, /automationSummaryTime:"Her gün saat \{time\} olduğunda \{device\} \{action\}\."/);
  assert.match(dashboard, /automationSummaryTimeDays:"On \{days\} at \{time\}, \{device\} will \{action\}\."/);
  assert.match(dashboard, /automationSummaryTimeDays:"\{days\} günleri saat \{time\} olduğunda \{device\} \{action\}\."/);
  assert.match(dashboard, /automationWillTurnOn:"açılacak"/);
  assert.match(dashboard, /automationWillTurnOn:"turn on"/);
  assert.match(dashboard, /id="automationName" type="text" maxlength="64"/);

  // Liste: açık/kapalı anahtarı ve §8.2 son çalışma çipi.
  assert.match(dashboard, /data-automation-toggle="\$\{esc\(automation\.id\)\}"/);
  assert.match(dashboard, /async function toggleAutomationEnabled\(id\)\{/);
  assert.match(dashboard, /const automationRunChip=automation=>\{/);
  assert.match(dashboard, /automationNeverRan:"Henüz çalışmadı"/);
  assert.match(dashboard, /automationNeverRan:"Has not run yet"/);
  assert.match(dashboard, /automationLastRunFailed:"Son çalışma yapılamadı · \{time\}"/);
  assert.match(dashboard, /\.automation-card-chip\.warn\{color:var\(--danger\)\}/);

  // Uzun basma modalı: Düzenle / Şimdi çalıştır / Sil (silme onay ister).
  assert.match(dashboard, /<dialog id="automationActionDialog">/);
  assert.match(dashboard, /id="runAutomationNow"/);
  assert.match(dashboard, /id="editAutomation"/);
  assert.match(dashboard, /id="deleteAutomation"/);
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openAutomationActions\(card\.dataset\.automationCard\)/);
  assert.match(dashboard, /confirm\(t\("automationDeleteConfirm",\{name:automation\.name\}\)\)/);

  // Sunucu sözleşmesi: GET / PUT tüm dizi / POST run.
  assert.match(dashboard, /async function loadAutomations\(\)\{\s*const data=await api\("\/api\/automations"\);/);
  assert.match(dashboard, /api\("\/api\/automations",\{method:"PUT",body:JSON\.stringify\(\{automations\}\)\}\)/);
  assert.match(dashboard, /api\(`\/api\/automations\/\$\{encodeURIComponent\(id\)\}\/run`,\{method:"POST"\}\)/);

  // Sihirbaz gezinmesi: sabit ileri/geri şeridi, adım göstergesi, otomatik ilerleme.
  assert.match(dashboard, /<div class="modal-actions automation-actions"><p id="automationNextHint" class="automation-next-hint" hidden><\/p><button id="automationBack" class="secondary" type="button" data-i18n="back">/);
  assert.match(dashboard, /id="automationBack"[\s\S]*?id="automationNext" class="primary"/);
  assert.match(dashboard, /\.automation-actions\{flex:none;flex-wrap:wrap;justify-content:space-between/);
  assert.match(dashboard, /\.automation-actions button\{min-width:132px;min-height:52px/);
  assert.match(dashboard, /back:"Geri"/);
  assert.match(dashboard, /next:"İleri"/);
  assert.match(dashboard, /cancel:"Vazgeç"/);
  assert.match(dashboard, /cancel:"Cancel"/);

  // "İleri" yalnızca o adımda seçim yapıldıysa aktif.
  assert.match(
    dashboard,
    /const automationStepReady=wizard=>wizard\.step===0\?false\s*:wizard\.step===1\?automationTriggerReady\(wizard\)\s*:automationMappingMode\(wizard\)\?\(wizard\.step===2\?Boolean\(wizard\.target\):automationMapReady\(wizard\)\)\s*:wizard\.step===2\?Boolean\(wizard\.action\):true/
  );
  assert.match(dashboard, /const ready=automationStepReady\(wizard\);/);
  assert.match(dashboard, /next\.disabled=!ready;/);
  assert.match(dashboard, /if\(!wizard\|\|wizard\.step===0\|\|!automationStepReady\(wizard\)\)return;/);
  assert.match(dashboard, /\.automation-actions button\[disabled\]\{opacity:\.45\}/);

  // Adım göstergesi artık soldaki ray: ayrı sayaç ve nokta dizisi kalmadı.
  assert.doesNotMatch(dashboard, /automationDots/);
  assert.doesNotMatch(dashboard, /id="automationStep"/);

  // Tek dokunuşluk seçimler ~200 ms sonra kendiliğinden ilerler.
  assert.match(dashboard, /automationAdvanceTimer=setTimeout\(\(\)=>\{automationAdvanceTimer=null;run\(\)\},200\)/);
  assert.match(dashboard, /data-automation-trigger\]"\)\.forEach\(button=>button\.onclick=\(\)=>chooseAutomationTrigger\(button\.dataset\.automationTrigger\)\)/);
  // Tür seçilince kartlar kapanır (blok açığı temizlenir) ve sıradaki soru açılır.
  assert.match(dashboard, /wizard\.triggerKind=kind;[\s\S]{0,120}?wizard\.open=null;\s*renderAutomationWizard\(\);\s*afterAutomationChoice\(automationFlashOpenBlock\);/);
  assert.match(dashboard, /afterAutomationChoice\(\(\)=>\{nextAutomationStep\(\)\}\)/);
  // Ayar isteyen dokunuşlarda (saat, gün, sekme, arama, eşleme formu) otomatik ilerleme yok: sayılı
  // çağrı yeri var (tanım + tetikleyici türü + cihaz seçimi ×3 + kanal + olay + hedef + eylem +
  // alternatif).
  assert.equal((dashboard.match(/afterAutomationChoice\(/g) ?? []).length, 10);
  // Geri gidildiğinde seçimler durur: sihirbaz durumu yalnızca modal kapanınca sıfırlanır.
  assert.match(dashboard, /addEventListener\("close",\(\)=>\{cancelAutomationAdvance\(\);state\.automationWizard=null\}\)/);
  assert.match(dashboard, /triggerKind:automationTriggerKind\(trigger\)/);

  // Faz 1 sınırı: tek tetikleyici, tek eylem, koşul yok.
  assert.match(dashboard, /triggers:\[trigger\],\s*conditions:\[\],\s*actions,/);
  assert.match(
    dashboard,
    /const actions=automationMappingMode\(wizard\)\?automationMapActions\(wizard\):\(wizard\.action\?\[\{\.\.\.wizard\.action\}\]:\[\]\);/
  );
  assert.doesNotMatch(dashboard, /data-automation-condition/);
  assert.doesNotMatch(dashboard, /automation[A-Za-z]*:"[^"]*(?:koşul|senaryo|tetikleyici|property|endpoint)/i);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("sihirbaz akışı solda tıklanabilir adım rayıyla gösterir", async () => {
  const dashboard = await readDashboardBundle();

  // Kabuk: sol ray + sağ panel aynı ızgarada; panel statik, ray her çizimde yenilenir.
  assert.match(
    dashboard,
    /<div id="automationFlow" class="automation-flow"><div id="automationPanel" class="automation-panel"><h2 id="automationTitle"/
  );
  assert.match(dashboard, /renderAutomationRail\(wizard,paths\);/);
  assert.match(dashboard, /flow\.querySelectorAll\("\.automation-rail-step"\)\.forEach\(node=>node\.remove\(\)\);/);

  // Ray adımı gerçek düğme: aktif adım aria-current taşır, kilitli adım devre dışıdır.
  assert.match(dashboard, /data-automation-goto="\$\{entry\.step\}"\$\{active\?' aria-current="step"':""\}/);
  assert.match(dashboard, /\$\{open\?"":' disabled aria-disabled="true"'\}/);
  assert.match(dashboard, /\$\$\("\[data-automation-goto\]"\)\.forEach\(button=>button\.onclick=\(\)=>goToAutomationStep\(button\.dataset\.automationGoto\)\)/);
  // Dokunmatik hedef 44 px üstünde.
  assert.match(dashboard, /\.automation-rail-step\{min-height:64px/);
  assert.match(dashboard, /\.automation-rail-step\.active\{border-color:var\(--forest\);background:var\(--forest-soft\)/);
  assert.match(dashboard, /\.automation-rail-step\[disabled\]\{opacity:\.5/);

  // Kilit kuralı: tetikleyici seçilmeden 2. adıma, hedef seçilmeden 3. adıma atlanamaz.
  assert.match(
    dashboard,
    /const automationStepUnlocked=\(wizard,step\)=>step<=1\?true\s*:!automationTriggerReady\(wizard\)\?false\s*:step===2\?true\s*:automationMappingMode\(wizard\)\?Boolean\(wizard\.target\):Boolean\(wizard\.action\)/
  );
  // Tamamlanan ve aktif adıma atlama; kilitli adım sessizce reddedilir.
  assert.match(
    dashboard,
    /function goToAutomationStep\(step\)\{[\s\S]*?cancelAutomationAdvance\(\);\s*if\(target===wizard\.step\|\|!automationStepUnlocked\(wizard,target\)\)return;\s*wizard\.step=target;\s*wizard\.open=null;\s*renderAutomationWizard\(\);/
  );
  // Adım değişince gövde başa sarar (ray ile atlarken de).
  assert.match(dashboard, /if\(stepChanged\)automationScrollTop\(\);/);

  // Ray özetleri: seçilen değer adımın altında yazar, seçim yoksa satır sade kalır.
  assert.match(dashboard, /const automationRailJoin=\(\.\.\.parts\)=>parts\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(
    dashboard,
    /automationTimeText\(wizard\),\s*automationEveryDay\(wizard\.days\)\?t\("automationEveryDayChip"\):automationDayList\(wizard\.days\)/
  );
  assert.match(dashboard, /if\(wizard\.triggerKind==="button"\)return automationRailJoin\(name,wizard\.triggerAction\?automationButtonLabel\(device,wizard\.triggerAction\):""\)/);
  assert.match(
    dashboard,
    /const automationRailModeKeys=\{on:"automationTurnOn",off:"automationTurnOff",toggle:"automationTurnToggle"\}/
  );
  assert.match(
    dashboard,
    /return automationRailJoin\(automationActionName\(wizard\.action\),t\(automationRailModeKeys\[automationActionMode\(wizard\.action\)\]\)\)/
  );
  assert.match(dashboard, /const automationRailReviewValue=wizard=>automationStepUnlocked\(wizard,3\)\?automationWizardName\(wizard\):""/);
  assert.match(dashboard, /const value=entry\.value\?`<span class="automation-rail-value">\$\{esc\(entry\.value\)\}<\/span>`:""/);

  // Etiketler iki dilde ve eşleme yolunda ayrı: "Hangi cihaz" / "Ne olsun".
  assert.match(dashboard, /\{step:2,label:mapping\?"automationRailTarget":"automationRailThen"/);
  assert.match(dashboard, /\{step:3,label:mapping\?"automationRailMap":"automationRailReview"/);
  assert.match(dashboard, /automationRailWhen:"Ne zaman"/);
  assert.match(dashboard, /automationRailWhen:"When"/);
  assert.match(dashboard, /automationRailThen:"Ne yapsın"/);
  assert.match(dashboard, /automationRailThen:"What happens"/);
  assert.match(dashboard, /automationRailReview:"Özet"/);
  assert.match(dashboard, /automationRailReview:"Summary"/);
  assert.match(dashboard, /automationRailLocked:"Önce üstteki adımı tamamlayın"/);
  assert.match(dashboard, /automationRailLocked:"Finish the step above first"/);

  // Modal sabit yükseklikte: içerik adımdan adıma kısalıp uzasa da kutu ve alt şerit yerinde kalır.
  // Dış kutu kaydırmaz (`overflow:hidden`), kaydırma iç kutuya taşındı.
  assert.match(
    dashboard,
    /\.automation-modal\{height:min\(92dvh,880px\);display:flex;flex-direction:column;padding:24px;overflow:hidden\}/
  );
  assert.doesNotMatch(dashboard, /\.automation-modal\{[^}]*max-height/);
  // Tarayıcının kendi `dialog` yükseklik sınırı devrede kalırsa alt eylem şeridi kırpılabilir.
  assert.match(dashboard, /dialog\.automation-dialog\{width:min\(94vw,680px\);max-height:none;overflow:hidden\}/);
  assert.doesNotMatch(dashboard, /\.automation-actions\{[^}]*position:sticky/);
  // Dar ekran akordiyon: tek sütun, panel `order` ile aktif adımın altına iner; kayan kutu ray dahil hepsi.
  assert.match(dashboard, /\.automation-flow\{display:flex;flex-direction:column/);
  assert.match(dashboard, /\.automation-flow\{[^}]*flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain\}/);
  assert.match(dashboard, /style="order:\$\{entry\.step\*2\}"/);
  assert.match(dashboard, /panel\.style\.order=paths\?"":String\(wizard\.step\*2\+1\)/);
  // Geniş ekran: solda ray sütunu, sağda tüm yüksekliği kaplayan panel.
  assert.match(
    dashboard,
    /@media\(min-width:760px\)\{\.automation-flow\{display:grid;grid-template-columns:minmax\(0,232px\) minmax\(0,1fr\)[^}]*\}\.automation-flow\.solo\{display:block;overflow-y:auto\}\.automation-rail-step\{grid-column:1\}\.automation-panel\{grid-column:2;grid-row:1\/-1;align-self:stretch;min-height:0;overflow-y:auto[^}]*\}\}/
  );

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("sihirbaz düğme ve sensör tetikleyicilerini ev diliyle kurar", async () => {
  const dashboard = await readDashboardBundle();

  // Üç yeni yol açık, gün doğumu hâlâ "yakında".
  assert.match(dashboard, /\{kind:"sun",glyph:"🌅",label:"automationTriggerSun",ready:false\}/);
  assert.match(dashboard, /const automationDeviceKinds=\["button","sensor","deviceState"\]/);
  // Tür kartları kendi bloğunda; cihaz sorusu ayrı bir blok olarak sıraya girer.
  assert.match(dashboard, /else if\(automationDeviceKinds\.includes\(wizard\.triggerKind\)\)\{/);
  assert.match(dashboard, /body:\(\)=>automationPickerHtml\(wizard,"trigger"\)/);

  // Cihaz seçimi kart ızgarası, açılır liste değil; dokunma hedefi 88 px.
  assert.match(dashboard, /data-automation-trigger-device="\$\{esc\(device\.id\)\}"/);
  assert.match(dashboard, /\.automation-pick\{min-height:88px/);
  assert.match(dashboard, /\.automation-picks\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(150px,1fr\)\)/);
  assert.doesNotMatch(dashboard, /<select[^>]*data-automation/);

  // Kanonik kayıt: düğme için action, sensör için property + equals.
  assert.match(dashboard, /\{type:"deviceAction",deviceId:wizard\.triggerDeviceId,action:wizard\.triggerAction\}/);
  assert.match(dashboard, /\{type:"deviceState",deviceId:wizard\.triggerDeviceId,property:wizard\.triggerProperty,equals:wizard\.triggerEquals\}/);
  assert.match(dashboard, /token:`action:\$\{entry\.action\}`,action:entry\.action,label:automationActionLabel\(entry\.action\)/);

  // Alt varlık kuralı: her düğme ayrı hedef; liste sunucunun `buttons` yapısından geliyor.
  assert.match(dashboard, /for\(const button of device\.buttons\|\|\[\]\)\{\s*for\(const entry of visiblePresses\(button\.actions,keep\)\)\{/);
  // Sunucu düğme türetmediyse ham actionTypes yedeği devrede kalır.
  assert.match(dashboard, /if\(!\(device\.buttons\|\|\[\]\)\.length\)\{\s*const raw=\(device\.actionTypes\|\|\[\]\)/);

  // Ham `1_single` kullanıcıya basılmaz — sayı + basış eki insan diline çevriliyor.
  assert.match(dashboard, /const numbered=\/\^\(\?:button_\)\?\(\\d\{1,2\}\)_\(\[a-z_\]\+\)\$\/\.exec\(raw\)/);
  assert.match(dashboard, /return numbered\?t\("automationButtonPress",\{number:numbered\[1\],press:t\(press\)\}\):t\(press\)/);
  assert.match(dashboard, /automationButtonPress:"\{number\}\. düğme · \{press\}"/);
  assert.match(dashboard, /automationButtonPress:"Button \{number\} · \{press\}"/);
  assert.match(dashboard, /automationPressSingle:"tek basış"/);
  assert.match(dashboard, /automationPressDouble:"çift basış"/);
  assert.match(dashboard, /automationPressHold:"basılı tut"/);
  assert.match(dashboard, /automationPressSingle:"single press"/);
  // Tanınmayan kalıpta son çare ham değer: çökme ya da boş liste yok.
  assert.match(dashboard, /if\(!press\)return raw;/);
  assert.doesNotMatch(dashboard, /\$\{esc\(event\.action\)\}<\/button>/);

  // Kullanıcının hangi düğmeye bastığını görmesi için son basış ipucu — mevcut olay akışından.
  assert.match(dashboard, /const event=\(state\.events\|\|\[\]\)\.find\(item=>item\.sourceName===device\.sourceName&&item\.property==="action"\)/);
  assert.match(dashboard, /t\("automationLastPress",\{action:automationButtonLabel\(device,event\.value\),time:ago\(event\.at\)\}\)/);
  assert.match(dashboard, /automationPressToLearn:"Emin değilseniz düğmeye basın; son algılanan basış burada görünür\."/);
  assert.match(dashboard, /function refreshAutomationHint\(\)\{/);

  // Sensör değerleri kullanıcı dilinde; ham true\/false\/ON\/OFF gösterilmiyor.
  assert.match(dashboard, /contact:\[\{value:false,key:"automationEventOpened"\},\{value:true,key:"automationEventClosed"\}\]/);
  assert.match(dashboard, /occupancy:\[\{value:true,key:"automationEventMotion"\},\{value:false,key:"automationEventMotionEnds"\}\]/);
  assert.match(dashboard, /lock_state:\[\{value:"locked",key:"automationEventLocked"\},\{value:"unlocked",key:"automationEventUnlocked"\}\]/);
  assert.match(dashboard, /automationEventMotion:"hareket algılayınca"/);
  assert.match(dashboard, /automationEventOpened:"kapı açılınca"/);
  assert.match(dashboard, /automationEventSmoke:"duman algılayınca"/);
  assert.match(dashboard, /automationEventTurnedOn:"açılınca"/);
  assert.match(dashboard, /automationEventTurnedOn:"turns on"/);
  assert.doesNotMatch(dashboard, /automationEvent[A-Za-z]*:"(?:true|false|ON|OFF)"/);

  // Tek anlamlı seçenek sessizce seçilir; anahtar yolunda tek kanallı cihazda kanal da sorulmaz.
  assert.match(dashboard, /if\(events\.length===1&&!unproven\)automationApplyEvent\(wizard,events\[0\]\)/);
  assert.match(
    dashboard,
    /function automationApplySingleChannel\(wizard,device\)\{\s*const controls=automationStateControls\(device\);\s*if\(controls\.length===1\)wizard\.triggerProperty=controls\[0\]\.property;/
  );

  // Cihaz durumu yolu switch kontrollerinden türüyor; çok kanallı anahtarda kanal adı ekleniyor.
  assert.match(dashboard, /const automationStateControls=device=>\(device\?\.controls\|\|\[\]\)\.filter\(control=>control\.kind==="switch"\)/);
  assert.match(dashboard, /controls\.length>1\?t\("automationChannelEvent",\{channel:control\.name,event:label\}\):label/);

  // §8.1 — kilit\/siren EYLEM listesinde yok ama TETİKLEYİCİ olarak seçilebilir.
  assert.match(dashboard, /const automationControls=device=>isProtectedDevice\(device\)\?\[\]:/);
  assert.doesNotMatch(dashboard, /function automationTriggerEvents\(device,kind,keep\)\{[\s\S]*?isProtectedDevice[\s\S]*?\n  \}/);
  assert.match(dashboard, /automationEventLocked:"kilitlenince"/);
  assert.match(dashboard, /automationEventAlarm:"alarm verince"/);

  // Ekran 3 ve liste ekranı: tam şablon anahtarı, parça birleştirme yok.
  assert.match(dashboard, /if\(trigger\.type==="deviceAction"\)return t\("automationSummaryButton",automationEventValues\(trigger,action,actionKey\)\)/);
  assert.match(dashboard, /if\(trigger\.type==="deviceState"\)return t\("automationSummaryState",automationEventValues\(trigger,action,actionKey\)\)/);
  assert.match(dashboard, /if\(trigger\.type==="deviceAction"\)return t\("automationCardSummaryButton",automationEventValues\(trigger,action,actionKey\)\)/);
  assert.match(dashboard, /if\(trigger\.type==="deviceState"\)return t\("automationCardSummaryState",automationEventValues\(trigger,action,actionKey\)\)/);
  assert.match(dashboard, /automationSummaryButton:"\{device\} \{button\} olduğunda \{target\} \{action\}\."/);
  assert.match(dashboard, /automationSummaryButton:"When \{button\} on \{device\}, \{target\} will \{action\}\."/);
  assert.match(dashboard, /automationSummaryState:"\{device\} \{event\} \{target\} \{action\}\."/);
  assert.match(dashboard, /automationSummaryState:"When \{device\} \{event\}, \{target\} will \{action\}\."/);
  assert.match(dashboard, /automationCardSummaryButton:"\{device\} \{button\} → \{target\} \{action\}"/);
  assert.match(dashboard, /automationCardSummaryState:"\{device\} \{event\} → \{target\} \{action\}"/);

  // Tek basış hem açıp hem kapatabilsin: seçenek yalnız cihaz destekliyorsa listelenir.
  assert.match(dashboard, /const automationCanToggle=control=>control\?\.valueToggle!==undefined&&control\?\.valueToggle!==null/);
  assert.match(dashboard, /const toggle=automationCanToggle\(control\)\?choice\("toggle","automationTurnToggle",mode==="toggle"\):"";/);
  assert.match(dashboard, /\$\{choice\("on","automationTurnOn",mode==="on"\)\}\$\{choice\("off","automationTurnOff",mode==="off"\)\}\$\{toggle\}/);
  // Kaydedilen değer cihazın kendi bildirdiği değer; arayüzde uydurulmuyor.
  assert.match(dashboard, /if\(mode==="toggle"&&!automationCanToggle\(control\)\)return;/);
  assert.match(dashboard, /const value=mode==="toggle"\?control\.valueToggle:automationControlValue\(control,mode==="on"\);/);
  // Özet yine tam şablon anahtarıyla kuruluyor; üçüncü biçim için ayrı anahtar var.
  assert.match(dashboard, /const automationSentenceKeys=\{on:"automationWillTurnOn",off:"automationWillTurnOff",toggle:"automationWillToggle"\}/);
  assert.match(dashboard, /const automationCardKeys=\{on:"automationTurnsOn",off:"automationTurnsOff",toggle:"automationToggles"\}/);
  assert.match(dashboard, /const actionKey=automationSentenceKeys\[automationActionMode\(action\)\];/);
  assert.match(dashboard, /const actionKey=automationCardKeys\[automationActionMode\(action\)\];/);
  // Aynı kelime iki yerde aynı kalır: eylem kartı ve eşleme formu "Değiştir" / "Toggle" der.
  assert.match(dashboard, /automationTurnToggle:"Değiştir"/);
  assert.match(dashboard, /automationTurnToggle:"Toggle"/);
  assert.doesNotMatch(dashboard, /automationTurnToggle:"Turn on or off"/);
  assert.match(dashboard, /automationWillToggle:"açıksa kapanacak, kapalıysa açılacak"/);
  assert.match(dashboard, /automationWillToggle:"switch on or off"/);
  assert.match(dashboard, /automationToggles:"açık\/kapalı değişir"/);
  assert.match(dashboard, /automationToggles:"switches on or off"/);

  // §8.2 — döngü kanal granülerliğinde: yalnız başlatan kanal hedef listesinden düşer, cihazın
  // komşu kanalları kalır; kaydetmede de aynı kural işler ve hata ham basılmıyor.
  assert.match(dashboard, /const starter=wizard\.triggerKind==="time"\|\|channelStarter\?null:wizard\.triggerDeviceId;/);
  assert.match(dashboard, /const starterChannel=channelStarter\?automationChannelKey\(wizard\.triggerDeviceId,wizard\.triggerProperty\):null;/);
  assert.match(dashboard, /const targetControls=device=>automationControls\(device\)\.filter\(control=>automationChannelKey\(device\.id,control\.property\)!==starterChannel\);/);
  assert.match(dashboard, /targetControls\(device\)\.length>0&&device\.id!==starter/);
  assert.match(dashboard, /\?actions\.some\(action=>automationChannelKey\(action\.deviceId,action\.property\)===automationChannelKey\(trigger\.deviceId,trigger\.property\)\)/);
  assert.match(dashboard, /if\(loops\)\{showToast\(t\("automationLoopWarning"\),true\);return\}/);
  assert.match(dashboard, /showToast\(automationErrorText\(error\),true\)/);
  assert.match(dashboard, /automationLoopWarning:"Bu, otomasyonu başlatan kanalın kendisi;/);
  assert.match(dashboard, /automationLoopWarning:"This is the very channel that starts the automation,/);

  // Arayüz dili: yeni metinlerde geliştirici sözlüğü yok.
  assert.doesNotMatch(dashboard, /automation[A-Za-z]*:"[^"]*(?:tetikleyici|koşul|senaryo|kural kur|cluster|endpoint|property)/i);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("cihaz detayı kumandanın düğmelerini adlarıyla ve son basışla gösterir", async () => {
  const dashboard = await readDashboardBundle();

  // Bölüm yalnızca sunucu düğme türettiyse çıkar; boş listede hiç render edilmez.
  assert.match(dashboard, /const deviceButtonsHtml=device=>\{\s*const buttons=device\.buttons\|\|\[\];\s*if\(!buttons\.length\)return"";/);
  assert.match(dashboard, /<div class="device-buttons"><div class="device-buttons-head">\$\{t\("deviceButtons"\)\}<\/div>\$\{deviceButtonLastLine\(device\)\}\$\{rows\}<\/div>/);
  // Düğmeler kontrol sütununun içinde, kontrollerin altında durur; ayrı bir alt blokta tekrarlanmaz.
  assert.match(
    dashboard,
    /const controlsBodyHtml=device\.controls\.map\(control=>controlHtml\(device,control\)\)\.join\(""\)\+deviceButtonsHtml\(device\);/
  );
  assert.match(
    dashboard,
    /<div class="device-detail-controls"><div class="controls">\$\{controlsBodyHtml\|\|`<div class="device-exposed-empty">\$\{t\("noExposedControls"\)\}<\/div>`\}<\/div><\/div>/
  );
  assert.doesNotMatch(dashboard, /\$\{deviceButtonsHtml\(device\)\}\s*\$\{deviceRoomsHtml\(device\)\}/);
  assert.match(dashboard, /\.device-detail-controls \.controls>\.device-buttons\{margin-top:0\}/);

  // Her düğme kendi satırında: ad + desteklediği basışlar.
  assert.match(dashboard, /<div class="device-button-row\$\{deviceButtonPressed\(device,button\)\?" pressed":""\}" data-device-button="\$\{esc\(button\.id\)\}">/);
  assert.match(dashboard, /<div class="device-button-name">\$\{esc\(deviceButtonName\(button\)\)\}\$\{deviceButtonRenameButton\(device,button\)\}<\/div>/);
  assert.match(dashboard, /<div class="device-button-presses">\$\{esc\(deviceButtonPressList\(button\)\)\}<\/div>/);
  assert.match(dashboard, /const deviceButtonPressList=button=>visiblePresses\(button\?\.actions\)\.map\(entry=>deviceButtonPressLabel\(entry\.press\)\)\.join\(" · "\)/);

  // Yeniden adlandırma mevcut kanal desenini kullanır; yeni diyalog icat edilmedi.
  assert.match(dashboard, /const deviceButtonRenameButton=\(device,button\)=>`<button class="control-rename" type="button" data-admin-only data-rename-channel="\$\{esc\(device\.id\)\}" data-channel="\$\{esc\(button\.id\)\}"/);
  assert.match(dashboard, /const button=channel&&!control\?\(device\.buttons\|\|\[\]\)\.find\(item=>item\.id===channel\):null;/);
  assert.match(dashboard, /\$\("#nameInput"\)\.value=control\?\.name\|\|\(button\?deviceButtonName\(button\):""\)\|\|device\.name;/);
  assert.match(dashboard, /nameButton:"Düğmeyi adlandır"/);
  assert.match(dashboard, /nameButton:"Name button"/);

  // Son basılan satırı ve kısa vurgu: 8 sn'lik mevcut yenilemeye takılı, yeni zamanlayıcı yok.
  assert.match(dashboard, /const deviceButtonPressWindowMs=8000/);
  assert.match(dashboard, /if\(!last\|\|last\.buttonId!==button\.id\)return false;\s*return Date\.now\(\)-new Date\(last\.at\)\.getTime\(\)<deviceButtonPressWindowMs;/);
  assert.match(dashboard, /t\("deviceButtonLastPress",\{button:deviceButtonName\(button\),press:deviceButtonPressLabel\(entry\?\.press\?\?last\.action\),time:ago\(last\.at\)\}\)/);
  assert.match(dashboard, /\.device-button-row\.pressed\{animation:buttonPressed 3s ease-out 1 forwards\}/);
  assert.match(dashboard, /@keyframes buttonPressed\{0%,55%\{border-color:var\(--forest\);background:var\(--forest-soft\)\}/);
  assert.match(dashboard, /@media\(prefers-reduced-motion:reduce\)\{\.device-button-row\.pressed\{animation:none;border-color:var\(--forest\)\}\}/);
  assert.doesNotMatch(dashboard, /setInterval\([^)]*deviceButton/);

  // Basış yoksa kullanıcıya ne yapacağını söyleyen ipucu çıkar.
  assert.match(dashboard, /if\(!last\|\|!button\)return`<div class="device-buttons-hint">\$\{esc\(t\("deviceButtonLearnHint"\)\)\}<\/div>`/);
  assert.match(dashboard, /deviceButtonLearnHint:"Hangi düğme olduğunu görmek için cihazdaki bir düğmeye basın\."/);
  assert.match(dashboard, /deviceButtonLearnHint:"Press a button on the device to see which one it is\."/);

  // Varsayılan ad arayüz dilinden; kullanıcı ad verdiyse o kazanır.
  assert.match(dashboard, /if\(generated&&localized&&button\?\.name===generated\)return localized;/);
  assert.match(dashboard, /deviceButtonNumbered:"\{number\}\. düğme"/);
  assert.match(dashboard, /deviceButtonNumbered:"Button \{number\}"/);
  assert.match(dashboard, /deviceButtonSingle:"Düğme"/);
  assert.match(dashboard, /deviceButtonOther:"Other actions"/);
  assert.match(dashboard, /deviceButtonBrightnessUp:"Parlaklık artırma düğmesi"/);
  assert.match(dashboard, /deviceButtonBrightnessUp:"Brighten button"/);

  // `ungrouped` kovasında basış ham değerdir; tanınmayan değer olduğu gibi gösterilir.
  assert.match(dashboard, /const deviceButtonPressLabel=press=>\{const key=automationPressKeys\[press\];return key\?t\(key\):String\(press\?\?""\)\}/);
  assert.match(dashboard, /automationPressQuintuple:"beş basış"/);
  assert.match(dashboard, /automationPressMany:"several presses"/);

  // Sihirbaz aynı yapıyı kullanır; kaydedilen tetikleyici hâlâ ham `action`.
  assert.match(dashboard, /label:t\("automationButtonEvent",\{button:deviceButtonName\(button\),press:deviceButtonPressLabel\(entry\.press\)\}\)/);
  assert.match(dashboard, /token:`action:\$\{entry\.action\}`,\s*action:entry\.action,/);
  assert.match(dashboard, /automationButtonEvent:"\{button\} · \{press\}"/);
  // Yeniden adlandırma otomasyonu bozmaz: özet cümlesinde yeni ad görünür.
  assert.match(dashboard, /button:automationButtonLabel\(automationTriggerDevice\(trigger\),trigger\.action\),/);
  assert.match(dashboard, /const automationButtonLabel=\(device,action\)=>\{[\s\S]*?if\(!found\)return automationActionLabel\(action\);/);
  // Düğmelerde eleme kanonik `action` üzerinden; aynı ada sahip iki düğme birbirini yutmaz.
  assert.match(dashboard, /const key=kind==="button"\?row\.token:row\.label;/);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

interface PickDevice {
  id: string;
  name: string;
  sourceName: string;
  lastAction?: { action: string } | null;
  controls?: Array<{ id: string; kind: string; name?: string; category?: string }>;
  buttons?: Array<{ name?: string; actions?: unknown[] }>;
  actionTypes?: string[];
  features?: string[];
  state?: Record<string, unknown>;
  category?: string;
  kind?: string;
}

interface PickGroup {
  devices: PickDevice[];
  proven: boolean;
  extra?: boolean;
}

interface PickApi {
  deviceSeenPress: (device: PickDevice) => boolean;
  automationPickGroups: (devices: PickDevice[], kind: string) => PickGroup[];
}

/** Kanıt ölçütünü ve kümelemeyi sayfadan çıkarıp çalıştırır — sıralama metinle değil koşarak kanıtlanır. */
function pickGrouping(dashboard: string): (events: Array<{ sourceName: string; property: string }>) => PickApi {
  const scripts = dashboardScripts(dashboard);
  const seen = /const deviceSeenPress=device=>[\s\S]*?item\.property==="action"\);/.exec(scripts);
  const groups = /const automationPickGroups=\(devices,kind\)=>[\s\S]*?:\[\{devices,proven:true\}\];/.exec(scripts);
  assert.ok(seen, "kanıt ölçütü bulunamadı");
  assert.ok(groups, "kümeleme kaynağı bulunamadı");
  const build = new Function(
    "state",
    `${seen[0]}\n${groups[0]}\nreturn {deviceSeenPress,automationPickGroups};`
  );
  return (events) => build({ events }) as PickApi;
}

interface PickerApi {
  automationDeviceTabs: (device: PickDevice) => string[];
  automationTabMatches: (device: PickDevice, tab: string) => boolean;
  automationSearchMatches: (device: PickDevice, query: string) => boolean;
}

/** Sekme türetmeyi ve aramayı sayfadan çıkarıp çalıştırır — davranış metinle değil koşarak kanıtlanır. */
function pickerApi(
  dashboard: string,
  groups: Array<{ id: string; name: string; items: Array<{ deviceId: string }> }> = []
): PickerApi {
  const scripts = dashboardScripts(dashboard);
  const sensors = /const automationSensorEvents=\{[\s\S]*?\n {2}\};/.exec(scripts);
  const order = /const automationTabOrder=\[[^\n]*\];/.exec(scripts);
  const tabs = /const automationDeviceTabs=device=>\{[\s\S]*?\n {2}\};/.exec(scripts);
  const matches = /const automationTabMatches=[^\n]*;/.exec(scripts);
  const rooms = /const automationDeviceRooms=device=>[\s\S]*?\.map\(group=>group\.name\);/.exec(scripts);
  const search = /const automationSearchMatches=\(device,query\)=>\{[\s\S]*?\n {2}\};/.exec(scripts);
  assert.ok(sensors, "sensör olay tablosu bulunamadı");
  assert.ok(order && tabs && matches, "sekme türetme kaynağı bulunamadı");
  assert.ok(rooms && search, "arama kaynağı bulunamadı");
  const build = new Function(
    "state",
    "deviceKind",
    "deviceButtonName",
    `${sensors[0]}\n${order[0]}\n${tabs[0]}\n${matches[0]}\n${rooms[0]}\n${search[0]}\nreturn {automationDeviceTabs,automationTabMatches,automationSearchMatches};`
  );
  return build(
    { language: "tr", groups },
    (device: PickDevice) => device.kind ?? "",
    (button: { name?: string }) => button.name ?? ""
  ) as PickerApi;
}

test("düğme tetikleyicisi cihazın gerçekten basış yayıp yaymadığına dayanır", async () => {
  const dashboard = await readDashboardBundle();

  // Cihaz tanımında `action` görünmesi kanıt değil; kanıt cihazın kendi yaydığı basış.
  assert.match(
    dashboard,
    /const deviceSeenPress=device=>Boolean\(device\?\.lastAction\)\s*\|\|\(state\.events\|\|\[\]\)\.some\(item=>item\.sourceName===device\?\.sourceName&&item\.property==="action"\)/
  );
  // Türetici sunucuda kalıyor: eleme yalnız sunum katmanında, `buttons` verisine dokunulmuyor.
  assert.match(dashboard, /const deviceButtonsHtml=device=>\{\s*const buttons=device\.buttons\|\|\[\];/);

  // Gizleme değil uyarı + ikincil konum: henüz basılmamış gerçek bir kumanda listeden kaybolmasın.
  assert.match(dashboard, /const automationPickGroups=\(devices,kind\)=>kind==="button"/);
  assert.match(
    dashboard,
    /\{devices:devices\.filter\(deviceSeenPress\),proven:true,head:"automationButtonProvenGroup"\},\s*\{devices:devices\.filter\(device=>!deviceSeenPress\(device\)\),proven:false,head:"automationButtonUnprovenGroup"\}/
  );
  assert.match(dashboard, /const head=labelled\?`<p class="automation-pick-head">\$\{esc\(t\(group\.head\)\)\}<\/p>`:"";/);
  assert.match(dashboard, /const note=group\.proven\?deviceKind\(device\):t\("automationButtonUnproven"\);/);
  assert.match(dashboard, /automationButtonUnproven:"bu cihaz henüz düğme sinyali göndermedi"/);
  assert.match(dashboard, /automationButtonUnproven:"this device has not sent a button signal yet"/);
  assert.match(dashboard, /automationButtonProvenGroup:"Basıldığı görülen cihazlar"/);
  assert.match(dashboard, /automationButtonProvenGroup:"Devices seen sending a press"/);
  assert.match(dashboard, /automationButtonUnprovenGroup:"Henüz basıldığı görülmeyen cihazlar"/);
  assert.match(dashboard, /automationButtonUnprovenGroup:"Devices not seen sending a press yet"/);
  // Başlık yalnız iki küme de doluyken çıkar.
  assert.match(dashboard, /const labelled=groups\.length>1;/);
  assert.match(dashboard, /\.automation-pick\.unproven\{border-style:dashed\}/);

  // Kanıtsız cihaz seçilebilir kalır — devre dışı bırakılmıyor, listeden atılmıyor.
  assert.doesNotMatch(dashboard, /data-automation-trigger-device="\$\{esc\(device\.id\)\}"[^>]*\sdisabled/);
  assert.match(dashboard, /const warning=unproven\?`<p class="automation-warning">\$\{esc\(t\("automationButtonUnprovenWarning"\)\)\}<\/p>`:"";/);
  assert.match(dashboard, /automationButtonUnprovenWarning:"Bu cihaz düğme sinyali göndermiyor olabilir; kural çalışmayabilir\./);
  assert.match(dashboard, /automationButtonUnprovenWarning:"This device may not send button signals, so the rule may never run\./);
  assert.match(dashboard, /\.automation-warning\{[^}]*border:1px solid var\(--sun\)/);
  // Seçtiğinde uyarı bir kez daha yüzeye çıkar.
  assert.match(dashboard, /if\(automationButtonUnproven\(wizard,device\)\)showToast\(t\("automationButtonUnprovenWarning"\),true\);/);
  // Uyarı okunmadan adım atlanmasın: kanıtsız cihazda sessiz seçim ve otomatik ilerleme kapalı.
  assert.match(dashboard, /if\(events\.length===1&&!unproven\)automationApplyEvent\(wizard,events\[0\]\);/);
  assert.match(dashboard, /if\(!unproven&&automationTriggerReady\(wizard\)\)\{nextAutomationStep\(\);return\}/);
  // Kanıtsız cihazda blok kapanmaz: uyarı ve alternatif açık kalır, ekran o bloğa kayar.
  assert.match(dashboard, /force:automationButtonUnproven\(wizard,detail\)/);
  assert.match(dashboard, /if\(!unproven&&automationTriggerReady\(wizard\)\)\{nextAutomationStep\(\);return\}\s*automationFlashOpenBlock\(\);/);

  // Asıl değerli kısım: durum bildiren cihazda tek dokunuşla "açılınca/kapanınca" yoluna geçiş.
  assert.match(dashboard, /const alternative=unproven&&automationTriggerEvents\(device,"deviceState"\)\.length>0/);
  assert.match(dashboard, /data-automation-state-instead="\$\{esc\(device\.id\)\}"/);
  assert.match(
    dashboard,
    /\$\$\("\[data-automation-state-instead\]"\)\.forEach\(button=>button\.onclick=\(\)=>automationUseStateInstead\(button\.dataset\.automationStateInstead\)\)/
  );
  assert.match(
    dashboard,
    /function automationUseStateInstead\(deviceId\)\{[\s\S]*?wizard\.triggerKind="deviceState";\s*wizard\.triggerDeviceId=deviceId;/
  );
  // Geçişten sonra sihirbazın kendi deseni sürer: tek kanal sessizce seçilir, hazırsa ilerler.
  assert.match(
    dashboard,
    /function automationUseStateInstead\(deviceId\)\{[\s\S]*?automationApplySingleChannel\(wizard,device\);[\s\S]*?if\(automationTriggerReady\(wizard\)\)\{nextAutomationStep\(\);return\}/
  );
  assert.match(dashboard, /automationButtonStateAlternative:"Bu cihaz bir anahtar veya priz gibi açılıp kapanıyor\./);
  assert.match(dashboard, /automationButtonStateAlternative:"This device turns on and off like a switch or plug\./);
  assert.match(dashboard, /automationButtonStateAlternativeAction:"Açılınca\/kapanınca ile kur"/);
  assert.match(dashboard, /automationButtonStateAlternativeAction:"Use turns on or off"/);

  // Cihaz detayı: prizden beslenen duvar anahtarı hiç basış yaymadıysa "Düğmeler" bölümü çıkmaz.
  assert.match(dashboard, /if\(device\.type==="Router"&&!deviceSeenPress\(device\)\)return"";/);

  // §3.1 — yeni metinlerde geliştirici sözlüğü yok.
  assert.doesNotMatch(dashboard, /automationButton(?:Unproven|Proven|StateAlternative)[A-Za-z]*:"[^"]*(?:router|payload|cluster|endpoint|IEEE)/i);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("basış yaymamış cihaz listede geride kalır, yayan cihaz uyarısız öne geçer", async () => {
  const dashboard = await readDashboardBundle();
  const remote: PickDevice = { id: "0xremote", name: "Balcony remote switch", sourceName: "balcony", lastAction: { action: "1_single" } };
  const dimmer: PickDevice = { id: "0xdimmer", name: "Garden 3 Way Switch", sourceName: "garden", lastAction: null };
  const fresh: PickDevice = { id: "0xfresh", name: "New remote", sourceName: "fresh" };

  const withoutEvents = pickGrouping(dashboard)([]);
  assert.equal(withoutEvents.deviceSeenPress(remote), true);
  assert.equal(withoutEvents.deviceSeenPress(dimmer), false);
  assert.equal(withoutEvents.deviceSeenPress(fresh), false);

  const groups = withoutEvents.automationPickGroups([remote, dimmer, fresh], "button");
  // Kanıtlı cihaz önce ve uyarısız; kanıtsızlar gizlenmez, ikinci kümede kalır.
  assert.deepEqual(
    groups.map((group) => [group.proven, group.devices.map((device) => device.id)]),
    [
      [true, ["0xremote"]],
      [false, ["0xdimmer", "0xfresh"]]
    ]
  );

  // Olay akışında bir basış görülmesi de kanıt sayılır: cihaz hemen öne geçer.
  const afterPress = pickGrouping(dashboard)([{ sourceName: "fresh", property: "action" }]);
  assert.equal(afterPress.deviceSeenPress(fresh), true);
  assert.equal(afterPress.deviceSeenPress(dimmer), false);
  // Durum bildirimi (`state`) kanıt değildir; yalnız `action` sayılır.
  assert.equal(pickGrouping(dashboard)([{ sourceName: "garden", property: "state" }]).deviceSeenPress(dimmer), false);

  // Sensör yolunda ayrım yok: liste tek küme kalır.
  const sensors = withoutEvents.automationPickGroups([remote, dimmer], "sensor");
  assert.deepEqual(
    sensors.map((group) => [group.proven, group.devices.length]),
    [[true, 2]]
  );
});

test("anahtar yolunda sınıflandırma sunucudan gelir, eve özel kural kalmaz", async () => {
  const dashboard = await readDashboardBundle();
  // Sunucu her cihaza `category` verir: standart `definition.exposes[].type` tahmini ya da
  // kullanıcının seçtiği rol. Sihirbaz başka hiçbir ölçüte bakmaz.
  const shape = (id: string, name: string, category: string): PickDevice => ({
    id,
    name,
    sourceName: name,
    category,
    controls: [{ id: "main", kind: "switch" }]
  });
  // Farklı satıcılardan iki lamba: biri Tuya LED sürücüsü, biri IKEA ampulü — ikisi de `light`.
  const balcony = shape("0xa4c138ea872c2c8e", "Balkon lambası", "light");
  const ikeaBulb = shape("0x000d6ffffe111111", "Bedroom bulb", "light");
  // Farklı satıcılardan iki anahtar: çok kanallı duvar anahtarı ve tek kanallı röle.
  const garden = shape("0xf84477fffeab048e", "Garden 3 Way Switch", "switch");
  const relay = shape("0xa4c138b950918de3", "Corridor relay", "switch");
  // Tanımı bilinmeyen cihaz belirsiz kalır: elenmez, üst kümede seçilebilir durur.
  const unknown = shape("0xa4c1380000000001", "Unknown module", "unknown");

  const picker = pickerApi(dashboard);
  assert.deepEqual(picker.automationDeviceTabs(balcony), ["light"]);
  assert.deepEqual(picker.automationDeviceTabs(ikeaBulb), ["light"]);
  assert.deepEqual(picker.automationDeviceTabs(garden), ["switch"]);
  assert.deepEqual(picker.automationDeviceTabs(relay), ["switch"]);
  // Tanımı bilinmeyen cihaz elenmez; sınıfsız kaldığı için "Diğer" sekmesinde durur.
  assert.deepEqual(picker.automationDeviceTabs(unknown), ["other"]);
  // Kullanıcının rolü tahmini ezdiğinde sunucu `category`yi çevirir; sihirbaz o an lamba der.
  assert.deepEqual(picker.automationDeviceTabs({ ...garden, category: "light" }), ["light"]);
  // Kanal seviyesi rol de sayılır: bir kanalı lamba olan çok kanallı anahtar iki sekmede birden çıkar.
  assert.deepEqual(
    picker.automationDeviceTabs({
      ...garden,
      controls: [
        { id: "l1", kind: "switch", category: "light" },
        { id: "l2", kind: "switch", category: "switch" }
      ]
    }),
    ["switch", "light"]
  );
  // Basış yayan cihaz kumandalara, yalnız sensör özelliği bildiren cihaz sensörlere düşer.
  assert.deepEqual(
    picker.automationDeviceTabs({ id: "0xr", name: "Remote", sourceName: "r", buttons: [{ actions: [] }] }),
    ["button"]
  );
  assert.deepEqual(
    picker.automationDeviceTabs({ id: "0xd", name: "Door", sourceName: "d", features: ["contact", "battery"] }),
    ["sensor"]
  );
  // Sekme bir süzgeç değil: "Tümü" hiçbir cihazı elemez.
  for (const device of [balcony, garden, unknown]) {
    assert.equal(picker.automationTabMatches(device, "all"), true);
  }
  assert.equal(picker.automationTabMatches(balcony, "switch"), false);

  const groups = pickGrouping(dashboard)([]).automationPickGroups([garden, relay, unknown, balcony, ikeaBulb], "deviceState");
  // Anahtar yolunda artık ikinci küme yok: hiçbir cihaz katlanmıyor, hepsi tek listede.
  assert.deepEqual(
    groups.map((group) => [Boolean(group.extra), group.devices.map((device) => device.name)]),
    [[false, ["Garden 3 Way Switch", "Corridor relay", "Unknown module", "Balkon lambası", "Bedroom bulb"]]]
  );

  // Eve özel mantık geri sızmasın: model listesi ve satıcıya özgü özellik adları ölçüt olamaz.
  assert.doesNotMatch(dashboard, /automationSwitchMarkers/);
  assert.doesNotMatch(dashboard, /automationSwitchHardware/);
  assert.doesNotMatch(dashboard, /automationChannelSwitches/);
  assert.doesNotMatch(dashboard, /switch_mode_l1|adjustment_mode|indicator_mode/);

  // Katlama ve "Tüm cihazları göster" kalktı: eleme yerine sekme + arama var.
  assert.doesNotMatch(dashboard, /data-automation-show-all/);
  assert.doesNotMatch(dashboard, /showAllTriggerDevices/);
  assert.doesNotMatch(dashboard, /automationShowAllDevices/);
  assert.doesNotMatch(dashboard, /automationSwitchGroup/);
  assert.doesNotMatch(dashboard, /automationOtherDevicesGroup/);
  assert.doesNotMatch(dashboard, /automationLightLike/);
});

test("sihirbaz cihazı elemek yerine sekme ve aramayla buldurur", async () => {
  const dashboard = await readDashboardBundle();

  // Sekmeler evdeki cihazlardan türer, boş sekme çıkmaz, tek sekme kalırsa şerit hiç gösterilmez.
  assert.match(dashboard, /const tabs=automationTabOrder\.filter\(tab=>found\.has\(tab\)\);\s*if\(tabs\.length<2\)return"";/);
  assert.match(dashboard, /data-automation-tab="\$\{scope\}\|\$\{tab\}"/);
  assert.match(dashboard, /automationTabAll:"Tümü"/);
  assert.match(dashboard, /automationTabAll:"All"/);
  assert.match(dashboard, /automationTabLight:"Lambalar"/);
  assert.match(dashboard, /automationTabSwitch:"Anahtarlar ve prizler"/);
  assert.match(dashboard, /automationTabSensor:"Sensörler"/);
  assert.match(dashboard, /automationTabButton:"Kumandalar"/);
  // Dokunmatik hedefler: sekme 44 px, arama kutusu 52 px.
  assert.match(dashboard, /\.automation-tab\{min-height:44px/);
  assert.match(dashboard, /\.automation-search \.search\{width:100%;min-height:52px;font-size:16px\}/);
  // Sekmeler kırpılmasın: sığmayan sekme sağdan kesilmek yerine alt satıra sarar.
  assert.match(dashboard, /\.automation-tabs\{[^}]*flex-wrap:wrap/);
  assert.doesNotMatch(dashboard, /\.automation-tabs\{[^}]*overflow-x:auto/);

  // Arama hem tetikleyici hem hedef adımında aynı kutudan gelir ve yalnız listeyi tazeler.
  assert.match(dashboard, /data-automation-search="\$\{scope\}"/);
  assert.match(dashboard, /list\.innerHTML=automationPickListHtml\(wizard,scope\);\s*automationBindBody\(\);/);
  assert.match(dashboard, /automationSearchPlaceholder:"Cihaz veya oda arayın"/);
  assert.match(dashboard, /automationSearchPlaceholder:"Search by device or room"/);
  assert.match(dashboard, /automationPickNoMatch:"Bu aramayla eşleşen cihaz yok\."/);

  // Arama ad, oda ve kullanıcının verdiği kanal/düğme adlarında birlikte çalışır.
  const rooms = [{ id: "salon", name: "Oturma Odası", items: [{ deviceId: "0xlight" }] }];
  const picker = pickerApi(dashboard, rooms);
  const light: PickDevice = {
    id: "0xlight",
    name: "Balkon lambası",
    sourceName: "balkon",
    kind: "Lamba",
    controls: [{ id: "l1", kind: "switch", name: "Kanal 1" }],
    buttons: [{ name: "Sol düğme" }]
  };
  const other: PickDevice = { id: "0xother", name: "Koridor rölesi", sourceName: "koridor", kind: "Anahtar" };
  assert.equal(picker.automationSearchMatches(light, ""), true);
  assert.equal(picker.automationSearchMatches(light, "balkon"), true);
  assert.equal(picker.automationSearchMatches(light, "oturma"), true);
  assert.equal(picker.automationSearchMatches(light, "kanal 1"), true);
  assert.equal(picker.automationSearchMatches(light, "sol düğme"), true);
  assert.equal(picker.automationSearchMatches(light, "koridor"), false);
  assert.equal(picker.automationSearchMatches(other, "oturma"), false);

  // İki adımlı seçim: cihaz seçilince liste kapanır, yerine tek satırlık "seçildi" satırı gelir.
  // "Değiştir" cihaz listesine döner; satırın kendisi düğmedir ve aria-expanded taşır.
  assert.match(dashboard, /const automationPickHeadHtml=\(device,scope\)=>automationDoneRow\(/);
  assert.match(dashboard, /data-automation-pick-back="\$\{scope\}"/);
  assert.match(dashboard, /automationRailJoin\(device\.name,deviceKind\(device\)\)/);
  assert.match(dashboard, /automationPickParts:"\{device\} düğmeleri ve kanalları"/);
  assert.match(dashboard, /automationPickParts:"Buttons and channels of \{device\}"/);
  assert.match(dashboard, /\.automation-done-row\{width:100%;min-height:60px/);
  assert.doesNotMatch(dashboard, /automation-subhead|automation-subback/);

  // Tek alt öğeli cihazda bu adım atlanır: tetikleyicide olay tek ise ekran hiç açılmaz,
  // eşleme yolunda tek kanallı hedef doğrudan seçilip ilerlenir.
  assert.match(
    dashboard,
    /return automationTriggerChoiceCount\(wizard,device\)>1\|\|automationButtonUnproven\(wizard,device\)\?device:null;/
  );
  assert.match(
    dashboard,
    /if\(automationMappingMode\(wizard\)&&controls\.length===1\)\{chooseAutomationTarget\(`\$\{deviceId\}\|\$\{controls\[0\]\.id\}`\);return\}/
  );

  // Hedef adımının tek elemesi cihazın gerçek yeteneği; oda ya da ad tahmini yok.
  assert.match(dashboard, /targetControls\(device\)\.length>0&&device\.id!==starter/);
  assert.doesNotMatch(dashboard, /deviceInRoom\(device,wizard\.room\)/);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("cihaz rolü eşleştirmede sorulur ve cihaz kartındaki özellik listesinden değiştirilir", async () => {
  const dashboard = await readDashboardBundle();

  // Eşleştirme akışının son adımı: ad → (gerekiyorsa görsel) → "Bu cihaz ne?".
  assert.match(dashboard, /function continuePairingFlow\(id\)\{[\s\S]*?askDeviceRole\(id,true\);/);
  assert.match(dashboard, /if\(editing\?\.afterPairing\)askDeviceRole\(editing\.id,true\)/);
  // Atlanabilir: dialog kapanınca akış rol yazılmadan tamamlanır, rol Otomatik kalır.
  assert.match(dashboard, /\$\("#skipDeviceRole"\)\.onclick=\(\)=>\$\("#deviceRoleDialog"\)\.close\(\)/);
  assert.match(
    dashboard,
    /\$\("#deviceRoleDialog"\)\.onclose=\(\)=>\{[\s\S]*?if\(editing\?\.afterPairing\)finishPairingFlow\(editing\.id\)/
  );
  // Sonradan değiştirme yolu cihaz kartında, Options'ta değil: sol sütunda resmin altındaki boşlukta.
  assert.doesNotMatch(dashboard, /id="deviceRoleField"/);
  assert.doesNotMatch(dashboard, /<select id="deviceRole">/);
  assert.doesNotMatch(dashboard, /noExposedControls"\)\}<\/div>`\}\$\{deviceRoleRowsHtml\(device\)\}/);
  assert.match(
    dashboard,
    /const rolesHtml=`<div class="controls device-detail-roles">\$\{deviceRoleRowsHtml\(device\)\}<\/div>`/
  );
  // Sol sütun rol satırıyla her zaman doludur; resimsiz cihazda da blok orada durur.
  assert.match(
    dashboard,
    /const mediaHtml=`<div class="device-detail-media">\$\{photoHtml\}\$\{factsHtml\}\$\{rolesHtml\}<\/div>`/
  );
  // Satır mevcut ayar satırlarıyla aynı işaretlemeyi kullanır, alt yazısı uygulama ayarı olduğunu söyler.
  assert.match(dashboard, /<div class="control-row admin-control"><div><div class="control-name">\$\{esc\(label\)\}<\/div><div class="control-value">\$\{t\("appSetting"\)\}<\/div><\/div><select class="control-select" data-device-role-select=/);
  assert.match(dashboard, /appSetting:"App setting"/);
  assert.match(dashboard, /appSetting:"Uygulama ayarı"/);
  // Seçim anında kaydedilir; ayrı "Kaydet" adımı yok.
  assert.match(dashboard, /input\.onchange=\(\)=>changeDeviceRole\(input,input\.dataset\.deviceRoleSelect,input\.dataset\.deviceRoleChannel,input\.value\)/);
  // Kontrol edilemeyen cihazda seçim sunulmaz: satır tespit edilen sınıfı düz metin gösterir.
  assert.match(dashboard, /if\(!channels\.length\)\{[\s\S]*?deviceRoleFixed",\{kind:deviceKind\(device\)\}/);
  assert.match(dashboard, /deviceRoleFixed:"\{kind\} · automatic"/);
  assert.match(dashboard, /deviceRoleFixed:"\{kind\} · otomatik"/);
  // Rol yalnız lamba↔anahtar karışıklığında sorulur; perde, kilit, sensör otomatik kalır.
  assert.match(
    dashboard,
    /const deviceRoleAskable=device=>Boolean\(device\)&&\(device\.category==="light"\|\|device\.category==="switch"/
  );
  // UID kuralı: yazma ucu IEEE adresine, kanal seçiliyse IEEE + kanal kimliğine gider.
  assert.match(dashboard, /\/api\/devices\/\$\{encodeURIComponent\(id\)\}\/role/);
  assert.match(dashboard, /const payload=channel\?\{role,channel\}:\{role\}/);
  // Kontrol edilebilir her kanal kendi satırını alır; kanal adı kullanıcının verdiği addır.
  assert.match(dashboard, /const deviceRoleChannels=device=>\(device\?\.controls\|\|\[\]\)\.filter\(control=>control\.kind==="switch"\)/);
  assert.match(dashboard, /channels\.length>1\?t\("deviceRoleChannelLabel",\{channel:channelDisplayName\(device,control\)\}\):t\("deviceRoleLabel"\)/);
  assert.match(dashboard, /deviceRoleChannelLabel:"Show \{channel\} as"/);
  assert.match(dashboard, /deviceRoleChannelLabel:"\{channel\} şöyle görünsün"/);
  // Sekme kümelemesi ve simge kanal seviyesindeki rolü kullanır.
  assert.match(dashboard, /for\(const control of device\?\.controls\|\|\[\]\)if\(control\.kind==="switch"\)add\(control\.category\);/);
  assert.match(dashboard, /const category=\(control\?\.kind==="switch"&&control\.category\)\|\|device\.category;/);

  // Kart alt yazısı artık her cihazda "Kumanda" demiyor; sınıfı yansıtıyor.
  assert.match(dashboard, /const deviceCategoryLabels=\{light:"lightDevice",switch:"switchDevice"/);
  assert.match(dashboard, /lightDevice:"Light"/);
  assert.match(dashboard, /lightDevice:"Lamba"/);
  assert.match(dashboard, /switchDevice:"Switch"/);
  assert.match(dashboard, /switchDevice:"Anahtar"/);
  assert.match(dashboard, /deviceRoleTitle:"What is this device\?"/);
  assert.match(dashboard, /deviceRoleTitle:"Bu cihaz ne\?"/);
  assert.match(dashboard, /deviceRoleSwitch:"Switch or plug"/);
  assert.match(dashboard, /deviceRoleSwitch:"Anahtar veya priz"/);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

interface PressEntry {
  action: string;
  press: string;
}

/** Basış eleme yardımcısını sayfadan çıkarıp gerçekten çalıştırır — davranış metinle değil koşarak kanıtlanır. */
function pressFilter(dashboard: string): (entries: PressEntry[], keep?: string | null) => PressEntry[] {
  const source = /const hiddenPressKinds=new Set\(\[[\s\S]*?const visiblePresses=\(entries,keep\)=>\{[\s\S]*?\n {2}\};/
    .exec(dashboardScripts(dashboard));
  assert.ok(source, "basış eleme kaynağı bulunamadı");
  return new Function(`${source[0]}\nreturn visiblePresses;`)() as (entries: PressEntry[], keep?: string | null) => PressEntry[];
}

test("kurulum sırasında yalnız kısa basış ve basılı tutma sunulur", async () => {
  const dashboard = await readDashboardBundle();

  // Eleme yalnız sunum katmanında: tek bir yardımcı hem cihaz detayını hem sihirbazı besliyor.
  assert.match(dashboard, /const hiddenPressKinds=new Set\(\["double","triple","quadruple","quintuple","many"\]\)/);
  assert.match(dashboard, /const kept=list\.filter\(entry=>!hiddenPressKinds\.has\(entry\.press\)\|\|\(keep!=null&&keep===entry\.action\)\);/);
  // Boş liste yasak: elemeden sonra hiçbir şey kalmazsa cihazın bildirdiği ne varsa gösterilir.
  assert.match(dashboard, /return kept\.length\?kept:list;/);

  // Cihaz detayındaki düğme listesi ve sihirbaz aynı elemeyi kullanır.
  assert.match(dashboard, /const deviceButtonPressList=button=>visiblePresses\(button\?\.actions\)/);
  assert.match(dashboard, /for\(const entry of visiblePresses\(button\.actions,keep\)\)\{/);
  // Sunucu düğme türetmediğinde çalışan yedek yol da eleniyor.
  assert.match(dashboard, /\.filter\(Boolean\)\.map\(action=>\(\{action,press:rawActionPress\(action\)\}\)\);/);
  assert.match(dashboard, /for\(const entry of visiblePresses\(raw,keep\)\)\{/);

  // Kayıtlı kural düzenlenirken seçili basış listede kalır.
  assert.match(dashboard, /automationTriggerEvents\(device,wizard\.triggerKind,wizard\.triggerAction\)\.length>0/);
  assert.match(dashboard, /const events=automationTriggerEvents\(device,wizard\.triggerKind,wizard\.triggerAction\);/);
  assert.match(dashboard, /automationTriggerEvents\(device,wizard\?\.triggerKind,wizard\?\.triggerAction\)\.find\(item=>item\.token===token\)/);
  // Yeni cihaz seçiminde `keep` yok: sıfırdan kurulan kural art arda basış önermez.
  assert.match(dashboard, /const events=automationTriggerEvents\(device,wizard\.triggerKind\);\s*const unproven=automationButtonUnproven\(wizard,device\);\s*\/\/ Tek anlamlı seçenek/);

  // Kayıtlı kuralın özeti elenmemiş ham listeden okunur; `1_double` kuralı doğru cümleyi verir.
  assert.match(dashboard, /const entry=button\.actions\.find\(item=>item\.action===action\);/);

  const visiblePresses = pressFilter(dashboard);
  const remote: PressEntry[] = [
    { action: "1_single", press: "single" },
    { action: "1_double", press: "double" },
    { action: "1_hold", press: "hold" }
  ];
  assert.deepEqual(visiblePresses(remote).map((entry) => entry.press), ["single", "hold"]);
  // Kayıtlı seçim korunur.
  assert.deepEqual(visiblePresses(remote, "1_double").map((entry) => entry.action), ["1_single", "1_double", "1_hold"]);
  // Cihaz yalnız art arda basış bildiriyorsa liste boş kalmaz.
  const onlyDouble: PressEntry[] = [{ action: "2_double", press: "double" }];
  assert.deepEqual(visiblePresses(onlyDouble).map((entry) => entry.action), ["2_double"]);
  // `press`/`release` gibi kalıplar dokunulmadan geçer.
  const releaseOnly: PressEntry[] = [
    { action: "press", press: "press" },
    { action: "release", press: "release" },
    { action: "double", press: "double" }
  ];
  assert.deepEqual(visiblePresses(releaseOnly).map((entry) => entry.press), ["press", "release"]);
  assert.deepEqual(visiblePresses(undefined as unknown as PressEntry[]), []);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("otomasyon kartı tek dokunuşla düzenlemeyi açar, çalıştır ve sil görünür düğmede durur", async () => {
  const dashboard = await readDashboardBundle();

  // Kart gövdesine tek dokunuş doğrudan düzenlemeyi açar — birincil yol artık uzun basma değil.
  assert.match(dashboard, /card\.onclick=event=>\{\s*if\(event\.target\.closest\?\.\("\[data-automation-toggle\],\[data-automation-menu\]"\)\)return;\s*openAutomationWizard\(card\.dataset\.automationCard\);\s*\};/);
  // Uzun basma kaldırılmadı: aynı seçenek diyaloğunu açmayı sürdürüyor.
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openAutomationActions\(card\.dataset\.automationCard\),\{ignore:target=>Boolean\(target\.closest\?\.\("\[data-automation-toggle\],\[data-automation-menu\]"\)\)\}\)/);

  // Anahtar ve menü dokunuşu karta sızmaz: yanlışlıkla düzenleme açılmaz.
  assert.match(dashboard, /\$\$\("\[data-automation-toggle\]"\)\.forEach\(button=>button\.onclick=event=>\{event\.stopPropagation\(\);toggleAutomationEnabled\(button\.dataset\.automationToggle\)\}\)/);
  assert.match(dashboard, /\$\$\("\[data-automation-menu\]"\)\.forEach\(button=>button\.onclick=event=>\{event\.stopPropagation\(\);openAutomationActions\(button\.dataset\.automationMenu\)\}\)/);

  // Görünür menü düğmesi kartın sağında; anahtarla aynı şeritte ama ayrı dokunma alanında.
  assert.match(dashboard, /<div class="automation-card-actions"><button class="automation-card-menu" type="button" data-automation-menu="\$\{esc\(automation\.id\)\}"/);
  assert.match(dashboard, /aria-label="\$\{esc\(t\("automationCardMenu"\)\)\}" title="\$\{esc\(t\("automationCardMenu"\)\)\}"><span aria-hidden="true">⋯<\/span><\/button>/);
  assert.match(dashboard, /\.automation-card-actions\{display:flex;align-items:center;gap:12px\}/);
  assert.match(dashboard, /\.automation-card-menu\{width:48px;height:48px/);

  // Diyalog yeni değil: mevcut cihaz eylem deseni kullanılıyor.
  assert.match(dashboard, /<dialog id="automationActionDialog"><div class="modal device-action-modal">/);
  assert.match(dashboard, /id="runAutomationNow"[\s\S]*?id="editAutomation"[\s\S]*?id="deleteAutomation"/);

  assert.match(dashboard, /automationCardMenu:"Otomasyon seçenekleri"/);
  assert.match(dashboard, /automationCardMenu:"Automation options"/);
  // Arayüz dili: teknik kelime yok.
  assert.doesNotMatch(dashboard, /automationCardMenu:"[^"]*(?:menü|menu|aksiyon|action)/i);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("sihirbazda tek birincil eylem var ve pasifken nedenini söylüyor", async () => {
  const dashboard = await readDashboardBundle();

  // Üstteki kopya İleri/Kaydet kaldırıldı: hangi düğmenin asıl eylem olduğu belirsiz kalmıyor.
  assert.doesNotMatch(dashboard, /automationTopNext/);
  assert.doesNotMatch(dashboard, /automation-top-next/);
  assert.doesNotMatch(dashboard, /automation-progress/);
  assert.equal(dashboard.match(/id="automation(?:Top)?Next"/g)?.length, 1);
  // Tek birincil eylem altta, sabit yükseklikli kutunun kaymayan şeridinde kalıyor.
  assert.match(dashboard, /\.automation-actions\{flex:none;/);
  assert.match(dashboard, /const automationNextButtons=\(\)=>\[\$\("#automationNext"\)\]\.filter\(Boolean\)/);
  assert.match(dashboard, /const label=t\(wizard\.step===3\?"save":"next"\);/);
  // Yol seçimi adımında ilerlenecek bir şey yok: düğme gizlenir.
  assert.match(dashboard, /for\(const next of automationNextButtons\(\)\)\{\s*next\.hidden=paths;\s*next\.textContent=label;\s*next\.disabled=!ready;\s*\}/);
  assert.match(dashboard, /\$\("#automationNext"\)\.onclick=nextAutomationStep;/);
  // Kayıt sırasında kilitlenir, hata olursa açılır.
  assert.match(dashboard, /const buttons=automationNextButtons\(\);\s*buttons\.forEach\(button=>\{button\.disabled=true\}\);/);
  assert.match(dashboard, /buttons\.forEach\(button=>\{button\.disabled=false\}\);showToast\(automationErrorText\(error\),true\)/);

  // Sessiz pasif düğme yok: eksik olan şey düğmenin yanında yazıyor.
  assert.match(dashboard, /<p id="automationNextHint" class="automation-next-hint" hidden><\/p>/);
  assert.match(dashboard, /const reason=paths\?"":automationBlockedReason\(wizard\);\s*hint\.textContent=reason\?t\(reason\):"";\s*hint\.hidden=!reason;/);
  assert.match(dashboard, /automationNeedTrigger:"Kuralı neyin başlatacağını seçin\."/);
  assert.match(dashboard, /automationNeedTrigger:"Pick what should start the rule\."/);
  assert.match(dashboard, /automationNeedDevice:"Önce cihazı seçin\."/);
  assert.match(dashboard, /automationNeedEvent:"Pick which button or event starts it\."/);
  assert.match(dashboard, /automationNeedTarget:"Çalışacak cihazı seçin\."/);
  assert.match(dashboard, /automationNeedAction:"Pick what it should do\."/);
  assert.match(dashboard, /automationNeedMap:"En az bir iş seçin\."/);

  // Faz 1'in Geri/İleri deseni bozulmadı: Geri düğmesi yerinde.
  assert.match(dashboard, /<button id="automationBack" class="secondary" type="button" data-i18n="back">Back<\/button>/);
  assert.match(dashboard, /\$\("#automationBack"\)\.onclick=stepBackAutomation;/);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("Matter modalı eşleştirmenin bittiğini kendisi fark eder", async () => {
  const dashboard = await readDashboardBundle();

  // Modal açıkken sunucu yoklanır; referans olarak açılış anındaki fabric listesi saklanır.
  assert.match(dashboard, /\$\("#matterDialog"\)\.showModal\(\);startMatterWatch\(\)/);
  assert.match(dashboard, /const matterWatchIntervalMs=4000/);
  assert.match(dashboard, /matterWatchBaseline=\{count:fabrics\.length,names:new Set\(fabrics\.map\(item=>item\.name\)\),advertised:state\.matter\?\.advertising===true\}/);
  assert.match(dashboard, /matterWatchTimer=setInterval\(pollMatterWatch,matterWatchIntervalMs\)/);

  // Yoklama her çıkışta temizlenir: modal kapanınca, sayfa değişince ve yeniden başlarken.
  assert.match(dashboard, /function stopMatterWatch\(\)\{\s*if\(matterWatchTimer!==null\)\{clearInterval\(matterWatchTimer\);matterWatchTimer=null\}/);
  assert.match(dashboard, /\$\("#matterDialog"\)\.addEventListener\("close",stopMatterWatch\)/);
  assert.match(dashboard, /if\(viewName!=="connections"\)stopMatterWatch\(\)/);
  assert.match(dashboard, /function startMatterWatch\(\)\{\s*stopMatterWatch\(\)/);
  assert.match(dashboard, /if\(!matterWatchBaseline\|\|!\$\("#matterDialog"\)\.open\)\{stopMatterWatch\(\);return\}/);

  // Fabric sayısı artınca modal kapanır, liste tazelenir ve başarı toast'u çıkar.
  assert.match(dashboard, /if\(fabrics\.length>baseline\.count\)\{[\s\S]*?await closeMatterDialog\(\);\s*renderFabrics\(\);\s*showToast\(added\?\.name\?t\("matterPairedNamed",\{name:added\.name\}\):t\("matterPaired"\)\)/);
  // Toast metni tam şablon anahtarıdır; parça birleştirme yok.
  assert.match(dashboard, /matterPairedNamed:"\{name\} added\."/);
  assert.match(dashboard, /matterPairedNamed:"\{name\} eklendi\."/);
  assert.match(dashboard, /matterPaired:"Matter system added\."/);
  assert.match(dashboard, /matterPaired:"Matter sistemi eklendi\."/);
  assert.doesNotMatch(dashboard, /t\("matterPaired"\)\+/);

  // Eşleştirme penceresi kapanırsa (advertising false) süre doldu uyarısı verilir.
  assert.match(dashboard, /if\(status\.advertising===true\)\{baseline\.advertised=true;return\}/);
  assert.match(dashboard, /showToast\(t\("matterPairingExpired"\),true\)/);
  assert.match(dashboard, /matterPairingExpired:"The pairing window timed out, please try again\."/);
  assert.match(dashboard, /matterPairingExpired:"Eşleştirme süresi doldu, tekrar deneyin\."/);

  // Modal içinde bekleme göstergesi ve çoklu ekosistem notu.
  assert.match(dashboard, /<div id="matterWaiting" class="matter-waiting"><span class="matter-waiting-dot" aria-hidden="true"><\/span><span data-i18n="matterPairingWaiting">/);
  assert.match(dashboard, /matterPairingWaiting:"Waiting for pairing…"/);
  assert.match(dashboard, /matterPairingWaiting:"Eşleştirme bekleniyor…"/);
  assert.match(dashboard, /@keyframes matter-waiting-pulse/);
  assert.match(dashboard, /<p class="matter-hint" data-i18n="matterEcosystemHint">/);
  assert.match(dashboard, /matterEcosystemHint:"Each ecosystem needs its own code/);
  assert.match(dashboard, /matterEcosystemHint:"Her ekosistem için ayrı kod gerekir/);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("Ayarlar'da yedek al ve geri yükle kartı onay adımı atlanmadan çalışır", async () => {
  const dashboard = await readDashboardBundle();
  const settingsStart = dashboard.indexOf('<section id="settings"');
  const settings = dashboard.slice(
    settingsStart,
    dashboard.indexOf("</section>\n  </main>", settingsStart) + 10
  );

  // Kart yalnız yöneticiye görünür ve ev diliyle yazılır.
  assert.match(settings, /<article id="homeBackupCard" class="setting-card backup-card home-backup-card" data-admin-only>/);
  assert.match(settings, /<h2 data-i18n="homeBackupTitle">/);
  assert.match(settings, /id="downloadHomeBackup"[\s\S]*data-i18n="homeBackupExport"/);
  assert.match(settings, /id="chooseHomeRestore"[\s\S]*data-i18n="homeBackupImport"/);
  assert.match(settings, /<input id="homeRestoreFile" type="file" accept="application\/json,\.json" hidden>/);
  assert.match(dashboard, /homeBackupTitle:"Home backup"/);
  assert.match(dashboard, /homeBackupTitle:"Yedekleme"/);
  assert.match(dashboard, /homeBackupExport:"Save a backup"/);
  assert.match(dashboard, /homeBackupExport:"Yedek al"/);
  assert.match(dashboard, /homeBackupImport:"Restore a backup"/);
  assert.match(dashboard, /homeBackupImport:"Yedeği geri yükle"/);

  // Dışa aktarım tarih damgalı dosya adıyla iner, yeni bağımlılık yok.
  assert.match(dashboard, /const data=await api\("\/api\/backup"\)/);
  assert.match(dashboard, /link\.download=`villa-yedek-\$\{stamp\}\.json`/);
  assert.match(dashboard, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);

  // Dosya seçilir seçilmez önizleme çağrılır; hiçbir şey uygulanmaz.
  assert.match(dashboard, /api\("\/api\/backup\/preview",\{method:"POST",body:JSON\.stringify\(\{backup:pendingHomeBackup,mode:selectedHomeBackupMode\(\)\}\)\}/);
  assert.match(dashboard, /\$\("#homeBackupDialog"\)\.showModal\(\);\s*await previewHomeBackup\(\)/);

  // Onay adımı atlanamaz: geri yükle düğmesi özet gelene kadar kapalı kalır.
  assert.match(dashboard, /<button id="confirmHomeRestore" class="primary" type="button" data-i18n="homeRestoreApply" disabled>/);
  assert.match(dashboard, /button\.disabled=true;\s*\$\("#homeBackupSummary"\)\.textContent=t\("homeBackupChecking"\)/);
  assert.match(dashboard, /renderHomeBackupSummary\(data\.summary\);\s*button\.disabled=false/);
  assert.match(dashboard, /catch\(error\)\{\$\("#homeBackupSummary"\)\.textContent=error\.message\}/);
  assert.match(dashboard, /\$\("#confirmHomeRestore"\)\.onclick=applyHomeRestore/);
  assert.match(dashboard, /async function applyHomeRestore\(\)\{\s*if\(!pendingHomeBackup\)return/);

  // Üzerine yaz / yanına ekle seçimi ve yumuşak vurgu.
  assert.match(dashboard, /<input type="radio" name="homeBackupMode" value="merge" checked>/);
  assert.match(dashboard, /class="home-backup-mode replace-mode"><input type="radio" name="homeBackupMode" value="replace">/);
  assert.match(dashboard, /\.home-backup-mode\.replace-mode\{border-color:#d9a441;background:rgba\(217,164,65,\.11\)\}/);
  assert.doesNotMatch(dashboard, /home-backup-mode replace-mode danger/);
  assert.match(dashboard, /\$\$\("input\[name=homeBackupMode\]"\)\.forEach\(radio=>\{radio\.onchange=previewHomeBackup\}\)/);
  assert.match(dashboard, /homeRestoreMergeTitle:"Add alongside"/);
  assert.match(dashboard, /homeRestoreMergeTitle:"Yanına ekle"/);
  assert.match(dashboard, /homeRestoreReplaceTitle:"Replace everything"/);
  assert.match(dashboard, /homeRestoreReplaceTitle:"Üzerine yaz"/);

  // Artık var olmayan cihazlar özet içinde kullanıcıya söylenir.
  assert.match(dashboard, /homeBackupSkipped:"\{count\} entries belong to devices that are no longer here/);
  assert.match(dashboard, /homeBackupSkipped:"\{count\} kayıt artık evde olmayan cihazlara ait/);

  // Başarıdan sonra ekran tazelenir.
  assert.match(dashboard, /api\("\/api\/backup\/restore",\{method:"POST",body:JSON\.stringify\(\{backup:pendingHomeBackup,mode:selectedHomeBackupMode\(\)\}\)\}/);
  assert.match(dashboard, /await Promise\.allSettled\(\[refresh\(\),loadFavorites\(\),loadHomeGroups\(\),loadAutomations\(\)\]\);\s*render\(\)/);

  assert.doesNotThrow(() => new Function(dashboardScripts(dashboard)));
});

test("tek kanallı cihazda kanal kalemi çıkmaz, çok kanallıda her kanal ayrı adlandırılır", async () => {
  const dashboard = await readDashboardBundle();
  const source = dashboardScripts(dashboard);
  const start = source.indexOf("const renameGlyph=");
  const end = source.indexOf("const controlHtml=");
  assert.ok(start > 0 && end > start);
  const helpers = new Function(
    "t",
    "esc",
    `${source.slice(start, end)}return{isNamedChannel,deviceHasChannelNames,channelDisplayName,renameControlButton};`
  )((key: string) => key, (value: unknown) => String(value)) as {
    isNamedChannel: (control: { id: string; kind: string }) => boolean;
    deviceHasChannelNames: (device: { controls: Array<{ id: string; kind: string }> }) => boolean;
    channelDisplayName: (device: unknown, control: unknown) => string;
    renameControlButton: (device: unknown, control: unknown) => string;
  };

  // Tek kanallı cihaz: kanal kalemi yok, kanalın adı cihazın adıdır.
  const single = { id: "0xlamba", name: "Salon lambası", controls: [{ id: "main", kind: "switch", name: "Salon lambası" }] };
  assert.equal(helpers.deviceHasChannelNames(single), false);
  assert.equal(helpers.renameControlButton(single, single.controls[0]), "");
  assert.equal(helpers.channelDisplayName(single, single.controls[0]), "Salon lambası");

  // Eski veri: tek kanallı cihazda kalmış kanal takma adı gösterimde cihaz adının önüne geçmez.
  const legacy = { id: "0xpriz", name: "Mutfak prizi", controls: [{ id: "main", kind: "switch", name: "Eskiden yazılmış kanal adı" }] };
  assert.equal(helpers.renameControlButton(legacy, legacy.controls[0]), "");
  assert.equal(helpers.channelDisplayName(legacy, legacy.controls[0]), "Mutfak prizi");

  // Çok kanallı cihaz: ana cihaz adı ayrı, her kanalın adı ayrı.
  const multi = {
    id: "0xduvar",
    name: "Duvar anahtarı",
    controls: [
      { id: "l1", kind: "switch", name: "Sol lamba" },
      { id: "l2", kind: "switch", name: "Sağ lamba" }
    ]
  };
  assert.equal(helpers.deviceHasChannelNames(multi), true);
  assert.equal(helpers.channelDisplayName(multi, multi.controls[0]), "Sol lamba");
  assert.equal(helpers.channelDisplayName(multi, multi.controls[1]), "Sağ lamba");
  assert.match(helpers.renameControlButton(multi, multi.controls[0]), /data-rename-channel="0xduvar" data-channel="l1"/);
  assert.match(helpers.renameControlButton(multi, multi.controls[1]), /data-channel="l2"/);

  // Perde, kilit ve cihazın kendi ikili ayarı kanal değildir: adları kendilerinindir, kalem çıkmaz.
  for (const control of [
    { id: "cover:state", kind: "cover", name: "Perde" },
    { id: "lock:state", kind: "lock", name: "Kilit" },
    { id: "switch:child_lock", kind: "switch", name: "Çocuk kilidi" }
  ]) {
    const device = { id: "0xkarma", name: "Karma cihaz", controls: [...multi.controls, control] };
    assert.equal(helpers.isNamedChannel(control), false);
    assert.equal(helpers.renameControlButton(device, control), "");
    assert.equal(helpers.channelDisplayName(device, control), control.name);
  }
});

test("sihirbaz tek kuralda 'sonra kapat' sorar", async () => {
  const dashboard = await readDashboardBundle();

  // İki seçenek de formda: hareket bitince ve süre sonunda.
  assert.match(dashboard, /const automationAutoOffModes=\["none","idle","after"\]/);
  assert.match(dashboard, /data-automation-autooff="\$\{value\}"/);
  assert.match(dashboard, /automationAutoOffIdle:"Hareket bitince"/);
  assert.match(dashboard, /automationAutoOffIdle:"When motion stops"/);
  assert.match(dashboard, /automationAutoOffAfter:"Süre sonunda"/);
  assert.match(dashboard, /automationAutoOffAfter:"After a set time"/);

  // "Hareket bitince" ölçütü tanım verisinden gelir; sensör modeli listesi yok.
  assert.match(
    dashboard,
    /automationTriggerEvents\(device,"sensor"\)\s*\.some\(row=>row\.property===wizard\.triggerProperty&&row\.equals!==wizard\.triggerEquals\)/
  );
  assert.match(dashboard, /\$\{automationAutoOffIdleAvailable\(wizard\)\?choice\("idle","automationAutoOffIdle"\):""\}/);

  // Geri alma yalnız "Aç" eyleminde anlamlıdır.
  assert.match(dashboard, /return Boolean\(control\)&&automationActionMode\(wizard\.action\)==="on"/);

  // Kanonik kayıt: alan ilk eylemin üstüne yazılır, ikinci bir kural kurulmaz.
  assert.match(dashboard, /const autoOff=automationAutoOffPayload\(wizard\);\s*if\(autoOff\)actions\[0\]=\{\.\.\.actions\[0\],autoOff\}/);
  assert.match(dashboard, /return\{mode,seconds:minutes\*60,value:automationControlValue\(automationAutoOffControl\(wizard\),false\)\}/);

  // Süre girişi dokunmatikte rahat: saat seçicideki büyük +/− düğmeleri ve hazır süre çipleri.
  assert.match(dashboard, /data-automation-autooff-step="\$\{amount\}"/);
  assert.match(dashboard, /data-automation-autooff-minutes="\$\{value\}"/);
  assert.match(dashboard, /class="automation-time-step"/);

  // Özet cümleleri tam şablon anahtarıyla; TR/EN kelime sırası ayrı ayrı yazılmış.
  assert.match(dashboard, /automationAutoOffAfterLine:"\{duration\} sonra \{device\} kapanır\."/);
  assert.match(dashboard, /automationAutoOffAfterLine:"Turns \{device\} off after \{duration\}\."/);
  assert.match(dashboard, /automationAutoOffIdleLine:"Hareket bitince \{device\} kapanır\."/);
  assert.match(dashboard, /automationAutoOffIdleLine:"Turns \{device\} off when motion stops\."/);
  assert.match(dashboard, /automationAutoOffIdleWaitLine:"Hareket bittikten \{duration\} sonra \{device\} kapanır\."/);
  assert.match(dashboard, /automationAutoOffIdleWaitLine:"Turns \{device\} off \{duration\} after motion stops\."/);

  // Kart özeti de aynı cümleyi gösterir: sihirbazla tutarlı.
  assert.match(dashboard, /const autoOff=map\?"":automationAutoOffLine\(action\)/);
});

test("sonra kapat yükü hedefin kendi kapatma değerinden üretilir", async () => {
  const dashboard = await readDashboardBundle();
  const source = dashboardScripts(dashboard);
  const start = source.indexOf("const automationWeekDays=");
  const end = source.indexOf("function automationReviewHtml(");
  assert.ok(start > 0 && end > start);
  const helpers = new Function(
    "t",
    "esc",
    "state",
    "isProtectedDevice",
    `${source.slice(start, end)}`
    + "return{automationAutoOffPayload,automationAutoOffLine,automationAutoOffIdleAvailable};"
  )(
    (key: string) => key,
    (value: unknown) => String(value),
    {
      language: "tr",
      groups: [],
      devices: [
        {
          id: "0x00124b0011cc22dd",
          name: "Koridor lambası",
          controls: [{ id: "switch:state", property: "state", name: "Koridor lambası", kind: "switch", valueOn: "ON", valueOff: "OFF" }]
        },
        {
          id: "0x00124b0022ab34cd",
          name: "Koridor sensörü",
          features: ["occupancy"],
          state: { occupancy: false },
          controls: []
        },
        {
          id: "0x00124b0022ab34ce",
          name: "Duman dedektörü",
          features: ["smoke"],
          state: { smoke: false },
          controls: []
        }
      ]
    },
    () => false
  ) as {
    automationAutoOffPayload: (wizard: unknown) => { mode: string; seconds: number; value: string } | null;
    automationAutoOffLine: (action: unknown) => string;
    automationAutoOffIdleAvailable: (wizard: unknown) => boolean;
  };

  const wizard = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    triggerKind: "sensor",
    triggerDeviceId: "0x00124b0022ab34cd",
    triggerProperty: "occupancy",
    triggerEquals: true,
    action: { type: "device", deviceId: "0x00124b0011cc22dd", property: "state", controlId: "switch:state", value: "ON" },
    autoOffMode: "after",
    autoOffMinutes: 5,
    autoOffIdleMinutes: 0,
    ...overrides
  });

  // Kapatma değeri kontrolün kendi `valueOff` alanından gelir; model tahmini yok.
  assert.deepEqual(helpers.automationAutoOffPayload(wizard()), { mode: "after", seconds: 300, value: "OFF" });
  assert.deepEqual(
    helpers.automationAutoOffPayload(wizard({ autoOffMode: "idle", autoOffIdleMinutes: 2 })),
    { mode: "idle", seconds: 120, value: "OFF" }
  );
  assert.equal(helpers.automationAutoOffPayload(wizard({ autoOffMode: "none" })), null);

  // Kapatan eylemin geri alınacak yönü yok.
  const offAction = { type: "device", deviceId: "0x00124b0011cc22dd", property: "state", controlId: "switch:state", value: "OFF" };
  assert.equal(helpers.automationAutoOffPayload(wizard({ action: offAction })), null);

  // "Hareket bitince" yalnızca tetikleyici özelliğin tanımda bir karşıt değeri varsa sunulur.
  assert.equal(helpers.automationAutoOffIdleAvailable(wizard()), true);
  assert.equal(
    helpers.automationAutoOffIdleAvailable(wizard({
      triggerDeviceId: "0x00124b0022ab34ce",
      triggerProperty: "smoke"
    })),
    false
  );
  // Sunulmuyorsa kaydedilmez de: seçenek gizliyken idle yükü üretilmez.
  assert.equal(
    helpers.automationAutoOffPayload(wizard({
      triggerDeviceId: "0x00124b0022ab34ce",
      triggerProperty: "smoke",
      autoOffMode: "idle"
    })),
    null
  );

  // Zaman tetikleyicisinde yalnız süreyle kapatma kalır.
  assert.equal(helpers.automationAutoOffIdleAvailable(wizard({ triggerKind: "time" })), false);
  assert.deepEqual(
    helpers.automationAutoOffPayload(wizard({ triggerKind: "time", autoOffMinutes: 1 })),
    { mode: "after", seconds: 60, value: "OFF" }
  );

  // Cümle tam şablon anahtarıyla kuruluyor.
  const line = (autoOff: Record<string, unknown>): string =>
    helpers.automationAutoOffLine({ deviceId: "0x00124b0011cc22dd", property: "state", value: "ON", autoOff });
  assert.equal(line({ mode: "after", seconds: 300, value: "OFF" }), "automationAutoOffAfterLine");
  assert.equal(line({ mode: "idle", seconds: 0, value: "OFF" }), "automationAutoOffIdleLine");
  assert.equal(line({ mode: "idle", seconds: 120, value: "OFF" }), "automationAutoOffIdleWaitLine");
  assert.equal(helpers.automationAutoOffLine({ deviceId: "0x00124b0011cc22dd", property: "state", value: "ON" }), "");
});

// Sihirbazı gerçek olay akışıyla sürer: yeni kural yolu (düzenleme değil) baştan sona tıklanır ve
// her adımda gövdeye basılan HTML toplanır. Diyalog kutusu yerine kayıt tutan sahte düğümler var —
// canlı uygulama açılmaz.
type WizardHarness = {
  bodies: string[];
  rails: string[];
  scroll: () => number;
  panelScroll: () => number;
  scrollIntoViewCalls: () => number;
  setScroll: (value: number) => void;
  wizard: () => Record<string, unknown>;
  body: () => string;
  state: Record<string, unknown>;
  api: Record<string, (...args: unknown[]) => unknown>;
};

async function automationWizardHarness(): Promise<WizardHarness> {
  const source = dashboardScripts(await readFile(dashboardUrl, "utf8"));
  const start = source.indexOf("const automationWeekDays=");
  const end = source.indexOf("async function saveAutomationWizard(");
  assert.ok(start > 0 && end > start);
  const bodies: string[] = [];
  const rails: string[] = [];
  let scrollIntoViewCalls = 0;
  const nodes = new Map<string, Record<string, unknown>>();
  const node = (selector: string): Record<string, unknown> => {
    const found = nodes.get(selector);
    if (found) return found;
    const created: Record<string, unknown> = {
      scrollTop: 0,
      hidden: false,
      disabled: false,
      textContent: "",
      open: true,
      classList: { add() {}, remove() {}, toggle() {} },
      dataset: {},
      style: {},
      querySelector: () => null,
      querySelectorAll: () => [] as unknown[],
      // Adım rayı panelin önüne basılır: testte basılan işaretleme toplanır.
      insertAdjacentHTML: (_position: string, html: string) => { if (selector === "#automationPanel") rails.push(html); },
      // Blok açılınca kaydırma olmamalı: çağrı sayılır, sıfır kalmalı.
      scrollIntoView: () => { scrollIntoViewCalls += 1; },
      setAttribute() {},
      focus() {},
      showModal() {},
      close() {}
    };
    Object.defineProperty(created, "innerHTML", {
      get: () => "",
      set: (value: string) => { if (selector === "#automationBody") bodies.push(value); }
    });
    nodes.set(selector, created);
    return created;
  };
  const state: Record<string, unknown> = {
    language: "en",
    devices: [
      {
        id: "0x0011", name: "Corridor light", buttons: [], features: [], state: {},
        controls: [{ id: "switch:state", property: "state", name: "Corridor light", kind: "switch", valueOn: "ON", valueOff: "OFF", valueToggle: "TOGGLE" }]
      },
      { id: "0x0022", name: "Koridor Detektor", buttons: [], features: ["occupancy"], state: { occupancy: false }, controls: [] },
      { id: "0x0033", name: "Duman dedektörü", buttons: [], features: ["smoke"], state: { smoke: false }, controls: [] }
    ],
    events: [],
    automations: [],
    automationWizard: null
  };
  const stubs: Record<string, unknown> = {
    t: (key: string) => String(key),
    esc: (value: unknown) => String(value),
    state,
    isProtectedDevice: () => false,
    deviceKind: () => "kind",
    ago: () => "now",
    showToast: () => {},
    deviceSeenPress: () => true,
    visiblePresses: () => [],
    deviceButtonName: () => "button",
    deviceButtonPressLabel: () => "press",
    openSimpleLink: () => {},
    persistAutomations: async () => {},
    confirm: () => false,
    $: (selector: string) => node(selector),
    $$: () => [],
    document: { activeElement: null },
    // Kendiliğinden ilerleme beklemesi testte anında koşar.
    setTimeout: (run: () => void) => { run(); return 1; },
    clearTimeout: () => {}
  };
  const names = Object.keys(stubs);
  const api = new Function(
    ...names,
    `${source.slice(start, end)}\n`
    + "return{openAutomationWizard,chooseAutomationPath,chooseAutomationTrigger,chooseAutomationTriggerDevice,"
    + "chooseAutomationEvent,chooseAutomationTargetDevice,chooseAutomationAction,chooseAutomationAutoOff,"
    + "goToAutomationStep,automationStepUnlocked,automationRailSteps,openAutomationBlock,automationPickBack,"
    + "setAutomationAutoOffMinutes,openAutomationAutoOffCustom,automationBlockedReason};"
  )(...names.map((name) => stubs[name])) as Record<string, (...args: unknown[]) => unknown>;
  return {
    bodies,
    rails,
    // Kaydırma kutuları artık dış kutu değil: dar düzende `#automationFlow`, iki sütunluda
    // `#automationPanel`. Sahte DOM ikisini de tutar; `automationScrollTop` ikisini de sıfırlamalı.
    scroll: () => (node("#automationFlow") as { scrollTop: number }).scrollTop,
    panelScroll: () => (node("#automationPanel") as { scrollTop: number }).scrollTop,
    scrollIntoViewCalls: () => scrollIntoViewCalls,
    setScroll: (value: number) => {
      (node("#automationFlow") as { scrollTop: number }).scrollTop = value;
      (node("#automationPanel") as { scrollTop: number }).scrollTop = value;
    },
    wizard: () => state.automationWizard as Record<string, unknown>,
    body: () => bodies[bodies.length - 1],
    state,
    api
  };
}

// Sihirbazın asıl kusuru: seçim yapılınca seçenekler kapanmıyordu, sayfa her tıklamada büyüyordu.
// Artık cevaplanan soru tek satırlık "seçildi" satırına iner ve ekranda tek soru açık kalır.
test("sihirbazda seçim yapılınca o soru kapanır, ekranda tek soru açık kalır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");

  // 1. soru: tetikleyici türü. Cihaz listesi henüz yok — sırası gelmemiş soru hiç basılmaz.
  assert.match(harness.body(), /data-automation-trigger="sensor"/);
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);

  // Tür seçilince beş kart kapanır: yerine tek satır gelir, altında yalnız cihaz sorusu açılır.
  api.chooseAutomationTrigger("sensor");
  assert.doesNotMatch(harness.body(), /data-automation-trigger="sensor"/);
  assert.match(harness.body(), /data-automation-open-block="kind" aria-expanded="false"/);
  assert.match(harness.body(), /automationTriggerSensor/);
  assert.match(harness.body(), /data-automation-trigger-device="0x0022"/);

  // Cihaz seçilince kart ızgarası da kapanır: kalan tek açık soru olayın kendisi.
  api.chooseAutomationTriggerDevice("0x0022");
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);
  assert.match(harness.body(), /data-automation-pick-back="trigger" aria-expanded="false"/);
  assert.match(harness.body(), /data-automation-event="occupancy=true"/);
  assert.equal(harness.body().match(/class="automation-open"/g)?.length, 1);

  // "Değiştir": kapalı satır geri açılır, seçim silinmez, diğer sorular kapalı satır olarak kalır.
  api.openAutomationBlock("kind");
  assert.match(harness.body(), /data-automation-trigger="sensor"/);
  assert.equal(harness.wizard().triggerDeviceId, "0x0022");
  assert.equal(harness.body().match(/class="automation-open"/g)?.length, 1);

  // Cihaz satırının "Değiştir"i listeye döner ve seçimi temizler.
  api.automationPickBack("trigger");
  assert.equal(harness.wizard().triggerDeviceId, null);
  assert.match(harness.body(), /data-automation-trigger-device="0x0022"/);
  assert.doesNotMatch(harness.body(), /data-automation-event=/);

  // Hedef adımı da iki soruludur: cihaz seçilince liste kapanır, kanal soruları açılır.
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  assert.equal(harness.wizard().step, 2);
  assert.match(harness.body(), /data-automation-target-device="0x0011"/);
  api.chooseAutomationTargetDevice("0x0011");
  assert.doesNotMatch(harness.body(), /data-automation-target-device=/);
  assert.match(harness.body(), /data-automation-pick-back="target" aria-expanded="false"/);
  assert.match(harness.body(), /data-automation-action="0x0011\|switch:state\|on"/);
});

// Düzenleme akışı: her şey zaten seçilidir, o yüzden bütün sorular kapalı satır olarak açılır.
test("kayıtlı kural düzenlenirken bütün sorular kapalı satır olarak gelir", async () => {
  const harness = await automationWizardHarness();
  (harness.state.automations as unknown[]).push({
    id: "rule1",
    name: "Koridor",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }],
    conditions: [],
    actions: [{ type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }]
  });
  harness.api.openAutomationWizard("rule1");

  assert.equal(harness.wizard().step, 1);
  // Hiçbir seçenek listesi basılmaz: yalnız kapalı satırlar.
  assert.doesNotMatch(harness.body(), /class="automation-open"/);
  assert.doesNotMatch(harness.body(), /data-automation-trigger="/);
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);
  assert.match(harness.body(), /data-automation-open-block="kind" aria-expanded="false"/);
  assert.match(harness.body(), /data-automation-pick-back="trigger" aria-expanded="false"/);
  assert.match(harness.body(), /data-automation-open-block="event" aria-expanded="false"/);

  // Hedef adımı da kapalı gelir; "sonra kapat" da tek satıra iner.
  harness.api.goToAutomationStep(2);
  assert.doesNotMatch(harness.body(), /class="automation-open"/);
  harness.api.goToAutomationStep(3);
  assert.doesNotMatch(harness.body(), /data-automation-autooff="none"/);
  assert.match(harness.body(), /data-automation-open-block="autooff" aria-expanded="false"/);
  harness.api.openAutomationBlock("autooff");
  assert.match(harness.body(), /data-automation-autooff="none"/);
});

// Aynı değeri iki ayrı yoldan girme kalktı: hazır süre çipleri asıl yol, sayaç yalnız "Başka süre".
test("otomatik kapatma süresi tek yoldan girilir", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("after");

  // Hazır çipler var, sayaç yok.
  assert.match(harness.body(), /data-automation-autooff-minutes="5"/);
  assert.match(harness.body(), /data-automation-autooff-custom="1"/);
  assert.doesNotMatch(harness.body(), /data-automation-autooff-step=/);

  // "Başka süre" seçilince sayaç açılır, çipler seçili görünmez.
  api.openAutomationAutoOffCustom();
  assert.match(harness.body(), /data-automation-autooff-step="1"/);
  assert.match(harness.body(), /data-automation-autooff-custom="1" aria-pressed="true"/);

  // Hazır çipe dönülünce sayaç yeniden kapanır.
  api.setAutomationAutoOffMinutes(10, false);
  assert.equal(harness.wizard().autoOffMinutes, 10);
  assert.doesNotMatch(harness.body(), /data-automation-autooff-step=/);
});

// Pasif birincil düğme sessiz kalmaz: eksik olan şeyi söyler.
test("ileri düğmesi pasifken nedenini söyler", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  const reason = () => api.automationBlockedReason(harness.wizard());
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  assert.equal(reason(), "automationNeedTrigger");
  api.chooseAutomationTrigger("sensor");
  assert.equal(reason(), "automationNeedDevice");
  api.chooseAutomationTriggerDevice("0x0022");
  assert.equal(reason(), "automationNeedEvent");
  api.chooseAutomationEvent("occupancy=true");
  assert.equal(harness.wizard().step, 2);
  assert.equal(reason(), "automationNeedTarget");
  api.chooseAutomationTargetDevice("0x0011");
  assert.equal(reason(), "automationNeedAction");
  api.chooseAutomationAction("0x0011|switch:state|on");
  assert.equal(harness.wizard().step, 3);
  assert.equal(reason(), "");
});

// Yeni kural kurarken (kayıtlı kuralı düzenlerken değil) özet adımı seçenekleri gösterir ve adım
// değişince gövde başa sarar — seçenekler bir önceki adımın kaydırmasında saklı kalmaz.
test("yeni kural kurulumunda sonra kapat seçenekleri özet adımında görünür", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  // Adım 2 uzun listede kullanıcının kendi elleriyle aşağı kaydırılmış durumda.
  harness.setScroll(400);
  api.chooseAutomationAction("0x0011|switch:state|on");

  const wizard = harness.wizard();
  assert.equal(wizard.id, null);
  assert.equal(wizard.step, 3);
  const review = harness.bodies[harness.bodies.length - 1];
  assert.match(review, /data-automation-autooff="none"/);
  assert.match(review, /data-automation-autooff="idle"/);
  assert.match(review, /data-automation-autooff="after"/);
  // Asıl hata buydu: seçenekler basılıyordu ama ekran bir önceki adımın kaydırmasında kalıyordu.
  // Sabit yükseklikle birlikte kaydırma iç kutuya taşındı; ikisi de başa alınmalı.
  assert.equal(harness.scroll(), 0);
  assert.equal(harness.panelScroll(), 0);

  // Aynı adımda yeniden çizim kullanıcının yerini bozmaz.
  harness.setScroll(120);
  api.chooseAutomationAutoOff("after");
  assert.equal(harness.scroll(), 120);
  assert.equal(harness.panelScroll(), 120);
  assert.match(harness.bodies[harness.bodies.length - 1], /data-automation-autooff-minutes="5"/);
});

// Blok açılınca ekran kaydırılmıyordu değil — kaydırılıyordu ve asıl şikâyet buydu: uzun blok
// ortalanınca listenin üstü ekran dışında kalıyor, kullanıcı seçenekleri göremiyordu. Kural:
// adım değişince en üste, blok açılınca hiçbir yere.
test("sihirbazda blok açılınca ekran kaydırılmaz, yalnız adım değişimi başa sarar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");

  // Kullanıcı listede aşağı inmiş; kapalı satırı yeniden açmak yerini bozmamalı.
  harness.setScroll(260);
  api.openAutomationBlock("kind");
  assert.equal(harness.scroll(), 260);
  assert.equal(harness.panelScroll(), 260);
  // "Değiştir" ile cihaz seçimini temizlemek de kaydırmaz.
  api.automationPickBack("trigger");
  assert.equal(harness.scroll(), 260);
  // Hiçbir yolda `scrollIntoView` çağrılmadı: vurgu kaldı, kaydırma gitti.
  assert.equal(harness.scrollIntoViewCalls(), 0);

  // Adım değişimi hâlâ başa sarar.
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  assert.equal(harness.wizard().step, 2);
  assert.equal(harness.scroll(), 0);
  assert.equal(harness.panelScroll(), 0);
});

test("sonra kapat seçenekleri yalnız açan eylemde ve karşıtı olan tetikleyicide sunulur", async () => {
  const toggle = await automationWizardHarness();
  toggle.api.openAutomationWizard(null);
  toggle.api.chooseAutomationPath("rule");
  toggle.api.chooseAutomationTrigger("sensor");
  toggle.api.chooseAutomationTriggerDevice("0x0022");
  toggle.api.chooseAutomationEvent("occupancy=true");
  toggle.api.chooseAutomationTargetDevice("0x0011");
  toggle.api.chooseAutomationAction("0x0011|switch:state|toggle");
  assert.equal(toggle.wizard().step, 3);
  // "Değiştir" eyleminin geri alınacak yönü yok: blok hiç basılmaz.
  assert.doesNotMatch(toggle.bodies[toggle.bodies.length - 1], /data-automation-autooff/);

  const smoke = await automationWizardHarness();
  smoke.api.openAutomationWizard(null);
  smoke.api.chooseAutomationPath("rule");
  smoke.api.chooseAutomationTrigger("sensor");
  smoke.api.chooseAutomationTriggerDevice("0x0033");
  smoke.api.chooseAutomationTargetDevice("0x0011");
  smoke.api.chooseAutomationAction("0x0011|switch:state|on");
  assert.equal(smoke.wizard().step, 3);
  const review = smoke.bodies[smoke.bodies.length - 1];
  // Duman tek yönlü bildirir: "hareket bitince" karşılığı yok, yalnız süreyle kapatma kalır.
  assert.match(review, /data-automation-autooff="none"/);
  assert.match(review, /data-automation-autooff="after"/);
  assert.doesNotMatch(review, /data-automation-autooff="idle"/);
});

// Adım rayı: tamamlanan adıma atlanır, koşulu sağlanmamış ileri adım kilitlidir, her satır kendi
// seçilen değerini özetler.
test("adım rayı tamamlanan adıma atlar, ileri adımı kilitli tutar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  const wizard = () => harness.wizard();
  const rail = () => harness.rails[harness.rails.length - 1];
  const values = () => (api.automationRailSteps(wizard()) as { value: string }[]).map((entry) => entry.value);

  api.openAutomationWizard(null);
  // Yol adımında ray basılmaz.
  assert.equal(harness.rails.length, 0);
  api.chooseAutomationPath("rule");
  assert.equal(wizard().step, 1);

  // Tetikleyici seçilmeden 2. ve 3. adım kilitli: atlama denemesi adımı değiştirmez.
  assert.equal(api.automationStepUnlocked(wizard(), 2), false);
  assert.equal(api.automationStepUnlocked(wizard(), 3), false);
  api.goToAutomationStep(2);
  assert.equal(wizard().step, 1);
  assert.match(rail(), /data-automation-goto="2" disabled aria-disabled="true"/);
  assert.match(rail(), /data-automation-goto="1" aria-current="step"/);

  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  // Tetikleyici tamamlandı: 2. adım açıldı, 3. adım hâlâ kilitli.
  assert.equal(wizard().step, 2);
  assert.equal(api.automationStepUnlocked(wizard(), 2), true);
  assert.equal(api.automationStepUnlocked(wizard(), 3), false);
  assert.deepEqual(values(), ["Koridor Detektor · automationEventMotion", "", ""]);
  // Biten adım işaretli, özeti rayda yazıyor.
  assert.match(rail(), /class="automation-rail-step done"[\s\S]*?Koridor Detektor · automationEventMotion/);

  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  assert.equal(wizard().step, 3);
  assert.equal(api.automationStepUnlocked(wizard(), 3), true);
  assert.deepEqual(values().slice(0, 2), ["Koridor Detektor · automationEventMotion", "Corridor light · automationTurnOn"]);
  assert.match(rail(), /data-automation-goto="3" aria-current="step"/);
  assert.doesNotMatch(rail(), /disabled/);

  // Tamamlanan adıma atlama: seçimler korunur, ileri adım açık kalır.
  api.goToAutomationStep(1);
  assert.equal(wizard().step, 1);
  assert.equal(wizard().triggerDeviceId, "0x0022");
  assert.equal(api.automationStepUnlocked(wizard(), 3), true);
  // Aktif adıma tıklamak bir şeyi bozmaz.
  api.goToAutomationStep(1);
  assert.equal(wizard().step, 1);
  api.goToAutomationStep(3);
  assert.equal(wizard().step, 3);
});

test("cihaz sınıfı ayar niteliğindeki aç/kapa alanlarını saymaz", async () => {
  const dashboard = await readDashboardBundle();
  const source = dashboardScripts(dashboard);
  const start = source.indexOf("const deviceCategoryLabels=");
  const end = source.indexOf("const deviceIconKind=");
  assert.ok(start > 0 && end > start);
  const deviceKind = new Function(
    "t",
    `${source.slice(start, end)}return deviceKind;`
  )((key: string) => key) as (device: {
    category?: string | null;
    features: string[];
    controls: Array<{ kind: string; adminOnly?: boolean }>;
  }) => string;

  // Yalnız ayar niteliğinde (adminOnly) bir aç/kapa taşıyan varlık sensörü "Controller" değildir.
  assert.equal(
    deviceKind({ category: null, features: ["presence"], controls: [{ kind: "switch", adminOnly: true }] }),
    "motionSensor"
  );
  // Ayar niteliğindeki perde/kilit/fan/siren alanları da sınıfı çalmaz.
  for (const kind of ["cover", "lock", "fan", "siren"]) {
    assert.equal(deviceKind({ category: null, features: ["occupancy"], controls: [{ kind, adminOnly: true }] }), "motionSensor");
  }
  // Ayar niteliğindeki siren, sunucunun verdiği sınıfı da bozmaz.
  assert.equal(
    deviceKind({ category: "light", features: [], controls: [{ kind: "siren", adminOnly: true }] }),
    "lightDevice"
  );
  // Gerçek ana kontroller eskisi gibi sınıfı belirler.
  assert.equal(deviceKind({ category: null, features: [], controls: [{ kind: "switch" }] }), "controller");
  assert.equal(deviceKind({ category: null, features: [], controls: [{ kind: "cover" }] }), "coverDevice");
  assert.equal(deviceKind({ category: null, features: [], controls: [{ kind: "siren" }] }), "sirenDevice");
  assert.equal(
    deviceKind({ category: null, features: ["presence"], controls: [{ kind: "switch", adminOnly: true }, { kind: "switch" }] }),
    "controller"
  );
});
