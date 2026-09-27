import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// ⚖️ 國家比較:挑兩個國家(預設左邊是台灣)並排比較首都、人口、面積、密度、語言、貨幣、
// 時差、旅遊警示、最佳旅遊月份、緊急電話、小費習慣,以及兩國首都距離與飛行時間。
// 選國家:搜尋框(中英文)、熱門快選、或「從地球點選」(面板縮成一條把地球讓出來);預設填進右欄。
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

  let showMore = false, picking = false, query = "";
  const QUICK = ["JP", "KR", "US", "TH", "SG", "GB", "FR", "AU"];   // 台灣讀者最常比的

  function slotHtml(which, code) {
    const on = nextSlot === which;
    return `<button type="button" class="cmp-slot${on ? " next" : ""}" data-slot="${which}" title="${on ? "搜尋或點選的國家會填進這一格" : "點一下,改填這一格"}">` +
      (code ? `${flag(code)}<b>${esc(nameOf(code))}</b><span class="cmp-x" data-clear="${which}" title="清除">✕</span>` : `<span class="cmp-empty-slot">${on ? "👈 選一個國家" : "(空)"}</span>`) +
      `</button>`;
  }

  function suggestions() {
    const q = query.trim().toLowerCase();
    if (!q) return "";
    const list = [];
    for (const [code, w] of cl()?.meshByCode || []) {
      if (!regions?.[code]) continue;
      const n = w.userData?.names || {};
      if ((n.zh || "").includes(query.trim()) || (n.en || "").toLowerCase().includes(q)) list.push(code);
      if (list.length >= 6) break;
    }
    return list.length
      ? `<div class="cmp-sug">${list.map((c) => `<button type="button" data-pick="${c}">${flag(c)}${esc(nameOf(c))}</button>`).join("")}</div>`
      : `<div class="cmp-sug cmp-sug-empty">找不到「${esc(query.trim())}」</div>`;
  }

  async function render() {
    if (picking) {
      // 從地球點選:面板縮成一條,把地球讓出來
      body.innerHTML = `<div class="cmp-picking">👉 點地球上的國家,填進${nextSlot === "a" ? "左" : "右"}邊 <button type="button" class="tc-btn" data-act="cancel-pick">取消</button></div>`;
      panel.classList.add("picking");
      return;
    }
    panel.classList.remove("picking");
    const [da, db] = await Promise.all([loadDeep(a), loadDeep(b)]);
    if (!enabled || picking) return;
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
    const hours = km != null ? km / CRUISE_KMH + 0.5 : 0;
    const keep = body.scrollTop;
    body.innerHTML =
      `<div class="cmp-pick">${slotHtml("a", a)}<button type="button" class="tc-btn cmp-swap" data-act="swap" title="左右交換">⇄</button>${slotHtml("b", b)}</div>` +
      `<div class="cmp-search"><input type="search" placeholder="🔎 輸入國家名稱(中/英),填進發光的那一格" value="${esc(query)}" aria-label="搜尋要比較的國家">` +
      `<button type="button" class="tc-btn cmp-globe" data-act="pick-globe" title="面板縮小,直接點地球上的國家">🌍 從地球點選</button></div>` +
      suggestions() +
      `<div class="cmp-quick">${QUICK.filter((c) => c !== a && c !== b).map((c) => `<button type="button" data-pick="${c}">${flag(c)}${esc(nameOf(c))}</button>`).join("")}</div>` +
      (km != null ? `<div class="cmp-dist">✈️ 首都相距 <b>${Math.round(km).toLocaleString("en-US")}</b> 公里 · 直飛約 <b>${Math.floor(hours)} 小時 ${Math.round((hours % 1) * 60)} 分</b></div>` : "") +
      (A || B
        ? `<table class="cmp-table"><thead><tr><th></th><th>${A ? esc(A.name) : "—"}</th><th>${B ? esc(B.name) : "—"}</th></tr></thead><tbody>` +
          txt("🏛️ 首都", "cap") +
          row("👥 人口", "pop", fmtPop, Math.max) +
          row("🗺️ 面積", "area", fmtArea, Math.max) +
          txt("🕐 現在時間", "time") + raw("⚠️ 旅遊警示", "alert") + txt("💰 貨幣", "cur") + txt("🗣️ 語言", "lang") +
          (showMore
            ? row("🏘️ 人口密度", "dens", (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString("en-US")} 人/km²` : "—"), Math.max) +
              txt("🌸 最佳旅遊月份", "months") + raw("🆘 緊急電話", "em") + txt("💁 小費", "tip") + txt("🙏 宗教", "rel") + txt("⚖️ 政體", "gov")
            : "") +
          `</tbody></table>` +
          `<button type="button" class="cmp-more" data-act="more">${showMore ? "收起 ▴" : "顯示更多項目(人口密度、旅遊月份、緊急電話、小費…)▾"}</button>`
        : "") +
      `<div class="quiz-actions cmp-actions">${a ? `<button type="button" class="tc-btn" data-open="${a}">📖 看${esc(nameOf(a))}</button>` : ""}` +
      `${b ? `<button type="button" class="tc-btn" data-open="${b}">📖 看${esc(nameOf(b))}</button>` : ""}</div>` +
      (showMore ? `<div class="sat-caption">🚓 報警 · 🚒 消防 · 🚑 救護;人口、面積等為概略數字,僅供參考</div>` : "");
    body.scrollTop = keep;
  }

  function fill(code) {
    if (!code || !regions?.[code]) return;
    // 左邊通常是台灣:預設一直換右邊的國家;要換左邊先點一下左邊那格
    if (nextSlot === "a") { a = code; nextSlot = "b"; } else { b = code; }
    query = "";
    render();
  }

  body.addEventListener("input", (e) => {
    if (!e.target.matches(".cmp-search input")) return;
    query = e.target.value;
    const old = body.querySelector(".cmp-sug");
    const html = suggestions();
    if (old) old.outerHTML = html || "";
    else if (html) body.querySelector(".cmp-search").insertAdjacentHTML("afterend", html);
  });
  body.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".cmp-search input")) body.querySelector(".cmp-sug [data-pick]")?.click();
  });
  body.addEventListener("click", (e) => {
    const clr = e.target.closest("[data-clear]");
    if (clr) { if (clr.dataset.clear === "a") a = null; else b = null; nextSlot = clr.dataset.clear; render(); return; }
    const slot = e.target.closest("[data-slot]");
    if (slot) { nextSlot = slot.dataset.slot; render(); body.querySelector(".cmp-search input")?.focus(); return; }
    const p = e.target.closest("[data-pick]");
    if (p) { fill(p.dataset.pick); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "swap") { [a, b] = [b, a]; render(); return; }
    if (act === "more") { showMore = !showMore; render(); return; }
    if (act === "pick-globe") { picking = true; render(); return; }
    if (act === "cancel-pick") { picking = false; render(); return; }
    const o = e.target.closest("[data-open]");
    if (o) openCountryByCode(o.dataset.open);
  });
  document.getElementById("compare-close")?.addEventListener("click", () => onClose && onClose());

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    picking = false;
    panel.classList.remove("picking");
    if (!enabled) return;
    body.innerHTML = `<div class="ap-empty">準備比較資料中…</div>`;
    if (!regions) regions = await fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    if (!emergency) emergency = await fetch("data/emergency.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (enabled) render();
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    // 電腦:面板開著時點地球就直接填入;手機:按「從地球點選」後才算(不然面板蓋住地球也點不到)
    isPicking: () => enabled && (picking || window.innerWidth > 640),
    pick(code) {
      if (!code || !regions?.[code]) return;
      picking = false;
      fill(code);
    },
  };
}
