import type { DeviceControlView, JsonObject } from "./types.js";

const onOff = (value: unknown): boolean | null => {
  if (value === "ON" || value === true) return true;
  if (value === "OFF" || value === false) return false;
  return null;
};

const suffixOf = (property: string, prefix: string): string =>
  property === prefix ? "main" : property.slice(prefix.length + 1);

const defaultChannelName = (deviceName: string, channel: string): string => {
  if (channel === "main") return deviceName;
  const number = channel.match(/\d+/)?.[0];
  return number ? `Kanal ${number}` : channel.toUpperCase();
};

const clampByte = (value: number): number => Math.round(Math.max(0, Math.min(255, value)));

const rgbToHex = (red: number, green: number, blue: number): string =>
  `#${[red, green, blue].map((value) => clampByte(value).toString(16).padStart(2, "0")).join("")}`;

const xyToHex = (x: number, y: number): string => {
  if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0) return "#ffffff";
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  let red = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let green = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let blue = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const gamma = (value: number): number =>
    value <= 0.0031308 ? 12.92 * value : (1.055 * Math.pow(Math.max(0, value), 1 / 2.4)) - 0.055;
  red = gamma(red);
  green = gamma(green);
  blue = gamma(blue);
  const maximum = Math.max(red, green, blue);
  if (maximum > 1) {
    red /= maximum;
    green /= maximum;
    blue /= maximum;
  }
  return rgbToHex(red * 255, green * 255, blue * 255);
};

const hsToHex = (hue: number, saturation: number): string => {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const chroma = s;
  const segment = h / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] =
    segment < 1 ? [chroma, secondary, 0] :
    segment < 2 ? [secondary, chroma, 0] :
    segment < 3 ? [0, chroma, secondary] :
    segment < 4 ? [0, secondary, chroma] :
    segment < 5 ? [secondary, 0, chroma] :
    [chroma, 0, secondary];
  const match = 1 - chroma;
  return rgbToHex((red + match) * 255, (green + match) * 255, (blue + match) * 255);
};

const colorHex = (value: unknown): string => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "#ffffff";
  const color = value as Record<string, unknown>;
  if (typeof color.hex === "string" && /^#[0-9a-f]{6}$/i.test(color.hex)) return color.hex.toLowerCase();
  if (typeof color.x === "number" && typeof color.y === "number") return xyToHex(color.x, color.y);
  if (typeof color.hue === "number" && typeof color.saturation === "number") {
    return hsToHex(color.hue, color.saturation);
  }
  return "#ffffff";
};

export const hexToXy = (hex: string): { x: number; y: number } => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error("Geçersiz renk değeri.");
  const component = (offset: number): number => {
    const value = Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
  };
  const red = component(0);
  const green = component(2);
  const blue = component(4);
  const X = red * 0.664511 + green * 0.154324 + blue * 0.162028;
  const Y = red * 0.283881 + green * 0.668433 + blue * 0.047685;
  const Z = red * 0.000088 + green * 0.07231 + blue * 0.986039;
  const sum = X + Y + Z;
  return sum === 0 ? { x: 0.3127, y: 0.329 } : {
    x: Number((X / sum).toFixed(4)),
    y: Number((Y / sum).toFixed(4))
  };
};

export function deviceControls(
  id: string,
  deviceName: string,
  features: string[],
  state: JsonObject,
  aliases: Map<string, string>
): DeviceControlView[] {
  const available = new Set([...features, ...Object.keys(state)]);
  const controls: DeviceControlView[] = [];

  for (const property of [...available].filter((key) => key === "state" || key.startsWith("state_")).sort()) {
    const value = onOff(state[property]);
    if (value === null) continue;
    const channel = suffixOf(property, "state");
    controls.push({
      id: channel,
      property,
      name: aliases.get(`${id}:${channel}`) ?? defaultChannelName(deviceName, channel),
      kind: "switch",
      value
    });
  }

  for (const property of [...available].filter((key) => key === "brightness" || key.startsWith("brightness_")).sort()) {
    const raw = state[property];
    if (typeof raw !== "number") continue;
    const channel = suffixOf(property, "brightness");
    controls.push({
      id: `${channel}:brightness`,
      property,
      name: channel === "main" ? "Parlaklık" : `${aliases.get(`${id}:${channel}`) ?? defaultChannelName(deviceName, channel)} parlaklığı`,
      kind: "level",
      value: raw,
      min: 1,
      max: 254
    });
  }

  for (const property of [...available].filter((key) => key === "color_temp" || key.startsWith("color_temp_")).sort()) {
    const raw = state[property];
    if (typeof raw !== "number") continue;
    const channel = suffixOf(property, "color_temp");
    controls.push({
      id: `${channel}:temperature`,
      property,
      name: channel === "main" ? "Işık sıcaklığı" : `${aliases.get(`${id}:${channel}`) ?? defaultChannelName(deviceName, channel)} sıcaklığı`,
      kind: "temperature",
      value: raw,
      min: 153,
      max: 500
    });
  }

  if (features.some((feature) => feature === "color" || feature === "color_xy" || feature === "color_hs")) {
    controls.push({
      id: "main:color",
      property: "color",
      name: "Renk",
      kind: "color",
      value: colorHex(state.color)
    });
  }

  return controls;
}
