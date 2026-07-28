import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "./device-store.js";

test("cihaz adı IEEE adresine göre İngilizce takma adla yayınlanır", () => {
  const store = new DeviceStore(new Map([["0xabc", "Balcony Wall Lights"]]));
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xabc",
      friendly_name: "Balkon Duvar Lambaları",
      type: "Router",
      supported: true,
      interview_completed: true,
      definition: {
        model: "TS0003",
        vendor: "Tuya",
        exposes: [{ name: "light", features: [{ property: "state_l1" }] }]
      }
    }]))
  );
  store.ingest("Balkon Duvar Lambaları", Buffer.from('{"state_l1":"ON"}'));

  const [device] = store.getDevices();
  assert.equal(device.name, "Balcony Wall Lights");
  assert.equal(device.sourceName, "Balkon Duvar Lambaları");
  assert.equal(device.state.state_l1, "ON");
  assert.deepEqual(device.features, ["light", "state_l1"]);
});

test("shadow sağlık bilgisi kaynak köprü ve MQTT durumuna bağlıdır", () => {
  const store = new DeviceStore(new Map());
  store.setMqttConnected(true);
  store.ingest("bridge/state", Buffer.from('{"state":"online"}'));
  assert.equal(store.getHealth().ok, true);
});

test("permit join yanıtı eşleştirme süresini açar", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/response/permit_join",
    Buffer.from('{"data":{"time":180},"status":"ok","transaction":"x"}')
  );
  assert.equal(store.getPairing().open, true);
  assert.equal(store.getPairing().status, "open");
});
