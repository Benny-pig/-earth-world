import { formatZonedTime, weatherCodeToIcon } from "/src/lib/geo.js";

const TEN_MIN = 10 * 60 * 1000;
const HINT = "將滑鼠移到國家並點擊,看當地時間與天氣";

export function createClockWeather() {
  const el = document.getElementById("clock-weather");
  const cache = new Map();   // code -> { at:number, html:string }
  let current = null;        // { code, name_zh, timezone, latlon }
  let weatherHtml = "";

  function renderHint() {
    el.innerHTML = `<div class="cw-hint">${HINT}</div>`;
  }

  function renderTick() {
    if (!current) return;
    let dateLine = "";
    let timeLine = `<div class="cw-time">時間 —</div>`;
    if (current.timezone) {
      const { date, time, weekday } = formatZonedTime(new Date(), current.timezone);
      dateLine = `<div class="cw-date">${date}(${weekday})</div>`;
      timeLine = `<div class="cw-time">${time}</div>`;
    }
    el.innerHTML =
      `<div class="cw-country">${current.name_zh}</div>` +
      dateLine +
      timeLine +
      `<div class="cw-weather">${weatherHtml || "天氣 —"}</div>`;
  }

  async function fetchWeather(c) {
    const hit = cache.get(c.code);
    if (hit && Date.now() - hit.at < TEN_MIN) { weatherHtml = hit.html; renderTick(); return; }
    const [lat, lon] = c.latlon;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error("weather " + r.status);
      const j = await r.json();
      const t = Math.round(j.current.temperature_2m);
      const { icon, label } = weatherCodeToIcon(j.current.weather_code);
      weatherHtml = `${icon} ${label} ${t}°C`;
      cache.set(c.code, { at: Date.now(), html: weatherHtml });
    } catch (e) {
      console.warn("[clock-weather] 天氣抓取失敗:", e.message);
      weatherHtml = "天氣 —";
    } finally {
      clearTimeout(timer);
      // 只有仍是同一個國家才更新畫面,避免競態蓋掉新選取
      if (current && current.code === c.code) renderTick();
    }
  }

  setInterval(renderTick, 1000);
  renderHint();

  return {
    setCountry(c) {
      if (!c) { current = null; renderHint(); return; }
      current = c;
      weatherHtml = "";
      renderTick();
      fetchWeather(c);
    },
    clear() { current = null; renderHint(); },
  };
}
