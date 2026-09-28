import * as THREE from "three";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";

// 📊 數據地球:選一個指標(人口、平均壽命、生育率、人均所得、碳排放…),整顆地球依數值替每個國家上色,
// 拖時間軸(或按播放)看 1950 年到最近的變化。資料:Our World in Data(tools/build-stats.py 產生 data/stats/)。
// 色階固定用「所有年份」的範圍,播放時顏色的變化就是真實的變化。
const PALETTE = [0x30123b, 0x4145ab, 0x4675ed, 0x1bcfd4, 0x61fc6c, 0xd2e935, 0xfe9b2d, 0xd93806];
const COLORS = PALETTE.map((h) => new THREE.Color(h));
const NO_DATA = new THREE.Color(0x4a5060);
const LOOKBACK = 5;   // 某一年沒資料,往前找最多幾年

function fmt(id, v) {
  if (v == null || !isFinite(v)) return "—";
  switch (id) {
    case "pop": return v >= 1e8 ? `${(v / 1e8).toFixed(2)} 億人` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()} 萬人` : `${Math.round(v).toLocaleString()} 人`;
    case "density": return `${Math.round(v).toLocaleString()} 人/平方公里`;
    case "life": return `${v.toFixed(1)} 歲`;
    case "fert": return `${v.toFixed(2)} 個孩子`;
    case "median": return `${v.toFixed(1)} 歲`;
    case "gdp": return `${Math.round(v).toLocaleString()} 國際元`;
    case "co2": return `${v.toFixed(1)} 公噸`;
    case "renew": return `${v.toFixed(1)}%`;
    default: return String(v);
  }
}

export function createDataGlobe({ globeObject, countryLayer, rig, nameOf, onClose }) {
  const cl = () => (typeof countryLayer === "function" ? countryLayer() : countryLayer);   // 國家圖層是資料載入後才建好
  const panel = document.getElementById("stats-panel");
  const body = document.getElementById("stats-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("stats-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("stats-min");
  function setMin(on) {
    panel?.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  const group = new THREE.Group();
  group.visible = false;
  globeObject.add(group);
  const meshes = new Map();   // code → mesh
  let enabled = false, hidden = false, index = null, cur = null, year = 0, playing = null;
  const cache = new Map();

  async function loadIndex() {
    if (index) return index;
    index = await fetch("data/stats/index.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return index;
  }
  async function loadIndicator(id) {
    if (cache.has(id)) return cache.get(id);
    const d = await fetch(`data/stats/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) return null;
    const meta = index.indicators.find((x) => x.id === id);
    // 色階範圍:所有年份所有國家的 2%~98% 百分位(少數極端值不會把其他國家的顏色擠在一起)
    const all = [];
    for (const arr of Object.values(d.v)) for (const x of arr) if (x != null && (meta.scale !== "log" || x > 0)) all.push(x * d.mul);
    all.sort((a, b) => a - b);
    const q = (p) => all[Math.min(all.length - 1, Math.max(0, Math.floor(p * (all.length - 1))))];
    const info = { ...d, meta, lo: q(0.02), hi: q(0.98) };
    cache.set(id, info);
    return info;
  }

  // 某國某一年的值(沒有就往前找幾年);回傳 [值, 實際年份]
  function valueOf(code, y) {
    const arr = cur?.v[code];
    if (!arr) return [null, null];
    for (let k = 0; k <= LOOKBACK; k++) {
      const i = y - k - cur.y0;
      if (i >= 0 && i < arr.length && arr[i] != null) return [arr[i] * cur.mul, y - k];
    }
    return [null, null];
  }
  function t01(v) {
    const { lo, hi, meta } = cur;
    const f = meta.scale === "log" ? (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo);
    return Math.min(1, Math.max(0, f));
  }
  function colorAt(t, target) {
    const x = t * (COLORS.length - 1), i = Math.min(COLORS.length - 2, Math.floor(x));
    return target.copy(COLORS[i]).lerp(COLORS[i + 1], x - i);
  }

  function ensureMeshes() {
    if (meshes.size || !cl()) return;
    for (const [code, wrap] of cl().meshByCode) {
      cl().ensureMesh(code);
      const src = wrap.children.find((c) => c.isMesh);
      if (!src) continue;
      const mat = new THREE.MeshBasicMaterial({ color: NO_DATA, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(src.geometry, mat);
      m.renderOrder = 1;
      m.raycast = () => {};
      group.add(m);
      meshes.set(code, m);
    }
  }
  const tmp = new THREE.Color();
  function paint() {
    if (!cur) return;
    for (const [code, m] of meshes) {
      const [v] = valueOf(code, year);
      if (v == null) { m.material.color.copy(NO_DATA); m.material.opacity = 0.35; }
      else { m.material.color.copy(colorAt(t01(v), tmp)); m.material.opacity = 0.82; }
    }
  }

  function ranking() {
    const rows = [];
    for (const code of Object.keys(cur.v)) {
      if (!meshes.has(code)) continue;
      const [v, y] = valueOf(code, year);
      if (v != null) rows.push({ code, v, y });
    }
    rows.sort((a, b) => b.v - a.v);
    return rows;
  }

  // ---------- 面板 ----------
  function legend() {
    const { lo, hi, meta } = cur;
    const at = (f) => (meta.scale === "log" ? Math.exp(Math.log(lo) + f * (Math.log(hi) - Math.log(lo))) : lo + f * (hi - lo));
    return `<div class="dg-legend"><div class="dg-bar" style="background:linear-gradient(90deg,${PALETTE.map((h) => `#${h.toString(16).padStart(6, "0")}`).join(",")})"></div>` +
      `<div class="dg-ticks"><span>${fmt(meta.id, at(0))}</span><span>${fmt(meta.id, at(0.5))}</span><span>${fmt(meta.id, at(1))}</span></div>` +
      `<div class="dg-nodata"><i></i>沒有資料</div></div>`;
  }
  const row = (r, i) => `<button type="button" class="dg-row" data-code="${r.code}"><span class="dg-rk">${i}</span>` +
    `<span class="dg-nm">${esc(nameOf(r.code))}</span><b>${fmt(cur.meta.id, r.v)}</b>${r.y !== year ? `<small>(${r.y})</small>` : ""}</button>`;
  // 台灣排在後半段就說「倒數第幾名」,比較好懂
  const twLine = (tw, i, n) => `📍 台灣:<b>${fmt(cur.meta.id, tw.v)}</b>${tw.y !== year ? `(${tw.y} 年)` : ""},` +
    (i + 1 > n / 2 ? `全球<b>倒數第 ${n - i}</b> 名` : `全球第 <b>${i + 1}</b> 名`) + `(共 ${n} 個國家與地區)`;
  function render() {
    if (!body) return;
    if (!index) { body.innerHTML = `<div class="ap-empty">讀取資料中…</div>`; return; }
    const chips = `<div class="dg-chips">${index.indicators.map((x) => `<button type="button" data-ind="${x.id}" class="${cur?.meta.id === x.id ? "on" : ""}">${esc(x.zh)}</button>`).join("")}</div>`;
    if (!cur) { body.innerHTML = chips + `<div class="ap-empty">讀取資料中…</div>`; return; }
    const m = cur.meta;
    const rows = ranking();
    const twI = rows.findIndex((r) => r.code === "TW");
    const tw = rows[twI];
    body.innerHTML = chips +
      `<div class="dg-title">${esc(m.zh)} <span>${year} 年</span></div>` +
      `<div class="dg-note">${esc(m.note)}</div>` +
      `<div class="dg-year"><button type="button" class="tc-btn dg-play" data-act="play">${playing ? "⏸" : "▶"}</button>` +
      `<input type="range" class="dg-slider" min="${cur.y0}" max="${cur.y1}" step="1" value="${year}" aria-label="年份">` +
      `<b class="dg-y">${year}</b></div>` +
      legend() +
      (tw ? `<div class="dg-tw">${twLine(tw, twI, rows.length)}</div>` : "") +
      `<div class="dg-lists"><div><div class="mt-h">最高</div>${rows.slice(0, 5).map((r, i) => row(r, i + 1)).join("")}</div>` +
      `<div><div class="mt-h">最低</div>${rows.slice(-5).reverse().map((r, i) => row(r, rows.length - i)).join("")}</div></div>` +
      `<div class="sat-caption">滑鼠移到國家上看數值;點排行榜的國家飛過去。資料:<a href="${esc(m.url)}" target="_blank" rel="noopener">Our World in Data</a>` +
      `(CC BY 4.0),原始來源:${esc(m.src)}。某年沒有資料的國家,用最近 ${LOOKBACK} 年內的數字(括號標年份)。</div>`;
  }
  // 拖年份時只更新會變的部分,不要整個重畫(拉桿才不會被換掉)
  function refreshYear() {
    paint();
    if (!body || !cur) return;
    const slider = body.querySelector(".dg-slider");
    if (slider && document.activeElement === slider) {
      const rows = ranking(), twI = rows.findIndex((r) => r.code === "TW"), tw = rows[twI];
      body.querySelector(".dg-title span").textContent = `${year} 年`;
      body.querySelector(".dg-y").textContent = year;
      const twEl = body.querySelector(".dg-tw");
      if (twEl && tw) twEl.innerHTML = twLine(tw, twI, rows.length);
      const lists = body.querySelector(".dg-lists");
      if (lists) lists.innerHTML = `<div><div class="mt-h">最高</div>${rows.slice(0, 5).map((r, i) => row(r, i + 1)).join("")}</div>` +
        `<div><div class="mt-h">最低</div>${rows.slice(-5).reverse().map((r, i) => row(r, rows.length - i)).join("")}</div>`;
    } else render();
  }

  async function choose(id) {
    stop();
    const info = await loadIndicator(id);
    if (!info) return;
    cur = info;
    year = info.y1;
    ensureMeshes();
    paint();
    render();
  }
  function stop() { if (playing) { clearInterval(playing); playing = null; } }
  function play() {
    if (playing) { stop(); render(); return; }
    if (year >= cur.y1) year = cur.y0;
    playing = setInterval(() => {
      if (year >= cur.y1) { stop(); render(); return; }
      year++;
      paint();
      render();
    }, 180);
    render();
  }

  body?.addEventListener("click", (e) => {
    const ind = e.target.closest("[data-ind]");
    if (ind) { choose(ind.dataset.ind); return; }
    if (e.target.closest("[data-act=play]")) { play(); return; }
    const r = e.target.closest(".dg-row");
    if (r) {
      const w = cl()?.meshByCode.get(r.dataset.code);
      const [lo, la] = w?.userData.centroidLatLon || [];   // 注意:國家質心存成 [經度, 緯度]
      if (la != null) { if (window.innerWidth <= 640) setMin(true); rig.flyTo(la, lo, { distance: 2.3, ms: 1400 }); }
    }
  });
  body?.addEventListener("input", (e) => {
    if (!e.target.classList.contains("dg-slider")) return;
    stop();
    year = Number(e.target.value);
    refreshYear();
  });
  body?.addEventListener("change", (e) => { if (e.target.classList.contains("dg-slider")) render(); });

  async function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    document.body.classList.toggle("stats-on", enabled);
    group.visible = enabled && !hidden;
    if (!enabled) { stop(); return; }
    setMin(false);
    render();
    await loadIndex();
    if (!index) { if (body) body.innerHTML = `<div class="ap-empty">資料暫時讀不到,稍後再試</div>`; return; }
    if (!cur) await choose(index.indicators[0].id);
    else render();
  }

  // 滑鼠指到國家時,提示框多一行這個指標的數值
  function readout(code) {
    if (!enabled || hidden || !cur || !code) return null;
    const [v, y] = valueOf(code, year);
    return `📊 ${cur.meta.zh} ${fmt(cur.meta.id, v)}${v != null && y !== year ? `(${y})` : ""}`;
  }

  return {
    setEnabled, readout,
    isEnabled: () => enabled,
    setHidden(v) { hidden = !!v; group.visible = enabled && !hidden; },
  };
}
