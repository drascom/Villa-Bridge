import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);

const readDashboard = (): Promise<string> => readFile(dashboardUrl, "utf8");

/*
 * Gönderilen kodun kendisi sınanıyor: `deviceDetailBodyHtml` bildirimi `public/index.html` içinden
 * çıkarılıp sahte bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. Panel tek dosya ve
 * derlenmiyor, bu yüzden bildirimin sonu bir sonraki iki boşluk girintili üst seviye bildirimden
 * (ya da yorumdan) bulunur.
 */
function extractDeclaration(source: string, name: string): string {
  const opener = new RegExp(`^  (?:const|function|async function) ${name}\\b`, "m");
  const match = opener.exec(source);
  assert.ok(match, `${name} bildirimi bulunamadı`);
  const bodyStart = match.index + match[0].length;
  const next = /^  (?:\/\*|\/\/|const |let |function |async function )/m.exec(source.slice(bodyStart));
  const end = next ? bodyStart + next.index : source.length;
  return source.slice(match.index, end).trimEnd();
}

interface DetailControl {
  id: string;
}

interface DetailDevice {
  id: string;
  name: string;
  sourceName: string;
  model: string | null;
  controls: DetailControl[];
  state: Record<string, unknown>;
  otaSupported?: boolean;
}

const panelMarkup = '<div class="light-panel" data-light-panel="lamp"><div class="light-readout"></div><div class="light-column"></div><div class="light-actions"></div></div>';

async function loadDetailBody(): Promise<(device: DetailDevice, light: boolean) => string> {
  const dashboard = await readDashboard();
  const declaration = extractDeclaration(dashboard, "deviceDetailBodyHtml");
  const factory = new Function(
    "deps",
    `const {esc,t,facts,deviceDetailPhoto,deviceRoleRowsHtml,lightPanelCoveredControls,controlHtml,` +
      `deviceButtonsHtml,lightPanelHtml,deviceNeedsName,deviceRoomsHtml,deviceVisibilityHtml,` +
      `deviceSelfHealHtml,rawLinkQuality,state}=deps;\n${declaration}\nreturn deviceDetailBodyHtml;`
  ) as (deps: Record<string, unknown>) => (device: DetailDevice) => string;
  return (device, light) =>
    factory({
      esc: (value: unknown) => String(value ?? ""),
      t: (key: string) => key,
      facts: () => [],
      deviceDetailPhoto: () => "<!--photo-->",
      deviceRoleRowsHtml: () => "<!--roles-->",
      lightPanelCoveredControls: () => new Set(),
      controlHtml: (_device: DetailDevice, control: DetailControl) => `<div class="control" data-row="${control.id}"></div>`,
      deviceButtonsHtml: () => "",
      lightPanelHtml: () => (light ? panelMarkup : ""),
      // Adı verilmiş cihazda kurtarma şeridi çizilmez; testler ikisini de dener.
      deviceNeedsName: (candidate: DetailDevice) => !candidate.name || candidate.name === candidate.id,
      deviceRoomsHtml: () => "",
      deviceVisibilityHtml: () => "",
      deviceSelfHealHtml: () => "",
      rawLinkQuality: () => null,
      state: { detailTechnicalOpen: false, detailFromPairing: false }
    })(device);
}

const lightDevice = (overrides: Partial<DetailDevice> = {}): DetailDevice => ({
  id: "0x00124b0022334455",
  name: "Salon lambası",
  sourceName: "zigbee",
  model: "TRADFRI bulb",
  controls: [{ id: "main:effect" }, { id: "main:do_not_disturb" }],
  state: {},
  ...overrides
});

test("büyük kumanda ayar satırlarının sütununda, sütunun ilk öğesi olarak çizilir", async () => {
  const render = await loadDetailBody();
  const html = render(lightDevice(), true);

  // Kumanda sütunun açılışından hemen sonra gelir: satırların (`.controls`) üstünde, aynı akışta.
  assert.ok(html.includes(`<div class="device-detail-controls">${panelMarkup}<div class="controls">`), html.slice(0, 400));
  const columnIndex = html.indexOf('<div class="device-detail-controls">');
  const panelIndex = html.indexOf('class="light-panel"');
  const rowsIndex = html.indexOf('<div class="controls">');
  const firstRowIndex = html.indexOf('data-row="main:effect"');
  assert.ok(columnIndex < panelIndex && panelIndex < rowsIndex && rowsIndex < firstRowIndex);

  // Sol sütun (görsel + gerçekler + roller) yerinde ve kumandayı içermiyor.
  const mediaIndex = html.indexOf('<div class="device-detail-media">');
  assert.ok(mediaIndex > rowsIndex);
  assert.ok(html.slice(mediaIndex).includes("<!--photo-->"));
  assert.ok(!html.slice(mediaIndex).includes("light-panel"));
});

test("kumanda artık pencerenin üstünde tam genişlikte tek başına durmuyor", async () => {
  const render = await loadDetailBody();
  const html = render(lightDevice(), true);

  // Düzen bloğu kumandadan ÖNCE açılıyor: kumanda ondan önce gelen bağımsız bir blok değil.
  const layoutIndex = html.indexOf('<div class="device-detail-layout">');
  assert.ok(layoutIndex >= 0);
  assert.ok(html.indexOf('class="light-panel"') > layoutIndex);
  assert.equal(html.split('class="light-panel"').length - 1, 1);
  assert.ok(!html.startsWith('<div class="light-panel"'));
});

test("kurulum kurtarma şeridi pencerenin en üstünde, kumandanın da düzenin de üstünde kalır", async () => {
  const render = await loadDetailBody();
  const html = render(lightDevice({ name: "0x00124b0022334455" }), true);

  assert.ok(html.startsWith('<div class="device-setup-recovery">'));
  const recoveryIndex = html.indexOf("device-setup-recovery");
  assert.ok(recoveryIndex < html.indexOf('<div class="device-detail-layout">'));
  assert.ok(recoveryIndex < html.indexOf('class="light-panel"'));

  // Adı verilmiş cihazda şerit hiç çizilmez; düzen doğrudan açılır.
  const named = render(lightDevice(), true);
  assert.ok(!named.includes("device-setup-recovery"));
  assert.ok(named.startsWith('<div class="device-detail-layout">'));
});

test("ışık olmayan cihazda detay düzeni değişmez", async () => {
  const render = await loadDetailBody();
  const html = render(lightDevice({ controls: [{ id: "main:state" }] }), false);

  assert.ok(!html.includes("light-panel"));
  // Sütun eskisi gibi doğrudan satır listesiyle açılır; araya hiçbir şey girmez.
  assert.ok(html.includes('<div class="device-detail-controls"><div class="controls"><div class="control" data-row="main:state">'));
  assert.ok(html.includes('<div class="device-detail-media">'));
});

test("kumanda hiç kontrolü olmayan ışıkta boş-durum metnini bastırmaya devam eder", async () => {
  const render = await loadDetailBody();
  const withPanel = render(lightDevice({ controls: [] }), true);
  const withoutPanel = render(lightDevice({ controls: [] }), false);

  assert.ok(!withPanel.includes("noExposedControls"));
  assert.ok(withoutPanel.includes("noExposedControls"));
});

test("dar sütunda kumandanın ölçüleri clamp ile tabanlanır, sabit px yok", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /\.device-detail-controls>\.light-panel\{margin:0 0 clamp\(12px,2vh,18px\)\}/);
  assert.match(
    dashboard,
    /\.device-detail-controls \.light-column\{width:clamp\(88px,12vw,120px\);height:clamp\(132px,26vh,200px\)\}/
  );
  // Dokunma hedefi tabanı 44px'in çok üstünde; kip düğmeleri ve hazır renkler 44×44 kalır.
  assert.match(dashboard, /\.light-mode\{min-width:44px;min-height:44px/);
  assert.match(dashboard, /\.light-preset\{min-width:44px;min-height:44px/);
  assert.ok(!/\.device-detail-controls[^{]*\{[^}]*color-mix\(/.test(dashboard));
});
