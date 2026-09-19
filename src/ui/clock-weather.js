import { formatZonedTime, weatherCodeToIcon } from "../lib/geo.js";

const TEN_MIN = 10 * 60 * 1000;

export function createClockWeather({ onForecast } = {}) {
  const el = document.getElementById("clock-weather");
  const cache = new Map();   // code -> { at:number, html:string, forecast:Array|null }
  let current = null;        // { code, name_zh, timezone, latlon }
  let weatherHtml = "";

  // 沒選國家時不顯示這張卡片,不用一直放一句操作提示佔位子
  function renderHint() {
    el.innerHTML = "";
    el.hidden = true;
  }

  function renderTick() {
    if (!current) return;
    el.hidden = false;
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
      `<div class="cw-weather">${weatherHtml || "天氣 —"}${weatherHtml ? `<span class="cw-weather-note">模型預報,非即時觀測</span>` : ""}</div>`;
  }

  function parseForecast(daily) {
    if (!daily || !Array.isArray(daily.time)) return null;
    return daily.time.map((iso, i) => ({
      date: iso,
      code: daily.weather_code?.[i],
      tmax: Math.round(daily.temperature_2m_max?.[i]),
      tmin: Math.round(daily.temperature_2m_min?.[i]),
      pop: daily.precipitation_probability_max?.[i] ?? null,
      precip: daily.precipitation_sum?.[i] ?? null,
    }));
  }

  // 只有 current 仍是同一國時才把預報交給側欄(與 weatherHtml 的防競態一致)
  function emitForecast(code, days) {
    if (onForecast && current && current.code === code) onForecast(code, days);
  }

  async function fetchWeather(c) {
    if (!Array.isArray(c.latlon)) { weatherHtml = "天氣 —"; renderTick(); emitForecast(c.code, null); return; }
    const hit = cache.get(c.code);
    if (hit && Date.now() - hit.at < TEN_MIN) {
      weatherHtml = hit.html; renderTick();
      emitForecast(c.code, hit.forecast);
      return;
    }
    const [lat, lon] = c.latlon;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
      `&forecast_days=7&timezone=auto`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error("weather " + r.status);
      const j = await r.json();
      const t = Math.round(j.current.temperature_2m);
      const { icon, label } = weatherCodeToIcon(j.current.weather_code);
      const html = `${icon} ${label} ${t}°C`;
      const forecast = parseForecast(j.daily);
      // 「今天」格改用此刻的天氣代碼:當日彙總會把整天最顯著天氣(例如清晨一場毛毛雨)標成雨,
      // 與使用者當下看到的窗外實況不符。最高/最低溫與降雨機率仍用當日值。
      if (forecast && forecast.length && j.current && Number.isFinite(j.current.weather_code)) {
        forecast[0].code = j.current.weather_code;
      }
      cache.set(c.code, { at: Date.now(), html, forecast });   // A 的資料對 A 永遠有效,照存
      if (current && current.code === c.code) weatherHtml = html;
      emitForecast(c.code, forecast);
    } catch (e) {
      console.warn("[clock-weather] 天氣抓取失敗:", e.message);
      if (current && current.code === c.code) weatherHtml = "天氣 —";
      emitForecast(c.code, null);
    } finally {
      clearTimeout(timer);
      // 舊請求回來時 current 已換人:不覆寫共用狀態、也不重繪
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
