import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertPanelGraph,
  collectPanelGraph,
  collectTopLevelDeclarations,
  panelDigest,
  parsePanelScriptTags,
  parseFailure
} from "./panel-graph.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Sahte panel: yalniz index.html + public/js, gercek panelin kurallariyla ayni. */
async function withTempPanel(scripts, body, { tags = Object.keys(scripts) } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "panel-graph-"));
  try {
    await mkdir(path.join(directory, "public", "js"), { recursive: true });
    await mkdir(path.join(directory, "public", "css"), { recursive: true });
    await writeFile(path.join(directory, "public", "css", "panel.css"), ":root{--a:1}", "utf8");
    await writeFile(
      path.join(directory, "public", "index.html"),
      `<body>\n${tags.map((name) => `<script src="/js/${name}"></script>`).join("\n")}\n</body>`,
      "utf8"
    );
    for (const [name, source] of Object.entries(scripts)) {
      await writeFile(path.join(directory, "public", "js", name), source, "utf8");
    }
    await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("belge sirasindaki script adresleri okunur", () => {
  const document = '<script src="/js/10-core.js"></script>\n<script src="/js/99-bind.js"></script>';
  assert.deepEqual(parsePanelScriptTags(document), ["/js/10-core.js", "/js/99-bind.js"]);
});

test("ust duzey bildirimler iki bosluk girintiyle taninir, derin girinti sayilmaz", () => {
  const source = [
    "  const alpha=1;",
    "  async function beta(){",
    "    const inner=2;",
    "    return inner;",
    "  }",
    "  class Gamma{}",
    "  let delta;"
  ].join("\n");
  assert.deepEqual(collectTopLevelDeclarations(source), ["alpha", "beta", "Gamma", "delta"]);
});

test("bozuk sozdizimi mesajla raporlanir", () => {
  assert.equal(parseFailure("  const a=1;"), null);
  assert.match(parseFailure("  const a=;"), /Unexpected/);
});

test("etiketi olup diskte olmayan dosya yakalanir", async () => {
  await withTempPanel(
    { "99-bind.js": "  initialize();" },
    async (directory) => {
      const graph = await collectPanelGraph(directory);
      assert.deepEqual(graph.missing, ["/js/10-core.js"]);
      await assert.rejects(
        () => assertPanelGraph(directory),
        /public\/js altinda olmayan dosya: \/js\/10-core\.js/
      );
    },
    { tags: ["10-core.js", "99-bind.js"] }
  );
});

test("diskte olup etiketi olmayan dosya yakalanir", async () => {
  await withTempPanel(
    { "10-core.js": "  const state={};", "99-bind.js": "  initialize();" },
    async (directory) => {
      const graph = await collectPanelGraph(directory);
      assert.deepEqual(graph.unlisted, ["/js/10-core.js"]);
      await assert.rejects(() => assertPanelGraph(directory), /etiketi olmayan dosya: \/js\/10-core\.js/);
    },
    { tags: ["99-bind.js"] }
  );
});

test("99-bind.js en sonda degilse hata verir", async () => {
  await withTempPanel(
    { "10-core.js": "  const state={};", "99-bind.js": "  initialize();" },
    async (directory) => {
      await assert.rejects(
        () => assertPanelGraph(directory),
        /son dosya \/js\/99-bind\.js olmali/
      );
    },
    { tags: ["99-bind.js", "10-core.js"] }
  );
});

test("sayi onekleri artan sirada olmali", async () => {
  await withTempPanel(
    {
      "10-core.js": "  const state={};",
      "40-home.js": "  const home=1;",
      "99-bind.js": "  initialize();"
    },
    async (directory) => {
      await assert.rejects(
        () => assertPanelGraph(directory),
        /\/js\/10-core\.js dosyasi \/js\/40-home\.js dosyasindan sonra gelemez/
      );
    },
    { tags: ["40-home.js", "10-core.js", "99-bind.js"] }
  );
});

test("ayristirilamayan panel dosyasi paketlemeyi durdurur", async () => {
  await withTempPanel(
    { "10-core.js": "  const state={;", "99-bind.js": "  initialize();" },
    async (directory) => {
      await assert.rejects(() => assertPanelGraph(directory), /ayristirilamadi: \/js\/10-core\.js/);
    }
  );
});

test("iki dosyada ayni ust duzey ad hata verir", async () => {
  await withTempPanel(
    {
      "10-core.js": "  const showToast=()=>{};",
      "40-home.js": "  const showToast=()=>{};",
      "99-bind.js": "  initialize();"
    },
    async (directory) => {
      const graph = await collectPanelGraph(directory);
      assert.deepEqual(graph.duplicates, ["showToast (/js/10-core.js + /js/40-home.js)"]);
      await assert.rejects(() => assertPanelGraph(directory), /Ayni ust duzey ad/);
    }
  );
});

test("ad taramasindan kacan cakisma birlesik ayristirmada yakalanir", async () => {
  await withTempPanel(
    {
      "10-core.js": "  const alpha=1;",
      "40-home.js": "  const\n  alpha=2;",
      "99-bind.js": "  initialize();"
    },
    async (directory) => {
      const graph = await collectPanelGraph(directory);
      assert.deepEqual(graph.duplicates, []);
      assert.match(String(graph.bundleError), /already been declared/);
      await assert.rejects(() => assertPanelGraph(directory), /birlikte ayristirilamadi/);
    }
  );
});

test("ayni ozet iki kez ayni sonucu verir ve dosya listesi alfabetiktir", async () => {
  const first = await panelDigest(projectRoot);
  const second = await panelDigest(projectRoot);
  assert.equal(first.sha256, second.sha256);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(first.files, [...first.files].sort());
  assert.ok(first.files.includes("index.html"));
  assert.ok(first.files.includes("css/panel.css"));
  assert.ok(first.files.includes("js/99-bind.js"));
});

test("panel dosyasi degisince ozet degisir", async () => {
  await withTempPanel(
    { "10-core.js": "  const state={};", "99-bind.js": "  initialize();" },
    async (directory) => {
      const before = await panelDigest(directory);
      await writeFile(path.join(directory, "public", "css", "panel.css"), ":root{--a:2}", "utf8");
      const after = await panelDigest(directory);
      assert.notEqual(before.sha256, after.sha256);
      assert.deepEqual(before.files, after.files);
    }
  );
});

test("gercek panel grafigi eksiksiz cozulur", async () => {
  const graph = await assertPanelGraph(projectRoot);
  assert.deepEqual(graph.missing, []);
  assert.deepEqual(graph.unlisted, []);
  assert.deepEqual(graph.duplicates, []);
  assert.equal(graph.tags.at(-1), "/js/99-bind.js");
  assert.equal(graph.tags.length, graph.files.length);
});
