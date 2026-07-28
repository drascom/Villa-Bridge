import assert from "node:assert/strict";
import test from "node:test";
import { validateConnectionSettings } from "./settings-store.js";

test("bağlantı ayarları güvenli protokol, sunucu ve port ile doğrulanır", () => {
  assert.deepEqual(validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638" },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false }
  }), {
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638" },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false }
  });
});

test("kimlik bilgisi içeren veya portsuz bağlantı adresleri reddedilir", () => {
  assert.throws(() => validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248:6638" },
    mqtt: { url: "mqtt://user:secret@127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false }
  }));
  assert.throws(() => validateConnectionSettings({
    zigbee: { adapterUrl: "tcp://192.168.0.248" },
    mqtt: { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    matter: { wsUrl: "ws://127.0.0.1:8283" },
    homeAssistant: { discoveryEnabled: false }
  }));
});
