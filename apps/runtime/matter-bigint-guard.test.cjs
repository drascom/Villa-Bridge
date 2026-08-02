"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const {
  guardBigIntJson,
  guardMatterStorage,
  installMatterBigIntGuard,
  isGuarded,
  resolveMatterNodejsEsmEntry
} = require("./matter-bigint-guard.cjs");

const MATTER_GENERAL = path.join(
  __dirname,
  "node_modules",
  "matterbridge",
  "node_modules",
  "@matter",
  "general"
);

// Gercek kutuphane dosyalari: sarmalayici bunlarla dogrulanmali.
const stringifyToolsCjs = require(
  path.join(MATTER_GENERAL, "dist", "cjs", "storage", "StringifyTools.js")
);

function applyHerdsmanPatch() {
  // zigbee-herdsman'in gercek yamasi.
  delete require.cache[require.resolve("zigbee-herdsman/dist/utils/patchBigIntSerialization.js")];
  require("zigbee-herdsman/dist/utils/patchBigIntSerialization.js");
  return BigInt.prototype.toJSON;
}

function clearBigIntPatch() {
  delete BigInt.prototype.toJSON;
}

function hasBigIntPatch() {
  return Object.prototype.hasOwnProperty.call(BigInt.prototype, "toJSON");
}

test("herdsman yamasi altinda korumasiz toJson BigInt'i duz string yazar", (context) => {
  context.after(clearBigIntPatch);
  applyHerdsmanPatch();

  const json = stringifyToolsCjs.toJson({ nodeId: 1234567890123n });

  assert.equal(json, '{"nodeId":"1234567890123"}');
});

test("koruma altinda toJson dogru BigInt sarmalayicisini uretir", (context) => {
  context.after(clearBigIntPatch);
  applyHerdsmanPatch();
  const guardedToJson = guardBigIntJson(stringifyToolsCjs.toJson);

  const json = guardedToJson({ nodeId: 1234567890123n });

  assert.equal(
    json,
    '{"nodeId":"{\\"__object__\\":\\"BigInt\\",\\"__value__\\":\\"1234567890123\\"}"}'
  );
  assert.deepEqual(stringifyToolsCjs.fromJson(json), { nodeId: 1234567890123n });
});

test("koruma calistiktan sonra herdsman yamasi aynen geri gelir", (context) => {
  context.after(clearBigIntPatch);
  const patch = applyHerdsmanPatch();
  const before = Object.getOwnPropertyDescriptor(BigInt.prototype, "toJSON");

  guardBigIntJson(stringifyToolsCjs.toJson)({ nodeId: 7n });

  assert.equal(hasBigIntPatch(), true);
  assert.equal(BigInt.prototype.toJSON, patch);
  assert.deepEqual(Object.getOwnPropertyDescriptor(BigInt.prototype, "toJSON"), before);
  assert.equal(JSON.stringify({ value: 7n }), '{"value":"7"}');
});

test("sarmalanan fonksiyon firlatirsa da yama geri gelir", (context) => {
  context.after(clearBigIntPatch);
  const patch = applyHerdsmanPatch();
  const guarded = guardBigIntJson(() => {
    assert.equal(hasBigIntPatch(), false);
    throw new Error("depo yazimi basarisiz");
  });

  assert.throws(() => guarded(), /depo yazimi basarisiz/);
  assert.equal(BigInt.prototype.toJSON, patch);
});

test("yama hic yokken koruma prototipe toJSON eklemez", () => {
  clearBigIntPatch();
  assert.equal(hasBigIntPatch(), false);

  const json = guardBigIntJson(stringifyToolsCjs.toJson)({ nodeId: 5n });

  assert.equal(hasBigIntPatch(), false);
  assert.equal(
    json,
    '{"nodeId":"{\\"__object__\\":\\"BigInt\\",\\"__value__\\":\\"5\\"}"}'
  );
});

test("koruma idempotenttir ve ic ice cagrilarda yamayi bozmaz", (context) => {
  context.after(clearBigIntPatch);
  const patch = applyHerdsmanPatch();
  const once = guardBigIntJson(stringifyToolsCjs.toJson);
  const twice = guardBigIntJson(once);

  assert.equal(twice, once);
  assert.equal(isGuarded(once), true);

  const nested = guardBigIntJson(() => {
    assert.equal(hasBigIntPatch(), false);
    const inner = guardBigIntJson(() => {
      assert.equal(hasBigIntPatch(), false);
      return "ic";
    })();
    assert.equal(hasBigIntPatch(), false);
    return inner;
  });

  assert.equal(nested(), "ic");
  assert.equal(BigInt.prototype.toJSON, patch);
});

test("calisma zamaninda yuklenen ESM toJson da korunur", async (context) => {
  context.after(clearBigIntPatch);
  const esmEntry = path.join(MATTER_GENERAL, "dist", "esm", "index.js");
  assert.equal(fs.existsSync(esmEntry), true);
  const general = await import(pathToFileURL(esmEntry).href);
  // ESM disa aktarimlari salt-okunur: dogrudan yamalanamaz, bu yuzden cagrildigi
  // yer sarmalanir.
  assert.throws(() => {
    general.toJson = () => "";
  }, TypeError);

  const patch = applyHerdsmanPatch();
  assert.equal(general.toJson({ nodeId: 9n }), '{"nodeId":"9"}');
  assert.equal(
    guardBigIntJson(general.toJson)({ nodeId: 9n }),
    '{"nodeId":"{\\"__object__\\":\\"BigInt\\",\\"__value__\\":\\"9\\"}"}'
  );
  assert.equal(BigInt.prototype.toJSON, patch);
});

test("guardMatterStorage gercek matter depo siniflarini sarmalar", async () => {
  const entry = resolveMatterNodejsEsmEntry(
    path.join(__dirname, "node_modules", "matterbridge")
  );
  assert.equal(typeof entry, "string");
  assert.match(entry, /dist[\\/]esm[\\/]index\.js$/);
  const namespace = await import(pathToFileURL(entry).href);

  const guarded = guardMatterStorage(namespace);

  assert.deepEqual(guarded.sort(), [
    "StorageBackendDiskAsync.set",
    "StorageBackendDisk.set",
    "StorageBackendJsonFile.toJson"
  ].sort());
  assert.equal(isGuarded(namespace.StorageBackendDiskAsync.prototype.set), true);
  assert.deepEqual(guardMatterStorage(namespace), []);
});

test("korunan StorageBackendDiskAsync BigInt'i geri okunabilir yazar", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "villa-matter-bigint-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  context.after(clearBigIntPatch);

  const result = await installMatterBigIntGuard({
    searchDirectory: path.join(__dirname, "node_modules", "matterbridge")
  });
  assert.equal(typeof result.entry, "string");

  const namespace = await import(pathToFileURL(result.entry).href);
  const general = await import(
    pathToFileURL(path.join(MATTER_GENERAL, "dist", "esm", "index.js")).href
  );
  const patch = applyHerdsmanPatch();

  const backend = new namespace.StorageBackendDiskAsync(directory);
  await backend.initialize();
  await backend.set(["root", "fabrics"], "0", { rootNodeId: 15520773389n, label: "My Home" });
  await backend.close();

  const stored = await new namespace.StorageBackendDiskAsync(directory).get(
    ["root", "fabrics"],
    "0"
  );
  assert.equal(typeof stored.rootNodeId, "bigint");
  assert.equal(stored.rootNodeId, 15520773389n);
  assert.equal(stored.label, "My Home");
  assert.equal(BigInt.prototype.toJSON, patch);

  // Referans: koruma olmasa ayni yazim duz string uretirdi.
  assert.equal(general.toJson({ rootNodeId: 15520773389n }), '{"rootNodeId":"15520773389"}');
});
