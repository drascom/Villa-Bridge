/**
 * Gün doğumu / gün batımı hesabı.
 *
 * SunCalc'ın (Vladimir Agafonkin, MIT — https://github.com/mourner/suncalc) yalnızca
 * sunrise/sunset kısmının portudur; alacakaranlık, ay ve konum açıları bilerek alınmadı.
 * Yeni bir npm bağımlılığı eklenmiyor (otomasyon planı §11).
 *
 * Doğruluk: SunCalc astronomik yaklaşımlar kullanır, yayınlanan takvimlere göre sapma tipik
 * olarak bir dakikanın altındadır. Ev otomasyonu için fazlasıyla yeterli.
 *
 * Saf fonksiyon: girdi mutlak bir an (UTC), çıktı mutlak anlar. Yerel saate çevirme çağıranın
 * işidir — motor zaten yerel saatle çalışıyor.
 */

const rad = Math.PI / 180;
const dayMs = 24 * 60 * 60 * 1000;
const j1970 = 2440588;
const j2000 = 2451545;
/** Yer ekseninin eğikliği. */
const obliquity = rad * 23.4397;
/** Güneşin merkezi ufkun bu kadar altındayken doğuş/batış sayılır (kırılma + disk yarıçapı). */
const sunriseAltitude = -0.833 * rad;
const j0 = 0.0009;

const toDays = (date: Date): number => date.valueOf() / dayMs - 0.5 + j1970 - j2000;

const fromJulian = (julian: number): Date =>
  new Date((julian + 0.5 - j1970) * dayMs);

const solarMeanAnomaly = (days: number): number => rad * (357.5291 + 0.98560028 * days);

const eclipticLongitude = (meanAnomaly: number): number => {
  const center = rad * (
    1.9148 * Math.sin(meanAnomaly)
    + 0.02 * Math.sin(2 * meanAnomaly)
    + 0.0003 * Math.sin(3 * meanAnomaly)
  );
  const perihelion = rad * 102.9372;
  return meanAnomaly + center + perihelion + Math.PI;
};

const declination = (eclipticLongitudeValue: number): number =>
  Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitudeValue));

const julianCycle = (days: number, westLongitude: number): number =>
  Math.round(days - j0 - westLongitude / (2 * Math.PI));

const approximateTransit = (hourAngleValue: number, westLongitude: number, cycle: number): number =>
  j0 + (hourAngleValue + westLongitude) / (2 * Math.PI) + cycle;

const solarTransit = (
  approximate: number,
  meanAnomaly: number,
  eclipticLongitudeValue: number
): number => j2000 + approximate
  + 0.0053 * Math.sin(meanAnomaly)
  - 0.0069 * Math.sin(2 * eclipticLongitudeValue);

/** Kutup gününde/gecesinde `acos` tanım kümesinin dışına çıkar ve `NaN` döner — bilinçli. */
const hourAngle = (altitude: number, latitude: number, declinationValue: number): number =>
  Math.acos(
    (Math.sin(altitude) - Math.sin(latitude) * Math.sin(declinationValue))
    / (Math.cos(latitude) * Math.cos(declinationValue))
  );

export interface SunTimes {
  /** Kutup gününde/gecesinde `null` — güneş o gün ufku kesmiyor. */
  sunrise: Date | null;
  sunset: Date | null;
}

export const isValidLatitude = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;

/**
 * Verilen ana en yakın gün doğumu ve batımı. Çağıran genelde ilgilendiği günün yerel öğlenini
 * verir; hesap o günün güneş geçişini bulur.
 */
export const sunTimes = (date: Date, latitude: number, longitude: number): SunTimes => {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude) || Number.isNaN(date.valueOf())) {
    return { sunrise: null, sunset: null };
  }
  const westLongitude = rad * -longitude;
  const latitudeRad = rad * latitude;
  const days = toDays(date);
  const cycle = julianCycle(days, westLongitude);
  const approximate = approximateTransit(0, westLongitude, cycle);
  const meanAnomaly = solarMeanAnomaly(approximate);
  const eclipticLongitudeValue = eclipticLongitude(meanAnomaly);
  const declinationValue = declination(eclipticLongitudeValue);
  const noon = solarTransit(approximate, meanAnomaly, eclipticLongitudeValue);
  const angle = hourAngle(sunriseAltitude, latitudeRad, declinationValue);
  if (!Number.isFinite(angle)) return { sunrise: null, sunset: null };
  const setJulian = solarTransit(
    approximateTransit(angle, westLongitude, cycle),
    meanAnomaly,
    eclipticLongitudeValue
  );
  const riseJulian = noon - (setJulian - noon);
  const sunrise = fromJulian(riseJulian);
  const sunset = fromJulian(setJulian);
  if (Number.isNaN(sunrise.valueOf()) || Number.isNaN(sunset.valueOf())) {
    return { sunrise: null, sunset: null };
  }
  return { sunrise, sunset };
};

/** Yerel günün öğleni — güneş hesabına verilecek referans an. */
export const localNoon = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
