import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerRecentErrorApi } from "./recent-error-api.js";
import { RecentErrorLog } from "./recent-error-log.js";

test("debug errors API records failed API responses without device identifiers or credentials", async () => {
  const app = Fastify();
  const errors = new RecentErrorLog();
  registerRecentErrorApi(app, errors);
  app.delete("/api/devices/:id", async (_request, reply) =>
    reply.code(503).send({
      ok: false,
      error: "mqtt://user:secret@127.0.0.1:1883 removal failed"
    })
  );

  await app.inject({ method: "DELETE", url: "/api/devices/0x00124b0001abcdef" });
  const response = await app.inject({ method: "GET", url: "/api/debug/errors" });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.enabled, true);
  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].operation, "DELETE /api/devices/:id");
  assert.doesNotMatch(JSON.stringify(body), /0x00124b0001abcdef|user|secret/);
  await app.close();
});

test("debug errors API is empty when debug mode is disabled", async () => {
  const app = Fastify();
  const errors = new RecentErrorLog(50, false);
  registerRecentErrorApi(app, errors);
  app.get("/api/failure", async (_request, reply) =>
    reply.code(500).send({ ok: false, error: "hidden" })
  );

  await app.inject({ method: "GET", url: "/api/failure" });
  const body = (await app.inject({ method: "GET", url: "/api/debug/errors" })).json();

  assert.deepEqual(body, { ok: true, enabled: false, errors: [] });
  await app.close();
});
