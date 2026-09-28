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
const VOICE_KEY = "earth-world.cinema-voice";

// [緯度, 經度, 開始距離, 結束距離, 經度漂移, 緯度漂移, 中文, 中文副標, English, 地球上標示的名稱(省略 = 同中文)]
// 人聲導覽的旁白另外寫在 NARRATION(像導遊帶路,不是唸字幕)
// 緯度經度是地球上標示 📍 的那一點:山脈、河流、海洋這種大範圍的地方,取最有代表性的位置
const SHOTS = [
  // 亞洲
  [23.7, 121, 1.95, 1.6, 14, 2, "台灣", "福爾摩沙 · 北回歸線穿過的美麗島嶼", "Taiwan"],
  [40.43, 116.57, 1.75, 1.5, 14, 1, "萬里長城", "綿延兩萬多公里的古代防線", "The Great Wall", "萬里長城(八達嶺)"],
  [36.5, 138, 1.9, 1.65, 16, 3, "日本列島", "由一萬四千多座島嶼組成", "Japan"],
  [35.36, 138.73, 1.6, 1.42, 8, 1, "富士山", "日本最高峰 · 3,776 公尺", "Mount Fuji"],
  [53.5, 108, 1.9, 1.7, 14, 2, "貝加爾湖", "世界最深的湖 · 約 1,642 公尺", "Lake Baikal"],
  [27.99, 86.93, 1.75, 1.5, 16, -2, "喜馬拉雅山脈", "世界屋脊 · 聖母峰 8,848.86 公尺", "The Himalayas", "聖母峰"],
  [41.5, 51, 1.9, 1.7, 12, 2, "裏海", "世界面積最大的湖", "Caspian Sea"],
  [31.5, 35.5, 1.6, 1.42, 6, 2, "死海", "陸地上最低的地方 · 湖面在海平面下 430 多公尺", "Dead Sea"],
  // 非洲
  [29.98, 31.13, 1.6, 1.42, 6, -2, "吉薩金字塔", "大約四千五百年前建造的古埃及金字塔", "Pyramids of Giza"],
  [22, 31.5, 1.9, 1.65, 8, 8, "尼羅河", "世界最長的河流之一 · 約 6,650 公里", "The Nile", "尼羅河(納瑟湖一帶)"],
  [23, 12, 2.3, 1.95, 22, 3, "撒哈拉沙漠", "世界最大的熱沙漠", "Sahara Desert"],
  [-3.07, 37.35, 1.65, 1.45, 8, -2, "吉力馬札羅山", "非洲最高峰 · 5,895 公尺", "Mount Kilimanjaro"],
  [-17.92, 25.86, 1.65, 1.45, 8, -2, "維多利亞瀑布", "寬約 1.7 公里、落差一百多公尺的大瀑布", "Victoria Falls"],
  [-19, 46.8, 1.85, 1.6, 8, -6, "馬達加斯加", "世界第四大島 · 狐猴等許多動物只住在這裡", "Madagascar"],
  // 歐洲、北極
  [35.5, 18, 2.0, 1.75, 18, 1, "地中海", "被歐洲、亞洲、非洲環抱的內海", "Mediterranean Sea"],
  [45.83, 6.86, 1.7, 1.48, 12, 1, "阿爾卑斯山脈", "歐洲的屋脊 · 白朗峰約 4,806 公尺", "The Alps", "白朗峰"],
  [64.9, -18.5, 1.8, 1.6, 12, 2, "冰島", "冰與火之島 · 坐落在大西洋中洋脊上", "Iceland"],
  [72, -42, 2.2, 1.9, 20, -3, "格陵蘭", "世界最大的島 · 約八成被冰層覆蓋", "Greenland"],
  [86, 0, 2.3, 2.0, 60, -3, "北極", "北冰洋 · 冬天大部分海面都會結冰", "The Arctic"],
  // 北美洲、太平洋
  [45, -84, 1.9, 1.65, 14, 1, "五大湖", "世界最大的淡水湖群", "The Great Lakes"],
  [36.1, -112.1, 1.6, 1.42, 8, 1, "大峽谷", "長約 446 公里、最深約 1,800 公尺", "Grand Canyon"],
  [19.6, -155.5, 1.7, 1.5, 10, 1, "夏威夷", "太平洋中央的火山群島", "Hawaii"],
  // 南美洲
  [-0.6, -90.5, 1.65, 1.45, 8, -1, "加拉巴哥群島", "達爾文在這裡觀察雀鳥,啟發了演化論", "Galápagos Islands"],
  [-4, -62, 2.1, 1.8, 18, 3, "亞馬遜雨林", "地球之肺 · 世界最大的熱帶雨林", "Amazon Rainforest"],
  [-25.69, -54.44, 1.6, 1.42, 6, -2, "伊瓜蘇瀑布", "兩百多道瀑布組成的壯觀瀑布群", "Iguazu Falls"],
  [-22, -68, 1.9, 1.65, 6, -12, "安地斯山脈", "世界最長的山脈 · 約 7,000 公里", "The Andes"],
  [-50, -73, 1.85, 1.6, 8, -4, "巴塔哥尼亞", "南美洲最南端的冰河與荒原", "Patagonia"],
  // 南極、大洋洲
  [-78, 20, 2.4, 2.1, 40, 2, "南極洲", "地球最冷的大陸 · 蘊藏全球約七成淡水", "Antarctica"],
  [-43.5, 170.5, 1.75, 1.5, 10, 2, "紐西蘭", "南阿爾卑斯山與冰河 · 《魔戒》的拍攝地", "New Zealand"],
  [-25.34, 131.04, 1.7, 1.48, 8, 1, "烏魯魯", "澳洲中部高約 348 公尺的巨岩 · 原住民的聖地", "Uluru"],
  [-18.3, 147.7, 1.8, 1.6, 10, -6, "大堡礁", "世界最大的珊瑚礁系統 · 綿延約 2,300 公里", "Great Barrier Reef"],
  [5, -160, 3.2, 2.8, 30, 4, "太平洋", "地球最大的海洋 · 比全部陸地加起來還大", "Pacific Ocean"],
];

const NARRATION = {
  "台灣": "我們從家鄉台灣出發!北回歸線剛好穿過這座美麗的島嶼。",
  "萬里長城": "往北飛到中國,這是萬里長城,古人蓋來抵禦外敵的防線,加起來有兩萬多公里長。",
  "日本列島": "往東北飛一點,這裡是日本,由一萬四千多座島嶼組成。",
  "富士山": "那座圓錐形的山就是富士山,日本最高峰,有三千七百七十六公尺高。",
  "貝加爾湖": "再往北,這是西伯利亞的貝加爾湖,世界上最深的湖,大約有一千六百多公尺深。",
  "喜馬拉雅山脈": "看,這就是世界屋脊喜馬拉雅山脈,聖母峰就在這裡,有八千八百四十八公尺高。",
  "裏海": "這片被陸地包圍的大水域是裏海,它是世界上面積最大的湖。",
  "死海": "這裡是死海,湖面在海平面下四百多公尺,是陸地上最低的地方,鹽分高到人可以浮在水面上。",
  "吉薩金字塔": "來到埃及的吉薩,這些金字塔大約在四千五百年前就蓋好了。",
  "尼羅河": "沙漠裡那條細細的綠線,就是尼羅河,古埃及文明就是在這裡誕生的。",
  "撒哈拉沙漠": "眼前一大片黃沙,是撒哈拉沙漠,世界上最大的熱沙漠。",
  "吉力馬札羅山": "往南到東非,這是吉力馬札羅山,非洲最高峰,就在赤道附近,山頂卻有積雪。",
  "維多利亞瀑布": "這裡是維多利亞瀑布,寬度大約一點七公里,當地人叫它「會打雷的煙霧」。",
  "馬達加斯加": "非洲東邊的大島是馬達加斯加,世界第四大島,狐猴這些動物全世界只有這裡才有。",
  "地中海": "歐洲、亞洲和非洲把這片海圍了起來,這裡是地中海。",
  "阿爾卑斯山脈": "往北飛過地中海,這是阿爾卑斯山脈,歐洲的屋脊,最高的白朗峰大約四千八百公尺。",
  "冰島": "來到冰島,冰川和火山都在這裡,它就坐落在大西洋的中洋脊上。",
  "格陵蘭": "底下白茫茫的一片是格陵蘭,世界最大的島,大約八成都被冰層蓋住。",
  "北極": "我們到了北極,腳下是北冰洋,冬天大部分的海面都會結成冰。",
  "五大湖": "往南來到北美洲,這五個相連的大湖是五大湖,世界最大的淡水湖群。",
  "大峽谷": "這是美國的大峽谷,科羅拉多河花了幾百萬年,切出最深大約一千八百公尺的峽谷。",
  "夏威夷": "飛到太平洋中央,這裡是夏威夷,一整串由火山形成的島嶼。",
  "加拉巴哥群島": "赤道上的加拉巴哥群島,達爾文在這裡觀察雀鳥,後來提出了演化論。",
  "亞馬遜雨林": "這片深綠色是亞馬遜雨林,世界最大的熱帶雨林,也被叫做地球之肺。",
  "伊瓜蘇瀑布": "巴西和阿根廷交界的伊瓜蘇瀑布,由兩百多道瀑布組成,非常壯觀。",
  "安地斯山脈": "沿著南美洲的西岸,是綿延大約七千公里的安地斯山脈。",
  "巴塔哥尼亞": "來到南美洲的最南端,巴塔哥尼亞,到處都是冰河和荒原。",
  "南極洲": "我們飛到地球最南邊的南極洲了,這裡是最冷的大陸,存著全世界大約七成的淡水。",
  "紐西蘭": "往東到紐西蘭,南阿爾卑斯山和冰河就在這裡,也是電影《魔戒》的拍攝地。",
  "烏魯魯": "澳洲中部那塊紅色的巨岩是烏魯魯,高約三百四十八公尺,是原住民的聖地。",
  "大堡礁": "澳洲東北方的海上,藏著世界最大的珊瑚礁,大堡礁。",
  "太平洋": "最後,眼前這一整片藍色都是太平洋,比全世界的陸地加起來還要大。我們回台灣吧!",
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch { return true; } };
const readVoice = () => { try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch { return true; } };

const fmtCoord = (lat, lon) => isEn
  ? `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
  : `${lat >= 0 ? "北緯" : "南緯"} ${Math.abs(lat).toFixed(1)}° · ${lon >= 0 ? "東經" : "西經"} ${Math.abs(lon).toFixed(1)}°`;

export function createCinema({ camera, rig, globeObject, renderer, canAutoStart, onStart, onStop, onShot, onVoiceChange }) {
  const cap = document.createElement("div");
  cap.id = "cinema-caption";
  // 字幕 + 地球上的 📍 標示 + 一條把兩者連起來的細線:讀者一眼就知道字幕講的是地球上哪裡
  cap.innerHTML = `<svg class="cm-link" aria-hidden="true"><line/><circle r="2.5"/></svg>` +
    `<div class="cm-pin"><i></i><span></span></div>` +
    `<div class="cm-text"><div class="cm-title"></div><div class="cm-sub"></div><div class="cm-en"></div><div class="cm-coord"></div></div>` +
    `<div class="cm-hint">點任何地方結束 · <button type="button" class="cm-auto"></button></div>` +
    `<button type="button" class="cm-voice" aria-pressed="true"></button>`;
  document.body.appendChild(cap);
  const $t = cap.querySelector(".cm-title"), $s = cap.querySelector(".cm-sub"), $e = cap.querySelector(".cm-en"), $c = cap.querySelector(".cm-coord");
  const $text = cap.querySelector(".cm-text"), $pin = cap.querySelector(".cm-pin"), $pinName = $pin.querySelector("span");
  const $line = cap.querySelector(".cm-link line"), $dot = cap.querySelector(".cm-link circle");
  const autoBtn = cap.querySelector(".cm-auto");
  // 🔊 旁白開關:巡航時右下角一直都在,讀者隨時開關(不影響其他地方的人聲播報設定)
  const voiceBtn = cap.querySelector(".cm-voice");
  let voiceOn = readVoice();
  const paintVoice = () => {
    voiceBtn.textContent = voiceOn ? (isEn ? "🔊 Narration on" : "🔊 導覽旁白:開") : (isEn ? "🔇 Narration off" : "🔇 導覽旁白:關");
    voiceBtn.setAttribute("aria-pressed", String(voiceOn));
  };
  paintVoice();
  let autoOn = readAuto();
  const paintAuto = () => { autoBtn.textContent = autoOn ? "不要在閒置時自動播放" : "閒置時自動播放:已關閉"; };
  paintAuto();

  let active = false, shot = 0, phase = "fly", t = 0;
  let holdLen = HOLD_S, speechPending = false, speechEndT = 0;
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
    holdLen = HOLD_S;
    speakShot(s);
  }
  // 有旁白時:這一站停到唸完(再多停 0.8 秒)才飛下一站,旁白不會被下一站切斷
  function speakShot(s) {
    const narration = isEn ? `Here is ${s[8]}.` : NARRATION[s[6]];
    const said = onShot && onShot({ title: isEn ? s[8] : s[6], sub: isEn ? "" : s[7], narration, voice: voiceOn });
    if (said && typeof said.then === "function") {
      speechPending = true;
      holdLen = Math.max(HOLD_S, t + (narration || "").length / (isEn ? 14 : 4) + 1.5);   // 預估唸多久,鏡頭漂移照這個速度
      const shotAtStart = shot;
      said.then(() => { if (shot === shotAtStart) { speechPending = false; speechEndT = t; } });
    }
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
    const k = Math.min(1, t / holdLen);
    const e = k * k * (3 - 2 * k) * 0.4 + k * 0.6;   // 大致等速,頭尾稍微柔和
    worldDir(s[0] + s[5] * DRIFT * e, s[1] + s[4] * DRIFT * (e - 0.5), a);
    camera.position.copy(a).multiplyScalar(THREE.MathUtils.lerp(s[2], s[2] + (s[3] - s[2]) * DRIFT, e));
    camera.lookAt(0, 0, 0);
    placePin(s);
    // 什麼時候飛下一站:至少停 holdLen;還在唸就等唸完再 0.8 秒(最多多等 8 秒,免得語音卡住)
    const leaveAt = speechPending ? holdLen + 8 : Math.max(holdLen, speechEndT + 0.8);
    if (t >= leaveAt - 0.8) cap.classList.remove("show");
    if (t >= leaveAt) { speechPending = false; speechEndT = 0; shot = (shot + 1) % SHOTS.length; beginFly(); }
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
    // 按旁白開關:只切換、不結束巡航
    if (e.target.closest?.(".cm-voice")) {
      if (e.type !== "pointerdown") return;
      voiceOn = !voiceOn;
      try { localStorage.setItem(VOICE_KEY, voiceOn ? "on" : "off"); } catch { /* 存不了就算了 */ }
      paintVoice();
      onVoiceChange && onVoiceChange(voiceOn);
      if (voiceOn && phase === "hold") speakShot(SHOTS[shot]);   // 打開時馬上唸這一站
      return;
    }
    if (e.type === "keydown" && (e.key === "v" || e.key === "V")) {
      voiceOn = !voiceOn;
      try { localStorage.setItem(VOICE_KEY, voiceOn ? "on" : "off"); } catch { /* 存不了就算了 */ }
      paintVoice();
      onVoiceChange && onVoiceChange(voiceOn);
      return;
    }
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
