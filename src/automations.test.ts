import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AutomationsStore,
  maxAutomationActions,
  maxAutomations,
  removeDeviceFromAutomations,
  validateAutomations
} from "./automations.js";
import type { Automation, AutomationDeviceLookup } from "./automations.js";
import type { DeviceControlView } from "./types.js";

const lampId = "0x00124b0011cc22dd";
const lockId = "0x00124b0011cc22de";

const automation = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "aksam-salon",
  name: "Akşam salon",
  enabled: true,
  triggers: [{ type: "time", at: "19:00", days: [1, 2, 3, 4, 5, 6, 7] }],
  conditions: [],
  actions: [{ type: "device", deviceId: lampId, property: "state_l1", value: "ON" }],
  lastRunAt: null,
  lastRunOk: null,
  ...overrides
});

const control = (property: string, kind: DeviceControlView["kind"]): DeviceControlView =>
  ({ id: property, property, name: property, kind, value: null });

const lookup: AutomationDeviceLookup = (deviceId) => {
  if (deviceId === lampId) return { controls: [control("state_l1", "switch")] };
  if (deviceId === lockId) {
    return { controls: [control("state", "lock"), control("alarm", "siren")] };
  }
  return undefined;
};

test("otomasyon normalize edilerek kabul edilir", () => {
  assert.deepEqual(validateAutomations([automation({
    id: "Aksam-Salon",
    name: "  Akşam salon  ",
    triggers: [{ type: "time", at: " 19:00 ", days: [7, 1, 1, 3] }],
    actions: [{
      type: "device",
      deviceId: lampId.toUpperCase(),
      property: "state_l1",
      controlId: "L1",
      value: "ON"
    }]
  })]), [
    {
      id: "aksam-salon",
      name: "Akşam salon",
      enabled: true,
      triggers: [{ type: "time", at: "19:00", days: [1, 3, 7] }],
      conditions: [],
      actions: [{ type: "device", deviceId: lampId, property: "state_l1", controlId: "l1", value: "ON" }],
      lastRunAt: null,
      lastRunOk: null
    }
  ]);
});

test("geçersiz otomasyon alanları reddedilir", () => {
  assert.throws(() => validateAutomations({ id: "aksam-salon" }));
  assert.throws(() => validateAutomations([automation({ id: "kisa" })]));
  assert.throws(() => validateAutomations([automation({ id: "Akşam Salon" })]));
  assert.throws(() => validateAutomations([automation({ name: "   " })]));
  assert.throws(() => validateAutomations([automation({ name: "a".repeat(65) })]));
  assert.throws(() => validateAutomations([automation({ triggers: [] })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "sun", event: "sunset" }]
  })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "time", at: "24:00", days: [1] }]
  })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "time", at: "7:00", days: [1] }]
  })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "time", at: "19:00", days: [] }]
  })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "time", at: "19:00", days: [0] }]
  })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "time", at: "19:00", days: [8] }]
  })]));
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "time", at: "19:00", days: [1.5] }]
  })]));
  assert.throws(() => validateAutomations([automation({ actions: [] })]));
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: "salon-lambasi", property: "state", value: "ON" }]
  })]));
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: lampId, property: "state l1", value: "ON" }]
  })]));
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: lampId, property: "state", value: { on: true } }]
  })]));
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "group", groupId: 4, command: "ON" }]
  })]));
  assert.throws(() => validateAutomations([automation({ conditions: [{ type: "timeRange" }] })]));
  assert.throws(() => validateAutomations([automation({ lastRunAt: "dün" })]));
  assert.throws(() => validateAutomations([automation({ lastRunOk: "evet" })]));
});

test("yinelenen otomasyon kimliği reddedilir", () => {
  assert.throws(
    () => validateAutomations([automation(), automation({ name: "Kopya" })]),
    /yinelenmiş/
  );
});

test("otomasyon ve eylem üst sınırları uygulanır", () => {
  const automations = Array.from({ length: maxAutomations }, (_value, index) =>
    automation({ id: `otomasyon-${index.toString().padStart(3, "0")}` }));
  assert.equal(validateAutomations(automations).length, maxAutomations);
  assert.throws(() => validateAutomations([...automations, automation({ id: "otomasyon-fazla" })]));

  const actions = Array.from({ length: maxAutomationActions }, () =>
    ({ type: "device", deviceId: lampId, property: "state_l1", value: "ON" }));
  assert.equal(validateAutomations([automation({ actions })])[0]?.actions.length, maxAutomationActions);
  assert.throws(() => validateAutomations([automation({
    actions: [...actions, { type: "device", deviceId: lampId, property: "state_l2", value: "ON" }]
  })]));
});

test("kilit ve siren otomasyon eylemi olamaz", () => {
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: lockId, property: "state", value: "UNLOCK" }]
  })], lookup), /Kilit ve siren/);
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: lockId, property: "alarm", value: true }]
  })], lookup), /Kilit ve siren/);
  assert.equal(validateAutomations([automation()], lookup).length, 1);
});

test("cihaz kaldırıldığında eylemler düşer, eylemsiz otomasyon silinir", () => {
  const automations = validateAutomations([
    automation({
      actions: [
        { type: "device", deviceId: lampId, property: "state_l1", value: "ON" },
        { type: "device", deviceId: "0x20a716fffe6835f1", property: "state", value: "OFF" }
      ]
    }),
    automation({ id: "sadece-lamba" })
  ]);
  assert.deepEqual(removeDeviceFromAutomations(automations, lampId.toUpperCase()), [
    {
      ...automations[0] as Automation,
      actions: [{ type: "device", deviceId: "0x20a716fffe6835f1", property: "state", value: "OFF" }]
    }
  ]);
});

test("otomasyonlar atomik olarak yazılır ve geri okunur", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-automations-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "automations.json");
  const store = new AutomationsStore(path, lookup);

  assert.deepEqual(await store.get(), []);
  const saved = await store.save([automation()]);
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), saved);
  assert.deepEqual(await store.get(), saved);

  const marked = await store.markRun("AKSAM-SALON", true, new Date("2026-08-02T16:00:00.000Z"));
  assert.equal(marked[0]?.lastRunAt, "2026-08-02T16:00:00.000Z");
  assert.equal(marked[0]?.lastRunOk, true);
  assert.deepEqual(await store.get(), marked);
  assert.deepEqual(await store.markRun("yok-boyle-bir", false), marked);

  assert.deepEqual(await store.removeDevice(lampId), []);
  assert.deepEqual(await store.get(), []);
});
