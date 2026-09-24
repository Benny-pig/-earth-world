import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLonToXYZ } from "../lib/geo.js";

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const MAX_DISTANCE = 6; // 跟下面 controls.maxDistance 對齊,避免直向手機算出超過可縮放範圍的距離
const BASE_ROTATE_SPEED = 0.45;

// 相機 fov(45°)是「垂直」視角;aspect < 1(直向手機)時水平視角比垂直窄,
// 同樣距離下地球左右會被切到畫面外。用垂直/水平視角的三角幾何反推:
// 先算地球在桌機橫向畫面(aspect >= 1,垂直方向才是限制)佔垂直視角的比例當基準,
// 直向時改用「被裁的那個水平視角」乘上同一比例反推距離,讓直向的取景觀感跟橫向一致。
export function fitDistanceForAspect(aspect, { fovDeg = 45, base = 3.2 } = {}) {
  if (aspect >= 1) return base;
  const halfV = (fovDeg / 2) * (Math.PI / 180);
  const marginRatio = Math.asin(1 / base) / halfV;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const dist = 1 / Math.sin(marginRatio * halfH);
  return Math.min(dist, MAX_DISTANCE);
}

export function createCameraRig({ camera, domElement, globeObject }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = BASE_ROTATE_SPEED;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.35;
  controls.maxDistance = MAX_DISTANCE;
  controls.target.set(0, 0, 0);

  let tween = null; // { from: Vector3, toDir: Vector3, dist, t, ms }

  function flyTo(latDeg, lonDeg, { distance = 1.8, ms = 1000 } = {}) {
    const p = latLonToXYZ(latDeg, lonDeg, 1);
    const toDir = new THREE.Vector3(p.x, p.y, p.z);
    if (globeObject) toDir.applyQuaternion(globeObject.quaternion);
    toDir.normalize();
    tween = { from: camera.position.clone(), toDir, dist: distance, t: 0, ms };
  }

  function resetView() {
    const dist = fitDistanceForAspect(camera.aspect);
    tween = { from: camera.position.clone(), toDir: new THREE.Vector3(0, 0, 1), dist, t: 0, ms: 900 };
  }

  // 最近可以拉多近:平常 1.35,台灣路況開著時放寬到能看清楚一條條國道。
  // 收回來時如果相機已經比新的下限還近,平滑退到下限,不要一格就彈出去。
  function setMinDistance(d) {
    controls.minDistance = d;
    const cur = camera.position.length();
    if (cur < d) tween = { from: camera.position.clone(), toDir: camera.position.clone().normalize(), dist: d, t: 0, ms: 600 };
  }

  function update(dt) {
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
    controls.update();
  }

  return { controls, flyTo, resetView, setMinDistance, update };
}
