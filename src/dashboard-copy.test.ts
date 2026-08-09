import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { panelMarkup, panelScripts, readPanelSource } from "./panel-source.js";

const dashboardBackgroundUrl = new URL("../public/assets/dashboard-landscape.jpg", import.meta.url);
const serverUrl = new URL("./index.js", import.meta.url);
const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

async function readDashboardBundle(): Promise<string> {
  const [dashboard, englishSource, turkishSource] = await Promise.all([
    readPanelSource(),
    readFile(englishLocaleUrl, "utf8"),
    readFile(turkishLocaleUrl, "utf8")
  ]);
  const catalogs = [englishSource, turkishSource].map((source) => JSON.parse(source).translations);
  const searchableTranslations = catalogs
    .flatMap((catalog) => Object.entries(catalog).map(([key, value]) => `${key}:${JSON.stringify(value)}`))
    .join(",");
  return `${dashboard}\n${searchableTranslations}`;
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

test("dashboard düz zemin üzerinde opak yüzeyler kullanır", async () => {
  const [dashboard, background, server] = await Promise.all([
    readDashboardBundle(),
    readFile(dashboardBackgroundUrl),
    readFile(serverUrl, "utf8")
  ]);

  // Fotoğraf kalktı: hiçbir kural artık manzara görselini çağırmaz, zemin temanın kâğıt rengi.
  assert.doesNotMatch(dashboard, /url\("\/assets\/dashboard-landscape\.jpg"\)/);
  assert.match(dashboard, /\n\s*body\{background-color:var\(--paper\);background-image:linear-gradient\(180deg,#f3f6f4,#e6ebe8\);background-attachment:fixed\}/);
  assert.match(dashboard, /:root\[data-theme="dark"\] body\{background-color:#101514;background-image:linear-gradient\(180deg,#141c18,#0c110f\)\}/);
  assert.doesNotMatch(dashboard, /body\[data-active-view="home"\]\{background-color:/);
  // Yüzey belirteçleri opak: fotoğraf gitti, saydamlığın taşıdığı iş de bitti.
  assert.match(dashboard, /--home-control:#fbfcfc/);
  assert.match(dashboard, /--home-border:#dde2e4/);
  assert.match(dashboard, /--home-control:#1b2320/);
  assert.match(dashboard, /--home-border:#33433b/);
  // Gezinme şeridi kalktı: menü düğmesi alttaki hızlı erişim düğmeleriyle aynı dili kullanır.
  assert.doesNotMatch(dashboard, /<aside>/);
  assert.match(dashboard, /body\[data-active-view="home"\] \.app-menu-button\{color:var\(--forest\);border-color:var\(--home-border\);background:var\(--home-control\);box-shadow:var\(--home-float-shadow\)\}/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.widget-card\{border-color:var\(--home-border\);background:var\(--home-control\)/);
  assert.doesNotMatch(dashboard, /body\[data-active-view="home"\] body\[data-active-view="home"\]/);
  // Şeridin kendi kartı yok: butonlar doğrudan zeminin üstünde durur.
  assert.match(dashboard, /#home \.quick-control-widget\{border-color:transparent;background:none;box-shadow:none\}/);
  assert.match(dashboard, /#home \.quick-card,[^}]*#home \.group-control-tile,[^}]*background:var\(--home-control\)/);
  // Görsel dosyası ve sunucu yolu duruyor (silinmedi), yalnız CSS artık kullanmıyor.
  assert.equal(background[0], 0xff);
  assert.equal(background[1], 0xd8);
  assert.ok(background.length < 180_000);
  assert.match(server, /app\.get\("\/assets\/dashboard-landscape\.jpg"/);
  assert.match(server, /Cache-Control", "public, max-age=31536000, immutable"/);
});

test("alt sayfalarda ayrı bir fotoğraf katmanı kalmadı", async () => {
  const dashboard = await readDashboardBundle();

  // Fotoğraf yokken alt sayfaların ekstra karartma katmanına da gerek yok.
  assert.doesNotMatch(dashboard, /body:not\(\[data-active-view="home"\]\)\{background-image:/);
  assert.doesNotMatch(dashboard, /:root\[data-theme="dark"\] body:not\(\[data-active-view="home"\]\)\{background-image:/);
  // Ana ekranın "fotoğraf üstü okunurluk" gölgeleri de kalktı.
  assert.match(dashboard, /--hub-text-shadow:none/);
  assert.doesNotMatch(dashboard, /--hub-text-shadow:0 /);
  assert.doesNotMatch(dashboard, /body\[data-active-view="home"\] #home \.home-title-line,[^}]*\{text-shadow:/);
});

test("alt sayfa yüzeyleri ana ekranla aynı cam belirteçlerine bağlı, pencereler opak kalır", async () => {
  const dashboard = await readDashboardBundle();

  // Kart/panel yüzeyleri tek cam belirtecini kullanır — ikinci bir saydamlık dili yok.
  assert.match(
    dashboard,
    /body:not\(\[data-active-view="home"\]\) \.view :where\(\.setting-card,\.connection-card,\.ha-setup-details,\.ha-network-guide,\.settings-actions,\.automation-card,\.automation-empty,\.widget-empty,\.empty\)\{border-color:var\(--home-border\);background:var\(--home-control\);box-shadow:var\(--home-float-shadow\)\}/
  );
  // Kartın içindeki eylem şeridine ikinci bir cam yüzey binmez.
  assert.match(
    dashboard,
    /body:not\(\[data-active-view="home"\]\) \.view \.connection-settings-card \.settings-actions\{border-width:1px 0 0;border-color:var\(--line\);background:none;box-shadow:none\}/
  );
  // Kendi kenar dilini koruyanlar yalnız dolgu alır. Gölge hepsine, dolgu seçili oda çipi hariç
  // hepsine: seçili çip kendi koyu zeminini taşıdığı için cam dolgu onu ezmemeli.
  assert.match(
    dashboard,
    /body:not\(\[data-active-view="home"\]\) \.view :where\(\.device-card,\.room-chip\)\{box-shadow:var\(--home-float-shadow\)\}/
  );
  assert.match(
    dashboard,
    /body:not\(\[data-active-view="home"\]\) \.view :where\(\.device-card,\.room-chip:not\(\.active\)\)\{background:var\(--home-control\)\}/
  );
  // Yapışkan araç çubuğu sayfanın en opak yüzeyi: yarı saydamken altından kayan kartların hayaleti
  // görünüyordu, artık her iki temada da bir ton koyu ve tam mat.
  assert.match(dashboard, /body:not\(\[data-active-view="home"\]\) \.view \.toolbar\{background:#e2e8ea\}/);
  assert.doesNotMatch(dashboard, /\.view \.toolbar\{background:rgba\(251,252,252,\.94\)\}/);
  assert.match(
    dashboard,
    /:root\[data-theme="dark"\] body:not\(\[data-active-view="home"\]\) \.view \.toolbar\{background:#0b100f\}/
  );
  assert.doesNotMatch(dashboard, /\.view \.toolbar\{background:rgba\(22,31,27,\.94\)\}/);
  // Sayfa başlığı doğrudan fotoğrafın üstünde: tema başına ayrı hale.
  assert.match(dashboard, /body:not\(\[data-active-view="home"\]\) \.page-head-title h1\{text-shadow:0 1px 2px rgba\(255,255,255,\.5\)\}/);
  assert.match(
    dashboard,
    /:root\[data-theme="dark"\] body:not\(\[data-active-view="home"\]\) \.page-head-title h1\{text-shadow:0 1px 3px rgba\(0,0,0,\.62\)\}/
  );
  // `<dialog>` içeriği hariç: cam kuralları `.view` ile sınırlı ve bütün dialoglar `.view` dışında.
  assert.doesNotMatch(dashboard, /body:not\(\[data-active-view="home"\]\)[^{]*dialog/);
  const markup = await panelMarkup();
  const firstDialog = markup.indexOf('<dialog id="');
  const viewSections = [...markup.matchAll(/<section id="[a-z]+" class="view/g)];
  assert.ok(firstDialog > 0);
  assert.equal(viewSections.length, 5);
  assert.ok(viewSections.every((section) => (section.index ?? -1) < firstDialog));
  // Eski Android WebView: saydamlık düz `rgba()` ile, `color-mix()` yok.
  assert.doesNotMatch(dashboard, /color-mix\(/);
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
    /async function toggleHomeAssistantDiscovery\(\)\{([\s\S]*?)\n  \}\n  async function loadHomeGroups/
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("aç/kapat komutları sonuçlanana kadar kontrolü kilitler ve spinner gösterir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /pendingCommands:new Set\(\)/);
  assert.match(dashboard, /if\(state\.pendingCommands\.has\(key\)\)return/);
  assert.match(dashboard, /state\.pendingCommands\.add\(key\);[\s\S]*?finally\{state\.pendingCommands\.delete\(key\);render\(\)\}/);
  assert.match(dashboard, /class="command-spinner"/);
  assert.match(dashboard, /\.switch\.pending::after/);
  assert.match(dashboard, /\.light-power\.pending::after/);
  assert.match(dashboard, /\(device\.availability==="offline"&&Boolean\(controlAction\)\)\|\|pending\?" disabled":""/);
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
  assert.match(dashboard, /type yes below/);
  assert.match(dashboard, /aşağıya evet yazın/);
  assert.match(dashboard, /autocapitalize="none"/);
  assert.match(dashboard, /removalConfirmationWords=\["evet","yes"\]/);
  assert.match(dashboard, /confirmDeviceRemoval\(force=false\)/);
  assert.match(dashboard, /JSON\.stringify\(\{confirmation,force\}\)/);
  assert.match(dashboard, /forceRemove:"Kaydı zorla sil"/);
  assert.match(dashboard, /forceRemove:"Force delete record"/);
  assert.match(dashboard, /if\(Array\.isArray\(data\.groups\)\)\{state\.groups=data\.groups;saveDashboardGroups\(\);applyWidgetLayout\(\)\}/);
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

test("eşleştirme beklerken çekirdekte animasyonlu wifi ikonu döner", async () => {
  const dashboard = await readDashboardBundle();

  // İkon satır içi SVG ve panelin ikon dili: dış kaynak, GIF veya nokta yok.
  assert.match(
    dashboard,
    /<span class="pairing-core"><svg class="pairing-wifi" viewBox="0 0 24 24" aria-hidden="true">/
  );
  assert.match(dashboard, /<path class="pairing-wave pairing-wave-3" d="M2\.5 8\.6a15 15 0 0 1 19 0"\/>/);
  assert.match(dashboard, /<path class="pairing-wave pairing-wave-2" d="M6 12\.6a10 10 0 0 1 12 0"\/>/);
  assert.match(dashboard, /<path class="pairing-wave pairing-wave-1" d="M9\.5 16\.6a5 5 0 0 1 5 0"\/>/);
  assert.match(dashboard, /<circle class="pairing-wifi-dot" cx="12" cy="19\.6" r="1\.3"\/>/);
  assert.match(
    dashboard,
    /\.pairing-wifi\{width:26px;height:26px;display:block;fill:none;stroke:var\(--on-forest\);stroke-width:2\.2/
  );

  // Animasyon saf CSS ve dalgalar sırayla yanar.
  assert.match(dashboard, /\.pairing-wave\{opacity:\.24;animation:pairing-wave-pulse 1\.5s ease-in-out infinite\}/);
  assert.match(dashboard, /\.pairing-wave-2\{animation-delay:\.22s\}\.pairing-wave-3\{animation-delay:\.44s\}/);
  assert.match(dashboard, /@keyframes pairing-wave-pulse\{0%,100%\{opacity:\.22\}45%\{opacity:1\}\}/);

  // Arama durunca ikon da durur: `timed-out` donar, `ready` yerini onay işaretine bırakır.
  assert.match(dashboard, /\.pairing-visual\.timed-out \.pairing-wave\{animation:none;opacity:\.5\}/);
  assert.match(dashboard, /\.pairing-visual\.ready \.pairing-wifi\{display:none\}/);
  assert.match(dashboard, /\.pairing-visual\.ready \.pairing-core::after\{opacity:1\}/);

  // Hareket azaltma isteğinde animasyon durur, ikon statik kalır.
  assert.match(
    dashboard,
    /@media\(prefers-reduced-motion:reduce\)\{\.pairing-ring\{animation:none\}\.pairing-ring:first-child\{opacity:\.4\}\.pairing-wave\{animation:none;opacity:1\}\}/
  );

  // Eski üç nokta çekirdeği ve beyaz sabit rengi geri gelmemeli.
  assert.doesNotMatch(dashboard, /\.pairing-core::before/);
  assert.doesNotMatch(dashboard, /box-shadow:13px 0 white/);
  assert.doesNotMatch(dashboard, /\.pairing-core[^{]*\{[^}]*background:white/);
});

test("kurulum akışının seçim kartları sabit renk değil tema belirteci kullanır", async () => {
  const dashboard = await readDashboardBundle();

  // "Bu cihaz nedir?" ve "Hangi oda?" adımları aynı sınıfı paylaşır: tek düzeltme ikisini de kapsar.
  assert.match(dashboard, /id="deviceRoleChoices" class="device-role-choices"/);
  assert.match(dashboard, /id="deviceRoomChoices" class="device-role-choices"/);
  assert.match(
    dashboard,
    /\.device-role-choice\{min-height:96px;[^}]*border:2px solid var\(--line\);border-radius:12px;background:var\(--surface-soft\);color:var\(--ink\)/
  );
  assert.match(dashboard, /\.device-role-choice\[aria-pressed="true"\]\{border-color:var\(--forest\);background:var\(--forest-soft\)\}/);

  // Kardeş adımlar: fotoğraf seçimi ve bulunan cihaz kutusu da belirteçlere bağlı.
  assert.match(
    dashboard,
    /\.image-choice\{min-height:148px;[^}]*border:2px solid var\(--line\);border-radius:12px;background:var\(--surface-soft\);color:var\(--ink\)/
  );
  assert.match(dashboard, /\.pairing-device\{margin:18px 0 2px;padding:14px;border:1px solid var\(--line\);background:var\(--surface-soft\)\}/);

  // Sabit açık zeminler geri gelmemeli — koyu temada metni okunmaz yapan kök buydu.
  [/\.device-role-choice\{[^}]*\}/, /\.image-choice\{[^}]*\}/, /\.pairing-device\{[^}]*\}/].forEach((pattern) => {
    const rule = pattern.exec(dashboard)?.[0] ?? "";
    assert.ok(rule, `kural bulunamadı: ${pattern}`);
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,6}/, `sabit renk geri geldi: ${rule}`);
    assert.doesNotMatch(rule, /background:\s*white/, `sabit beyaz geri geldi: ${rule}`);
  });
  assert.doesNotMatch(dashboard, /#f7f9f6/);
  // Artık belirteçten geldikleri için koyu tema yamasına da ihtiyaçları yok.
  assert.doesNotMatch(dashboard, /:root\[data-theme="dark"\] \.image-choice\{/);
  assert.doesNotMatch(dashboard, /:root\[data-theme="dark"\] \.pairing-device/);
});

test("arama alanlarının yan dolgusu görünüm genişliğiyle ölçeklenir", async () => {
  const dashboard = await readDashboardBundle();

  // Cihazlar sayfasının çubuğu kenardan kenara: iç dolgu sabit px değil, viewport'a bağlı.
  assert.match(
    dashboard,
    /\.search\{border:1px solid var\(--line\);border-radius:10px;padding:13px clamp\(16px,2vw,22px\);background:var\(--surface\);color:var\(--ink\);outline:0\}/
  );
  assert.match(dashboard, /\.search-field \.search\{width:100%;padding-right:clamp\(56px,6vw,66px\)\}/);
  assert.match(dashboard, /\.search-clear\{position:absolute;right:clamp\(6px,1vw,12px\);top:50%/);

  // Konum, dünya saati ve ev konumu pencereleri tek `.location-search-field` kuralını paylaşır.
  assert.match(
    dashboard,
    /\.location-search-field input\{width:100%;min-height:48px;padding:11px clamp\(16px,2vw,22px\) 11px clamp\(44px,4\.6vw,50px\)/
  );
  assert.match(dashboard, /\.location-search-field svg\{position:absolute;left:clamp\(14px,1\.6vw,19px\)/);
  ["clockCitySearch", "weatherLocationSearch", "homeLocationSearch"].forEach((id) => {
    assert.match(dashboard, new RegExp(`id="${id}"`), `${id} arama alanı kayboldu`);
  });

  // Eski dar/sabit dolgular ve beyaz zemin geri gelmemeli.
  assert.doesNotMatch(dashboard, /\.search\{[^}]*padding:13px 15px/);
  assert.doesNotMatch(dashboard, /\.search\{[^}]*background:white/);
  assert.doesNotMatch(dashboard, /\.search-field \.search\{[^}]*padding-right:52px/);
  assert.doesNotMatch(dashboard, /\.location-search-field input\{[^}]*padding:11px 14px 11px 43px/);
});

test("sayfa eylem döşemesi soldaki menü düğmesinin ikizidir: aynı hap, yalnız ikon", async () => {
  const dashboard = await readDashboardBundle();

  // "Cihaz ekle" ve "Yeni otomasyon" aynı sınıftan beslenir: biçim tek yerden gelir.
  assert.match(dashboard, /id="devicesAddDevice" class="primary add-device page-action-tile"/);
  assert.match(dashboard, /id="newAutomation" class="primary page-action-tile"/);
  assert.match(
    dashboard,
    /\.page-action-tile\{[^}]*border:1px solid var\(--forest\);border-radius:999px;color:var\(--forest\);background:var\(--forest-soft\)/
  );
  assert.doesNotMatch(dashboard, /\.page-action-tile\{[^}]*border-radius:16px/);

  // Ölçü belirteçleri menü düğmesiyle birebir aynı: genişlik `--head-action-w`, yükseklik
  // `--head-action-h`. Daire (`height:var(--head-action-w)`) hali geri gelmemeli.
  assert.match(dashboard, /\.page-action-tile\{[^}]*width:var\(--head-action-w\);min-width:var\(--head-action-w\);height:var\(--head-action-h\)/);
  assert.doesNotMatch(dashboard, /\.page-action-tile\{[^}]*height:var\(--head-action-w\)/);
  // Menü düğmesi de aynı çifti kullanır — ikisi tek ölçü sözleşmesine bağlı.
  assert.match(dashboard, /\.app-menu-button\{width:var\(--head-action-w\);height:var\(--head-action-h\)/);

  // Yalnız ikon: iki satırlık etiketi taşıyan sütun düzeni gitti, yerine tek hücre ızgara geldi.
  assert.match(dashboard, /\.page-action-tile\{[^}]*display:grid;place-items:center/);
  assert.doesNotMatch(dashboard, /\.page-action-tile\{[^}]*flex-direction:column/);
  // İkon optik ağırlığı menü düğmesiyle eşit: 26px, 1.9 kalınlık.
  assert.match(dashboard, /\.page-action-tile \.page-action-glyph\{display:block;width:26px;height:26px;stroke-width:1\.9\}/);
  assert.match(dashboard, /\.app-menu-button svg\{width:26px;height:26px;[^}]*stroke-width:1\.9/);
});

test("sayfa eylem etiketi silinmez, yalnız görsel olarak gizlenir", async () => {
  const dashboard = await readDashboardBundle();

  // Etiket DOM'da duruyor: ekran okuyucu hâlâ okuyor, çeviri kancası yerinde.
  assert.match(dashboard, /id="devicesAddDevice"[^>]*>[\s\S]{0,400}?<span class="page-action-label" data-i18n="addDevice">Add device<\/span>/);
  assert.match(dashboard, /id="newAutomation"[^>]*>[\s\S]{0,400}?<span class="page-action-label" data-i18n="newAutomation">New automation<\/span>/);

  // Gizleme panelin mevcut deseniyle: 1px kırpma, `display:none` DEĞİL (okuyucudan düşerdi).
  assert.match(
    dashboard,
    /\.page-action-tile \.page-action-label\{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect\(0,0,0,0\)!important;white-space:nowrap!important;border:0!important\}/
  );
  assert.doesNotMatch(dashboard, /\.page-action-tile \.page-action-label\{[^}]*display:none/);

  // İkon tek başına kaldığı için ne yaptığı `aria-label`'dan okunur; çeviriyle de eşitlenir.
  assert.match(dashboard, /id="devicesAddDevice"[^>]*data-i18n-aria="addDevice" aria-label="Add device"/);
  assert.match(dashboard, /id="newAutomation"[^>]*data-i18n-aria="newAutomation" aria-label="New automation"/);
});

test("koyu temada başlık düğmeleri açık dolguya çevrilir", async () => {
  const dashboard = await readDashboardBundle();

  // Menü/„genel görünüm" düğmesi ve sağdaki sayfa eylemi birlikte ters çevrilir: koyu zeminde
  // açık nane dolgu (--forest #71c6a2), koyu ikon (--on-forest #0b1c15).
  assert.match(
    dashboard,
    /:root\[data-theme="dark"\] \.app-menu-button,:root\[data-theme="dark"\] \.page-action-tile\{color:var\(--on-forest\);border-color:#a5dec5;background:var\(--forest\)\}/
  );
  assert.match(
    dashboard,
    /:root\[data-theme="dark"\] \.app-menu-button:hover,:root\[data-theme="dark"\] \.page-action-tile:hover\{color:var\(--on-forest\);background:#a5dec5\}/
  );
  assert.match(dashboard, /:root\[data-theme="dark"\] \.app-menu-button:focus-visible\{outline-color:#eafaf2\}/);

  // Açık tema bozulmadı: taban kural hâlâ koyu yeşil ikon + soluk yeşil dolgu.
  assert.match(dashboard, /\.app-menu-button\{[^}]*color:var\(--forest\);background:var\(--forest-soft\)\}/);
  // Koyu temanın kendi belirteçleri: dolgu açık, üstündeki ikon koyu.
  assert.match(dashboard, /:root\[data-theme="dark"\]\{[\s\S]{0,400}?--forest:#71c6a2;--forest-soft:#203d32;--on-forest:#0b1c15/);

  assert.doesNotMatch(dashboard, /color-mix\(/);
});

test("Devices görünümü mobil pull-to-refresh hareketi sunar", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="pullRefresh"/);
  assert.match(dashboard, /addDevice:"Cihaz ekle"/);
  assert.match(dashboard, /addDevice:"Add device"/);
  assert.doesNotMatch(dashboard, /Yeni cihaz ekle/);
  // `add-device` davranış kancası olarak kalır; biçim ayrı, sunumsal `.page-action-tile` sınıfından gelir.
  assert.match(dashboard, /id="devicesAddDevice" class="primary add-device page-action-tile"[^>]*><svg class="page-action-glyph"/);
  assert.match(dashboard, /\.page-action-tile \.page-action-label\{position:absolute!important;/);
  assert.match(dashboard, /id="refreshButton"><svg class="page-action-glyph"/);
  assert.match(dashboard, /#home \.home-actions button,#refreshButton\{[^}]*background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /pullToRefresh:"Pull to refresh"/);
  assert.match(dashboard, /pullToRefresh:"Yenilemek için aşağı çekin"/);
  // Döşemenin ölçüsü başlık ızgarasının yan sütunuyla aynı belirteçten gelir: sabit px yok.
  assert.match(dashboard, /@media\(min-width:561px\)\{\.page-action-tile\{position:relative;width:var\(--head-action-w\);min-width:var\(--head-action-w\);height:var\(--head-action-h\);flex:none;align-self:center;display:grid;place-items:center/);
  assert.doesNotMatch(dashboard, /\.page-action-tile\{[^}]*width:88px/);
  assert.doesNotMatch(dashboard, /#devices \.page-head>\.add-device\{/);
  assert.match(dashboard, /#devices #refreshButton \.page-action-label\{position:absolute!important/);
  assert.match(dashboard, /addEventListener\("touchmove"/);
  assert.match(dashboard, /\{passive:false\}/);
  assert.match(dashboard, /window\.scrollY>0/);
  assert.match(dashboard, /pullRefreshState\.distance>=pullRefreshThreshold/);
  assert.match(dashboard, /await refresh\(\)/);
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  // Dikkat bölümü ızgaraya özgüdür: liste kipinde tek düz tablo çizilir, ayrım devre dışı kalır.
  assert.match(dashboard, /const attentionDevices=tableMode\?\[\]:devices\.filter\(deviceNeedsAttention\)/);
  assert.match(dashboard, /const regularDevices=tableMode\?devices:devices\.filter\(device=>!deviceNeedsAttention\(device\)\)/);
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
  // Alt gezinme şeridi kalktığı için toast artık ekranın dibine oturur.
  assert.match(dashboard, /@media\(max-width:900px\)\{\.toast\{bottom:calc\(24px \+ env\(safe-area-inset-bottom\)\)\}\}/);
  assert.doesNotMatch(dashboard, /class="device-card-layout"/);
  assert.match(dashboard, /class="image-edit-overlay"[^>]*data-change-image=/);
  assert.match(dashboard, /class="device-detail-photo" data-device-photo hidden/);
  assert.doesNotMatch(dashboard, /class="device-detail-photo"[\s\S]{0,400}?loading="lazy"/);
  assert.doesNotMatch(dashboard, /loading="lazy"/);
  assert.match(dashboard, /const succeed=\(\)=>\{if\(photo\)photo\.hidden=false\}/);
  assert.match(dashboard, /\$\{deviceDetailPhoto\(device\)\}/);
  assert.match(dashboard, /const mediaHtml=`<div class="device-detail-media">\$\{photoHtml\}\$\{factsHtml\}\$\{rolesHtml\}<\/div>`/);
  assert.match(dashboard, /\.device-detail-roles \.control-select\{min-width:0;max-width:100%\}/);
  assert.match(dashboard, /<div class="device-detail-layout">\s*<div class="device-detail-controls">\$\{panelHtml\}<div class="controls">\$\{controlsBodyHtml\|\|/);
  // Alt sayfalarda `.lead` artık markup'ta yok; gizleme kuralı yalnız ana ekran için kaldı.
  assert.match(dashboard, /#home \.page-head \.lead\{display:none\}/);
  assert.doesNotMatch(dashboard, /data-i18n="devicesLead"/);
  assert.doesNotMatch(dashboard, /devicesLead:/);
  // Kaldırma bakım satırında, onar düğmesinin hemen yanında.
  assert.match(
    dashboard,
    /data-reconfigure="\$\{esc\(device\.id\)\}">\$\{t\("repairDevice"\)\}<\/button><button class="remove" type="button" data-admin-only data-remove="\$\{esc\(device\.id\)\}">/
  );
  assert.match(dashboard, /\.card-actions-footer\{justify-content:flex-end;align-items:stretch;gap:clamp\(10px,1\.4vw,16px\);margin-top:clamp\(12px,1\.8vh,18px\);padding-top:clamp\(12px,1\.8vh,18px\);border-top:1px solid var\(--line\)\}/);
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
  // Arama çubuğu kenardan kenara: `main`in yan dolgusunu negatif kenar boşluğuyla siler, aynı
  // dolguyu içeride geri verir; böylece hiçbir sabit px'e bağlanmadan tam genişlik olur.
  assert.match(
    dashboard,
    /#devices \.toolbar\{position:sticky;z-index:6;top:0;margin-inline:calc\(var\(--page-gutter\) \* -1\);margin-bottom:10px;padding-block:clamp\(10px,1\.6vh,16px\) clamp\(14px,2\.4vh,22px\);padding-inline:var\(--page-gutter\);background:var\(--paper\)\}/
  );
  assert.doesNotMatch(dashboard, /#devices \.toolbar\{position:sticky;z-index:6;top:0;padding:10px 0/);
  // `main` yan dolgusu artık tek kaynaktan: her kırılım kendi `--page-gutter` değerini yazar.
  assert.match(dashboard, /main\{--page-gutter:42px;width:100%;max-width:1240px;margin:0 auto;padding:24px var\(--page-gutter\) 80px\}/);
  assert.match(dashboard, /@media\(max-width:900px\)\{main\{--page-gutter:18px;padding:14px var\(--page-gutter\) calc\(24px \+ env\(safe-area-inset-bottom\)\)\}/);
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  assert.match(dashboard, /preparing\|\|\(device\.availability==="offline"&&Boolean\(controlAction\)\)\|\|pending/);
  assert.match(dashboard, /pairingReconnectComplete:"Known device reconnected successfully\."/);
  assert.match(dashboard, /pairingReconnectComplete:"Kayıtlı cihaz yeniden bağlandı\."/);
  assert.match(dashboard, /state\.editing=\{id,channel:null,afterPairing:true,reconnected\}/);
  assert.match(dashboard, /editing\?\.afterPairing/);
  assert.match(dashboard, /finishPairingFlow\(editing\.id\)/);
  assert.match(dashboard, /\$\("#cancelName"\)\.textContent=t\(afterPairing\?"skip":"cancel"\)/);
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

/* Eşleştirmenin son penceresi cihaz detayı: kullanıcı orada "bitti" diyebilmeli. Düğme alt
   satırda tek başına durur, kabı `data-admin-only` almaz (ev sakini de bitirebilmeli) ve gövdenin
   kardeşi olduğu için kaydırma alanının dışındadır. */
test("cihaz detayında bitirme düğmesi alt satırda tek başına, kaydırmanın dışında durur", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(
    dashboard,
    /<div id="deviceDetailBody" class="device-detail-body"><\/div><div class="card-actions card-actions-footer"><button id="finishDeviceDetail" class="primary" type="button" data-close-detail data-i18n="close">/
  );
  assert.match(dashboard, /\$\("#finishDeviceDetail"\)\.textContent=t\(state\.detailFromPairing\?"finishSetup":"close"\)/);
  // Alt satır artık kap içermez: yalnız tek düğme, sağa yaslı.
  assert.doesNotMatch(dashboard, /card-actions-danger/);
  assert.doesNotMatch(dashboard, /card-actions-done/);
  assert.doesNotMatch(dashboard, /\.card-actions-footer>div>button/);
  assert.match(dashboard, /\.card-actions-footer>button\{flex:0 1 clamp\(160px,28vw,320px\);min-height:clamp\(44px,7vh,52px\)\}/);
  // Tehlike dili birincil dilden ayrışsın; sabit renk değil, tema değişkeni.
  assert.match(dashboard, /\.card-actions \.remove\{border:1px solid var\(--danger\)\}/);
  assert.ok(!/\.card-actions-footer[^{]*\{[^}]*color-mix\(/.test(dashboard));
  // Bağlam eşleştirmeden taşınır ve pencere kapanınca sıfırlanır.
  assert.match(dashboard, /showDevice\(id,\{fromPairing:true\}\)/);
  assert.match(dashboard, /function showDevice\(id,options=\{\}\)\{/);
  assert.match(dashboard, /function openDeviceDetail\(id,options=\{\}\)\{/);
  assert.match(dashboard, /state\.detailFromPairing=options\.fromPairing===true/);
  assert.match(dashboard, /"close",\(\)=>\{state\.detailDevice=null;state\.detailFromPairing=false/);
  assert.match(dashboard, /\$\$\("\[data-close-detail\]"\)\.forEach\(button=>button\.onclick=closeDeviceDetail\)/);
  // Metin kurulum sihirbazının `finishSetup` anahtarıyla ortak: aynı cümle iki kez yazılmaz.
  assert.match(dashboard, /finishSetup:"Finish setup"/);
  assert.match(dashboard, /finishSetup:"Kurulumu tamamla"/);
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("diller ayrı ve genişletilebilir JSON paketlerinden yüklenir", async () => {
  const [dashboard, englishSource, turkishSource] = await Promise.all([
    readPanelSource(),
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
  assert.match(dashboard, /const startup=\[refresh\(\),loadHomeGroups\(\),loadHomeVisibility\(\),loadAutomations\(\),loadHomeLocation\(\),loadInstallationOnboarding\(\)\]/);
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
  assert.match(dashboard, /target:"#homeTabs"/);
  assert.match(dashboard, /target:"#addWidget"/);
  assert.match(dashboard, /target:"#editDashboard"/);
  // Turun son adımı yeni menü düğmesini gösterir; gezinme şeridi artık yok.
  assert.match(dashboard, /target:'#home \[data-app-menu\]',fallback:"#home \.home-actions",title:"tourMenuTitle",text:"tourMenuLead"/);
  assert.match(dashboard, /tourMenuTitle:"Everything else is in the menu"/);
  assert.match(dashboard, /tourMenuTitle:"Geri kalan her şey menüde"/);
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  // Yatay kipte üstteki 68 px'lik gezinme şeridi kaldırıldı: `main` yukarıdan 82 -> 14 px'e indi.
  assert.doesNotMatch(dashboard, /aside\{position:fixed/);
  assert.doesNotMatch(dashboard, /\.nav-utilities/);
  assert.doesNotMatch(dashboard, /id="landscapeTheme"/);
  assert.doesNotMatch(dashboard, /id="landscapeLanguage"/);
  assert.match(dashboard, /\.topbar\{display:none\}main\{--page-gutter:20px;max-width:none;padding:14px var\(--page-gutter\) 20px\}/);
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(max-width:900px\) and \(max-height:700px\)\{\.topbar\{display:none\}main\{padding-top:14px;padding-bottom:20px\}/,
  );
  assert.match(dashboard, /id="mobileTheme" class="mobile-utility"[^>]*data-theme-toggle/);
  assert.match(dashboard, /id="mobileLanguage" class="mobile-utility"[^>]*data-language-cycle/);
  assert.match(dashboard, /\$\$\("\[data-theme-toggle\]"\)\.forEach\(button=>button\.onclick=\(\)=>setThemeMode/);
  assert.match(dashboard, /\$\$\("\[data-language-cycle\]"\)\.forEach\(button=>button\.onclick=cycleLanguage\)/);
  assert.match(dashboard, /\.mobile-utility\{[^}]*border:0[^}]*background:transparent\}/);
  // Kural `.topbar` altına kapsandı: aynı bileşenler menü penceresinde dikey kipte de görünür kalır.
  assert.match(dashboard, /@media\(orientation:portrait\)\{\.topbar\{justify-content:flex-end\}\.topbar \.theme-switch,\.topbar \.language-switch\{display:none\}\.mobile-topbar-actions\{display:flex/);
  assert.match(dashboard, /document\.body\.dataset\.activeView=viewName/);
  assert.match(dashboard, /body\.android-app dialog::backdrop\{backdrop-filter:none\}/);
  assert.match(dashboard, /signature!==state\.overviewSignature/);
  assert.match(dashboard, /if\(!document\.hidden&&state\.auth\.authenticated\)refresh\(\)/);
  assert.match(dashboard, /setInterval\(\(\)=>\{if\(!document\.hidden&&state\.auth\.authenticated\)refresh\(\)\},8000\)/);
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("asistan token kartı yalnız yöneticiye açıktır ve ham token'ı bir kez gösterir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="agentAccessCard" class="setting-card agent-access-card" data-admin-only/);
  assert.match(dashboard, /id="agentTokenForm" class="agent-token-create"/);
  assert.match(dashboard, /id="agentTokenReveal" class="agent-token-reveal" role="status" hidden/);
  assert.match(dashboard, /id="agentTokenValue"/);
  assert.match(dashboard, /id="agentTokenList"/);
  assert.match(dashboard, /api\("\/api\/agent-tokens"\)/);
  assert.match(dashboard, /api\("\/api\/agent-tokens",\{method:"POST"/);
  assert.match(dashboard, /api\(`\/api\/agent-tokens\/\$\{encodeURIComponent\(id\)\}`,\{method:"DELETE"\}\)/);
  // Ham token yalnız üretim yanıtından gelir; listeleme yolunda hiç geçmez.
  assert.match(dashboard, /\$\("#agentTokenValue"\)\.textContent=data\.token/);
  assert.match(dashboard, /\$\("#agentTokenReveal"\)\.hidden=false/);
  assert.doesNotMatch(dashboard, /token\.token/);
  assert.match(dashboard, /confirm\(t\("agentTokenRevokeConfirm",\{name:token\.name\}\)\)/);
  assert.match(dashboard, /await loadAgentTokens\(\)/);
  assert.match(dashboard, /agentAccessTitle:"Assistant access"/);
  assert.match(dashboard, /agentAccessTitle:"Asistan erişimi"/);
  assert.match(dashboard, /agentTokenRevealTitle:"Copy this token now"/);
  assert.match(dashboard, /agentTokenRevealTitle:"Bu token'ı şimdi kopyalayın"/);
  // Ölçüler sabit px değil: 1024×640 tablette de, geniş ekranda da aynı kart.
  assert.match(dashboard, /\.agent-token-create\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;gap:clamp\(8px,1vw,12px\)\}/);
  assert.match(dashboard, /\.agent-token-reveal\{[^}]*background:var\(--forest-soft\);color:var\(--ink\)\}/);
  assert.doesNotMatch(dashboard, /agent-token[^{]*\{[^}]*color-mix\(/);
});

test("dashboard widget düzenini hafif ve kalıcı olarak özelleştirir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /id="widgetBoard"/);
  assert.match(dashboard, /id="widgetDialog"/);
  assert.match(dashboard, /--paper:#edf0f2;--surface:#fbfcfc;--surface-soft:#f3f5f6/);
  assert.match(dashboard, /--card-shadow:0 2px 8px rgba\(35,45,41,.055\)/);
  assert.match(dashboard, /id="systemAlertBar" class="system-alert-bar" role="alert" hidden/);
  assert.match(dashboard, /\.system-alert-bar\[hidden\]\{display:none\}/);
  // Şerit kalktı: uyarı çubuğu ekranın tepesine oturur, `main` de ona göre 70 px kalır.
  assert.match(dashboard, /\.system-alert-bar\{position:fixed;z-index:9;top:0;[^}]*min-height:56px;[^}]*font-size:20px\}/);
  assert.match(dashboard, /body\.has-system-alert main\{padding-top:70px\}/);
  assert.match(dashboard, /\.device-card\{[^}]*border-radius:16px[^}]*box-shadow:var\(--card-shadow\)/);
  assert.match(dashboard, /\.widget-card\{[^}]*border-radius:16px[^}]*background:var\(--surface\)/);
  assert.match(dashboard, /addWidget:"＋ Add"/);
  assert.match(dashboard, /addWidget:"＋ Ekle"/);
  assert.match(dashboard, /editDashboard:"✎ Edit"/);
  assert.match(dashboard, /editDashboard:"✎ Düzenle"/);
  assert.doesNotMatch(dashboard, /Add widget|Widget ekle|Edit dashboard|Dashboard’u düzenle/);
  assert.doesNotMatch(dashboard, /data-widget="status"/);
  assert.match(dashboard, /data-widget="quick"/);
  assert.match(dashboard, /class="dashboard-widget widget-wide quick-control-widget" data-widget="quick"[\s\S]*?id="homeTabs"[^>]*role="tablist"/);
  assert.doesNotMatch(dashboard, /data-widget="quick"[\s\S]*?<h2[\s\S]*?id="homeTabs"/);
  assert.match(dashboard, /data-widget="availability"/);
  assert.doesNotMatch(dashboard, /data-widget="recent"/);
  assert.doesNotMatch(dashboard, /id="recentDevices"|recentWidgetLead|noRecentDevices/);
  // Saat ve hava artık widget değil: `#widgetBoard`un ilk statik çocuğu olan hub bloğunda duruyorlar.
  assert.match(dashboard, /<div id="widgetBoard" class="widget-board">\s*<section id="homeHub" class="home-hub"/);
  assert.match(dashboard, /<section id="homeHub" class="home-hub"[\s\S]*?<div id="widgetRail" class="widget-rail"/);
  assert.doesNotMatch(dashboard, /data-widget="clock"|data-widget="weather"/);
  assert.match(dashboard, /const defaultDashboardWidgets=\["quick","summary","availability","activity"\]/);
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
  assert.match(dashboard, /\.shell\{min-height:100vh\}/);
  // Dar ekranda başlık altı boşluğu yatayda oransal (`--home-head-gap`), dikeyde eski 12px'te kalır.
  assert.match(dashboard, /@media\(max-width:900px\)\{main,\.view,\.page-head,\.home-heading,\.widget-board,\.widget-rail\{min-width:0\}#home \.page-head\{display:block;margin-bottom:var\(--home-head-gap,12px\)\}/);
  // Dar ekranda blok akış korunur: ortalama yalnız üç sütunlu ızgaranın kuralı, burada sola döner.
  assert.match(dashboard, /#home \.page-head\{display:block;margin-bottom:var\(--home-head-gap,12px\)\}#home \.home-heading\{text-align:left\}/);
  // Kare döşeme dar ekranda da iki sütunun altına düşmez: tek sütunda dev kare oluşurdu.
  assert.match(dashboard, /#home \.group-control-grid\{--group-tile-span:2;grid-template-columns:repeat\(auto-fill,minmax\(clamp\(112px,26vw,150px\),1fr\)\)\}/);
  assert.match(
    dashboard,
    /@media\(orientation:portrait\) and \(max-width:560px\)\{main\{--page-gutter:14px;padding:12px var\(--page-gutter\) 96px\}/
  );
  assert.match(dashboard, /#home \.home-actions\{display:flex;justify-content:flex-end;gap:10px\}/);
  assert.match(dashboard, /#home \.home-actions button,body\[data-active-view="home"\] #home \.home-actions button,#refreshButton\{[^}]*background:transparent;box-shadow:none\}/);
  // Dikeyde de aynı dokunma hedefi: yuvarlak ama en az 60px.
  assert.match(dashboard, /#home \.home-actions button,body\[data-active-view="home"\] #home \.home-actions button\{width:var\(--head-action-h\);height:var\(--head-action-h\);min-width:var\(--head-action-h\)\}/);
  // Menü düğmesi eylem grubundan çıktı; dikey kipteki sade daire biçimini yitirmesin.
  assert.match(
    dashboard,
    /body\[data-active-view="home"\] #home \.page-head>\.app-menu-button\{width:var\(--head-action-h\);height:var\(--head-action-h\);min-width:var\(--head-action-h\);border:0;border-radius:50%;color:var\(--ink\);background:transparent;box-shadow:none\}/,
  );
  assert.match(dashboard, /id="addWidget" class="secondary"><svg class="home-action-glyph"/);
  assert.match(dashboard, /id="editDashboardLabel" class="home-action-label"/);
  // Üç başlık düğmesi parmak hedefi: en az 60px yükseklik, ekranla orantılı genişlik ve
  // aralarında görünür boşluk. `#refreshButton` araç çubuğunda kaldığı için 46px kalır.
  assert.match(dashboard, /--head-action-h:clamp\(60px,9\.4vh,64px\);--head-action-w:clamp\(72px,8\.6vw,96px\);--head-action-gap:clamp\(12px,1\.6vw,20px\)/);
  assert.match(dashboard, /@media\(orientation:landscape\) and \(max-height:900px\),\(orientation:landscape\) and \(min-width:1000px\)\{#devices \.toolbar\{padding-block:clamp\(6px,1\.1vh,10px\) clamp\(9px,1\.7vh,14px\);margin-bottom:8px\}#home \.home-actions\{gap:var\(--head-action-gap\)\}#home \.home-actions button,#refreshButton\{[^}]*background:var\(--forest-soft\)/);
  assert.match(dashboard, /#refreshButton\{width:46px;height:46px;min-width:46px\}#home \.home-actions button\{width:var\(--head-action-w\);height:var\(--head-action-h\);min-width:var\(--head-action-w\);border-radius:999px\}/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.home-actions button\{color:var\(--forest\);border-color:var\(--home-border\);background:var\(--home-control\);box-shadow:var\(--home-float-shadow\)\}/);
  // Başlık satırının alt boşluğu sabit px değil: `--home-head-gap` ile oransal verilir, burada
  // yalnız hizalama kalır — düğmelerle kart panosu arasındaki nefes payı tek yerden yönetilir.
  assert.match(dashboard, /#home \.page-head\{align-items:center\}/);
  assert.doesNotMatch(dashboard, /#home \.page-head\{align-items:center;margin-bottom:4px\}/);
  assert.match(dashboard, /\.hub-time\{display:block;color:var\(--ink\);font:750 var\(--hub-time-size\)\/1 system-ui,sans-serif/);
  assert.match(dashboard, /\.hub-w-temp\{display:block;color:var\(--ink\);font:750 clamp\(31px,6\.2vh,49px\)\/1 system-ui,sans-serif/);
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
  // Sinyal metriği artık cihaz başına saklanan LQI'yi okur: doğrudan kipte değer durumda yoktur.
  assert.match(dashboard, /\.filter\(device=>rawLinkQuality\(device\)!==null\)\s*\.sort\(\(a,b\)=>rawLinkQuality\(a\)-rawLinkQuality\(b\)\)/);
  assert.doesNotMatch(dashboard, /Number\(a\.state\.linkquality\)/);
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
  assert.match(dashboard, /data-home-tab=/);
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
  assert.match(dashboard, /class="quick-card home-tab\$\{selected\?" selected":""\}" type="button" role="tab"/);
  assert.match(dashboard, /const shown=pending\?!controlAction\.active:controlAction\?\.active===true/);
  assert.match(dashboard, /class="group-control-tile \$\{visualState\}\$\{pending\?" pending":""\}\$\{failed\?" command-failed":""\}"/);
  assert.match(dashboard, /\.device-card\.command-failed,\.group-control-tile\.command-failed\{border-color:var\(--danger\)/);
  // Döşemenin hata işareti tek cihaz komut yolundan gelir; toplu güç düğmesi kalktığı için
  // gruba yayılan hata döngüsü artık yok.
  assert.match(dashboard, /const failed=commandFailed\(device\.id\)/);
  assert.doesNotMatch(dashboard, /for\(const \{device\} of entries\)flagCommandError\(device\.id\)/);
  assert.doesNotMatch(dashboard, /class="quick-state /);
  assert.match(dashboard, /const lowBatteryThreshold=\(\)=>state\.settings\?\.alerts\?\.lowBatteryThreshold\?\?15/);
  assert.match(dashboard, /const linkQualityPercent=device=>/);
  assert.match(dashboard, /class="device-name-row"><div class="device-name">\$\{esc\(device\.name\)\}<\/div><\/div>/);
  assert.match(dashboard, /const cardToggle=deviceCardToggle\(device,preparing\)/);
  assert.match(dashboard, /class="device-link-level\$\{tone\?`\ \$\{tone\}`:""\}"/);
  assert.match(dashboard, /\.device-link-level\.strong\{color:#24805a/);
  assert.match(dashboard, /\.device-link-level\.weak\{color:var\(--danger\)/);
  assert.match(dashboard, /\.quick-control-widget\{[^}]*padding:12px 10px 4px[^}]*border-radius:16px[^}]*background:var\(--surface\)[^}]*box-shadow:var\(--card-shadow\)/);
  assert.match(dashboard, /\.quick-control-widget \.quick-card\{min-height:56px;padding:5px 12px\}/);
  assert.match(dashboard, /class="quick-device-icon"/);
  assert.match(dashboard, /\.quick-grid\.grid-view\{display:flex;align-items:stretch;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto/);
  assert.match(dashboard, /\.quick-grid\.grid-view \.quick-card\{width:max-content;min-width:144px;flex:0 0 auto;aspect-ratio:auto;scroll-snap-align:start\}/);
  assert.match(dashboard, /\.quick-grid \.device-name\{display:block;min-width:0;overflow:visible;text-overflow:clip;white-space:nowrap;font-size:15px\}/);
  assert.match(dashboard, /\.quick-grid\.grid-view \.quick-card\{width:max-content;min-width:144px;flex-basis:auto\}/);
  assert.doesNotMatch(dashboard, /\.quick-grid \.device-name\{[^}]*text-overflow:ellipsis/);
  // Şerit artık cihaz kısayolu basmıyor: eski hızlı erişim işleyişi tamamen kalktı.
  assert.doesNotMatch(dashboard, /quickDeviceHtml|quickEmptyHtml|data-quick-controls|data-quick-empty-action/);
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
  assert.match(dashboard, /#home \.widget-board\.editing \[data-widget="quick"\]\{height:84px\}/);
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
  assert.match(dashboard, /const reload=\[refresh\(\),loadHomeGroups\(\),loadHomeVisibility\(\),loadAutomations\(\),loadHomeLocation\(\)\]/);
  assert.match(dashboard, /await Promise\.allSettled\(startup\);\s*await migrateLocalGroups\(\)/);
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
  assert.match(dashboard, /const attentionDevices=tableMode\?\[\]:devices\.filter\(deviceNeedsAttention\)/);
  assert.match(dashboard, /\$\("#attentionDeviceCount"\)\.textContent=String\(attentionDevices\.length\)/);
  assert.match(dashboard, /const deviceRoomsHtml=device=>\{\s*if\(!state\.groups\.length\)return""/);
  assert.match(dashboard, /const member=deviceInRoom\(device,group\.id\)/);
  assert.match(dashboard, /data-toggle-room="\$\{esc\(group\.id\)\}" data-room-device="\$\{esc\(device\.id\)\}" aria-pressed="\$\{member\}"/);
  assert.match(dashboard, /\$\{deviceRoomsHtml\(device\)\}\s*\$\{deviceVisibilityHtml\(device\)\}\s*<details class="technical-details"/);
  // Kontrolü olmayan cihazın döşemesi de Cihazlar sayfasından geri getirilebilir.
  assert.match(dashboard, /const deviceVisibilityHtml=device=>\{\s*if\(device\.controls\.some\(isDashboardControl\)\)return""/);
  assert.match(dashboard, /async function toggleDeviceRoom\(deviceId,groupId\)\{/);
  assert.match(dashboard, /items:member\?item\.items\.filter\(entry=>entry\.deviceId!==deviceId\):\[\.\.\.item\.items,\{deviceId,controlId\}\]/);
  assert.match(dashboard, /const controlId=control\?control\.id:groupDeviceControlId/);
  assert.match(dashboard, /await persistHomeGroups\(groups\);\s*if\(\$\("#deviceDetailDialog"\)\.open\)renderDeviceDetail\(\)/);
  assert.match(dashboard, /\$\$\("\[data-toggle-room\]"\)\.forEach\(button=>button\.onclick=\(\)=>toggleDeviceRoom\(button\.dataset\.roomDevice,button\.dataset\.toggleRoom\)\)/);
  assert.match(dashboard, /\.room-membership\.active\{border-color:var\(--forest\);color:var\(--on-forest\);background:var\(--forest\)\}/);
  assert.doesNotMatch(dashboard, /data-toggle-room[^>]*data-admin-only/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \[data-widget="activity"\] \.widget-list-row\{background:transparent;box-shadow:none\}/);
  assert.match(dashboard, /#homeTabs\{cursor:grab\}#homeTabs\.mouse-dragging,#homeTabs\.mouse-dragging \*\{cursor:grabbing!important\}/);
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
  // Yatay kipte sayfa dikey kayar: gövde/main artık kesilmiyor, hızlı erişim şeridi altta sabit duruyor.
  assert.doesNotMatch(dashboard, /body\[data-active-view="home"\]\{overflow:hidden\}/);
  assert.doesNotMatch(dashboard, /body\[data-active-view="home"\] main\{height:100vh/);
  assert.match(dashboard, /id="widgetRail" class="widget-rail"/);
  assert.match(dashboard, /#home \.widget-board\{flex:1 1 auto;min-height:150px;max-height:660px;display:grid;grid-template-columns:var\(--hub-column\) minmax\(0,1fr\);grid-template-rows:minmax\(0,1fr\);gap:10px\}/);
  assert.doesNotMatch(dashboard, /#home \[data-widget="status"\]/);
  assert.match(dashboard, /#home \[data-widget="quick"\]\{position:fixed;z-index:9;left:var\(--strip-inset\);right:var\(--strip-inset\);bottom:calc\(12px \+ env\(safe-area-inset-bottom\)\);grid-column:auto;grid-row:auto;height:136px;min-width:0;overflow:hidden\}/);
  assert.match(
    dashboard,
    /#home \.quick-grid\.grid-view,#home \.quick-grid\.grid-view \.quick-card,#home \.strip-row>\.quick-card-add,#home \.strip-row>\.quick-scroll-hint\{height:56px\}/
  );
  // Hub arka katmanda: rail tüm panoyu kaplar, hub sütunu kadar dolgusu var ve üstünden kayar.
  assert.match(dashboard, /#home \.widget-rail\{position:relative;z-index:1;grid-column:1\/-1;grid-row:1;padding-left:calc\(var\(--hub-column\) \+ 10px\);scroll-padding-left:calc\(var\(--hub-column\) \+ 10px\);pointer-events:none;height:100%;display:grid;grid-template-columns:repeat\(3,var\(--rail-column\)\)/);
  // Rail'in kendisi tıklamayı yutmaz; yalnız kartlar yakalar, böylece açıktaki hub tıklanabilir kalır.
  assert.match(dashboard, /#home \.widget-rail>\*\{pointer-events:auto\}/);
  assert.match(dashboard, /#home \.widget-scroll-hint\.scroll-hint-left\{left:6px\}/);
  assert.match(dashboard, /grid-auto-columns:var\(--rail-column\)/);
  assert.match(dashboard, /#home \.widget-rail \.group-widget\{grid-column:span 2;/);
  // "Ev hareketleri" bir kademe geniş: olay satırları sıkışmasın.
  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 2\}/);
  assert.match(dashboard, /const rail=\$\("#widgetRail"\)/);
  // Yerinde duran kart taşınmaz: `insertBefore` kabı DOM'dan çıkarıp kaydırma konumunu sıfırlıyordu.
  assert.match(dashboard, /placeNode\(rail,widget,\$\("#widgetEmpty"\)\)/);
  assert.match(dashboard, /\$\$\("#widgetRail \[data-widget\]"\)/);
  assert.match(dashboard, /\.group-widget\{grid-column:span 6;padding:22px/);
  // Döşeme kare ve dikey: ikon üstte, isim sarabilir, kırpma yok.
  assert.match(dashboard, /\.group-control-tile\{min-width:0;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;/);
  assert.match(dashboard, /\.group-control-slot\.is-wide>\.group-control-tile\{aspect-ratio:2\/1\}/);
  assert.match(dashboard, /\.group-control-tile strong\{display:block;overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;/);
  assert.doesNotMatch(dashboard, /const deviceVisual=device=>/);
  assert.match(dashboard, /class="group-control-visual">\$\{deviceStatusIcon\(device,\{label:statusLabel,tone:statusTone\}\)\}<\/div><div class="group-control-copy"><strong>\$\{esc\(name\)\}<\/strong><small>\$\{esc\(statusLabel\)\}<\/small><\/div>/);
  assert.match(dashboard, /const primaryStatus=primaryStatusForDevice\(device,preparing\);\s*const statusLabel=preparing\?t\("preparing"\)/);
  assert.match(dashboard, /const label=controlAction\?`\$\{name\} · \$\{statusLabel\} · /);
  assert.match(dashboard, /\.group-control-visual\{width:46px;height:46px;flex:none\}/);
  assert.match(dashboard, /\.group-control-copy small\{display:block;margin-top:4px;overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere/);
  assert.match(dashboard, /\.group-control-tile\.on \.group-control-visual \.device-status-icon\{color:#7d5210/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.group-control-tile\.alert \.group-control-visual \.device-status-icon\{color:#ffc0ba/);
  assert.match(dashboard, /const deviceTypeIcon=\(device,control\)=>/);
  assert.match(dashboard, /function bindGroupControls\(\)\{\s*bindDeviceImages\(\)/);
  // Saat ve hava widget kataloğundan çıktı; hub bloğu her zaman açık, kaldırılamaz.
  assert.doesNotMatch(dashboard, /clock:\{title:"worldClock",lead:"worldClockLead"\}/);
  assert.doesNotMatch(dashboard, /weather:\{title:"weather",lead:"weatherLead"\}/);
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
  // Panel düz HTTP ile servis ediliyor: `navigator.geolocation` güvenli köken şartını karşılamıyor,
  // "mevcut konumu kullan" her zaman sessizce "izin verilmedi"ye düşüyordu. Ölü düğme kaldırıldı.
  assert.doesNotMatch(dashboard, /navigator\.geolocation/);
  assert.doesNotMatch(dashboard, /useCurrentWeatherLocation|requestWeatherLocation/);
  assert.doesNotMatch(dashboard, /weatherUseLocation|weatherCurrentLocation|weatherLocationDenied/);
  assert.doesNotMatch(dashboard, /setInterval\(renderWorldClock,60000\)/);
  assert.match(dashboard, /function scheduleWorldClockTick\(\)\{\s*setTimeout\(\(\)=>\{tickWorldClock\(\);scheduleWorldClockTick\(\)\},1000-new Date\(\)\.getMilliseconds\(\)\+20\)/);
  assert.match(dashboard, /const localTimeZone=\(\(\)=>\{try\{return Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone\|\|"UTC"\}catch\{return "UTC"\}\}\)\(\)/);
  assert.match(dashboard, /\{id:"default-local",label:"clockLocal",name:"Local time",country:"",timeZone:localTimeZone\}/);
  // Hub yeniden iki şehir yazıyor; tam liste yine #clockDialog'da.
  assert.match(dashboard, /id="hubCities" class="hub-cities"/);
  assert.match(dashboard, /id="clockDialogRows" class="hub-rows"/);
  assert.match(dashboard, /time\.firstChild\.nodeValue=zoneTime\(now\)/);
  assert.match(dashboard, /<span id="hubTime" class="hub-time">--:--<span id="hubSeconds" class="hub-seconds"><\/span><\/span>/);
  assert.match(dashboard, /\.home-hub\{--hub-time-size:clamp\(44px,9\.9vh,86px\)/);
  assert.doesNotMatch(dashboard, /clock-primary|clock-row|weather-facts|renderSelectedClockCities/);
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
  assert.match(dashboard, /function scrollHomeTabs\(direction\)\{scrollDashboardRow\(\$\("#homeTabs"\),direction,120,\.55\)\}/);
  assert.match(dashboard, /#home \.widget-scroll-hint\{position:absolute;top:calc\(50% - 24px\);width:38px;height:48px;border-radius:15px\}/);
  // Şerit okları artık şeridin düzeninin parçası: mutlak konum yok, genişlikleri kendilerine ayrılmış.
  assert.match(
    dashboard,
    /#home \.strip-row>\.quick-scroll-hint\{position:static;flex:0 0 auto;width:clamp\(40px,4\.2vw,52px\);min-width:40px;border-radius:999px\}/
  );
  assert.doesNotMatch(dashboard, /#home \.quick-scroll-hint\.scroll-hint-left\{left:4px\}/);
  assert.doesNotMatch(dashboard, /#home \.quick-scroll-hint\.scroll-hint-right\{right:4px\}/);
  // Gizliyken yerini korur: `display:none` şeridi her kaydırmada zıplatıyordu.
  assert.match(dashboard, /#home \.strip-row>\.quick-scroll-hint\[hidden\]\{visibility:hidden;pointer-events:none\}/);
  assert.doesNotMatch(dashboard, /#home \.widget-scroll-hint\[hidden\],#home \.quick-scroll-hint\[hidden\]\{display:none\}/);
  assert.match(dashboard, /#home \.widget-scroll-hint\[hidden\]\{display:none\}/);
  // Okların rengi şeridin "+" düğmesiyle aynı dilde: koyu yeşil cam yerine orman yeşili gövde.
  assert.match(
    dashboard,
    /#home \.widget-scroll-hint,#home \.quick-scroll-hint\{z-index:8;display:grid;place-items:center;padding:0;border:1px solid var\(--forest\);color:var\(--on-forest\);background:var\(--forest\);box-shadow:0 8px 18px rgba\(24,77,59,\.2\)\}/
  );
  assert.doesNotMatch(dashboard, /background:rgba\(20,48,38,\.8\)/);
  assert.doesNotMatch(dashboard, /scroll-hint-pulse/);
  // Sekmenin kendisi buton: eski "karta dokun, içindeki butonu tıkla" sarmalayıcısı kalktı.
  assert.doesNotMatch(dashboard, /if\(!event\.target\.closest\("button,input"\)\)toggle\(\)/);
  assert.doesNotMatch(dashboard, /if\(!event\.target\.closest\("button,input"\)\)openLightControls/);
  assert.match(dashboard, /id="deviceActionDialog"/);
  assert.match(dashboard, /data-i18n="showDetails">Show Details/);
  assert.match(dashboard, /id="confirmDeviceAction" class="danger-button" type="button" data-i18n="confirmAction" hidden/);
  assert.match(dashboard, /if\(control\.kind==="lock"\)return action\.active===true\?"confirmUnlockDevice":""/);
  assert.match(dashboard, /if\(control\.kind==="siren"\)return action\.active===true\?"":"confirmSirenDevice"/);
  assert.match(dashboard, /function runDashboardCommand\(button,deviceId,property,value\)\{\s*const messageKey=button\?\.dataset\.confirmCommand;\s*if\(messageKey\)\{confirmDashboardCommand\(deviceId,property,value,messageKey\);return\}/);
  assert.match(dashboard, /\$\$\("\[data-command-value\]"\)\.forEach\(button=>button\.onclick=\(\)=>runDashboardCommand\(button,button\.dataset\.device,button\.dataset\.property,JSON\.parse\(button\.dataset\.commandValue\)\)\)/);
  assert.match(dashboard, /\$\$\("\[data-group-device\]"\)\.forEach\(button=>button\.onclick=\(\)=>runDashboardCommand\(button,button\.dataset\.groupDevice/);
  // Onay diyaloğu tek cihaz komutunu taşır; toplu güç düğmesi kalktığı için grup dalı yok.
  assert.match(dashboard, /\$\("#confirmDeviceAction"\)\.onclick=\(\)=>\{const pending=state\.pendingConfirm;\$\("#deviceActionDialog"\)\.close\(\);if\(!pending\)return;command\(pending\.id,pending\.property,pending\.value\)\}/);
  assert.match(dashboard, /confirmUnlockDevice:"Unlock \{name\}\? The door will open\."/);
  assert.match(dashboard, /confirmUnlockDevice:"\{name\} kilidi açılsın mı\? Kapı açılacak\."/);
  assert.match(dashboard, /const longPressDelay=560/);
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openDeviceDetail\(card\.dataset\.groupDevice\)\)/);
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
  // Toplu güç düğmesi kartın başlığından kalktı; başlıkta yalnız grup düzenleme düğmesi durur.
  assert.doesNotMatch(dashboard, /data-group-power=/);
  assert.doesNotMatch(dashboard, /groupPowerIcon/);
  assert.match(dashboard, /const groupEditIcon=.*class="group-action-svg"/);
  // Kalem yerine liste: panelde zaten kullanılan üç çubuk yolu, kendi görsel dilini açmıyor.
  assert.match(dashboard, /const groupEditIcon=\(\)=>'<svg class="group-action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"\/><\/svg>'/);
  assert.doesNotMatch(dashboard, /const groupEditIcon=[^\n]*M4 20h4L19 9l-4-4L4 16v4Z/);
  // Davranış değişmedi: düğme hâlâ grup düzenleyicisini açar, etiketi de bunu söyler.
  assert.match(dashboard, /data-edit-group="\$\{esc\(group\.id\)\}" aria-label="\$\{t\("editGroup"\)\}">\$\{groupEditIcon\(\)\}/);
  assert.match(dashboard, /editGroup:"Edit group"/);
  assert.match(dashboard, /editGroup:"Grubu düzenle"/);
  assert.match(dashboard, /createDeviceGroup:"Create device group"/);
  assert.match(dashboard, /createDeviceGroup:"Cihaz grubu oluştur"/);
  assert.match(dashboard, /data-widget-move="left">←/);
  assert.match(dashboard, /data-widget-move="right">→/);
  assert.match(dashboard, /data-widget-remove/);
  assert.match(dashboard, /moveWidgetLeft:"Move widget left"/);
  assert.match(dashboard, /moveWidgetRight:"Widget’ı sağa taşı"/);
  assert.match(dashboard, /direction==="left"\?-1:1/);
  assert.match(dashboard, /\.group-control-tile:focus-visible,\.widget-edit-controls button:focus-visible,\.home-actions button:focus-visible\{outline:3px solid var\(--forest-soft\);outline-offset:2px\}/);
  // Fotoğraf kalktı: ana ekranın halkası da panelin normal `--forest-soft` halkası.
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.home-actions button:focus-visible\{outline:3px solid var\(--forest-soft\);outline-offset:2px\}/);
  assert.match(dashboard, /scrollIntoView\(\{behavior:reducedMotion\(\)\?"auto":"smooth",block:"nearest",inline:"center"\}\)/);
  assert.match(dashboard, /classList\.add\("widget-moved"\)/);
  assert.match(dashboard, /@keyframes widget-moved-pulse/);
  // Grup sekmesindeki kart da düzenleme yüzeyi: aynı kesikli kenarlığı alır.
  assert.match(dashboard, /\.widget-board\.editing \.dashboard-widget,\.widget-board\.editing \.group-panel\{outline:2px dashed var\(--forest\);outline-offset:4px\}/);
  assert.match(dashboard, /const dashboardEditingIdleDelay=60000/);
  assert.match(dashboard, /function touchDashboardEditing\(\)\{[\s\S]*?if\(!state\.dashboardEditing\)return/);
  assert.match(dashboard, /if\(state\.dashboardEditing\)setDashboardEditing\(false\)/);
  assert.match(dashboard, /function setDashboardEditing\(enabled\)\{\s*state\.dashboardEditing=Boolean\(enabled\);\s*applyWidgetLayout\(\);\s*touchDashboardEditing\(\);\s*\}/);
  assert.match(dashboard, /function activateView\(viewName\)\{\s*closeAppMenu\(\);\s*if\(viewName!=="home"&&state\.dashboardEditing\)setDashboardEditing\(false\)/);
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  assert.match(dashboard, /defaultDashboardWidgets=\["quick","summary","availability","activity"\]/);
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
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("günlük cihaz tipleri göster/gizle, Quick Control ve dashboard gruplarında kullanılabilir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /dashboardControlKinds=new Set\(\["switch","fan","siren","cover","position","lock","climate"\]\)/);
  assert.match(dashboard, /const dashboardControlForDevice=/);
  assert.match(dashboard, /const dashboardControlAction=/);
  assert.match(dashboard, /const mainControl=dashboardControlForDevice\(device\)/);
  // Görünürlük Genel görünüm kartını süzüyor: kayıt yalnız gizlenenleri tutar, varsayılan görünür.
  assert.match(dashboard, /const visible=entries\.filter\(entry=>!isTileHidden\(entry\.device\.id,entry\.control\?entry\.control\.id:null\)\)/);
  assert.match(dashboard, /const visibilityButton=\(device,control\)=>\{/);
  assert.match(dashboard, /class="visibility-toggle\$\{hidden\?" is-hidden":""\}" type="button" role="switch" aria-checked="\$\{hidden\?"false":"true"\}"/);
  assert.match(dashboard, /\$\{isDashboardControl\(control\)\?visibilityButton\(device,control\):""\}/);
  // Yıldız/favori anlamı arayüzden tamamen kalktı: çift anlam kalmadı.
  assert.doesNotMatch(dashboard, /favorite-main|favoriteButton|fav-star|isFavorite|loadFavorites/);
  assert.doesNotMatch(dashboard, /dashboardControlForDevice\(device\)\?\.id!==control\.id/);
  assert.match(dashboard, /const controls=device\.controls\.filter\(isDashboardControl\)/);
  assert.match(dashboard, /data-group-command-value=/);
  assert.match(dashboard, /JSON\.parse\(button\.dataset\.groupCommandValue\)/);
  // Toplu güç düğmesiyle birlikte grup komutu yolu da kalktı: yalnız tek döşeme komutu var.
  assert.doesNotMatch(dashboard, /groupPowerControl/);
  assert.doesNotMatch(dashboard, /matchingZigbeePowerGroup/);
  assert.doesNotMatch(dashboard, /api\(`\/api\/groups\/\$\{encodeURIComponent\(zigbeeGroup\.id\)\}\/command`/);
  assert.match(dashboard, /data-ota-check=/);
  assert.match(dashboard, /function checkOta\(id\)/);
  assert.match(dashboard, /\/ota-check`/);
  assert.doesNotMatch(dashboard, /const controllable=devices\.filter\(device=>device\.controls\.some\(control=>control\.kind==="switch"\)\)/);
  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("ana ekran tipografi ve genişlik kuralları yükseklikten bağımsız yatay bloktadır", async () => {
  const dashboard = await readDashboardBundle();
  // Grup (b): her yatay ekranda (tablet + bilgisayar) geçerli olan tipografi/genişlik kuralları.
  assert.match(dashboard, /@media\(orientation:landscape\)\{#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 5\}#home \.widget-card:not\(\.group-widget\) h2\{font:750 15px\/1\.2 system-ui,sans-serif;letter-spacing:\.06em;text-transform:uppercase;color:var\(--muted\)\}#home \.widget-card>p\{display:none\}#home \.widget-list-row\{padding-top:9px;font-size:20px\}#home \.widget-list-row strong\{font-weight:750\}#home \.widget-list-row span\{font-size:17px\}#home \.group-summary span\{font-size:17px\}#home \.summary-row strong\{font-size:44px\}#home \.summary-row span\{font-size:16px\}#home \.summary-row em\{font-size:17px\}#home \.widget-value strong\{font-size:46px\}#home \.widget-value span\{font-size:14px\}#home \.widget-facts \.fact\{font-size:14px\}#home \.quick-battery\{font-size:14px\}#home \[data-widget="activity"\] \.widget-list-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:baseline;gap:2px 10px;font-size:17px\}#home \[data-widget="activity"\] \.widget-list-row strong\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}#home \[data-widget="activity"\] \.widget-list-row time\{color:var\(--muted\);font-size:14px\}#home \[data-widget="activity"\] \.widget-list-row span\{grid-column:1\/-1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px\}\}/);
  // Grup (b) bloğu, dar dikey alan bloğundan ÖNCE gelmeli ki tablette (a) kuralları hâlâ kazansın.
  const landscapeBlock = dashboard.indexOf("@media(orientation:landscape){#home .widget-rail [data-widget=\"activity\"]");
  const shortBlock = dashboard.indexOf("@media(orientation:landscape) and (max-height:900px),(orientation:landscape) and (min-width:1000px){body[data-active-view=\"home\"] main{padding-bottom:");
  assert.ok(landscapeBlock > 0 && shortBlock > landscapeBlock);
  // Grup (a): iki sütunlu yerleşim, rail sığdırma ve sıkışık boşluklar yükseklik koşuluna bağlı kalır.
  assert.match(dashboard, /@media\(orientation:landscape\) and \(max-height:900px\),\(orientation:landscape\) and \(min-width:1000px\)\{body\[data-active-view="home"\] main\{padding-bottom:calc\(106px \+ env\(safe-area-inset-bottom\)\)\}/);
  // Ana ekran sütun akışı: pano kalan yüksekliği alır, kartlar şeride kadar uzar.
  assert.match(dashboard, /#home\.active\{min-height:0;display:flex;flex-direction:column;height:calc\(100dvh - var\(--home-top\) - 106px - env\(safe-area-inset-bottom\)\)\}/);
  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 2\}/);
  // Ölçüler dar yatayda da viewport'tan türer: cihaz listesi değil formül karar verir.
  assert.match(dashboard, /#home \.home-hub\{--hub-time-size:clamp\(39px,8\.6vh,68px\);--hub-gap:clamp\(5px,1vh,10px\);--hub-pad-y:clamp\(4px,\.9vh,10px\);grid-column:1;grid-row:1;z-index:0;min-height:0;margin-top:0;max-height:100%;overflow:auto;scrollbar-width:none;transition:opacity \.18s ease\}/);
  assert.match(dashboard, /#home \.hub-date\{margin-top:clamp\(3px,\.7vh,6px\);font-size:clamp\(16px,2\.4vh,20px\)\}/);
  // Günlük tahmin satırları hub'da yok; şehir satırları geri geldi ve kırpma kuralı onlara ait.
  assert.doesNotMatch(dashboard, /hub-days|class="hub-day"/);
  assert.match(dashboard, /#home \.hub-city\{min-height:0;padding:clamp\(2px,\.5vh,5px\) 0\}/);
  assert.match(dashboard, /#home \.hub-hint\{display:none\}/);
  assert.match(dashboard, /#home \.group-summary\{margin-top:7px\}#home \.home-summary\{gap:14px;margin-top:12px\}#home \.widget-value\{margin-top:14px\}/);
  // Yükseklik koşullu blok artık tipografi kurallarını içermemeli.
  const shortBlockBody = dashboard.slice(shortBlock, dashboard.indexOf("\n", shortBlock));
  assert.doesNotMatch(shortBlockBody, /#home \.widget-list-row\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.widget-list-row strong\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.summary-row strong\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.widget-value strong\{/);
  assert.doesNotMatch(shortBlockBody, /#home \.widget-card:not\(\.group-widget\) h2\{/);
});

test("yatay kip masaüstünü de kapsar, telefon dikey kalır", async () => {
  const dashboard = await readDashboardBundle();

  // Yatay kipin her bloğu aynı ikiliyi taşır: kısa ekran VEYA geniş ekran.
  const gates = dashboard.match(/@media\(orientation:landscape\)[^{]*\(min-width:1000px\)[^{]*\{/g) ?? [];
  assert.ok(gates.length >= 5, `yatay kip eşiği eksik: ${gates.length}`);
  // Genişletilen bloklar: ana kabuk, ana ekran yerleşimi, şerit ölçüleri, hareket kısıtı, başlık eylemleri.
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(min-width:901px\) and \(max-height:900px\),\(orientation:landscape\) and \(min-width:1000px\)\{\.topbar\{display:none\}main\{--page-gutter:20px;max-width:none;padding:14px var\(--page-gutter\) 20px\}/
  );
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(max-height:900px\),\(orientation:landscape\) and \(min-width:1000px\)\{#home \[data-widget="quick"\]\{height:76px\}/
  );
  // Uzun masaüstü ekranında kart tavanı ekranla orantılı — sabit px değil.
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(min-width:1000px\) and \(min-height:901px\)\{#home \.widget-board\{max-height:min\(78vh,860px\)\}\}/
  );
  // Kısa ekranların (tablet 640, dizüstü 800) 660px tavanı yerinde kalır.
  assert.match(dashboard, /#home \.widget-board\{flex:1 1 auto;min-height:150px;max-height:660px/);
  // Telefon varsayımı koda yazılı: portre dikey kalır, çevirme yolu tek koşul.
  assert.match(dashboard, /VARSAYIM[\s\S]{0,400}TELEFON DİKEY KALIR/);
  assert.match(dashboard, /YATAY KİP EŞİĞİ/);
  // Portre bloğu yatay kipe karışmaz: telefon dikey akışını `orientation:landscape` koruyor.
  assert.doesNotMatch(dashboard, /@media\(orientation:portrait\)[^{]*\(min-width:1000px\)/);
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
  assert.match(dashboard, /closeScreensaver\(\);\s*scheduleScreensaver\(\);\s*scheduleIdleHomeReturn\(\);\s*\}\s*function showDevice\(id,options=\{\}\)\{/);
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
  assert.match(dashboard, /const groupBoxes=dashboardGroups\(\)\.map\(group=>/);
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
  // Activity widget'ı tablette bir kademe geniş: olay satırları sıkışmıyor, diğer kartlar tek sütun.
  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 2\}/);
  assert.match(dashboard, /#home \.widget-rail \.widget-card\{grid-row:1;grid-column:span 1/);
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

  // Otomasyon menüden çıktı, ana ekranın dördüncü hızlı düğmesi oldu: menü alt sayfalardan
  // kalkınca "Ayarlar → Otomasyonlar" iki dokunuş olacaktı; şimdi tek dokunuş.
  assert.doesNotMatch(dashboard, /class="nav-button"[^>]*data-view="automations"/);
  assert.match(dashboard, /<button id="homeAutomations" class="quiet" type="button" data-view-link="automations" data-admin-only><svg class="home-action-glyph"/);
  assert.match(dashboard, /id="homeAutomations"[\s\S]{0,300}?<span class="home-action-label" data-i18n="navAutomations">/);
  assert.match(dashboard, /navAutomations:"Automations"/);
  assert.match(dashboard, /navAutomations:"Otomasyon"/);
  // Menü sol hücreye çıktı; sağ hücrede üç eylem kaynak sırasında: Ekle · Düzenle · Otomasyon.
  assert.match(dashboard, /<div class="home-actions"><button id="addWidget"[\s\S]*?<button id="editDashboard"[\s\S]*?<button id="homeAutomations"[\s\S]*?<\/div><\/header>/);
  // Menü düğmesi `.home-actions` içinde DEĞİL: sağ grup yalnız üç eylemden oluşur.
  const homeActionsBlock = dashboard.slice(
    dashboard.indexOf('<div class="home-actions">'),
    dashboard.indexOf('<div class="home-actions">') + dashboard.slice(dashboard.indexOf('<div class="home-actions">')).indexOf("</div></header>"),
  );
  assert.ok(!homeActionsBlock.includes("app-menu-button"), "menü düğmesi hâlâ eylem grubunda");
  assert.equal(homeActionsBlock.match(/<button /g)?.length, 3);

  // Sayfa ve iki yollu giriş; yol seçimi artık sayfada değil, sihirbaz modalinin ilk adımında.
  assert.match(dashboard, /<section id="automations" class="view" data-admin-only>/);
  assert.match(dashboard, /id="newAutomation" class="primary page-action-tile"/);
  // Görsel dil birliği biçimden gelir; davranış kancası `add-device` asla verilmez.
  assert.doesNotMatch(dashboard, /id="newAutomation"[^>]*add-device/);
  assert.doesNotMatch(dashboard, /id="automationPaths"/);
  // Yol seçimi satır dilinde: çerçeveli kart yok, ikon + metin satırı var.
  assert.match(dashboard, /data-automation-path="link"/);
  assert.match(dashboard, /data-automation-path="rule"/);
  assert.match(dashboard, /\{glyph:"⚡",title:t\("simpleLinkPath"\),sub:t\("simpleLinkPathLead"\),hook:'data-automation-path="link"'\}/);
  assert.doesNotMatch(dashboard, /\.automation-path\{/);
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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("saat kuralı sihirbazı akış rayında cihaz+özellik çiftini kaydeder", async () => {
  const dashboard = await readDashboardBundle();

  // "Kural kur" yolu açık; yerinde "Yakında" rozeti kalmadı.
  assert.match(dashboard, /\{glyph:"🧩",title:t\("rulePath"\),sub:t\("rulePathLead"\),hook:'data-automation-path="rule"'\}/);
  assert.doesNotMatch(dashboard, /data-automation-path="rule" disabled/);
  // "Yeni otomasyon" doğrudan modalı açar; yol seçimi akışın ilk adımıdır (stage "path").
  assert.match(dashboard, /\$\("#newAutomation"\)\.onclick=\(\)=>openAutomationWizard\(\)/);
  assert.match(dashboard, /stage:existing\?"name":"path",/);
  assert.match(dashboard, /const paths=wizard\.stage==="path";/);
  assert.match(dashboard, /\$\("#automationBody"\)\.innerHTML=paths\?automationPathHtml\(\):automationFlowHtml\(wizard\);/);
  assert.match(dashboard, /function chooseAutomationPath\(path\)\{[\s\S]*?if\(path==="link"\)\{openSimpleLink\(\);return\}[\s\S]*?wizard\.stage="kind"/);
  // İki diyalog üst üste binmez: bağlantı yolu seçilince sihirbaz kapanır.
  assert.match(dashboard, /const wizardDialog=\$\("#automationDialog"\);\s*if\(wizardDialog\.open\)wizardDialog\.close\(\);/);
  // Arkadaki liste görünmesin: sihirbazın backdrop'ı opak.
  assert.match(dashboard, /dialog\.automation-dialog::backdrop\{background:rgba\(12,26,20,\.94\)/);
  assert.match(dashboard, /automationPathTitle:"Bunu nasıl kurmak istersiniz\?"/);
  assert.match(dashboard, /automationPathTitle:"How do you want to set this up\?"/);
  // İlk adımda dönülecek yer yok: düğme kapatıyor, etiketi de "Vazgeç".
  assert.match(dashboard, /\$\("#automationBack"\)\.textContent=t\(paths\|\|wizard\.stage==="kind"\?"cancel":"back"\);/);
  assert.match(dashboard, /if\(!wizard\|\|wizard\.stage==="path"\|\|wizard\.stage==="kind"\)\{\$\("#automationDialog"\)\.close\(\);return\}/);

  // Sihirbaz kabuğu: tek gövde, tek birincil eylem.
  assert.match(dashboard, /<dialog id="automationDialog" class="automation-dialog">/);
  assert.match(dashboard, /id="automationBody"/);
  assert.match(dashboard, /id="automationNext" class="primary"/);
  // Adım sayacı yok: akış dört bölüm başlığıyla okunur.
  assert.doesNotMatch(dashboard, /automationStepCount/);
  assert.match(dashboard, /automationSectionWhen:/);
  assert.match(dashboard, /automationSectionCondition:"KOŞUL"/);
  assert.match(dashboard, /automationSectionThen:/);
  assert.match(dashboard, /automationWhenTitle:"Ne zaman çalışsın\?"/);
  assert.match(dashboard, /automationThenTitle:"Ne yapsın\?"/);

  // Tetikleyici satırları: beşi de etkin, "Yakında" rozeti kalmadı.
  assert.match(dashboard, /\{kind:"time",glyph:"🕐",label:"automationTriggerTime",ready:true\}/);
  assert.match(dashboard, /\{kind:"sun",glyph:"🌅",label:"automationTriggerSun",ready:true\}/);
  assert.match(dashboard, /\{kind:"button",glyph:"🔘",label:"automationTriggerButton",ready:true\}/);
  assert.match(dashboard, /\{kind:"sensor",glyph:"🚪",label:"automationTriggerSensor",ready:true\}/);
  assert.match(dashboard, /\{kind:"deviceState",glyph:"💡",label:"automationTriggerDeviceState",ready:true\}/);
  // Bu yol somut adıyla anılır: soyut "cihaz" değil, evdeki anahtar ve priz.
  assert.match(dashboard, /automationTriggerDeviceState:"Bir anahtar veya priz açılınca \/ kapanınca"/);
  assert.match(dashboard, /automationTriggerDeviceState:"When a switch or plug turns on or off"/);
  assert.doesNotMatch(dashboard, /automationTriggerDeviceState:"[^"]*(?:Bir cihaz açıl|a device turns on)/);
  assert.match(dashboard, /badge:entry\.ready\?null:t\("comingSoon"\)/);
  assert.match(dashboard, /option\.disabled\?' disabled aria-disabled="true"':""/);
  // Çerçeveli kart dili geri gelmedi: satır dili (`automation-opt`) kaldı.
  assert.doesNotMatch(dashboard, /\.automation-trigger\{/);
  assert.match(dashboard, /\.automation-opt\{width:100%;min-height:48px/);

  // Saat seçimi iri artır/azalt düğmeleriyle; sayısal klavye yok, dakika 5'er adım.
  assert.match(dashboard, /\$\{hook\}="\$\{name\}:\$\{amount\}"/);
  assert.match(dashboard, /automationTimeUnitHtml\("hour",hour,1,"automationHourUp","automationHourDown",hook\)/);
  assert.match(dashboard, /automationTimeUnitHtml\("minute",minute,5,"automationMinuteUp","automationMinuteDown",hook\)/);
  assert.match(dashboard, /function stepAutomationTime\(unit,amount\)\{/);
  assert.doesNotMatch(dashboard, /type="time"/);

  // Gün çipleri tek bileşen: saat, güneş ve saat aralığı koşulu aynı satırı kullanır.
  assert.match(dashboard, /const automationWeekDays=\[1,2,3,4,5,6,7\]/);
  assert.match(dashboard, /const automationDaysHtml=\(days,hook\)=>\{/);
  assert.match(dashboard, /automationDaysHtml\(wizard\.days,"data-automation-day"\)/);
  // Gün listesi kayıttan gelir: saat kuralında tetikleyiciden, güneş kuralında batış anından.
  assert.match(dashboard, /days:timed\?\[\.\.\.\(trigger\.days\|\|automationWeekDays\)\]\s*:sunset\?\[\.\.\.\(sunset\.days\|\|automationWeekDays\)\]:\[\.\.\.automationWeekDays\]/);
  // §9.1 — güneş yolu her zaman iki an: olay seçimi de "ikisi de" satırı da kalktı.
  assert.doesNotMatch(dashboard, /data-automation-sun-event/);
  assert.doesNotMatch(dashboard, /automationSunBothTitle/);
  assert.doesNotMatch(dashboard, /automationSunBothSub/);
  assert.match(dashboard, /const automationSunBoth=wizard=>wizard\?\.triggerKind==="sun";/);
  // Bugünün saatleri seçim satırından ipucu satırına taşındı; bilgi kaybolmadı.
  assert.match(dashboard, /automationSunToday:"Bugün gün batımı \{sunset\}, gün doğumu \{sunrise\}\."/);
  assert.match(dashboard, /automationSunToday:"Today sunset \{sunset\}, sunrise \{sunrise\}\."/);
  assert.match(dashboard, /automationSunOffsetHint:"Eksi önce, artı sonra demek\. 0:00 tam o an\."/);
  assert.match(dashboard, /automationSunOffsetHint:"Minus is before, plus is after\. 0:00 means exactly then\."/);
  assert.match(dashboard, /automationMapWhenSunset:"Gün batımında"/);
  assert.match(dashboard, /automationMapWhenSunrise:"At sunrise"/);
  assert.match(dashboard, /automationSummarySunMap:"Gün batımında \{target\} \{onAction\}, gün doğumunda \{offAction\}\."/);
  assert.match(dashboard, /automationSummarySunMap:"At sunset \{target\} will \{onAction\}, and at sunrise it will \{offAction\}\."/);
  assert.match(dashboard, /automationCardSummarySunMap:"Gün batımında → \{target\} \{onAction\} · gün doğumunda \{offAction\}"/);
  assert.match(dashboard, /automationCardSummarySunMap:"Sunset → \{target\} \{onAction\} · sunrise → \{offAction\}"/);
  assert.match(dashboard, /automationEveryDayChip:"Her gün"/);
  assert.match(dashboard, /automationEveryDayChip:"Every day"/);
  assert.match(dashboard, /automationDay1:"Pzt"/);
  assert.match(dashboard, /automationDay7:"Sun"/);

  // Hedef adımı iki aşamalı: önce cihaz satırı, sonra o cihazın alt öğeleri. Oda süzgeci yok.
  assert.doesNotMatch(dashboard, /data-automation-room/);
  assert.doesNotMatch(dashboard, /id="automationRooms"/);
  assert.match(dashboard, /function chooseAutomationTargetDevice\(deviceId\)\{/);
  assert.match(dashboard, /const single=controls\.length===1;/);

  // §8.1 güvenlik: kilit ve siren hiç listelenmez, yalnızca switch kontrolleri hedef.
  assert.match(dashboard, /const isAutomationControl=control=>control\.kind==="switch"&&control\.adminOnly!==true/);
  assert.match(dashboard, /const automationControls=device=>isProtectedDevice\(device\)\?\[\]:\(device\?\.controls\|\|\[\]\)\.filter\(isAutomationControl\)/);

  // §5.1.1 alt varlık: kaydedilen eylem kanonik property taşır, controlId yalnızca sunum.
  assert.match(dashboard, /automationCommitTarget\(wizard,\{deviceId,property:control\.property,controlId:control\.id,value\}\)/);
  assert.match(dashboard, /const automationControl=action=>automationDevice\(action\)\?\.controls\.find\(control=>control\.property===action\?\.property\)/);

  // Özet cümlesi tam şablon anahtarıyla kuruluyor, parça birleştirme yok.
  assert.match(dashboard, /automationEveryDay\(trigger\.days\)\?"automationSummaryTime":"automationSummaryTimeDays",/);
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

  // Sunucu sözleşmesi: GET / PUT tüm dizi / POST run / çalışma günlüğü.
  assert.match(dashboard, /async function loadAutomations\(\)\{\s*const data=await api\("\/api\/automations"\);/);
  assert.match(dashboard, /api\("\/api\/automations",\{method:"PUT",body:JSON\.stringify\(\{automations\}\)\}\)/);
  assert.match(dashboard, /api\(`\/api\/automations\/\$\{encodeURIComponent\(id\)\}\/run`,\{method:"POST"\}\)/);
  assert.match(dashboard, /api\(`\/api\/automations\/\$\{encodeURIComponent\(id\)\}\/runs\?limit=20`\)/);

  // Sihirbaz gezinmesi: tek birincil eylem, altta sabit şerit.
  assert.match(dashboard, /<div class="modal-actions automation-actions"><div id="automationNextNote" class="automation-next-note" hidden><p id="automationNextHint" class="automation-next-hint"><\/p><\/div><button id="automationBack" class="secondary" type="button" data-i18n="back">/);
  assert.match(dashboard, /id="automationBack"[\s\S]*?id="automationNext" class="primary"/);
  assert.match(dashboard, /\.automation-actions\{flex:none;flex-wrap:wrap;justify-content:space-between/);
  assert.match(dashboard, /\.automation-actions button\{min-width:132px;min-height:52px/);
  assert.match(dashboard, /back:"Geri"/);
  assert.match(dashboard, /next:"İleri"/);
  assert.match(dashboard, /cancel:"Vazgeç"/);
  assert.match(dashboard, /cancel:"Cancel"/);

  // "İleri" yalnızca o adımda seçim yapıldıysa aktif.
  assert.match(dashboard, /const automationStageAdvanceable=wizard=>\{/);
  assert.match(dashboard, /next\.disabled=paths\|\|!automationStageAdvanceable\(wizard\);/);
  assert.match(dashboard, /if\(!automationStageAdvanceable\(wizard\)\)return;/);
  assert.match(dashboard, /\.automation-actions button\[disabled\]\{opacity:\.45\}/);

  // Adım göstergesi soldaki akış rayı: ayrı sayaç ve nokta dizisi yok.
  assert.doesNotMatch(dashboard, /automationDots/);
  assert.doesNotMatch(dashboard, /id="automationStep"/);
  assert.doesNotMatch(dashboard, /automation-rail-step/);

  // Tek dokunuşluk seçimler kademeli animasyonla ilerler; otomatik kaydırma yok.
  assert.match(dashboard, /automationAdvanceTimer=setTimeout\(apply,190\)/);
  assert.doesNotMatch(dashboard, /automationScrollTop/);
  assert.match(dashboard, /data-automation-trigger\]"\)\.forEach\(button=>button\.onclick=\(\)=>chooseAutomationTrigger\(button\.dataset\.automationTrigger\)\)/);
  assert.match(dashboard, /wizard\.stage=kind==="time"\?"time":kind==="sun"\?"sun":"trigDevice";/);
  // Geri gidildiğinde seçimler durur: sihirbaz durumu yalnızca modal kapanınca sıfırlanır.
  assert.match(dashboard, /addEventListener\("close",\(\)=>\{cancelAutomationAdvance\(\);state\.automationWizard=null\}\)/);
  assert.match(dashboard, /triggerKind:automationTriggerKind\(trigger\)/);

  // Kaydedilen kural: tetikleyici listesi formdan (§9.1 güneşte iki satır), koşullar, eylemler.
  assert.match(dashboard, /triggers,\s*conditions:wizard\.conditions\.map\(condition=>\(\{\.\.\.condition\}\)\),\s*actions,/);
  assert.match(dashboard, /const automationWizardTriggers=wizard=>automationSunBoth\(wizard\)\s*\?\[automationSunTriggerFor\(wizard,"sunset"\),automationSunTriggerFor\(wizard,"sunrise"\)\]\s*:\[automationWizardTrigger\(wizard\)\]/);
  assert.match(dashboard, /:wizard\.targets\.map\(asAction\);/);
  assert.doesNotMatch(dashboard, /automation[A-Za-z]*:"[^"]*(?:senaryo|tetikleyici|property|endpoint)/i);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("sihirbaz akışı dikey bir rayda okunur, cevaplanan soru tek satıra iner", async () => {
  const dashboard = await readDashboardBundle();

  // Kabuk: tek gövde, içinde bölüm başlıkları ve düğüm rayı. Ayrı panel/ray ızgarası kalmadı.
  assert.doesNotMatch(dashboard, /id="automationFlow"|id="automationPanel"|automation-panel/);
  assert.match(dashboard, /<div id="automationBody" class="automation-body"><\/div>/);
  assert.match(dashboard, /\$\("#automationBody"\)\.innerHTML=paths\?automationPathHtml\(\):automationFlowHtml\(wizard\);/);
  assert.match(dashboard, /return`<p class="automation-section">\$\{esc\(section\.label\)\}<\/p><div class="automation-flow">\$\{nodes\.map\(automationNodeHtml\)\.join\(""\)\}<\/div>`;/);

  // Düğüm rayı: ince hat + nokta. Biten düğüm ✓, aktif düğüm halka, ekleme noktası kesik.
  assert.match(dashboard, /<div class="automation-node\$\{mark\}"\$\{active\}><div class="automation-rail" aria-hidden="true"><span class="automation-dot">\$\{node\.state==="done"\?"✓":""\}<\/span><\/div>/);
  assert.match(dashboard, /\.automation-rail::before\{content:"";position:absolute;top:0;bottom:0;width:1px;background:var\(--line\)\}/);
  assert.match(dashboard, /\.automation-node\.is-done \.automation-dot\{[^}]*background:var\(--forest\)/);
  assert.match(dashboard, /\.automation-node\.is-branch \.automation-dot\{[^}]*border-style:dashed/);

  // Cevaplanan soru tek satırlık özet olur; satırın kendisi gerçek bir düğmedir.
  assert.match(dashboard, /const automationSummaryHtml=\(line,hook,quiet,removeHook,action\)=>\{/);
  assert.match(dashboard, /<button class="automation-summary-main" type="button" \$\{hook\}\$\{aria\}/);
  assert.match(dashboard, /\$\$\("\[data-automation-stage\]"\)\.forEach\(button=>button\.onclick=\(\)=>goToAutomationStage\(button\.dataset\.automationStage\)\)/);
  assert.match(dashboard, /\.automation-summary-main\{[^}]*min-height:48px/);
  assert.match(dashboard, /\.automation-summary-main:focus-visible\{outline:3px solid var\(--forest-soft\)/);
  assert.match(dashboard, /\.automation-summary-remove\{flex:none;width:44px;height:44px/);

  // Tamamlanmış tetikleyiciye basınca doğru soru açılır: güneş, eşik, alt öğe ya da cihaz.
  assert.match(
    dashboard,
    /const automationTriggerEditStage=wizard=>wizard\.triggerKind==="time"\s*\?"time"\s*:wizard\.triggerKind==="sun"\s*\?"sun"\s*:automationThresholdActive\(wizard\)\s*\?"trigThreshold"\s*:automationTriggerDetailDevice\(wizard\)\?"trigEvent":"trigDevice"/
  );

  // Kademeli animasyon: çıkan blok yukarı süzülür, gelen blok aşağıdan sırayla yerleşir.
  assert.match(dashboard, /@keyframes automation-rise\{/);
  assert.match(dashboard, /@keyframes automation-lift\{/);
  assert.match(dashboard, /leaving\.classList\.add\("automation-leaving"\);/);
  assert.match(dashboard, /@media\(prefers-reduced-motion:reduce\)\{\.automation-enter>\*,/);
  // Otomatik kaydırma yok: akış hep en üstten okunur.
  assert.doesNotMatch(dashboard, /automationScrollTop|scrollIntoView\(\)/);

  // Bölüm başlıkları dört: NE ZAMAN · KOŞUL · NE YAPSIN · SONRASI.
  assert.match(dashboard, /\{label:t\("automationSectionWhen"\),fill:automationWhenNodes,show:true\}/);
  assert.match(dashboard, /\{label:t\("automationSectionCondition"\),fill:automationCondNodes,/);
  assert.match(dashboard, /\{label:t\("automationSectionThen"\),fill:automationThenNodes,/);
  assert.match(dashboard, /\{label:t\("automationSectionAfter"\),fill:automationAfterNodes,/);

  // Modal sabit yükseklikte: içerik adımdan adıma kısalıp uzasa da kutu ve alt şerit yerinde kalır.
  assert.match(
    dashboard,
    /\.automation-modal\{height:min\(92dvh,880px\);display:flex;flex-direction:column;padding:24px;overflow:hidden\}/
  );
  assert.doesNotMatch(dashboard, /\.automation-modal\{[^}]*max-height/);
  assert.match(dashboard, /dialog\.automation-dialog\{width:min\(94vw,680px\);max-height:none;overflow:hidden\}/);
  assert.doesNotMatch(dashboard, /\.automation-actions\{[^}]*position:sticky/);
  // Kaydırma yalnız gövdede; alt eylem şeridi kırpılmaz.
  assert.match(dashboard, /\.automation-body\{flex:1 1 auto;min-height:0;margin-top:14px;overflow-y:auto;overscroll-behavior:contain/);
  // Eski Android WebView: `color-mix\(\)` kullanılmaz.
  assert.doesNotMatch(dashboard, /color-mix\(/);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("sihirbaz düğme ve sensör tetikleyicilerini ev diliyle kurar", async () => {
  const dashboard = await readDashboardBundle();

  // Cihaza bağlı üç yol; güneş yolu ayrı bir adımdır.
  assert.match(dashboard, /const automationDeviceKinds=\["button","sensor","deviceState"\]/);
  // Tür satırı kendi düğümünde; cihaz sorusu ayrı bir düğüm olarak sıraya girer.
  assert.match(dashboard, /if\(wizard\.stage==="trigDevice"\)\{[\s\S]{0,200}?body:automationPickerHtml\(wizard,"trigger"\)/);

  // Cihaz seçimi satır listesi, açılır liste değil; dokunma hedefi 48 px üstünde.
  assert.match(dashboard, /data-automation-trigger-device="\$\{esc\(device\.id\)\}"/);
  assert.match(dashboard, /\.automation-opt\{width:100%;min-height:48px/);
  assert.doesNotMatch(dashboard, /<select[^>]*data-automation/);

  // Kanonik kayıt: düğme için action, sensör için property + equals.
  assert.match(dashboard, /\{type:"deviceAction",deviceId:wizard\.triggerDeviceId,action:wizard\.triggerAction\}/);
  assert.match(dashboard, /\{type:"deviceState",deviceId:wizard\.triggerDeviceId,property:wizard\.triggerProperty,\s*\.\.\.\(wizard\.triggerEquals===null\|\|wizard\.triggerEquals===undefined\?\{\}:\{equals:wizard\.triggerEquals\}\)\}/);
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
  assert.match(dashboard, /if\(events\.length===1&&!automationButtonUnproven\(wizard,device\)\)automationApplyEvent\(wizard,events\[0\]\)/);
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
  // §2.1 — süreli tetikleyici ayrı bir tam şablona düşer; süresiz yol eskisiyle birebir aynıdır.
  assert.match(dashboard, /if\(trigger\.type==="deviceState"\)return t\(held\?"automationSummaryStateFor":"automationSummaryState",\{\.\.\.automationEventValues\(trigger,action,actionKey\),duration\}\)/);
  assert.match(dashboard, /if\(trigger\.type==="deviceAction"\)return t\("automationCardSummaryButton",automationEventValues\(trigger,action,actionKey\)\)/);
  assert.match(dashboard, /if\(trigger\.type==="deviceState"\)return t\(held\?"automationCardSummaryStateFor":"automationCardSummaryState",\{\.\.\.automationEventValues\(trigger,action,actionKey\),duration\}\)/);
  assert.match(dashboard, /automationSummaryButton:"\{device\} \{button\} olduğunda \{target\} \{action\}\."/);
  assert.match(dashboard, /automationSummaryButton:"When \{button\} on \{device\}, \{target\} will \{action\}\."/);
  assert.match(dashboard, /automationSummaryState:"\{device\} \{event\} \{target\} \{action\}\."/);
  assert.match(dashboard, /automationSummaryState:"When \{device\} \{event\}, \{target\} will \{action\}\."/);
  assert.match(dashboard, /automationCardSummaryButton:"\{device\} \{button\} → \{target\} \{action\}"/);
  assert.match(dashboard, /automationCardSummaryState:"\{device\} \{event\} → \{target\} \{action\}"/);

  // Tek basış hem açıp hem kapatabilsin: seçenek yalnız cihaz destekliyorsa listelenir.
  assert.match(dashboard, /const automationCanToggle=control=>control\?\.valueToggle!==undefined&&control\?\.valueToggle!==null/);
  assert.match(dashboard, /const toggle=automationCanToggle\(control\)\?choice\("toggle","automationTurnToggle"\):"";/);
  assert.match(dashboard, /<div class="automation-choices">\$\{choice\("on","automationTurnOn"\)\}\$\{choice\("off","automationTurnOff"\)\}\$\{toggle\}\$\{valueChoices\}\$\{followChoices\}<\/div>/);
  // Kaydedilen değer cihazın kendi bildirdiği değer; arayüzde uydurulmuyor.
  assert.match(dashboard, /if\(mode==="toggle"&&!automationCanToggle\(control\)\)return;/);
  assert.match(dashboard, /const value=mode==="toggle"\?control\.valueToggle:automationControlValue\(control,mode==="on"\);/);
  // Özet yine tam şablon anahtarıyla kuruluyor; üçüncü biçim için ayrı anahtar var.
  assert.match(dashboard, /const automationSentenceKeys=\{\s*on:"automationWillTurnOn",off:"automationWillTurnOff",toggle:"automationWillToggle",/);
  assert.match(dashboard, /const automationCardKeys=\{\s*on:"automationTurnsOn",off:"automationTurnsOff",toggle:"automationToggles",/);
  // Değer eylemlerinin cümlesi de aynı sözlükten çıkar; şablon değeri kendi içinde taşır.
  assert.match(dashboard, /const actionKey=automationActionPhrase\(automationSentenceKeys,action\);/);
  assert.match(dashboard, /const actionKey=automationActionPhrase\(automationCardKeys,action\);/);
  assert.match(dashboard, /return t\(keys\[mode\]\|\|keys\.on,\{value:automationValueText\(automationControl\(action\),action\?\.value\)\}\);/);
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
  assert.match(dashboard, /\?deviceActions\.some\(action=>automationChannelKey\(action\.deviceId,action\.property\)===automationChannelKey\(trigger\.deviceId,trigger\.property\)\)/);
  assert.match(dashboard, /if\(loops\)\{showToast\(t\("automationLoopWarning"\),true\);return\}/);
  assert.match(dashboard, /showToast\(automationErrorText\(error\),true\)/);
  assert.match(dashboard, /automationLoopWarning:"Bu, otomasyonu başlatan kanalın kendisi;/);
  assert.match(dashboard, /automationLoopWarning:"This is the very channel that starts the automation,/);

  // Arayüz dili: yeni metinlerde geliştirici sözlüğü yok.
  assert.doesNotMatch(dashboard, /automation[A-Za-z]*:"[^"]*(?:tetikleyici|senaryo|kural kur|cluster|endpoint|property)/i);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("cihaz detayı kumandanın düğmelerini adlarıyla ve son basışla gösterir", async () => {
  const dashboard = await readDashboardBundle();

  // Bölüm yalnızca sunucu düğme türettiyse çıkar; boş listede hiç render edilmez.
  assert.match(dashboard, /const deviceButtonsHtml=device=>\{\s*const buttons=device\.buttons\|\|\[\];\s*if\(!buttons\.length\)return"";/);
  assert.match(dashboard, /<div class="device-buttons"><div class="device-buttons-head">\$\{t\("deviceButtons"\)\}<\/div>\$\{deviceButtonLastLine\(device\)\}\$\{rows\}<\/div>/);
  // Düğmeler kontrol sütununun içinde, kontrollerin altında durur; ayrı bir alt blokta tekrarlanmaz.
  assert.match(
    dashboard,
    /const controlsBodyHtml=device\.controls\.filter\(control=>!covered\.has\(control\)\)\.map\(control=>controlHtml\(device,control\)\)\.join\(""\)\+deviceButtonsHtml\(device\);/
  );
  assert.match(
    dashboard,
    /<div class="device-detail-controls">\$\{panelHtml\}<div class="controls">\$\{controlsBodyHtml\|\|\(panelHtml\?"":`<div class="device-exposed-empty">\$\{t\("noExposedControls"\)\}<\/div>`\)\}<\/div><\/div>/
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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
function pickGrouping(scripts: string): (events: Array<{ sourceName: string; property: string }>) => PickApi {
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
  scripts: string,
  groups: Array<{ id: string; name: string; items: Array<{ deviceId: string }> }> = []
): PickerApi {
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
  assert.match(dashboard, /const head=labelled\?`<p class="automation-group-head">\$\{esc\(t\(group\.head\)\)\}<\/p>`:"";/);
  assert.match(
    dashboard,
    /sub:scope==="cond"\s*\?automationCondPropertyPreview\(device\)\s*:automationJoin\(deviceKind\(device\),group\.proven\?"":t\("automationButtonUnproven"\)\),/
  );
  assert.match(dashboard, /automationButtonUnproven:"bu cihaz henüz düğme sinyali göndermedi"/);
  assert.match(dashboard, /automationButtonUnproven:"this device has not sent a button signal yet"/);
  assert.match(dashboard, /automationButtonProvenGroup:"Basıldığı görülen cihazlar"/);
  assert.match(dashboard, /automationButtonProvenGroup:"Devices seen sending a press"/);
  assert.match(dashboard, /automationButtonUnprovenGroup:"Henüz basıldığı görülmeyen cihazlar"/);
  assert.match(dashboard, /automationButtonUnprovenGroup:"Devices not seen sending a press yet"/);
  // Başlık yalnız iki küme de doluyken çıkar.
  assert.match(dashboard, /const labelled=groups\.length>1;/);
  assert.match(dashboard, /\.automation-group-head\{margin:16px 0 0;color:var\(--muted\)/);

  // Kanıtsız cihaz seçilebilir kalır — devre dışı bırakılmıyor, listeden atılmıyor.
  assert.doesNotMatch(dashboard, /data-automation-trigger-device="\$\{esc\(device\.id\)\}"[^>]*\sdisabled/);
  assert.match(dashboard, /const warning=unproven\?`<p class="automation-warning">\$\{esc\(t\("automationButtonUnprovenWarning"\)\)\}<\/p>`:"";/);
  assert.match(dashboard, /automationButtonUnprovenWarning:"Bu cihaz düğme sinyali göndermiyor olabilir; kural çalışmayabilir\./);
  assert.match(dashboard, /automationButtonUnprovenWarning:"This device may not send button signals, so the rule may never run\./);
  assert.match(dashboard, /\.automation-warning\{[^}]*border:1px solid var\(--sun\)/);
  // Seçtiğinde uyarı bir kez daha yüzeye çıkar.
  assert.match(dashboard, /if\(automationButtonUnproven\(wizard,device\)\)showToast\(t\("automationButtonUnprovenWarning"\),true\);/);
  // Uyarı okunmadan adım atlanmasın: kanıtsız cihazda sessiz seçim ve otomatik ilerleme kapalı.
  assert.match(dashboard, /if\(events\.length===1&&!automationButtonUnproven\(wizard,device\)\)automationApplyEvent\(wizard,events\[0\]\);/);
  // Kanıtsız cihazda düğüm kapanmaz: uyarı ve alternatif açık kalır, akış "trigEvent"te durur.
  assert.match(dashboard, /const unproven=automationButtonUnproven\(wizard,device\);/);
  assert.match(dashboard, /if\(!unproven&&automationTriggerReady\(wizard\)\)\{\s*wizard\.fresh="trigger";\s*wizard\.stage=automationAfterTrigger\(wizard\);\s*return;\s*\}\s*wizard\.stage="trigEvent";/);

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
    /function automationUseStateInstead\(deviceId\)\{[\s\S]*?automationApplySingleChannel\(wizard,device\);\s*if\(automationTriggerReady\(wizard\)\)\{\s*wizard\.fresh="trigger";\s*wizard\.stage=automationAfterTrigger\(wizard\);\s*return;\s*\}/
  );
  assert.match(dashboard, /automationButtonStateAlternative:"Bu cihaz bir anahtar veya priz gibi açılıp kapanıyor\./);
  assert.match(dashboard, /automationButtonStateAlternative:"This device turns on and off like a switch or plug\./);
  assert.match(dashboard, /automationButtonStateAlternativeAction:"Açılınca\/kapanınca ile kur"/);
  assert.match(dashboard, /automationButtonStateAlternativeAction:"Use turns on or off"/);

  // Cihaz detayı: prizden beslenen duvar anahtarı hiç basış yaymadıysa "Düğmeler" bölümü çıkmaz.
  assert.match(dashboard, /if\(device\.type==="Router"&&!deviceSeenPress\(device\)\)return"";/);

  // §3.1 — yeni metinlerde geliştirici sözlüğü yok.
  assert.doesNotMatch(dashboard, /automationButton(?:Unproven|Proven|StateAlternative)[A-Za-z]*:"[^"]*(?:router|payload|cluster|endpoint|IEEE)/i);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("basış yaymamış cihaz listede geride kalır, yayan cihaz uyarısız öne geçer", async () => {
  const dashboard = await readDashboardBundle();
  const remote: PickDevice = { id: "0xremote", name: "Balcony remote switch", sourceName: "balcony", lastAction: { action: "1_single" } };
  const dimmer: PickDevice = { id: "0xdimmer", name: "Garden 3 Way Switch", sourceName: "garden", lastAction: null };
  const fresh: PickDevice = { id: "0xfresh", name: "New remote", sourceName: "fresh" };

  const withoutEvents = pickGrouping(await panelScripts())([]);
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
  const afterPress = pickGrouping(await panelScripts())([{ sourceName: "fresh", property: "action" }]);
  assert.equal(afterPress.deviceSeenPress(fresh), true);
  assert.equal(afterPress.deviceSeenPress(dimmer), false);
  // Durum bildirimi (`state`) kanıt değildir; yalnız `action` sayılır.
  assert.equal(pickGrouping(await panelScripts())([{ sourceName: "garden", property: "state" }]).deviceSeenPress(dimmer), false);

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

  const picker = pickerApi(await panelScripts());
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

  const groups = pickGrouping(await panelScripts())([]).automationPickGroups([garden, relay, unknown, balcony, ikeaBulb], "deviceState");
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
  assert.match(dashboard, /\.automation-search input\{flex:1;min-width:0;padding:4px 0;border:0;background:none;color:var\(--ink\);font-size:16px/);
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
  const picker = pickerApi(await panelScripts(), rooms);
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
  // Hedef adımı hâlâ özet satırı + "Değiştir" dilini kullanır; tetikleyici ve koşul adımı
  // seçilen satırı olduğu gibi bırakıp yanına × koyar (bkz. automationPickedDeviceHtml).
  assert.match(dashboard, /const automationDeviceRowHtml=\(device,stage\)=>automationSummaryHtml\(/);
  assert.match(dashboard, /`data-automation-stage="\$\{stage\}"`,/);
  assert.match(dashboard, /automationDeviceRowHtml\(device,"target"\)/);
  assert.match(dashboard, /automationPickedDeviceHtml\(device,"trigger"\)/);
  assert.match(dashboard, /automationPickedDeviceHtml\(device,"cond"\)/);
  assert.match(dashboard, /automationPickParts:"\{device\} düğmeleri ve kanalları"/);
  assert.match(dashboard, /automationPickParts:"Buttons and channels of \{device\}"/);
  assert.doesNotMatch(dashboard, /automation-done-row|automation-pick-back|automation-subhead|automation-subback/);

  // Tek alt öğeli cihazda bu adım atlanır: tetikleyicide olay tek ise ekran hiç açılmaz,
  // eşleme yolunda tek kanallı hedef doğrudan seçilip ilerlenir.
  assert.match(
    dashboard,
    /return automationTriggerChoiceCount\(wizard,device\)>1\|\|automationButtonUnproven\(wizard,device\)\?device:null;/
  );
  assert.match(
    dashboard,
    /if\(automationMappingMode\(wizard\)&&controls\.length===1\)\{\s*wizard\.draftProperty=controls\[0\]\.property;\s*wizard\.draftControlId=controls\[0\]\.id;/
  );

  // Hedef adımının tek elemesi cihazın gerçek yeteneği; oda ya da ad tahmini yok.
  assert.match(dashboard, /targetControls\(device\)\.length>0&&device\.id!==starter/);
  assert.doesNotMatch(dashboard, /deviceInRoom\(device,wizard\.room\)/);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

interface PressEntry {
  action: string;
  press: string;
}

/** Basış eleme yardımcısını sayfadan çıkarıp gerçekten çalıştırır — davranış metinle değil koşarak kanıtlanır. */
function pressFilter(scripts: string): (entries: PressEntry[], keep?: string | null) => PressEntry[] {
  const source = /const hiddenPressKinds=new Set\(\[[\s\S]*?const visiblePresses=\(entries,keep\)=>\{[\s\S]*?\n {2}\};/
    .exec(scripts);
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
  assert.match(dashboard, /automationTriggerRows\(device,wizard\.triggerKind,wizard\.triggerAction\)\.length>0/);
  assert.match(dashboard, /const events=automationTriggerRows\(device,wizard\.triggerKind,wizard\.triggerAction\);/);
  assert.match(dashboard, /automationTriggerRows\(device,wizard\?\.triggerKind,wizard\?\.triggerAction\)\.find\(item=>item\.token===token\)/);
  // Yeni cihaz seçiminde `keep` yok: sıfırdan kurulan kural art arda basış önermez.
  assert.match(dashboard, /const events=automationTriggerRows\(device,wizard\.triggerKind\);\s*\/\/ Tek anlamlı seçenek/);

  // Kayıtlı kuralın özeti elenmemiş ham listeden okunur; `1_double` kuralı doğru cümleyi verir.
  assert.match(dashboard, /const entry=button\.actions\.find\(item=>item\.action===action\);/);

  const visiblePresses = pressFilter(await panelScripts());
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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("otomasyon kartı tek dokunuşla düzenlemeyi açar, çalıştır ve sil görünür düğmede durur", async () => {
  const dashboard = await readDashboardBundle();

  // Kart gövdesine tek dokunuş doğrudan düzenlemeyi açar — birincil yol artık uzun basma değil.
  assert.match(dashboard, /card\.onclick=event=>\{\s*if\(event\.target\.closest\?\.\("\[data-automation-toggle\],\[data-automation-menu\],\[data-automation-runs\],\.automation-runs"\)\)return;\s*openAutomationWizard\(card\.dataset\.automationCard\);\s*\};/);
  // Uzun basma kaldırılmadı: aynı seçenek diyaloğunu açmayı sürdürüyor.
  assert.match(dashboard, /bindLongPress\(card,\(\)=>openAutomationActions\(card\.dataset\.automationCard\),\{ignore:target=>Boolean\(target\.closest\?\.\("\[data-automation-toggle\],\[data-automation-menu\],\[data-automation-runs\],\.automation-runs"\)\)\}\)/);

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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  assert.match(dashboard, /const label=t\(wizard\.stage==="name"\?"save":"next"\);/);
  // Yol seçimi adımında ilerlenecek bir şey yok: düğme gizlenir.
  assert.match(dashboard, /for\(const next of automationNextButtons\(\)\)\{\s*next\.hidden=paths;\s*next\.textContent=label;\s*next\.disabled=paths\|\|!automationStageAdvanceable\(wizard\);\s*\}/);
  assert.match(dashboard, /\$\("#automationNext"\)\.onclick=nextAutomationStep;/);
  // Kayıt sırasında kilitlenir, hata olursa açılır.
  assert.match(dashboard, /const buttons=automationNextButtons\(\);\s*buttons\.forEach\(button=>\{button\.disabled=true\}\);/);
  assert.match(dashboard, /buttons\.forEach\(button=>\{button\.disabled=false\}\);showToast\(automationErrorText\(error\),true\)/);

  // Sessiz pasif düğme yok: eksik olan şey düğmenin yanında yazıyor.
  assert.match(dashboard, /<div id="automationNextNote" class="automation-next-note" hidden><p id="automationNextHint" class="automation-next-hint"><\/p><\/div>/);
  assert.match(dashboard, /const reason=paths\|\|ready\?"":automationBlockedReason\(wizard\);\s*hint\.textContent=sentence\|\|\(reason\?t\(reason\):""\);/);
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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

// Kuralı düz cümleyle anlatan özet serbest metin gibi duruyordu. Panelin kendi bilgi kutusu dili
// (`.automation-alt`: `--line` kenarlık + `--surface-soft` zemin) buraya da geldi; iç gölge kutuyu
// çukur gösterir. Cümlenin kendisi değişmedi, yalnız sarmalayıcı ve biçim.
test("sihirbazın özet cümlesi çukur bir bilgi kutusunda durur", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /<div id="automationNextNote" class="automation-next-note" hidden><p id="automationNextHint" class="automation-next-hint"><\/p><\/div>/);
  // Ölçüler clamp'li: 1024×640'ta kutu son adımın kaydırmasını artırmasın. Renk karışımı yok.
  assert.match(
    dashboard,
    /\.automation-next-note\{flex:1 1 100%;order:-1;padding:clamp\(\.4rem,\.9vh,\.6rem\) clamp\(\.6rem,1\.2vw,\.85rem\);border:1px solid var\(--line\);border-radius:clamp\(\.6rem,1\.1vw,\.85rem\);background:var\(--surface-soft\);box-shadow:inset 0 1px 2px rgba\(35,45,41,\.09\)\}/
  );
  assert.match(dashboard, /\.automation-next-note\[hidden\]\{display:none\}/);
  // Koyu temada iç gölge ayrı yazılır; metin `--forest`/`--muted` olduğu için iki temada da okunur.
  assert.match(dashboard, /:root\[data-theme="dark"\] \.automation-next-note\{box-shadow:inset 0 1px 3px rgba\(0,0,0,\.42\)\}/);
  assert.match(dashboard, /\.automation-next-hint\{margin:0;color:var\(--muted\);font-size:clamp\(\.78rem,1\.5vh,\.85rem\);line-height:1\.4;text-align:left\}/);
  assert.match(dashboard, /\.automation-next-hint\.ready\{color:var\(--forest\);font-weight:800\}/);
  // Boş kutu kenarlığıyla ortada kalmaz: sarmalayıcı metinle birlikte gizlenir.
  assert.match(dashboard, /const note=\$\("#automationNextNote"\);\s*if\(note\)note\.hidden=hint\.hidden;/);
  assert.doesNotMatch(dashboard, /\.automation-next-note\{[^}]*color-mix\(/);
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

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
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
  assert.match(dashboard, /await Promise\.allSettled\(\[refresh\(\),loadHomeGroups\(\),loadHomeVisibility\(\),loadAutomations\(\)\]\);\s*render\(\)/);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});

test("tek kanallı cihazda kanal kalemi çıkmaz, çok kanallıda her kanal ayrı adlandırılır", async () => {
  const dashboard = await readDashboardBundle();
  const source = await panelScripts();
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
  assert.match(dashboard, /hook:`data-automation-autooff="\$\{option\.mode\}"`/);
  assert.match(dashboard, /automationAutoOffIdle:"Hareket bitince"/);
  assert.match(dashboard, /automationAutoOffIdle:"When motion stops"/);
  assert.match(dashboard, /automationAutoOffAfter:"Süre sonunda"/);
  assert.match(dashboard, /automationAutoOffAfter:"After a while"/);

  // §9.2 — "sonra kapat" metinleri zaman yönünü ("sonra"/"after the rule runs") taşır ki
  // koşul adımındaki "şu kadar süredir" ölçütüyle karışmasın.
  assert.match(dashboard, /automationAutoOffAfterLabel:"Kural çalıştıktan ne kadar sonra kapansın\?"/);
  assert.match(dashboard, /automationAutoOffAfterLabel:"How long after the rule runs should it turn off\?"/);
  assert.match(dashboard, /automationAutoOffAfterSub:"Kural çalıştıktan şu kadar süre sonra kapanır"/);
  assert.match(dashboard, /automationAutoOffAfterSub:"It turns off this long after the rule runs"/);

  // "Hareket bitince" ölçütü tanım verisinden gelir; sensör modeli listesi yok.
  assert.match(
    dashboard,
    /automationTriggerEvents\(device,"sensor"\)\s*\.some\(row=>row\.property===wizard\.triggerProperty&&row\.equals!==wizard\.triggerEquals\)/
  );
  assert.match(dashboard, /\.filter\(option=>option\.mode!=="idle"\|\|automationAutoOffIdleAvailable\(wizard\)\)/);

  // Geri alma yalnız "Aç" eyleminde anlamlıdır; çoklu hedefte açan her hedefe yazılır.
  assert.match(dashboard, /wizard\.targets\.some\(target=>Boolean\(automationTargetControl\(target\)\)&&automationTargetMode\(target\)==="on"\)/);

  // Kanonik kayıt: alan açan eylemin kendi üstüne yazılır, ikinci bir kural kurulmaz.
  assert.match(dashboard, /const autoOff=automationAutoOffPayload\(wizard,target\);\s*return autoOff\?\{\.\.\.action,autoOff\}:action;/);
  assert.match(dashboard, /return\{mode,seconds:minutes\*60,value:automationControlValue\(control,false\)\}/);

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
  assert.match(dashboard, /const autoOff=map\?"":automationAutoOffLine\(actions\.find\(item=>item\.autoOff\)\|\|action\)/);
});

test("sonra kapat yükü hedefin kendi kapatma değerinden üretilir", async () => {
  const dashboard = await readDashboardBundle();
  const helpers = automationHelpers(await panelScripts(), [
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
  ]) as {
    automationAutoOffPayload: (wizard: unknown, target: unknown) => { mode: string; seconds: number; value: string } | null;
    automationAutoOffLine: (action: unknown) => string;
    automationAutoOffIdleAvailable: (wizard: unknown) => boolean;
  };

  const onTarget = { kind: "device", deviceId: "0x00124b0011cc22dd", property: "state", controlId: "switch:state", value: "ON" };
  const wizard = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    triggerKind: "sensor",
    triggerDeviceId: "0x00124b0022ab34cd",
    triggerProperty: "occupancy",
    triggerEquals: true,
    targets: [onTarget],
    autoOffMode: "after",
    autoOffMinutes: 5,
    autoOffIdleMinutes: 0,
    ...overrides
  });
  const payload = (overrides: Record<string, unknown> = {}, target: unknown = onTarget) =>
    helpers.automationAutoOffPayload(wizard(overrides), target);

  // Kapatma değeri kontrolün kendi `valueOff` alanından gelir; model tahmini yok.
  assert.deepEqual(payload(), { mode: "after", seconds: 300, value: "OFF" });
  assert.deepEqual(payload({ autoOffMode: "idle", autoOffIdleMinutes: 2 }), { mode: "idle", seconds: 120, value: "OFF" });
  assert.equal(payload({ autoOffMode: "none" }), null);

  // Kapatan eylemin geri alınacak yönü yok.
  const offTarget = { kind: "device", deviceId: "0x00124b0011cc22dd", property: "state", controlId: "switch:state", value: "OFF" };
  assert.equal(payload({ targets: [offTarget] }, offTarget), null);
  // Cihaz olmayan eylemlerin (bekle / grup / sahne) geri alınacak yönü de yok.
  assert.equal(payload({ targets: [{ kind: "delay", seconds: 10 }] }, { kind: "delay", seconds: 10 }), null);

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
    payload({ triggerDeviceId: "0x00124b0022ab34ce", triggerProperty: "smoke", autoOffMode: "idle" }),
    null
  );

  // Zaman tetikleyicisinde yalnız süreyle kapatma kalır.
  assert.equal(helpers.automationAutoOffIdleAvailable(wizard({ triggerKind: "time" })), false);
  assert.deepEqual(payload({ triggerKind: "time", autoOffMinutes: 1 }), { mode: "after", seconds: 60, value: "OFF" });

  // Cümle tam şablon anahtarıyla kuruluyor.
  const line = (autoOff: Record<string, unknown>): string =>
    helpers.automationAutoOffLine({ deviceId: "0x00124b0011cc22dd", property: "state", value: "ON", autoOff });
  assert.equal(line({ mode: "after", seconds: 300, value: "OFF" }), "automationAutoOffAfterLine");
  assert.equal(line({ mode: "idle", seconds: 0, value: "OFF" }), "automationAutoOffIdleLine");
  assert.equal(line({ mode: "idle", seconds: 120, value: "OFF" }), "automationAutoOffIdleWaitLine");
  assert.equal(helpers.automationAutoOffLine({ deviceId: "0x00124b0011cc22dd", property: "state", value: "ON" }), "");
});

// Sihirbaz kaynağının canlı uygulamadan yalıtılmış bir kopyasını kurar: tarayıcı yardımcıları
// sahte, DOM yok. Aynı dilim hem yardımcı fonksiyon testlerinde hem akış koşumunda kullanılır.
type AutomationSandbox = {
  bodies: string[];
  scrollIntoViewCalls: () => number;
  state: Record<string, unknown>;
  api: Record<string, (...args: unknown[]) => unknown>;
  // Kaydetme yolunda sunucuya gönderilen son liste; round-trip karşılaştırması buradan okunur.
  saved: () => Record<string, unknown>[];
  // Kullanıcıya gösterilen uyarılar: engellenen kaydetme sessiz kalmasın diye toplanır.
  toasts: string[];
  // Sihirbaz diyaloğunun kaç kez kapatıldığı ve sorulan onay metinleri: kapatma ikonunun
  // veri kaybı uyarısı buradan doğrulanır.
  closeCalls: () => number;
  confirms: string[];
  answerConfirm: (answer: boolean) => void;
};

const automationExports = [
  "openAutomationWizard", "chooseAutomationPath", "chooseAutomationTrigger", "chooseAutomationTriggerDevice",
  "chooseAutomationEvent", "chooseAutomationTargetDevice", "chooseAutomationAction", "chooseAutomationAutoOff",
  "goToAutomationStage", "reopenAutomationPicker",
  "addAutomationTarget", "editAutomationTarget", "removeAutomationTarget",
  "chooseAutomationChannel", "chooseAutomationTarget", "chooseAutomationMap", "automationWizardReady",
  "setAutomationAutoOffMinutes", "openAutomationAutoOffCustom", "automationBlockedReason",
  "automationStageAdvanceable", "chooseAutomationSunEdit",
  "setAutomationSunOffset", "automationCounterNext", "automationCounterText",
  "toggleAutomationCondFor", "setAutomationCondForSeconds",
  "toggleAutomationTrigFor", "setAutomationTrigForSeconds", "automationTrigForEligible",
  "automationWizardTriggers", "toggleAutomationDay",
  "chooseAutomationThresholdDir", "stepAutomationThreshold", "addAutomationCondition", "chooseAutomationCondKind",
  "chooseAutomationCondDevice", "chooseAutomationCondState", "chooseAutomationCondNegate",
  "chooseAutomationCondThresholdDir", "stepAutomationCondThreshold", "chooseAutomationCondMode",
  "stepAutomationCondTime", "chooseAutomationCondPoint", "stepAutomationCondSunOffset",
  "chooseAutomationCondPreset", "editAutomationCondition", "removeAutomationCondition",
  "commitAutomationCondition",
  "setAutomationWaitSeconds", "automationWaitSeconds", "automationBackStage", "stepBackAutomation",
  "toggleAutomationWait", "automationWaitOpen", "clearAutomationPickedDevice",
  "closeAutomationWizard", "automationWizardDirty",
  "chooseAutomationActionKind", "setAutomationDelay", "commitAutomationDelay", "chooseAutomationGroup",
  "chooseAutomationGroupValue", "chooseAutomationSceneGroup", "chooseAutomationScene",
  "automationAutoOffPayload", "automationAutoOffLine", "automationAutoOffIdleAvailable",
  "automationConditionLine", "automationTargetLine", "automationTriggerLine", "automationWizardTrigger",
  "automationRunRowHtml", "automationReasonText", "automationOutcomeText", "saveAutomationWizard",
  "nextAutomationStep",
  // Değer eylemleri: parlaklık / ışık sıcaklığı / renk.
  "chooseAutomationValue", "stepAutomationValue", "setAutomationValueColor", "chooseAutomationFollow",
  "automationValueControls", "automationValuePercent", "automationValueRaw", "automationValueText",
  "automationWizardSentence", "automationCardLine"
];

// `messages` boş bırakılırsa `t()` anahtarı olduğu gibi döndürür (çoğu test bunu bekler). Gerçek
// katalog verilirse şablon yerleştirme de çalışır: çeviri metninin kendisini doğrulayan testler için.
function automationSandbox(source: string, devices: unknown[], groups: unknown[] = [], messages: Record<string, string> = {}): AutomationSandbox {
  const start = source.indexOf("const automationWeekDays=");
  // Dilim `public/js/panel-automation.js` dosyasının tamamı: kaydetme de içinde, çünkü
  // kural → sihirbaz → kural dönüşünün ikinci yarısı orada. Dosyanın ardından yüklenen ilk
  // metin, olay bağlama bloğunun ilk satırı.
  const end = source.indexOf('$$(".nav-button").forEach(button=>button.onclick');
  assert.ok(start > 0 && end > start);
  const bodies: string[] = [];
  const toasts: string[] = [];
  const savedLists: Record<string, unknown>[][] = [];
  let scrollIntoViewCalls = 0;
  let closeCalls = 0;
  const confirms: string[] = [];
  let confirmAnswer = false;
  const nodes = new Map<string, Record<string, unknown>>();
  const node = (selector: string): Record<string, unknown> => {
    const found = nodes.get(selector);
    if (found) return found;
    const created: Record<string, unknown> = {
      scrollTop: 0,
      hidden: false,
      disabled: false,
      readOnly: false,
      value: "",
      textContent: "",
      open: true,
      classList: { add() {}, remove() {}, toggle() {} },
      dataset: {},
      style: {},
      querySelector: () => null,
      querySelectorAll: () => [] as unknown[],
      insertAdjacentHTML: () => {},
      // Otomatik kaydırma kalktı: çağrı sayılır, sıfır kalmalı.
      scrollIntoView: () => { scrollIntoViewCalls += 1; },
      setAttribute() {},
      focus() {},
      showModal() {},
      close() { if (selector === "#automationDialog") closeCalls += 1; }
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
    devices,
    zigbeeGroups: groups,
    events: [],
    automations: [],
    automationWizard: null,
    automationRuns: {},
    automationRunsOpen: null,
    automationSun: { sunrise: "06:12", sunset: "19:44", reason: null },
    homeLocation: { latitude: 36.9, longitude: 30.7 },
    auth: { user: { role: "admin" } }
  };
  const stubs: Record<string, unknown> = {
    t: (key: string, values: Record<string, unknown> = {}) => String(messages[key] ?? key)
      .replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? "")),
    esc: (value: unknown) => String(value),
    state,
    isProtectedDevice: () => false,
    deviceKind: () => "kind",
    ago: () => "now",
    showToast: (message: string) => { toasts.push(String(message)); },
    deviceSeenPress: () => true,
    visiblePresses: () => [],
    deviceButtonName: () => "button",
    deviceButtonPressLabel: () => "press",
    openSimpleLink: () => {},
    renderAutomations: () => {},
    activateView: () => {},
    // Sunucu yerine bellek: PUT gövdesi diske yazılacak liste, round-trip karşılaştırması odur.
    api: async (path: string, options?: { method?: string; body?: string }) => {
      const stored = () => (state.automations as Record<string, unknown>[]).map((item) => ({ ...item }));
      if (options?.method === "PUT") {
        const list = JSON.parse(String(options.body)).automations as Record<string, unknown>[];
        savedLists.push(list);
        return { automations: list };
      }
      return { automations: stored() };
    },
    simpleLinks: () => [],
    // Renk seçici ışık kumandasının hazır renklerini paylaşır; sabitin kendisi dilimin dışında.
    lightColorPresets: ["#ffcf8e", "#ffffff", "#ff5147", "#ff9b2e", "#ffe14d", "#57d17f", "#3f9dff", "#a06bff"],
    confirm: (message: string) => { confirms.push(String(message)); return confirmAnswer; },
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
    + `return{${automationExports.join(",")}};`
  )(...names.map((name) => stubs[name])) as Record<string, (...args: unknown[]) => unknown>;
  return {
    bodies,
    toasts,
    scrollIntoViewCalls: () => scrollIntoViewCalls,
    state,
    api,
    saved: () => savedLists[savedLists.length - 1] || [],
    closeCalls: () => closeCalls,
    confirms,
    answerConfirm: (answer: boolean) => { confirmAnswer = answer; }
  };
}

function automationHelpers(source: string, devices: unknown[], groups: unknown[] = [], messages: Record<string, string> = {}): Record<string, (...args: unknown[]) => unknown> {
  return automationSandbox(source, devices, groups, messages).api;
}

// Sihirbazı gerçek olay akışıyla sürer: yeni kural yolu (düzenleme değil) baştan sona tıklanır ve
// her adımda gövdeye basılan HTML toplanır. Canlı uygulama açılmaz.
type WizardHarness = AutomationSandbox & {
  wizard: () => Record<string, unknown>;
  body: () => string;
};

async function automationWizardHarness(): Promise<WizardHarness> {
  const scripts = await panelScripts();
  const sandbox = automationSandbox(
    scripts,
    [
      {
        id: "0x0011", name: "Corridor light", buttons: [], features: [], state: {},
        controls: [{ id: "switch:state", property: "state", name: "Corridor light", kind: "switch", valueOn: "ON", valueOff: "OFF", valueToggle: "TOGGLE" }]
      },
      { id: "0x0022", name: "Koridor Detektor", buttons: [], features: ["occupancy"], state: { occupancy: false }, controls: [] },
      { id: "0x0033", name: "Duman dedektörü", buttons: [], features: ["smoke"], state: { smoke: false }, controls: [] },
      { id: "0x0044", name: "Salon Sıcaklık", buttons: [], features: ["temperature"], state: { temperature: 21.4 }, controls: [] }
    ],
    [{ id: "group-7", name: "Salon lambaları", members: 3, memberIds: [], scenes: [{ id: 4, name: "Akşam" }] }]
  );
  return {
    ...sandbox,
    wizard: () => sandbox.state.automationWizard as Record<string, unknown>,
    body: () => sandbox.bodies[sandbox.bodies.length - 1]
  };
}

// Kayıtlı kural → sihirbaz → kayıtlı kural turu. Diskteki kaydın birebir aynısı geri yazılmalı:
// düzenlemeye açıp hiçbir şeye dokunmadan Kaydet demek kuralı DEĞİŞTİRMEZ.
async function automationRoundTripHarness(): Promise<WizardHarness> {
  const scripts = await panelScripts();
  const sandbox = automationSandbox(
    scripts,
    [
      {
        id: "0xa4c138b950918de3", name: "Corridor light", buttons: [], features: [], state: {},
        controls: [{ id: "main", property: "state", name: "Corridor light", kind: "switch", valueOn: "ON", valueOff: "OFF", valueToggle: "TOGGLE" }]
      },
      {
        id: "0xa4c1389eef9ade7e", name: "Corridor Detector", buttons: [], features: ["presence"], state: { presence: false }, controls: []
      },
      {
        id: "0x0088", name: "Salon Sıcaklık", buttons: [], features: ["temperature"], state: { temperature: 21.4 }, controls: []
      },
      {
        // İki kanallı anahtar: hem eşleme yolunun tetikleyicisi hem de çoklu hedef kaynağı.
        id: "0x0055", name: "Salon anahtarı", buttons: [], features: [], state: {},
        controls: [
          { id: "l1", property: "state_l1", name: "Sol", kind: "switch", valueOn: "ON", valueOff: "OFF" },
          { id: "l2", property: "state_l2", name: "Sağ", kind: "switch", valueOn: "ON", valueOff: "OFF" }
        ]
      },
      {
        // Açık/kapalı değerleri dize değil: eşleme kontrol tanımından türetilmeli.
        id: "0x0066", name: "Bahçe prizi", buttons: [], features: [], state: {},
        controls: [{ id: "plug", property: "power", name: "Bahçe prizi", kind: "switch", valueOn: true, valueOff: false }]
      }
    ],
    [{ id: "group-7", name: "Salon lambaları", members: 3, memberIds: [], scenes: [{ id: 4, name: "Akşam" }] }]
  );
  return {
    ...sandbox,
    wizard: () => sandbox.state.automationWizard as Record<string, unknown>,
    body: () => sandbox.bodies[sandbox.bodies.length - 1]
  };
}

type StoredAutomation = Record<string, unknown> & { id: string };

// Kuralı diskteki hâliyle yükler, düzenlemeye açar ve hiçbir şey değiştirmeden kaydeder.
async function automationRoundTrip(rule: StoredAutomation): Promise<{ harness: WizardHarness; saved: StoredAutomation }> {
  const harness = await automationRoundTripHarness();
  (harness.state.automations as unknown[]).push(JSON.parse(JSON.stringify(rule)));
  harness.api.openAutomationWizard(rule.id);
  await harness.api.saveAutomationWizard();
  const saved = harness.saved().find((item) => item.id === rule.id) as StoredAutomation;
  assert.ok(saved, "kayıt sunucuya gönderilmedi");
  return { harness, saved };
}

const storedRule = (overrides: Record<string, unknown>): StoredAutomation => ({
  id: "rule-round-trip",
  name: "Corridor Detector → Corridor light",
  enabled: true,
  conditions: [],
  lastRunAt: null,
  lastRunOk: null,
  ...overrides
} as StoredAutomation);

// Evdeki gerçek kural. Kart doğru özetliyordu ama düzenlemeye açınca eylem tersine dönüyor ve
// otomatik kapatma siliniyordu: kayıtlı kural, anahtar/priz eşleme formuna ait "yön" satırlarına
// çevriliyor, hedefin `value` alanı düşüyordu. Artık eşleme tohumu yalnız `deviceState` yolunda.
test("kayıtlı sensör kuralı sihirbaza aynen geri okunur ve aynen geri yazılır", async () => {
  const rule = storedRule({
    triggers: [{ type: "deviceState", deviceId: "0xa4c1389eef9ade7e", property: "presence", equals: true }],
    actions: [{
      type: "device", deviceId: "0xa4c138b950918de3", property: "state", value: "ON", controlId: "main",
      autoOff: { mode: "idle", seconds: 60, value: "OFF" }
    }]
  });
  const { harness, saved } = await automationRoundTrip(rule);
  const wizard = harness.wizard();

  // Hedef satırı "Açılacak" der — değer `"ON"`, pill de açık.
  assert.equal(wizard.triggerKind, "sensor");
  assert.deepEqual(wizard.targets, [{
    kind: "device", deviceId: "0xa4c138b950918de3", property: "state", controlId: "main", value: "ON", mapOn: "on", mapOff: "off"
  }]);

  // Otomatik kapatma geri geldi: mod, süre ve kapanış değeri.
  assert.equal(wizard.autoOffMode, "idle");
  assert.equal(wizard.autoOffIdleMinutes, 1);
  assert.deepEqual(
    harness.api.automationAutoOffPayload(wizard, (wizard.targets as unknown[])[0]),
    { mode: "idle", seconds: 60, value: "OFF" }
  );

  // Kaydedilen JSON girdinin birebir aynısı.
  assert.deepEqual(saved, rule);
});

// Aynı kural düzenleme ekranında da doğru görünür: hedef pill'i ve alt şerit özeti tek kaynaktan.
test("kayıtlı kuralın hedef pill'i ve sonrası satırı kayıtla aynı şeyi söyler", async () => {
  const rule = storedRule({
    triggers: [{ type: "deviceState", deviceId: "0xa4c1389eef9ade7e", property: "presence", equals: true }],
    actions: [{
      type: "device", deviceId: "0xa4c138b950918de3", property: "state", value: "ON", controlId: "main",
      autoOff: { mode: "idle", seconds: 60, value: "OFF" }
    }]
  });
  const harness = await automationRoundTripHarness();
  (harness.state.automations as unknown[]).push(rule);
  harness.api.openAutomationWizard(rule.id);

  // Hedef satırı: açık pill'i, kapalı pill'i değil.
  assert.match(harness.body(), /automation-pill act-on/);
  assert.doesNotMatch(harness.body(), /automation-pill act-off/);
  // SONRASI bölümü "hiç kapanmasın" demiyor; hareket bitince kapanma cümlesini gösteriyor.
  assert.match(harness.body(), /automationAutoOffIdleWaitLine/);
  assert.doesNotMatch(harness.body(), /automationAutoOffNeverLine/);
  // Alt şerit özeti hedef satırıyla aynı kaynaktan (wizard.targets) üretilir: aynı yönü söyler.
  assert.equal(harness.api.automationWizardReady(harness.wizard()), true);
  const target = (harness.wizard().targets as unknown[])[0];
  assert.match(String(harness.api.automationTargetLine(harness.wizard(), target)), /automation-pill act-on/);
});

// ————— eşleme satırı: iki ayrı çift. Eski biçim ("on Turns off · off Turns on") tek cümle gibi
// akıyordu ve okuyan kişi bunun İKİ ayrı eşleme olduğunu göremiyordu. Yeni biçimde her çift kendi
// kutusunda "kaynak → sonuç" durur. Aşağıdaki testler o biçimi sabitler.
const mapPairSources = ["On", "Off", "Sunset", "Sunrise"];
const mapPairModes = ["On", "Off", "Toggle"];
const mapPairDevices = [{
  id: "0x0011", name: "Mutfak led sağ", buttons: [], features: [], state: {},
  controls: [{ id: "switch:state", property: "state", name: "Mutfak led sağ", kind: "switch", valueOn: "ON", valueOff: "OFF", valueToggle: "TOGGLE" }]
}];
const mapPairTarget = (mapOn: string, mapOff: string): Record<string, unknown> => ({
  kind: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON", mapOn, mapOff
});

async function mapPairCatalogs(): Promise<{ dashboard: string; en: Record<string, string>; tr: Record<string, string> }> {
  const [dashboard, english, turkish] = await Promise.all([
    readPanelSource(),
    readFile(englishLocaleUrl, "utf8"),
    readFile(turkishLocaleUrl, "utf8")
  ]);
  return {
    dashboard,
    en: JSON.parse(english).translations as Record<string, string>,
    tr: JSON.parse(turkish).translations as Record<string, string>
  };
}

test("eşleme çiftinin tamamı tek çeviri anahtarıdır ve tr/en paritesi tam", async () => {
  const { en, tr } = await mapPairCatalogs();

  for (const source of mapPairSources) {
    for (const mode of mapPairModes) {
      const key = `automationMapPair${source}${mode}`;
      for (const [language, catalog] of [["en", en], ["tr", tr]] as const) {
        const value = catalog[key];
        assert.equal(typeof value, "string", `${language} katalogunda eksik: ${key}`);
        // Ok şablonun İÇİNDE durur: yerini çeviri seçer, kod değil. Böylece tr/en kelime sırası
        // farklı olabilir ve hiçbir yerde parça birleştirmesi yapılmaz.
        const halves = String(value).split("{arrow}");
        assert.equal(halves.length, 2, `${language}/${key} tam olarak bir {arrow} taşımalı`);
        assert.ok(halves[0].trim().length > 0, `${language}/${key} kaynak yarısı boş`);
        assert.ok(halves[1].trim().length > 0, `${language}/${key} sonuç yarısı boş`);
      }
    }
  }

  // Parçadan cümle kuran eski kısa anahtarlar kalktı: yerlerini tam çift şablonları aldı.
  for (const stale of ["automationMapOnShort", "automationMapOffShort", "automationMapSunsetShort", "automationMapSunriseShort"]) {
    assert.equal(en[stale], undefined, `en'de kalmış eski anahtar: ${stale}`);
    assert.equal(tr[stale], undefined, `tr'de kalmış eski anahtar: ${stale}`);
  }
});

test("eşleme satırı iki ayrı çift çizer: her çift kendi kutusunda kaynak → sonuç", async () => {
  const { dashboard, tr } = await mapPairCatalogs();
  const api = automationHelpers(await panelScripts(), mapPairDevices, [], tr);
  const line = String(api.automationTargetLine({ triggerKind: "deviceState" }, mapPairTarget("off", "on")));

  // İki ayrı öbek, tek bir sarmalayıcı içinde. Nokta ayracı kalktı: çiftler artık kutuyla ayrılıyor.
  assert.equal(line.match(/class="automation-map-pair"/g)?.length, 2);
  assert.match(line, /<span class="automation-map-pairs">/);
  assert.doesNotMatch(line, /automation-line-dot/);

  // Yön kaynaktan sonuca. Ok süstür: okuyucudan gizli, metin karşılığı çiftin aria-label'ında.
  assert.equal(line.match(/<span class="automation-map-arrow" aria-hidden="true">→<\/span>/g)?.length, 2);
  assert.match(line, /<span class="automation-map-pair" role="img" aria-label="açılınca kapanır">/);
  assert.match(line, /<span class="automation-map-pair" role="img" aria-label="kapanınca açılır">/);

  // Görünen yarımlar: kaynak sakin metin, sonuç kendi renginde pill.
  assert.match(line, /<span class="automation-map-from">açılınca<\/span>.*<span class="automation-pill act-off">kapanır<\/span>/);
  assert.match(line, /<span class="automation-map-from">kapanınca<\/span>.*<span class="automation-pill act-on">açılır<\/span>/);
  // Cihaz adı yerinde kalır.
  assert.match(line, /<strong>Mutfak led sağ<\/strong>/);
});

test("aynı eşleme satırı İngilizcede de iki ayrı çift olarak okunur", async () => {
  const { dashboard, en } = await mapPairCatalogs();
  const api = automationHelpers(await panelScripts(), mapPairDevices, [], en);
  const line = String(api.automationTargetLine({ triggerKind: "deviceState" }, mapPairTarget("off", "on")));

  assert.equal(line.match(/class="automation-map-pair"/g)?.length, 2);
  assert.match(line, /aria-label="when on turns off"/);
  assert.match(line, /aria-label="when off turns on"/);
  assert.match(line, /<span class="automation-map-from">when on<\/span>.*<span class="automation-pill act-off">turns off<\/span>/);
  // Eski akıp giden biçim geri gelmesin.
  assert.doesNotMatch(line, /on<\/span> <span class="automation-pill/);
});

test("güneş yolundaki eşleme de aynı çift dilini kullanır", async () => {
  const { dashboard, tr } = await mapPairCatalogs();
  const api = automationHelpers(await panelScripts(), mapPairDevices, [], tr);
  const line = String(api.automationTargetLine({ triggerKind: "sun" }, mapPairTarget("on", "off")));

  assert.equal(line.match(/class="automation-map-pair"/g)?.length, 2);
  assert.match(line, /aria-label="gün batınca açılır"/);
  assert.match(line, /aria-label="gün doğunca kapanır"/);
  assert.match(line, /<span class="automation-pill act-on">açılır<\/span>/);
  assert.match(line, /<span class="automation-pill act-off">kapanır<\/span>/);
});

test("bir şey yapma seçilen yön için çift hiç çizilmez, sessiz boşluk kalmaz", async () => {
  const { dashboard, tr } = await mapPairCatalogs();
  const api = automationHelpers(await panelScripts(), mapPairDevices, [], tr);

  // Tek yön: yalnız bir çift kutusu, öbürü hiç yok.
  const single = String(api.automationTargetLine({ triggerKind: "deviceState" }, mapPairTarget("off", "none")));
  assert.equal(single.match(/class="automation-map-pair"/g)?.length, 1);
  assert.match(single, /aria-label="açılınca kapanır"/);
  assert.doesNotMatch(single, /kapanınca/);
  assert.doesNotMatch(single, /Bir şey yapmayacak/);

  // İki yön de boşsa satır cihaz adında biter: boş kutu sarmalayıcısı da çizilmez.
  const empty = String(api.automationTargetLine({ triggerKind: "deviceState" }, mapPairTarget("none", "none")));
  assert.doesNotMatch(empty, /automation-map-pair/);
  assert.match(empty, /<strong>Mutfak led sağ<\/strong>/);
});

test("eşleme çifti sığmazsa kesilmez, alt satıra sarar", async () => {
  const dashboard = await readPanelSource();

  // Satır normalde tek satır + üç nokta; çift taşıyan satır ise sarar ve kırpmaz.
  assert.match(dashboard, /\.automation-line:has\(\.automation-map-pairs\)\{display:flex;flex-wrap:wrap;[^}]*white-space:normal;overflow:visible;text-overflow:clip\}/);
  assert.match(dashboard, /\.automation-map-pairs\{display:inline-flex;flex-wrap:wrap;[^}]*\}/);
  // Çiftin kendi içi kırılmaz: "açılınca → kapanır" ikiye bölünmez.
  assert.match(dashboard, /\.automation-map-pair\{[^}]*white-space:nowrap\}/);
  // Ölçüler viewport'a bağlı, sabit px yok; renk karışımı yok.
  assert.match(dashboard, /\.automation-map-pair\{[^}]*gap:clamp\([^)]*\);padding:clamp\(/);
  assert.doesNotMatch(dashboard, /\.automation-map-(pairs|pair|from|arrow)[^}]*color-mix\(/);
});

// Aynı tur bütün kural biçimleri için: hiçbiri düzenlemeye açılıp kaydedilince değişmemeli.
test("her kural biçimi düzenlemeden geçip aynen geri yazılır", async () => {
  const light = "0xa4c138b950918de3";
  const detector = "0xa4c1389eef9ade7e";
  const cases: Record<string, Record<string, unknown>> = {
    // Kapatan eylem: pill de kayıt da "kapanacak" demeli, ters dönmemeli.
    "kapatan eylem": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: false }],
      actions: [{ type: "device", deviceId: light, property: "state", value: "OFF", controlId: "main" }]
    },
    // Durum değiştiren eylem.
    "değiştiren eylem": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      actions: [{ type: "device", deviceId: light, property: "state", value: "TOGGLE", controlId: "main" }]
    },
    // Açık/kapalı değerleri dize değil: eşleme kontrol tanımından türetilir.
    "mantıksal değerli kontrol": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      actions: [{
        type: "device", deviceId: "0x0066", property: "power", value: true, controlId: "plug",
        autoOff: { mode: "after", seconds: 600, value: false }
      }]
    },
    // Süreyle kapatma.
    "süreyle kapatma": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      actions: [{
        type: "device", deviceId: light, property: "state", value: "ON", controlId: "main",
        autoOff: { mode: "after", seconds: 300, value: "OFF" }
      }]
    },
    // Çoklu hedef: her açan eylem kendi kapanış sözünü taşır, bekleme araya girer.
    "çoklu hedef": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      actions: [
        { type: "device", deviceId: light, property: "state", value: "ON", controlId: "main", autoOff: { mode: "idle", seconds: 120, value: "OFF" } },
        { type: "delay", seconds: 10 },
        { type: "device", deviceId: "0x0055", property: "state_l2", value: "ON", controlId: "l2", autoOff: { mode: "idle", seconds: 120, value: "OFF" } }
      ]
    },
    // Saat tetikleyicisi, seçili günlerle.
    "saat": {
      triggers: [{ type: "time", at: "19:30", days: [1, 2, 3, 4, 5] }],
      actions: [{ type: "device", deviceId: light, property: "state", value: "OFF", controlId: "main" }]
    },
    // Sayısal eşik.
    "eşik": {
      triggers: [{ type: "deviceState", deviceId: "0x0088", property: "temperature", above: 25 }],
      actions: [{ type: "device", deviceId: light, property: "state", value: "ON", controlId: "main" }]
    },
    // Grup eylemi.
    "grup": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      actions: [{ type: "group", groupId: "group-7", property: "state", value: "ON" }]
    },
    // Sahne eylemi.
    "sahne": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      actions: [{ type: "scene", groupId: "group-7", sceneId: 4 }]
    },
    // Koşullu kural: koşullar da olduğu gibi korunur.
    "koşullu": {
      triggers: [{ type: "deviceState", deviceId: detector, property: "presence", equals: true }],
      conditions: [
        { type: "time", from: "18:00", to: "23:30", days: [1, 2, 3, 4, 5, 6, 7] },
        { type: "deviceState", deviceId: "0x0055", property: "state_l1", equals: "ON", negate: true }
      ],
      actions: [{ type: "device", deviceId: light, property: "state", value: "ON", controlId: "main" }]
    },
    // Anahtar/priz eşlemesi: yön eylemlerin `when` alanında, tetikleyicide durum yok.
    "eşleme": {
      triggers: [{ type: "deviceState", deviceId: "0x0055", property: "state_l1" }],
      actions: [
        { type: "device", deviceId: light, property: "state", controlId: "main", value: "ON", when: { equals: "ON" } },
        { type: "device", deviceId: light, property: "state", controlId: "main", value: "OFF", when: { equals: "OFF" } }
      ]
    },
    // §9.1 — gün batımı + gün doğumu tek kuralda; iki olay ayrı kaydırma ve ayrı gün taşıyabilir.
    "güneş eşlemesi": {
      triggers: [
        { type: "sun", event: "sunset", offsetMinutes: -15, days: [1, 2, 3, 4, 5, 6, 7] },
        { type: "sun", event: "sunrise", offsetMinutes: 30, days: [1, 5] }
      ],
      actions: [
        { type: "device", deviceId: light, property: "state", controlId: "main", value: "ON", when: { equals: "sunset" } },
        { type: "device", deviceId: light, property: "state", controlId: "main", value: "OFF", when: { equals: "sunrise" } }
      ]
    }
  };

  for (const [label, body] of Object.entries(cases)) {
    const rule = storedRule({ id: `rule-${label}`, ...body });
    const { saved } = await automationRoundTrip(rule);
    assert.deepEqual(saved, rule, `${label} kuralı düzenlemeden geçince değişti`);
  }
});

// Sihirbazın asıl kusuru: seçim yapılınca seçenekler kapanmıyordu, sayfa her tıklamada büyüyordu.
// Artık cevaplanan soru tek satırlık özet satırına iner ve ekranda tek soru açık kalır.
test("sihirbazda seçim yapılınca o soru kapanır, ekranda tek soru açık kalır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");

  // 1. soru: tetikleyici türü. Cihaz listesi henüz yok — sırası gelmemiş soru hiç basılmaz.
  assert.match(harness.body(), /data-automation-trigger="sensor"/);
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);

  // Tür seçilince satırlar kapanır: yerine tek özet satırı gelir, altında yalnız cihaz sorusu açılır.
  api.chooseAutomationTrigger("sensor");
  assert.doesNotMatch(harness.body(), /data-automation-trigger="sensor"/);
  assert.match(harness.body(), /data-automation-stage="kind"/);
  assert.match(harness.body(), /automationTriggerSensor/);
  assert.match(harness.body(), /data-automation-trigger-device="0x0022"/);
  // Akışta tek bir aktif düğüm olur.
  assert.equal(harness.body().match(/data-automation-active/g)?.length, 1);

  // Cihaz seçilince liste de kapanır: kalan tek açık soru olayın kendisi. Seçilen cihaz satır
  // olarak kalır, sağında × durur — "Değiştir" bağlantısı yok.
  api.chooseAutomationTriggerDevice("0x0022");
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);
  assert.match(harness.body(), /data-automation-clear-device="trigger"/);
  assert.match(harness.body(), /data-automation-event="occupancy=true"/);
  assert.equal(harness.body().match(/data-automation-active/g)?.length, 1);

  // "Değiştir": kapalı satır geri açılır, seçim silinmez.
  api.goToAutomationStage("kind");
  assert.match(harness.body(), /data-automation-trigger="sensor"/);
  assert.equal(harness.wizard().triggerDeviceId, "0x0022");
  assert.equal(harness.body().match(/data-automation-active/g)?.length, 1);

  // Cihaz satırının ×'i bütün listeyi geri getirir.
  api.goToAutomationStage("trigDevice");
  assert.match(harness.body(), /data-automation-trigger-device="0x0022"/);
  api.chooseAutomationTriggerDevice("0x0022");

  // Hedef adımı da iki soruludur: cihaz seçilince liste kapanır, eylem seçenekleri açılır.
  // Olay adımı seçimle kapanmaz (altındaki süre satırı erişilebilir kalsın); geçiş "İleri"dedir.
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  // Araya bekleme adımı girer: tek soru açık kalır, 0:00'da tek dokunuşla geçilir.
  assert.equal(harness.wizard().stage, "wait");
  assert.equal(harness.body().match(/data-automation-active/g)?.length, 1);
  await api.nextAutomationStep();
  assert.equal(harness.wizard().stage, "target");
  assert.match(harness.body(), /data-automation-target-device="0x0011"/);
  api.chooseAutomationTargetDevice("0x0011");
  assert.doesNotMatch(harness.body(), /data-automation-target-device=/);
  assert.match(harness.body(), /data-automation-stage="target"/);
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

  assert.equal(harness.wizard().stage, "name");
  // Hiçbir seçenek listesi basılmaz: yalnız özet satırları ve ad alanı.
  assert.doesNotMatch(harness.body(), /data-automation-trigger="/);
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);
  assert.doesNotMatch(harness.body(), /data-automation-autooff="none"/);
  assert.match(harness.body(), /data-automation-stage="trigEvent"|data-automation-stage="trigDevice"/);
  assert.match(harness.body(), /data-automation-edit-target="0"/);
  assert.match(harness.body(), /id="automationName"/);
  // Koşul bölümü boşken tek satır: "her zaman çalışsın".
  assert.match(harness.body(), /automationCondAlwaysLine/);
  assert.match(harness.body(), /data-automation-stage="cond"/);

  // "Sonra kapat" satırı da kapalı gelir, üstüne basınca açılır.
  harness.api.goToAutomationStage("autoOff");
  assert.match(harness.body(), /data-automation-autooff="none"/);
});

// Var olmayan bir şey "değiştirilmez": boş/varsayılan bölüm ekleme dili konuşur, dolu bölüm
// değiştirme dili. Aynı kural düğmenin aria etiketinde de geçerli — neyin eklendiği duyulmalı.
test("son adımda boş bölüm Ekle, dolu bölüm Değiştir der", async () => {
  const harness = await automationWizardHarness();
  const rule = (id: string, conditions: unknown[]): Record<string, unknown> => ({
    id,
    name: "Koridor",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }],
    conditions,
    actions: [{ type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }]
  });
  (harness.state.automations as unknown[]).push(
    rule("rule1", []),
    rule("rule2", [{ type: "deviceState", deviceId: "0x0011", property: "state", equals: "ON" }])
  );

  harness.api.openAutomationWizard("rule1");
  assert.equal(harness.wizard().stage, "name");
  // KOŞUL boş: "Her zaman çalışsın" satırı koşul ekmeyi teklif eder.
  assert.match(
    harness.body(),
    /<div class="automation-summary is-quiet is-empty"><button class="automation-summary-main" type="button" data-automation-stage="cond" aria-label="automationCondAddAria"><span class="automation-line">automationCondAlwaysLine<\/span><span class="automation-change">add<\/span>/
  );
  // GEREKİYORSA boş: bekleme satırında da aynı dil.
  assert.match(
    harness.body(),
    /<div class="automation-summary is-quiet is-empty"><button class="automation-summary-main" type="button" data-automation-stage="wait" aria-label="automationWaitAddAria"><span class="automation-line">automationWaitNowLine<\/span><span class="automation-change">add<\/span>/
  );
  // Dolu bölüm bozulmadı: hedef satırı hâlâ "Değiştir" der.
  assert.match(harness.body(), /data-automation-edit-target="0"><span class="automation-line">[\s\S]*?<span class="automation-change">automationChange<\/span>/);
  assert.doesNotMatch(harness.body(), /aria-label="automationCondChangeAria"/);

  // Bekleme girilince satır dolar: metin de aria da değiştirme diline döner.
  harness.api.goToAutomationStage("wait");
  harness.api.toggleAutomationWait("1");
  harness.api.setAutomationWaitSeconds(45);
  harness.api.goToAutomationStage("name");
  assert.match(
    harness.body(),
    /<div class="automation-summary"><button class="automation-summary-main" type="button" data-automation-stage="wait" aria-label="automationWaitChangeAria"><span class="automation-line">automationWaitLine<\/span><span class="automation-change">automationChange<\/span>/
  );
  assert.doesNotMatch(harness.body(), /aria-label="automationWaitAddAria"/);

  // Koşullu kuralda koşul satırı doludur: "Ekle" hiç geçmez, aria "değiştir" der.
  harness.api.openAutomationWizard("rule2");
  assert.match(harness.body(), /data-automation-edit-cond="0" aria-label="automationCondChangeAria"/);
  assert.doesNotMatch(harness.body(), /aria-label="automationCondAddAria"/);
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
  // Olay seçilince engel kalkar ama adım kapanmaz: geçiş birincil düğmeyle olur.
  assert.equal(reason(), "");
  await api.nextAutomationStep();
  // Tetikleyiciden sonraki bekleme ara adımı: hiçbir zaman engellemez, tek dokunuşla atlanır.
  assert.equal(harness.wizard().stage, "wait");
  assert.equal(reason(), "");
  await api.nextAutomationStep();
  assert.equal(harness.wizard().stage, "target");
  assert.equal(reason(), "automationNeedTarget");
  api.chooseAutomationTargetDevice("0x0011");
  assert.equal(reason(), "automationNeedAction");
  api.chooseAutomationAction("0x0011|switch:state|on");
  assert.equal(harness.wizard().stage, "autoOff");
  api.chooseAutomationAutoOff("none");
  assert.equal(harness.wizard().stage, "name");
  assert.equal(reason(), "");
});

// Yeni kural kurarken (kayıtlı kuralı düzenlerken değil) "sonra kapat" soruları görünür.
test("yeni kural kurulumunda sonra kapat seçenekleri sorulur", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");

  const wizard = harness.wizard();
  assert.equal(wizard.id, null);
  assert.equal(wizard.stage, "autoOff");
  const review = harness.body();
  assert.match(review, /data-automation-autooff="none"/);
  assert.match(review, /data-automation-autooff="idle"/);
  assert.match(review, /data-automation-autooff="after"/);
  // Hiçbir yolda `scrollIntoView` çağrılmadı: akış hep en üstten okunur.
  assert.equal(harness.scrollIntoViewCalls(), 0);
});

// Çoklu hedef: eylemler sırayla çalışır, satırlar numaralı ve tek tek kaldırılabilir.
test("çoklu hedef sıralı satırlar olarak görünür ve tek tek kaldırılır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  // Tek hedefte ✕ yok: kaldırılırsa kural geçersiz kalırdı.
  assert.doesNotMatch(harness.body(), /data-automation-remove-target=/);
  assert.match(harness.body(), /class="automation-line-step" aria-hidden="true">1</);

  // "Bekle" eylemi ikinci satır olur; sıra numarası görünür.
  api.addAutomationTarget();
  assert.match(harness.body(), /data-automation-action-kind="delay"/);
  api.chooseAutomationActionKind("delay");
  api.setAutomationDelay(30, false);
  api.commitAutomationDelay();
  const targets = harness.wizard().targets as Array<Record<string, unknown>>;
  assert.equal(targets.length, 2);
  assert.deepEqual(targets[1], { kind: "delay", seconds: 30 });
  assert.match(harness.body(), /class="automation-line-step" aria-hidden="true">2</);
  assert.match(harness.body(), /data-automation-remove-target="1"/);

  // Grup ve sahne eylemleri de aynı listeye girer.
  api.addAutomationTarget();
  api.chooseAutomationActionKind("group");
  api.chooseAutomationGroup("group-7");
  api.chooseAutomationGroupValue("off");
  api.addAutomationTarget();
  api.chooseAutomationActionKind("scene");
  api.chooseAutomationSceneGroup("group-7");
  api.chooseAutomationScene(4);
  const all = harness.wizard().targets as Array<Record<string, unknown>>;
  assert.deepEqual(all[2], { kind: "group", groupId: "group-7", property: "state", value: "OFF" });
  assert.deepEqual(all[3], { kind: "scene", groupId: "group-7", sceneId: 4 });
  assert.match(harness.body(), /class="automation-line-step" aria-hidden="true">4</);

  // Satır kaldırma yalnızca o satırı düşürür.
  api.removeAutomationTarget(1, null);
  assert.equal((harness.wizard().targets as unknown[]).length, 3);
});

// Kayıtlı kuralda cihaz olmayan eylemler artık atlanmıyor: hepsi satır olarak geri okunuyor.
test("kayıtlı kuralın bekleme, grup ve sahne eylemleri sihirbazda görünür", async () => {
  const harness = await automationWizardHarness();
  (harness.state.automations as unknown[]).push({
    id: "rule2",
    name: "Akşam",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }],
    conditions: [],
    actions: [
      { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" },
      { type: "delay", seconds: 10 },
      { type: "group", groupId: "group-7", property: "state", value: "OFF" },
      { type: "scene", groupId: "group-7", sceneId: 4 }
    ]
  });
  harness.api.openAutomationWizard("rule2");
  const targets = harness.wizard().targets as Array<Record<string, unknown>>;
  assert.deepEqual(targets.map((target) => target.kind), ["device", "delay", "group", "scene"]);
  const body = harness.body();
  assert.match(body, /data-automation-edit-target="1"/);
  assert.match(body, /data-automation-edit-target="3"/);
  assert.match(body, /automationActionDelayName/);
  assert.match(body, /Salon lambaları/);
  assert.match(body, /Akşam/);
});

// Tetikleyiciden sonraki bekleme kendi ara adımıdır: eylem listesinin dibindeki "⏳ bekle"
// seçeneği sırayla ilgilidir ve kullanıcı ne zaman devreye girdiğini göremiyordu.
// Yeni kural yolunu tetikleyiciden hemen sonra bu soru karşılar ve 0:00 "hemen çalışsın" demektir.
async function automationWaitStepHarness(): Promise<WizardHarness> {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  return harness;
}

test("tetikleyiciden sonra bekleme ara adımı sorulur ve 0:00 iken tek dokunuşla atlanır", async () => {
  const harness = await automationWaitStepHarness();
  const { api } = harness;

  // Adım tetikleyiciyle "Ne yapsın?" arasındadır ama kendi başlığı altındadır: "ne yapsın"
  // listesine karışmaz, opsiyonel olduğu başlıktan okunur.
  assert.equal(harness.wizard().stage, "wait");
  assert.equal(harness.wizard().triggerWaitSeconds, 0);
  assert.match(harness.body(), /automationSectionOptional/);
  // Katlanmış gelir: yalnız "Bekle" ve +. Sayaç açılmadan hiç basılmaz.
  assert.match(harness.body(), /class="automation-cond-for-open automation-wait-open" type="button" data-automation-wait="1" aria-expanded="false"/);
  assert.match(harness.body(), /<span>automationWaitOpen<\/span><span class="automation-plus" aria-hidden="true">\+<\/span>/);
  assert.doesNotMatch(harness.body(), /data-automation-wait-step=/);
  assert.doesNotMatch(harness.body(), /automation-counter-value/);
  // Ekranda tek soru açık kalır ve hedef listesi henüz basılmaz.
  assert.equal(harness.body().match(/data-automation-active/g)?.length, 1);
  assert.doesNotMatch(harness.body(), /data-automation-target-device=/);

  // + sayacı açar; kaldırma satırı sayacı kapatır ve süreyi sıfırlar.
  api.toggleAutomationWait("1");
  assert.match(harness.body(), /data-automation-wait-step="-1"/);
  assert.match(harness.body(), /data-automation-wait-step="1"/);
  assert.match(harness.body(), /<span class="automation-counter-value">0:00<\/span>/);
  assert.match(harness.body(), /automationWaitHint/);
  assert.match(harness.body(), /data-automation-wait="0"/);
  api.setAutomationWaitSeconds(45);
  api.toggleAutomationWait("0");
  assert.equal(harness.wizard().triggerWaitSeconds, 0);
  assert.doesNotMatch(harness.body(), /data-automation-wait-step=/);

  // Atlanabilir: sıfırdayken bile birincil düğme etkin, engel gerekçesi yok.
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);
  assert.equal(api.automationBlockedReason(harness.wizard()), "");
  await api.nextAutomationStep();
  assert.equal(harness.wizard().stage, "target");
  // Geçilen adım özet satırı olarak kalır: "hemen çalışsın" sessiz satırdır.
  assert.match(harness.body(), /data-automation-stage="wait"/);
  assert.match(harness.body(), /automationWaitNowLine/);

  // 0:00 iken kurala hiçbir bekleme eylemi yazılmaz.
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  await api.saveAutomationWizard();
  const [saved] = harness.saved();
  assert.deepEqual((saved.actions as Record<string, unknown>[]).map((action) => action.type), ["device"]);
});

test("bekleme ayarlanınca ilk eylem olarak yazılır ve geri-ileri gidişte değer korunur", async () => {
  const harness = await automationWaitStepHarness();
  const { api } = harness;

  // Adım beş saniye; sayaç dakika:saniye yazar.
  api.setAutomationWaitSeconds(45);
  assert.match(harness.body(), /<span class="automation-counter-value">0:45<\/span>/);
  api.setAutomationWaitSeconds(90);
  assert.match(harness.body(), /<span class="automation-counter-value">1:30<\/span>/);
  // Sunucu tavanı 300 saniye; üstü kırpılır, altı sıfıra dayanır.
  api.setAutomationWaitSeconds(9000);
  assert.equal(harness.wizard().triggerWaitSeconds, 300);
  api.setAutomationWaitSeconds(-60);
  assert.equal(harness.wizard().triggerWaitSeconds, 0);
  api.setAutomationWaitSeconds(90);

  // İleri git, geri dön: adım aynı yerden açılır ve değer kaybolmaz.
  await api.nextAutomationStep();
  assert.equal(harness.wizard().stage, "target");
  assert.equal(api.automationBackStage(harness.wizard()), "wait");
  api.stepBackAutomation();
  assert.equal(harness.wizard().stage, "wait");
  assert.equal(harness.wizard().triggerWaitSeconds, 90);
  assert.match(harness.body(), /<span class="automation-counter-value">1:30<\/span>/);
  await api.nextAutomationStep();
  assert.equal(harness.wizard().triggerWaitSeconds, 90);

  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  await api.saveAutomationWizard();
  const [saved] = harness.saved();
  assert.deepEqual(saved.actions, [
    { type: "delay", seconds: 90 },
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }
  ]);
});

test("kayıtlı kuralda baştaki bekleme ara adıma çekilir, ortadaki bekleme eylem listesinde kalır", async () => {
  const harness = await automationWizardHarness();
  (harness.state.automations as unknown[]).push({
    id: "rule3",
    name: "Koridor",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }],
    conditions: [],
    actions: [
      { type: "delay", seconds: 30 },
      { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" },
      { type: "delay", seconds: 10 },
      { type: "group", groupId: "group-7", property: "state", value: "OFF" }
    ]
  });
  harness.api.openAutomationWizard("rule3");

  // Baştaki bekleme adıma iner; ortadaki bekleme yerinde kalır ve satır olarak görünmeye devam eder.
  assert.equal(harness.wizard().triggerWaitSeconds, 30);
  const targets = harness.wizard().targets as Array<Record<string, unknown>>;
  assert.deepEqual(targets.map((target) => target.kind), ["device", "delay", "group"]);
  assert.deepEqual(targets[1], { kind: "delay", seconds: 10 });
  assert.match(harness.body(), /automationWaitLine/);

  // Hiçbir şey değiştirilmeden kaydedilince kural birebir geri yazılır: veri kaybı yok.
  await harness.api.saveAutomationWizard();
  const [saved] = harness.saved();
  assert.deepEqual(saved.actions, [
    { type: "delay", seconds: 30 },
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" },
    { type: "delay", seconds: 10 },
    { type: "group", groupId: "group-7", property: "state", value: "OFF" }
  ]);

  // Sayaç sıfırlanınca daha önce yazılmış bekleme kalkar; ortadaki durak yine korunur.
  harness.api.setAutomationWaitSeconds(0);
  await harness.api.saveAutomationWizard();
  const [again] = harness.saved();
  assert.deepEqual((again.actions as Record<string, unknown>[]).map((action) => action.type), ["device", "delay", "group"]);
});

test("yalnız bekleme seçilip hiç eylem eklenmezse kural kaydedilmez", async () => {
  const harness = await automationWaitStepHarness();
  const { api } = harness;
  api.setAutomationWaitSeconds(30);
  // Hedef yokken kural hazır sayılmaz; birincil düğme de bunu yazar.
  assert.equal(api.automationWizardReady(harness.wizard()), false);
  await api.saveAutomationWizard();
  assert.deepEqual(harness.saved(), []);
  assert.deepEqual(harness.toasts, ["automationNeedRealAction"]);
});

// İki bekleme iki ayrı şeydir: biri tetikleyiciyle ilk eylem arasında, öbürü eylemler arasında.
// Metinleri birbirine karışmasın diye ayrıştırıldı; ikisi de iki dilde durur.
test("tetikleyici sonrası bekleme ile eylemler arası bekleme ayrı sözcüklerle anlatılır", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /automationWaitTitle:"Tetiklendikten sonra beklesin mi\?"/);
  assert.match(dashboard, /automationWaitTitle:"Wait after the trigger\?"/);
  assert.match(dashboard, /automationWaitHint:"0:00 = hemen çalışsın\. Sayaç dakika:saniye gösterir, en çok 5:00 \(300 saniye\)\."/);
  assert.match(dashboard, /automationWaitHint:"0:00 = run right away\. The dial shows minutes:seconds, up to 5:00 \(300 seconds\)\."/);
  assert.match(dashboard, /automationWaitNowLine:"Tetiklenince hemen çalışsın"/);
  assert.match(dashboard, /automationWaitNowLine:"Runs the moment it triggers"/);
  assert.match(dashboard, /automationWaitLine:"Tetiklendikten \{duration\} sonra çalışsın"/);
  assert.match(dashboard, /automationWaitLine:"Runs \{duration\} after the trigger"/);

  // Eylem listesindeki seçenek kalkmadı: eylemler arasındaki bekleme hâlâ oradan kurulur.
  assert.match(dashboard, /\{glyph:"⏳",title:t\("automationActionDelay"\),sub:t\("automationActionDelaySub"\),hook:'data-automation-action-kind="delay"'\}/);
  assert.match(dashboard, /automationActionDelay:"Eylemler arasında bekle"/);
  assert.match(dashboard, /automationActionDelay:"Wait between actions"/);
  assert.match(dashboard, /automationActionDelaySub:"Bu listede bir sonraki eyleme geçmeden önce duraklar\."/);
  assert.match(dashboard, /automationActionDelaySub:"Pause before the next action in this list\."/);
});

// Bekleme sayacı açık gelince kullanıcı "süre girmek zorundayım" diye okuyordu. Adım artık kendi
// başlığı altında ("gerekiyorsa") ve katlanmış durur; kaydetme davranışı değişmez.
test("bekleme adımı opsiyonel görünür: kendi başlığı altında ve katlanmış", async () => {
  const dashboard = await readDashboardBundle();

  // Başlık "ne yapsın" değil: bekleme kendi bölümünde, "ne yapsın"ın hemen üstünde durur.
  assert.match(dashboard, /automationSectionOptional:"GEREKİYORSA"/);
  assert.match(dashboard, /automationSectionOptional:"IF NEEDED"/);
  assert.match(dashboard, /automationWaitOpen:"Bekle"/);
  assert.match(dashboard, /automationWaitOpen:"Wait"/);
  assert.match(dashboard, /automationWaitClear:"Beklemeyi kaldır"/);
  assert.match(dashboard, /automationWaitClear:"Remove the wait"/);
  const optional = dashboard.indexOf('{label:t("automationSectionOptional"),fill:automationWaitNodes');
  const then = dashboard.indexOf('{label:t("automationSectionThen"),fill:automationThenNodes');
  assert.ok(optional > 0 && optional < then);
  // Kapalıyken koşulun süre ölçütüyle aynı sessiz blok dilini kullanır — yeni bir stil türetilmez.
  assert.match(dashboard, /const automationWaitOpen=wizard=>Boolean\(wizard\?\.waitOpen\)\|\|automationWaitSeconds\(wizard\)>0/);
  assert.match(dashboard, /\.automation-wait-open\{display:flex;align-items:center;justify-content:space-between/);

  // Akışta: bekleme bölümü "ne yapsın" bölümünden önce basılır ve hedefler ona karışmaz.
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  // Hiçbir şeye dokunmadan İleri: süre yazılmaz, adım atlanır.
  assert.equal(api.automationWaitOpen(harness.wizard()), false);
  await api.nextAutomationStep();
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  const body = harness.body();
  assert.ok(body.indexOf("automationSectionOptional") < body.indexOf("automationSectionThen"));
  await api.saveAutomationWizard();
  const [saved] = harness.saved();
  assert.deepEqual((saved.actions as Record<string, unknown>[]).map((action) => action.type), ["device"]);

  // Süre girilirse davranış eskisi gibi: ilk eylem olarak yazılır.
  api.goToAutomationStage("wait");
  api.toggleAutomationWait("1");
  assert.equal(api.automationWaitOpen(harness.wizard()), true);
  api.setAutomationWaitSeconds(20);
  await api.saveAutomationWizard();
  // Yeni kural her kaydetmede yeni satır yazar: karşılaştırma sonuncusudur.
  const list = harness.saved();
  const again = list[list.length - 1];
  assert.deepEqual(again.actions, [
    { type: "delay", seconds: 20 },
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }
  ]);
});

// Kayıtlı kuralda süre zaten varsa sayaç açık gelir: kullanıcı değeri görmeden düzenleyemezdi.
test("kayıtlı kuralın beklemesi sayaç açık olarak geri gelir", async () => {
  const harness = await automationWizardHarness();
  (harness.state.automations as unknown[]).push({
    id: "rule-wait",
    name: "Koridor",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }],
    conditions: [],
    actions: [
      { type: "delay", seconds: 30 },
      { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }
    ]
  });
  harness.api.openAutomationWizard("rule-wait");
  assert.equal(harness.api.automationWaitOpen(harness.wizard()), true);
  harness.api.goToAutomationStage("wait");
  assert.match(harness.body(), /<span class="automation-counter-value">0:30<\/span>/);
});

// §2.1 — süre ölçütü durum koşulunun içinde sessiz bir satırdı; kullanıcı orada olduğunu bilmiyordu.
// Üçüncü satır aynı koşulu kurar, tek farkı süre satırının açık gelmesidir.
test("koşul listesinde süreli üçüncü satır var ve süre satırı açık gelir", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /data-automation-cond-kind="deviceStateFor"/);
  assert.match(dashboard, /automationCondStateFor:"Şu cihaz bir süredir şu durumdaysa"/);
  assert.match(dashboard, /automationCondStateFor:"Only when a device has been in a state for a while"/);
  assert.match(dashboard, /automationCondStateForSub:"Örneğin yalnız 5 dakikadır kimse hareket etmediyse\."/);
  assert.match(dashboard, /automationCondStateForSub:"For example only when nobody has moved for 5 minutes\."/);

  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  await api.nextAutomationStep();
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  api.goToAutomationStage("cond");

  // Liste üç satırlıdır ve üçüncüsü süre ölçütüne açılır.
  assert.match(harness.body(), /data-automation-cond-kind="timeRange"/);
  assert.match(harness.body(), /data-automation-cond-kind="deviceState"/);
  assert.match(harness.body(), /data-automation-cond-kind="deviceStateFor"/);

  api.chooseAutomationCondKind("deviceStateFor");
  assert.equal((harness.wizard().draftCondition as Record<string, unknown>).forSeconds, 60);
  api.chooseAutomationCondDevice("0x0011");
  api.chooseAutomationCondState("state=ON");
  // Süre satırı kapalı düğme olarak değil, açık sayaç olarak gelir.
  assert.match(harness.body(), /data-automation-cond-for="0"/);
  assert.match(harness.body(), /<span class="automation-counter-value">0:01<\/span>/);
  api.setAutomationCondForSeconds(300);
  await api.nextAutomationStep();

  // Veri modeli değişmedi: aynı `deviceState` koşulu, üstüne `forSeconds`.
  assert.deepEqual(harness.wizard().conditions, [
    { type: "deviceState", deviceId: "0x0011", property: "state", equals: "ON", forSeconds: 300 }
  ]);

  // Süresiz yol eskisi gibi kapalı başlar.
  api.addAutomationCondition();
  api.chooseAutomationCondKind("deviceState");
  assert.equal((harness.wizard().draftCondition as Record<string, unknown>).forSeconds, null);
  api.chooseAutomationCondDevice("0x0011");
  api.chooseAutomationCondState("state=OFF");
  assert.match(harness.body(), /data-automation-cond-for="1"/);
  assert.doesNotMatch(harness.body(), /data-automation-cond-for-step=/);
});

// Cihaz seçimindeki "Değiştir" bağlantısını kimse görmüyordu: seçilen satır artık yerinde kalır
// ve yanındaki × ile bütün liste geri gelir. Aynı desen tetikleyicide ve koşulda geçerlidir.
test("cihaz seçimi × ile geri alınır, öbür cihazlar solarak kaybolur", async () => {
  const dashboard = await readDashboardBundle();

  assert.match(dashboard, /const automationPickedDeviceHtml=\(device,scope\)=>\{/);
  assert.match(dashboard, /data-automation-clear-device="\$\{scope\}"/);
  assert.match(dashboard, /automationClearDevice:"Cihaz seçimini kaldır, listeyi geri getir"/);
  assert.match(dashboard, /automationClearDevice:"Clear the device and show the list again"/);
  // Geçiş: seçilmeyen satırlar solar, seçilen yerinde kalır — blok topluca söndürülmez.
  assert.match(dashboard, /function automationChooseDevice\(scope,deviceId,mutate\)\{/);
  assert.match(dashboard, /list\.classList\.add\("is-choosing"\);\s*chosen\.classList\.add\("is-chosen"\);/);
  assert.match(dashboard, /const leaving=automationPickChoosing\?null:\$\("#automationBody \[data-automation-active\]"\)/);
  assert.match(dashboard, /\.automation-pick-list\.is-choosing \.automation-opt,[^{]*\{opacity:0;transform:translateY\(-\.4rem\)/);
  assert.match(dashboard, /\.automation-pick-list\.is-choosing \.automation-opt\.is-chosen\{opacity:1;transform:none/);
  // Hareket azaltma: animasyon yok, davranış aynı.
  assert.match(dashboard, /@media\(prefers-reduced-motion:reduce\)\{\.automation-picking \.automation-filter,\.automation-pick-list\.is-choosing/);
  assert.match(dashboard, /if\(!chosen\|\|automationReducedMotion\(\)\)\{automationAdvance\(mutate\);return\}/);
  // Dokunma hedefi öbür kapatma ikonlarıyla aynı ölçüde.
  assert.match(dashboard, /\.automation-picked-clear\{flex:none;width:44px;height:44px/);

  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  assert.match(harness.body(), /data-automation-clear-device="trigger"/);
  assert.doesNotMatch(harness.body(), /data-automation-trigger-device=/);

  // ×: seçim kalkar, bütün cihazlar yeniden görünür.
  api.clearAutomationPickedDevice("trigger");
  assert.equal(harness.wizard().stage, "trigDevice");
  assert.equal(harness.wizard().triggerDeviceId, null);
  assert.match(harness.body(), /data-automation-trigger-device="0x0022"/);
  assert.match(harness.body(), /data-automation-trigger-device="0x0033"/);
  assert.doesNotMatch(harness.body(), /data-automation-clear-device=/);

  // Koşul adımında da aynı desen.
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  await api.nextAutomationStep();
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("deviceStateFor");
  api.chooseAutomationCondDevice("0x0011");
  assert.match(harness.body(), /data-automation-clear-device="cond"/);
  api.clearAutomationPickedDevice("cond");
  assert.equal(harness.wizard().stage, "condDevice");
  assert.match(harness.body(), /data-automation-cond-device="0x0011"/);
  // Süre ölçütü gibi öbür cevaplar korunur: yalnız cihaz düşer.
  assert.equal((harness.wizard().draftCondition as Record<string, unknown>).forSeconds, 60);
  assert.equal((harness.wizard().draftCondition as Record<string, unknown>).deviceId, null);
});

// Sihirbazdan çıkmak için üst üste "Geri" basmak gerekiyordu: sağ üstte panelin kendi kapatma
// ikonu var. Doldurulmuş bir şey varsa çıkmadan önce onay sorar.
test("sihirbazın sağ üstünde kapatma ikonu var ve veri kaybını sorar", async () => {
  const dashboard = await readDashboardBundle();

  // Panelin mevcut kapatma dili: `.device-detail-close` (44×44) ve başlık satırının sağ ucu.
  assert.match(dashboard, /<button id="closeAutomationWizard" class="device-detail-close automation-close" type="button" data-i18n-aria="close" aria-label="Close">×<\/button>/);
  assert.match(dashboard, /\.automation-head\{flex:none;display:flex;align-items:flex-start;justify-content:space-between/);
  assert.match(dashboard, /\.device-detail-close\{width:44px;height:44px/);
  assert.match(dashboard, /\$\("#closeAutomationWizard"\)\.onclick=closeAutomationWizard/);
  assert.match(dashboard, /bindBackdropClose\("#automationDialog",".automation-modal",closeAutomationWizard\)/);
  assert.match(dashboard, /automationCloseConfirm:"Sihirbaz kapatılsın mı\? Doldurduklarınız kaydedilmez\."/);
  assert.match(dashboard, /automationCloseConfirm:"Close the wizard\? What you filled in is not saved\."/);

  const harness = await automationWizardHarness();
  const { api } = harness;

  // Hiçbir şey doldurulmadıysa doğrudan kapanır: yol sorusunda soru sorulmaz.
  api.openAutomationWizard(null);
  assert.equal(api.automationWizardDirty(harness.wizard()), false);
  api.closeAutomationWizard();
  assert.deepEqual(harness.confirms, []);
  assert.equal(harness.closeCalls(), 1);

  // Tür seçildikten sonra çıkış onay ister; "hayır" denince sihirbaz açık kalır.
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  assert.equal(api.automationWizardDirty(harness.wizard()), false);
  api.chooseAutomationTrigger("sensor");
  assert.equal(api.automationWizardDirty(harness.wizard()), true);
  harness.answerConfirm(false);
  api.closeAutomationWizard();
  assert.deepEqual(harness.confirms, ["automationCloseConfirm"]);
  assert.equal(harness.closeCalls(), 1);

  // "Evet" denince kapanır.
  harness.answerConfirm(true);
  api.closeAutomationWizard();
  assert.equal(harness.closeCalls(), 2);

  // Kayıtlı kural düzenlemeye açılıp hiçbir şeye dokunulmazsa uyarı çıkmaz.
  (harness.state.automations as unknown[]).push({
    id: "rule-close",
    name: "Koridor",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }],
    conditions: [],
    actions: [{ type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }]
  });
  api.openAutomationWizard("rule-close");
  assert.equal(api.automationWizardDirty(harness.wizard()), false);
  api.goToAutomationStage("wait");
  assert.equal(api.automationWizardDirty(harness.wizard()), true);
});

// Güneş tetikleyicisi: olay seçimi yok (her zaman iki an), kaydırma −/+ sayacıyla; ±240 dk aşılmaz.
test("güneş tetikleyicisi kaydırma sayacıyla kurulur ve konum yoksa sebebini yazar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sun");
  assert.equal(harness.wizard().stage, "sun");
  const body = harness.body();
  // Üç satırlık "gün doğumu / gün batımı / ikisi de" seçimi kalktı.
  assert.doesNotMatch(body, /data-automation-sun-event=/);
  // Hazır kaydırma çipleri yerine tek sayaç: değeri "0:00", iki yönlü düğmesi var.
  assert.doesNotMatch(body, /data-automation-sun-offset=/);
  assert.match(body, /data-automation-sun-step="-1"/);
  assert.match(body, /data-automation-sun-step="1"/);
  assert.match(body, /<span class="automation-counter-value">0:00<\/span>/);
  // Ayarlanan an burada seçilir; kural yine iki anı da taşır.
  assert.match(body, /data-automation-sun-edit="sunset"/);
  assert.match(body, /data-automation-sun-edit="sunrise"/);
  // Gün çipleri saat tetikleyicisiyle aynı bileşenden gelir.
  assert.match(body, /data-automation-day="all"/);

  api.setAutomationSunOffset(-30, false);
  assert.equal(harness.wizard().sunOffset, -30);
  // Negatif değer işaretiyle okunur; sıfırda işaret yazılmaz.
  assert.match(harness.body(), /<span class="automation-counter-value">−0:30<\/span>/);
  // Sunucu şeması: sun / event / offsetMinutes / days.
  const trigger = api.automationWizardTrigger(harness.wizard()) as Record<string, unknown>;
  assert.equal(trigger.type, "sun");
  assert.equal(trigger.event, "sunset");
  assert.equal(trigger.offsetMinutes, -30);
  assert.deepEqual(trigger.days, [1, 2, 3, 4, 5, 6, 7]);
  // Motor sınırı aşılmaz: sayaç ±240 dakikada durur, yani −4:00 … +4:00.
  api.setAutomationSunOffset(-9000, true);
  assert.equal(harness.wizard().sunOffset, -240);
  assert.match(harness.body(), /<span class="automation-counter-value">−4:00<\/span>/);
  api.setAutomationSunOffset(api.automationCounterNext(-240, -1));
  assert.equal(harness.wizard().sunOffset, -240);
  api.setAutomationSunOffset(9000);
  assert.equal(harness.wizard().sunOffset, 240);
  assert.match(harness.body(), /<span class="automation-counter-value">\+4:00<\/span>/);
  api.setAutomationSunOffset(api.automationCounterNext(240, 1));
  assert.equal(harness.wizard().sunOffset, 240);
  // Adım şeması: sıfırın çevresinde bir dakika, uzaklaştıkça kabalaşır.
  assert.equal(api.automationCounterNext(0, 1), 1);
  assert.equal(api.automationCounterNext(0, -1), -1);
  assert.equal(api.automationCounterNext(5, -1), 4);
  assert.equal(api.automationCounterNext(5, 1), 10);
  assert.equal(api.automationCounterNext(-5, 1), -4);
  assert.equal(api.automationCounterNext(60, 1), 75);
  // Özet satırı akışın dilinde.
  api.setAutomationSunOffset(-30);
  assert.match(String(api.automationTriggerLine(harness.wizard())), /automationLineSun/);

  // Konum yoksa satır pasif kalır, sebebi sunucudan gelen kodla yazılır ve çıkış yolu görünür.
  harness.state.homeLocation = null;
  harness.state.automationSun = { sunrise: null, sunset: null, reason: "locationMissing" };
  api.goToAutomationStage("sun");
  assert.match(harness.body(), /automationReasonLocationMissing/);
  assert.match(harness.body(), /data-automation-open-location="1"/);
  assert.equal(api.automationStageAdvanceable(harness.wizard()), false);
  assert.equal(api.automationBlockedReason(harness.wizard()), "automationNeedLocation");
});

// §9.1 — kullanıcı "gün doğumunda şunu, gün batımında şunu" diyebilsin: tek kural, iki olay.
test("güneşin iki olayı tek kuralda eşleme formuyla kurulur", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sun");
  // Seçim sorulmaz: güneş yolu her zaman iki anı kurar.

  // Kaydırma ve gün seçimi olay başına ayrı; varsayılan ikisi de aynı.
  assert.match(harness.body(), /data-automation-sun-edit="sunset"/);
  assert.match(harness.body(), /data-automation-sun-edit="sunrise"/);
  api.setAutomationSunOffset(-30, false);
  api.chooseAutomationSunEdit("sunrise");
  api.setAutomationSunOffset(15, false);
  api.toggleAutomationDay("1");
  assert.equal(harness.wizard().sunOffset, -30);
  assert.equal(harness.wizard().sunriseOffset, 15);
  assert.deepEqual(harness.wizard().days, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(harness.wizard().sunriseDays, [1]);

  // Kaydedilecek tetikleyiciler: iki `sun` satırı, önce batış.
  assert.deepEqual(api.automationWizardTriggers(harness.wizard()), [
    { type: "sun", event: "sunset", offsetMinutes: -30, days: [1, 2, 3, 4, 5, 6, 7] },
    { type: "sun", event: "sunrise", offsetMinutes: 15, days: [1] }
  ]);
  // Özet satırı iki anı da anlatır; tam şablon anahtarı.
  assert.match(String(api.automationTriggerLine(harness.wizard())), /automationLineSunBoth/);

  // Hedef seçilince eşleme formu açılır: "Değiştir" burada hiç sunulmaz, yön adları olaydır.
  api.chooseAutomationTargetDevice("0x0011");
  assert.equal(harness.wizard().stage, "map");
  assert.match(harness.body(), /automationMapWhenSunset/);
  assert.match(harness.body(), /automationMapWhenSunrise/);
  assert.doesNotMatch(harness.body(), /automationTurnToggle/);
  // Varsayılan eşleme: batınca Aç, doğunca Kapat.
  assert.equal(harness.wizard().draftMapOn, "on");
  assert.equal(harness.wizard().draftMapOff, "off");
  // Kullanıcı tersine çevirebilir, sonra geri alabilir.
  api.chooseAutomationMap("on|off");
  assert.equal(harness.wizard().draftMapOn, "off");
  api.chooseAutomationMap("on|toggle");
  assert.equal(harness.wizard().draftMapOn, "off");
  api.chooseAutomationMap("on|on");

  // Eşleme cevabı kesinleşir, ardından kaydedilir.
  await api.nextAutomationStep();
  await api.saveAutomationWizard();
  const saved = harness.saved()[harness.saved().length - 1] as Record<string, unknown>;
  assert.deepEqual(saved.triggers, [
    { type: "sun", event: "sunset", offsetMinutes: -30, days: [1, 2, 3, 4, 5, 6, 7] },
    { type: "sun", event: "sunrise", offsetMinutes: 15, days: [1] }
  ]);
  assert.deepEqual(saved.actions, [
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON", when: { equals: "sunset" } },
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "OFF", when: { equals: "sunrise" } }
  ]);

  // Ayarlanan an değişse de kayıt iki olayı taşımayı sürdürür.
  api.goToAutomationStage("sun");
  api.chooseAutomationSunEdit("sunset");
  assert.deepEqual(api.automationWizardTriggers(harness.wizard()), [
    { type: "sun", event: "sunset", offsetMinutes: -30, days: [1, 2, 3, 4, 5, 6, 7] },
    { type: "sun", event: "sunrise", offsetMinutes: 15, days: [1] }
  ]);
});

// §5.4 — eşleme yolunda "açık mı kapalı mı" sorusu hiç sorulmaz. Kullanıcı bunu eksik sanıp
// gereksiz koşul eklemeye kalkıyordu: tetikleyici satırının altındaki tek satır cevabın nerede
// verileceğini söyler. Yalnız eşleme yolunda ve yalnız hedef seçilmeden önce durur.
test("eşleme yolunda tetikleyici satırının altında ne zaman karar verileceği yazar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  // Tetikleyici kanalı hedef listesinden düşer: ikinci bir anahtar gerekiyor.
  (harness.state.devices as unknown[]).push({
    id: "0x0077", name: "Salon lambası", buttons: [], features: [], state: {},
    controls: [{ id: "switch:state", property: "state", name: "Salon lambası", kind: "switch", valueOn: "ON", valueOff: "OFF", valueToggle: "TOGGLE" }]
  });
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("deviceState");
  api.chooseAutomationTriggerDevice("0x0011");

  // Tetikleyici tamam: ipucu görünür, hedef henüz seçilmedi.
  assert.match(harness.body(), /automationMapLaterHint/);

  // Hedef listesi açıkken de durur: cevabın nerede verileceğini seçim anında hatırlatır.
  await api.nextAutomationStep();
  assert.equal(harness.wizard().stage, "target");
  assert.match(harness.body(), /automationMapLaterHint/);

  // Hedef seçilince eşleme formu zaten anlatır: ipucu susar.
  api.chooseAutomationTargetDevice("0x0077");
  assert.equal(harness.wizard().stage, "map");
  assert.doesNotMatch(harness.body(), /automationMapLaterHint/);

  // Güneş yolu da eşleme formuna düşer: aynı ipucu orada da durur.
  const sun = await automationWizardHarness();
  sun.api.openAutomationWizard(null);
  sun.api.chooseAutomationPath("rule");
  sun.api.chooseAutomationTrigger("sun");
  await sun.api.nextAutomationStep();
  assert.match(sun.body(), /automationMapLaterHint/);
  sun.api.chooseAutomationTargetDevice("0x0011");
  assert.equal(sun.wizard().stage, "map");
  assert.doesNotMatch(sun.body(), /automationMapLaterHint/);

  // Eşlemeye düşmeyen tetikleyicide çıkmaz: orada durum zaten baştan soruluyor.
  const sensor = await automationWizardHarness();
  sensor.api.openAutomationWizard(null);
  sensor.api.chooseAutomationPath("rule");
  sensor.api.chooseAutomationTrigger("sensor");
  sensor.api.chooseAutomationTriggerDevice("0x0022");
  sensor.api.chooseAutomationEvent("occupancy=true");
  await sensor.api.nextAutomationStep();
  // Tetikleyici satırı gerçekten basıldı; ipucunun yokluğu boş gövdeden gelmiyor.
  assert.match(sensor.body(), /data-automation-stage="trigEvent"/);
  assert.doesNotMatch(sensor.body(), /automationMapLaterHint/);
});

test("ne zaman karar verileceğini söyleyen satır tek şablon anahtarıdır", async () => {
  const dashboard = await readDashboardBundle();

  // Koşul yolu değil: satır yalnız eşleme kipinde ve hedef seçilmeden önce basılır.
  assert.match(
    dashboard,
    /const mapHint=automationMappingMode\(wizard\)&&!wizard\.targets\.length&&!wizard\.draftTargetId\s*\?`<p class="automation-hint">\$\{esc\(t\("automationMapLaterHint"\)\)\}<\/p>`\s*:"";/
  );
  // Panelin mevcut ipucu dili kullanıldı: yeni bileşen yok.
  assert.match(dashboard, /\.automation-hint\{margin:12px 0 0;max-width:56ch/);
  // Tam şablon: parça birleştirme yok, iki dilde de geliştirici sözlüğü geçmiyor.
  assert.match(dashboard, /automationMapLaterHint:"Hangi durumda ne olacağını, çalıştıracağın cihazı seçtikten sonra belirleyeceksin\."/);
  assert.match(dashboard, /automationMapLaterHint:"You will decide what happens in each case after you pick the device to run\."/);
  for (const word of ["eşleme formu", "tetikleyici", "koşul", "mapping form", "trigger", "condition"]) {
    assert.doesNotMatch(dashboard, new RegExp(`automationMapLaterHint:"[^"]*${word}`, "i"));
  }
});

// Tek `sun` tetikleyicisi taşıyan eski kural yeni ekrana kayıpsız düşer: kendi yönü dolu,
// öbür yön "bir şey yapma". Canlıda böyle kurallar var, düzenlemede sessizce bozulmamalı.
test("tek olaylı eski güneş kuralı iki olaylı ekrana kayıpsız açılır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  (harness.state.automations as unknown[]).push({
    id: "sun-single",
    name: "Test Light sunrise",
    enabled: true,
    triggers: [{ type: "sun", event: "sunrise", offsetMinutes: -15, days: [1, 2, 3, 4, 5, 6, 7] }],
    conditions: [],
    actions: [{ type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON" }]
  });
  api.openAutomationWizard("sun-single");
  // Kayıtlı olay kendi yuvasına oturdu; öbür an dokunulmamış varsayılanla geldi.
  assert.equal(harness.wizard().sunriseOffset, -15);
  assert.equal(harness.wizard().sunOffset, 0);
  assert.deepEqual(harness.wizard().sunriseDays, [1, 2, 3, 4, 5, 6, 7]);
  // Eylem gün doğumu yönünde; gün batımı yönü "bir şey yapma".
  assert.deepEqual(harness.wizard().targets, [
    { deviceId: "0x0011", property: "state", controlId: "switch:state", mapOn: "none", mapOff: "on" }
  ]);

  await api.saveAutomationWizard();
  const saved = harness.saved().find((item) => item.id === "sun-single") as Record<string, unknown>;
  assert.deepEqual(saved.triggers, [
    { type: "sun", event: "sunset", offsetMinutes: 0, days: [1, 2, 3, 4, 5, 6, 7] },
    { type: "sun", event: "sunrise", offsetMinutes: -15, days: [1, 2, 3, 4, 5, 6, 7] }
  ]);
  // Boş yönün eylemi yazılmaz: kural hâlâ yalnız gün doğumunda bir şey yapar.
  assert.deepEqual(saved.actions, [
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON", when: { equals: "sunrise" } }
  ]);

  // İkinci turda kayıt aynen korunur: göç bir kez olur, sonra kural sabit kalır.
  (harness.state.automations as unknown[])[0] = JSON.parse(JSON.stringify(saved));
  api.openAutomationWizard("sun-single");
  await api.saveAutomationWizard();
  const again = harness.saved().find((item) => item.id === "sun-single") as Record<string, unknown>;
  assert.deepEqual(again.triggers, saved.triggers);
  assert.deepEqual(again.actions, saved.actions);
});

// Sayısal özellikte eşik sorulur; sayısal olmayan özellikte alan hiç görünmez.
test("sensör eşiği yalnız sayısal özellikte sorulur", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  // Hareket sensöründe eşik satırı yok.
  api.chooseAutomationTriggerDevice("0x0022");
  assert.equal(harness.wizard().triggerNumeric, false);
  assert.doesNotMatch(harness.body(), /data-automation-threshold-dir=/);

  // Sıcaklık sensöründe sayısal satır çıkar, seçilince eşik sorusu açılır.
  api.goToAutomationStage("trigDevice");
  api.chooseAutomationTriggerDevice("0x0044");
  assert.equal(harness.wizard().stage, "trigThreshold");
  assert.equal(harness.wizard().triggerNumeric, true);
  assert.match(harness.body(), /data-automation-threshold-dir="above"/);
  assert.match(harness.body(), /data-automation-threshold-dir="below"/);

  api.chooseAutomationThresholdDir("above");
  api.stepAutomationThreshold(5);
  const trigger = api.automationWizardTrigger(harness.wizard()) as Record<string, unknown>;
  assert.equal(trigger.type, "deviceState");
  assert.equal(trigger.property, "temperature");
  assert.equal(trigger.above, 26);
  assert.equal(trigger.equals, undefined);
  assert.match(String(api.automationTriggerLine(harness.wizard())), /automationLineAbove/);

  // "Altına inerse" yönünde yalnız `below` yazılır.
  api.chooseAutomationThresholdDir("below");
  const below = api.automationWizardTrigger(harness.wizard()) as Record<string, unknown>;
  assert.equal(below.below, 26);
  assert.equal(below.above, undefined);
});

// Koşul bölümü: en fazla dört koşul, tek satır özet, ✕ ile kaldırma.
test("koşul bölümü saat aralığı ve cihaz durumu koşulu ekler", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  // Koşul yoksa tek satır: "her zaman çalışsın".
  assert.match(harness.body(), /automationCondAlwaysLine/);
  api.goToAutomationStage("cond");
  assert.match(harness.body(), /data-automation-cond-kind="timeRange"/);
  assert.match(harness.body(), /data-automation-cond-kind="deviceState"/);

  // Saat aralığı: gece yarısını aşan aralık geçerli ve kullanıcıya da yazılır.
  api.chooseAutomationCondKind("timeRange");
  assert.match(harness.body(), /data-automation-cond-time="hour:1"/);
  assert.match(harness.body(), /data-automation-cond-time-to="hour:1"/);
  assert.match(harness.body(), /automationCondOvernightHint/);
  api.commitAutomationCondition();
  const conditions = harness.wizard().conditions as Array<Record<string, unknown>>;
  assert.deepEqual(conditions[0], {
    type: "timeRange",
    from: { kind: "clock", at: "22:00" },
    to: { kind: "clock", at: "06:00" }
  });
  assert.match(String(api.automationConditionLine(conditions[0])), /automationCondTimeLine/);
  assert.match(String(api.automationConditionLine(conditions[0])), /automationCondOvernight/);
  assert.match(harness.body(), /data-automation-remove-cond="0"/);
  assert.match(harness.body(), /data-automation-add-cond="1"/);

  // Cihaz durumu koşulu: "değilse" yönü ayrı alan olarak kaydedilir.
  api.addAutomationCondition();
  api.chooseAutomationCondKind("deviceState");
  assert.match(harness.body(), /data-automation-cond-device="0x0011"/);
  api.chooseAutomationCondDevice("0x0011");
  assert.match(harness.body(), /data-automation-cond-negate="1"/);
  api.chooseAutomationCondNegate("1");
  api.chooseAutomationCondState("state=ON");
  // Durum seçimi adımı kapatmaz; koşul birincil düğmeyle kesinleşir.
  api.commitAutomationCondition();
  const all = harness.wizard().conditions as Array<Record<string, unknown>>;
  assert.equal(all.length, 2);
  assert.deepEqual(all[1], { type: "deviceState", deviceId: "0x0011", property: "state", not: "ON" });
  assert.match(String(api.automationConditionLine(all[1])), /automationCondStateNotLine/);

  // Kaldırma yalnız o koşulu düşürür.
  api.removeAutomationCondition(0, null);
  assert.equal((harness.wizard().conditions as unknown[]).length, 1);
});

// §2.3 — aralık ucu sabit saat yerine güneşe göreli bir an olabilir; "hava karanlıkken" ön ayardır.
test("koşul saat aralığının uçları güneşe göre ayarlanır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("timeRange");
  // Hazır çipler ve her uç için üç seçenek aynı ekranda.
  assert.match(harness.body(), /data-automation-cond-preset="dark"/);
  assert.match(harness.body(), /data-automation-cond-preset="daylight"/);
  assert.match(harness.body(), /data-automation-cond-preset="custom"/);
  assert.match(harness.body(), /data-automation-cond-point="from:clock"/);
  assert.match(harness.body(), /data-automation-cond-point="from:sunrise"/);
  assert.match(harness.body(), /data-automation-cond-point="to:sunset"/);
  // Başlangıç sabit saatli: kaydırma kadranı henüz yok.
  assert.doesNotMatch(harness.body(), /data-automation-cond-sun-step=/);

  api.chooseAutomationCondPreset("dark");
  assert.match(harness.body(), /data-automation-cond-sun-step="from:15"/);
  assert.match(harness.body(), /data-automation-cond-sun-step="to:-15"/);
  api.commitAutomationCondition();
  const dark = (harness.wizard().conditions as Array<Record<string, unknown>>)[0];
  assert.deepEqual(dark, {
    type: "timeRange",
    from: { kind: "sun", event: "sunset", offsetMinutes: 0 },
    to: { kind: "sun", event: "sunrise", offsetMinutes: 0 }
  });
  // Ön ayarın kendi cümlesi var: uçlar tek tek okunmaz.
  assert.match(String(api.automationConditionLine(dark)), /automationCondDarkLine/);

  // Kaydırma ve karışık uç: "gün batımından 15 dk önce → 06:00".
  api.editAutomationCondition(0);
  api.stepAutomationCondSunOffset("from:-15");
  api.chooseAutomationCondPoint("to:clock");
  api.commitAutomationCondition();
  const mixed = (harness.wizard().conditions as Array<Record<string, unknown>>)[0];
  assert.deepEqual(mixed, {
    type: "timeRange",
    from: { kind: "sun", event: "sunset", offsetMinutes: -15 },
    to: { kind: "clock", at: "06:00" }
  });
  // Karışık uç ön ayar değildir: iki ucu da yazan genel şablona düşer.
  const line = String(api.automationConditionLine(mixed));
  assert.match(line, /automationCondTimeLine/);
  assert.doesNotMatch(line, /automationCondDarkLine/);
  // Gece yarısını aşma notu artık dize karşılaştırmasına değil, güneş saatlerine dayanıyor
  // (batıştan 15 dk önce = 19:29 → 06:00).
  assert.match(line, /automationCondOvernight/);
  // Aynı aralık gündüz tarafında olsaydı not çıkmazdı.
  assert.doesNotMatch(
    String(api.automationConditionLine({ ...mixed, to: { kind: "clock", at: "23:00" } })),
    /automationCondOvernight/
  );

  // Kaydırma sunucu sınırında durur: ±240'ı aşan bir değer üretilmez.
  api.editAutomationCondition(0);
  for (let step = 0; step < 20; step += 1) api.stepAutomationCondSunOffset("from:-15");
  api.commitAutomationCondition();
  const clamped = (harness.wizard().conditions as Array<Record<string, unknown>>)[0];
  assert.deepEqual(clamped.from, { kind: "sun", event: "sunset", offsetMinutes: -240 });

  // "Özel" uçları saate döndürür; aynı iki güneş ucu ise kaydedilemez.
  api.editAutomationCondition(0);
  api.chooseAutomationCondPreset("custom");
  api.commitAutomationCondition();
  assert.deepEqual((harness.wizard().conditions as Array<Record<string, unknown>>)[0], {
    type: "timeRange",
    from: { kind: "clock", at: "22:00" },
    to: { kind: "clock", at: "06:00" }
  });
  api.editAutomationCondition(0);
  api.chooseAutomationCondPoint("from:sunrise");
  api.chooseAutomationCondPoint("to:sunrise");
  assert.equal(api.automationStageAdvanceable(harness.wizard()), false);
  assert.equal(api.automationBlockedReason(harness.wizard()), "automationNeedCondRange");
});

// Konum girilmeden güneş ucu seçilemez: kilit görünür ve Ayarlar'a çıkış aynı ekranda.
test("konum yoksa koşuldaki güneş uçları kilitli kalır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  harness.state.homeLocation = null;
  harness.state.automationSun = { sunrise: null, sunset: null, reason: "locationMissing" };
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("timeRange");
  assert.match(harness.body(), /automationCondSunLocked/);
  assert.match(harness.body(), /data-automation-open-location="1"/);
  assert.match(harness.body(), /data-automation-cond-point="from:sunset" disabled/);
  assert.match(harness.body(), /data-automation-cond-preset="dark" aria-pressed="false" disabled/);

  // Kilit yalnız görünüşte değil: çağrı da yutulur, uç saatte kalır.
  api.chooseAutomationCondPoint("from:sunset");
  api.chooseAutomationCondPreset("dark");
  api.commitAutomationCondition();
  assert.deepEqual((harness.wizard().conditions as Array<Record<string, unknown>>)[0], {
    type: "timeRange",
    from: { kind: "clock", at: "22:00" },
    to: { kind: "clock", at: "06:00" }
  });
});

// İkiden az koşulda "hepsi / herhangi biri" sorusu anlamsızdır; hiç çizilmez.
test("koşul sayısı ikiye çıkınca hepsi/herhangi biri anahtarı görünür ve kaydedilir", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  // Tek koşulda anahtar yok.
  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("timeRange");
  api.commitAutomationCondition();
  assert.equal((harness.wizard().conditions as unknown[]).length, 1);
  assert.doesNotMatch(harness.body(), /data-automation-cond-mode=/);

  // İkinci koşulla birlikte iki uçlu anahtar çizilir; varsayılan "hepsi".
  api.addAutomationCondition();
  api.chooseAutomationCondKind("deviceState");
  api.chooseAutomationCondDevice("0x0011");
  api.chooseAutomationCondState("state=ON");
  api.commitAutomationCondition();
  assert.match(harness.body(), /data-automation-cond-mode="all"/);
  assert.match(harness.body(), /data-automation-cond-mode="any"/);
  assert.match(harness.body(), /automationCondModeAll/);
  assert.match(harness.body(), /automationCondModeAny/);
  assert.equal(harness.wizard().conditionMode, "all");

  // Her kaydetme listeye yeni bir kural ekler; ölçülen hep sonuncusudur.
  const lastSaved = (): Record<string, unknown> => harness.saved()[harness.saved().length - 1] ?? {};

  // Varsayılan seçiliyken alan hiç yazılmaz.
  await api.saveAutomationWizard();
  assert.equal("conditionMode" in lastSaved(), false);

  api.chooseAutomationCondMode("any");
  assert.equal(harness.wizard().conditionMode, "any");
  await api.saveAutomationWizard();
  assert.equal(lastSaved().conditionMode, "any");

  // Koşul tek kalınca anahtar da yazılan alan da kaybolur.
  api.removeAutomationCondition(0, null);
  assert.doesNotMatch(harness.body(), /data-automation-cond-mode=/);
  await api.saveAutomationWizard();
  assert.equal("conditionMode" in lastSaved(), false);
});

// Kayıtlı `any` kuralı düzenlemeye açılıp dokunulmadan kaydedilirse aynen geri yazılır.
test("kayıtlı herhangi-biri kuralı sihirbaza okunur ve aynen geri yazılır", async () => {
  const rule = storedRule({
    conditionMode: "any",
    triggers: [{ type: "deviceState", deviceId: "0xa4c1389eef9ade7e", property: "presence", equals: true }],
    conditions: [
      { type: "timeRange", from: "22:00", to: "06:00" },
      { type: "deviceState", deviceId: "0x0088", property: "temperature", below: 18 }
    ],
    actions: [{ type: "device", deviceId: "0xa4c138b950918de3", property: "state", value: "ON", controlId: "main" }]
  });
  const { saved } = await automationRoundTrip(rule);
  assert.equal(saved.conditionMode, "any");
  assert.deepEqual(saved.conditions, rule.conditions);
});

// Canlı sunucudaki eski kurallar dize uçlu. Dokunulmazsa aynen geri yazılır, düzenlenirse yükselir.
test("eski dize uçlu saat aralığı okunur, dokunulmazsa değişmez, düzenlenince nesneye yükselir", async () => {
  const rule = storedRule({
    triggers: [{ type: "deviceState", deviceId: "0xa4c1389eef9ade7e", property: "presence", equals: true }],
    conditions: [{ type: "timeRange", from: "22:00", to: "06:00", days: [1, 5] }],
    actions: [{ type: "device", deviceId: "0xa4c138b950918de3", property: "state", value: "ON", controlId: "main" }]
  });
  const { harness, saved } = await automationRoundTrip(rule);
  assert.deepEqual(saved.conditions, rule.conditions);
  // Kartta da okunur: eski biçim satırı bozmaz.
  assert.match(
    String(harness.api.automationConditionLine((rule.conditions as unknown[])[0])),
    /automationCondTimeDaysLine/
  );

  harness.api.openAutomationWizard(rule.id);
  harness.api.editAutomationCondition(0);
  harness.api.commitAutomationCondition();
  await harness.api.saveAutomationWizard();
  const upgraded = harness.saved().find((item) => item.id === rule.id) as Record<string, unknown>;
  assert.deepEqual(upgraded.conditions, [{
    type: "timeRange",
    from: { kind: "clock", at: "22:00" },
    to: { kind: "clock", at: "06:00" },
    days: [1, 5]
  }]);
});

// Sayısal özellikte koşul değer listesi yerine karşılaştırma satırı gösterir.
test("sayısal koşul üstünde/altında/arasında ölçütü yazar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("deviceState");
  // Sıcaklık sensörü yalnız sayısal satırı olduğu hâlde koşul listesinde durur.
  assert.match(harness.body(), /data-automation-cond-device="0x0044"/);
  api.chooseAutomationCondDevice("0x0044");
  assert.match(harness.body(), /data-automation-cond-state="num:temperature"/);
  // Boolean özellikte eşik arayüzü hiç görünmez.
  assert.doesNotMatch(harness.body(), /data-automation-cond-threshold-dir=/);

  api.chooseAutomationCondState("num:temperature");
  assert.equal(harness.wizard().stage, "condState");
  assert.match(harness.body(), /data-automation-cond-threshold-dir="above"/);
  assert.match(harness.body(), /data-automation-cond-threshold-dir="below"/);
  assert.match(harness.body(), /data-automation-cond-threshold-dir="between"/);
  assert.match(harness.body(), /data-automation-cond-threshold-step="above:1"/);
  // Eşik bugünkü okumadan (21,4) başlar.
  const draft = () => harness.wizard().draftCondition as Record<string, unknown>;
  assert.equal(draft().above, 21);
  api.stepAutomationCondThreshold("above:4");
  api.commitAutomationCondition();
  const conditions = harness.wizard().conditions as Array<Record<string, unknown>>;
  assert.deepEqual(conditions[0], { type: "deviceState", deviceId: "0x0044", property: "temperature", above: 25 });
  assert.match(String(api.automationConditionLine(conditions[0])), /automationCondAboveLine/);

  // "Altındaysa" yalnız `below` yazar.
  api.editAutomationCondition(0);
  api.chooseAutomationCondThresholdDir("below");
  api.stepAutomationCondThreshold("below:-3");
  api.commitAutomationCondition();
  const below = (harness.wizard().conditions as Array<Record<string, unknown>>)[0];
  assert.deepEqual(below, { type: "deviceState", deviceId: "0x0044", property: "temperature", below: 22 });
  assert.match(String(api.automationConditionLine(below)), /automationCondBelowLine/);

  // "Arasında" iki ucu birden yazar; eşit uçlarda üst sınır kendiliğinden bir adım açılır.
  api.editAutomationCondition(0);
  api.chooseAutomationCondThresholdDir("between");
  assert.equal(draft().above, 22);
  assert.equal(draft().below, 23);
  api.stepAutomationCondThreshold("below:3");
  api.commitAutomationCondition();
  const between = (harness.wizard().conditions as Array<Record<string, unknown>>)[0];
  assert.deepEqual(between, { type: "deviceState", deviceId: "0x0044", property: "temperature", above: 22, below: 26 });
  assert.match(String(api.automationConditionLine(between)), /automationCondBetweenLine/);

  // Ters aralık kaydedilemez: ileri düğmesi pasif kalır ve sebebi yazar.
  api.editAutomationCondition(0);
  api.stepAutomationCondThreshold("below:-10");
  assert.equal(api.automationStageAdvanceable(harness.wizard()), false);
  assert.equal(api.automationBlockedReason(harness.wizard()), "automationNeedCondValue");
});

// Çalışma geçmişi satırı: renk tek başına yeterli değil, işaret de var.
test("çalışma geçmişi satırı sonucu ve sebebini birlikte yazar", async () => {
  const dashboard = await readDashboardBundle();
  const helpers = automationHelpers(await panelScripts(), []);
  const row = String(helpers.automationRunRowHtml({
    at: "2026-08-05T10:00:00.000Z",
    outcome: "blocked",
    reason: "conditionFalse",
    trigger: { kind: "device" }
  }));
  assert.match(row, /class="automation-run-row is-blocked"/);
  assert.match(row, /automationOutcomeBlocked/);
  assert.match(row, /automationReasonConditionFalse/);
  assert.match(row, /class="automation-run-glyph" aria-hidden="true">⊘/);
  // Bilinmeyen kod ham gösterilir; çökme ya da boşluk olmaz.
  assert.equal(helpers.automationReasonText("somethingNew"), "somethingNew");
  assert.equal(helpers.automationOutcomeText("weird"), "weird");
  assert.equal(helpers.automationReasonText("busy"), "automationReasonBusy");
});

test("cihaz sınıfı ayar niteliğindeki aç/kapa alanlarını saymaz", async () => {
  const dashboard = await readDashboardBundle();
  const source = await panelScripts();
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

// Görsel testte bulunanlar: odak halkası, hub'ın yerel şehir adı, karanlık temada okunabilirlik
// ve "son çalışma" ile boş günlüğün çelişkisi. Dördü de tek yerden doğrulanır.
test("panelde tarayıcı varsayılanı odak halkası kalmaz", async () => {
  const dashboard = await readDashboardBundle();

  // Özgüllüğü sıfır taban kural: kendi halkasını yazan öğeler ezmeye devam eder.
  assert.match(
    dashboard,
    /:where\(a\[href\],area,button,input,select,textarea,summary,\[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible\{outline:3px solid var\(--forest-soft\);outline-offset:2px\}/
  );
  // Ana ekrana özel beyaz halka kalktı: fotoğraf yokken panelin tek halka dili yeter.
  assert.doesNotMatch(dashboard, /outline:3px solid var\(--on-forest\);outline-offset:3px;box-shadow:0 0 0 6px var\(--forest\)/);
  // Kaydırılabilir saatlik şerit klavyeyle gezilebilir ve kendi halkasını taşır.
  assert.match(dashboard, /<div class="hub-hours" tabindex="0" role="group" aria-label="\$\{esc\(t\("weatherHourly"\)\)\}">/);
  assert.match(dashboard, /\.hub-hours:focus-visible\{outline:3px solid var\(--forest-soft\)/);
});

test("hub yerel şehir adını kullanıcının kaydından okur", async () => {
  const dashboard = await readDashboardBundle();

  // Varsayılan "clockLocal" kaydı listede önce geldiği için `find` onu buluyordu; artık elenir.
  assert.match(
    dashboard,
    /const namedZone=worldClockZones\.find\(zone=>zone\.timeZone===localTimeZone&&zone\.label!=="clockLocal"\);\s*const localName=namedZone\?locationName\(namedZone\):localTimeZone\.split\("\/"\)\.pop\(\)/
  );
  // Dile gömülü şehir adı tablosu yok: ad kullanıcının verisinden gelir.
  assert.doesNotMatch(dashboard, /"Istanbul":"İstanbul"/);
});

test("ana ekran hub'ı fotoğraf zemininden bağımsız okunur", async () => {
  const dashboard = await readDashboardBundle();

  // Dolgu kalktı: zemin, gölge ve kenarlık yok — blok doğrudan fotoğrafın üstünde.
  assert.match(dashboard, /\.home-hub\{[^}]*padding:0;border:0;border-radius:0;background:none;box-shadow:none;text-shadow:var\(--hub-text-shadow\)\}/);
  assert.doesNotMatch(dashboard, /\.home-hub\{[^}]*border:1px/);
  assert.doesNotMatch(dashboard, /\.home-hub\{[^}]*background:var\(--home-control\)/);
  // Zemin düz olduğu için okunabilirlik gölgesi de yok.
  assert.match(dashboard, /--hub-text-shadow:none/);
  // Perde kaldırıldı: dolgunun üstüne ikinci katman binmiyor.
  assert.doesNotMatch(dashboard, /\.home-hub::before/);
  assert.doesNotMatch(dashboard, /--hub-scrim-/);
  assert.doesNotMatch(dashboard, /\.home-hub\{[^}]*color-mix\(/);
  // Alt satırlar karanlık temada ayrıca yükseltilir; ipucu metni sönük kalmaz.
  assert.match(dashboard, /--hub-muted:#cddcd4/);
  assert.match(dashboard, /body\[data-active-view="home"\] #home \.hub-hint\{opacity:1\}/);
});

test("hub özeti: yerel saat, iki şehir ve şu anki hava; tam tahminler pencerelerde kalır", async () => {
  const dashboard = await readDashboardBundle();

  // Saat bölgesi: büyük saat + saniye + tarih + yerel bölge satırı + iki şehirlik özet.
  assert.match(dashboard, /<span id="hubDate" class="hub-date"><\/span>\s*<span id="hubZoneName" class="hub-sub"><\/span>\s*<span id="hubCities" class="hub-cities"><\/span>\s*<span class="hub-alarm">/);
  // Hava bölgesi yalnız "şu an" + bugünün özeti; günlük satırlar hub'da yok.
  assert.doesNotMatch(dashboard, /hub-days|class="hub-day"/);
  assert.match(dashboard, /body\.innerHTML=`<span class="hub-now">[\s\S]*?<\/span><\/span>\$\{note\?`<span class="hub-note">/);
  // Alarm satırı duruyor.
  assert.match(dashboard, /<span class="hub-alarm"><span aria-hidden="true">⏰<\/span>/);
  // Tam listeler pencerelerde: dünya saatleri #clockDialog'da, saatlik+günlük #weatherDialog'da.
  assert.match(dashboard, /container\.innerHTML=worldClockZones\.length\?worldClockZones\.map\(city=>/);
  assert.match(dashboard, /const days=weatherDailyEntries\(4\)\.map\(entry=>/);
  assert.match(dashboard, /weatherHourlyEntries\(/);
});

test("hava konumu penceresinde tik yalnız seçili konumda çıkar ve pencere taşmaz", async () => {
  const dashboard = await readDashboardBundle();

  // Hata: eylem ikonu koşulsuz onay işaretiydi, her sonuç seçili görünüyordu.
  assert.match(dashboard, /const chosen=kind==="weather"\?weatherState\.location:kind==="home"\?state\.homeLocation:null/);
  assert.match(dashboard, /const chosenKey=chosen\?locationSelectionKey\(kind,chosen\):null/);
  assert.match(dashboard, /const selected=chosenKey!==null&&locationSelectionKey\(kind,location\)===chosenKey/);
  assert.match(dashboard, /const glyph=kind==="clock"\?'<path d="M12 5v14M5 12h14"\/>':selected\?'<path d="m5 12 4 4L19 6"\/>':'<path d="M12 21s6\.5-5\.4 6\.5-10\.5/);
  // Seçili öğe yalnız ikonla değil, metin ve renkle de belli olur.
  assert.match(dashboard, /<div class="location-result\$\{selected\?" is-selected":""\}"\$\{selected\?' aria-current="true"':""\}/);
  assert.match(dashboard, /\$\{selected\?`<em class="location-selected-tag">\$\{esc\(t\("locationSelected"\)\)\}<\/em>`:""\}/);
  assert.match(dashboard, /\.location-result\.is-selected\{border-color:var\(--forest\);background:var\(--forest-soft\)\}/);
  // Küçük tablette saat, hava ve konum pencereleri tam ekran: yalnız gövde kayar, alt eylemler kesilmez.
  assert.match(dashboard, /dialog#clockDialog,dialog#weatherDialog,dialog#weatherLocationDialog,dialog#homeLocationDialog\{height:100dvh;max-height:100dvh\}/);
  assert.match(
    dashboard,
    /dialog#clockDialog>\.modal,dialog#weatherDialog>\.modal,dialog#weatherLocationDialog>\.modal,dialog#homeLocationDialog>\.modal\{height:100dvh;max-height:100dvh;display:flex;flex-direction:column;overflow:hidden;padding-top:clamp\(14px,3vh,26px\);padding-bottom:calc\(20px \+ env\(safe-area-inset-bottom\)\)\}/
  );
  assert.match(
    dashboard,
    /dialog#clockDialog \.hub-columns,dialog#weatherDialog #weatherDialogBody,dialog#weatherLocationDialog #weatherSearchResults,dialog#homeLocationDialog #homeSearchResults\{flex:1 1 auto;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain\}/
  );
  assert.match(
    dashboard,
    /dialog#clockDialog \.modal-actions,dialog#weatherDialog \.modal-actions,dialog#weatherLocationDialog \.modal-actions,dialog#homeLocationDialog \.modal-actions\{flex:none;margin-top:14px\}/
  );
  // Konum listesi ve arama alanı pencerenin yarısı kadar; ölçü orantılı, sabit px değil.
  assert.match(
    dashboard,
    /dialog#weatherLocationDialog \.location-search-field,dialog#weatherLocationDialog \.location-search-status,dialog#weatherLocationDialog #weatherSearchResults,dialog#homeLocationDialog \.location-current,dialog#homeLocationDialog \.location-search-field,dialog#homeLocationDialog \.location-search-status,dialog#homeLocationDialog #homeSearchResults,dialog#homeLocationDialog \.location-manual\{width:min\(100%,max\(52vw,320px\)\);margin-left:auto;margin-right:auto\}/
  );
  // Ev konumu aynı pencereyi üçüncü bir "kind" ile kullanır; koordinat karşılaştırması kimliksizdir.
  assert.match(dashboard, /home:\{query:"",results:\[\],loading:false,error:null,requestId:0,timer:null\}/);
  assert.match(dashboard, /const locationSearchInputs=\{clock:"#clockCitySearch",weather:"#weatherLocationSearch",home:"#homeLocationSearch"\}/);
  assert.match(dashboard, /const locationSelectionKey=\(kind,location\)=>kind==="home"\?locationCoordKey\(location\):locationKey\(location\)/);
  assert.match(dashboard, /else if\(kind==="home"\)chooseHomeLocation\(location\)/);
  // Rozet satırın içinde kalır: ızgara satırı yalnız min-height kadar ölçülüp satırlar üst üste biniyordu.
  assert.match(dashboard, /\.location-results,\.selected-locations\{display:flex;flex-direction:column;gap:8px\}/);
  assert.match(dashboard, /\.location-result,\.selected-location\{flex:none;display:grid/);
  // Dokunma hedefleri kaba işaretçide 44 px'e çıkar.
  assert.match(dashboard, /@media\(pointer:coarse\)\{\.location-result,\.selected-location\{min-height:56px\}\.location-result button,\.selected-location button\{width:44px;height:44px\}\}/);
});

// §3 — ev konumu koordinat olarak sorulmuyor: kart yerin adını gösterir, seçim aynı arama penceresinde.
test("evin konumu ad olarak seçilir, koordinat yalnız elle giriş bölümünde kalır", async () => {
  const dashboard = await readDashboardBundle();
  const [english, turkish] = await Promise.all([
    readFile(englishLocaleUrl, "utf8").then((source) => JSON.parse(source).translations),
    readFile(turkishLocaleUrl, "utf8").then((source) => JSON.parse(source).translations)
  ]);

  // Ayarlardaki kart: yerin adı + güneş satırı + tek düğme. İki sayı kutusu karttan çıktı.
  const card = dashboard.slice(dashboard.indexOf('id="homeLocationForm"'), dashboard.indexOf('id="settingsForm"'));
  assert.match(card, /id="homeLocationName"/);
  assert.match(card, /id="homeLocationSun" class="location-sun"/);
  assert.match(card, /id="chooseHomeLocation" class="secondary" type="button" data-i18n="chooseHomeLocation"/);
  assert.doesNotMatch(card, /homeLatitude|homeLongitude|data-i18n="latitude"|data-i18n="longitude"/);
  assert.match(dashboard, /const label=String\(state\.homeLocation\.label\|\|""\)\.trim\(\)/);

  // Pencere üç katmanlı ve sıralı: hava durumu konumu → arama → kapalı `<details>` içinde koordinat.
  const dialog = dashboard.slice(dashboard.indexOf('<dialog id="homeLocationDialog">'));
  const modal = dialog.slice(0, dialog.indexOf("</dialog>"));
  const reuse = modal.indexOf('id="useWeatherLocationForHome"');
  const search = modal.indexOf('id="homeLocationSearch"');
  const manual = modal.indexOf('class="location-manual"');
  assert.ok(reuse >= 0 && reuse < search && search < manual);
  assert.match(modal, /<details class="location-manual"><summary data-i18n="enterCoordinates">/);
  assert.match(modal, /id="homeLocationManualForm" class="location-fields"/);
  assert.match(modal, /id="homeLatitude"[\s\S]*id="homeLongitude"[\s\S]*id="saveHomeLocation"/);
  assert.match(modal, /id="homeSearchStatus"[\s\S]*id="homeSearchResults"/);
  assert.doesNotMatch(modal, /open>/);

  // Hava durumu konumu tarayıcıda saklı: çevrimdışı kurulumda tek dokunuşla evin konumu olur.
  assert.match(dashboard, /function useWeatherLocationForHome\(\)\{\s*const weather=weatherState\.location/);
  assert.match(dashboard, /reuse\.textContent=weather\?t\("useWeatherLocationNamed",\{name:locationName\(weather\)\}\):t\("useWeatherLocation"\)/);
  assert.match(dashboard, /\$\("#useWeatherLocationForHome"\)\.onclick=useWeatherLocationForHome/);
  assert.match(dashboard, /\$\("#chooseHomeLocation"\)\.onclick=openHomeLocationManager/);
  assert.match(dashboard, /\$\("#homeLocationManualForm"\)\.onsubmit=saveHomeLocationForm/);
  assert.match(dashboard, /\$\("#homeLocationSearch"\)\.oninput=\(\)=>scheduleLocationSearch\("home"\)/);

  // Seçilen yerin adı sunucuya gider; ad yoksa alan hiç gönderilmez.
  assert.match(dashboard, /JSON\.stringify\(name\?\{latitude,longitude,label:name\}:\{latitude,longitude\}\)/);
  assert.match(dashboard, /const saved=await persistHomeLocation\(\{latitude:Number\(location\?\.latitude\),longitude:Number\(location\?\.longitude\),label:location\?\.name\}\)/);

  // Ev sakini oturumu: alanlar salt-okunur, yeni düğme de kapalı.
  assert.match(dashboard, /if\(choose\)\{choose\.disabled=readOnly;choose\.hidden=readOnly\}/);
  assert.match(dashboard, /function openHomeLocationManager\(\)\{\s*if\(isResidentSession\(\)\)return/);
  assert.match(dashboard, /if\(isResidentSession\(\)\)return false/);

  // Kullanıcı "enlem/boylam" sözcüğünü yalnız elle giriş bölümünde görür: kart metni artık koordinat demiyor.
  assert.doesNotMatch(turkish.homeLocationLead, /koordinat/i);
  assert.doesNotMatch(english.homeLocationLead, /coordinate/i);
  for (const catalog of [english, turkish]) {
    for (const key of ["chooseHomeLocation", "chooseHomeLocationTitle", "chooseHomeLocationLead", "useWeatherLocation", "useWeatherLocationNamed", "enterCoordinates", "homeLocationNotChosen"]) {
      assert.equal(typeof catalog[key], "string");
    }
  }
  assert.match(String(english.useWeatherLocationNamed), /\{name\}/);
  assert.match(String(turkish.useWeatherLocationNamed), /\{name\}/);
});

test("boş çalışma günlüğü kartın 'son çalışma' bilgisiyle çelişmez", async () => {
  const dashboard = await readDashboardBundle();

  // Cümle yalnız lastRunAt varken değişir; hiç çalışmamış kuralda eski boş durum cümlesi kalır.
  assert.match(dashboard, /t\(automation\.lastRunAt\?"automationRunsOlderThanLog":"automationRunsEmpty"\)/);
  assert.match(dashboard, /automationRunsOlderThanLog:"Bu kural bu sürümden önce çalışmış; günlük yeni tutulmaya başlandı\."/);
  assert.match(dashboard, /automationRunsOlderThanLog:"This rule ran before this version; the log has only just started\."/);
});

test("üst gezinme şeridi kalkar, yerine her ekranda duran tek menü düğmesi gelir", async () => {
  const dashboard = await readDashboardBundle();

  // Şerit tümüyle kalktı: ne kenar çubuğu, ne yatay kipteki 68 px'lik sabit bant.
  assert.doesNotMatch(dashboard, /<aside>/);
  assert.doesNotMatch(dashboard, /<\/aside>/);
  assert.doesNotMatch(dashboard, /class="nav-utility/);
  assert.doesNotMatch(dashboard, /landscapeLanguageCode/);

  // Menü düğmesi YALNIZ ana ekranda. Alt sayfalarda yerini aynı ölçüdeki "Genel görünüm"
  // düğmesi alır — o pencere açmadığı için `aria-haspopup`/`aria-expanded` taşımaz.
  const menuButton =
    /<button class="app-menu-button" type="button" data-app-menu aria-haspopup="dialog" aria-expanded="false" aria-controls="appMenuDialog" data-i18n-aria="openMenu" aria-label="Open menu">/g;
  assert.equal(dashboard.match(menuButton)?.length, 1);
  const backButton =
    /<button class="app-menu-button" type="button" data-view-link="home" data-i18n-aria="backToOverview" aria-label="Back to overview">/g;
  assert.equal(dashboard.match(backButton)?.length, 4);
  const viewHead = (view: string): string => {
    const section = dashboard.slice(dashboard.indexOf(`<section id="${view}" class="view`));
    return section.slice(0, section.indexOf("</header>"));
  };
  assert.ok(viewHead("home").includes("data-app-menu"), "ana ekran başlığında menü düğmesi yok");
  // Sekme/odak sırası görsel sırayı izler: menü · bilgi · eylemler.
  const homeHead = viewHead("home");
  assert.ok(
    homeHead.indexOf("data-app-menu") < homeHead.indexOf('class="home-heading"'),
    "menü düğmesi başlığın ilk hücresinde değil",
  );
  assert.ok(
    homeHead.indexOf('class="home-heading"') < homeHead.indexOf('class="home-actions"'),
    "bilgi hücresi eylem grubundan sonra geliyor",
  );
  assert.match(dashboard, /<header class="page-head"><button class="app-menu-button" type="button" data-app-menu/);
  for (const view of ["devices", "automations", "connections", "settings"]) {
    const head = viewHead(view);
    assert.ok(head.includes('data-view-link="home"'), `${view} başlığında genel görünüm düğmesi yok`);
    assert.ok(!head.includes("data-app-menu"), `${view} başlığında menü düğmesi kalmış`);
    assert.ok(!head.includes("aria-haspopup"), `${view} başlığında ölü aria-haspopup kalmış`);
    assert.ok(!head.includes("aria-expanded"), `${view} başlığında ölü aria-expanded kalmış`);
  }
  // Simge alt şeritteki "Genel görünüm" sekmesinin ta kendisi: iki farklı "eve dön" görseli olmasın.
  assert.match(dashboard, /overview:'<path d="M4 11 12 4l8 7"\/><path d="M6 10v9h12v-9"\/><path d="M10 19v-5h4v5"\/>'/);
  assert.match(dashboard, /data-i18n-aria="backToOverview" aria-label="Back to overview"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7"\/><path d="M6 10v9h12v-9"\/><path d="M10 19v-5h4v5"\/><\/svg>/);
  assert.match(dashboard, /backToOverview:"Back to overview"/);
  assert.match(dashboard, /backToOverview:"Genel görünüme dön"/);
  // Görünüm değiştiren düğmeler `.nav-button` DEĞİL: o sınıf menü ızgarasının biçimini taşıyor.
  assert.match(dashboard, /\$\$\("\[data-view-link\]"\)\.forEach\(button=>button\.onclick=\(\)=>activateView\(button\.dataset\.viewLink\)\);/);

  // Hamburger seçildi: dişli bu panelde zaten "Ayarlar" görünümünü anlatıyor.
  assert.match(dashboard, /class="app-menu-button"[^>]*>\s*<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"\/>/);

  // Panelin mevcut diyalog dili: <dialog> + .modal.
  assert.match(dashboard, /<dialog id="appMenuDialog" class="app-menu-dialog" aria-labelledby="appMenuTitle">/);
  assert.match(dashboard, /<div class="modal app-menu-modal">/);
  assert.match(dashboard, /menu:"Menu"/);
  assert.match(dashboard, /menu:"Menü"/);
  assert.match(dashboard, /openMenu:"Open menu"/);
  assert.match(dashboard, /openMenu:"Menüyü aç"/);

  // Şeritteki her şey menüye taşındı; Otomasyon ana ekrana çıktığı için menüde dört görünüm kalır.
  for (const view of ["home", "devices", "connections", "settings"]) {
    assert.match(dashboard, new RegExp(`class="nav-button[^"]*" type="button" data-view="${view}"`));
  }
  const menuDialog = dashboard.slice(
    dashboard.indexOf('<dialog id="appMenuDialog"'),
    dashboard.indexOf('<dialog id="nameDialog"'),
  );
  assert.match(menuDialog, /data-theme-mode="light"[\s\S]*data-theme-mode="dark"[\s\S]*data-theme-mode="system"/);
  assert.match(menuDialog, /class="language-switch" role="group" data-i18n-aria="language"/);
  assert.match(menuDialog, /data-auth-logout/);
  assert.match(menuDialog, /id="sideDot"[\s\S]*id="sideStatus"/);
  // Aktif görünüm menüde belli olsun.
  assert.match(dashboard, /\.app-menu-nav \.nav-button\.active\{border-color:var\(--forest\);color:var\(--on-forest\);background:var\(--forest\)\}/);
  assert.match(dashboard, /\$\$\("\.nav-button"\)\.forEach\(item=>item\.classList\.toggle\("active",item\.dataset\.view===viewName\)\)/);

  // Erişilebilirlik: aria-expanded eşitlenir, Escape'i <dialog> kapatır, odak düğmeye döner.
  assert.match(dashboard, /\$\$\("\[data-app-menu\]"\)\.forEach\(item=>item\.setAttribute\("aria-expanded","true"\)\);/);
  assert.match(dashboard, /\$\$\("\[data-app-menu\]"\)\.forEach\(item=>item\.setAttribute\("aria-expanded","false"\)\);/);
  assert.match(dashboard, /if\(opener&&opener\.isConnected&&opener\.offsetParent!==null\)opener\.focus\(\)/);
  assert.match(dashboard, /\.app-menu-nav \.nav-button\{aspect-ratio:1\/1;min-height:clamp\(84px,15vh,132px\)/);
  // Menü düğmesi her ekranda aynı ölçüde: hap biçimli, en az 60px yüksek dokunma hedefi.
  assert.match(dashboard, /\.app-menu-button\{width:var\(--head-action-w\);height:var\(--head-action-h\);min-width:var\(--head-action-w\);[^}]*border-radius:999px/);
  assert.match(dashboard, /\.app-menu-button:focus-visible\{outline:3px solid var\(--forest\);outline-offset:2px\}/);

  // Dil paketleri artık tek değil, her `.language-switch` kutusuna yazılır.
  assert.match(dashboard, /\$\$\("\.language-switch"\)\.forEach\(group=>\{group\.innerHTML=languageButtons\}\)/);
  assert.match(dashboard, /\$\$\("\.theme-switch"\)\.forEach\(group=>group\.setAttribute\("aria-label",t\("appearance"\)\)\)/);

  assert.doesNotMatch(dashboard, /color-mix\(/);
});

test("alt sayfalar ortak başlık omurgasını paylaşır: ana sayfa · ortada başlık · sayfa eylemi", async () => {
  const dashboard = await readDashboardBundle();

  // Simetrik üç sütun: yan sütunlar aynı belirteçten geldiği için sağ hücre boşken bile
  // başlık gerçekten ortada durur. Esnek `justify-content` düğme genişliğiyle kayardı.
  assert.match(
    dashboard,
    /\.page-head\{display:grid;grid-template-columns:var\(--head-action-w\) minmax\(0,1fr\) var\(--head-action-w\);align-items:center;gap:var\(--head-action-gap\);margin-bottom:30px\}/,
  );
  assert.doesNotMatch(dashboard, /\n\s*\.page-head\{display:flex/);
  // Ana ekran da aynı ızgarayı kullanır: sol hücre menü (aynı belirteç), orta hücre bilgi satırı,
  // sağ hücre üç eylem olduğu için `auto`. Bilgi satırı esnek boşlukla değil ızgarayla ortalanır,
  // böylece sağdaki düğmelerin genişliği değişince metin kaymaz.
  assert.match(dashboard, /#home \.page-head\{grid-template-columns:var\(--head-action-w\) minmax\(0,1fr\) auto\}/);
  assert.match(dashboard, /#home \.home-heading\{text-align:center\}#home \.home-title-line\{justify-content:center\}#home \.home-metrics\{justify-content:center\}/);
  assert.doesNotMatch(dashboard, /#home \.page-head\{display:flex/);
  // Sol hücre alt sayfalarla birebir aynı: `.page-head>.app-menu-button` dikeyde ortalanır.
  assert.match(dashboard, /\.page-head>\.app-menu-button\{align-self:center\}/);
  // Başlık taşarsa üç nokta; sabit px yok, yükseklik viewport'tan türer.
  assert.match(dashboard, /\.page-head-title\{min-width:0;text-align:center\}/);
  assert.match(
    dashboard,
    /\.page-head-title h1\{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp\(26px,4\.6vh,40px\);line-height:1\.12\}/,
  );

  // Dört alt sayfanın orta hücresi tek başlıktır: `.eyebrow` ve `.lead` kalktı.
  for (const [view, key] of [
    ["devices", "navDevices"],
    ["automations", "navAutomations"],
    ["connections", "navConnections"],
    ["settings", "navSettings"],
  ]) {
    const section = dashboard.slice(dashboard.indexOf(`<section id="${view}" class="view`));
    const head = section.slice(0, section.indexOf("</header>"));
    assert.ok(head.includes(`<div class="page-head-title"><h1 data-i18n="${key}">`), `${view} başlığı orta hücrede değil`);
    assert.ok(!head.includes('class="eyebrow"'), `${view} başlığında eyebrow kalmış`);
    assert.ok(!head.includes('class="lead"'), `${view} başlığında lead kalmış`);
  }
  for (const key of [
    "allEquipment",
    "automationEyebrow",
    "phonesAssistants",
    "systemConnections",
    "devicesLead",
    "automationsLead",
    "connectionsLead",
    "settingsLead",
  ]) {
    assert.doesNotMatch(dashboard, new RegExp(`${key}[:"]`), `${key} artık kullanılmıyor, sözlükten de düşmeli`);
  }

  // Sağ hücre yalnız Cihazlar ve Otomasyonlar'da dolu; ikisi de aynı sunumsal döşemeyi giyer.
  const tiles = dashboard.match(/class="[^"]*page-action-tile[^"]*"/g) ?? [];
  assert.equal(tiles.length, 2);
  for (const view of ["connections", "settings"]) {
    const section = dashboard.slice(dashboard.indexOf(`<section id="${view}" class="view`));
    const head = section.slice(0, section.indexOf("</header>"));
    assert.ok(!head.includes("page-action-tile"), `${view} başlığında olmayan bir sayfa eylemi var`);
  }

  assert.doesNotMatch(dashboard, /color-mix\(/);
});

test("villa menüsü tam ekran açılır ve kalan görünümler kare ızgara olur", async () => {
  const dashboard = await readDashboardBundle();

  // Sütun sayısı ekrandan türer: `auto-fit` + `minmax`, hiçbir yerde sabit sütun sayısı yok.
  assert.match(
    dashboard,
    /\.app-menu-nav\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,clamp\(104px,14vw,150px\)\),1fr\)\);gap:clamp\(8px,1\.4vw,14px\)\}/,
  );
  assert.doesNotMatch(dashboard, /\.app-menu-nav\{[^}]*repeat\(5,/);
  assert.doesNotMatch(dashboard, /\.app-menu-nav\{display:grid;gap:6px\}/);

  // Döşeme kare: en-boy oranı 1/1, alt/üst sınırlar oransal (vh) — sabit piksel değil.
  assert.match(
    dashboard,
    /\.app-menu-nav \.nav-button\{aspect-ratio:1\/1;min-height:clamp\(84px,15vh,132px\);max-height:clamp\(96px,26vh,180px\);max-width:clamp\(96px,26vh,180px\);justify-self:center;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center/,
  );
  // İkon üstte, etiket altta, ortalanmış.
  assert.match(dashboard, /\.app-menu-nav \.nav-button\{[^}]*text-align:center\}/);
  assert.match(
    dashboard,
    /\.app-menu-nav \.nav-button \.icon,\.app-menu-nav \.nav-button \.nav-gear\{width:clamp\(24px,3\.6vh,34px\);height:clamp\(24px,3\.6vh,34px\)\}/,
  );
  // Dokunma hedefi: en dar döşeme bile 44 px'in çok üstünde (min 84 px).
  assert.match(dashboard, /min-height:clamp\(84px,15vh,132px\)/);

  // Tema ve dil satır olarak kaldı, ızgaraya girmedi.
  assert.match(dashboard, /\.app-menu-utilities\{display:grid;gap:10px/);
  assert.match(dashboard, /\.app-menu-utility\{display:flex;align-items:center;justify-content:space-between/);
  const menuDialog = dashboard.slice(
    dashboard.indexOf('<dialog id="appMenuDialog"'),
    dashboard.indexOf('<dialog id="nameDialog"'),
  );
  assert.match(menuDialog, /<div class="app-menu-utility"><span class="app-menu-utility-label" data-i18n="appearance">/);
  assert.match(menuDialog, /<div class="app-menu-utility"><span class="app-menu-utility-label" data-i18n="language">/);
  assert.match(menuDialog, /id="sideDot"[\s\S]*id="sideStatus"/);
  assert.match(menuDialog, /data-auth-logout/);
  assert.match(menuDialog, /<button id="closeAppMenu" class="quiet" type="button" data-i18n="close">/);

  // Tam ekran: saat/hava pencerelerindeki düzenin aynısı — dış kutu taşmaz, yalnız ızgara kayar,
  // "Kapat" ilk açılışta bile görünür kalır.
  assert.match(dashboard, /dialog#appMenuDialog\{height:100dvh;max-height:100dvh\}/);
  assert.match(
    dashboard,
    /dialog#appMenuDialog>\.modal\{height:100dvh;max-height:100dvh;display:flex;flex-direction:column;overflow:hidden;padding-top:clamp\(14px,3vh,26px\);padding-bottom:calc\(20px \+ env\(safe-area-inset-bottom\)\)\}/,
  );
  assert.match(dashboard, /dialog#appMenuDialog>\.modal>\*\{flex:none;width:min\(100%,920px\)\}/);
  assert.match(
    dashboard,
    /dialog#appMenuDialog \.app-menu-nav\{flex:1 1 auto;align-content:safe center;min-height:0;overflow-y:auto;overscroll-behavior:contain\}/,
  );
  assert.match(dashboard, /dialog#appMenuDialog \.modal-actions\{flex:none;margin-top:14px\}/);
  // Kural tam ekran diyalog bloğunun içinde: masaüstünde menü hâlâ ortada duran bir pencere.
  const fullScreenBlock = dashboard.indexOf("@media(pointer:coarse) and (max-width:1400px){");
  assert.ok(fullScreenBlock > 0);
  assert.ok(dashboard.indexOf("dialog#appMenuDialog{height:100dvh") > fullScreenBlock);
  // Masaüstünde beş döşeme tek sıraya sığsın diye pencere genişledi.
  assert.match(dashboard, /\.app-menu-dialog\{width:min\(92vw,880px\)\}/);

  assert.doesNotMatch(dashboard, /color-mix\(/);
});

test("rail kaydırılınca hub sönerek gizlenir ve tıklanamaz olur", async () => {
  const dashboard = await readDashboardBundle();

  // Eşik toleranslı: birkaç piksellik kayma hub'ı kapatmaz.
  assert.match(dashboard, /const hidden=Boolean\(landscape&&rail&&rail\.scrollLeft>24\)/);
  assert.match(dashboard, /function updateHubVisibility\(landscape,rail\)\{/);
  assert.match(dashboard, /hub\.classList\.toggle\("hub-hidden",hidden\)/);
  // Görünmezken tıklanamaz ve odak alamaz; ekran okuyucudan da gizlenir.
  assert.match(dashboard, /hub\.toggleAttribute\("inert",hidden\)/);
  assert.match(dashboard, /if\(hidden\)hub\.setAttribute\("aria-hidden","true"\);\s*else hub\.removeAttribute\("aria-hidden"\)/);
  assert.match(dashboard, /#home \.home-hub\.hub-hidden\{opacity:0;pointer-events:none\}/);
  // Kısa bir sönme; hareket kısıtlıyken geçiş yok.
  assert.match(dashboard, /#home \.home-hub\{[^}]*transition:opacity \.18s ease\}/);
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(max-height:900px\) and \(prefers-reduced-motion:reduce\),\(orientation:landscape\) and \(min-width:1000px\) and \(prefers-reduced-motion:reduce\)\{#home \.home-hub\{transition:none\}\}/,
  );
  // Yalnız yatay kip: dikey/masaüstü düzeninde hub bugünkü gibi kalır.
  assert.match(dashboard, /const landscape=window\.matchMedia\("\(orientation: landscape\) and \(max-height: 900px\)"\)\.matches/);
  assert.match(dashboard, /updateHubVisibility\(landscape,rail\);/);
  // Rail kaydıkça ve ekran ölçüsü değiştikçe yeniden değerlendirilir.
  assert.match(dashboard, /\$\("#widgetRail"\)\.addEventListener\("scroll",\(\)=>requestAnimationFrame\(updateWidgetScrollHint\),\{passive:true\}\)/);
  assert.match(dashboard, /window\.addEventListener\("resize",\(\)=>\{if\(state\.coach\)positionCoach\(\);updateWidgetScrollHint\(\)\}\)/);
});

test("kartlar alttaki hızlı erişim şeridine kadar uzar", async () => {
  const dashboard = await readDashboardBundle();

  // Yükseklik artık sabit bir viewport formülü değil: `#home` sütun akışında pano kalanı alır.
  assert.doesNotMatch(dashboard, /height:clamp\(150px,calc\(100vh - 340px\),560px\)/);
  assert.match(
    dashboard,
    /#home\.active\{min-height:0;display:flex;flex-direction:column;height:calc\(100dvh - var\(--home-top\) - 106px - env\(safe-area-inset-bottom\)\)\}/,
  );
  // Başlık ile kart panosu arası nefes payı oransal (vh) ve tek değişkende; panonun boyu sütun
  // akışında bu paydan kendiliğinden düşer, alt şeride ayrılan 106px'lik pay bozulmaz.
  assert.match(dashboard, /#home\{--hub-column:340px;--rail-column:calc\(\(100vw - 410px\)\/3\);--strip-inset:20px;--home-top:14px;--home-head-gap:clamp\(12px,2\.8vh,26px\)\}/);
  assert.match(dashboard, /#home \.page-head\{margin-bottom:var\(--home-head-gap\)\}/);
  assert.match(dashboard, /#home \.widget-board\{flex:1 1 auto;min-height:150px;max-height:660px;display:grid;/);
  assert.match(dashboard, /grid-template-rows:minmax\(0,1fr\);gap:10px\}/);
  assert.match(dashboard, /#home \.widget-rail\{[^}]*height:100%;display:grid/);
  assert.match(dashboard, /#home \.home-hub\{[^}]*max-height:100%/);
  // Şerit payı ve alt güvenli alan korunur; üst dolgu değişince boy kendiliğinden düzelir.
  assert.match(dashboard, /body\[data-active-view="home"\] main\{padding-bottom:calc\(106px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(dashboard, /body\.has-system-alert #home\{--home-top:70px\}/);
  assert.match(
    dashboard,
    /@media\(orientation:landscape\) and \(max-height:900px\) and \(max-width:900px\)\{#home\{--home-top:24px\}\}/,
  );
  // Kart içerikleri üstten akar, boy uzayınca ortada garip boşluk kalmaz.
  assert.match(dashboard, /#home \.widget-rail \.widget-card\{grid-row:1;grid-column:span 1;min-height:0;height:100%;overflow:hidden/);
});

test("koşul adımı 'şu kadar süredir böyleyse' ölçütünü ayrı bir dille sorar", async () => {
  const dashboard = await readDashboardBundle();

  // §9.2 — satır varsayılan kapalı: tek bir sessiz düğme, sunucudaki tavanla aynı sınır.
  assert.match(dashboard, /const maxAutomationCondForSeconds=86400;/);
  assert.match(
    dashboard,
    /<button class="automation-cond-for-open" type="button" data-automation-cond-for="1" aria-expanded="false">/
  );
  // Hazır süre çipleri kalktı: yerine "−  s:dd  +" sayacı geldi.
  assert.doesNotMatch(dashboard, /data-automation-cond-for-seconds=/);
  assert.doesNotMatch(dashboard, /data-automation-cond-for-custom=/);
  assert.match(
    dashboard,
    /const counter=automationCounterHtml\("data-automation-cond-for-step",automationForMinutes\(draft\.forSeconds\),false,"automationCondForTimeLabel","automationCondForDown","automationCondForUp"\);/
  );
  // Sayaç dakika gösterir; 0:01 altına inmez, 24:00 üstüne çıkmaz.
  assert.match(dashboard, /const maxAutomationCondForMinutes=Math\.floor\(maxAutomationCondForSeconds\/60\);/);
  assert.match(dashboard, /draft\.forSeconds=Math\.max\(60,Math\.min\(maxAutomationCondForSeconds,Math\.round\(seconds\)\)\);/);

  // Süre ölçütü hem boolean hem sayısal eşik ekranının altına biner.
  assert.match(dashboard, /if\(draft\.numeric\)return`\$\{automationCondThresholdHtml\(draft,device\)\}\$\{automationCondForHtml\(draft\)\}`;/);
  assert.match(dashboard, /\$\{list\}\$\{automationCondForHtml\(draft\)\}`;/);

  // Açılış değeri bir dakika: en sık kurulan "1 dakikadır hareket var".
  assert.match(dashboard, /draft\.forSeconds=value==="1"\?60:null;/);

  // §9.2 — görsel dil "sonra kapat"tan ayrışsın diye kesikli çerçeveli kendi bloğu var.
  assert.match(dashboard, /\.automation-cond-for\.is-on\{padding:14px 15px 15px;border:1px dashed var\(--line\)/);
  assert.match(dashboard, /\.automation-cond-for-open\{width:100%;min-height:44px;[^}]*border:1px dashed var\(--line\)/);

  // Etiketler zaman yönünü taşır ve iki kavramın farkı ipucunda açıkça yazar.
  assert.match(dashboard, /automationCondForOpen:"… ve şu kadar süredir böyleyse"/);
  assert.match(dashboard, /automationCondForOpen:"… and it has been this way for a while"/);
  assert.match(dashboard, /automationCondForLabel:"Ne kadar süredir böyle olsun\?"/);
  assert.match(dashboard, /automationCondForHint:"[^"]*sonra kapansın[^"]*"/);
  assert.match(dashboard, /automationCondForHint:"[^"]*turn off afterwards[^"]*"/);
  // §2.5 — yeniden başlatma penceresi ipucunda söylenir; kullanıcı sessiz bir gecikme görmesin.
  assert.match(dashboard, /automationCondForHint:"[^"]*yeniden başlarsa süre sıfırdan sayılır\./);

  // Kart özeti süreyi tam şablon anahtarıyla söyler — parça birleştirme yok.
  assert.match(dashboard, /const key=base=>held\?`\$\{base\}ForLine`:`\$\{base\}Line`;/);
  assert.match(dashboard, /automationCondStateForLine:"Yalnız \{device\} \{duration\} boyunca \{event\} ise"/);
  assert.match(dashboard, /automationCondStateForLine:"Only if \{device\} has been \{event\} for \{duration\}"/);
  assert.match(dashboard, /automationCondStateNotForLine:"Yalnız \{device\} \{duration\} boyunca \{event\} değilse"/);
  assert.match(dashboard, /automationCondAboveForLine:"Yalnız \{device\} \{reading\} \{duration\} boyunca \{value\} üstündeyse"/);
  assert.match(dashboard, /automationCondBelowForLine:"Only if \{device\} \{reading\} has been below \{value\} for \{duration\}"/);
  assert.match(dashboard, /automationCondBetweenForLine:"Yalnız \{device\} \{reading\} \{duration\} boyunca \{from\} ile \{to\} arasındaysa"/);
  assert.match(dashboard, /automationDurationSeconds:"\{count\} saniye"/);
  assert.match(dashboard, /automationDurationSeconds:"\{count\} seconds"/);
});

test("tetikleyici adımı süreyi koşuldakiyle aynı yerde ve aynı görünümde sorar", async () => {
  const dashboard = await readDashboardBundle();

  // §2.1 — koşulun görsel dili bilerek paylaşılır: aynı kesikli sessiz blok, yeni stil yok.
  assert.match(
    dashboard,
    /<button class="automation-cond-for-open" type="button" data-automation-trig-for="1" aria-expanded="false">/
  );
  // Hazır süre çipleri burada da kalktı; sayaç koşuldakiyle aynı bileşenden gelir.
  assert.doesNotMatch(dashboard, /data-automation-trig-for-seconds=/);
  assert.doesNotMatch(dashboard, /data-automation-trig-for-custom=/);
  assert.match(
    dashboard,
    /const counter=automationCounterHtml\("data-automation-trig-for-step",automationForMinutes\(wizard\.triggerForSeconds\),false,"automationTrigForTimeLabel","automationTrigForDown","automationTrigForUp"\);/
  );
  assert.match(dashboard, /wizard\.triggerForSeconds=value==="1"\?60:null;/);
  assert.match(dashboard, /wizard\.triggerForSeconds=Math\.max\(60,Math\.min\(maxAutomationCondForSeconds,Math\.round\(seconds\)\)\);/);

  // Satır hem olay listesinin hem sayısal eşik ekranının altına biner.
  assert.match(dashboard, /\$\{warning\}\$\{alternative\}\$\{body\}\$\{hint\}\$\{automationTrigForHtml\(wizard\)\}`;/);
  assert.match(dashboard, /esc\(t\("automationThresholdHint"\)\)\}<\/p>\$\{automationTrigForHtml\(wizard\)\}`;/);

  // Süre yalnız hedefi olan tetikleyicide sorulur: anahtar eşleme yolunda hiç görünmez.
  // Düğme yolunda da görünmez: orada tetikleyici `deviceAction` yazar, sunucu süreyi okumaz.
  assert.match(
    dashboard,
    /const automationTrigForEligible=wizard=>Boolean\(wizard\)\s*&&!automationMappingMode\(wizard\)\s*&&wizard\.triggerKind!=="button"[\s\S]*?&&!automationFollowSource\(wizard\)\s*&&automationDeviceKinds\.includes\(wizard\.triggerKind\);/
  );

  // Etiketler zaman yönünü taşır ve "sonra kapansın" ile farkı ipucunda yazar.
  assert.match(dashboard, /automationTrigForOpen:"… ve şu kadar süredir böyleyse"/);
  assert.match(dashboard, /automationTrigForOpen:"… and it has been this way for a while"/);
  assert.match(dashboard, /automationTrigForHint:"[^"]*sonra kapansın[^"]*"/);
  assert.match(dashboard, /automationTrigForHint:"[^"]*turn off afterwards[^"]*"/);
  // §2.5 — yeniden başlatma penceresi ipucunda söylenir.
  assert.match(dashboard, /automationTrigForHint:"[^"]*yeniden başlarsa süre sıfırdan sayılır\./);

  // Özet cümlesi tam şablon anahtarıyla kurulur — parça birleştirme yok.
  assert.match(dashboard, /const key=base=>held\?`\$\{base\}For`:base;/);
  assert.match(dashboard, /automationLineEventFor:"\{device\} \{duration\} boyunca \{event\} sürerse"/);
  assert.match(dashboard, /automationLineEventFor:"When \{device\} \{event\} for \{duration\}"/);
  assert.match(dashboard, /automationLineAboveFor:"\{device\} \{reading\} \{duration\} boyunca \{value\} üstünde kalırsa"/);
  assert.match(dashboard, /automationLineBelowFor:"When \{device\} \{reading\} stays below \{value\} for \{duration\}"/);
  assert.match(dashboard, /automationSummaryStateFor:"\{device\} \{duration\} boyunca \{event\} sürerse \{target\} \{action\}\."/);
  assert.match(dashboard, /automationCardSummaryStateFor:"\{device\} \{event\} for \{duration\} → \{target\} \{action\}"/);
  // Süreli eşikte fiil değişir: "üstüne çıkınca" değil, "üstünde kalınca".
  assert.match(dashboard, /automationThresholdAboveHeldShort:"\{reading\} \{value\} üstünde kalınca"/);
  assert.match(dashboard, /automationThresholdBelowHeldShort:"\{reading\} stays below \{value\}"/);
});

// Üç süre/kaydırma seçicisi de tek dile indi: "−  s:dd  +". Hazır çip satırı hiçbirinde kalmadı.
test("süre ve kaydırma seçicileri tek bir sayaç bileşeninden gelir", async () => {
  const dashboard = await readDashboardBundle();

  // Tek bileşen, dört çağrı: güneş kaydırması, koşul süresi, tetikleyici süresi, tetikleyici sonrası bekleme.
  assert.match(dashboard, /const automationCounterHtml=\(hook,minutes,signed,labelKey,downKey,upKey\)=>\{/);
  assert.equal(dashboard.match(/automationCounterHtml\("data-automation-/g)?.length, 4);
  assert.match(dashboard, /automationCounterHtml\("data-automation-sun-step",part\.offset,true,/);
  // Bekleme adımı da aynı bileşeni kullanır: yeni bir sayaç türetilmedi.
  assert.match(dashboard, /automationCounterHtml\("data-automation-wait-step",automationWaitSeconds\(wizard\),false,"automationWaitLabel","automationWaitDown","automationWaitUp"\)/);
  // Değer hep dakikadır ve "s:dd" olarak yazılır; işaret yalnız güneş kaydırmasında görünür.
  assert.match(dashboard, /const clock=`\$\{Math\.floor\(total\/60\)\}:\$\{String\(total%60\)\.padStart\(2,"0"\)\}`;/);
  assert.match(dashboard, /return!signed\|\|value===0\?clock:`\$\{value<0\?"−":"\+"\}\$\{clock\}`;/);
  // Adım şeması: sıfırın çevresinde bir dakika, uzaklaştıkça kabalaşır.
  assert.match(dashboard, /const automationCounterStep=magnitude=>magnitude<5\?1:magnitude<60\?5:magnitude<240\?15:30;/);
  // Basılı tutunca hızlanır; tutuş boyunca ekran çizilmez, yoksa basılan düğme silinirdi.
  assert.match(dashboard, /function automationBindCounter\(button,run,read\)\{/);
  assert.match(dashboard, /timer=setTimeout\(tick,Math\.max\(70,300-ticks\*20\)\);/);
  assert.match(dashboard, /button\.onpointerdown=\(\)=>\{if\(!timer\)timer=setTimeout\(tick,420\)\};/);
  assert.match(dashboard, /if\(automationHoldQuiet\)return;/);

  // Dokunma hedefi mevcut kadran dilinden gelir; ölçüler ekrana göre esner, sabit px yok.
  assert.match(dashboard, /\.automation-counter\{display:flex;align-items:center;justify-content:center;gap:clamp\(12px,2\.4vw,24px\)/);
  assert.match(dashboard, /\.automation-counter \.automation-time-step\{width:clamp\(64px,9vw,88px\);min-height:clamp\(46px,7\.2vh,60px\)/);
  assert.match(dashboard, /\.automation-counter-value\{min-width:clamp\(104px,15vw,150px\);font:800 clamp\(30px,4\.4vw,42px\)/);
  assert.doesNotMatch(dashboard, /color-mix\(/);
});

// Sayaç sınırları: süre 0:01 altına inmez, 24:00 üstüne çıkmaz. Satır kapatılınca alan yazılmaz.
test("süre sayacı bir dakika ile yirmi dört saat arasında kalır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");

  // Tetikleyicideki süre: kapalıyken sessiz düğme, açılınca sayaç bir dakikada başlar.
  assert.match(harness.body(), /data-automation-trig-for="1"/);
  api.toggleAutomationTrigFor("1");
  assert.equal(harness.wizard().triggerForSeconds, 60);
  assert.match(harness.body(), /<span class="automation-counter-value">0:01<\/span>/);
  assert.match(harness.body(), /data-automation-trig-for-step="-1"/);
  // Bir dakikanın altına inmez.
  api.setAutomationTrigForSeconds(Number(api.automationCounterNext(1, -1)) * 60);
  assert.equal(harness.wizard().triggerForSeconds, 60);
  // Yukarı doğru adım ladderı: 1 → 2 dakika.
  api.setAutomationTrigForSeconds(Number(api.automationCounterNext(1, 1)) * 60);
  assert.equal(harness.wizard().triggerForSeconds, 120);
  assert.match(harness.body(), /<span class="automation-counter-value">0:02<\/span>/);
  // Tavan 24:00; üstüne çıkılmaz.
  api.setAutomationTrigForSeconds(999999);
  assert.equal(harness.wizard().triggerForSeconds, 86400);
  assert.match(harness.body(), /<span class="automation-counter-value">24:00<\/span>/);
  api.setAutomationTrigForSeconds(Number(api.automationCounterNext(1440, 1)) * 60);
  assert.equal(harness.wizard().triggerForSeconds, 86400);
  // Satır kapatılınca alan hiç yazılmaz: tetikleyici eski hâline döner.
  api.toggleAutomationTrigFor("0");
  assert.equal(harness.wizard().triggerForSeconds, null);

  // Koşuldaki süre aynı sayacı ve aynı sınırları taşır.
  api.chooseAutomationEvent("occupancy=true");
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("deviceState");
  api.chooseAutomationCondDevice("0x0011");
  assert.match(harness.body(), /data-automation-cond-for="1"/);
  api.toggleAutomationCondFor("1");
  assert.match(harness.body(), /<span class="automation-counter-value">0:01<\/span>/);
  assert.doesNotMatch(harness.body(), /data-automation-cond-for-seconds=/);
  api.setAutomationCondForSeconds(Number(api.automationCounterNext(1, -1)) * 60);
  assert.equal((harness.wizard().draftCondition as Record<string, unknown>).forSeconds, 60);
  api.setAutomationCondForSeconds(Number(api.automationCounterNext(60, 1)) * 60);
  assert.equal((harness.wizard().draftCondition as Record<string, unknown>).forSeconds, 4500);
  assert.match(harness.body(), /<span class="automation-counter-value">1:15<\/span>/);
});

// §2.1 — süre satırı olay listesinin altındadır. Seçim adımı kapatsaydı satır hiç görülemezdi:
// açmak için ekranda kalmak, kalmak için açmış olmak gerekirdi. Ulaşılamaz olan bu döngü kırıldı.
test("olay seçimi tetikleyici adımını kapatmaz, süre satırı erişilebilir kalır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");

  // Seçim yapılmadan alttaki birincil düğme pasiftir ve sebebini yazar.
  assert.equal(api.automationStageAdvanceable(harness.wizard()), false);
  assert.equal(api.automationBlockedReason(harness.wizard()), "automationNeedEvent");

  // Süre kapalıyken bile adım seçimle kapanmaz.
  assert.equal(harness.wizard().triggerForSeconds, null);
  api.chooseAutomationEvent("occupancy=true");
  assert.equal(harness.wizard().stage, "trigEvent");
  // Adım açık kalır ama liste seçilen tek satıra daralır (bkz. daralma testi).
  assert.match(harness.body(), /data-automation-reopen="1"/);
  // Süre satırı hâlâ ekranda ve birincil düğme artık etkin.
  assert.match(harness.body(), /data-automation-trig-for="1"/);
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);
  assert.equal(api.automationBlockedReason(harness.wizard()), "");

  // Süre buradan açılıp ayarlanabiliyor; ekran yine kapanmıyor.
  api.toggleAutomationTrigFor("1");
  api.setAutomationTrigForSeconds(120);
  assert.equal(harness.wizard().stage, "trigEvent");
  assert.match(harness.body(), /<span class="automation-counter-value">0:02<\/span>/);

  // Geçiş kullanıcının elinde: birincil düğme adımı ilerletir, süre tetikleyiciye yazılır.
  await api.nextAutomationStep();
  assert.equal(harness.wizard().stage, "wait");
  const [trigger] = api.automationWizardTriggers(harness.wizard()) as Record<string, unknown>[];
  assert.deepEqual(trigger, {
    type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true, forSeconds: 120
  });
});

// Sayısal eşik yolu bugünkü gibi eşik ekranına geçer: süre satırı zaten orada da var.
test("sayısal olay seçimi eşik adımına geçmeyi sürdürür", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0044");
  api.chooseAutomationEvent("num:temperature");
  assert.equal(harness.wizard().stage, "trigThreshold");
  assert.match(harness.body(), /data-automation-trig-for="1"/);
});

// Süre satırının hiç çizilmediği yollarda kendiliğinden ilerleme aynen kalır: fazladan dokunuş yok.
test("süre satırı olmayan yolda olay seçimi adımı kendiliğinden kapatır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("deviceState");
  const wizard = harness.wizard();
  // Eşleme yolu: süre satırı uygulanabilir değil.
  wizard.triggerDeviceId = "0x0011";
  wizard.stage = "trigEvent";
  assert.equal(api.automationTrigForEligible(wizard), false);
  api.chooseAutomationEvent("state=ON");
  // Adım kendiliğinden kapanır; sıradaki soru tetikleyiciden sonraki beklemedir.
  assert.equal(harness.wizard().stage, "wait");

  // Düğme yolu da dışarıda: tetikleyici `deviceAction` yazar, süre orada hiç kaydedilmez.
  assert.equal(api.automationTrigForEligible({ triggerKind: "button" }), false);
});

// Koşul adımında aynı tuzak vardı: durum seçimi koşulu anında kapatıyordu, süre satırı altındaydı.
test("koşul durumu seçimi adımı kapatmaz, süre satırı erişilebilir kalır", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("deviceState");
  api.chooseAutomationCondDevice("0x0011");
  assert.equal(api.automationStageAdvanceable(harness.wizard()), false);

  api.chooseAutomationCondState("state=ON");
  // Koşul henüz listeye girmedi: adım açık, liste seçilen satıra daraldı, süre satırı yerinde.
  assert.equal(harness.wizard().stage, "condState");
  assert.equal((harness.wizard().conditions as unknown[]).length, 0);
  assert.match(harness.body(), /data-automation-reopen="1"/);
  assert.match(harness.body(), /data-automation-cond-for="1"/);
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);

  api.toggleAutomationCondFor("1");
  api.setAutomationCondForSeconds(180);
  assert.equal(harness.wizard().stage, "condState");

  // Kesinleşme birincil düğmeyle olur ve süre koşula yazılır.
  await api.nextAutomationStep();
  const conditions = harness.wizard().conditions as Array<Record<string, unknown>>;
  assert.deepEqual(conditions, [
    { type: "deviceState", deviceId: "0x0011", property: "state", equals: "ON", forSeconds: 180 }
  ]);
});

// Adım açık kalıyor ama bütün liste açık kalmıyor: seçimden sonra yalnız seçilen satır durur.
// Bileşen yeni değil — tamamlanmış düğümlerdeki özet satırının ta kendisi, aynı "Değiştir" metniyle.
const collapsedRow = /<div class="automation-summary"><button class="automation-summary-main" type="button" data-automation-reopen="1"><span class="automation-line"><strong>[^<]+<\/strong><\/span><span class="automation-change">automationChange<\/span><\/button><\/div>/;

test("tetikleyicide olay seçilince liste tek satıra daralır, Değiştir listeyi geri açar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");

  // Seçimden önce liste açık: seçenek satırları çizili, daralmış satır yok.
  assert.match(harness.body(), /data-automation-event="occupancy=true"/);
  assert.doesNotMatch(harness.body(), /data-automation-reopen=/);

  api.chooseAutomationEvent("occupancy=true");
  // Seçimden sonra: yalnız seçilen satır + "Değiştir". Diğer seçenekler hiç çizilmez.
  assert.equal(harness.wizard().stage, "trigEvent");
  assert.equal(harness.wizard().pickerOpen, false);
  assert.match(harness.body(), collapsedRow);
  assert.doesNotMatch(harness.body(), /data-automation-event=/);
  // Daraltmanın amacı bu: süre satırı daralmış hâlde de erişilebilir kalır.
  assert.match(harness.body(), /data-automation-trig-for="1"/);
  // Alttaki birincil düğme etkin kalır.
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);

  // "Değiştir" listeyi geri açar; seçim silinmez, seçili satır işaretli gelir.
  api.reopenAutomationPicker();
  assert.equal(harness.wizard().stage, "trigEvent");
  assert.doesNotMatch(harness.body(), /data-automation-reopen=/);
  assert.match(
    harness.body(),
    /<button class="automation-opt is-on" type="button" data-automation-event="occupancy=true" aria-pressed="true">/
  );
  // Süre satırı açık listede de yerinde durur.
  assert.match(harness.body(), /data-automation-trig-for="1"/);

  // Vazgeçip aynı satır yeniden seçilirse tetikleyici değişmez, liste tekrar daralır.
  api.chooseAutomationEvent("occupancy=true");
  assert.match(harness.body(), collapsedRow);
  assert.deepEqual(api.automationWizardTriggers(harness.wizard()), [
    { type: "deviceState", deviceId: "0x0022", property: "occupancy", equals: true }
  ]);
});

test("koşulda durum seçilince liste tek satıra daralır, Değiştir listeyi geri açar", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");
  api.goToAutomationStage("cond");
  api.chooseAutomationCondKind("deviceState");
  api.chooseAutomationCondDevice("0x0011");

  assert.match(harness.body(), /data-automation-cond-state="state=ON"/);
  assert.doesNotMatch(harness.body(), /data-automation-reopen=/);

  api.chooseAutomationCondState("state=ON");
  assert.equal(harness.wizard().stage, "condState");
  assert.equal(harness.wizard().pickerOpen, false);
  assert.match(harness.body(), collapsedRow);
  assert.doesNotMatch(harness.body(), /data-automation-cond-state=/);
  assert.match(harness.body(), /data-automation-cond-for="1"/);
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);

  api.reopenAutomationPicker();
  assert.doesNotMatch(harness.body(), /data-automation-reopen=/);
  assert.match(
    harness.body(),
    /<button class="automation-opt is-on" type="button" data-automation-cond-state="state=ON" aria-pressed="true">/
  );
  assert.match(harness.body(), /data-automation-cond-for="1"/);

  // Aynı satır yeniden seçilirse koşul taslağı değişmez.
  api.chooseAutomationCondState("state=ON");
  assert.match(harness.body(), collapsedRow);
  await api.nextAutomationStep();
  assert.deepEqual(harness.wizard().conditions, [
    { type: "deviceState", deviceId: "0x0011", property: "state", equals: "ON" }
  ]);
});

// Daralma yalnız adım içi seçime aittir: tamamlanmış satırdaki "Değiştir" ile adıma dönülünce
// liste açık gelir — kullanıcı zaten değiştirmeye geldi.
test("tamamlanmış satırdan adıma dönülünce seçenek listesi açık gelir", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0022");
  api.chooseAutomationEvent("occupancy=true");
  await api.nextAutomationStep();
  api.chooseAutomationTargetDevice("0x0011");
  api.chooseAutomationAction("0x0011|switch:state|on");
  api.chooseAutomationAutoOff("none");

  api.goToAutomationStage("trigEvent");
  assert.equal(harness.wizard().pickerOpen, true);
  assert.match(
    harness.body(),
    /<button class="automation-opt is-on" type="button" data-automation-event="occupancy=true" aria-pressed="true">/
  );
});

// Sayısal eşik yolunda davranış değişmez: seçim adımı kapatır, daralmış satır hiç çizilmez.
test("sayısal eşik yolunda daraltma devreye girmez", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sensor");
  api.chooseAutomationTriggerDevice("0x0044");
  api.chooseAutomationEvent("num:temperature");
  assert.equal(harness.wizard().stage, "trigThreshold");
  assert.doesNotMatch(harness.body(), /data-automation-reopen=/);
});

// Tek yönü boş bırakmak kuralı tek yönlü yapar; iki yön de boşsa kural kaydedilemez.
test("güneş eşlemesinde bir yöne 'bir şey yapma' denebilir, iki yöne birden denemez", async () => {
  const harness = await automationWizardHarness();
  const { api } = harness;
  api.openAutomationWizard(null);
  api.chooseAutomationPath("rule");
  api.chooseAutomationTrigger("sun");
  api.chooseAutomationTargetDevice("0x0011");
  assert.equal(harness.wizard().stage, "map");
  // "Bir şey yapma" iki yönde de sunulur.
  assert.match(harness.body(), /data-automation-map="on\|none"/);
  assert.match(harness.body(), /data-automation-map="off\|none"/);

  // İki yön de boşsa ileri gidilmez ve sebebi yazılır.
  api.chooseAutomationMap("on|none");
  api.chooseAutomationMap("off|none");
  assert.equal(api.automationStageAdvanceable(harness.wizard()), false);
  assert.equal(api.automationBlockedReason(harness.wizard()), "automationNeedMap");

  // Gün doğumuna "bir şey yapma" denince kural tek yönlü kaydedilir.
  api.chooseAutomationMap("on|on");
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);
  await api.nextAutomationStep();
  await api.saveAutomationWizard();
  const saved = harness.saved()[harness.saved().length - 1] as Record<string, unknown>;
  assert.equal((saved.triggers as unknown[]).length, 2);
  assert.deepEqual(saved.actions, [
    { type: "device", deviceId: "0x0011", property: "state", controlId: "switch:state", value: "ON", when: { equals: "sunset" } }
  ]);
});

test("koşul adımındaki cihaz listesi neyi neden listelediğini söyler", async () => {
  const dashboard = await readDashboardBundle();

  // §9.3 — tetikleyicideki cihaz listenin başında ayrı kümede; kullanıcı onu baştan aramasın.
  assert.match(
    dashboard,
    /\{devices:same,proven:true,head:"automationCondPickSameDevice"\},\s*\{devices:devices\.filter\(device=>device\.id!==triggerId\),proven:true,head:"automationCondPickOtherDevices"\}/
  );
  // Tetikleyici cihaz koşula uygun değilse küme hiç kurulmaz: boş başlık çıkmaz.
  assert.match(dashboard, /if\(!same\.length\)return\[\{devices,proven:true\}\];/);
  assert.match(dashboard, /automationCondPickSameDevice:"Aynı cihazın durumu"/);
  assert.match(dashboard, /automationCondPickSameDevice:"State of the same device"/);
  assert.match(dashboard, /automationCondPickOtherDevices:"Evdeki diğer cihazlar"/);

  // Hangi okumanın koşula gireceği satırda önden görünür; üçten fazlası kısalır.
  assert.match(dashboard, /return t\("automationCondPickReadings",\{readings:names\.slice\(0,3\)\.join\(", "\)\+\(names\.length>3\?"…":""\)\}\);/);
  assert.match(dashboard, /automationCondPickReadings:"Koşula girecek: \{readings\}"/);
  assert.match(dashboard, /automationCondPickReadings:"Goes into the condition: \{readings\}"/);

  // Listede olmayan cihaz için tek satırlık açıklama listenin altında durur.
  assert.match(
    dashboard,
    /return scope==="cond"\?`\$\{list\}<p class="automation-hint">\$\{esc\(t\("automationCondPickWhy"\)\)\}<\/p>`:list;/
  );
  assert.match(dashboard, /automationCondPickWhy:"[^"]*Bir cihaz listede yoksa koşul olarak okunabilecek bir durumu yok demektir\."/);
  assert.match(dashboard, /automationCondPickWhy:"[^"]*If a device is missing, it has no state that can be read as a condition\."/);
});

test("ışık detay kartındaki büyük dikey kumanda yetenek bazlı çizilir", async () => {
  const dashboard = await readDashboardBundle();

  // Parçalar cihazın SUNDUĞU kumandalardan okunur: model ya da ad listesi yok.
  assert.match(dashboard, /power:controls\.find\(control=>control\.kind==="switch"&&control\.id==="main"\)/);
  assert.match(dashboard, /level:byId\("main:brightness","level"\)/);
  assert.match(dashboard, /temperature:byId\("main:temperature","temperature"\)/);
  assert.match(dashboard, /color:byId\("main:color","color"\)/);
  assert.match(dashboard, /effect:controls\.find\(control=>control\.kind==="select"&&\/\(\^\|_\)effect\$\/\.test/);
  // Kumanda ışık profiline bağlı; priz/anahtar (yalnız `switch`) etkilenmez.
  assert.match(dashboard, /const lightPanelSupported=\(device,parts\)=>device\?\.category==="light"&&Boolean\(parts\.power\|\|parts\.level\)/);
  assert.match(dashboard, /if\(!lightPanelSupported\(device,parts\)\)return"";/);
  // Satırlar yalnız desteklenen yetenekte çizilir: kip düğmesi, hazır renkler, efekt.
  assert.match(dashboard, /const modeButton=\(key,control,active\)=>control/);
  assert.match(dashboard, /const modesHtml=modeButtons\?/);
  assert.match(dashboard, /const presetsHtml=parts\.color/);
  assert.match(dashboard, /const effectHtml=parts\.effect/);
  // Serbest renk için yeni arayüz yazılmadı: paneldeki `.color-picker` + `data-color` yolu kullanıldı.
  assert.match(dashboard, /<div class="light-color"\$\{mode==="color"\?"":" hidden"\}>/);
  assert.match(dashboard, /<input class="color-picker" type="color" value="\$\{esc\(typeof parts\.color\.value==="string"\?parts\.color\.value:"#ffffff"\)\}" data-color=/);
  assert.match(dashboard, /const powerButton=parts\.power/);
  // Kumanda ayar satırlarının sütununun ilk öğesi; tam genişlikte ayrı bir üst blok değil.
  assert.match(dashboard, /const panelHtml=lightPanelHtml\(device\);/);
  assert.match(dashboard, /return`\$\{setupHtml\}<div class="device-detail-layout">/);
  assert.doesNotMatch(dashboard, /\$\{setupHtml\}\$\{panelHtml\}/);
  // Kurulum kurtarma şeridi taşınmadı: pencerenin en üstünde, düzenin üstünde kalır.
  assert.match(dashboard, /const setupHtml=deviceNeedsName\(device\)/);
  // Yüzde okuması, kolon, kip düğmeleri + göz, hazır renkler ve efekt tek panelin içinde kalır.
  assert.match(dashboard, /const eyeHtml=lightPanelCoversPower\(device,parts\)\?visibilityButton\(device,parts\.power\):"";/);
  assert.match(dashboard, /const actionsHtml=modesHtml\|\|eyeHtml\?`<div class="light-actions">\$\{modesHtml\}\$\{eyeHtml\}<\/div>`:"";/);
  assert.match(dashboard, /\$\{actionsHtml\}\$\{presetsHtml\}\$\{effectHtml\}\s*<\/div>`;/);
  // Kolonun rengi ışığın o anki durumu: renk varsa o, renk sıcaklığı varsa Kelvin karşılığı,
  // düz ışıkta panelin sıcak sarısı (`--sun`). Kapalıyken sönük.
  assert.match(dashboard, /if\(typeof parts\.color\?\.value==="string"&&\/\^#\[0-9a-f\]\{6\}\$\/i\.test\(parts\.color\.value\)\)return parts\.color\.value\.toLowerCase\(\)/);
  assert.match(dashboard, /if\(typeof parts\.temperature\?\.value==="number"\)return kelvinHex\(temperatureKelvin\(parts\.temperature\.value\)\)/);
  assert.match(dashboard, /\.light-column-fill\{position:absolute;left:0;right:0;bottom:0;background:var\(--light-tint,var\(--sun\)\)/);
  assert.match(dashboard, /\.light-column\.off \.light-column-fill\{opacity:\.2\}/);
  // Göreli zaman için yeni yardımcı yazılmadı: paneldeki `ago` yeniden kullanıldı.
  assert.match(dashboard, /<div class="light-readout-since">\$\{esc\(ago\(device\.stateUpdatedAt\)\)\}<\/div>/);
  assert.equal((dashboard.match(/const ago=iso=>/g) || []).length, 1);
  // Ölçüler viewport'a bağlı (sabit px yok), dokunma hedefleri 44×44, hareket kısıtı saygılı.
  assert.match(dashboard, /\.light-column\{position:relative;width:clamp\(88px,15vw,124px\);height:clamp\(120px,28vh,220px\)/);
  assert.match(dashboard, /\.light-mode\{min-width:44px;min-height:44px/);
  assert.match(dashboard, /\.light-preset\{min-width:44px;min-height:44px/);
  assert.match(dashboard, /@media\(prefers-reduced-motion:reduce\)\{\.light-column-fill\{transition:none\}\}/);
  assert.match(dashboard, /lightPower:"Power"/);
  assert.match(dashboard, /lightPower:"Güç"/);
  assert.match(dashboard, /lightEffect:"Effect"/);
  assert.match(dashboard, /lightEffect:"Efekt"/);
  assert.match(dashboard, /lightPresetColors:"Preset colors"/);
  assert.match(dashboard, /lightPresetColors:"Hazır renkler"/);
});

test("kolon sürüklenirken arayüz iyimser, yazma kısıtlı, bırakışta kesin değer yazılır", async () => {
  const dashboard = await readDashboardBundle();

  // Pointer Events + işaretçi yakalama + `touch-action:none` (yoksa tablette sayfa kayar).
  assert.match(dashboard, /column\.onpointerdown=event=>\{/);
  assert.match(dashboard, /if\(column\.setPointerCapture\)column\.setPointerCapture\(event\.pointerId\)/);
  assert.match(dashboard, /\.light-column\{[^}]*touch-action:none/);
  // Sürüklerken önce boyanır (iyimser), sonra kısıtlı yazma sıraya girer.
  assert.match(dashboard, /paint\(lightDrag\.fraction\);\s+write\(lightDrag\.fraction,false\);/);
  assert.match(dashboard, /const lightWriteInterval=200;/);
  assert.match(dashboard, /const wait=immediate\?0:lightWriteInterval-\(Date\.now\(\)-lightWrite\.at\);/);
  assert.match(dashboard, /if\(!lightWrite\.timer\)lightWrite\.timer=setTimeout\(flushLightWrite,wait\);/);
  // Aynı anda tek uçuşta komut: sıra doluysa son değer DÜŞMEZ, geri sıraya konur.
  assert.match(dashboard, /if\(commandPending\(job\.id,job\.property\)\)\{lightWrite\.timer=setTimeout\(flushLightWrite,80\);return\}/);
  // Bırakınca kesin değer bir kez daha yazılır (iptalde de).
  assert.match(dashboard, /if\(slider\)\{paint\(fraction\);write\(fraction,true\)\}/);
  assert.match(dashboard, /if\(moved&&slider\)write\(fraction,true\);/);
  // Sürükleme durumu modül düzeyinde: komut sonrası yeniden bağlama parmak takibini koparmaz.
  assert.match(dashboard, /const lightDrag=\{pointerId:null,startY:0,moved:false,fraction:0\};/);
  assert.match(dashboard, /bindLightPanel\(\);/);
});

test("yalnız aç/kapat olan ışıkta kolon anahtar gibi çalışır ve klavyeyle kullanılabilir", async () => {
  const dashboard = await readDashboardBundle();

  // Parlaklık/renk sıcaklığı yoksa kip "switch": sürükleme yok, dokunma aç/kapat yapar.
  assert.match(dashboard, /return\{kind:"switch",control:parts\.power,known:typeof parts\.power\?\.value==="boolean"/);
  assert.match(dashboard, /lightDrag\.moved=true;\s+if\(!slider\)return;/);
  assert.match(dashboard, /if\(parts\.power\)\{toggle\(\);return\}/);
  // Rol ve durum bildirimi: kaydırıcıda `slider`, aç/kapat cihazında `switch`+`aria-checked`.
  assert.match(dashboard, /role="\$\{slider\?"slider":"switch"\}"/);
  assert.match(dashboard, /aria-valuemin="0" aria-valuemax="100" aria-valuenow="\$\{percent\}" aria-valuetext="\$\{esc\(readout\)\}"/);
  assert.match(dashboard, /:`aria-checked="\$\{lit\}"`/);
  assert.match(dashboard, /<div class="light-column\$\{lit\?"":" off"\}" data-light-column="\$\{esc\(device\.id\)\}"[^`]*tabindex="0"/);
  // Klavye: ok tuşları artır/azalt, Home/End uçlar, aç/kapat cihazında Space/Enter değiştirir.
  assert.match(dashboard, /const steps=\{ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:2,PageDown:-2\};/);
  assert.match(dashboard, /const edge=event\.key==="Home"\?0:event\.key==="End"\?1:null;/);
  assert.match(dashboard, /if\(edge!==null\)\{event\.preventDefault\(\);paint\(edge\);write\(edge,true\);return\}/);
  assert.match(dashboard, /if\(event\.key===" "\|\|event\.key==="Enter"\)\{\s+if\(!parts\.power\)return;/);
  // Işık olmayan cihazın kumandaları değişmedi: satır tabanlı kontroller yerinde.
  assert.match(
    dashboard,
    /const controlsBodyHtml=device\.controls\.filter\(control=>!covered\.has\(control\)\)\.map\(control=>controlHtml\(device,control\)\)\.join\(""\)\+deviceButtonsHtml\(device\)/
  );
});

test("büyük kumandanın çizildiği ışıkta parlaklık, renk sıcaklığı ve renk satırları listeden düşer", async () => {
  const dashboard = await readDashboardBundle();

  /* Eleme kumandanın KENDİ parçalarına dayanır: aynı `lightPanelParts`/`lightPanelSupported`
     ikilisi hem kumandayı çiziyor hem satırı düşürüyor, ikisi ayrışamaz. Kumanda çizilmiyorsa
     küme boştur — o cihazda hiçbir satır kaybolmaz. */
  assert.match(dashboard, /const lightPanelCoveredControls=device=>\{/);
  assert.match(dashboard, /const parts=lightPanelParts\(device\);\s+if\(!lightPanelSupported\(device,parts\)\)return new Set\(\);/);
  // Parlaklık, renk sıcaklığı, renk ve (yalnız devralınmışsa) güç kanalı düşer.
  assert.match(
    dashboard,
    /return new Set\(\[parts\.level,parts\.temperature,parts\.color,lightPanelCoversPower\(device,parts\)\?parts\.power:null\]\.filter\(Boolean\)\);/
  );
  /* Nesne kimliğiyle elenir, kimlik dizesiyle değil: kumandanın gerçekten bağladığı kumanda
     nesnesi düşer, `l2:brightness` gibi kumandanın dokunmadığı kanal satırı listede kalır. */
  assert.match(dashboard, /const covered=lightPanelCoveredControls\(device\);/);
  assert.match(dashboard, /\.filter\(control=>!covered\.has\(control\)\)/);
  /* Renk satırı bedelsiz düşer: kumanda renk kipinde AYNI arayüzü gösteriyor (`.color-picker` +
     `data-color`), o satırda ne göz ne kalem vardı. Satır şablonunda ikisinin de olmadığı sabit. */
  assert.match(
    dashboard,
    /if\(control\.kind==="color"\)return`<div class="control-row\$\{adminClass\}"\$\{adminAttr\}><div><div class="control-name">\$\{t\("color"\)\}<\/div>/
  );
  assert.doesNotMatch(
    dashboard,
    /if\(control\.kind==="color"\)return`[^`]*(?:visibilityButton|renameControlButton)/
  );
  /* `level`/`temperature` satırlarında da göz yoktu: göz yalnız `dashboardControlKinds`
     üyelerinde çıkar ve bu kind'lar o kümede DEĞİL. */
  assert.match(
    dashboard,
    /const dashboardControlKinds=new Set\(\["switch","fan","siren","cover","position","lock","climate"\]\);/
  );
  assert.doesNotMatch(dashboard, /const dashboardControlKinds=new Set\(\[[^\]]*"(?:level|temperature|color)"/);
  assert.match(dashboard, /const isDashboardControl=control=>dashboardControlKinds\.has\(control\.kind\)&&control\.adminOnly!==true;/);
  assert.match(dashboard, /const isNamedChannel=control=>control\?\.kind==="switch"&&!String\(control\.id\|\|""\)\.includes\(":"\);/);
  // Kaydırıcı satırındaki göz yalnız `position`/`climate` için çıkar; onlar elenmiyor.
  assert.match(dashboard, /<div class="control-actions">\$\{isDashboardControl\(control\)\?visibilityButton\(device,control\):""\}<input type="range"/);
  // Her şeyi kumanda devraldıysa "kumanda yok" metni yanlış olurdu: kumanda çizilmişken çıkmaz.
  assert.match(
    dashboard,
    /\$\{controlsBodyHtml\|\|\(panelHtml\?"":`<div class="device-exposed-empty">\$\{t\("noExposedControls"\)\}<\/div>`\)\}/
  );
});

test("göz kumandanın içine taşındı ve aç/kapa satırı yalnız gözü taşınmışsa düşer", async () => {
  const dashboard = await readDashboardBundle();

  /* Göz kip düğmelerinin yanında, kumandanın içinde. Yeni bileşen YOK: satırdakiyle birebir aynı
     `visibilityButton` çağrısı, dolayısıyla sınıf, `role="switch"`/`aria-checked` ve etiket
     bugünküyle aynı; bağlama da aynı genel seçiciden geliyor, ayrı bir kablo çekilmedi. */
  assert.match(dashboard, /const eyeHtml=lightPanelCoversPower\(device,parts\)\?visibilityButton\(device,parts\.power\):"";/);
  assert.match(
    dashboard,
    /const actionsHtml=modesHtml\|\|eyeHtml\?`<div class="light-actions">\$\{modesHtml\}\$\{eyeHtml\}<\/div>`:"";/
  );
  assert.match(dashboard, /\$\{actionsHtml\}\$\{presetsHtml\}\$\{effectHtml\}/);
  assert.doesNotMatch(dashboard, /\$\{modesHtml\}\$\{presetsHtml\}/);
  assert.match(
    dashboard,
    /return`<button class="visibility-toggle\$\{hidden\?" is-hidden":""\}" type="button" role="switch" aria-checked="\$\{hidden\?"false":"true"\}" data-visibility-device=/
  );
  assert.match(dashboard, /\$\$\("\[data-visibility-device\]:not\(\.tile-eye\)"\)\.forEach\(button=>button\.onclick=\(\)=>toggleTileVisibility\(/);
  // Tek `visibilityButton` tanımı: panelde kopyası türetilmedi.
  assert.equal((dashboard.match(/const visibilityButton=\(device,control\)=>\{/g) || []).length, 1);

  /* Satır elenir ⟺ gözü kumanda taşır. Kalem taşıyan (çok kanallı) cihazda satır DURUR: kanal adı
     ve kalem orada yaşıyor, kumandada kanal adı diye bir yer yok — işlev kaybıyla bitmez. */
  assert.match(
    dashboard,
    /const lightPanelCoversPower=\(device,parts\)=>Boolean\(parts\.power\)&&isDashboardControl\(parts\.power\)&&!deviceHasChannelNames\(device\);/
  );
  assert.match(dashboard, /const deviceHasChannelNames=device=>deviceNamedChannels\(device\)\.length>1;/);
  assert.match(dashboard, /const renameControlButton=\(device,control\)=>\{\s+if\(!isNamedChannel\(control\)\|\|!deviceHasChannelNames\(device\)\)return"";/);
  // Aç/kapa satırı şablonu (kalem + göz) olduğu gibi duruyor: elenmeyen cihazda hiçbir şey değişmedi.
  assert.match(
    dashboard,
    /<div class="control-name">\$\{esc\(name\)\}\$\{renameControlButton\(device,control\)\}<\/div>/
  );

  // Kumandanın görsel dili: 44×44 dokunma hedefi korunur, ölçüler viewport'a bağlı, sabit px eklenmedi.
  assert.match(dashboard, /\.light-actions\{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:clamp\(7px,1\.1vw,12px\)\}/);
  assert.match(dashboard, /\.light-actions \.visibility-toggle\{border-radius:14px\}/);
  assert.match(dashboard, /\.visibility-toggle\{width:44px;height:44px/);
  // Koyu temada göz zaten tanımlı; panelde ayrı bir tema kuralı gerekmedi.
  assert.match(dashboard, /:root\[data-theme="dark"\] \.visibility-toggle\{border-color:#33413a\}/);
});

// ————— değer eylemleri: parlaklık, ışık sıcaklığı ve renk. Sihirbaz cihazın SUNDUĞU kumandalara
// göre çizer; yüzde↔ham dönüşümü kumandanın kendi `min`/`max`/`step` alanından çıkar.
async function automationValueHarness(messages: Record<string, string> = {}): Promise<WizardHarness> {
  const scripts = await panelScripts();
  const sandbox = automationSandbox(
    scripts,
    [
      {
        // Kısılabilir, renkli lamba: üç değer kumandası da sunuluyor.
        id: "0x0011", name: "Salon lambası", buttons: [], features: [], state: {},
        controls: [
          { id: "main", property: "state", name: "Salon lambası", kind: "switch", valueOn: "ON", valueOff: "OFF", valueToggle: "TOGGLE" },
          { id: "main:brightness", property: "brightness", name: "Parlaklık", kind: "level", value: 128, min: 1, max: 254 },
          { id: "main:temperature", property: "color_temp", name: "Işık sıcaklığı", kind: "temperature", value: 300, min: 153, max: 500 },
          { id: "main:color", property: "color", name: "Renk", kind: "color", value: "#ffffff" }
        ]
      },
      {
        // Düz priz: değer kumandası yok, ekranda da hiç çıkmamalı.
        id: "0x0022", name: "Bahçe prizi", buttons: [], features: [], state: {},
        controls: [{ id: "main", property: "state", name: "Bahçe prizi", kind: "switch", valueOn: "ON", valueOff: "OFF" }]
      },
      { id: "0x0033", name: "Koridor sensörü", buttons: [], features: ["occupancy"], state: { occupancy: false }, controls: [] },
      {
        // Kısılabilir, renk değiştirebilen duvar anahtarı: kendi ölçeği 0–100, hedefinki 1–254.
        // Canlı takibin tetikleyicisi budur.
        id: "0x0044", name: "Bahçe anahtarı", buttons: [], features: [], state: { brightness: 40 },
        controls: [
          { id: "main", property: "state", name: "Bahçe anahtarı", kind: "switch", valueOn: "ON", valueOff: "OFF" },
          { id: "main:brightness", property: "brightness", name: "Parlaklık", kind: "level", value: 40, min: 0, max: 100 },
          { id: "main:color", property: "color", name: "Renk", kind: "color", value: "#ffffff" }
        ]
      }
    ],
    [],
    messages
  );
  return {
    ...sandbox,
    wizard: () => sandbox.state.automationWizard as Record<string, unknown>,
    body: () => sandbox.bodies[sandbox.bodies.length - 1]
  };
}

const openValueAction = (harness: WizardHarness, deviceId: string): void => {
  harness.api.openAutomationWizard(null);
  harness.api.chooseAutomationPath("rule");
  harness.api.chooseAutomationTrigger("sensor");
  harness.api.chooseAutomationTriggerDevice("0x0033");
  harness.api.chooseAutomationEvent("occupancy=true");
  harness.api.chooseAutomationTargetDevice(deviceId);
};

test("değer seçenekleri yalnız cihazın sunduğu kumandalardan çizilir", async () => {
  const harness = await automationValueHarness();

  openValueAction(harness, "0x0011");
  // Aç/kapat varsayılan kalır ve aynı satırda durur; değer seçenekleri onun yanındadır.
  assert.match(harness.body(), /data-automation-action="0x0011\|main\|on"/);
  assert.match(harness.body(), /data-automation-action="0x0011\|main\|off"/);
  assert.match(harness.body(), /data-automation-value="0x0011\|main:brightness"/);
  assert.match(harness.body(), /data-automation-value="0x0011\|main:temperature"/);
  assert.match(harness.body(), /data-automation-value="0x0011\|main:color"/);
  // Seçim yapılmadan sayaç ya da renk seçici açılmaz: akış uzamaz.
  assert.doesNotMatch(harness.body(), /data-automation-value-step=/);
  assert.doesNotMatch(harness.body(), /data-automation-value-color=/);

  // Sabit liste yok: değer kumandası bildirmeyen cihazda seçenek hiç görünmez.
  const plain = await automationValueHarness();
  openValueAction(plain, "0x0022");
  assert.match(plain.body(), /data-automation-action="0x0022\|main\|on"/);
  assert.doesNotMatch(plain.body(), /data-automation-value=/);

  // Yardımcı doğrudan da aynı şeyi söyler: kanal kimliği kardeşleri bağlar.
  const controls = harness.api.automationValueControls(
    (harness.state.devices as Record<string, unknown>[])[0],
    "main"
  ) as Array<{ id: string }>;
  assert.deepEqual(controls.map((control) => control.id), ["main:brightness", "main:temperature", "main:color"]);
  assert.deepEqual(
    harness.api.automationValueControls((harness.state.devices as Record<string, unknown>[])[1], "main"),
    []
  );
});

test("yüzde↔ham dönüşümü kumandanın kendi aralığından çıkar", async () => {
  const harness = await automationValueHarness();
  const { api } = harness;
  const level = { kind: "level", min: 1, max: 254 };
  const warmth = { kind: "temperature", min: 153, max: 500 };
  const percentScale = { kind: "level", min: 0, max: 100 };

  // Sınırlar: %0 alt uç, %100 üst uç. Sabit 0–254 varsayımı yok.
  assert.equal(api.automationValueRaw(level, 0), 1);
  assert.equal(api.automationValueRaw(level, 100), 254);
  assert.equal(api.automationValueRaw(warmth, 0), 153);
  assert.equal(api.automationValueRaw(warmth, 100), 500);
  assert.equal(api.automationValueRaw(percentScale, 40), 40);

  // Aralık dışı yüzde kırpılır; ham değer tam sayıya oturur.
  assert.equal(api.automationValueRaw(level, -20), 1);
  assert.equal(api.automationValueRaw(level, 240), 254);
  assert.equal(api.automationValueRaw(level, 50), 128);

  // Geri dönüş: ham değerin yüzdesi kullanıcıya gösterilen sayıdır.
  assert.equal(api.automationValuePercent(level, 1), 0);
  assert.equal(api.automationValuePercent(level, 254), 100);
  assert.equal(api.automationValuePercent(warmth, 500), 100);

  // Adım bildiren kumanda kendi ızgarasına oturur.
  assert.equal(api.automationValueRaw({ kind: "climate", min: 5, max: 30, step: 0.5 }, 50), 17.5);
});

test("parlaklık eylemi yüzdeyle ayarlanır, kurala kumandanın ham birimi yazılır", async () => {
  const harness = await automationValueHarness();
  const { api } = harness;

  openValueAction(harness, "0x0011");
  api.chooseAutomationValue("0x0011|main:brightness");
  // Seçenek açılınca sayaç görünür ve cihazın o anki değerinden başlar (%50).
  assert.match(harness.body(), /data-automation-value-step="1"/);
  assert.match(harness.body(), /data-automation-value-step="-1"/);
  assert.equal(harness.wizard().draftValue, 128);

  // Bir dokunuş onda bir aralık ilerletir.
  api.stepAutomationValue(1);
  assert.equal(api.automationValuePercent({ kind: "level", min: 1, max: 254 }, harness.wizard().draftValue), 60);
  api.stepAutomationValue(-3);
  assert.equal(harness.wizard().draftValue, 77);

  // Aç/kapat tek dokunuşla biterken değer "İleri" ile kesinleşir.
  assert.equal(api.automationStageAdvanceable(harness.wizard()), true);
  await api.nextAutomationStep();
  assert.deepEqual(harness.wizard().targets, [
    { deviceId: "0x0011", property: "brightness", controlId: "main:brightness", value: 77 }
  ]);

  await api.saveAutomationWizard();
  const saved = harness.saved()[0] as { actions: Record<string, unknown>[] };
  assert.deepEqual(saved.actions, [
    { type: "device", deviceId: "0x0011", property: "brightness", controlId: "main:brightness", value: 77 }
  ]);
});

test("renk eylemi ışık kumandasının hazır renklerini ve seçicisini yeniden kullanır", async () => {
  const harness = await automationValueHarness();
  const { api } = harness;

  openValueAction(harness, "0x0011");
  api.chooseAutomationValue("0x0011|main:color");
  // Panelin `.light-presets` / `.color-picker` bileşenlerinin aynısı; yeni seçici yazılmadı.
  assert.match(harness.body(), /class="light-presets"/);
  assert.match(harness.body(), /data-automation-value-preset="#3f9dff"/);
  assert.match(harness.body(), /<input class="color-picker" type="color"/);

  api.setAutomationValueColor("#3f9dff");
  assert.equal(harness.wizard().draftValue, "#3f9dff");
  // Geçersiz biçim taslağa hiç girmez; kurala her zaman `#rrggbb` yazılır.
  api.setAutomationValueColor("mavi");
  assert.equal(harness.wizard().draftValue, "#3f9dff");

  await api.nextAutomationStep();
  await api.saveAutomationWizard();
  const saved = harness.saved()[0] as { actions: Record<string, unknown>[] };
  assert.deepEqual(saved.actions, [
    { type: "device", deviceId: "0x0011", property: "color", controlId: "main:color", value: "#3f9dff" }
  ]);
});

test("kayıtlı değer eylemi düzenlemeye ayarlayıcısı açık gelir", async () => {
  const harness = await automationValueHarness();
  const { api } = harness;

  (harness.state.automations as unknown[]).push({
    id: "rule-parlaklik",
    name: "Parlaklık",
    enabled: true,
    triggers: [{ type: "deviceState", deviceId: "0x0033", property: "occupancy", equals: true }],
    conditions: [],
    actions: [{ type: "device", deviceId: "0x0011", property: "brightness", controlId: "main:brightness", value: 200 }],
    lastRunAt: null,
    lastRunOk: null
  });
  api.openAutomationWizard("rule-parlaklik");
  api.editAutomationTarget(0);
  assert.deepEqual(harness.wizard().draftValueTarget, { deviceId: "0x0011", controlId: "main:brightness" });
  assert.equal(harness.wizard().draftValue, 200);
  assert.match(harness.body(), /data-automation-value-step="1"/);

  // Dokunmadan kaydetmek kuralı değiştirmez.
  await api.nextAutomationStep();
  await api.saveAutomationWizard();
  const saved = harness.saved().find((item) => item.id === "rule-parlaklik") as { actions: Record<string, unknown>[] };
  assert.deepEqual(saved.actions, [
    { type: "device", deviceId: "0x0011", property: "brightness", controlId: "main:brightness", value: 200 }
  ]);
});

test("değer eylemlerinin cümlesi tam şablon anahtarıdır ve tr/en paritesi tam", async () => {
  const [dashboard, englishSource, turkishSource] = await Promise.all([
    readPanelSource(),
    readFile(englishLocaleUrl, "utf8"),
    readFile(turkishLocaleUrl, "utf8")
  ]);
  const english = JSON.parse(englishSource).translations as Record<string, string>;
  const turkish = JSON.parse(turkishSource).translations as Record<string, string>;

  const keys = [
    "automationSetBrightness", "automationSetWarmth", "automationSetColor",
    "automationValuePercent", "automationValueWarmthText",
    "automationWarmthCool", "automationWarmthNeutral", "automationWarmthWarm",
    "automationValueDown", "automationValueUp",
    "automationValueBrightnessHint", "automationValueWarmthHint", "automationValueColorHint",
    "automationPillBrightness", "automationPillWarmth", "automationPillColor",
    "automationWillSetBrightness", "automationWillSetWarmth", "automationWillSetColor",
    "automationSetsBrightness", "automationSetsWarmth", "automationSetsColor"
  ];
  for (const key of keys) {
    assert.equal(typeof turkish[key], "string", `tr eksik: ${key}`);
    assert.equal(typeof english[key], "string", `en eksik: ${key}`);
  }
  // Cümle parçadan kurulmuyor: değer şablonun içinde durur.
  for (const key of ["automationWillSetBrightness", "automationSetsBrightness", "automationPillBrightness"]) {
    assert.match(turkish[key], /\{value\}/);
    assert.match(english[key], /\{value\}/);
  }
  assert.doesNotMatch(dashboard, /color-mix\(/);

  // Gerçek katalogla: özet cümlesi ve kart satırı okunur çıkıyor.
  const harness = await automationValueHarness(turkish);
  const { api } = harness;
  openValueAction(harness, "0x0011");
  api.chooseAutomationValue("0x0011|main:brightness");
  api.stepAutomationValue(-1);
  await api.nextAutomationStep();
  assert.equal(
    api.automationTargetLine(harness.wizard(), (harness.wizard().targets as unknown[])[0]),
    '<strong>Salon lambası</strong> <span class="automation-pill act-level">Parlaklık %40</span>'
  );

  // Özet ekranındaki cümle ve kural kartındaki satır aynı eylemi okunur anlatır.
  assert.equal(
    api.automationWizardSentence(harness.wizard()),
    "Koridor sensörü hareket algılayınca Salon lambası parlaklığı %40 olacak."
  );
  assert.equal(
    api.automationCardLine(
      { type: "deviceState", deviceId: "0x0033", property: "occupancy", equals: true },
      { type: "device", deviceId: "0x0011", property: "color", value: "#3f9dff" }
    ),
    "Koridor sensörü hareket algılayınca → Salon lambası rengi #3f9dff olur"
  );

  // Işık sıcaklığı yüzdeyi sıcak↔soğuk anlamıyla birlikte okur.
  assert.equal(
    api.automationValueText({ kind: "temperature", min: 153, max: 500 }, 500),
    "%100 sıcak"
  );
  assert.equal(
    api.automationValueText({ kind: "temperature", min: 153, max: 500 }, 153),
    "%0 soğuk"
  );
});

// ————— "tetikleyeni izle": sabit değerin yanındaki canlı takip seçeneği. Yalnız değeri her
// değiştiğinde bildiren bir tetikleyici seçilmişken görünür.
const openFollowAction = (harness: WizardHarness, token: string, targetId = "0x0011"): void => {
  harness.api.openAutomationWizard(null);
  harness.api.chooseAutomationPath("rule");
  harness.api.chooseAutomationTrigger("sensor");
  harness.api.chooseAutomationTriggerDevice("0x0044");
  harness.api.chooseAutomationEvent(token);
  harness.api.chooseAutomationTargetDevice(targetId);
};

test("izleme seçeneği yalnız uygun tetikleyicide ve aynı tür kanalda çıkar", async () => {
  const harness = await automationValueHarness();

  // Değer kanalı için "… değişince" satırı tetikleyici listesinde durur.
  openFollowAction(harness, "brightness=null");
  // Sabit değer yolu aynen kalır; izleme onun yanında bir seçenektir.
  assert.match(harness.body(), /data-automation-value="0x0011\|main:brightness"/);
  assert.match(harness.body(), /data-automation-follow="0x0011\|main:brightness"/);
  // Aynı tür değil: parlaklık ışık sıcaklığını ya da rengi "aynı oranda" sürüklemez.
  assert.doesNotMatch(harness.body(), /data-automation-follow="0x0011\|main:temperature"/);
  assert.doesNotMatch(harness.body(), /data-automation-follow="0x0011\|main:color"/);

  // Renk tetikleyicisinde yalnız renk hedefi izlenir.
  const colored = await automationValueHarness();
  openFollowAction(colored, "color=null");
  assert.match(colored.body(), /data-automation-follow="0x0011\|main:color"/);
  assert.doesNotMatch(colored.body(), /data-automation-follow="0x0011\|main:brightness"/);

  // Hareket algılayan tetikleyicinin izlenecek bir değeri yok.
  const motion = await automationValueHarness();
  openValueAction(motion, "0x0011");
  assert.doesNotMatch(motion.body(), /data-automation-follow=/);

  // Eşik tetikleyicisi yalnız eşiği geçerken bir kez ateşler: izleme sunulmaz.
  const threshold = await automationValueHarness();
  openFollowAction(threshold, "num:brightness");
  assert.doesNotMatch(threshold.body(), /data-automation-follow=/);

  // §8.2 — tetikleyen kanalın kendisi hedef olarak hiç listelenmez.
  const same = await automationValueHarness();
  openFollowAction(same, "brightness=null", "0x0044");
  assert.doesNotMatch(same.body(), /data-automation-(value|follow)="0x0044\|main:brightness"/);
});

test("izleme seçilince kural izleme kipiyle kaydedilir", async () => {
  const harness = await automationValueHarness();
  const { api } = harness;

  openFollowAction(harness, "brightness=null");
  api.chooseAutomationFollow("0x0011|main:brightness");
  await api.saveAutomationWizard();
  const saved = harness.saved()[0] as {
    id: string; triggers: unknown[]; actions: Record<string, unknown>[];
  };
  // Tetikleyici hedefsizdir: değer her değiştiğinde çalışır.
  assert.deepEqual(saved.triggers, [{ type: "deviceState", deviceId: "0x0044", property: "brightness" }]);
  assert.deepEqual(saved.actions, [{
    type: "device", deviceId: "0x0011", property: "brightness", controlId: "main:brightness",
    // Sabit değer yedek olarak kalır; motor tetikleyeni çözemezse buna düşer.
    value: 128, follow: { mode: "ratio" }
  }]);

  // Kayıt düzenlemeye açılınca kip korunur ve sayaç açılmaz: ayarlanacak bir değer yok.
  api.openAutomationWizard(saved.id);
  api.editAutomationTarget(0);
  assert.equal(harness.wizard().draftValueTarget, null);
  assert.match(harness.body(), /data-automation-follow="0x0011\|main:brightness"/);
});

test("izleme cümlesi tam şablon anahtarıdır ve tr/en paritesi tam", async () => {
  const [englishSource, turkishSource] = await Promise.all([
    readFile(englishLocaleUrl, "utf8"),
    readFile(turkishLocaleUrl, "utf8")
  ]);
  const english = JSON.parse(englishSource).translations as Record<string, string>;
  const turkish = JSON.parse(turkishSource).translations as Record<string, string>;
  const keys = [
    "automationChangeRow", "automationFollowRatio", "automationFollowColor", "automationFollowHint",
    "automationPillFollowRatio", "automationPillFollowColor",
    "automationWillFollowRatio", "automationWillFollowColor",
    "automationFollowsRatio", "automationFollowsColor"
  ];
  for (const key of keys) {
    assert.equal(typeof turkish[key], "string", `tr eksik: ${key}`);
    assert.equal(typeof english[key], "string", `en eksik: ${key}`);
  }

  const harness = await automationValueHarness(turkish);
  const { api } = harness;
  openFollowAction(harness, "brightness=null");
  // Seçenek ev dilinde konuşur; "izleme kipi" gibi teknik bir sözlük yok.
  assert.match(harness.body(), />Aynı oranda</);
  assert.match(harness.body(), /Bahçe anahtarı ne kadar değişirse bu da o kadar değişir\./);
  api.chooseAutomationFollow("0x0011|main:brightness");
  assert.equal(
    api.automationTargetLine(harness.wizard(), (harness.wizard().targets as unknown[])[0]),
    '<strong>Salon lambası</strong> <span class="automation-pill act-followRatio">Aynı oranda değişecek</span>'
  );
  assert.equal(
    api.automationWizardSentence(harness.wizard()),
    "Bahçe anahtarı Parlaklık değişince Salon lambası aynı oranda değişecek."
  );
  assert.equal(
    api.automationCardLine(
      { type: "deviceState", deviceId: "0x0044", property: "color" },
      { type: "device", deviceId: "0x0011", property: "color", value: "#ffffff", follow: { mode: "copy" } }
    ),
    "Bahçe anahtarı Renk değişince → Salon lambası aynı renge döner"
  );
});

test("ajanın yazdığı kural panelde ayırt edilir ve yönetici son yedeğe dönebilir", async () => {
  const dashboard = await readDashboardBundle();

  // Kartta küçük bir işaret: renk tek başına yeterli değil, simge ve metin de var.
  assert.match(dashboard, /automation-card-chip agent" title="\$\{esc\(title\)\}"><span aria-hidden="true">🤖<\/span> \$\{esc\(t\("automationAgentChip"\)\)\}/);
  assert.match(dashboard, /\$\{automationRunChip\(automation\)\}\$\{automationAgentChip\(automation\)\}/);
  // İşaretin ipucu kimin ne zaman yazdığını söyler; ham token panelde hiç görünmez.
  assert.match(dashboard, /t\("automationAgentChipTitle",\{name:esc\(agent\.tokenName\|\|""\),time:ago\(agent\.at\)\}\)/);
  // Panel damganın yalnız iki gizli olmayan alanını okur; başka bir `agent.*` alanına bakmaz.
  assert.deepEqual(
    [...new Set([...dashboard.matchAll(/\bagent\.([A-Za-z]+)/g)].map((match) => match[1]))].sort(),
    ["at", "tokenName"]
  );

  // Geri alma yolu: yalnız yedek varken görünen bir şerit, otomasyon ekranının başında.
  assert.match(dashboard, /<div id="automationAgentBar" class="automation-agent-bar" hidden>[\s\S]*?<button id="revertAgentAutomations" class="secondary" type="button" data-i18n="automationAgentRevert">/);
  assert.match(dashboard, /id="automationAgentBar"[\s\S]*?<div id="automationList" class="automation-list">/);
  assert.match(dashboard, /bar\.hidden=count<1;/);
  assert.match(dashboard, /api\("\/api\/automations\/agent-revert",\{method:"POST"\}\)/);
  assert.match(dashboard, /\$\("#revertAgentAutomations"\)\.onclick=revertAgentAutomations;/);
  // Ekran zaten yönetici ekranı: geri alma da orada durur, ayrı bir rol denetimi icat edilmez.
  assert.match(dashboard, /<section id="automations" class="view" data-admin-only>/);

  // Şerit iki temada da ayakta: sabit renk yok, `color-mix()` yok.
  assert.match(dashboard, /\.automation-card-chip\.agent\{margin-left:6px;color:var\(--forest\);background:var\(--forest-soft\)\}/);
  assert.match(dashboard, /\.automation-agent-bar\{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:12px 16px;border:1px solid var\(--line\);border-radius:18px;background:var\(--surface\)/);
  assert.doesNotMatch(dashboard, /\.automation-agent-bar[^}]*color-mix\(/);

  assert.match(dashboard, /automationAgentChip:"Assistant"/);
  assert.match(dashboard, /automationAgentChip:"Asistan"/);
  assert.match(dashboard, /automationAgentRevert:"Undo assistant change"/);
  assert.match(dashboard, /automationAgentRevert:"Asistan değişikliğini geri al"/);

  const scripts = await panelScripts();
  assert.doesNotThrow(() => new Function(scripts));
});
