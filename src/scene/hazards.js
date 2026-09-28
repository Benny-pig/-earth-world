import * as THREE from "three";
import { latLonToXYZ } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { placeLabel, hideLabel, drag } from "../lib/label-style.js";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";

// 🌋 火山、野火、冰山:
//   本週活動火山:史密森尼學會 GVP / USGS 每週火山活動報告(tools/build-volcanoes.py 每週抓成 data/volcanoes.json)
//   野火、冰山、近期火山事件:NASA EONET 即時自然事件(免金鑰、網頁直接讀)
const EONET = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes,wildfires,seaLakeIce&days=45";
const MAX_FIRES = 80;
const ACRE_HA = 0.404686;

export function createHazards({ globeObject, camera, renderer, rig, naturePopup, onClose }) {
  const host = document.createElement("div");
  host.id = "hazard-labels";
  host.hidden = true;
  document.body.appendChild(host);
  const panel = document.getElementById("hazard-panel");
  const body = document.getElementById("hazard-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("hazard-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("hazard-min");
  function setMin(on) {
    panel?.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  let enabled = false, loaded = false, volcanoes = [], extraVolc = [], fires = [], ice = [], period = "", labels = [];

  async function load() {
    const [gvp, eo] = await Promise.all([
      fetch("data/volcanoes.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(EONET).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    volcanoes = gvp?.items || [];
    period = gvp?.period || "";
    const events = eo?.events || [];
    const last = (e) => e.geometry[e.geometry.length - 1];
    const cat = (e) => e.categories?.[0]?.id;
    // EONET 的火山:本週報告裡沒有的才補上(距離 0.5° 內視為同一座)
    extraVolc = events.filter((e) => cat(e) === "volcanoes").map((e) => {
      const g = last(e), [lon, lat] = g.coordinates;
      return { name: e.title.replace(/ Volcano.*$/, ""), where: (e.title.split(",")[1] || "").trim(), lat, lon, date: g.date };
    }).filter((v) => !volcanoes.some((x) => Math.abs(x.lat - v.lat) < 0.5 && Math.abs(x.lon - v.lon) < 0.5));
    fires = events.filter((e) => cat(e) === "wildfires").map((e) => {
      const g = last(e), [lon, lat] = g.coordinates;
      const acres = g.magnitudeUnit === "acres" ? Number(g.magnitudeValue) : null;
      return { title: e.title, prescribed: /prescribed/i.test(e.title), lat, lon, date: g.date, ha: acres ? acres * ACRE_HA : null };
    }).sort((a, b) => (b.ha || 0) - (a.ha || 0));
    ice = events.filter((e) => cat(e) === "seaLakeIce").map((e) => {
      const g = last(e), [lon, lat] = g.coordinates;
      return { title: e.title, lat, lon, date: g.date };
    });
    loaded = true;
  }

  // ---------- 地球上的標記 ----------
  const onSphere = (lat, lon) => { const p = latLonToXYZ(lat, lon, 1.012); return new THREE.Vector3(p.x, p.y, p.z); };
  function addLabel(lat, lon, cls, html, onClick) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(e); });
    host.appendChild(el);
    labels.push({ el, p: onSphere(lat, lon) });
  }
  const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(new Date(iso)) : "");
  const volcName = (v) => v.zh || v.name;
  function popupVolc(v, x, y) {
    naturePopup.show({ icon: "🌋", zh: `${volcName(v)} · ${v.countryZh || ""}`, en: `${v.name}(${v.statusZh})`, note: v.text ? `本週報告(英文原文):${v.text}` : "" }, x, y);
  }
  function draw() {
    host.innerHTML = "";
    labels = [];
    for (const v of volcanoes) {
      addLabel(v.lat, v.lon, `hz-pin hz-volc hz-${v.status}`, `<i>🌋</i><span>${esc(volcName(v))}</span>`, (e) => popupVolc(v, e.clientX, e.clientY));
    }
    for (const v of extraVolc) {
      addLabel(v.lat, v.lon, "hz-pin hz-volc hz-old", `<i>🌋</i>`, (e) => naturePopup.show({ icon: "🌋", zh: v.name, en: v.where, note: `NASA EONET 記錄的近期活動(${fmtDate(v.date)})` }, e.clientX, e.clientY));
    }
    for (const f of fires.slice(0, MAX_FIRES)) {
      const big = (f.ha || 0) > 2000 ? " hz-big" : "";
      addLabel(f.lat, f.lon, `hz-pin hz-fire${big}`, `<i>🔥</i>`, (e) => naturePopup.show({
        icon: "🔥", zh: f.prescribed ? "計畫燒除(人為控制的防火措施)" : "野火", en: f.title,
        note: `${f.ha ? `面積約 ${Math.round(f.ha).toLocaleString()} 公頃 · ` : ""}最近更新 ${fmtDate(f.date)}`,
      }, e.clientX, e.clientY));
    }
    for (const b of ice) {
      addLabel(b.lat, b.lon, "hz-pin hz-ice", `<i>🧊</i><span>${esc(b.title.replace(/^Iceberg\s*/i, ""))}</span>`, (e) => naturePopup.show({ icon: "🧊", zh: "南極冰山", en: b.title, note: `從南極冰棚斷裂、正在漂流的大冰山 · 最近位置 ${fmtDate(b.date)}` }, e.clientX, e.clientY));
    }
  }

  // ---------- 面板 ----------
  function render() {
    if (!body) return;
    if (!loaded) { body.innerHTML = `<div class="ap-empty">讀取中…</div>`; return; }
    const newOnes = volcanoes.filter((v) => v.status === "new").length;
    body.innerHTML =
      `<div class="hz-sum"><span>🌋 <b>${volcanoes.length}</b> 座火山活動中${newOnes ? `(<b class="hz-red">${newOnes}</b> 座新噴發)` : ""}</span>` +
      `<span>🔥 <b>${fires.length}</b> 處野火</span><span>🧊 <b>${ice.length}</b> 座冰山</span></div>` +
      `<div class="mt-h">🌋 本週活動火山${period ? `<small>${esc(period)}</small>` : ""}</div>` +
      volcanoes.map((v, i) => `<button type="button" class="hz-row" data-v="${i}"><span class="hz-tag hz-${v.status}">${esc(v.statusZh)}</span>` +
        `<b>${esc(volcName(v))}</b><span class="hz-dim">${esc(v.countryZh || v.country)}</span></button>`).join("") +
      (fires.length ? `<div class="mt-h">🔥 面積最大的野火<small>共 ${fires.length} 處,地球上標出最大的 ${Math.min(MAX_FIRES, fires.length)} 處</small></div>` +
        fires.slice(0, 6).map((f, i) => `<button type="button" class="hz-row" data-f="${i}"><span class="hz-tag hz-fire-t">${f.prescribed ? "計畫燒除" : "野火"}</span>` +
          `<b>${esc(f.title.replace(/^(Wildfire|Prescribed Fire)\s*/i, ""))}</b><span class="hz-dim">${f.ha ? `${Math.round(f.ha).toLocaleString()} 公頃` : ""}</span></button>`).join("") : "") +
      (ice.length ? `<div class="mt-h">🧊 南極大冰山</div>` + ice.map((b, i) => `<button type="button" class="hz-row" data-i="${i}"><b>${esc(b.title)}</b><span class="hz-dim">${fmtDate(b.date)}</span></button>`).join("") : "") +
      `<div class="sat-caption">火山:史密森尼學會全球火山計畫 / 美國地質調查所每週火山活動報告(每週更新);野火、冰山:NASA EONET 即時自然事件。野火資料目前以美國為主。</div>`;
  }
  const fly = (lat, lon) => rig.flyTo(lat, lon, { distance: 1.9, ms: 1300 });
  body?.addEventListener("click", (e) => {
    const r = e.target.closest(".hz-row");
    if (!r) return;
    const rect = r.getBoundingClientRect();
    if (r.dataset.v != null) { const v = volcanoes[Number(r.dataset.v)]; fly(v.lat, v.lon); setTimeout(() => popupVolc(v, window.innerWidth / 2, window.innerHeight / 2), 1350); }
    else if (r.dataset.f != null) { const f = fires[Number(r.dataset.f)]; fly(f.lat, f.lon); }
    else if (r.dataset.i != null) { const b = ice[Number(r.dataset.i)]; fly(b.lat, b.lon); }
    void rect;
  });

  async function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    host.hidden = !enabled;
    if (!enabled) return;
    setMin(false);
    render();
    if (!loaded) { await load(); draw(); }
    if (enabled) render();
  }

  // ---------- 每幀:標記位置(背面的藏起來) ----------
  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3(), ndc = new THREE.Vector3();
  function update() {
    if (!enabled || !labels.length) return;
    if (drag.active) { for (const L of labels) hideLabel(L.el); return; }
    const rect = canvasRect(renderer.domElement);
    for (const L of labels) {
      wp.copy(L.p).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(L.p).normalize().transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(wp).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(wp).project(camera);
      if (facing < 0.08 || ndc.z > 1) { hideLabel(L.el); continue; }
      placeLabel(L.el, rect.left + (ndc.x * 0.5 + 0.5) * rect.width, rect.top + (-ndc.y * 0.5 + 0.5) * rect.height, THREE.MathUtils.clamp((facing - 0.08) / 0.2, 0, 1).toFixed(2));
    }
  }

  return { setEnabled, isEnabled: () => enabled, update };
}
