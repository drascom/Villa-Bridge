import assert from "node:assert/strict";
import test from "node:test";
import {
  DirectZigbeeSource,
  directBridgeInfo,
  endpointNamesForDevice,
  parsePermitJoinSeconds
} from "./direct-zigbee-source.js";
import { DeviceStore } from "./device-store.js";

test("Matterbridge permit-join boolean requests map to a bounded Zigbee duration", () => {
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"value":true}')), 180);
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"value":false}')), 0);
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"time":999}')), 254);
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"time":-10}')), 0);
});

test("direct bridge info satisfies the Matterbridge Zigbee2MQTT contract", () => {
  const info = directBridgeInfo(true, 120);
  assert.equal(info.version, "1.0.0");
  assert.equal(info.commit, "villa-bridge-direct");
  assert.equal(Number.isNaN(Number.parseInt(String(info.version), 10)), false);
  assert.equal(info.permit_join, true);
  assert.equal(info.permit_join_timeout, 120);
  assert.deepEqual(info.zigbee_herdsman, { version: "embedded" });
  assert.deepEqual(info.zigbee_herdsman_converters, { version: "embedded" });
  assert.deepEqual(info.config, {
    availability: { enabled: true },
    advanced: {
      output: "json",
      legacy_api: false,
      legacy_availability_payload: false
    }
  });
});

test("endpoint names are derived from UID-scoped channel aliases", () => {
  const aliases = new Map([
    ["0xabc", "Main device"],
    ["0xabc:l1", "Ceiling One"],
    ["0xABC:l2", " Ceiling Two "],
    ["0xdef:l1", "Different device"],
    ["0xabc:l3", "   "]
  ]);

  assert.deepEqual(endpointNamesForDevice("0xAbC", aliases), {
    l1: "Ceiling One",
    l2: "Ceiling Two"
  });
});

test("Home Assistant discovery toggles live without restarting the source", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xabc",
      friendly_name: "Kitchen Light",
      type: "Router",
      supported: true,
      interview_completed: true,
      definition: {
        model: "TEST-LIGHT",
        vendor: "Test",
        exposes: [{ property: "state", access: 7 }]
      }
    }]))
  );
  store.ingest("Kitchen Light", Buffer.from('{"state":"OFF","linkquality":120}'));
  const source = new DirectZigbeeSource(
    {} as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false
  );
  const published: Array<{ topic: string; payload: string; retain: boolean }> = [];
  Object.assign(source, {
    mqtt: {
      connected: true,
      publish(topic: string, payload: string, options: { retain?: boolean }) {
        published.push({ topic, payload, retain: options.retain === true });
      }
    }
  });

  source.setHomeAssistantDiscovery(true);
  const discovery = published.filter((item) =>
    item.topic.startsWith("homeassistant/") && item.payload.length > 0
  );
  assert.ok(discovery.length > 0);
  assert.ok(discovery.every((item) => item.retain));

  published.length = 0;
  source.setHomeAssistantDiscovery(false);
  assert.ok(published.length > 0);
  assert.ok(published.every((item) => item.payload === "" && item.retain));
});
