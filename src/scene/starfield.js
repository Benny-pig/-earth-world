import * as THREE from "three";

// 🌌 星空。真實的夜空是「非常多又小又暗的星點 + 極少數亮星」,星星在無限遠處,
// 鏡頭怎麼移動都不會晃、也不會忽大忽小。以前近景那層星星會隨距離放大、閃爍時跟著變大、
// 還隨鏡頭視差移動,看起來像一顆顆螢火蟲;現在改成:
//   - 全部固定像素大小:絕大多數不到 1 像素(用亮度表現),只有約 1% 的亮星稍微大一點
//   - 亮度照真實星等的比例分布(暗星多、亮星極少),顏色有藍白、白、淡黃、橘
//   - 銀河帶(背景貼圖的中線 = 星空球的赤道)附近星星比較密
//   - 閃爍只輕微改變亮度,不改變大小
const vertexShader = `
  attribute float aSize;
  attribute float aBright;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = aSize * uPixelRatio;
    // 太小的星畫成 1.6 個裝置像素,但依面積比例調暗:看起來是更細更暗的點,不會糊成一團
    float drawn = max(px, 1.6);
    gl_PointSize = drawn;
    float speed = 0.5 + fract(aPhase * 1.37) * 1.6;
    float tw = 1.0 - 0.16 * (0.5 + 0.5 * sin(uTime * speed + aPhase));
    vAlpha = aBright * tw * clamp((px * px) / (drawn * drawn) + 0.3, 0.0, 1.0);
    vColor = aColor;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    if (d2 > 1.0) discard;
    float core = exp(-d2 * 4.5);
    gl_FragColor = vec4(vColor, core * vAlpha);
  }
`;

// 常態分布亂數(Box-Muller)
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// 恆星顏色依溫度:藍白、白、淡黃、橘(比例大致照肉眼看得到的星星)
const STAR_TINTS = [
  { w: 0.16, h: 0.6, s: 0.4 },
  { w: 0.5, h: 0.6, s: 0.06 },
  { w: 0.24, h: 0.13, s: 0.32 },
  { w: 0.1, h: 0.07, s: 0.6 },
];

function makeStars({ count, radius, bandShare, pixelRatio }) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const bright = new Float32Array(count);
  const phase = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // 方向:一部分集中在銀河帶(赤道附近,常態分布),其餘平均分布在整個天空
    let lat;
    if (Math.random() < bandShare) lat = THREE.MathUtils.clamp(gauss() * 0.16, -1.5, 1.5);
    else lat = Math.asin(2 * Math.random() - 1);
    const lon = Math.random() * Math.PI * 2;
    const cl = Math.cos(lat);
    pos[i * 3] = radius * cl * Math.cos(lon);
    pos[i * 3 + 1] = radius * Math.sin(lat);
    pos[i * 3 + 2] = radius * cl * Math.sin(lon);
    // 星等:大多數很暗,越亮越少
    const r = Math.random();
    bright[i] = 0.1 + 0.85 * Math.pow(r, 4);
    size[i] = 0.55 + 1.5 * Math.pow(r, 12);          // CSS 像素;只有最亮的約 1% 會到 1.5~2 像素
    phase[i] = Math.random() * Math.PI * 2;
    let pick = Math.random(), t = STAR_TINTS[0];
    for (const tint of STAR_TINTS) { if (pick < tint.w) { t = tint; break; } pick -= tint.w; }
    c.setHSL(t.h, t.s, 0.86 + Math.random() * 0.1);
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geom.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geom.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geom, material);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return { points, material };
}

export function createStarfield() {
  const group = new THREE.Group();

  // 1. 銀河全景背景:很大的球(只畫內面),調暗一點免得搶走地球的風采
  const mwGeo = new THREE.SphereGeometry(420, 64, 64);
  const mwMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    color: 0x9aa4c0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const milkyWay = new THREE.Mesh(mwGeo, mwMat);
  milkyWay.renderOrder = -2;
  group.add(milkyWay);
  // 銀河背景是最大的一張圖,但第一眼不需要:等地球出現(載入畫面結束)後才下載、淡入,
  // 用自己的 LoadingManager,不讓載入畫面等它。手機也用 4K(背景放大後 2K 會糊,細節差很多)
  let bgLoading = false, fadeIn = false;
  function loadBackground() {
    if (bgLoading) return;
    bgLoading = true;
    mwMat.opacity = 0;
    new THREE.TextureLoader(new THREE.LoadingManager()).load(
      "assets/milky-way-4k.jpg",
      (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mwMat.map = t; mwMat.needsUpdate = true; fadeIn = true; },
      undefined,
      () => console.warn("[starfield] 銀河貼圖載入失敗,改用純星點背景"),
    );
  }

  // 2. 星點:細碎的暗星 + 極少數亮星,全部在同一個遠方球面上(不會有視差晃動)
  const stars = makeStars({ count: 24000, radius: 300, bandShare: 0.35, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) });
  group.add(stars.points);

  return {
    object: group,
    loadBackground,
    setPixelRatio(pr) { stars.material.uniforms.uPixelRatio.value = pr; },
    update(elapsed) {
      if (fadeIn) { mwMat.opacity = Math.min(0.85, mwMat.opacity + 0.012); if (mwMat.opacity >= 0.85) fadeIn = false; }
      stars.material.uniforms.uTime.value = elapsed;
      group.rotation.y = elapsed * 0.0009;   // 整片天空非常緩慢地轉(約 12 分鐘一圈),幾乎察覺不到
    },
  };
}
