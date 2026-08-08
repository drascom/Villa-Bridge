import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "./device-store.js";
import type { DeviceRole } from "./device-category.js";

const deviceId = "0x00124b0011cc22dd";

const bridgeDevices = (name = "Salon Lamba"): Buffer => Buffer.from(JSON.stringify([{
  ieee_address: deviceId,
  friendly_name: name,
  type: "Router",
  supported: true,
  interview_completed: true,
  definition: {
    model: "TS0011",
    vendor: "Tuya",
    exposes: [{
      name: "switch",
      features: [{ property: "state", access: 7, type: "binary", value_on: "ON", value_off: "OFF" }]
    }],
    ota: false
  }
}]));

const makeStore = (
  aliases = new Map<string, string>(),
  roles = new Map<string, DeviceRole>()
): DeviceStore => {
  const store = new DeviceStore(aliases, { devices: {}, models: {} }, [], undefined, roles);
  store.ingest("bridge/devices", bridgeDevices());
  return store;
};

test("memo değişmeyen durumda aynı görünümü verir", () => {
  const store = makeStore();
  const first = store.getDevices();
  const second = store.getDevices();
  // Dizi kopyalanır ama görünüm nesnesi yeniden kurulmaz.
  assert.notEqual(first, second);
  assert.equal(first[0], second[0]);
});

test("cihaz listesi değişince memo tazelenir", () => {
  const store = makeStore();
  assert.equal(store.getDevices()[0]?.sourceName, "Salon Lamba");
  store.ingest("bridge/devices", bridgeDevices("Salon Avize"));
  assert.equal(store.getDevices()[0]?.sourceName, "Salon Avize");
  assert.equal(store.getDevice(deviceId)?.sourceName, "Salon Avize");
});

test("durum mesajı memoyu bayat bırakmaz", () => {
  const store = makeStore();
  assert.equal(store.getDevices()[0]?.state.state, undefined);
  store.ingest("Salon Lamba", Buffer.from('{"state":"ON"}'));
  assert.equal(store.getDevices()[0]?.state.state, "ON");
  assert.equal(store.getDevice(deviceId)?.state.state, "ON");
  store.ingest("Salon Lamba", Buffer.from('{"state":"OFF"}'));
  assert.equal(store.getDevice(deviceId)?.state.state, "OFF");
});

test("erişilebilirlik değişimi memoyu tazeler", () => {
  const store = makeStore();
  assert.equal(store.getDevices()[0]?.availability, "unknown");
  store.ingest("Salon Lamba/availability", Buffer.from('{"state":"offline"}'));
  assert.equal(store.getDevices()[0]?.availability, "offline");
  store.ingest("Salon Lamba/availability", Buffer.from('{"state":"online"}'));
  assert.equal(store.getDevices()[0]?.availability, "online");
});

test("takma ad haritası dışarıdan değişince memo tazelenir", () => {
  const aliases = new Map<string, string>();
  const store = makeStore(aliases);
  assert.equal(store.getDevices()[0]?.name, "Salon Lamba");
  aliases.set(deviceId, "Living Room Lamp");
  assert.equal(store.getDevices()[0]?.name, "Living Room Lamp");
  assert.equal(store.getDevice(deviceId)?.name, "Living Room Lamp");
  aliases.delete(deviceId);
  assert.equal(store.getDevices()[0]?.name, "Salon Lamba");
  aliases.set(deviceId, "Yedekten Gelen");
  aliases.clear();
  assert.equal(store.getDevices()[0]?.name, "Salon Lamba");
});

test("rol haritası dışarıdan değişince memo tazelenir", () => {
  const roles = new Map<string, DeviceRole>();
  const store = makeStore(new Map(), roles);
  assert.equal(store.getDevices()[0]?.role, "auto");
  roles.set(deviceId, "light");
  assert.equal(store.getDevices()[0]?.role, "light");
  assert.equal(store.getDevice(deviceId)?.category, "light");
  roles.delete(deviceId);
  assert.equal(store.getDevices()[0]?.role, "auto");
});

test("aynı harita iki mağaza tarafından gözlenebilir", () => {
  const aliases = new Map<string, string>();
  const first = makeStore(aliases);
  const second = makeStore(aliases);
  assert.equal(first.getDevices()[0]?.name, "Salon Lamba");
  assert.equal(second.getDevices()[0]?.name, "Salon Lamba");
  aliases.set(deviceId, "Ortak Ad");
  assert.equal(first.getDevices()[0]?.name, "Ortak Ad");
  assert.equal(second.getDevices()[0]?.name, "Ortak Ad");
});

test("görsel tercihi ve pil eşiği memoyu tazeler", () => {
  const store = makeStore();
  store.ingest("Salon Lamba", Buffer.from('{"battery":20}'));
  assert.deepEqual(store.getDevices()[0]?.alerts, []);
  store.setLowBatteryThreshold(25);
  assert.equal(store.getDevices()[0]?.alerts[0]?.code, "low_battery");

  assert.equal(store.getDevices()[0]?.image.userSelected, false);
  store.setImagePreferences({ devices: { [deviceId]: "TS0011_switch_module" }, models: {} });
  assert.equal(store.getDevices()[0]?.image.model, "TS0011_switch_module");
  assert.equal(store.getDevices()[0]?.image.userSelected, true);
});

test("son basılan düğme ve eşleştirme durumu memoyu tazeler", () => {
  const store = makeStore();
  assert.equal(store.getDevices()[0]?.lastAction, null);
  store.ingest("Salon Lamba", Buffer.from('{"action":"single"}'));
  assert.equal(store.getDevices()[0]?.lastAction?.action, "single");

  assert.equal(store.getDevices()[0]?.preparing, false);
  store.pairingRequested(60);
  store.ingest("bridge/event", Buffer.from(JSON.stringify({
    type: "device_joined",
    data: { ieee_address: deviceId, friendly_name: "Salon Lamba" }
  })));
  assert.equal(store.getDevices()[0]?.preparing, true);
  store.ingest("bridge/event", Buffer.from(JSON.stringify({
    type: "device_interview",
    data: { ieee_address: deviceId, status: "successful", supported: true }
  })));
  assert.equal(store.getDevices()[0]?.preparing, false);
});

test("dış olay kaydı memoyu tazeler", () => {
  const store = makeStore();
  const before = store.getDevices()[0];
  store.recordExternalEvent("Salon Lamba", "self_heal", "ok");
  assert.notEqual(store.getDevices()[0], before);
});

test("getDevice haritası liste ile birebir tutarlıdır", () => {
  const aliases = new Map<string, string>();
  const store = new DeviceStore(aliases);
  const devices = Array.from({ length: 50 }, (_, index) => ({
    ieee_address: `0x00124b0011cc${String(index).padStart(4, "0")}`,
    friendly_name: `Cihaz ${index}`,
    type: index === 0 ? "Coordinator" : "Router",
    supported: true,
    interview_completed: true,
    definition: {
      model: "TS0011",
      vendor: "Tuya",
      exposes: [{ name: "switch", features: [{ property: "state", access: 7, type: "binary" }] }]
    }
  }));
  store.ingest("bridge/devices", Buffer.from(JSON.stringify(devices)));

  const list = store.getDevices();
  // Koordinatör listede yok, dolayısıyla haritada da olmamalı.
  assert.equal(list.length, 49);
  assert.equal(store.getDevice(devices[0].ieee_address), undefined);
  for (const device of list) {
    assert.equal(store.getDevice(device.id), device);
    assert.equal(store.getDevice(device.id.toUpperCase()), device);
  }
  assert.equal(store.getDevice("0xffffffffffffffff"), undefined);
});

/**
 * Ölçülebilir kanıt: memo, olay başına yapılan yüzlerce `getDevice` çağrısını liste kurmadan
 * karşılamalı. Eşik bilerek gevşek — amaç mutlak süre değil, büyüklük mertebesi farkı.
 */
test("memo tekrar eden aramaları liste kurmadan karşılar", () => {
  const store = new DeviceStore(new Map());
  const devices = Array.from({ length: 200 }, (_, index) => ({
    ieee_address: `0x00124b0011cc${String(index).padStart(4, "0")}`,
    friendly_name: `Cihaz ${index}`,
    type: "Router",
    supported: true,
    interview_completed: true,
    definition: {
      model: "TS0011",
      vendor: "Tuya",
      exposes: [{
        name: "switch",
        features: [{ property: "state", access: 7, type: "binary", value_on: "ON", value_off: "OFF" }]
      }]
    }
  }));
  store.ingest("bridge/devices", Buffer.from(JSON.stringify(devices)));
  const ids = devices.map((device) => device.ieee_address);

  const coldStart = process.hrtime.bigint();
  for (let round = 0; round < 10; round += 1) {
    store.invalidate();
    store.getDevice(ids[round]);
  }
  const coldNs = Number(process.hrtime.bigint() - coldStart) / 10;

  const warmStart = process.hrtime.bigint();
  for (let round = 0; round < 1_000; round += 1) {
    store.getDevice(ids[round % ids.length]);
  }
  const warmNs = Number(process.hrtime.bigint() - warmStart) / 1_000;

  assert.ok(warmNs * 20 < coldNs, `memo kazancı yetersiz: soğuk ${coldNs}ns, sıcak ${warmNs}ns`);
});
