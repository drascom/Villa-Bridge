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
  assert.match(dashboard, /const mediaHtml=photoHtml\|\|factsHtml\?`<div class="device-detail-media">\$\{photoHtml\}\$\{factsHtml\}<\/div>`:""/);
  assert.match(dashboard, /<div class="device-detail-layout">\s*<div class="device-detail-controls">\$\{device\.controls\.length\?/);
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
  assert.match(dashboard, /const renameControlButton=\(device,control\)=>\{\s*if\(!isDashboardControl\(control\)\)return""/);
  assert.match(dashboard, /class="control-rename" type="button" data-admin-only data-rename-channel="\$\{esc\(device\.id\)\}" data-channel="\$\{esc\(control\.id\)\}"/);
  assert.match(dashboard, /\.device-name-edit,\.control-rename\{width:40px;height:40px/);
  assert.match(dashboard, /\.control-rename\{width:44px;height:44px;display:inline-grid;vertical-align:middle;margin-left:7px\}/);
  assert.doesNotMatch(dashboard, /channel-rename/);
  assert.match(dashboard, /<div class="control-name">\$\{esc\(control\.name\)\}\$\{renameControlButton\(device,control\)\}<\/div>/);
  assert.match(dashboard, /<div class="control-name">\$\{esc\(label\)\}\$\{renameControlButton\(device,control\)\}<\/div>/);
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
  assert.match(dashboard, /const startup=\[refresh\(\),loadFavorites\(\),loadHomeGroups\(\),loadInstallationOnboarding\(\)\]/);
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
  assert.match(dashboard, /<button class="quick-toggle \$\{shown\?"on":""\}\$\{pending\?" pending":""\}" \$\{actionAttributes\}[\s\S]*?<span class="quick-device-icon" aria-hidden="true">\$\{deviceTypeIcon\(device\)\}<\/span><span class="device-name">\$\{esc\(displayName\)\}<\/span>\$\{preparing\|\|pending\?'<span class="command-spinner" aria-hidden="true"><\/span>':batteryPill\}<\/button>/);
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
  assert.match(dashboard, /const reload=\[refresh\(\),loadFavorites\(\),loadHomeGroups\(\)\]/);
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

  // Sayfa ve iki yollu giriş; "Kural kur" yalnızca yer tutuyor.
  assert.match(dashboard, /<section id="automations" class="view" data-admin-only>/);
  assert.match(dashboard, /id="newAutomation" class="primary"/);
  assert.match(dashboard, /id="automationPaths" class="automation-paths" hidden/);
  assert.match(dashboard, /data-automation-path="link"/);
  assert.match(dashboard, /data-automation-path="rule" disabled aria-disabled="true"/);
  assert.match(dashboard, /class="automation-soon" data-i18n="comingSoon"/);
  assert.match(dashboard, /\.automation-path\{min-height:88px/);
  assert.match(dashboard, /\.simple-link-choice\{min-height:88px/);
  assert.match(dashboard, /comingSoon:"Coming soon"/);
  assert.match(dashboard, /comingSoon:"Yakında"/);

  // Liste gerçek cihaz durumundan üretiliyor, ayrı kopya yok.
  assert.match(dashboard, /function simpleLinks\(\)\{/);
  assert.match(dashboard, /state\.devices\.filter\(isLinkStarter\)\.forEach\(device=>\{/);
  assert.match(dashboard, /if\(!linkClusterNames\.includes\(binding\.cluster\)\)return;/);
  assert.match(dashboard, /function renderAutomations\(\)\{/);
  assert.doesNotMatch(dashboard, /\/api\/automations/);

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
