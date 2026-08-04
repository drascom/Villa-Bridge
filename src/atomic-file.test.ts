import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeFileAtomic, writeJsonAtomic } from "./atomic-file.js";
import { AutomationAutoOffStore } from "./automations.js";

async function temporaryDirectory(context: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "villa-atomic-file-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("aynı hedefe eşzamanlı yazmalar hata vermez, son yazma kalır", async (context) => {
  const directory = await temporaryDirectory(context);
  const path = join(directory, "state.json");
  // Büyük içerik: yazmaların gerçekten üst üste binmesini garantiler.
  const payload = (index: number) => ({
    index,
    devices: Array.from({ length: 4000 }, (_, item) => `0x${index}${item.toString(16)}`)
  });

  const results = await Promise.allSettled([
    writeJsonAtomic(path, payload(1)),
    writeJsonAtomic(path, payload(2)),
    writeJsonAtomic(path, payload(3))
  ]);

  assert.deepEqual(results.map((entry) => entry.status), ["fulfilled", "fulfilled", "fulfilled"]);
  const persisted = JSON.parse(await readFile(path, "utf8")) as { index: number };
  assert.equal(persisted.index, 3);
  assert.deepEqual(await readdir(directory), ["state.json"]);
});

test("art arda gelen eşzamanlı yazma turları geçerli JSON bırakır", async (context) => {
  const directory = await temporaryDirectory(context);
  const path = join(directory, "state.json");

  for (let round = 0; round < 5; round += 1) {
    await Promise.all(
      Array.from({ length: 4 }, (_, index) => writeJsonAtomic(path, { round, index }))
    );
    const persisted = JSON.parse(await readFile(path, "utf8")) as { round: number };
    assert.equal(persisted.round, round);
  }
  assert.deepEqual(await readdir(directory), ["state.json"]);
});

test("bekleyen otomatik kapatma dosyası eşzamanlı kaydedilebilir", async (context) => {
  const directory = await temporaryDirectory(context);
  const path = join(directory, "automation-auto-off.json");
  const store = new AutomationAutoOffStore(path);
  const entry = (seconds: number) => [{
    automationId: "corridor",
    automationName: "Corridor Detector → Corridor light",
    deviceId: "0x0011223344556677",
    property: "state",
    value: "OFF",
    appliedValue: "ON",
    mode: "after" as const,
    seconds,
    dueAt: null,
    watch: null
  }];

  await Promise.all([store.save(entry(30)), store.save(entry(60)), store.save(entry(90))]);

  const persisted = await store.get();
  assert.equal(persisted[0]?.seconds, 90);
  assert.deepEqual(await readdir(directory), ["automation-auto-off.json"]);
});

test("atomik yazma dosya izinlerini ve içeriği korur", async (context) => {
  const directory = await temporaryDirectory(context);
  const path = join(directory, "secret.json");

  await writeFileAtomic(path, "merhaba", { mode: 0o600 });

  assert.equal(await readFile(path, "utf8"), "merhaba");
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("yazma hatası tüm eşzamanlı çağıranlara yansır", async (context) => {
  const directory = await temporaryDirectory(context);
  const path = join(directory, "olmayan-dizin", "state.json");

  const results = await Promise.allSettled([
    writeJsonAtomic(path, { index: 1 }),
    writeJsonAtomic(path, { index: 2 })
  ]);

  assert.deepEqual(results.map((entry) => entry.status), ["rejected", "rejected"]);
});
