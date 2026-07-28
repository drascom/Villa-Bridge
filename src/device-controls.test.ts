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
    deviceControls("0xdef", "Presence", ["state", "presence"], { state: "none", presence: false }, new Map()),
    []
  );
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
