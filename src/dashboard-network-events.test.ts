import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readPanelSource } from "./panel-source.js";

const localeUrls = {
  en: new URL("../public/locales/en.json", import.meta.url),
  tr: new URL("../public/locales/tr.json", import.meta.url)
};

/* Gönderilen kodun kendisi sınanıyor: ilgili parça panel kaynağından çıkarılıp sahte
   bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. */
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

/** Tek satırlık üst düzey bildirimler (sabit eşlemeler, küçük yardımcılar). */
function extractLine(source: string, name: string): string {
  const start = source.indexOf(`const ${name}=`);
  assert.notEqual(start, -1, `${name} bulunamadı`);
  const end = source.indexOf("\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

interface RenderRun {
  state: Record<string, unknown>;
  elements: Record<string, { textContent: string; innerHTML: string }>;
}

async function renderEvents(events: unknown[]): Promise<RenderRun> {
  const source = await readPanelSource();
  const result: RenderRun = {
    state: { debugNetworkEvents: events, language: "tr" },
    elements: {}
  };
  const factory = new Function(
    "result",
    `
    const state=result.state;
    const $=selector=>{
      if(!result.elements[selector])result.elements[selector]={textContent:"",innerHTML:""};
      return result.elements[selector];
    };
    const t=(key,values)=>values?key+":"+JSON.stringify(values):key;
    const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    const ago=iso=>"ago("+iso+")";
    ${extractLine(source, "debugNetworkReasonKeys")}
    ${extractLine(source, "debugNetworkFullTime")}
    ${extractFunction(source, "renderDebugNetworkEvents")}
    renderDebugNetworkEvents();
    `
  ) as (run: RenderRun) => void;
  factory(result);
  return result;
}

test("ağ olayları listesi en yeni üstte, sebep ve kimlikle çizilir", async () => {
  const run = await renderEvents([
    { at: "2026-08-05T21:10:00.000Z", id: "0xaaa", name: "Salon Lamba", reason: "left" },
    { at: "2026-08-05T23:40:00.000Z", id: "0xbbb", reason: "removed" },
    { at: "2026-08-05T22:05:00.000Z", id: "0xaaa", name: "Salon Lamba", reason: "joined" }
  ]);
  const html = run.elements["#debugNetworkList"]?.innerHTML ?? "";

  assert.deepEqual(
    [...html.matchAll(/data-network-reason="([a-z]+)"/g)].map((match) => match[1]),
    ["removed", "joined", "left"]
  );
  assert.equal(run.elements["#debugNetworkTitle"]?.textContent, 'deviceNetworkEvents:{"count":3}');
  // İsmi olmayan cihaz UID ile anılır; her satırda değişmez kimlik de yazılı kalır.
  assert.match(html, /<strong>0xbbb<\/strong>/);
  assert.match(html, /<strong>Salon Lamba<\/strong>/);
  assert.match(html, /deviceEventJoined · 0xaaa/);
  assert.match(html, /deviceEventRemoved · 0xbbb/);
  assert.match(html, /deviceEventLeft · 0xaaa/);
  // Göreli zaman görünür, tam zaman `title` içinde durur.
  assert.match(html, /<time datetime="2026-08-05T23:40:00\.000Z" title="[^"]+">ago\(2026-08-05T23:40:00\.000Z\)<\/time>/);
});

test("hiç kayıt yokken liste sessiz kalmaz", async () => {
  const run = await renderEvents([]);

  assert.equal(
    run.elements["#debugNetworkList"]?.innerHTML,
    '<div class="debug-empty">noDeviceNetworkEvents</div>'
  );
  assert.equal(run.elements["#debugNetworkTitle"]?.textContent, 'deviceNetworkEvents:{"count":0}');
});

test("ağ olayları hata ayıklama kartında, kendi listesinde durur", async () => {
  const panel = await readPanelSource();

  assert.match(panel, /<div class="debug-log-panel debug-network-panel">/);
  assert.match(panel, /<strong id="debugNetworkTitle">/);
  assert.match(panel, /<div id="debugNetworkList" class="debug-network-list"><\/div>/);
  assert.match(panel, /\$\("#refreshDebugNetworkEvents"\)\.onclick=loadDebugNetworkEvents;/);
  assert.match(panel, /await api\("\/api\/debug\/network-events"\)/);
  // Kayıt sunucuda hep tutulur; liste hata ayıklama anahtarına bağlı değildir.
  assert.doesNotMatch(panel, /debugNetworkList[^]{0,200}hidden/);
  // Ölçüler ekranla ölçeklenir: yeni kuralda kenarlık dışında sabit px yok.
  assert.match(panel, /\.debug-network-row\{[^}]*padding:clamp\([^)]*\) clamp\([^)]*\)/);
  assert.match(panel, /\.debug-network-row strong\{[^}]*font-size:clamp\(/);
  assert.doesNotMatch(panel, /color-mix\(/);
});

test("ağ olayı metinleri iki dilde de tanımlı", async () => {
  const keys = [
    "deviceNetworkEvents",
    "deviceNetworkEventsLead",
    "noDeviceNetworkEvents",
    "deviceEventJoined",
    "deviceEventLeft",
    "deviceEventRemoved"
  ];
  for (const url of Object.values(localeUrls)) {
    const catalog = JSON.parse(await readFile(url, "utf8")).translations as Record<string, string>;
    for (const key of keys) assert.equal(typeof catalog[key], "string", `${url.pathname}: ${key}`);
  }
});
