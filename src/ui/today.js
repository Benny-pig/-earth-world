import { makeDraggable } from "./draggable.js";
import { esc } from "../lib/esc.js";
import { moonPhase } from "../scene/moon.js";
import { tonight } from "../scene/planets.js";
import { SHOWERS } from "../scene/meteors.js";

// 📰 今日地球:每天第一次打開網站時跳出一張「今天的地球」——今天最大的地震、颱風、全球最熱最冷的首都、
// 今晚的天象、今天是哪國的節日、歷史上的今天。每一項點下去就飛過去或打開對應的功能。
// 資料都是網站原本就在用的來源(USGS、日本氣象廳、Open-Meteo、維基百科、國家大百科),不需要新的金鑰。
// 「每天自動顯示」可以關掉(記在這台瀏覽器)。
const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const JMA = "https://www.jma.go.jp/bosai/typhoon/data/";
const OTD = "https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events";
const AUTO_KEY = "earth-world.today.auto";
const SEEN_KEY = "earth-world.today.seen";
const DIRS = ["北方", "東北方", "東方", "東南方", "南方", "西南方", "西方", "西北方"];
const TC_CAT = { TY: "颱風", STS: "強烈熱帶風暴", TS: "熱帶風暴", TD: "熱帶性低氣壓", LOW: "低氣壓" };
const ORDER = ["quake", "typhoon", "temp", "sky", "fest", "otd"];

const twParts = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" })
  .formatToParts(d).map((p) => [p.type, p.value]));
export const todayKey = () => { const p = twParts(); return `${p.year}-${p.month}-${p.day}`; };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} 分鐘前` : `${Math.round(m / 60)} 小時前`; };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function createToday({ rig, tempRank, nameOf, codeAt, openCountryByCode, turnOn, onClose }) {
  const panel = document.getElementById("today-panel");
  const body = document.getElementById("today-body");
  const noop = { setEnabled() {}, isEnabled: () => false, shouldAutoShow: () => false };
  if (!panel || !body) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("today-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("today-min");
  function setMin(on) {
    panel.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  let enabled = false, loadedDay = null;
  const items = {};   // key → { icon, title, text, act } 或 null(沒有這一項)
  const pending = new Set();
  const auto = () => { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch { return true; } };

  // ---------- 各項資料 ----------
  async function quake() {
    const j = await fetch(USGS).then((r) => r.json());
    const fs = (j.features || []).filter((f) => f.properties?.mag != null);
    if (!fs.length) return null;
    const f = fs.reduce((a, b) => (b.properties.mag > a.properties.mag ? b : a));
    const [lon, lat] = f.geometry.coordinates;
    // 地點:先看震央落在哪一國;在海上就從 USGS 英文地名的最後一段對照國名(對不到就照原文)
    const code = codeAt?.(lat, lon);
    const place = (f.properties.place || "").replace(/^.*\bof\s+/i, "");
    const tail = place.split(",").pop().trim().replace(/\s+region$/i, "").toLowerCase();
    const feat = window.__earth?.geojson?.features?.find((x) => x.properties?.NAME_EN?.toLowerCase() === tail);
    const zh = code ? nameOf(code) : feat?.properties?.NAME_ZHT ? `${feat.properties.NAME_ZHT}附近海域` : null;
    const where = zh || `${place || "海上"} 一帶`;
    return {
      icon: "📳", title: `今天最大的地震:規模 ${f.properties.mag.toFixed(1)}`,
      text: `${where} · ${ago(f.properties.time)}。過去 24 小時全球有 ${fs.length} 次規模 4.5 以上的地震。`,
      act: `quake:${lat},${lon}`,
    };
  }
  async function typhoon() {
    const list = await fetch(JMA + "targetTc.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : []));
    if (!list?.length) return { icon: "🌀", title: "西北太平洋目前沒有颱風", text: "風平浪靜。想看全球的風怎麼吹,打開「🌬️ 全球風場」。", act: "open:wind-toggle" };
    const out = [];
    for (const tc of list.slice(0, 3)) {
      try {
        const sp = await fetch(`${JMA}${tc.tropicalCyclone}/specifications.json`, { cache: "no-cache" }).then((r) => r.json());
        const title = sp.find((p) => p.part === "title") || {};
        const now = sp.find((p) => p.advancedHours === 0) || sp[1] || {};
        const cat = TC_CAT[now.category?.en] || "熱帶氣旋";
        const name = title.name?.en ? title.name.en.charAt(0) + title.name.en.slice(1).toLowerCase() : "";
        out.push({ label: `${cat}${name ? ` ${name}` : ""}`, center: now.position?.deg, wind: now.maximumWind?.sustained?.["m/s"] });
      } catch { /* 單一個讀不到就略過 */ }
    }
    if (!out.length) return null;
    const c = out[0].center;
    return {
      icon: "🌀", title: `西北太平洋有 ${list.length} 個熱帶氣旋`,
      text: out.map((x) => `${x.label}${x.wind ? `(最大風速 ${x.wind} m/s)` : ""}`).join("、") + "。點一下看路徑。",
      act: c ? `typhoon:${c[0]},${c[1]}` : "open:typhoon-toggle",
    };
  }
  async function temp() {
    const rows = (await tempRank.getRows()).filter((r) => typeof r.now === "number");
    if (!rows.length) return null;
    const hot = rows.reduce((a, b) => (b.now > a.now ? b : a));
    const cold = rows.reduce((a, b) => (b.now < a.now ? b : a));
    const tw = rows.find((r) => r.code === "TW");
    return {
      icon: "🌡️", title: `全球首都此刻最熱 ${hot.now.toFixed(0)}°C、最冷 ${cold.now.toFixed(0)}°C`,
      text: `最熱是${nameOf(hot.code)}的${hot.cap},最冷是${nameOf(cold.code)}的${cold.cap}${tw ? `;台北現在 ${tw.now.toFixed(0)}°C` : ""}。`,
      act: "open:temp-toggle",
    };
  }
  function sky() {
    const now = new Date();
    const ph = moonPhase(now, { quick: true });
    const pl = tonight(now).filter((p) => p.best).map((p) => `${p.zh}(${DIRS[Math.round(p.best.az / 45) % 8]})`);
    const p = twParts(now), md = Number(p.month) * 100 + Number(p.day);
    const sh = SHOWERS.find((s) => { const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1]; return a <= b ? md >= a && md <= b : md >= a || md <= b; });
    const peak = sh && sh.night[0] * 100 + sh.night[1] === md;
    return {
      icon: ph.emoji || "🌙", title: `今晚是${ph.name},月亮照亮 ${Math.round(ph.illum * 100)}%`,
      text: (pl.length ? `從台灣看得到${pl.join("、")}。` : "今晚五大行星都不太好看。") +
        (sh ? (peak ? `今晚是${sh.zh}的極大期!` : `現在是${sh.zh}的活動期間(極大期 ${sh.night[0]}/${sh.night[1]})。`) : ""),
      act: pl.length ? "open:planet-toggle" : "open:moon-toggle",
    };
  }
  async function fest() {
    const cal = await fetch("data/calendar.json").then((r) => (r.ok ? r.json() : {}));
    const p = twParts();
    const list = cal[`${p.month}-${p.day}`] || [];
    if (!list.length) return null;
    const [code, zh, note] = list[0];
    return {
      icon: "🎉", title: `今天是${nameOf(code)}的「${zh}」`,
      text: note + (list.length > 1 ? ` 另外還有${list.slice(1, 3).map(([c, z]) => `${nameOf(c)}的${z}`).join("、")}。` : ""),
      act: `country:${code}`,
    };
  }
  async function otd() {
    const p = twParts();
    const j = await fetch(`${OTD}/${p.month}/${p.day}`, { headers: { "Accept-Language": "zh-TW" } }).then((r) => r.json());
    const ev = (j.events || []).filter((e) => e.year && e.text);
    if (!ev.length) return null;
    const tw = ev.filter((e) => /臺灣|台灣|中華民國/.test(e.text));
    const pool = tw.length ? tw : ev.filter((e) => e.year >= 1900);
    const e = (pool.length ? pool : ev)[Math.floor(Math.random() * (pool.length || ev.length))];
    return { icon: "📜", title: `歷史上的今天:${e.year} 年`, text: cut(e.text, 70), act: "open:otd-toggle" };
  }
  const SOURCES = { quake, typhoon, temp, sky, fest, otd };

  function load() {
    loadedDay = todayKey();
    for (const k of ORDER) {
      pending.add(k);
      Promise.resolve().then(SOURCES[k]).then((v) => { items[k] = v; }).catch((e) => { console.warn("[today]", k, e?.message); items[k] = null; })
        .finally(() => { pending.delete(k); if (enabled) render(); });
    }
  }

  // ---------- 畫面 ----------
  function render() {
    const d = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric", weekday: "long" }).format(new Date());
    const rows = ORDER.map((k) => {
      if (pending.has(k)) return `<div class="td-item td-wait"><span class="td-ico">⏳</span><div><b>讀取中…</b></div></div>`;
      const it = items[k];
      if (!it) return "";
      return `<button type="button" class="td-item" data-act="${esc(it.act)}"><span class="td-ico">${it.icon}</span>` +
        `<div><b>${esc(it.title)}</b><small>${esc(it.text)}</small></div><span class="td-go">›</span></button>`;
    }).join("");
    body.innerHTML = `<div class="td-date">${esc(d)}</div>${rows}` +
      `<label class="td-auto"><input type="checkbox"${auto() ? " checked" : ""}> 每天第一次打開網站時自動顯示</label>` +
      `<div class="sat-caption">地震:USGS;颱風:日本氣象廳;氣溫:Open-Meteo;天象:本站計算;節日:國家大百科;歷史:維基百科。</div>`;
  }
  body.addEventListener("change", (e) => {
    if (e.target.matches(".td-auto input")) { try { localStorage.setItem(AUTO_KEY, e.target.checked ? "on" : "off"); } catch { /* 存不了就算了 */ } }
  });
  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const [kind, arg] = b.dataset.act.split(":");
    if (window.innerWidth <= 640) setMin(true);
    if (kind === "open") turnOn(arg);
    else if (kind === "country") openCountryByCode(arg);
    else {
      const [lat, lon] = arg.split(",").map(Number);
      if (kind === "quake") turnOn("quake-toggle");
      if (kind === "typhoon") turnOn("typhoon-toggle");
      rig.flyTo(lat, lon, { distance: 2.2, ms: 1600 });
    }
  });

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (!enabled) return;
    try { localStorage.setItem(SEEN_KEY, todayKey()); } catch { /* 存不了就算了 */ }
    setMin(false);
    if (loadedDay !== todayKey()) load();
    render();
  }
  // 今天還沒看過、而且沒有關掉自動顯示
  function shouldAutoShow() {
    if (!auto()) return false;
    try { return localStorage.getItem(SEEN_KEY) !== todayKey(); } catch { return false; }
  }
  return { setEnabled, isEnabled: () => enabled, shouldAutoShow };
}
