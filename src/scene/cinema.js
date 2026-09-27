import * as THREE from "three";
import { latLonToXYZ } from "../lib/geo.js";
import { isEn } from "../lib/i18n.js";

// 🎬 電影巡航:介面全部淡出,鏡頭像紀錄片一樣慢慢飛過世界各地,左下角打上地名字幕。
// 選單「電影巡航」立刻開始;畫面放著不動 90 秒(而且沒有開著其他功能)也會自動開始,
// 適合放在電視、大螢幕或當螢幕保護程式。點任何地方、按任何鍵就結束,停在當下的畫面。
const IDLE_MS = 90 * 1000;
const FLY_S = 4.5;      // 飛到下一個地點
const HOLD_S = 6;       // 在這個地點停留、慢慢漂移(原本 11 秒,讀者覺得太久)
// 下面地點表的漂移量是照 11 秒設計的;停留縮短後等比例縮小,漂移速度維持一樣從容
const DRIFT = HOLD_S / 11;
const AUTO_KEY = "earth-world.cinema-auto";

// [緯度, 經度, 開始距離, 結束距離, 經度漂移, 緯度漂移, 中文, 中文副標, English, 地球上標示的名稱(省略 = 同中文)]
// 緯度經度是地球上標示 📍 的那一點:山脈、河流、海洋這種大範圍的地方,取最有代表性的位置
const SHOTS = [
  [23.7, 121, 1.95, 1.6, 14, 2, "台灣", "福爾摩沙 · 北回歸線穿過的美麗島嶼", "Taiwan"],
  [36.5, 138, 1.9, 1.65, 16, 3, "日本列島", "由一萬四千多座島嶼組成", "Japan"],
  [53.5, 108, 1.9, 1.7, 14, 2, "貝加爾湖", "世界最深的湖 · 約 1,642 公尺", "Lake Baikal"],
  [27.99, 86.93, 1.75, 1.5, 16, -2, "喜馬拉雅山脈", "世界屋脊 · 聖母峰 8,848.86 公尺", "The Himalayas", "聖母峰"],
  [23, 12, 2.3, 1.95, 22, 3, "撒哈拉沙漠", "世界最大的熱沙漠", "Sahara Desert"],
  [22, 31.5, 1.9, 1.65, 8, 8, "尼羅河", "世界最長的河流之一 · 約 6,650 公里", "The Nile", "尼羅河(納瑟湖一帶)"],
  [35.5, 18, 2.0, 1.75, 18, 1, "地中海", "被歐洲、亞洲、非洲環抱的內海", "Mediterranean Sea"],
  [64.9, -18.5, 1.8, 1.6, 12, 2, "冰島", "冰與火之島 · 坐落在大西洋中洋脊上", "Iceland"],
  [72, -42, 2.2, 1.9, 20, -3, "格陵蘭", "世界最大的島 · 約八成被冰層覆蓋", "Greenland"],
  [-4, -62, 2.1, 1.8, 18, 3, "亞馬遜雨林", "地球之肺 · 世界最大的熱帶雨林", "Amazon Rainforest"],
  [-22, -68, 1.9, 1.65, 6, -12, "安地斯山脈", "世界最長的山脈 · 約 7,000 公里", "The Andes"],
  [-78, 20, 2.4, 2.1, 40, 2, "南極洲", "地球最冷的大陸 · 蘊藏全球約七成淡水", "Antarctica"],
  [-18.3, 147.7, 1.8, 1.6, 10, -6, "大堡礁", "世界最大的珊瑚礁系統 · 綿延約 2,300 公里", "Great Barrier Reef"],
  [5, -160, 3.2, 2.8, 30, 4, "太平洋", "地球最大的海洋 · 比全部陸地加起來還大", "Pacific Ocean"],
];

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch { return true; } };

const fmtCoord = (lat, lon) => isEn
  ? `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
  : `${lat >= 0 ? "北緯" : "南緯"} ${Math.abs(lat).toFixed(1)}° · ${lon >= 0 ? "東經" : "西經"} ${Math.abs(lon).toFixed(1)}°`;

export function createCinema({ camera, rig, globeObject, renderer, canAutoStart, onStart, onStop, onShot }) {
  const cap = document.createElement("div");
  cap.id = "cinema-caption";
  // 字幕 + 地球上的 📍 標示 + 一條把兩者連起來的細線:讀者一眼就知道字幕講的是地球上哪裡
  cap.innerHTML = `<svg class="cm-link" aria-hidden="true"><line/><circle r="2.5"/></svg>` +
    `<div class="cm-pin"><i></i><span></span></div>` +
    `<div class="cm-text"><div class="cm-title"></div><div class="cm-sub"></div><div class="cm-en"></div><div class="cm-coord"></div></div>` +
    `<div class="cm-hint">點任何地方結束 · <button type="button" class="cm-auto"></button></div>`;
  document.body.appendChild(cap);
  const $t = cap.querySelector(".cm-title"), $s = cap.querySelector(".cm-sub"), $e = cap.querySelector(".cm-en"), $c = cap.querySelector(".cm-coord");
  const $text = cap.querySelector(".cm-text"), $pin = cap.querySelector(".cm-pin"), $pinName = $pin.querySelector("span");
  const $line = cap.querySelector(".cm-link line"), $dot = cap.querySelector(".cm-link circle");
  const autoBtn = cap.querySelector(".cm-auto");
  let autoOn = readAuto();
  const paintAuto = () => { autoBtn.textContent = autoOn ? "不要在閒置時自動播放" : "閒置時自動播放:已關閉"; };
  paintAuto();

  let active = false, shot = 0, phase = "fly", t = 0;
  const fromDir = new THREE.Vector3(), toDir = new THREE.Vector3(), q = new THREE.Quaternion(), qI = new THREE.Quaternion();
  let fromDist = 3, hop = 0;

  // 地球上的經緯度 → 世界座標方向(地球在巡航時停住不轉)
  function worldDir(lat, lon, out) {
    const p = latLonToXYZ(lat, lon, 1);
    return out.set(p.x, p.y, p.z).normalize().applyQuaternion(globeObject.quaternion);
  }
  const shotStart = (s, out) => worldDir(s[0], s[1] - (s[4] * DRIFT) / 2, out);

  function beginFly() {
    phase = "fly"; t = 0;
    fromDir.copy(camera.position).normalize();
    fromDist = camera.position.length();
    shotStart(SHOTS[shot], toDir);
    hop = (fromDir.angleTo(toDir) / Math.PI) * 1.6;   // 距離越遠,中途拉得越高
    q.setFromUnitVectors(fromDir, toDir);
    cap.classList.remove("show");
  }

  let textAnchor = null;   // 字幕左上角(連線的起點),每個地點量一次
  function showCaption(s) {
    $t.textContent = isEn ? s[8] : s[6];
    $s.textContent = isEn ? "" : s[7];
    $e.textContent = isEn ? "" : s[8];
    $c.textContent = `📍 ${fmtCoord(s[0], s[1])}`;
    $pinName.textContent = isEn ? s[8] : (s[9] || s[6]);
    const r = $text.getBoundingClientRect();
    textAnchor = { x: r.left + 2, y: r.top - 8 };
    cap.classList.add("show");
    onShot && onShot({ title: isEn ? s[8] : s[6], sub: isEn ? "" : s[7] });
  }

  // 地球上的 📍:每幀把地點投影到畫面上,連線從字幕左上角拉過去
  const pinW = new THREE.Vector3(), pinN = new THREE.Vector3(), ndc = new THREE.Vector3();
  function placePin(s) {
    worldDir(s[0], s[1], pinN);
    pinW.copy(pinN);
    camera.updateMatrixWorld();
    ndc.copy(pinW).project(camera);
    const facing = pinN.dot(pinW.clone().sub(camera.position).negate().normalize());
    const w = renderer ? renderer.domElement.clientWidth : window.innerWidth, h = renderer ? renderer.domElement.clientHeight : window.innerHeight;
    if (facing < 0.1 || ndc.z > 1 || !textAnchor) { cap.classList.add("no-pin"); return; }
    cap.classList.remove("no-pin");
    const x = (ndc.x * 0.5 + 0.5) * w, y = (-ndc.y * 0.5 + 0.5) * h;
    $pin.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    $line.setAttribute("x1", textAnchor.x); $line.setAttribute("y1", textAnchor.y);
    $line.setAttribute("x2", x); $line.setAttribute("y2", y);
    $dot.setAttribute("cx", textAnchor.x); $dot.setAttribute("cy", textAnchor.y);
  }

  const dir = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  function update(dt) {
    if (!active) return;
    t += dt;
    const s = SHOTS[shot];
    if (phase === "fly") {
      const k = ease(Math.min(1, t / FLY_S));
      qI.identity().slerp(q, k);
      dir.copy(fromDir).applyQuaternion(qI);
      const dist = THREE.MathUtils.lerp(fromDist, s[2], k) + hop * Math.sin(Math.PI * k);
      camera.position.copy(dir).multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      if (t >= FLY_S) { phase = "hold"; t = 0; showCaption(s); }
      return;
    }
    // 慢慢漂移:經度往東、緯度微調,同時緩緩拉近
    const k = Math.min(1, t / HOLD_S);
    const e = k * k * (3 - 2 * k) * 0.4 + k * 0.6;   // 大致等速,頭尾稍微柔和
    worldDir(s[0] + s[5] * DRIFT * e, s[1] + s[4] * DRIFT * (e - 0.5), a);
    camera.position.copy(a).multiplyScalar(THREE.MathUtils.lerp(s[2], s[2] + (s[3] - s[2]) * DRIFT, e));
    camera.lookAt(0, 0, 0);
    placePin(s);
    if (t >= HOLD_S - 1) cap.classList.remove("show");
    if (t >= HOLD_S) { shot = (shot + 1) % SHOTS.length; beginFly(); }
  }

  function nearestShot() {
    b.copy(camera.position).normalize();
    let best = 0, bestAng = Infinity;
    SHOTS.forEach((s, i) => { const ang = shotStart(s, a).angleTo(b); if (ang < bestAng) { bestAng = ang; best = i; } });
    return best;
  }

  function start({ auto = false } = {}) {
    if (active) return;
    active = true;
    rig.cancelTween();
    rig.controls.enabled = false;
    document.body.classList.add("cinema");
    cap.classList.toggle("auto", auto);
    shot = nearestShot();   // 從最近的地點開始,第一段不用飛太遠
    beginFly();
    onStart && onStart();
  }
  function stop() {
    if (!active) return;
    active = false;
    rig.controls.enabled = true;
    document.body.classList.remove("cinema");
    cap.classList.remove("show");
    lastInput = performance.now();
    onStop && onStop();
  }

  // 任何操作都結束巡航(在最前面攔截,地球/按鈕照常收到這次操作)
  let lastInput = performance.now();
  const onInput = (e) => {
    lastInput = performance.now();
    if (!active) return;
    if (e.type === "pointermove") return;   // 滑鼠輕輕晃到不算
    if (e.target === autoBtn) {
      autoOn = !autoOn;
      try { localStorage.setItem(AUTO_KEY, autoOn ? "on" : "off"); } catch { /* 存不了就算了 */ }
      paintAuto();
    }
    stop();
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "pointermove"]) window.addEventListener(ev, onInput, { capture: true, passive: true });

  setInterval(() => {
    if (active || !autoOn || document.hidden) return;
    if (performance.now() - lastInput < IDLE_MS) return;
    if (canAutoStart && !canAutoStart()) { lastInput = performance.now() - IDLE_MS + 15000; return; }   // 15 秒後再看一次
    start({ auto: true });
  }, 5000);

  return { start, stop, update, isActive: () => active, toggle() { if (active) stop(); else start(); } };
}
