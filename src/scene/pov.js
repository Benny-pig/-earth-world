import * as THREE from "three";
import { simNow, setSimTime } from "../lib/sim-time.js";
import { moonPhase } from "./moon.js";
import { isEn } from "../lib/i18n.js";

// 🎥 特別視角:鏡頭離開「繞著地球轉」的模式,換到別的地方看地球。
//   🛰️ 搭上國際太空站:鏡頭就在太空站的真實位置(SGP4 軌道模型),面朝前進方向、往下看地平線,
//       可以加速(時間一起快轉,晝夜也跟著走),拖曳可以左右上下看,滾輪/兩指縮放視野
//   🌙 從月球看地球:站在月面上,看地球從月平線慢慢升起(模擬阿波羅 8 號拍到的「地出」)
// 兩種模式都暫停一般的鏡頭控制,按「離開」或 Esc 回到原本的地球視角。
const SAT_LIB = "https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/+esm";
const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle";
const TLE_CACHE = "earth-world.sat-tle.v1";   // 衛星圖層已經抓過的軌道資料可以直接用
const EARTH_KM = 6371;
const RAD = Math.PI / 180;

async function issSatrec() {
  const sat = await import(SAT_LIB);
  let l1 = null, l2 = null;
  try {
    const cached = JSON.parse(localStorage.getItem(TLE_CACHE) || "null");
    const txt = cached && Date.now() - cached.at < 24 * 3600 * 1000 ? cached.groups?.stations || "" : "";   // 一天內的才用,太舊位置會偏
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex((l) => l.startsWith("1 25544"));
    if (i >= 0) { l1 = lines[i]; l2 = lines[i + 1]; }
  } catch { /* 沒有快取就自己抓 */ }
  if (!l1) {
    const txt = await fetch(TLE_URL).then((r) => r.text());
    const lines = txt.trim().split(/\r?\n/).map((l) => l.trim());
    l1 = lines.find((l) => l.startsWith("1 25544"));
    l2 = lines.find((l) => l.startsWith("2 25544"));
  }
  if (!l1 || !l2) throw new Error("讀不到太空站軌道");
  return { sat, rec: sat.twoline2satrec(l1, l2) };
}

export function createPov({ camera, rig, globeObject, moon, sunDir, codeAt, nameOf, onExit }) {
  let mode = null, iss = null, speed = 10, yaw = 0, pitch = 0, fovZoom = 1, t0 = 0, elapsed = 0;
  const saved = { fov: 45, near: 0.1 };

  // ---------- 畫面上的資訊列 ----------
  const hud = document.createElement("div");
  hud.id = "pov-hud";
  hud.hidden = true;
  document.body.appendChild(hud);
  hud.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.act === "exit") exit();
    else if (b.dataset.speed) { speed = Number(b.dataset.speed); paintHud(true); }
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && mode) exit(); });

  // 拖曳:左右/上下看;滾輪:縮放視野(只在特別視角時)
  let drag = null;
  const el = document.getElementById("app");
  el?.addEventListener("pointerdown", (e) => { if (mode) drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("pointermove", (e) => {
    if (!mode || !drag) return;
    yaw = THREE.MathUtils.clamp(yaw - (e.clientX - drag.x) * 0.15 * RAD, -Math.PI, Math.PI);
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.15 * RAD, -50 * RAD, 50 * RAD);
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { drag = null; });
  el?.addEventListener("wheel", (e) => { if (mode) fovZoom = THREE.MathUtils.clamp(fovZoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.35, 1.4); }, { passive: true });

  function takeOver(fov, near) {
    saved.fov = camera.fov; saved.near = camera.near;
    camera.fov = fov; camera.near = near; camera.updateProjectionMatrix();
    rig.cancelTween();
    rig.controls.enabled = false;
    document.body.classList.add("pov");
    hud.hidden = false;
    yaw = 0; pitch = 0; fovZoom = 1; elapsed = 0;
  }
  function exit() {
    if (!mode) return;
    const was = mode;
    mode = null;
    hud.hidden = true;
    document.body.classList.remove("pov");
    moon.setForceVisible(false);
    setSimTime(null);
    camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
    // 回到一般視角:太空站模式回到它正下方那一帶,月球模式回到看得到整顆地球
    const dir = was === "iss" && iss?.pos ? iss.pos.clone().normalize() : camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(was === "iss" ? 2.4 : 3.4));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    rig.controls.enabled = true;
    onExit && onExit(was);
  }

  // ---------- 🛰️ 國際太空站 ----------
  async function startIss() {
    if (mode) exit();
    hud.hidden = false;
    hud.innerHTML = `<div class="pov-t">🛰️ ${isEn ? "Boarding the ISS…" : "正在登上國際太空站…"}</div>`;
    try { if (!iss) iss = await issSatrec(); } catch (e) {
      hud.innerHTML = `<div class="pov-t">😢 ${isEn ? "Couldn't load the ISS orbit" : "太空站軌道資料暫時讀不到"}</div><button type="button" data-act="exit">${isEn ? "Close" : "關閉"}</button>`;
      return;
    }
    mode = "iss";
    speed = 10;
    t0 = Date.now();
    takeOver(62, 0.004);
    paintHud(true);
  }
  function issAt(date) {
    const { sat, rec } = iss;
    const pv = sat.propagate(rec, date);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    const gd = sat.eciToGeodetic(pv.position, sat.gstime(date));
    const lat = sat.degreesLat(gd.latitude), lon = sat.degreesLong(gd.longitude), alt = gd.height;
    const v = pv.velocity;
    return { lat, lon, alt, kmh: Math.hypot(v.x, v.y, v.z) * 3600 };
  }
  const toWorld = (lat, lon, r) => {
    const cl = Math.cos(lat * RAD);
    return new THREE.Vector3(r * cl * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * cl * Math.sin(lon * RAD)).applyQuaternion(globeObject.quaternion);
  };
  const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), look = new THREE.Vector3();
  function updateIss(dt) {
    // 模擬時間往前推(加速時晝夜跟著走)
    elapsed += dt * speed;
    const now = new Date(t0 + elapsed * 1000);
    if (speed !== 1) setSimTime(now); else setSimTime(null);
    const a = issAt(now), b = issAt(new Date(now.getTime() + 2000));
    if (!a || !b) return;
    iss.pos = toWorld(a.lat, a.lon, 1 + a.alt / EARTH_KM);
    iss.now = a;
    const next = toWorld(b.lat, b.lon, 1 + b.alt / EARTH_KM);
    up.copy(iss.pos).normalize();
    fwd.copy(next).sub(iss.pos).addScaledVector(up, -next.clone().sub(iss.pos).dot(up)).normalize();   // 沿著地表的前進方向
    right.crossVectors(fwd, up).normalize();
    // 預設往前、往下 28°(地平線在畫面上方三分之一),再加上讀者拖曳的左右/上下
    const p = -28 * RAD + pitch;
    look.copy(fwd).applyAxisAngle(up, yaw);
    const r2 = look.clone().cross(up).normalize();
    look.applyAxisAngle(r2, p);
    camera.position.copy(iss.pos);
    camera.up.copy(up);
    camera.lookAt(iss.pos.clone().add(look));
    camera.fov = 62 * fovZoom; camera.updateProjectionMatrix();
    paintHud();
  }

  // ---------- 🌙 從月球看地球 ----------
  function startMoon() {
    if (mode) exit();
    mode = "moon";
    moon.setForceVisible(true);
    takeOver(38, 0.004);
    paintHud(true);
  }
  const M = new THREE.Vector3(), E = new THREE.Vector3(), n = new THREE.Vector3(), axis = new THREE.Vector3();
  function updateMoon(dt) {
    elapsed += dt;
    moon.mesh.getWorldPosition(M);
    E.copy(M).negate().normalize();                                   // 從月球看向地球的方向
    // 站的位置選「太陽照得到的那一邊」:前景月面才會亮(像阿波羅 8 號的照片,太陽在太空人背後)
    const S = new THREE.Vector3().copy(sunDir()).normalize();
    axis.copy(S).addScaledVector(E, -S.dot(E));
    if (axis.lengthSq() < 1e-6) axis.crossVectors(E, new THREE.Vector3(0, 1, 0));
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    // 地出:地球從月平線下 4° 慢慢升到 9°(約 25 秒),之後停住
    const elev = (-4 + 13 * Math.min(1, elapsed / 25)) * RAD;
    n.copy(E).multiplyScalar(Math.sin(elev)).addScaledVector(axis, Math.cos(elev)).normalize();   // 鏡頭所在位置的「正上方」
    const r = moon.mesh.geometry.parameters.radius * 1.004;             // 貼著月面(地平線才在畫面裡)
    camera.position.copy(M).addScaledVector(n, r);
    camera.up.copy(n);
    // 看向地球、稍微往下 3°(地球在畫面中間偏上、月平線在下方),讀者可以拖曳左右上下看
    look.set(0, 0, 0).sub(camera.position).normalize();
    right.crossVectors(look, n).normalize();
    look.applyAxisAngle(n, yaw).applyAxisAngle(right, -3 * RAD - pitch);
    camera.lookAt(camera.position.clone().add(look));
    camera.fov = 38 * fovZoom; camera.updateProjectionMatrix();
    paintHud();
  }

  // ---------- 資訊列 ----------
  let lastPaint = 0;
  function paintHud(force = false) {
    const now = performance.now();
    if (!force && now - lastPaint < 500) return;
    lastPaint = now;
    if (mode === "iss" && iss?.now) {
      const a = iss.now;
      const code = codeAt?.(a.lat, a.lon);
      const below = code ? nameOf(code) : (isEn ? "the ocean" : "海洋");
      const btn = (x) => `<button type="button" data-speed="${x}" class="${speed === x ? "on" : ""}">${x === 1 ? (isEn ? "Real time" : "真實速度") : `×${x}`}</button>`;
      hud.innerHTML =
        `<div class="pov-t">🛰️ ${isEn ? "Aboard the ISS" : "國際太空站上"} · ${isEn ? "over" : "正在飛過"} <b>${below}</b></div>` +
        `<div class="pov-s">${isEn ? "Altitude" : "高度"} ${Math.round(a.alt)} km · ${isEn ? "Speed" : "時速"} ${Math.round(a.kmh).toLocaleString()} km` +
        `${speed !== 1 ? ` · <span class="pov-fast">${isEn ? "time sped up" : "時間加速中"} ×${speed}</span>` : ""}</div>` +
        `<div class="pov-b">${btn(1)}${btn(10)}${btn(60)}<button type="button" data-act="exit" class="pov-exit">${isEn ? "Leave" : "離開太空站"}</button></div>` +
        `<div class="pov-h">${isEn ? "Drag to look around · scroll to zoom" : "拖曳可以左右上下看 · 滾輪/兩指縮放"}</div>`;
    } else if (mode === "moon") {
      const ph = moonPhase(simNow(), { quick: true });
      const earthLit = Math.round((1 - ph.illum) * 100);
      hud.innerHTML =
        `<div class="pov-t">🌙 ${isEn ? "Earth from the Moon" : "從月球看地球"}</div>` +
        `<div class="pov-s">${isEn ? `Earth is ${earthLit}% lit right now — the opposite of the Moon's phase` : `地球現在有 ${earthLit}% 被照亮,剛好跟我們看到的月相相反`} · ${isEn ? "about" : "距離約"} ${Math.round(ph.km / 10000)} ${isEn ? "×10,000 km" : "萬公里"}</div>` +
        `<div class="pov-b"><button type="button" data-act="exit" class="pov-exit">${isEn ? "Back to Earth" : "回到地球"}</button></div>` +
        `<div class="pov-h">${isEn ? "Like the famous “Earthrise” photo from Apollo 8 · drag to look around" : "就像阿波羅 8 號太空人拍到的「地出」· 拖曳可以左右上下看"}</div>`;
    }
  }

  return {
    startIss, startMoon, exit,
    isActive: () => !!mode,
    mode: () => mode,
    update(dt) { if (mode === "iss") updateIss(dt); else if (mode === "moon") updateMoon(dt); },
  };
}
