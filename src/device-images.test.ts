import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeviceImage, validateDeviceImagePreferences } from "./device-images.js";

test("kesin üretici parmak izi otomatik doğru görseli seçer", () => {
  const image = resolveDeviceImage(
    "0xabc",
    "TS0001",
    "_TZ3000_i9oy2rdq",
    { devices: {}, models: {} }
  );

  assert.equal(image.model, "WHD02");
  assert.equal(image.selectionRequired, false);
  assert.ok(image.candidates.length > 1);
});

test("genel model birden fazla aday olduğunda kullanıcı seçimi ister", () => {
  const image = resolveDeviceImage(
    "0xabc",
    "TS0001",
    "_TZ3000_unknown",
    { devices: {}, models: {} }
  );

  assert.equal(image.selectionRequired, true);
  assert.deepEqual(
    image.candidates.map((candidate) => candidate.model),
    ["WHD02", "TS0001_switch_module_1", "TS0001_switch_1_gang", "TS0001"]
  );
});

test("UID tercihi model ailesi tercihinden önceliklidir", () => {
  const image = resolveDeviceImage(
    "0xABC",
    "TS0001",
    "_TZ3000_unknown",
    {
      devices: { "0xabc": "WHD02" },
      models: { "TS0001::_TZ3000_unknown": "TS0001_switch_1_gang" }
    }
  );

  assert.equal(image.model, "WHD02");
  assert.equal(image.userSelected, true);
  assert.equal(image.selectionRequired, false);
});

test("genel ikon seçimi null olarak güvenle saklanır", () => {
  assert.deepEqual(
    validateDeviceImagePreferences({
      devices: { "0xabc": null, invalid: 42 },
      models: { "TS0001::_TZ": null }
    }),
    {
      devices: { "0xabc": null },
      models: { "TS0001::_TZ": null }
    }
  );
});
