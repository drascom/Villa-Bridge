import { join } from "node:path";
import { readFile, rename, writeFile } from "node:fs/promises";
import mqtt, { type MqttClient } from "mqtt";
import YAML from "yaml";
import { Controller, setLogger as setHerdsmanLogger, type Events } from "zigbee-herdsman";
import {
  findByDevice,
  postProcessConvertedFromZigbeeMessage,
  setLogger as setConverterLogger,
  type Definition
} from "zigbee-herdsman-converters";
import type { DirectZigbeeConfig } from "./config.js";
import type { AppConfig } from "./config.js";
import { DeviceStore } from "./device-store.js";
import { buildHomeAssistantDiscovery } from "./home-assistant-discovery.js";
import { inferFallbackExposes } from "./inferred-exposes.js";
import type { ZigbeeSource } from "./source.js";
import type { BridgeDevice, BridgeGroup, JsonObject } from "./types.js";

function messageText(value: string | (() => string)): string {
  return typeof value === "function" ? value() : value;
}

const quietLogger = {
  debug: (_value: string | (() => string), _namespace: string) => undefined,
  info: (value: string | (() => string), namespace: string) => console.info(`[${namespace}] ${messageText(value)}`),
  warning: (value: string | (() => string), namespace: string) => console.warn(`[${namespace}] ${messageText(value)}`),
  error: (value: string | (() => string), namespace: string) => console.error(`[${namespace}] ${messageText(value)}`)
};
setConverterLogger(quietLogger);
setHerdsmanLogger(quietLogger);

export function parsePermitJoinSeconds(payload: Buffer): number {
  const parsed = JSON.parse(payload.toString("utf8")) as { time?: number; value?: boolean };
  const requested = parsed.time ?? (parsed.value === true ? 180 : 0);
  return Math.min(254, Math.max(0, requested));
}

export interface RemovableZigbeeDevice {
  removeFromNetwork(): Promise<void>;
  removeFromDatabase(): void;
}

export async function removeZigbeeDevice(device: RemovableZigbeeDevice, force: boolean): Promise<void> {
  if (force) device.removeFromDatabase();
  else await device.removeFromNetwork();
}

export function directBridgeInfo(permitted: boolean, time: number): JsonObject {
  return {
    version: "1.0.0",
    commit: "villa-bridge-direct",
    permit_join: permitted,
    permit_join_timeout: time,
    zigbee_herdsman: { version: "embedded" },
    zigbee_herdsman_converters: { version: "embedded" },
    config: {
      availability: { enabled: true },
      advanced: {
        output: "json",
        legacy_api: false,
        legacy_availability_payload: false
      }
    }
  };
}

export function endpointNamesForDevice(
  id: string,
  aliases: ReadonlyMap<string, string>
): Record<string, string> {
  const prefix = `${id.toLowerCase()}:`;
  return Object.fromEntries(
    [...aliases.entries()]
      .filter(([key, value]) => key.toLowerCase().startsWith(prefix) && value.trim().length > 0)
      .map(([key, value]) => [key.slice(prefix.length), value.trim()])
  );
}

export class DirectZigbeeSource implements ZigbeeSource {
  private controller: Controller | null = null;
  private readonly definitions = new Map<string, Definition>();
  private readonly states = new Map<string, JsonObject>();
  private readonly abort = new AbortController();
  private mqtt: MqttClient | null = null;
  private bridgeDevices: BridgeDevice[] = [];
  private bridgeGroups: BridgeGroup[] = [];
  private homeAssistantDiscoveryTopics = new Set<string>();
  private pairingState = { permitted: false, time: 0 };
  private statePersistTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: DirectZigbeeConfig,
    private readonly mqttConfig: AppConfig["mqtt"],
    private readonly store: DeviceStore,
    private homeAssistantDiscoveryEnabled = false,
    private readonly aliases: ReadonlyMap<string, string> = new Map()
  ) {}

  async start(): Promise<void> {
    const controller = new Controller({
      network: {
        panID: this.config.network.panId,
        extendedPanID: this.config.network.extendedPanId,
        channelList: [this.config.network.channel],
        networkKey: this.config.network.networkKey
      },
      databasePath: join(this.config.dataDir, "database.db"),
      databaseBackupPath: join(this.config.dataDir, "database.db.backup"),
      backupPath: join(this.config.dataDir, "coordinator_backup.json"),
      serialPort: {
        path: this.config.serial.path,
        baudRate: this.config.serial.baudRate,
        rtscts: this.config.serial.rtscts,
        adapter: this.config.serial.adapter
      },
      adapter: {
        concurrent: this.config.adapter.concurrent,
        delay: this.config.adapter.delay,
        disableLED: this.config.adapter.disableLed ?? false,
        transmitPower: this.config.adapter.transmitPower
      },
      acceptJoiningDeviceHandler: async () => true
    });
    this.controller = controller;
    this.attachEvents(controller);
    await controller.start(this.abort.signal);
    this.store.setMqttConnected(true);
    this.store.ingest("bridge/state", Buffer.from('{"state":"online"}'));
    this.refreshGroups();
    await this.loadCachedStates();
    await this.refreshDevices();
    await this.startMqttCompatibility();
    const parameters = await controller.getNetworkParameters();
    console.log(`SLZB koordinatörü devralındı; Zigbee kanalı ${parameters.channel}.`);
    const initialStateTimer = setTimeout(() => void this.requestInitialActuatorStates(), 1_000);
    initialStateTimer.unref();
  }

  async permitJoin(seconds: number): Promise<void> {
    if (!this.controller) throw new Error("SLZB koordinatörü hazır değil.");
    await this.controller.permitJoin(seconds);
  }

  async renameDevice(id: string, name: string): Promise<void> {
    const device = this.controller?.getDeviceByIeeeAddr(id);
    if (!device) throw new Error("Cihaz bulunamadı.");
    const previousName = this.config.devices[id]?.friendly_name ?? id;
    this.config.devices[id] = { ...(this.config.devices[id] ?? {}), friendly_name: name };
    try {
      await this.persistDeviceConfiguration(id, name);
    } catch (error) {
      this.config.devices[id] = { ...(this.config.devices[id] ?? {}), friendly_name: previousName };
      throw error;
    }
    await this.refreshDevices();
    this.publish("bridge/response/device/rename", {
      status: "ok",
      data: { from: previousName, to: name }
    });
    const state = this.states.get(id);
    if (state) {
      this.store.ingest(name, Buffer.from(JSON.stringify(state)));
      this.publishRetained(previousName, "");
      this.publish(name, state, true);
    }
    this.publishHomeAssistantDiscovery();
  }

  async removeDevice(id: string, force = false): Promise<void> {
    const device = this.controller?.getDeviceByIeeeAddr(id);
    if (!device) throw new Error("Cihaz bulunamadı.");
    const previousName = this.config.devices[id]?.friendly_name ?? id;
    await removeZigbeeDevice(device, force);
    delete this.config.devices[id];
    await this.persistDeviceConfiguration(id, null);
    this.definitions.delete(id);
    this.states.delete(id);
    this.publishRetained(previousName, "");
    await this.refreshDevices();
    this.publish("bridge/response/device/remove", {
      status: "ok",
      data: { id: previousName, block: false, force }
    });
    this.publish("bridge/event", {
      type: "device_leave",
      data: { friendly_name: previousName, ieee_address: id }
    });
    await this.persistStates();
  }

  async stop(): Promise<void> {
    this.abort.abort();
    const controller = this.controller;
    this.controller = null;
    this.store.setMqttConnected(false);
    this.store.ingest("bridge/state", Buffer.from('{"state":"offline"}'));
    const mqttClient = this.mqtt;
    this.mqtt = null;
    if (this.statePersistTimer) {
      clearTimeout(this.statePersistTimer);
      this.statePersistTimer = null;
    }
    await this.persistStates();
    if (mqttClient) {
      mqttClient.publish(`${this.mqttConfig.baseTopic}/bridge/state`, JSON.stringify({ state: "offline" }), { retain: true });
      await new Promise<void>((resolve) => mqttClient.end(false, {}, () => resolve()));
    }
    if (controller && !controller.isStopping()) await controller.stop();
  }

  private attachEvents(controller: Controller): void {
    controller.on("adapterDisconnected", () => {
      this.store.setMqttConnected(false);
      this.store.ingest("bridge/state", Buffer.from('{"state":"offline"}'));
      this.publishRetained("bridge/state", { state: "offline" });
    });
    controller.on("permitJoinChanged", ({ permitted, time }) => {
      this.pairingState = { permitted, time: permitted ? time ?? 0 : 0 };
      const response = {
        status: "ok",
        data: {
          time: this.pairingState.time,
          value: permitted
        }
      };
      this.store.ingest(
        "bridge/response/permit_join",
        Buffer.from(JSON.stringify(response))
      );
      this.publish("bridge/response/permit_join", response);
      this.publishBridgeInfo();
    });
    controller.on("deviceJoined", async ({ device }) => {
      const friendlyName = this.config.devices[device.ieeeAddr]?.friendly_name ?? device.ieeeAddr;
      const event = {
        type: "device_joined",
        data: { friendly_name: friendlyName, ieee_address: device.ieeeAddr }
      };
      this.store.ingest("bridge/event", Buffer.from(JSON.stringify(event)));
      this.publish("bridge/event", event);
      await this.refreshDevices();
    });
    const announceKnownDevice = (device: { ieeeAddr: string }): void => {
      if (!this.pairingState.permitted) return;
      const friendlyName = this.config.devices[device.ieeeAddr]?.friendly_name ?? device.ieeeAddr;
      const event = {
        type: "device_announce",
        data: { friendly_name: friendlyName, ieee_address: device.ieeeAddr }
      };
      this.store.ingest("bridge/event", Buffer.from(JSON.stringify(event)));
      this.publish("bridge/event", event);
    };
    controller.on("deviceAnnounce", ({ device }) => announceKnownDevice(device));
    controller.on("lastSeenChanged", ({ device, reason }) => {
      if (reason === "deviceJoined") announceKnownDevice(device);
    });
    controller.on("deviceLeave", async ({ ieeeAddr }) => {
      const friendlyName = this.config.devices[ieeeAddr]?.friendly_name ?? ieeeAddr;
      this.publish("bridge/event", {
        type: "device_leave",
        data: { friendly_name: friendlyName, ieee_address: ieeeAddr }
      });
      await this.refreshDevices();
    });
    controller.on("deviceInterview", async ({ status, device }) => {
      if (status !== "successful") return;
      const definition = await findByDevice(device);
      if (definition) {
        this.definitions.set(device.ieeeAddr, definition);
        const coordinator = controller.getDevicesByType("Coordinator")[0]?.getEndpoint(1);
        if (definition.configure && coordinator) {
          try {
            await definition.configure(device, coordinator, definition);
          } catch (error) {
            console.warn(`Yeni cihaz raporlama ayarları tamamlanamadı (${device.ieeeAddr}): ${String(error)}`);
          }
        }
      }
      await this.refreshDevices();
      void this.requestInitialActuatorStates();
      const event = {
        type: "device_interview",
        data: {
          friendly_name: this.config.devices[device.ieeeAddr]?.friendly_name ?? device.ieeeAddr,
          ieee_address: device.ieeeAddr,
          status,
          supported: Boolean(definition)
        }
      };
      this.store.ingest("bridge/event", Buffer.from(JSON.stringify(event)));
      this.publish("bridge/event", event);
    });
    controller.on("message", (message) => void this.onMessage(message));
  }

  private async refreshDevices(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    const devices: BridgeDevice[] = [];
    for (const device of controller.getDevicesIterator()) {
      if (device.type === "Coordinator") {
        devices.push({
          ieee_address: device.ieeeAddr,
          friendly_name: "Coordinator",
          type: "Coordinator",
          disabled: false,
          supported: true,
          interview_completed: true,
          interviewing: false
        });
        continue;
      }
      const configured = this.config.devices[device.ieeeAddr] ?? {};
      const endpointNames = endpointNamesForDevice(device.ieeeAddr, this.aliases);
      const definition = await findByDevice(device);
      if (definition) this.definitions.set(device.ieeeAddr, definition);
      const options = configured as JsonObject;
      const fallbackExposes = definition
        ? []
        : inferFallbackExposes(this.states.get(device.ieeeAddr));
      const exposes = definition
        ? typeof definition.exposes === "function"
          ? definition.exposes(device, options)
          : definition.exposes
        : fallbackExposes;
      const inferredDefinition = fallbackExposes.length > 0 ? {
        model: device.modelID ?? "Unknown",
        vendor: device.manufacturerName ?? "Unknown",
        description: "Capabilities inferred from cached Zigbee state",
        exposes: fallbackExposes,
        options: []
      } : undefined;
      devices.push({
        ieee_address: device.ieeeAddr,
        friendly_name: configured.friendly_name ?? device.ieeeAddr,
        model_id: device.modelID ?? "",
        type: device.type,
        disabled: configured.disabled === true,
        interview_completed: device.interviewState === "SUCCESSFUL",
        interviewing: device.interviewState === "IN_PROGRESS",
        supported: Boolean(definition) || Boolean(inferredDefinition),
        network_address: device.networkAddress,
        date_code: device.dateCode,
        manufacturer: device.manufacturerName,
        power_source: device.powerSource,
        software_build_id: device.softwareBuildID,
        definition: definition ? {
          model: definition.model,
          vendor: definition.vendor,
          description: definition.description,
          exposes,
          options: definition.options ?? []
        } : inferredDefinition,
        ...(Object.keys(endpointNames).length > 0 ? { endpoint_names: endpointNames } : {}),
        endpoints: Object.fromEntries(device.endpoints.map((endpoint) => [String(endpoint.ID), {
          bindings: [],
          configured_reportings: [],
          clusters: {
            input: endpoint.inputClusters,
            output: endpoint.outputClusters
          },
          scenes: {}
        }]))
      });
    }
    this.bridgeDevices = devices;
    this.store.ingest("bridge/devices", Buffer.from(JSON.stringify(devices)));
    this.publishRetained("bridge/devices", devices);
    this.publishHomeAssistantDiscovery();
  }

  private refreshGroups(): void {
    const controller = this.controller;
    if (!controller) return;
    this.bridgeGroups = [...controller.getGroupsIterator()].map((group) => ({
      id: group.groupID,
      friendly_name: this.config.groups[String(group.groupID)]?.friendly_name ?? `group-${group.groupID}`,
      members: group.members.map((endpoint) => ({
        ieee_address: endpoint.deviceIeeeAddress,
        endpoint: endpoint.ID
      })),
      scenes: []
    }));
    this.store.ingest("bridge/groups", Buffer.from(JSON.stringify(this.bridgeGroups)));
    this.publishRetained("bridge/groups", this.bridgeGroups);
  }

  private async onMessage(message: Events.MessagePayload): Promise<void> {
    const definition = this.definitions.get(message.device.ieeeAddr) ?? await findByDevice(message.device);
    if (!definition) return;
    this.definitions.set(message.device.ieeeAddr, definition);
    const configured = this.config.devices[message.device.ieeeAddr] ?? {};
    const friendlyName = configured.friendly_name ?? message.device.ieeeAddr;
    const options = configured as JsonObject;
    const previous = this.states.get(message.device.ieeeAddr) ?? {};
    const matching = definition.fromZigbee.filter((converter) => {
      const types = Array.isArray(converter.type) ? converter.type : [converter.type];
      return converter.cluster === message.cluster && types.includes(message.type as never);
    });
    const publish = (payload: JsonObject): void => {
      const merged = { ...(this.states.get(message.device.ieeeAddr) ?? {}), ...payload };
      this.states.set(message.device.ieeeAddr, merged);
      this.store.ingest(friendlyName, Buffer.from(JSON.stringify(merged)));
      this.store.ingest(`${friendlyName}/availability`, Buffer.from('{"state":"online"}'));
      this.publish(friendlyName, merged, true);
      this.publish(`${friendlyName}/availability`, { state: "online" }, true);
      this.queueStatePersistence();
    };
    let result: JsonObject = {};
    for (const converter of matching) {
      try {
        const converted = await converter.convert(
          definition,
          message as never,
          publish,
          options,
          {
            device: message.device,
            state: previous,
            deviceExposesChanged: () => void this.refreshDevices()
          }
        );
        if (converted && typeof converted === "object") result = { ...result, ...converted };
      } catch (error) {
        console.warn(`Zigbee mesajı dönüştürülemedi (${friendlyName}): ${String(error)}`);
      }
    }
    if (Object.keys(result).length > 0) {
      postProcessConvertedFromZigbeeMessage(definition, result, options, message.device);
      publish(result);
    }
  }

  private async startMqttCompatibility(): Promise<void> {
    const client = mqtt.connect(this.mqttConfig.url, {
      username: this.mqttConfig.username,
      password: this.mqttConfig.password,
      clientId: `villa-bridge-direct-${process.pid}`,
      clean: true,
      reconnectPeriod: 2_000
    });
    this.mqtt = client;
    client.on("error", (error) => console.error(`Uyumluluk MQTT hatası: ${error.message}`));
    client.on("message", (topic, payload) => {
      if (topic === "homeassistant/status" && payload.toString("utf8").trim().toLowerCase() === "online") {
        this.publishHomeAssistantDiscovery();
        return;
      }
      void this.onMqttCommand(topic, payload);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Uyumluluk MQTT bağlantısı zaman aşımına uğradı.")), 10_000);
      client.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      client.subscribe([
        `${this.mqttConfig.baseTopic}/+/set`,
        `${this.mqttConfig.baseTopic}/+/get`,
        `${this.mqttConfig.baseTopic}/bridge/request/permit_join`,
        "homeassistant/status"
      ], { qos: 1 }, (error) => error ? reject(error) : resolve());
    });
    this.publishRetained("bridge/state", { state: "online" });
    this.publishBridgeInfo();
    this.publishRetained("bridge/devices", this.bridgeDevices);
    this.publishRetained("bridge/groups", this.bridgeGroups);
    for (const [ieeeAddress, state] of this.states) {
      const friendlyName = this.config.devices[ieeeAddress]?.friendly_name ?? ieeeAddress;
      this.publish(friendlyName, state, true);
    }
    this.publishHomeAssistantDiscovery();
    console.log("Home Assistant ve Matterbridge için MQTT uyumluluk katmanı hazır.");
  }

  private publishHomeAssistantDiscovery(): void {
    const client = this.mqtt;
    if (!client?.connected) return;
    const messages = buildHomeAssistantDiscovery(this.store.getDevices(), this.mqttConfig.baseTopic);
    const currentTopics = new Set(messages.map((item) => item.topic));
    if (!this.homeAssistantDiscoveryEnabled) {
      for (const topic of new Set([...this.homeAssistantDiscoveryTopics, ...currentTopics])) {
        client.publish(topic, "", { retain: true });
      }
      this.homeAssistantDiscoveryTopics.clear();
      return;
    }
    for (const topic of this.homeAssistantDiscoveryTopics) {
      if (!currentTopics.has(topic)) client.publish(topic, "", { retain: true });
    }
    for (const item of messages) {
      client.publish(item.topic, JSON.stringify(item.payload), { retain: true });
    }
    this.homeAssistantDiscoveryTopics = currentTopics;
  }

  setHomeAssistantDiscovery(enabled: boolean): void {
    this.homeAssistantDiscoveryEnabled = enabled;
    this.publishHomeAssistantDiscovery();
  }

  private async loadCachedStates(): Promise<void> {
    try {
      const cached = JSON.parse(
        await readFile(join(this.config.dataDir, "state.json"), "utf8")
      ) as Record<string, unknown>;
      for (const [ieeeAddress, configured] of Object.entries(this.config.devices)) {
        const value = cached[ieeeAddress];
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const state = value as JsonObject;
        const friendlyName = configured.friendly_name ?? ieeeAddress;
        this.states.set(ieeeAddress, state);
        this.store.ingest(friendlyName, Buffer.from(JSON.stringify(state)));
      }
      for (const group of this.bridgeGroups) {
        const value = cached[String(group.id)];
        if (!value || typeof value !== "object" || Array.isArray(value) || !group.friendly_name) continue;
        this.store.ingest(group.friendly_name, Buffer.from(JSON.stringify(value)));
      }
      console.log(`${this.states.size} cihazın son durumu önbellekten yüklendi.`);
    } catch (error) {
      console.warn(`Zigbee durum önbelleği okunamadı: ${String(error)}`);
    }
  }

  private async requestInitialActuatorStates(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    for (const device of controller.getDevicesIterator()) {
      if (device.type !== "Router") continue;
      const definition = this.definitions.get(device.ieeeAddr) ?? await findByDevice(device);
      if (!definition) continue;
      const endpoint = device.getEndpoint(1) ?? device.endpoints[0];
      if (!endpoint) continue;
      const configured = this.config.devices[device.ieeeAddr] ?? {};
      const options = configured as JsonObject;
      const state = this.states.get(device.ieeeAddr) ?? {};
      for (const key of ["state", "brightness", "color_temp"]) {
        const converter = definition.toZigbee.find((item) =>
          item.key?.includes(key) && typeof item.convertGet === "function"
        );
        if (!converter?.convertGet) continue;
        try {
          await converter.convertGet(endpoint, key, {
            message: {},
            device,
            mapped: definition,
            options,
            state,
            endpoint_name: undefined
          } as never);
        } catch (error) {
          console.warn(`Başlangıç cihaz durumu okunamadı (${device.ieeeAddr}/${key}): ${String(error)}`);
        }
      }
    }
  }

  private async onMqttCommand(topic: string, payload: Buffer): Promise<void> {
    const prefix = `${this.mqttConfig.baseTopic}/`;
    if (!topic.startsWith(prefix)) return;
    const relative = topic.slice(prefix.length);
    if (relative === "bridge/request/permit_join") {
      try {
        await this.permitJoin(parsePermitJoinSeconds(payload));
      } catch (error) {
        console.warn(`Eşleştirme komutu işlenemedi: ${String(error)}`);
      }
      return;
    }
    if (relative.endsWith("/get")) {
      const friendlyName = relative.slice(0, -4);
      const deviceEntry = Object.entries(this.config.devices)
        .find(([, options]) => options.friendly_name === friendlyName);
      const state = deviceEntry ? this.states.get(deviceEntry[0]) : undefined;
      if (state) this.publish(friendlyName, state, true);
      return;
    }
    if (!relative.endsWith("/set")) return;
    const friendlyName = relative.slice(0, -4);
    const deviceEntry = Object.entries(this.config.devices)
      .find(([, options]) => options.friendly_name === friendlyName);
    const ieeeAddress = deviceEntry?.[0] ?? friendlyName;
    try {
      const text = payload.toString("utf8");
      let command: JsonObject;
      try {
        const parsed = JSON.parse(text) as unknown;
        command = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? parsed as JsonObject
          : { state: parsed };
      } catch {
        command = { state: text };
      }
      await this.setDevice(ieeeAddress, command);
    } catch (error) {
      console.warn(`Cihaz komutu işlenemedi (${friendlyName}): ${String(error)}`);
    }
  }

  async setDevice(ieeeAddress: string, command: JsonObject): Promise<void> {
    const controller = this.controller;
    const device = controller?.getDeviceByIeeeAddr(ieeeAddress);
    if (!device) throw new Error("Cihaz bulunamadı.");
    const definition = this.definitions.get(ieeeAddress) ?? await findByDevice(device);
    if (!definition) throw new Error("Cihaz dönüştürücüsü bulunamadı.");
    const configured = this.config.devices[ieeeAddress] ?? {};
    const options = configured as JsonObject;
    let state = this.states.get(ieeeAddress) ?? {};
    const endpointMap = definition.endpoint?.(device) ?? {};
    for (const [requestedKey, value] of Object.entries(command)) {
      const endpointName = Object.keys(endpointMap).find((name) => requestedKey.endsWith(`_${name}`));
      const baseKey = endpointName ? requestedKey.slice(0, -(endpointName.length + 1)) : requestedKey;
      const converter = definition.toZigbee.find((item) =>
        !item.key || item.key.includes(requestedKey) || item.key.includes(baseKey)
      );
      if (!converter?.convertSet) throw new Error(`'${requestedKey}' komutu desteklenmiyor.`);
      const endpointId = endpointName ? endpointMap[endpointName] : undefined;
      const endpoint = (endpointId ? device.getEndpoint(endpointId) : device.getEndpoint(1)) ?? device.endpoints[0];
      if (!endpoint) throw new Error("Cihaz uç noktası bulunamadı.");
      const publish = (update: JsonObject): void => {
        state = { ...state, ...update };
        this.states.set(ieeeAddress, state);
      };
      const converterMessage = endpointName
        ? Object.fromEntries(Object.entries(command).map(([key, item]) => [
            key.endsWith(`_${endpointName}`) ? key.slice(0, -(endpointName.length + 1)) : key,
            item
          ]))
        : command;
      const result = await converter.convertSet(endpoint, baseKey, value, {
        message: converterMessage,
        device,
        mapped: definition,
        options,
        state,
        endpoint_name: endpointName,
        publish
      });
      if (result?.state) state = { ...state, ...result.state };
    }
    this.states.set(ieeeAddress, state);
    const friendlyName = configured.friendly_name ?? ieeeAddress;
    this.store.ingest(friendlyName, Buffer.from(JSON.stringify(state)));
    this.publish(friendlyName, state, true);
    await this.persistStates();
  }

  private publishBridgeInfo(): void {
    this.publishRetained(
      "bridge/info",
      directBridgeInfo(this.pairingState.permitted, this.pairingState.time)
    );
  }

  private queueStatePersistence(): void {
    if (this.statePersistTimer) clearTimeout(this.statePersistTimer);
    this.statePersistTimer = setTimeout(() => {
      this.statePersistTimer = null;
      void this.persistStates().catch((error) => {
        console.warn(`Zigbee durum önbelleği yazılamadı: ${String(error)}`);
      });
    }, 250);
    this.statePersistTimer.unref();
  }

  private async persistStates(): Promise<void> {
    const path = join(this.config.dataDir, "state.json");
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(Object.fromEntries(this.states), null, 2)}\n`,
      "utf8"
    );
    await rename(temporaryPath, path);
  }

  private async persistDeviceConfiguration(id: string, name: string | null): Promise<void> {
    const path = this.config.configurationFile;
    if (!path) throw new Error("Zigbee yapılandırma dosyası tanımlı değil.");
    const document = YAML.parseDocument(await readFile(path, "utf8"));
    if (name === null) document.deleteIn(["devices", id]);
    else document.setIn(["devices", id, "friendly_name"], name);
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, document.toString(), "utf8");
    await rename(temporaryPath, path);
  }

  private publish(relativeTopic: string, value: unknown, retain = false): void {
    const client = this.mqtt;
    if (!client?.connected) return;
    client.publish(
      `${this.mqttConfig.baseTopic}/${relativeTopic}`,
      typeof value === "string" ? value : JSON.stringify(value),
      { retain }
    );
  }

  private publishRetained(relativeTopic: string, value: unknown): void {
    this.publish(relativeTopic, value, true);
  }
}
