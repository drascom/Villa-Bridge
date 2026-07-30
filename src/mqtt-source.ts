import mqtt, { type MqttClient } from "mqtt";
import type { AppConfig } from "./config.js";
import { DeviceStore } from "./device-store.js";
import type { ZigbeeSource } from "./source.js";
import type { JsonObject } from "./types.js";

export class MqttShadowSource implements ZigbeeSource {
  private client: MqttClient | null = null;

  constructor(
    private readonly config: AppConfig["mqtt"],
    private readonly store: DeviceStore
  ) {}

  start(): void {
    const prefix = `${this.config.baseTopic}/`;
    this.client = mqtt.connect(this.config.url, {
      username: this.config.username,
      password: this.config.password,
      clientId: `villa-bridge-shadow-${process.pid}`,
      clean: true,
      reconnectPeriod: 2_000,
      connectTimeout: 10_000
    });
    this.client.on("connect", () => {
      this.store.setMqttConnected(true);
      this.client?.subscribe(`${this.config.baseTopic}/#`, { qos: 0 }, (error) => {
        if (error) console.error(`MQTT abonelik hatası: ${error.message}`);
      });
      console.log("Canlı Zigbee verisine bağlandı (salt okunur gölge modu).");
    });
    this.client.on("reconnect", () => this.store.setMqttConnected(false));
    this.client.on("close", () => this.store.setMqttConnected(false));
    this.client.on("offline", () => this.store.setMqttConnected(false));
    this.client.on("error", (error) => console.error(`MQTT bağlantı hatası: ${error.message}`));
    this.client.on("message", (topic, payload) => {
      if (topic.startsWith(prefix)) this.store.ingest(topic.slice(prefix.length), payload);
    });
  }

  async permitJoin(seconds: number): Promise<void> {
    const client = this.client;
    if (!client?.connected) throw new Error("Zigbee ağına bağlı değil.");
    const topic = `${this.config.baseTopic}/bridge/request/permit_join`;
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify({ time: seconds }), { qos: 1 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async setDevice(id: string, command: JsonObject): Promise<void> {
    const device = this.store.getDevice(id);
    if (!device) throw new Error("Cihaz bulunamadı.");
    await this.publish(`${this.config.baseTopic}/${device.sourceName}/set`, command);
  }

  async renameDevice(id: string, name: string): Promise<void> {
    const device = this.store.getDevice(id);
    if (!device) throw new Error("Cihaz bulunamadı.");
    await this.publish(`${this.config.baseTopic}/bridge/request/device/rename`, {
      from: device.sourceName,
      to: name,
      homeassistant_rename: true
    });
  }

  async removeDevice(id: string, force = false): Promise<void> {
    if (!this.store.getDevice(id)) throw new Error("Cihaz bulunamadı.");
    await this.publish(`${this.config.baseTopic}/bridge/request/device/remove`, { id, force });
  }

  setHomeAssistantDiscovery(_enabled: boolean): void {
    // Shadow mode leaves discovery ownership with the external Zigbee2MQTT instance.
  }

  private async publish(topic: string, value: JsonObject): Promise<void> {
    const client = this.client;
    if (!client?.connected) throw new Error("Zigbee ağına bağlı değil.");
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify(value), { qos: 1 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    await new Promise<void>((resolve, reject) => {
      client.end(false, {}, (error) => error ? reject(error) : resolve());
    });
  }
}
