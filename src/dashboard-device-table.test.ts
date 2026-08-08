import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readPanelSource } from "./panel-source.js";

const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

async function readCatalog(url: URL): Promise<Record<string, string>> {
  return JSON.parse(await readFile(url, "utf8")).translations as Record<string, string>;
}

/*
 * Gönderilen kodun kendisi sınanıyor: ilgili bildirim `public/index.html` içinden çıkarılıp sahte
 * bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. Panel tek dosya ve derlenmiyor, bu yüzden
 * bildirimin sonu bir sonraki iki boşluk girintili üst seviye bildirimden (ya da yorumdan) bulunur.
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

interface TableDevice {
  id: string;
  name: string;
  availability?: string;
  vendor?: string | null;
  model?: string | null;
  linkquality?: number;
  powerSource?: string;
  networkAddress?: number;
  lastSeen?: string | null;
  features?: string[];
  state?: Record<string, unknown>;
  image?: { model: string | null };
}

interface TableInput {
  devices: TableDevice[];
  sort: { key: string; direction: string };
  language: string;
}

/** Tabloyu paneldeki gerçek `deviceTableHtml` ile çizer; yalnız DOM/çeviri katmanı taklit edilir. */
async function renderDeviceTable(
  devices: TableDevice[],
  sort: { key: string; direction: string } = { key: "name", direction: "asc" }
): Promise<string> {
  const source = await readPanelSource();
  const declarations = [
    "esc",
    "ago",
    "batteryPercent",
    "rawLinkQuality",
    "linkQualityPercent",
    "deviceTableDash",
    "deviceTablePower",
    "deviceTableAvailability",
    "deviceSortValue",
    "sortedDeviceRows",
    "deviceTableHeader",
    "deviceTableActions",
    "deviceTableRowHtml",
    "deviceTableHtml"
  ].map((name) => extractDeclaration(source, name)).join("\n");
  const factory = new Function("input", `
    const state={language:input.language,deviceSort:input.sort};
    const t=(key,values={})=>Object.keys(values).length?key+"("+Object.values(values).join("|")+")":key;
    const renameGlyph='<svg data-glyph="rename"></svg>';
    const deviceVisualFor=(device,model)=>'<div class="device-visual" data-image-model="'+String(model)+'"></div>';
    ${declarations}
    return deviceTableHtml(input.devices);
  `) as (input: TableInput) => string;
  return factory({ devices, sort, language: "en" });
}

/** Satır sırasını ada göre okur: sıralama iddialarını HTML ayrıştırmadan doğrulamak için. */
function rowNames(html: string): string[] {
  return [...html.matchAll(/<td class="device-table-name">([^<]*)<\/td>/g)].map((match) => match[1]);
}

const fullDevice: TableDevice = {
  id: "0x00158d0001aabbcc",
  name: "Hall Light",
  availability: "online",
  vendor: "IKEA",
  model: "LED1836G9",
  linkquality: 204,
  powerSource: "Mains (single phase)",
  networkAddress: 6699,
  lastSeen: new Date(Date.now() - 12 * 60_000).toISOString(),
  features: ["state", "brightness"],
  state: { state: "ON" },
  image: { model: "LED1836G9" }
};

const bareDevice: TableDevice = {
  id: "0x00158d0002ddeeff",
  name: "Unknown Sensor",
  availability: "unknown",
  vendor: null,
  model: null,
  lastSeen: null,
  features: [],
  state: {}
};

test("liste görünümü Z2M Devices sütun düzenini aynı sırayla çizer", async () => {
  const html = await renderDeviceTable([fullDevice]);

  // Sütun sırası Z2M ile birebir: # · Görsel · Ad · UID · Üretici · Model · LQI · Durum · Güç · Eylemler.
  const headers = [...html.matchAll(/<th scope="col"[^>]*>(?:<button[^>]*>)?(?:<span>)?([^<]*)/g)]
    .map((match) => match[1].trim());
  assert.deepEqual(headers, [
    "#",
    "deviceTablePicture",
    "deviceTableName",
    "uid",
    "deviceTableVendor",
    "model",
    "LQI",
    "deviceTableStatus",
    "deviceTablePower",
    "deviceTableActions"
  ]);
  assert.match(html, /<td class="device-table-index">1<\/td>/);
  assert.match(html, /data-image-model="LED1836G9"/);
  assert.match(html, /<td class="device-table-name">Hall Light<\/td>/);
  // UID kalıcı IEEE adresidir; kısa NWK adresi modelde varsa yanına eklenir (uydurma yok).
  assert.match(html, /<td class="device-table-uid">0x00158d0001aabbcc<small>0x1a2b<\/small><\/td>/);
  assert.match(html, /<td class="device-table-text">IKEA<\/td>/);
  assert.match(html, /<td class="device-table-text">LED1836G9<\/td>/);
  assert.match(html, /<td class="device-table-lqi strong" title="signal 80%">204<\/td>/);
  assert.match(html, /<span class="device-table-state online"><span class="device-table-dot" aria-hidden="true"><\/span>online<\/span>/);
  assert.match(html, /<td class="device-table-text">powerMains<\/td>/);
});

test("satır cihaz detayını açar ve mevcut yönetici eylemlerine bağlanır", async () => {
  const html = await renderDeviceTable([fullDevice]);

  // Satırın kendisi dokunma hedefi: `data-device-card` paneldeki mevcut `bindCards` bağını kullanır.
  assert.match(html, /<tr tabindex="0" data-device-card="0x00158d0001aabbcc" data-name="hall light"/);
  // Eylemler yeni uç açmaz: var olan yeniden adlandır / yeniden yapılandır / sil uçlarına bağlanır.
  assert.match(html, /data-admin-only data-rename="0x00158d0001aabbcc"/);
  assert.match(html, /data-admin-only data-reconfigure="0x00158d0001aabbcc"/);
  assert.match(html, /class="device-table-action danger" type="button" data-admin-only data-remove="0x00158d0001aabbcc"/);
});

test("veri olmayan her hücrede tire durur, uydurma değer yok", async () => {
  const html = await renderDeviceTable([bareDevice]);

  assert.match(html, /<td class="device-table-lqi">—<\/td>/);
  assert.doesNotMatch(html, /device-table-lqi[^>]*title=/);
  // Üretici, model ve güç bilinmiyor: üçü de aynı tire işaretine düşer.
  assert.equal([...html.matchAll(/<span class="device-table-text" aria-hidden="true">—<\/span>/g)].length, 3);
  assert.match(html, /<span class="device-table-seen">deviceTableLastSeen: —<\/span>/);
  assert.match(html, /<span class="device-table-state"><span class="device-table-dot" aria-hidden="true"><\/span>availabilityUnknown<\/span>/);
  // Kısa NWK adresi modelde yoksa parantez hiç açılmaz.
  assert.match(html, /<td class="device-table-uid">0x00158d0002ddeeff<\/td>/);
});

test("son görülme Durum hücresinin altında göreli durur, tam zaman title'da", async () => {
  const html = await renderDeviceTable([fullDevice]);

  assert.match(html, /<span class="device-table-seen" title="[^"]+">minutesAgo\(12\)<\/span>/);
  // 1024×640'ta on birinci sütun sığmıyor: ayrı "son görülme" başlığı yok, ikinci satır var.
  assert.doesNotMatch(html, /<th scope="col">deviceTableLastSeen<\/th>/);
});

test("güç sütunu pil yüzdesini, şebekeyi ve pil özelliğinden türetmeyi ayırt eder", async () => {
  const html = await renderDeviceTable([
    { ...bareDevice, id: "0x1", name: "A Battery Percent", state: { battery: 62 } },
    { ...bareDevice, id: "0x2", name: "B Battery Source", powerSource: "Battery" },
    { ...bareDevice, id: "0x3", name: "C Mains", powerSource: "Mains (single phase)" },
    { ...bareDevice, id: "0x4", name: "D Derived", features: ["battery", "temperature"] }
  ]);

  assert.match(html, /<td class="device-table-text">powerBattery 62%<\/td>/);
  assert.equal([...html.matchAll(/<td class="device-table-text">powerBattery<\/td>/g)].length, 2);
  assert.match(html, /<td class="device-table-text">powerMains<\/td>/);
});

test("tablo ad, LQI, durum ve son görülmeye göre sıralanır", async () => {
  const devices: TableDevice[] = [
    { ...bareDevice, id: "0xa", name: "Bravo", availability: "offline", linkquality: 30, lastSeen: "2026-08-01T00:00:00.000Z" },
    { ...bareDevice, id: "0xb", name: "Alpha", availability: "online", linkquality: 200, lastSeen: "2026-08-05T00:00:00.000Z" },
    { ...bareDevice, id: "0xc", name: "Charlie", availability: "unknown", lastSeen: null }
  ];

  assert.deepEqual(rowNames(await renderDeviceTable(devices, { key: "name", direction: "asc" })), ["Alpha", "Bravo", "Charlie"]);
  assert.deepEqual(rowNames(await renderDeviceTable(devices, { key: "name", direction: "desc" })), ["Charlie", "Bravo", "Alpha"]);
  // LQI'si olmayan cihaz en zayıf sayılır: azalan sıralamada en sona düşer, uydurma değer almaz.
  assert.deepEqual(rowNames(await renderDeviceTable(devices, { key: "lqi", direction: "desc" })), ["Alpha", "Bravo", "Charlie"]);
  assert.deepEqual(rowNames(await renderDeviceTable(devices, { key: "status", direction: "desc" })), ["Alpha", "Charlie", "Bravo"]);
  assert.deepEqual(rowNames(await renderDeviceTable(devices, { key: "lastSeen", direction: "desc" })), ["Alpha", "Bravo", "Charlie"]);
});

test("sıralanabilir başlıklar yönü hem aria-sort hem okla bildirir", async () => {
  const dashboard = await readPanelSource();
  const html = await renderDeviceTable([fullDevice], { key: "lqi", direction: "desc" });

  assert.match(html, /<th scope="col" aria-sort="descending"><button class="device-table-sort" type="button" data-device-sort="lqi" data-sort="descending"/);
  assert.match(html, /<th scope="col" aria-sort="none"><button class="device-table-sort" type="button" data-device-sort="name" data-sort="none"/);
  assert.match(html, /data-device-sort="status"/);
  // `aria-sort` yalnızca `th` üzerinde durur; düğmede ARIA değil veri kancası vardır.
  assert.doesNotMatch(html, /<button[^>]*aria-sort=/);
  assert.match(dashboard, /\.device-table-sort\[data-sort="ascending"\] \.device-table-arrow/);
});

test("alt bilgi cihaz sayısını verir ve ayrılmış cihazın listede olmadığını söyler", async () => {
  const html = await renderDeviceTable([fullDevice, bareDevice]);

  assert.match(html, /<p class="device-table-note">deviceTableCount\(2\)<\/p>/);
  const [english, turkish] = await Promise.all([readCatalog(englishLocaleUrl), readCatalog(turkishLocaleUrl)]);
  // Sınır arayüzde yazılı: tablo o anki durumu gösterir, ayrılma geçmişi bu ekranda yok.
  assert.match(english.deviceTableCount, /current state only/);
  assert.match(turkish.deviceTableCount, /ağdan tamamen ayrılmış cihazlar bu tabloda yer almaz/);
  for (const key of [
    "deviceTablePicture",
    "deviceTableName",
    "deviceTableVendor",
    "deviceTableStatus",
    "deviceTablePower",
    "deviceTableActions",
    "deviceTableLastSeen",
    "deviceTableSort",
    "deviceTableCount",
    "powerMains",
    "powerBattery",
    "availabilityUnknown"
  ]) {
    assert.ok(english[key], `${key} İngilizce sözlükte yok`);
    assert.ok(turkish[key], `${key} Türkçe sözlükte yok`);
  }
});

interface LayoutRun {
  containers: Record<string, string>;
  tableCalls: TableDevice[][];
  cardCalls: string[];
}

/** `filterDevices`i gerçek gövdesiyle koşturur: iki kipin hangi çizimi seçtiği burada görülür. */
async function runFilterDevices(
  devices: TableDevice[],
  options: { layout: string; query?: string; roomFilter?: string | null; groups?: unknown[] }
): Promise<LayoutRun> {
  const source = await readPanelSource();
  const result: LayoutRun = { containers: {}, tableCalls: [], cardCalls: [] };
  const factory = new Function("input", "result", `
    const state={
      devices:input.devices,
      deviceLayout:input.layout,
      deviceSort:{key:"name",direction:"asc"},
      roomFilter:input.roomFilter??null,
      groups:input.groups??[],
      language:"en",
      attentionOpen:false,
      overviewLoaded:true
    };
    const elements={"#search":{value:input.query??""}};
    const $=selector=>{
      if(!elements[selector])elements[selector]={hidden:false,open:false,textContent:"",dataset:{},innerHTML:"",
        setAttribute(){},getAttribute(){return null}};
      return elements[selector];
    };
    const $$=()=>[];
    const t=key=>key;
    const esc=value=>String(value??"");
    const startPairing=()=>{};
    const setRoomFilter=()=>{};
    const setDeviceSort=()=>{};
    const captureDeviceFocus=()=>null;
    const restoreDeviceFocus=()=>{};
    const renderRoomFilter=()=>{};
    const deviceTableHtml=list=>{result.tableCalls.push(list.slice());return"<table data-fake></table>"};
    const deviceCardHtml=device=>{result.cardCalls.push(device.id);return'<article data-fake="'+device.id+'"></article>'};
    ${extractDeclaration(source, "deviceInRoom")}
    ${extractDeclaration(source, "roomFilterMatches")}
    ${extractDeclaration(source, "isAlert")}
    ${extractDeclaration(source, "hasLowBattery")}
    ${extractDeclaration(source, "deviceNeedsAttention")}
    ${extractDeclaration(source, "filterDevices")}
    filterDevices();
    result.containers["#allDevices"]=elements["#allDevices"].innerHTML;
    result.containers["#attentionDevices"]=elements["#attentionDevices"].innerHTML;
  `) as (input: unknown, run: LayoutRun) => void;
  factory({ ...options, devices }, result);
  return result;
}

const online: TableDevice = { ...bareDevice, id: "0xon", name: "Salon Lamba", availability: "online", state: {} };
const offline: TableDevice = { ...bareDevice, id: "0xoff", name: "Bahçe Sensör", availability: "offline", state: {} };

test("ızgara görünümü bugünkü kartları çizer, tabloyu çizmez", async () => {
  const run = await runFilterDevices([online, offline], { layout: "grid" });

  assert.deepEqual(run.tableCalls, []);
  // Dikkat bölümü ızgarada yerinde: çevrimdışı cihaz oraya, kalanı ana listeye gider.
  assert.deepEqual(run.cardCalls, ["0xoff", "0xon"]);
  assert.match(run.containers["#attentionDevices"], /data-fake="0xoff"/);
  assert.match(run.containers["#allDevices"], /data-fake="0xon"/);
});

test("liste görünümü tek düz tablo çizer, kart çizmez", async () => {
  const run = await runFilterDevices([online, offline], { layout: "list" });

  assert.deepEqual(run.cardCalls, []);
  assert.equal(run.tableCalls.length, 1);
  // Çevrimdışı cihaz da tabloda: ayrı "dikkat" bölümü yok, durumu kendi hücresinde okunur.
  assert.deepEqual(run.tableCalls[0].map((device) => device.id), ["0xoff", "0xon"]);
  assert.equal(run.containers["#attentionDevices"], "");
  assert.equal(run.containers["#allDevices"], "<table data-fake></table>");
});

test("arama alanı tabloyu da süzer", async () => {
  const run = await runFilterDevices([online, offline], { layout: "list", query: "bahçe" });

  assert.deepEqual(run.tableCalls[0].map((device) => device.id), ["0xoff"]);
});

test("oda çipi tabloyu da süzer", async () => {
  const run = await runFilterDevices([online, offline], {
    layout: "list",
    roomFilter: "salon",
    groups: [{ id: "salon", name: "Salon", items: [{ deviceId: "0xon" }] }]
  });

  assert.deepEqual(run.tableCalls[0].map((device) => device.id), ["0xon"]);
});

test("tablo kabı kendi içinde yatay kayar, sayfa yana kaymaz", async () => {
  const dashboard = await readPanelSource();

  assert.match(dashboard, /\.device-table-wrap\{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain/);
  assert.match(dashboard, /\.device-grid\.devices-list-view>\.device-table-panel\{width:100%;min-width:0\}/);
  // Hedef 1024×640: ölçüler viewport'a bağlı, sabit px'e çakılmıyor.
  assert.match(dashboard, /\.device-table\{width:100%;min-width:clamp\(44rem,70vw,56rem\)/);
  assert.match(dashboard, /\.device-table th,\.device-table td\{padding:clamp\(6px,\.7vw,10px\) clamp\(7px,\.75vw,12px\)/);
  assert.doesNotMatch(dashboard, /\.device-table[^{]*\{[^}]*color-mix\(/);
  // Dokunma hedefleri: satırın kendisi ve eylem düğmeleri ≥44px.
  assert.match(dashboard, /\.device-table-action\{width:44px;height:44px/);
  assert.match(dashboard, /\.device-table-sort\{min-height:44px/);
  // Koyu tema ayrı yazılır: durum ve sinyal renkleri iki temada da okunur.
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-table-lqi\.strong,:root\[data-theme="dark"\] \.device-table-state\.online\{color:#7fd8ab\}/);
  assert.match(dashboard, /:root\[data-theme="dark"\] \.device-table-lqi\.weak,:root\[data-theme="dark"\] \.device-table-state\.offline\{color:#ffc0ba\}/);
  // Görünüm değişince içerik yeniden çizilir; yalnız sınıf değiştirmek yetmez.
  assert.match(dashboard, /applyDeviceLayout\(\);\s*\/\* İki kipin içeriği farklıdır[\s\S]*?filterDevices\(\);\s*bindCards\(\);/);
  assert.match(dashboard, /localStorage\.setItem\("villa-device-sort",`\$\{key\}:\$\{direction\}`\)/);
});
