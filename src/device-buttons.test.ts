import assert from "node:assert/strict";
import test from "node:test";
import { deviceButtons } from "./device-buttons.js";

const shape = (actionTypes: string[], aliases = new Map<string, string>()) =>
  deviceButtons("0x20a716fffe6835f1", actionTypes, aliases).map((button) => ({
    id: button.id,
    name: button.name,
    kind: button.kind,
    actions: button.actions.map((action) => `${action.action}=${action.press}`)
  }));

const ts0043 = [
  "1_single", "1_double", "1_hold",
  "2_single", "2_double", "2_hold",
  "3_single", "3_double", "3_hold"
];

test("üç yollu sahne kumandası üç düğmeye ayrışır", () => {
  assert.deepEqual(shape(ts0043), [
    {
      id: "button:1",
      name: "1. düğme",
      kind: "numbered",
      actions: ["1_single=single", "1_double=double", "1_hold=hold"]
    },
    {
      id: "button:2",
      name: "2. düğme",
      kind: "numbered",
      actions: ["2_single=single", "2_double=double", "2_hold=hold"]
    },
    {
      id: "button:3",
      name: "3. düğme",
      kind: "numbered",
      actions: ["3_single=single", "3_double=double", "3_hold=hold"]
    }
  ]);
});

test("dört düğmeli kumanda sayı sırasına göre çözülür", () => {
  const buttons = deviceButtons(
    "0xabc",
    ["4_single", "1_single", "3_single", "2_single"],
    new Map()
  );
  assert.deepEqual(buttons.map((button) => button.number), [1, 2, 3, 4]);
  assert.deepEqual(buttons.map((button) => button.id), [
    "button:1", "button:2", "button:3", "button:4"
  ]);
});

test("button_N_ önekli kalıp aynı düğmelerde toplanır", () => {
  assert.deepEqual(shape(["button_1_single", "button_1_hold", "button_3_hold"]), [
    {
      id: "button:1",
      name: "1. düğme",
      kind: "numbered",
      actions: ["button_1_single=single", "button_1_hold=hold"]
    },
    { id: "button:3", name: "3. düğme", kind: "numbered", actions: ["button_3_hold=hold"] }
  ]);
});

test("IKEA/Hue tarzı isimli kalıp adlı düğmelere ayrışır", () => {
  assert.deepEqual(
    shape(["on_press", "off_hold", "arrow_left_click", "brightness_up_click", "up_press", "down_press"]),
    [
      { id: "button:on", name: "Açma düğmesi", kind: "named", actions: ["on_press=single"] },
      { id: "button:off", name: "Kapatma düğmesi", kind: "named", actions: ["off_hold=hold"] },
      {
        id: "button:arrow_left",
        name: "Sol ok düğmesi",
        kind: "named",
        actions: ["arrow_left_click=single"]
      },
      {
        id: "button:brightness_up",
        name: "Parlaklık artırma düğmesi",
        kind: "named",
        actions: ["brightness_up_click=single"]
      },
      { id: "button:up", name: "Yukarı düğmesi", kind: "named", actions: ["up_press=single"] },
      { id: "button:down", name: "Aşağı düğmesi", kind: "named", actions: ["down_press=single"] }
    ]
  );
});

test("basış eki taşımayan on/off kumandası da düğme sayılır", () => {
  assert.deepEqual(shape(["on", "off", "toggle"]), [
    { id: "button:on", name: "Açma düğmesi", kind: "named", actions: ["on=single"] },
    { id: "button:off", name: "Kapatma düğmesi", kind: "named", actions: ["off=single"] },
    {
      id: "button:toggle",
      name: "Değiştirme düğmesi",
      kind: "named",
      actions: ["toggle=single"]
    }
  ]);
});

test("Aqara tarzı numarasız tek düğme tek kovada toplanır", () => {
  assert.deepEqual(shape(["single", "double", "hold", "release"]), [
    {
      id: "button:main",
      name: "Düğme",
      kind: "single",
      actions: ["single=single", "double=double", "hold=hold", "release=release"]
    }
  ]);
});

test("ters sıralı kalıpta basış öne gelse de düğme bulunur", () => {
  assert.deepEqual(shape(["single_left", "double_right"]), [
    { id: "button:left", name: "Sol düğme", kind: "named", actions: ["single_left=single"] },
    { id: "button:right", name: "Sağ düğme", kind: "named", actions: ["double_right=double"] }
  ]);
});

test("tanınmayan kalıp kaybolmaz, ham değeriyle taşınır", () => {
  const actionTypes = [...ts0043, "brightness_move_up", "brightness_stop", "flip90"];
  const buttons = deviceButtons("0xabc", actionTypes, new Map());
  const total = buttons.reduce((sum, button) => sum + button.actions.length, 0);
  assert.equal(total, actionTypes.length);
  const other = buttons.at(-1);
  assert.equal(other?.id, "button:other");
  assert.equal(other?.kind, "ungrouped");
  assert.deepEqual(other?.actions, [
    { action: "brightness_move_up", press: "brightness_move_up" },
    { action: "brightness_stop", press: "brightness_stop" },
    { action: "flip90", press: "flip90" }
  ]);
});

test("eylem listesi boş ya da tanımsızsa düğme üretilmez", () => {
  assert.deepEqual(deviceButtons("0xabc", undefined, new Map()), []);
  assert.deepEqual(deviceButtons("0xabc", [], new Map()), []);
  assert.deepEqual(deviceButtons("0xabc", ["", "   "], new Map()), []);
});

test("aynı eylem iki kez gelirse tek kez listelenir", () => {
  const buttons = deviceButtons("0xabc", ["1_single", "1_single"], new Map());
  assert.deepEqual(buttons[0].actions, [{ action: "1_single", press: "single" }]);
});

test("düğme adı kanal alias mekanizmasıyla değiştirilebilir", () => {
  const aliases = new Map([
    ["0x20a716fffe6835f1:button:1", "Salon"],
    ["0x20a716fffe6835f1:button:3", "Perde"]
  ]);
  assert.deepEqual(
    deviceButtons("0x20a716fffe6835f1", ts0043, aliases).map((button) => button.name),
    ["Salon", "2. düğme", "Perde"]
  );
});
