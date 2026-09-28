import * as THREE from "three";
import { latLonToXYZ, xyzToLatLon } from "../lib/geo.js";
import { canvasRect } from "../lib/view-rect.js";
import { isEn } from "../lib/i18n.js";
import { fitDistanceForAspect } from "./camera-controls.js";

// 🌋 地球剖面:把地球切掉四分之一(兩個經線面之間的楔形),切面上看得到從大氣層到地心的每一層;
// 還有「從太空一路往下到地心」的導覽旅程:鏡頭一層一層往下,說明卡 + 人聲旁白。
// 地函、地核照真實比例;地殼只有地球半徑的 0.5%、大氣層更薄,照比例會細到看不見,所以放大顯示(畫面有註明)。
const RE = 6371;
// [id, 中文, 顯示的內半徑, 外半徑, 內側顏色, 外側顏色, 發光(泛光特效)]
const LAYERS = [
  ["inner", "內核", 0, 0.1917, [1.9, 1.6, 0.85], [1.6, 1.15, 0.45]],
  ["outer", "外核", 0.1917, 0.5462, [1.35, 0.62, 0.14], [0.95, 0.36, 0.08]],
  ["lower", "下部地函", 0.5462, 0.8964, [0.78, 0.26, 0.08], [0.55, 0.2, 0.09]],
  ["upper", "上部地函", 0.8964, 0.945, [0.62, 0.24, 0.1], [0.66, 0.27, 0.1]],
  ["astheno", "軟流圈", 0.945, 0.972, [0.95, 0.36, 0.08], [0.85, 0.32, 0.08]],
  ["crust", "地殼", 0.972, 1.0, [0.5, 0.4, 0.32], [0.42, 0.36, 0.3]],
  ["tropo", "對流層", 1.0, 1.028, [0.4, 0.66, 1.0], [0.36, 0.6, 1.0]],
  ["strato", "平流層", 1.028, 1.058, [0.32, 0.5, 0.98], [0.3, 0.45, 0.92]],
  ["meso", "中氣層", 1.058, 1.082, [0.26, 0.34, 0.85], [0.24, 0.3, 0.78]],
  ["thermo", "增溫層", 1.082, 1.135, [0.34, 0.24, 0.72], [0.3, 0.2, 0.62]],
  ["exo", "外氣層", 1.135, 1.2, [0.22, 0.16, 0.48], [0.1, 0.08, 0.25]],
];
const ALPHA = { tropo: 0.6, strato: 0.5, meso: 0.42, thermo: 0.34, exo: 0.22 };
// 每一層的說明(點標籤看、導覽旅程念)
const INFO = {
  exo: { range: "海拔 600 ~ 10,000 公里", temp: "空氣稀薄到幾乎就是太空", say: "我們從太空出發。這是外氣層,大氣的最外面,空氣稀薄到跟太空差不多,氣體分子會慢慢飄散出去。",
    note: "大氣和太空之間沒有明確的界線,外氣層的空氣分子彼此相距很遠,會慢慢飄散到太空中。" },
  thermo: { range: "海拔 85 ~ 600 公里", temp: "可達一千度以上,但空氣極稀薄、感覺不到熱", say: "往下進入增溫層。國際太空站就在大約四百公里的高度飛行,極光也是在這一層發光。",
    note: "國際太空站在約 400 公里高度繞地球;極光在約 100 ~ 400 公里發光。溫度雖然很高,但空氣分子太少,不會覺得熱。" },
  meso: { range: "海拔 50 ~ 85 公里", temp: "約 −90°C,大氣中最冷的一層", say: "這是中氣層,大氣裡最冷的一層,大約零下九十度。天上的流星,大多就是在這裡燒掉的。",
    note: "流星(太空中的小碎石)衝進大氣,大多在這一層摩擦燒光。" },
  strato: { range: "海拔 12 ~ 50 公里", temp: "約 −55 ~ 0°C(越高越暖)", say: "再往下是平流層,保護我們的臭氧層就在這裡,擋掉大部分的紫外線。",
    note: "臭氧層(約 15 ~ 35 公里)吸收紫外線;這層空氣穩定,長程客機常在它底部附近飛。" },
  tropo: { range: "海拔 0 ~ 12 公里(赤道約 17、極區約 8)", temp: "地面約 15°C,每升高 1 公里約降 6.5°C", say: "我們回到最熟悉的對流層,雲、雨、颱風這些天氣,幾乎都發生在這一層。",
    note: "大氣中大約八成的空氣都在這一層;聖母峰(8,849 公尺)也還在對流層裡。" },
  crust: { range: "地下 0 ~ 35 公里(海底只有約 7 公里)", temp: "地表到底部約 0 ~ 1,000°C", say: "現在鑽進地底下。這是地殼,我們住的岩石外殼,大陸平均大約三十五公里厚,海底只有七公里左右。人類挖過最深的洞,也才十二公里。",
    note: "人類最深的鑽井(俄羅斯科拉超深鑽孔)約 12 公里;最深的海溝馬里亞納海溝約 11 公里。圖上的地殼有放大,實際只有地球半徑的 0.5%。" },
  astheno: { range: "地下約 100 ~ 350 公里", temp: "約 1,300 ~ 1,500°C", say: "",
    note: "上部地函裡比較軟、會非常緩慢流動的一層,少部分岩石熔融。板塊就浮在它上面移動,火山的岩漿大多來自這一帶。" },
  upper: { range: "地下 35 ~ 660 公里", temp: "約 500 ~ 1,900°C", say: "往下是上部地函。很多人以為地底下有一整層岩漿,其實地函幾乎都是固態的岩石,只是會像麥芽糖一樣非常緩慢地流動。只有軟流圈裡少部分岩石會熔化,火山的岩漿大多就是從這裡來的。",
    note: "以橄欖岩為主的高溫岩石。其中的軟流圈(約 100 ~ 350 公里)部分熔融、會緩慢流動,推動板塊移動,也是岩漿的主要來源。" },
  lower: { range: "地下 660 ~ 2,891 公里", temp: "約 2,000 ~ 4,000°C", say: "這是下部地函,很厚的一層高溫岩石,溫度大約兩千到四千度,但因為壓力非常大,所以還是固態。",
    note: "地球體積最大的一層(約佔一半以上)。壓力極大,岩石雖然很熱仍保持固態。" },
  outer: { range: "地下 2,891 ~ 5,150 公里", temp: "約 4,000 ~ 5,500°C", say: "穿過地函,來到外核。這裡才是真正的液態層,是熔化的鐵和鎳。液態金屬流動,產生了地球的磁場,保護我們不受太陽風傷害,也讓指南針能指北。",
    note: "液態的鐵和鎳。它的流動像發電機一樣產生地球磁場(地磁),指南針會指北、極光會出現都跟它有關。" },
  inner: { range: "地下 5,150 ~ 6,371 公里(地心)", temp: "約 5,400°C,跟太陽表面差不多熱", say: "終於到了地球的中心,內核。這是一顆比月球小一點的固態鐵鎳球,溫度大約五千四百度,跟太陽表面差不多熱,但巨大的壓力讓它維持固態。如果從台北一路往下挖穿地心,會到南美洲的巴拉圭附近,旁邊的阿根廷剛好有個省叫福爾摩沙。",
    note: "半徑約 1,220 公里,比月球(1,737 公里)小一點。從台北往下穿過地心的另一端,是南美洲的巴拉圭首都亞松森附近。" },
};
const JOURNEY = ["exo", "thermo", "meso", "strato", "tropo", "crust", "upper", "lower", "outer", "inner"];

const Y = new THREE.Vector3(0, 1, 0);
const dirOfLon = (lon) => { const p = latLonToXYZ(0, lon, 1); return new THREE.Vector3(p.x, p.y, p.z).normalize(); };

export function createEarthLayers({ scene, camera, renderer, rig, globe, clouds, voice, setGroundLines, onClose }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  let active = false, L = 0, labels = [];
  const planes = [new THREE.Plane(), new THREE.Plane()];

  // ---------- 切面:兩個經線面上的半圓,每一層一條半環 ----------
  function faceFor(lon, towardWedge) {
    const d = dirOfLon(lon);
    const n = new THREE.Vector3().crossVectors(Y, d).normalize();    // 指向經度增加的方向
    const m = new THREE.Matrix4().makeBasis(d, Y, n);
    const faceGroup = new THREE.Group();
    faceGroup.applyMatrix4(m);
    for (const [id, , r0, r1, c0, c1] of LAYERS) {
      const g = new THREE.RingGeometry(Math.max(0.0005, r0), r1, 96, 3, -Math.PI / 2, Math.PI);
      const pos = g.getAttribute("position");
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        const k = (r - r0) / Math.max(1e-6, r1 - r0);
        col.set([c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k], i * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const a = ALPHA[id];
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, transparent: a != null, opacity: a ?? 1, depthWrite: a == null,
      }));
      mesh.position.z = towardWedge * 0.0006;   // 兩個面在地軸上交會,稍微錯開避免閃爍
      mesh.renderOrder = a != null ? 5 : 0;
      mesh.userData.layer = id;
      layerMeshes.push(mesh);
      faceGroup.add(mesh);
    }
    // 每一層的分界線
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    for (const [, , , r1] of LAYERS) {
      const pts = [];
      for (let i = 0; i <= 64; i++) { const t = -Math.PI / 2 + (i / 64) * Math.PI; pts.push(new THREE.Vector3(r1 * Math.cos(t), r1 * Math.sin(t), towardWedge * 0.001)); }
      faceGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    return { faceGroup, d, n };
  }

  let faces = null;
  const layerMeshes = [];
  // 旅程中:目前這一層加亮、其他層調暗(null = 全部正常)
  function highlight(id) {
    for (const m of layerMeshes) {
      const on = !id || m.userData.layer === id;
      const hot = m.userData.layer === "inner" || m.userData.layer === "outer";   // 地核本來就會發光,加亮少一點
      m.material.color.setScalar(!id ? 1 : on ? (hot ? 1.1 : 1.45) : 0.4);
    }
  }
  function build(lonL) {
    for (const c of [...group.children]) group.remove(c);
    layerMeshes.length = 0;
    const A = faceFor(lonL, 1), B = faceFor(lonL + 90, -1);
    group.add(A.faceGroup, B.faceGroup);
    faces = { A, B };
    // 切掉「經度 L ~ L+90」這一塊:兩個平面的負側交集(clipIntersection)
    planes[0].set(A.n.clone().negate(), 0);
    planes[1].set(B.n.clone(), 0);
    // 標籤:地函、地核在 A 面上半部;地殼、軟流圈、大氣各層在 B 面(大氣放下半部)
    makeLabels();
  }

  // ---------- 標籤 ----------
  const host = document.createElement("div");
  host.id = "layer-labels";
  host.hidden = true;
  document.body.appendChild(host);
  const popup = document.createElement("div");
  popup.id = "layer-pop";
  popup.hidden = true;
  document.body.appendChild(popup);
  popup.addEventListener("click", () => { popup.hidden = true; });

  function spot(face, r, thetaDeg) {
    const t = thetaDeg * Math.PI / 180;
    return face.d.clone().multiplyScalar(r * Math.cos(t)).addScaledVector(Y, r * Math.sin(t));
  }
  // 標籤都放在正面那個切面(B)上,沿著弧線往上錯開:地函、地核在內側,大氣各層在外圈上方(避開下方說明卡)
  const PLACE = {
    inner: ["B", 0.12, 55], outer: ["B", 0.37, -22], lower: ["B", 0.72, 4], upper: ["B", 0.915, 20],
    astheno: ["B", 0.958, 30], crust: ["B", 0.986, 40],
    tropo: ["B", 1.014, 50], strato: ["B", 1.043, 58], meso: ["B", 1.07, 66], thermo: ["B", 1.108, 74], exo: ["B", 1.167, 82],
  };
  function makeLabels() {
    host.innerHTML = "";
    labels = [];
    for (const [id, zh] of LAYERS) {
      const [f, r, th] = PLACE[id];
      const el = document.createElement("button");
      el.type = "button";
      el.className = `ly-label ly-${id}`;
      el.innerHTML = `<b>${zh}</b><small>${INFO[id].range.split("(")[0]}</small>`;
      el.addEventListener("click", (e) => { e.stopPropagation(); showPop(id, e.clientX, e.clientY); });
      host.appendChild(el);
      labels.push({ id, el, p: spot(faces[f], r, th) });
    }
  }
  function showPop(id, x, y) {
    const zh = LAYERS.find((l) => l[0] === id)[1];
    const i = INFO[id];
    popup.innerHTML = `<b>${zh}</b><div class="ly-r">${i.range}</div><div class="ly-t">🌡️ ${i.temp}</div><div>${i.note}</div><small>點一下關閉</small>`;
    popup.hidden = false;
    const w = 280;
    popup.style.left = `${Math.min(window.innerWidth - w - 10, Math.max(10, x - w / 2))}px`;
    popup.style.top = `${Math.min(window.innerHeight - 200, y + 14)}px`;
  }

  // ---------- 資訊卡(開始旅程、上一層/下一層、旁白開關) ----------
  const card = document.createElement("div");
  card.id = "layers-panel";   // 名稱以 -panel 結尾:手機上地球會自動往上移、避開這張卡
  card.hidden = true;
  document.body.appendChild(card);
  let step = -1, speakOn = (() => { try { return localStorage.getItem("earth-world.layers-voice") !== "off"; } catch { return true; } })();
  let autoTimer = null, speaking = 0;
  function paintCard() {
    const vbtn = `<button type="button" data-act="voice" class="ly-voice">${speakOn ? "🔊 旁白:開" : "🔇 旁白:關"}</button>`;
    if (step < 0) {
      card.innerHTML =
        `<div class="ly-h">🌍 地球剖面:從大氣層到地心</div>` +
        `<div class="ly-p">地球切開了四分之一,點切面上的每一層看說明。地函、地核是真實比例;地殼和大氣層太薄,有放大顯示。</div>` +
        `<div class="ly-b"><button type="button" data-act="go" class="ly-go">🚀 開始旅程:從太空一路到地心</button>${vbtn}<button type="button" data-act="close">✕ 關閉剖面</button></div>`;
      return;
    }
    const id = JOURNEY[step], zh = LAYERS.find((l) => l[0] === id)[1], i = INFO[id];
    card.innerHTML =
      `<div class="ly-step">${step + 1} / ${JOURNEY.length}</div>` +
      `<div class="ly-h">${zh}</div><div class="ly-r">${i.range}</div><div class="ly-t">🌡️ ${i.temp}</div><div class="ly-p">${i.note}</div>` +
      `<div class="ly-b"><button type="button" data-act="prev"${step === 0 ? " disabled" : ""}>◀ 上一層</button>` +
      `<button type="button" data-act="next">${step === JOURNEY.length - 1 ? "🏁 完成" : "往下一層 ▶"}</button>${vbtn}<button type="button" data-act="stop">✕</button></div>`;
  }
  card.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === "go") goStep(0);
    else if (act === "next") { if (step >= JOURNEY.length - 1) endJourney(); else goStep(step + 1); }
    else if (act === "prev") goStep(Math.max(0, step - 1));
    else if (act === "stop") endJourney();
    else if (act === "close") onClose && onClose();
    else if (act === "voice") {
      speakOn = !speakOn;
      try { localStorage.setItem("earth-world.layers-voice", speakOn ? "on" : "off"); } catch { /* 存不了就算了 */ }
      if (!speakOn) voice?.stop();
      else if (step >= 0) say(JOURNEY[step]);
      paintCard();
    }
  });

  // ---------- 導覽旅程:鏡頭一層一層往下 ----------
  let cam = null;   // { from, to, fromT, toT, t, ms }
  const target = new THREE.Vector3();
  function viewFor(id) {
    const [f, r, th] = PLACE[id];
    const face = faces[f];
    const P = spot(face, r, th);
    const into = f === "A" ? face.n.clone() : face.n.clone().negate();   // 從楔形缺口那一側看切面
    // 鏡頭保持一點距離:看得到整個切面(知道自己在哪一層),再往目前這一層靠過去一些
    const dist = r > 1 ? 1.05 : r > 0.9 ? 1.1 : 1.35;
    const look = P.clone().multiplyScalar(0.55);   // 視線落在「這一層」和地心之間,畫面裡同時看得到上下層
    const pos = look.clone().addScaledVector(into, dist).addScaledVector(Y, 0.25).addScaledVector(face.d, r > 1 ? 0.35 : 0.15);
    return { pos, look };
  }
  function say(id) {
    clearTimeout(autoTimer);
    const text = INFO[id].say;
    if (speakOn && voice && text) {
      const p = voice.speak(text, { force: true });
      const my = ++speaking;
      if (p && typeof p.then === "function") p.then(() => { if (my === speaking && step >= 0 && JOURNEY[step] === id) autoTimer = setTimeout(() => nextAuto(id), 1200); });
    }
  }
  function nextAuto(id) {
    if (step < 0 || JOURNEY[step] !== id) return;
    if (step < JOURNEY.length - 1) goStep(step + 1);
  }
  function goStep(i) {
    if (step < 0) {
      rig.cancelTween();
      rig.controls.enabled = false;
    }
    step = i;
    highlight(JOURNEY[i]);
    const v = viewFor(JOURNEY[i]);
    cam = { from: camera.position.clone(), to: v.pos, fromT: target.clone().lengthSq() ? target.clone() : new THREE.Vector3(), toT: v.look, t: 0, ms: i === 0 ? 2200 : 1700 };
    paintCard();
    popup.hidden = true;
    say(JOURNEY[i]);
  }
  function endJourney() {
    clearTimeout(autoTimer);
    voice?.stop();
    step = -1;
    cam = null;
    highlight(null);
    target.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    rig.controls.enabled = true;
    overview(1200);
    paintCard();
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // 看整個剖面:從斜上方看缺口(像教科書裡「切掉一角的地球」),兩個切面都看得清楚、也看得到地表
  function overview(ms = 1600) {
    // 直向手機要拉更遠才裝得下整個剖面和旁邊的標籤
    rig.flyTo(28, L + 30, { distance: Math.max(3.7, fitDistanceForAspect(camera.aspect) * 1.25), ms });
  }

  function setEnabled(v) {
    active = !!v;
    const mats = [globe.material, clouds.object.material];
    if (active) {
      // 缺口朝著鏡頭:用鏡頭現在的經度,缺口在 L ~ L+90
      const d = camera.position.clone().normalize().applyQuaternion(globe.object.quaternion.clone().invert());
      L = xyzToLatLon(d).lon - 45;
      build(L);
      renderer.localClippingEnabled = true;
      for (const m of mats) { m.clippingPlanes = planes; m.clipIntersection = true; m.needsUpdate = true; }
      globe.atmosphere.visible = false;
      setGroundLines(false);
      group.visible = true;
      host.hidden = false;
      card.hidden = false;
      document.body.classList.add("layers-on");
      step = -1;
      paintCard();
      overview();
    } else {
      if (step >= 0) endJourney();
      for (const m of mats) { m.clippingPlanes = null; m.clipIntersection = false; m.needsUpdate = true; }
      globe.atmosphere.visible = true;
      setGroundLines(true);
      group.visible = false;
      host.hidden = true;
      card.hidden = true;
      popup.hidden = true;
      document.body.classList.remove("layers-on");
    }
  }

  // ---------- 每幀 ----------
  const ndc = new THREE.Vector3();
  function update(dt) {
    if (!active) return;
    if (cam) {
      cam.t = Math.min(1, cam.t + (dt * 1000) / cam.ms);
      const k = ease(cam.t);
      camera.position.lerpVectors(cam.from, cam.to, k);
      target.lerpVectors(cam.fromT, cam.toT, k);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
    }
    camera.updateMatrixWorld();
    const rect = canvasRect(renderer.domElement);
    for (const l of labels) {
      ndc.copy(l.p).project(camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.style.transform = `translate(${Math.round(rect.left + (ndc.x * 0.5 + 0.5) * rect.width)}px, ${Math.round(rect.top + (-ndc.y * 0.5 + 0.5) * rect.height)}px) translate(-50%, -50%)`;
      l.el.classList.toggle("on", step >= 0 && JOURNEY[step] === l.id);
    }
  }

  return { setEnabled, isEnabled: () => active, isTouring: () => step >= 0, update };
}
