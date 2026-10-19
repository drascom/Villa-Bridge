"use strict";

// Node.js Mobile (Android) ICU'suz derlenmis: `Intl` global'i hic yok ve cekirdek
// (`dist/`) saat dilimi hesaplarinda `Intl.DateTimeFormat` kullaniyor. Bu dosya yalniz
// `Intl` yoksa devreye girer (Linux/Mac Node'unda hicbir sey yapmaz) ve cekirdegin
// kullandigi dar alt kumeyi saglar: `DateTimeFormat(locale, options)` ile `format`,
// `formatToParts`, `resolvedOptions().timeZone`. Saat dilimi verisi olmadigi icin yalniz
// UTC ve cihazin kendi yerel saat dilimi desteklenir; baskasi `RangeError` verir (gercek
// `Intl`'in gecersiz dilim davranisi), boylece cagiranlar onu "taninmayan dilim" sayar.

const { execFileSync } = require("node:child_process");

const UTC_NAMES = new Set(["UTC", "Etc/UTC", "GMT", "Etc/GMT", "Etc/UCT", "UCT", "Etc/Universal", "Universal", "Zulu", "Etc/Zulu"]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function androidTimeZone() {
  if (process.platform !== "android") return null;
  try {
    const value = execFileSync("/system/bin/getprop", ["persist.sys.timezone"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function detectLocalTimeZone() {
  const fromEnv = typeof process.env.TZ === "string" ? process.env.TZ.replace(/^:/, "").trim() : "";
  if (fromEnv) return fromEnv;
  const fromSystem = androidTimeZone();
  if (fromSystem) {
    // Bionic zaten ayni ozellikten okur; TZ'yi yazmak Date'in yerel saatiyle adin ayni
    // kaynaktan geldigini garanti eder.
    process.env.TZ = fromSystem;
    return fromSystem;
  }
  // Ad bilinmiyorsa yerel saate guvenilmez: tutarli kalmak icin UTC say.
  return "UTC";
}

function createIntlFallback(localTimeZone) {
  const localIsUtc = UTC_NAMES.has(localTimeZone);

  function resolveZone(value) {
    if (value === undefined) return localTimeZone;
    const zone = String(value);
    if (zone === localTimeZone) return zone;
    for (const name of UTC_NAMES) {
      if (name.toLowerCase() === zone.toLowerCase()) return "UTC";
    }
    throw new RangeError(`Invalid time zone specified: ${zone}`);
  }

  const pad = (value, width) => String(value).padStart(width, "0");

  class DateTimeFormat {
    constructor(locale, options) {
      const opts = options && typeof options === "object" ? options : {};
      this._locale = Array.isArray(locale) ? String(locale[0] ?? "en-US") : String(locale ?? "en-US");
      this._timeZone = resolveZone(opts.timeZone);
      this._options = opts;
      const anyField = ["weekday", "year", "month", "day", "hour", "minute", "second"].some(
        (key) => opts[key] !== undefined
      );
      // Alan verilmediyse gercek Intl gibi yalniz tarih (yil/ay/gun) bicimlenir.
      this._fields = anyField ? opts : { year: "numeric", month: "numeric", day: "numeric" };
    }

    _values(input) {
      const date = input === undefined ? new Date() : new Date(typeof input === "number" ? input : input.valueOf());
      if (Number.isNaN(date.getTime())) throw new RangeError("Invalid time value");
      const utc = this._timeZone === "UTC" || localIsUtc;
      return {
        year: utc ? date.getUTCFullYear() : date.getFullYear(),
        month: (utc ? date.getUTCMonth() : date.getMonth()) + 1,
        day: utc ? date.getUTCDate() : date.getDate(),
        hour: utc ? date.getUTCHours() : date.getHours(),
        minute: utc ? date.getUTCMinutes() : date.getMinutes(),
        second: utc ? date.getUTCSeconds() : date.getSeconds(),
        weekday: utc ? date.getUTCDay() : date.getDay()
      };
    }

    formatToParts(input) {
      const v = this._values(input);
      const f = this._fields;
      const parts = [];
      const literal = (value) => {
        if (parts.length > 0) parts.push({ type: "literal", value });
      };
      const num = (value, style) => (style === "2-digit" ? pad(value, 2) : String(value));
      if (f.weekday !== undefined) parts.push({ type: "weekday", value: WEEKDAYS[v.weekday] });
      const ymd = this._locale.toLowerCase() === "en-ca";
      const dateParts = [];
      if (f.year !== undefined) dateParts.push({ type: "year", value: f.year === "2-digit" ? pad(v.year % 100, 2) : String(v.year) });
      if (f.month !== undefined) dateParts.push({ type: "month", value: num(v.month, f.month) });
      if (f.day !== undefined) dateParts.push({ type: "day", value: num(v.day, f.day) });
      if (ymd) {
        // en-CA: 2026-10-20
        for (const part of dateParts) {
          if (part !== dateParts[0]) parts.push({ type: "literal", value: "-" });
          else literal(", ");
          parts.push(part);
        }
      } else {
        // en-US: 10/20/2026, en-GB: 20/10/2026
        const order = this._locale.toLowerCase() === "en-us" || this._locale === "en"
          ? ["month", "day", "year"]
          : ["day", "month", "year"];
        const sorted = order.map((type) => dateParts.find((part) => part.type === type)).filter(Boolean);
        sorted.forEach((part, index) => {
          if (index > 0) parts.push({ type: "literal", value: "/" });
          else literal(", ");
          parts.push(part);
        });
      }
      const timeParts = [];
      if (f.hour !== undefined) timeParts.push({ type: "hour", value: num(v.hour, f.hour) });
      if (f.minute !== undefined) timeParts.push({ type: "minute", value: pad(v.minute, 2) });
      if (f.second !== undefined) timeParts.push({ type: "second", value: pad(v.second, 2) });
      timeParts.forEach((part, index) => {
        if (index > 0) parts.push({ type: "literal", value: ":" });
        else literal(", ");
        parts.push(part);
      });
      return parts;
    }

    format(input) {
      return this.formatToParts(input).map((part) => part.value).join("");
    }

    resolvedOptions() {
      return {
        locale: this._locale,
        calendar: "gregory",
        numberingSystem: "latn",
        timeZone: this._timeZone,
        hourCycle: "h23"
      };
    }
  }

  const callable = function DateTimeFormatFallback(locale, options) {
    return new DateTimeFormat(locale, options);
  };
  callable.prototype = DateTimeFormat.prototype;
  callable.supportedLocalesOf = (locales) => (Array.isArray(locales) ? locales : locales ? [locales] : []);

  return { DateTimeFormat: callable };
}

function installIntlFallback() {
  if (typeof globalThis.Intl !== "undefined") return false;
  Object.defineProperty(globalThis, "Intl", {
    value: createIntlFallback(detectLocalTimeZone()),
    writable: true,
    configurable: true,
    enumerable: false
  });
  return true;
}

module.exports = { createIntlFallback, installIntlFallback };
