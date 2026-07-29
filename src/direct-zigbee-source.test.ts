import assert from "node:assert/strict";
import test from "node:test";
import {
  directBridgeInfo,
  endpointNamesForDevice,
  parsePermitJoinSeconds
} from "./direct-zigbee-source.js";

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
