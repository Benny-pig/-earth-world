import * as THREE from "three";
import earcut from "earcut";
import { latLonToXYZ, ringCentroid } from "/src/lib/geo.js";
import { iterCountryPolygons, countryCode, countryNames } from "/src/countries/borders.js";

const HOVER_COLOR = 0x66e0ff;
const BASE_OPACITY = 0.001;
const HOVER_OPACITY = 0.28;

function ringsToMeshGeometry(rings, radius) {
  // rings: [outer, hole1, ...] 每個是 [[lon,lat],...]
  const flat = [];
  const holes = [];
  for (let r = 0; r < rings.length; r++) {
    if (r > 0) holes.push(flat.length / 2);
    for (const [lon, lat] of rings[r]) flat.push(lon, lat);
  }
  const idx = earcut(flat, holes, 2);
  const positions = new Float32Array((flat.length / 2) * 3);
  for (let i = 0; i < flat.length / 2; i++) {
    const p = latLonToXYZ(flat[i * 2 + 1], flat[i * 2], radius);
    positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(idx);
  return geom;
}

export function buildCountryLayer(geojson, { radius = 1.002 } = {}) {
  const group = new THREE.Group();
  const meshByCode = new Map();

  for (const feature of geojson.features) {
    const code = countryCode(feature);
    const names = countryNames(feature);
    const geoms = [];
    let biggestRing = null, biggestLen = -1;

    for (const rings of iterCountryPolygons(feature)) {
      try {
        geoms.push(ringsToMeshGeometry(rings, radius));
        if (rings[0].length > biggestLen) { biggestLen = rings[0].length; biggestRing = rings[0]; }
      } catch (e) {
        console.warn("[country-layer] 三角化失敗,略過一塊多邊形:", code, e.message);
      }
    }
    if (!geoms.length) continue;

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: BASE_OPACITY,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const meshes = geoms.map((g) => new THREE.Mesh(g, material));
    const wrap = new THREE.Group();
    meshes.forEach((m) => wrap.add(m));
    wrap.userData = { code, names, centroidLatLon: biggestRing ? ringCentroid(biggestRing) : [0, 0], material };
    group.add(wrap);
    meshByCode.set(code, wrap);
  }

  let hoverCode = null;
  function setHover(code) {
    if (code === hoverCode) return;
    if (hoverCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      m.opacity = BASE_OPACITY; m.color.set(0xffffff);
    }
    hoverCode = code;
    if (hoverCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      m.opacity = HOVER_OPACITY; m.color.set(HOVER_COLOR);
    }
  }

  function pick(raycaster, occluder) {
    const hits = raycaster.intersectObjects(group.children, true);
    if (!hits.length) return null;
    if (occluder) {
      const occ = raycaster.intersectObject(occluder, false)[0];
      // country layer sits at radius 1.002 vs globe 1.0, so a legit near-side
      // country hit is only ~0.002-0.02 in front of the globe surface hit
      if (occ && hits[0].distance > occ.distance + 0.02) return null;
    }
    let node = hits[0].object;
    while (node && !node.userData.code) node = node.parent;
    if (!node) return null;
    const { code, names, centroidLatLon } = node.userData;
    return { code, names, centroidLatLon };
  }

  return { group, pick, setHover, meshByCode };
}
