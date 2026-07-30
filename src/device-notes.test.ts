import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DeviceNotesStore, validateDeviceNote } from "./device-notes.js";

test("cihaz notu UID ile kalıcı saklanır ve temizlenir", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-notes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new DeviceNotesStore(join(directory, "notes.json"));
  const id = "0x00124b0000000001";
  assert.equal(await store.set(id, "  Sol duvar anahtarı  "), "Sol duvar anahtarı");
  assert.equal(await store.get(id), "Sol duvar anahtarı");
  await store.removeDevice(id);
  assert.equal(await store.get(id), "");
});

test("cihaz notu kısa ve güvenli tutulur", () => {
  assert.throws(() => validateDeviceNote("x".repeat(501)));
  assert.throws(() => validateDeviceNote({}));
});
