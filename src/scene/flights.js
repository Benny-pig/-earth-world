import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "../ui/draggable.js";

// 當地即時航班:資料源 adsb.lol(免金鑰、社群 ADS-B 資料),但它(跟大部分航班
// API 一樣)不開放瀏覽器直接跨網域抓資料,得透過 cloudflare-worker/flight-proxy.js
// 這支自己架的小代理轉發、補上 CORS 標頭——部署方式見那個檔案開頭的說明。
// 部署好之後把網址填進下面的 PROXY_URL 就能用;沒填之前這個圖層的開關按了
// 也不會出錯,只是打不到資料、顯示提示訊息。
const PROXY_URL = "https://earth-world-flights.a7779782.workers.dev";

const REFRESH_MS = 25_000;
const DEG = Math.PI / 180;
function latLonToVec3(latDeg, lonDeg, r = 1) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, cl = Math.cos(lat);
  return new THREE.Vector3(r * cl * Math.cos(lon), r * Math.sin(lat), -r * cl * Math.sin(lon));
}

// 「當地」先固定查台灣周邊空域(海峽、周邊國際航線密集區),不是全球——全球
// 同時在飛的飛機上萬架,直接全部畫出來地球會被點滿,參考網站也是限定範圍/
// 鎖定目標才顯示,不是一次全畫。
const REGION = { lat: 23.7, lon: 121.0, radiusNm: 250 };

function fmtAlt(ft) {
  if (typeof ft !== "number") return "—";
  return `${Math.round(ft).toLocaleString("en-US")} ft`;
}
function fmtSpeed(kt) {
  if (typeof kt !== "number") return "—";
  return `${Math.round(kt)} kt`;
}

export function createFlightsLayer({ globeObject, camera, renderer, naturePopup }) {
  const host = document.getElementById("flight-labels");
  if (!host) return { update() {}, dispose() {}, setEnabled() {}, isEnabled: () => false };

  let flights = [];
  let enabled = false;
  let timer = null;
  let lastSuccessAt = 0;
  // 上游偶爾會斷斷續續打不到,失敗一兩次就馬上清空畫面反而會一直閃爍。但如果
  // 已經好一段時間沒成功過,舊資料的飛機位置早就跟現實對不上了,還留著看起來
  // 像飛機停在原地不動、像功能正常運作但其實資料是假的——所以拖太久沒更新就
  // 清掉、改顯示忙線提示,比留著不會動的舊飛機圖示誠實。
  const STALE_MS = 90_000;
  function showStaleHint() {
    if (Date.now() - lastSuccessAt > STALE_MS) {
      host.innerHTML = `<div class="flight-setup-hint">✈️ 航班資料暫時查不到(來源忙線中),稍後會自動重試</div>`;
      flights = [];
    }
  }

  async function refresh() {
    if (!enabled) return;
    if (!PROXY_URL) {
      host.innerHTML = `<div class="flight-setup-hint">✈️ 航班代理伺服器還沒設定(見 src/scene/flights.js 的 PROXY_URL)</div>`;
      return;
    }
    try {
      const r = await fetch(`${PROXY_URL}/?lat=${REGION.lat}&lon=${REGION.lon}&radius=${REGION.radiusNm}`);
      if (!r.ok) {
        showStaleHint();
        return;
      }
      const data = await r.json();
      if (!Array.isArray(data.ac)) return;

      lastSuccessAt = Date.now();
      host.innerHTML = "";
      flights = data.ac
        .filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
        .map((a) => {
          const heading = a.true_heading ?? a.track ?? 0;
          const callsign = (a.flight || a.r || a.hex || "").trim();

          const wrap = document.createElement("div");
          wrap.className = "flight-wrap";

          const icon = document.createElement("div");
          icon.className = "flight-icon";
          icon.style.transform = `rotate(${heading}deg)`;
          icon.textContent = "✈";
          wrap.appendChild(icon);

          const label = document.createElement("div");
          label.className = "flight-label";
          label.innerHTML = `<b>${esc(callsign || "未知")}</b>` +
            `<div class="flight-label-sub">${esc(a.t || "")} · ${fmtAlt(a.alt_baro)}</div>`;
          wrap.appendChild(label);

          const showPopup = (e) => {
            naturePopup.show({
              icon: "✈",
              zh: callsign || "未知航班",
              en: a.t || "",
              note: `高度 ${fmtAlt(a.alt_baro)} · 航速 ${fmtSpeed(a.gs)} · 航向 ${Math.round(heading)}°`,
            }, e.clientX, e.clientY);
          };
          wrap.addEventListener("click", showPopup);

          host.appendChild(wrap);
          return { wrap, dir: latLonToVec3(a.lat, a.lon, 1), anchor: new THREE.Vector3(), ndc: new THREE.Vector3() };
        });
    } catch (e) {
      showStaleHint();
      console.error("[flights] refresh failed:", e);
    }
  }

  function start() {
    if (timer) return;
    refresh().catch((e) => console.error("[flights] start failed:", e));
    timer = setInterval(() => refresh().catch((e) => console.error("[flights] refresh failed:", e)), REFRESH_MS);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    host.innerHTML = "";
    flights = [];
  }

  const panel = document.getElementById("flight-panel");
  const panelClose = document.getElementById("flight-panel-close");
  const panelRefresh = document.getElementById("flight-refresh");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"));
  if (panelClose) panelClose.addEventListener("click", () => {
    setEnabled(false);
    document.getElementById("flight-toggle")?.setAttribute("aria-pressed", "false");
  });
  if (panelRefresh) panelRefresh.addEventListener("click", () => { if (enabled) refresh().catch((e) => console.error("[flights] refresh failed:", e)); });

  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    if (enabled) start(); else stop();
  }

  const camToAnchor = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();

  function update() {
    if (!enabled || !flights.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    for (const F of flights) {
      F.anchor.copy(F.dir).multiplyScalar(1.02).applyMatrix4(globeObject.matrixWorld);
      worldNormal.copy(F.dir).transformDirection(globeObject.matrixWorld);
      camToAnchor.copy(camera.position).sub(F.anchor).normalize();
      const facing = worldNormal.dot(camToAnchor);
      F.ndc.copy(F.anchor).project(camera);
      const behind = F.ndc.z > 1;

      if (behind || facing < 0.05) {
        F.wrap.style.opacity = "0";
        F.wrap.style.transform = "translate(-9999px,-9999px)";
        continue;
      }
      const x = rect.left + (F.ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-F.ndc.y * 0.5 + 0.5) * rect.height;
      const op = THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1).toFixed(2);
      F.wrap.style.opacity = op;
      F.wrap.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  function dispose() {
    clearInterval(timer);
    host.innerHTML = "";
    flights = [];
  }

  return { update, dispose, setEnabled, isEnabled: () => enabled };
}
