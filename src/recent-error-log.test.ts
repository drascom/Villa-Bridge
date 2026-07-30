import assert from "node:assert/strict";
import test from "node:test";
import { RecentErrorLog, sanitizeErrorMessage } from "./recent-error-log.js";

test("recent error log is enabled by default and keeps a bounded newest-first list", () => {
  let second = 0;
  const log = new RecentErrorLog(2, true, () => new Date(Date.UTC(2026, 6, 29, 10, 0, second++)));
  log.record({ operation: "DELETE /api/devices/:id", statusCode: 503, message: "first" });
  log.record({ operation: "POST /api/pairing/start", statusCode: 503, message: "second" });
  log.record({ operation: "PUT /api/settings", statusCode: 400, message: "third" });

  assert.equal(log.isEnabled(), true);
  assert.deepEqual(log.list().map((entry) => entry.message), ["third", "second"]);
  assert.equal(log.list()[0]?.timestamp, "2026-07-29T10:00:02.000Z");
});

test("disabling debug clears errors and prevents new entries", () => {
  const log = new RecentErrorLog();
  log.record({ operation: "GET /api/test", statusCode: 500, message: "visible" });
  log.setEnabled(false);
  log.record({ operation: "GET /api/test", statusCode: 500, message: "hidden" });

  assert.equal(log.isEnabled(), false);
  assert.deepEqual(log.list(), []);

  log.setEnabled(true);
  assert.deepEqual(log.list(), []);
});

test("error messages redact common credentials and stay bounded", () => {
  const message = sanitizeErrorMessage(
    `mqtt://user:secret@127.0.0.1:1883 failed token=abc123 Bearer xyz password: "secret" ${"x".repeat(600)}`
  );

  assert.doesNotMatch(message, /user|abc123|Bearer xyz|secret/);
  assert.match(message, /\[redacted\]/);
  assert.equal(message.length, 500);
});
