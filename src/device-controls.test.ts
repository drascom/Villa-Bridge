import assert from "node:assert/strict";
import test from "node:test";
import { deviceControls, hexToXy } from "./device-controls.js";

test("ana ve alt Zigbee kanalları UID tabanlı ortak isimlerle sunulur", () => {
  const aliases = new Map([
    ["0xabc:l1", "Living Room Ceiling Light 2"],
    ["0xabc:l2", "Living Room Ceiling Light 1"]
  ]);
  const controls = deviceControls(
    "0xabc",
    "Living Room Wall Lights",
    ["state", "state_l1", "state_l2"],
    { state: "OFF", state_l1: "ON", state_l2: "OFF" },
    aliases
  );

  assert.deepEqual(
    controls.map(({ id, name, value }) => ({ id, name, value })),
    [
      { id: "main", name: "Living Room Wall Lights", value: false },
      { id: "l1", name: "Living Room Ceiling Light 2", value: true },
      { id: "l2", name: "Living Room Ceiling Light 1", value: false }
    ]
  );
});

test("sensörün state alanı aç/kapat kumandası sayılmaz", () => {
  assert.deepEqual(
    deviceControls("0xdef", "Presence", [], { state: "none", presence: false }, new Map()),
    []
  );
});

test("yazılabilir ışık özellikleri güncel durum gelmeden de kumanda oluşturur", () => {
  const controls = deviceControls(
    "0x456",
    "Kitchen LED",
    ["state", "brightness", "color_temp"],
    {},
    new Map()
  );

  assert.deepEqual(
    controls.map(({ property, kind, value }) => ({ property, kind, value })),
    [
      { property: "state", kind: "switch", value: null },
      { property: "brightness", kind: "level", value: null },
      { property: "color_temp", kind: "temperature", value: null }
    ]
  );

  // ON/OFF kullanan yazılabilir durum tek komutla iki yönü de yapabilir.
  assert.equal(controls[0]?.valueToggle, "TOGGLE");

  // Cihazın kendi bildirdiği değer korunur.
  const declared = deviceControls(
    "0x457",
    "Hall Switch",
    [{ property: "state", name: "state", type: "binary", valueOn: "ON", valueOff: "OFF", valueToggle: "FLIP" }],
    {},
    new Map()
  );
  assert.equal(declared[0]?.valueToggle, "FLIP");

  // ON/OFF dışı değer kümesinde ve salt okunur durumda uydurma komut üretilmez.
  const boolean = deviceControls(
    "0x458",
    "Bool Switch",
    [{ property: "state", name: "state", type: "binary", valueOn: true, valueOff: false }],
    {},
    new Map()
  );
  assert.equal(boolean[0]?.valueToggle, undefined);
  const readOnly = deviceControls("0x459", "Plug", [], { state: "ON" }, new Map());
  assert.equal(readOnly[0]?.valueToggle, undefined);
});

test("RGB ışık rengi UID tabanlı denetim olarak sunulur", () => {
  const controls = deviceControls(
    "0x123",
    "Color Light",
    ["state", "brightness", "color_xy"],
    { state: "ON", brightness: 120, color: { x: 0.7006, y: 0.2993 } },
    new Map()
  );
  assert.deepEqual(
    controls.map(({ property, kind }) => ({ property, kind })),
    [
      { property: "state", kind: "switch" },
      { property: "brightness", kind: "level" },
      { property: "color", kind: "color" }
    ]
  );
  const red = hexToXy("#ff0000");
  assert.ok(red.x > 0.69 && red.y > 0.29);
});

test("perde, termostat, kilit, fan ve siren kontrolleri expose tanımından üretilir", () => {
  const controls = deviceControls(
    "0xhome",
    "Living Room",
    [
      { property: "state", name: "state", type: "enum", parentType: "cover", values: ["OPEN", "STOP", "CLOSE"] },
      { property: "position", name: "position", type: "numeric", parentType: "cover", min: 0, max: 100 },
      { property: "occupied_heating_setpoint", name: "target temperature", type: "numeric", parentType: "climate", min: 5, max: 30, step: 0.5, unit: "°C" },
      { property: "system_mode", name: "mode", type: "enum", parentType: "climate", values: ["off", "heat", "auto"] },
      { property: "lock_state", name: "lock", type: "enum", parentType: "lock", values: ["LOCK", "UNLOCK"] },
      { property: "fan_state", name: "fan", type: "binary", parentType: "fan", valueOn: "ON", valueOff: "OFF" },
      { property: "alarm", name: "siren", type: "binary", parentType: "siren", valueOn: "ON", valueOff: "OFF" }
    ],
    {
      state: "OPEN",
      position: 42,
      occupied_heating_setpoint: 21.5,
      system_mode: "heat",
      lock_state: "LOCK",
      fan_state: "ON",
      alarm: "OFF"
    },
    new Map()
  );

  assert.deepEqual(
    controls.map(({ property, kind, value }) => ({ property, kind, value })),
    [
      { property: "state", kind: "cover", value: "OPEN" },
      { property: "position", kind: "position", value: 42 },
      { property: "occupied_heating_setpoint", kind: "climate", value: 21.5 },
      { property: "system_mode", kind: "select", value: "heat" },
      { property: "lock_state", kind: "lock", value: "LOCK" },
      { property: "fan_state", kind: "fan", value: "ON" },
      { property: "alarm", kind: "siren", value: false }
    ]
  );
});

test("cihaz yapılandırma alanları admin kontrolü olarak işaretlenir", () => {
  const [sensitivity, delay] = deviceControls(
    "0xsensor",
    "Sensor",
    [
      { property: "sensitivity", name: "sensitivity", type: "enum", values: ["low", "medium", "high"], category: "config" },
      { property: "delay", name: "delay", type: "numeric", min: 0, max: 60, unit: "s", category: "config" }
    ],
    { sensitivity: "medium", delay: 10 },
    new Map()
  );

  assert.equal(sensitivity.kind, "select");
  assert.equal(sensitivity.adminOnly, true);
  assert.equal(delay.kind, "number");
  assert.equal(delay.adminOnly, true);
});
