import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AuthStore,
  validateAdminPassword,
  validateResidentPin
} from "./auth-store.js";

const createStore = async (context: { after: (callback: () => Promise<void>) => void }) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-auth-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "auth.json");
  return {
    path,
    store: new AuthStore(path, {
      scrypt: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 }
    })
  };
};

test("ilk yönetici ve ev kullanıcısı sırları hashlenerek saklanır", async (context) => {
  const { path, store } = await createStore(context);
  assert.equal(await store.configured(), false);

  const session = await store.setup("Owner", "correct horse battery", "638251");
  const persisted = await readFile(path, "utf8");

  assert.equal(await store.configured(), true);
  assert.equal(session.username, "owner");
  assert.equal(session.role, "admin");
  assert.doesNotMatch(persisted, /correct horse battery|638251/);
  assert.equal((await store.getSession(session.token))?.role, "admin");
});

test("yönetici parolası ve ev kullanıcısı PIN'i ayrı rollerle oturum açar", async (context) => {
  const { store } = await createStore(context);
  await store.setup("admin", "a long local passphrase", "638251");

  assert.equal((await store.login("admin", "admin", "a long local passphrase"))?.role, "admin");
  assert.equal((await store.login("resident", "", "638251"))?.role, "resident");
  assert.equal(await store.login("admin", "admin", "wrong password"), null);
  assert.equal(await store.login("resident", "", "000000"), null);
});

test("PIN değişikliği eski ev kullanıcısı oturumlarını ve PIN'i geçersiz kılar", async (context) => {
  const { store } = await createStore(context);
  await store.setup("admin", "a long local passphrase", "638251");
  const resident = await store.login("resident", "", "638251");
  assert.ok(resident);

  await store.updateResidentPin("472905");

  assert.equal(await store.getSession(resident.token), null);
  assert.equal(await store.login("resident", "", "638251"), null);
  assert.equal((await store.login("resident", "", "472905"))?.role, "resident");
});

test("oturum süresi dolar ve çıkış oturumu geçersiz kılar", async (context) => {
  let now = new Date("2026-07-30T10:00:00.000Z");
  const directory = await mkdtemp(join(tmpdir(), "villa-auth-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new AuthStore(join(directory, "auth.json"), {
    now: () => now,
    sessionLifetimeMs: 1_000,
    scrypt: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 }
  });
  const session = await store.setup("admin", "a long local passphrase", "638251");
  assert.ok(await store.getSession(session.token));

  await store.logout(session.token);
  assert.equal(await store.getSession(session.token), null);

  const next = await store.login("admin", "admin", "a long local passphrase");
  assert.ok(next);
  now = new Date("2026-07-30T10:00:02.000Z");
  assert.equal(await store.getSession(next.token), null);
});

test("zayıf parola ve kolay PIN reddedilir", () => {
  assert.throws(() => validateAdminPassword("short"));
  assert.throws(() => validateResidentPin("123456"));
  assert.throws(() => validateResidentPin("12345a"));
});
