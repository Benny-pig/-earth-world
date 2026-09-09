import * as THREE from "three";

const SPIN_RATE = (2 * Math.PI) / 60; // 一圈 60 秒

export function createGlobe({ onAllTexturesFailed } = {}) {
  const object = new THREE.Group();   // 自轉:只放 mesh(以及後續 Task 的邊界/國家圖層)
  const lightRig = new THREE.Group(); // 世界固定:太陽光方向本階段不隨地球轉
  const loader = new THREE.TextureLoader();

  const load = (url, colorSpace = THREE.NoColorSpace) => new Promise((res) => loader.load(
    url,
    (t) => { t.colorSpace = colorSpace; res(t); },
    undefined,
    () => { console.warn("[globe] 貼圖載入失敗:", url); res(null); },
  ));

  const geometry = new THREE.SphereGeometry(1, 96, 96);
  const material = new THREE.MeshStandardMaterial({ color: 0x2b3a55, metalness: 0.0, roughness: 1.0 });
  const mesh = new THREE.Mesh(geometry, material);
  object.add(mesh);

  // 非同步套貼圖;失敗就保留純色球
  (async () => {
    const [color, normal, night] = await Promise.all([
      load("/assets/earth-color-8k.jpg", THREE.SRGBColorSpace),
      load("/assets/earth-normal.jpg"),
      load("/assets/earth-night-8k.jpg", THREE.SRGBColorSpace),
    ]);
    if (color) { material.map = color; material.color.set(0xffffff); color.anisotropy = 8; }
    if (normal) { material.normalMap = normal; material.normalScale.set(0.8, 0.8); }
    if (night) {
      material.emissiveMap = night;
      material.emissive.set(0xffee88);
      material.emissiveIntensity = 1.1;
      night.anisotropy = 8;
    }
    material.needsUpdate = true;
    const loaded = [color, normal, night].filter(Boolean).length;
    if (loaded === 0 && typeof onAllTexturesFailed === "function") onAllTexturesFailed();
  })();

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-3, 1.2, 2.5);
  lightRig.add(sun);
  lightRig.add(new THREE.HemisphereLight(0x7c9fd6, 0x0b1020, 0.6));
  lightRig.add(new THREE.AmbientLight(0x334466, 0.35));

  let paused = false;
  return {
    object,
    mesh,
    sun,
    lightRig,
    setSpinPaused(v) { paused = v; },
    update(dt) { if (!paused) object.rotation.y += SPIN_RATE * dt; },
  };
}
