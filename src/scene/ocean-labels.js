import * as THREE from "three";

const OCEANS = [
  { zh: "太平洋", en: "Pacific Ocean",  lat: 0,   lon: -160, note: "世界最大最深的大洋,面積超過所有陸地總和。" },
  { zh: "大西洋", en: "Atlantic Ocean", lat: 0,   lon: -30,  note: "世界第二大洋,分隔美洲與歐洲、非洲。" },
  { zh: "印度洋", en: "Indian Ocean",   lat: -25, lon: 75,   note: "世界第三大洋,古代海上貿易的重要航道。" },
  { zh: "北冰洋", en: "Arctic Ocean",   lat: 80,  lon: 0,    note: "世界最小最淺的大洋,大部分海域終年被海冰覆蓋。" },
  { zh: "南冰洋", en: "Southern Ocean", lat: -62, lon: 0,    note: "環繞南極洲的海域,2000 年才被正式劃定為獨立大洋。" },
];

const DEG = Math.PI / 180;
// same convention as src/lib/geo.js latLonToXYZ
function latLonToVec3(latDeg, lonDeg, r = 1) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, cl = Math.cos(lat);
  return new THREE.Vector3(r * cl * Math.cos(lon), r * Math.sin(lat), -r * cl * Math.sin(lon));
}

export function createOceanLabels({ globeObject, camera, renderer, naturePopup }) {
  const host = document.getElementById("ocean-labels");
  const labels = OCEANS.map((o) => {
    const el = document.createElement("div");
    el.className = "ocean-label";
    el.innerHTML = `<span class="zh">${o.zh}</span><span class="en">${o.en}</span>`;
    if (naturePopup && o.note) {
      el.classList.add("ocean-label-clickable");
      el.addEventListener("click", (e) => {
        naturePopup.show({ icon: "🌊", zh: o.zh, en: o.en, note: o.note }, e.clientX, e.clientY);
      });
    }
    host.appendChild(el);
    return { el, localDir: latLonToVec3(o.lat, o.lon, 1), anchor: new THREE.Vector3(), ndc: new THREE.Vector3() };
  });

  const camToAnchor = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();

  function update() {
    const rect = renderer.domElement.getBoundingClientRect();
    for (const L of labels) {
      // anchor sits slightly above the surface so it isn't z-fought by the globe
      L.anchor.copy(L.localDir).multiplyScalar(1.02).applyMatrix4(globeObject.matrixWorld);
      worldNormal.copy(L.localDir).transformDirection(globeObject.matrixWorld); // rotated surface normal
      camToAnchor.copy(camera.position).sub(L.anchor).normalize();
      const facing = worldNormal.dot(camToAnchor);

      L.ndc.copy(L.anchor).project(camera);
      const behind = L.ndc.z > 1;
      let opacity = 0;
      if (!behind && facing > -0.05) {
        opacity = THREE.MathUtils.clamp((facing + 0.05) / 0.2, 0, 1);
      }
      if (opacity <= 0.001) {
        L.el.style.opacity = "0";
        L.el.style.transform = "translate(-9999px,-9999px)";
        continue;
      }
      const x = rect.left + (L.ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-L.ndc.y * 0.5 + 0.5) * rect.height;
      L.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      L.el.style.opacity = opacity.toFixed(2);
    }
  }

  return { update };
}
