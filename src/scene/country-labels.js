import * as THREE from "three";
import { iterCountryPolygons, countryCode, countryNames } from "../countries/borders.js";

const DEG = Math.PI / 180;
const MIN_AREA_NEAR = 0.4;   // deg^2 — when zoomed in, even small countries get a label
const MIN_AREA_FAR = 95;     // deg^2 — when zoomed out, only large countries
const MAX_LABELS_NEAR = 130; // cap scales with zoom so close-ups can name every visible country
const MAX_LABELS_FAR = 40;
const LABEL_W = 66;          // approx label box for on-screen collision culling
const LABEL_H = 26;

function latLonToDir(latDeg, lonDeg) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, cl = Math.cos(lat);
  return new THREE.Vector3(cl * Math.cos(lon), Math.sin(lat), -cl * Math.sin(lon));
}

export function createCountryLabels({ geojson, globeObject, camera, renderer }) {
  const host = document.getElementById("country-labels");
  const labels = [];

  for (const feature of geojson.features) {
    let best = null, bestArea = -1;
    for (const rings of iterCountryPolygons(feature)) {
      const outer = rings[0];
      if (!outer || outer.length < 4) continue;
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90, sx = 0, sy = 0, n = 0;
      for (const [lon, lat] of outer) {
        minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
        sx += lon; sy += lat; n++;
      }
      const area = (maxLon - minLon) * (maxLat - minLat);
      if (area > bestArea) { bestArea = area; best = { lon: sx / n, lat: sy / n }; }
    }
    if (!best) continue;
    const names = countryNames(feature);
    const el = document.createElement("div");
    el.className = "c-label";
    el.innerHTML = `<span class="zh">${names.zh}</span><span class="en">${names.en}</span>`;
    host.appendChild(el);
    labels.push({ el, dir: latLonToDir(best.lat, best.lon), area: bestArea, code: countryCode(feature) });
  }

  const anchor = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const camTo = new THREE.Vector3();
  const ndc = new THREE.Vector3();

  const placed = [];   // {x,y} screen centres of labels already shown this frame, for collision culling

  function hide(L) { L.el.style.opacity = "0"; L.el.style.transform = "translate(-9999px,-9999px)"; }

  function update() {
    const dist = camera.position.length();
    const threshold = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(dist, 1.6, 6, MIN_AREA_NEAR, MIN_AREA_FAR),
      MIN_AREA_NEAR, MIN_AREA_FAR,
    );
    const maxLabels = Math.round(THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(dist, 1.6, 6, MAX_LABELS_NEAR, MAX_LABELS_FAR),
      MAX_LABELS_FAR, MAX_LABELS_NEAR,
    ));
    const rect = renderer.domElement.getBoundingClientRect();

    // candidates above the area threshold, largest first (large countries win the label cap and collisions)
    const cands = labels.filter((L) => L.area >= threshold).sort((a, b) => b.area - a.area);
    const candSet = new Set(cands);
    for (const L of labels) if (!candSet.has(L)) hide(L);
    placed.length = 0;
    let count = 0;

    for (const L of cands) {
      if (count >= maxLabels) { hide(L); continue; }
      anchor.copy(L.dir).multiplyScalar(1.02).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(L.dir).transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(anchor).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(anchor).project(camera);
      if (ndc.z > 1 || facing < -0.05) { hide(L); continue; }
      const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
      // collision cull: skip if this label's box overlaps one already placed (higher priority)
      let clash = false;
      for (const q of placed) {
        if (Math.abs(q.x - x) < LABEL_W && Math.abs(q.y - y) < LABEL_H) { clash = true; break; }
      }
      if (clash) { hide(L); continue; }
      const fadeEdge = 0.7 + 0.3 * THREE.MathUtils.clamp((L.area / threshold - 1.0) / 0.6, 0, 1);
      const opacity = THREE.MathUtils.clamp((facing + 0.05) / 0.25, 0, 1) * fadeEdge;
      if (opacity <= 0.02) { hide(L); continue; }
      L.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      L.el.style.opacity = opacity.toFixed(2);
      placed.push({ x, y });
      count++;
    }
  }

  return { update };
}
