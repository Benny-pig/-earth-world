import * as THREE from "three";
import { esc } from "../lib/esc.js";

// 當地廣播電台:radio-browser.info 公開 API,免金鑰、串流網址可直接播放。
// 跟地震不同,電台清單不太會變,開啟時抓一次就好,不用定時刷新。
//
// 一開始用「全球依點擊數排序」抓 top N,結果被少數國際性、非主流(例如靈修/宗教
// 頻道剛好在這個目錄站點擊數很高)洗版,小國幾乎抓不到自己的電台——這個目錄站
// 的點擊數反映的是「在這個目錄站被點過幾次」,不是「當地聽眾真的愛聽」。改成
// 逐國查詢(countrycode 用我們既有的 ISO 代碼),每國在候選裡挑一個看起來像主流
// 新聞/音樂台的,而不是純粹取點擊數最高者。
const RADIO_BASE = "https://de1.api.radio-browser.info/json/stations/search";
// 標籤含這些關鍵字的,除非候選裡沒有更好的選擇,不然不選(靈修/宗教頻道常見這類標籤,
// 跟「當地最受歡迎頻道」的期待落差最大)
const AVOID_TAGS = /spiritual|religio|worldpeace|prayer|meditation|sermon|dharma|buddhis|islamic|quran|gospel/i;
const NEWS_TAGS = /news|talk|information|public radio/i;
const POP_TAGS = /pop|top ?40|hits?\b|contemporary|music|chart/i;

// 每個國家挑「一台新聞 + 一台流行音樂」(找得到的話),而不是只挑點擊數最高的
// 一台——單一榜首常常是這個目錄站自己的點擊怪象(見上面說明),兩種類型都給
// 比較貼近使用者想看到的「當地主流電台」。
async function pickStationsForCountry(code) {
  const url = `${RADIO_BASE}?countrycode=${code}&order=clickcount&reverse=true&limit=20&hidebroken=true`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return [];
    const usable = list.filter((s) => s.url_resolved || s.url);
    const clean = usable.filter((s) => !AVOID_TAGS.test(s.tags || "") && !AVOID_TAGS.test(s.name || ""));
    const pool = clean.length ? clean : usable;
    if (!pool.length) return [];

    const news = pool.find((s) => NEWS_TAGS.test(s.tags || ""));
    const pop = pool.find((s) => s !== news && POP_TAGS.test(s.tags || ""));
    const picks = [news, pop].filter(Boolean);
    if (!picks.length) picks.push(pool[0]); // 兩種標籤都沒中,退回排名最高的那台
    return picks;
  } catch {
    return [];
  }
}

const DEG = Math.PI / 180;
function latLonToVec3(latDeg, lonDeg, r = 1) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, cl = Math.cos(lat);
  return new THREE.Vector3(r * cl * Math.cos(lon), r * Math.sin(lat), -r * cl * Math.sin(lon));
}

export function createRadioLayer({ globeObject, camera, renderer, music }) {
  const host = document.getElementById("radio-labels");
  const nowPlayingEl = document.getElementById("radio-now-playing");
  const nowPlayingName = document.getElementById("radio-now-playing-name");
  const stopBtn = document.getElementById("radio-stop");
  const trackSelect = document.getElementById("audio-track");
  if (!host) return { update() {}, dispose() {}, setEnabled() {}, isEnabled: () => false, isPlaying: () => false, setVolume() {}, setMuted() {} };

  let stations = [];
  let enabled = false;
  let loaded = false;
  let activeWrap = null;

  const audio = new Audio();
  audio.preload = "none";
  let musicWasPlaying = false;

  function setNowPlaying(name) {
    if (!nowPlayingEl) return;
    if (name) {
      if (nowPlayingName) nowPlayingName.textContent = "📻 " + name;
      nowPlayingEl.hidden = false;
      if (trackSelect) trackSelect.hidden = true;
    } else {
      nowPlayingEl.hidden = true;
      if (trackSelect) trackSelect.hidden = false;
    }
  }

  function stop() {
    audio.pause();
    audio.removeAttribute("src");
    if (activeWrap) { activeWrap.classList.remove("radio-active"); activeWrap = null; }
    setNowPlaying(null);
    if (musicWasPlaying && music) music.resume?.();
  }
  if (stopBtn) stopBtn.addEventListener("click", stop);

  function play(station, wrap) {
    if (activeWrap === wrap) { stop(); return; } // 再點一次同一台 = 停止
    if (activeWrap) activeWrap.classList.remove("radio-active");
    musicWasPlaying = !!music?.isPlaying?.();
    if (musicWasPlaying) music.pause?.();
    audio.src = station.url_resolved || station.url;
    audio.volume = music?.getVolume ? music.getVolume() : 0.55;
    audio.play().catch((e) => console.warn("[radio] 播放失敗(電台可能離線):", e.name));
    activeWrap = wrap;
    wrap.classList.add("radio-active");
    setNowPlaying(station.name?.trim() || "未知電台");
  }

  function addStation(s, lat, lon) {
    const wrap = document.createElement("div");
    wrap.className = "radio-wrap";

    const dot = document.createElement("div");
    dot.className = "radio-marker";
    wrap.appendChild(dot);

    const label = document.createElement("div");
    label.className = "radio-label";
    const name = (s.name || "").trim() || "未知電台";
    const tag = (s.tags || "").split(",")[0].trim();
    label.innerHTML = `<b>📻 ${esc(name)}</b>` +
      `<div class="radio-label-sub">${esc(s.country || "")}${tag ? " · " + esc(tag) : ""}</div>`;
    wrap.appendChild(label);

    const onClick = () => play(s, wrap);
    dot.addEventListener("click", onClick);
    label.addEventListener("click", onClick);

    host.appendChild(wrap);
    return { wrap, dir: latLonToVec3(lat, lon, 1), anchor: new THREE.Vector3(), ndc: new THREE.Vector3() };
  }

  async function refresh() {
    if (loaded) return;
    loaded = true; // 逐國查詢只做一次,避免重複開關圖層時重複打一輪 API
    const content = window.__earth?.content || {};
    const codes = Object.keys(content);
    const picks = await Promise.allSettled(codes.map(async (code) => {
      const list = await pickStationsForCountry(code);
      return list.map((s) => ({ code, s }));
    }));

    host.innerHTML = "";
    stations = [];
    for (const r of picks) {
      if (r.status !== "fulfilled" || !r.value.length) continue;
      r.value.forEach(({ code, s }, i) => {
        // 電台自己的經緯度優先;沒有的話(很多主流電台反而沒填)退回該國首都座標,
        // 至少能標在對的國家上,不會因為缺 geo 資料就把好台排除在外。同一國若有
        // 兩台都要退回首都座標,加一點點偏移,不然兩張字卡會完全疊在一起。
        let lat = s.geo_lat, lon = s.geo_long;
        if (typeof lat !== "number" || typeof lon !== "number") {
          const cap = content[code]?.capital_latlon;
          if (!Array.isArray(cap)) return;
          [lat, lon] = cap;
          if (i > 0) { lat += 0.25; lon += 0.25; }
        }
        stations.push(addStation(s, lat, lon));
      });
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (enabled) refresh().catch((e) => console.error("[radio] refresh failed:", e));
    else { host.innerHTML = ""; loaded = false; stations = []; stop(); }
  }

  const camToAnchor = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();

  function update() {
    if (!enabled || !stations.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    for (const S of stations) {
      S.anchor.copy(S.dir).multiplyScalar(1.02).applyMatrix4(globeObject.matrixWorld);
      worldNormal.copy(S.dir).transformDirection(globeObject.matrixWorld);
      camToAnchor.copy(camera.position).sub(S.anchor).normalize();
      const facing = worldNormal.dot(camToAnchor);
      S.ndc.copy(S.anchor).project(camera);
      const behind = S.ndc.z > 1;

      if (behind || facing < 0.05) {
        S.wrap.style.opacity = "0";
        S.wrap.style.transform = "translate(-9999px,-9999px)";
        continue;
      }
      const x = rect.left + (S.ndc.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-S.ndc.y * 0.5 + 0.5) * rect.height;
      const op = THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1).toFixed(2);
      S.wrap.style.opacity = op;
      S.wrap.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  function dispose() {
    stop();
    host.innerHTML = "";
    stations = [];
  }

  return {
    update, dispose, setEnabled, isEnabled: () => enabled,
    isPlaying: () => !audio.paused && !!audio.src,
    setVolume: (v) => { audio.volume = v; },
    toggleMute: () => { audio.muted = !audio.muted; return audio.muted; },
    isMuted: () => audio.muted,
  };
}
