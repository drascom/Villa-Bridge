import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  describeExternalConverters,
  lastExternalConverterLoad,
  loadExternalConverters,
  unloadExternalConverters
} from "./external-converters.js";

const makeDirectory = async (context: { after: (callback: () => Promise<void>) => void }) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-converters-"));
  context.after(async () => {
    unloadExternalConverters();
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
};

const commonJsConverter = (model: string, manufacturer: string) => `
const exposes = require("zigbee-herdsman-converters/lib/exposes");
const e = exposes.presets;
module.exports = [
  {
    fingerprint: [{ modelID: "TS0601", manufacturerName: "${manufacturer}" }],
    model: "${model}",
    vendor: "Test",
    description: "Test kapı kontağı",
    fromZigbee: [],
    toZigbee: [],
    exposes: [e.contact(), e.battery()]
  }
];
`;

test("CommonJS converter dosyası yüklenir ve kütüphaneye kaydedilir", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "door_sensor.js"), commonJsConverter("TEST-DOOR", "_TZE284_test1"), "utf8");

  const result = await loadExternalConverters(directory);
  assert.equal(result.directoryExists, true);
  assert.equal(result.failed.length, 0);
  assert.equal(result.loaded.length, 1);
  assert.equal(result.loaded[0]?.file, "door_sensor.js");
  assert.equal(result.loaded[0]?.definitions, 1);
  assert.deepEqual(result.loaded[0]?.models, ["TEST-DOOR"]);

  const { externalDefinitions } = await import("zigbee-herdsman-converters");
  assert.ok(externalDefinitions.some((definition) => definition.model === "TEST-DOOR"));
  assert.equal(lastExternalConverterLoad()?.loaded.length, 1);
});

test("converter dosyası kütüphanenin kendi modüllerini Villa Bridge'den çözer", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(
    join(directory, "tuya_door.js"),
    `
const tuya = require("zigbee-herdsman-converters/lib/tuya");
const exposes = require("zigbee-herdsman-converters/lib/exposes");
const e = exposes.presets;
module.exports = [
  {
    fingerprint: tuya.fingerprint("TS0601", ["_TZE284_villatest"]),
    model: "TEST-TUYA-DOOR",
    vendor: "Tuya",
    description: "Test",
    fromZigbee: [tuya.fz.datapoints],
    toZigbee: [tuya.tz.datapoints],
    exposes: [e.contact(), e.battery()]
  }
];
`,
    "utf8"
  );

  const result = await loadExternalConverters(directory);
  assert.deepEqual(result.failed, []);
  assert.equal(result.loaded[0]?.definitions, 1);
});

test("ESM biçimindeki converter yüklenir", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(
    join(directory, "esm_sensor.mjs"),
    `
export default [
  {
    zigbeeModel: ["TEST-ESM"],
    model: "TEST-ESM-MODEL",
    vendor: "Test",
    description: "ESM tanımı",
    fromZigbee: [],
    toZigbee: [],
    exposes: []
  }
];
`,
    "utf8"
  );

  const result = await loadExternalConverters(directory);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.loaded[0]?.models, ["TEST-ESM-MODEL"]);
});

test("`.js` uzantılı ESM dosyası da yüklenir", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(
    join(directory, "esm_in_js.js"),
    `
export default {
  zigbeeModel: ["TEST-ESM-JS"],
  model: "TEST-ESM-JS-MODEL",
  vendor: "Test",
  description: "Tek nesne",
  fromZigbee: [],
  toZigbee: [],
  exposes: []
};
`,
    "utf8"
  );

  const result = await loadExternalConverters(directory);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.loaded[0]?.models, ["TEST-ESM-JS-MODEL"]);
});

test("bozuk dosya diğerlerini engellemez", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "a_broken.js"), "module.exports = [ { throw new", "utf8");
  await writeFile(join(directory, "b_throws.js"), "throw new Error('patladım');", "utf8");
  await writeFile(join(directory, "c_empty.js"), "module.exports = [];", "utf8");
  await writeFile(join(directory, "d_good.js"), commonJsConverter("TEST-OK", "_TZE284_test2"), "utf8");

  const result = await loadExternalConverters(directory);
  assert.equal(result.loaded.length, 1);
  assert.deepEqual(result.loaded[0]?.models, ["TEST-OK"]);
  assert.equal(result.failed.length, 3);
  for (const entry of result.failed) assert.ok(entry.error && entry.error.length > 0);
  assert.match(describeExternalConverters(result), /yüklenemeyen/);
});

test("klasör yoksa hata atılmaz", async (t) => {
  const directory = await makeDirectory(t);
  const missing = join(directory, "yok-boyle-bir-klasor");

  const result = await loadExternalConverters(missing);
  assert.equal(result.directoryExists, false);
  assert.deepEqual(result.loaded, []);
  assert.deepEqual(result.failed, []);
  assert.match(describeExternalConverters(result), /klasörü yok/);
});

test("kaldırma kütüphaneyi eski haline döndürür", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "temp_sensor.js"), commonJsConverter("TEST-REMOVE", "_TZE284_test3"), "utf8");

  await loadExternalConverters(directory);
  const converters = await import("zigbee-herdsman-converters");
  assert.ok(converters.externalDefinitions.some((definition) => definition.model === "TEST-REMOVE"));
  unloadExternalConverters("temp_sensor.js");
  assert.ok(!converters.externalDefinitions.some((definition) => definition.model === "TEST-REMOVE"));
});
