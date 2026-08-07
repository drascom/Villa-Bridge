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

/* Grup kartının başlığındaki toplu güç düğmesi kaldırıldı: bütün odayı tek dokunuşla çeviren
   yol artık yok. Bu dosya o kararı tutar — düğme geri gelirse ya da onunla gelen ölü kod
   sızarsa testler düşer. Tek döşeme komutu bundan etkilenmez, o yol yerinde kalır. */

test("grup kartında toplu güç düğmesi yok", async () => {
  const dashboard = await readDashboard();

  // Düğmenin kendisi, işaretçisi ve simgesi.
  assert.doesNotMatch(dashboard, /data-group-power/);
  assert.doesNotMatch(dashboard, /group-power/);
  assert.doesNotMatch(dashboard, /groupPowerIcon/);
  // Başlıkta yalnız görünürlük anahtarı ve grup düzenleme düğmesi kalır.
  assert.match(
    dashboard,
    /<div class="group-widget-actions">\$\{state\.dashboardEditing\?overviewSwitchHtml\(group,entries\):""\}\$\{editButton\}<\/div>/
  );
  // İki kalıp da (panel ve genel görünüm kartı) aynı: hiçbirinde güç düğmesi kalmadı.
  assert.equal(dashboard.match(/\$\{state\.dashboardEditing\?overviewSwitchHtml\(group,entries\):""\}\$\{editButton\}/g)?.length, 2);
});

test("toplu güç ile gelen onay ve komut kodu tamamen silindi", async () => {
  const dashboard = await readDashboard();

  for (const symbol of [
    "confirmGroupPower",
    "commandDashboardGroup",
    "groupPowerEntries",
    "groupPowerActivates",
    "groupPowerControl",
    "matchingZigbeePowerGroup",
    "pendingGroups"
  ]) {
    assert.doesNotMatch(dashboard, new RegExp(symbol), `${symbol} hâlâ duruyor`);
  }
  // Onay diyaloğu artık yalnız tek cihaz komutunu taşır: grup dalı kalktı.
  assert.match(
    dashboard,
    /\$\("#confirmDeviceAction"\)\.onclick=\(\)=>\{const pending=state\.pendingConfirm;\$\("#deviceActionDialog"\)\.close\(\);if\(!pending\)return;command\(pending\.id,pending\.property,pending\.value\)\}/
  );
  assert.doesNotMatch(dashboard, /pending\.groupId/);
  // Zigbee grup komutu uç noktası panelden hiç çağrılmıyor.
  assert.doesNotMatch(dashboard, /api\/groups\/\$\{encodeURIComponent\(zigbeeGroup\.id\)\}\/command/);
});

test("tek döşemeye dokunma yolu ve onay dili yerinde", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /\$\$\("\[data-group-device\]"\)\.forEach\(button=>button\.onclick=\(\)=>runDashboardCommand\(button,/);
  assert.match(dashboard, /function confirmDashboardCommand\(deviceId,property,value,messageKey\)/);
  assert.match(dashboard, /<button id="confirmDeviceAction" class="danger-button" type="button" data-i18n="confirmAction"/);
});

test("toplu güç metin anahtarları iki katalogdan da düşürüldü", async () => {
  const [english, turkish] = await Promise.all([readCatalog(englishLocaleUrl), readCatalog(turkishLocaleUrl)]);

  for (const key of ["toggleGroupPower", "groupPowerConfirmOn", "groupPowerConfirmOff"]) {
    assert.equal(english[key], undefined, `${key} İngilizce katalogda kalmış`);
    assert.equal(turkish[key], undefined, `${key} Türkçe katalogda kalmış`);
  }
});
