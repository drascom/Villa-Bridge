import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AutomationRunLog } from "./automation-runs.js";
import { LocationStore, validateLocation } from "./location.js";

const directory = async (context: { after(fn: () => unknown): void }): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "villa-runs-"));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
};

const record = (id: string, outcome: "ok" | "blocked" = "ok") => ({
  at: new Date("2026-08-05T10:00:00Z").toISOString(),
  automationId: id,
  automationName: "Deneme",
  outcome
});

test("çalışma günlüğü JSONL olarak eklenir ve en yeniden eskiye okunur", async (context) => {
  const path = join(await directory(context), "automation-runs.jsonl");
  const log = new AutomationRunLog(path);
  log.append(record("aksam-salon"));
  log.append(record("gece-lambasi", "blocked"));
  await log.flush();

  // Tam JSON yeniden yazma değil: her kayıt bir satır.
  const raw = await readFile(path, "utf8");
  assert.equal(raw.split("\n").filter((line) => line !== "").length, 2);

  const runs = await log.read();
  assert.equal(runs.length, 2);
  assert.equal(runs[0]?.automationId, "gece-lambasi");
  assert.equal(runs[1]?.automationId, "aksam-salon");
});

test("günlük kural kimliğine göre süzülür", async (context) => {
  const log = new AutomationRunLog(join(await directory(context), "runs.jsonl"));
  log.append(record("aksam-salon"));
  log.append(record("gece-lambasi"));
  log.append(record("aksam-salon"));
  await log.flush();

  const runs = await log.read({ automationId: "AKSAM-SALON" });
  assert.equal(runs.length, 2);
  assert.ok(runs.every((run) => run.automationId === "aksam-salon"));
});

test("günlük tavanı aşınca sıkıştırılır ve son kayıtlar kalır", async (context) => {
  const path = join(await directory(context), "runs.jsonl");
  const log = new AutomationRunLog(path, { maxRecords: 10 });
  for (let index = 0; index < 40; index += 1) log.append(record(`kural-${index}`));
  await log.flush();

  const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line !== "");
  assert.ok(lines.length <= 14, `Sıkıştırma çalışmadı: ${lines.length} satır`);
  const runs = await log.read();
  assert.equal(runs[0]?.automationId, "kural-39");
});

test("bozuk satır günlüğü okunamaz hale getirmez", async (context) => {
  const path = join(await directory(context), "runs.jsonl");
  await writeFile(path, `{bozuk\n${JSON.stringify(record("aksam-salon"))}\n`, "utf8");
  const log = new AutomationRunLog(path);
  const runs = await log.read();
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.automationId, "aksam-salon");
});

test("yazma hatası sessiz kalmaz", async (context) => {
  // Dizin olarak var olan bir yola yazmak başarısız olur; hata `onError`'a düşmeli.
  const path = await directory(context);
  const errors: string[] = [];
  const log = new AutomationRunLog(path, { onError: (message) => errors.push(message) });
  log.append(record("aksam-salon"));
  await log.flush();
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /günlüğü yazılamadı/);
});

test("konum doğrulanır, kaydedilir ve geri okunur", async (context) => {
  const path = join(await directory(context), "location.json");
  const store = new LocationStore(path);
  assert.equal(await store.get(), null);

  const saved = await store.save({ latitude: "41.00821234", longitude: 28.9784 });
  assert.deepEqual(saved, { latitude: 41.008212, longitude: 28.9784 });
  assert.deepEqual(await store.get(), saved);
});

// Kullanıcı koordinat değil yer adı seçiyor: ad sunucuda durur, koordinat perde arkasında aynı kalır.
test("konumun adı saklanır, eski koordinat dosyası sorunsuz okunur", async (context) => {
  const path = join(await directory(context), "location.json");
  const store = new LocationStore(path);

  const named = await store.save({ latitude: 36.8969, longitude: 30.7133, label: "  Antalya  " });
  assert.deepEqual(named, { latitude: 36.8969, longitude: 30.7133, label: "Antalya" });
  assert.deepEqual(await store.get(), named);

  // Elle koordinat girildiğinde ad yoktur: alan hiç yazılmaz, boş dize de yazılmaz.
  assert.deepEqual(await store.save({ latitude: 36.8969, longitude: 30.7133, label: "   " }), {
    latitude: 36.8969,
    longitude: 30.7133
  });
  assert.equal("label" in (await store.get() ?? {}), false);

  // Yer adı sunum verisi: 80 karakterle sınırlanır.
  const long = await store.save({ latitude: 36.8969, longitude: 30.7133, label: "a".repeat(120) });
  assert.equal(long.label?.length, 80);

  // Alansız eski dosya (yalnız enlem/boylam) hâlâ okunur.
  await writeFile(path, JSON.stringify({ latitude: 41, longitude: 29 }), "utf8");
  assert.deepEqual(await store.get(), { latitude: 41, longitude: 29 });
});

test("eksik ya da sınır dışı konum reddedilir", () => {
  assert.throws(() => validateLocation({ latitude: 41 }), /Boylam/);
  assert.throws(() => validateLocation({ longitude: 29 }), /Enlem/);
  assert.throws(() => validateLocation({ latitude: 91, longitude: 29 }), /Enlem/);
  assert.throws(() => validateLocation({ latitude: 41, longitude: -181 }), /Boylam/);
  assert.throws(() => validateLocation({ latitude: 41, longitude: 29, zoom: 3 }), /bilinmeyen/);
  assert.throws(() => validateLocation(null));
  // `label` bilinen tek yeni alan; metin olmayan ad reddedilir, bilinmeyen alan reddi sürer.
  assert.throws(() => validateLocation({ latitude: 41, longitude: 29, label: 5 }), /metin/);
  assert.throws(() => validateLocation({ latitude: 41, longitude: 29, label: "Ev", zoom: 3 }), /bilinmeyen/);
  assert.deepEqual(validateLocation({ latitude: 41, longitude: 29, label: "İstanbul" }), {
    latitude: 41,
    longitude: 29,
    label: "İstanbul"
  });
});
