import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AutomationAutoOffStore,
  AutomationsStore,
  automationTriggerDeviceIds,
  maxAutomationActions,
  maxAutomations,
  removeDeviceFromAutomations,
  validateAutomationAutoOffEntries,
  validateAutomations
} from "./automations.js";
import type { Automation, AutomationDeviceLookup } from "./automations.js";
import type { DeviceControlView } from "./types.js";

const lampId = "0x00124b0011cc22dd";
const lockId = "0x00124b0011cc22de";
/** Kullanıcının TS0043 sahne anahtarı — üç buton, tek IEEE adresi. */
const switchId = "0x20a716fffe6835f1";
const sensorId = "0x00124b0022ab34cd";

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

test("düğme ve sensör tetikleyicileri normalize edilerek kabul edilir", () => {
  const parsed = validateAutomations([automation({
    triggers: [
      { type: "deviceAction", deviceId: switchId.toUpperCase(), action: " 1_single " },
      { type: "deviceState", deviceId: sensorId, property: " occupancy ", equals: true }
    ]
  })]);
  assert.deepEqual(parsed[0]?.triggers, [
    { type: "deviceAction", deviceId: switchId, action: "1_single" },
    { type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }
  ]);
});

test("üç butonlu anahtarın her butonu ayrı tetikleyicidir (alt varlık kuralı)", () => {
  const parsed = validateAutomations([
    automation({
      id: "buton-bir",
      triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }]
    }),
    automation({
      id: "buton-iki",
      triggers: [{ type: "deviceAction", deviceId: switchId, action: "2_single" }]
    }),
    automation({
      id: "buton-uc",
      triggers: [{ type: "deviceAction", deviceId: switchId, action: "3_hold" }]
    })
  ]);
  assert.deepEqual(
    parsed.flatMap((entry) => automationTriggerDeviceIds(entry)),
    [switchId, switchId, switchId]
  );
});

test("bozuk düğme ve sensör tetikleyicileri reddedilir", () => {
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceAction", deviceId: "salon-butonu", action: "1_single" }]
  })]), /cihaz UID/);
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1 single" }]
  })]), /düğme eylemi/);
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "a".repeat(65) }]
  })]), /düğme eylemi/);
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceAction", deviceId: switchId }]
  })]), /düğme eylemi/);
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy alanı", equals: true }]
  })]), /cihaz özelliği/);
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: { on: true } }]
  })]), /hedef değeri/);
});

test("deviceState tetikleyicisinde equals opsiyoneldir — yoksa her değişim tetikler", () => {
  const parsed = validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }]
  })]);
  assert.deepEqual(parsed[0]?.triggers, [
    { type: "deviceState", deviceId: switchId, property: "state" }
  ]);
  // null da "verilmemiş" sayılır.
  assert.deepEqual(validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state", equals: null }]
  })])[0]?.triggers, [{ type: "deviceState", deviceId: switchId, property: "state" }]);
});

test("eylem koşulu (when) doğrulanır ve bilinmeyen alan reddedilir", () => {
  const parsed = validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "ON" } },
      { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "OFF" } }
    ]
  })], lookup);
  assert.deepEqual(parsed[0]?.actions, [
    { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "ON" } },
    { type: "device", deviceId: lampId, property: "state", value: "OFF", when: { equals: "OFF" } }
  ]);

  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: lampId, property: "state", value: "ON", when: "ON" }]
  })]), /koşulu geçersiz/);
  assert.throws(() => validateAutomations([automation({
    actions: [{
      type: "device", deviceId: lampId, property: "state", value: "ON",
      when: { equals: "ON", not: "OFF" }
    }]
  })]), /bilinmeyen alan/);
  assert.throws(() => validateAutomations([automation({
    actions: [{ type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: { a: 1 } } }]
  })]), /koşul değeri/);
  // `when` yoksa eylem eskisi gibi kabul edilir; alan da yazılmaz.
  assert.equal("when" in (validateAutomations([automation()])[0]?.actions[0] ?? {}), false);
});

test("döngü doğrulaması when taşıyan eylemlerde de çalışır", () => {
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: lampId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state", value: "ON", when: { equals: "ON" } }
    ]
  })]), /döngü/);
});

test("kilit ve duman tetikleyici olarak serbesttir (§8.1 yalnız eylemi kısıtlar)", () => {
  assert.equal(validateAutomations([automation({
    triggers: [
      { type: "deviceState", deviceId: lockId, property: "lock_state", equals: "unlocked" },
      { type: "deviceState", deviceId: sensorId, property: "smoke", equals: true }
    ]
  })], lookup)[0]?.triggers.length, 2);
});

test("otomasyon kendi çalıştırdığı kanal tarafından tetiklenemez", () => {
  // Aynı cihaz + aynı kanal: gerçek döngü, reddedilir.
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: lampId, property: "state_l1", equals: "ON" }]
  })]), /döngü/);
  // Düğme tetikleyicisinde kanal yok; cihaz granülerliğindeki koruma sürüyor.
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceAction", deviceId: lampId, action: "on" }]
  })]), /döngü/);
  // Farklı cihaz sorunsuz.
  assert.equal(validateAutomations([automation({
    triggers: [{ type: "deviceAction", deviceId: switchId, action: "1_single" }]
  })]).length, 1);
});

test("çok kanallı anahtarda bir kanal komşu kanalı çalıştırabilir", () => {
  // Kullanıcının duvar anahtarı: `state` tetikler, `state_l1`/`state_l2` yanar — döngü değil.
  const parsed = validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: lampId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state_l1", value: "ON", when: { equals: "ON" } },
      { type: "device", deviceId: lampId, property: "state_l2", value: "ON", when: { equals: "ON" } }
    ]
  })]);
  assert.equal(parsed[0]?.actions.length, 2);
  // Aynı kanal eylemler arasına sızarsa kural yine reddedilir — koruma kaybolmadı.
  assert.throws(() => validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: lampId, property: "state" }],
    actions: [
      { type: "device", deviceId: lampId, property: "state_l1", value: "ON" },
      { type: "device", deviceId: lampId, property: "state", value: "ON" }
    ]
  })]), /döngü/);
  // Kanal adı eşleşse bile farklı cihaz ayrı kanaldır.
  assert.equal(validateAutomations([automation({
    triggers: [{ type: "deviceState", deviceId: switchId, property: "state_l1" }]
  })]).length, 1);
});

test("cihaz kaldırıldığında olay tetikleyicileri de düşer", () => {
  const automations = validateAutomations([
    automation({
      id: "butonla-lamba",
      triggers: [
        { type: "deviceAction", deviceId: switchId, action: "1_single" },
        { type: "time", at: "19:00", days: [1] }
      ]
    }),
    automation({
      id: "yalniz-buton",
      triggers: [{ type: "deviceAction", deviceId: switchId, action: "2_single" }]
    })
  ]);
  const remaining = removeDeviceFromAutomations(automations, switchId.toUpperCase());
  assert.deepEqual(remaining.map((entry) => entry.id), ["butonla-lamba"]);
  assert.deepEqual(remaining[0]?.triggers, [{ type: "time", at: "19:00", days: [1] }]);
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

/** §9 — hareket sensörü kuralı; "sonra kapat" bu kuralın içinde yaşar. */
const motionRule = (autoOff: unknown): Record<string, unknown> => automation({
  triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy", equals: true }],
  actions: [{ type: "device", deviceId: lampId, property: "state_l1", value: "ON", autoOff }]
});

test("sonra kapat alanı süreyle ve hareket bitişiyle kaydedilir", () => {
  const timed = validateAutomations([motionRule({ mode: "after", seconds: 300, value: "OFF" })]);
  assert.deepEqual(timed[0]?.actions[0]?.autoOff, { mode: "after", seconds: 300, value: "OFF" });

  const idle = validateAutomations([motionRule({ mode: "idle", seconds: 0, value: "OFF" })]);
  assert.deepEqual(idle[0]?.actions[0]?.autoOff, { mode: "idle", seconds: 0, value: "OFF" });

  // Alanı hiç taşımayan eski kural aynen geçer ve alan uydurulmaz.
  const legacy = validateAutomations([automation()]);
  assert.equal(legacy[0]?.actions[0]?.autoOff, undefined);
  assert.equal("autoOff" in (legacy[0]?.actions[0] ?? {}), false);
});

test("hareket bitince kapatma durum tetikleyicisi olmadan reddedilir", () => {
  // Zaman tetikleyicisinde "hareket bitti" diye bir an yok.
  assert.throws(
    () => validateAutomations([automation({
      actions: [{
        type: "device", deviceId: lampId, property: "state_l1", value: "ON",
        autoOff: { mode: "idle", seconds: 0, value: "OFF" }
      }]
    })]),
    /durum bildiren bir tetikleyici/
  );
  // Her değişimde tetiklenen kuralda da "tetikleyen değerden çıkış" tanımsızdır.
  assert.throws(
    () => validateAutomations([automation({
      triggers: [{ type: "deviceState", deviceId: sensorId, property: "occupancy" }],
      actions: [{
        type: "device", deviceId: lampId, property: "state_l1", value: "ON",
        autoOff: { mode: "idle", seconds: 0, value: "OFF" }
      }]
    })]),
    /durum bildiren bir tetikleyici/
  );
});

test("bozuk sonra kapat ayarları reddedilir", () => {
  assert.throws(() => validateAutomations([motionRule({ mode: "sonra", seconds: 60, value: "OFF" })]), /türü geçersiz/);
  assert.throws(() => validateAutomations([motionRule({ mode: "after", seconds: 0, value: "OFF" })]), /süresi geçersiz/);
  assert.throws(() => validateAutomations([motionRule({ mode: "after", seconds: 86_401, value: "OFF" })]), /süresi geçersiz/);
  assert.throws(() => validateAutomations([motionRule({ mode: "after", seconds: 1.5, value: "OFF" })]), /süresi geçersiz/);
  assert.throws(() => validateAutomations([motionRule({ mode: "after", seconds: 60, value: "ON" })]), /aynı olamaz/);
  assert.throws(() => validateAutomations([motionRule({ mode: "after", seconds: 60, value: "OFF", extra: 1 })]), /bilinmeyen alan/);
  assert.throws(() => validateAutomations([motionRule("hemen")]), /ayarı geçersiz/);
});

test("bekleyen otomatik kapatmalar atomik yazılır ve doğrulanır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-auto-off-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "automation-auto-off.json");
  const store = new AutomationAutoOffStore(path);

  assert.deepEqual(await store.get(), []);
  const entry = {
    automationId: "koridor-hareket",
    automationName: "Koridor hareket",
    deviceId: lampId,
    property: "state_l1",
    value: "OFF" as const,
    appliedValue: "ON" as const,
    mode: "idle" as const,
    seconds: 60,
    dueAt: null,
    watch: { deviceId: sensorId, property: "occupancy", activeValue: true }
  };
  await store.save([entry]);
  assert.deepEqual(await store.get(), [entry]);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), [entry]);

  assert.throws(
    () => validateAutomationAutoOffEntries([{ ...entry, deviceId: "lamba" }]),
    /cihaz UID/
  );
  assert.throws(
    () => validateAutomationAutoOffEntries([{ ...entry, dueAt: "yarın" }]),
    /zamanı geçersiz/
  );
});
