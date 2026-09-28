import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLonToXYZ } from "../lib/geo.js";

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 最遠可以縮到多遠(跟下面 controls.maxDistance 對齊)。原本 6,直向手機要 6.5 左右才裝得下整顆地球、
// 也沒辦法再縮遠看整片星空;放寬到 10
const MAX_DISTANCE = 10;
const BASE_ROTATE_SPEED = 0.45;

// 相機 fov(45°)是「垂直」視角;aspect < 1(直向手機)時水平視角比垂直窄,
// 同樣距離下地球左右會被切到畫面外。用垂直/水平視角的三角幾何反推:
// 先算地球在桌機橫向畫面(aspect >= 1,垂直方向才是限制)佔垂直視角的比例當基準,
// 直向時改用「被裁的那個水平視角」乘上同一比例反推距離,讓直向的取景觀感跟橫向一致。
export function fitDistanceForAspect(aspect, { fovDeg = 45, base = 3.2, max = MAX_DISTANCE } = {}) {
  if (!(aspect > 0) || aspect >= 1) return base;   // 視窗大小還是 0(背景分頁、還沒排版)時 aspect 是 NaN
  const halfV = (fovDeg / 2) * (Math.PI / 180);
  const marginRatio = Math.asin(1 / base) / halfV;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const dist = 1 / Math.sin(marginRatio * halfH);
  return Math.min(dist, max);
}

export function createCameraRig({ camera, domElement, globeObject }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.15;   // 原本 0.08:地球會拖在手指後面慢慢跟上,感覺像 lag
  controls.rotateSpeed = BASE_ROTATE_SPEED;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.35;
  controls.maxDistance = MAX_DISTANCE;
  controls.target.set(0, 0, 0);

  let tween = null; // { from: Vector3, toDir: Vector3, dist, t, ms }

  // 🌐 拖曳旋轉自己做,OrbitControls 只留縮放:OrbitControls 的鏡頭轉到南北極就卡住,
  // 再往上拖完全沒反應。改成左右拖 = 繞地軸轉(北方維持朝上)、上下拖 = 繞畫面的水平軸轉,
  // 可以一路越過極點轉到另一邊。越過極點後畫面會是「南方朝上」,放開、離開極區後慢慢轉正。
  controls.enableRotate = false;
  const Y = new THREE.Vector3(0, 1, 0);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3(), cross = new THREE.Vector3();
  const pointers = new Set();
  let dragging = false, lastX = 0, lastY = 0, lastMoveAt = 0;
  let velX = 0, velY = 0;     // 放開後的慣性(弧度/秒)
  let flipped = false;        // 鏡頭是不是越過極點、南方朝上

  function rotate(ax, ay) {
    const p = camera.position;
    const upY = camera.up.dot(Y);
    if (Math.abs(upY) > 0.3) flipped = upY < 0;   // 極點附近不判斷,免得方向忽正忽反
    qa.setFromAxisAngle(Y, flipped ? ax : -ax);
    p.applyQuaternion(qa);
    camera.up.applyQuaternion(qa);
    fwd.copy(p).negate().normalize();
    right.crossVectors(fwd, camera.up).normalize();
    qb.setFromAxisAngle(right, -ay);
    p.applyQuaternion(qb);
    camera.up.applyQuaternion(qb).normalize();
    camera.lookAt(controls.target);
  }
  const pxToAngle = (px) => (2 * Math.PI * px / (domElement.clientHeight || window.innerHeight)) * controls.rotateSpeed;

  domElement.addEventListener("pointerdown", (e) => {
    pointers.add(e.pointerId);
    if (!controls.enabled || pointers.size > 1) { dragging = false; velX = velY = 0; return; }   // 兩指 = 縮放
    dragging = true;
    tween = null;                       // 飛行途中讀者自己拖:讓給讀者
    velX = velY = 0;
    lastX = e.clientX; lastY = e.clientY; lastMoveAt = performance.now();
    controls.dispatchEvent({ type: "start" });
  });
  domElement.addEventListener("pointermove", (e) => {
    if (!dragging || pointers.size !== 1 || !controls.enabled) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const now = performance.now(), dt = Math.max(0.008, (now - lastMoveAt) / 1000);
    lastMoveAt = now;
    const ax = pxToAngle(dx), ay = pxToAngle(dy);
    rotate(ax, ay);
    const MAXV = 4;   // 慣性上限(弧度/秒),用力一甩也不會轉太多圈
    velX = THREE.MathUtils.clamp(velX * 0.5 + (ax / dt) * 0.5, -MAXV, MAXV);
    velY = THREE.MathUtils.clamp(velY * 0.5 + (ay / dt) * 0.5, -MAXV, MAXV);
    controls.dispatchEvent({ type: "change" });
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (!dragging) return;
    dragging = false;
    if (performance.now() - lastMoveAt > 80) velX = velY = 0;   // 停住才放開:不要慣性
    controls.dispatchEvent({ type: "end" });
  };
  domElement.addEventListener("pointerup", release);
  domElement.addEventListener("pointercancel", release);

  // 放開後:慣性慢慢停下;鏡頭離開極區時,把畫面轉回北方朝上
  function settle(dt) {
    if (!dragging && (Math.abs(velX) + Math.abs(velY) > 1e-3)) {
      rotate(velX * dt, velY * dt);
      const k = Math.exp(-dt * 9);
      velX *= k; velY *= k;
    }
    if (dragging || Math.abs(velX) + Math.abs(velY) > 0.05) return;
    const p = camera.position;
    const lat = Math.asin(THREE.MathUtils.clamp(p.y / p.length(), -1, 1));
    if (!Number.isFinite(lat) || Math.abs(lat) > 65 * Math.PI / 180) return;
    fwd.copy(p).negate().normalize();
    want.copy(Y).addScaledVector(fwd, -Y.dot(fwd)).normalize();   // 北方朝上時的 up
    const ang = Math.atan2(cross.crossVectors(camera.up, want).dot(fwd), camera.up.dot(want));
    if (!Number.isFinite(ang) || Math.abs(ang) < 1e-4) return;
    const step = Math.abs(ang) < 0.002 ? ang : ang * Math.min(1, dt * 4);
    camera.up.applyAxisAngle(fwd, step).normalize();
    camera.lookAt(controls.target);
  }

  function flyTo(latDeg, lonDeg, { distance = 1.8, ms = 1000 } = {}) {
    const p = latLonToXYZ(latDeg, lonDeg, 1);
    const toDir = new THREE.Vector3(p.x, p.y, p.z);
    if (globeObject) toDir.applyQuaternion(globeObject.quaternion);
    toDir.normalize();
    tween = { from: camera.position.clone(), toDir, dist: distance, t: 0, ms };
  }

  // keepDirection:只拉遠回全景距離、不轉回預設方向(例如關掉台灣路況時,地球停在台灣那一面)
  function resetView({ keepDirection = false } = {}) {
    const dist = fitDistanceForAspect(camera.aspect);
    const home = latLonToXYZ(23.7, 121, 1);   // 預設視角:台灣在正中間
    const toDir = keepDirection ? camera.position.clone().normalize()
      : new THREE.Vector3(home.x, home.y, home.z).applyQuaternion(globeObject ? globeObject.quaternion : new THREE.Quaternion()).normalize();
    tween = { from: camera.position.clone(), toDir, dist, t: 0, ms: 900 };
  }

  // 最近可以拉多近:平常 1.35,台灣路況開著時放寬到能看清楚一條條國道。
  // 收回來時如果相機已經比新的下限還近,平滑退到下限,不要一格就彈出去。
  function setMinDistance(d) {
    controls.minDistance = d;
    const cur = camera.position.length();
    if (cur < d) tween = { from: camera.position.clone(), toDir: camera.position.clone().normalize(), dist: d, t: 0, ms: 600 };
  }

  // 最遠可以拉多遠:平常 6;衛星開著時放寬,才看得到外圈的導航/氣象衛星。
  // 收回來時如果相機比新的上限還遠,平滑拉回上限。
  function setMaxDistance(d) {
    controls.maxDistance = d;
    const cur = camera.position.length();
    if (cur > d) tween = { from: camera.position.clone(), toDir: camera.position.clone().normalize(), dist: d, t: 0, ms: 700 };
  }

  // 🌍 閒置時鏡頭慢慢繞著地球轉(約 2 分鐘一圈,方向跟地球真實自轉一樣:地表由左往右移動)。
  // 地球本身固定在真實方向,所以白天黑夜永遠是對的;拖曳、飛行、有慣性時先停。
  let autoSpin = false;
  const setAutoSpin = (v) => { autoSpin = !!v; };
  controls.autoRotateSpeed = 0.5;

  // 保持目前方向,拉遠到剛好看得到半徑 r 的球(r=1 就是整顆地球;手機直向會自動拉得更遠)
  function fitRadius(r, { ms = 1000 } = {}) {
    const dist = Math.min(controls.maxDistance, r * fitDistanceForAspect(camera.aspect, { max: Infinity }));
    tween = { from: camera.position.clone(), toDir: camera.position.clone().normalize(), dist, t: 0, ms };
  }

  function update(dt) {
    // 保險:鏡頭座標萬一變成無效值(NaN),整個地球會變黑、再也轉不回來——直接回到全景
    // 鏡頭的「上方」也要一起檢查、一起重設:只重設位置的話,上方是無效值時畫面會一直壞下去
    // (在背景分頁打開、視窗大小還是 0 的時候就會發生)
    const p = camera.position, u = camera.up;
    if (!Number.isFinite(p.x + p.y + p.z) || p.lengthSq() < 1e-6 || !Number.isFinite(u.x + u.y + u.z) || u.lengthSq() < 1e-6) {
      p.set(0, 0, fitDistanceForAspect(camera.aspect));
      u.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      tween = null;
      velX = velY = 0;
    }
    if (tween) {
      tween.t = Math.min(1, tween.t + (dt * 1000) / tween.ms);
      const k = easeInOutCubic(tween.t);
      const target = tween.toDir.clone().multiplyScalar(tween.dist);
      camera.position.lerpVectors(tween.from, target, k);
      camera.lookAt(0, 0, 0);
      if (tween.t >= 1) tween = null;
    }
    // OrbitControls 拖曳一次轉的是固定角度,拉得很近時同樣的角度在畫面上等於
    // 飛過好幾百公里,手指一滑台灣就不見了——比平常最近距離還近時,按離地高度
    // 等比例放慢旋轉(平常的縮放範圍內完全不影響)。
    const alt = camera.position.length() - 1;
    controls.rotateSpeed = alt < 0.35 ? BASE_ROTATE_SPEED * Math.max(0.12, alt / 0.35) : BASE_ROTATE_SPEED;
    settle(dt);
    controls.autoRotate = autoSpin && !dragging && !tween && Math.abs(velX) + Math.abs(velY) < 0.05;
    controls.update(dt);
  }

  // 取消進行中的飛行(電影巡航接手鏡頭時用)
  const cancelTween = () => { tween = null; };

  // 🧭 北方朝上:停在原地(極點附近退到緯度 ±60°),飛行途中 settle() 會把畫面轉正
  function northUp() {
    velX = velY = 0;
    const d = camera.position.clone().normalize();
    if (globeObject) d.applyQuaternion(globeObject.quaternion.clone().invert());
    const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI;
    const lon = Math.atan2(-d.z, d.x) * 180 / Math.PI;
    flyTo(THREE.MathUtils.clamp(lat, -60, 60), lon, { distance: camera.position.length(), ms: 900 });
  }

  return { controls, flyTo, resetView, setMinDistance, setMaxDistance, fitRadius, cancelTween, northUp, setAutoSpin, update, MAX_DISTANCE };
}
