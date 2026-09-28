import { makeDraggable } from "./draggable.js";
import { weatherCodeToIcon } from "../lib/geo.js";
import { esc } from "../lib/esc.js";

// 🌡️ 世界溫度排行:世界各國首都的氣溫(Open-Meteo,免金鑰),可以看
//   「現在氣溫」「今天最高」「今天最低」三種排行,分成最熱前段、最冷前段、全部排名(整份可以捲動瀏覽),
//   也能直接搜尋國家或首都看它排第幾。20 分鐘內再打開就用剛剛的結果。點一筆就飛過去看那個國家。
const API = "https://api.open-meteo.com/v1/forecast";
const FRESH_MS = 20 * 60 * 1000;
const METRICS = { now: ["🌡️ 現在", "現在氣溫"], max: ["☀️ 今天最高", "今天最高溫"], min: ["🌙 今天最低", "今天最低溫"] };

export function createTempRank({ getContent, nameOf, openCountryByCode, onClose }) {
  const panel = document.getElementById("temp-panel");
  const body = document.getElementById("temp-body");
  if (!panel || !body) return { setEnabled() {}, isEnabled: () => false };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("temp-close")?.addEventListener("click", () => onClose && onClose());
  let enabled = false, rows = [], at = 0, tab = "hot", metric = "now", q = "", loading = null;

  async function load() {
    const content = getContent() || {};
    const caps = Object.entries(content)
      .filter(([, c]) => c && c.capital_zh && Array.isArray(c.capital_latlon))
      .map(([code, c]) => ({ code, cap: c.capital_zh, lat: c.capital_latlon[0], lon: c.capital_latlon[1], tz: c.timezone }));
    const out = [];
    for (let i = 0; i < caps.length; i += 100) {
      const part = caps.slice(i, i + 100);
      // timezone=auto:「今天」照每個首都自己的當地日期算
      const url = `${API}?latitude=${part.map((c) => c.lat.toFixed(2)).join(",")}&longitude=${part.map((c) => c.lon.toFixed(2)).join(",")}` +
        `&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      let j = await r.json();
      if (!Array.isArray(j)) j = [j];
      j.forEach((d, k) => {
        const t = d?.current?.temperature_2m;
        if (typeof t !== "number") return;
        out.push({ ...part[k], now: t, max: d.daily?.temperature_2m_max?.[0], min: d.daily?.temperature_2m_min?.[0], code2: d.current.weather_code, day: d.current.is_day === 1 });
      });
    }
    rows = out;
    at = Date.now();
  }

  const flag = (code) => `<img class="tr-flag" src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const localTime = (tz) => { try { return new Intl.DateTimeFormat("zh-TW", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); } catch { return ""; } };
  const val = (r) => r[metric];
  const norm = (s) => String(s || "").replace(/臺/g, "台").toLowerCase();

  function row(r, rank) {
    const w = weatherCodeToIcon(r.code2);
    const v = val(r);
    return `<button type="button" class="tr-row${r.code === "TW" ? " tr-me" : ""}" data-code="${r.code}"><span class="tr-rank">${rank}</span>${flag(r.code)}` +
      `<span class="tr-name">${esc(r.cap)}<small>${esc(nameOf(r.code))}</small></span>` +
      `<span class="tr-w" title="${esc(w.label)}">${r.day ? w.icon : w.icon === "☀️" ? "🌙" : w.icon}</span>` +
      `<span class="tr-lt">${localTime(r.tz)}</span><b class="tr-t ${v >= 30 ? "tr-hot" : v <= 5 ? "tr-cold" : ""}">${v.toFixed(1)}°</b></button>`;
  }

  function render() {
    const keepScroll = body.querySelector(".tr-list")?.scrollTop || 0;
    if (!rows.length) { body.innerHTML = `<div class="ap-empty">${loading ? "查詢世界各地首都的氣溫…" : "氣溫資料暫時讀不到,稍後再試"}</div>`; return; }
    const sorted = rows.filter((r) => typeof val(r) === "number").sort((a, b) => val(b) - val(a));
    const rankOf = new Map(sorted.map((r, i) => [r.code, i + 1]));
    const hottest = sorted[0], coldest = sorted[sorted.length - 1];
    const tw = sorted.find((r) => r.code === "TW");
    let list;
    if (q) list = sorted.filter((r) => norm(r.cap).includes(norm(q)) || norm(nameOf(r.code)).includes(norm(q)) || r.code.toLowerCase() === norm(q));
    else list = tab === "hot" ? sorted.slice(0, 12) : tab === "cold" ? sorted.slice(-12).reverse() : sorted;
    body.innerHTML =
      `<div class="tr-metric">${Object.entries(METRICS).map(([k, [l]]) => `<button type="button" data-metric="${k}" class="${metric === k ? "on" : ""}">${l}</button>`).join("")}</div>` +
      `<div class="tr-sum">🌍 全球 ${sorted.length} 個首都的${METRICS[metric][1]}:最熱 <b class="tr-hot">${val(hottest).toFixed(1)}°</b>(${esc(hottest.cap)}),最冷 <b class="tr-cold">${val(coldest).toFixed(1)}°</b>(${esc(coldest.cap)})</div>` +
      (tw ? `<div class="tr-tw">🇹🇼 台北${METRICS[metric][1]} <b>${val(tw).toFixed(1)}°C</b>,全球首都第 <b>${rankOf.get("TW")}</b> 熱</div>` : "") +
      `<input type="search" class="tr-q" placeholder="🔍 找國家或首都(例如 日本、巴黎)" value="${esc(q)}">` +
      (q ? "" : `<div class="tr-tabs"><button type="button" data-tab="hot" class="${tab === "hot" ? "on" : ""}">🔥 最熱</button>` +
        `<button type="button" data-tab="cold" class="${tab === "cold" ? "on" : ""}">❄️ 最冷</button>` +
        `<button type="button" data-tab="all" class="${tab === "all" ? "on" : ""}">📋 全部排名</button></div>`) +
      `<div class="tr-list">${list.length ? list.map((r) => row(r, rankOf.get(r.code))).join("") : `<div class="ap-empty">找不到「${esc(q)}」</div>`}</div>` +
      `<div class="sat-caption">排名數字 = 全球 ${sorted.length} 個首都裡第幾熱。氣溫來自 Open-Meteo,「今天」照各地自己的日期算,` +
      `${new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(at)} 更新。點一個城市就飛過去看那個國家。</div>`;
    const listEl = body.querySelector(".tr-list");
    if (listEl && tab === "all" && !q) listEl.scrollTop = keepScroll;
  }
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; render(); return; }
    const m = e.target.closest("[data-metric]");
    if (m) { metric = m.dataset.metric; render(); return; }
    const r = e.target.closest(".tr-row");
    if (r) openCountryByCode(r.dataset.code);
  });
  // 注音等輸入法組字中不要重畫(會把組字打斷,只剩注音符號),選完字再更新
  const onSearch = (e) => {
    if (e.isComposing || !e.target.classList.contains("tr-q")) return;
    q = e.target.value.trim();
    const pos = e.target.selectionStart;
    render();
    const inp = body.querySelector(".tr-q");
    if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch { /* 有些輸入框不支援 */ } }
  };
  body.addEventListener("input", onSearch);
  body.addEventListener("compositionend", onSearch);

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
