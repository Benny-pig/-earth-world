import * as THREE from "three";
import { latLonToXYZ } from "../lib/geo.js";
import { easeInOutCubic, fitDistanceForAspect } from "../scene/camera-controls.js";

// 🎬 開場運鏡:第一次打開(每天一次)時,鏡頭從深太空穿過星空飛向地球,「地球世界」標題浮現,
// 最後停在台灣、台灣泛起金色漣漪。點一下、拖曳、滾輪或按「跳過」都能直接結束。
// 用分享連結打開(要直接看分享的畫面)、系統設定「減少動態效果」時不播。
// 網址加 ?intro 可以強制重看,加 ?nointro 不播。
const KEY = "earth-world.intro";
const DUR = 5.6;             // 秒
const START_DIST = 17;
const TW = latLonToXYZ(23.7, 121, 1);
const today = () => new Date().toLocaleDateString("en-CA");

export function shouldPlayIntro() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("intro")) return true;
    if (q.has("nointro") || [...q.keys()].length) return false;   // 分享連結:直接到分享的畫面
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return localStorage.getItem(KEY) !== today();
  } catch { return false; }
}

export function createIntro({ camera, rig, globeObject, renderer }) {
  let state = "idle";   // idle → ready(鏡頭已擺到遠方,等載入畫面結束)→ playing → done
  let t = 0;
  const startDir = new THREE.Vector3();
  const twLocal = new THREE.Vector3(TW.x, TW.y, TW.z);
  const twWorld = new THREE.Vector3(), dir = new THREE.Vector3(), rel = new THREE.Vector3();
  let endDist = 3.2, overlay = null;

  function twNow() { return twWorld.copy(twLocal).applyQuaternion(globeObject.quaternion).normalize(); }

  // 一開始就把鏡頭放到遠方(載入畫面還蓋著),免得先閃過一般畫面再跳走
  function prepare() {
    state = "ready";
    rig.setMaxDistance?.(START_DIST + 5);
    // 從台灣東北方的太空出發(太平洋上空),飛過來時地球像在迎面轉過來
    startDir.copy(twNow()).applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.35);
    startDir.y += 0.45; startDir.normalize();
    camera.position.copy(startDir).multiplyScalar(START_DIST);
    camera.lookAt(0, 0, 0);
  }

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "intro";
    const title = [..."地球世界"].map((ch, i) => `<span style="animation-delay:${0.35 + i * 0.16}s">${ch}</span>`).join("");
    overlay.innerHTML = `<div class="intro-text"><div class="intro-title">${title}</div>` +
      `<div class="intro-sub">轉動地球，探索全世界</div></div>` +
      `<button type="button" class="intro-skip">跳過 ›</button>`;
    overlay.querySelector(".intro-skip").addEventListener("click", (e) => { e.stopPropagation(); finish(); });
    document.body.appendChild(overlay);
  }

  const skipOnInput = () => { if (state === "playing") finish(); };
  function play() {
    if (state !== "ready") return;
    state = "playing"; t = 0;
    endDist = fitDistanceForAspect(camera.aspect);
    try { localStorage.setItem(KEY, today()); } catch { /* 存不了就每次都播,也沒關係 */ }
    buildOverlay();
    renderer.domElement.addEventListener("pointerdown", skipOnInput, { once: true });
    renderer.domElement.addEventListener("wheel", skipOnInput, { once: true, passive: true });
    window.addEventListener("keydown", skipOnInput, { once: true });
  }

  // 直接跳到終點:鏡頭對準台灣、一般距離
  function finish() {
    if (state === "done") return;
    const wasPlaying = state === "playing";
    state = "done";
    camera.position.copy(twNow()).multiplyScalar(endDist || fitDistanceForAspect(camera.aspect));
    camera.lookAt(0, 0, 0);
    rig.setMaxDistance?.(rig.MAX_DISTANCE || 6);
    if (overlay) { overlay.classList.add("out"); setTimeout(() => overlay?.remove(), 700); }
    if (wasPlaying) ripple();
  }

  // 台灣泛起金色漣漪(抵達的提示)
  function ripple() {
    const p = twNow().clone().multiplyScalar(1.01).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "intro-ripple";
    el.style.left = `${rect.left + (p.x * 0.5 + 0.5) * rect.width}px`;
    el.style.top = `${rect.top + (-p.y * 0.5 + 0.5) * rect.height}px`;
    el.innerHTML = "<i></i><i></i><i></i>";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // 每幀(在 rig.update 之後呼叫):方向平滑轉向「台灣現在的位置」(地球會自轉,每幀重算),
  // 距離前段衝得快、最後慢慢減速停下
  function update(dt) {
    if (state === "ready") { camera.position.copy(startDir).multiplyScalar(START_DIST); camera.lookAt(0, 0, 0); return; }
    if (state !== "playing") return;
    t = Math.min(DUR, t + dt);
    const k = t / DUR;
    const kDir = easeInOutCubic(k);
    const kDist = 1 - Math.pow(1 - k, 3);
    const b = twNow();
    const d = THREE.MathUtils.clamp(startDir.dot(b), -1, 1);
    rel.copy(b).addScaledVector(startDir, -d);
    if (rel.lengthSq() < 1e-9) dir.copy(b);
    else { rel.normalize(); const th = Math.acos(d) * kDir; dir.copy(startDir).multiplyScalar(Math.cos(th)).addScaledVector(rel, Math.sin(th)); }
    camera.position.copy(dir).multiplyScalar(START_DIST + (endDist - START_DIST) * kDist);
    camera.lookAt(0, 0, 0);
    if (k > 0.66 && overlay && !overlay.classList.contains("out")) overlay.classList.add("out");
    if (t >= DUR) finish();
  }

  return { prepare, play, update, finish, isActive: () => state === "ready" || state === "playing" };
}
