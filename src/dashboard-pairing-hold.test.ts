import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);

const readDashboard = (): Promise<string> => readFile(dashboardUrl, "utf8");

/* Gönderilen kodun kendisi sınanıyor: ilgili işlev `public/index.html` içinden çıkarılıp
   sahte bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. */
function extractFunction(source: string, name: string): string {
  const found = source.indexOf(`function ${name}(`);
  assert.notEqual(found, -1, `${name} bulunamadı`);
  // `async` anahtar sözcüğü gövdeyle birlikte taşınmalı, yoksa içindeki `await` sözdizimi hatası olur.
  const start = source.slice(found - 6, found) === "async " ? found - 6 : found;
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

function extractHold(source: string): string {
  const match = source.match(/const pairingNetworkHoldMs=\d+;/);
  assert.ok(match, "pairingNetworkHoldMs sabiti bulunamadı");
  return match[0];
}

interface HoldRun {
  state: Record<string, any>;
  calls: string[];
  timers: { delay: number; run: () => void; cancelled: boolean }[];
  elapsed: number;
  advance: (ms: number) => Promise<void>;
  hold: number;
}

async function runFlow(script: string, initialState: Record<string, unknown> = {}): Promise<HoldRun> {
  const source = await readDashboard();
  const holdMatch = extractHold(source).match(/\d+/);
  const result: HoldRun = {
    state: { devices: [], pairing: null, pairingSession: null, pairingNetworkClose: null, overviewLoaded: true, ...initialState },
    calls: [],
    timers: [],
    elapsed: 0,
    hold: Number(holdMatch?.[0]),
    advance: async () => {}
  };
  // Sahte saat: bekleyen kapatmanın gerçekten geciktiğini görebilmek için zamanı biz ilerletiyoruz.
  result.advance = async (ms: number) => {
    result.elapsed += ms;
    for (const timer of result.timers) {
      if (!timer.cancelled && timer.delay <= result.elapsed) {
        timer.cancelled = true;
        timer.run();
      }
    }
    await Promise.resolve();
    await Promise.resolve();
  };
  const factory = new Function(
    "result",
    `
    const state=result.state;
    const $=selector=>({open:false,value:"",close(){this.open=false},showModal(){this.open=true},textContent:"",hidden:false,className:""});
    const t=key=>key;
    const render=()=>{};
    const renderPairingProgress=()=>{};
    const showToast=()=>{};
    const openPairingName=()=>{result.calls.push("openPairingName")};
    const refresh=async()=>{result.calls.push("refresh")};
    const api=async path=>{result.calls.push(path);return{pairing:{open:true}}};
    const setTimeout=(fn,delay)=>{
      const timer={delay:result.elapsed+delay,run:()=>{void fn()},cancelled:false};
      result.timers.push(timer);
      return timer;
    };
    const clearTimeout=timer=>{if(timer)timer.cancelled=true};
    ${extractHold(source)}
    ${extractFunction(source, "setupFlowDeviceId")}
    ${extractFunction(source, "returnedPairingDevice")}
    ${extractFunction(source, "trackPairingProgress")}
    ${extractFunction(source, "schedulePairingNetworkClose")}
    ${extractFunction(source, "cancelPairingNetworkClose")}
    ${extractFunction(source, "closePairingNetworkIfIdle")}
    ${extractFunction(source, "startPairing")}
    return (async()=>{ ${script} })();
    `
  ) as (run: HoldRun) => Promise<void>;
  await factory(result);
  return result;
}

const stopCalls = (run: HoldRun): number => run.calls.filter(call => call === "/api/pairing/stop").length;

test("ağ interview biter bitmez kapatılmaz, en az bir dakika açık kalır", async () => {
  const run = await runFlow("trackPairingProgress();", {
    pairingSession: { foundId: null, phase: "searching", hidden: false, completing: false, reconnected: false },
    pairing: { open: true, device: { id: "0xa4c138462c230400", interviewCompleted: true } }
  });

  assert.equal(run.state.pairingSession.phase, "ready");
  // Interview bittiği an ağ kapatılmıyor: eski davranış cihazı düşürüyordu.
  assert.equal(stopCalls(run), 0);
  assert.ok(run.hold >= 60000, "bekleme en az 60 saniye olmalı");

  // Panel akışı bugünkü gibi: diyalog kapanır, kurulum adımı açılır — ağ hâlâ açık.
  await run.advance(1200);
  assert.ok(run.calls.includes("openPairingName"));
  assert.equal(stopCalls(run), 0);

  await run.advance(run.hold - 1200 - 1);
  assert.equal(stopCalls(run), 0);

  await run.advance(1);
  assert.equal(stopCalls(run), 1);
  assert.deepEqual(run.state.pairing, { open: false });
  assert.equal(run.state.pairingNetworkClose, null);
});

test("arama sürerken listeye dönen cihaz akışı ilerletir, arama sonsuza sürmez", async () => {
  const run = await runFlow("trackPairingProgress();", {
    pairingSession: {
      foundId: null,
      phase: "searching",
      hidden: false,
      completing: false,
      reconnected: false,
      targetId: "0xa4c138462c230400",
      knownIds: []
    },
    // Katılım olayı yok: cihaz zaten ağdaydı, yalnız listeye geri döndü.
    pairing: { open: true },
    devices: [{ id: "0xa4c138462c230400", name: "0xa4c138462c230400" }]
  });

  assert.equal(run.state.pairingSession.phase, "ready");
  assert.equal(run.state.pairingSession.reconnected, true);
  await run.advance(1200);
  assert.ok(run.calls.includes("openPairingName"), "kurulum adımı açılmalı");

  // permit_join bekletmesi bu yolda da aynı: ağ hemen kapatılmaz.
  assert.equal(stopCalls(run), 0);
  await run.advance(run.hold);
  assert.equal(stopCalls(run), 1);
});

test("arama başlarken listede duran cihazlar bulundu sayılmaz", async () => {
  const run = await runFlow("await startPairing(true);trackPairingProgress();", {
    devices: [{ id: "0xold", name: "Salon" }]
  });

  assert.equal(run.state.pairingSession.phase, "searching");
  assert.deepEqual(run.state.pairingSession.knownIds, ["0xold"]);
  assert.equal(run.calls.includes("openPairingName"), false);
});

test("elle durdurma beklemez, ağı hemen kapatır", async () => {
  const run = await runFlow("schedulePairingNetworkClose();await startPairing(false);");

  assert.equal(stopCalls(run), 1);
  assert.equal(run.state.pairingNetworkClose, null);

  // Bekleyen kapatma askıda kalmaz: zamanlayıcı iptal edilir, ikinci bir istek gitmez.
  await run.advance(run.hold * 2);
  assert.equal(stopCalls(run), 1);
});

test("kurulum adımları sürerken kapatma ertelenir, akış bitince yapılır", async () => {
  const run = await runFlow("schedulePairingNetworkClose();", {
    editing: { id: "0xabc", channel: null, afterPairing: true }
  });

  await run.advance(run.hold * 2);
  assert.equal(stopCalls(run), 0, "isim adımı açıkken ağ kapatılmamalı");
  assert.equal(run.state.pairingNetworkClose.ready, true);
});

test("kurulum bittiğinde bekleyen kapatma çalışır", async () => {
  const run = await runFlow(
    "schedulePairingNetworkClose();result.state.closeNow=closePairingNetworkIfIdle;",
    { roleEditing: { id: "0xabc", afterPairing: true } }
  );

  await run.advance(run.hold);
  assert.equal(stopCalls(run), 0);

  run.state.editing = null;
  run.state.roleEditing = null;
  await run.state.closeNow();
  assert.equal(stopCalls(run), 1);
});

test("ikinci eşleştirme oturumu eskisinin bekleyen kapatmasından etkilenmez", async () => {
  const run = await runFlow(`
    schedulePairingNetworkClose();
    result.state.firstPending=state.pairingNetworkClose;
    result.state.startAgain=startPairing;
    result.state.scheduleAgain=schedulePairingNetworkClose;
  `);

  // İlk oturumun beklemesi yarılanmışken ikinci eşleştirme başlıyor.
  await run.advance(run.hold / 2);
  await run.state.startAgain(true);
  run.state.scheduleAgain();

  assert.notEqual(run.state.pairingNetworkClose, run.state.firstPending);
  assert.equal(run.timers[0].cancelled, true, "eski bekleyen kapatma iptal edilmeli");

  // Eski zamanlayıcının vakti gelse bile yeni oturumun ağı kapanmaz; yeni bekleme baştan sayar.
  await run.advance(run.hold / 2 + 1);
  assert.equal(stopCalls(run), 0);
  await run.advance(run.hold / 2);
  assert.equal(stopCalls(run), 1);
});

test("panel ağın kapanmasını tek yerden yönetiyor", async () => {
  const source = await readDashboard();
  // Interview bitince doğrudan kapatma çağrısı kalmamalı; kapatma ertelenmiş yoldan geçmeli.
  assert.match(source, /schedulePairingNetworkClose\(\);/);
  assert.match(source, /void closePairingNetworkIfIdle\(\);if\(signature/);
  const track = extractFunction(source, "trackPairingProgress");
  assert.doesNotMatch(track, /pairing\/stop/);
});
