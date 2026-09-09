import * as THREE from "three";
import { latLonToXYZ } from "/src/lib/geo.js";
import { zhHantName } from "/src/countries/country-names.js";

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

export function buildBorders(geojson, { radius = 1.0025 } = {}) {
  const verts = [];
  for (const feature of geojson.features) {
    for (const rings of iterCountryPolygons(feature)) {
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = latLonToXYZ(ring[i][1], ring[i][0], radius);
          const b = latLonToXYZ(ring[i + 1][1], ring[i + 1][0], radius);
          verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
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
