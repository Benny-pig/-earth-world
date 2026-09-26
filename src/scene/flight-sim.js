import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { esc } from "../lib/esc.js";
import { latLonToXYZ } from "../lib/geo.js";
import { makeDraggable } from "../ui/draggable.js";

// ✈️ 飛行旅程模擬:選出發地與目的地(各國首都),一架小飛機沿「大圓航線」(地球上兩點
// 最短的路線,所以台北飛美國會往北繞過阿拉斯加)飛過去,鏡頭跟著飛機走。
// 旅程壓縮成幾十秒,途中顯示已飛時間、距離、高度、地速、正在飛越哪一國,
// 還有機上廣播(起飛、供餐吃目的地的名菜、準備降落)。抵達後打開目的地介紹。
const EARTH_KM = 6371;
const CRUISE_KMH = 870;
const LOG_KEY = "earth-world.flight-log";
const SPEEDS = [
  { k: "fast", label: "⚡ 快速", sec: 25 },
  { k: "normal", label: "🙂 標準", sec: 50 },
  { k: "slow", label: "🐢 慢慢飛", sec: 100 },
];
const QUICK = ["JP", "KR", "TH", "US", "FR", "GB", "AU", "NZ"];   // 台灣旅客最常去的,放成快速按鈕
const REGIONS = [["AS", "🐼 亞洲"], ["ME", "🐪 中東"], ["EU", "🏰 歐洲"], ["NA", "🗽 北美"], ["LA", "🌮 中南美"], ["AF", "🦁 非洲"], ["OC", "🦘 大洋洲"]];

const flagImg = (code, cls = "fs-flag") => (/^[A-Z]{2}$/.test(code) ? `<img class="${cls}" src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="" onerror="this.remove()">` : "");
const fmtKm = (km) => Math.round(km).toLocaleString("en-US");
const fmtDur = (h) => { const m = Math.max(0, Math.round(h * 60)); return `${Math.floor(m / 60)} 小時 ${m % 60} 分`; };
const fmtHM = (h) => { const m = Math.max(0, Math.round(h * 60)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
function tzOffsetMin(tz, date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(date);
    const g = (t) => Number(parts.find((p) => p.type === t)?.value);
    return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - date.getTime()) / 60000);
  } catch { return 0; }
}
function fmtLocal(tz, date) {
  try { return new Intl.DateTimeFormat("zh-TW", { timeZone: tz, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date); }
  catch { return "—"; }
}
// 粗略判斷海洋名稱(不在任何國家上空時用)
function oceanName(lat, lon) {
  if (lat > 66) return "北冰洋";
  if (lat < -58) return "南冰洋";
  // 台灣附近常飛的海域叫出正確名字
  if (lon >= 118.5 && lon <= 120.6 && lat >= 22.3 && lat <= 25.6) return "台灣海峽";
  if (lon >= 119 && lon <= 127 && lat > 33.5 && lat <= 41) return "黃海";
  if (lon >= 120 && lon <= 131 && lat > 24 && lat <= 33.5) return "東海";
  // 日本海在本州「背面」:以本州中線(約從 131°E,33.7°N 斜到 140.5°E,39°N)分,中線以北才算
  if (lon > 127 && lon <= 142 && lat > 33.5 && lat <= 52 && lat > 33.7 + 0.56 * (lon - 131)) return "日本海";
  if (lon >= 20 && lon <= 120 && lat < 24) return (lon > 100 && lat > -8) ? "南海與東南亞海域" : "印度洋";
  if (lon > 120 && lon < 147 && lat < -30) return "印度洋";
  const atlWest = lat > 10 ? -98 : -70;
  if (lon > atlWest && lon < 20) return lat > 30 && lon > -6 && lon < 37 ? "地中海" : "大西洋";
  return "太平洋";
}

// 客機剪影(機頭朝 +X,平放在 XY 平面)
function planeGeometry() {
  const half = [[1, 0], [0.86, 0.07], [0.25, 0.085], [-0.08, 0.6], [-0.22, 0.6], [-0.1, 0.085], [-0.66, 0.07], [-0.84, 0.27], [-0.95, 0.27], [-0.88, 0.04], [-0.97, 0]];
  const pts = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [x, -y])];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(shape);
}

export function createFlightSim({ globeObject, camera, renderer, rig, openCountryByCode, onClose }) {
  const panel = document.getElementById("flightsim-panel");
  const body = document.getElementById("flightsim-body");
  const caption = document.getElementById("fs-caption");
  const noop = { setEnabled() {}, isEnabled: () => false, isPicking: () => false, isFlying: () => false, pick() {}, update() {} };
  if (!panel || !body) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, content = null, regions = {}, from = "TW", to = null, speed = "normal";
  let flight = null;   // 飛行中的狀態
  let arrived = null;  // 剛抵達的資訊(顯示抵達畫面用)

  const cl = () => window.__earth?.countryLayer;
  const nameOf = (code) => cl()?.meshByCode.get(code)?.userData?.names?.zh || code;
  const capOf = (code) => (content?.[code]?.capital_zh || "").split("(")[0] || nameOf(code);
  const log = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "{}"); } catch { return {}; } };

  async function loadData() {
    if (content) return;
    content = window.__earth?.content || await fetch("data/countries.content.json").then((r) => r.json());
    regions = await fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  const codes = () => Object.keys(content || {}).filter((c) => Array.isArray(content[c].capital_latlon) && cl()?.meshByCode.has(c));
  const unit = (code) => { const [lat, lon] = content[code].capital_latlon; const p = latLonToXYZ(lat, lon, 1); return new THREE.Vector3(p.x, p.y, p.z); };

  // 大圓航線:從 a 繞著 k 軸轉 ω 角到 b(兩點剛好在地球兩端時隨便挑一條經過的大圓)
  function makeRoute(a, b) {
    const omega = a.angleTo(b);
    const k = new THREE.Vector3().crossVectors(a, b);
    if (k.lengthSq() < 1e-12) { k.set(0, 1, 0).cross(a); if (k.lengthSq() < 1e-12) k.set(1, 0, 0).cross(a); }
    k.normalize();
    const ka = new THREE.Vector3().crossVectors(k, a);
    return { omega, at: (t, out = new THREE.Vector3()) => out.copy(a).multiplyScalar(Math.cos(t * omega)).addScaledVector(ka, Math.sin(t * omega)) };
  }
  // 爬升 10%、巡航、最後 12% 下降
  const prof = (t) => (t < 0.1 ? Math.sin((t / 0.1) * Math.PI / 2) : t > 0.88 ? Math.sin(Math.max(0, 1 - t) / 0.12 * Math.PI / 2) : 1);

  function plan(f, tt) {
    const route = makeRoute(unit(f), unit(tt));
    const km = route.omega * EARTH_KM;
    const hours = km / CRUISE_KMH + 0.5;   // 加上起降、滑行
    const now = new Date();
    const tzF = content[f].timezone, tzT = content[tt].timezone;
    const diffH = (tzOffsetMin(tzT, now) - tzOffsetMin(tzF, now)) / 60;
    return { route, km, hours, tzF, tzT, diffH, arrive: new Date(now.getTime() + hours * 3600000) };
  }

  // ---------- 3D:航線 + 飛機 + 影子 ----------
  const group = new THREE.Group();
  group.visible = false;
  globeObject.add(group);
  const size = new THREE.Vector2();
  const routeMat = new LineMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.55, dashed: true, dashSize: 0.012, gapSize: 0.01, depthWrite: false });
  const flownMat = new LineMaterial({ color: 0xffc94d, linewidth: 3.5, transparent: true, opacity: 0.95, depthWrite: false });
  const routeLine = new Line2(new LineGeometry(), routeMat);
  const flownLine = new Line2(new LineGeometry(), flownMat);
  routeLine.onBeforeRender = (r) => routeMat.resolution.copy(r.getSize(size));
  flownLine.onBeforeRender = (r) => flownMat.resolution.copy(r.getSize(size));
  for (const l of [routeLine, flownLine]) { l.frustumCulled = false; l.raycast = () => {}; group.add(l); }
  const pgeo = planeGeometry();
  const plane = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  const glow = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({ color: 0xffc94d, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  const shadow = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }));
  glow.renderOrder = 5; plane.renderOrder = 6; shadow.renderOrder = 2;
  for (const m of [plane, glow, shadow]) { m.raycast = () => {}; group.add(m); }

  const SEG = 160;
  function buildLines(route, HV) {
    const pos = [];
    const v = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      route.at(t, v).multiplyScalar(1.003 + HV * prof(t));
      pos.push(v.x, v.y, v.z);
    }
    routeLine.geometry.dispose(); flownLine.geometry.dispose();
    routeLine.geometry = new LineGeometry(); routeLine.geometry.setPositions(pos);
    flownLine.geometry = new LineGeometry(); flownLine.geometry.setPositions(pos);
    routeLine.computeLineDistances();
    flownLine.geometry.instanceCount = 0;
  }

  const tmpP = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpY = new THREE.Vector3(), basis = new THREE.Matrix4();
  function placePlane(route, t, HV, scale) {
    const p = route.at(Math.min(t, 0.999), tmpP).clone();
    const f = route.at(Math.min(t + 0.001, 1), tmpF).sub(p);
    f.addScaledVector(p, -f.dot(p)).normalize();          // 只留切線方向
    tmpY.crossVectors(p, f);
    basis.makeBasis(f, tmpY, p);
    const alt = 1.004 + HV * prof(t);
    for (const [m, r, s] of [[plane, alt + 0.0006, scale], [glow, alt, scale * 1.28], [shadow, 1.0035, scale]]) {
      m.position.copy(p).multiplyScalar(r);
      m.quaternion.setFromRotationMatrix(basis);
      m.scale.setScalar(s);
    }
    return p;
  }

  // ---------- 正在飛越哪裡 ----------
  const ray = new THREE.Raycaster();
  const wp = new THREE.Vector3();
  function overWhat(pLocal) {
    const layer = cl();
    wp.copy(pLocal); globeObject.localToWorld(wp);
    const dir = wp.clone().normalize();
    ray.set(dir.clone().multiplyScalar(1.6), dir.clone().negate());
    // 只看到地面為止(從 1.6 倍半徑往下 0.6 就是地表):不設限的話,在海上沒打到國家時
    // 射線會穿過地球打到「地球另一面」的國家(台灣、日本的正對面剛好是阿根廷、巴拉圭)
    ray.far = 0.65;
    if (layer) {
      const hits = ray.intersectObjects(layer.group.children, true);
      for (const h of hits) {
        let n = h.object;
        while (n && !n.userData?.code) n = n.parent;
        if (n) return { code: n.userData.code };
      }
    }
    const lat = Math.asin(Math.max(-1, Math.min(1, pLocal.y))) * 180 / Math.PI;
    const lon = Math.atan2(-pLocal.z, pLocal.x) * 180 / Math.PI;
    return { ocean: oceanName(lat, lon) };
  }

  // ---------- 機上廣播 ----------
  let capTimer = null;
  function announce(html, ms = 5200) {
    if (!caption) return;
    caption.innerHTML = html;
    caption.hidden = false;
    caption.style.animation = "none"; void caption.offsetWidth; caption.style.animation = "";
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { caption.hidden = true; }, ms);
  }
  function dishOf(code) {
    const d = content?.[code]?.food?.dishes;
    return Array.isArray(d) && d.length ? d[Math.floor(Math.random() * d.length)].zh : null;
  }

  // ---------- 飛行控制 ----------
  function takeoff() {
    if (!to || to === from) return;
    const p = plan(from, to);
    const HV = 0.014 + 0.034 * (p.route.omega / Math.PI);
    buildLines(p.route, HV);
    group.visible = true;
    const dish = dishOf(to);
    const script = [
      { t: 0.0, html: `<div class="otd-cap-k">🛫 機長廣播</div>各位旅客您好,歡迎搭乘地球世界航空,本班機由 <b>${esc(capOf(from))}</b> 飛往 <b>${esc(capOf(to))}</b>,飛行距離 ${fmtKm(p.km)} 公里、約 ${fmtDur(p.hours)}。請繫好安全帶,我們準備起飛!` },
      { t: 0.12, html: `<div class="otd-cap-k">🔔 客艙廣播</div>安全帶指示燈已經熄滅,可以在客艙內走動。目前巡航高度約 11,000 公尺,窗外就是地球最美的樣子。` },
      ...(dish ? [{ t: 0.32, html: `<div class="otd-cap-k">🍱 供餐時間</div>今天的機上特別餐,是${esc(nameOf(to))}的「<b>${esc(dish)}</b>」,先嚐嚐當地的味道,祝您用餐愉快!` }] : []),
      ...(p.hours > 6 ? [{ t: 0.55, html: `<div class="otd-cap-k">😴 客艙廣播</div>客艙燈光即將調暗,想休息的旅客可以拉下遮光板。${Math.abs(p.diffH) >= 3 ? `目的地和出發地時差 ${Math.abs(p.diffH)} 小時,記得調整作息喔!` : ""}` }] : []),
      { t: 0.86, html: `<div class="otd-cap-k">🛬 機長廣播</div>本班機即將開始下降,預計 ${fmtDur(p.hours * 0.14)} 後抵達 <b>${esc(capOf(to))}</b>。請豎直椅背、收起餐桌,繫好安全帶。` },
    ];
    flight = { ...p, from, to, HV, t: 0, dur: SPEEDS.find((s) => s.k === speed).sec, paused: false, script, si: 0,
      depart: new Date(), over: null, overAt: 0, hudAt: 0, following: true, wantDist: 2.3 };
    arrived = null;
    window.__earth?.sidePanel?.isOpen() && window.__earth.sidePanel.close();
    cl()?.setSelected(null);
    renderFlying();
  }

  function land() {
    const f = flight;
    flight = null;
    const l = log();
    const next = { n: (l.n || 0) + 1, km: (l.km || 0) + f.km };
    try { localStorage.setItem(LOG_KEY, JSON.stringify(next)); } catch { /* 存不了就算了 */ }
    arrived = { from: f.from, to: f.to, km: f.km, hours: f.hours, local: fmtLocal(f.tzT, new Date(f.depart.getTime() + f.hours * 3600000)) };
    announce(`<div class="otd-cap-k">🎉 歡迎抵達</div>歡迎來到 <b>${esc(nameOf(f.to))}・${esc(capOf(f.to))}</b>!當地時間 ${esc(arrived.local)}。感謝搭乘地球世界航空,祝您旅途愉快!`, 6500);
    setTimeout(() => { group.visible = false; }, 400);
    openCountryByCode(f.to);   // 飛到首都、打開介紹
    renderArrived();
  }

  function stopFlight() {
    flight = null;
    group.visible = false;
    if (caption) caption.hidden = true;
  }

  // 讀者自己拖曳地球 = 想自己看,先不跟著飛機(滾輪縮放不算,縮放後照樣跟)
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!downAt || !flight || !flight.following || !(e.buttons & 1)) return;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { flight.following = false; renderFlying(); }
  });
  window.addEventListener("pointerup", () => { downAt = null; });
  renderer.domElement.addEventListener("wheel", () => { if (flight) flight.wantDist = null; }, { passive: true });

  // ---------- 面板 ----------
  function options(sel) {
    const list = codes();
    const coll = (() => { try { return new Intl.Collator("zh-TW-u-co-zhuyin"); } catch { return new Intl.Collator("zh-TW"); } })();
    return REGIONS.map(([rk, rl]) => {
      const cs = list.filter((c) => regions[c] === rk).sort((a, b) => coll.compare(nameOf(a), nameOf(b)));
      if (!cs.length) return "";
      return `<optgroup label="${rl}">${cs.map((c) => `<option value="${c}"${c === sel ? " selected" : ""}>${esc(nameOf(c))} · ${esc(capOf(c))}</option>`).join("")}</optgroup>`;
    }).join("");
  }

  function renderSetup() {
    const ok = to && to !== from;
    const p = ok ? plan(from, to) : null;
    const l = log();
    body.innerHTML =
      `<div class="fs-row"><label>🛫 出發</label><select id="fs-from">${options(from)}</select></div>` +
      `<div class="fs-row"><label>🛬 目的地</label><select id="fs-to"><option value="">— 選一個國家 —</option>${options(to)}</select>` +
      `<button type="button" class="tc-btn fs-rand" data-act="random" title="隨機目的地">🎲</button></div>` +
      `<div class="fs-quick">${QUICK.filter((c) => c !== from).map((c) => `<button type="button" data-to="${c}" class="${c === to ? "on" : ""}">${flagImg(c)}${esc(nameOf(c))}</button>`).join("")}</div>` +
      `<div class="fs-hint">👉 也可以直接<b>點地球上的國家</b>當目的地</div>` +
      (p ? `<div class="fs-plan"><div class="fs-route">${flagImg(from)}${esc(capOf(from))}<span class="fs-arrow">✈</span>${flagImg(to)}${esc(capOf(to))}</div>` +
        `<div class="fs-grid"><span>📏 距離</span><b>${fmtKm(p.km)} 公里</b><span>⏱️ 飛行時間</span><b>約 ${fmtDur(p.hours)}</b>` +
        `<span>🕐 時差</span><b>${p.diffH === 0 ? "沒有時差" : `${p.diffH > 0 ? "快" : "慢"} ${Math.abs(p.diffH)} 小時`}</b>` +
        `<span>🛬 現在出發</span><b>抵達當地 ${esc(fmtLocal(p.tzT, p.arrive))}</b></div></div>` : "") +
      `<div class="fs-speed">${SPEEDS.map((s) => `<button type="button" data-speed="${s.k}" class="${s.k === speed ? "on" : ""}">${s.label}<small>${s.sec} 秒</small></button>`).join("")}</div>` +
      `<button type="button" class="fs-go" data-act="go"${ok ? "" : " disabled"}>${ok ? "✈️ 起飛!" : "先選一個目的地"}</button>` +
      (l.n ? `<div class="fs-log">🧾 我的飛行紀錄:${l.n} 趟 · ${fmtKm(l.km)} 公里(繞地球 ${(l.km / 40075).toFixed(2)} 圈)</div>` : "");
  }

  function renderFlying() {
    const f = flight;
    body.innerHTML =
      `<div class="fs-route">${flagImg(f.from)}${esc(capOf(f.from))}<span class="fs-arrow">✈</span>${flagImg(f.to)}${esc(capOf(f.to))}</div>` +
      `<div class="fs-prog"><i id="fs-bar"></i><span id="fs-pl">✈</span></div>` +
      `<div class="fs-grid fs-live">` +
      `<span>已飛</span><b id="fs-el">0:00</b><span>剩餘</span><b id="fs-rem">—</b>` +
      `<span>距離</span><b id="fs-km">0 km</b><span>高度</span><b id="fs-alt">0 m</b>` +
      `<span>地速</span><b id="fs-spd">0 km/h</b><span>飛越</span><b id="fs-over">—</b>` +
      `<span>${esc(capOf(f.from))}</span><b id="fs-tf">—</b><span>${esc(capOf(f.to))}</span><b id="fs-tt">—</b></div>` +
      `<div class="quiz-actions fs-btns"><button type="button" class="tc-btn" data-act="pause">${f.paused ? "▶ 繼續" : "⏸ 暫停"}</button>` +
      (f.following ? "" : `<button type="button" class="tc-btn fs-follow" data-act="follow">📍 跟著飛機</button>`) +
      `<button type="button" class="tc-btn" data-act="stop">⏹ 結束飛行</button></div>`;
    f.hudAt = 0;
  }

  function renderArrived() {
    const a = arrived;
    const l = log();
    body.innerHTML = `<div class="fs-arrived"><div class="fs-big">🎉 抵達 ${esc(capOf(a.to))}!</div>` +
      `<div class="fs-route">${flagImg(a.from)}${esc(capOf(a.from))}<span class="fs-arrow">✈</span>${flagImg(a.to)}${esc(capOf(a.to))}</div>` +
      `<div>飛了 <b>${fmtKm(a.km)}</b> 公里 · 約 ${fmtDur(a.hours)}<br>當地時間 ${esc(a.local)}</div>` +
      `<div class="fs-log">🧾 累計 ${l.n || 0} 趟 · ${fmtKm(l.km || 0)} 公里(繞地球 ${((l.km || 0) / 40075).toFixed(2)} 圈)</div>` +
      `<div class="quiz-actions fs-btns"><button type="button" class="tc-btn" data-act="more">📖 認識${esc(nameOf(a.to))}</button>` +
      `<button type="button" class="tc-btn" data-act="back">↩️ 飛回程</button><button type="button" class="tc-btn quiz-next" data-act="new">🗺️ 再飛一趟</button></div></div>`;
  }

  function render() { if (flight) renderFlying(); else if (arrived) renderArrived(); else renderSetup(); }

  function hud() {
    const f = flight;
    const $ = (id) => document.getElementById(id);
    if (!$("fs-bar")) return;
    const el = f.hours * f.t;
    const pr = prof(f.t);
    $("fs-bar").style.width = `${f.t * 100}%`;
    $("fs-pl").style.left = `${f.t * 100}%`;
    $("fs-el").textContent = fmtHM(el);
    $("fs-rem").textContent = fmtHM(f.hours - el);
    $("fs-km").textContent = `${fmtKm(f.km * f.t)} / ${fmtKm(f.km)} km`;
    $("fs-alt").textContent = `${fmtKm(11000 * pr)} m`;
    $("fs-spd").textContent = `${fmtKm(230 + (CRUISE_KMH - 230) * pr)} km/h`;
    const o = f.over;
    $("fs-over").innerHTML = o ? (o.code ? `${flagImg(o.code)}${esc(nameOf(o.code))}` : `🌊 ${esc(o.ocean)}`) : "—";
    const now = new Date(f.depart.getTime() + el * 3600000);
    $("fs-tf").textContent = fmtLocal(f.tzF, now);
    $("fs-tt").textContent = fmtLocal(f.tzT, now);
  }

  body.addEventListener("change", (e) => {
    if (e.target.id === "fs-from") { from = e.target.value; if (to === from) to = null; renderSetup(); }
    else if (e.target.id === "fs-to") { to = e.target.value || null; previewRoute(); renderSetup(); }
  });
  body.addEventListener("click", (e) => {
    const q = e.target.closest("[data-to]");
    if (q) { to = q.dataset.to; previewRoute(); renderSetup(); return; }
    const s = e.target.closest("[data-speed]");
    if (s) { speed = s.dataset.speed; renderSetup(); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    if (act === "random") { const cs = codes().filter((c) => c !== from); to = cs[Math.floor(Math.random() * cs.length)]; previewRoute(); renderSetup(); }
    else if (act === "go") takeoff();
    else if (act === "pause" && flight) { flight.paused = !flight.paused; renderFlying(); }
    else if (act === "follow" && flight) { flight.following = true; renderFlying(); }
    else if (act === "stop") { stopFlight(); rig.resetView({ keepDirection: true }); renderSetup(); }
    else if (act === "more" && arrived) window.__earth?.encyclopedia?.open(arrived.to);
    else if (act === "back" && arrived) { [from, to] = [arrived.to, arrived.from]; arrived = null; closeSide(); takeoff(); }
    else if (act === "new" && arrived) { from = arrived.to; to = null; arrived = null; closeSide(); renderSetup(); }
  });
  const closeSide = () => { window.__earth?.sidePanel?.isOpen() && window.__earth.sidePanel.close(); };
  document.getElementById("flightsim-close")?.addEventListener("click", () => onClose && onClose());

  // 選好目的地:先畫出航線、把鏡頭轉到航線中間讓讀者看看要飛去哪
  function previewRoute() {
    if (!to || to === from) { group.visible = false; return; }
    const p = plan(from, to);
    const HV = 0.014 + 0.034 * (p.route.omega / Math.PI);
    buildLines(p.route, HV);
    placePlane(p.route, 0, HV, 0.03);
    group.visible = true;
    const mid = p.route.at(0.5);
    const lat = Math.asin(mid.y) * 180 / Math.PI, lon = Math.atan2(-mid.z, mid.x) * 180 / Math.PI;
    rig.flyTo(lat, lon, { distance: Math.min(3.4, 2.1 + p.route.omega * 0.9), ms: 1000 });
  }

  // ---------- 每幀更新(由主迴圈呼叫) ----------
  const camDir = new THREE.Vector3();
  function update(dt) {
    const f = flight;
    if (!f) return;
    if (!f.paused) f.t = Math.min(1, f.t + dt / f.dur);
    const camDist = camera.position.length();
    const scale = Math.max(0.012, Math.min(0.06, 0.022 * (camDist - 1) + 0.004));
    const p = placePlane(f.route, f.t, f.HV, scale);
    flownLine.geometry.instanceCount = Math.floor(f.t * SEG);
    // 鏡頭跟著飛機(方向平滑追上;一開始順便拉近到適合的距離)
    if (f.following) {
      camDir.copy(p); globeObject.localToWorld(camDir); camDir.normalize();
      let d = camDist;
      if (f.wantDist) d += (f.wantDist - camDist) * (1 - Math.exp(-dt * 1.6));
      const k = 1 - Math.exp(-dt * 2.2);
      camera.position.normalize().lerp(camDir, k).normalize().multiplyScalar(d);
      camera.lookAt(0, 0, 0);
    }
    const now = performance.now();
    if (now - f.overAt > 300) { f.overAt = now; f.over = overWhat(p); }
    while (f.si < f.script.length && f.t >= f.script[f.si].t) { announce(f.script[f.si].html); f.si++; }
    if (now - f.hudAt > 120) { f.hudAt = now; hud(); }
    if (f.t >= 1) land();
  }

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (!enabled) {
      if (flight) { stopFlight(); rig.resetView({ keepDirection: true }); }
      group.visible = false; arrived = null;
      if (caption) caption.hidden = true;
      return;
    }
    body.innerHTML = `<div class="ap-empty">準備登機中…</div>`;
    try { await loadData(); } catch { body.innerHTML = `<div class="ap-empty">資料載入失敗,稍後再試</div>`; return; }
    if (enabled) render();
  }

  return {
    setEnabled, update,
    isEnabled: () => enabled,
    isFlying: () => enabled && !!flight,
    isPicking: () => enabled && !flight && !arrived,
    pick(code) { if (code && code !== from && content?.[code]?.capital_latlon) { to = code; previewRoute(); renderSetup(); } },
  };
}
