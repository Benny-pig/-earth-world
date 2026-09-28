import * as THREE from "three";
import { xyzToLatLon } from "./geo.js";

// 把鏡頭擺到「天上某個方向剛好在地球旁邊」:鏡頭永遠看著地心,所以要看天空,
// 就讓那個方向落在地球邊緣外一點(橫向螢幕放右邊、直向手機放上方)。星座、行星搜尋共用。
export function flyToSky(C, { camera, rig, globeObject, dist = 5.2, offsetDeg = 15, ms = 1800 }) {
  const alpha = Math.asin(1 / dist) + offsetDeg * Math.PI / 180;
  const Y = new THREE.Vector3(0, 1, 0);
  let side = camera.aspect > 1 ? new THREE.Vector3().crossVectors(C, Y) : Y.clone().addScaledVector(C, -C.y);
  if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
  side.normalize();
  const f = C.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(side, -Math.sin(alpha));   // 鏡頭看的方向
  const d = f.negate().applyQuaternion(globeObject.quaternion.clone().invert());
  const { lat, lon } = xyzToLatLon(d);
  rig.flyTo(lat, lon, { distance: dist, ms });
}
