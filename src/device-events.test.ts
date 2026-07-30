import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DeviceEventsStore, validateDeviceEvents } from "./device-events.js";

test("cihaz olay geçmişi yeniden başlatmalar arasında güvenli ve sınırlı saklanır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-events-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "device-events.json");
  const store = new DeviceEventsStore(path);
  const events = [{
    sourceName: "Front Door",
    property: "contact",
    value: false,
    at: "2026-07-30T01:02:03.000Z"
  }];

  await store.save(events);
  assert.deepEqual(await new DeviceEventsStore(path).get(), events);
  assert.equal(validateDeviceEvents([
    ...Array.from({ length: 250 }, (_, index) => ({ ...events[0], value: index })),
    { sourceName: "<invalid>", property: "../secret", value: {}, at: "never" }
  ]).length, 200);
});
