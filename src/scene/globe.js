import * as THREE from "three";
import { latLonToXYZ, subsolarPoint } from "../lib/geo.js";
import { texUrl } from "../lib/device.js";

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
    ).replace(
      // 🌅 大氣層(地表這一層):白天那側的邊緣罩一層淡藍色的霧、晨昏線上一抹橘紅,
      // 再加上太陽照在海面上的反光(用貼圖顏色判斷海洋:偏藍、偏暗、不綠;陸地不反光)
      "#include <opaque_fragment>",
      `#if NUM_DIR_LIGHTS > 0
      {
        vec3 atmN = normalize( vNormal );
        vec3 atmV = normalize( vViewPosition );
        vec3 atmL = directionalLights[ 0 ].direction;
        float atmSun = dot( atmN, atmL );
        float atmDay = smoothstep( -0.2, 0.3, atmSun );
        float atmFres = pow( 1.0 - clamp( dot( atmN, atmV ), 0.0, 1.0 ), 4.0 );
        outgoingLight += vec3( 0.30, 0.55, 1.0 ) * atmFres * atmDay * 0.4;
        float atmDusk = exp( -pow( ( atmSun - 0.02 ) / 0.14, 2.0 ) );
        outgoingLight += vec3( 1.0, 0.45, 0.15 ) * atmDusk * ( 0.05 + atmFres * 0.35 );
        float atmWater = smoothstep( 0.015, 0.08, diffuseColor.b - diffuseColor.r ) * ( 1.0 - smoothstep( 0.18, 0.35, diffuseColor.g ) );
        vec3 atmH = normalize( atmL + atmV );
        float atmSpec = pow( max( dot( normal, atmH ), 0.0 ), 140.0 ) * atmWater * smoothstep( 0.0, 0.15, atmSun );
        outgoingLight += vec3( 1.0, 0.92, 0.75 ) * atmSpec * 0.3;
      }
      #endif
      #include <opaque_fragment>`,
    );
  };

  // 🌅 大氣層(外圈光暈):比地球大一點的殼,只畫背面 → 只會在地球輪廓外面露出一圈光。
  // 越靠近地表越亮、往外淡出;白天那側是藍色、晨昏線附近偏橘紅、夜晚那側幾乎看不到。
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vP = wp.xyz;
        vN = normalize( mat3( modelMatrix ) * normal );
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vec3 V = normalize( cameraPosition - vP );
        float edge = clamp( -dot( V, vN ) / 0.42, 0.0, 1.0 );
        float glow = pow( edge, 2.6 );
        float sd = dot( normalize( vP ), sunDir );
        float day = smoothstep( -0.28, 0.35, sd );
        float dusk = exp( -pow( ( sd - 0.02 ) / 0.16, 2.0 ) );
        vec3 col = mix( vec3( 0.32, 0.62, 1.0 ), vec3( 1.0, 0.52, 0.22 ), dusk * 0.75 );
        float a = glow * ( 0.05 + 0.8 * day );
        gl_FragColor = vec4( col, a );
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 96, 96), atmoMat);
  atmosphere.raycast = () => {};   // 不影響點國家
  atmosphere.renderOrder = -0.5;

  // 非同步套貼圖;失敗就保留純色球
  (async () => {
    const [color, normal, night] = await Promise.all([
      load(texUrl("earth-color-4k.jpg", "earth-color-2k.jpg"), THREE.SRGBColorSpace),
      load(texUrl("earth-normal.jpg", "earth-normal-1k.jpg")),
      load(texUrl("earth-night-4k.jpg", "earth-night-2k.jpg"), THREE.SRGBColorSpace),
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
  lightRig.add(atmosphere);

  // 依「當下真實時間」把太陽放到直射點。地球以 SPIN_RATE 在固定的太陽下自轉,
  // 晝夜循環因此是真的;每 5 分鐘重新對齊,跟上太陽本身的緩慢位移。
  function aimSun(date = new Date()) {
    const { lat, lon } = subsolarPoint(date);
    const d = latLonToXYZ(lat, lon, 1);
    sun.position.set(d.x * 5, d.y * 5, d.z * 5);
    atmoMat.uniforms.sunDir.value.set(d.x, d.y, d.z).normalize();
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
