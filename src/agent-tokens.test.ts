import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentTokenStore, validateAgentTokenName } from "./agent-tokens.js";

const withStore = async (
  context: { after: (callback: () => Promise<void>) => void },
  options: ConstructorParameters<typeof AgentTokenStore>[1] = {}
): Promise<{ store: AgentTokenStore; path: string }> => {
  const directory = await mkdtemp(join(tmpdir(), "villa-agent-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "agent-tokens.json");
  return { store: new AgentTokenStore(path, options), path };
};

test("ajan token'ı üretilir, doğrulanır ve iptal edilince anında geçersizleşir", async (context) => {
  const { store } = await withStore(context);
  assert.deepEqual(await store.list(), []);

  const created = await store.create("Dizüstü asistan");
  assert.equal(created.record.name, "Dizüstü asistan");
  assert.equal(created.record.lastUsedAt, null);
  // URL-güvenli ve en az 32 bayt entropi (base64url'de 43 karakter).
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);

  const verified = await store.verify(created.token);
  assert.equal(verified?.id, created.record.id);
  assert.equal(await store.verify(`${created.token}x`), null);
  assert.equal(await store.verify(undefined), null);

  const listed = await store.list();
  assert.equal(listed.length, 1);
  assert.equal(Object.hasOwn(listed[0], "tokenHash"), false);

  assert.equal(await store.revoke(created.record.id), true);
  assert.equal(await store.verify(created.token), null);
  assert.deepEqual(await store.list(), []);
  assert.equal(await store.revoke(created.record.id), false);
});

test("token düz metin saklanmaz, yalnız özeti diske yazılır", async (context) => {
  const { store, path } = await withStore(context);
  const created = await store.create("Ev asistanı");
  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes(created.token), false);
  const stored = JSON.parse(raw) as { version: number; tokens: Array<{ tokenHash: string }> };
  assert.equal(stored.version, 1);
  assert.match(stored.tokens[0].tokenHash, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(stored.tokens[0].tokenHash, created.token);
});

test("son kullanım damgası kısıtlanarak güncellenir", async (context) => {
  let now = Date.parse("2026-08-06T10:00:00.000Z");
  const { store } = await withStore(context, {
    now: () => new Date(now),
    lastUsedWriteIntervalMs: 60_000
  });
  const created = await store.create("Asistan");

  const first = await store.verify(created.token);
  assert.equal(first?.lastUsedAt, "2026-08-06T10:00:00.000Z");

  now += 30_000;
  const throttled = await store.verify(created.token);
  assert.equal(throttled?.lastUsedAt, "2026-08-06T10:00:00.000Z");

  now += 31_000;
  const refreshed = await store.verify(created.token);
  assert.equal(refreshed?.lastUsedAt, "2026-08-06T10:01:01.000Z");
  assert.equal((await store.list())[0].lastUsedAt, "2026-08-06T10:01:01.000Z");
});

test("ajan token adı doğrulanır", async (context) => {
  const { store } = await withStore(context);
  assert.equal(validateAgentTokenName("  Ev  "), "Ev");
  assert.throws(() => validateAgentTokenName(""), /Ajan token adı/);
  assert.throws(() => validateAgentTokenName(42), /Ajan token adı/);
  assert.throws(() => validateAgentTokenName("a".repeat(49)), /Ajan token adı/);
  await assert.rejects(store.create("   "), /Ajan token adı/);
});
