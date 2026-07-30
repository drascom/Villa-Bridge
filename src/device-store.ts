import type {
  BridgeDevice,
  BridgeGroup,
  DeviceView,
  GroupView,
  JsonObject
} from "./types.js";
import { deviceControls } from "./device-controls.js";
import { canonicalDeviceModel, deviceIdentity } from "./device-identity.js";
import type { DeviceImagePreferences } from "./device-images.js";

interface StateEntry {
  value: JsonObject;
  updatedAt: Date;
}

interface PairingDevice {
  id: string;
  name: string;
  interviewCompleted: boolean;
  supported: boolean | null;
  reconnected: boolean;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTopicPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function featureNames(exposes: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.property === "string") names.add(value.property);
    if (typeof value.name === "string") names.add(value.name);
    if ("features" in value) visit(value.features);
  };
  visit(exposes);
  return [...names].sort();
}

function writableFeatureNames(exposes: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    const access = typeof value.access === "number" ? value.access : 0;
    if ((access & 2) !== 0) {
      if (typeof value.property === "string") names.add(value.property);
      if (typeof value.name === "string") names.add(value.name);
    }
    if ("features" in value) visit(value.features);
  };
  visit(exposes);
  return [...names].sort();
}

export class DeviceStore {
  private readonly aliases: Map<string, string>;
  private readonly states = new Map<string, StateEntry>();
  private readonly availability = new Map<string, "online" | "offline">();
  private devices: BridgeDevice[] = [];
  private groups: BridgeGroup[] = [];
  private bridgeOnline = false;
  private mqttConnected = false;
  private lastMessageAt: Date | null = null;
  private pairingUntil: Date | null = null;
  private pairingStatus: "closed" | "open" | "pending" | "error" = "closed";
  private pairingMessage: string | null = null;
  private pairingDevice: PairingDevice | null = null;
  private mode: "shadow" | "direct" = "shadow";

  constructor(
    aliases: Map<string, string>,
    private imagePreferences: DeviceImagePreferences = { devices: {}, models: {} }
  ) {
    this.aliases = aliases;
  }

  setImagePreferences(preferences: DeviceImagePreferences): void {
    this.imagePreferences = preferences;
  }

  setMqttConnected(connected: boolean): void {
    this.mqttConnected = connected;
  }

  setMode(mode: "shadow" | "direct"): void {
    this.mode = mode;
  }

  ingest(relativeTopic: string, payload: Buffer): void {
    this.lastMessageAt = new Date();
    const topic = normalizeTopicPart(relativeTopic);
    const parsed = this.parse(payload);
    if (topic === "bridge/devices" && Array.isArray(parsed)) {
      this.devices = parsed.filter(isObject) as BridgeDevice[];
      return;
    }
    if (topic === "bridge/groups" && Array.isArray(parsed)) {
      this.groups = parsed.filter(isObject) as BridgeGroup[];
      return;
    }
    if (topic === "bridge/state") {
      this.bridgeOnline = parsed === "online" || (isObject(parsed) && parsed.state === "online");
      return;
    }
    if (topic === "bridge/response/permit_join" && isObject(parsed)) {
      const status = parsed.status;
      if (status === "ok") {
        const time = isObject(parsed.data) && typeof parsed.data.time === "number" ? parsed.data.time : 0;
        this.setPairingOpen(time);
      } else {
        this.pairingStatus = "error";
        this.pairingMessage = typeof parsed.error === "string" ? parsed.error : "Eşleştirme açılamadı.";
      }
      return;
    }
    if (topic === "bridge/event" && isObject(parsed)) {
      this.ingestPairingEvent(parsed);
      return;
    }
    if (topic.startsWith("bridge/") || topic.endsWith("/set") || topic.endsWith("/get")) return;
    if (topic.endsWith("/availability")) {
      const name = topic.slice(0, -"/availability".length);
      const state = typeof parsed === "string" ? parsed : isObject(parsed) ? parsed.state : undefined;
      if (state === "online" || state === "offline") this.availability.set(name, state);
      return;
    }
    if (isObject(parsed)) this.states.set(topic, { value: parsed, updatedAt: new Date() });
  }

  getDevices(): DeviceView[] {
    return this.devices
      .filter((device) => device.type !== "Coordinator")
      .map((device) => {
        const sourceName = device.friendly_name ?? device.ieee_address ?? "unknown";
        const id = (device.ieee_address ?? sourceName).toLowerCase();
        const state = this.states.get(sourceName);
        const lastSeen = state?.value.last_seen;
        const availability: DeviceView["availability"] = this.availability.get(sourceName) ?? "unknown";
        const name = this.aliases.get(id) ?? sourceName;
        const exposes = device.definition?.exposes;
        const features = featureNames(exposes);
        const writableFeatures = writableFeatureNames(exposes);
        const image = deviceIdentity(
          id,
          device.definition?.model,
          device.manufacturer,
          this.imagePreferences
        );
        return {
          id,
          sourceName,
          name,
          type: device.type ?? "Unknown",
          model: canonicalDeviceModel(device.definition?.model, device.manufacturer),
          image,
          vendor: device.definition?.vendor ?? null,
          description: device.definition?.description ?? null,
          supported: device.supported !== false,
          interviewCompleted: device.interview_completed !== false,
          availability,
          lastSeen: typeof lastSeen === "string" || typeof lastSeen === "number" ? String(lastSeen) : null,
          stateUpdatedAt: state?.updatedAt.toISOString() ?? null,
          features,
          controls: deviceControls(id, name, writableFeatures, state?.value ?? {}, this.aliases),
          state: state?.value ?? {}
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  getDevice(id: string): DeviceView | undefined {
    const normalized = id.toLowerCase();
    return this.getDevices().find((device) => device.id === normalized);
  }

  getGroups(): GroupView[] {
    return this.groups
      .map((group) => {
        const sourceName = group.friendly_name ?? `group-${group.id ?? "unknown"}`;
        const id = `group-${group.id ?? sourceName}`.toLowerCase();
        return {
          id,
          sourceName,
          name: this.aliases.get(id) ?? sourceName,
          members: group.members?.length ?? 0,
          state: this.states.get(sourceName)?.value ?? {}
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  getHealth(): JsonObject {
    return {
      ok: this.mqttConnected && this.bridgeOnline,
      mode: this.mode,
      sourceConnected: this.mqttConnected,
      sourceOnline: this.bridgeOnline,
      mqttConnected: this.mqttConnected,
      sourceBridgeOnline: this.bridgeOnline,
      deviceCount: this.getDevices().length,
      groupCount: this.getGroups().length,
      stateCount: this.states.size,
      lastMessageAt: this.lastMessageAt?.toISOString() ?? null
    };
  }

  pairingRequested(seconds: number): void {
    this.pairingStatus = "pending";
    this.pairingUntil = new Date(Date.now() + seconds * 1_000);
    this.pairingMessage = "Koordinatörden onay bekleniyor.";
    this.pairingDevice = null;
  }

  pairingRequestFailed(message: string): void {
    this.pairingStatus = "error";
    this.pairingUntil = null;
    this.pairingMessage = message;
    this.pairingDevice = null;
  }

  getPairing(): JsonObject {
    if (this.pairingUntil && this.pairingUntil.getTime() <= Date.now()) {
      this.pairingUntil = null;
      this.pairingStatus = "closed";
      this.pairingMessage = null;
    }
    return {
      status: this.pairingStatus,
      open: this.pairingStatus === "open" || this.pairingStatus === "pending",
      until: this.pairingUntil?.toISOString() ?? null,
      message: this.pairingMessage,
      device: this.pairingDevice
    };
  }

  private parse(payload: Buffer): unknown {
    const text = payload.toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private setPairingOpen(seconds: number): void {
    if (seconds > 0 && this.pairingStatus !== "pending" && this.pairingStatus !== "open") {
      this.pairingDevice = null;
    }
    this.pairingStatus = seconds > 0 ? "open" : "closed";
    this.pairingUntil = seconds > 0 ? new Date(Date.now() + seconds * 1_000) : null;
    this.pairingMessage = seconds > 0 ? "Yeni Zigbee cihazları eklenebilir." : null;
  }

  private ingestPairingEvent(event: JsonObject): void {
    if (this.pairingStatus !== "open" && this.pairingStatus !== "pending") return;
    if (!isObject(event.data)) return;
    const id = typeof event.data.ieee_address === "string"
      ? event.data.ieee_address.toLowerCase()
      : null;
    if (!id) return;
    if (event.type === "device_joined") {
      this.pairingDevice = {
        id,
        name: typeof event.data.friendly_name === "string" ? event.data.friendly_name : id,
        interviewCompleted: false,
        supported: null,
        reconnected: false
      };
      return;
    }
    if (event.type === "device_announce") {
      const knownDevice = this.devices.find((device) =>
        device.ieee_address?.toLowerCase() === id
      );
      if (!knownDevice) return;
      this.pairingDevice = {
        id,
        name: typeof event.data.friendly_name === "string"
          ? event.data.friendly_name
          : knownDevice.friendly_name ?? id,
        interviewCompleted: knownDevice.interview_completed !== false,
        supported: typeof knownDevice.supported === "boolean" ? knownDevice.supported : null,
        reconnected: true
      };
      return;
    }
    if (
      event.type === "device_interview"
      && event.data.status === "successful"
      && this.pairingDevice?.id === id
    ) {
      this.pairingDevice = {
        ...this.pairingDevice,
        interviewCompleted: true,
        supported: typeof event.data.supported === "boolean" ? event.data.supported : null
      };
    }
  }
}
