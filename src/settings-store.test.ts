import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SettingsStore, validateConnectionSettings } from "./settings-store.js";

test("bağlantı ayarları güvenli protokol, sunucu ve port ile doğrulanır", () => {
  assert.deepEqual(validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 15 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false },
    alerts: { lowBatteryThreshold: 15 },
    selfHealing: { enabled: false, probeOffline: true },
    debug: { enabled: false }
  }), {
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 15 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false },
    alerts: { lowBatteryThreshold: 15 },
    selfHealing: { enabled: false, probeOffline: true },
    debug: { enabled: false }
  });
});

test("otomatik onarım ve çevrimdışı yoklama varsayılan olarak açıktır", () => {
  const settings = validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 15 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false }
  });

  assert.deepEqual(settings.selfHealing, { enabled: true, probeOffline: true });
});

test("debug mode defaults to enabled during testing", () => {
  const settings = validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 15 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false }
  });

  assert.equal(settings.debug.enabled, true);
});

test("kimlik bilgisi içeren veya portsuz bağlantı adresleri reddedilir", () => {
  assert.throws(() => validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 15 },
    mqtt: { url: "mqtt://user:secret@127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false },
    debug: { enabled: true }
  }));
  assert.throws(() => validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248", channel: 15 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false },
    debug: { enabled: true }
  }));
  assert.throws(() => validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 27 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false },
    debug: { enabled: true }
  }));
});

test("Zigbee kanal değişikliği API seviyesinde açık onay olmadan yazılmaz", async () => {
  const directory = await mkdtemp(join(tmpdir(), "villa-settings-"));
  const configPath = join(directory, "villa.yaml");
  const z2mPath = join(directory, "z2m.yaml");
  await writeFile(configPath, [
    "mqtt:",
    "  url: mqtt://127.0.0.1:1883",
    "  baseTopic: zigbee2mqtt",
    "matterbridge:",
    "  wsUrl: ws://127.0.0.1:8283",
    "homeAssistant:",
    "  discoveryEnabled: false",
    "alerts:",
    "  lowBatteryThreshold: 15",
    "debug:",
    "  enabled: true",
    ""
  ].join("\n"));
  await writeFile(z2mPath, [
    "mqtt:",
    "  server: mqtt://127.0.0.1:1883",
    "  base_topic: zigbee2mqtt",
    "serial:",
    "  port: tcp://192.168.0.248:6638",
    "advanced:",
    "  channel: 15",
    ""
  ].join("\n"));
  const fallback = validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638", channel: 15 },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false },
    alerts: { lowBatteryThreshold: 15 },
    debug: { enabled: true }
  });
  const store = new SettingsStore(configPath, z2mPath, fallback);
  const changed = {
    ...fallback,
    zigbee: { ...fallback.zigbee, channel: 20 }
  };

  try {
    await assert.rejects(
      store.save(changed),
      /açık onay gerektirir/
    );
    assert.match(await readFile(z2mPath, "utf8"), /channel: 15/);
    await store.save(changed, { confirmZigbeeChannelChange: true });
    assert.match(await readFile(z2mPath, "utf8"), /channel: 20/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
