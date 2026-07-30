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
  const settings = await app.inject({ method: "GET", url: "/api/settings", headers: { cookie } });
  assert.equal(settings.statusCode, 403);
  assert.equal(settings.json().code, "ADMIN_REQUIRED");
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
