import * as THREE from "three";
import { esc } from "../lib/esc.js";

// 全球地震顯示:美國地質調查所(USGS)公開 GeoJSON,免金鑰、每分鐘更新。
// 只抓規模 4.5 以上(近一天),避免上百筆小地震把地球點滿看不清楚。
const USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const REFRESH_MS = 60_000;

const DEG = Math.PI / 180;
function latLonToVec3(latDeg, lonDeg, r = 1) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, cl = Math.cos(lat);
  return new THREE.Vector3(r * cl * Math.cos(lon), r * Math.sin(lat), -r * cl * Math.sin(lon));
}

// 規模 → 顏色(黃→橙→紅,愈強愈醒目),沿用氣象常見的地震分級配色
function magColor(mag) {
  if (mag >= 7) return "#e74c3c";
  if (mag >= 6) return "#eb6f4a";
  if (mag >= 5) return "#f2994a";
  return "#f2c94c";
}

function relTime(ms) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export function createEarthquakesLayer({ globeObject, camera, renderer, naturePopup }) {
  const host = document.getElementById("earthquake-labels");
  if (!host) return { update() {}, dispose() {}, setEnabled() {}, isEnabled: () => false };

  let quakes = [];
  let enabled = true;
  let timer = null;

  async function refresh() {
    if (!enabled) return;
    let data;
    try {
      const r = await fetch(USGS_FEED);
      if (!r.ok) return;
      data = await r.json();
      if (!Array.isArray(data.features)) return;

      host.innerHTML = "";
      quakes = data.features
        .filter((f) => f.properties && typeof f.properties.mag === "number" && Array.isArray(f.geometry?.coordinates))
        .map((f) => {
          const [lon, lat, depth] = f.geometry.coordinates;
          const { mag, place, time } = f.properties;
          const size = Math.round(8 + Math.max(0, mag) * 3);
          const color = magColor(mag);
          const el = document.createElement("div");
          el.className = "quake-marker";
          el.style.width = el.style.height = `${size}px`;
          el.style.borderColor = color;
          el.style.background = color + "55";
          if (mag >= 6) el.classList.add("quake-marker-strong");
          el.addEventListener("click", (e) => {
            naturePopup.show({
              icon: "◉",
              zh: `規模 ${mag.toFixed(1)}`,
              en: place || "",
              note: `深度 ${Math.round(depth || 0)} 公里 · ${relTime(time)}`,
            }, e.clientX, e.clientY);
          });
          host.appendChild(el);

          // 字卡:不用點選就能看到規模、時間、地點(參考網站那種常駐telemetry卡片風格)
          const label = document.createElement("div");
          label.className = "quake-label";
          label.style.borderColor = color;
          label.innerHTML = `<b style="color:${color}">M${mag.toFixed(1)}</b><span class="quake-label-time">${esc(relTime(time))}</span>` +
            (place ? `<div class="quake-label-place">${esc(place)}</div>` : "");
          host.appendChild(label);

          return { el, label, dir: latLonToVec3(lat, lon, 1), anchor: new THREE.Vector3(), ndc: new THREE.Vector3() };
        });
    } catch (e) {
      console.error("[earthquakes] refresh failed:", e); // 離線、USGS 暫時打不通或資料格式異常,保留上一次資料,靜默略過
    }
  }

  function start() {
    if (timer) return;
    refresh().catch((e) => console.error("[earthquakes] start failed:", e));
    timer = setInterval(() => refresh().catch((e) => console.error("[earthquakes] refresh failed:", e)), REFRESH_MS);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    host.innerHTML = "";
    quakes = [];
  }
  function setEnabled(v) {
    enabled = !!v;
    if (enabled) start(); else stop();
  }
  start();

  const camToAnchor = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();

  function update() {
    if (!enabled || !quakes.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    for (const Q of quakes) {
      Q.anchor.copy(Q.dir).multiplyScalar(1.02).applyMatrix4(globeObject.matrixWorld);
      worldNormal.copy(Q.dir).transformDirection(globeObject.matrixWorld);
      camToAnchor.copy(camera.position).sub(Q.anchor).normalize();
      const facing = worldNormal.dot(camToAnchor);
      Q.ndc.copy(Q.anchor).project(camera);
      const behind = Q.ndc.z > 1;

      if (behind || facing < 0.05) {
        Q.el.style.opacity = "0";
        Q.el.style.transform = "translate(-9999px,-9999px)";
        Q.label.style.opacity = "0";
        Q.label.style.transform = "translate(-9999px,-9999px)";
        continue;
      }
      const x = rect.left + (Q.ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-Q.ndc.y * 0.5 + 0.5) * rect.height;
      const op = THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1).toFixed(2);
      Q.el.style.opacity = op;
      Q.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      Q.label.style.opacity = op;
      Q.label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(10px, -50%)`;
    }
  }

  function dispose() {
    clearInterval(timer);
    host.innerHTML = "";
    quakes = [];
  }

  return { update, dispose, setEnabled, isEnabled: () => enabled };
}
