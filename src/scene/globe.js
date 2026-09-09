import * as THREE from "three";
import { latLonToXYZ, subsolarPoint } from "/src/lib/geo.js";

const SPIN_RATE = (2 * Math.PI) / 60; // 一圈 60 秒

// 遠處一顆柔和暖光,標示太陽方向 —— 不是刺眼的圓盤,被地球擋住時自然隱藏。
function makeSunGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,246,220,0.95)");
  rg.addColorStop(0.22, "rgba(255,232,176,0.40)");
  rg.addColorStop(1, "rgba(255,220,150,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

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
  lightRig.add(sun);
  lightRig.add(new THREE.HemisphereLight(0x7c9fd6, 0x0b1020, 0.6));
  lightRig.add(new THREE.AmbientLight(0x334466, 0.35));

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSunGlowTexture(),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,   // 保留 depthTest,讓地球自然遮擋
    opacity: 0.6,
  }));
  sunGlow.scale.setScalar(1.4);
  lightRig.add(sunGlow);

  // 依「當下真實時間」把太陽放到直射點,晨昏線因此大致對齊現實;之後每 5 分鐘微調。
  // (地球本身仍以 SPIN_RATE 自轉,所以晝夜會掃過表面,並非天文精確。)
  function aimSun(date = new Date()) {
    const { lat, lon } = subsolarPoint(date);
    const d = latLonToXYZ(lat, lon, 1);
    sun.position.set(d.x * 5, d.y * 5, d.z * 5);
    sunGlow.position.set(d.x * 12, d.y * 12, d.z * 12);
  }
  aimSun();
  const sunTimer = setInterval(() => aimSun(), 5 * 60 * 1000);

  let paused = false;
  return {
    object,
    mesh,
    sun,
    lightRig,
    aimSun,
    dispose() { clearInterval(sunTimer); },
    setSpinPaused(v) { paused = v; },
    update(dt) { if (!paused) object.rotation.y += SPIN_RATE * dt; },
  };
}
