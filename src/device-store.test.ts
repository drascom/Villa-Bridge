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
        exposes: [{ name: "light", features: [{ property: "state_l1", access: 7 }] }]
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

test("durumu olmayan yazılabilir ışık özellikleri kumanda olarak sunulur", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0x456",
      friendly_name: "Kitchen LED",
      type: "Router",
      supported: true,
      interview_completed: true,
      definition: {
        model: "YSR-MINI-01_wwcw",
        vendor: "YSRSAI",
        exposes: [{
          name: "light",
          features: [
            { property: "state", access: 7 },
            { property: "brightness", access: 7 },
            { property: "color_temp", access: 7 }
          ]
        }]
      }
    }]))
  );

  assert.deepEqual(
    store.getDevices()[0].controls.map(({ property, value }) => ({ property, value })),
    [
      { property: "state", value: null },
      { property: "brightness", value: null },
      { property: "color_temp", value: null }
    ]
  );
});

test("genel Tuya modeli üretici parmak iziyle doğru katalog modeline çevrilir", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xa4c13852d27dc01a",
      friendly_name: "Button",
      type: "Router",
      manufacturer: "_TZ3000_i9oy2rdq",
      supported: true,
      interview_completed: true,
      definition: {
        model: "TS0001",
        vendor: "Tuya",
        description: "1 gang switch",
        exposes: [{ property: "state", access: 7 }]
      }
    }]))
  );

  assert.equal(store.getDevices()[0].model, "WHD02");
});

test("parmak izi eşleşmeyen cihazın raporlanan modeli korunur", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xother",
      type: "Router",
      manufacturer: "_TZ3000_other",
      definition: { model: "TS0001", vendor: "Tuya" }
    }]))
  );

  assert.equal(store.getDevices()[0].model, "TS0001");
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

test("eşleştirme yalnız gerçek katılma ve görüşme olaylarıyla ilerler", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from('[{"ieee_address":"0xexisting","friendly_name":"Existing"}]')
  );
  store.pairingRequested(180);

  assert.equal(store.getPairing().device, null);

  store.ingest(
    "bridge/event",
    Buffer.from(JSON.stringify({
      type: "device_joined",
      data: { ieee_address: "0xNEW", friendly_name: "New device" }
    }))
  );
  assert.deepEqual(store.getPairing().device, {
    id: "0xnew",
    name: "New device",
    interviewCompleted: false,
    supported: null,
    reconnected: false
  });

  store.ingest(
    "bridge/event",
    Buffer.from(JSON.stringify({
      type: "device_interview",
      data: { ieee_address: "0xnew", status: "successful", supported: true }
    }))
  );
  assert.deepEqual(store.getPairing().device, {
    id: "0xnew",
    name: "New device",
    interviewCompleted: true,
    supported: true,
    reconnected: false
  });
});

test("kayıtlı cihaz eşleştirme sırasında yeniden katıldığında hazır sayılır", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xKNOWN",
      friendly_name: "Kitchen Left Light",
      interview_completed: true,
      supported: true
    }]))
  );
  store.pairingRequested(180);
  store.ingest(
    "bridge/event",
    Buffer.from(JSON.stringify({
      type: "device_announce",
      data: { ieee_address: "0xKNOWN", friendly_name: "Kitchen Left Light" }
    }))
  );

  assert.deepEqual(store.getPairing().device, {
    id: "0xknown",
    name: "Kitchen Left Light",
    interviewCompleted: true,
    supported: true,
    reconnected: true
  });
});

test("bilinmeyen cihaz duyurusu yeni eşleştirme sonucu üretmez", () => {
  const store = new DeviceStore(new Map());
  store.pairingRequested(180);
  store.ingest(
    "bridge/event",
    Buffer.from('{"type":"device_announce","data":{"ieee_address":"0xunknown"}}')
  );
  assert.equal(store.getPairing().device, null);
});

test("kapalı oturum ve farklı cihaz görüşmesi eşleştirme sonucu üretmez", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/event",
    Buffer.from('{"type":"device_joined","data":{"ieee_address":"0xold"}}')
  );
  assert.equal(store.getPairing().device, null);

  store.pairingRequested(180);
  store.ingest(
    "bridge/event",
    Buffer.from('{"type":"device_joined","data":{"ieee_address":"0xnew"}}')
  );
  store.ingest(
    "bridge/event",
    Buffer.from('{"type":"device_interview","data":{"ieee_address":"0xother","status":"successful","supported":true}}')
  );

  assert.deepEqual(store.getPairing().device, {
    id: "0xnew",
    name: "0xnew",
    interviewCompleted: false,
    supported: null,
    reconnected: false
  });
});
