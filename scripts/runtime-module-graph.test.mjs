import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertRuntimeFileList,
  assertRuntimeModuleGraph,
  collectLocalRequires,
  collectRuntimeModuleGraph,
  countDynamicRequires
} from "./runtime-module-graph.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSource = path.join(projectRoot, "apps", "runtime");

async function withTempRuntime(files, body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "runtime-graph-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      await writeFile(path.join(directory, name), source, "utf8");
    }
    await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("yerel require'lari toplar, paket disi olanlari atlar", () => {
  const source = [
    'const os = require("node:os");',
    'const mqtt = require("mqtt");',
    'const a = require("./a.cjs");',
    "const b = require( './b.cjs' );"
  ].join("\n");
  assert.deepEqual(collectLocalRequires(source), ["./a.cjs", "./b.cjs"]);
});

test("dinamik require sayilir", () => {
  assert.equal(countDynamicRequires('require("./a.cjs")'), 0);
  assert.equal(countDynamicRequires("require(name)"), 1);
});

test("eksik yerel modul missing olarak raporlanir", async () => {
  await withTempRuntime(
    { "main.cjs": 'require("./peer-watch.cjs");' },
    async (directory) => {
      const graph = await collectRuntimeModuleGraph(directory);
      assert.deepEqual(graph.resolved, ["main.cjs"]);
      assert.deepEqual(graph.missing, ["peer-watch.cjs"]);
      await assert.rejects(
        () => assertRuntimeModuleGraph(directory),
        /Pakette eksik calisma zamani modulu var: peer-watch\.cjs/
      );
    }
  );
});

test("gecisli bagimliliklar da izlenir", async () => {
  await withTempRuntime(
    {
      "main.cjs": 'require("./orchestration.cjs");',
      "orchestration.cjs": 'require("./guard.cjs");'
    },
    async (directory) => {
      await assert.rejects(
        () => assertRuntimeModuleGraph(directory),
        /guard\.cjs/
      );
    }
  );
});

test("listede olmayan yerel require paketlemeyi durdurur", async () => {
  await withTempRuntime(
    {
      "main.cjs": 'require("./peer-watch.cjs");',
      "peer-watch.cjs": "module.exports = {};"
    },
    async (directory) => {
      await assert.rejects(
        () => assertRuntimeFileList(directory, ["main.cjs"]),
        /Calisma zamani modulu paket listesinde yok: peer-watch\.cjs/
      );
      await assertRuntimeFileList(directory, ["main.cjs", "peer-watch.cjs"]);
    }
  );
});

test("gercek runtime grafigi eksiksiz cozulur", async () => {
  const graph = await assertRuntimeModuleGraph(runtimeSource);
  assert.deepEqual(graph.missing, []);
  assert.ok(graph.resolved.includes("peer-watch.cjs"));
  assert.deepEqual(graph.dynamic, []);
});
