import * as THREE from "three";

const vertexShader = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    vTwinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (90.0 / -mv.z) * (0.85 + 0.3 * vTwinkle);
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float glow = smoothstep(0.5, 0.12, d);
    gl_FragColor = vec4(vColor * glow * vTwinkle, glow);
  }
`;

export function createStarfield({ count = 14000, radius = 60 } = {}) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.75 + Math.random() * 0.25);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    // most stars small; a few large & bright
    const t = Math.random();
    sizes[i] = t > 0.98 ? 1.6 + Math.random() * 1.0 : 0.4 + Math.random() * 0.7;
    phases[i] = Math.random() * Math.PI * 2;
    // colour: mostly white-blue, some warm
    const warm = Math.random() > 0.85;
    c.setHSL(warm ? 0.09 : 0.6, warm ? 0.5 : 0.35, 0.85 + Math.random() * 0.15);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geom.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: { value: 0 } },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const object = new THREE.Points(geom, material);
  object.renderOrder = -1;
  object.frustumCulled = false;

  return {
    object,
    update(elapsed) { material.uniforms.uTime.value = elapsed; },
  };
}
