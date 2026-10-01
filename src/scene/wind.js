import * as THREE from "three";
import { LITE } from "../lib/device.js";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";
import { isEn } from "../lib/i18n.js";

// 🌬️ 全球風場:幾千條細線沿著真實的風流動(NOAA GFS 預報,離地 10 公尺的風,1° 網格),
// 顏色代表風速。資料由 GitHub Actions 每 6 小時更新一次(tools/build-wind.py)。
// 效能:每條線有 K 段尾巴,放在「環狀」的格子裡——每隔 TICK 秒只改寫其中一格(整塊連續記憶體),
// 尾巴的淡出交給顯示卡(依每段的誕生時間算透明度),每一幀只需要更新最前面那一小段。
const REMOTE = "https://raw.githubusercontent.com/Benny-pig/-earth-world/wind-data/wind.json";
const LOCAL = "data/wind.json";
const R = 1.009;              // 比雲層(1.006)高一點
const N = LITE ? 2200 : 5500; // 粒子數
const K = 12;                 // 每條尾巴幾段
const TICK = 0.06;            // 每隔多久記一段尾巴(秒)
const SPEED = 0.45;           // 1 m/s 的風,畫面上每秒移動幾度
const DEG = Math.PI / 180;
// 風速色階(m/s):viridis 色系(紫 → 藍 → 綠 → 黃 → 白),亮度一路遞增,色盲也分得出強弱;最弱的那端調亮一點,在深色地球上才看得到
const STOPS = [[0, 0x6a5bb0], [3, 0x3e6fb0], [6, 0x2a8f9e], [9, 0x26a982], [13, 0x5cc863], [18, 0xaadc32], [25, 0xfde725], [35, 0xffffff]];
const STOP_COLORS = STOPS.map(([, h]) => new THREE.Color(h));
const BEAUFORT = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
const BF_NAME = isEn
  ? ["calm", "light air", "light breeze", "gentle breeze", "moderate breeze", "fresh breeze", "strong breeze", "near gale", "gale", "strong gale", "storm", "violent storm", "hurricane force"]
  : ["無風", "軟風", "輕風", "微風", "和風", "清風", "強風", "疾風", "大風", "烈風", "狂風", "暴風", "颶風"];
const DIRS = isEn
  ? ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  : ["北", "北北東", "東北", "東北東", "東", "東南東", "東南", "南南東", "南", "南南西", "西南", "西南西", "西", "西北西", "西北", "北北西"];
const SPOTS = isEn ? {
  tw: [23.7, 121, 2.3, "📍 Around Taiwan", "The northeast monsoon blows in autumn and winter, the southwest monsoon in summer; when a typhoon comes close, the lines here curl into a huge swirl."],
  trade: [15, -40, 2.7, "⛵ Trade winds", "Steady easterly winds on both sides of the equator all year round. Sailing ships rode them across the Atlantic in the Age of Discovery."],
  roaring: [-50, 40, 2.7, "🌊 Roaring Forties", "Between 40° and 60° south there is almost no land in the way, so strong westerlies blow all year — sailors called them the Roaring Forties and Furious Fifties."],
} : {
  tw: [23.7, 121, 2.3, "📍 台灣附近", "秋冬吹東北季風、夏天吹西南季風;颱風接近時,這裡的線會繞成一個大漩渦。"],
  trade: [15, -40, 2.7, "⛵ 信風帶", "赤道兩側一年到頭從東邊吹來的風。大航海時代的帆船就是順著它橫渡大西洋。"],
  roaring: [-50, 40, 2.7, "🌊 咆哮西風帶", "南緯 40 到 60 度一整圈幾乎沒有陸地擋,西風終年強勁,水手叫它「咆哮四十度、狂暴五十度」。"],
};

export const beaufort = (s) => { let b = 0; while (b < BEAUFORT.length && s >= BEAUFORT[b]) b++; return b; };
export const windFrom = (u, v) => DIRS[Math.round((((Math.atan2(-u, -v) / DEG) + 360) % 360) / 22.5) % 16];

export function createWind({ globeObject, camera, rig, clouds, countryName, onClose }) {
  const panel = document.getElementById("wind-panel");
  const body = document.getElementById("wind-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("wind-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("wind-min");
  function setMin(on) {
    panel?.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  let enabled = false, hidden = false, grid = null, loading = null, lines = null, spot = null, cloudsWas = true;

  // ---------- 資料 ----------
  async function load() {
    let j = null;
    // 本機開發時 wind-data 分支的檔案不一定有,先用專案裡的備份
    const dev = ["localhost", "127.0.0.1"].includes(location.hostname);
    for (const url of dev ? [LOCAL, REMOTE] : [REMOTE, LOCAL]) {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (r.ok) { j = await r.json(); break; }
      } catch { /* 換下一個來源 */ }
    }
    if (!j) return;
    const dec = (b64) => {
      const s = atob(b64), out = new Float32Array(s.length);
      for (let i = 0; i < s.length; i++) { const b = s.charCodeAt(i); out[i] = (b > 127 ? b - 256 : b) * j.step; }
      return out;
    };
    grid = { ...j, u: dec(j.u), v: dec(j.v) };
    // 全球風最強的格子(給「現在風最強的地方」按鈕)
    let best = 0, bi = 0;
    for (let i = 0; i < grid.u.length; i++) { const s = grid.u[i] * grid.u[i] + grid.v[i] * grid.v[i]; if (s > best) { best = s; bi = i; } }
    grid.maxAt = [grid.lat0 + Math.floor(bi / grid.nx) * grid.dlat, grid.lon0 + (bi % grid.nx) * grid.dlon, Math.sqrt(best)];
  }
  // 雙線性內插;回傳到 out[0]=u, out[1]=v
  function sample(lat, lon, out) {
    const g = grid;
    const x = ((((lon - g.lon0) % 360) + 360) % 360) / g.dlon;
    const y = Math.min(g.ny - 1.001, Math.max(0, (lat - g.lat0) / g.dlat));
    const i0 = Math.floor(x) % g.nx, i1 = (i0 + 1) % g.nx, j0 = Math.floor(y), j1 = j0 + 1;
    const fx = x - Math.floor(x), fy = y - j0;
    const a = j0 * g.nx, b = j1 * g.nx;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out[0] = g.u[a + i0] * w00 + g.u[a + i1] * w10 + g.u[b + i0] * w01 + g.u[b + i1] * w11;
    out[1] = g.v[a + i0] * w00 + g.v[a + i1] * w10 + g.v[b + i0] * w01 + g.v[b + i1] * w11;
    return out;
  }
  function colorOf(s, target) {
    let k = 1;
    while (k < STOPS.length - 1 && s > STOPS[k][0]) k++;
    const [s0] = STOPS[k - 1], [s1] = STOPS[k];
    return target.copy(STOP_COLORS[k - 1]).lerp(STOP_COLORS[k], Math.min(1, Math.max(0, (s - s0) / (s1 - s0))));
  }

  // ---------- 粒子與線 ----------
  const lat = new Float32Array(N), lon = new Float32Array(N), age = new Float32Array(N), maxAge = new Float32Array(N);
  const last = new Float32Array(N * 3);   // 上一個尾巴節點的位置
  const spd = new Float32Array(N);
  let pos, tint, birth, slot = 0, tickAcc = 0, now = 0;
  const uv = [0, 0], tmpC = new THREE.Color();

  function xyz(la, lo, arr, o) {
    const c = Math.cos(la * DEG);
    arr[o] = R * c * Math.cos(lo * DEG); arr[o + 1] = R * Math.sin(la * DEG); arr[o + 2] = -R * c * Math.sin(lo * DEG);
  }
  function spawn(p, randomAge) {
    lat[p] = Math.asin(Math.random() * 2 - 1) / DEG;
    lon[p] = Math.random() * 360 - 180;
    maxAge[p] = 2.5 + Math.random() * 3;
    age[p] = randomAge ? Math.random() * maxAge[p] : 0;
    xyz(lat[p], lon[p], last, p * 3);
  }
  function build() {
    const S = N * (K + 1);
    pos = new Float32Array(S * 6);
    tint = new Float32Array(S * 6);
    birth = new Float32Array(S * 2).fill(-1e6);   // 還沒畫過的段:完全透明
    for (let p = 0; p < N; p++) { spawn(p, true); birth[p * 2] = birth[p * 2 + 1] = 1e9; }   // 最前面那段永遠不透明
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("tint", new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("birth", new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { now: { value: 0 }, life: { value: K * TICK }, opacity: { value: 0.9 } },
      vertexShader: `attribute vec3 tint; attribute float birth; uniform float now; uniform float life;
        varying vec3 vC; varying float vA;
        void main() {
          vC = tint;
          vA = birth > 1.0e8 ? 1.0 : clamp(1.0 - (now - birth) / life, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform float opacity; varying vec3 vC; varying float vA;
        void main() { if (vA <= 0.01) discard; gl_FragColor = vec4(vC, vA * opacity); }`,
      transparent: true, depthWrite: false, depthTest: true,
    });
    lines = new THREE.LineSegments(geom, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 5;
    lines.raycast = () => {};   // 不影響點國家
    globeObject.add(lines);
  }

  function step(dt) {
    const geom = lines.geometry;
    const aPos = geom.attributes.position, aTint = geom.attributes.tint, aBirth = geom.attributes.birth;
    dt = Math.min(dt, 0.05);
    now += dt;
    lines.material.uniforms.now.value = now;
    for (let p = 0; p < N; p++) {
      sample(lat[p], lon[p], uv);
      const s = Math.hypot(uv[0], uv[1]);
      spd[p] = s;
      lat[p] += uv[1] * SPEED * dt;
      lon[p] += (uv[0] * SPEED * dt) / Math.max(0.15, Math.cos(lat[p] * DEG));
      if (lon[p] > 180) lon[p] -= 360; else if (lon[p] < -180) lon[p] += 360;
      age[p] += dt;
      if (age[p] > maxAge[p] || lat[p] > 88 || lat[p] < -88) spawn(p, false);
      // 最前面那段:上一個節點 → 目前位置
      const o = p * 6;
      pos[o] = last[p * 3]; pos[o + 1] = last[p * 3 + 1]; pos[o + 2] = last[p * 3 + 2];
      xyz(lat[p], lon[p], pos, o + 3);
    }
    aPos.clearUpdateRanges();
    aPos.addUpdateRange(0, N * 6);
    tickAcc += dt;
    if (tickAcc >= TICK) {
      tickAcc -= TICK;
      slot = (slot + 1) % K;
      const base = N * (1 + slot);
      for (let p = 0; p < N; p++) {
        const o = (base + p) * 6, h = p * 6;
        for (let k = 0; k < 6; k++) pos[o + k] = pos[h + k];
        // 剛出生、快消失的線顏色淡一點(看起來是淡入淡出)
        const fade = Math.min(1, age[p] / 0.6, (maxAge[p] - age[p]) / 0.6);
        colorOf(spd[p], tmpC).multiplyScalar(Math.max(0.05, fade));
        for (const t of [o, h]) { tint[t] = tint[t + 3] = tmpC.r; tint[t + 1] = tint[t + 4] = tmpC.g; tint[t + 2] = tint[t + 5] = tmpC.b; }
        birth[(base + p) * 2] = birth[(base + p) * 2 + 1] = now;
        last[p * 3] = pos[h + 3]; last[p * 3 + 1] = pos[h + 4]; last[p * 3 + 2] = pos[h + 5];
      }
      aPos.addUpdateRange(base * 6, N * 6);
      aTint.clearUpdateRanges();
      aTint.addUpdateRange(0, N * 6);
      aTint.addUpdateRange(base * 6, N * 6);
      aTint.needsUpdate = true;
      aBirth.clearUpdateRanges();
      aBirth.addUpdateRange(base * 2, N * 2);
      aBirth.needsUpdate = true;
    }
    aPos.needsUpdate = true;
  }

  // ---------- 面板 ----------
  const fmtTime = (iso) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  function describe(la, lo) {
    const [u, v] = sample(la, lo, [0, 0]);
    const s = Math.hypot(u, v), b = beaufort(s);
    if (isEn) return `${s < 0.3 ? "Almost calm" : `${windFrom(u, v)} wind`} <b>${s.toFixed(1)} m/s</b> (${Math.round(s * 3.6)} km/h) · force ${b}, ${BF_NAME[b]}`;
    return `${s < 0.3 ? "幾乎沒有風" : `${windFrom(u, v)}風`} <b>${s.toFixed(1)} m/s</b>(時速 ${Math.round(s * 3.6)} 公里)· ${b} 級${BF_NAME[b]}`;
  }
  const legend = () => `<div class="wd-legend"><div class="wd-bar" style="background:linear-gradient(90deg,${STOPS.map(([s, h]) => `#${h.toString(16).padStart(6, "0")} ${Math.round((s / 35) * 100)}%`).join(",")})"></div>` +
    `<div class="wd-ticks">${[0, 5, 10, 15, 20, 25, 30, 35].map((s) => `<span style="left:${(s / 35) * 100}%">${s}</span>`).join("")}</div><div class="wd-unit">${isEn ? "Wind speed (m/s)" : "風速 m/s(公尺/秒)"}</div></div>`;
  function render() {
    if (!body) return;
    if (!grid) { body.innerHTML = `<div class="ap-empty">${loading ? (isEn ? "Loading global winds…" : "讀取全球風場資料中…") : (isEn ? "Wind data is unavailable right now. Please try again later." : "風場資料暫時讀不到,稍後再試")}</div>`; return; }
    const age = (Date.now() - new Date(grid.valid)) / 3600000;
    const [mla, mlo, ms] = grid.maxAt;
    body.innerHTML =
      `<div class="wd-time">🕘 ${isEn ? `Winds at ${fmtTime(grid.valid)} (Taiwan time)` : `${fmtTime(grid.valid)}(台灣時間)的風`}${age > 18 ? `<span class="wd-old">${isEn ? "older data" : "資料有點舊"}</span>` : ""}</div>` +
      `<div class="wd-here"><small>📍 ${isEn ? "Centre of view" : "畫面中央"} <span class="wd-place"></span></small><div class="wd-read"></div></div>` +
      legend() +
      `<div class="mt-h">${isEn ? "Go and see" : "去看看"}</div><div class="pl-btns">` +
      `<button type="button" class="tc-btn" data-spot="max">${isEn ? `🌀 Strongest wind right now (${ms.toFixed(0)} m/s)` : `🌀 現在風最強的地方(${ms.toFixed(0)} m/s)`}</button>` +
      Object.entries(SPOTS).map(([k, s]) => `<button type="button" class="tc-btn" data-spot="${k}">${s[3]}</button>`).join("") + `</div>` +
      `<div class="wd-note"${spot ? "" : " hidden"}>${spot ? spot : ""}</div>` +
      `<div class="sat-caption">${isEn
        ? "Data: US NOAA GFS global forecast model (wind 10 m above ground, 1° grid), updated every 6 hours. Longer, brighter lines mean stronger wind; the strongest winds are usually in typhoons, extratropical storms or the Southern Ocean. A model is not an observation — winds near a typhoon's centre are underestimated."
        : "資料:美國 NOAA GFS 全球預報模式(離地 10 公尺的風,1° 網格),每 6 小時更新。線越長越亮代表風越強;最強風多半在颱風、溫帶氣旋或南大洋。預報模式不是實際觀測,颱風中心的風速會比實際低一些。"}</div>`;
    centerReadout();
  }
  const latLonText = (la, lo) => {
    const L = Math.abs(la).toFixed(0), G = Math.abs(((lo + 540) % 360) - 180).toFixed(0);
    return isEn ? `${L}°${la >= 0 ? "N" : "S"} ${G}°${lo >= 0 ? "E" : "W"}` : `${la >= 0 ? "北緯" : "南緯"} ${L}°、${lo >= 0 ? "東經" : "西經"} ${G}°`;
  };
  function centerLatLon() {
    const d = camera.position.clone().normalize().applyQuaternion(globeObject.quaternion.clone().invert());
    return [Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) / DEG, Math.atan2(-d.z, d.x) / DEG];
  }
  let readAt = 0;
  function centerReadout() {
    if (!grid || !body) return;
    const [la, lo] = centerLatLon();
    const here = body.querySelector(".wd-read"), place = body.querySelector(".wd-place");
    if (here) here.innerHTML = describe(la, lo);
    if (place) place.textContent = countryName?.(la, lo) || latLonText(la, lo);
  }
  body?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-spot]");
    if (!b || !grid) return;
    const k = b.dataset.spot;
    if (window.innerWidth <= 640) setMin(true);
    if (k === "max") {
      const [la, lo, s] = grid.maxAt;
      rig.flyTo(la, lo, { distance: 2.2, ms: 1600 });
      if (isEn) {
        const where = countryName?.(la, lo) ? `near ${countryName(la, lo)}` : `over the sea at ${latLonText(la, lo)}`;
        spot = `<b>🌀 Strongest wind right now</b>${esc(where)}, about ${s.toFixed(0)} m/s (force ${beaufort(s)}, ${BF_NAME[beaufort(s)]}). ` +
          `Winds this strong usually mean a typhoon (hurricane) or a deep extratropical storm.`;
      } else {
        const where = countryName?.(la, lo) ? `${countryName(la, lo)}附近` : `${latLonText(la, lo)}的海上`;
        spot = `<b>🌀 現在風最強的地方</b>${esc(where)},約 ${s.toFixed(0)} m/s(${beaufort(s)} 級${BF_NAME[beaufort(s)]})。` +
          `這麼強的風多半是颱風(颶風)或很強的溫帶氣旋。`;
      }
    } else {
      const [la, lo, dist, title, text] = SPOTS[k];
      rig.flyTo(la, lo, { distance: dist, ms: 1600 });
      spot = `<b>${title}</b>${text}`;
    }
    const note = body.querySelector(".wd-note");
    if (note) { note.innerHTML = spot; note.hidden = false; }
  });

  function applyVisibility() {
    if (lines) lines.visible = enabled && !hidden;
  }
  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    document.body.classList.toggle("wind-on", enabled);
    // 雲層會蓋住風的線,開著風場時先把雲藏起來
    if (clouds?.object) {
      if (enabled) { cloudsWas = clouds.object.visible; clouds.object.visible = false; } else clouds.object.visible = cloudsWas;
    }
    if (enabled) {
      setMin(false);
      render();
      if (!grid && !loading) loading = load().finally(() => { loading = null; if (grid && !lines) build(); applyVisibility(); if (enabled) render(); });
    }
    applyVisibility();
  }

  function update(dt) {
    if (!enabled || hidden || !grid || !lines) return;
    step(dt);
    const t = performance.now();
    if (t - readAt > 300 && panel && !panel.hidden) { readAt = t; centerReadout(); }
  }

  // 滑鼠指到地球上任何一點:提示框多一行「這裡的風」
  const inv = new THREE.Matrix4(), ray = new THREE.Ray(), hit = new THREE.Vector3(), ball = new THREE.Sphere(new THREE.Vector3(), 1);
  function readout(raycaster) {
    if (!enabled || hidden || !grid) return null;
    globeObject.updateWorldMatrix(true, false);
    inv.copy(globeObject.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inv);
    if (!ray.intersectSphere(ball, hit)) return null;
    const la = Math.asin(THREE.MathUtils.clamp(hit.y, -1, 1)) / DEG, lo = Math.atan2(-hit.z, hit.x) / DEG;
    const [u, v] = sample(la, lo, [0, 0]);
    const s = Math.hypot(u, v);
    if (isEn) return `🌬️ ${s < 0.3 ? "Almost calm" : `${windFrom(u, v)} ${s.toFixed(1)} m/s · force ${beaufort(s)}`}`;
    return `🌬️ ${s < 0.3 ? "幾乎沒有風" : `${windFrom(u, v)}風 ${s.toFixed(1)} m/s · ${beaufort(s)} 級`}`;
  }

  return {
    setEnabled, update, readout,
    isEnabled: () => enabled,
    setHidden(v) { hidden = !!v; applyVisibility(); },
  };
}
