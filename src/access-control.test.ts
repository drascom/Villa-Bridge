import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { LoginThrottle, registerAccessControl } from "./access-control.js";
import { AuthStore } from "./auth-store.js";

const setupApp = async (context: { after: (callback: () => Promise<void>) => void }) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-access-"));
  const app = Fastify();
  context.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const store = new AuthStore(join(directory, "auth.json"), {
    scrypt: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 }
  });
  await registerAccessControl(app, store);
  app.get("/api/overview", async () => ({ ok: true }));
  app.post("/api/devices/:id/command", async () => ({ ok: true }));
  app.get("/api/settings", async () => ({ ok: true }));
  app.post("/api/groups", async () => ({ ok: true }));
  app.put("/api/groups/:id", async () => ({ ok: true }));
  app.delete("/api/groups/:id", async () => ({ ok: true }));
  app.put("/api/groups/:id/member", async () => ({ ok: true }));
  app.post("/api/groups/:id/command", async () => ({ ok: true }));
  app.post("/api/groups/:id/scene", async () => ({ ok: true }));
  app.post("/api/pairing/start", async () => ({ ok: true }));
  app.post("/api/zigbee/install-code", async () => ({ ok: true }));
  app.post("/api/zigbee/touchlink/scan", async () => ({ ok: true }));
  app.post("/api/zigbee/touchlink/reset", async () => ({ ok: true }));
  app.get("/api/zigbee/network-map", async () => ({ ok: true }));
  app.post("/api/zigbee/bind", async () => ({ ok: true }));
  app.post("/api/devices/:id/reconfigure", async () => ({ ok: true }));
  app.put("/api/devices/:id/options", async () => ({ ok: true }));
  app.put("/api/devices/:id/ota-schedule", async () => ({ ok: true }));
  app.post("/api/devices/:id/ota-check", async () => ({ ok: true }));
  app.get("/api/zigbee/backup", async () => ({ ok: true }));
  app.post("/api/zigbee/restore", async () => ({ ok: true }));
  app.put("/api/favorites", async () => ({ ok: true }));
  return { app };
};

const cookieFrom = (response: {
  headers: Record<string, string | string[] | number | undefined>;
}): string => {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string") throw new Error("Session cookie bulunamadı.");
  return header.split(";")[0];
};

test("kurulum yapılmadan korumalı API kilitlenir ve ilk admin oturumu açılır", async (context) => {
  const { app } = await setupApp(context);
  const locked = await app.inject({ method: "GET", url: "/api/overview" });
  assert.equal(locked.statusCode, 423);
  assert.equal(locked.json().code, "AUTH_SETUP_REQUIRED");

  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: {
      username: "owner",
      password: "correct horse battery",
      residentPin: "638251"
    }
  });
  assert.equal(setup.statusCode, 200);
  assert.equal(setup.json().user.role, "admin");
  const cookie = cookieFrom(setup);
  assert.match(cookie, /^villa_session=/);
  assert.equal((await app.inject({ method: "GET", url: "/api/overview" })).statusCode, 401);
  assert.equal((await app.inject({
    method: "GET",
    url: "/api/settings",
    headers: { cookie }
  })).statusCode, 200);
});

test("ev kullanıcısı günlük kontrolleri kullanır fakat ayarlara erişemez", async (context) => {
  const { app } = await setupApp(context);
  await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { username: "owner", password: "correct horse battery", residentPin: "638251" }
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { mode: "resident", secret: "638251" }
  });
  const cookie = cookieFrom(login);
  const csrfToken = login.json().csrfToken;

  assert.equal((await app.inject({
    method: "POST",
    url: "/api/devices/test/command",
    headers: { cookie, "x-villa-csrf": csrfToken }
  })).statusCode, 200);
  assert.equal((await app.inject({
    method: "POST",
    url: "/api/groups/1/command",
    headers: { cookie, "x-villa-csrf": csrfToken }
  })).statusCode, 200);
  const settings = await app.inject({ method: "GET", url: "/api/settings", headers: { cookie } });
  assert.equal(settings.statusCode, 403);
  assert.equal(settings.json().code, "ADMIN_REQUIRED");
  for (const url of [
    "/api/groups",
    "/api/pairing/start",
    "/api/zigbee/install-code",
    "/api/zigbee/touchlink/scan",
    "/api/zigbee/touchlink/reset",
    "/api/devices/test/reconfigure",
    "/api/devices/test/ota-check",
    "/api/groups/1/scene"
  ]) {
    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie, "x-villa-csrf": csrfToken }
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "ADMIN_REQUIRED");
  }
  for (const [method, url] of [
    ["GET", "/api/zigbee/network-map"],
    ["POST", "/api/zigbee/bind"],
    ["PUT", "/api/groups/1"],
    ["DELETE", "/api/groups/1"],
    ["PUT", "/api/groups/1/member"],
    ["PUT", "/api/devices/test/options"],
    ["PUT", "/api/devices/test/ota-schedule"],
    ["GET", "/api/zigbee/backup"],
    ["POST", "/api/zigbee/restore"],
    ["PUT", "/api/auth/admin-password"]
  ] as const) {
    const response = await app.inject({
      method,
      url,
      headers: { cookie, "x-villa-csrf": csrfToken }
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "ADMIN_REQUIRED");
  }
});

test("yönetici parolası doğrulanarak değiştirilir ve yeniden giriş gerekir", async (context) => {
  const { app } = await setupApp(context);
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { username: "owner", password: "correct horse battery", residentPin: "638251" }
  });
  const cookie = cookieFrom(setup);
  const headers = { cookie, "x-villa-csrf": setup.json().csrfToken };

  const denied = await app.inject({
    method: "PUT",
    url: "/api/auth/admin-password",
    headers,
    payload: { currentPassword: "wrong password", newPassword: "new secure passphrase" }
  });
  assert.equal(denied.statusCode, 400);

  const changed = await app.inject({
    method: "PUT",
    url: "/api/auth/admin-password",
    headers,
    payload: {
      currentPassword: "correct horse battery",
      newPassword: "new secure passphrase"
    }
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(changed.json().reauthenticationRequired, true);
  assert.equal((await app.inject({
    method: "GET",
    url: "/api/settings",
    headers: { cookie }
  })).statusCode, 401);
  assert.equal((await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { mode: "admin", username: "owner", secret: "correct horse battery" }
  })).statusCode, 401);
  assert.equal((await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { mode: "admin", username: "owner", secret: "new secure passphrase" }
  })).statusCode, 200);
});

test("durum değiştiren API geçerli oturum yanında CSRF doğrulaması ister", async (context) => {
  const { app } = await setupApp(context);
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { username: "owner", password: "correct horse battery", residentPin: "638251" }
  });
  const cookie = cookieFrom(setup);
  const denied = await app.inject({ method: "PUT", url: "/api/favorites", headers: { cookie } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, "INVALID_CSRF_TOKEN");

  const allowed = await app.inject({
    method: "PUT",
    url: "/api/favorites",
    headers: { cookie, "x-villa-csrf": setup.json().csrfToken }
  });
  assert.equal(allowed.statusCode, 200);
});

test("başarısız girişler geçici olarak sınırlandırılır", () => {
  let now = 1_000;
  const throttle = new LoginThrottle(() => now, 3, 10_000);
  throttle.failure("client");
  throttle.failure("client");
  assert.equal(throttle.retryAfterSeconds("client"), 0);
  throttle.failure("client");
  assert.equal(throttle.retryAfterSeconds("client"), 10);
  now += 10_001;
  assert.equal(throttle.retryAfterSeconds("client"), 0);
  throttle.success("client");
  assert.equal(throttle.retryAfterSeconds("client"), 0);
});
