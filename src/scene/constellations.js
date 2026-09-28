import * as THREE from "three";
import { latLonToXYZ, xyzToLatLon, daysSinceJ2000, gmstDeg } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { placeLabel, hideLabel, drag } from "../lib/label-style.js";
import { esc } from "../lib/esc.js";
import { isEn } from "../lib/i18n.js";

// ✨ 真實星空:肉眼看得到的 900 多顆亮星放在真實方向(赤經、赤緯,跟太陽、月亮同一套座標,
// 會隨時間跟著天球轉),加上 88 星座的連線與名稱、20 多顆著名亮星的中文名。
// 資料 data/constellations.json 由 tools/build-constellations.py 產生(d3-celestial,BSD-3-Clause)。
// 選單「星座與亮星」可以關掉連線和名稱(亮星本身一直都在)。
const R = 280;                 // 比隨機星點(300)近一點,在最前面
const KEY = "earth-world.constellations";
const RAD = Math.PI / 180;

const starVert = `
  attribute float aSize;
  attribute float aBright;
  attribute vec3 aColor;
  uniform float uPR;
  uniform float uTime;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPR;
    vColor = aColor;
    vBright = aBright * (0.93 + 0.07 * sin(uTime * 1.7 + position.x * 0.13 + position.y * 0.07));
  }
`;
const starFrag = `
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    if (d2 > 1.0) discard;
    float core = exp(-d2 * 5.0);
    gl_FragColor = vec4(vColor * core * vBright, 1.0);
  }
`;

// 色指數 B-V → 顏色(藍白 → 白 → 黃 → 橘 → 紅)
const BV = [[-0.3, [0.62, 0.74, 1]], [0, [0.8, 0.87, 1]], [0.3, [0.96, 0.97, 1]], [0.6, [1, 0.97, 0.88]], [1, [1, 0.88, 0.7]], [1.4, [1, 0.76, 0.55]], [2, [1, 0.66, 0.45]]];
function bvColor(bv) {
  for (let i = 1; i < BV.length; i++) {
    if (bv <= BV[i][0]) {
      const [a, ca] = BV[i - 1], [b, cb] = BV[i], k = Math.max(0, (bv - a) / (b - a));
      return ca.map((v, j) => v + (cb[j] - v) * k);
    }
  }
  return BV[BV.length - 1][1];
}
const dirOf = (ra, dec, r = 1) => { const p = latLonToXYZ(dec, ra, r); return new THREE.Vector3(p.x, p.y, p.z); };

export function createConstellations({ scene, camera, renderer, globeObject, rig, naturePopup }) {
  const group = new THREE.Group();
  scene.add(group);
  const host = document.createElement("div");
  host.id = "constellation-labels";
  document.body.appendChild(host);

  let enabled = (() => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } })();
  let data = null, lines = null, starMat = null, focusLines = null, focusUntil = 0;
  const labels = [];   // { el, dir(天球座標), kind }

  // 天球跟著格林威治恆星時轉:赤經 → 地面經度 = 赤經 − 恆星時(跟太陽、月亮同一套)
  function spin() { group.rotation.y = -gmstDeg(daysSinceJ2000(new Date())) * RAD; }
  spin();
  setInterval(spin, 60 * 1000);

  async function load() {
    try {
      const r = await fetch("data/constellations.json");
      if (!r.ok) return;
      data = await r.json();
    } catch { return; }
    build();
  }

  function build() {
    // 亮星
    const n = data.stars.length;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), bright = new Float32Array(n), color = new Float32Array(n * 3);
    data.stars.forEach(([ra, dec, mag, bv], i) => {
      const p = dirOf(ra, dec, R);
      pos.set([p.x, p.y, p.z], i * 3);
      // 光點大小:點的中心最亮、往外很快變暗,實際看到的亮核大約是這個大小的四成
      size[i] = THREE.MathUtils.clamp(7.4 - 1.05 * mag, 2.4, 9.5);
      bright[i] = THREE.MathUtils.clamp(1.8 - 0.3 * mag, 0.35, 2.3);   // 最亮的幾顆超過 1,泛光特效會讓它們微微發光
      color.set(bvColor(bv), i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    starMat = new THREE.ShaderMaterial({
      vertexShader: starVert, fragmentShader: starFrag,
      uniforms: { uPR: { value: renderer.getPixelRatio() }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, starMat);
    pts.frustumCulled = false;
    pts.renderOrder = -0.9;
    group.add(pts);

    // 星座連線
    const seg = [];
    for (const c of data.cons) for (const line of c.lines) for (let i = 1; i < line.length; i++) {
      const a = dirOf(line[i - 1][0], line[i - 1][1], R * 0.999), b = dirOf(line[i][0], line[i][1], R * 0.999);
      seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x86aaff, transparent: true, opacity: 0.2, depthWrite: false }));
    lines.frustumCulled = false;
    lines.renderOrder = -0.9;
    lines.visible = enabled;
    group.add(lines);

    // 名稱:星座(同一個星座被拆成兩塊的巨蛇座只標一次)+ 著名亮星
    const seen = new Set();
    for (const c of data.cons) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const el = document.createElement("div");
      el.className = "cst-label";
      el.textContent = isEn ? c.en : c.zh;
      el.addEventListener("click", (e) => { e.stopPropagation(); showNote(c, e.clientX, e.clientY); });
      host.appendChild(el);
      labels.push({ el, dir: dirOf(c.at[0], c.at[1]), kind: "con" });
    }
    for (const s of data.stars) {
      if (!s[4]) continue;
      const el = document.createElement("div");
      el.className = "star-label";
      el.textContent = s[4];
      host.appendChild(el);
      labels.push({ el, dir: dirOf(s[0], s[1]), kind: "star" });
    }
    host.hidden = !enabled;
  }

  function showNote(c, x, y) {
    naturePopup.show({ icon: "✨", zh: c.zh, en: c.en, note: c.note || (isEn ? "One of the 88 constellations." : "88 個星座之一。") }, x, y);
  }

  // ---------- 飛過去看某個星座(搜尋用):鏡頭擺到星座剛好在地球旁邊 ----------
  const tmp = new THREE.Vector3();
  function focus(id) {
    const c = data?.cons.find((x) => x.id === id);
    if (!c) return;
    if (!enabled) setEnabled(true);
    group.updateMatrixWorld();
    const C = dirOf(c.at[0], c.at[1]).applyMatrix4(new THREE.Matrix4().extractRotation(group.matrixWorld)).normalize();
    const dist = 5.2;
    const alpha = Math.asin(1 / dist) + 15 * RAD;
    // 橫向螢幕放在地球右邊、直向手機放在地球上方
    let side = camera.aspect > 1 ? new THREE.Vector3().crossVectors(C, new THREE.Vector3(0, 1, 0)) : new THREE.Vector3(0, 1, 0).addScaledVector(C, -C.y);
    if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
    side.normalize();
    const f = C.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(side, -Math.sin(alpha));   // 鏡頭看的方向
    tmp.copy(f).negate().applyQuaternion(globeObject.quaternion.clone().invert());
    const { lat, lon } = xyzToLatLon(tmp);
    rig.flyTo(lat, lon, { distance: dist, ms: 1800 });
    // 這個星座的連線暫時加亮
    if (focusLines) { group.remove(focusLines); focusLines.geometry.dispose(); }
    const seg = [];
    for (const d of data.cons.filter((x) => x.id === id)) for (const line of d.lines) for (let i = 1; i < line.length; i++) {
      const a = dirOf(line[i - 1][0], line[i - 1][1], R * 0.998), b = dirOf(line[i][0], line[i][1], R * 0.998);
      seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    focusLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
    focusLines.frustumCulled = false;
    group.add(focusLines);
    focusUntil = performance.now() + 9000;
    setTimeout(() => {
      const L = labels.find((l) => l.kind === "con" && l.el.textContent === (isEn ? c.en : c.zh));
      const r = L?.el.getBoundingClientRect();
      showNote(c, r && r.width ? r.left + r.width / 2 : window.innerWidth / 2, r && r.width ? r.bottom + 6 : window.innerHeight / 3);
    }, 1900);
  }

  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch { /* 存不了就算了 */ }
    if (lines) lines.visible = enabled;
    host.hidden = !enabled;
  }

  // ---------- 每幀:名稱標籤(被地球擋住、在背後、拖曳中都先藏起來) ----------
  const wp = new THREE.Vector3(), ndc = new THREE.Vector3(), toP = new THREE.Vector3();
  function update(elapsed) {
    if (starMat) { starMat.uniforms.uTime.value = elapsed; starMat.uniforms.uPR.value = renderer.getPixelRatio(); }
    if (focusLines) {
      const left = focusUntil - performance.now();
      focusLines.material.opacity = THREE.MathUtils.clamp(left / 2000, 0, 0.9);
      if (left <= 0) { group.remove(focusLines); focusLines.geometry.dispose(); focusLines = null; }
    }
    if (!enabled || !labels.length) return;
    if (drag.active) { for (const L of labels) hideLabel(L.el); return; }
    const rect = canvasRect(renderer.domElement);
    const cam = camera.position;
    for (const L of labels) {
      wp.copy(L.dir).applyAxisAngle(Y_AXIS, group.rotation.y).multiplyScalar(R);
      ndc.copy(wp).project(camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.02 || Math.abs(ndc.y) > 1.02) { hideLabel(L.el); continue; }
      // 視線有穿過地球 = 被擋住
      toP.copy(wp).sub(cam).normalize();
      const t = -cam.dot(toP);
      if (t > 0 && cam.clone().addScaledVector(toP, t).lengthSq() < 1.02) { hideLabel(L.el); continue; }
      const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width, y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
      placeLabel(L.el, x, y, L.kind === "con" ? "0.85" : "0.75", L.kind === "con" ? " translate(-50%, -50%)" : " translate(6px, -50%)");
    }
  }

  load();

  return {
    update, setEnabled, isEnabled: () => enabled, focus,
    // 萬用搜尋用:星座清單
    searchItems: () => (data ? [...new Map(data.cons.map((c) => [c.id, c])).values()].map((c) => ({ id: c.id, zh: c.zh, en: c.en, alias: c.alias })) : []),
  };
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
