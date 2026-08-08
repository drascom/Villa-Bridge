import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readPanelSource } from "./panel-source.js";

const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

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
  state: Record<string, any>;
  elements: Record<string, { open: boolean; textContent: string; hidden: boolean }>;
  closed: string[];
  pairingStarts: number;
  pairingTargets: (string | null)[];
  setupOpens: { id: string; reconnected: boolean }[];
  renders: number;
  toasts: string[];
  /** Enjekte edilebilir saat: dönüş penceresi gerçek beklemeden ilerletilir. */
  clock: number;
  wait: number;
}

/** Dönüş penceresinin süresi panelden okunur: test kendi sayısını uydurmaz. */
function extractWaitWindow(source: string): string {
  const match = source.match(/const deviceReturnWaitMs=\d+;/);
  assert.ok(match, "deviceReturnWaitMs sabiti bulunamadı");
  return match[0];
}

async function runFlow(script: string, initialState: Record<string, unknown>): Promise<LostRun> {
  const source = await readPanelSource();
  const result: LostRun = {
    state: { departures: [], deviceLost: null, devices: [], deviceReturnWait: null, ...initialState },
    elements: {},
    closed: [],
    pairingStarts: 0,
    pairingTargets: [],
    setupOpens: [],
    renders: 0,
    toasts: [],
    clock: 1_000_000,
    wait: Number(extractWaitWindow(source).match(/\d+/)?.[0])
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
    const showToast=message=>{result.toasts.push(message)};
    const pairingNow=()=>result.clock;
    const startPairing=(open,targetId=null)=>{result.pairingStarts+=1;result.pairingTargets.push(targetId)};
    const openPairingName=(id,reconnected=false)=>{result.setupOpens.push({id,reconnected})};
    const configureNameDialog=()=>{};
    const setTimeout=()=>0;
    ${extractWaitWindow(source)}
    ${extractFunction(source, "awaitDeviceReturn")}
    ${extractFunction(source, "reportDeviceGone")}
    ${extractFunction(source, "returnedPairingDevice")}
    ${extractFunction(source, "deviceNeedsName")}
    ${extractFunction(source, "closeDeviceDetail")}
    ${extractFunction(source, "finishDeviceSetup")}
    ${extractFunction(source, "setupFlowDeviceId")}
    ${extractFunction(source, "deviceGoneCode")}
    ${extractFunction(source, "renderDeviceLost")}
    ${extractFunction(source, "openDeviceLost")}
    ${extractFunction(source, "closeDeviceLost")}
    ${extractFunction(source, "retryDeviceLost")}
    ${extractFunction(source, "watchSetupFlowDevice")}
    ${extractFunction(source, "renderPairingProgress")}
    /* Gönderilen openPairingName gövdesi, yalnız adı değiştirilerek: içeriden çağrıldığı yerlerde
       kayıt tutan sahte hâli kalsın diye. Sınanan kod aynı kod. */
    ${extractFunction(source, "openPairingName").replace("function openPairingName(", "function openPairingNameOrWait(")}
    return (async()=>{ ${script} })();
    `
  ) as (run: LostRun) => Promise<void>;
  await factory(result);
  return result;
}

test("kurulum akışı açıkken düşen cihaz önce beklenir, pencere dolunca sebep söylenir", async () => {
  const run = await runFlow(
    `watchSetupFlowDevice();
     result.state.firstPass={lost:state.deviceLost,waiting:state.deviceReturnWait};
     result.clock+=result.wait-1;watchSetupFlowDevice();
     result.state.beforeWindow=state.deviceLost;
     result.clock+=1;watchSetupFlowDevice();`,
    {
      editing: { id: "0xabc", channel: null, afterPairing: true },
      devices: [{ id: "0xother" }],
      departures: [{ id: "0xabc", reason: "left", at: Date.now() }]
    }
  );

  // İlk düşüşte diyalog yok: cihaz beklenmeye alınır ve kullanıcıya tek satırla söylenir.
  assert.equal(run.state.firstPass.lost, null);
  assert.equal(run.state.firstPass.waiting.id, "0xabc");
  assert.deepEqual(run.toasts, ["pairingDeviceWait"]);
  // Pencere dolmadan da diyalog açılmaz.
  assert.equal(run.state.beforeWindow, null);
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

/* Canlı günlükteki sıra: interview biter, cihaz 6 sn sonra düşer, 5 sn sonra kendiliğinden geri
   gelir. Sihirbaz henüz açılmamışken düşerse akış bitirilmez; cihaz dönünce isim adımı açılır. */
test("sihirbaz açılmadan düşen cihaz beklenir, geri gelince sihirbaz açılır", async () => {
  const run = await runFlow(
    `openPairingNameOrWait("0xa4c138462c230400",false);
     result.state.waiting={...state.deviceReturnWait};
     result.state.duringWait={
       dialog:$("#pairingDialog").open,
       line:$("#pairingWaitLine").hidden,
       text:$("#pairingWaitLine").textContent,
       editing:state.editing??null
     };
     result.clock+=5000;
     state.devices=[{id:"0xa4c138462c230400",name:"0xa4c138462c230400"}];
     watchSetupFlowDevice();`,
    {
      pairingSession: { foundId: "0xa4c138462c230400", phase: "ready", hidden: false, completing: true, reconnected: false },
      pairing: { open: true },
      devices: []
    }
  );

  // Bekleme eşleştirme ekranında tek satırla görünür, ekran yeniden açılır; akış kesilmez.
  assert.equal(run.state.waiting.id, "0xa4c138462c230400");
  assert.equal(run.state.waiting.resume, true);
  assert.deepEqual(run.state.duringWait, {
    dialog: true,
    line: false,
    text: "pairingDeviceWait",
    editing: null
  });
  assert.equal(run.elements["#pairingDialog"].open, false, "sihirbaz açılırken eşleştirme ekranı kapanır");

  // Cihaz döndü: akış kaldığı yerden sürer, "kayboldu" diyaloğu hiç çıkmaz.
  assert.equal(run.state.deviceLost, null);
  assert.equal(run.state.deviceReturnWait, null);
  assert.deepEqual(run.setupOpens, [{ id: "0xa4c138462c230400", reconnected: false }]);
  assert.deepEqual(run.toasts, ["pairingDeviceWait", "pairingDeviceReturned"]);
});

test("sihirbaz açılmadan düşen cihaz dönmezse pencere dolunca kayıp sayılır", async () => {
  const run = await runFlow(
    `openPairingNameOrWait("0xabc",true);
     result.clock+=result.wait;
     watchSetupFlowDevice();`,
    { pairingSession: { phase: "ready" }, devices: [] }
  );

  assert.deepEqual(run.setupOpens, []);
  assert.deepEqual(run.state.deviceLost, { id: "0xabc", code: "DEVICE_LEFT" });
  assert.equal(run.state.deviceReturnWait, null);
});

/* Sunucunun "ağdan ayrıldı" yanıtı da akışı bitirmez: aynı pencere işletilir, adım açık kalır. */
test("kaydetme sırasındaki ayrılma yanıtı da önce beklemeye alınır", async () => {
  const run = await runFlow(
    `reportDeviceGone("0xabc","DEVICE_LEFT");
     result.state.waiting={...state.deviceReturnWait};
     reportDeviceGone("0xabc","DEVICE_REMOVED");`,
    { editing: { id: "0xabc", channel: null, afterPairing: true }, devices: [] }
  );

  assert.equal(run.state.waiting.id, "0xabc");
  assert.equal(run.state.waiting.resume, false);
  // Kullanıcının kendi kaldırdığı cihaz beklenmez: o yol doğrudan diyaloğa gider.
  assert.deepEqual(run.state.deviceLost, { id: "0xabc", code: "DEVICE_REMOVED" });
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
  // Arama hedefi belli: cihaz sessizce listeye dönerse tanınabilsin.
  assert.deepEqual(retried.pairingTargets, ["0xabc"]);
  assert.deepEqual(retried.setupOpens, []);
});

test("cihaz zaten geri gelmişse tekrar dene arama açmaz, kurulumu açar", async () => {
  const run = await runFlow("openDeviceLost('0xabc','DEVICE_REMOVED');retryDeviceLost();", {
    devices: [{ id: "0xabc", name: "0xabc" }]
  });

  assert.equal(run.pairingStarts, 0, "ağda duran cihaz için arama açılmamalı");
  assert.deepEqual(run.setupOpens, [{ id: "0xabc", reconnected: true }]);
  assert.equal(run.state.deviceLost, null);
});

test("arama sırasında listeye dönen cihaz katılım olayı olmadan da bulunmuş sayılır", async () => {
  const run = await runFlow(
    `result.state.found=returnedPairingDevice(state.pairingSession);`,
    {
      pairingSession: {
        foundId: null,
        phase: "searching",
        hidden: false,
        completing: false,
        reconnected: false,
        targetId: "0xabc",
        knownIds: ["0xother"]
      },
      pairing: { open: true, device: null },
      devices: [{ id: "0xother", name: "Salon" }, { id: "0xabc", name: "0xabc" }]
    }
  );

  assert.deepEqual(run.state.found, {
    id: "0xabc",
    name: "0xabc",
    interviewCompleted: true,
    supported: null,
    reconnected: true
  });
});

test("hedefsiz aramada da listeye sonradan giren cihaz yakalanır, tanıdıklar yakalanmaz", async () => {
  const fresh = await runFlow(`result.state.found=returnedPairingDevice(state.pairingSession);`, {
    pairingSession: { phase: "searching", targetId: null, knownIds: ["0xold"] },
    devices: [{ id: "0xold", name: "Salon" }, { id: "0xnew", name: "0xnew" }]
  });
  assert.equal((fresh.state.found as { id: string }).id, "0xnew");

  const quiet = await runFlow(`result.state.found=returnedPairingDevice(state.pairingSession);`, {
    pairingSession: { phase: "searching", targetId: null, knownIds: ["0xold"] },
    devices: [{ id: "0xold", name: "Salon" }]
  });
  assert.equal(quiet.state.found, null);
});

test("geri dönen cihaz eşleştirme ekranında da adıyla görünür", async () => {
  const run = await runFlow("renderPairingProgress();", {
    pairingSession: { foundId: null, phase: "found", hidden: false, completing: false, reconnected: false, targetId: "0xabc", knownIds: [] },
    pairing: { open: true },
    devices: [{ id: "0xabc", name: "Salon" }],
    departures: []
  });

  assert.equal(run.elements["#pairingDevice"].hidden, false);
  assert.equal(run.elements["#pairingDeviceName"].textContent, "Salon");
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

test("adı hiç verilmemiş cihaz tanınır, adı olan tanınmaz", async () => {
  const run = await runFlow(
    `result.state.flags=[
      deviceNeedsName({id:"0xabc",name:"0xabc"}),
      deviceNeedsName({id:"0xabc",name:"0xA4C138462C230400"}),
      deviceNeedsName({id:"0xabc",name:"  "}),
      deviceNeedsName({id:"0xabc",name:"Salon lambası"})
    ];`,
    {}
  );

  assert.deepEqual(run.state.flags, [true, true, true, false]);
});

test("isimsiz cihaz kurulum akışına tek düğmeyle geri sokulur", async () => {
  const run = await runFlow("finishDeviceSetup('0xabc');", {
    devices: [{ id: "0xabc", name: "0xabc" }],
    detailDevice: "0xabc"
  });

  // Cihaz zaten ağda: arama açılmaz, mevcut isim/oda/rol adımları çalışır.
  assert.equal(run.pairingStarts, 0);
  assert.deepEqual(run.setupOpens, [{ id: "0xabc", reconnected: false }]);
  assert.equal(run.state.detailDevice, null);

  const missing = await runFlow("finishDeviceSetup('0xabc');", { devices: [] });
  assert.deepEqual(missing.setupOpens, []);
});

test("kurulumu tamamlama düğmesi yalnız adsız cihazda çizilir", async () => {
  const [dashboard, english, turkish] = await Promise.all([
    readPanelSource(),
    readCatalog(englishLocaleUrl),
    readCatalog(turkishLocaleUrl)
  ]);

  // Düğme ayrı bir ekran açmaz; koşulu tek ölçüye (`deviceNeedsName`) bağlı.
  assert.match(dashboard, /const setupHtml=deviceNeedsName\(device\)/);
  assert.match(dashboard, /data-finish-setup="/);
  assert.match(dashboard, /\[data-finish-setup\]/);

  for (const key of ["finishSetup", "finishSetupLead"]) {
    assert.equal(typeof english[key], "string", `${key} en.json'da yok`);
    assert.equal(typeof turkish[key], "string", `${key} tr.json'da yok`);
  }
  for (const catalog of [english, turkish]) {
    assert.doesNotMatch(catalog.finishSetupLead, /IEEE|Zigbee|UID|0x/);
  }
});

test("kayıp cihaz metinleri iki dilde de var ve panel sunucunun kodlarını okuyor", async () => {
  const [dashboard, english, turkish] = await Promise.all([
    readPanelSource(),
    readCatalog(englishLocaleUrl),
    readCatalog(turkishLocaleUrl)
  ]);

  for (const key of [
    "deviceLostTitle",
    "deviceLostLead",
    "deviceRemovedTitle",
    "deviceRemovedLead",
    "retrySetup",
    "pairingRemovedWarning",
    "pairingDeviceWait",
    "pairingDeviceReturned"
  ]) {
    assert.equal(typeof english[key], "string", `${key} en.json'da yok`);
    assert.equal(typeof turkish[key], "string", `${key} tr.json'da yok`);
  }

  // Ev halkının dili: teknik terim ya da makine kodu metne sızmamalı.
  for (const catalog of [english, turkish]) {
    for (const key of ["deviceLostLead", "deviceRemovedLead", "pairingRemovedWarning", "pairingDeviceWait", "pairingDeviceReturned"]) {
      assert.doesNotMatch(catalog[key], /IEEE|Zigbee|404|DEVICE_/);
    }
  }

  assert.match(dashboard, /id="deviceLostDialog"/);
  assert.match(dashboard, /id="pairingWarning"/);
  // Bekleme satırı eşleştirme ekranında duruyor ve panelden besleniyor.
  assert.match(dashboard, /id="pairingWaitLine" class="pairing-wait" data-i18n="pairingDeviceWait" hidden/);
  assert.match(dashboard, /\$\("#pairingWaitLine"\)\.hidden=!waiting/);
  // Yanıt gövdesindeki makine kodu hatanın üstünde taşınmalı, yoksa panel sebebi ayırt edemez.
  assert.match(dashboard, /failure\.code=data\.code/);
  assert.match(dashboard, /watchSetupFlowDevice\(\)/);
});
