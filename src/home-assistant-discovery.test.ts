import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeAssistantDiscovery } from "./home-assistant-discovery.js";
import type { DeviceView } from "./types.js";

const light: DeviceView = {
  id: "0xabc",
  sourceName: "Kitchen Light",
  name: "Kitchen Light",
  type: "Router",
  model: "RGB-CCT",
  image: {
    model: "RGB-CCT",
    candidates: [{ model: "RGB-CCT", label: "catalogMatch" }],
    selectionRequired: false,
    userSelected: false,
    preferenceKey: "RGB-CCT::Example"
  },
  vendor: "Example",
  description: null,
  supported: true,
  interviewCompleted: true,
  preparing: false,
  availability: "online",
  lastSeen: null,
  stateUpdatedAt: null,
  otaSupported: false,
  options: { transition: 0, debounce: 0, retain: false },
  features: ["state", "brightness", "color_temp"],
  actionTypes: ["single", "double"],
  alerts: [],
  controls: [
    { id: "main", property: "state", name: "Kitchen Light", kind: "switch", value: true },
    { id: "main:brightness", property: "brightness", name: "Brightness", kind: "level", value: 120, min: 1, max: 254 },
    { id: "main:temperature", property: "color_temp", name: "Temperature", kind: "temperature", value: 300, min: 153, max: 500 }
  ],
  state: { state: "ON", brightness: 120, color_temp: 300, linkquality: 90, action: "single" }
};

test("Home Assistant keşfi ışık ve sinyali UID ile yayınlar", () => {
  const discovery = buildHomeAssistantDiscovery([light], "zigbee2mqtt");
  const lightMessage = discovery.find((item) => item.topic.startsWith("homeassistant/light/"));
  const signalMessage = discovery.find((item) => item.topic.includes("linkquality"));

  assert.equal(lightMessage?.payload.command_topic, "zigbee2mqtt/Kitchen Light/set");
  assert.deepEqual(lightMessage?.payload.supported_color_modes, ["color_temp"]);
  assert.equal(lightMessage?.payload.unique_id, "villa_0xabc_light");
  assert.equal(signalMessage?.payload.unit_of_measurement, "lqi");
  const action = discovery.find((item) => item.topic.includes("_action/"));
  assert.equal(action?.payload.value_template, "{{ value_json.action }}");
  const actionEvent = discovery.find((item) => item.topic.startsWith("homeassistant/event/"));
  assert.deepEqual(actionEvent?.payload.event_types, ["single", "double"]);
  assert.equal(
    actionEvent?.payload.value_template,
    "{{ {'event_type': value_json.action} | to_json }}"
  );
});

test("Home Assistant ikili kontrolün cihaz tarafından tanımlanan değerlerini korur", () => {
  const device: DeviceView = {
    ...light,
    controls: [{
      id: "main",
      property: "enabled",
      name: "Enabled",
      kind: "switch",
      value: true,
      valueOn: true,
      valueOff: false
    }],
    state: { enabled: true }
  };
  const discovery = buildHomeAssistantDiscovery([device], "zigbee2mqtt");
  const toggle = discovery.find((item) => item.topic.startsWith("homeassistant/switch/"));

  assert.equal(toggle?.payload.payload_on, '{"enabled":true}');
  assert.equal(toggle?.payload.payload_off, '{"enabled":false}');
  assert.equal(toggle?.payload.state_on, true);
  assert.equal(toggle?.payload.state_off, false);
});

test("Home Assistant perde, iklim, kilit, fan, siren ve ayar bileşenlerini yayınlar", () => {
  const device: DeviceView = {
    ...light,
    id: "0xmulti",
    sourceName: "Utility Room",
    name: "Utility Room",
    features: [],
    controls: [
      { id: "cover:state", property: "state", name: "Blind", kind: "cover", value: "OPEN", values: ["OPEN", "STOP", "CLOSE"] },
      { id: "cover:position", property: "position", name: "Position", kind: "position", value: 50, min: 0, max: 100 },
      { id: "climate:occupied_heating_setpoint", property: "occupied_heating_setpoint", name: "Temperature", kind: "climate", value: 21, min: 5, max: 30, step: 0.5 },
      { id: "climate:system_mode", property: "system_mode", name: "Mode", kind: "select", value: "heat", values: ["off", "heat"] },
      { id: "lock:lock_state", property: "lock_state", name: "Lock", kind: "lock", value: "LOCK", values: ["LOCK", "UNLOCK"] },
      { id: "fan:fan_state", property: "fan_state", name: "Fan", kind: "fan", value: true, valueOn: "ON", valueOff: "OFF" },
      { id: "siren:alarm", property: "alarm", name: "Alarm", kind: "siren", value: false, valueOn: "ON", valueOff: "OFF" },
      { id: "number:sensitivity", property: "sensitivity", name: "Sensitivity", kind: "number", value: 3, min: 1, max: 5, adminOnly: true },
      { id: "select:profile", property: "profile", name: "Profile", kind: "select", value: "normal", values: ["quiet", "normal"], adminOnly: true }
    ],
    state: { state: "OPEN", position: 50, local_temperature: 20, lock_state: "LOCK" }
  };
  const components = buildHomeAssistantDiscovery([device], "zigbee2mqtt")
    .map((item) => item.topic.split("/")[1]);

  for (const component of ["cover", "climate", "lock", "fan", "siren", "number", "select"]) {
    assert.ok(components.includes(component), `${component} discovery missing`);
  }
  const number = buildHomeAssistantDiscovery([device], "zigbee2mqtt")
    .find((item) => item.topic.startsWith("homeassistant/number/"));
  assert.equal(number?.payload.entity_category, "config");
  const siren = buildHomeAssistantDiscovery([device], "zigbee2mqtt")
    .find((item) => item.topic.startsWith("homeassistant/siren/"));
  assert.equal(siren?.payload.state_value_template, "{{ value_json.alarm }}");
  const select = buildHomeAssistantDiscovery([device], "zigbee2mqtt")
    .find((item) => item.topic.startsWith("homeassistant/select/"));
  assert.equal(select?.payload.entity_category, "config");
  assert.deepEqual(select?.payload.options, ["quiet", "normal"]);
});

test("yalnız pozisyon bildiren perde var olmayan state alanını yayınlamaz", () => {
  const device: DeviceView = {
    ...light,
    id: "0xposition-only",
    sourceName: "Position Blind",
    name: "Position Blind",
    features: ["position"],
    controls: [{
      id: "cover:position",
      property: "position",
      name: "Position",
      kind: "position",
      value: 35,
      min: 0,
      max: 100
    }],
    state: { position: 35 }
  };
  const cover = buildHomeAssistantDiscovery([device], "zigbee2mqtt")
    .find((item) => item.topic.startsWith("homeassistant/cover/"));

  assert.equal(cover?.payload.state_topic, undefined);
  assert.equal(cover?.payload.value_template, undefined);
  assert.equal(cover?.payload.command_topic, undefined);
  assert.equal(cover?.payload.position_template, "{{ value_json.position }}");
  assert.equal(cover?.payload.set_position_topic, "zigbee2mqtt/Position Blind/set");
});
