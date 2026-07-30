import assert from "node:assert/strict";
import test from "node:test";
import { removeZigbeeDevice } from "./direct-zigbee-source.js";

test("normal removal asks the physical Zigbee device to leave", async () => {
  const calls: string[] = [];
  const device = {
    async removeFromNetwork(): Promise<void> {
      calls.push("network");
    },
    removeFromDatabase(): void {
      calls.push("database");
    }
  };

  await removeZigbeeDevice(device, false);

  assert.deepEqual(calls, ["network"]);
});

test("force removal deletes the stale coordinator record without waiting for the device", async () => {
  const calls: string[] = [];
  const device = {
    async removeFromNetwork(): Promise<void> {
      calls.push("network");
      throw new Error("offline device must not be contacted");
    },
    removeFromDatabase(): void {
      calls.push("database");
    }
  };

  await removeZigbeeDevice(device, true);

  assert.deepEqual(calls, ["database"]);
});
