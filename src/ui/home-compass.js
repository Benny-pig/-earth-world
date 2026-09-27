import * as THREE from "three";
import { fitDistanceForAspect } from "../scene/camera-controls.js";
import { isEn } from "../lib/i18n.js";

// 🧭 指北針 + 🏠 回到台灣:地球可以一路轉過南北極以後,轉到迷路時按一下就回來。
//   指北針:針永遠指著畫面上的「北方」;按一下北方朝上(在極點附近會順便退到緯度 60°)
//   🏠:飛回台灣,看得到整顆地球
export function createHomeCompass({ camera, rig }) {
  const dock = document.createElement("div");
  dock.id = "home-dock";
  dock.innerHTML =
    `<button type="button" class="hd-btn hd-compass" title="${isEn ? "North up" : "北方朝上"}" aria-label="${isEn ? "North up" : "北方朝上"}">` +
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="hd-n" d="M12 2.5 L15.2 12 L8.8 12 Z"/><path class="hd-s" d="M12 21.5 L8.8 12 L15.2 12 Z"/>` +
    `<text x="12" y="9.6" text-anchor="middle">N</text></svg></button>` +
    `<button type="button" class="hd-btn hd-home" title="${isEn ? "Back to Taiwan" : "回到台灣"}" aria-label="${isEn ? "Back to Taiwan" : "回到台灣"}">🏠</button>`;
  document.body.appendChild(dock);
  const needle = dock.querySelector("svg");
  dock.querySelector(".hd-compass").addEventListener("click", () => rig.northUp());
  dock.querySelector(".hd-home").addEventListener("click", () => rig.flyTo(23.7, 121, { distance: fitDistanceForAspect(camera.aspect), ms: 1400 }));

  // 每幀:北方在畫面上的方向 = 鏡頭的「上」轉到「地軸往北投影到畫面上」要轉幾度
  const Y = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), want = new THREE.Vector3(), cross = new THREE.Vector3();
  let last = 0;
  function update() {
    fwd.copy(camera.position).negate().normalize();
    const along = Y.dot(fwd);
    if (Math.abs(along) > 0.985) return;   // 正對著極點:北方就是畫面中心,針維持原本方向
    want.copy(Y).addScaledVector(fwd, -along).normalize();
    const deg = Math.atan2(cross.crossVectors(camera.up, want).dot(fwd), camera.up.dot(want)) * 180 / Math.PI;
    if (Math.abs(deg - last) < 0.5) return;
    last = deg;
    needle.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    dock.classList.toggle("tilted", Math.abs(deg) > 3);
  }
  return { update };
}
