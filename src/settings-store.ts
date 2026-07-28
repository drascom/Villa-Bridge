import { copyFile, readFile, rename, stat, writeFile } from "node:fs/promises";
import YAML from "yaml";

type YamlObject = Record<string, unknown>;

export interface ConnectionSettings {
  zigbee: {
    adapterUrl: string;
  };
  mqtt: {
    url: string;
    baseTopic: string;
  };
  matter: {
    wsUrl: string;
  };
  homeAssistant: {
    discoveryEnabled: boolean;
  };
}

const objectValue = (value: unknown): YamlObject =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as YamlObject : {};

const endpoint = (value: unknown, protocols: string[], label: string): string => {
  if (typeof value !== "string" || value.length > 240) throw new Error(`${label} adresi geçersiz.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} adresi geçersiz.`);
  }
  if (!protocols.includes(parsed.protocol) || !parsed.hostname || !parsed.port || parsed.username || parsed.password) {
    throw new Error(`${label} adresi protokol, sunucu ve port içermeli; kimlik bilgisi içermemeli.`);
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label} portu geçersiz.`);
  return parsed.toString().replace(/\/$/, "");
};

export const validateConnectionSettings = (value: unknown): ConnectionSettings => {
  const input = objectValue(value);
  const zigbee = objectValue(input.zigbee);
  const mqtt = objectValue(input.mqtt);
  const matter = objectValue(input.matter);
  const homeAssistant = objectValue(input.homeAssistant);
  const baseTopic = typeof mqtt.baseTopic === "string" ? mqtt.baseTopic.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$/.test(baseTopic) || baseTopic.includes("//")) {
    throw new Error("MQTT temel konusu geçersiz.");
  }
  return {
    zigbee: {
      adapterUrl: endpoint(zigbee.adapterUrl, ["tcp:"], "Zigbee adaptörü")
    },
    mqtt: {
      url: endpoint(mqtt.url, ["mqtt:", "mqtts:"], "MQTT sunucusu"),
      baseTopic
    },
    matter: {
      wsUrl: endpoint(matter.wsUrl, ["ws:", "wss:"], "Matterbridge")
    },
    homeAssistant: {
      discoveryEnabled: homeAssistant.discoveryEnabled === true
    }
  };
};

const readYaml = async (path: string): Promise<YamlObject> =>
  objectValue(YAML.parse(await readFile(path, "utf8")));

const writeYamlTemporary = async (path: string, value: YamlObject): Promise<string> => {
  const temporary = `${path}.tmp-${process.pid}`;
  const current = await stat(path);
  await writeFile(temporary, YAML.stringify(value), { mode: current.mode });
  return temporary;
};

export class SettingsStore {
  constructor(
    private readonly configPath: string,
    private readonly z2mPath: string,
    private readonly fallback: ConnectionSettings
  ) {}

  async get(): Promise<ConnectionSettings> {
    const [file, z2m] = await Promise.all([readYaml(this.configPath), readYaml(this.z2mPath)]);
    const fileMqtt = objectValue(file.mqtt);
    const fileMatter = objectValue(file.matterbridge);
    const fileHomeAssistant = objectValue(file.homeAssistant);
    const z2mMqtt = objectValue(z2m.mqtt);
    const z2mSerial = objectValue(z2m.serial);
    return validateConnectionSettings({
      zigbee: {
        adapterUrl: z2mSerial.port ?? this.fallback.zigbee.adapterUrl
      },
      mqtt: {
        url: fileMqtt.url ?? z2mMqtt.server ?? this.fallback.mqtt.url,
        baseTopic: fileMqtt.baseTopic ?? z2mMqtt.base_topic ?? this.fallback.mqtt.baseTopic
      },
      matter: {
        wsUrl: fileMatter.wsUrl ?? this.fallback.matter.wsUrl
      },
      homeAssistant: {
        discoveryEnabled: fileHomeAssistant.discoveryEnabled ?? this.fallback.homeAssistant.discoveryEnabled
      }
    });
  }

  async save(value: unknown): Promise<ConnectionSettings> {
    const settings = validateConnectionSettings(value);
    const [file, z2m] = await Promise.all([readYaml(this.configPath), readYaml(this.z2mPath)]);
    const fileMqtt = objectValue(file.mqtt);
    const fileMatter = objectValue(file.matterbridge);
    const fileHomeAssistant = objectValue(file.homeAssistant);
    const z2mMqtt = objectValue(z2m.mqtt);
    const z2mSerial = objectValue(z2m.serial);

    file.mqtt = { ...fileMqtt, url: settings.mqtt.url, baseTopic: settings.mqtt.baseTopic };
    file.matterbridge = { ...fileMatter, wsUrl: settings.matter.wsUrl };
    file.homeAssistant = { ...fileHomeAssistant, discoveryEnabled: settings.homeAssistant.discoveryEnabled };
    z2m.mqtt = { ...z2mMqtt, server: settings.mqtt.url, base_topic: settings.mqtt.baseTopic };
    z2m.serial = { ...z2mSerial, port: settings.zigbee.adapterUrl };

    const [fileTemporary, z2mTemporary] = await Promise.all([
      writeYamlTemporary(this.configPath, file),
      writeYamlTemporary(this.z2mPath, z2m)
    ]);
    const fileBackup = `${this.configPath}.settings-backup`;
    const z2mBackup = `${this.z2mPath}.settings-backup`;
    await Promise.all([
      copyFile(this.configPath, fileBackup),
      copyFile(this.z2mPath, z2mBackup)
    ]);
    try {
      await rename(fileTemporary, this.configPath);
      await rename(z2mTemporary, this.z2mPath);
    } catch (error) {
      await Promise.allSettled([
        copyFile(fileBackup, this.configPath),
        copyFile(z2mBackup, this.z2mPath)
      ]);
      throw error;
    }
    return settings;
  }
}
