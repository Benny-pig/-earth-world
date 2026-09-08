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
    // back-side sphere: strongest where the surface faces away from the camera => limb
    float rim = 1.0 - abs(dot(viewDir, normalize(vNormalV)));
    rim = pow(clamp(rim, 0.0, 1.0), 2.2);
    gl_FragColor = vec4(uColor * rim * uIntensity, rim);
  }
`;

export function createAtmosphere({ radius = 1.015 } = {}) {
  const geometry = new THREE.SphereGeometry(radius, 96, 96);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(0x5aa9ff) },
      uIntensity: { value: 1.15 },
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
