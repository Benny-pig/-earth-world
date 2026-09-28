import * as THREE from "three";
import { latLonToXYZ } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { placeLabel, hideLabel } from "../lib/label-style.js";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";

// 🌀 颱風路徑:
//   西北太平洋(台灣附近)用日本氣象廳的颱風資料:走過的路徑、現在的暴風圈/強風圈、
//   未來 5 天的預報位置與 70% 機率圓;強度另外換算成台灣的分級(輕度/中度/強烈颱風)。
//   其他海域(大西洋、印度洋…)用聯合國 GDACS 災害警報系統,標出現在的位置與風速。
// 兩個來源都免金鑰、可以直接從網頁讀。
const JMA = "https://www.jma.go.jp/bosai/typhoon/data/";
const GDACS = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC";
const REFRESH_MS = 30 * 60 * 1000;
const TAIPEI = [25.03, 121.56];
const RAD = Math.PI / 180;
const EARTH_M = 6371000;

function distKm([a, b], [c, d]) {
  const h = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
// 台灣(中央氣象署)的颱風分級:近中心最大風速(10 分鐘平均)
function twScale(ms) {
  if (!(ms > 0)) return "";
  if (ms >= 51) return "強烈颱風";
  if (ms >= 32.7) return "中度颱風";
  if (ms >= 17.2) return "輕度颱風";
  return "熱帶性低氣壓";
}
const JP_INTENSITY = { "強い": "強", "非常に強い": "非常強", "猛烈な": "猛烈" };
const JP_CAT = { TY: "颱風", STS: "強烈熱帶風暴", TS: "熱帶風暴", TD: "熱帶性低氣壓", LOW: "溫帶氣旋" };
const course = (c) => (!c ? "" : /停滞/.test(c) ? "幾乎停滯" : c);

// 經緯度點 → 球面上的座標(稍微浮在雲層上)
const onSphere = (lat, lon, r = 1.009) => { const p = latLonToXYZ(lat, lon, r); return new THREE.Vector3(p.x, p.y, p.z); };
// 以某點為圓心、半徑 m 公尺的小圓(球面上)
function circlePoints(lat, lon, m, n = 72) {
  const c = onSphere(lat, lon, 1).normalize();
  const ang = m / EARTH_M;
  const t1 = new THREE.Vector3(0, 1, 0).cross(c);
  if (t1.lengthSq() < 1e-8) t1.set(1, 0, 0);
  t1.normalize();
  const t2 = c.clone().cross(t1);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dir = t1.clone().multiplyScalar(Math.cos(a)).add(t2.clone().multiplyScalar(Math.sin(a)));
    pts.push(c.clone().multiplyScalar(Math.cos(ang)).addScaledVector(dir, Math.sin(ang)).multiplyScalar(1.009));
  }
  return { center: c.multiplyScalar(1.009), pts };
}
// 球面上連續的折線(兩點之間補點,線才會貼著地球彎)
function pathPoints(latlons) {
  const out = [];
  for (let i = 0; i < latlons.length; i++) {
    const b = onSphere(...latlons[i], 1).normalize();
    if (i > 0) {
      const a = onSphere(...latlons[i - 1], 1).normalize();
      const steps = Math.max(1, Math.ceil(a.angleTo(b) / (0.5 * RAD)));
      for (let k = 1; k < steps; k++) out.push(a.clone().lerp(b, k / steps).normalize().multiplyScalar(1.009));
    }
    out.push(b.multiplyScalar(1.009));
  }
  return out;
}

export function createTyphoons({ globeObject, camera, renderer, rig, onClose }) {
  const group = new THREE.Group();
  group.renderOrder = 4;
  globeObject.add(group);
  const host = document.createElement("div");
  host.id = "typhoon-labels";
  document.body.appendChild(host);
  const panel = document.getElementById("typhoon-panel");
  const body = document.getElementById("typhoon-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("typhoon-close")?.addEventListener("click", () => onClose && onClose());

  let enabled = false, timer = null, storms = [], others = [], labels = [], loadedAt = null;

  // ---------- 資料 ----------
  async function loadJma() {
    const list = await fetch(JMA + "targetTc.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : []));
    const out = [];
    for (const tc of list || []) {
      try {
        const [fc, sp] = await Promise.all([
          fetch(`${JMA}${tc.tropicalCyclone}/forecast.json`, { cache: "no-cache" }).then((r) => r.json()),
          fetch(`${JMA}${tc.tropicalCyclone}/specifications.json`, { cache: "no-cache" }).then((r) => r.json()),
        ]);
        const title = sp.find((p) => p.part === "title") || {};
        const now = sp.find((p) => p.advancedHours === 0) || sp[1] || {};
        const an = fc.find((p) => p.advancedHours === 0) || {};
        const fcs = fc.filter((p) => p.advancedHours > 0 && Array.isArray(p.center) && p.probabilityCircle);
        const specBy = new Map(sp.filter((p) => p.advancedHours != null).map((p) => [p.advancedHours, p]));
        const center = an.center || now.position?.deg;
        if (!center) continue;
        const wind = Number(now.maximumWind?.sustained?.["m/s"]);
        out.push({
          no: tc.typhoonNumber, name: title.name?.en || "", category: now.category?.en || tc.category,
          intensity: JP_INTENSITY[now.intensity] || "", pressure: now.pressure, wind, gust: Number(now.maximumWind?.gust?.["m/s"]),
          course: course(now.course), speed: now.speed?.["km/h"], center,
          track: { pre: an.track?.preTyphoon || [], ty: an.track?.typhoon || [] },
          storm: an.stormWarningArea?.arc?.[0] ? { c: an.stormWarningArea.arc[0][0], r: an.stormWarningArea.arc[0][1] } : null,
          gale: an.galeWarningArea ? { c: an.galeWarningArea.center, r: an.galeWarningArea.radius } : null,
          forecast: fcs.map((p) => ({ h: p.advancedHours, c: p.center, r: p.probabilityCircle.radius, t: specBy.get(p.advancedHours)?.validtime?.UTC, cat: specBy.get(p.advancedHours)?.category?.en })),
          issued: title.issue?.UTC,
        });
      } catch (e) { console.warn("[typhoon] 讀不到", tc.tropicalCyclone, e.message); }
    }
    return out;
  }
  async function loadGdacs(jma) {
    const to = new Date(), from = new Date(Date.now() - 10 * 86400000);
    const d = (x) => x.toISOString().slice(0, 10);
    const r = await fetch(`${GDACS}&fromDate=${d(from)}&toDate=${d(to)}`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.features || []).filter((f) => f.properties?.iscurrent === "true").map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      const kmh = Number(/(\d+)\s*km\/h/.exec(p.severitydata?.severitytext || "")?.[1]);
      return { name: String(p.eventname || "").replace(/-\d+$/, ""), lat, lon, alert: p.alertlevel, kmh, country: p.country || "" };
    }).filter((o) => !jma.some((s) => Math.abs(s.center[0] - o.lat) < 5 && Math.abs(s.center[1] - o.lon) < 5));   // 跟日本氣象廳重複的不要
  }

  // ---------- 畫在地球上 ----------
  function clear() {
    for (const o of [...group.children]) { group.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    host.innerHTML = "";
    labels = [];
  }
  const lineMat = (color, opacity, dashed) => dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.012, gapSize: 0.008, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  function addLine(pts, mat, loop = false) {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = loop ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
    if (mat.isLineDashedMaterial) l.computeLineDistances();
    l.renderOrder = 4;
    group.add(l);
  }
  function addDisc(lat, lon, m, color, opacity, outline = 0.8) {
    const { center, pts } = circlePoints(lat, lon, m);
    const pos = [center.x, center.y, center.z, ...pts.flatMap((p) => [p.x, p.y, p.z])];
    const idx = [];
    for (let i = 1; i <= pts.length; i++) idx.push(0, i, i === pts.length ? 1 : i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 4;
    group.add(mesh);
    if (outline) addLine(pts, lineMat(color, outline), true);
  }
  function addLabel(lat, lon, cls, html) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    host.appendChild(el);
    labels.push({ el, p: onSphere(lat, lon, 1.01) });
    return el;
  }
  const fmtH = (utc) => (utc ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", hour12: false }).format(new Date(utc)) : "");   // 格式本身就會帶「時」

  function draw() {
    clear();
    for (const s of storms) {
      if (s.track.pre.length > 1) addLine(pathPoints(s.track.pre), lineMat(0x9fb2d8, 0.6, true));
      if (s.track.ty.length > 1) addLine(pathPoints(s.track.ty), lineMat(0xff5a4d, 0.95));
      // 預報:路線 + 70% 機率圓(越後面越大 = 越不確定)
      addLine(pathPoints([s.center, ...s.forecast.map((f) => f.c)]), lineMat(0xffffff, 0.85, true));
      for (const f of s.forecast) {
        if ([12, 24, 48, 72, 96, 120].includes(f.h)) {
          addDisc(f.c[0], f.c[1], f.r, 0xffffff, 0.07, 0.55);
          addLabel(f.c[0], f.c[1], "ty-fc", `${f.h}h<small>${esc(fmtH(f.t))}</small>`);
        }
      }
      if (s.gale) addDisc(s.gale.c[0], s.gale.c[1], s.gale.r, 0xffd43b, 0.14, 0.7);
      if (s.storm) addDisc(s.storm.c[0], s.storm.c[1], s.storm.r, 0xff3b30, 0.28, 0.9);
      const el = addLabel(s.center[0], s.center[1], "ty-pin", `<i>🌀</i><span>${esc(s.name || "颱風")} · ${esc(s.pressure || "")}hPa</span>`);
      el.addEventListener("click", (e) => { e.stopPropagation(); fly(s.center); });
    }
    for (const o of others) {
      addLabel(o.lat, o.lon, `ty-pin ty-other ty-${String(o.alert || "").toLowerCase()}`, `<i>🌀</i><span>${esc(o.name)}${o.kmh ? ` · ${o.kmh} km/h` : ""}</span>`);
    }
  }

  // ---------- 面板 ----------
  const fmtIssue = (utc) => (utc ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utc)) : "");
  const ll = ([lat, lon]) => `${lat >= 0 ? "北緯" : "南緯"} ${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? "東經" : "西經"} ${Math.abs(lon).toFixed(1)}°`;
  function render() {
    if (!body) return;
    if (!loadedAt) { body.innerHTML = `<div class="ap-empty">讀取颱風資料中…</div>`; return; }
    const cards = storms.map((s, i) => {
      const d = Math.round(distKm(s.center, TAIPEI));
      const closest = [{ h: 0, c: s.center }, ...s.forecast].map((f) => ({ ...f, km: distKm(f.c, TAIPEI) })).reduce((a, b) => (b.km < a.km ? b : a));
      const scale = twScale(s.wind);
      return `<div class="ty-card">` +
        `<div class="ty-title">🌀 ${/^\d{4}$/.test(s.no || "") ? `20${s.no.slice(0, 2)} 年第 ${Number(s.no.slice(2))} 號颱風` : ""} <b>${esc(s.name.toUpperCase())}</b></div>` +
        `<div class="ty-tags">${scale ? `<span class="ty-tag">${scale}(台灣分級)</span>` : ""}<span class="ty-tag dim">${JP_CAT[s.category] || esc(s.category || "")}${s.intensity ? ` · ${s.intensity}` : ""}</span></div>` +
        `<div class="mt-grid">` +
        `<span>中心氣壓</span><b>${esc(s.pressure || "—")} hPa</b>` +
        `<span>最大風速</span><b>${s.wind ? `${s.wind} m/s` : "—"}${s.gust ? `(陣風 ${s.gust})` : ""}</b>` +
        `<span>移動</span><b>${esc(s.course || "—")}${s.speed ? ` · 每小時 ${esc(s.speed)} 公里` : ""}</b>` +
        `<span>位置</span><b>${ll(s.center)}</b>` +
        `<span>距離台北</span><b>約 ${d.toLocaleString()} 公里</b>` +
        (closest.h > 0 && closest.km < d - 30 ? `<span>預報最接近</span><b>${closest.h} 小時後約 ${Math.round(closest.km).toLocaleString()} 公里</b>` : "") +
        `</div><button type="button" class="tc-btn ty-go" data-i="${i}">🔎 飛過去看</button></div>`;
    }).join("");
    const rest = others.length
      ? `<div class="mt-h">🌍 其他海域</div>` + others.map((o, i) => `<button type="button" class="ty-other-row" data-o="${i}"><span class="ty-dot ty-${String(o.alert || "").toLowerCase()}"></span>` +
        `<b>${esc(o.name)}</b><span>${o.kmh ? `最大風速 ${o.kmh} km/h` : ""}${o.country ? ` · ${esc(o.country)}` : ""}</span></button>`).join("") : "";
    body.innerHTML =
      (storms.length ? cards : `<div class="ty-none">🎉 西北太平洋目前沒有颱風</div>`) + rest +
      `<div class="ty-legend"><span><i class="lg-red"></i>暴風圈</span><span><i class="lg-yel"></i>強風圈</span><span><i class="lg-white"></i>預報 70% 機率圓</span><span><i class="lg-track"></i>走過的路徑</span></div>` +
      `<div class="sat-caption">資料:日本氣象廳(西北太平洋)、聯合國 GDACS(其他海域)· ${fmtIssue(storms[0]?.issued || loadedAt)} 更新,每 30 分鐘自動重抓。` +
      `台灣的颱風警報以<a href="https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html" target="_blank" rel="noopener">中央氣象署</a>發布為準。</div>` +
      `<button type="button" class="tc-btn ty-sat">🛰️ 一起看衛星雲圖</button>`;
  }
  body?.addEventListener("click", (e) => {
    const g = e.target.closest(".ty-go");
    if (g) { fly(storms[Number(g.dataset.i)].center); return; }
    const o = e.target.closest(".ty-other-row");
    if (o) { const x = others[Number(o.dataset.o)]; fly([x.lat, x.lon]); return; }
    if (e.target.closest(".ty-sat")) {
      const sat = document.getElementById("satellite-toggle");
      if (sat && sat.getAttribute("aria-pressed") !== "true") sat.click();
    }
  });
  const fly = ([lat, lon]) => rig.flyTo(lat, lon, { distance: 2.2, ms: 1300 });

  async function refresh(first) {
    try {
      storms = await loadJma();
      others = await loadGdacs(storms).catch(() => []);
      loadedAt = new Date().toISOString();
    } catch (e) {
      console.warn("[typhoon] 颱風資料讀取失敗:", e.message);
      if (!loadedAt && body) body.innerHTML = `<div class="ap-empty">颱風資料暫時讀不到,稍後再試</div>`;
      return;
    }
    if (!enabled) return;
    draw();
    render();
    if (first) fly(storms[0]?.center || TAIPEI);
  }

  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    group.visible = enabled;
    host.hidden = !enabled;
    clearInterval(timer);
    if (!enabled) return;
    render();
    refresh(true);
    timer = setInterval(() => refresh(false), REFRESH_MS);
  }

  // ---------- 每幀:標籤 ----------
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3(), ndc = new THREE.Vector3();
  function update() {
    if (!enabled || !labels.length) return;
    const rect = canvasRect(renderer.domElement);
    for (const L of labels) {
      wp.copy(L.p).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(L.p).normalize().transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(wp).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(wp).project(camera);
      if (facing < 0.05 || ndc.z > 1) { hideLabel(L.el); continue; }
      placeLabel(L.el, rect.left + (ndc.x * 0.5 + 0.5) * rect.width, rect.top + (-ndc.y * 0.5 + 0.5) * rect.height, THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1).toFixed(2));
    }
  }

  return { setEnabled, isEnabled: () => enabled, update };
}
