import assert from "node:assert/strict";
import test from "node:test";
import { inferFallbackExposes } from "./inferred-exposes.js";

test("tanımı olmayan kapı kontağı önbellek durumundan çıkarılır", () => {
  assert.deepEqual(inferFallbackExposes({ contact: false, battery: 80 }), [{
    type: "binary",
    name: "contact",
    property: "contact",
    access: 1,
    description: "Indicates whether the contact is closed",
    value_on: true,
    value_off: false
  }]);
});

test("tanınan sensör alanı yoksa varsayılan expose üretilmez", () => {
  assert.deepEqual(inferFallbackExposes({ battery: 80 }), []);
  assert.deepEqual(inferFallbackExposes(undefined), []);
});
