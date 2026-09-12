import * as THREE from "three";

const SPIN_RATE = (2 * Math.PI) / 42; // one revolution ~42s — a bit faster than the 60s globe so clouds drift

export function createClouds() {
  const geometry = new THREE.SphereGeometry(1.006, 96, 96);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    alphaMap: null,        // set after load
    depthWrite: false,
    roughness: 1.0,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;

  new THREE.TextureLoader().load(
    "assets/earth-clouds-2k.jpg",
    (t) => {
      t.colorSpace = THREE.NoColorSpace;      // alpha data, not colour
      t.anisotropy = 8;
      material.alphaMap = t;
      material.needsUpdate = true;
    },
    undefined,
    () => { console.warn("[clouds] 雲層貼圖載入失敗,略過雲層"); material.visible = false; },
  );

  let paused = false;
  return {
    object: mesh,
    setSpinPaused(v) { paused = v; },
    update(dt) { if (!paused) mesh.rotation.y += SPIN_RATE * dt; },
  };
}
