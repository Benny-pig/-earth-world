import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { latLonToXYZ } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { placeLabel, hideLabel, drag } from "../lib/label-style.js";
import { makeDraggable } from "../ui/draggable.js";
import { fitDistanceForAspect } from "./camera-controls.js";

// 🧩 板塊與地震帶:全球板塊邊界(PB2002,tools/build-plates.py 產生 data/plates.json),
// 依類型上色(隱沒帶、碰撞擠壓、張裂、轉形斷層),環太平洋火環帶會發光;
// 地球上標出主要板塊的名字和移動方向,面板說明「為什麼台灣地震這麼多」,
// 也能一鍵疊上最近的地震、活動中的火山,對照看地震和火山是不是都擠在板塊交界。
const R = 1.0035;
const KINDS = {
  sub: { color: 0xff5a4f, css: "#ff5a4f", name: "隱沒帶", text: "一個板塊鑽到另一個底下,形成深海溝和火山島弧,最大的地震都在這裡(日本海溝、智利)" },
  con: { color: 0xffa94d, css: "#ffa94d", name: "碰撞擠壓", text: "兩個板塊互相推擠,把地面擠成高山(喜馬拉雅山、台灣中央山脈)" },
  div: { color: 0x4dd6ff, css: "#4dd6ff", name: "張裂", text: "板塊往兩邊拉開,岩漿湧上來長出新的海底(大西洋中洋脊、東非大裂谷)" },
  tra: { color: 0xffe36b, css: "#ffe36b", name: "轉形斷層", text: "兩個板塊互相錯開滑動(美國加州的聖安德烈斯斷層)" },
};
// 主要板塊的名字(標在板塊中間比較空的地方)
const NAMES = [
  ["太平洋板塊", -8, -140], ["北美板塊", 50, -98], ["南美板塊", -14, -48], ["歐亞板塊", 55, 70], ["非洲板塊", 4, 16],
  ["索馬利亞板塊", -12, 48], ["印度板塊", 6, 74], ["澳洲板塊", -22, 122], ["南極板塊", -74, 40], ["納斯卡板塊", -28, -100],
  ["菲律賓海板塊", 14, 135], ["阿拉伯板塊", 23, 46], ["可可斯板塊", 7, -94], ["加勒比板塊", 14, -75], ["胡安德富卡板塊", 45.5, -128.5],
  ["斯科細亞板塊", -57, -45],
];
// 板塊移動方向(相對於鄰近板塊的大約速度):[緯度, 經度, 方位角(北=0°,順時針), 說明](板塊名字另外標在旁邊)
const ARROWS = [
  [20, 129, 306, "每年約 8 公分"],
  [17, 80, 15, "每年約 5 公分"],
  [20, -163, 295, "太平洋板塊 每年約 7–10 公分"],
  [-16, -87, 80, "每年約 7 公分"],
  [-32, 136, 10, "每年約 7 公分"],
  [32, -52, 280, "大西洋每年變寬約 2.5 公分"],
  [32, -28, 100, ""],
];
// 沿著火環帶飛一圈:從紐西蘭出發,經過亞洲、阿拉斯加,一路到南美洲的智利
const RING_TOUR = [
  [-40, 176, "紐西蘭", "太平洋板塊和澳洲板塊在這裡交會,北島有好幾座活火山。"],
  [-7.5, 110, "印尼", "印度-澳洲板塊鑽到歐亞板塊底下,活火山數量是世界前幾名。"],
  [12, 126, "菲律賓", "菲律賓海板塊往西鑽到菲律賓底下,形成很深的菲律賓海溝。"],
  [23.5, 121.5, "台灣", "菲律賓海板塊和歐亞板塊正面碰撞,把中央山脈越擠越高。"],
  [37.5, 142.5, "日本", "太平洋板塊鑽到日本底下,2011 年東日本大地震規模 9.0。"],
  [54, 160, "堪察加半島", "太平洋板塊繼續往下鑽,火山一座接著一座。"],
  [52, -176, "阿留申群島", "一整串火山島,從阿拉斯加一路排到堪察加。"],
  [60, -148, "阿拉斯加", "1964 年發生規模 9.2 的大地震,是北美洲有紀錄以來最大的。"],
  [45, -124, "美國西北岸", "胡安德富卡板塊鑽到北美板塊底下,這一段叫做卡斯卡迪亞隱沒帶。"],
  [17, -100, "墨西哥", "可可斯板塊鑽到北美板塊底下,墨西哥的大地震多半來自這裡。"],
  [-36, -73, "智利", "納斯卡板塊鑽到南美板塊底下,1960 年規模 9.5 的大地震是有紀錄以來最大的地震。"],
];
const TW_SAY = "台灣剛好卡在菲律賓海板塊和歐亞板塊的交界。菲律賓海板塊每年往西北推擠大約八公分。" +
  "在台灣東北外海,菲律賓海板塊往北鑽到歐亞板塊底下;在台灣南方外海,反過來是歐亞板塊往東鑽到菲律賓海板塊底下。" +
  "台灣本島就夾在中間正面碰撞,中央山脈到現在都還在被往上抬升。擠壓累積的能量隨時在釋放,所以台灣每年記錄到的地震有上萬次,只是大部分小到感覺不到。";

export function createPlates({ globeObject, camera, renderer, rig, voice, onClose, toggleLayer }) {
  const host = document.createElement("div");
  host.id = "plate-labels";
  host.hidden = true;
  document.body.appendChild(host);
  const panel = document.getElementById("plates-panel");
  const body = document.getElementById("plates-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("plates-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("plates-min");
  function setMin(on) {
    panel?.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  const group = new THREE.Group();
  group.visible = false;
  globeObject.add(group);
  let enabled = false, hidden = false, loading = null, built = false, t = 0, glowOn = true;
  const show = { sub: true, con: true, div: true, tra: true };
  const lines = {}, labels = [];
  let glow = null;

  const size = new THREE.Vector2();
  function makeLines(verts, color, width, opacity, order) {
    const geom = new LineSegmentsGeometry();
    geom.setPositions(verts);
    const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false });
    const obj = new LineSegments2(geom, mat);
    obj.renderOrder = order;
    // LineMaterial 要知道畫面大小才能換算像素線寬(three r160 不會自動帶入)
    obj.onBeforeRender = (r) => { mat.resolution.copy(r.getSize(size)); };
    return obj;
  }

  async function load() {
    const j = await fetch("data/plates.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!j?.lines) return;
    const buf = { sub: [], con: [], div: [], tra: [] }, rf = [];
    for (const [kind, ring, , , flat] of j.lines) {
      const out = buf[kind];
      if (!out) continue;
      for (let i = 0; i + 3 < flat.length; i += 2) {
        if (Math.abs(flat[i + 2] - flat[i]) > 180) continue;   // 跨過國際換日線的那一小段不畫(不然會橫越整顆地球)
        const a = latLonToXYZ(flat[i + 1], flat[i], R), b = latLonToXYZ(flat[i + 3], flat[i + 2], R);
        out.push(a.x, a.y, a.z, b.x, b.y, b.z);
        if (ring) rf.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    // 火環帶的光暈畫在最底下、比較粗;四種邊界線疊在上面
    glow = makeLines(rf, 0xff7a45, 6, 0.14, 3);
    group.add(glow);
    for (const [k, v] of Object.entries(KINDS)) {
      lines[k] = makeLines(buf[k], v.color, k === "sub" || k === "con" ? 2.6 : 1.8, 0.95, 4);
      group.add(lines[k]);
    }
    buildLabels();
    built = true;
    applyVisibility();
  }

  // ---------- 板塊名稱、移動方向箭頭(畫面上的文字標籤) ----------
  const onSphere = (lat, lon, r = 1.01) => { const p = latLonToXYZ(lat, lon, r); return new THREE.Vector3(p.x, p.y, p.z); };
  // 從 (lat, lon) 沿方位角走 d 度之後的點(用來算箭頭在螢幕上的方向)
  function ahead(lat, lon, az, d = 4) {
    const r = Math.PI / 180, la = lat * r, br = az * r, dd = d * r;
    const la2 = Math.asin(Math.sin(la) * Math.cos(dd) + Math.cos(la) * Math.sin(dd) * Math.cos(br));
    const lo2 = lon * r + Math.atan2(Math.sin(br) * Math.sin(dd) * Math.cos(la), Math.cos(dd) - Math.sin(la) * Math.sin(la2));
    return onSphere(la2 / r, lo2 / r);
  }
  function buildLabels() {
    host.innerHTML = "";
    labels.length = 0;
    for (const [name, lat, lon] of NAMES) {
      const el = document.createElement("div");
      el.className = "pl-name";
      el.innerHTML = `<span>${name}</span>`;
      host.appendChild(el);
      labels.push({ el, p: onSphere(lat, lon) });
    }
    for (const [lat, lon, az, text] of ARROWS) {
      const el = document.createElement("div");
      el.className = "pl-arrow";
      el.innerHTML = `<span><span class="pl-ar"><svg viewBox="0 0 46 16" aria-hidden="true"><path d="M3 8H34" stroke="#ffd278" stroke-width="3.4" stroke-linecap="round"/>` +
        `<path d="M31 1.5L44 8L31 14.5Z" fill="#ffd278"/></svg></span>${text ? `<small>${text}</small>` : ""}</span>`;
      el.title = text;
      host.appendChild(el);
      labels.push({ el, p: onSphere(lat, lon), q: ahead(lat, lon, az), ar: el.querySelector(".pl-ar") });
    }
  }

  function applyVisibility() {
    group.visible = enabled && !hidden && built;
    host.hidden = !(enabled && !hidden);
    for (const k of Object.keys(KINDS)) if (lines[k]) lines[k].visible = show[k];
    if (glow) glow.visible = glowOn && (show.sub || show.con);
  }

  // ---------- 面板 ----------
  const quakeOn = () => document.getElementById("quake-toggle")?.getAttribute("aria-pressed") === "true";
  const volcOn = () => document.getElementById("hazard-toggle")?.getAttribute("aria-pressed") === "true";
  function render() {
    if (!body) return;
    body.innerHTML =
      `<div class="pl-intro">地球表面不是一整塊,而是像裂開的蛋殼一樣分成十幾大塊「板塊」,漂在底下會慢慢流動的軟流圈上,` +
      `每年移動幾公分(大約跟指甲長的速度一樣)。<b>地震和火山大多擠在板塊交界</b>。</div>` +
      `<div class="mt-h">邊界的種類(點一下可以隱藏/顯示)</div>` +
      `<div class="pl-legend">${Object.entries(KINDS).map(([k, v]) =>
        `<button type="button" class="pl-kind${show[k] ? " on" : ""}" data-kind="${k}" aria-pressed="${show[k]}">` +
        `<i style="background:${v.css};box-shadow:0 0 6px ${v.css}"></i><span><b>${v.name}</b><small>${v.text}</small></span></button>`).join("")}</div>` +
      `<div class="pl-sec pl-tw"><div class="pl-h">📍 為什麼台灣地震這麼多?</div>` +
      `<p>台灣剛好卡在<b>菲律賓海板塊</b>和<b>歐亞板塊</b>的交界,菲律賓海板塊每年往西北推擠約 <b>8 公分</b>:</p>` +
      `<ul><li><b>東北外海</b>:菲律賓海板塊往北鑽到歐亞板塊底下(琉球海溝)</li>` +
      `<li><b>南方外海</b>:反過來,歐亞板塊往東鑽到菲律賓海板塊底下(馬尼拉海溝)</li>` +
      `<li><b>台灣本島</b>:夾在中間正面碰撞,中央山脈到現在還在被往上抬升</li></ul>` +
      `<p>擠壓累積的能量隨時在釋放,台灣每年記錄到的地震有上萬次,大部分小到感覺不到;1999 年 921 集集地震(規模 7.3)、` +
      `2024 年 4 月 3 日花蓮地震(規模 7.2)都是這股推擠力造成的。</p>` +
      `<div class="pl-btns"><button type="button" class="tc-btn" data-act="tw">🔍 飛到台灣看</button>` +
      `<button type="button" class="tc-btn" data-act="say">🔊 朗讀</button></div></div>` +
      `<div class="pl-sec pl-rf"><div class="pl-h">🔥 環太平洋火環帶</div>` +
      `<p>太平洋周圍一整圈幾乎都是隱沒帶,連成馬蹄形的「火環帶」:從紐西蘭、印尼、菲律賓、台灣、日本、阿拉斯加,一路到美洲西岸的智利。` +
      `全世界大約<b>九成的地震</b>、<b>七成以上的活火山</b>都在這一圈上。</p>` +
      `<div class="pl-btns"><button type="button" class="tc-btn${touring ? " on" : ""}" data-act="ring">${touring ? "⏹ 停止飛行" : "🌏 沿著火環帶飛一圈"}</button>` +
      `<button type="button" class="tc-btn${glowOn ? " on" : ""}" data-act="glow">${glowOn ? "✨ 發光:開" : "✨ 發光:關"}</button></div></div>` +
      `<div class="mt-h">疊上其他圖層對照看</div>` +
      `<div class="pl-btns"><button type="button" class="tc-btn${quakeOn() ? " on" : ""}" data-act="quake">📳 最近的地震:${quakeOn() ? "開" : "關"}</button>` +
      `<button type="button" class="tc-btn${volcOn() ? " on" : ""}" data-act="volc">🌋 活動中的火山:${volcOn() ? "開" : "關"}</button></div>` +
      `<div class="sat-caption">箭頭是板塊相對於鄰近板塊的大約移動方向和速度。板塊邊界:Bird (2003) PB2002 板塊邊界模型` +
      `(<a href="https://github.com/fraxen/tectonicplates" target="_blank" rel="noopener">fraxen/tectonicplates</a>,ODC-BY 授權)。</div>`;
  }
  const overviewDistance = () => Math.max(3.2, fitDistanceForAspect(camera.aspect) * 1.1);
  body?.addEventListener("click", (e) => {
    const k = e.target.closest("[data-kind]");
    if (k) { show[k.dataset.kind] = !show[k.dataset.kind]; applyVisibility(); render(); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    // 手機:要飛去看的時候先把面板收起來,地球才不會被擋住
    if ((act === "tw" || (act === "ring" && !touring)) && window.innerWidth <= 640) setMin(true);
    if (act === "tw") rig.flyTo(23, 122.5, { distance: 2.05, ms: 1600 });
    else if (act === "ring") { if (touring) stopTour(); else ringTour(); }
    else if (act === "say") voice?.speak(TW_SAY, { force: true });
    else if (act === "glow") { glowOn = !glowOn; applyVisibility(); render(); }
    else if (act === "quake") { toggleLayer?.("quake-toggle"); render(); }
    else if (act === "volc") { toggleLayer?.("hazard-toggle"); render(); }
  });

  // ---------- 沿著火環帶飛一圈(每一站一句說明;人聲播報開著的話會唸出來) ----------
  let touring = 0, cap = null;
  function caption(text) {
    if (!cap) {
      cap = document.createElement("div");
      cap.id = "plate-cap";
      document.body.appendChild(cap);
    }
    cap.hidden = !text;
    if (text) cap.innerHTML = text;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function ringTour() {
    const id = ++touring;
    glowOn = true;
    applyVisibility();
    render();
    for (let i = 0; i < RING_TOUR.length && touring === id; i++) {
      const [lat, lon, name, text] = RING_TOUR[i];
      rig.flyTo(lat, lon, { distance: 2.35, ms: 2200 });
      await wait(1700);
      if (touring !== id) return;
      caption(`<b>🔥 ${i + 1}/${RING_TOUR.length} ${name}</b><span>${text}</span>`);
      const said = voice?.speak(`${name}。${text}`);
      await Promise.all([wait(3200), said ? Promise.race([said, wait(12000)]) : null]);
    }
    if (touring === id) stopTour();
  }
  function stopTour() {
    touring = 0;
    caption("");
    if (enabled) render();
  }
  // 讀者自己拖地球 → 停止飛行
  renderer.domElement.addEventListener("pointerdown", () => { if (touring) { stopTour(); voice?.stop?.(); } });

  function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    document.body.classList.toggle("plates-on", enabled);
    if (enabled) {
      setMin(false);
      render();
      rig.flyTo(12, 160, { distance: overviewDistance(), ms: 1500 });
      if (!built && !loading) loading = load().finally(() => { loading = null; });
    } else { if (touring) stopTour(); voice?.stop?.(); }
    applyVisibility();
  }

  // ---------- 每幀:火環帶呼吸發光、標籤跟著地球 ----------
  const wp = new THREE.Vector3(), wq = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3(), ndc = new THREE.Vector3(), ndq = new THREE.Vector3();
  function update(dt) {
    if (!enabled || hidden || !built) return;
    t += dt;
    if (glow?.visible) glow.material.opacity = 0.07 + 0.13 * (0.5 + 0.5 * Math.sin(t * 2.2));
    if (drag.active) { for (const L of labels) hideLabel(L.el); return; }
    const rect = canvasRect(renderer.domElement);
    const sx = (n) => rect.left + (n.x * 0.5 + 0.5) * rect.width, sy = (n) => rect.top + (-n.y * 0.5 + 0.5) * rect.height;
    for (const L of labels) {
      wp.copy(L.p).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(L.p).normalize().transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(wp).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(wp).project(camera);
      if (facing < 0.12 || ndc.z > 1) { hideLabel(L.el); continue; }
      placeLabel(L.el, sx(ndc), sy(ndc), THREE.MathUtils.clamp((facing - 0.12) / 0.25, 0, 1).toFixed(2));
      if (L.ar) {
        ndq.copy(wq.copy(L.q).applyMatrix4(globeObject.matrixWorld)).project(camera);
        const deg = Math.round(Math.atan2(sy(ndq) - sy(ndc), sx(ndq) - sx(ndc)) * 180 / Math.PI);
        if (L.deg !== deg) { L.ar.style.transform = `rotate(${deg}deg)`; L.deg = deg; }
      }
    }
  }

  return {
    setEnabled, update,
    isEnabled: () => enabled,
    // 站在地面仰望天空(生日天空、月球視角)時先藏起來
    setHidden(v) { hidden = !!v; applyVisibility(); },
  };
}
