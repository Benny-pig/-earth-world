import * as THREE from "three";

const vertexShader = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vColor = aColor;
    vTw = 0.6 + 0.4 * sin(uTime * 1.7 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (140.0 / -mv.z) * (0.8 + 0.5 * vTw);
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.08, 0.5, d);
    gl_FragColor = vec4(vColor * core * vTw, core);
  }
`;

function makeStarLayer({ count, rMin, rMax, sizeMin, sizeMax, warmChance }) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = rMin + Math.random() * (rMax - rMin);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
    size[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
    phase[i] = Math.random() * Math.PI * 2;
    const warm = Math.random() < warmChance;
    c.setHSL(warm ? 0.08 : 0.58 + Math.random() * 0.08, warm ? 0.55 : 0.4, 0.8 + Math.random() * 0.2);
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geom.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geom, material);
  points.frustumCulled = false;
  return { points, material };
}

export function createStarfield() {
  const group = new THREE.Group();

  // 1. Milky Way panorama backdrop — very large BackSide sphere, dim
  const mwGeo = new THREE.SphereGeometry(420, 64, 64);
  const mwMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    color: 0x9aa4c0,           // tints/dims the panorama so it never overpowers the globe
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const milkyWay = new THREE.Mesh(mwGeo, mwMat);
  milkyWay.renderOrder = -2;
  group.add(milkyWay);
  new THREE.TextureLoader().load(
    "assets/milky-way-8k.jpg",
    (t) => { t.colorSpace = THREE.SRGBColorSpace; mwMat.map = t; mwMat.needsUpdate = true; },
    undefined,
    () => console.warn("[starfield] 銀河貼圖載入失敗,改用純星點背景"),
  );

  // 2. far dense faint layer + 3. near sparse bright layer (parallax when the camera orbits)
  const far = makeStarLayer({ count: 16000, rMin: 130, rMax: 260, sizeMin: 0.35, sizeMax: 1.1, warmChance: 0.08 });
  const near = makeStarLayer({ count: 2600, rMin: 30, rMax: 70, sizeMin: 1.0, sizeMax: 2.8, warmChance: 0.16 });
  far.points.renderOrder = -1;
  near.points.renderOrder = -1;
  group.add(far.points, near.points);

  return {
    object: group,
    update(elapsed) {
      far.material.uniforms.uTime.value = elapsed;
      near.material.uniforms.uTime.value = elapsed;
      // subtle life: whole sky drifts very slowly (~1 rev / 12 min); near layer a touch faster => parallax shimmer
      group.rotation.y = elapsed * 0.0009;
      near.points.rotation.y = elapsed * 0.0006;
    },
  };
}
