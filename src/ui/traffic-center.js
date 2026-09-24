import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";
import { LEVEL_COLOR, LEVEL_LABEL, DIR_LABEL, fmtClock, sectionTitle, sectionRange } from "../scene/traffic.js";

// 台灣路況中心:路況地圖(台灣平面圖,國道依車速上色)/壅塞排行/國道監視器。
// 地球上的國道線只適合看全台概況(台灣在地球上太小),要看清楚哪一段塞車、
// 看即時監視器畫面,都在這個視窗裡做。資料由 scene/traffic.js 每 2 分鐘推過來(onData)。
const CCTV_URL = "data/traffic/cctv.json";
const COUNTY_URL = "data/admin1/TW.geo.json";
const BBOX = { w: 119.95, e: 122.08, s: 21.87, n: 25.33 };   // 台灣本島(含澎湖東半)
const KX = Math.cos(23.6 * Math.PI / 180);                  // 經度方向依緯度縮短,形狀才不會被拉寬
const U = 100;                                               // 投影座標放大,避免小數太多位
const toXY = (lon, lat) => [(lon - BBOX.w) * KX * U, (BBOX.n - lat) * U];
const VB = { w: (BBOX.e - BBOX.w) * KX * U, h: (BBOX.n - BBOX.s) * U };
const MAX_SCALE = 40;          // 拉到最近約 6 公里寬,看得出監視器一支支的位置
const CAM_MIN_SCALE = 12;      // 監視器約每 500 公尺一支,沒放大夠會密到把國道顏色整條蓋掉
const MAX_ROWS = 40;
const MAX_CAM_ROWS = 200;
const AUTO_PAUSE_MS = 2 * 60 * 1000;   // 每支串流約 200KB/s,看 2 分鐘自動暫停,手機才不會被吃流量
const NEAR_DEG = 0.05;                 // 找「附近監視器」的範圍,約 5 公里
const SVG_NS = "http://www.w3.org/2000/svg";

const cssHex = (n) => "#" + n.toString(16).padStart(6, "0");
function shortRoad(r) {
  if (!r) return "";
  if (/汐止五股高架/.test(r)) return "國1高架";
  let m = r.match(/^國道(\d+)號$/);
  if (m) return `國${m[1]}`;
  m = r.match(/^國道(\d+)甲$/);
  if (m) return `國${m[1]}甲`;
  m = r.match(/^臺(\d+)線$/);
  if (m) return `台${m[1]}`;
  return r;
}
function mileKm(m) {
  const x = /^(\d+)K\+(\d+)/.exec(m || "");
  return x ? Number(x[1]) + Number(x[2]) / 1000 : 0;
}
function fmtTravel(sec) {
  if (!(sec > 0)) return "";
  if (sec < 60) return `${Math.round(sec)} 秒`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}
function pathD(c) {
  let d = "";
  for (let i = 0; i + 1 < c.length; i += 2) {
    const [x, y] = toXY(c[i], c[i + 1]);
    d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d;
}

export function createTrafficCenter({ traffic, onClose }) {
  const panel = document.getElementById("traffic-panel");
  if (!panel) return { setOpen() {}, onData() {} };
  const $ = (id) => document.getElementById(id);
  const listEl = $("traffic-list"), summaryEl = $("traffic-summary"), captionEl = $("traffic-caption");
  const mapBox = $("tc-map"), infoEl = $("tc-map-info");
  const camRoadSel = $("tc-cam-road"), camDirSel = $("tc-cam-dir"), camQ = $("tc-cam-q"), camList = $("tc-cam-list");
  const viewer = $("tc-viewer"), vImg = $("tc-viewer-img"), vMsg = $("tc-viewer-msg");
  const vTitle = $("tc-viewer-title"), vSub = $("tc-viewer-sub"), vPause = $("tc-viewer-pause");
  makeDraggable(panel, panel.querySelector(".sat-head"));

  let open = false;
  let data = null;               // { sections, live, liveTime, ok, levelOf }
  let cams = null;               // { roads, cams:[[lon,lat,roadIdx,dir,mile,from,to,url]] }
  let camsLoading = null;
  let tab = "map";

  const levelOf = (id) => (data ? data.levelOf(id) : 0);
  const liveOf = (id) => (data && data.live.get(id)) || null;

  function loadCams() {
    if (!camsLoading) {
      camsLoading = fetch(CCTV_URL).then((r) => (r.ok ? r.json() : null)).then((d) => {
        cams = d;
        if (d) { fillRoadSelect(); renderCamList(); drawCams(); }
      }).catch(() => { camsLoading = null; });
    }
    return camsLoading;
  }

  // ───────────── 分頁 ─────────────
  const tabBtns = [...panel.querySelectorAll(".tc-tabs [data-tab]")];
  const panes = [...panel.querySelectorAll(".tc-pane")];
  function showTab(name) {
    tab = name;
    closeViewer();
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    panes.forEach((p) => { p.hidden = p.dataset.pane !== name; });
    if (name === "map") { buildMap(); requestAnimationFrame(applyTransform); }
    if (name === "cam") loadCams();
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  // ───────────── 摘要 / 資料來源 ─────────────
  function renderSummary() {
    if (!data || !data.sections) { summaryEl.textContent = ""; return; }
    const counts = [0, 0, 0, 0, 0, 0];
    for (const id of Object.keys(data.sections)) counts[levelOf(id)]++;
    const busy = counts[2] + counts[3] + counts[4] + counts[5];
    const jam = counts[3] + counts[4] + counts[5];
    summaryEl.innerHTML = !data.live.size
      ? ""
      : busy
        ? `車多以上 <b>${busy}</b> 段(壅塞以上 <b>${jam}</b> 段),其餘 <b>${counts[1]}</b> 段順暢`
        : `目前國道全線順暢(<b>${counts[1]}</b> 段)`;
    captionEl.textContent = data.ok
      ? `資料來源:交通部高速公路局(TDX)· 資料時間 ${fmtClock(data.liveTime)} · 每 2 分鐘更新 · 監視器影像:高速公路局`
      : data.live.size
        ? `更新失敗,顯示 ${fmtClock(data.liveTime)} 的資料,稍後會自動重試`
        : "路況資料暫時查不到,稍後會自動重試";
  }

  // ───────────── 壅塞排行 ─────────────
  function renderRank() {
    if (!data || !data.sections) { listEl.innerHTML = `<div class="ap-empty">載入國道路段中…</div>`; return; }
    if (!data.live.size) { listEl.innerHTML = `<div class="ap-empty">路況資料暫時查不到,稍後會自動重試</div>`; return; }
    const busy = Object.keys(data.sections).filter((id) => levelOf(id) >= 2 && data.sections[id].r);
    busy.sort((a, b) => levelOf(b) - levelOf(a) || liveOf(a).speed - liveOf(b).speed);
    if (!busy.length) { listEl.innerHTML = `<div class="ap-empty">沒有車多或壅塞的路段,一路順風 🚗</div>`; return; }
    listEl.innerHTML = busy.slice(0, MAX_ROWS).map((id) => {
      const s = data.sections[id], v = liveOf(id), lv = v.level;
      const travel = fmtTravel(v.travel);
      return `<div class="ap-row tf-row" data-id="${esc(id)}" title="點一下在地圖上找到這一段">
        <div class="ap-row-top">
          <span class="ap-flight">${esc(s.r)} <b>${esc(DIR_LABEL[s.d] || "")}</b></span>
          <span class="ap-badge tf-l${lv}">${esc(LEVEL_LABEL[lv])}</span>
        </div>
        <div class="ap-row-mid">${esc(sectionRange(s))}</div>
        <div class="ap-row-bottom">
          <span class="tf-speed">時速 ${Math.round(v.speed)} km/h</span>
          ${s.l ? `<span>速限 ${s.l}</span>` : ""}
          ${travel ? `<span>通過約 ${travel}</span>` : ""}
          <button type="button" class="tc-btn" data-cam-for="${esc(id)}">📹 附近監視器</button>
        </div>
      </div>`;
    }).join("");
  }
  listEl.addEventListener("click", (e) => {
    const camBtn = e.target.closest("[data-cam-for]");
    if (camBtn) { openNearestCam(camBtn.dataset.camFor); return; }
    const row = e.target.closest(".tf-row");
    if (!row) return;
    showTab("map");
    zoomToSection(row.dataset.id);
    showInfo(row.dataset.id);
    traffic.focusSection(row.dataset.id);
  });

  // ───────────── 路況地圖(SVG) ─────────────
  let svg = null, gRoot = null, gRoads = null, gShields = null, gCams = null;
  const roadEls = new Map();     // id -> { line, hit }
  const shieldEls = [];          // { el }
  const countyLabels = [];
  let scale = 1, tx = 0, ty = 0;
  let selectedId = null;
  let mapBuilding = null;

  function unitPx() {
    const r = svg.getBoundingClientRect();
    return Math.min(r.width / VB.w, r.height / VB.h) || 1;
  }
  function applyTransform() {
    if (!svg) return;
    gRoot.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    const k = unitPx() * scale;              // 1 個投影單位在螢幕上是幾 px
    for (const t of countyLabels) t.setAttribute("font-size", (11 / k).toFixed(3));
    for (const t of shieldEls) { t.setAttribute("font-size", (11 / k).toFixed(3)); t.style.strokeWidth = (3 / k).toFixed(3); }
    // 國道線放大時跟著變粗一點,比較好點
    svg.style.setProperty("--tc-road-w", `${Math.min(6, 3 + (scale - 1) * 0.12).toFixed(1)}px`);
    if (gCams) {
      gCams.style.display = scale >= CAM_MIN_SCALE ? "" : "none";
      const r = (Math.min(4.5, 2.2 + (scale - CAM_MIN_SCALE) * 0.08) / k).toFixed(3);
      for (const c of gCams.children) c.setAttribute("r", r);
    }
  }

  function buildMap() {
    if (mapBuilding || !data || !data.sections) return mapBuilding;
    mapBuilding = (async () => {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${VB.w.toFixed(2)} ${VB.h.toFixed(2)}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      gRoot = document.createElementNS(SVG_NS, "g");
      svg.appendChild(gRoot);
      const gCounty = document.createElementNS(SVG_NS, "g");
      gRoads = document.createElementNS(SVG_NS, "g");
      gShields = document.createElementNS(SVG_NS, "g");
      gCams = document.createElementNS(SVG_NS, "g");
      gRoot.append(gCounty, gRoads, gShields, gCams);
      mapBox.innerHTML = "";
      mapBox.appendChild(svg);

      // 縣市底圖(大百科分區地圖同一份資料)
      try {
        const fc = await fetch(COUNTY_URL).then((r) => r.json());
        for (const f of fc.features) {
          const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
          let d = "";
          for (const poly of polys) for (const ring of poly) d += pathD(ring.flat()) + "Z";
          const p = document.createElementNS(SVG_NS, "path");
          p.setAttribute("d", d);
          p.setAttribute("class", "tc-county");
          gCounty.appendChild(p);
          const pr = f.properties;
          if (pr.lon != null && pr.lon > BBOX.w && pr.lon < BBOX.e) {
            const [x, y] = toXY(pr.lon, pr.lat);
            const t = document.createElementNS(SVG_NS, "text");
            t.setAttribute("x", x); t.setAttribute("y", y);
            t.setAttribute("class", "tc-county-label");
            t.textContent = pr.name_zht || pr.name;
            gCounty.appendChild(t);
            countyLabels.push(t);
          }
        }
      } catch { /* 底圖載不到也不影響國道線 */ }

      // 國道:每段一條上色的線 + 一條看不見的粗線當點擊範圍
      for (const [id, s] of Object.entries(data.sections)) {
        const d = pathD(s.c);
        const hit = document.createElementNS(SVG_NS, "path");
        hit.setAttribute("d", d); hit.setAttribute("class", "tc-road-hit"); hit.dataset.id = id;
        const line = document.createElementNS(SVG_NS, "path");
        line.setAttribute("d", d); line.setAttribute("class", "tc-road");
        roadEls.set(id, { line, hit });
      }
      // 國道編號標籤:每條路沿線挑幾個點標「國1、國3…」
      const byRoad = new Map();
      for (const [id, s] of Object.entries(data.sections)) {
        if (!s.r || !(s.d === "S" || s.d === "E")) continue;
        if (!byRoad.has(s.r)) byRoad.set(s.r, []);
        byRoad.get(s.r).push(id);
      }
      for (const [road, ids] of byRoad) {
        ids.sort();
        const n = ids.length, count = n <= 6 ? 1 : n <= 30 ? 2 : 4;
        for (let k = 0; k < count; k++) {
          const s = data.sections[ids[Math.floor((k + 0.5) * n / count)]];
          const [x, y] = toXY(s.mid[1], s.mid[0]);
          const t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("x", x); t.setAttribute("y", y);
          t.setAttribute("class", "tc-shield");
          t.textContent = shortRoad(road);
          gShields.appendChild(t);
          shieldEls.push(t);
        }
      }
      recolorMap();
      drawCams();
      attachPanZoom();
      new ResizeObserver(() => applyTransform()).observe(mapBox);
      applyTransform();
    })();
    return mapBuilding;
  }

  function recolorMap() {
    if (!gRoads || !data) return;
    // 順暢的先畫、塞的後畫(蓋在上面);點擊用的透明粗線全部放在最上層
    const ids = [...roadEls.keys()].sort((a, b) => levelOf(a) - levelOf(b));
    for (const id of ids) {
      const { line } = roadEls.get(id);
      line.setAttribute("stroke", cssHex(LEVEL_COLOR[levelOf(id)] ?? LEVEL_COLOR[0]));
      gRoads.appendChild(line);
    }
    for (const id of ids) gRoads.appendChild(roadEls.get(id).hit);
    if (selectedId) roadEls.get(selectedId)?.line.classList.add("sel");
  }

  function drawCams() {
    if (!gCams || !cams || gCams.childElementCount) return;
    const frag = document.createDocumentFragment();
    cams.cams.forEach((c, i) => {
      const [x, y] = toXY(c[0], c[1]);
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", x.toFixed(2)); dot.setAttribute("cy", y.toFixed(2));
      dot.setAttribute("class", "tc-cam");
      dot.dataset.cam = i;
      frag.appendChild(dot);
    });
    gCams.appendChild(frag);
    applyTransform();
  }

  function zoomToSection(id) {
    const s = data && data.sections[id];
    if (!s || !svg) return;
    const [x, y] = toXY(s.mid[1], s.mid[0]);
    scale = 8;
    tx = VB.w / 2 - x * scale;
    ty = VB.h / 2 - y * scale;
    applyTransform();
  }

  // 同一條國道的對向:同路名、不同方向、中點最近的那一段
  function oppositeOf(id) {
    const s = data.sections[id];
    let best = null, bd = Infinity;
    for (const [oid, o] of Object.entries(data.sections)) {
      if (oid === id || o.r !== s.r || o.d === s.d) continue;
      const d = Math.hypot((o.mid[1] - s.mid[1]) * KX, o.mid[0] - s.mid[0]);
      if (d < bd) { bd = d; best = oid; }
    }
    return bd < 0.03 ? best : null;
  }
  function statusLine(id) {
    const v = liveOf(id), s = data.sections[id];
    const lv = v ? v.level : 0;
    return `<span class="ap-lg tf-l${lv}">${esc(DIR_LABEL[s.d] || "")} ${v && lv ? `時速 <b>${Math.round(v.speed)}</b> km/h · ${esc(LEVEL_LABEL[lv])}` : "暫無即時資料"}</span>`;
  }
  function showInfo(id) {
    const s = data && data.sections[id];
    if (!s) return;
    if (selectedId) roadEls.get(selectedId)?.line.classList.remove("sel");
    selectedId = id;
    roadEls.get(id)?.line.classList.add("sel");
    const opp = oppositeOf(id);
    infoEl.innerHTML = `<b>${esc(s.r || "國道路段")}</b> ${esc(sectionRange(s))}${s.l ? ` <span class="dim">· 速限 ${s.l}</span>` : ""}` +
      `<div class="tc-dir">${statusLine(id)}</div>` + (opp ? `<div class="tc-dir">${statusLine(opp)}</div>` : "") +
      `<button type="button" class="tc-btn" data-cam-for="${esc(id)}">📹 附近監視器</button>` +
      `<button type="button" class="tc-btn" data-globe="${esc(id)}">🌏 在地球上看</button>`;
    infoEl.hidden = false;
  }
  infoEl.addEventListener("click", (e) => {
    const cb = e.target.closest("[data-cam-for]");
    if (cb) openNearestCam(cb.dataset.camFor);
    const gb = e.target.closest("[data-globe]");
    if (gb) traffic.focusSection(gb.dataset.globe);
  });

  function attachPanZoom() {
    const svgPt = (cx, cy) => {
      const r = svg.getBoundingClientRect(), k = unitPx();
      // preserveAspectRatio meet:內容置中,先扣掉左右/上下留白
      const ox = r.left + (r.width - VB.w * k) / 2, oy = r.top + (r.height - VB.h * k) / 2;
      return { x: (cx - ox) / k, y: (cy - oy) / k };
    };
    const zoomAt = (p, ns) => {
      ns = Math.min(MAX_SCALE, Math.max(1, ns));
      tx = p.x - (p.x - tx) * (ns / scale);
      ty = p.y - (p.y - ty) * (ns / scale);
      scale = ns;
      if (scale === 1) { tx = 0; ty = 0; }
      applyTransform();
    };
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomAt(svgPt(e.clientX, e.clientY), scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
    }, { passive: false });
    const pointers = new Map();
    let drag = null, pinch = null, lastDragEnd = 0;
    svg.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture(e.pointerId); } catch {}
      if (pointers.size === 2) {
        drag = null;
        const [a, b] = [...pointers.values()];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: scale, mid: svgPt((a.x + b.x) / 2, (a.y + b.y) / 2) };
      } else if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      }
    });
    svg.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        zoomAt(pinch.mid, pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0);
        return;
      }
      if (!drag) return;
      const k = unitPx();
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
      tx = drag.tx + (e.clientX - drag.x) / k;
      ty = drag.ty + (e.clientY - drag.y) / k;
      applyTransform();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pinch) { lastDragEnd = Date.now(); if (pointers.size < 2) pinch = null; drag = null; return; }
      if (drag && drag.moved) lastDragEnd = Date.now();
      drag = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("dblclick", () => { scale = 1; tx = 0; ty = 0; applyTransform(); });
    // pointer capture 會讓 click 的 target 變成 svg 本身,用 elementFromPoint 重新判斷點到什麼
    svg.addEventListener("click", (e) => {
      if (Date.now() - lastDragEnd < 160) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cam = el && el.closest(".tc-cam");
      if (cam) { openViewer(Number(cam.dataset.cam)); return; }
      const hit = el && el.closest(".tc-road-hit");
      if (hit) { showInfo(hit.dataset.id); return; }
      infoEl.hidden = true;
      if (selectedId) roadEls.get(selectedId)?.line.classList.remove("sel");
      selectedId = null;
    });
  }

  // ───────────── 監視器清單 ─────────────
  function fillRoadSelect() {
    const counts = new Map();
    cams.cams.forEach((c) => counts.set(c[2], (counts.get(c[2]) || 0) + 1));
    camRoadSel.innerHTML = cams.roads.map((r, i) => `<option value="${i}">${esc(r)}(${counts.get(i) || 0})</option>`).join("");
  }
  function camLabel(c) {
    return `${cams.roads[c[2]]} ${DIR_LABEL[c[3]] || ""} ${c[4]}`;
  }
  function filteredCams(roadIdx, dir, q) {
    const out = [];
    cams.cams.forEach((c, i) => {
      if (roadIdx != null && c[2] !== roadIdx) return;
      if (dir && c[3] !== dir) return;
      if (q && !(`${c[5]}${c[6]}${c[4]}`.includes(q))) return;
      out.push(i);
    });
    out.sort((a, b) => (cams.cams[a][3] < cams.cams[b][3] ? -1 : cams.cams[a][3] > cams.cams[b][3] ? 1 : 0) ||
      mileKm(cams.cams[a][4]) - mileKm(cams.cams[b][4]));
    return out;
  }
  function renderCamList() {
    if (!cams) { camList.innerHTML = `<div class="ap-empty">載入監視器清單中…</div>`; return; }
    const q = camQ.value.trim();
    // 有輸入地名就搜尋全部國道,沒有就只列選定的那一條
    const list = filteredCams(q ? null : Number(camRoadSel.value), camDirSel.value, q);
    camList.innerHTML = list.length
      ? list.slice(0, MAX_CAM_ROWS).map((i) => {
        const c = cams.cams[i];
        return `<div class="ap-row tc-cam-row" data-cam="${i}">
          <div class="ap-row-top"><span class="ap-flight">📹 ${esc(cams.roads[c[2]])} <b>${esc(DIR_LABEL[c[3]] || "")}</b></span><span class="dim">${esc(c[4])}</span></div>
          <div class="ap-row-mid">${esc(c[5])} → ${esc(c[6])}</div>
        </div>`;
      }).join("") + (list.length > MAX_CAM_ROWS ? `<div class="ap-empty">共 ${list.length} 支,只列前 ${MAX_CAM_ROWS} 支,可以用方向或地名縮小範圍</div>` : "")
      : `<div class="ap-empty">找不到符合的監視器</div>`;
  }
  [camRoadSel, camDirSel].forEach((el) => el.addEventListener("change", renderCamList));
  camQ.addEventListener("input", renderCamList);
  camList.addEventListener("click", (e) => {
    const row = e.target.closest("[data-cam]");
    if (row) openViewer(Number(row.dataset.cam));
  });

  async function openNearestCam(sectionId) {
    await loadCams();
    const s = data && data.sections[sectionId];
    if (!cams || !s) return;
    let best = -1, bd = Infinity;
    for (const sameDir of [true, false]) {
      cams.cams.forEach((c, i) => {
        if (sameDir && s.d && c[3] !== s.d) return;
        const d = Math.hypot((c[0] - s.mid[1]) * KX, c[1] - s.mid[0]);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && bd < NEAR_DEG) break;
    }
    if (best >= 0 && bd < NEAR_DEG) openViewer(best);
    else captionEl.textContent = "這一段附近 5 公里內沒有國道監視器。";
  }

  // ───────────── 監視器畫面 ─────────────
  let camIdx = -1, pauseTimer = null, loadTimer = null, paused = false;
  const still = document.createElement("canvas");   // 暫停時保留最後一格畫面
  still.style.display = "none";
  vImg.after(still);

  function neighbors(i) {
    const c = cams.cams[i];
    const same = filteredCams(c[2], c[3], "");
    const k = same.indexOf(i);
    return { prev: k > 0 ? same[k - 1] : -1, next: k >= 0 && k < same.length - 1 ? same[k + 1] : -1 };
  }
  function stopStream() {
    clearTimeout(pauseTimer); clearTimeout(loadTimer);
    vImg.onload = vImg.onerror = null;
    vImg.removeAttribute("src");
  }
  function play() {
    const c = cams.cams[camIdx];
    paused = false;
    vPause.textContent = "⏸ 暫停";
    still.style.display = "none";
    vImg.style.display = "";
    vMsg.textContent = "連線中…";
    vImg.onload = () => { vMsg.textContent = ""; };
    vImg.onerror = () => { vMsg.textContent = "這支監視器暫時沒有畫面(可能維修中),試試上一支或下一支。"; };
    vImg.src = c[7];
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (!vImg.naturalWidth) vMsg.textContent = "這支監視器暫時沒有畫面(可能維修中),試試上一支或下一支。";
      else vMsg.textContent = "";
    }, 8000);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => pause("已播放 2 分鐘,自動暫停以節省流量。"), AUTO_PAUSE_MS);
  }
  function pause(msg) {
    if (paused) return;
    paused = true;
    try {
      if (vImg.naturalWidth) {
        still.width = vImg.naturalWidth; still.height = vImg.naturalHeight;
        still.getContext("2d").drawImage(vImg, 0, 0);
        still.style.display = "";
        vImg.style.display = "none";
      }
    } catch { /* 畫不下來就只顯示黑底 */ }
    stopStream();
    vPause.textContent = "▶ 繼續播放";
    vMsg.textContent = msg || "已暫停";
  }
  function openViewer(i) {
    if (!cams || !cams.cams[i]) return;
    stopStream();
    camIdx = i;
    const c = cams.cams[i];
    vTitle.textContent = `📹 ${camLabel(c)}`;
    vSub.textContent = `${c[5]} → ${c[6]} · 即時影像來源:交通部高速公路局`;
    const nb = neighbors(i);
    $("tc-viewer-prev").disabled = nb.prev < 0;
    $("tc-viewer-next").disabled = nb.next < 0;
    viewer.hidden = false;
    if (gCams) {
      gCams.querySelector(".tc-cam.sel")?.classList.remove("sel");
      gCams.querySelector(`[data-cam="${i}"]`)?.classList.add("sel");
    }
    play();
  }
  function closeViewer() {
    if (viewer.hidden) return;
    stopStream();
    viewer.hidden = true;
  }
  $("tc-viewer-close").addEventListener("click", closeViewer);
  $("tc-viewer-prev").addEventListener("click", () => { const n = neighbors(camIdx).prev; if (n >= 0) openViewer(n); });
  $("tc-viewer-next").addEventListener("click", () => { const n = neighbors(camIdx).next; if (n >= 0) openViewer(n); });
  vPause.addEventListener("click", () => { if (paused) play(); else pause(); });

  // ───────────── 對外 ─────────────
  $("traffic-refresh")?.addEventListener("click", () => traffic.refresh());
  $("traffic-close")?.addEventListener("click", () => onClose && onClose());

  function setOpen(v) {
    open = !!v;
    panel.hidden = !open;
    if (!open) { closeViewer(); return; }
    renderSummary();
    renderRank();
    if (!data) mapBox.innerHTML = `<div class="ap-empty">載入國道路段中…</div>`;
    showTab(tab);
    loadCams();
  }

  function onData(d) {
    data = d;
    if (!open) return;
    renderSummary();
    renderRank();
    if (svg) recolorMap(); else if (tab === "map") buildMap();
    if (selectedId && !infoEl.hidden) showInfo(selectedId);
  }

  return { setOpen, onData };
}
