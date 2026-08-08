import assert from "node:assert/strict";
import test from "node:test";
import { isValidLatitude, isValidLongitude, localNoon, sunTimes } from "./sun.js";

/** Testler saat diliminden bağımsız olsun diye hep UTC karşılaştırılır. */
const utcHm = (date: Date | null): string => {
  assert.ok(date, "Beklenen zaman hesaplanamadı.");
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
};

const minutesBetween = (from: Date | null, to: Date | null): number => {
  assert.ok(from && to);
  return (to.valueOf() - from.valueOf()) / 60_000;
};

/**
 * Londra (51.5074° K, 0.1278° B) — yayınlanan takvimlerle karşılaştırma.
 * Kaynak: Birleşik Krallık için yayınlanan gündoğumu/günbatımı tabloları
 * (timeanddate.com/sun/uk/london, Royal Observatory Greenwich ile aynı).
 *   21 Haziran: doğuş 04:43 BST = 03:43 UTC · batış 21:21 BST = 20:21 UTC
 *   21 Aralık:  doğuş 08:04 GMT = 08:04 UTC · batış 15:53 GMT = 15:53 UTC
 * Aşağıdaki beklentiler bizim çıktımızı sabitler; yayınlanan değerden sapma her dört anda da
 * **1 dakikadır** (tablolar yuvarlıyor ve gözlemci yüksekliğini farklı alıyor). Bu, ev
 * otomasyonu için kabul edilen sapmadır; asıl amaç hesabın kaymasını yakalamak.
 */
test("Londra yaz ve kış gündönümü yayınlanan değerlerle uyuşuyor", () => {
  const summer = sunTimes(new Date("2026-06-21T12:00:00Z"), 51.5074, -0.1278);
  assert.equal(utcHm(summer.sunrise), "03:44");
  assert.equal(utcHm(summer.sunset), "20:22");

  const winter = sunTimes(new Date("2026-12-21T12:00:00Z"), 51.5074, -0.1278);
  assert.equal(utcHm(winter.sunrise), "08:05");
  assert.equal(utcHm(winter.sunset), "15:54");
});

/**
 * İstanbul (41.0082° K, 28.9784° D) — bağımsız el hesabıyla doğrulama.
 * Gün uzunluğu = 2·arccos((sin(-0,833°) − sin φ · sin δ) / (cos φ · cos δ)) / 15°,
 * yaz gündönümünde δ = 23,44°:
 *   cos H = (−0,014537 − 0,65617·0,39784) / (0,75461·0,91743) = −0,39813 → H = 113,47°
 *   gün uzunluğu = 2 · 113,47 / 15 = 15,129 s = 15 sa 08 dk
 * Görünür güneş geçişi 28,9784° D'de: ortalama öğle 12:00 − 28,9784/15 sa = 10:04 UTC,
 * zaman denklemi düzeltmesiyle ~10:06. Tolerans 3 dakika.
 */
test("İstanbul yaz gündönümü gün uzunluğu ve güneş öğlesi tutuyor", () => {
  const times = sunTimes(new Date("2026-06-21T12:00:00Z"), 41.0082, 28.9784);
  const dayLength = minutesBetween(times.sunrise, times.sunset);
  assert.ok(Math.abs(dayLength - 908) <= 3, `Gün uzunluğu beklenenden uzak: ${dayLength} dk`);
  const noon = new Date(
    ((times.sunrise as Date).valueOf() + (times.sunset as Date).valueOf()) / 2
  );
  const noonMinutes = noon.getUTCHours() * 60 + noon.getUTCMinutes();
  assert.ok(Math.abs(noonMinutes - 606) <= 3, `Güneş öğlesi beklenenden uzak: ${utcHm(noon)}`);
});

/**
 * Ekinoksta kırılma (ve güneş diskinin yarıçapı) yüzünden gün her enlemde 12 saatten uzundur;
 * fazlalık enlemle birlikte büyür — ekvatorda ~7 dk, orta enlemlerde ~10 dk.
 */
test("ekinoksta gün uzunluğu 12 saatin biraz üstünde", () => {
  for (const [latitude, longitude] of [[41.0082, 28.9784], [51.5074, -0.1278], [-33.8688, 151.2093]]) {
    const times = sunTimes(new Date("2026-03-20T12:00:00Z"), latitude, longitude);
    const dayLength = minutesBetween(times.sunrise, times.sunset);
    assert.ok(
      dayLength > 720 && dayLength < 740,
      `Ekinoks gün uzunluğu beklenen aralıkta değil: ${dayLength} dk`
    );
  }
});

/** Kutup gündüzü/gecesi: güneş ufku kesmez, hesap `null` döner — sessizce 0 döndürmez. */
test("kutup enlemlerinde gün doğumu yok", () => {
  const tromsoSummer = sunTimes(new Date("2026-06-21T12:00:00Z"), 69.6492, 18.9553);
  assert.equal(tromsoSummer.sunrise, null);
  assert.equal(tromsoSummer.sunset, null);

  const tromsoWinter = sunTimes(new Date("2026-12-21T12:00:00Z"), 69.6492, 18.9553);
  assert.equal(tromsoWinter.sunrise, null);
  assert.equal(tromsoWinter.sunset, null);

  // Aynı yerde ilkbaharda güneş yine doğar — kutup kuralı tüm yılı kapsamaz.
  const tromsoSpring = sunTimes(new Date("2026-03-20T12:00:00Z"), 69.6492, 18.9553);
  assert.ok(tromsoSpring.sunrise);
  assert.ok(tromsoSpring.sunset);
});

test("geçersiz konum ve tarih sessizce null döner", () => {
  assert.deepEqual(sunTimes(new Date("2026-06-21T12:00:00Z"), 91, 0), { sunrise: null, sunset: null });
  assert.deepEqual(sunTimes(new Date("2026-06-21T12:00:00Z"), 0, 181), { sunrise: null, sunset: null });
  assert.deepEqual(sunTimes(new Date("bozuk"), 41, 29), { sunrise: null, sunset: null });
});

test("konum doğrulaması sınırları kabul eder", () => {
  assert.equal(isValidLatitude(-90), true);
  assert.equal(isValidLatitude(90), true);
  assert.equal(isValidLatitude(90.1), false);
  assert.equal(isValidLatitude("41"), false);
  assert.equal(isValidLatitude(Number.NaN), false);
  assert.equal(isValidLongitude(-180), true);
  assert.equal(isValidLongitude(180), true);
  assert.equal(isValidLongitude(180.1), false);
});

test("yerel öğlen aynı takvim gününü kullanır", () => {
  const noon = localNoon(new Date(2026, 6, 15, 23, 45));
  assert.equal(noon.getFullYear(), 2026);
  assert.equal(noon.getMonth(), 6);
  assert.equal(noon.getDate(), 15);
  assert.equal(noon.getHours(), 12);
  assert.equal(noon.getMinutes(), 0);
});
