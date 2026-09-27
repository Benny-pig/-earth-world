import * as THREE from "three";
import { makeDraggable } from "../ui/draggable.js";

// 🌡️ 全球即時氣溫 / 降雨:Open-Meteo(免費、免金鑰、網頁可直接讀取)一次查全球每 10 度一個點
// (612 點)的現在天氣,內插成一張經緯度圖貼在地球上。可切換「氣溫 / 降雨」;電腦上滑鼠指到哪裡
// 就顯示那裡的溫度與雨量。每 30 分鐘更新;查過的資料在這台瀏覽器留 30 分鐘,不重複查。
const STEP = 10, LAT0 = -80, LAT1 = 80;
const CACHE_KEY = "earth-world.weather", TTL = 30 * 60 * 1000;
const W = 360, H = 180;   // 貼圖:每度 1 像素

// 顏色刻度:[數值, [r,g,b], 不透明度]
const TEMP_SCALE = [[-40, [120, 40, 160], 0.5], [-20, [70, 80, 220], 0.45], [0, [120, 200, 255], 0.36], [10, [90, 210, 150], 0.3],
  [20, [245, 225, 80], 0.34], [28, [250, 150, 50], 0.42], [35, [230, 60, 40], 0.5], [45, [140, 10, 30], 0.58]];
const RAIN_SCALE = [[0, [0, 0, 0], 0], [0.1, [120, 190, 255], 0.35], [1, [50, 120, 255], 0.55], [4, [120, 60, 230], 0.68], [10, [230, 40, 200], 0.8]];

function colorAt(scale, v) {
  if (v <= scale[0][0]) return [...scale[0][1], scale[0][2]];
  for (let i = 1; i < scale.length; i++) {
    const [v1, c1, a1] = scale[i];
    if (v <= v1) {
      const [v0, c0, a0] = scale[i - 1];
      const k = (v - v0) / (v1 - v0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, a0 + (a1 - a0) * k];
    }
  }
  const last = scale[scale.length - 1];
  return [...last[1], last[2]];
}

export function createWeatherLayer({ globeObject, clouds, onClose }) {
  const panel = document.getElementById("weather-panel");
  const $ = (id) => document.getElementById(id);
  const noop = { setEnabled() {}, isEnabled: () => false, readout: () => null };
  if (!panel) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  const lats = [], lons = [];
  for (let la = LAT0; la <= LAT1; la += STEP) for (let lo = -180; lo < 180; lo += STEP) { lats.push(la); lons.push(lo); }
  const NLON = 360 / STEP, NLAT = (LAT1 - LAT0) / STEP + 1;

  let enabled = false, mode = "temp", grid = null, fetchedAt = 0, timer = null, loading = null;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.004, 128, 64), mat);
  sphere.raycast = () => {};
  sphere.renderOrder = 1;
  sphere.visible = false;
  // 跟地球本身一樣的球體貼圖方式:貼圖最左邊 = 經度 -180°(畫布也是這樣畫),不用另外轉
  globeObject.add(sphere);

  // 格點值(經度環繞、緯度夾在 ±80)雙線性內插
  function valueAt(key, lat, lon) {
    if (!grid) return null;
    const fy = THREE.MathUtils.clamp((lat - LAT0) / STEP, 0, NLAT - 1);
    let fx = (lon + 180) / STEP;
    fx = ((fx % NLON) + NLON) % NLON;
    const y0 = Math.floor(fy), y1 = Math.min(NLAT - 1, y0 + 1), x0 = Math.floor(fx), x1 = (x0 + 1) % NLON;
    const ty = fy - y0, tx = fx - x0;
    const g = (y, x) => grid[key][y * NLON + x];
    const a = g(y0, x0) * (1 - tx) + g(y0, x1) * tx;
    const b = g(y1, x0) * (1 - tx) + g(y1, x1) * tx;
    return a * (1 - ty) + b * ty;
  }

  function paint() {
    if (!grid) return;
    const img = ctx.createImageData(W, H);
    const scale = mode === "temp" ? TEMP_SCALE : RAIN_SCALE;
    const key = mode === "temp" ? "t" : "p";
    for (let py = 0; py < H; py++) {
      const lat = 90 - (py + 0.5);
      for (let px = 0; px < W; px++) {
        const lon = -180 + (px + 0.5);
        const [r, g, b, a] = colorAt(scale, valueAt(key, lat, lon));
        const i = (py * W + px) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  }

  async function load(force = false) {
    if (!force && grid && Date.now() - fetchedAt < TTL) return;
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (c && Date.now() - c.at < TTL && c.t?.length === lats.length) { grid = { t: c.t, p: c.p }; fetchedAt = c.at; return; }
      } catch { /* 沒有快取就重抓 */ }
    }
    if (loading) return loading;
    loading = (async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}&longitude=${lons.join(",")}&current=temperature_2m,precipitation&timezone=GMT`;
      const arr = await fetch(url).then((r) => { if (!r.ok) throw new Error(`Open-Meteo ${r.status}`); return r.json(); });
      const list = Array.isArray(arr) ? arr : [arr];
      const t = list.map((d) => d?.current?.temperature_2m ?? 0);
      const p = list.map((d) => d?.current?.precipitation ?? 0);
      grid = { t, p }; fetchedAt = Date.now();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: fetchedAt, t, p })); } catch { /* 存不下就算了 */ }
    })().finally(() => { loading = null; });
    return loading;
  }

  function renderPanel() {
    const upd = fetchedAt ? new Date(fetchedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
    $("weather-body").innerHTML =
      `<div class="wx-tabs"><button type="button" data-mode="temp" class="${mode === "temp" ? "on" : ""}">🌡️ 氣溫</button>` +
      `<button type="button" data-mode="rain" class="${mode === "rain" ? "on" : ""}">🌧️ 降雨</button></div>` +
      (mode === "temp"
        ? `<div class="wx-bar wx-temp"></div><div class="wx-ticks"><span>-20°</span><span>0°</span><span>10°</span><span>20°</span><span>30°</span><span>40°C</span></div>`
        : `<div class="wx-bar wx-rain"></div><div class="wx-ticks"><span>0</span><span>0.1</span><span>1</span><span>4</span><span>10+ mm/小時</span></div>`) +
      `<div class="wx-note">資料:Open-Meteo · ${upd} 更新 · 每 10 度一個點,地方細節請點國家看當地天氣</div>`;
  }

  $("weather-body")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    paint(); renderPanel();
  });
  $("weather-close")?.addEventListener("click", () => onClose && onClose());

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    sphere.visible = enabled && !!grid;
    if (clouds) clouds.object.visible = !enabled;   // 雲層會蓋住色塊,開著時先收起來
    clearInterval(timer);
    if (!enabled) return;
    $("weather-body").innerHTML = `<div class="ap-empty">讀取全球天氣中…</div>`;
    try {
      await load();
      if (!enabled) return;
      paint(); sphere.visible = true; renderPanel();
      timer = setInterval(async () => { try { await load(true); paint(); renderPanel(); } catch { /* 下次再試 */ } }, TTL);
    } catch {
      $("weather-body").innerHTML = `<div class="ap-empty">全球天氣暫時讀不到,稍後再試</div>`;
    }
  }

  // 滑鼠指到的位置 → 「🌡️ 26°C · 🌧️ 0.4 mm」(給主程式的提示框用)
  const inv = new THREE.Matrix4(), ray = new THREE.Ray(), hit = new THREE.Vector3(), ball = new THREE.Sphere(new THREE.Vector3(), 1);
  function readout(raycaster) {
    if (!enabled || !grid) return null;
    globeObject.updateWorldMatrix(true, false);
    inv.copy(globeObject.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inv);
    if (!ray.intersectSphere(ball, hit)) return null;
    const lat = Math.asin(THREE.MathUtils.clamp(hit.y, -1, 1)) * 180 / Math.PI;
    const lon = Math.atan2(-hit.z, hit.x) * 180 / Math.PI;
    const t = valueAt("t", lat, lon), p = valueAt("p", lat, lon);
    return `🌡️ ${Math.round(t)}°C · 🌧️ ${p < 0.05 ? "沒下雨" : `${p.toFixed(1)} mm/小時`}`;
  }

  return { setEnabled, isEnabled: () => enabled, readout };
}
