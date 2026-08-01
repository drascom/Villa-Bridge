import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  HomeGroupsStore,
  maxHomeGroupItems,
  maxHomeGroups,
  removeDeviceFromHomeGroups,
  validateHomeGroups
} from "./home-groups.js";

const item = (index: number) => ({
  deviceId: `0xa4c138ea872c2c${index.toString(16).padStart(2, "0")}`,
  controlId: "main"
});

test("ana ekran grupları normalize edilerek kabul edilir", () => {
  assert.deepEqual(validateHomeGroups([
    {
      id: "Salon-1",
      name: "  Salon  ",
      items: [
        { deviceId: "0xA4C138EA872C2C8E", controlId: "L1" },
        { deviceId: "0xa4c138ea872c2c8e", controlId: " l1 " },
        { deviceId: "0x20a716fffe6835f1", controlId: "main" }
      ]
    }
  ]), [
    {
      id: "salon-1",
      name: "Salon",
      items: [
        { deviceId: "0xa4c138ea872c2c8e", controlId: "l1" },
        { deviceId: "0x20a716fffe6835f1", controlId: "main" }
      ]
    }
  ]);
});

test("aynı kimlikli ana ekran grubu tekilleştirilir", () => {
  const groups = validateHomeGroups([
    { id: "salon", name: "Salon", items: [] },
    { id: "SALON", name: "Salon kopya", items: [] },
    { id: "mutfak", name: "Mutfak", items: [] }
  ]);
  assert.deepEqual(groups.map((group) => group.id), ["salon", "mutfak"]);
  assert.equal(groups[0]?.name, "Salon");
});

test("ana ekran grubu özel @device kontrol kimliğini kabul eder", () => {
  assert.deepEqual(validateHomeGroups([
    { id: "tum-isiklar", name: "Tüm ışıklar", items: [{ deviceId: "0xa4c138ea872c2c8e", controlId: "@device" }] }
  ]), [
    { id: "tum-isiklar", name: "Tüm ışıklar", items: [{ deviceId: "0xa4c138ea872c2c8e", controlId: "@device" }] }
  ]);
});

test("geçersiz ana ekran grubu alanları reddedilir", () => {
  assert.throws(() => validateHomeGroups({ id: "salon" }));
  assert.throws(() => validateHomeGroups(["salon"]));
  assert.throws(() => validateHomeGroups([{ id: "Salon Odası", name: "Salon", items: [] }]));
  assert.throws(() => validateHomeGroups([{ id: "", name: "Salon", items: [] }]));
  assert.throws(() => validateHomeGroups([{ id: "salon", name: "   ", items: [] }]));
  assert.throws(() => validateHomeGroups([{ id: "salon", name: "a".repeat(65), items: [] }]));
  assert.throws(() => validateHomeGroups([{ id: "salon", name: "Salon" }]));
  assert.throws(() => validateHomeGroups([
    { id: "salon", name: "Salon", items: [{ deviceId: "mutfak", controlId: "main" }] }
  ]));
  assert.throws(() => validateHomeGroups([
    { id: "salon", name: "Salon", items: [{ deviceId: "0xa4c138ea872c2c8e", controlId: "ana kontrol" }] }
  ]));
});

test("ana ekran grubu ve öğe üst sınırları uygulanır", () => {
  const groups = Array.from({ length: maxHomeGroups }, (_value, index) => ({
    id: `oda-${index}`,
    name: `Oda ${index}`,
    items: []
  }));
  assert.equal(validateHomeGroups(groups).length, maxHomeGroups);
  assert.throws(() => validateHomeGroups([...groups, { id: "fazla", name: "Fazla", items: [] }]));

  const items = Array.from({ length: maxHomeGroupItems }, (_value, index) => item(index));
  assert.equal(validateHomeGroups([{ id: "salon", name: "Salon", items }])[0]?.items.length, maxHomeGroupItems);
  assert.throws(() => validateHomeGroups([
    { id: "salon", name: "Salon", items: [...items, item(maxHomeGroupItems)] }
  ]));
});

test("cihaz kaldırıldığında UID tüm ana ekran gruplarından düşer", () => {
  assert.deepEqual(removeDeviceFromHomeGroups([
    {
      id: "salon",
      name: "Salon",
      items: [
        { deviceId: "0xa4c138ea872c2c8e", controlId: "main" },
        { deviceId: "0x20a716fffe6835f1", controlId: "main" }
      ]
    },
    { id: "mutfak", name: "Mutfak", items: [{ deviceId: "0xa4c138ea872c2c8e", controlId: "l1" }] }
  ], "0xA4C138EA872C2C8E"), [
    { id: "salon", name: "Salon", items: [{ deviceId: "0x20a716fffe6835f1", controlId: "main" }] },
    { id: "mutfak", name: "Mutfak", items: [] }
  ]);
});

test("ana ekran grupları atomik olarak yazılır ve geri okunur", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-groups-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "home-groups.json");
  const store = new HomeGroupsStore(path);

  assert.deepEqual(await store.get(), []);
  const saved = await store.save([
    {
      id: "salon",
      name: "Salon",
      items: [
        { deviceId: "0xa4c138ea872c2c8e", controlId: "main" },
        { deviceId: "0x20a716fffe6835f1", controlId: "@device" }
      ]
    }
  ]);
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), saved);
  assert.deepEqual(await store.get(), saved);

  assert.deepEqual(await store.removeDevice("0xa4c138ea872c2c8e"), [
    { id: "salon", name: "Salon", items: [{ deviceId: "0x20a716fffe6835f1", controlId: "@device" }] }
  ]);
  assert.deepEqual(await store.get(), [
    { id: "salon", name: "Salon", items: [{ deviceId: "0x20a716fffe6835f1", controlId: "@device" }] }
  ]);
});
