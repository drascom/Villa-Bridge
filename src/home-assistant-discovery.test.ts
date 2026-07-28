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
  vendor: "Example",
  description: null,
  supported: true,
  interviewCompleted: true,
  availability: "online",
  lastSeen: null,
  stateUpdatedAt: null,
  features: ["state", "brightness", "color_temp"],
  controls: [
    { id: "main", property: "state", name: "Kitchen Light", kind: "switch", value: true },
    { id: "main:brightness", property: "brightness", name: "Brightness", kind: "level", value: 120, min: 1, max: 254 },
    { id: "main:temperature", property: "color_temp", name: "Temperature", kind: "temperature", value: 300, min: 153, max: 500 }
  ],
  state: { state: "ON", brightness: 120, color_temp: 300, linkquality: 90 }
};

test("Home Assistant keşfi ışık ve sinyali UID ile yayınlar", () => {
  const discovery = buildHomeAssistantDiscovery([light], "zigbee2mqtt");
  const lightMessage = discovery.find((item) => item.topic.startsWith("homeassistant/light/"));
  const signalMessage = discovery.find((item) => item.topic.includes("linkquality"));

  assert.equal(lightMessage?.payload.command_topic, "zigbee2mqtt/Kitchen Light/set");
  assert.deepEqual(lightMessage?.payload.supported_color_modes, ["color_temp"]);
  assert.equal(lightMessage?.payload.unique_id, "villa_0xabc_light");
  assert.equal(signalMessage?.payload.unit_of_measurement, "lqi");
});
