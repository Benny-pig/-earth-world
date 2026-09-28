import { makeDraggable } from "./draggable.js";
import { weatherCodeToIcon } from "../lib/geo.js";
import { esc } from "../lib/esc.js";

// 🌡️ 全球此刻最熱/最冷:世界各國首都現在的氣溫排行(Open-Meteo,免金鑰),
// 一次查全部首都(分兩批),20 分鐘內再打開就用剛剛的結果。點一筆就飛過去看那個國家。
const API = "https://api.open-meteo.com/v1/forecast";
const FRESH_MS = 20 * 60 * 1000;

export function createTempRank({ getContent, nameOf, openCountryByCode, onClose }) {
  const panel = document.getElementById("temp-panel");
  const body = document.getElementById("temp-body");
  if (!panel || !body) return { setEnabled() {}, isEnabled: () => false };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("temp-close")?.addEventListener("click", () => onClose && onClose());
  let enabled = false, rows = [], at = 0, tab = "hot", loading = null;

  async function load() {
    const content = getContent() || {};
    const caps = Object.entries(content)
      .filter(([, c]) => c && c.capital_zh && Array.isArray(c.capital_latlon))
      .map(([code, c]) => ({ code, cap: c.capital_zh, lat: c.capital_latlon[0], lon: c.capital_latlon[1], tz: c.timezone }));
    const out = [];
    for (let i = 0; i < caps.length; i += 100) {
      const part = caps.slice(i, i + 100);
      const url = `${API}?latitude=${part.map((c) => c.lat.toFixed(2)).join(",")}&longitude=${part.map((c) => c.lon.toFixed(2)).join(",")}` +
        `&current=temperature_2m,weather_code,is_day`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      let j = await r.json();
      if (!Array.isArray(j)) j = [j];
      j.forEach((d, k) => {
        const t = d?.current?.temperature_2m;
        if (typeof t === "number") out.push({ ...part[k], t, code2: d.current.weather_code, day: d.current.is_day === 1 });
      });
    }
    rows = out.sort((a, b) => b.t - a.t);
    at = Date.now();
  }

  const flag = (code) => `<img class="tr-flag" src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="" onerror="this.style.visibility='hidden'">`;
  const localTime = (tz) => { try { return new Intl.DateTimeFormat("zh-TW", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); } catch { return ""; } };
  function render() {
    if (!rows.length) { body.innerHTML = `<div class="ap-empty">${loading ? "查詢世界各地首都的氣溫…" : "氣溫資料暫時讀不到,稍後再試"}</div>`; return; }
    const list = tab === "hot" ? rows.slice(0, 12) : rows.slice(-12).reverse();
    const tw = rows.findIndex((r) => r.code === "TW");
    const hottest = rows[0], coldest = rows[rows.length - 1];
    body.innerHTML =
      `<div class="tr-sum">🌍 全球 ${rows.length} 個首都:最熱 <b class="tr-hot">${hottest.t.toFixed(1)}°</b>(${esc(hottest.cap)}),最冷 <b class="tr-cold">${coldest.t.toFixed(1)}°</b>(${esc(coldest.cap)}),相差 ${(hottest.t - coldest.t).toFixed(0)} 度</div>` +
      (tw >= 0 ? `<div class="tr-tw">🇹🇼 台北現在 <b>${rows[tw].t.toFixed(1)}°C</b>,在全球首都裡排第 <b>${tw + 1}</b> 熱</div>` : "") +
      `<div class="tr-tabs"><button type="button" data-tab="hot" class="${tab === "hot" ? "on" : ""}">🔥 最熱</button><button type="button" data-tab="cold" class="${tab === "cold" ? "on" : ""}">❄️ 最冷</button></div>` +
      list.map((r, i) => {
        const w = weatherCodeToIcon(r.code2);
        return `<button type="button" class="tr-row" data-code="${r.code}"><span class="tr-rank">${i + 1}</span>${flag(r.code)}` +
          `<span class="tr-name">${esc(r.cap)}<small>${esc(nameOf(r.code))}</small></span>` +
          `<span class="tr-w" title="${esc(w.label)}">${r.day ? w.icon : w.icon === "☀️" ? "🌙" : w.icon}</span>` +
          `<span class="tr-lt">${localTime(r.tz)}</span><b class="tr-t ${r.t >= 30 ? "tr-hot" : r.t <= 5 ? "tr-cold" : ""}">${r.t.toFixed(1)}°</b></button>`;
      }).join("") +
      `<div class="sat-caption">氣溫來自 Open-Meteo(各國首都現在的氣溫),${new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(at)} 更新。點一個城市就飛過去看那個國家。</div>`;
  }
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; render(); return; }
    const r = e.target.closest(".tr-row");
    if (r) openCountryByCode(r.dataset.code);
  });

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (!enabled) return;
    if (Date.now() - at > FRESH_MS && !loading) {
      loading = load().catch((e) => console.warn("[temp] 氣溫讀取失敗:", e.message)).finally(() => { loading = null; if (enabled) render(); });
    }
    render();
  }
  return { setEnabled, isEnabled: () => enabled };
}
