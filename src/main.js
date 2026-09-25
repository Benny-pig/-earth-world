import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { createStarfield } from "./scene/starfield.js";
import { createGlobe } from "./scene/globe.js";
import { createClouds } from "./scene/clouds.js";
import { createCameraRig, fitDistanceForAspect } from "./scene/camera-controls.js";
import { buildBorders, buildOutline } from "./countries/borders.js";
import { buildCountryLayer } from "./countries/country-layer.js";
import { setZhHantNames } from "./countries/country-names.js";
import { createTooltip } from "./ui/tooltip.js";
import { createOceanLabels } from "./scene/ocean-labels.js";
import { createCountryLabels } from "./scene/country-labels.js";
import { createPhysicalLabels } from "./scene/physical-labels.js";
import { createEarthquakesLayer } from "./scene/earthquakes.js";
import { createRadioLayer } from "./scene/radio.js";
import { createRadioPanel } from "./ui/radio-panel.js";
import { createSatellitePanel } from "./ui/satellite.js";
import { createFlightsLayer } from "./scene/flights.js";
import { createAirportBoard } from "./ui/airport-board.js";
import { createTrafficLayer } from "./scene/traffic.js";
import { createTrafficCenter } from "./ui/traffic-center.js";
import { createRailPanel } from "./ui/rail-panel.js";
import { createNaturePopup } from "./ui/nature-popup.js";
import { createSidePanel } from "./ui/side-panel.js";
import { createClockWeather } from "./ui/clock-weather.js";
import { createTwClock } from "./ui/tw-clock.js";
import { createCountrySearch } from "./ui/country-search.js";
import { createMusic } from "./audio/music.js";
import { createEncyclopedia } from "./ui/encyclopedia.js";
import { THEME_LABEL, getTheme, cycleTheme, onThemeChange, initTheme } from "./ui/theme.js";

const container = document.getElementById("app");
const DEFAULT_MIN_DISTANCE = 1.35;   // 跟 camera-controls.js 的 controls.minDistance 一致
const TRAFFIC_MIN_DISTANCE = 1.12;   // 路況開著時可以拉到離地約 760 公里,看得清楚各條國道

export function showError(msg) {
  const el = document.getElementById("error-banner");
  el.textContent = msg;
  el.style.display = "block";
  console.error("[earth-world]", msg);
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

// 首屏載入畫面:貼圖經 THREE.DefaultLoadingManager 追蹤,三個 JSON 由 bumpData() 手動計入。
function setupLoadingScreen() {
  const el = document.getElementById("loading");
  const fill = document.getElementById("ld-fill");
  const pctEl = document.getElementById("ld-pct");
  const DATA_TOTAL = 3;
  let texLoaded = 0, texTotal = 6, texDone = false, dataLoaded = 0, finished = false;

  function paint() {
    const loaded = texLoaded + dataLoaded;
    const total = Math.max(loaded + (texDone ? 0 : 1), texTotal + DATA_TOTAL);
    const p = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
    if (fill) fill.style.width = p + "%";
    if (pctEl) pctEl.textContent = `載入中… ${p}%`;
  }
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(failsafe);
    if (fill) fill.style.width = "100%";
    if (pctEl) pctEl.textContent = "載入完成";
    if (el) { el.classList.add("done"); setTimeout(() => el.remove(), 700); }
  }
  function maybeFinish() { if (texDone && dataLoaded >= DATA_TOTAL) finish(); }

  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => { texLoaded = loaded; texTotal = total; paint(); };
  THREE.DefaultLoadingManager.onLoad = () => { texDone = true; texLoaded = texTotal; paint(); maybeFinish(); };
  THREE.DefaultLoadingManager.onError = (url) => console.warn("[loading] 資源載入失敗:", url);
  const failsafe = setTimeout(finish, 15000);   // 永遠不把使用者困在遮罩後面
  paint();

  return {
    bumpData() { dataLoaded++; paint(); maybeFinish(); },
  };
}

export function start() {
  if (!webglAvailable()) {
    document.getElementById("webgl-fallback").style.display = "grid";
    return;
  }

  let reportedGlobalError = false;
  function reportGlobalError() {
    if (reportedGlobalError) return;
    reportedGlobalError = true;
    showError("發生未預期的錯誤,詳情請看主控台。");
  }
  window.addEventListener("error", reportGlobalError);
  window.addEventListener("unhandledrejection", reportGlobalError);

  const loading = setupLoadingScreen();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(0, 0, fitDistanceForAspect(window.innerWidth / window.innerHeight));

  const starfield = createStarfield();
  scene.add(starfield.object);

  const globe = createGlobe({ onAllTexturesFailed: () => showError("地球貼圖載入失敗,已改用純色地球。") });
  scene.add(globe.object);
  scene.add(globe.lightRig);

  // 非同步載入 Natural Earth 50m 國界(由 tools/build-countries-geo.py 產生),掛在地球 group 上跟著自轉
  const tap = (p) => p.finally(() => loading.bumpData());
  Promise.all([
    tap(fetch("data/countries.geo.json").then((r) => { if (!r.ok) throw new Error("國界資料載入失敗 " + r.status); return r.json(); })),
    tap(fetch("data/country-names-zh-hant.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))),
    tap(fetch("data/countries.content.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))),
    tap(fetch("data/travel-alert.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)),
  ])
    .then(([geojson, zhHant, content, travelAlert]) => {
      setZhHantNames(zhHant);
      window.__earth.content = content;
      window.__earth.geojson = geojson;
      window.__earth.travelAlert = (travelAlert && travelAlert.countries) || {};
      const borders = buildBorders(geojson);
      globe.object.add(borders);
      window.__earth.borders = borders;
      // 台灣海岸線用醒目的金色粗線,一眼就能在地球上找到
      const twOutline = buildOutline(geojson, "TW");
      if (twOutline) globe.object.add(twOutline);
      const countryLayer = buildCountryLayer(geojson);
      globe.object.add(countryLayer.group);
      window.__earth.countryLayer = countryLayer;
      const countryLabels = createCountryLabels({ geojson, globeObject: globe.object, camera, renderer, onPick: openCountryByCode });
      window.__earth.countryLabels = countryLabels;

      const searchIndex = [];
      for (const [code, wrap] of countryLayer.meshByCode) {
        const n = wrap.userData.names || {};
        searchIndex.push({ code, zh: n.zh || code, en: n.en || "" });
      }
      searchIndex.sort((a, b) => a.zh.localeCompare(b.zh, "zh-Hant"));
      window.__earth.countrySearch = createCountrySearch({ index: searchIndex, onPick: openCountryByCode });
    })
    .catch((err) => showError(err.message));

  const clouds = createClouds();
  scene.add(clouds.object);

  // EffectComposer 的 RenderPass 是畫到離屏 render target,不是直接畫到 canvas,
  // renderer 自己的 antialias:true 在這個管線裡對主要畫面幾乎沒有實際效果、只是
  // 白白多開一份 MSAA buffer;真正的反鋸齒是下面的 SMAAPass,兩者疊加是做兩次一樣
  // 的事。DPR 上限從 2 降到 1.5:高解析度螢幕上 2x 是 4 倍像素、1.5x 只要 2.25 倍,
  // bloom/SMAA 這些全螢幕後製通道成本跟著像素數量等比放大,對內顯卡筆電影響最大
  // (使用者回報「別人電腦開著整台變超卡、連滑鼠都lag」,GPU 長時間被榨滿是典型
  // 症狀)。
  const MAX_PIXEL_RATIO = 1.5;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42,   // strength — gentle
    0.4,    // radius
    0.92    // threshold — high: only the brightest pixels (city lights, star cores) bloom, NOT the lit earth face
  );
  composer.addPass(bloomPass);
  const smaaPass = new SMAAPass(
    window.innerWidth * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio()
  );
  composer.addPass(smaaPass);
  composer.addPass(new OutputPass());

  window.__earth = { scene, camera, renderer };
  window.__earth.globe = globe;
  window.__earth.clouds = clouds;
  window.__earth.composer = composer;

  const rig = createCameraRig({ camera, domElement: renderer.domElement, globeObject: globe.object });
  window.__earth.rig = rig;

  const naturePopup = createNaturePopup();
  window.__earth.naturePopup = naturePopup;
  const oceanLabels = createOceanLabels({ globeObject: globe.object, camera, renderer, naturePopup });
  window.__earth.oceanLabels = oceanLabels;
  const physicalLabels = createPhysicalLabels({ globeObject: globe.object, camera, renderer, naturePopup });
  window.__earth.physicalLabels = physicalLabels;
  const quakeSevereBadge = document.getElementById("quake-severe-badge");
  let quakeSevere = false;
  function syncQuakeSevereBadge() {
    if (quakeSevereBadge) quakeSevereBadge.hidden = !(quakeSevere && !earthquakes.isEnabled());
  }
  const earthquakes = createEarthquakesLayer({
    globeObject: globe.object, camera, renderer, naturePopup,
    onSevereChange: (v) => { quakeSevere = v; syncQuakeSevereBadge(); },
  });
  window.__earth.earthquakes = earthquakes;
  const quakeToggle = document.getElementById("quake-toggle");
  if (quakeToggle) quakeToggle.addEventListener("click", () => {
    const next = quakeToggle.getAttribute("aria-pressed") !== "true";
    quakeToggle.setAttribute("aria-pressed", String(next));
    earthquakes.setEnabled(next);
    syncQuakeSevereBadge();
  });

  // 版面主題:首頁也放一顆切換鈕,不用點進國家詳細介紹才能選——跟大百科裡那顆
  // 共用同一份狀態(theme.js),兩邊點誰都會同步。
  initTheme();
  const themeToggle = document.getElementById("theme-toggle");
  function refreshThemeToggle() { if (themeToggle) themeToggle.textContent = THEME_LABEL[getTheme()]; }
  refreshThemeToggle();
  onThemeChange(refreshThemeToggle);
  if (themeToggle) themeToggle.addEventListener("click", cycleTheme);

  // hover 暫停:用 raycaster 判斷游標是否指到地球(Task 7 會擴充成國家偵測,這裡先做地球層級)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let resumeTimer = null;
  renderer.domElement.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  window.__earth.pointer = pointer;
  window.__earth.raycaster = raycaster;

  const tooltip = createTooltip();
  let pointerPx = { x: -100, y: -100 };
  renderer.domElement.addEventListener("pointermove", (e) => { pointerPx = { x: e.clientX, y: e.clientY }; });

  const clockWeather = createClockWeather({
    onForecast: (code, days) => window.__earth.sidePanel?.setForecast(code, days),
  });
  window.__earth.clockWeather = clockWeather;
  window.__earth.twClock = createTwClock();

  const music = createMusic();
  window.__earth.music = music;

  // 當地廣播:地球上的電台字卡(radio)+ 依洲別挑台的「📻 電台選台」面板(radioPanel)。
  // 從哪邊播放,另一邊都會同步標示正在播的台。關掉面板 = 關掉廣播圖層(正在播的台照樣繼續)。
  let radioPanel = null;
  const radio = createRadioLayer({
    globeObject: globe.object, camera, renderer, music,
    onChange: () => radioPanel && radioPanel.refresh(),
  });
  window.__earth.radio = radio;
  const radioToggle = document.getElementById("radio-toggle");
  function setRadio(on) {
    if (radioToggle) radioToggle.setAttribute("aria-pressed", String(on));
    radio.setEnabled(on);
    radioPanel.setOpen(on);
  }
  radioPanel = createRadioPanel({ radio, rig, onClose: () => setRadio(false) });
  if (radioToggle) radioToggle.addEventListener("click", () => {
    setRadio(radioToggle.getAttribute("aria-pressed") !== "true");
  });

  const satellite = createSatellitePanel({ globeObject: globe.object });
  window.__earth.satellite = satellite;
  const satelliteToggle = document.getElementById("satellite-toggle");
  if (satelliteToggle) satelliteToggle.addEventListener("click", () => {
    const next = satelliteToggle.getAttribute("aria-pressed") !== "true";
    satelliteToggle.setAttribute("aria-pressed", String(next));
    satellite.setEnabled(next);
  });

  const flights = createFlightsLayer({ globeObject: globe.object, camera, renderer, naturePopup });
  window.__earth.flights = flights;
  const airportBoard = createAirportBoard();
  window.__earth.airportBoard = airportBoard;

  // 「世界機場航班」(ADS-B 即時追蹤)+「台灣機場航班」(TDX 時刻表)合併成
  // 一個「機場航班資訊」群組,點群組列展開/收合子選項;群組列自己的圓點
  // 反映「這兩個子功能有沒有任一個開著」,不是它自己的開關狀態。
  const flightToggle = document.getElementById("flight-toggle");
  if (flightToggle) flightToggle.addEventListener("click", () => {
    const next = flightToggle.getAttribute("aria-pressed") !== "true";
    flightToggle.setAttribute("aria-pressed", String(next));
    flights.setEnabled(next);
  });

  const airportToggle = document.getElementById("airport-toggle");
  if (airportToggle) airportToggle.addEventListener("click", () => {
    const next = airportToggle.getAttribute("aria-pressed") !== "true";
    airportToggle.setAttribute("aria-pressed", String(next));
    airportBoard.setEnabled(next);
  });

  // 台灣即時路況:開啟時飛到台灣、允許拉近到看得清楚一條條國道,並停住地球自轉
  // (不然看路況看到一半台灣慢慢轉走);關閉時恢復原本的縮放下限與自轉。
  // 資料與地球上的國道線在 traffic(scene),路況中心視窗(地圖/排行/監視器)在 trafficCenter(ui)
  const trafficToggle = document.getElementById("traffic-toggle");
  let trafficCenter = null;
  const traffic = createTrafficLayer({
    globeObject: globe.object, camera, renderer, naturePopup, rig,
    onData: (d) => trafficCenter && trafficCenter.onData(d),
  });
  trafficCenter = createTrafficCenter({ traffic, onClose: () => setTraffic(false) });
  window.__earth.traffic = traffic;
  function setTraffic(on) {
    if (trafficToggle) trafficToggle.setAttribute("aria-pressed", String(on));
    traffic.setEnabled(on);
    trafficCenter.setOpen(on);
    rig.setMinDistance(on ? TRAFFIC_MIN_DISTANCE : DEFAULT_MIN_DISTANCE);
    const keepPaused = on || !!window.__earth.sidePanel?.isOpen();
    window.__earth.globe?.setSpinPaused(keepPaused);
    window.__earth.clouds?.setSpinPaused(keepPaused);
    // 手機直向畫面上下被搜尋欄和路況面板佔掉,拉遠一點讓整個台灣放得進中間的空間
    if (on) rig.flyTo(23.6, 120.95, { distance: window.innerWidth < 640 ? 1.5 : 1.3, ms: 1200 });
    // 關閉時拉回全景距離(停在台灣這一面),不然會一直卡在放大的地球上
    else if (!window.__earth.sidePanel?.isOpen()) rig.resetView({ keepDirection: true });
  }
  if (trafficToggle) trafficToggle.addEventListener("click", () => {
    setTraffic(trafficToggle.getAttribute("aria-pressed") !== "true");
  });

  // 🚄 高鐵時刻 / 🚆 台鐵時刻:同一個「鐵路時刻」面板的兩個分頁。點其中一列打開面板並切到
  // 那一頁;在開著的那一頁再點一次就關閉。選單兩列的亮燈狀態跟著面板目前的分頁走。
  const thsrToggle = document.getElementById("thsr-toggle");
  const traToggle = document.getElementById("tra-toggle");
  const railPanel = createRailPanel({
    onClose: () => railPanel.close(),
    onModeChange: (m) => {
      thsrToggle?.setAttribute("aria-pressed", String(m === "thsr"));
      traToggle?.setAttribute("aria-pressed", String(m === "tra"));
    },
  });
  for (const [btn, m] of [[thsrToggle, "thsr"], [traToggle, "tra"]]) {
    if (btn) btn.addEventListener("click", () => {
      if (railPanel.isOpen() && railPanel.mode() === m) railPanel.close();
      else railPanel.open(m);
    });
  }

  // 右下角「台灣交通」「功能」兩張卡片各自可以收合——記住使用者上次收合/展開的
  // 狀態,下次開網站維持一樣,不用每次都重新收一次。
  function setupCollapsible(toggleId, bodyId, storageKey) {
    const toggle = document.getElementById(toggleId);
    const body = document.getElementById(bodyId);
    if (!toggle || !body) return;
    let collapsed = false;
    try { collapsed = localStorage.getItem(storageKey) === "1"; } catch {}
    toggle.setAttribute("aria-expanded", String(!collapsed));
    body.hidden = collapsed;
    toggle.addEventListener("click", () => {
      const willExpand = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(willExpand));
      body.hidden = !willExpand;
      try { localStorage.setItem(storageKey, willExpand ? "0" : "1"); } catch {}
    });
  }
  setupCollapsible("lc-collapse-toggle", "lc-body", "earth-world.lc-collapsed");
  setupCollapsible("twc-collapse-toggle", "twc-body", "earth-world.twc-collapsed");

  const audioToggle = document.getElementById("audio-toggle");
  const audioVol = document.getElementById("audio-vol");
  audioToggle.addEventListener("click", () => {
    // 電台播放中就切電台的靜音,不然切背景音樂會讓人以為按鈕壞了
    const m = radio.isPlaying() ? radio.toggleMute() : music.toggleMute();
    audioToggle.textContent = m ? "🔇" : "🔊";
  });
  audioVol.addEventListener("input", () => {
    const v = audioVol.value / 100;
    music.setVolume(v);
    if (radio.isPlaying()) radio.setVolume(v);
  });

  const audioTrack = document.getElementById("audio-track");
  if (audioTrack) {
    audioTrack.innerHTML = music.tracks
      .map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    audioTrack.value = music.currentTrackId();
    audioTrack.title = music.tracks.find((t) => t.id === audioTrack.value)?.credit || "";
    audioTrack.addEventListener("change", () => {
      const tr = music.setTrack(audioTrack.value);
      if (tr) audioTrack.title = tr.credit;
    });
  }

  const encyclopedia = createEncyclopedia();
  window.__earth.encyclopedia = encyclopedia;

  const sidePanel = createSidePanel({
    onClose: () => {
      rig.resetView();
      clockWeather.clear();
      if (window.__earth.countryLayer) window.__earth.countryLayer.setSelected(null);
      // 路況開著的話地球要繼續停住,不然台灣會轉走
      const keepPaused = !!window.__earth.traffic?.isEnabled();
      if (window.__earth.globe) window.__earth.globe.setSpinPaused(keepPaused);
      if (window.__earth.clouds) window.__earth.clouds.setSpinPaused(keepPaused);
    },
    onMore: (code) => encyclopedia.open(code),
  });
  window.__earth.sidePanel = sidePanel;

  // 開啟一個國家:滑鼠點擊與搜尋欄共用。hit = { code, names, centroidLatLon, pop }
  function openCountry(hit) {
    const c = (window.__earth.content || {})[hit.code];
    const [lon, lat] = hit.centroidLatLon;
    // 有些條目(南極洲、法屬南部領地)有內容但沒有首都座標與聚落 → 飛到國家質心、不顯示天氣
    const cll = c && Array.isArray(c.capital_latlon) ? c.capital_latlon : null;
    const noSettlement = !!c && !cll;
    const anchor = cll || [lat, lon];
    rig.flyTo(anchor[0], anchor[1], { distance: 1.7, ms: 1000 });
    sidePanel.open({
      code: hit.code,
      names: hit.names,
      capital: c && c.capital_zh ? { zh: c.capital_zh, en: c.capital_en } : null,
      timezone: c ? c.timezone : null,
      latlon: cll || [lat, lon],
      population: c && c.population != null ? c.population : hit.pop,
      showForecast: !noSettlement,
      features: c ? c.features : [],
      food: c ? c.food : null,
      travel: c ? c.travel_months : null,
      history: c ? c.history : [],
      travelAlert: (window.__earth.travelAlert || {})[hit.code] || null,
      hasDeep: !!c,
      region: !!(c && c.region),
    });
    clockWeather.setCountry({
      code: hit.code,
      name_zh: hit.names.zh,
      timezone: c ? c.timezone : null,
      latlon: noSettlement ? null : (cll || [lat, lon]),
    });
    window.__earth.countryLayer.setSelected(hit.code);
  }
  window.__earth.openCountry = openCountry;

  function openCountryByCode(code) {
    const cl = window.__earth.countryLayer;
    const wrap = cl && cl.meshByCode.get(code);
    if (!wrap) return;
    const u = wrap.userData;
    openCountry({ code, names: u.names, centroidLatLon: u.centroidLatLon, pop: u.feature?.properties?.POP_EST ?? null });
  }

  let downPos = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downPos = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6) return;                 // 拖曳,不算點擊
    const cl = window.__earth.countryLayer;
    if (!cl) return;
    // 觸控單純點一下常常不會先觸發 pointermove(手指沒有位移),共用的 pointer
    // 座標會停在上一次的舊值(甚至是初始的畫面外 -2,-2),點擊判定跟著點錯位置。
    // 直接用這次 pointerup 事件自己的座標算,不依賴可能沒更新的共用狀態。
    // 路況開著:先看有沒有點到國道路段
    if (traffic.isEnabled() && traffic.pickAt(e.clientX, e.clientY)) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = cl.pick(raycaster, globe.mesh);
    if (!hit) return;
    // 看路況時點在台灣陸地上但沒點中國道(差幾個像素很常見),不要跳出台灣側欄、
    // 把相機拉遠——想看台灣介紹可以點台灣的金色地名
    if (traffic.isEnabled() && hit.code === "TW") return;
    openCountry(hit);
  });

  function syncSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", syncSize);
  // 手機瀏覽器的網址列收合/展開、或從別的頁面切回來,有時候 resize 事件觸發時
  // window.innerWidth/Height 讀到的還是過渡中的中間值,canvas 尺寸因此卡住不對、
  // 畫面側邊露出背景色看起來像被裁切。晚一點點再補算一次修正這種情況。
  window.addEventListener("resize", () => setTimeout(syncSize, 300));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(syncSize, 100); });

  // 逐幀對 177 個國家的三角化 mesh 做 raycast 實測平均 ~2.6ms、尖峰可到 30ms+
  // (見 commit 說明),在高更新率螢幕上等於每秒白白燒好幾十次。hover 判定不需要
  // 60Hz 這麼即時,節流成最多每 ~50ms 判一次,期間沿用上一次結果,手感沒有差別。
  const PICK_INTERVAL_MS = 50;
  let hovered = null;
  let hitGlobe = false;
  let lastPickAt = 0;

  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    starfield.update(clock.getElapsedTime());
    globe.update(dt);
    clouds.update(dt);

    const now = performance.now();
    if (now - lastPickAt >= PICK_INTERVAL_MS) {
      lastPickAt = now;
      raycaster.setFromCamera(pointer, camera);
      hovered = window.__earth.countryLayer ? window.__earth.countryLayer.pick(raycaster, globe.mesh) : null;
      hitGlobe = !!hovered || raycaster.intersectObject(globe.mesh, false).length > 0;
      if (window.__earth.countryLayer) window.__earth.countryLayer.setHover(hovered ? hovered.code : null);
      if (hovered) tooltip.show(pointerPx.x, pointerPx.y, hovered.names);
      else tooltip.hide();
    }
    if (window.__earth.countryLayer) window.__earth.countryLayer.update(dt);

    if (hitGlobe) {
      globe.setSpinPaused(true);
      clouds.setSpinPaused(true);
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
    } else if (!resumeTimer && !(window.__earth.countryLayer && window.__earth.countryLayer.hasSelection && window.__earth.countryLayer.hasSelection())) {
      resumeTimer = setTimeout(() => { globe.setSpinPaused(false); clouds.setSpinPaused(false); resumeTimer = null; }, 1500);
    }
    rig.update(dt);

    oceanLabels.update();
    physicalLabels.update();
    earthquakes.update();
    radio.update();
    flights.update();
    traffic.update();
    if (window.__earth.countryLabels) window.__earth.countryLabels.update();

    composer.render();
    requestAnimationFrame(loop);
  }
  loop();
}
