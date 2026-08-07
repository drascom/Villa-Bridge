import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Fastify from "fastify";
import {
  DEVICE_DEPARTURE_TTL_MS,
  DeviceDepartureLog,
  deviceMissingResponse,
  type DeviceDeparture
} from "./device-departures.js";

test("ağdan ayrılan cihazın kaydı tutulur ve süresi dolunca düşer", () => {
  const log = new DeviceDepartureLog(60_000);
  const start = 1_000_000;

  log.record("0x00124B0001ABCDEF", "left", start);

  const recorded = log.get("0x00124b0001abcdef", start + 30_000);
  assert.equal(recorded?.reason, "left");
  assert.equal(recorded?.id, "0x00124b0001abcdef");
  assert.equal(recorded?.at, start);
  assert.equal(log.list(start + 30_000).length, 1);

  assert.equal(log.get("0x00124b0001abcdef", start + 60_000), undefined);
  assert.deepEqual(log.list(start + 60_000), []);
});

test("varsayılan hatırlama süresi beş dakikadır", () => {
  const log = new DeviceDepartureLog();
  assert.equal(DEVICE_DEPARTURE_TTL_MS, 300_000);
  log.record("0xabc", "left", Date.now());
  assert.equal(log.get("0xabc")?.reason, "left");
});

test("silmenin ardından gelen ayrılma olayı sebebi bozmaz", () => {
  const log = new DeviceDepartureLog(60_000);
  const start = 5_000;

  log.record("0xabc", "removed", start);
  log.record("0xabc", "left", start + 8_000);

  const entry = log.get("0xabc", start + 9_000);
  assert.equal(entry?.reason, "removed");
  assert.equal(entry?.at, start);

  // Ters sıra: önce düşer, sonra kullanıcı siler — o zaman kullanıcının eylemi kazanır.
  const other = new DeviceDepartureLog(60_000);
  other.record("0xdef", "left", start);
  other.record("0xdef", "removed", start + 1_000);
  assert.equal(other.get("0xdef", start + 2_000)?.reason, "removed");
});

test("kayıt defteri sınırı aşınca en eski düşer", () => {
  const log = new DeviceDepartureLog(60_000, 2);
  log.record("0x1", "left", 1_000);
  log.record("0x2", "left", 1_100);
  log.record("0x3", "left", 1_200);

  assert.deepEqual(log.list(1_300).map((entry) => entry.id), ["0x2", "0x3"]);
});

test("cihaz hiç tanınmıyorsa ve az önce ayrıldıysa farklı makine kodu döner", () => {
  assert.deepEqual(deviceMissingResponse(undefined), {
    ok: false,
    code: "DEVICE_UNKNOWN",
    error: "Cihaz bulunamadı."
  });

  const left: DeviceDeparture = { id: "0xabc", reason: "left", at: 1_700_000_000_000 };
  const leftResponse = deviceMissingResponse(left);
  assert.equal(leftResponse.code, "DEVICE_LEFT");
  assert.equal(leftResponse.departedAt, new Date(left.at).toISOString());
  assert.match(leftResponse.error, /ağdan ayrıldığı için/);

  const removed: DeviceDeparture = { id: "0xabc", reason: "removed", at: 1_700_000_000_000 };
  const removedResponse = deviceMissingResponse(removed);
  assert.equal(removedResponse.code, "DEVICE_REMOVED");
  assert.match(removedResponse.error, /az önce kaldırıldı/);
});

test("kurulum ucu kaybolan cihazı ayırt edilebilir yanıtla bildirir", async () => {
  const log = new DeviceDepartureLog(60_000);
  const app = Fastify();
  // `src/index.ts` içindeki `replyDeviceMissing` ile aynı kurgu: 404 kalır, ayrımı kod taşır.
  app.put<{ Params: { id: string } }>("/api/devices/:id/name", async (request, reply) => {
    const id = request.params.id.toLowerCase();
    return reply.code(404).send(deviceMissingResponse(log.get(id)));
  });

  const unknown = await app.inject({ method: "PUT", url: "/api/devices/0xffff/name" });
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.json().code, "DEVICE_UNKNOWN");

  log.record("0xabc", "left");
  const gone = await app.inject({ method: "PUT", url: "/api/devices/0xABC/name" });
  assert.equal(gone.statusCode, 404);
  assert.equal(gone.json().code, "DEVICE_LEFT");
  assert.equal(typeof gone.json().error, "string");

  log.record("0xdef", "removed");
  const removed = await app.inject({ method: "PUT", url: "/api/devices/0xdef/name" });
  assert.equal(removed.json().code, "DEVICE_REMOVED");

  await app.close();
});

test("kurulum uçlarının hiçbiri düz 'Cihaz bulunamadı' 404'ü döndürmez", async () => {
  const server = await readFile(new URL("./index.js", import.meta.url), "utf8");

  // Kurulum akışında çağrılan uçlar (isim, rol, görsel, not, seçenek, kumanda, onarım, OTA, silme)
  // ortak yanıttan geçmeli; aksi halde kullanıcı sebebi göremeden sessizce başarısız olur.
  assert.match(server, /const replyDeviceMissing = \(reply, id\)/);
  assert.equal((server.match(/replyDeviceMissing\(reply, id\)/g) ?? []).length >= 11, true);
  assert.doesNotMatch(server, /code\(404\)\.send\(\{ ok: false, error: "Cihaz bulunamadı\." \}\)/);
  // Panel kaybolan cihazı "Kaydet"e basmadan da görebilsin diye genel bakışta taşınır.
  assert.match(server, /departures: source\.recentDepartures\?\.\(\) \?\? \[\]/);
});
