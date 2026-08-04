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

test("buton action türleri expose bilgisinden çıkarılır", () => {
  const store = new DeviceStore(new Map());
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0xbutton",
    friendly_name: "Hall Button",
    type: "EndDevice",
    definition: {
      exposes: [{
        type: "enum",
        property: "action",
        access: 1,
        values: ["single", "double", "hold"]
      }]
    }
  }])));

  assert.deepEqual(store.getDevices()[0].actionTypes, ["double", "hold", "single"]);
});

test("sahne kumandasının düğmeleri ve son basılan düğme cihaz modeline eklenir", () => {
  const store = new DeviceStore(new Map([["0x20a716fffe6835f1:button:2", "Perde"]]));
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0x20a716fffe6835f1",
    friendly_name: "Sahne Anahtari",
    type: "EndDevice",
    definition: {
      model: "TS0043",
      exposes: [{
        type: "enum",
        property: "action",
        access: 1,
        values: [
          "1_single", "1_double", "1_hold",
          "2_single", "2_double", "2_hold",
          "3_single", "3_double", "3_hold"
        ]
      }]
    }
  }])));
  store.ingest("Sahne Anahtari", Buffer.from('{"action":"2_double","battery":100}'));

  const [device] = store.getDevices();
  assert.deepEqual(
    device.buttons?.map((button) => ({ id: button.id, name: button.name, count: button.actions.length })),
    [
      { id: "button:1", name: "1. düğme", count: 3 },
      { id: "button:2", name: "Perde", count: 3 },
      { id: "button:3", name: "3. düğme", count: 3 }
    ]
  );
  assert.equal(device.lastAction?.action, "2_double");
  assert.equal(device.lastAction?.buttonId, "button:2");
  assert.ok(device.lastAction?.at);
});

test("eylem üretmeyen cihazda düğme listesi boş kalır", () => {
  const store = new DeviceStore(new Map());
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0xlight",
    friendly_name: "Kitchen LED",
    type: "Router",
    definition: { exposes: [{ name: "light", features: [{ property: "state", access: 7 }] }] }
  }])));

  const [device] = store.getDevices();
  assert.deepEqual(device.buttons, []);
  assert.equal(device.lastAction, null);
});

test("düşük pil eşiği backend uyarısı ve kalıcı geçiş olayı üretir", () => {
  const store = new DeviceStore(new Map());
  store.setLowBatteryThreshold(20);
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0xbattery",
    friendly_name: "Door Sensor",
    type: "EndDevice"
  }])));

  store.ingest("Door Sensor", Buffer.from('{"battery":19}'));
  assert.deepEqual(store.getDevices()[0].alerts, [{
    code: "low_battery",
    severity: "warning",
    value: 19,
    threshold: 20
  }]);
  assert.equal(store.getEvents()[0].property, "battery_threshold");
  assert.equal(store.getEvents()[0].value, true);

  store.ingest("Door Sensor", Buffer.from('{"battery":22}'));
  assert.deepEqual(store.getDevices()[0].alerts, []);
  assert.equal(store.getEvents()[0].property, "battery_threshold");
  assert.equal(store.getEvents()[0].value, false);

  store.setLowBatteryThreshold(25);
  assert.equal(store.getDevices()[0].alerts[0]?.code, "low_battery");
  assert.equal(store.getEvents()[0].property, "battery_threshold");
  assert.equal(store.getEvents()[0].value, true);
});

test("iç içe cihaz expose bilgisi tip, aralık ve admin kategorisini korur", () => {
  const store = new DeviceStore(new Map());
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0xcover",
    friendly_name: "Bedroom Blind",
    type: "Router",
    definition: {
      model: "Blind",
      exposes: [
        {
          type: "cover",
          name: "cover",
          features: [
            { type: "enum", name: "state", property: "state", access: 7, values: ["OPEN", "STOP", "CLOSE"] },
            { type: "numeric", name: "position", property: "position", access: 7, value_min: 0, value_max: 100 }
          ]
        },
        {
          type: "numeric",
          name: "calibration",
          property: "calibration",
          access: 3,
          value_min: -10,
          value_max: 10,
          category: "config"
        }
      ]
    }
  }])));
  store.ingest("Bedroom Blind", Buffer.from('{"state":"OPEN","position":50,"calibration":1}'));

  const controls = store.getDevices()[0].controls;
  assert.deepEqual(
    controls.map(({ property, kind, min, max, adminOnly }) => ({ property, kind, min, max, adminOnly })),
    [
      { property: "state", kind: "cover", min: undefined, max: undefined, adminOnly: false },
      { property: "position", kind: "position", min: 0, max: 100, adminOnly: false },
      { property: "calibration", kind: "number", min: -10, max: 10, adminOnly: true }
    ]
  );
});

test("önemli cihaz hareketleri kısa geçmişte tutulur, sinyal gürültüsü tutulmaz", () => {
  const store = new DeviceStore(new Map());
  store.ingest("Hall Button", Buffer.from('{"action":"single","linkquality":120}'));
  store.ingest("Hall Button", Buffer.from('{"action":"double","linkquality":121}'));
  store.ingest("Hall Button", Buffer.from('{"action":"","linkquality":122}'));
  store.ingest("Hall Button/availability", Buffer.from('{"state":"online"}'));
  store.ingest("Hall Button/availability", Buffer.from('{"state":"online"}'));
  store.ingest("Hall Button/availability", Buffer.from('{"state":"offline"}'));
  assert.deepEqual(
    store.getEvents().map(({ sourceName, property, value }) => ({ sourceName, property, value })),
    [
      { sourceName: "Hall Button", property: "availability", value: "offline" },
      { sourceName: "Hall Button", property: "availability", value: "online" },
      { sourceName: "Hall Button", property: "action", value: "double" },
      { sourceName: "Hall Button", property: "action", value: "single" }
    ]
  );
});

test("aynı düğmeye iki kez basılınca iki olay üretilir ve IEEE adresine çözülür", () => {
  const added: Array<{ sourceName: string; property: string; value: unknown }> = [];
  const store = new DeviceStore(new Map(), undefined, [], (_events, batch) => {
    added.push(...batch.map(({ sourceName, property, value }) => ({ sourceName, property, value })));
  });
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0x20a716fffe6835f1",
    friendly_name: "Sahne Anahtari",
    type: "EndDevice",
    definition: { model: "TS0043", exposes: [] }
  }])));

  // `action` kalıcı durumda tutulmaz; her basış ayrı bir kenar olayıdır.
  store.ingest("Sahne Anahtari", Buffer.from('{"action":"1_single","battery":100}'));
  store.ingest("Sahne Anahtari", Buffer.from('{"action":"1_single","battery":100}'));
  // Durum özellikleri ise yalnızca değiştiğinde olay üretir.
  store.ingest("Sahne Anahtari", Buffer.from('{"occupancy":true}'));
  store.ingest("Sahne Anahtari", Buffer.from('{"occupancy":true}'));

  assert.deepEqual(added, [
    { sourceName: "Sahne Anahtari", property: "action", value: "1_single" },
    { sourceName: "Sahne Anahtari", property: "action", value: "1_single" },
    { sourceName: "Sahne Anahtari", property: "occupancy", value: true }
  ]);
  assert.equal(
    store.getDeviceIdBySourceName("Sahne Anahtari"),
    "0x20a716fffe6835f1"
  );
  assert.equal(store.getDeviceIdBySourceName("Yok Boyle"), undefined);
});

test("OTA desteği ve kayıtlı cihaz seçenekleri cihaz görünümüne taşınır", () => {
  const store = new DeviceStore(new Map());
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0xoptions",
    friendly_name: "Office Light",
    type: "Router",
    definition: { model: "Light", ota: true, exposes: [] },
    configured_options: { transition: 1.5, debounce: 0.3, retain: true }
  }])));

  const [device] = store.getDevices();
  assert.equal(device.otaSupported, true);
  assert.deepEqual(device.options, { transition: 1.5, debounce: 0.3, retain: true });
});

test("endpoint, binding ve grup sahneleri arayüz görünümüne taşınır", () => {
  const store = new DeviceStore(new Map());
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: "0x0011223344556677",
    friendly_name: "Wall Remote",
    endpoint_names: { "2": "Right button" },
    endpoints: {
      "2": {
        bindings: [{
          cluster: "genOnOff",
          target: {
            ieee_address: "0x8899aabbccddeeff",
            endpoint: 3
          }
        }],
        clusters: {
          input: [],
          output: [6]
        }
      }
    }
  }])));
  store.ingest("bridge/groups", Buffer.from(JSON.stringify([{
    id: 7,
    friendly_name: "Evening Lights",
    members: [],
    scenes: [{ id: 2, name: "Movie" }]
  }])));

  assert.deepEqual(store.getDevices()[0].endpoints, [{
    id: 2,
    name: "Right button",
    inputClusters: [],
    outputClusters: [6],
    bindings: [{
      cluster: "genOnOff",
      targetType: "device",
      targetId: "0x8899aabbccddeeff",
      targetEndpoint: 3
    }]
  }]);
  assert.deepEqual(store.getGroups()[0].scenes, [{ id: 2, name: "Movie" }]);
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

test("kayıtlı cihaz yeniden katıldığında yeni durum gelene kadar hazırlanıyor sayılır", () => {
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
    interviewCompleted: false,
    supported: true,
    reconnected: true
  });
  assert.equal(store.getDevices()[0]?.preparing, true);

  store.ingest(
    "Kitchen Left Light",
    Buffer.from('{"state":"OFF","linkquality":120}')
  );
  assert.deepEqual(store.getPairing().device, {
    id: "0xknown",
    name: "Kitchen Left Light",
    interviewCompleted: true,
    supported: true,
    reconnected: true
  });
  assert.equal(store.getDevices()[0]?.preparing, false);

  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xKNOWN",
      friendly_name: "Living Room Wall Switch",
      interview_completed: true,
      supported: true
    }]))
  );
  assert.equal(store.getDevices().length, 1);
  assert.equal(store.getDevices()[0]?.id, "0xknown");
  assert.equal(store.getDevices()[0]?.name, "Living Room Wall Switch");
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

test("cihaz sınıfı standart expose tipinden gelir, kullanıcı rolü onu ezer", () => {
  const roles = new Map<string, "auto" | "light" | "switch">();
  const store = new DeviceStore(new Map(), undefined, [], undefined, roles);
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([
      {
        // Farklı satıcı, farklı model: ölçüt yalnız `exposes[].type`.
        ieee_address: "0x000d6ffffe111111",
        friendly_name: "Bedroom bulb",
        type: "Router",
        supported: true,
        interview_completed: true,
        definition: {
          model: "LED1949C5",
          vendor: "IKEA",
          exposes: [{ type: "light", features: [{ name: "state", property: "state", access: 7 }] }]
        }
      },
      {
        // Lambayı süren röle: donanım anahtar der. Kullanıcı bunu lamba olarak kullanıyor.
        ieee_address: "0xa4c138b950918de3",
        friendly_name: "Corridor relay",
        type: "Router",
        supported: true,
        interview_completed: true,
        definition: {
          model: "TS0001",
          vendor: "Tuya",
          exposes: [{ type: "switch", features: [{ name: "state", property: "state", access: 7 }] }]
        }
      },
      {
        // Tanımı bilinmeyen cihaz: belirsiz kalır, eleme yapılmaz.
        ieee_address: "0xa4c1380000000009",
        friendly_name: "Unknown module",
        type: "EndDevice",
        supported: false,
        interview_completed: true
      }
    ]))
  );

  const byId = new Map(store.getDevices().map((device) => [device.id, device]));
  assert.equal(byId.get("0x000d6ffffe111111")?.detectedCategory, "light");
  assert.equal(byId.get("0x000d6ffffe111111")?.category, "light");
  assert.equal(byId.get("0xa4c138b950918de3")?.detectedCategory, "switch");
  assert.equal(byId.get("0xa4c138b950918de3")?.category, "switch");
  assert.equal(byId.get("0xa4c1380000000009")?.detectedCategory, "unknown");
  assert.equal(byId.get("0xa4c1380000000009")?.role, "auto");

  // Kullanıcı rolü seçince tahmin ezilir; tahmin ayrıca saklandığı için geri dönülebilir.
  roles.set("0xa4c138b950918de3", "light");
  const relay = store.getDevice("0xa4c138b950918de3");
  assert.equal(relay?.role, "light");
  assert.equal(relay?.category, "light");
  assert.equal(relay?.detectedCategory, "switch");

  roles.delete("0xa4c138b950918de3");
  assert.equal(store.getDevice("0xa4c138b950918de3")?.category, "switch");
});
