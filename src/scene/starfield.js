import * as THREE from "three";

export function createStarfield({ count = 5000, radius = 60 } = {}) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.7 + Math.random() * 0.3);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.18, sizeAttenuation: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  });

  const object = new THREE.Points(geom, material);
  object.renderOrder = -1;

  return {
    object,
    update(elapsed) {
      material.opacity = 0.75 + 0.2 * Math.sin(elapsed * 0.6);
    },
  };
}
