import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../public/index.html", import.meta.url);

async function readDashboard(): Promise<string> {
  return readFile(dashboardUrl, "utf8");
}

/* Panoyu tarayıcıda çalıştırmadan sınamak için ilgili işlevlerin kaynağı `public/index.html`
   içinden alınıp sahte bağımlılıklarla çalıştırılıyor: kopya mantık yok, gönderilen kod sınanıyor. */
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

type LayoutState = { widgets: string[]; removedWidgets: Set<string>; groups: { id: string; name: string }[] };

type Harness = { state: LayoutState; reconcile: () => boolean; saves: () => { layout: number; removed: number } };

async function layoutHarness(state: LayoutState): Promise<Harness> {
  const source = await readDashboard();
  const factory = new Function(
    "state",
    `
    const groupWidgetPrefix="group:";
    const groupWidgetId=id=>\`\${groupWidgetPrefix}\${id}\`;
    // Panoda gruplar listesi türetilmiş "Işıklar" grubuyla birleşir; sıralama onarımı o listeyi okur.
    const dashboardGroups=()=>state.groups;
    let layoutSaves=0,removedSaves=0;
    function saveWidgetLayout(){layoutSaves+=1}
    function saveRemovedWidgets(){removedSaves+=1}
    ${extractFunction(source, "groupWidgetSlot")}
    ${extractFunction(source, "reconcileWidgetLayout")}
    return{reconcile:reconcileWidgetLayout,saves:()=>({layout:layoutSaves,removed:removedSaves})};
  `
  ) as (state: LayoutState) => { reconcile: () => boolean; saves: () => { layout: number; removed: number } };
  return { state, ...factory(state) };
}

type MoveButton = { direction: "left" | "right"; widget: string; disabled: boolean };

async function moveButtons(railOrder: string[], widgets: string[]): Promise<MoveButton[]> {
  const source = await readDashboard();
  const start = source.indexOf("const railOrder=railWidgets()");
  assert.notEqual(start, -1, "ok düğmesi bloğu bulunamadı");
  const end = source.indexOf("\n    });", start);
  assert.notEqual(end, -1, "ok düğmesi bloğu kapanmıyor");
  const block = source.slice(start, end + "\n    });".length);
  const buttons: MoveButton[] = railOrder.flatMap(widget =>
    (["left", "right"] as const).map(direction => ({ direction, widget, disabled: false }))
  );
  const runner = new Function(
    "buttons",
    "railWidgetIds",
    `
    const fixedDashboardWidgets=new Set(["quick"]);
    const t=key=>key;
    const railWidgets=()=>railWidgetIds.map(id=>({dataset:{widget:id}}));
    const handles=buttons.map(button=>({
      dataset:{widgetMove:button.direction},
      closest:()=>({dataset:{widget:button.widget}}),
      setAttribute(){},
      set disabled(value){button.disabled=value},
      set title(value){}
    }));
    const $$=()=>handles;
    ${block}
  `
  ) as (buttons: MoveButton[], railWidgetIds: string[]) => void;
  runner(buttons, railOrder);
  void widgets;
  return buttons;
}

test("düzen kaydında yeri olmayan grup kartı sıralamaya giriyor", async () => {
  const harness = await layoutHarness({
    // Garden sunucudan senkronla geldi: ekranda duruyordu ama düzen kaydında hiç yoktu.
    widgets: ["quick", "group:living", "activity"],
    removedWidgets: new Set<string>(),
    groups: [
      { id: "garden", name: "Garden" },
      { id: "living", name: "Living room" }
    ]
  });

  assert.equal(harness.reconcile(), true);
  assert.deepEqual(harness.state.widgets, ["quick", "group:garden", "group:living", "activity"]);
  assert.equal(harness.saves().layout, 1);
});

test("onarım mevcut sırayı bozmuyor ve ikinci turda yazmıyor", async () => {
  const harness = await layoutHarness({
    widgets: ["quick", "activity", "group:living", "summary", "group:garden"],
    removedWidgets: new Set<string>(),
    groups: [
      { id: "living", name: "Living room" },
      { id: "garden", name: "Garden" },
      { id: "attic", name: "Attic" }
    ]
  });

  assert.equal(harness.reconcile(), true);
  assert.deepEqual(harness.state.widgets, ["quick", "activity", "group:living", "summary", "group:garden", "group:attic"]);
  assert.equal(harness.reconcile(), false);
  assert.equal(harness.saves().layout, 1);
});

test("kullanıcının kaldırdığı grup kartı geri gelmiyor", async () => {
  const harness = await layoutHarness({
    widgets: ["quick", "group:living"],
    removedWidgets: new Set(["group:garden"]),
    groups: [
      { id: "garden", name: "Garden" },
      { id: "living", name: "Living room" }
    ]
  });

  assert.equal(harness.reconcile(), false);
  assert.deepEqual(harness.state.widgets, ["quick", "group:living"]);
});

test("silinen grubun kimliği düzen kaydından ve kaldırılanlardan düşüyor", async () => {
  const harness = await layoutHarness({
    widgets: ["quick", "group:garden", "group:living"],
    removedWidgets: new Set(["group:attic", "summary"]),
    groups: [{ id: "living", name: "Living room" }]
  });

  assert.equal(harness.reconcile(), true);
  assert.deepEqual(harness.state.widgets, ["quick", "group:living"]);
  assert.deepEqual([...harness.state.removedWidgets], ["summary"]);
  assert.equal(harness.saves().removed, 1);
});

test("ok düğmeleri ekrandaki sırayı yansıtıyor", async () => {
  const railOrder = ["group:garden", "group:living", "summary", "activity"];
  const buttons = await moveButtons(railOrder, ["quick", ...railOrder]);
  const state = (widget: string, direction: "left" | "right") =>
    buttons.find(button => button.widget === widget && button.direction === direction)?.disabled;

  assert.equal(state("group:garden", "left"), true);
  assert.equal(state("group:garden", "right"), false);
  assert.equal(state("group:living", "left"), false);
  assert.equal(state("group:living", "right"), false);
  assert.equal(state("summary", "left"), false);
  assert.equal(state("activity", "left"), false);
  assert.equal(state("activity", "right"), true);
});

test("sabit kart taşınamaz kalıyor", async () => {
  const buttons = await moveButtons(["quick", "summary"], ["quick", "summary"]);

  assert.deepEqual(
    buttons.filter(button => button.widget === "quick").map(button => button.disabled),
    [true, true]
  );
});

/* "Ev hareketleri" olay satırları sıkışıyordu: rayda bir kademe (bir sütun) daha geniş.
   Diğer özet kartları kendi genişliğinde kalır, ray hâlâ kayar. */
test("ev hareketleri kartı rayda bir kademe geniş", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /#home \.widget-rail \[data-widget="activity"\]\{grid-column:span 2\}/);
  // Ölçü oransal: sütun genişliği viewport'tan türer, sabit px değil.
  assert.match(dashboard, /--rail-column:calc\(\(100vw - 350px\)\/3\)/);
  assert.match(dashboard, /grid-auto-columns:var\(--rail-column\)/);
  // Diğer kartlar tek sütun; yalnız grup kartı ve hareketler geniş.
  assert.match(dashboard, /#home \.widget-rail \.widget-card\{grid-row:1;grid-column:span 1/);
  assert.match(dashboard, /#home \.widget-rail \.group-widget\{grid-column:span 2/);
});

test("gizli kart görünmüyor ve sıralama onarımı düzene bağlanıyor", async () => {
  const dashboard = await readDashboard();

  // Ray içindeki grup kartı `display:grid` aldığı için `hidden` özniteliği eziliyordu:
  // panodan kaldırılan grup ekranda kalıyor, sıralamada yer almadığı için de taşınamıyordu.
  assert.match(dashboard, /\.dashboard-widget\[hidden\],#home \.widget-rail \.group-widget\[hidden\]\{display:none\}/);
  assert.match(dashboard, /reconcileWidgetLayout\(\);\s*renderGroupWidgets\(\);/);
  assert.match(dashboard, /const removedWidgetsKey="villa-dashboard-removed-widgets"/);
  assert.match(dashboard, /localStorage\.setItem\(removedWidgetsKey,JSON\.stringify\(\[\.\.\.state\.removedWidgets\]\)\)/);
  // Taşıma sonrası sıra kalıcı: kaynak liste güncellenip aynı yolla kaydediliyor.
  assert.match(dashboard, /const sourceIndex=state\.widgets\.indexOf\(railOrder\[index\]\);/);
  assert.doesNotMatch(dashboard, /color-mix\(/);
});
