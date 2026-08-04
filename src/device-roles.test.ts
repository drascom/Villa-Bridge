import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadDeviceRoles,
  removeDeviceRole,
  resolveChannelRole,
  saveDeviceRoles,
  setDeviceRole,
  validateDeviceRole
} from "./device-roles.js";

test("cihaz rolü IEEE adresine göre kalıcı saklanır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-roles-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "device-roles.json");
  const roles = await loadDeviceRoles(path);
  assert.equal(roles.size, 0);

  const id = "0xA4C138B950918DE3";
  assert.equal(await setDeviceRole(path, roles, id, "light"), "light");
  assert.equal(roles.get("0xa4c138b950918de3"), "light");
  // Yeniden okunduğunda aynı kayıt döner — dosya kalıcı.
  assert.equal((await loadDeviceRoles(path)).get("0xa4c138b950918de3"), "light");
  // Dosya anahtarı dost isim değil IEEE adresi (UID kuralı).
  const written = JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
  assert.deepEqual(Object.keys(written), ["0xa4c138b950918de3"]);

  // "Otomatik"e dönmek kaydı siler; tahmin yeniden geçerli olur.
  assert.equal(await setDeviceRole(path, roles, id, "auto"), "auto");
  assert.equal(roles.has("0xa4c138b950918de3"), false);
  assert.equal((await loadDeviceRoles(path)).size, 0);
});

test("rol kanal başına saklanır, eski cihaz kaydı yedek kalır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-roles-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "device-roles.json");
  const roles = await loadDeviceRoles(path);
  const id = "0xA4C138B950918DE4";

  await setDeviceRole(path, roles, id, "light", "l1");
  await setDeviceRole(path, roles, id, "switch", "l2");
  const written = JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
  // Anahtar IEEE + kanal kimliği; dost isim hiçbir zaman anahtar değil.
  assert.deepEqual(written, {
    "0xa4c138b950918de4:l1": "light",
    "0xa4c138b950918de4:l2": "switch"
  });
  assert.equal(resolveChannelRole(roles, id, "l1"), "light");
  assert.equal(resolveChannelRole(roles, id, "l2"), "switch");
  assert.equal(resolveChannelRole(roles, id, "l3"), "auto");

  // Eski cihaz seviyesi kayıt kırılmaz: kanalın kendi kaydı yoksa ona düşülür.
  await setDeviceRole(path, roles, id, "switch");
  assert.equal(resolveChannelRole(roles, id, "l3"), "switch");
  assert.equal(resolveChannelRole(roles, id, "l1"), "light");
  assert.equal((await loadDeviceRoles(path)).get("0xa4c138b950918de4"), "switch");

  await assert.rejects(() => setDeviceRole(path, roles, id, "light", "kanal 1"), /Kanal kimliği geçersiz/);
});

test("cihaz silinince rolü de düşer", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-roles-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "device-roles.json");
  const roles = await loadDeviceRoles(path);
  await setDeviceRole(path, roles, "0x00124b0000000001", "switch");
  await setDeviceRole(path, roles, "0x00124b0000000001", "light", "l2");
  await removeDeviceRole(path, roles, "0x00124B0000000001");
  assert.equal(roles.size, 0);
  assert.equal((await loadDeviceRoles(path)).size, 0);
});

test("geçersiz kimlik, geçersiz rol ve bozuk dosya reddedilir", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-roles-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "device-roles.json");
  const roles = await loadDeviceRoles(path);
  await assert.rejects(() => setDeviceRole(path, roles, "balkon", "light"), /Cihaz kimliği geçersiz/);
  await assert.rejects(() => setDeviceRole(path, roles, "0x00124b0000000001", "cover"), /Cihaz rolü geçersiz/);
  assert.throws(() => validateDeviceRole(42), /Cihaz rolü geçersiz/);

  // Elle bozulmuş dosya çökmez: tanınmayan satırlar atlanır.
  await saveDeviceRoles(path, new Map([["0x00124b0000000002", "switch"]]));
  const reread = await loadDeviceRoles(path);
  assert.deepEqual([...reread.entries()], [["0x00124b0000000002", "switch"]]);
});
