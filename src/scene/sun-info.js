import * as THREE from "three";
import { subsolarPoint, sunEclipticLon, daysSinceJ2000 } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";
import { simNow, onSimTimeChange } from "../lib/sim-time.js";

// ☀️ 太陽:地球旁的太陽也跟月亮一樣標上「☀️ 太陽」,點一下(或選單「太陽與節氣」)打開面板:
// 現在直射哪裡、台北今天幾點日出日落、現在是哪個節氣、下一個節氣是哪天、太陽離地球多遠。
// 全部用天文公式在網頁裡即時算,不用連網。
const RAD = Math.PI / 180;
const TAIPEI = { lat: 25.03, lon: 121.56 };
// 二十四節氣,從春分(太陽黃經 0°)開始,每 15° 一個
const TERMS = ["春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露",
  "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒", "立春", "雨水", "驚蟄"];
const norm360 = (x) => ((x % 360) + 360) % 360;
const lambdaAt = (t) => norm360(sunEclipticLon(daysSinceJ2000(new Date(t))));

function altitude(lat, lon, date) {
  const s = subsolarPoint(date);
  const v = Math.sin(lat * RAD) * Math.sin(s.lat * RAD) + Math.cos(lat * RAD) * Math.cos(s.lat * RAD) * Math.cos((lon - s.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, v))) / RAD;
}

// 台北今天的日出、日落(太陽上緣碰到地平線 = 高度 -0.833°),每 2 分鐘找一次跨越點
function sunTimes(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = Date.parse(`${ymd}T00:00:00+08:00`);
  let rise = null, set = null, prev = altitude(TAIPEI.lat, TAIPEI.lon, new Date(start)) + 0.833;
  for (let m = 2; m <= 24 * 60; m += 2) {
    const t = start + m * 60000;
    const cur = altitude(TAIPEI.lat, TAIPEI.lon, new Date(t)) + 0.833;
    if (prev < 0 && cur >= 0 && !rise) rise = new Date(t - 60000);
    if (prev >= 0 && cur < 0 && !set) set = new Date(t - 60000);
    prev = cur;
  }
  return { rise, set };
}

// 現在的節氣和下一個節氣的日期(太陽黃經跨過下一個 15° 的時刻)
function solarTerm(now = Date.now()) {
  const lam = lambdaAt(now);
  const idx = Math.floor(lam / 15);
  const target = ((idx + 1) * 15) % 360;
  let t = now, prev = lam;
  for (let h = 0; h < 24 * 20; h++) {
    t += 3600000;
    const cur = lambdaAt(t);
    const crossed = target === 0 ? cur < prev : prev < target && cur >= target;
    if (crossed) break;
    prev = cur;
  }
  return { now: TERMS[idx], next: TERMS[(idx + 1) % 24], nextAt: refineCross(target, t - 3600000, t) };
}

// 某一刻是哪個節氣(時光機顯示用)
export const termAt = (date) => TERMS[Math.floor(lambdaAt(+date) / 15)];
// 從某一刻往後找,太陽黃經第一次到達 target 度的時刻(春分 0、夏至 90、秋分 180、冬至 270)
// 從 a 到 b 之間,太陽黃經跨過 target 的精確時刻(二分法,精確到幾秒)
function refineCross(target, a, b) {
  const past = (t) => { const d = ((lambdaAt(t) - target) % 360 + 360) % 360; return d < 180; };   // 已經過了 target
  for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (past(m)) b = m; else a = m; }
  return new Date(b);
}
export function nextSolarLon(target, from = Date.now()) {
  let t = from, prev = lambdaAt(t);
  for (let h = 0; h < 24 * 370; h++) {
    t += 3600000;
    const cur = lambdaAt(t);
    const crossed = target === 0 ? cur < prev : prev < target && cur >= target;
    if (crossed) return refineCross(target, t - 3600000, t);
    prev = cur;
  }
  return null;
}

// 日地距離(天文單位):地球軌道偏心率造成約 ±1.7% 的變化
function sunDistanceAU(date = new Date()) {
  const g = (357.529 + 0.98560028 * daysSinceJ2000(date)) * RAD;
  return 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
}

export function createSunInfo({ globe, camera, renderer, codeAt, nameOf, onClose }) {
  const label = document.createElement("button");
  label.type = "button";
  label.className = "moon-label sun-label";
  label.textContent = "☀️ 太陽";
  document.body.appendChild(label);

  const panel = document.getElementById("sun-panel");
  const body = document.getElementById("sun-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("sun-close")?.addEventListener("click", () => onClose && onClose());
  let enabled = false, onOpen = null, timer = null;

  const fmt = (d, opt) => (d ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", ...opt }).format(d) : "—");
  const hm = (d) => fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false });
  function render() {
    if (!body) return;
    const now = simNow();
    const s = subsolarPoint(now);
    const code = codeAt?.(s.lat, s.lon);
    const where = code ? nameOf(code) : "海面上";
    const { rise, set } = sunTimes(now);
    const dayMin = rise && set ? Math.round((set - rise) / 60000) : null;
    const term = solarTerm(now.getTime());
    const daysTo = Math.max(0, Math.ceil((term.nextAt - now) / 86400000));
    const au = sunDistanceAU(now);
    const km = au * 149597870.7;
    const light = au * 499.005;
    body.innerHTML =
      `<div class="sun-top"><div class="sun-ball"></div><div>` +
      `<div class="sun-term">🗓️ 現在是<b>${term.now}</b></div>` +
      `<div class="au-dim">下一個節氣「${term.next}」:${fmt(term.nextAt, { month: "numeric", day: "numeric", weekday: "short" })}(${daysTo === 0 ? "今天" : `${daysTo} 天後`})</div></div></div>` +
      `<div class="moon-grid">` +
      `<span>🎯 直射點</span><b>${s.lat >= 0 ? "北緯" : "南緯"} ${Math.abs(s.lat).toFixed(1)}° · ${s.lon >= 0 ? "東經" : "西經"} ${Math.abs(s.lon).toFixed(1)}°<br><small>${esc(where)}正中午,太陽在頭頂正上方</small></b>` +
      `<span>🌅 台北日出</span><b>${hm(rise)}</b>` +
      `<span>🌇 台北日落</span><b>${hm(set)}${dayMin ? `(白天 ${Math.floor(dayMin / 60)} 小時 ${dayMin % 60} 分)` : ""}</b>` +
      `<span>📏 距離地球</span><b>${(km / 1e8).toFixed(3)} 億公里<br><small>陽光要 ${Math.floor(light / 60)} 分 ${Math.round(light % 60)} 秒才照到地球</small></b></div>` +
      `<div class="sat-caption">位置、日出日落與節氣都用天文公式即時計算(誤差約一兩分鐘)。畫面上太陽的大小和距離有壓縮,方向是真的;` +
      `想看現在哪裡是白天、哪裡是晚上,打開「真實晨昏線」。</div>`;
  }
  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    clearInterval(timer);
    if (enabled) { render(); timer = setInterval(render, 60 * 1000); }
  }
  label.addEventListener("click", (e) => { e.stopPropagation(); onOpen && onOpen(); });
  let rt = null;
  onSimTimeChange(() => { if (enabled) { clearTimeout(rt); rt = setTimeout(render, 250); } });

  // ---------- 每幀:標籤放在太陽下方;被地球擋住或不在畫面裡就藏起來 ----------
  const wp = new THREE.Vector3(), ndc = new THREE.Vector3(), toS = new THREE.Vector3();
  let shown = null;
  function update() {
    wp.copy(globe.sun.position).normalize().multiplyScalar(20);
    ndc.copy(wp).project(camera);
    toS.copy(wp).sub(camera.position);
    const dist = toS.length();
    toS.divideScalar(dist);
    const t = -camera.position.dot(toS);
    const blocked = t > 0 && t < dist && camera.position.clone().addScaledVector(toS, t).length() < 1;
    const hide = blocked || ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05;
    if (hide) { if (shown !== false) { label.style.display = "none"; shown = false; } return; }
    const rect = canvasRect(renderer.domElement);
    const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width, y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
    const rPx = (0.35 / dist) / Math.tan((camera.fov * RAD) / 2) * (rect.height / 2);
    if (shown !== true) { label.style.display = ""; shown = true; }
    label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + rPx + 10)}px) translateX(-50%)`;
  }

  return { setEnabled, isEnabled: () => enabled, update, onOpen(fn) { onOpen = fn; } };
}
