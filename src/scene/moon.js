import * as THREE from "three";
import { latLonToXYZ, daysSinceJ2000, sunEclipticLon, eclipticToSubPoint } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { makeDraggable } from "../ui/draggable.js";

// 🌙 月亮:放在「現在真實的方向」(跟太陽同一套天文公式),被太陽照亮的一半自然形成月相,
// 而且永遠同一面朝向地球。真實距離約 60 倍地球半徑、大小 0.27 倍,照比例會小到看不見,
// 所以距離壓縮成 14、大小放大成 0.5(方向與月相都是真的)。表面紋理在網頁裡現場畫(月海、隕石坑)。
const DIST = 14, RADIUS = 0.5, SYNODIC = 29.530588853;
const RAD = Math.PI / 180;
const norm360 = (x) => ((x % 360) + 360) % 360;

// 月亮的黃經、黃緯、距離(天文年曆的主要週期項,誤差約 0.3°)
export function moonEcliptic(date) {
  const d = daysSinceJ2000(date);
  const L = 218.316 + 13.176396 * d, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.229350 * d) * RAD;
  const D = (297.850 + 12.190749 * d) * RAD, Ms = (357.529 + 0.98560028 * d) * RAD;
  const lon = L + 6.289 * Math.sin(M) - 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) - 0.186 * Math.sin(Ms)
    - 0.059 * Math.sin(2 * M - 2 * D) - 0.057 * Math.sin(M - 2 * D + Ms) + 0.053 * Math.sin(M + 2 * D)
    + 0.046 * Math.sin(2 * D - Ms) + 0.041 * Math.sin(M - Ms) - 0.035 * Math.sin(D) - 0.031 * Math.sin(M + Ms);
  const lat = 5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F) + 0.173 * Math.sin(2 * D - F);
  const km = 385000.56 - 20905.355 * Math.cos(M) - 3699.111 * Math.cos(2 * D - M) - 2955.968 * Math.cos(2 * D) - 569.925 * Math.cos(2 * M);
  return { lon: norm360(lon), lat, km, d };
}

// 月相:月亮與太陽的黃經差(0 新月、90 上弦、180 滿月、270 下弦)
const PHASES = [[10, "🌑", "新月"], [80, "🌒", "眉月"], [100, "🌓", "上弦月"], [170, "🌔", "盈凸月"], [190, "🌕", "滿月"],
  [260, "🌖", "虧凸月"], [280, "🌗", "下弦月"], [350, "🌘", "殘月"], [360, "🌑", "新月"]];
function elongationAt(date) {
  const m = moonEcliptic(date);
  return norm360(m.lon - sunEclipticLon(m.d));
}
function nextCrossing(from, target) {
  // 往後找黃經差跨過 target(180 = 滿月、0 = 新月)的時間,每小時一步
  let t = from.getTime(), prev = elongationAt(from);
  for (let i = 0; i < 24 * 31; i++) {
    t += 3600000;
    const cur = elongationAt(new Date(t));
    const crossed = target === 0 ? cur < prev : prev < target && cur >= target;
    if (crossed) return new Date(t);
    prev = cur;
  }
  return null;
}
export function moonPhase(date = new Date()) {
  const m = moonEcliptic(date);
  const D = norm360(m.lon - sunEclipticLon(m.d));
  const cosE = Math.cos(m.lat * RAD) * Math.cos(D * RAD);
  const illum = (1 - cosE) / 2;
  const [, emoji, name] = PHASES.find(([lim]) => D < lim);
  return { D, illum, age: (D / 360) * SYNODIC, waxing: D < 180, emoji, name, km: m.km, nextFull: nextCrossing(date, 180), nextNew: nextCrossing(date, 0) };
}

// 月球表面紋理:灰色底 + 近地面的主要月海(位置大致照真實) + 隨機隕石坑 + 第谷坑亮紋
function moonTexture() {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#a9a7a2"; g.fillRect(0, 0, W, H);
  const px = (lon) => ((lon + 180) / 360) * W, py = (lat) => ((90 - lat) / 180) * H;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 細緻斑駁
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 3;
    g.fillStyle = `rgba(${rnd() < 0.5 ? "70,70,68" : "215,213,208"},${0.05 + rnd() * 0.08})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // 月海(經度、緯度、半徑度數、橫向拉伸)
  const MARIA = [[-57, 18, 26, 1.1], [-16, 33, 13, 1.1], [17, 28, 9, 1], [31, 8, 10, 1.1], [59, 17, 6, 1.2], [51, -8, 8, 1],
    [-17, -21, 9, 1.2], [0, 56, 6, 3], [35, -15, 5, 1], [-39, -24, 5, 1], [-5, 8, 5, 1.3], [-25, -5, 6, 1.4]];
  g.filter = "blur(10px)";
  for (const [lon, lat, r, sx] of MARIA) {
    g.fillStyle = "rgba(62,62,66,0.62)";
    g.beginPath(); g.ellipse(px(lon), py(lat), (r / 360) * W * sx, (r / 180) * H, 0, 0, Math.PI * 2); g.fill();
  }
  g.filter = "none";
  // 隕石坑:亮邊 + 暗底
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = H * 0.08 + rnd() * H * 0.84, r = 1.5 + Math.pow(rnd(), 3) * 14;
    g.strokeStyle = `rgba(230,228,222,${0.25 + rnd() * 0.3})`; g.lineWidth = Math.max(1, r * 0.25);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = `rgba(80,80,80,${0.15 + rnd() * 0.2})`;
    g.beginPath(); g.arc(x + r * 0.15, y + r * 0.15, r * 0.75, 0, Math.PI * 2); g.fill();
  }
  // 第谷坑與放射亮紋
  const tx = px(-11), ty = py(-43);
  g.strokeStyle = "rgba(245,245,240,0.18)"; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, len = 60 + rnd() * 180;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.6); g.stroke();
  }
  g.fillStyle = "rgba(250,250,245,0.85)";
  g.beginPath(); g.arc(tx, ty, 5, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 月相小圖(面板用):北半球看到的樣子,漸盈右邊亮、漸虧左邊亮
function drawPhase(canvas, ph) {
  const g = canvas.getContext("2d"), s = canvas.width, r = s / 2 - 3, c = s / 2;
  g.clearRect(0, 0, s, s);
  g.fillStyle = "#1c2233"; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
  const lit = "#f1ead2";
  g.fillStyle = lit;
  g.beginPath(); g.arc(c, c, r, -Math.PI / 2, Math.PI / 2, !ph.waxing); g.fill();   // 亮的半邊
  const k = Math.cos(ph.D * RAD);            // 明暗界線橢圓的寬度比例
  g.fillStyle = ph.illum > 0.5 ? lit : "#1c2233";
  g.beginPath(); g.ellipse(c, c, Math.abs(k) * r, r, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1.5;
  g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
}

export function createMoon({ parent, camera, renderer, onClose }) {
  const mat = new THREE.MeshStandardMaterial({ map: moonTexture(), color: 0xc8c6c0, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 32), mat);
  parent.add(mesh);
  const dir = new THREE.Vector3();

  const label = document.createElement("button");
  label.type = "button";
  label.className = "moon-label";
  document.body.appendChild(label);

  let phase = moonPhase(), enabled = false, onOpen = null;
  function place(date = new Date()) {
    const m = moonEcliptic(date);
    const sub = eclipticToSubPoint(m.lon, m.lat, m.d);
    const p = latLonToXYZ(sub.lat, sub.lon, 1);
    dir.set(p.x, p.y, p.z).normalize();
    mesh.position.copy(dir).multiplyScalar(DIST);
    // 貼圖經度 0 在 +x:把 +x 轉向地球,近地面(有月海的那面)永遠朝著地球
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().negate());
    phase = moonPhase(date);
    label.textContent = `${phase.emoji} 月亮`;
    if (enabled) renderPanel();
  }
  place();
  const timer = setInterval(() => place(), 2 * 60 * 1000);

  // ---------- 面板 ----------
  const panel = document.getElementById("moon-panel");
  const body = document.getElementById("moon-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  const fmtDay = (dt) => (dt ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short" }).format(dt) : "—");
  const daysUntil = (dt) => (dt ? Math.max(0, Math.round((dt - Date.now()) / 86400000)) : null);
  function renderPanel() {
    if (!body) return;
    const ph = phase;
    body.innerHTML =
      `<div class="moon-top"><canvas width="96" height="96" class="moon-pic"></canvas><div>` +
      `<div class="moon-name">${ph.emoji} ${ph.name}</div>` +
      `<div>照亮 <b>${Math.round(ph.illum * 100)}%</b> · 月齡 <b>${ph.age.toFixed(1)}</b> 天</div>` +
      `<div class="moon-sub">${ph.waxing ? "漸盈:一天比一天圓" : "漸虧:一天比一天缺"}</div></div></div>` +
      `<div class="moon-grid"><span>🌕 下次滿月</span><b>${fmtDay(ph.nextFull)}${daysUntil(ph.nextFull) != null ? `(${daysUntil(ph.nextFull)} 天後)` : ""}</b>` +
      `<span>🌑 下次新月</span><b>${fmtDay(ph.nextNew)}${daysUntil(ph.nextNew) != null ? `(${daysUntil(ph.nextNew)} 天後)` : ""}</b>` +
      `<span>📏 距離地球</span><b>${(ph.km / 10000).toFixed(1)} 萬公里</b></div>` +
      `<div class="sat-caption">地球上看到的月相就像左邊這樣;月亮永遠同一面朝向地球。畫面上的月亮距離與大小有壓縮,方向和月相是真的</div>`;
    const cv = body.querySelector(".moon-pic");
    if (cv) drawPhase(cv, ph);
  }
  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    if (enabled) renderPanel();
  }
  document.getElementById("moon-close")?.addEventListener("click", () => onClose && onClose());
  label.addEventListener("click", (e) => { e.stopPropagation(); onOpen && onOpen(); });

  // ---------- 每幀:標籤位置;鏡頭太靠近月亮時先藏起來(免得整個畫面被月亮塞滿) ----------
  const wp = new THREE.Vector3(), ndc = new THREE.Vector3(), camTo = new THREE.Vector3();
  function update() {
    mesh.getWorldPosition(wp);
    const dCam = camera.position.distanceTo(wp);
    mesh.visible = dCam > 2.5;
    ndc.copy(wp).project(camera);
    // 被地球擋住:鏡頭到月亮的線有穿過地球
    camTo.copy(wp).sub(camera.position);
    const t = -camera.position.dot(camTo) / camTo.lengthSq();
    const closest = camera.position.clone().addScaledVector(camTo, THREE.MathUtils.clamp(t, 0, 1));
    const hidden = !mesh.visible || ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05 || closest.length() < 1;
    if (hidden) { label.style.display = "none"; return; }
    const rect = canvasRect(renderer.domElement);
    const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width, y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
    const rPx = (RADIUS / dCam) / Math.tan((camera.fov * RAD) / 2) * (rect.height / 2);
    label.style.display = "";
    label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + rPx + 8)}px) translateX(-50%)`;
  }

  // 點到月亮(3D)也打開面板
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pickAt(clientX, clientY) {
    if (!mesh.visible) return false;
    const rect = canvasRect(renderer.domElement);
    ptr.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) return false;
    // 月亮在地球後面(射線先打到地球)就不算點到
    const earthHit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    return !(earthHit && earthHit.distanceTo(ray.ray.origin) < hit.distance);
  }

  return {
    setEnabled, isEnabled: () => enabled, update, pickAt, place,
    onOpen(fn) { onOpen = fn; },
    phase: () => phase,
    dispose() { clearInterval(timer); label.remove(); },
  };
}
