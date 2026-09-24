import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { latLonToXYZ } from "../lib/geo.js";
import { zhHantName } from "./country-names.js";

export function countryCode(feature) {
  const p = feature.properties || {};
  for (const k of ["ISO_A2_EH", "ISO_A2"]) {
    if (p[k] && p[k] !== "-99") return String(p[k]).toUpperCase();
  }
  return (p.NAME || "??").toUpperCase();
}

export function countryNames(feature) {
  const p = feature.properties || {};
  const code = countryCode(feature);
  return {
    zh: zhHantName(code) || p.NAME_ZHT || p.NAME || "未知",
    en: p.NAME || "",
  };
}

export function iterCountryPolygons(feature) {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

// 每段最長弧(度);超過就切成多小段,讓折線貼著球面而非切過球體(消除「方塊感」)
const MAX_SEG_DEG = 0.6;

function segmentVerts(features, radius) {
  const verts = [];
  const pushSeg = (lat1, lon1, lat2, lon2) => {
    let dLon = lon2 - lon1;
    if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;   // 跨換日線走短邊
    const steps = Math.max(1, Math.ceil(Math.hypot(lat2 - lat1, dLon) / MAX_SEG_DEG));
    let prev = latLonToXYZ(lat1, lon1, radius);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cur = latLonToXYZ(lat1 + (lat2 - lat1) * t, lon1 + dLon * t, radius);
      verts.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
      prev = cur;
    }
  };
  for (const feature of features) {
    for (const rings of iterCountryPolygons(feature)) {
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          pushSeg(ring[i][1], ring[i][0], ring[i + 1][1], ring[i + 1][0]);
        }
      }
    }
  }
  return new Float32Array(verts);
}

export function buildBorders(geojson, { radius = 1.0025 } = {}) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(segmentVerts(geojson.features, radius), 3));
  const material = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.35 });
  const lines = new THREE.LineSegments(geom, material);
  lines.renderOrder = 2;
  return lines;
}

// 單一國家的醒目海岸線(台灣用):疊在一般國界上方,顏色比國界亮、線也比較粗。
// 一般 WebGL 線寬固定 1px,這裡改用 LineSegments2(寬度以螢幕像素計),只有一國的
// 海岸線、線段很少,不影響效能。
export function buildOutline(geojson, code, { color = 0xffd166, width = 2.2, opacity = 0.95 } = {}) {
  const features = geojson.features.filter((f) => countryCode(f) === code);
  if (!features.length) return null;
  const geom = new LineSegmentsGeometry();
  geom.setPositions(segmentVerts(features, 1.003));
  const material = new LineMaterial({ color, linewidth: width, transparent: true, opacity });
  const lines = new LineSegments2(geom, material);
  lines.renderOrder = 3;
  // LineMaterial 要知道畫面大小才能換算像素線寬(預設 1×1,線會粗到蓋滿整個畫面);
  // three r160 不會自動帶入,每次繪製前用畫布目前的尺寸更新,視窗縮放也跟著對。
  const size = new THREE.Vector2();
  lines.onBeforeRender = (renderer) => { material.resolution.copy(renderer.getSize(size)); };
  return lines;
}
