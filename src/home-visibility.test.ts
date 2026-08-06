import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  HomeVisibilityStore,
  maxHiddenDevices,
  maxHiddenGroups,
  pruneHomeVisibilityGroups,
  removeDeviceFromHomeVisibility,
  validateHomeVisibility
} from "./home-visibility.js";

const deviceOne = "0xa4c138ea872c2c8e";
const deviceTwo = "0x20a716fffe6835f1";

const storeIn = async (context: { after: (callback: () => Promise<void>) => void }) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-visibility-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "home-visibility.json");
  return { path, store: new HomeVisibilityStore(path) };
};

test("kayıt boş başlar: varsayılan her şey görünür", async (context) => {
  const { store } = await storeIn(context);

  assert.deepEqual(await store.get(), { hiddenDevices: [], hiddenGroups: [] });
  assert.deepEqual(validateHomeVisibility(undefined), { hiddenDevices: [], hiddenGroups: [] });
  assert.deepEqual(validateHomeVisibility({}), { hiddenDevices: [], hiddenGroups: [] });
});

test("gizlenenler UID ve kontrol kimliğiyle saklanır, yinelenen kayıt tekilleşir", () => {
  assert.deepEqual(validateHomeVisibility({
    hiddenDevices: [
      { deviceId: "0xA4C138EA872C2C8E", controlId: "L1" },
      { deviceId: deviceOne, controlId: "l1" },
      { deviceId: deviceTwo, controlId: "@device" }
    ],
    hiddenGroups: ["Salon", "salon", "auto:lights"]
  }), {
    hiddenDevices: [
      { deviceId: deviceOne, controlId: "l1" },
      { deviceId: deviceTwo, controlId: "@device" }
    ],
    hiddenGroups: ["salon", "auto:lights"]
  });
});

test("bilinmeyen alan ve bozuk kimlik reddedilir", () => {
  assert.throws(() => validateHomeVisibility({ hiddenTiles: [] }), /tanınmayan alan/);
  assert.throws(
    () => validateHomeVisibility({ hiddenDevices: [{ deviceId: deviceOne, controlId: "main", why: 1 }] }),
    /tanınmayan alan/
  );
  assert.throws(() => validateHomeVisibility({ hiddenDevices: [{ deviceId: "salon", controlId: "main" }] }));
  assert.throws(() => validateHomeVisibility({ hiddenGroups: ["oda odası"] }));
  assert.throws(() => validateHomeVisibility([]));
});

test("üst sınırlar favorilerdekinden geniş ama sınırsız değil", () => {
  const entry = (index: number) => ({
    deviceId: `0x${index.toString(16).padStart(16, "0")}`,
    controlId: "main"
  });
  // 64'lük favori sınırı gizleme için dar kalır: karar kontrol başına verilebiliyor.
  assert.equal(maxHiddenDevices, 1024);
  assert.equal(maxHiddenGroups, 64);
  assert.equal(
    validateHomeVisibility({
      hiddenDevices: Array.from({ length: maxHiddenDevices }, (_value, index) => entry(index))
    }).hiddenDevices.length,
    maxHiddenDevices
  );
  assert.throws(() => validateHomeVisibility({
    hiddenDevices: Array.from({ length: maxHiddenDevices + 1 }, (_value, index) => entry(index))
  }));
  assert.throws(() => validateHomeVisibility({
    hiddenGroups: Array.from({ length: maxHiddenGroups + 1 }, (_value, index) => `oda-${index}`)
  }));
});

test("kayıt atomik yazılır ve yalnız gizlenenleri tutar", async (context) => {
  const { path, store } = await storeIn(context);
  await store.save({
    hiddenDevices: [{ deviceId: deviceOne, controlId: "main" }],
    hiddenGroups: ["salon"]
  });

  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    hiddenDevices: [{ deviceId: deviceOne, controlId: "main" }],
    hiddenGroups: ["salon"]
  });
});

test("cihaz silinince UID'ye bağlı tüm gizleme kayıtları düşer, odalar durur", async (context) => {
  const { store } = await storeIn(context);
  await store.save({
    hiddenDevices: [
      { deviceId: deviceOne, controlId: "main" },
      { deviceId: deviceOne, controlId: "l1" },
      { deviceId: deviceTwo, controlId: "main" }
    ],
    hiddenGroups: ["salon"]
  });

  assert.deepEqual(await store.removeDevice("0xA4C138EA872C2C8E"), {
    hiddenDevices: [{ deviceId: deviceTwo, controlId: "main" }],
    hiddenGroups: ["salon"]
  });
});

test("oda silinince gizleme kaydı düşer, türetilmiş kartlar korunur", async (context) => {
  const { store } = await storeIn(context);
  await store.save({
    hiddenDevices: [{ deviceId: deviceOne, controlId: "main" }],
    hiddenGroups: ["salon", "mutfak", "auto:lights", "auto:noroom"]
  });

  // Oda listesi yazıldığında karşılığı kalmayan kayıtlar düşer; `auto:` kartları odaya bağlı değil.
  const pruned = await store.pruneGroups(["mutfak"]);
  assert.deepEqual(pruned.hiddenGroups, ["mutfak", "auto:lights", "auto:noroom"]);
  assert.deepEqual(pruned.hiddenDevices, [{ deviceId: deviceOne, controlId: "main" }]);
  assert.deepEqual((await store.get()).hiddenGroups, ["mutfak", "auto:lights", "auto:noroom"]);
});

test("saf temizlik yardımcıları girdilerini değiştirmez", () => {
  const visibility = {
    hiddenDevices: [{ deviceId: deviceOne, controlId: "main" }],
    hiddenGroups: ["salon"]
  };

  assert.deepEqual(removeDeviceFromHomeVisibility(visibility, deviceOne).hiddenDevices, []);
  assert.deepEqual(pruneHomeVisibilityGroups(visibility, []).hiddenGroups, []);
  assert.deepEqual(visibility, {
    hiddenDevices: [{ deviceId: deviceOne, controlId: "main" }],
    hiddenGroups: ["salon"]
  });
});
