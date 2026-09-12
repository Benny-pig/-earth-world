import * as THREE from "three";
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
    zh: zhHantName(code) || p.NAME_ZH || p.NAME || "未知",
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

export function buildBorders(geojson, { radius = 1.0025 } = {}) {
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
  for (const feature of geojson.features) {
    for (const rings of iterCountryPolygons(feature)) {
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          pushSeg(ring[i][1], ring[i][0], ring[i + 1][1], ring[i + 1][0]);
        }
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  const material = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.35 });
  const lines = new THREE.LineSegments(geom, material);
  lines.renderOrder = 2;
  return lines;
}
