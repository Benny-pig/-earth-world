import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { createStarfield } from "/src/scene/starfield.js";
import { createGlobe } from "/src/scene/globe.js";
import { createClouds } from "/src/scene/clouds.js";
import { createCameraRig } from "/src/scene/camera-controls.js";
import { buildBorders } from "/src/countries/borders.js";
import { buildCountryLayer } from "/src/countries/country-layer.js";
import { setZhHantNames } from "/src/countries/country-names.js";
import { createTooltip } from "/src/ui/tooltip.js";
import { createOceanLabels } from "/src/scene/ocean-labels.js";
import { createCountryLabels } from "/src/scene/country-labels.js";
import { createPhysicalLabels } from "/src/scene/physical-labels.js";
import { createSidePanel } from "/src/ui/side-panel.js";
import { createClockWeather } from "/src/ui/clock-weather.js";
import { createTwClock } from "/src/ui/tw-clock.js";
import { createCountrySearch } from "/src/ui/country-search.js";
import { createMusic } from "/src/audio/music.js";
import { createEncyclopedia } from "/src/ui/encyclopedia.js";

const container = document.getElementById("app");

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
  camera.position.set(0, 0, 3.2);

  const starfield = createStarfield();
  scene.add(starfield.object);

  const globe = createGlobe({ onAllTexturesFailed: () => showError("地球貼圖載入失敗,已改用純色地球。") });
  scene.add(globe.object);
  scene.add(globe.lightRig);

  // 非同步載入 Natural Earth 110m 國界,掛在地球 group 上跟著自轉
  const tap = (p) => p.finally(() => loading.bumpData());
  Promise.all([
    tap(fetch("/data/countries.geo.json").then((r) => { if (!r.ok) throw new Error("國界資料載入失敗 " + r.status); return r.json(); })),
    tap(fetch("/data/country-names-zh-hant.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))),
    tap(fetch("/data/countries.content.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))),
  ])
    .then(([geojson, zhHant, content]) => {
      setZhHantNames(zhHant);
      window.__earth.content = content;
      window.__earth.geojson = geojson;
      const borders = buildBorders(geojson);
      globe.object.add(borders);
      window.__earth.borders = borders;
      const countryLayer = buildCountryLayer(geojson);
      globe.object.add(countryLayer.group);
      window.__earth.countryLayer = countryLayer;
      const countryLabels = createCountryLabels({ geojson, globeObject: globe.object, camera, renderer });
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

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  const oceanLabels = createOceanLabels({ globeObject: globe.object, camera, renderer });
  window.__earth.oceanLabels = oceanLabels;
  const physicalLabels = createPhysicalLabels({ globeObject: globe.object, camera, renderer });
  window.__earth.physicalLabels = physicalLabels;

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
  const audioToggle = document.getElementById("audio-toggle");
  const audioVol = document.getElementById("audio-vol");
  audioToggle.addEventListener("click", () => {
    const m = music.toggleMute();
    audioToggle.textContent = m ? "🔇" : "🔊";
  });
  audioVol.addEventListener("input", () => music.setVolume(audioVol.value / 100));

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
      if (window.__earth.globe) window.__earth.globe.setSpinPaused(false);
      if (window.__earth.clouds) window.__earth.clouds.setSpinPaused(false);
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
    raycaster.setFromCamera(pointer, camera);
    const hit = cl.pick(raycaster, globe.mesh);
    if (!hit) return;
    openCountry(hit);
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    starfield.update(clock.getElapsedTime());
    globe.update(dt);
    clouds.update(dt);

    raycaster.setFromCamera(pointer, camera);
    let hovered = null;
    if (window.__earth.countryLayer) hovered = window.__earth.countryLayer.pick(raycaster, globe.mesh);
    const hitGlobe = hovered || raycaster.intersectObject(globe.mesh, false).length > 0;

    if (window.__earth.countryLayer) {
      window.__earth.countryLayer.setHover(hovered ? hovered.code : null);
      window.__earth.countryLayer.update(dt);
    }
    if (hovered) tooltip.show(pointerPx.x, pointerPx.y, hovered.names);
    else tooltip.hide();

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
    if (window.__earth.countryLabels) window.__earth.countryLabels.update();

    composer.render();
    requestAnimationFrame(loop);
  }
  loop();
}
