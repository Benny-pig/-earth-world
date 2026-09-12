import * as THREE from "three";

// 主要自然地理特徵標籤(山脈 / 河流 / 沙漠 / 高原…)。
// 只有在鏡頭「拉近」時才淡入,遠看時完全隱藏,避免與國家標籤打架。
// 作法沿用 ocean-labels.js 的 HTML overlay + 背面剔除;另加:
//   ‑ 鏡頭距離閘門(遠 → 全隱、近 → 全顯)
//   ‑ 螢幕空間去重(兩個標籤太近時,後者讓位)

const DEG = Math.PI / 180;
function latLonToVec3(latDeg, lonDeg, r = 1) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, cl = Math.cos(lat);
  return new THREE.Vector3(r * cl * Math.cos(lon), r * Math.sin(lat), -r * cl * Math.sin(lon));
}

const KIND = {
  mountain: { icon: "▲", cls: "pl-mountain" },
  peak:     { icon: "△", cls: "pl-peak" },
  river:    { icon: "〜", cls: "pl-river" },
  desert:   { icon: "❖", cls: "pl-desert" },
  plateau:  { icon: "▬", cls: "pl-plateau" },
  plain:    { icon: "▭", cls: "pl-plain" },
  lake:     { icon: "◊", cls: "pl-lake" },
  other:    { icon: "◈", cls: "pl-other" },
};

// 鏡頭距離:>FAR 全隱,<NEAR 全顯,之間線性
const FAR = 2.5, NEAR = 1.75;

export function createPhysicalLabels({ globeObject, camera, renderer }) {
  const host = document.getElementById("physical-labels");
  if (!host) return { update() {} };

  let labels = [];
  fetch("data/physical.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !Array.isArray(d.features)) return;
      labels = d.features.map((f) => {
        const kind = KIND[f.k] || KIND.other;
        const el = document.createElement("div");
        el.className = "physical-label " + kind.cls;
        el.innerHTML = `<span class="pl-ico">${kind.icon}</span><span class="pl-zh"></span><span class="pl-en"></span>`;
        el.querySelector(".pl-zh").textContent = f.zh;
        el.querySelector(".pl-en").textContent = f.en;
        host.appendChild(el);
        return { el, dir: latLonToVec3(f.lat, f.lon, 1), anchor: new THREE.Vector3(), ndc: new THREE.Vector3(), shown: false };
      });
    })
    .catch(() => {});

  const camToAnchor = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const placed = []; // 本幀已放置的 {x,y},供去重

  function hide(L) {
    if (L.shown) { L.el.style.opacity = "0"; L.el.style.transform = "translate(-9999px,-9999px)"; L.shown = false; }
  }

  function update() {
    if (!labels.length) return;
    const camDist = camera.position.length();
    const gate = THREE.MathUtils.clamp((FAR - camDist) / (FAR - NEAR), 0, 1);
    if (gate <= 0.001) { for (const L of labels) hide(L); return; }

    const rect = renderer.domElement.getBoundingClientRect();
    placed.length = 0;

    for (const L of labels) {
      L.anchor.copy(L.dir).multiplyScalar(1.015).applyMatrix4(globeObject.matrixWorld);
      worldNormal.copy(L.dir).transformDirection(globeObject.matrixWorld);
      camToAnchor.copy(camera.position).sub(L.anchor).normalize();
      const facing = worldNormal.dot(camToAnchor);
      L.ndc.copy(L.anchor).project(camera);
      const behind = L.ndc.z > 1;

      if (behind || facing < 0.12 || Math.abs(L.ndc.x) > 1 || Math.abs(L.ndc.y) > 1) { hide(L); continue; }

      const x = rect.left + (L.ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-L.ndc.y * 0.5 + 0.5) * rect.height;

      // 螢幕空間去重:太靠近已放置的標籤就跳過這一個
      let clash = false;
      for (const p of placed) {
        if (Math.abs(p.x - x) < 96 && Math.abs(p.y - y) < 22) { clash = true; break; }
      }
      if (clash) { hide(L); continue; }
      placed.push({ x, y });

      const edgeFade = THREE.MathUtils.clamp((facing - 0.12) / 0.25, 0, 1);
      L.el.style.opacity = (gate * edgeFade).toFixed(2);
      L.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      L.shown = true;
    }
  }

  return { update };
}
