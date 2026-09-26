import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { latLonToXYZ } from "../lib/geo.js";
import { makeDraggable } from "../ui/draggable.js";

// 📺 世界即時景點直播地圖:地球上標出世界各地 24 小時直播的景點攝影機(澀谷十字路口、
// 威尼斯大運河、納米比亞沙漠水坑、夏威夷火山…),點一下就在面板裡播放 YouTube 直播,
// 旁邊顯示當地時間(白天還是晚上一看就懂)。「自動巡覽」會每隔一段時間換一個地方,像在轉世界頻道。
// 直播清單 data/livecams.json 由 tools/build-livecams.py 每週自動找「正在直播」的影片更新。
const REGIONS = [["AS", "🐼 亞洲"], ["ME", "🐪 中東"], ["EU", "🏰 歐洲"], ["NA", "🗽 北美"], ["LA", "🌮 中南美"], ["AF", "🦁 非洲"], ["OC", "🦘 大洋洲"], ["AN", "🐧 南極"]];
const TOUR_MS = 40000;

function localTime(tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour").value), m = parts.find((p) => p.type === "minute").value;
    return { text: `${String(h).padStart(2, "0")}:${m}`, day: h >= 6 && h < 18, dusk: h === 5 || h === 18 };
  } catch { return { text: "—", day: true, dusk: false }; }
}
const dayIcon = (t) => (t.dusk ? "🌅" : t.day ? "☀️" : "🌙");
const flagImg = (cc) => (/^[A-Z]{2}$/.test(cc) && cc !== "AQ" ? `<img class="lc-flag" src="https://flagcdn.com/w20/${cc.toLowerCase()}.png" alt="">` : "");

export function createLiveCams({ globeObject, camera, renderer, rig, onClose }) {
  const panel = document.getElementById("livecam-panel");
  const host = document.getElementById("livecam-labels");
  const player = document.getElementById("livecam-player");
  const listEl = document.getElementById("livecam-list");
  const noop = { setEnabled() {}, isEnabled: () => false, update() {} };
  if (!panel || !host || !player || !listEl) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, cams = [], regions = {}, current = null, tourTimer = null, clockTimer = null, built = null;
  const $ = (id) => document.getElementById(id);

  async function load() {
    if (cams.length) return;
    const [d, r] = await Promise.all([
      fetch("data/livecams.json").then((x) => x.json()),
      fetch("data/country-regions.json").then((x) => (x.ok ? x.json() : {})).catch(() => ({})),
    ]);
    cams = d.cams || []; regions = r; built = d.built;
    buildPins();
  }
  const regionOf = (c) => (c.cc === "AQ" ? "AN" : regions[c.cc] || "AS");

  // ---------- 地球上的 📺 標記 ----------
  let pins = [];
  function buildPins() {
    host.innerHTML = "";
    pins = cams.map((c) => {
      const el = document.createElement("div");
      el.className = "lc-pin";
      el.innerHTML = `<span class="lc-pin-ico">${esc(c.ico)}</span><span class="lc-pin-live"></span><span class="lc-pin-name">${esc(c.zh)}</span>`;
      el.title = `📺 ${c.zh}(點一下看直播)`;
      el.addEventListener("click", (e) => { e.stopPropagation(); stopTour(); play(c); });
      host.appendChild(el);
      const p = latLonToXYZ(c.lat, c.lon, 1.004);
      return { cam: c, el, dir: new THREE.Vector3(p.x, p.y, p.z) };
    });
  }

  // ---------- 播放 ----------
  function play(c, { fly = true } = {}) {
    current = c;
    const t = localTime(c.tz);
    player.innerHTML =
      `<div class="lc-now"><span class="lc-live-dot"></span><b>${esc(c.ico)} ${esc(c.zh)}</b><span class="lc-time">${dayIcon(t)} 當地 ${t.text}</span></div>` +
      `<div class="lc-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(c.v)}?autoplay=1&mute=1&playsinline=1&rel=0" title="${esc(c.zh)} 即時直播" ` +
      `allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` +
      `<div class="lc-meta">${esc(c.t)}<br><span>頻道:${esc(c.ch)}</span> · <a href="https://www.youtube.com/watch?v=${encodeURIComponent(c.v)}" target="_blank" rel="noopener">在 YouTube 開啟 ↗</a></div>`;
    for (const p of pins) p.el.classList.toggle("on", p.cam === c);
    renderList();
    if (fly) rig.flyTo(c.lat, c.lon, { distance: 2.1, ms: 1200 });
  }

  function renderList() {
    const groups = REGIONS.map(([k, label]) => [label, cams.filter((c) => regionOf(c) === k)]).filter(([, cs]) => cs.length);
    const keep = listEl.scrollTop;   // 每 30 秒更新時間會重畫,捲動位置要留著
    listEl.innerHTML =
      `<div class="lc-tools"><button type="button" class="tc-btn" data-act="random">🎲 隨機看一個</button>` +
      `<button type="button" class="tc-btn${tourTimer ? " lc-touring" : ""}" data-act="tour">${tourTimer ? "⏹ 停止巡覽" : "▶ 自動巡覽世界"}</button></div>` +
      groups.map(([label, cs]) => `<div class="lc-h">${label}</div>` + cs.map((c) => {
        const t = localTime(c.tz);
        return `<button type="button" class="lc-row${c === current ? " on" : ""}" data-id="${esc(c.id)}"><span class="lc-ico">${esc(c.ico)}</span>` +
          `<span class="lc-name">${flagImg(c.cc)}${esc(c.zh)}</span><span class="lc-t">${dayIcon(t)} ${t.text}</span></button>`;
      }).join("")).join("") +
      `<div class="sat-caption">直播來自 YouTube 各頻道,每週自動更新清單${built ? `(${esc(built)})` : ""};直播偶爾會中斷,換一個看看就好</div>`;
    listEl.scrollTop = keep;
  }

  // ---------- 自動巡覽 ----------
  function nextCam() {
    const i = current ? cams.indexOf(current) : -1;
    return cams[(i + 1) % cams.length];
  }
  function startTour() {
    stopTour();
    play(current ? nextCam() : cams[0]);
    tourTimer = setInterval(() => play(nextCam()), TOUR_MS);
    renderList();
  }
  function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = null; renderList(); } }

  listEl.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (row) { stopTour(); const c = cams.find((x) => x.id === row.dataset.id); if (c) play(c); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "random") { stopTour(); const pool = cams.filter((c) => c !== current); play(pool[Math.floor(Math.random() * pool.length)]); }
    else if (a.dataset.act === "tour") { if (tourTimer) stopTour(); else startTour(); }
  });
  $("livecam-close")?.addEventListener("click", () => onClose && onClose());

  // ---------- 每幀:把標記投影到螢幕上(背面的藏起來) ----------
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3(), ndc = new THREE.Vector3();
  function update() {
    if (!enabled || !pins.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    for (const p of pins) {
      wp.copy(p.dir).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(p.dir).transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(wp).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(wp).project(camera);
      if (facing < 0.05 || ndc.z > 1) { p.el.style.opacity = "0"; p.el.style.transform = "translate(-9999px,-9999px)"; continue; }
      const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width, y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
      p.el.style.opacity = THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1).toFixed(2);
      p.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    host.hidden = !enabled;
    clearInterval(clockTimer);
    if (!enabled) {
      stopTour();
      player.innerHTML = "";   // 關掉面板就停止播放(移除 iframe)
      current = null;
      return;
    }
    player.innerHTML = `<div class="lc-empty">📺 點地球上的圖示,或從下面清單挑一個地方,<br>馬上看到世界另一端「現在」的樣子!</div>`;
    listEl.innerHTML = `<div class="ap-empty">載入直播清單中…</div>`;
    try { await load(); } catch { listEl.innerHTML = `<div class="ap-empty">直播清單載入失敗,稍後再試</div>`; return; }
    if (!enabled) return;
    renderList();
    clockTimer = setInterval(() => { if (enabled) { renderList(); const el = player.querySelector(".lc-time"); if (el && current) { const t = localTime(current.tz); el.textContent = `${dayIcon(t)} 當地 ${t.text}`; } } }, 30000);
  }

  return { setEnabled, isEnabled: () => enabled, update };
}
