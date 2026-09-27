import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// ⚖️ 國家比較:挑兩個國家(預設左邊是台灣)並排比較首都、人口、面積、密度、語言、貨幣、
// 時差、旅遊警示、最佳旅遊月份、緊急電話、小費習慣,以及兩國首都距離與飛行時間。
// 可以從清單挑,也可以直接點地球上的國家(預設填進右欄;點一下左欄就改填左欄)。
const REGIONS = [["AS", "🐼 亞洲"], ["ME", "🐪 中東"], ["EU", "🏰 歐洲"], ["NA", "🗽 北美"], ["LA", "🌮 中南美"], ["AF", "🦁 非洲"], ["OC", "🦘 大洋洲"]];
const EARTH_KM = 6371, CRUISE_KMH = 870;

const flag = (c) => (/^[A-Z]{2}$/.test(c) ? `<img class="cmp-flag" src="https://flagcdn.com/w80/${c.toLowerCase()}.png" alt="" onerror="this.remove()">` : "");
function fmtPop(v) {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e8) return `${(v / 1e8).toFixed(v >= 1e9 ? 1 : 2)} 億`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString("en-US")} 萬`;
  return `${Math.round(v).toLocaleString("en-US")}`;
}
const fmtArea = (v) => (Number.isFinite(v) ? (v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("en-US")} 萬 km²` : `${Math.round(v).toLocaleString("en-US")} km²`) : "—");
function tzOffsetMin(tz, date = new Date()) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(date);
    const g = (t) => Number(p.find((x) => x.type === t)?.value);
    return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - date.getTime()) / 60000);
  } catch { return null; }
}
const localTime = (tz) => { try { return new Intl.DateTimeFormat("zh-TW", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); } catch { return "—"; } };

export function createCompare({ openCountryByCode, onClose }) {
  const panel = document.getElementById("compare-panel");
  const body = document.getElementById("compare-body");
  const noop = { setEnabled() {}, isEnabled: () => false, isPicking: () => false, pick() {} };
  if (!panel || !body) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, a = "TW", b = null, nextSlot = "b";
  let regions = null, emergency = null;
  const deep = new Map();

  const cl = () => window.__earth?.countryLayer;
  const content = () => window.__earth?.content || {};
  const nameOf = (c) => cl()?.meshByCode.get(c)?.userData?.names?.zh || c;
  const popOf = (c) => {
    const p = content()[c]?.population;
    if (Number.isFinite(p)) return p;
    const f = cl()?.meshByCode.get(c)?.userData?.feature;
    return Number.isFinite(f?.properties?.POP_EST) ? f.properties.POP_EST : NaN;
  };
  async function loadDeep(c) {
    if (!c || deep.has(c)) return deep.get(c);
    const d = await fetch(`data/deep/${c}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    deep.set(c, d);
    return d;
  }

  function options(sel) {
    const coll = (() => { try { return new Intl.Collator("zh-TW-u-co-zhuyin"); } catch { return new Intl.Collator("zh-TW"); } })();
    const codes = [...(cl()?.meshByCode.keys() || [])].filter((c) => regions?.[c]);
    return `<option value="">— 選一個國家 —</option>` + REGIONS.map(([rk, rl]) => {
      const cs = codes.filter((c) => regions[c] === rk).sort((x, y) => coll.compare(nameOf(x), nameOf(y)));
      return cs.length ? `<optgroup label="${rl}">${cs.map((c) => `<option value="${c}"${c === sel ? " selected" : ""}>${esc(nameOf(c))}</option>`).join("")}</optgroup>` : "";
    }).join("");
  }

  function distanceKm(c1, c2) {
    const p1 = content()[c1]?.capital_latlon, p2 = content()[c2]?.capital_latlon;
    if (!Array.isArray(p1) || !Array.isArray(p2)) return null;
    const r = Math.PI / 180;
    const [la1, lo1] = p1.map((x) => x * r), [la2, lo2] = p2.map((x) => x * r);
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function column(c, d) {
    if (!c) return null;
    const ct = content()[c] || {};
    const qf = d?.quick_facts || {};
    const pop = popOf(c), area = Number(qf.area_km2);
    const tz = ct.timezone;
    const off = tz ? tzOffsetMin(tz) : null, twOff = tzOffsetMin("Asia/Taipei");
    const diff = off == null ? null : (off - twOff) / 60;
    const alert = (window.__earth?.travelAlert || {})[c];
    const em = emergency?.em?.[c];
    const months = [...(ct.travel_months?.best || [])].sort((x, y) => x - y);
    return {
      name: nameOf(c), cap: (ct.capital_zh || "—").split("(")[0],
      pop, area, dens: Number.isFinite(pop) && area > 0 ? pop / area : NaN,
      lang: qf.languages || "—", rel: qf.religion || "—", cur: qf.currency || "—", gov: qf.government || "—",
      time: tz ? `${localTime(tz)}(${diff === 0 ? "跟台灣一樣" : diff > 0 ? `比台灣快 ${diff} 小時` : `比台灣慢 ${-diff} 小時`})` : "—",
      alert: alert ? `<span class="cmp-dot" style="background:${esc(alert.color)}"></span>${esc(alert.label.split("：")[0])}` : (c === "TW" ? "—(本國)" : "未列警示"),
      months: months.length ? months.map((m) => `${m}月`).join("、") : "—",
      em: Array.isArray(em) ? `🚓 ${esc(em[0] || "—")} · 🚒 ${esc(em[1] || "—")} · 🚑 ${esc(em[2] || "—")}` : "—",
      tip: d?.practical_info?.tipping || "—",
    };
  }

  async function render() {
    const [da, db] = await Promise.all([loadDeep(a), loadDeep(b)]);
    if (!enabled) return;
    const A = column(a, da), B = column(b, db);
    const km = a && b ? distanceKm(a, b) : null;
    const cell = (x, key, fmt, better) => {
      if (!x) return `<td class="cmp-empty">—</td>`;
      const v = x[key];
      const win = better && A && B && Number.isFinite(A[key]) && Number.isFinite(B[key]) && x[key] === better(A[key], B[key]) && A[key] !== B[key];
      return `<td class="${win ? "cmp-win" : ""}">${fmt ? fmt(v) : v}</td>`;
    };
    const row = (label, key, fmt, better) => `<tr><th>${label}</th>${cell(A, key, fmt, better)}${cell(B, key, fmt, better)}</tr>`;
    const txt = (label, key) => `<tr><th>${label}</th><td>${A ? esc(A[key]) : "—"}</td><td>${B ? esc(B[key]) : "—"}</td></tr>`;
    const raw = (label, key) => `<tr><th>${label}</th><td>${A ? A[key] : "—"}</td><td>${B ? B[key] : "—"}</td></tr>`;
    body.innerHTML =
      `<div class="cmp-pick">` +
      `<div class="cmp-slot${nextSlot === "a" ? " next" : ""}" data-slot="a">${a ? flag(a) : "❓"}<select data-sel="a">${options(a)}</select></div>` +
      `<button type="button" class="tc-btn cmp-swap" data-act="swap" title="左右交換">⇄</button>` +
      `<div class="cmp-slot${nextSlot === "b" ? " next" : ""}" data-slot="b">${b ? flag(b) : "❓"}<select data-sel="b">${options(b)}</select></div></div>` +
      `<div class="cmp-hint">👉 也可以<b>直接點地球上的國家</b>,會填進${nextSlot === "a" ? "左" : "右"}邊(發光的那一格)</div>` +
      (km != null ? `<div class="cmp-dist">✈️ 首都相距 <b>${Math.round(km).toLocaleString("en-US")}</b> 公里 · 直飛約 <b>${Math.floor(km / CRUISE_KMH + 0.5)} 小時 ${Math.round(((km / CRUISE_KMH + 0.5) % 1) * 60)} 分</b></div>` : "") +
      `<table class="cmp-table"><thead><tr><th></th><th>${A ? esc(A.name) : "—"}</th><th>${B ? esc(B.name) : "—"}</th></tr></thead><tbody>` +
      txt("🏛️ 首都", "cap") +
      row("👥 人口", "pop", fmtPop, Math.max) +
      row("🗺️ 面積", "area", fmtArea, Math.max) +
      row("🏘️ 人口密度", "dens", (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString("en-US")} 人/km²` : "—"), Math.max) +
      txt("🗣️ 語言", "lang") + txt("🙏 宗教", "rel") + txt("💰 貨幣", "cur") + txt("⚖️ 政體", "gov") +
      txt("🕐 現在時間", "time") + raw("⚠️ 旅遊警示", "alert") + txt("🌸 最佳旅遊月份", "months") +
      raw("🆘 緊急電話", "em") + txt("💁 小費", "tip") +
      `</tbody></table>` +
      `<div class="quiz-actions cmp-actions">${a ? `<button type="button" class="tc-btn" data-open="${a}">📖 看${esc(nameOf(a))}</button>` : ""}` +
      `${b ? `<button type="button" class="tc-btn" data-open="${b}">📖 看${esc(nameOf(b))}</button>` : ""}</div>` +
      `<div class="sat-caption">🚓 報警 · 🚒 消防 · 🚑 救護;人口、面積等為概略數字,僅供參考</div>`;
  }

  body.addEventListener("change", (e) => {
    const s = e.target.closest("[data-sel]");
    if (!s) return;
    if (s.dataset.sel === "a") { a = s.value || null; nextSlot = "b"; } else { b = s.value || null; }
    render();
  });
  body.addEventListener("click", (e) => {
    const slot = e.target.closest("[data-slot]");
    if (slot && e.target.tagName !== "SELECT" && e.target.tagName !== "OPTION") { nextSlot = slot.dataset.slot; render(); return; }
    if (e.target.closest("[data-act='swap']")) { [a, b] = [b, a]; render(); return; }
    const o = e.target.closest("[data-open]");
    if (o) openCountryByCode(o.dataset.open);
  });
  document.getElementById("compare-close")?.addEventListener("click", () => onClose && onClose());

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (!enabled) return;
    body.innerHTML = `<div class="ap-empty">準備比較資料中…</div>`;
    if (!regions) regions = await fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    if (!emergency) emergency = await fetch("data/emergency.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (enabled) render();
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    isPicking: () => enabled,
    pick(code) {
      if (!code || !regions?.[code]) return;
      // 左邊通常是台灣:點地球預設一直換右邊的國家;要換左邊先點一下左邊那格
      if (nextSlot === "a") { a = code; nextSlot = "b"; } else { b = code; }
      render();
    },
  };
}
