import * as THREE from "three";
import { latLonToXYZ, subsolarPoint } from "../lib/geo.js";

const SPIN_RATE = (2 * Math.PI) / 120; // 一圈 120 秒 —— 放慢成從容的自轉,看得到晨昏線掃過大陸

// 放射狀漸層貼圖,給太陽的核心與外暈用。stops = [[位置, rgba], ...]
function makeRadialTexture(stops, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = size / 2;
  const rg = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [pos, col] of stops) rg.addColorStop(pos, col);
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
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

  const geometry = new THREE.SphereGeometry(1, 160, 160);
  const material = new THREE.MeshStandardMaterial({ color: 0x2b3a55, metalness: 0.0, roughness: 1.0 });
  const mesh = new THREE.Mesh(geometry, material);
  object.add(mesh);
  // 城市燈光只在夜晚那一側亮:MeshStandardMaterial 的自發光本來不受光照影響,白天那面
  // 也會有燈光;依「表面法線跟太陽方向的夾角」把自發光乘上夜晚係數,晨昏線附近漸層淡出
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      #if NUM_DIR_LIGHTS > 0
        float sunDot = dot( normal, directionalLights[ 0 ].direction );
        totalEmissiveRadiance *= smoothstep( 0.12, -0.18, sunDot );
      #endif`,
    );
  };

  // 非同步套貼圖;失敗就保留純色球
  (async () => {
    const [color, normal, night] = await Promise.all([
      load("assets/earth-color-4k.jpg", THREE.SRGBColorSpace),
      load("assets/earth-normal.jpg"),
      load("assets/earth-night-4k.jpg", THREE.SRGBColorSpace),
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

  // 強烈方向光 + 很低的環境光 → 夜面夠暗、晨昏線俐落有戲劇感,城市燈才明顯。
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  lightRig.add(sun);
  lightRig.add(new THREE.HemisphereLight(0x5b7bb0, 0x090d18, 0.28));
  lightRig.add(new THREE.AmbientLight(0x2a3348, 0.12));

  // 看得見、但不刺眼的太陽:小而亮的核心 + 柔和外暈,兩者都保留 depthTest,
  // 轉到地球背面時被地球自然遮住;bloom 會替核心加上柔光。
  const sunGroup = new THREE.Group();
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture([[0, "rgba(255,252,244,1)"], [0.35, "rgba(255,241,205,0.9)"], [1, "rgba(255,230,170,0)"]]),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  sunCore.scale.setScalar(0.7);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture([[0, "rgba(255,240,205,0.5)"], [0.25, "rgba(255,226,170,0.22)"], [1, "rgba(255,215,150,0)"]]),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  sunHalo.scale.setScalar(3.2);
  sunGroup.add(sunHalo, sunCore);
  lightRig.add(sunGroup);

  // 依「當下真實時間」把太陽放到直射點。地球以 SPIN_RATE 在固定的太陽下自轉,
  // 晝夜循環因此是真的;每 5 分鐘重新對齊,跟上太陽本身的緩慢位移。
  function aimSun(date = new Date()) {
    const { lat, lon } = subsolarPoint(date);
    const d = latLonToXYZ(lat, lon, 1);
    sun.position.set(d.x * 5, d.y * 5, d.z * 5);
    sunGroup.position.set(d.x * 20, d.y * 20, d.z * 20);
  }
  aimSun();
  const sunTimer = setInterval(() => aimSun(), 5 * 60 * 1000);

  // 分頁在背景太久,瀏覽器會節流/暫停 setInterval,太陽位置停在舊值;
  // 切回分頁時立刻補算一次,不用等下一個 5 分鐘或使用者重新整理。
  function onVisible() { if (document.visibilityState === "visible") aimSun(); }
  document.addEventListener("visibilitychange", onVisible);

  let paused = false;
  // 🌗 真實晨昏線:停止裝飾性的自轉,把地球轉回「跟太陽的真實相對位置」(太陽光本來就放在
  // 當下的直射點,地球轉角 0 時晝夜就是真的)。開著的時候其他地方叫恢復自轉也不理。
  let realSun = false;
  return {
    object,
    mesh,
    sun,
    lightRig,
    aimSun,
    dispose() { clearInterval(sunTimer); document.removeEventListener("visibilitychange", onVisible); },
    setSpinPaused(v) { paused = v; },
    setRealSun(v) { realSun = !!v; if (realSun) aimSun(); },
    isRealSun: () => realSun,
    update(dt) {
      if (realSun) {
        // 平滑轉回最近的整圈位置(轉角 = 2π 的整數倍),不要一下子跳過去
        const target = Math.round(object.rotation.y / (2 * Math.PI)) * 2 * Math.PI;
        const d = target - object.rotation.y;
        object.rotation.y += Math.abs(d) < 1e-4 ? d : d * Math.min(1, dt * 2.5);
        return;
      }
      if (!paused) object.rotation.y += SPIN_RATE * dt;
    },
  };
}
