import * as THREE from "three";

const vertexShader = `
  varying vec3 vNormalV;
  varying vec3 vPosV;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPosV = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  varying vec3 vNormalV;
  varying vec3 vPosV;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    vec3 viewDir = normalize(-vPosV);
    float raw = 1.0 - abs(dot(viewDir, normalize(vNormalV)));
    raw = clamp(raw, 0.0, 1.0);
    // faint near the globe silhouette, builds through the annulus, fades to 0 by the shell limb => soft on BOTH edges
    float rim = pow(raw, 2.5) * (1.0 - smoothstep(0.82, 1.0, raw));
    gl_FragColor = vec4(uColor * rim * uIntensity, rim);
  }
`;

export function createAtmosphere({ radius = 1.16 } = {}) {
  const geometry = new THREE.SphereGeometry(radius, 96, 96);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(0x5aa9ff) },
      uIntensity: { value: 1.1 },
    },
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}
