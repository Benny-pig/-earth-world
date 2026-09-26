import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import earcut from "earcut";
import { latLonToXYZ, ringCentroid } from "../lib/geo.js";
import { iterCountryPolygons, countryCode, countryNames } from "./borders.js";

const HOVER_COLOR = 0x66e0ff;
const BASE_OPACITY = 0.001;
const HOVER_OPACITY = 0.28;

const SELECT_SCALE = 1.05;
const SELECT_OPACITY = 0.42;
const SELECT_COLOR = 0x4da3ff;
const OUTLINE_COLOR = 0x9fe9ff;
const OUTLINE_RADIUS = 1.055;
const OUTLINE_OPACITY = 0.9;
const SEL_IN_SEC = 0.42;     // ease-in duration for the lift
const SEL_OUT_SEC = 0.3;     // ease-out when deselecting
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

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

  // 點國家/滑過的判斷用的索引:每塊多邊形的經緯度外框 + 原始座標。以前是拿射線去打
  // 每一國的三角網格(大國幾萬個三角形,一次 5 毫秒以上,每秒 20 次),手機上操作會卡;
  // 改成先算射線打到地球表面的經緯度,再查它落在哪一國的多邊形裡,快幾十倍。
  const polyIndex = [];   // { code, bbox: [minLon, minLat, maxLon, maxLat], rings }
  const pending = [];     // 還沒建好三角網格的國家(載入後分批建,不要一次卡住畫面)

  for (const feature of geojson.features) {
    const code = countryCode(feature);
    const names = countryNames(feature);
    let biggestRing = null, biggestLen = -1, any = false;
    for (const rings of iterCountryPolygons(feature)) {
      if (!rings.length || !rings[0].length) continue;
      any = true;
      let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
      for (const [lon, lat] of rings[0]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      polyIndex.push({ code, bbox: [minLon, minLat, maxLon, maxLat], rings });
      if (rings[0].length > biggestLen) { biggestLen = rings[0].length; biggestRing = rings[0]; }
    }
    if (!any || meshByCode.has(code)) continue;

    // 平常(沒被指到、沒被選取)透明度只有 0.001,肉眼看不見,卻實測佔了每幀
    // 繪製時間的大半——所以平常直接不畫,只有滑過/選取時才打開(見 setOpacity)。
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: BASE_OPACITY, visible: false,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const wrap = new THREE.Group();
    wrap.userData = { code, names, centroidLatLon: biggestRing ? ringCentroid(biggestRing) : [0, 0], material, feature };
    group.add(wrap);
    meshByCode.set(code, wrap);
    pending.push(code);
  }

  // 建一國的三角網格(同一國的所有島嶼合併成一個 mesh:50m 精細地圖有一千六百多塊多邊形,
  // 每塊一個 mesh 就是一千六百多次繪製呼叫,合併後只剩國家數量)
  const built = new Set();
  function ensureMesh(code) {
    if (built.has(code)) return;
    built.add(code);
    const wrap = meshByCode.get(code);
    if (!wrap) return;
    const geoms = [];
    for (const rings of iterCountryPolygons(wrap.userData.feature)) {
      try { geoms.push(ringsToMeshGeometry(rings, radius)); }
      catch (e) { console.warn("[country-layer] 三角化失敗,略過一塊多邊形:", code, e.message); }
    }
    if (!geoms.length) return;
    const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
    if (merged !== geoms[0]) geoms.forEach((g) => g.dispose());
    wrap.add(new THREE.Mesh(merged, wrap.userData.material));
  }
  // 分批建:每次最多用 8 毫秒就讓出主執行緒,畫面(包括開場運鏡)不會卡一下
  (function pump() {
    const t0 = performance.now();
    while (pending.length && performance.now() - t0 < 8) ensureMesh(pending.shift());
    if (pending.length) setTimeout(pump, 16);
  })();

  function inRing(ring, lon, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // 經緯度 → 國家代碼(沒有落在任何國家 = 海上,回傳 null)
  function codeAt(lat, lon) {
    for (const p of polyIndex) {
      const b = p.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (!inRing(p.rings[0], lon, lat)) continue;
      let hole = false;
      for (let h = 1; h < p.rings.length; h++) if (inRing(p.rings[h], lon, lat)) { hole = true; break; }
      if (!hole && meshByCode.has(p.code)) return p.code;
    }
    return null;
  }

  function setOpacity(m, v) {
    m.opacity = v;
    m.visible = v > BASE_OPACITY;
  }

  let hoverCode = null;
  function setHover(code) {
    if (code === hoverCode) return;
    if (hoverCode && hoverCode !== selectedCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      setOpacity(m, BASE_OPACITY); m.color.set(0xffffff);
    }
    hoverCode = code;
    if (hoverCode && hoverCode !== selectedCode && meshByCode.has(hoverCode)) {
      ensureMesh(hoverCode);
      const m = meshByCode.get(hoverCode).userData.material;
      setOpacity(m, HOVER_OPACITY); m.color.set(HOVER_COLOR);
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
    const m = w.userData.material;
    setOpacity(m, isHover ? HOVER_OPACITY : BASE_OPACITY);
    m.color.set(isHover ? HOVER_COLOR : 0xffffff);
    m.depthTest = false;      // 恢復預設:非選取狀態不參與深度測試
    m.needsUpdate = true;
  }

  let selT = 0;              // 0..1 選取抬起動畫進度
  let releasing = null;      // { code, t } 正在緩降的前一個選取國

  function setSelected(code) {
    if (code === selectedCode) return;
    if (selectedCode && meshByCode.has(selectedCode)) {
      releasing = { code: selectedCode, t: selT };   // 交給 update() 緩降
    }
    selectedCode = null;
    if (selOutline) selOutline.visible = false;

    if (!code || !meshByCode.has(code)) return;
    ensureMesh(code);
    selectedCode = code;
    selT = 0;
    const w = meshByCode.get(code);
    w.userData.material.color.set(SELECT_COLOR);
    w.userData.material.depthTest = true;    // 選取國參與深度測試 → 繞到背面時被地球遮住,不再穿透
    w.userData.material.needsUpdate = true;

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
    if (releasing && releasing.code === code) releasing = null;
  }

  function applyLift(code, k) {
    const w = meshByCode.get(code);
    if (!w) return;
    w.scale.setScalar(1 + (SELECT_SCALE - 1) * k);
    setOpacity(w.userData.material, BASE_OPACITY + (SELECT_OPACITY - BASE_OPACITY) * k);
  }

  // 由主迴圈每幀呼叫:平滑的抬起 / 緩降,以及選取外框的柔和脈動。
  function update(dt) {
    if (selectedCode && meshByCode.has(selectedCode)) {
      selT = Math.min(1, selT + dt / SEL_IN_SEC);
      applyLift(selectedCode, easeOutCubic(selT));
    }
    if (releasing) {
      releasing.t = Math.max(0, releasing.t - dt / SEL_OUT_SEC);
      if (releasing.code !== selectedCode) applyLift(releasing.code, easeOutCubic(releasing.t));
      if (releasing.t <= 0) {
        if (releasing.code !== selectedCode) restoreCountry(releasing.code);
        releasing = null;
      }
    }
    if (selOutline && selOutline.visible) {
      selOutline.material.opacity = OUTLINE_OPACITY * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0038)));
    }
  }

  // 射線 → 打到地球表面哪個國家。先把射線換到地球自己的座標(地球會自轉),用球面公式
  // 算交點(第一個交點就是面向我們的那一面,不會穿到背面),換成經緯度後查國家。
  const invMat = new THREE.Matrix4(), localRay = new THREE.Ray(), hitPt = new THREE.Vector3();
  const pickSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  function pick(raycaster) {
    group.updateWorldMatrix(true, false);
    invMat.copy(group.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(invMat);
    if (!localRay.intersectSphere(pickSphere, hitPt)) return null;
    const r = hitPt.length() || 1;
    const lat = Math.asin(THREE.MathUtils.clamp(hitPt.y / r, -1, 1)) * 180 / Math.PI;
    const lon = Math.atan2(-hitPt.z, hitPt.x) * 180 / Math.PI;
    const code = codeAt(lat, lon);
    if (!code) return null;
    const { names, centroidLatLon, feature } = meshByCode.get(code).userData;
    const pop = feature && feature.properties ? feature.properties.POP_EST : null;
    return { code, names, centroidLatLon, pop: Number.isFinite(pop) ? pop : null };
  }

  return { group, pick, codeAt, ensureMesh, setHover, setSelected, update, hasSelection: () => selectedCode != null, meshByCode };
}
