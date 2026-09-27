import * as THREE from "three";
import { latLonToXYZ, xyzToLatLon, daysSinceJ2000, gmstDeg, subsolarPoint, sunEclipticLon, eclipticToSubPoint } from "../lib/geo.js";
import { moonEcliptic } from "./moon.js";
import { makeDraggable } from "../ui/draggable.js";
import { canvasRect } from "../lib/view-rect.js";
import { esc } from "../lib/esc.js";

// 🌠 流星:
//   1. 平常偶爾劃過星空的零星流星(大約每 10 秒一顆,很細、一閃即逝)
//   2. 流星雨面板:一年主要的 11 場流星雨,算出下一次極大期、台灣的最佳觀賞時段(輻射點夠高、
//      天夠黑)、當晚月光干擾,還能在地球旁「看流星雨」——流星從真實方向的輻射點往外噴射
// 流星畫在很遠的天球上(比月亮遠、比星星近),被地球擋住的部分自然看不到。
const SKY_R = 150;
const POOL = 56;
const RAD = Math.PI / 180;
const TW = { lat: 23.7, lon: 121 };   // 台灣(算觀賞時段用)
const norm360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => norm360(x + 180) - 180;

// 主要流星雨(國際流星組織 IMO 年度表):活動期間、極大期那一晚(台灣晚上開始的日期)、
// 每小時天頂流星數 ZHR、輻射點赤經/赤緯(度)、進入大氣速度(km/s)、母天體
export const SHOWERS = [
  { id: "QUA", zh: "象限儀座流星雨", en: "Quadrantids", con: "牧夫座北方", from: [12, 28], to: [1, 12], night: [1, 3], zhr: 80, ra: 230, dec: 49, v: 41, parent: "小行星 2003 EH1" },
  { id: "LYR", zh: "天琴座流星雨", en: "Lyrids", con: "天琴座", from: [4, 14], to: [4, 30], night: [4, 22], zhr: 18, ra: 271, dec: 34, v: 49, parent: "柴契爾彗星" },
  { id: "ETA", zh: "寶瓶座η流星雨", en: "Eta Aquariids", con: "寶瓶座", from: [4, 19], to: [5, 28], night: [5, 5], zhr: 50, ra: 338, dec: -1, v: 66, parent: "哈雷彗星" },
  { id: "SDA", zh: "南寶瓶座δ流星雨", en: "S. Delta Aquariids", con: "寶瓶座", from: [7, 12], to: [8, 23], night: [7, 30], zhr: 25, ra: 340, dec: -16, v: 41, parent: "麥克霍茲彗星(可能)" },
  { id: "PER", zh: "英仙座流星雨", en: "Perseids", con: "英仙座", from: [7, 17], to: [8, 24], night: [8, 12], zhr: 100, ra: 48, dec: 58, v: 59, parent: "斯威夫特-塔特爾彗星" },
  { id: "DRA", zh: "天龍座流星雨", en: "Draconids", con: "天龍座", from: [10, 6], to: [10, 10], night: [10, 8], zhr: 10, ra: 262, dec: 54, v: 20, parent: "賈可比尼-津納彗星" },
  { id: "ORI", zh: "獵戶座流星雨", en: "Orionids", con: "獵戶座", from: [10, 2], to: [11, 7], night: [10, 21], zhr: 20, ra: 95, dec: 16, v: 66, parent: "哈雷彗星" },
  { id: "NTA", zh: "北金牛座流星雨", en: "N. Taurids", con: "金牛座", from: [10, 20], to: [12, 10], night: [11, 11], zhr: 5, ra: 58, dec: 22, v: 29, parent: "恩克彗星" },
  { id: "LEO", zh: "獅子座流星雨", en: "Leonids", con: "獅子座", from: [11, 6], to: [11, 30], night: [11, 17], zhr: 15, ra: 152, dec: 22, v: 71, parent: "坦普爾-塔特爾彗星" },
  { id: "GEM", zh: "雙子座流星雨", en: "Geminids", con: "雙子座", from: [12, 4], to: [12, 20], night: [12, 13], zhr: 150, ra: 112, dec: 33, v: 35, parent: "小行星法厄同" },
  { id: "URS", zh: "小熊座流星雨", en: "Ursids", con: "小熊座", from: [12, 17], to: [12, 26], night: [12, 22], zhr: 10, ra: 217, dec: 76, v: 33, parent: "塔特爾彗星" },
];

// ---------- 天文小工具 ----------
// 從「正下方的地面點」算出某地看到的高度角(度)
function altitude(sub, obs = TW) {
  const v = Math.sin(obs.lat * RAD) * Math.sin(sub.lat * RAD) + Math.cos(obs.lat * RAD) * Math.cos(sub.lat * RAD) * Math.cos((obs.lon - sub.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, v))) / RAD;
}
const radiantSub = (sh, date) => ({ lat: sh.dec, lon: wrap180(sh.ra - gmstDeg(daysSinceJ2000(date))) });
function moonAt(date) {
  const m = moonEcliptic(date);
  const D = norm360(m.lon - sunEclipticLon(m.d));
  return { sub: eclipticToSubPoint(m.lon, m.lat, m.d), illum: (1 - Math.cos(m.lat * RAD) * Math.cos(D * RAD)) / 2 };
}
// 某一年的極大期那晚:台灣時間 18:00 開始(= UTC 10:00)
const nightStart = (sh, year) => Date.UTC(year, sh.night[0] - 1, sh.night[1], 10);
function nextNight(sh, now = Date.now()) {
  const y = new Date(now).getUTCFullYear();
  for (const yy of [y - 1, y, y + 1]) { const t = nightStart(sh, yy); if (t + 12 * 3600000 > now) return t; }
  return nightStart(sh, y + 1);
}
function isActive(sh, date = new Date()) {
  const md = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const a = sh.from[0] * 100 + sh.from[1], b = sh.to[0] * 100 + sh.to[1];
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}

// 極大期那晚在台灣:天黑(太陽低於 -12°)而且輻射點夠高的時段、月光干擾、郊外每小時大約幾顆
export function nightPlan(sh, start) {
  const samples = [];
  for (let k = 0; k <= 72; k++) {
    const t = new Date(start + k * 600000);
    const moon = moonAt(t);
    samples.push({ t, sun: altitude(subsolarPoint(t)), rad: altitude(radiantSub(sh, t)), moon: altitude(moon.sub), illum: moon.illum });
  }
  const dark = samples.filter((s) => s.sun < -12);
  const maxAlt = dark.length ? Math.max(...dark.map((s) => s.rad)) : -90;
  if (maxAlt < 10) return { ok: false, maxAlt };
  const thr = maxAlt >= 28 ? Math.max(20, maxAlt * 0.7) : maxAlt * 0.8;
  const good = dark.filter((s) => s.rad >= thr);
  const peak = good.reduce((a, b) => (b.rad > a.rad ? b : a));
  const moonUp = good.filter((s) => s.moon > 0).length / good.length;
  const illum = peak.illum;
  const moonHurt = moonUp > 0.4 ? illum : 0;
  const hourly = Math.max(1, Math.round(sh.zhr * Math.sin(peak.rad * RAD) * (1 - 0.7 * moonHurt)));
  return { ok: true, from: good[0].t, to: good[good.length - 1].t, maxAlt, illum, moonUp, hourly };
}

// ---------- 流星的畫法:畫面空間寬度固定的細長光條(頭亮尾淡)+ 頭部小光點 ----------
const trailVert = `
  attribute vec3 aOther;
  attribute float aSide;
  attribute float aT;
  attribute float aAlpha;
  attribute float aHue;
  uniform vec2 uRes;
  uniform float uPR;
  varying float vT; varying float vSide; varying float vAlpha; varying float vHue;
  void main() {
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 c1 = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
    vec2 s0 = c0.xy / c0.w * uRes * 0.5, s1 = c1.xy / c1.w * uRes * 0.5;
    vec2 d = s1 - s0;
    float len = length(d);
    vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    if (aT > 0.5) dir = -dir;                 // 一律是「尾 → 頭」的方向
    vec2 n = vec2(-dir.y, dir.x);
    float w = mix(0.3, 1.7, aT) * uPR;        // 尾端很細、頭部約 3 像素寬
    c0.xy += n * aSide * w / (uRes * 0.5) * c0.w;
    gl_Position = c0;
    vT = aT; vSide = aSide; vAlpha = aAlpha; vHue = aHue;
  }
`;
const trailFrag = `
  varying float vT; varying float vSide; varying float vAlpha; varying float vHue;
  void main() {
    float a = vAlpha * pow(vT, 1.3) * (1.0 - vSide * vSide);
    vec3 head = mix(vec3(0.85, 1.0, 0.92), vec3(1.0, 0.88, 0.65), vHue);
    vec3 tail = mix(vec3(0.35, 0.85, 0.7), vec3(1.0, 0.5, 0.22), vHue);
    gl_FragColor = vec4(mix(tail, head, vT) * a * 2.2, 1.0);
  }
`;
const headVert = `
  attribute float aAlpha;
  attribute float aHue;
  uniform float uPR;
  varying float vAlpha; varying float vHue;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 7.0 * uPR * (0.6 + 0.4 * min(aAlpha, 1.6));
    vAlpha = aAlpha; vHue = aHue;
  }
`;
const headFrag = `
  varying float vAlpha; varying float vHue;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float g = exp(-dot(c, c) * 28.0);
    vec3 col = mix(vec3(0.9, 1.0, 0.95), vec3(1.0, 0.9, 0.7), vHue);
    gl_FragColor = vec4(col * g * vAlpha * 1.6, 1.0);   // 超過 1 的亮度會被泛光特效放大成光暈
  }
`;

export function createMeteors({ scene, camera, renderer, globeObject, rig, onClose }) {
  // --- 幾何:每顆流星 4 個頂點(尾兩側、頭兩側)---
  const pos = new Float32Array(POOL * 4 * 3), other = new Float32Array(POOL * 4 * 3);
  const side = new Float32Array(POOL * 4), tt = new Float32Array(POOL * 4), alpha = new Float32Array(POOL * 4), hue = new Float32Array(POOL * 4);
  const index = [];
  for (let i = 0; i < POOL; i++) {
    const k = i * 4;
    side.set([-1, 1, -1, 1], k);
    tt.set([0, 0, 1, 1], k);
    index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aOther = new THREE.BufferAttribute(other, 3);
  const aAlpha = new THREE.BufferAttribute(alpha, 1), aHue = new THREE.BufferAttribute(hue, 1);
  for (const a of [aPos, aOther, aAlpha, aHue]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", aPos);
  geo.setAttribute("aOther", aOther);
  geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  geo.setAttribute("aT", new THREE.BufferAttribute(tt, 1));
  geo.setAttribute("aAlpha", aAlpha);
  geo.setAttribute("aHue", aHue);
  geo.setIndex(index);
  const res = new THREE.Vector2(1, 1);
  const trailMat = new THREE.ShaderMaterial({
    vertexShader: trailVert, fragmentShader: trailFrag,
    uniforms: { uRes: { value: res }, uPR: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,   // 光條是在畫面上現場展開的,三角形繞向不固定,兩面都要畫
  });
  const trails = new THREE.Mesh(geo, trailMat);
  trails.frustumCulled = false;
  trails.renderOrder = -0.8;

  const hPos = new Float32Array(POOL * 3), hAlpha = new Float32Array(POOL), hHue = new Float32Array(POOL);
  const hGeo = new THREE.BufferGeometry();
  const ahPos = new THREE.BufferAttribute(hPos, 3), ahAlpha = new THREE.BufferAttribute(hAlpha, 1), ahHue = new THREE.BufferAttribute(hHue, 1);
  for (const a of [ahPos, ahAlpha, ahHue]) a.setUsage(THREE.DynamicDrawUsage);
  hGeo.setAttribute("position", ahPos);
  hGeo.setAttribute("aAlpha", ahAlpha);
  hGeo.setAttribute("aHue", ahHue);
  const headMat = new THREE.ShaderMaterial({
    vertexShader: headVert, fragmentShader: headFrag, uniforms: { uPR: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const heads = new THREE.Points(hGeo, headMat);
  heads.frustumCulled = false;
  heads.renderOrder = -0.8;
  const group = new THREE.Group();
  group.add(trails, heads);
  scene.add(group);

  const pool = Array.from({ length: POOL }, () => ({ on: false, S: new THREE.Vector3(), T: new THREE.Vector3(), t: 0, dur: 1, trail: 0.1, speed: 0.5, bright: 1, hue: 0 }));

  // --- 在畫面看得到的天空裡挑一個方向(避開地球本體) ---
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
  function randomSkyDir(out) {
    const dist = camera.position.length();
    if (dist < 1.3) return false;
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();
    const tanV = Math.tan((camera.fov * RAD) / 2) * 0.95, tanH = tanV * camera.aspect;
    const globeAng = Math.asin(Math.min(1, 1 / dist));
    for (let i = 0; i < 12; i++) {
      out.copy(fwd).addScaledVector(right, (Math.random() * 2 - 1) * tanH).addScaledVector(up, (Math.random() * 2 - 1) * tanV).normalize();
      if (out.angleTo(fwd) > globeAng + 0.02) return true;
    }
    return false;
  }

  function spawn(S, T, { trail, speed, bright, hue: h }) {
    const m = pool.find((x) => !x.on);
    if (!m) return;
    m.on = true;
    m.S.copy(S); m.T.copy(T);
    m.t = 0;
    m.trail = trail;
    m.speed = speed;
    m.dur = (trail * 1.5 + Math.random() * trail) / speed;
    m.bright = bright;
    m.hue = h;
  }

  function spawnSporadic() {
    const S = new THREE.Vector3();
    if (!randomSkyDir(S)) return;
    tmp.randomDirection();
    const T = tmp.clone().addScaledVector(S, -tmp.dot(S)).normalize();
    const fire = Math.random() < 0.04;   // 偶爾一顆特別亮的火流星
    spawn(S, T, {
      trail: (5 + Math.random() * 8) * RAD * (fire ? 1.8 : 1),
      speed: (18 + Math.random() * 26) * RAD,
      bright: fire ? 2 : 0.6 + Math.random() * 0.6,
      hue: Math.random(),
    });
  }

  // --- 流星雨模式 ---
  let shower = null;          // { sh, R: Vector3(世界座標), rate }
  let nextSporadicAt = performance.now() + 4000, nextShowerAt = 0;
  function spawnShower() {
    const S = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      if (!randomSkyDir(S)) return;
      const ang = S.angleTo(shower.R);
      if (ang < 2 * RAD || ang > 60 * RAD) continue;
      // 在 S 這一點、沿著天球「背離輻射點」的切線方向(-R 扣掉跟 S 平行的分量)
      const T = S.clone().multiplyScalar(S.dot(shower.R)).sub(shower.R).normalize();
      const k = Math.sin(ang);   // 靠近輻射點的流星看起來比較短、比較慢(透視)
      const fire = Math.random() < 0.03;
      spawn(S, T, {
        trail: THREE.MathUtils.clamp(ang * 0.4, 1.5 * RAD, 15 * RAD) * (fire ? 1.6 : 1),
        speed: (10 + shower.sh.v * 0.45) * RAD * (0.45 + 0.55 * k),
        bright: fire ? 2.2 : 0.8 + Math.random() * 0.6,
        hue: THREE.MathUtils.clamp((60 - shower.sh.v) / 40, 0, 1) * 0.8 + Math.random() * 0.2,
      });
      return;
    }
  }

  const radiantLabel = document.createElement("div");
  radiantLabel.className = "meteor-radiant";
  radiantLabel.style.display = "none";
  document.body.appendChild(radiantLabel);

  function radiantWorld(sh, date = new Date()) {
    const s = radiantSub(sh, date);
    const p = latLonToXYZ(s.lat, s.lon, 1);
    return new THREE.Vector3(p.x, p.y, p.z).normalize();   // 跟太陽、月亮同一套座標(世界固定)
  }

  function startShower(sh) {
    const R = radiantWorld(sh);
    shower = { sh, R, rate: 0.8 + sh.zhr / 45 };
    radiantLabel.textContent = `✦ ${sh.con}輻射點`;
    // 鏡頭擺到「輻射點剛好在地球上緣後面一點」:流星從地球背後往四面八方噴出來
    const dist = 4.2;
    const alpha = Math.asin(1 / dist) + 5 * RAD;
    let u = new THREE.Vector3(0, 1, 0).addScaledVector(R, -R.y);
    if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0);
    u.normalize();
    const f = R.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(u, -Math.sin(alpha));
    const camDir = f.clone().negate().applyQuaternion(globeObject.quaternion.clone().invert());
    const { lat, lon } = xyzToLatLon(camDir);
    rig.flyTo(lat, lon, { distance: dist, ms: 1800 });
    nextShowerAt = 0;
  }
  function stopShower() { shower = null; radiantLabel.style.display = "none"; }

  // ---------- 面板 ----------
  const panel = document.getElementById("meteor-panel");
  const body = document.getElementById("meteor-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("meteor-close")?.addEventListener("click", () => onClose && onClose());
  let enabled = false, selected = null, plans = new Map();

  const tzFmt = (opt) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", ...opt });
  const fmtDay = (t) => tzFmt({ month: "numeric", day: "numeric", weekday: "short" }).format(new Date(t));
  const fmtHM = (d) => tzFmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const moonIcon = (i) => (i < 0.08 ? "🌑" : i < 0.35 ? "🌒" : i < 0.65 ? "🌓" : i < 0.92 ? "🌔" : "🌕");
  const daysTo = (t) => Math.max(0, Math.ceil((t - Date.now()) / 86400000));

  function computePlans() {
    plans = new Map();
    for (const sh of SHOWERS) {
      const start = nextNight(sh);
      plans.set(sh.id, { start, plan: nightPlan(sh, start) });
    }
  }
  function upcoming() { return [...SHOWERS].sort((a, b) => plans.get(a.id).start - plans.get(b.id).start); }

  function moonText(p) {
    if (!p.ok) return "";
    if (p.moonUp < 0.4) return `${moonIcon(p.illum)} 最佳時段月亮不在天上,不受月光影響`;
    if (p.illum < 0.3) return `${moonIcon(p.illum)} 月光很弱(${Math.round(p.illum * 100)}%),很適合`;
    if (p.illum < 0.65) return `${moonIcon(p.illum)} 月光中等(${Math.round(p.illum * 100)}%),暗的流星會少一些`;
    return `${moonIcon(p.illum)} 月光很亮(${Math.round(p.illum * 100)}%),只看得到比較亮的流星`;
  }

  function render() {
    if (!body) return;
    const list = upcoming();
    const active = list.filter((s) => isActive(s));
    if (!selected) selected = (active[0] || list[0]).id;
    const sh = SHOWERS.find((s) => s.id === selected);
    const { start, plan } = plans.get(sh.id);
    const d = daysTo(start);
    const head = active.length
      ? `🔥 現在活動中:${active.map((s) => esc(s.zh)).join("、")}`
      : `下一場:${esc(list[0].zh)} · ${fmtDay(plans.get(list[0].id).start)}(${daysTo(plans.get(list[0].id).start)} 天後)`;
    body.innerHTML =
      `<div class="mt-now">${head}</div>` +
      `<div class="mt-card"><div class="mt-title">🌠 ${esc(sh.zh)} <small>${esc(sh.en)}</small></div>` +
      `<div class="mt-grid">` +
      `<span>極大期</span><b>${fmtDay(start)} 晚上 ~ 隔天清晨${d === 0 ? "(今晚!)" : `(${d} 天後)`}</b>` +
      `<span>流星數量</span><b>理想狀況每小時約 ${sh.zhr} 顆${plan.ok ? `;在台灣沒有光害的山上約 ${plan.hourly} 顆` : ""}</b>` +
      `<span>台灣最佳時段</span><b>${plan.ok ? `${fmtHM(plan.from)} – ${fmtHM(plan.to)} · 輻射點最高 ${Math.round(plan.maxAlt)}°` : "輻射點太低,台灣不容易看到"}</b>` +
      (plan.ok ? `<span>月光</span><b>${moonText(plan)}</b>` : "") +
      `<span>輻射點</span><b>${esc(sh.con)}</b>` +
      `<span>速度</span><b>${sh.v} km/s${sh.v >= 55 ? "(很快,常拖著長尾巴)" : sh.v <= 30 ? "(很慢,從容劃過)" : ""}</b>` +
      `<span>來源</span><b>${esc(sh.parent)}留下的碎屑</b></div>` +
      `<button type="button" class="tc-btn mt-play${shower && shower.sh === sh ? " on" : ""}" data-act="play">${shower && shower.sh === sh ? "⏹ 停止流星雨" : "▶ 在地球旁看流星雨"}</button></div>` +
      `<div class="mt-h">📅 接下來一年</div>` +
      list.map((s) => {
        const p = plans.get(s.id);
        return `<button type="button" class="mt-row${s.id === selected ? " on" : ""}" data-id="${s.id}">` +
          `<span class="mt-name">${isActive(s) ? "🔥 " : ""}${esc(s.zh)}</span><span class="mt-date">${fmtDay(p.start)}</span>` +
          `<span class="mt-zhr">${s.zhr}/時</span><span class="mt-moon" title="極大期月光">${p.plan.ok ? moonIcon(p.plan.illum) : "—"}</span></button>`;
      }).join("") +
      `<div class="sat-caption">日期與數量參考國際流星組織(IMO)年度預報,每年可能相差一天,實際以台北市立天文館、中央氣象署公布為準。` +
      `看流星雨要找光害少的地方,躺著看整片天空,不用盯著輻射點。畫面上的流星雨是加快的示意。</div>`;
  }
  body?.addEventListener("click", (e) => {
    const row = e.target.closest(".mt-row");
    if (row) { selected = row.dataset.id; render(); return; }
    const a = e.target.closest("[data-act=play]");
    if (!a) return;
    const sh = SHOWERS.find((s) => s.id === selected);
    if (shower && shower.sh === sh) stopShower(); else startShower(sh);
    render();
  });

  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    if (!enabled) { stopShower(); return; }
    computePlans();
    render();
  }

  // ---------- 每幀 ----------
  const S = new THREE.Vector3(), H = new THREE.Vector3(), Tl = new THREE.Vector3(), wp = new THREE.Vector3(), ndc = new THREE.Vector3();
  const at = (m, ang, out) => out.copy(m.S).multiplyScalar(Math.cos(ang)).addScaledVector(m.T, Math.sin(ang)).multiplyScalar(SKY_R);
  function update(dt) {
    const now = performance.now();
    if (now >= nextSporadicAt) {
      spawnSporadic();
      nextSporadicAt = now + (-Math.log(1 - Math.random())) * 10000;   // 平均每 10 秒一顆
    }
    if (shower && now >= nextShowerAt) {
      spawnShower();
      nextShowerAt = now + (-Math.log(1 - Math.random())) * (1000 / shower.rate);
    }
    let any = false;
    for (let i = 0; i < POOL; i++) {
      const m = pool[i];
      const k = i * 4;
      if (m.on) {
        m.t += dt;
        if (m.t >= m.dur) m.on = false;
      }
      if (!m.on) { alpha.fill(0, k, k + 4); hAlpha[i] = 0; continue; }
      any = true;
      const headAng = m.speed * m.t, tailAng = Math.max(0, headAng - m.trail);
      at(m, headAng, H); at(m, tailAng, Tl);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, m.t / m.dur)), 0.6) * m.bright;
      pos.set([Tl.x, Tl.y, Tl.z, Tl.x, Tl.y, Tl.z, H.x, H.y, H.z, H.x, H.y, H.z], k * 3);
      other.set([H.x, H.y, H.z, H.x, H.y, H.z, Tl.x, Tl.y, Tl.z, Tl.x, Tl.y, Tl.z], k * 3);
      alpha.fill(env, k, k + 4);
      hue.fill(m.hue, k, k + 4);
      hPos.set([H.x, H.y, H.z], i * 3);
      hAlpha[i] = env;
      hHue[i] = m.hue;
    }
    group.visible = any;
    if (any) {
      renderer.getDrawingBufferSize(res);
      trailMat.uniforms.uPR.value = headMat.uniforms.uPR.value = renderer.getPixelRatio();
      aPos.needsUpdate = aOther.needsUpdate = aAlpha.needsUpdate = aHue.needsUpdate = true;
      ahPos.needsUpdate = ahAlpha.needsUpdate = ahHue.needsUpdate = true;
    }
    // 輻射點標籤
    if (!shower) return;
    wp.copy(shower.R).multiplyScalar(SKY_R);
    ndc.copy(wp).project(camera);
    // 被地球擋住:鏡頭到輻射點的視線有穿過地球
    const dir = S.copy(wp).sub(camera.position).normalize();
    const tc = -camera.position.dot(dir);
    const blocked = tc > 0 && camera.position.clone().addScaledVector(dir, tc).length() < 1;
    if (blocked || ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) { radiantLabel.style.display = "none"; return; }
    const rect = canvasRect(renderer.domElement);
    radiantLabel.style.display = "";
    radiantLabel.style.transform = `translate(${Math.round(rect.left + (ndc.x * 0.5 + 0.5) * rect.width)}px, ${Math.round(rect.top + (-ndc.y * 0.5 + 0.5) * rect.height)}px) translate(-50%, -50%)`;
  }

  return {
    setEnabled, isEnabled: () => enabled, update,
    startShower, stopShower, isShowering: () => !!shower,
  };
}
