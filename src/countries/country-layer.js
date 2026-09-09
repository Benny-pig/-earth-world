import * as THREE from "three";
import earcut from "earcut";
import { latLonToXYZ, ringCentroid } from "/src/lib/geo.js";
import { iterCountryPolygons, countryCode, countryNames } from "/src/countries/borders.js";

const HOVER_COLOR = 0x66e0ff;
const BASE_OPACITY = 0.001;
const HOVER_OPACITY = 0.28;

const SELECT_SCALE = 1.055;
const SELECT_OPACITY = 0.5;
const SELECT_COLOR = 0x4da3ff;
const OUTLINE_COLOR = 0x9fe9ff;
const OUTLINE_RADIUS = 1.06;
const OUTLINE_OPACITY = 0.9;

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

  // earcut adds no interior points, so a big country's triangles cut chords
  // through the sphere (their flat interiors dip well below radius 1.0) and
  // pick()'s occlusion gate / the hover fill's depth test then reject them.
  // Subdivide: split any triangle whose longest 3D edge exceeds MAX_EDGE,
  // re-projecting each new midpoint back onto the sphere at `radius`.
  const MAX_EDGE = 0.06;         // ~3.4° of arc at r≈1
  const verts = [];             // flat xyz, seeded from `positions`
  for (let i = 0; i < positions.length; i++) verts.push(positions[i]);
  let tris = [];
  for (let i = 0; i < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]]);
  const midCache = new Map();
  const getMid = (a, b) => {
    const key = a < b ? a + "_" + b : b + "_" + a;
    let m = midCache.get(key);
    if (m !== undefined) return m;
    const ax = verts[a * 3], ay = verts[a * 3 + 1], az = verts[a * 3 + 2];
    const bx = verts[b * 3], by = verts[b * 3 + 1], bz = verts[b * 3 + 2];
    let mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    const len = Math.hypot(mx, my, mz) || 1;
    mx = mx / len * radius; my = my / len * radius; mz = mz / len * radius;
    m = verts.length / 3;
    verts.push(mx, my, mz);
    midCache.set(key, m);
    return m;
  };
  const edgeLen = (a, b) => Math.hypot(
    verts[a * 3] - verts[b * 3],
    verts[a * 3 + 1] - verts[b * 3 + 1],
    verts[a * 3 + 2] - verts[b * 3 + 2],
  );
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    const next = [];
    for (const [a, b, c] of tris) {
      const ab = edgeLen(a, b), bc = edgeLen(b, c), ca = edgeLen(c, a);
      if (Math.max(ab, bc, ca) <= MAX_EDGE) { next.push([a, b, c]); continue; }
      changed = true;
      if (ab >= bc && ab >= ca) { const m = getMid(a, b); next.push([a, m, c], [m, b, c]); }
      else if (bc >= ca) { const m = getMid(b, c); next.push([a, b, m], [a, m, c]); }
      else { const m = getMid(c, a); next.push([a, b, m], [b, c, m]); }
    }
    tris = next;
    if (!changed) break;
  }
  const outPos = new Float32Array(verts);
  const outIdx = [];
  for (const [a, b, c] of tris) outIdx.push(a, b, c);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
  geom.setIndex(outIdx);
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
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const meshes = geoms.map((g) => new THREE.Mesh(g, material));
    const wrap = new THREE.Group();
    meshes.forEach((m) => wrap.add(m));
    wrap.userData = { code, names, centroidLatLon: biggestRing ? ringCentroid(biggestRing) : [0, 0], material, feature };
    group.add(wrap);
    meshByCode.set(code, wrap);
  }

  let hoverCode = null;
  function setHover(code) {
    if (code === hoverCode) return;
    if (hoverCode && hoverCode !== selectedCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      m.opacity = BASE_OPACITY; m.color.set(0xffffff);
    }
    hoverCode = code;
    if (hoverCode && hoverCode !== selectedCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      m.opacity = HOVER_OPACITY; m.color.set(HOVER_COLOR);
    }
  }

  let selectedCode = null;
  let selOutline = null; // reusable THREE.LineSegments, rebuilt per selection

  function buildOutlineGeometry(feature) {
    const verts = [];
    for (const rings of iterCountryPolygons(feature)) {
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = latLonToXYZ(ring[i][1], ring[i][0], OUTLINE_RADIUS);
          const b = latLonToXYZ(ring[i + 1][1], ring[i + 1][0], OUTLINE_RADIUS);
          verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    return g;
  }

  function restoreCountry(code) {
    const w = meshByCode.get(code);
    if (!w) return;
    w.scale.setScalar(1);
    const isHover = code === hoverCode;
    w.userData.material.opacity = isHover ? HOVER_OPACITY : BASE_OPACITY;
    w.userData.material.color.set(isHover ? HOVER_COLOR : 0xffffff);
  }

  function setSelected(code) {
    if (code === selectedCode) return;
    if (selectedCode) restoreCountry(selectedCode);
    selectedCode = null;
    if (selOutline) selOutline.visible = false;

    if (!code || !meshByCode.has(code)) return;
    selectedCode = code;
    const w = meshByCode.get(code);
    w.scale.setScalar(SELECT_SCALE);
    w.userData.material.opacity = SELECT_OPACITY;
    w.userData.material.color.set(SELECT_COLOR);

    const geo = buildOutlineGeometry(w.userData.feature);
    if (!selOutline) {
      selOutline = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: OUTLINE_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      selOutline.renderOrder = 3;
      selOutline.raycast = () => {};
      group.add(selOutline);
    } else {
      selOutline.geometry.dispose();
      selOutline.geometry = geo;
    }
    selOutline.visible = true;
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

  return { group, pick, setHover, setSelected, hasSelection: () => selectedCode != null, meshByCode };
}
