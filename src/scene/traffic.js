import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "../ui/draggable.js";

// 台灣即時路況(國道):交通部高速公路局的路段車速,經 TDX → 我們的 Cloudflare
// Worker 轉發(金鑰放在 Worker 的 Secrets)。路段線形與名稱幾乎不會變,已預先做成
// data/traffic/freeway.json(tools/build-freeway.py),這裡只需要定時抓一份即時車速。
const PROXY_URL = "https://earth-world-flights.a7779782.workers.dev";
const SHAPES_URL = "data/traffic/freeway.json";
const REFRESH_MS = 2 * 60 * 1000;   // 資料源每分鐘更新,2 分鐘抓一次就夠
const RADIUS = 1.0035;              // 比國界(1.0025)、台灣金色海岸線(1.003)再高一點

// 壅塞等級(高公局 CongestionLevel):0 無資料、1 順暢 … 5 幾乎停滯。
// 實測各等級車速:1 = 70–116、2 = 52–79、3 = 41–59、4 = 20–39、5 = 13–18 km/h
// (區間會重疊是因為各路段速限不同,等級是高公局依速限換算好的,直接用它)。
const LEVEL_COLOR = { 0: 0x7f8a99, 1: 0x2fd073, 2: 0xffd23f, 3: 0xff8c1a, 4: 0xff3b30, 5: 0xb5179e };
const LEVEL_LABEL = { 0: "無資料", 1: "順暢", 2: "車多", 3: "壅塞", 4: "嚴重壅塞", 5: "幾乎停滯" };
const DIR_LABEL = { N: "北向", S: "南向", E: "東向", W: "西向" };
const MAX_ROWS = 40;
const PICK_PX = 12;

const DEG = Math.PI / 180;
function toVec3(lon, lat, r = RADIUS) {
  const la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
  return new THREE.Vector3(r * cl * Math.cos(lo), r * Math.sin(la), -r * cl * Math.sin(lo));
}
function fmtClock(iso) {
  return typeof iso === "string" && iso.length >= 16 ? iso.slice(11, 16) : "—";
}
function fmtTravel(sec) {
  if (!(sec > 0)) return "";
  if (sec < 60) return `${Math.round(sec)} 秒`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}

export function createTrafficLayer({ globeObject, camera, renderer, naturePopup, rig, onClose }) {
  const panel = document.getElementById("traffic-panel");
  const listEl = document.getElementById("traffic-list");
  const summaryEl = document.getElementById("traffic-summary");
  const captionEl = document.getElementById("traffic-caption");
  const refreshBtn = document.getElementById("traffic-refresh");
  const closeBtn = document.getElementById("traffic-close");
  const noop = { setEnabled() {}, isEnabled: () => false, update() {}, pickAt: () => false };
  if (!panel || !listEl) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"));

  let enabled = false;
  let timer = null;
  let sections = null;          // id -> { r, d, f, t, l, pts:[Vector3], mid:[lat,lon] }
  let loadingShapes = null;
  let live = new Map();         // id -> { speed, level, travel }
  let liveTime = null;
  let lastOk = false;

  const group = new THREE.Group();
  group.visible = false;
  globeObject.add(group);

  const size = new THREE.Vector2();
  function makeMaterial(opts) {
    const m = new LineMaterial({ transparent: true, depthWrite: false, ...opts });
    return m;
  }
  // 路況線:畫在雲層之後(renderOrder 比雲層的 1 大、而且是透明物件),雲再厚也蓋不住
  const material = makeMaterial({ vertexColors: true, linewidth: 3 });
  const lines = new LineSegments2(new LineSegmentsGeometry(), material);
  lines.renderOrder = 5;
  lines.onBeforeRender = (r) => { material.resolution.copy(r.getSize(size)); };
  group.add(lines);
  // 從清單點某一段時的白色外框高亮,幾秒後自動消失
  const hiMaterial = makeMaterial({ color: 0xffffff, linewidth: 8, opacity: 0.9 });
  const hiLines = new LineSegments2(new LineSegmentsGeometry(), hiMaterial);
  hiLines.renderOrder = 4;
  hiLines.visible = false;
  hiLines.onBeforeRender = (r) => { hiMaterial.resolution.copy(r.getSize(size)); };
  group.add(hiLines);
  let hiTimer = null;

  function loadShapes() {
    if (!loadingShapes) {
      loadingShapes = fetch(SHAPES_URL).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then((doc) => {
        sections = {};
        for (const [id, s] of Object.entries(doc.sections || {})) {
          const c = s.c || [];
          const pts = [];
          for (let i = 0; i + 1 < c.length; i += 2) pts.push(toVec3(c[i], c[i + 1]));
          if (pts.length < 2) continue;
          const m = Math.floor(c.length / 4) * 2;
          sections[id] = { ...s, pts, mid: [c[m + 1], c[m]] };
        }
      }).catch((e) => {
        loadingShapes = null;   // 下次開啟再試
        throw e;
      });
    }
    return loadingShapes;
  }

  function levelOf(id) {
    const v = live.get(id);
    return v ? v.level : 0;
  }

  function rebuildLines() {
    if (!sections) return;
    // 等級低的先畫、壅塞的最後畫:南北向線形幾乎疊在一起,讓比較塞的那一向蓋在上面
    const ids = Object.keys(sections).sort((a, b) => levelOf(a) - levelOf(b));
    const pos = [], col = [];
    const color = new THREE.Color();
    for (const id of ids) {
      const { pts } = sections[id];
      color.setHex(LEVEL_COLOR[levelOf(id)] ?? LEVEL_COLOR[0]);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        col.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    const g = new LineSegmentsGeometry();
    g.setPositions(pos);
    g.setColors(col);
    lines.geometry.dispose();
    lines.geometry = g;
  }

  function highlight(id) {
    const s = sections && sections[id];
    if (!s) return;
    const pos = [];
    for (let i = 0; i < s.pts.length - 1; i++) {
      const a = s.pts[i], b = s.pts[i + 1];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new LineSegmentsGeometry();
    g.setPositions(pos);
    hiLines.geometry.dispose();
    hiLines.geometry = g;
    hiLines.visible = true;
    clearTimeout(hiTimer);
    hiTimer = setTimeout(() => { hiLines.visible = false; }, 5000);
  }

  function sectionTitle(s) {
    return `${s.r || "國道路段"}${s.d && DIR_LABEL[s.d] ? ` ${DIR_LABEL[s.d]}` : ""}`;
  }
  function sectionRange(s) {
    return s.f && s.t ? `${s.f} → ${s.t}` : "";
  }

  function renderPanel() {
    if (!sections) {
      listEl.innerHTML = `<div class="ap-empty">載入國道路段中…</div>`;
      return;
    }
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const busy = [];
    for (const id of Object.keys(sections)) {
      const lv = levelOf(id);
      counts[lv] = (counts[lv] || 0) + 1;
      if (lv >= 2 && sections[id].r) busy.push(id);
    }
    if (!lastOk && !live.size) {
      summaryEl.textContent = "";
      listEl.innerHTML = `<div class="ap-empty">路況資料暫時查不到,稍後會自動重試</div>`;
      return;
    }
    const jam = counts[3] + counts[4] + counts[5];
    summaryEl.innerHTML = busy.length
      ? `車多以上 <b>${busy.length}</b> 段(壅塞以上 <b>${jam}</b> 段),其餘 <b>${counts[1]}</b> 段順暢`
      : `目前國道全線順暢(<b>${counts[1]}</b> 段)`;
    busy.sort((a, b) => levelOf(b) - levelOf(a) || (live.get(a).speed - live.get(b).speed));
    if (!busy.length) {
      listEl.innerHTML = `<div class="ap-empty">沒有車多或壅塞的路段,一路順風 🚗</div>`;
      return;
    }
    listEl.innerHTML = busy.slice(0, MAX_ROWS).map((id) => {
      const s = sections[id], v = live.get(id), lv = v.level;
      const travel = fmtTravel(v.travel);
      return `<div class="ap-row tf-row" data-id="${esc(id)}" title="點一下在地球上找到這一段">
        <div class="ap-row-top">
          <span class="ap-flight">${esc(s.r)} <b>${esc(DIR_LABEL[s.d] || "")}</b></span>
          <span class="ap-badge tf-l${lv}">${esc(LEVEL_LABEL[lv])}</span>
        </div>
        <div class="ap-row-mid">${esc(sectionRange(s))}</div>
        <div class="ap-row-bottom">
          <span class="tf-speed">時速 ${Math.round(v.speed)} km/h</span>
          ${s.l ? `<span>速限 ${s.l}</span>` : ""}
          ${travel ? `<span>通過約 ${travel}</span>` : ""}
        </div>
      </div>`;
    }).join("");
  }

  listEl.addEventListener("click", (e) => {
    const row = e.target.closest(".tf-row");
    if (!row || !sections) return;
    const s = sections[row.dataset.id];
    if (!s) return;
    rig && rig.flyTo(s.mid[0], s.mid[1], { distance: 1.16, ms: 900 });
    highlight(row.dataset.id);
  });

  async function refresh() {
    if (!enabled) return;
    try {
      await loadShapes();
    } catch (e) {
      console.error("[traffic] 路段線形載入失敗:", e);
      listEl.innerHTML = `<div class="ap-empty">國道路段資料載入失敗,請稍後再開一次</div>`;
      return;
    }
    try {
      const r = await fetch(`${PROXY_URL}/?tdx=freeway-live`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const doc = await r.json();
      const next = new Map();
      for (const x of doc.LiveTraffics || []) {
        const lv = parseInt(x.CongestionLevel, 10);
        next.set(x.SectionID, {
          speed: Number(x.TravelSpeed) || 0,
          level: lv >= 0 && lv <= 5 ? lv : 0,
          travel: Number(x.TravelTime) || 0,
        });
      }
      live = next;
      liveTime = doc.SrcUpdateTime || doc.UpdateTime || null;
      lastOk = true;
      if (captionEl) captionEl.textContent =
        `資料來源:交通部高速公路局(TDX)· 資料時間 ${fmtClock(liveTime)} · 每 2 分鐘更新`;
    } catch (e) {
      console.warn("[traffic] 即時路況更新失敗:", e.message);
      lastOk = false;
      if (captionEl) captionEl.textContent = live.size
        ? `更新失敗,顯示 ${fmtClock(liveTime)} 的資料,稍後會自動重試`
        : "路況資料暫時查不到,稍後會自動重試";
    }
    if (!enabled) return;
    rebuildLines();
    renderPanel();
  }

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    group.visible = enabled;
    clearInterval(timer);
    timer = null;
    if (enabled) {
      renderPanel();
      refresh();
      timer = setInterval(refresh, REFRESH_MS);
    } else {
      hiLines.visible = false;
    }
  }

  if (refreshBtn) refreshBtn.addEventListener("click", () => { if (enabled) refresh(); });
  if (closeBtn) closeBtn.addEventListener("click", () => { onClose ? onClose() : setEnabled(false); });

  // 在地球上點國道:把各路段投影到螢幕上,找離點擊位置最近的線段(像素距離)。
  // 同一條國道南北向幾乎疊在一起,另一個方向如果也在附近,一起列出來。
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3();
  function pickAt(x, y) {
    if (!enabled || !sections) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    const mw = globeObject.matrixWorld;
    const hits = [];
    for (const [id, s] of Object.entries(sections)) {
      let best = Infinity, prev = null;
      for (const p of s.pts) {
        wp.copy(p).applyMatrix4(mw);
        nrm.copy(wp).normalize();
        camTo.copy(camera.position).sub(wp).normalize();
        if (nrm.dot(camTo) < 0.05) { prev = null; continue; }   // 在地球背面
        wp.project(camera);
        const sx = rect.left + (wp.x * 0.5 + 0.5) * rect.width;
        const sy = rect.top + (-wp.y * 0.5 + 0.5) * rect.height;
        if (prev) {
          const dx = sx - prev[0], dy = sy - prev[1];
          const L2 = dx * dx + dy * dy;
          const t = L2 ? Math.max(0, Math.min(1, ((x - prev[0]) * dx + (y - prev[1]) * dy) / L2)) : 0;
          best = Math.min(best, Math.hypot(x - prev[0] - t * dx, y - prev[1] - t * dy));
        }
        prev = [sx, sy];
      }
      if (best <= PICK_PX) hits.push({ id, d: best });
    }
    if (!hits.length) return false;
    // 距離差不到 4px 視為點到同一處(南北向線幾乎重疊),以比較塞、也就是畫面上
    // 蓋在上面看得到顏色的那一向為主
    hits.sort((a, b) => (Math.floor(a.d / 4) - Math.floor(b.d / 4)) || levelOf(b.id) - levelOf(a.id) || a.d - b.d);
    const main = sections[hits[0].id];
    const describe = (id) => {
      const v = live.get(id);
      if (!v || !v.level) return "暫無即時資料";
      return `時速 ${Math.round(v.speed)} km/h · ${LEVEL_LABEL[v.level]}`;
    };
    let note = `${describe(hits[0].id)}${main.l ? `(速限 ${main.l})` : ""}`;
    const other = hits.find((h) => h.id !== hits[0].id && sections[h.id].r === main.r && sections[h.id].d !== main.d);
    if (other) note += `|${DIR_LABEL[sections[other.id].d] || "對向"}:${describe(other.id)}`;
    naturePopup.show({ icon: "🚗", zh: sectionTitle(main), en: sectionRange(main), note }, x, y);
    return true;
  }

  // 拉遠時台灣只有幾十個像素,線太粗會糊成一團;依距離調整線寬
  function update() {
    if (!enabled) return;
    const dist = camera.position.length();
    material.linewidth = dist > 2.2 ? 1.4 : dist > 1.5 ? 2.2 : 3.2;
  }

  return { setEnabled, isEnabled: () => enabled, update, pickAt };
}
