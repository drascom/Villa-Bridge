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

/* Gönderilen kodun kendisi sınanıyor: işlev `public/index.html` içinden çıkarılıp sahte
   bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} bulunamadı`);
  let parens = 0;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") parens += 1;
    else if (source[index] === ")") {
      parens -= 1;
      if (parens === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} gövdesi kapanmıyor`);
}

/* Tek satırlık `const` tanımları da kaynaktan alınır: onay ekranındaki sayı gerçek süzgeçten çıkar. */
function extractConst(source: string, name: string): string {
  const start = source.indexOf(`const ${name}=`);
  assert.notEqual(start, -1, `${name} bulunamadı`);
  return source.slice(start, source.indexOf("\n", start));
}

type Dialog = { name: string; lead: string; opened: boolean; pending: unknown };

async function runConfirm(active: boolean, count: number): Promise<Dialog> {
  const source = await readDashboard();
  const run = new Function(
    "result",
    "active",
    "count",
    `
    const state={pendingGroups:new Set(),contextDevice:"eski",pendingConfirm:null};
    const entries=Array.from({length:count},(_,index)=>({
      device:{id:"0x0"+index,availability:"online"},
      control:{id:"main",property:"state",kind:"switch"}
    }));
    const dashboardGroupById=id=>id==="lights"?{id:"lights",name:"Isiklar"}:null;
    const groupControlEntries=()=>entries;
    const groupPowerControl=()=>true;
    const dashboardControlAction=()=>({active});
    const t=(key,values={})=>key+"|"+JSON.stringify(values);
    const nodes={
      "#deviceActionName":{textContent:""},
      "#deviceActionLead":{textContent:""},
      "#confirmDeviceAction":{hidden:true},
      "#showDeviceDetails":{hidden:false},
      "#deviceActionDialog":{open:false,showModal(){this.open=true}}
    };
    const $=selector=>nodes[selector];
    ${extractConst(source, "groupPowerEntries")}
    ${extractConst(source, "groupPowerActivates")}
    ${extractFunction(source, "confirmGroupPower")}
    confirmGroupPower("lights");
    confirmGroupPower("bilinmeyen");
    result.name=nodes["#deviceActionName"].textContent;
    result.lead=nodes["#deviceActionLead"].textContent;
    result.opened=nodes["#deviceActionDialog"].open;
    result.pending=state.pendingConfirm;
  `
  ) as (result: Dialog, active: boolean, count: number) => void;
  const result: Dialog = { name: "", lead: "", opened: false, pending: null };
  run(result, active, count);
  return result;
}

test("toplu güç düğmesi önce onay soruyor ve ne olacağını sayıyla söylüyor", async () => {
  const off = await runConfirm(true, 9);
  assert.equal(off.opened, true);
  assert.equal(off.name, "Isiklar");
  assert.equal(off.lead, 'groupPowerConfirmOff|{"count":9,"name":"Isiklar"}');
  assert.deepEqual(off.pending, { groupId: "lights" });

  // Az sayıda cihazda da aynı onay çıkar, metin gerçek sayıyı söyler.
  const on = await runConfirm(false, 2);
  assert.equal(on.lead, 'groupPowerConfirmOn|{"count":2,"name":"Isiklar"}');
});

test("onaylanmadan hiçbir cihaz çevrilmiyor", async () => {
  const dashboard = await readDashboard();

  // Düğme doğrudan komutu değil onay adımını çağırır.
  assert.match(dashboard, /\$\$\("\[data-group-power\]"\)\.forEach\(button=>button\.onclick=\(\)=>confirmGroupPower\(button\.dataset\.groupPower\)\)/);
  // Komut yalnız diyalogdaki "Evet, devam et" düğmesinden geçer; panelin mevcut onay dili kullanılır.
  assert.match(
    dashboard,
    /\$\("#confirmDeviceAction"\)\.onclick=\(\)=>\{const pending=state\.pendingConfirm;\$\("#deviceActionDialog"\)\.close\(\);if\(!pending\)return;if\(pending\.groupId\)commandDashboardGroup\(pending\.groupId\);else command\(pending\.id,pending\.property,pending\.value\)\}/
  );
  assert.match(dashboard, /<button id="confirmDeviceAction" class="danger-button" type="button" data-i18n="confirmAction"/);
  // Tek cihaz döşemesi onay istemez: doğrudan komut yolunda kalır.
  assert.match(dashboard, /\$\$\("\[data-group-device\]"\)\.forEach\(button=>button\.onclick=\(\)=>runDashboardCommand\(button,/);
  // Aynı süzgeç iki yerde: onay ekranındaki sayı gerçekten çevrilecek cihaz sayısıdır.
  assert.match(dashboard, /const groupPowerEntries=group=>groupControlEntries\(group\)\.filter\(\(\{device,control\}\)=>control&&groupPowerControl\(control\)&&device\.availability!=="offline"\)/);
  assert.match(extractFunction(dashboard, "commandDashboardGroup"), /const entries=groupPowerEntries\(group\)/);
});

test("toplu güç onayı iki dilde de var", async () => {
  const [english, turkish] = await Promise.all([readCatalog(englishLocaleUrl), readCatalog(turkishLocaleUrl)]);

  for (const key of ["groupPowerConfirmOn", "groupPowerConfirmOff"]) {
    assert.ok(english[key], `${key} İngilizce katalogda yok`);
    assert.ok(turkish[key], `${key} Türkçe katalogda yok`);
    assert.match(english[key], /\{count\}/);
    assert.match(turkish[key], /\{count\}/);
    assert.match(english[key], /\{name\}/);
    assert.match(turkish[key], /\{name\}/);
  }
  assert.equal(turkish.groupPowerConfirmOff, "{name} grubundaki {count} cihazın hepsi kapatılacak. Devam edilsin mi?");
});
