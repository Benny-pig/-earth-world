import * as THREE from "three";

const SPIN_RATE = (2 * Math.PI) / 60; // 一圈 60 秒

export function createGlobe() {
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
    const [color, normal, spec, night] = await Promise.all([
      load("/assets/earth-color.jpg", THREE.SRGBColorSpace),
      load("/assets/earth-normal.jpg"),
      load("/assets/earth-spec.jpg"),
      load("/assets/earth-night.png", THREE.SRGBColorSpace),
    ]);
    if (color) { material.map = color; material.color.set(0xffffff); }
    if (normal) { material.normalMap = normal; material.normalScale.set(0.8, 0.8); }
    if (spec) { material.roughnessMap = spec; material.roughness = 0.9; }
    if (night) {
      material.emissiveMap = night;
      material.emissive.set(0xffee88);
      material.emissiveIntensity = 1.1;
    }
    material.needsUpdate = true;
  })();

  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(-3, 1.2, 2.5);
  lightRig.add(sun);
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
