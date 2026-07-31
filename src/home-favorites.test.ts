import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  HomeFavoritesStore,
  isHomeFavoriteControlKind,
  validateHomeFavorites
} from "./home-favorites.js";

test("ana ekran favorileri cihaz UID ve kontrol kimliğiyle saklanır", () => {
  assert.deepEqual(validateHomeFavorites([
    { deviceId: "0xA4C138EA872C2C8E", controlId: "L1" },
    { deviceId: "0xa4c138ea872c2c8e", controlId: "l1" }
  ]), [
    { deviceId: "0xa4c138ea872c2c8e", controlId: "l1" }
  ]);
});

test("geçersiz favori cihaz kimliği reddedilir", () => {
  assert.throws(() => validateHomeFavorites([{ deviceId: "kitchen", controlId: "main" }]));
});

test("ana ekran favorileri günlük kullanılan kontrol türlerini kabul eder", () => {
  for (const kind of ["switch", "fan", "siren", "cover", "position", "lock", "climate"]) {
    assert.equal(isHomeFavoriteControlKind(kind), true, kind);
  }
  for (const kind of ["temperature", "number", "select"]) {
    assert.equal(isHomeFavoriteControlKind(kind), false, kind);
  }
});

test("cihaz kaldırıldığında UID'ye bağlı tüm ana ekran favorileri silinir", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-favorites-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new HomeFavoritesStore(join(directory, "home-favorites.json"));
  await store.save([
    { deviceId: "0xa4c138ea872c2c8e", controlId: "main" },
    { deviceId: "0xa4c138ea872c2c8e", controlId: "l1" },
    { deviceId: "0x20a716fffe6835f1", controlId: "main" }
  ]);

  assert.deepEqual(await store.removeDevice("0xA4C138EA872C2C8E"), [
    { deviceId: "0x20a716fffe6835f1", controlId: "main" }
  ]);
});
