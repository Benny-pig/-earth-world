import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// 🛂 旅行護照集章:記錄讀者「真的去過」的國家。只有讀者自己標記才蓋章——
// 在國家介紹按「🛂 我去過這裡」、在護照裡從清單新增,或打開「點地球蓋章」模式一次點好幾國;
// 單純點開國家看介紹不會蓋章。每個章都可以單獨刪除。資料只存在這台瀏覽器(localStorage)。
// 護照打開時,地球上去過的國家會塗成金色,一眼看出自己的「足跡地圖」。
const KEY = "earth-world.passport";
const VERSION = 2;   // v1 是「點開國家就自動蓋章」的舊版,那些章不代表真的去過,不沿用
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
  { id: "n10", icon: "🧳", name: "背包客", need: "去過 10 國", test: (s) => s.n >= 10 },
  { id: "n30", icon: "✈️", name: "空中飛人", need: "去過 30 國", test: (s) => s.n >= 30 },
  { id: "regions", icon: "🗺️", name: "七大區都去過", need: "每一區至少 1 國", test: (s) => REGIONS.every((r) => s.byRegion[r.key] > 0) },
  { id: "n100", icon: "🌍", name: "百國護照", need: "去過 100 國", test: (s) => s.n >= 100 },
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
  const noop = { has: () => false, canStamp: () => false, toggle() {}, onChange() {}, setEnabled() {}, isEnabled: () => false, isMarking: () => false };
  if (!panel || !body) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let stamps = {};
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "{}");
    stamps = d.v === VERSION ? d.stamps || {} : {};
  } catch { stamps = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, stamps })); } catch { /* 存不了就算了 */ } };
  const listeners = [];
  const changed = (code) => { save(); for (const fn of listeners) fn(code); if (enabled) { syncFootprints(); render(); } };

  let regions = null;
  const regionsReady = fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => { regions = d; });

  const cl = () => window.__earth?.countryLayer;
  const nameOf = (code) => cl()?.meshByCode.get(code)?.userData?.names?.zh || code;
  // 可以蓋章的:地圖上有、而且有分區資料的國家/地區(南極洲之類的不算)
  const canStamp = (code) => !!(code && regions?.[code] && cl()?.meshByCode.has(code));
  function stats() {
    const totals = {}, byRegion = {};
    let total = 0;
    for (const [code, r] of Object.entries(regions || {})) {
      if (!cl()?.meshByCode.has(code)) continue;
      totals[r] = (totals[r] || 0) + 1; total++;
    }
    let n = 0;
    for (const code of Object.keys(stamps)) {
      if (!canStamp(code)) continue;
      const r = regions[code];
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

  // ---------- 蓋章 / 取消 ----------
  let toastEl = null, toastTimer = null;
  function stampToast(code, n) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "passport-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.style.setProperty("--pp-c", COLOR[regions?.[code]] || "#ffc94d");
    toastEl.innerHTML = `<div class="ppt-stamp">${flagImg(code, "ppt-flag")}<b>${esc(nameOf(code))}</b><small>${fmtDate(Date.now())}</small></div>` +
      `<div class="ppt-text">🛂 蓋章!護照第 <b>${n}</b> 國</div>`;
    toastEl.classList.remove("show"); void toastEl.offsetWidth; toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }
  function toast(msg) {
    const el = document.getElementById("share-toast") || Object.assign(document.createElement("div"), { id: "share-toast" });
    if (!el.parentNode) document.body.appendChild(el);
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function add(code) {
    if (!canStamp(code) || stamps[code]) return;
    const before = stats();
    stamps[code] = { t: Date.now() };
    const after = stats();
    stampToast(code, after.n);
    const unlocked = BADGES.filter((b) => !b.test(before) && b.test(after));
    if (unlocked.length) setTimeout(() => toast(`${unlocked[0].icon} 解鎖成就「${unlocked[0].name}」!`), 2700);
    changed(code);
  }
  function remove(code) {
    if (!stamps[code]) return;
    delete stamps[code];
    toast(`已把「${nameOf(code)}」從護照移除`);
    changed(code);
  }
  const toggle = (code) => (stamps[code] ? remove(code) : add(code));

  // ---------- 護照面板 ----------
  let enabled = false, marking = false;

  function addOptions() {
    const coll = (() => { try { return new Intl.Collator("zh-TW-u-co-zhuyin"); } catch { return new Intl.Collator("zh-TW"); } })();
    return REGIONS.map((r) => {
      const cs = Object.keys(regions || {}).filter((c) => regions[c] === r.key && canStamp(c) && !stamps[c]).sort((a, b) => coll.compare(nameOf(a), nameOf(b)));
      return cs.length ? `<optgroup label="${r.label}">${cs.map((c) => `<option value="${c}">${esc(nameOf(c))}</option>`).join("")}</optgroup>` : "";
    }).join("");
  }

  function render() {
    const s = stats();
    // 點地球蓋章模式:護照縮成一小條,把地球讓出來點(手機上面板本來會蓋住大半個地球)
    if (marking) {
      body.innerHTML = `<div class="pp-marking"><div><b>🖱️ 點地球蓋章中</b> · 已蓋 <b class="pp-mk-n">${s.n}</b> 國</div>` +
        `<div class="pp-add-hint on">👉 點地球上的國家:沒去過→蓋章,已蓋過→取消</div>` +
        `<button type="button" class="tc-btn pp-mark on" data-act="mark">✅ 完成</button></div>`;
      return;
    }
    const pct = s.total ? Math.round((s.n / s.total) * 100) : 0;
    const list = Object.entries(stamps).filter(([code]) => canStamp(code)).sort((a, b) => b[1].t - a[1].t);
    const earned = BADGES.filter((b) => b.test(s)).length;
    const keep = body.scrollTop;
    body.innerHTML =
      `<div class="pp-cover"><div class="pp-count"><b>${s.n}</b> <small>/ ${s.total} 個國家與地區</small></div>` +
      `<div class="pp-bar"><i style="width:${pct}%"></i></div><div class="pp-sub">去過全世界的 ${pct}%</div></div>` +
      `<div class="pp-add"><div class="pp-add-hint">記下你<b>真的去過</b>的國家:</div>` +
      `<select id="pp-add" aria-label="新增去過的國家"><option value="">➕ 從清單新增…</option>${addOptions()}</select>` +
      `<button type="button" class="tc-btn pp-mark" data-act="mark">🖱️ 點地球蓋章(一次標記好幾國)</button>` +
      `<div class="pp-add-hint dim">也可以在國家介紹裡按「🛂 我去過這裡」</div>` +
      `</div>` +
      `<div class="pp-h">🌏 各區進度</div><div class="pp-regions">` +
      REGIONS.map((r) => {
        const got = s.byRegion[r.key] || 0, tot = s.totals[r.key] || 0;
        const full = tot && got >= tot;
        return `<div class="pp-region"><span>${r.label}</span><div class="pp-bar sm"><i style="width:${tot ? (got / tot) * 100 : 0}%;background:${r.color}"></i></div><span class="pp-num">${full ? "👑 " : ""}${got}/${tot}</span></div>`;
      }).join("") + `</div>` +
      `<div class="pp-h">🏅 成就 <small>${earned}/${BADGES.length}</small></div><div class="pp-badges">` +
      BADGES.map((b) => `<span class="pp-badge${b.test(s) ? " on" : ""}" title="${esc(b.need)}">${b.icon} ${esc(b.name)}${b.test(s) ? "" : `<small>${esc(b.need)}</small>`}</span>`).join("") + `</div>` +
      `<div class="pp-h">📮 我的印章 <small>點印章飛過去 · 按 × 刪除</small></div>` +
      (list.length
        ? `<div class="pp-stamps">${list.map(([code, v]) => `<div class="pp-stamp-wrap"><button type="button" class="pp-stamp" data-code="${esc(code)}" style="--pp-c:${COLOR[regions[code]] || "#ffc94d"};--pp-r:${tilt(code)}deg" title="蓋章日期:${fmtDate(v.t)}">` +
            `${flagImg(code, "pp-flag")}<b>${esc(nameOf(code))}</b><small>${fmtDate(v.t)}</small></button>` +
            `<button type="button" class="pp-del" data-del="${esc(code)}" aria-label="刪除 ${esc(nameOf(code))}" title="從護照刪除">×</button></div>`).join("")}</div>`
        : `<div class="pp-empty">護照還是空的!<br>用上面的清單或「點地球蓋章」,記下你去過的國家 🛂</div>`) +
      `<div class="quiz-actions pp-actions"><button type="button" class="tc-btn" data-act="share">📣 分享我的護照</button>` +
      (list.length ? `<button type="button" class="tc-btn" data-act="reset">🗑️ 全部清空</button>` : "") + `</div>`;
    body.scrollTop = keep;
  }

  body.addEventListener("change", (e) => {
    if (e.target.id === "pp-add" && e.target.value) add(e.target.value);
  });
  body.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      const code = del.dataset.del;
      if (window.confirm(`要把「${nameOf(code)}」從護照刪除嗎?`)) remove(code);
      return;
    }
    const st = e.target.closest("[data-code]");
    if (st) { openCountryByCode(st.dataset.code); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "mark") {
      marking = !marking;
      render();
    } else if (a.dataset.act === "reset") {
      if (!window.confirm("確定要清空護照、刪除全部印章嗎?(無法復原)")) return;
      const codes = Object.keys(stamps);
      stamps = {};
      save(); for (const c of codes) for (const fn of listeners) fn(c);
      syncFootprints(); render();
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

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    footGroup.visible = enabled;
    if (!enabled) { marking = false; return; }
    body.innerHTML = `<div class="ap-empty">翻開護照中…</div>`;
    await regionsReady;
    if (!enabled) return;
    syncFootprints(); render();
  }

  regionsReady.then(() => { for (const fn of listeners) fn(null); });   // 分區資料到了,側欄的「我去過」按鈕可以顯示了

  return {
    has: (code) => !!stamps[code],
    canStamp,
    toggle,
    onChange: (fn) => listeners.push(fn),
    setEnabled,
    isEnabled: () => enabled,
    isMarking: () => enabled && marking,
  };
}
