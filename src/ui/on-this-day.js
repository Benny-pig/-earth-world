import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// 📅 歷史上的今天:維基百科「歷史上的今天」(REST feed,允許網頁直接讀取;
// 帶 Accept-Language: zh-TW 拿到台灣正體用字)。每則事件從文字裡找出提到的國家
// (有些事件維基還附了地點座標),點一下地球飛過去,也能「自動導覽」一則一則講故事。
const FEED = "https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events";
const CACHE_KEY = "earth-world.otd.v1";
const TOUR_MS = 7000;
// 常見的其他寫法、城市名 → 國家代碼(地圖上的正式中文名以外)
const ALIAS = {
  美國: "US", 英國: "GB", 蘇聯: "RU", 俄國: "RU", 俄羅斯帝國: "RU", 德國: "DE", 西德: "DE", 東德: "DE", 納粹德國: "DE",
  中華民國: "TW", 臺灣: "TW", 台灣: "TW", 中華人民共和國: "CN", 中國: "CN", 清朝: "CN", 南韓: "KR", 韓國: "KR", 大韓民國: "KR",
  北韓: "KP", 朝鮮: "KP", 義大利: "IT", 意大利: "IT", 澳洲: "AU", 澳大利亞: "AU", 紐西蘭: "NZ", 荷蘭: "NL", 瑞士: "CH",
  鄂圖曼帝國: "TR", 奧斯曼帝國: "TR", 土耳其: "TR", 波斯: "IR", 羅馬帝國: "IT", 大英帝國: "GB", 印尼: "ID", 印度尼西亞: "ID",
  紐約: "US", 華盛頓: "US", 洛杉磯: "US", 舊金山: "US", 芝加哥: "US", 倫敦: "GB", 巴黎: "FR", 柏林: "DE", 東京: "JP", 大阪: "JP",
  北京: "CN", 上海: "CN", 南京: "CN", 臺北: "TW", 台北: "TW", 高雄: "TW", 臺中: "TW", 台中: "TW", 澎湖: "TW", 香港: "HK", 澳門: "MO",
  莫斯科: "RU", 羅馬: "IT", 首爾: "KR", 平壤: "KP", 曼谷: "TH", 河內: "VN", 西貢: "VN", 新德里: "IN", 開羅: "EG", 耶路撒冷: "IL",
};

const twMonthDay = () => {
  const [m, d] = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" }).format(new Date()).split("/");
  return { m, d };
};

export function createOnThisDay({ rig, onClose }) {
  const panel = document.getElementById("otd-panel");
  const caption = document.getElementById("otd-caption");
  if (!panel) return { setEnabled() {}, isEnabled: () => false };
  const $ = (id) => document.getElementById(id);
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, events = null, tourTimer = null, tourIdx = 0, highlightTimer = null;
  let names = null;   // [[中文名, 代碼]],長的在前

  function buildNames() {
    const cl = window.__earth?.countryLayer;
    const map = new Map(Object.entries(ALIAS));
    if (cl) for (const [code, w] of cl.meshByCode) {
      const zh = w.userData?.names?.zh;
      if (zh && zh.length >= 2 && !map.has(zh)) map.set(zh, code);
    }
    names = [...map].sort((a, b) => b[0].length - a[0].length);
  }
  // 事件文字裡提到的國家,依出現位置排序(第一個提到的當主角)
  function countriesIn(text) {
    if (!names) buildNames();
    const hits = [];
    let t = text;
    for (const [n, code] of names) {
      const i = t.indexOf(n);
      if (i >= 0) {
        hits.push([i, code]);
        t = t.split(n).join("＿".repeat(n.length));   // 「印度尼西亞」不要又算成「印度」
      }
    }
    return [...new Set(hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]))];
  }

  async function load() {
    const { m, d } = twMonthDay();
    const key = `${m}-${d}`;
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && c.key === key) return c.events;
    } catch { /* 重新抓 */ }
    const r = await fetch(`${FEED}/${m}/${d}`, { headers: { "Accept-Language": "zh-TW" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = (data.events || []).map((e) => {
      const geo = (e.pages || []).map((p) => p.coordinates).find(Boolean) || null;
      return { year: e.year, text: e.text, geo: geo ? [geo.lat, geo.lon] : null };
    }).sort((a, b) => b.year - a.year);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key, events: list })); } catch { /* 存不下就算了 */ }
    return list;
  }

  function target(ev) {
    if (ev.geo) return ev.geo;
    const code = ev.codes[0];
    const c = code && window.__earth?.content?.[code];
    if (c && Array.isArray(c.capital_latlon)) return c.capital_latlon;
    const w = code && window.__earth?.countryLayer?.meshByCode.get(code);
    if (w?.userData?.centroidLatLon) { const [lon, lat] = w.userData.centroidLatLon; return [lat, lon]; }
    return null;
  }

  function focus(ev) {
    const t = target(ev);
    if (!t) return;
    rig.flyTo(t[0], t[1], { distance: 2.1, ms: 1400 });
    const cl = window.__earth?.countryLayer;
    if (cl && ev.codes[0] && !window.__earth?.sidePanel?.isOpen()) {
      cl.setSelected(ev.codes[0]);
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => { if (!window.__earth?.sidePanel?.isOpen()) cl.setSelected(null); }, TOUR_MS - 500);
    }
  }

  function flag(code) {
    return /^[A-Z]{2}$/.test(code) ? `<img class="otd-flag" src="https://flagcdn.com/w20/${code.toLowerCase()}.png" alt="">` : "";
  }
  function nameOf(code) { return window.__earth?.countryLayer?.meshByCode.get(code)?.userData?.names?.zh || code; }

  function render() {
    const { m, d } = twMonthDay();
    $("otd-date").textContent = `${Number(m)} 月 ${Number(d)} 日`;
    if (!events) { $("otd-list").innerHTML = `<div class="ap-empty">載入中…</div>`; return; }
    $("otd-list").innerHTML = events.map((e, i) => `<div class="ap-row otd-row${e.codes.length || e.geo ? " otd-geo" : ""}" data-i="${i}">
        <div class="otd-year">${e.year < 0 ? `西元前 ${-e.year}` : e.year} 年</div>
        <div class="otd-text">${esc(e.text)}</div>
        ${e.codes.length ? `<div class="otd-countries">${e.codes.slice(0, 4).map((c) => `<span class="otd-c">${flag(c)}${esc(nameOf(c))}</span>`).join("")}</div>` : ""}
      </div>`).join("");
  }

  function showCaption(ev) {
    const where = ev.codes.length ? ev.codes.slice(0, 2).map(nameOf).join("、") : "";
    caption.innerHTML = `<div class="otd-cap-k">📅 歷史上的今天 · ${ev.year < 0 ? `西元前 ${-ev.year}` : ev.year} 年${where ? ` · ${esc(where)}` : ""}</div>` +
      `<div class="otd-cap-t">${esc(ev.text)}</div>` +
      `<button type="button" class="otd-cap-stop" id="otd-cap-stop">⏸ 停止導覽</button>`;
    caption.hidden = false;
    $("otd-cap-stop").addEventListener("click", stopTour);
  }

  function tourStep() {
    const withPlace = events.filter((e) => e.codes.length || e.geo);
    if (!withPlace.length) { stopTour(); return; }
    const ev = withPlace[tourIdx % withPlace.length];
    tourIdx++;
    focus(ev);
    showCaption(ev);
    const i = events.indexOf(ev);
    panel.querySelectorAll(".otd-row.on").forEach((r) => r.classList.remove("on"));
    const row = panel.querySelector(`.otd-row[data-i="${i}"]`);
    if (row) { row.classList.add("on"); row.scrollIntoView({ block: "nearest" }); }
  }
  function startTour() {
    if (!events) return;
    window.__earth?.globe?.setSpinPaused(true);
    tourIdx = 0;
    tourStep();
    clearInterval(tourTimer);
    tourTimer = setInterval(tourStep, TOUR_MS);
    $("otd-tour").textContent = "⏸ 停止導覽";
  }
  function stopTour() {
    clearInterval(tourTimer); tourTimer = null;
    caption.hidden = true;
    $("otd-tour").textContent = "▶ 自動導覽";
    panel.querySelectorAll(".otd-row.on").forEach((r) => r.classList.remove("on"));
  }

  $("otd-list").addEventListener("click", (e) => {
    const row = e.target.closest(".otd-row");
    if (!row || !events) return;
    stopTour();
    const ev = events[Number(row.dataset.i)];
    focus(ev);
    panel.querySelectorAll(".otd-row.on").forEach((r) => r.classList.remove("on"));
    row.classList.add("on");
  });
  $("otd-tour").addEventListener("click", () => (tourTimer ? stopTour() : startTour()));
  $("otd-close").addEventListener("click", () => onClose && onClose());

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (!enabled) { stopTour(); return; }
    render();
    try {
      if (!events) {
        const raw = await load();
        events = raw.map((e) => ({ ...e, codes: countriesIn(e.text) }));
      }
      if (enabled) render();
    } catch (e) {
      console.warn("[on-this-day] 載入失敗:", e.message);
      $("otd-list").innerHTML = `<div class="ap-empty">歷史事件暫時載入失敗,稍後再試</div>`;
    }
  }

  return { setEnabled, isEnabled: () => enabled };
}
