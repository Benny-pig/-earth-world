import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "../ui/draggable.js";

// 🛰️ 衛星與太空站:CelesTrak 公開的軌道參數(TLE,免金鑰、允許網頁直接讀取)+
// satellite.js(SGP4 軌道模型)算出每顆衛星現在的位置,畫在地球外圈、每秒更新。
// CelesTrak 要求同一份資料 2 小時內不要重複下載,所以下載後存在瀏覽器 2 小時。
//
// 顯示距離:低軌道(2,000 公里以下,例如太空站約 420 公里)按實際比例;導航、氣象衛星
// 在 2 萬~3.6 萬公里,照實際比例會跑到鏡頭後面,改用對數壓縮顯示(面板有註明)。
const SAT_LIB = "https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/+esm";
const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php";
const CACHE_KEY = "earth-world.sat-tle.v1";
const CACHE_MS = 2 * 3600 * 1000;
const EARTH_KM = 6371;
const TAIPEI = { lat: 25.0330, lon: 121.5654, name: "台北" };

// 分類(同一顆衛星出現在多個群組時,以排在前面的分類為準)
const CLASSES = [
  { key: "station", label: "太空站", groups: ["stations"], color: 0xffd166, css: "#ffd166" },
  { key: "nav", label: "導航衛星(GPS/伽利略/北斗)", groups: ["gps-ops", "galileo", "beidou"], color: 0x4dd6a6, css: "#4dd6a6" },
  { key: "weather", label: "氣象衛星", groups: ["weather"], color: 0x6fb8ff, css: "#6fb8ff" },
  { key: "visual", label: "肉眼可見的亮衛星", groups: ["visual"], color: 0xf2f6ff, css: "#f2f6ff" },
];
// 地球上加名字標籤、畫未來軌跡的重點太空站(NORAD 編號)
const FEATURED = {
  25544: { zh: "國際太空站 ISS", short: "ISS" },
  48274: { zh: "中國天宮太空站", short: "天宮" },
};

const DEG = Math.PI / 180;
function displayRadius(altKm) {
  return altKm <= 2000 ? 1 + altKm / EARTH_KM : 1 + 2000 / EARTH_KM + 0.3 * Math.log2(altKm / 2000);
}
function toVec3(latDeg, lonDeg, r) {
  const la = latDeg * DEG, lo = lonDeg * DEG, cl = Math.cos(la);
  return new THREE.Vector3(r * cl * Math.cos(lo), r * Math.sin(la), -r * cl * Math.sin(lo));
}

// 太陽方向(簡化的天文公式,誤差約 0.01°,判斷「天黑了沒、衛星有沒有被太陽照到」夠用)
function sunDirEci(date) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * DEG, g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
}

let satLibPromise = null;
const loadSatLib = () => (satLibPromise ||= import(SAT_LIB));

async function fetchTle() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && Date.now() - c.at < CACHE_MS && c.groups) return c.groups;
  } catch { /* 沒有快取或讀不到就重新下載 */ }
  const groups = {};
  const all = [...new Set(CLASSES.flatMap((c) => c.groups))];
  await Promise.all(all.map(async (g) => {
    try {
      const r = await fetch(`${CELESTRAK}?GROUP=${g}&FORMAT=tle`);
      if (r.ok) groups[g] = await r.text();
    } catch { /* 單一群組失敗就略過 */ }
  }));
  if (Object.keys(groups).length) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), groups })); } catch { /* 存不下就算了 */ }
  }
  return groups;
}

function parseTle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length;) {
    if (lines[i + 1].startsWith("1 ") && lines[i + 2].startsWith("2 ")) {
      out.push([lines[i].trim(), lines[i + 1], lines[i + 2]]);
      i += 3;
    } else {
      i++;   // 格式不對就往下找,不要整份錯位
    }
  }
  return out;
}

export function createSatelliteLayer({ globeObject, camera, renderer, rig, naturePopup, onClose }) {
  const panel = document.getElementById("orbit-panel");
  const labelHost = document.getElementById("sat-labels");
  const $ = (id) => document.getElementById(id);
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let sat = null;                 // satellite.js 模組
  let sats = [];                  // { id, name, cls, satrec, pos:Vector3, alt, lat, lon, speed, ok }
  let enabled = false, loading = null, timer = null, followId = null, tracksAt = 0;
  const hiddenCls = new Set();

  const group = new THREE.Group();
  group.visible = false;
  globeObject.add(group);

  // 圓點貼圖(預設 Points 是方塊)
  const dotTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(16, 16, 2, 16, 16, 15);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.5, "rgba(255,255,255,.9)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
    size: 6, sizeAttenuation: false, vertexColors: true, map: dotTex, transparent: true, alphaTest: 0.2, depthWrite: false,
  }));
  points.renderOrder = 6;
  group.add(points);
  const trackMat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55 });
  const tracks = new Map();       // id -> THREE.Line
  const labels = new Map();       // id -> { el, sat }

  async function load() {
    if (!loading) loading = (async () => {
      [sat] = await Promise.all([loadSatLib()]);
      const groups = await fetchTle();
      const seen = new Map();
      for (const cls of CLASSES) {
        for (const g of cls.groups) {
          for (const [name, l1, l2] of parseTle(groups[g] || "")) {
            const id = Number(l1.slice(2, 7));
            if (seen.has(id)) continue;
            let satrec;
            try { satrec = sat.twoline2satrec(l1, l2); } catch { continue; }
            const s = { id, name, cls: cls.key, satrec, pos: new THREE.Vector3(), alt: 0, lat: 0, lon: 0, speed: 0, ok: false };
            seen.set(id, s);
          }
        }
      }
      sats = [...seen.values()];
      const col = new Float32Array(sats.length * 3), c = new THREE.Color();
      sats.forEach((s, i) => { c.setHex(CLASSES.find((k) => k.key === s.cls).color); col.set([c.r, c.g, c.b], i * 3); });
      points.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sats.length * 3), 3));
      points.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
      buildFeatured();
    })().catch((e) => { loading = null; throw e; });
    return loading;
  }

  function propagateAt(s, date) {
    const pv = sat.propagate(s.satrec, date);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    return pv;
  }

  function step() {
    if (!sat || !sats.length) return;
    const now = new Date();
    const gmst = sat.gstime(now);
    const posAttr = points.geometry.getAttribute("position");
    sats.forEach((s, i) => {
      const pv = propagateAt(s, now);
      if (!pv || hiddenCls.has(s.cls)) { s.ok = false; posAttr.setXYZ(i, 0, 0, 0); return; }
      const gd = sat.eciToGeodetic(pv.position, gmst);
      s.lat = sat.degreesLat(gd.latitude); s.lon = sat.degreesLong(gd.longitude); s.alt = gd.height;
      const v = pv.velocity; s.speed = Math.hypot(v.x, v.y, v.z) * 3600;
      s.pos.copy(toVec3(s.lat, s.lon, displayRadius(s.alt)));
      s.ok = true;
      posAttr.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);
    });
    posAttr.needsUpdate = true;
    points.geometry.computeBoundingSphere();
    if (Date.now() - tracksAt > 5 * 60000) rebuildTracks();   // 太空站未來軌跡每 5 分鐘往前推
    if (followId) {
      const f = sats.find((s) => s.id === followId);
      if (f && f.ok) rig.flyTo(f.lat, f.lon, { distance: Math.max(1.6, Math.min(camera.position.length(), 2.6)), ms: 900 });
    }
    renderPanelLive();
  }

  // 重點太空站:名字標籤 + 未來一圈(約 92 分鐘)的地面軌跡
  function buildFeatured() {
    labelHost.innerHTML = "";
    labels.clear();
    for (const s of sats) {
      const f = FEATURED[s.id];
      if (!f) continue;
      const el = document.createElement("div");
      el.className = "sat-label";
      el.innerHTML = `<span class="sat-label-dot"></span><span class="sat-label-text">🛰️ ${esc(f.zh)}</span>`;
      el.title = `${f.zh}(點一下查看資訊)`;
      el.addEventListener("click", (e) => { e.stopPropagation(); showSatPopup(s, e.clientX, e.clientY); });
      labelHost.appendChild(el);
      labels.set(s.id, { el, s });
    }
    rebuildTracks();
  }
  function rebuildTracks() {
    tracksAt = Date.now();
    for (const line of tracks.values()) { group.remove(line); line.geometry.dispose(); }
    tracks.clear();
    const t0 = Date.now();
    for (const { s } of labels.values()) {
      const pts = [];
      for (let m = 0; m <= 95; m += 1) {
        const d = new Date(t0 + m * 60000);
        const pv = propagateAt(s, d);
        if (!pv) continue;
        const gd = sat.eciToGeodetic(pv.position, sat.gstime(d));
        pts.push(toVec3(sat.degreesLat(gd.latitude), sat.degreesLong(gd.longitude), displayRadius(gd.height)));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), trackMat);
      line.renderOrder = 6;
      group.add(line);
      tracks.set(s.id, line);
    }
  }

  // ───── 地球上的名字標籤位置(每幀)─────
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3(), ndc = new THREE.Vector3();
  function update() {
    if (!enabled || !labels.size) return;
    const rect = renderer.domElement.getBoundingClientRect();
    for (const { el, s } of labels.values()) {
      if (!s.ok) { el.style.opacity = "0"; continue; }
      wp.copy(s.pos).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(wp).normalize();
      camTo.copy(camera.position).sub(wp).normalize();
      // 被地球擋住的(在地球背面、而且視線穿過地球)就藏起來
      const behind = nrm.dot(camTo) < -0.15;
      ndc.copy(wp).project(camera);
      if (behind || ndc.z > 1) { el.style.opacity = "0"; el.style.transform = "translate(-9999px,-9999px)"; continue; }
      const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width, y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
      el.style.opacity = "1";
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  // ───── 點衛星:螢幕上離點擊位置最近的一顆 ─────
  function pickAt(x, y) {
    if (!enabled || !sats.length) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    let best = null, bd = 12;
    for (const s of sats) {
      if (!s.ok) continue;
      wp.copy(s.pos).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(wp).normalize();
      camTo.copy(camera.position).sub(wp).normalize();
      if (nrm.dot(camTo) < -0.15) continue;
      ndc.copy(wp).project(camera);
      if (ndc.z > 1) continue;
      const d = Math.hypot(rect.left + (ndc.x * 0.5 + 0.5) * rect.width - x, rect.top + (-ndc.y * 0.5 + 0.5) * rect.height - y);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    showSatPopup(best, x, y);
    return true;
  }
  function showSatPopup(s, x, y) {
    const cls = CLASSES.find((k) => k.key === s.cls);
    const f = FEATURED[s.id];
    naturePopup.show({
      icon: "🛰️", zh: f ? f.zh : s.name, en: `${s.name} · NORAD ${s.id}`,
      note: `${cls.label}|高度約 ${Math.round(s.alt).toLocaleString()} 公里|時速約 ${Math.round(s.speed).toLocaleString()} 公里|目前在 ${placeName(s.lat, s.lon)} 上空`,
    }, x, y);
  }

  // 目前在哪個國家上空(點在國界多邊形內),都不是就是海上
  function placeName(lat, lon) {
    const gj = window.__earth?.geojson;
    if (gj) {
      for (const f of gj.features) {
        const g = f.geometry;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        for (const poly of polys) {
          const ring = poly[0];
          let inside = false;
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi) inside = !inside;
          }
          if (inside) return f.properties.NAME_ZHT || f.properties.NAME;
        }
      }
    }
    return "海洋";
  }

  // ───── 國際太空站飛過台灣(台北上空)的時間 ─────
  function computePasses(s, days = 10) {
    const obs = { latitude: TAIPEI.lat * DEG, longitude: TAIPEI.lon * DEG, height: 0.01 };
    const passes = [];
    let cur = null;
    const t0 = Date.now(), stepMs = 20000;
    for (let t = t0; t < t0 + days * 86400000; t += stepMs) {
      const d = new Date(t);
      const pv = propagateAt(s, d);
      if (!pv) continue;
      const gmst = sat.gstime(d);
      const look = sat.ecfToLookAngles(obs, sat.eciToEcf(pv.position, gmst));
      const el = look.elevation / DEG;
      if (el > 10) {
        // 可見:台北天黑(太陽在地平線 6° 以下)、而衛星本身還被太陽照到(不在地球影子裡)
        const sun = sunDirEci(d);
        const o = sat.ecfToEci(sat.geodeticToEcf(obs), gmst);
        const on = Math.hypot(o.x, o.y, o.z);
        const sunEl = Math.asin((o.x * sun.x + o.y * sun.y + o.z * sun.z) / on) / DEG;
        const p = pv.position, proj = p.x * sun.x + p.y * sun.y + p.z * sun.z;
        const perp = Math.hypot(p.x - proj * sun.x, p.y - proj * sun.y, p.z - proj * sun.z);
        const lit = proj > 0 || perp > EARTH_KM;
        const visible = sunEl < -6 && lit;
        if (!cur) cur = { start: d, maxEl: el, azStart: look.azimuth / DEG, visible: false };
        cur.end = d; cur.azEnd = look.azimuth / DEG;
        if (el > cur.maxEl) cur.maxEl = el;
        if (visible) cur.visible = true;
      } else if (cur) {
        passes.push(cur); cur = null;
        if (passes.length >= 60) break;
      }
    }
    return passes;
  }
  const compass = (az) => ["北", "東北", "東", "東南", "南", "西南", "西", "西北"][Math.round(((az % 360) + 360) % 360 / 45) % 8];
  const fmt = (d) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

  // ───── 面板 ─────
  function renderPanel() {
    if (!panel) return;
    const counts = Object.fromEntries(CLASSES.map((c) => [c.key, sats.filter((s) => s.cls === c.key).length]));
    $("orbit-legend").innerHTML = CLASSES.map((c) =>
      `<button type="button" class="orbit-cls${hiddenCls.has(c.key) ? " off" : ""}" data-cls="${c.key}">` +
      `<span class="orbit-dot" style="background:${c.css}"></span>${esc(c.label)} <b>${counts[c.key]}</b></button>`).join("");
    const iss = sats.find((s) => s.id === 25544);
    if (iss) {
      // 未來 10 天:先把「肉眼看得到」的列出來(通常是天黑後 1~2 小時內),再列接下來幾次過境
      const passes = computePasses(iss);
      const row = (p) => `<div class="orbit-pass${p.visible ? " vis" : ""}">` +
        `<b>${esc(fmt(p.start))}</b> 起 約 ${Math.max(1, Math.round((p.end - p.start) / 60000))} 分鐘` +
        `<span class="orbit-pass-sub">從${compass(p.azStart)}方升起 → ${compass(p.azEnd)}方落下 · 最高仰角 ${Math.round(p.maxEl)}°</span>` +
        `<span class="orbit-pass-tag">${p.visible ? "✨ 肉眼可見(天黑後、太空站被陽光照亮)" : "看不到(白天或在地球陰影中)"}</span></div>`;
      const vis = passes.filter((p) => p.visible).slice(0, 4);
      const next = passes.slice(0, 4);
      $("orbit-passes").innerHTML = !passes.length
        ? `<div class="ap-empty">未來 10 天沒有飛過台北上空</div>`
        : (vis.length ? `<div class="orbit-sub-h">✨ 肉眼看得到的過境(未來 10 天)</div>${vis.map(row).join("")}`
                      : `<div class="ap-empty">未來 10 天沒有肉眼看得到的過境</div>`) +
          `<div class="orbit-sub-h">🕒 接下來的過境(含看不到的)</div>${next.map(row).join("")}`;
    }
    renderPanelLive();
  }
  function renderPanelLive() {
    if (!panel || panel.hidden) return;
    const iss = sats.find((s) => s.id === 25544);
    const box = $("orbit-iss");
    if (!iss || !iss.ok) { box.innerHTML = `<div class="ap-empty">載入軌道資料中…</div>`; return; }
    box.innerHTML = `<div class="orbit-iss-row">目前在 <b>${esc(placeName(iss.lat, iss.lon))}</b> 上空</div>` +
      `<div class="orbit-iss-row">高度 <b>${Math.round(iss.alt)}</b> 公里 · 時速 <b>${Math.round(iss.speed).toLocaleString()}</b> 公里</div>` +
      `<div class="orbit-iss-row dim">約 92 分鐘繞地球一圈,一天繞 15.5 圈</div>`;
    $("orbit-follow").textContent = followId === 25544 ? "⏹ 停止追蹤" : "📍 鎖定追蹤太空站";
  }

  if (panel) {
    $("orbit-legend").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cls]");
      if (!b) return;
      const k = b.dataset.cls;
      if (hiddenCls.has(k)) hiddenCls.delete(k); else hiddenCls.add(k);
      step(); renderPanel();
    });
    $("orbit-follow").addEventListener("click", () => {
      followId = followId === 25544 ? null : 25544;
      step();
    });
    // 追蹤中讀者自己拖曳地球 = 想自己看,停止追蹤
    rig.controls?.addEventListener("start", () => {
      if (followId) { followId = null; renderPanelLive(); }
    });
    $("orbit-close").addEventListener("click", () => onClose && onClose());
  }

  async function setEnabled(v) {
    enabled = !!v;
    group.visible = enabled;
    labelHost.hidden = !enabled;
    if (panel) panel.hidden = !enabled;
    clearInterval(timer); timer = null;
    if (!enabled) { followId = null; naturePopup.hide(); return; }
    try {
      if (panel) $("orbit-iss").innerHTML = `<div class="ap-empty">載入軌道資料中…</div>`;
      await load();
      if (!enabled) return;
      step();
      renderPanel();
      timer = setInterval(step, 1000);
    } catch (e) {
      console.error("[satellites] 載入失敗:", e);
      if (panel) $("orbit-iss").innerHTML = `<div class="ap-empty">衛星軌道資料暫時載入失敗,稍後再開一次</div>`;
    }
  }

  return { setEnabled, isEnabled: () => enabled, update, pickAt };
}
