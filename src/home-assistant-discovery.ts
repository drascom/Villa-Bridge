import type { DeviceControlView, DeviceView, JsonObject } from "./types.js";

export interface HomeAssistantDiscoveryMessage {
  topic: string;
  payload: JsonObject;
}

const safeId = (value: string): string => value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");

const deviceInfo = (device: DeviceView): JsonObject => ({
  identifiers: [device.id],
  name: device.name,
  manufacturer: device.vendor ?? "Zigbee",
  model: device.model ?? "Unknown"
});

const common = (device: DeviceView, uniqueId: string, baseTopic: string): JsonObject => ({
  unique_id: uniqueId,
  device: deviceInfo(device),
  origin: { name: "Villa Bridge", sw_version: "0.1.0" },
  availability_topic: `${baseTopic}/bridge/state`,
  availability_template: "{{ value_json.state }}"
});

const message = (
  component: string,
  uniqueId: string,
  payload: JsonObject
): HomeAssistantDiscoveryMessage => ({
  topic: `homeassistant/${component}/${safeId(uniqueId)}/config`,
  payload
});

const switchDiscovery = (
  device: DeviceView,
  control: DeviceControlView,
  baseTopic: string
): HomeAssistantDiscoveryMessage => {
  const uniqueId = `villa_${safeId(device.id)}_${safeId(control.id)}`;
  return message("switch", uniqueId, {
    ...common(device, uniqueId, baseTopic),
    name: control.name,
    state_topic: `${baseTopic}/${device.sourceName}`,
    command_topic: `${baseTopic}/${device.sourceName}/set`,
    value_template: `{{ value_json.${control.property} }}`,
    payload_on: JSON.stringify({ [control.property]: "ON" }),
    payload_off: JSON.stringify({ [control.property]: "OFF" }),
    state_on: "ON",
    state_off: "OFF"
  });
};

export function buildHomeAssistantDiscovery(
  devices: DeviceView[],
  baseTopic: string
): HomeAssistantDiscoveryMessage[] {
  const result: HomeAssistantDiscoveryMessage[] = [];
  for (const device of devices) {
    const switches = device.controls.filter((control) => control.kind === "switch");
    const main = switches.find((control) => control.id === "main");
    const brightness = device.controls.find((control) => control.kind === "level" && control.id.startsWith("main:"));
    const temperature = device.controls.find((control) => control.kind === "temperature" && control.id === "main:temperature");
    const color = device.controls.find((control) => control.kind === "color" && control.id.startsWith("main:"));
    const isLight = Boolean(main && (brightness || temperature || color));

    if (main && isLight) {
      const uniqueId = `villa_${safeId(device.id)}_light`;
      const supportedColorModes = [
        color ? "xy" : "",
        temperature ? "color_temp" : "",
        !color && !temperature && brightness ? "brightness" : ""
      ].filter(Boolean);
      result.push(message("light", uniqueId, {
        ...common(device, uniqueId, baseTopic),
        name: device.name,
        schema: "json",
        state_topic: `${baseTopic}/${device.sourceName}`,
        command_topic: `${baseTopic}/${device.sourceName}/set`,
        brightness: Boolean(brightness),
        brightness_scale: brightness?.max ?? 254,
        min_mireds: temperature?.min,
        max_mireds: temperature?.max,
        supported_color_modes: supportedColorModes
      }));
    }
    for (const control of switches) {
      if (isLight && control.id === "main") continue;
      result.push(switchDiscovery(device, control, baseTopic));
    }

    const binarySensors: Array<[string, string, string, boolean]> = [
      ["contact", "Door", "door", true],
      ["presence", "Presence", "occupancy", false],
      ["occupancy", "Motion", "motion", false],
      ["smoke", "Smoke", "smoke", false],
      ["carbon_monoxide", "Carbon monoxide", "carbon_monoxide", false],
      ["battery_low", "Battery low", "battery", false]
    ];
    for (const [property, name, deviceClass, invert] of binarySensors) {
      if (!(property in device.state)) continue;
      const uniqueId = `villa_${safeId(device.id)}_${property}`;
      const expression = invert
        ? `{{ 'OFF' if value_json.${property} else 'ON' }}`
        : `{{ 'ON' if value_json.${property} else 'OFF' }}`;
      result.push(message("binary_sensor", uniqueId, {
        ...common(device, uniqueId, baseTopic),
        name,
        device_class: deviceClass,
        state_topic: `${baseTopic}/${device.sourceName}`,
        value_template: expression,
        payload_on: "ON",
        payload_off: "OFF"
      }));
    }

    const sensors: Array<[string, string, string | null, string | null]> = [
      ["battery", "Battery", "battery", "%"],
      ["linkquality", "Signal", null, "lqi"],
      ["illuminance", "Illuminance", "illuminance", "lx"],
      ["power", "Power", "power", "W"],
      ["voltage", "Voltage", "voltage", "V"],
      ["current", "Current", "current", "A"],
      ["energy", "Energy", "energy", "kWh"]
    ];
    for (const [property, name, deviceClass, unit] of sensors) {
      if (typeof device.state[property] !== "number") continue;
      const uniqueId = `villa_${safeId(device.id)}_${property}`;
      result.push(message("sensor", uniqueId, {
        ...common(device, uniqueId, baseTopic),
        name,
        device_class: deviceClass ?? undefined,
        unit_of_measurement: unit,
        state_class: "measurement",
        state_topic: `${baseTopic}/${device.sourceName}`,
        value_template: `{{ value_json.${property} }}`
      }));
    }
  }
  return result;
}
