import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// 🛂 旅行護照集章:讀者每打開一個國家(點地球、點地名、搜尋、開大百科)就蓋一個章,
// 記在這台瀏覽器(localStorage)。護照裡看得到各洲進度、成就徽章、所有印章;
// 護照打開時,地球上去過的國家會塗成金色,一眼看出自己的「足跡地圖」。
const KEY = "earth-world.passport";
const REGIONS = [
  { key: "AS", label: "🐼 亞洲", color: "#e5484d" },
  { key: "ME", label: "🐪 中東", color: "#f5a524" },
  { key: "EU", label: "🏰 歐洲", color: "#3e8ef7" },
  { key: "NA", label: "🗽 北美", color: "#8e4ec6" },
  { key: "LA", label: "🌮 中南美", color: "#2fb47c" },
  { key: "AF", label: "🦁 非洲", color: "#d4a017" },
  { key: "OC", label: "🦘 大洋洲", color: "#12a5b8" },
];
const COLOR = Object.fromEntries(REGIONS.map((r) => [r.key, r.color]));
const BADGES = [
  { id: "first", icon: "🌱", name: "出發!", need: "蓋第 1 個章", test: (s) => s.n >= 1 },
  { id: "n10", icon: "🧳", name: "背包客", need: "走訪 10 國", test: (s) => s.n >= 10 },
  { id: "n30", icon: "✈️", name: "空中飛人", need: "走訪 30 國", test: (s) => s.n >= 30 },
  { id: "regions", icon: "🗺️", name: "七大區都去過", need: "每一區至少 1 國", test: (s) => REGIONS.every((r) => s.byRegion[r.key] > 0) },
  { id: "n100", icon: "🌍", name: "百國護照", need: "走訪 100 國", test: (s) => s.n >= 100 },
  { id: "region-all", icon: "🏅", name: "一洲制霸", need: "蓋滿任一區", test: (s) => REGIONS.some((r) => s.totals[r.key] && s.byRegion[r.key] >= s.totals[r.key]) },
  { id: "all", icon: "👑", name: "世界公民", need: "蓋滿全部國家", test: (s) => s.total > 0 && s.n >= s.total },
];

// 同一國每次畫出來的傾斜角度都一樣(看起來像真的蓋歪的章,但不會每次重畫就亂跳)
const tilt = (code) => { let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((Math.abs(h) % 15) - 7); };
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const flagImg = (code, cls) => (/^[A-Z]{2}$/.test(code) ? `<img class="${cls}" src="https://flagcdn.com/w80/${code.toLowerCase()}.png" alt="" onerror="this.remove()">` : "");

export function createPassport({ globeObject, openCountryByCode, onClose }) {
  const panel = document.getElementById("passport-panel");
  const body = document.getElementById("passport-body");
  const noop = { stamp() {}, setEnabled() {}, isEnabled: () => false };
  if (!panel || !body) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let stamps = {};
  try { stamps = JSON.parse(localStorage.getItem(KEY) || "{}").stamps || {}; } catch { stamps = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, stamps })); } catch { /* 存不了就算了 */ } };

  let regions = null;
  const regionsReady = fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => { regions = d; });

  const cl = () => window.__earth?.countryLayer;
  const nameOf = (code) => cl()?.meshByCode.get(code)?.userData?.names?.zh || code;
  // 分母:地圖上有的國家/地區(有分區資料的才算,南極洲之類的不算)
  function stats() {
    const totals = {}, byRegion = {};
    let total = 0;
    for (const [code, r] of Object.entries(regions || {})) {
      if (!cl()?.meshByCode.has(code)) continue;
      totals[r] = (totals[r] || 0) + 1; total++;
    }
    let n = 0;
    for (const code of Object.keys(stamps)) {
      const r = regions?.[code];
      if (!r || !cl()?.meshByCode.has(code)) continue;
      byRegion[r] = (byRegion[r] || 0) + 1; n++;
    }
    return { n, total, totals, byRegion };
  }

  // ---------- 地球上的足跡(去過的國家塗金色) ----------
  const footGroup = new THREE.Group();
  footGroup.visible = false;
  globeObject.add(footGroup);
  const footMat = new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const footMeshes = new Map();
  function syncFootprints() {
    const layer = cl();
    if (!layer) return;
    for (const code of Object.keys(stamps)) {
      if (footMeshes.has(code)) continue;
      const src = layer.meshByCode.get(code)?.children[0];
      if (!src) continue;
      const m = new THREE.Mesh(src.geometry, footMat);   // 共用國家的幾何,不另外佔記憶體
      m.raycast = () => {};                              // 不影響點選
      m.renderOrder = 1;
      footGroup.add(m); footMeshes.set(code, m);
    }
    for (const [code, m] of footMeshes) if (!stamps[code]) { footGroup.remove(m); footMeshes.delete(code); }
  }

  // ---------- 蓋章 ----------
  let toastEl = null, toastTimer = null;
  function stampToast(code, n) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "passport-toast";
      document.body.appendChild(toastEl);
    }
    const r = regions?.[code];
    toastEl.style.setProperty("--pp-c", COLOR[r] || "#ffc94d");
    toastEl.innerHTML = `<div class="ppt-stamp">${flagImg(code, "ppt-flag")}<b>${esc(nameOf(code))}</b><small>${fmtDate(Date.now())}</small></div>` +
      `<div class="ppt-text">🛂 蓋章!護照第 <b>${n}</b> 國</div>`;
    toastEl.classList.remove("show"); void toastEl.offsetWidth; toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function stamp(code) {
    if (!code) return;
    await regionsReady;
    if (!regions?.[code]) return;          // 沒有分區資料的(南極洲等)不蓋章
    const now = Date.now();
    const had = stamps[code];
    if (had) { had.c = (had.c || 1) + 1; had.l = now; save(); if (enabled) render(); return; }
    const before = stats();
    stamps[code] = { t: now, l: now, c: 1 };
    save();
    const after = stats();
    stampToast(code, after.n);
    // 剛解鎖的徽章另外提醒
    const unlocked = BADGES.filter((b) => !b.test(before) && b.test(after));
    if (unlocked.length) setTimeout(() => badgeToast(unlocked[0]), 2700);
    if (enabled) { syncFootprints(); render(); }
  }
  function toast(msg) {
    const el = document.getElementById("share-toast") || Object.assign(document.createElement("div"), { id: "share-toast" });
    if (!el.parentNode) document.body.appendChild(el);
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2800);
  }
  const badgeToast = (b) => toast(`${b.icon} 解鎖成就「${b.name}」!`);

  // ---------- 護照面板 ----------
  function render() {
    const s = stats();
    const pct = s.total ? Math.round((s.n / s.total) * 100) : 0;
    const list = Object.entries(stamps)
      .filter(([code]) => regions?.[code] && cl()?.meshByCode.has(code))
      .sort((a, b) => b[1].t - a[1].t);
    const earned = BADGES.filter((b) => b.test(s)).length;
    body.innerHTML =
      `<div class="pp-cover"><div class="pp-count"><b>${s.n}</b> <small>/ ${s.total} 個國家與地區</small></div>` +
      `<div class="pp-bar"><i style="width:${pct}%"></i></div><div class="pp-sub">走訪了全世界的 ${pct}%` +
      (list[0] ? ` · 最新印章:${esc(nameOf(list[0][0]))}` : "") + `</div></div>` +
      `<div class="pp-h">🌏 各區進度</div><div class="pp-regions">` +
      REGIONS.map((r) => {
        const got = s.byRegion[r.key] || 0, tot = s.totals[r.key] || 0;
        const full = tot && got >= tot;
        return `<div class="pp-region"><span>${r.label}</span><div class="pp-bar sm"><i style="width:${tot ? (got / tot) * 100 : 0}%;background:${r.color}"></i></div><span class="pp-num">${full ? "👑 " : ""}${got}/${tot}</span></div>`;
      }).join("") + `</div>` +
      `<div class="pp-h">🏅 成就 <small>${earned}/${BADGES.length}</small></div><div class="pp-badges">` +
      BADGES.map((b) => `<span class="pp-badge${b.test(s) ? " on" : ""}" title="${esc(b.need)}">${b.icon} ${esc(b.name)}${b.test(s) ? "" : `<small>${esc(b.need)}</small>`}</span>`).join("") + `</div>` +
      `<div class="pp-h">📮 我的印章 <small>點印章飛過去</small></div>` +
      (list.length
        ? `<div class="pp-stamps">${list.map(([code, v]) => `<button type="button" class="pp-stamp" data-code="${esc(code)}" style="--pp-c:${COLOR[regions[code]] || "#ffc94d"};--pp-r:${tilt(code)}deg" title="第一次:${fmtDate(v.t)} · 看過 ${v.c || 1} 次">` +
            `${flagImg(code, "pp-flag")}<b>${esc(nameOf(code))}</b><small>${fmtDate(v.t)}</small></button>`).join("")}</div>`
        : `<div class="pp-empty">護照還是空的!<br>點地球上任何一個國家、或用上方搜尋,就會蓋下第一個章 🛂</div>`) +
      `<div class="quiz-actions pp-actions"><button type="button" class="tc-btn" data-act="share">📣 分享我的護照</button>` +
      (list.length ? `<button type="button" class="tc-btn" data-act="reset">🗑️ 重新開始</button>` : "") + `</div>`;
  }

  body.addEventListener("click", async (e) => {
    const st = e.target.closest("[data-code]");
    if (st) { openCountryByCode(st.dataset.code); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "reset") {
      if (!window.confirm("確定要清空護照、從頭開始蓋章嗎?(無法復原)")) return;
      stamps = {}; save(); syncFootprints(); render();
    } else if (a.dataset.act === "share") {
      const s = stats();
      const text = `我的「地球世界」旅行護照已經蓋了 ${s.n} 國(全世界的 ${s.total ? Math.round((s.n / s.total) * 100) : 0}%)!🛂 你去過幾國?`;
      const url = location.origin + location.pathname + "?on=passport";
      if (navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
        try { await navigator.share({ title: "地球世界 · 旅行護照", text, url }); return; } catch { /* 取消就改複製 */ }
      }
      try { await navigator.clipboard.writeText(`${text} ${url}`); toast("📣 已複製,貼給朋友看看吧!"); }
      catch { window.prompt("複製分享:", `${text} ${url}`); }
    }
  });
  document.getElementById("passport-close")?.addEventListener("click", () => onClose && onClose());

  let enabled = false;
  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    footGroup.visible = enabled;
    if (!enabled) return;
    body.innerHTML = `<div class="ap-empty">翻開護照中…</div>`;
    await regionsReady;
    if (!enabled) return;
    syncFootprints(); render();
  }

  return { stamp, setEnabled, isEnabled: () => enabled };
}
