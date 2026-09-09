import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLonToXYZ } from "/src/lib/geo.js";

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig({ camera, domElement, globeObject }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.35;
  controls.maxDistance = 6;
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
    tween = { from: camera.position.clone(), toDir: new THREE.Vector3(0, 0, 1), dist: 3.2, t: 0, ms: 900 };
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
    controls.update();
  }

  return { controls, flyTo, resetView, update };
}
