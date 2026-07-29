import assert from "node:assert/strict";
import test from "node:test";
import { isDeviceRemovalConfirmation } from "./removal-confirmation.js";

test("cihaz silme yalnız küçük harfli yes veya evet ile onaylanır", () => {
  assert.equal(isDeviceRemovalConfirmation("yes"), true);
  assert.equal(isDeviceRemovalConfirmation("evet"), true);
  assert.equal(isDeviceRemovalConfirmation(" yes "), true);
  assert.equal(isDeviceRemovalConfirmation("YES"), false);
  assert.equal(isDeviceRemovalConfirmation("Evet"), false);
  assert.equal(isDeviceRemovalConfirmation("device name"), false);
  assert.equal(isDeviceRemovalConfirmation(null), false);
});
