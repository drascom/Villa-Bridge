import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AutomationBackupStore, maxAutomationBackups } from "./automation-backup.js";

const setup = async (context: { after: (callback: () => Promise<void>) => void }): Promise<{
  source: string;
  directory: string;
  clock: { value: number };
  store: AutomationBackupStore;
}> => {
  const root = await mkdtemp(join(tmpdir(), "villa-automation-backup-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const source = join(root, "automations.json");
  const directory = join(root, "automation-backups");
  const clock = { value: Date.parse("2026-08-08T10:00:00.000Z") };
  return {
    source,
    directory,
    clock,
    store: new AutomationBackupStore(source, directory, { now: () => new Date(clock.value) })
  };
};

const write = async (path: string, names: string[]): Promise<void> =>
  writeFile(path, JSON.stringify(names.map((name) => ({ name }))), "utf8");

test("yedek yazmadan önceki hâli saklar ve en yeniden eskiye listelenir", async (context) => {
  const { source, store, clock } = await setup(context);
  // Kural dosyası henüz yoksa yedek de yoktur ve bu bir hata değildir.
  assert.equal(await store.capture(), null);
  assert.deepEqual(await store.list(), []);

  await write(source, ["bir"]);
  const first = await store.capture();
  assert.match(String(first), /^automations-2026-08-08T10-00-00-000Z-\d{3}\.json$/);

  clock.value += 60_000;
  await write(source, ["bir", "iki"]);
  await store.capture();

  const entries = await store.list();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.at), [
    "2026-08-08T10:01:00.000Z",
    "2026-08-08T10:00:00.000Z"
  ]);
});

test("en yeni yedek okunduğunda tüketilir; üst üste geri alma bir adım daha geriye gider", async (context) => {
  const { source, store, clock } = await setup(context);
  await write(source, ["bir"]);
  await store.capture();
  clock.value += 1000;
  await write(source, ["bir", "iki"]);
  await store.capture();

  const latest = await store.takeLatest();
  assert.deepEqual(latest?.automations, [{ name: "bir" }, { name: "iki" }]);
  assert.equal(latest?.at, "2026-08-08T10:00:01.000Z");
  assert.equal((await store.list()).length, 1);

  const previous = await store.takeLatest();
  assert.deepEqual(previous?.automations, [{ name: "bir" }]);
  assert.equal(await store.takeLatest(), null);
});

test("yedek sınırsız büyümez: en eskiler düşer", async (context) => {
  const { source, directory, clock } = await setup(context);
  const store = new AutomationBackupStore(source, directory, {
    now: () => new Date(clock.value),
    keep: 3
  });
  for (let index = 0; index < 6; index += 1) {
    await write(source, [`kural-${index}`]);
    await store.capture();
    clock.value += 1000;
  }
  const entries = await store.list();
  assert.equal(entries.length, 3);
  assert.equal((await readdir(directory)).length, 3);
  // Kalanlar en yeni üçüdür.
  const newest = await readFile(join(directory, entries[0].file), "utf8");
  assert.deepEqual(JSON.parse(newest), [{ name: "kural-5" }]);
  assert.equal(maxAutomationBackups, 20);
});

test("aynı milisaniyede alınan iki yedek birbirini ezmez", async (context) => {
  const { source, store } = await setup(context);
  await write(source, ["bir"]);
  await store.capture();
  await write(source, ["iki"]);
  await store.capture();

  const entries = await store.list();
  assert.equal(entries.length, 2);
  // Sıra numarası aynı damgadaki ikisini ayırır ve en yenisini belirlenimci kılar.
  assert.deepEqual((await store.takeLatest())?.automations, [{ name: "iki" }]);
  assert.deepEqual((await store.takeLatest())?.automations, [{ name: "bir" }]);
});
