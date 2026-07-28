import assert from "node:assert/strict";
import test from "node:test";
import { validateHomeFavorites } from "./home-favorites.js";

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
