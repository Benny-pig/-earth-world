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
import { createSatelliteLayer } from "./scene/satellites.js";
import { createLaunchLayer } from "./scene/launches.js";
import { createOnThisDay } from "./ui/on-this-day.js";
import { createQuiz } from "./ui/quiz.js";
import { createPassport } from "./ui/passport.js";
import { createFlightSim } from "./scene/flight-sim.js";
import { createLiveCams } from "./scene/livecams.js";
import { shouldPlayIntro, createIntro } from "./ui/intro.js";
import { LITE } from "./lib/device.js";
import { drag } from "./lib/label-style.js";
import { createRoPlayer } from "./ui/ro-player.js";
import { createWeatherLayer } from "./scene/weather.js";
import { createCompare } from "./ui/compare.js";
import { createMoon } from "./scene/moon.js";
import { createEvLayer } from "./scene/ev.js";
import { createAurora } from "./scene/aurora.js";
import { createMeteors } from "./scene/meteors.js";
import { createCinema } from "./scene/cinema.js";
import { createFavorites } from "./ui/favorites.js";
import { createHomeCompass } from "./ui/home-compass.js";
import { setupFontSize } from "./ui/font-size.js";
import { createSettings } from "./ui/settings.js";
import { createRecent } from "./ui/recent.js";
import { createConstellations } from "./scene/constellations.js";
import { createSunInfo } from "./scene/sun-info.js";
import { createPlanets } from "./scene/planets.js";
import { createTyphoons } from "./scene/typhoons.js";
import { createHazards } from "./scene/hazards.js";
import { createPlates } from "./scene/plates.js";
import { createFeatureMenu } from "./ui/feature-menu.js";
import { createWind } from "./scene/wind.js";
import { createDataGlobe } from "./scene/data-globe.js";
import { createTravelHelper } from "./ui/travel-helper.js";
import { createToday } from "./ui/today.js";
import { createSurprise } from "./ui/surprise.js";
import { createPanelManager } from "./ui/panel-manager.js";
import { createAlerts } from "./ui/alerts.js";
import { createPov } from "./scene/pov.js";
import { createBirthday } from "./ui/birthday.js";
import { createTempRank } from "./ui/temp-rank.js";
import { createAsteroids } from "./ui/asteroids.js";
import { createEarthLayers } from "./scene/earth-layers.js";
import { createTimeMachine } from "./ui/time-machine.js";
import { createViewOffset } from "./lib/view-offset.js";
import { latLonToXYZ } from "./lib/geo.js";
import { createTour } from "./ui/tour.js";
import { setupI18n, isEn } from "./lib/i18n.js";
import { createVoice } from "./audio/voice.js";
import { createShare } from "./ui/share.js";
import { setupPwa } from "./ui/pwa.js";
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
const EV_MIN_DISTANCE = 1.05;        // 充電站開著時可以再近一點(離地約 320 公里),看得出一站站的位置

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
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

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
    resolveDone();
    window.__earthReady = true;
    window.dispatchEvent(new Event("earth-ready"));   // 之後才下載的東西(4K 貼圖…)可以開始了
  }
  function maybeFinish() { if (texDone && dataLoaded >= DATA_TOTAL) finish(); }

  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => { texLoaded = loaded; texTotal = total; paint(); };
  THREE.DefaultLoadingManager.onLoad = () => { texDone = true; texLoaded = texTotal; paint(); maybeFinish(); };
  THREE.DefaultLoadingManager.onError = (url) => console.warn("[loading] 資源載入失敗:", url);
  const failsafe = setTimeout(finish, 15000);   // 永遠不把使用者困在遮罩後面
  paint();

  return {
    bumpData() { dataLoaded++; paint(); maybeFinish(); },
    done,
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
  // 用分享連結打開(網址帶參數)的讀者是來看分享的畫面,不自動跳新手導覽(參數等一下會被清掉,先記下來)
  const openedWithParams = [...new URLSearchParams(location.search).keys()].some((k) => k !== "intro" && k !== "nointro");
  // 🎂 生日天空的分享連結(?bday=YYYY-MM-DD&bt=21):分享參數等一下會被清掉,先記下來
  const bdayParam = new URLSearchParams(location.search).get("bday");
  const bdayHour = Number(new URLSearchParams(location.search).get("bt") || 21);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500);
  // 一打開就看到台灣(地球固定在真實方向,台灣在經度 121°)
  {
    const h = latLonToXYZ(23.7, 121, fitDistanceForAspect(window.innerWidth / window.innerHeight));
    camera.position.set(h.x, h.y, h.z);
  }

  const starfield = createStarfield();
  loading.done.then(() => starfield.loadBackground());   // 地球出現後才下載銀河背景
  scene.add(starfield.object);

  const globe = createGlobe({ onAllTexturesFailed: () => showError("地球貼圖載入失敗,已改用純色地球。") });
  scene.add(globe.object);
  scene.add(globe.lightRig);

  // 非同步載入 Natural Earth 50m 國界(由 tools/build-countries-geo.py 產生),掛在地球 group 上跟著自轉
  const tap = (p) => p.finally(() => loading.bumpData());
  const dataReady = Promise.all([
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
      window.__earth.travelAlertDoc = travelAlert;
      const borders = buildBorders(geojson);
      globe.object.add(borders);
      window.__earth.borders = borders;
      // 台灣海岸線用醒目的金色粗線,一眼就能在地球上找到
      const twOutline = buildOutline(geojson, "TW");
      if (twOutline) globe.object.add(twOutline);
      window.__earth.twOutline = twOutline;
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
      window.__earth.countrySearch = createCountrySearch({
        index: searchIndex, onPick: openCountryByCode, content, favorites, recent,
        onFav: (it) => goFavorite(it),
        // 星座 + 五大行星都算「天上」這一組
        sky: () => [...planets.searchItems().map((p) => ({ ...p, alias: p.en, icon: "🪐" })), ...constellations.searchItems()],
        onSky: (id) => {
          if (planets.searchItems().some((p) => p.id === id)) { setPlanets(true); planets.focus(id); return; }
          constellations.focus(id);
          document.getElementById("constellation-toggle")?.setAttribute("aria-pressed", "true");
        },
        onCam: (id) => openCamById(id),
        onGeo: (f) => {
          rig.flyTo(f.lat, f.lon, { distance: 1.8, ms: 1200 });
          setTimeout(() => naturePopup.show({ icon: "⛰️", zh: f.zh, en: f.en, note: f.note }, window.innerWidth / 2, window.innerHeight / 2 - 60), 1250);
        },
      });
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
  starfield.setPixelRatio(renderer.getPixelRatio());   // 星點大小跟實際畫面解析度一致
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
  // 手機/平板:螢幕像素密度高,鋸齒本來就不明顯,省下 SMAA 三道全畫面處理,操作更順
  if (!LITE) {
    const smaaPass = new SMAAPass(
      window.innerWidth * renderer.getPixelRatio(),
      window.innerHeight * renderer.getPixelRatio()
    );
    composer.addPass(smaaPass);
  }
  composer.addPass(new OutputPass());

  window.__earth = { scene, camera, renderer };
  // 面板打開時地球移到沒被擋住的地方(每幀在畫面輸出前更新)
  const viewOffset = createViewOffset({ camera });
  window.__earth.globe = globe;
  window.__earth.clouds = clouds;
  window.__earth.composer = composer;

  const rig = createCameraRig({ camera, domElement: renderer.domElement, globeObject: globe.object });
  window.__earth.rig = rig;

  // 🎬 開場運鏡(每天第一次打開):鏡頭先擺到遠方,載入畫面結束後飛向台灣;播放時其他介面先藏起來
  const intro = shouldPlayIntro() ? createIntro({ camera, rig, globeObject: globe.object, renderer }) : null;
  window.__earth.intro = intro;
  if (intro) {
    intro.prepare();
    document.body.classList.add("intro-playing");
    loading.done.then(() => {
      intro.play();
      // 標題淡出時介面跟著淡入
      const showUi = () => {
        document.body.classList.add("intro-fade");
        document.body.classList.remove("intro-playing");
        setTimeout(() => document.body.classList.remove("intro-fade"), 1000);
      };
      const timer = setTimeout(showUi, 3300);
      document.addEventListener("pointerdown", () => { clearTimeout(timer); showUi(); }, { once: true });
      window.addEventListener("keydown", () => { clearTimeout(timer); showUi(); }, { once: true });
    });
  }

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
  // 🔔 重要事件提醒(台灣附近地震、大地震、颱風接近、流星雨極大期):要在地震圖層之前建好,第一筆地震資料才收得到
  const alerts = createAlerts({
    rig,
    codeAt: (la, lo) => window.__earth.countryLayer?.codeAt(la, lo),
    nameOf: (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c,
    turnOn: (id) => { const b = document.getElementById(id); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); },
  });
  window.__earth.alerts = alerts;
  const earthquakes = createEarthquakesLayer({
    globeObject: globe.object, camera, renderer, naturePopup,
    onSevereChange: (v) => { quakeSevere = v; syncQuakeSevereBadge(); },
    onStrong: (list) => announceQuakes(list),
    onData: (features) => alerts.onQuakes(features),
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

  // 拖曳模式:按住地球移動超過 6px 就算在轉地球——國名只畫最大的 40 國、地形小字先藏、
  // 滑過偵測(哪一國、天氣)先停;放開 0.3 秒後恢復。轉動時每格要處理的東西少很多,手感比較跟手
  let dragDown = null, dragEndTimer = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { dragDown = { x: e.clientX, y: e.clientY }; clearTimeout(dragEndTimer); });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragDown || drag.active || Math.hypot(e.clientX - dragDown.x, e.clientY - dragDown.y) <= 6) return;
    drag.active = true;
    tooltip.hide();
  });
  const endDrag = () => {
    dragDown = null;
    if (drag.active) dragEndTimer = setTimeout(() => { drag.active = false; }, 300);
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  const clockWeather = createClockWeather({
    onForecast: (code, days) => window.__earth.sidePanel?.setForecast(code, days),
  });
  window.__earth.clockWeather = clockWeather;
  window.__earth.twClock = createTwClock();

  const music = createMusic();

  // 🕘 最近看過的國家(搜尋框打開時列在最上面)
  const recent = createRecent();
  // 🔤 字體大小(右上角 Aa)
  const fontSize = setupFontSize({
    toast: (msg) => {
      let el = document.getElementById("share-toast");
      if (!el) { el = document.createElement("div"); el.id = "share-toast"; document.body.appendChild(el); }
      el.textContent = msg; el.classList.add("show");
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1600);
    },
  });
  // ⚙️ 右上角的設定選單:字體、主題、語言、導覽、安裝 App
  createSettings({ fontSize });
  // 🧭 指北針 + 🏠 回到台灣
  const homeCompass = createHomeCompass({ camera, rig });

  // 🗣️ 人聲播報(功能 → 聲音)
  const voiceToggle = document.getElementById("voice-toggle");
  const voice = createVoice({ music, onClose: () => voice.setPanel(false) });
  // 🎲 驚喜一下(左下角指北針上面):隨機飛到一個國家或自然景觀
  createSurprise({ rig, getContent: () => window.__earth.content, openCountryByCode, voice,
    nameOf: (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c });
  window.__earth.voice = voice;
  const paintVoice = () => voiceToggle?.setAttribute("aria-pressed", String(voice.isOn()));
  voice.onChange(paintVoice);
  paintVoice();
  // 第一次按:開啟播報並打開設定;播報開著時按:打開設定;設定開著時再按:關閉播報
  voiceToggle?.addEventListener("click", () => {
    if (!voice.isOn()) { voice.setOn(true); voice.setPanel(true); }
    else if (!voice.isPanelOpen()) voice.setPanel(true);
    else { voice.setOn(false); voice.setPanel(false); }
  });
  // 地震快報:網站開著時新出現的規模 6 以上地震(剛打開網站時只報最近 1 小時內的)
  const quakeAnnounced = new Set();
  const openedAt = Date.now();
  function announceQuakes(list) {
    for (const q of list) {
      if (quakeAnnounced.has(q.id)) continue;
      quakeAnnounced.add(q.id);
      if (q.time < openedAt - 60 * 60 * 1000) continue;
      const nearTw = /台灣|臺灣|Taiwan/i.test(`${q.zh || ""} ${q.place || ""}`);
      voice.speak(isEn ? `Quick heads-up: a magnitude ${q.mag.toFixed(1)} earthquake just struck ${q.place}.`
        : nearTw ? `注意喔,台灣附近剛剛發生規模 ${q.mag.toFixed(1)} 的地震,大家要注意安全。`
        : `插播一則地震消息,剛剛在${q.zh || "國外"}發生規模 ${q.mag.toFixed(1)} 的地震。`, { kind: "quake", interrupt: false });
    }
  }
  // 國家介紹的播報文字
  // 人口講成口語:1億2400萬、2350萬、38萬(語音會唸成「一億兩千四百萬」,不會唸成「一點二億」)
  const popSpeech = (n) => {
    if (n >= 1e8) { const yi = Math.floor(n / 1e8), wan = Math.round((n % 1e8) / 1e6) * 100; return wan ? `${yi}億${wan}萬` : `${yi}億`; }
    if (n >= 1e5) return `${Math.round(n / 1e4)}萬`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}萬`;
    return `${Math.round(n / 100) * 100}`;
  };
  // 當地現在幾點(用說的):晚上8點、清晨6點
  function localTimeSpeech(tz) {
    try {
      const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
      const part = h < 5 ? "凌晨" : h < 8 ? "清晨" : h < 11 ? "早上" : h < 13 ? "中午" : h < 17 ? "下午" : h < 19 ? "傍晚" : "晚上";
      return `${part}${h % 12 || 12}點`;
    } catch { return null; }
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let countrySpeech = "";
  // 像導遊帶路一樣介紹:開場白、首都與人口、那邊現在幾點、再分享一個小知識(每次開場白會變)
  function countryNarration(hit, c, pop) {
    const zh = hit.names.zh;
    if (isEn) return `${pick(["Welcome to", "Here we are in", "Let's take a look at"])} ${hit.names.en}!${c?.capital_en ? ` The capital is ${c.capital_en}.` : ""}`;
    if (zh === "臺灣" || zh === "台灣") return "歡迎回到台灣,我們的家!" + (c?.features?.[0] ? `跟你分享:${c.features[0]}` : "");
    let t = pick([`歡迎來到${zh}!`, `我們來到${zh}囉。`, `這裡是${zh}!`, `一起來看看${zh}吧。`]);
    if (c?.capital_zh && Number(pop) > 0) t += `首都是${c.capital_zh},大約住了${popSpeech(Number(pop))}人。`;
    else if (c?.capital_zh) t += `首都是${c.capital_zh}。`;
    else if (Number(pop) > 0) t += `這裡大約住了${popSpeech(Number(pop))}人。`;
    const now = c?.timezone ? localTimeSpeech(c.timezone) : null;
    const twNow = localTimeSpeech("Asia/Taipei");
    if (now) t += now === twNow ? `那邊跟台灣一樣,現在是${now}。` : `那邊現在是${now}。`;
    if (Array.isArray(c?.features) && c.features[0]) t += pick(["跟你分享一個小知識:", "你知道嗎?", "有個有趣的地方是,"]) + String(c.features[0]);
    return t;
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-read-country]") && countrySpeech) voice.speak(countrySpeech, { force: true }); });
  window.__earth.music = music;

  // 當地廣播:地球上的電台字卡(radio)+ 依洲別挑台的「📻 電台選台」面板(radioPanel)。
  // 從哪邊播放,另一邊都會同步標示正在播的台。關掉面板 = 關掉廣播圖層(正在播的台照樣繼續)。
  let radioPanel = null;
  const radio = createRadioLayer({
    globeObject: globe.object, camera, renderer, music,
    onChange: () => { if (radioPanel) radioPanel.refresh(); paintRadioFav(); },
    contentReady: dataReady,
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

  // 🛰️ 衛星與太空站(功能卡片的一列):地球外圈的衛星 + 太空站標籤/軌跡 + 飛過台灣時間面板
  const orbitToggle = document.getElementById("orbit-toggle");
  const orbits = createSatelliteLayer({
    globeObject: globe.object, camera, renderer, rig, naturePopup,
    onClose: () => setOrbits(false),
  });
  window.__earth.orbits = orbits;
  function setOrbits(on) {
    if (orbitToggle) orbitToggle.setAttribute("aria-pressed", String(on));
    orbits.setEnabled(on);
  }
  if (orbitToggle) orbitToggle.addEventListener("click", () => setOrbits(orbitToggle.getAttribute("aria-pressed") !== "true"));

  // 🚀 太空發射日曆(功能卡片的一列):地球上的發射場 🚀 + 未來 30 天發射清單與倒數
  const launchToggle = document.getElementById("launch-toggle");
  const launches = createLaunchLayer({
    globeObject: globe.object, camera, renderer, rig, naturePopup,
    onClose: () => setLaunches(false),
  });
  window.__earth.launches = launches;
  function setLaunches(on) {
    if (launchToggle) launchToggle.setAttribute("aria-pressed", String(on));
    launches.setEnabled(on);
  }
  if (launchToggle) launchToggle.addEventListener("click", () => setLaunches(launchToggle.getAttribute("aria-pressed") !== "true"));

  // 📅 歷史上的今天(功能卡片的一列):今天這個日期歷年發生的大事,點一則飛到事發地點,也能自動導覽
  const otdToggle = document.getElementById("otd-toggle");
  const otd = createOnThisDay({ rig, onClose: () => setOtd(false) });
  function setOtd(on) {
    if (otdToggle) otdToggle.setAttribute("aria-pressed", String(on));
    otd.setEnabled(on);
  }
  if (otdToggle) otdToggle.addEventListener("click", () => setOtd(otdToggle.getAttribute("aria-pressed") !== "true"));

  // 🌗 真實晨昏線現在常駐(globe.js 預設就是真實方向),選單不再有開關
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
    rig.setMinDistance(window.__earth.ev?.isEnabled() ? EV_MIN_DISTANCE : on ? TRAFFIC_MIN_DISTANCE : DEFAULT_MIN_DISTANCE);
    const keepPaused = on || !!window.__earth.sidePanel?.isOpen() || !!window.__earth.ev?.isEnabled();
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
  // 功能卡的四個分頁(即時世界/太空天象/探索遊戲/聲音)
  window.__earth.featureMenu = createFeatureMenu();
  // 手機畫面小:從選單開/關功能後,自動收起「台灣交通」「功能」兩張卡片,不要擋住地球
  // (功能列自己的點擊先處理,這裡是冒泡上來才收;想再選就點卡片標題展開)
  document.getElementById("ctrl-dock")?.addEventListener("click", (e) => {
    if (window.innerWidth > 640 || !e.target.closest(".layer-row")) return;
    for (const id of ["twc-collapse-toggle", "lc-collapse-toggle"]) {
      const t = document.getElementById(id);
      if (t && t.getAttribute("aria-expanded") === "true") t.click();
    }
  });

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

  // 👋 新手導覽:第一次來的讀者,等載入畫面與開場運鏡結束後自動開始;右上角「❓」可重看
  setupI18n();   // 🌐 EN / 中 切換;英文模式時把介面文字換成英文
  const tour = createTour();
  window.__earth.tour = tour;
  if (!openedWithParams) {
    loading.done.then(() => {
      const wait = () => (intro && intro.isActive() ? setTimeout(wait, 400) : setTimeout(() => tour.maybeStart(), 800));
      wait();
    });
  }

  // ⚡ 全台電動車充電站(台灣交通卡片):跟路況一樣,打開時飛到台灣、允許拉近、停住自轉
  const evToggle = document.getElementById("ev-toggle");
  const ev = createEvLayer({ globeObject: globe.object, rig, onClose: () => setEv(false) });
  window.__earth.ev = ev;
  function setEv(on) {
    if (evToggle) evToggle.setAttribute("aria-pressed", String(on));
    ev.setEnabled(on);
    rig.setMinDistance(on ? EV_MIN_DISTANCE : traffic.isEnabled() ? TRAFFIC_MIN_DISTANCE : DEFAULT_MIN_DISTANCE);
    const keepPaused = on || traffic.isEnabled() || !!window.__earth.sidePanel?.isOpen();
    globe.setSpinPaused(keepPaused);
    clouds.setSpinPaused(keepPaused);
    if (on) rig.flyTo(23.6, 120.95, { distance: window.innerWidth < 640 ? 1.5 : 1.3, ms: 1200 });
    else if (!traffic.isEnabled() && !window.__earth.sidePanel?.isOpen()) rig.resetView({ keepDirection: true });
  }
  if (evToggle) evToggle.addEventListener("click", () => setEv(evToggle.getAttribute("aria-pressed") !== "true"));

  // 🌙 月亮(一直都在地球旁邊;選單「月亮與月相」或點月亮打開月相面板)
  const moonToggle = document.getElementById("moon-toggle");
  const moon = createMoon({ parent: globe.lightRig, camera, renderer, onClose: () => setMoon(false) });
  window.__earth.moon = moon;
  function setMoon(on) {
    if (moonToggle) moonToggle.setAttribute("aria-pressed", String(on));
    moon.setEnabled(on);
  }
  moon.onOpen(() => setMoon(true));
  if (moonToggle) moonToggle.addEventListener("click", () => setMoon(moonToggle.getAttribute("aria-pressed") !== "true"));

  // ⚖️ 國家比較
  const compareToggle = document.getElementById("compare-toggle");
  const compare = createCompare({ openCountryByCode, onClose: () => setCompare(false) });
  window.__earth.compare = compare;
  function setCompare(on) {
    if (compareToggle) compareToggle.setAttribute("aria-pressed", String(on));
    compare.setEnabled(on);
  }
  if (compareToggle) compareToggle.addEventListener("click", () => setCompare(compareToggle.getAttribute("aria-pressed") !== "true"));

  // 🌡️ 全球即時氣溫與降雨
  const weatherToggle = document.getElementById("weather-toggle");
  const weather = createWeatherLayer({ globeObject: globe.object, clouds, onClose: () => setWeather(false) });
  window.__earth.weather = weather;
  function setWeather(on) {
    if (weatherToggle) weatherToggle.setAttribute("aria-pressed", String(on));
    weather.setEnabled(on);
  }
  if (weatherToggle) weatherToggle.addEventListener("click", () => setWeather(weatherToggle.getAttribute("aria-pressed") !== "true"));

  // 🎵 RO 懷舊原聲(下方音樂列的「🎵 RO」按鈕)
  window.__earth.roPlayer = createRoPlayer({ music });

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
    // 旅行護照在後面才建立,這裡用延遲取用
    visited: { has: (c) => passport.has(c), canStamp: (c) => passport.canStamp(c), toggle: (c) => passport.toggle(c) },
    favStar: (code) => favorites.starButton("country", code, "sp-share"),
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
    recent.add(hit.code);
    countrySpeech = countryNarration(hit, c, c && c.population != null ? c.population : hit.pop);
    voice.speak(countrySpeech, { kind: "country" });
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

  // 🎯 地理猜謎遊戲(功能卡片的一列);要用到 sidePanel,所以放在它建立之後
  const quizToggle = document.getElementById("quiz-toggle");
  const quiz = createQuiz({ rig, sidePanel, onClose: () => setQuiz(false) });
  function setQuiz(on) {
    if (quizToggle) quizToggle.setAttribute("aria-pressed", String(on));
    quiz.setEnabled(on);
  }
  if (quizToggle) quizToggle.addEventListener("click", () => setQuiz(quizToggle.getAttribute("aria-pressed") !== "true"));

  // 🛂 旅行護照集章:讀者自己標記去過的國家(側欄「我去過這裡」、護照清單、點地球蓋章模式)
  const passportToggle = document.getElementById("passport-toggle");
  const passport = createPassport({ globeObject: globe.object, openCountryByCode, onClose: () => setPassport(false) });
  function setPassport(on) {
    if (passportToggle) passportToggle.setAttribute("aria-pressed", String(on));
    passport.setEnabled(on);
  }
  if (passportToggle) passportToggle.addEventListener("click", () => setPassport(passportToggle.getAttribute("aria-pressed") !== "true"));
  passport.onChange(() => sidePanel.refreshVisit());
  // ✈️ 飛行旅程模擬
  const flightSimToggle = document.getElementById("flightsim-toggle");
  const flightSim = createFlightSim({ globeObject: globe.object, camera, renderer, rig, openCountryByCode, onClose: () => setFlightSim(false),
    onAnnounce: (text) => voice.speak(text, { kind: "flight" }) });
  window.__earth.flightSim = flightSim;
  function setFlightSim(on) {
    if (flightSimToggle) flightSimToggle.setAttribute("aria-pressed", String(on));
    flightSim.setEnabled(on);
  }
  if (flightSimToggle) flightSimToggle.addEventListener("click", () => setFlightSim(flightSimToggle.getAttribute("aria-pressed") !== "true"));

  // ⭐ 我的收藏
  const layerLabel = (b) => {
    const c = b.cloneNode(true);
    c.querySelectorAll(".layer-badge, .layer-icon, .layer-dot").forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, " ").trim();
  };
  function describeView() {
    const url = new URL(share.buildUrl());
    const code = encyclopedia.code() || sidePanel.code();
    const nameOf = (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c;
    let place;
    if (code) place = nameOf(code);
    else {
      const d = camera.position.clone().normalize().applyQuaternion(globe.object.quaternion.clone().invert());
      const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI, lon = Math.atan2(-d.z, d.x) * 180 / Math.PI;
      const c = window.__earth.countryLayer?.codeAt(lat, lon);
      place = c ? `${nameOf(c)}上空` : "海洋上空";
    }
    const on = [...document.querySelectorAll('#ctrl-dock .layer-row[aria-pressed="true"]')].filter((b) => b.id !== "quake-toggle").map(layerLabel).slice(0, 3);
    return { qs: url.search.slice(1), name: place + (on.length ? ` · ${on.join("、")}` : "") };
  }
  function goFavorite(it) {
    favorites.setOpen(false);
    if (it.type === "country") openCountryByCode(it.key);
    else if (it.type === "view") share.applyParams(new URLSearchParams(it.data || it.key));
    else if (it.type === "cam") openCamById(it.key);
    else if (it.type === "radio") radio.playFav(it.data);
  }
  const favorites = createFavorites({ onGo: goFavorite, describeView });
  window.__earth.favorites = favorites;
  favorites.provide("country", (code) => {
    const n = window.__earth.countryLayer?.meshByCode.get(code)?.userData?.names;
    return n ? { name: n.zh, icon: "🌍" } : null;
  });
  // 電台:底下「正在播放」旁邊的 ☆
  function paintRadioFav() {
    const radioFavBtn = document.getElementById("radio-fav");
    const cur = radio?.current?.();
    if (!radioFavBtn || !window.__earth.favorites) return;
    const on = !!(cur && window.__earth.favorites.has("radio", cur.uuid));
    radioFavBtn.textContent = on ? "★" : "☆";
    radioFavBtn.title = on ? "已收藏這個電台,再按一下取消" : "把這個電台加入我的收藏";
  }
  document.getElementById("radio-fav")?.addEventListener("click", () => {
    const cur = radio.current();
    if (!cur) return;
    favorites.toggle("radio", cur.uuid, { name: cur.name || "電台", icon: "📻", data: { code: cur.code, uuid: cur.uuid, name: cur.name, url: cur.url } });
    paintRadioFav();
  });
  favorites.onChange(paintRadioFav);

  // 📺 世界即時景點直播
  const liveCamToggle = document.getElementById("livecam-toggle");
  const liveCams = createLiveCams({ globeObject: globe.object, camera, renderer, rig, favorites, onClose: () => setLiveCams(false) });
  function setLiveCams(on) {
    if (liveCamToggle) liveCamToggle.setAttribute("aria-pressed", String(on));
    liveCams.setEnabled(on);
  }
  if (liveCamToggle) liveCamToggle.addEventListener("click", () => setLiveCams(liveCamToggle.getAttribute("aria-pressed") !== "true"));
  function openCamById(id) {
    if (!liveCams.isEnabled()) setLiveCams(true);
    liveCams.playId(id);
  }

  // 🌌 極光即時預報(NOAA)
  const auroraToggle = document.getElementById("aurora-toggle");
  const aurora = createAurora({ globe, rig, onClose: () => setAurora(false) });
  window.__earth.aurora = aurora;
  function setAurora(on) {
    if (auroraToggle) auroraToggle.setAttribute("aria-pressed", String(on));
    aurora.setEnabled(on);
  }
  if (auroraToggle) auroraToggle.addEventListener("click", () => setAurora(auroraToggle.getAttribute("aria-pressed") !== "true"));

  // ✨ 真實星空:亮星(真實方向)+ 星座連線與名稱
  const cstToggle = document.getElementById("constellation-toggle");
  const constellations = createConstellations({ scene, camera, renderer, globeObject: globe.object, rig, naturePopup });
  window.__earth.constellations = constellations;
  cstToggle?.setAttribute("aria-pressed", String(constellations.isEnabled()));
  cstToggle?.addEventListener("click", () => {
    const on = !constellations.isEnabled();
    constellations.setEnabled(on);
    cstToggle.setAttribute("aria-pressed", String(on));
  });

  // 🪐 五大行星(真實位置)+ 今晚看得到哪幾顆
  const planetToggle = document.getElementById("planet-toggle");
  const planets = createPlanets({ scene, camera, renderer, globeObject: globe.object, rig, onClose: () => setPlanets(false) });
  window.__earth.planets = planets;
  function setPlanets(on) {
    planetToggle?.setAttribute("aria-pressed", String(on));
    planets.setEnabled(on);
  }
  planetToggle?.addEventListener("click", () => setPlanets(planetToggle.getAttribute("aria-pressed") !== "true"));

  // 🕰️ 時光機:拖時間,太陽、月亮、星空、行星一起動
  const timeToggle = document.getElementById("timemachine-toggle");
  const timeMachine = createTimeMachine({ onClose: () => setTimeMachine(false) });
  window.__earth.timeMachine = timeMachine;
  function setTimeMachine(on) {
    timeToggle?.setAttribute("aria-pressed", String(on));
    timeMachine.setEnabled(on);
  }
  timeToggle?.addEventListener("click", () => setTimeMachine(timeToggle.getAttribute("aria-pressed") !== "true"));

  // 🌀 颱風路徑(日本氣象廳 + GDACS)
  const typhoonToggle = document.getElementById("typhoon-toggle");
  const typhoons = createTyphoons({ globeObject: globe.object, camera, renderer, rig, onClose: () => setTyphoons(false) });
  window.__earth.typhoons = typhoons;
  function setTyphoons(on) {
    typhoonToggle?.setAttribute("aria-pressed", String(on));
    typhoons.setEnabled(on);
  }
  typhoonToggle?.addEventListener("click", () => setTyphoons(typhoonToggle.getAttribute("aria-pressed") !== "true"));

  // 🌋 火山、野火、冰山
  const hazardToggle = document.getElementById("hazard-toggle");
  const hazards = createHazards({ globeObject: globe.object, camera, renderer, rig, naturePopup, onClose: () => setHazards(false) });
  window.__earth.hazards = hazards;
  function setHazards(on) {
    hazardToggle?.setAttribute("aria-pressed", String(on));
    hazards.setEnabled(on);
  }
  hazardToggle?.addEventListener("click", () => setHazards(hazardToggle.getAttribute("aria-pressed") !== "true"));

  // 🧩 板塊與地震帶(面板裡可以一鍵疊上地震、火山:直接按選單上的按鈕,狀態才會一致)
  const platesToggle = document.getElementById("plates-toggle");
  const plates = createPlates({ globeObject: globe.object, camera, renderer, rig, voice, onClose: () => setPlates(false),
    toggleLayer: (id) => document.getElementById(id)?.click() });
  window.__earth.plates = plates;
  function setPlates(on) {
    platesToggle?.setAttribute("aria-pressed", String(on));
    plates.setEnabled(on);
  }
  platesToggle?.addEventListener("click", () => setPlates(platesToggle.getAttribute("aria-pressed") !== "true"));

  const zhName = (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c;
  // 🌬️ 全球風場
  const windToggle = document.getElementById("wind-toggle");
  const wind = createWind({ globeObject: globe.object, camera, rig, clouds, onClose: () => setWind(false),
    countryName: (la, lo) => { const c = window.__earth.countryLayer?.codeAt(la, lo); return c ? zhName(c) : null; } });
  window.__earth.wind = wind;
  function setWind(on) {
    windToggle?.setAttribute("aria-pressed", String(on));
    wind.setEnabled(on);
  }
  windToggle?.addEventListener("click", () => setWind(windToggle.getAttribute("aria-pressed") !== "true"));

  // 📊 數據地球
  const statsToggle = document.getElementById("stats-toggle");
  const dataGlobe = createDataGlobe({ globeObject: globe.object, countryLayer: () => window.__earth.countryLayer, rig, nameOf: zhName, onClose: () => setStats(false) });
  window.__earth.dataGlobe = dataGlobe;
  function setStats(on) {
    statsToggle?.setAttribute("aria-pressed", String(on));
    dataGlobe.setEnabled(on);
  }
  statsToggle?.addEventListener("click", () => setStats(statsToggle.getAttribute("aria-pressed") !== "true"));

  // 🧳 出國小幫手(國家介紹裡的「🧳 出國小幫手」也會打開它)
  const tripToggle = document.getElementById("trip-toggle");
  const flyToCountry = (c) => {
    const w = window.__earth.countryLayer?.meshByCode.get(c);
    const cll = (window.__earth.content || {})[c]?.capital_latlon;
    const [lo, la] = w?.userData.centroidLatLon || [];
    if (cll) rig.flyTo(cll[0], cll[1], { distance: 2.2, ms: 1400 });
    else if (la != null) rig.flyTo(la, lo, { distance: 2.2, ms: 1400 });
  };
  const trip = createTravelHelper({ getContent: () => window.__earth.content, nameOf: zhName, flyTo: flyToCountry, onClose: () => setTrip(false) });
  window.__earth.trip = trip;
  function setTrip(on) {
    tripToggle?.setAttribute("aria-pressed", String(on));
    trip.setEnabled(on);
  }
  tripToggle?.addEventListener("click", () => setTrip(tripToggle.getAttribute("aria-pressed") !== "true"));
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-trip]");
    if (!b) return;
    tripToggle?.setAttribute("aria-pressed", "true");
    trip.show(b.dataset.trip);
  });

  // 國界線、台灣海岸線、國家色塊:貼著地表的圖層(站在地面仰望時要藏起來)
  function setGroundLines(on) {
    const e = window.__earth;
    for (const o of [e.borders, e.twOutline, e.countryLayer?.group]) if (o) o.visible = on;
    e.plates?.setHidden(!on);
    e.wind?.setHidden(!on);
    e.dataGlobe?.setHidden(!on);
  }
  // 🎥 特別視角:搭上國際太空站、從月球看地球(鏡頭暫時離開一般的繞地球模式)
  const issToggle = document.getElementById("iss-ride-toggle");
  const moonViewToggle = document.getElementById("moonview-toggle");
  const pov = createPov({
    camera, rig, globeObject: globe.object, moon, sunDir: () => globe.sun.position,
    codeAt: (lat, lon) => window.__earth.countryLayer?.codeAt(lat, lon),
    nameOf: (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c,
    onExit: () => { issToggle?.setAttribute("aria-pressed", "false"); moonViewToggle?.setAttribute("aria-pressed", "false"); setGroundLines(true); },
  });
  window.__earth.pov = pov;
  issToggle?.addEventListener("click", () => {
    if (pov.mode() === "iss") { pov.exit(); return; }
    moonViewToggle?.setAttribute("aria-pressed", "false");
    issToggle.setAttribute("aria-pressed", "true");
    pov.startIss();
  });
  moonViewToggle?.addEventListener("click", () => {
    if (pov.mode() === "moon") { pov.exit(); return; }
    issToggle?.setAttribute("aria-pressed", "false");
    moonViewToggle.setAttribute("aria-pressed", "true");
    pov.startMoon();
  });

  // 🎂 生日那天的天空
  const bdayToggle = document.getElementById("bday-toggle");
  const birthday = createBirthday({
    rig, onClose: () => setBirthday(false),
    lookUp: (opt) => {
      issToggle?.setAttribute("aria-pressed", "false"); moonViewToggle?.setAttribute("aria-pressed", "false");
      pov.startSky(opt);
      setGroundLines(false);   // 站在地面時,腳邊的國界線、海岸線會被畫進天空,先藏起來
    },
    stopLooking: () => { if (pov.mode() === "sky") pov.exit(); },
    onOpen: () => { if (timeMachine.isEnabled()) setTimeMachine(false); },   // 兩個都在改模擬時間,只留一個
  });
  function setBirthday(on) {
    bdayToggle?.setAttribute("aria-pressed", String(on));
    birthday.setEnabled(on);
  }
  bdayToggle?.addEventListener("click", () => setBirthday(bdayToggle.getAttribute("aria-pressed") !== "true"));
  if (bdayParam) dataReady.then(() => { setBirthday(true); birthday.openWith(bdayParam, bdayHour); });

  // 🌋 地球剖面:從大氣層到地心(切開四分之一 + 導覽旅程)
  const layersToggle = document.getElementById("layers-toggle");
  const earthLayers = createEarthLayers({ scene, camera, renderer, rig, globe, clouds, voice, setGroundLines, onClose: () => setLayers(false) });
  window.__earth.earthLayers = earthLayers;
  function setLayers(on) {
    layersToggle?.setAttribute("aria-pressed", String(on));
    earthLayers.setEnabled(on);
  }
  layersToggle?.addEventListener("click", () => setLayers(layersToggle.getAttribute("aria-pressed") !== "true"));

  // 🌡️ 全球此刻最熱/最冷
  const tempToggle = document.getElementById("temp-toggle");
  const tempRank = createTempRank({
    getContent: () => window.__earth.content,
    nameOf: (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c,
    openCountryByCode, onClose: () => setTempRank(false),
  });
  function setTempRank(on) {
    tempToggle?.setAttribute("aria-pressed", String(on));
    tempRank.setEnabled(on);
  }
  tempToggle?.addEventListener("click", () => setTempRank(tempToggle.getAttribute("aria-pressed") !== "true"));

  // 📰 今日地球:每天第一次打開網站時自動跳出(用分享連結打開、新手導覽進行中就不打擾)
  const todayToggle = document.getElementById("today-toggle");
  const today = createToday({
    rig, tempRank, nameOf: zhName, openCountryByCode, onClose: () => setToday(false),
    codeAt: (la, lo) => window.__earth.countryLayer?.codeAt(la, lo),
    turnOn: (id) => { const b = document.getElementById(id); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); },
  });
  window.__earth.today = today;
  function setToday(on) {
    todayToggle?.setAttribute("aria-pressed", String(on));
    today.setEnabled(on);
  }
  todayToggle?.addEventListener("click", () => setToday(todayToggle.getAttribute("aria-pressed") !== "true"));
  // 🗂️ 面板管家:好幾個面板同時開時排成分頁;手機返回鍵先關面板
  window.__earth.panels = createPanelManager();
  if (!openedWithParams) {
    loading.done.then(() => {
      const wait = () => {
        if ((intro && intro.isActive()) || document.body.classList.contains("intro-playing")) { setTimeout(wait, 500); return; }
        setTimeout(() => { if (!tour.isActive() && !window.__earth.cinema?.isActive() && today.shouldAutoShow()) setToday(true); }, 1600);
      };
      wait();
    });
    // 導覽(或「最近的新功能」)看完、略過之後再跳今日地球,不要兩個疊在一起
    tour.onEnd(() => setTimeout(() => { if (!window.__earth.cinema?.isActive() && today.shouldAutoShow()) setToday(true); }, 600));
  }

  // ☄️ 小行星掠過地球
  const neoToggle = document.getElementById("neo-toggle");
  const asteroids = createAsteroids({ onClose: () => setNeo(false) });
  function setNeo(on) {
    neoToggle?.setAttribute("aria-pressed", String(on));
    asteroids.setEnabled(on);
  }
  neoToggle?.addEventListener("click", () => setNeo(neoToggle.getAttribute("aria-pressed") !== "true"));

  // ☀️ 太陽:地球旁的「☀️ 太陽」標籤 + 太陽與節氣面板
  const sunInfoToggle = document.getElementById("sunpanel-toggle");
  const sunInfo = createSunInfo({
    globe, camera, renderer,
    codeAt: (lat, lon) => window.__earth.countryLayer?.codeAt(lat, lon),
    nameOf: (c) => window.__earth.countryLayer?.meshByCode.get(c)?.userData?.names?.zh || c,
    onClose: () => setSunInfo(false),
  });
  window.__earth.sunInfo = sunInfo;
  function setSunInfo(on) {
    sunInfoToggle?.setAttribute("aria-pressed", String(on));
    sunInfo.setEnabled(on);
  }
  sunInfo.onOpen(() => setSunInfo(true));
  sunInfoToggle?.addEventListener("click", () => setSunInfo(sunInfoToggle.getAttribute("aria-pressed") !== "true"));

  // 🌠 流星(平常偶爾一顆)+ 流星雨面板
  const meteorToggle = document.getElementById("meteor-toggle");
  const meteors = createMeteors({ scene, camera, renderer, globeObject: globe.object, rig, onClose: () => setMeteors(false) });
  window.__earth.meteors = meteors;
  function setMeteors(on) {
    if (meteorToggle) meteorToggle.setAttribute("aria-pressed", String(on));
    meteors.setEnabled(on);
  }
  if (meteorToggle) meteorToggle.addEventListener("click", () => setMeteors(meteorToggle.getAttribute("aria-pressed") !== "true"));

  // 🎬 電影巡航:選單按下立刻開始;放著不動 90 秒、而且沒有開著其他功能時自動開始
  // 這些開著也可以自動巡航(背景類的圖層,或預設就開著的星座、人聲播報)
  const AMBIENT = new Set(["quake-toggle", "sun-toggle", "aurora-toggle", "constellation-toggle", "voice-toggle"]);
  const cinema = createCinema({
    camera, rig, globeObject: globe.object, renderer,
    // 巡航自己的「導覽旁白」開關(畫面右下角):開著就唸,不受人聲播報總開關影響
    onShot: ({ title, sub, narration, voice: on }) => (on ? voice.speak(narration || (sub ? `${title}。${sub}` : title), { force: true }) : false),
    onVoiceChange: (on) => { if (!on) voice.stop(); },
    canAutoStart: () => !document.body.classList.contains("intro-playing") && !(intro && intro.isActive()) && !tour.isActive() &&
      !sidePanel.isOpen() && !encyclopedia.isOpen() && !favorites.isOpen() && !flightSim.isEnabled?.() &&
      !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") &&
      ![...document.querySelectorAll('#ctrl-dock .layer-row[aria-pressed="true"]')].some((b) => !AMBIENT.has(b.id)),
    // 巡航時國界線也先藏起來,畫面像紀錄片一樣乾淨
    onStart: () => { tooltip.hide(); globe.setSpinPaused(true); clouds.setSpinPaused(false); setGroundLines(false); },
    onStop: () => {
      voice.stop();
      setGroundLines(true);
      const keep = traffic.isEnabled() || ev.isEnabled() || sidePanel.isOpen();
      globe.setSpinPaused(keep);
      clouds.setSpinPaused(keep);
    },
  });
  window.__earth.cinema = cinema;
  document.getElementById("cinema-toggle")?.addEventListener("click", () => cinema.start());


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
    // 衛星開著:先看有沒有點到衛星(點地球表面的國家不受影響,只有剛好點在衛星圓點上才算)
    if (orbits.isEnabled() && orbits.pickAt(e.clientX, e.clientY)) return;
    // 點到月亮:打開月相面板
    if (moon.pickAt(e.clientX, e.clientY)) { setMoon(true); return; }
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = cl.pick(raycaster, globe.mesh);
    if (!hit) return;
    // 🎯 地理猜謎進行中:點地球 = 作答,不開國家側欄(遊戲開著時一律不開,免得直接看到答案)
    if (quiz.isEnabled()) { if (quiz.isAwaiting()) quiz.answer(hit.code); return; }
    // ✈️ 飛行模擬:飛行中點地球不開側欄(鏡頭正跟著飛機);還在選目的地時,點國家 = 選它當目的地
    if (flightSim.isFlying()) return;
    if (flightSim.isPicking()) { flightSim.pick(hit.code); return; }
    // 🛂 護照「點地球蓋章」模式:點國家 = 蓋章/取消,不開側欄
    if (passport.isMarking()) { passport.toggle(hit.code); return; }
    // ⚖️ 國家比較開著:點國家 = 填進比較的欄位
    if (compare.isPicking()) { compare.pick(hit.code); return; }
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

  // ⚙️ 自動調整畫質:連續幾秒每秒不到 40 格(通常是顯示卡跟不上泛光特效 + 高解析度),
  // 就把解析度降一級(1.5 → 1.25 → 1.0 → 0.85)。降了之後如果沒有變順(例如 iPhone 省電模式
  // 本來就鎖在每秒 30 格,跟顯示卡無關),就改回原本的畫質、不再調整,免得畫面白白變糊。
  let quality = renderer.getPixelRatio();
  const MIN_QUALITY = 0.85;
  let winStart = 0, winFrames = 0, lastFrameAt = 0, slowWindows = 0, trial = null, qualityLocked = false;
  function setQuality(q) {
    quality = q;
    renderer.setPixelRatio(q);
    composer.setPixelRatio(q);
    starfield.setPixelRatio(q);
    syncSize();
  }
  function watchFps(now) {
    if (!winStart || now - lastFrameAt > 500) { winStart = now; winFrames = 0; }   // 剛開始、切到背景回來:這段不算
    lastFrameAt = now;
    winFrames++;
    if (now - winStart < 2000) return;
    const fps = (winFrames * 1000) / (now - winStart);
    winStart = now; winFrames = 0;
    if (trial) {
      if (++trial.windows < 2) return;
      if (fps < trial.fpsBefore * 1.12) { setQuality(trial.prev); qualityLocked = true; }   // 沒變順:不是顯示卡的問題
      trial = null;
      return;
    }
    if (qualityLocked) return;
    slowWindows = fps < 40 ? slowWindows + 1 : 0;
    if (slowWindows >= 2 && quality > MIN_QUALITY) {
      trial = { prev: quality, fpsBefore: fps, windows: 0 };
      setQuality(Math.max(MIN_QUALITY, +(quality - 0.25).toFixed(2)));
      slowWindows = 0;
    }
  }
  window.__earth.quality = () => ({ quality, locked: qualityLocked });

  // 網址後面加 ?fps:畫面上方(搜尋框下面)顯示每秒幾格、最慢一格幾毫秒、目前畫質、畫面上的標籤數(回報「很卡」時截圖用)
  const fpsBox = new URLSearchParams(location.search).has("fps") ? document.createElement("div") : null;
  if (fpsBox) {
    fpsBox.style.cssText = "position:fixed;left:50%;top:62px;transform:translateX(-50%);z-index:99999;font:12px/1.35 ui-monospace,monospace;color:#9f9;" +
      "background:rgba(0,0,0,.65);padding:4px 7px;border-radius:5px;pointer-events:none;white-space:pre";
    document.body.appendChild(fpsBox);
  }
  const LABEL_HOSTS = "#country-labels,#ocean-labels,#physical-labels,#earthquake-labels,#radio-labels,#launch-labels,#livecam-labels,#sat-labels,#flight-labels";
  let fmStart = 0, fmFrames = 0, fmWorst = 0, fmLast = 0;
  function fpsMeter(now) {
    if (!fpsBox) return;
    if (fmLast) fmWorst = Math.max(fmWorst, now - fmLast);
    fmLast = now;
    fmFrames++;
    if (!fmStart) fmStart = now;
    if (now - fmStart < 500) return;
    let shown = 0;
    for (const host of document.querySelectorAll(LABEL_HOSTS)) for (const el of host.children) if (el._hidden === false) shown++;
    fpsBox.textContent = `${Math.round((fmFrames * 1000) / (now - fmStart))} fps · 最慢 ${fmWorst.toFixed(0)}ms\n` +
      `畫質 ${quality}${qualityLocked ? "(鎖定)" : ""} · 標籤 ${shown}${drag.active ? " · 拖曳中" : ""}`;
    fmStart = now; fmFrames = 0; fmWorst = 0;
  }

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
  const globeSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    watchFps(performance.now());
    fpsMeter(performance.now());
    starfield.update(clock.getElapsedTime());
    if (cinema.isActive()) globe.setSpinPaused(true);   // 巡航時地球停住,鏡頭照地名飛
    globe.update(dt);
    clouds.update(dt);

    const now = performance.now();
    if (!drag.active && now - lastPickAt >= PICK_INTERVAL_MS) {   // 拖曳中不做滑過偵測
      lastPickAt = now;
      raycaster.setFromCamera(pointer, camera);
      hovered = window.__earth.countryLayer ? window.__earth.countryLayer.pick(raycaster, globe.mesh) : null;
      hitGlobe = !!hovered || raycaster.ray.intersectsSphere(globeSphere);
      if (window.__earth.countryLayer) window.__earth.countryLayer.setHover(hovered ? hovered.code : null);
      const wx = weather.readout(raycaster) || wind.readout(raycaster) || dataGlobe.readout(hovered && hovered.code);
      if (hovered || wx) tooltip.show(pointerPx.x, pointerPx.y, hovered ? hovered.names : null, wx);
      else tooltip.hide();
    }
    if (window.__earth.countryLayer) window.__earth.countryLayer.update(dt);

    if (hitGlobe) {
      globe.setSpinPaused(true);
      clouds.setSpinPaused(true);
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
    } else if (!resumeTimer && !(window.__earth.countryLayer && window.__earth.countryLayer.hasSelection && window.__earth.countryLayer.hasSelection()) &&
      !window.__earth.traffic?.isEnabled() && !window.__earth.ev?.isEnabled() && !cinema.isActive()) {
      resumeTimer = setTimeout(() => { globe.setSpinPaused(false); clouds.setSpinPaused(false); resumeTimer = null; }, 1500);
    }
    if (pov.isActive()) {
      pov.update(dt);   // 搭太空站、站在月球上:鏡頭交給特別視角
    } else {
      cinema.update(dt);
      // 閒置時鏡頭慢慢繞地球轉(取代以前的地球自轉;滑到地球上、看國家、路況、巡航、時光機時停)
      rig.setAutoSpin(!globe.isSpinPaused() && !cinema.isActive() && !timeMachine.isEnabled() && !earthLayers.isEnabled() && !(intro && intro.isActive()));
      rig.update(dt);
      earthLayers.update(dt);   // 剖面導覽旅程會接手鏡頭(要在 rig 之後)
    }
    homeCompass.update();
    flightSim.update(dt);
    aurora.update(clock.elapsedTime, dt);
    meteors.update(dt);
    constellations.update(clock.elapsedTime);
    planets.update();
    typhoons.update();
    hazards.update();
    plates.update(dt);
    wind.update(dt);
    timeMachine.update(dt);
    sunInfo.update();
    if (intro) intro.update(dt);

    oceanLabels.update();
    physicalLabels.update();
    earthquakes.update();
    radio.update();
    flights.update();
    orbits.update();
    launches.update();
    liveCams.update();
    moon.update();
    traffic.update();
    if (window.__earth.countryLabels) window.__earth.countryLabels.update();

    viewOffset.update(dt);
    composer.render();
    requestAnimationFrame(loop);
  }
  loop();

  // 🔗 分享連結:右上角分享鈕;開網站時照網址參數還原畫面(國家資料載入完才能打開國家)
  const share = createShare({
    camera, globeObject: globe.object, rig, sidePanel, encyclopedia, trafficCenter, radioPanel, railPanel, openCountryByCode,
  });
  window.__earth.share = share;
  dataReady.then(() => share.applyFromUrl()).catch((e) => console.warn("[share] 還原分享畫面失敗:", e));

  // 📱 可安裝成 App + 離線快取
  setupPwa();
}
