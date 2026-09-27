import * as THREE from "three";
import { latLonToXYZ, xyzToLatLon, subsolarPoint } from "../lib/geo.js";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";

// 🌌 極光即時預報:美國 NOAA 太空天氣預報中心(SWPC)的 OVATION 模型,全球 1°×1° 格點
// 「頭頂看到極光的機率」(0–100%),幾分鐘更新一次、免金鑰、可以直接從網頁讀。畫成兩層:
//   1. 貼在大氣層的光暈:從上往下看是繞著南北極的一圈綠色光環
//   2. 沿著極光帶立起來的「光簾」:斜斜看過去才看得到的垂直簾幕,底部亮綠、往上淡成紫紅,
//      簾子上有緩慢流動的光束。高度照真實比例(約 100–300 公里)
// 只在夜晚那一側亮(白天看不到極光)。
const OVATION = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const REFRESH_MS = 10 * 60 * 1000;
const RAD = Math.PI / 180;

// 熱門極光觀賞地:[名稱, 國家/地區, 緯度, 經度]
const SPOTS = [
  ["特羅姆瑟", "挪威", 69.65, 18.96], ["阿比斯庫", "瑞典", 68.35, 18.83], ["羅瓦涅米", "芬蘭", 66.5, 25.73],
  ["雷克雅維克", "冰島", 64.15, -21.94], ["費爾班克斯", "美國阿拉斯加", 64.84, -147.72], ["黃刀鎮", "加拿大", 62.45, -114.37],
  ["白馬市", "加拿大", 60.72, -135.05], ["邱吉爾", "加拿大", 58.77, -94.17], ["努克", "格陵蘭", 64.18, -51.72],
  ["莫曼斯克", "俄羅斯", 68.97, 33.08], ["荷巴特", "澳洲塔斯馬尼亞", -42.88, 147.33], ["皇后鎮", "紐西蘭", -45.03, 168.66],
  ["烏斯懷亞", "阿根廷", -54.8, -68.3],
];

const idx = (lat, lon) => (Math.round(lat) + 90) * 360 + ((Math.round(lon) % 360) + 360) % 360;

// 某地的太陽高度(度):用太陽直射點算
function sunAltitude(lat, lon, date = new Date()) {
  const s = subsolarPoint(date);
  const v = Math.sin(lat * RAD) * Math.sin(s.lat * RAD) + Math.cos(lat * RAD) * Math.cos(s.lat * RAD) * Math.cos((lon - s.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, v))) / RAD;
}

const shellVert = `
  varying vec3 vObj;
  varying vec3 vWorldN;
  void main() {
    vObj = position;
    vWorldN = normalize(mat3(modelMatrix) * position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const shellFrag = `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform float uTime;
  uniform float uFade;
  varying vec3 vObj;
  varying vec3 vWorldN;
  void main() {
    vec3 p = normalize(vObj);
    float lat = degrees(asin(clamp(p.y, -1.0, 1.0)));
    float lon = mod(degrees(atan(-p.z, p.x)) + 360.0, 360.0);
    float v = texture2D(uMap, vec2((lon + 0.5) / 360.0, (lat + 90.5) / 181.0)).r * 100.0;
    float a = smoothstep(3.0, 45.0, v);
    if (a <= 0.001) discard;
    float night = smoothstep(0.12, -0.18, dot(vWorldN, uSun));
    float shimmer = 0.75 + 0.25 * sin(radians(lon) * 38.0 + uTime * 0.9 + sin(radians(lon) * 7.0 - uTime * 0.4) * 2.0);
    vec3 green = vec3(0.22, 1.0, 0.5);
    vec3 violet = vec3(0.75, 0.3, 0.95);
    vec3 col = mix(green, violet, smoothstep(0.55, 1.0, a) * 0.35);
    gl_FragColor = vec4(col * a * shimmer * mix(0.05, 0.95, night) * uFade, 1.0);
  }
`;

const curtainVert = `
  attribute float aVal;
  attribute float aH;
  attribute float aLon;
  varying float vVal;
  varying float vH;
  varying float vLon;
  varying vec3 vWorldN;
  void main() {
    vVal = aVal; vH = aH; vLon = aLon;
    vWorldN = normalize(mat3(modelMatrix) * normalize(position));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const curtainFrag = `
  uniform vec3 uSun;
  uniform float uTime;
  uniform float uFade;
  varying float vVal;
  varying float vH;
  varying float vLon;
  varying vec3 vWorldN;
  void main() {
    float strength = smoothstep(4.0, 40.0, vVal);
    if (strength <= 0.001) discard;
    float night = smoothstep(0.1, -0.2, dot(vWorldN, uSun));
    // 光束:沿著經度方向一條條亮暗,慢慢往一邊流動
    float x = vLon * 6.2831853;
    float rays = 0.55 + 0.45 * sin(x * 140.0 + uTime * 1.6 + sin(x * 11.0 + uTime * 0.5) * 4.0);
    rays *= 0.65 + 0.35 * sin(x * 37.0 - uTime * 0.8);
    // 底部邊緣清楚、往上漸淡;上半部轉成紫紅
    float body = pow(1.0 - vH, 1.4) * smoothstep(0.0, 0.07, vH);
    vec3 green = vec3(0.25, 1.0, 0.55);
    vec3 top = vec3(0.85, 0.25, 0.7);
    vec3 col = mix(green, top, smoothstep(0.35, 0.95, vH));
    gl_FragColor = vec4(col * body * rays * strength * night * 1.5 * uFade, 1.0);
  }
`;

export function createAurora({ globe, rig, onClose }) {
  const group = new THREE.Group();
  group.visible = false;
  globe.object.add(group);

  const texData = new Uint8Array(360 * 181 * 4);
  const tex = new THREE.DataTexture(texData, 360, 181, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;

  const sunDir = new THREE.Vector3(1, 0, 0);
  const shellMat = new THREE.ShaderMaterial({
    vertexShader: shellVert, fragmentShader: shellFrag,
    uniforms: { uMap: { value: tex }, uSun: { value: sunDir }, uTime: { value: 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.012, 256, 128), shellMat);
  shell.renderOrder = 2;
  group.add(shell);

  const curtainMat = new THREE.ShaderMaterial({
    vertexShader: curtainVert, fragmentShader: curtainFrag,
    uniforms: { uSun: { value: sunDir }, uTime: { value: 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const curtains = [];

  let grid = null, meta = null, kp = null, enabled = false, timer = null, fade = 0;

  // 光簾:每 2° 經度找出極光帶的中心緯度(依機率加權)與最強機率,平滑後立成一圈簾幕
  function buildCurtain(north) {
    const COLS = 180;
    const lats = new Float32Array(COLS), vals = new Float32Array(COLS);
    for (let i = 0; i < COLS; i++) {
      const lon = i * 2;
      let best = 0, wsum = 0, lsum = 0;
      for (let a = 38; a <= 88; a++) {
        const lat = north ? a : -a;
        const v = Math.max(grid[idx(lat, lon)], grid[idx(lat, lon + 1)]);
        if (v > best) best = v;
        if (v > 3) { wsum += v; lsum += v * lat; }
      }
      lats[i] = wsum ? lsum / wsum : north ? 67 : -67;
      vals[i] = best;
    }
    const smooth = (arr, k) => {
      const out = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        let s = 0;
        for (let j = -k; j <= k; j++) s += arr[(i + j + arr.length) % arr.length];
        out[i] = s / (2 * k + 1);
      }
      return out;
    };
    const L = smooth(lats, 3), V = smooth(vals, 2);
    const n = COLS + 1;
    const pos = new Float32Array(n * 2 * 3), aVal = new Float32Array(n * 2), aH = new Float32Array(n * 2), aLon = new Float32Array(n * 2);
    const index = [];
    for (let c = 0; c < n; c++) {
      const i = c % COLS;
      const lon = i * 2, v = V[i];
      const base = 1.012, top = base + 0.012 + 0.04 * Math.min(1, v / 50);
      const b = latLonToXYZ(L[i], lon, base), t = latLonToXYZ(L[i], lon, top);
      pos.set([b.x, b.y, b.z], c * 6);
      pos.set([t.x, t.y, t.z], c * 6 + 3);
      aVal[c * 2] = aVal[c * 2 + 1] = v;
      aH[c * 2] = 0; aH[c * 2 + 1] = 1;
      aLon[c * 2] = aLon[c * 2 + 1] = c / COLS;
      if (c < n - 1) { const k = c * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aVal", new THREE.BufferAttribute(aVal, 1));
    geo.setAttribute("aH", new THREE.BufferAttribute(aH, 1));
    geo.setAttribute("aLon", new THREE.BufferAttribute(aLon, 1));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(geo, curtainMat);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    return mesh;
  }

  function applyGrid() {
    for (let i = 0; i < grid.length; i++) texData[i * 4] = Math.min(255, Math.round(grid[i] * 2.55));
    tex.needsUpdate = true;
    for (const m of curtains) { group.remove(m); m.geometry.dispose(); }
    curtains.length = 0;
    curtains.push(buildCurtain(true), buildCurtain(false));
    for (const m of curtains) group.add(m);
  }

  async function load() {
    const [ov, k] = await Promise.all([
      fetch(OVATION, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }),
      fetch(KP_URL, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const g = new Float32Array(360 * 181);
    for (const [lon, lat, v] of ov.coordinates || []) g[idx(lat, lon)] = v;
    grid = g;
    meta = { obs: ov["Observation Time"], fc: ov["Forecast Time"] };
    // K 指數:新格式是物件陣列,舊格式是「第一列是欄位名稱」的二維陣列,兩種都接受
    if (Array.isArray(k) && k.length) {
      const last = k[k.length - 1];
      const v = Array.isArray(last) ? Number(last[1]) : Number(last.Kp ?? last.kp_index);
      kp = Number.isFinite(v) ? { v, t: Array.isArray(last) ? last[0] : last.time_tag } : null;
    }
    applyGrid();
  }

  // ---------- 面板 ----------
  const panel = document.getElementById("aurora-panel");
  const body = document.getElementById("aurora-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("aurora-close")?.addEventListener("click", () => onClose && onClose());

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
    return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  };
  function kpLevel(v) {
    if (v >= 9) return ["G5 極端磁暴", "#ff4d6d"];
    if (v >= 8) return ["G4 強烈磁暴", "#ff4d6d"];
    if (v >= 7) return ["G3 強磁暴", "#ff7a45"];
    if (v >= 6) return ["G2 中度磁暴", "#ffa94d"];
    if (v >= 5) return ["G1 小型磁暴", "#ffd43b"];
    if (v >= 3) return ["活躍", "#8ce99a"];
    return ["平靜", "#9fb2d8"];
  }
  // 觀賞地附近(緯度 ±2°、經度 ±4°)的最高機率:就算不在正上方,地平線上也看得到
  function spotChance(lat, lon) {
    let m = 0;
    for (let a = -2; a <= 2; a++) for (let o = -4; o <= 4; o++) m = Math.max(m, grid[idx(lat + a, lon + o)]);
    return m;
  }
  function hemiMax(north) {
    let m = 0;
    for (let lat = 35; lat <= 90; lat++) for (let lon = 0; lon < 360; lon++) m = Math.max(m, grid[idx(north ? lat : -lat, lon)]);
    return m;
  }

  function render() {
    if (!body) return;
    if (!grid) { body.innerHTML = `<div class="ap-empty">載入 NOAA 極光預報中…</div>`; return; }
    const now = new Date();
    const spots = SPOTS.map(([zh, where, lat, lon]) => {
      const alt = sunAltitude(lat, lon, now);
      const sky = alt < -12 ? ["🌙", "天黑", 2] : alt < -0.8 ? ["🌆", "天色漸暗", 1] : ["☀️", "白天", 0];
      return { zh, where, lat, lon, p: spotChance(lat, lon), sky };
    }).sort((a, b) => b.sky[2] - a.sky[2] || b.p - a.p);
    const [lvText, lvColor] = kp ? kpLevel(kp.v) : ["—", "#9fb2d8"];
    body.innerHTML =
      `<div class="au-kp"><div class="au-kp-num" style="color:${lvColor}">Kp ${kp ? kp.v.toFixed(1) : "—"}</div>` +
      `<div><b style="color:${lvColor}">${lvText}</b><div class="au-dim">地磁活動指數 0–9,越大極光越亮、越往南擴</div></div></div>` +
      `<div class="au-hemi"><span>北半球最高 <b>${Math.round(hemiMax(true))}%</b></span><span>南半球最高 <b>${Math.round(hemiMax(false))}%</b></span></div>` +
      `<div class="au-h">📍 熱門極光地點 · 現在</div>` +
      spots.map((s) => `<button type="button" class="au-spot" data-lat="${s.lat}" data-lon="${s.lon}">` +
        `<span class="au-sky" title="${s.sky[1]}">${s.sky[0]}</span><span class="au-name">${esc(s.zh)}<small>${esc(s.where)}</small></span>` +
        `<span class="au-bar"><i style="width:${s.sky[2] ? Math.min(100, s.p) : 0}%"></i></span><b class="au-p">${s.sky[2] ? `${Math.round(s.p)}%` : "—"}</b></button>`).join("") +
      `<div class="sat-caption">綠色光環是 NOAA 太空天氣預報中心的極光預測(OVATION 模型),越亮代表頭頂看到極光的機率越高,只有天黑的地方看得到。` +
      `預報時間 ${fmtTime(meta.fc)}(台灣時間),每 10 分鐘自動更新。台灣緯度太低,只有極罕見的超強磁暴才有機會看到。</div>`;
  }
  body?.addEventListener("click", (e) => {
    const b = e.target.closest(".au-spot");
    if (b) rig.flyTo(Number(b.dataset.lat), Number(b.dataset.lon), { distance: 1.9, ms: 1400 });
  });

  // 打開時鏡頭飛到「現在是晚上」那一側的極區上空,斜斜看得到光簾(北半球夏天時改看南極)
  function flyToNight() {
    const s = subsolarPoint();
    const anti = latLonToXYZ(-s.lat, s.lon + 180, 1);
    const w = new THREE.Vector3(anti.x, anti.y, anti.z);            // 世界座標(太陽固定在直射點方向)
    w.applyQuaternion(globe.object.quaternion.clone().invert());       // 換成地球上的經緯度
    const { lon } = xyzToLatLon(w);
    rig.flyTo(s.lat > 10 ? -60 : 60, lon, { distance: 2.5, ms: 1600 });
  }

  async function refresh() {
    try { await load(); } catch (e) {
      console.warn("[aurora] 極光預報載入失敗:", e.message);
      if (body && !grid) body.innerHTML = `<div class="ap-empty">極光預報暫時讀不到(NOAA 伺服器沒有回應),稍後再試</div>`;
      return;
    }
    if (enabled) render();
  }

  async function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    clearInterval(timer);
    if (!enabled) return;
    group.visible = true;
    render();
    flyToNight();
    await refresh();
    timer = setInterval(refresh, REFRESH_MS);
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    update(elapsed, dt) {
      // 開關時淡入淡出,不要一下子出現
      fade = THREE.MathUtils.clamp(fade + (enabled && grid ? dt : -dt) * 1.5, 0, 1);
      group.visible = fade > 0;
      if (!group.visible) return;
      sunDir.copy(globe.sun.position).normalize();
      shellMat.uniforms.uTime.value = curtainMat.uniforms.uTime.value = elapsed;
      shellMat.uniforms.uFade.value = curtainMat.uniforms.uFade.value = fade;
    },
  };
}
