// Wetter — current conditions plus a 5-day forecast for Hua Hin.
// Live data from Open-Meteo (free, no API key; the request carries only
// Hua Hin's coordinates, nothing about the guest). Cached for 15 minutes so
// opening the page repeatedly doesn't hit the service each time.
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { renderBackHeader } from "./shared.js";

const HUA_HIN = { lat: 12.5684, lon: 99.9577 };
const CACHE_MS = 15 * 60 * 1000;
const API_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${HUA_HIN.lat}&longitude=${HUA_HIN.lon}` +
  "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
  "&timezone=Asia%2FBangkok&forecast_days=5";

let data = null;
let fetchedAt = 0;
let status = "idle"; // idle | loading | ok | error
let lastFailAt = 0;
let onChange = () => {};

export function setWeatherListener(fn) {
  onChange = fn;
}

export async function loadWeather(force = false) {
  if (status === "loading") return;
  if (!force && data && Date.now() - fetchedAt < CACHE_MS) return;
  // After a failure wait a minute before the next automatic try — every redraw asks for weather, so without this a failed request would loop.
  if (!force && Date.now() - lastFailAt < 60 * 1000) return;
  status = "loading";
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    fetchedAt = Date.now();
    status = "ok";
  } catch (err) {
    console.error("weather fetch failed", err);
    lastFailAt = Date.now();
    status = data ? "ok" : "error"; // keep showing the last good data if a refresh fails
  }
  onChange();
}

// WMO weather codes → one of our condition keys + a Lucide icon.
function condition(code, isDay = 1) {
  if (code === 0) return { key: "wxClear", icon: isDay ? "sun" : "moon" };
  if (code === 1) return { key: "wxMostlyClear", icon: isDay ? "sun" : "moon" };
  if (code === 2) return { key: "wxPartly", icon: "cloudSun" };
  if (code === 3) return { key: "wxOvercast", icon: "cloud" };
  if (code === 45 || code === 48) return { key: "wxFog", icon: "cloudFog" };
  if (code >= 51 && code <= 57) return { key: "wxDrizzle", icon: "cloudDrizzle" };
  if (code >= 61 && code <= 67) return { key: "wxRain", icon: "cloudRain" };
  if (code >= 80 && code <= 82) return { key: "wxShowers", icon: "cloudRain" };
  if (code >= 95) return { key: "wxThunder", icon: "cloudLightning" };
  return { key: "wxOvercast", icon: "cloud" };
}

// One-line live summary for the booking card ("Hua Hin · 29° · Drizzle"), or
// null until data has loaded — callers fall back to the manual note. Starts
// the (cached) fetch if needed.
export function weatherSummary(lang) {
  loadWeather();
  if (!data?.current) return null;
  const c = data.current;
  return `Hua Hin · ${Math.round(c.temperature_2m)}° · ${t(condition(c.weather_code, c.is_day).key, lang)}`;
}

const hhmm = (iso) => (iso || "").slice(11, 16);

export function weatherView({ lang }) {
  if (status === "idle" || (status !== "loading" && (!data || Date.now() - fetchedAt >= CACHE_MS))) loadWeather();

  let body;
  if (!data && status === "error") {
    body = `<div class="empty-state"><p lang="${lang}">${t("wxError", lang)}</p>
      <button class="btn-secondary" style="margin-top:16px;" data-action="weather-retry" lang="${lang}">${t("wxRetry", lang)}</button></div>`;
  } else if (!data) {
    body = `<div class="empty-state"><p lang="${lang}">${t("wxLoading", lang)}</p></div>`;
  } else {
    body = `<div class="weather-grid">${currentCard(data, lang)}${forecastCard(data, lang)}</div>
      <p class="weather-credit">${t("wxUpdated", lang)} ${hhmm(data.current.time)} · Open-Meteo</p>`;
  }

  return `
    ${renderBackHeader({ lang, labelKey: "wxTitle" })}
    <main>
      <div class="title-block" style="padding-top:24px;">
        <span class="section-label">${t("wxLocation", lang)}</span>
        <h1 lang="${lang}" style="font-size:32px;">${t("wxTitle", lang)}</h1>
      </div>
      ${body}
    </main>`;
}

function currentCard(d, lang) {
  const c = d.current;
  const cond = condition(c.weather_code, c.is_day);
  const today = d.daily;
  return `
    <section class="weather-now">
      <div class="weather-now-main">
        <span class="weather-now-icon">${icon(cond.icon, { size: 64, strokeWidth: 1 })}</span>
        <div>
          <div class="weather-now-temp">${Math.round(c.temperature_2m)}°</div>
          <div class="weather-now-cond" lang="${lang}">${t(cond.key, lang)}</div>
        </div>
      </div>
      <div class="weather-facts">
        <div><span lang="${lang}">${t("wxFeels", lang)}</span><b>${Math.round(c.apparent_temperature)}°</b></div>
        <div><span lang="${lang}">${t("wxHumidity", lang)}</span><b>${Math.round(c.relative_humidity_2m)} %</b></div>
        <div><span lang="${lang}">${t("wxWind", lang)}</span><b>${Math.round(c.wind_speed_10m)} km/h</b></div>
        <div><span lang="${lang}">${t("wxHighLow", lang)}</span><b>${Math.round(today.temperature_2m_max[0])}° / ${Math.round(today.temperature_2m_min[0])}°</b></div>
        <div><span lang="${lang}">${t("wxSunrise", lang)}</span><b>${hhmm(today.sunrise[0])}</b></div>
        <div><span lang="${lang}">${t("wxSunset", lang)}</span><b>${hhmm(today.sunset[0])}</b></div>
      </div>
    </section>`;
}

function forecastCard(d, lang) {
  const locale = lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB";
  const dl = d.daily;
  const rows = dl.time
    .map((day, i) => {
      const cond = condition(dl.weather_code[i]);
      const label = i === 0
        ? t("wxToday", lang)
        : new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" });
      return `
        <div class="weather-day">
          <span class="weather-day-name" lang="${lang}">${label}</span>
          <span class="weather-day-icon">${icon(cond.icon, { size: 24, strokeWidth: 1.25 })}</span>
          <span class="weather-day-cond" lang="${lang}">${t(cond.key, lang)}</span>
          <span class="weather-day-rain">${icon("droplets", { size: 14 })} ${Math.round(dl.precipitation_probability_max[i] ?? 0)} %</span>
          <span class="weather-day-temps"><b>${Math.round(dl.temperature_2m_max[i])}°</b> <span>${Math.round(dl.temperature_2m_min[i])}°</span></span>
        </div>`;
    })
    .join("");
  return `
    <section class="weather-forecast">
      <div class="section-label" lang="${lang}" style="margin-bottom:6px;">${t("wxForecast", lang)}</div>
      ${rows}
    </section>`;
}
