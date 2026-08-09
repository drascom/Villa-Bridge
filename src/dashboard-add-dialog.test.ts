import assert from "node:assert/strict";
import test from "node:test";
import { panelMarkup, panelStyles, readPanelSource } from "./panel-source.js";

/* "Panoya ekle" penceresinin TEK başlığı var: seçili sekmeye (ve düzenleme kipine) göre
   değişiyor. Panel tarayıcıda çalıştırılmadan sınanıyor — gönderilen işlevlerin kaynağı
   `public/js` içinden alınıp sahte DOM ile koşturuluyor. */
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

type FakeElement = {
  hidden?: boolean;
  textContent?: string;
  tabIndex?: number;
  dataset?: Record<string, string>;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
};

type TitleHarness = {
  setTab: (tab: string) => void;
  title: () => string;
  state: { groupEditing: { id: string | null } | null };
};

function fakeTab(tab: string, controls: string, selected: boolean): FakeElement {
  const attrs: Record<string, string> = { "aria-selected": selected ? "true" : "false", "aria-controls": controls };
  return {
    dataset: { addTab: tab },
    tabIndex: selected ? 0 : -1,
    getAttribute: (name: string) => attrs[name] ?? null,
    setAttribute: (name: string, value: string) => {
      attrs[name] = value;
    }
  };
}

async function titleHarness(): Promise<TitleHarness> {
  const source = await readPanelSource();
  const factory = new Function(
    "elements",
    "tabs",
    `
    const $=selector=>elements[selector]||null;
    const $$=()=>tabs;
    const t=key=>key;
    const state={groupEditing:null};
    // Grup düzenleyicinin kendisi burada sınanmıyor; başlığın onun kipini okuduğu sınanıyor.
    function prepareGroupEditor(){state.groupEditing={id:null}}
    ${extractFunction(source, "updateAddDialogTitle")}
    ${extractFunction(source, "setAddDialogTab")}
    return{setTab:setAddDialogTab,title:()=>elements["#addDialogTitle"].textContent,state};
    `
  );
  const elements: Record<string, unknown> = {
    "#addDialogTitle": { textContent: "" },
    "#addPanelWidgets": { hidden: false },
    "#groupForm": { hidden: true }
  };
  const tabs = [fakeTab("widgets", "addPanelWidgets", true), fakeTab("groups", "groupForm", false)];
  elements["#addTabGroups"] = tabs[1];
  elements["#addTabWidgets"] = tabs[0];
  return factory(elements, tabs) as TitleHarness;
}

test("pencerenin tek başlığı seçili sekmeye göre değişir", async () => {
  const harness = await titleHarness();

  harness.setTab("widgets");
  assert.equal(harness.title(), "addToDashboard");

  // Oda sekmesi: yeni oda kurarken "oluştur", var olanı açarken "düzenle".
  harness.setTab("groups");
  assert.equal(harness.title(), "createDeviceGroup");

  harness.state.groupEditing = { id: "oda-1" };
  harness.setTab("groups");
  assert.equal(harness.title(), "editGroup");

  // Geri dönünce pencere başlığı yine pano dilinde — düzenleme kipi sızmaz.
  harness.setTab("widgets");
  assert.equal(harness.title(), "addToDashboard");
});

test("grup formundaki ikinci başlık kalmadı, başlığı yazan her akış tek başlığa gider", async () => {
  const markup = await panelMarkup();
  const scripts = await readPanelSource();

  // Modalda tek `h2` var ve o da başlık satırının içinde.
  const dialog = markup.slice(markup.indexOf('<dialog id="widgetDialog"'));
  const body = dialog.slice(0, dialog.indexOf("</dialog>"));
  assert.equal(body.match(/<h2/g)?.length, 1, "widgetDialog içinde tek başlık olmalı");
  assert.match(body, /<div class="add-modal-head"><h2 id="addDialogTitle" data-i18n="addToDashboard">/);

  // Eski ikinci başlık ne markup'ta ne de betiklerde kaldı.
  assert.doesNotMatch(markup, /groupDialogTitle/);
  assert.doesNotMatch(scripts, /groupDialogTitle/);

  // Başlığı yazan tek yol `updateAddDialogTitle`; sekme akışı, düzenleyici ve dil değişimi onu çağırır.
  assert.equal(scripts.match(/updateAddDialogTitle\(\)/g)?.length, 4, "tek başlık işlevi dört yerde geçmeli");
  assert.match(scripts, /if\(tab==="groups"&&!state\.groupEditing\)prepareGroupEditor\(null\);\s*updateAddDialogTitle\(\);/);
  assert.match(scripts, /if\(\$\("#widgetDialog"\)\.open\)\{updateAddDialogTitle\(\);/);
});

test("pencere tam ekran ve sağ üstte kapatma düğmesi var", async () => {
  const markup = await panelMarkup();
  const styles = await panelStyles();
  const scripts = await readPanelSource();

  // Kapatma düğmesi cihaz detayıyla aynı dilde: 44×44 yuvarlak, aria etiketi i18n'li.
  assert.match(
    markup,
    /<button id="dismissWidgetDialog" class="device-detail-close" type="button" data-i18n-aria="close" aria-label="Close">×<\/button>/
  );
  assert.match(scripts, /\$\("#dismissWidgetDialog"\)\.onclick=closeAddDialog;/);
  // Alttaki mevcut düğmeler duruyor.
  assert.match(scripts, /\$\("#closeWidgetDialog"\)\.onclick=closeAddDialog;/);

  // Pencere ekranın tamamını kaplar; yükseklik `dvh` (tablet adres çubuğu).
  assert.match(
    styles,
    /dialog#widgetDialog\{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0;overflow:hidden\}/
  );
  // Başlık ve sekme şeridi sabit, yalnız seçili sekme kayar.
  assert.match(styles, /\.add-modal>\.add-modal-head,\.add-modal>\.modal-tabs\{flex:none\}/);
  assert.match(styles, /\.add-modal>\.modal-tab-panel\{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain\}/);
  // Gizli sekme yine gizli: `display:flex` kuralı `[hidden]`ı ezmiyor.
  assert.match(styles, /\.add-modal>\.modal-tab-panel\[hidden\]\{display:none\}/);
});

test("grup sekmesindeki cihaz listesi kendi çerçevesinde ve kendi içinde kayar", async () => {
  const markup = await panelMarkup();
  const styles = await panelStyles();

  assert.match(
    markup,
    /<div class="group-picker-frame"><div class="group-picker-head">.*?<\/div><div id="groupDeviceChoices" class="group-device-choices"><\/div><\/div>/
  );
  // Çerçeve panelin kart dilinde: tema değişkenleri kullanılır, sabit renk yazılmaz.
  assert.match(
    styles,
    /\.group-picker-frame\{flex:1 1 auto;min-height:180px;display:flex;flex-direction:column;margin-top:18px;padding:14px;border:1px solid var\(--line\);border-radius:14px;background:var\(--surface-soft\)\}/
  );
  // Liste büyüyünce aksiyon satırını aşağı itmez: kaydırma listenin kendi içinde kalır.
  assert.match(styles, /\.group-picker-frame>\.group-device-choices\{flex:1 1 auto;min-height:0;max-height:none\}/);
  assert.match(styles, /\.group-device-choices\{max-height:320px;[^}]*overflow:auto\}/);
});
