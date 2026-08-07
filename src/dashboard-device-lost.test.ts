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

interface LostRun {
  state: Record<string, unknown>;
  elements: Record<string, { open: boolean; textContent: string; hidden: boolean }>;
  closed: string[];
  pairingStarts: number;
  renders: number;
}

async function runFlow(script: string, initialState: Record<string, unknown>): Promise<LostRun> {
  const source = await readDashboard();
  const result: LostRun = {
    state: { departures: [], deviceLost: null, devices: [], ...initialState },
    elements: {},
    closed: [],
    pairingStarts: 0,
    renders: 0
  };
  const factory = new Function(
    "result",
    `
    const state=result.state;
    const $=selector=>{
      if(!result.elements[selector])result.elements[selector]={open:false,textContent:"",hidden:false,className:""};
      const element=result.elements[selector];
      element.close=()=>{element.open=false;result.closed.push(selector)};
      element.showModal=()=>{element.open=true};
      return element;
    };
    const t=key=>key;
    const render=()=>{result.renders+=1};
    const startPairing=()=>{result.pairingStarts+=1};
    ${extractFunction(source, "setupFlowDeviceId")}
    ${extractFunction(source, "deviceGoneCode")}
    ${extractFunction(source, "renderDeviceLost")}
    ${extractFunction(source, "openDeviceLost")}
    ${extractFunction(source, "closeDeviceLost")}
    ${extractFunction(source, "retryDeviceLost")}
    ${extractFunction(source, "watchSetupFlowDevice")}
    ${extractFunction(source, "renderPairingProgress")}
    return (async()=>{ ${script} })();
    `
  ) as (run: LostRun) => Promise<void>;
  await factory(result);
  return result;
}

test("kurulum akışı açıkken cihaz listeden düşerse sebep hemen söylenir", async () => {
  const run = await runFlow("watchSetupFlowDevice();", {
    editing: { id: "0xabc", channel: null, afterPairing: true },
    devices: [{ id: "0xother" }],
    departures: [{ id: "0xabc", reason: "left", at: Date.now() }]
  });

  assert.deepEqual(run.state.deviceLost, { id: "0xabc", code: "DEVICE_LEFT" });
  assert.equal(run.elements["#deviceLostDialog"].open, true);
  assert.equal(run.elements["#deviceLostTitle"].textContent, "deviceLostTitle");
  assert.equal(run.elements["#deviceLostLead"].textContent, "deviceLostLead");
  // Akış kilitlenmez: yarım kalan her adım kapanır, bekleyen düzenleme durumu bırakılmaz.
  assert.equal(run.state.editing, null);
  assert.equal(run.state.imageEditing, null);
  assert.equal(run.state.roleEditing, null);
  assert.equal(run.state.roomEditing, null);
  assert.equal(run.state.pairingSession, null);
});

test("az önce silinen cihaz için kaldırılma metni gösterilir", async () => {
  const run = await runFlow("watchSetupFlowDevice();", {
    roleEditing: { id: "0xabc", afterPairing: true },
    devices: [],
    departures: [{ id: "0xabc", reason: "removed", at: Date.now() }]
  });

  assert.equal((run.state.deviceLost as { code: string }).code, "DEVICE_REMOVED");
  assert.equal(run.elements["#deviceLostTitle"].textContent, "deviceRemovedTitle");
  assert.equal(run.elements["#deviceLostLead"].textContent, "deviceRemovedLead");
});

test("cihaz yerinde durduğu sürece kurulum akışı rahatsız edilmez", async () => {
  const run = await runFlow("watchSetupFlowDevice();", {
    imageEditing: { id: "0xabc", afterPairing: true },
    devices: [{ id: "0xabc" }]
  });

  assert.equal(run.state.deviceLost, null);
  assert.equal(run.elements["#deviceLostDialog"]?.open, undefined);
});

test("kurulum akışı kapalıyken listeden düşen cihaz uyarı çıkarmaz", async () => {
  const run = await runFlow("watchSetupFlowDevice();", {
    editing: { id: "0xabc", channel: null, afterPairing: false },
    devices: [],
    departures: [{ id: "0xabc", reason: "left", at: Date.now() }]
  });

  assert.equal(run.state.deviceLost, null);
});

test("kullanıcı ya baştan deneyebilir ya kapatabilir", async () => {
  const closed = await runFlow("openDeviceLost('0xabc','DEVICE_LEFT');closeDeviceLost();", {});
  assert.equal(closed.state.deviceLost, null);
  assert.equal(closed.elements["#deviceLostDialog"].open, false);
  assert.equal(closed.pairingStarts, 0);

  const retried = await runFlow("openDeviceLost('0xabc','DEVICE_LEFT');retryDeviceLost();", {});
  assert.equal(retried.state.deviceLost, null);
  assert.equal(retried.elements["#deviceLostDialog"].open, false);
  assert.equal(retried.pairingStarts, 1);
});

test("sunucunun makine kodu panelin akış kesici koduna çevrilir", async () => {
  const run = await runFlow(
    `result.state.codes=[
      deviceGoneCode({code:"DEVICE_LEFT"}),
      deviceGoneCode({code:"DEVICE_REMOVED"}),
      deviceGoneCode({code:"DEVICE_UNKNOWN"}),
      deviceGoneCode(new Error("boom"))
    ];`,
    {}
  );

  assert.deepEqual(run.state.codes, ["DEVICE_LEFT", "DEVICE_REMOVED", null, null]);
});

test("az önce kaldırılan cihaz yeniden eşleşmeye başlarsa eşleştirme ekranı uyarır", async () => {
  const warned = await runFlow("renderPairingProgress();", {
    pairingSession: { foundId: "0xabc", phase: "found", hidden: false, completing: false, reconnected: false },
    pairing: { open: true, device: { id: "0xabc", name: "Salon" } },
    devices: [{ id: "0xabc", name: "Salon" }],
    departures: [{ id: "0xabc", reason: "removed", at: Date.now() }]
  });

  assert.equal(warned.elements["#pairingWarning"].hidden, false);
  assert.equal(warned.elements["#pairingWarning"].textContent, "pairingRemovedWarning");

  const quiet = await runFlow("renderPairingProgress();", {
    pairingSession: { foundId: "0xabc", phase: "found", hidden: false, completing: false, reconnected: false },
    pairing: { open: true, device: { id: "0xabc", name: "Salon" } },
    devices: [{ id: "0xabc", name: "Salon" }],
    departures: [{ id: "0xother", reason: "removed", at: Date.now() }]
  });

  assert.equal(quiet.elements["#pairingWarning"].hidden, true);
});

test("kayıp cihaz metinleri iki dilde de var ve panel sunucunun kodlarını okuyor", async () => {
  const [dashboard, english, turkish] = await Promise.all([
    readDashboard(),
    readCatalog(englishLocaleUrl),
    readCatalog(turkishLocaleUrl)
  ]);

  for (const key of [
    "deviceLostTitle",
    "deviceLostLead",
    "deviceRemovedTitle",
    "deviceRemovedLead",
    "retrySetup",
    "pairingRemovedWarning"
  ]) {
    assert.equal(typeof english[key], "string", `${key} en.json'da yok`);
    assert.equal(typeof turkish[key], "string", `${key} tr.json'da yok`);
  }

  // Ev halkının dili: teknik terim ya da makine kodu metne sızmamalı.
  for (const catalog of [english, turkish]) {
    for (const key of ["deviceLostLead", "deviceRemovedLead", "pairingRemovedWarning"]) {
      assert.doesNotMatch(catalog[key], /IEEE|Zigbee|404|DEVICE_/);
    }
  }

  assert.match(dashboard, /id="deviceLostDialog"/);
  assert.match(dashboard, /id="pairingWarning"/);
  // Yanıt gövdesindeki makine kodu hatanın üstünde taşınmalı, yoksa panel sebebi ayırt edemez.
  assert.match(dashboard, /failure\.code=data\.code/);
  assert.match(dashboard, /watchSetupFlowDevice\(\)/);
});
