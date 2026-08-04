import type {
  BridgeDevice,
  BridgeGroup,
  DeviceEventView,
  DeviceView,
  GroupView,
  JsonObject,
  JsonScalar
} from "./types.js";
import { deviceButtons } from "./device-buttons.js";
import { detectDeviceCategory, resolveDeviceCategory, type DeviceRole } from "./device-category.js";
import { deviceControls, type WritableFeature } from "./device-controls.js";
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

export function featureValues(exposes: unknown, property: string): string[] {
  const values = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    if (value.property === property && Array.isArray(value.values)) {
      for (const item of value.values) {
        if (typeof item === "string" && item.trim()) values.add(item);
      }
    }
    if ("features" in value) visit(value.features);
  };
  visit(exposes);
  return [...values].sort();
}

function scalar(value: unknown): JsonScalar | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;
}

function deviceEndpoints(device: BridgeDevice): DeviceView["endpoints"] {
  if (!isObject(device.endpoints)) return [];
  return Object.entries(device.endpoints).flatMap(([key, rawEndpoint]) => {
    if (!isObject(rawEndpoint)) return [];
    const id = Number(key);
    if (!Number.isInteger(id) || id < 1 || id > 240) return [];
    const clusters = isObject(rawEndpoint.clusters) ? rawEndpoint.clusters : {};
    const inputClusters = Array.isArray(clusters.input)
      ? clusters.input.filter((value): value is string | number =>
        typeof value === "string" || typeof value === "number"
      )
      : [];
    const outputClusters = Array.isArray(clusters.output)
      ? clusters.output.filter((value): value is string | number =>
        typeof value === "string" || typeof value === "number"
      )
      : [];
    const bindings = Array.isArray(rawEndpoint.bindings)
      ? rawEndpoint.bindings.flatMap((rawBinding) => {
        if (!isObject(rawBinding) || !isObject(rawBinding.target)) return [];
        const cluster = isObject(rawBinding.cluster)
          ? rawBinding.cluster.name
          : rawBinding.cluster;
        if (typeof cluster !== "string" && typeof cluster !== "number") return [];
        const target = rawBinding.target;
        const targetDevice = typeof target.ieee_address === "string"
          ? target.ieee_address.toLowerCase()
          : typeof target.deviceIeeeAddress === "string"
            ? target.deviceIeeeAddress.toLowerCase()
            : null;
        const groupId = Number(target.id ?? target.groupID);
        const targetType: "device" | "group" | null = targetDevice
          ? "device"
          : Number.isInteger(groupId)
            ? "group"
            : null;
        if (!targetType) return [];
        const endpoint = Number(target.endpoint ?? target.endpointID ?? target.ID);
        return [{
          cluster: String(cluster),
          targetType,
          targetId: targetDevice ?? `group-${groupId}`,
          targetEndpoint: Number.isInteger(endpoint) ? endpoint : null
        }];
      })
      : [];
    return [{
      id,
      name: device.endpoint_names?.[key] ?? `EP ${id}`,
      inputClusters,
      outputClusters,
      bindings
    }];
  }).sort((left, right) => left.id - right.id);
}

function writableFeatures(exposes: unknown): WritableFeature[] {
  const features = new Map<string, WritableFeature>();
  const visit = (
    value: unknown,
    parent: { type?: string; name?: string; category?: string } = {}
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, parent));
      return;
    }
    if (!isObject(value)) return;
    const access = typeof value.access === "number" ? value.access : 0;
    const property = typeof value.property === "string" ? value.property : undefined;
    if ((access & 2) !== 0 && property) {
      features.set(property, {
        property,
        name: typeof value.name === "string" ? value.name : property,
        type: typeof value.type === "string" ? value.type : "",
        parentType: parent.type,
        parentName: parent.name,
        min: typeof value.value_min === "number" ? value.value_min : undefined,
        max: typeof value.value_max === "number" ? value.value_max : undefined,
        step: typeof value.value_step === "number" ? value.value_step : undefined,
        unit: typeof value.unit === "string" ? value.unit : undefined,
        values: Array.isArray(value.values)
          ? value.values.map(scalar).filter((item): item is JsonScalar => item !== undefined)
          : undefined,
        valueOn: scalar(value.value_on),
        valueOff: scalar(value.value_off),
        valueToggle: scalar(value.value_toggle),
        category: typeof value.category === "string" ? value.category : parent.category
      });
    }
    if ("features" in value) {
      visit(value.features, {
        type: typeof value.type === "string" ? value.type : parent.type,
        name: typeof value.name === "string" ? value.name : parent.name,
        category: typeof value.category === "string" ? value.category : parent.category
      });
    }
  };
  visit(exposes);
  return [...features.values()].sort((left, right) => left.property.localeCompare(right.property, "en"));
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
  private lowBatteryThreshold = 15;
  private readonly events: DeviceEventView[];

  constructor(
    aliases: Map<string, string>,
    private imagePreferences: DeviceImagePreferences = { devices: {}, models: {} },
    initialEvents: DeviceEventView[] = [],
    private readonly onEventsChanged?: (
      events: DeviceEventView[],
      added: DeviceEventView[]
    ) => void,
    /** Kullanıcının seçtiği roller; IEEE adresine göre, paylaşılan canlı harita. */
    private readonly roles: Map<string, DeviceRole> = new Map()
  ) {
    this.aliases = aliases;
    this.events = initialEvents.slice(0, 200);
  }

  setImagePreferences(preferences: DeviceImagePreferences): void {
    this.imagePreferences = preferences;
  }

  setLowBatteryThreshold(threshold: number): void {
    if (!Number.isInteger(threshold) || threshold < 5 || threshold > 50) {
      throw new Error("Düşük pil eşiği 5-50 arasında olmalıdır.");
    }
    const previousThreshold = this.lowBatteryThreshold;
    this.lowBatteryThreshold = threshold;
    if (previousThreshold === threshold) return;
    const at = new Date().toISOString();
    const events: DeviceEventView[] = [];
    for (const [sourceName, state] of this.states) {
      if (typeof state.value.battery !== "number") continue;
      const wasLow = state.value.battery <= previousThreshold;
      const low = state.value.battery <= threshold;
      if (low !== wasLow) {
        events.push({ sourceName, property: "battery_threshold", value: low, at });
      }
    }
    this.recordEvents(events);
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
      if (state === "online" || state === "offline") {
        if (this.availability.get(name) !== state) {
          const lastAvailability = this.events.find((event) =>
            event.sourceName === name && event.property === "availability"
          );
          if (lastAvailability?.value !== state) {
            this.recordEvents([{
              sourceName: name,
              property: "availability",
              value: state,
              at: new Date().toISOString()
            }]);
          }
        }
        this.availability.set(name, state);
      }
      return;
    }
    if (isObject(parsed)) {
      const previous = this.states.get(topic)?.value ?? {};
      const at = new Date();
      const interesting = new Set([
        "action", "state", "contact", "occupancy", "presence", "smoke",
        "carbon_monoxide", "battery_low", "alarm", "lock_state", "water_leak"
      ]);
      const events: DeviceEventView[] = [];
      for (const [property, value] of Object.entries(parsed)) {
        if (!interesting.has(property)) continue;
        // `action` anlık bir kenar olayıdır ve kalıcı duruma yazılmaz: aynı düğmeye arka arkaya
        // basılırsa iki ayrı olay üretilmeli. Diğer özellikler yalnızca değer değişince olay olur.
        if (property !== "action" && previous[property] === value) continue;
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
        if (property === "action" && typeof value === "string" && value.trim() === "") continue;
        events.push({ sourceName: topic, property, value, at: at.toISOString() });
      }
      if (typeof parsed.battery === "number") {
        const low = parsed.battery <= this.lowBatteryThreshold;
        const previousLow = typeof previous.battery === "number"
          ? previous.battery <= this.lowBatteryThreshold
          : undefined;
        if (low !== previousLow && (low || previousLow !== undefined)) {
          events.push({
            sourceName: topic,
            property: "battery_threshold",
            value: low,
            at: at.toISOString()
          });
        }
      }
      this.recordEvents(events);
      this.states.set(topic, { value: parsed, updatedAt: at });
      this.completeReconnectedPairingFromState(topic);
    }
  }

  getEvents(limit = 20): DeviceEventView[] {
    return this.events.slice(0, Math.max(0, Math.min(100, limit)));
  }

  private recordEvents(events: DeviceEventView[]): void {
    if (events.length === 0) return;
    const added = events.slice();
    this.events.unshift(...events.reverse());
    if (this.events.length > 200) this.events.length = 200;
    this.onEventsChanged?.(this.events.slice(), added);
  }

  /** Olay akışındaki `sourceName` değerini kalıcı IEEE adresine çevirir (UID kuralı). */
  getDeviceIdBySourceName(sourceName: string): string | undefined {
    const device = this.devices.find((entry) => entry.friendly_name === sourceName);
    const id = device?.ieee_address ?? (
      this.devices.some((entry) => entry.ieee_address === sourceName) ? sourceName : undefined
    );
    return id?.toLowerCase();
  }

  getDevices(): DeviceView[] {
    this.expirePairingIfNeeded();
    const pairingActive = this.pairingStatus === "open" || this.pairingStatus === "pending";
    // Olaylar en yeniden eskiye sıralı: her cihaz için ilk `action` kaydı son basılan düğmedir.
    const lastActions = new Map<string, DeviceEventView>();
    for (const event of this.events) {
      if (event.property !== "action" || typeof event.value !== "string") continue;
      if (!lastActions.has(event.sourceName)) lastActions.set(event.sourceName, event);
    }
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
        const actionTypes = featureValues(exposes, "action");
        const writable = writableFeatures(exposes);
        const image = deviceIdentity(
          id,
          device.definition?.model,
          device.manufacturer,
          this.imagePreferences
        );
        const stateValue = state?.value ?? {};
        const alerts: DeviceView["alerts"] = [];
        if (
          stateValue.battery_low === true
          || (
            typeof stateValue.battery === "number"
            && stateValue.battery <= this.lowBatteryThreshold
          )
        ) {
          alerts.push({
            code: "low_battery",
            severity: "warning",
            ...(typeof stateValue.battery === "number" ? { value: stateValue.battery } : {}),
            threshold: this.lowBatteryThreshold
          });
        }
        const buttons = deviceButtons(id, actionTypes, this.aliases);
        const lastActionEvent = lastActions.get(sourceName);
        const lastAction = lastActionEvent
          ? {
            action: String(lastActionEvent.value),
            buttonId: buttons.find((button) =>
              button.actions.some((action) => action.action === lastActionEvent.value)
            )?.id ?? null,
            at: lastActionEvent.at
          }
          : null;
        if (stateValue.smoke === true) alerts.push({ code: "smoke", severity: "critical" });
        if (stateValue.carbon_monoxide === true) {
          alerts.push({ code: "carbon_monoxide", severity: "critical" });
        }
        const detectedCategory = detectDeviceCategory(exposes);
        const role = this.roles.get(id) ?? "auto";
        return {
          id,
          sourceName,
          name,
          type: device.type ?? "Unknown",
          category: resolveDeviceCategory(detectedCategory, role),
          detectedCategory,
          role,
          model: canonicalDeviceModel(device.definition?.model, device.manufacturer),
          image,
          vendor: device.definition?.vendor ?? null,
          description: device.definition?.description ?? null,
          supported: device.supported !== false,
          interviewCompleted: device.interview_completed !== false,
          preparing: pairingActive
            && this.pairingDevice?.id === id
            && this.pairingDevice.interviewCompleted !== true,
          availability,
          lastSeen: typeof lastSeen === "string" || typeof lastSeen === "number" ? String(lastSeen) : null,
          stateUpdatedAt: state?.updatedAt.toISOString() ?? null,
          otaSupported: device.definition?.ota === true || device.definition?.supports_ota === true,
          options: {
            transition: device.configured_options?.transition ?? 0,
            debounce: device.configured_options?.debounce ?? 0,
            retain: device.configured_options?.retain ?? false
          },
          endpoints: deviceEndpoints(device),
          features,
          actionTypes,
          buttons,
          lastAction,
          alerts,
          controls: deviceControls(id, name, writable, stateValue, this.aliases),
          state: stateValue
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
          memberIds: (group.members ?? [])
            .map((member) => member.ieee_address?.toLowerCase())
            .filter((member): member is string => Boolean(member)),
          scenes: (group.scenes ?? []).flatMap((scene) =>
            Number.isInteger(scene.id)
              ? [{ id: Number(scene.id), name: scene.name?.trim() || `Scene ${scene.id}` }]
              : []
          ),
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
    this.expirePairingIfNeeded();
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

  private expirePairingIfNeeded(): void {
    if (!this.pairingUntil || this.pairingUntil.getTime() > Date.now()) return;
    this.pairingUntil = null;
    this.pairingStatus = "closed";
    this.pairingMessage = null;
  }

  private completeReconnectedPairingFromState(sourceName: string): void {
    if (
      !this.pairingDevice?.reconnected
      || this.pairingDevice.interviewCompleted
    ) {
      return;
    }
    const device = this.devices.find((candidate) => {
      const id = candidate.ieee_address?.toLowerCase();
      const name = candidate.friendly_name ?? candidate.ieee_address;
      return id === this.pairingDevice?.id && name === sourceName;
    });
    if (!device) return;
    this.pairingDevice = {
      ...this.pairingDevice,
      interviewCompleted: true,
      supported: typeof device.supported === "boolean" ? device.supported : null
    };
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
        interviewCompleted: false,
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
