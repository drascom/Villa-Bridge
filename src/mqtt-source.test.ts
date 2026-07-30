import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { MqttClient } from "mqtt";
import { DeviceStore } from "./device-store.js";
import { MqttShadowSource, z2mGroupIdentifier } from "./mqtt-source.js";

class FakeMqttClient extends EventEmitter {
  connected = true;
  responseStatus: unknown = "ok";
  readonly requests: Array<{ topic: string; payload: Record<string, unknown> }> = [];

  subscribe(_topic: string, _options: unknown, callback: (error?: Error) => void): void {
    callback();
  }

  publish(
    topic: string,
    payload: string,
    _options: unknown,
    callback: (error?: Error) => void
  ): void {
    const request = JSON.parse(payload) as Record<string, unknown>;
    this.requests.push({ topic, payload: request });
    callback();
    if (!topic.includes("/bridge/request/")) return;
    const responseTopic = topic.replace("/bridge/request/", "/bridge/response/");
    let data: Record<string, unknown> = {};
    if (topic.endsWith("/touchlink/scan")) {
      data = { found: [{ ieee_address: "0x0011223344556677", channel: 15 }] };
    }
    if (topic.endsWith("/networkmap")) {
      data = {
        value: {
          nodes: [
            { ieeeAddr: "0xcoordinator", friendlyName: "Coordinator", type: "Coordinator" },
            { ieeeAddr: "0xrouter", friendlyName: "Hall Plug", type: "Router" }
          ],
          links: [{
            source: { ieeeAddr: "0xcoordinator" },
            target: { ieeeAddr: "0xrouter" },
            linkquality: 192
          }]
        }
      };
    }
    if (topic.endsWith("/backup")) {
      data = { zip: Buffer.from("PK\u0003\u0004test backup").toString("base64") };
    }
    if (topic.endsWith("/device/ota_update/check")) {
      data = {
        update_available: true,
        current_file_version: 10,
        ota_file_version: 11
      };
    }
    queueMicrotask(() => this.emit(
      "message",
      responseTopic,
      Buffer.from(JSON.stringify({
        status: this.responseStatus,
        data,
        transaction: request.transaction
      }))
    ));
  }

  end(_force: boolean, _options: unknown, callback: (error?: Error) => void): void {
    this.connected = false;
    callback();
  }
}

test("shadow kaynak yönetim isteklerinin gerçek Zigbee2MQTT yanıtını bekler", async () => {
  const client = new FakeMqttClient();
  const store = new DeviceStore(new Map());
  store.ingest("bridge/groups", Buffer.from(JSON.stringify([{
    id: 1,
    friendly_name: "Lounge",
    members: [],
    scenes: []
  }])));
  const source = new MqttShadowSource(
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    () => client as unknown as MqttClient
  );
  source.start();
  client.emit("connect");

  await source.permitJoin(90, "0x0011223344556677");
  await source.addInstallCode("install-code-value");
  await source.createGroup("Living Room");
  await source.renameGroup("group-1", "Lounge");
  await source.removeGroup("group-1", true);
  await source.setGroupMember("group-1", "0x0011223344556677", true, 1);
  await source.setGroup("group-1", { state: "ON" });
  await source.bindDevice("0x0011223344556677", "group-1", true, ["genOnOff"]);
  await source.scheduleOta("0x0011223344556677", true);
  assert.deepEqual(await source.checkOta("0x0011223344556677"), {
    available: true,
    currentVersion: 10,
    availableVersion: 11
  });
  await source.setDeviceOptions("0x0011223344556677", {
    transition: 1,
    debounce: 0.2,
    retain: true
  });
  assert.deepEqual(await source.scanTouchlink(), [{
    ieeeAddress: "0x0011223344556677",
    channel: 15
  }]);
  assert.deepEqual(await source.networkMap(), {
    nodes: [
      { id: "0xcoordinator", name: "Coordinator", type: "Coordinator" },
      { id: "0xrouter", name: "Hall Plug", type: "Router" }
    ],
    links: [{ from: "0xcoordinator", to: "0xrouter", quality: 192 }]
  });
  await source.reconfigureDevice("0x0011223344556677");
  const backup = await source.prepareNetworkBackup();
  assert.equal(backup.contentType, "application/zip");
  assert.equal(backup.body.subarray(0, 2).toString("ascii"), "PK");

  assert.deepEqual(
    client.requests.map((request) => request.topic.replace("zigbee2mqtt/bridge/request/", "")),
    [
      "permit_join",
      "install_code/add",
      "group/add",
      "group/rename",
      "group/remove",
      "group/members/add",
      "zigbee2mqtt/Lounge/set",
      "device/bind",
      "device/ota_update/schedule",
      "device/ota_update/check",
      "device/options",
      "touchlink/scan",
      "networkmap",
      "device/interview",
      "device/configure",
      "backup"
    ]
  );
  assert.ok(client.requests
    .filter((request) => request.topic.includes("/bridge/request/"))
    .every((request) => typeof request.payload.transaction === "string"));
  assert.equal(client.requests.find((request) => request.topic.endsWith("/group/rename"))?.payload.from, "1");
  assert.equal(client.requests.find((request) => request.topic.endsWith("/group/remove"))?.payload.id, "1");
  assert.equal(client.requests.find((request) => request.topic.endsWith("/group/members/add"))?.payload.group, "1");
  assert.deepEqual(
    client.requests.find((request) => request.topic === "zigbee2mqtt/Lounge/set")?.payload,
    { state: "ON" }
  );
  assert.equal(client.requests.find((request) => request.topic.endsWith("/device/bind"))?.payload.to, "1");
  await source.stop();
});

test("shadow grup görünüm kimliğini Zigbee2MQTT kimliğine dönüştürür", () => {
  assert.equal(z2mGroupIdentifier("group-27"), "27");
  assert.equal(z2mGroupIdentifier("Living Room"), "Living Room");
  assert.equal(z2mGroupIdentifier("group-kitchen"), "group-kitchen");
});

test("shadow kaynak yalnız açık Zigbee2MQTT ok yanıtını başarı sayar", async () => {
  const client = new FakeMqttClient();
  client.responseStatus = "unknown";
  const source = new MqttShadowSource(
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map()),
    () => client as unknown as MqttClient
  );
  source.start();
  client.emit("connect");

  await assert.rejects(
    source.permitJoin(60),
    /Zigbee2MQTT işlemi başarısız/
  );
  await source.stop();
});
