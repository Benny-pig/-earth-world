import * as THREE from "three";
import { iterCountryPolygons, countryCode, countryNames } from "/src/countries/borders.js";

const DEG = Math.PI / 180;
const MAX_LABELS = 46;
const MIN_AREA_NEAR = 3;     // deg^2 — when zoomed in, show countries this big or bigger
const MIN_AREA_FAR = 260;    // deg^2 — when zoomed out, only very large countries

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

  function update() {
    const dist = camera.position.length();
    const threshold = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(dist, 1.6, 6, MIN_AREA_NEAR, MIN_AREA_FAR),
      MIN_AREA_NEAR, MIN_AREA_FAR,
    );
    const rect = renderer.domElement.getBoundingClientRect();

    // pick the largest MAX_LABELS countries above threshold
    const shown = new Set();
    const cands = labels.filter((L) => L.area >= threshold).sort((a, b) => b.area - a.area);
    for (let i = 0; i < Math.min(MAX_LABELS, cands.length); i++) shown.add(cands[i]);

    for (const L of labels) {
      if (!shown.has(L)) { L.el.style.opacity = "0"; L.el.style.transform = "translate(-9999px,-9999px)"; continue; }
      anchor.copy(L.dir).multiplyScalar(1.02).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(L.dir).transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(anchor).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(anchor).project(camera);
      if (ndc.z > 1 || facing < -0.05) { L.el.style.opacity = "0"; L.el.style.transform = "translate(-9999px,-9999px)"; continue; }
      const fadeEdge = THREE.MathUtils.clamp((L.area / threshold - 1.0) / 0.4, 0, 1); // soft in/out as threshold crosses
      const opacity = THREE.MathUtils.clamp((facing + 0.05) / 0.25, 0, 1) * fadeEdge;
      if (opacity <= 0.02) { L.el.style.opacity = "0"; L.el.style.transform = "translate(-9999px,-9999px)"; continue; }
      const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
      L.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      L.el.style.opacity = opacity.toFixed(2);
    }
  }

  return { update };
}
