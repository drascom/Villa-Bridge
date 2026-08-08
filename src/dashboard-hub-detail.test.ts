import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { panelScripts, panelStyles, readPanelSource } from "./panel-source.js";

/* Ana ekrandaki hub özeti: menü şeridi kalkınca açılan yere iki şehir saati ve bugünün hava
   özeti (en yüksek/en düşük + nem) kondu. Buradaki iddialar gönderilen kodun kendisini
   çalıştırır — kopya mantık yazılmaz — ve üç şeyi korur:
   (a) satırlar yalnız veri varken çıkar, konum/şehir seçilmemişken davet satırı bozulmaz,
   (b) yeni ağ isteği eklenmez: gösterilen alanlar zaten çekiliyor,
   (c) sığmama hâli kırpma ile çözülür, taşma ile değil. */

const localeUrls = {
  en: new URL("../public/locales/en.json", import.meta.url),
  tr: new URL("../public/locales/tr.json", import.meta.url)
};

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} bulunamadı`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} gövdesi kapanmıyor`);
}

function extractLine(source: string, name: string): string {
  const start = source.indexOf(`const ${name}=`);
  assert.notEqual(start, -1, `${name} bulunamadı`);
  const end = source.indexOf("\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

interface Node {
  textContent: string;
  innerHTML: string;
}

const harness = (body: string): string => `
  const elements={};
  const $=selector=>{
    if(!elements[selector])elements[selector]={textContent:"",innerHTML:"",open:false};
    return elements[selector];
  };
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  const t=(key,values)=>values?key+"("+Object.entries(values).map(([name,value])=>name+"="+value).join(",")+")":key;
  ${body}
  return elements;
`;

/** Hub'daki şehir satırlarını gerçek kodla çizer. */
async function renderCities(zones: unknown[], localZone: string): Promise<Record<string, Node>> {
  const source = await readPanelSource();
  const factory = new Function(
    "worldClockZones",
    "localTimeZone",
    harness(`
      const locationName=location=>location?.name||"";
      const zoneTime=(now,timeZone)=>"saat@"+timeZone;
      ${extractLine(source, "hubClockCities")}
      ${extractFunction(source, "renderHubCities")}
      renderHubCities(new Date("2026-08-08T09:00:00.000Z"));
    `)
  ) as (zones: unknown[], localZone: string) => Record<string, Node>;
  return factory(zones, localZone);
}

/** Hub'ın hava özetini gerçek kodla çizer. */
async function renderWeather(weatherState: Record<string, unknown>): Promise<Record<string, Node>> {
  const source = await readPanelSource();
  const factory = new Function(
    "weatherState",
    harness(`
      const weatherLocationText=()=>"Konum";
      const weatherIsStale=()=>false;
      const weatherAgeText=()=>"09:00";
      ${extractLine(source, "weatherNumber")}
      ${extractLine(source, "weatherValue")}
      ${extractFunction(source, "weatherPresentation")}
      ${extractFunction(source, "weatherDailyEntries")}
      ${extractFunction(source, "hubWeatherStats")}
      ${extractFunction(source, "renderWeather")}
      renderWeather();
    `)
  ) as (weatherState: Record<string, unknown>) => Record<string, Node>;
  return factory(weatherState);
}

const forecast = {
  current: { temperature_2m: 24.4, apparent_temperature: 26, relative_humidity_2m: 48.6, weather_code: 0, is_day: 1 },
  current_units: { temperature_2m: "°C", relative_humidity_2m: "%" },
  daily: { time: ["2026-08-08", "2026-08-09"], weather_code: [0, 3], temperature_2m_max: [31.2, 29], temperature_2m_min: [20.6, 19] }
};

test("hub'da yalnız seçilmiş şehirler çıkar, yerelle aynı saat dilimi atlanır", async () => {
  const elements = await renderCities(
    [
      { id: "default-local", label: "clockLocal", name: "Local time", timeZone: "Europe/London" },
      { id: "1", name: "Londra", timeZone: "Europe/London" },
      { id: "2", name: "İstanbul", timeZone: "Europe/Istanbul" },
      { id: "3", name: "New York", timeZone: "America/New_York" },
      { id: "4", name: "Tokyo", timeZone: "Asia/Tokyo" }
    ],
    "Europe/London"
  );
  const html = elements["#hubCities"]?.innerHTML ?? "";

  // Yerel saat büyük rakamlarda zaten yazıyor: aynı saat dilimindeki kayıtlar (varsayılan satır
  // dahil) atlanır. Kalanların yalnız ilk ikisi hub'a sığar.
  assert.deepEqual([...html.matchAll(/<em>([^<]+)<\/em>/g)].map((match) => match[1]), ["İstanbul", "New York"]);
  assert.match(html, /<b>saat@Europe\/Istanbul<\/b>/);
  assert.doesNotMatch(html, /Londra|Tokyo/);
});

test("şehir seçilmemişken hub'a ek satır çıkmaz", async () => {
  const onlyLocal = await renderCities(
    [{ id: "default-local", label: "clockLocal", name: "Local time", timeZone: "Europe/Istanbul" }],
    "Europe/Istanbul"
  );
  const empty = await renderCities([], "Europe/Istanbul");

  // Boş düğüm `.hub-cities:empty` ile tümüyle gizlenir; boşluk ya da davet satırı bırakmaz.
  assert.equal(onlyLocal["#hubCities"]?.innerHTML, "");
  assert.equal(empty["#hubCities"]?.innerHTML, "");
  const styles = await panelStyles();
  assert.match(styles, /\.hub-cities:empty\{display:none\}/);
});

test("saat dilimi olmayan kayıt hub'a yazılmaz", async () => {
  const elements = await renderCities(
    [
      { id: "1", name: "Bilinmeyen", timeZone: "" },
      { id: "2", name: "İstanbul", timeZone: "Europe/Istanbul" }
    ],
    "Europe/London"
  );

  assert.equal([...(elements["#hubCities"]?.innerHTML ?? "").matchAll(/<em>/g)].length, 1);
  assert.match(elements["#hubCities"]?.innerHTML ?? "", /İstanbul/);
});

test("hava özeti bugünün uçlarını ve nemi yazar", async () => {
  const elements = await renderWeather({ location: { name: "Londra" }, data: forecast, updatedAt: Date.now() });
  const html = elements["#hubWeatherBody"]?.innerHTML ?? "";

  // Tam şablon anahtarı: parça birleştirme yok, yer tutucular tek metinde.
  assert.match(html, /<span class="hub-w-stat">hubWeatherRange\(high=31°,low=21°\)<\/span>/);
  assert.match(html, /<span class="hub-w-stat hub-w-stat-extra">hubWeatherHumidity\(humidity=49%\)<\/span>/);
  // Detay, "şu an" bloğunun metin sütununda durur — ikon hizası bozulmaz.
  assert.match(html, /<span class="hub-w-cond">[^<]*<\/span><span class="hub-w-stats">/);
});

test("veri eksikse hava detayı kendiliğinden kırpılır", async () => {
  const withoutDaily = await renderWeather({ location: { name: "Londra" }, data: { ...forecast, daily: {} }, updatedAt: Date.now() });
  const withoutAny = await renderWeather({
    location: { name: "Londra" },
    data: { current: { temperature_2m: 24, weather_code: 0, is_day: 1 }, current_units: {}, daily: {} },
    updatedAt: Date.now()
  });

  const partial = withoutDaily["#hubWeatherBody"]?.innerHTML ?? "";
  assert.doesNotMatch(partial, /hubWeatherRange/);
  assert.match(partial, /hubWeatherHumidity/);
  // Hiçbir alan yoksa düğüm de üretilmez: boş kutu kalmaz.
  assert.doesNotMatch(withoutAny["#hubWeatherBody"]?.innerHTML ?? "", /hub-w-stats/);
});

test("konum seçilmemişken davet satırı bozulmaz, detay çıkmaz", async () => {
  const elements = await renderWeather({ location: null, data: null, updatedAt: 0 });
  const html = elements["#hubWeatherBody"]?.innerHTML ?? "";

  assert.equal(html, '<span class="hub-w-cond">weatherNoLocationHint</span>');
  assert.doesNotMatch(html, /hub-w-stats|hubWeatherRange|hubWeatherHumidity/);
  assert.equal(elements["#hubWeatherLocation"]?.textContent, "weather");
});

test("hub detayı yeni ağ isteği getirmez", async () => {
  const scripts = await panelScripts();

  // Panelin tamamında yalnız iki dış çağrı var: arama ve tahmin. Yeni uç eklenmedi.
  assert.deepEqual([...scripts.matchAll(/https:\/\/[a-z.\-]+/g)].map((match) => match[0]).sort(), [
    "https://api.open-meteo.com",
    "https://geocoding-api.open-meteo.com"
  ]);
  // İstenen alan listesi olduğu gibi duruyor: nem ve günlük uçlar zaten çekiliyordu.
  assert.match(scripts, /current:"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m"/);
  assert.match(scripts, /daily:"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset"/);
  assert.match(scripts, /forecast_days:"4"/);
  // Detay yalnız mevcut duruma bakar; kendi başına yükleme tetiklemez.
  assert.doesNotMatch(extractFunction(scripts, "hubWeatherStats"), /fetch|loadWeather|api\(/);
  assert.doesNotMatch(extractFunction(scripts, "renderHubCities"), /fetch|api\(/);
});

test("ayrıntılı pencereler aynen kalır", async () => {
  const source = await readPanelSource();

  assert.match(source, /container\.innerHTML=worldClockZones\.length\?worldClockZones\.map\(city=>/);
  assert.match(source, /const days=weatherDailyEntries\(4\)\.map\(entry=>/);
  assert.match(source, /weatherHourlyEntries\(12\)/);
  assert.match(source, /\$\{t\("weatherHumidity"\)\} \$\{weatherValue\(current\.relative_humidity_2m/);
});

test("hub özeti sığmazsa kırpılır, alt şeride taşmaz", async () => {
  const styles = await panelStyles();

  // Kısa yatay ekranda önce nem, sonra ikinci şehir düşer — öncelik şehirlerde (handoff kuralı).
  assert.match(
    styles,
    /@media\(orientation:landscape\) and \(max-height:560px\)\{#home \.hub-w-stat-extra\{display:none\}#home \.hub-city:nth-child\(n\+2\)\{display:none\}\}/
  );
  // Son çare kaydırma: hub kendi içinde kayar, sabit şeridin üstüne binmez.
  assert.match(styles, /#home \.home-hub\{[^}]*max-height:100%;overflow:auto/);
  // Ölçüler viewport'tan türer ve renk karıştıran işlev kullanılmaz.
  assert.match(styles, /\.hub-city\{[^}]*min-height:clamp\([^)]*\);padding:clamp\([^)]*\) 0/);
  assert.match(styles, /\.hub-w-stats\{[^}]*margin-top:clamp\(/);
  assert.doesNotMatch(styles, /\.hub-city\{[^}]*color-mix\(/);
  assert.doesNotMatch(styles, /\.hub-w-stats\{[^}]*color-mix\(/);
  // Koyu temada da okunur: alt satırlar hub'ın kendi sönük rengini alır.
  assert.match(styles, /body\[data-active-view="home"\] #home \.hub-city,/);
  assert.match(styles, /body\[data-active-view="home"\] #home \.hub-w-stats,/);
});

test("hub detay metinleri iki dilde de tam şablon olarak tanımlı", async () => {
  const catalogs = await Promise.all(
    Object.entries(localeUrls).map(async ([code, url]) => {
      const catalog = JSON.parse(await readFile(url, "utf8")).translations as Record<string, string>;
      return [code, catalog] as const;
    })
  );

  for (const [code, catalog] of catalogs) {
    assert.equal(typeof catalog.hubWeatherRange, "string", `${code}: hubWeatherRange`);
    assert.equal(typeof catalog.hubWeatherHumidity, "string", `${code}: hubWeatherHumidity`);
    // Yer tutucular her iki dilde de aynı: cümle bölünüp yeniden birleştirilmiyor.
    assert.deepEqual([...catalog.hubWeatherRange.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), ["high", "low"]);
    assert.deepEqual([...catalog.hubWeatherHumidity.matchAll(/\{(\w+)\}/g)].map((match) => match[1]), ["humidity"]);
  }
  const [[, english], [, turkish]] = catalogs;
  assert.notEqual(english.hubWeatherRange, turkish.hubWeatherRange);
  assert.notEqual(english.hubWeatherHumidity, turkish.hubWeatherHumidity);
});
