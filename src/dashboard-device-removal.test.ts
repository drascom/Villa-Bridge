import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readPanelSource } from "./panel-source.js";

const englishLocaleUrl = new URL("../public/locales/en.json", import.meta.url);
const turkishLocaleUrl = new URL("../public/locales/tr.json", import.meta.url);

async function readCatalog(url: URL): Promise<Record<string, string>> {
  return JSON.parse(await readFile(url, "utf8")).translations as Record<string, string>;
}

/* Gönderilen kodun kendisi sınanıyor: ilgili parçalar panel kaynağından çıkarılıp sahte
   bağımlılıklarla çalıştırılıyor, kopya mantık yazılmıyor. */
function extractFunction(source: string, name: string): string {
  const found = source.indexOf(`function ${name}(`);
  assert.notEqual(found, -1, `${name} bulunamadı`);
  // `async` işlevlerde anahtar sözcük de alınır, yoksa gövdedeki `await` geçersiz kalır.
  const start = source.slice(0, found).endsWith("async ") ? found - "async ".length : found;
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

function extractStatement(source: string, pattern: RegExp): string {
  const match = source.match(pattern);
  assert.notEqual(match, null, `Panel kaynağında bulunamadı: ${pattern}`);
  return match![0];
}

interface RemovalElement {
  value: string;
  placeholder: string;
  textContent: string;
  disabled: boolean;
  open: boolean;
  oninput?: () => void;
}

interface RemovalRun {
  state: Record<string, unknown>;
  elements: Record<string, RemovalElement>;
  toasts: { message: string; error: boolean }[];
  requests: { url: string; body: unknown }[];
  failure: string | null;
}

async function runRemoval(script: string, initialState: Record<string, unknown> = {}): Promise<RemovalRun> {
  const source = await readPanelSource();
  const result: RemovalRun = {
    state: { devices: [], groups: [], removing: null, ...initialState },
    elements: {},
    toasts: [],
    requests: [],
    failure: null
  };
  const factory = new Function(
    "result",
    `
    const state=result.state;
    const $=selector=>{
      if(!result.elements[selector])result.elements[selector]={value:"",placeholder:"",textContent:"",disabled:false,open:false};
      const element=result.elements[selector];
      element.close=()=>{element.open=false};
      element.showModal=()=>{element.open=true};
      element.focus=()=>{};
      return element;
    };
    const t=(key,values={})=>String(key).replace(/$/,"")+(values&&values.name?" "+values.name:"");
    const showToast=(message,error=false)=>{result.toasts.push({message,error:error===true})};
    const refresh=async()=>{};
    const render=()=>{};
    const saveDashboardGroups=()=>{};
    const applyWidgetLayout=()=>{};
    const api=async(url,options={})=>{
      const body=options.body===undefined?null:JSON.parse(options.body);
      result.requests.push({url,body});
      if(result.failure)throw new Error(result.failure);
      return{groups:[]};
    };
    ${extractStatement(source, /^\s*const removalConfirmationWords=.*$/m)}
    ${extractStatement(source, /^\s*const sameConfirmationText=.*$/m)}
    ${extractStatement(source, /^\s*const validRemovalConfirmation=.*$/m)}
    ${extractFunction(source, "removeDevice")}
    ${extractFunction(source, "confirmDeviceRemoval")}
    const bindConfirmationInput=()=>{
      ${extractStatement(source, /\$\("#removeConfirmation"\)\.oninput=\(\)=>\{[\s\S]*?\};/)}
    };
    return (async()=>{ ${script} })();
    `
  ) as (run: RemovalRun) => Promise<void>;
  await factory(result);
  return result;
}

const salon = { id: "0xa4c138462c230400", name: "Salon lambası" };

async function typedConfirmation(typed: string): Promise<RemovalRun> {
  return runRemoval(
    `removeDevice("${salon.id}");bindConfirmationInput();$("#removeConfirmation").value=${JSON.stringify(typed)};` +
      "$(\"#removeConfirmation\").oninput();await confirmDeviceRemoval(false);",
    { devices: [salon] }
  );
}

test("silme onayı evet ya da yes ile verilir; harf büyüklüğü ve dil fark etmez", async () => {
  for (const typed of ["evet", "EVET", " yes ", "Yes", "Evet", "YES"]) {
    const run = await typedConfirmation(typed);
    assert.equal(run.requests.length, 1, `"${typed}" kabul edilmeliydi`);
    assert.equal(run.elements["#removeDialog"].open, false);
    assert.deepEqual(run.requests[0].body, { confirmation: "evet", force: false });
  }
});

test("cihaz adını yazan eski alışkanlık da çalışır", async () => {
  for (const typed of ["Salon lambası", "  salon lambası  ", "SALON LAMBASI"]) {
    const run = await typedConfirmation(typed);
    assert.equal(run.requests.length, 1, `"${typed}" kabul edilmeliydi`);
  }
});

test("boş ya da alakasız metin hiçbir şeyi silmez", async () => {
  for (const typed of ["", "   ", "hayır", "no", "e", "yess", "Mutfak lambası", "0xa4c138462c230400"]) {
    const run = await typedConfirmation(typed);
    assert.equal(run.requests.length, 0, `"${typed}" reddedilmeliydi`);
    assert.equal(run.toasts.at(-1)?.error, true);
    assert.match(String(run.toasts.at(-1)?.message), /nameMismatch/);
    assert.equal(run.elements["#removeDialog"].open, true);
  }
});

test("onay düğmeleri doğru kelime yazılana kadar kapalı kalır", async () => {
  const run = await runRemoval(
    `removeDevice("${salon.id}");bindConfirmationInput();` +
      `result.state.steps=[];` +
      `const step=typed=>{$("#removeConfirmation").value=typed;$("#removeConfirmation").oninput();` +
      `result.state.steps.push([typed,$("#confirmRemove").disabled,$("#forceRemove").disabled])};` +
      `result.state.opened=[$("#confirmRemove").disabled,$("#forceRemove").disabled];` +
      `step("");step("ev");step("evet");step("hayır");`,
    { devices: [salon] }
  );

  // Diyalog açılır açılmaz iki yıkıcı düğme de kapalı.
  assert.deepEqual(run.state.opened, [true, true]);
  assert.deepEqual(run.state.steps, [
    ["", true, true],
    ["ev", true, true],
    ["evet", false, false],
    ["hayır", true, true]
  ]);
});

test("diyalog hangi cihazın silineceğini adıyla söyler", async () => {
  const run = await runRemoval(`removeDevice("${salon.id}");`, { devices: [salon] });

  assert.deepEqual(run.state.removing, { id: salon.id, name: salon.name });
  // Açıklama satırı cihazın adını taşır; ham kimlik ekranda yazmaz.
  assert.match(run.elements["#removeDeviceInstruction"].textContent, /Salon lambası/);
  assert.doesNotMatch(run.elements["#removeDeviceInstruction"].textContent, /0xa4c138462c230400/);
  assert.equal(run.elements["#removeConfirmation"].value, "");
  assert.equal(run.elements["#removeDialog"].open, true);
});

test("silme onayı metni iki dilde de ne yazılacağını söyler ve parite tam", async () => {
  const [english, turkish, dashboard] = await Promise.all([
    readCatalog(englishLocaleUrl),
    readCatalog(turkishLocaleUrl),
    readPanelSource()
  ]);

  for (const key of ["confirmRemoval", "removeConfirmationPlaceholder", "nameMismatch", "removeDeviceTitle"]) {
    assert.equal(typeof english[key], "string", `${key} en.json'da yok`);
    assert.equal(typeof turkish[key], "string", `${key} tr.json'da yok`);
  }

  // Ne yazılacağı açıkça söyleniyor ve hangi cihaz olduğu adıyla geçiyor.
  assert.match(turkish.confirmRemoval, /evet/);
  assert.match(english.confirmRemoval, /yes/);
  assert.match(turkish.confirmRemoval, /\{name\}/);
  assert.match(english.confirmRemoval, /\{name\}/);
  assert.match(turkish.nameMismatch, /evet/);
  assert.match(english.nameMismatch, /yes/);

  // Arayüzde teknik terim yok: kimlik, protokol adı ya da makine kodu bu satırlara sızmaz.
  for (const catalog of [english, turkish]) {
    for (const key of ["confirmRemoval", "removeConfirmationPlaceholder", "nameMismatch"]) {
      assert.doesNotMatch(catalog[key], /IEEE|UID|Zigbee|0x|MQTT/i);
    }
    // Küçük harf şartı kalktı: metin artık böyle bir kural anlatmıyor.
    assert.doesNotMatch(catalog.confirmRemoval, /lowercase|küçük harf/i);
    assert.doesNotMatch(catalog.nameMismatch, /lowercase|küçük harf/i);
  }

  assert.match(dashboard, /validRemovalConfirmation\(\$\("#removeConfirmation"\)\.value,state\.removing\.name\)/);
});
