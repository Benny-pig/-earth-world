import * as THREE from "three";
import { latLonToXYZ, daysSinceJ2000, gmstDeg, subsolarPoint } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { placeLabel, hideLabel, drag } from "../lib/label-style.js";
import { makeDraggable } from "../ui/draggable.js";
import { simNow, onSimTimeChange } from "../lib/sim-time.js";
import { flyToSky } from "../lib/sky-focus.js";
import { isEn } from "../lib/i18n.js";

// 🪐 五大行星:水星、金星、火星、木星、土星放在天上真實的位置(跟太陽、月亮、星座同一套座標),
// 面板列出「今晚在台灣看得到哪幾顆、幾點、往哪個方向看」。
// 行星位置用 NASA JPL 的近似軌道根數(E. M. Standish,1800–2050 年適用,誤差約角分等級)。
const RAD = Math.PI / 180;
const R = 270;
const TAIPEI = { lat: 25.03, lon: 121.56 };
// [a, e, I, L, 近日點經度 ϖ, 升交點經度 Ω] 以及每世紀的變化量
const EL = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};
const PLANETS = [
  { id: "mercury", zh: "水星", en: "Mercury", color: [0.85, 0.82, 0.78], note: "離太陽最近的行星,只在日落後或日出前短暫出現在低空。" },
  { id: "venus", zh: "金星", en: "Venus", color: [1, 0.96, 0.84], note: "除了月亮以外夜空最亮的天體,傍晚叫「長庚星」、清晨叫「啟明星」。" },
  { id: "mars", zh: "火星", en: "Mars", color: [1, 0.55, 0.38], note: "明顯的橘紅色,大約每 26 個月最接近地球一次,那時最亮。" },
  { id: "jupiter", zh: "木星", en: "Jupiter", color: [1, 0.9, 0.74], note: "太陽系最大的行星,用小望遠鏡就看得到四顆大衛星排成一列。" },
  { id: "saturn", zh: "土星", en: "Saturn", color: [0.98, 0.86, 0.6], note: "淡金色、亮度穩定不閃爍;用小望遠鏡就能看到土星環。" },
];
const MAG = {   // 視星等(天文年曆的近似式;α = 相位角)
  mercury: (rd, a) => -0.42 + 5 * Math.log10(rd) + 0.038 * a - 0.000273 * a * a + 0.000002 * a ** 3,
  venus: (rd, a) => -4.4 + 5 * Math.log10(rd) + 0.0009 * a + 0.000239 * a * a - 0.00000065 * a ** 3,
  mars: (rd, a) => -1.52 + 5 * Math.log10(rd) + 0.016 * a,
  jupiter: (rd, a) => -9.4 + 5 * Math.log10(rd) + 0.005 * a,
  saturn: (rd, a) => -8.88 + 5 * Math.log10(rd) + 0.044 * a,
};

// 日心黃道座標(AU)
function helio(id, T) {
  const [e0, rate] = EL[id];
  const [a, e, I, L, wp, O] = e0.map((v, i) => v + rate[i] * T);
  const w = wp - O;
  let M = ((L - wp) % 360 + 540) % 360 - 180;
  const eDeg = e / RAD;
  let E = M + eDeg * Math.sin(M * RAD);
  for (let k = 0; k < 8; k++) {
    const dE = (M - (E - eDeg * Math.sin(E * RAD))) / (1 - e * Math.cos(E * RAD));
    E += dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  const xp = a * (Math.cos(E * RAD) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const cw = Math.cos(w * RAD), sw = Math.sin(w * RAD), cO = Math.cos(O * RAD), sO = Math.sin(O * RAD), cI = Math.cos(I * RAD), sI = Math.sin(I * RAD);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

// 某一刻五顆行星的赤經、赤緯、亮度、跟太陽的角距離
export function planetPositions(date) {
  const T = daysSinceJ2000(date) / 36525;
  const ea = helio("earth", T);
  const eps = 23.43928 * RAD;
  const Rsun = Math.hypot(...ea);
  return PLANETS.map((p) => {
    const h = helio(p.id, T);
    const g = [h[0] - ea[0], h[1] - ea[1], h[2] - ea[2]];
    const x = g[0], y = g[1] * Math.cos(eps) - g[2] * Math.sin(eps), z = g[1] * Math.sin(eps) + g[2] * Math.cos(eps);
    const r = Math.hypot(...h), delta = Math.hypot(...g);
    const alpha = Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - Rsun * Rsun) / (2 * r * delta)))) / RAD;
    const elong = Math.acos(Math.max(-1, Math.min(1, (Rsun * Rsun + delta * delta - r * r) / (2 * Rsun * delta)))) / RAD;
    return { ...p, ra: Math.atan2(y, x) / RAD, dec: Math.atan2(z, Math.hypot(x, y)) / RAD, delta, mag: MAG[p.id](r * delta, alpha), elong };
  });
}

// 台北看某個赤經赤緯的高度角、方位角(從北方順時針)
function altAz(ra, dec, date) {
  const H = (TAIPEI.lon - (ra - gmstDeg(daysSinceJ2000(date)))) * RAD;
  const phi = TAIPEI.lat * RAD, d = dec * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)) / RAD;
  const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) / RAD + 180 + 360) % 360;
  return { alt, az };
}
function sunAlt(date) {
  const s = subsolarPoint(date);
  const v = Math.sin(TAIPEI.lat * RAD) * Math.sin(s.lat * RAD) + Math.cos(TAIPEI.lat * RAD) * Math.cos(s.lat * RAD) * Math.cos((TAIPEI.lon - s.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, v))) / RAD;
}
const DIRS = ["北方", "東北方", "東方", "東南方", "南方", "西南方", "西方", "西北方"];
const dirOf = (az) => DIRS[Math.round(az / 45) % 8];

// 今晚(台灣時間 17:00 到隔天 07:00)每顆行星什麼時候看得到
export function tonight(date = simNow()) {
  const tw = new Date(date.getTime() + 8 * 3600000);
  let startUtc = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate(), 9);   // 當天 17:00 台灣時間
  if (tw.getUTCHours() < 7) startUtc -= 86400000;                                       // 凌晨:算「昨晚」這一夜
  const pos = planetPositions(new Date(startUtc + 7 * 3600000));
  return pos.map((p) => {
    let first = null, last = null, best = null;
    for (let k = 0; k <= 84; k++) {
      const t = new Date(startUtc + k * 600000);
      if (sunAlt(t) > -5) continue;          // 天色夠暗
      const { alt, az } = altAz(p.ra, p.dec, t);
      if (alt < 5) continue;                 // 離地平線夠高(太低會被建築、山擋住)
      if (!first) first = t;
      last = t;
      if (!best || alt > best.alt) best = { t, alt, az };
    }
    return { ...p, first, last, best };
  });
}

export function createPlanets({ scene, camera, renderer, globeObject, rig, onClose }) {
  const group = new THREE.Group();
  scene.add(group);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PLANETS.length * 3), size = new Float32Array(PLANETS.length), bright = new Float32Array(PLANETS.length), color = new Float32Array(PLANETS.length * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: `attribute float aSize; attribute float aBright; attribute vec3 aColor; uniform float uPR; varying vec3 vC; varying float vB;
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; vC = aColor; vB = aBright; }`,
    fragmentShader: `varying vec3 vC; varying float vB;
      void main() { vec2 c = gl_PointCoord - 0.5; float d2 = dot(c, c) * 4.0; if (d2 > 1.0) discard;
        float core = exp(-d2 * 6.0) + 0.25 * exp(-d2 * 1.5); gl_FragColor = vec4(vC * core * vB, 1.0); }`,
    uniforms: { uPR: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -0.85;
  group.add(pts);

  const host = document.getElementById("constellation-labels") || document.body;
  const labels = PLANETS.map((p) => {
    const el = document.createElement("div");
    el.className = "planet-label";
    el.textContent = isEn ? p.en : p.zh;
    host.appendChild(el);
    return { el, dir: new THREE.Vector3() };
  });

  let current = [];
  function place(date = simNow()) {
    group.rotation.y = -gmstDeg(daysSinceJ2000(date)) * RAD;
    current = planetPositions(date);
    current.forEach((p, i) => {
      const v = latLonToXYZ(p.dec, p.ra, 1);
      labels[i].dir.set(v.x, v.y, v.z);
      pos.set([v.x * R, v.y * R, v.z * R], i * 3);
      size[i] = THREE.MathUtils.clamp(9.5 - 1.4 * p.mag, 6, 15);
      bright[i] = THREE.MathUtils.clamp(2.2 - 0.3 * p.mag, 1, 3.2);
      color.set(p.color, i * 3);
    });
    for (const k of ["position", "aSize", "aBright", "aColor"]) geo.getAttribute(k).needsUpdate = true;
    if (enabled) render();
  }
  onSimTimeChange((d) => place(d));
  setInterval(() => place(), 10 * 60 * 1000);

  // ---------- 面板:今晚看得到哪些行星 ----------
  const panel = document.getElementById("planet-panel");
  const body = document.getElementById("planet-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("planet-close")?.addEventListener("click", () => onClose && onClose());
  let enabled = false;
  const hm = (d) => (d ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : "—");
  const magWord = (m) => (m < -3 ? "非常亮" : m < -1 ? "很亮" : m < 1 ? "明顯" : m < 3 ? "看得到" : "偏暗");
  function render() {
    if (!body) return;
    const list = tonight();
    const dateText = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short" }).format(simNow());
    body.innerHTML =
      `<div class="pl-h">🔭 ${dateText} 晚上 · 台北看得到的行星</div>` +
      list.map((p) => {
        const ok = !!p.best;
        const when = !ok ? (p.elong < 18 ? "太靠近太陽,今晚看不到" : "今晚都在地平線下")
          : `${p.last - p.first < 30 * 60000 ? `${hm(p.first)} 前後短暫出現` : `${hm(p.first)} – ${hm(p.last)}`} · 最高時在<b>${dirOf(p.best.az)}</b>、仰角 ${Math.round(p.best.alt)}°`;
        return `<button type="button" class="pl-row${ok ? "" : " off"}" data-id="${p.id}">` +
          `<span class="pl-dot" style="background:rgb(${p.color.map((c) => Math.round(c * 255)).join(",")})"></span>` +
          `<span class="pl-name">${p.zh}<small>${magWord(p.mag)} · ${p.mag.toFixed(1)} 等</small></span>` +
          `<span class="pl-when">${when}</span></button>`;
      }).join("") +
      `<div class="sat-caption">位置用 NASA JPL 的軌道公式即時計算。星等數字越小越亮(金星常在 −4 等,比最亮的恆星天狼星還亮 10 倍以上)。點一顆行星,地球會轉到看得到它的角度。</div>`;
  }
  body?.addEventListener("click", (e) => {
    const row = e.target.closest(".pl-row");
    if (row) focus(row.dataset.id);
  });
  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    if (enabled) render();
  }

  // 飛過去看某一顆(面板、搜尋共用)
  function focus(id) {
    const i = PLANETS.findIndex((p) => p.id === id);
    if (i < 0) return;
    group.updateMatrixWorld();
    const C = labels[i].dir.clone().applyAxisAngle(Y_AXIS, group.rotation.y).normalize();
    flyToSky(C, { camera, rig, globeObject });
    const p = PLANETS[i];
    return p;
  }

  // ---------- 每幀:名稱標籤 ----------
  const wp = new THREE.Vector3(), ndc = new THREE.Vector3(), toP = new THREE.Vector3();
  function update() {
    mat.uniforms.uPR.value = renderer.getPixelRatio();
    const rect = canvasRect(renderer.domElement);
    const cam = camera.position;
    for (const L of labels) {
      if (drag.active) { hideLabel(L.el); continue; }
      wp.copy(L.dir).applyAxisAngle(Y_AXIS, group.rotation.y).multiplyScalar(R);
      ndc.copy(wp).project(camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.02 || Math.abs(ndc.y) > 1.02) { hideLabel(L.el); continue; }
      toP.copy(wp).sub(cam).normalize();
      const t = -cam.dot(toP);
      if (t > 0 && cam.clone().addScaledVector(toP, t).lengthSq() < 1.02) { hideLabel(L.el); continue; }
      placeLabel(L.el, rect.left + (ndc.x * 0.5 + 0.5) * rect.width, rect.top + (-ndc.y * 0.5 + 0.5) * rect.height, "0.95", " translate(10px, -50%)");
    }
  }

  place();
  return {
    setEnabled, isEnabled: () => enabled, update, focus,
    searchItems: () => PLANETS.map((p) => ({ id: p.id, zh: p.zh, en: p.en, note: p.note })),
  };
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
