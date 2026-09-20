import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { zhHantName } from "../countries/country-names.js";

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
// .m3u8 是 HLS 串流,瀏覽器原生 <audio> 沒有內建 HLS 解碼(Chrome/Firefox 都
// 沒有,只有 Safari 例外)——radio-browser 裡不少電台(尤其台灣幾家,包括
// Hit FM)剛好是這種格式。用 hls.js 補上解碼能力,不用把這些電台整批排除。
const HLS_URL = /\.m3u8(\?|$)/i;
let hlsLoadPromise = null;
function ensureHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLoadPromise) return hlsLoadPromise;
  hlsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
    script.onload = () => resolve(window.Hls);
    script.onerror = () => reject(new Error("hls.js 載入失敗"));
    document.head.appendChild(script);
  });
  return hlsLoadPromise;
}
// 熱門國家多給幾台選擇,其他國家維持新聞+流行各一台就好
const POPULAR_COUNTRIES = new Set(["TW", "KR", "CN", "JP", "US", "GB", "FR", "DE"]);
// 使用者點名想要的電台,只要 radio-browser 裡有播得出來的版本就一定收進去,不受
// 新聞/流行的自動判斷限制——用電台自己的名稱關鍵字直接查,不能只在「該國點擊數
// 前 30 名」裡面找,很多指定電台點擊數低、根本擠不進前 30 名。
const PINNED_STATIONS = {
  TW: ["飛碟"],
};

// 網站本身走 HTTPS 的話(部署後的正式站),瀏覽器會擋 HTTP 的串流連線
// (mixed content),而且不會有明顯錯誤訊息,只會「看起來在播、其實沒聲音」
// ——實測 Hit FM台北之音廣播就是這樣(串流網址是 http://,不是 https://)。
// 與其選進來變成這種假裝正常的電台,不如篩選階段就排除掉,換另一台真的
// 播得出來的。本機開發(http://localhost)不受 mixed content 限制,一樣可以
// 正常收錄 HTTP 電台測試,不影響本機測試涵蓋率。
function isUsableUrl(s) {
  const u = s.url_resolved || s.url;
  if (!u) return false;
  if (typeof window !== "undefined" && window.location?.protocol === "https:" && /^http:\/\//i.test(u)) return false;
  return true;
}

async function findPinnedStation(code, keyword) {
  try {
    const r = await fetch(`${RADIO_BASE}?countrycode=${code}&name=${encodeURIComponent(keyword)}&hidebroken=true&order=clickcount&reverse=true&limit=10`);
    if (!r.ok) return null;
    const list = await r.json();
    if (!Array.isArray(list)) return null;
    return list.find(isUsableUrl) || null;
  } catch {
    return null;
  }
}

// 每個國家挑「一台新聞 + 一台流行音樂」(找得到的話),而不是只挑點擊數最高的
// 一台——單一榜首常常是這個目錄站自己的點擊怪象(見上面說明),兩種類型都給
// 比較貼近使用者想看到的「當地主流電台」。
async function pickStationsForCountry(code, count = 2) {
  const url = `${RADIO_BASE}?countrycode=${code}&order=clickcount&reverse=true&limit=30&hidebroken=true`;
  try {
    const [r, pinnedResults] = await Promise.all([
      fetch(url),
      Promise.all((PINNED_STATIONS[code] || []).map((kw) => findPinnedStation(code, kw))),
    ]);
    if (!r.ok) return [];
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return [];
    const playable = list.filter(isUsableUrl);
    const clean = playable.filter((s) => !AVOID_TAGS.test(s.tags || "") && !AVOID_TAGS.test(s.name || ""));
    const pool = clean.length ? clean : playable;
    if (!pool.length && !pinnedResults.some(Boolean)) return [];

    const picks = [];
    for (const hit of pinnedResults) {
      if (hit && !picks.some((p) => p.stationuuid === hit.stationuuid)) picks.push(hit);
    }
    const news = pool.find((s) => !picks.includes(s) && NEWS_TAGS.test(s.tags || ""));
    if (news) picks.push(news);
    const pop = pool.find((s) => !picks.includes(s) && POP_TAGS.test(s.tags || ""));
    if (pop) picks.push(pop);
    // 熱門國家想多看幾台、或有指定電台佔掉名額:剩下的用「還沒選過、點擊數最高」依序補滿
    for (const s of pool) {
      if (picks.length >= count) break;
      if (!picks.includes(s)) picks.push(s);
    }
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
  const countryNameEl = document.getElementById("radio-country-name");
  const stationSelect = document.getElementById("radio-station-select");
  const stopBtn = document.getElementById("radio-stop");
  const trackSelect = document.getElementById("audio-track");
  if (!host) return { update() {}, dispose() {}, setEnabled() {}, isEnabled: () => false, isPlaying: () => false, setVolume() {}, setMuted() {} };

  let stations = [];
  let resolved = []; // [{code, s, lat, lon}],查過一次就快取,不受圖層開關影響
  let enabled = false;
  let loaded = false;
  let activeWrap = null;
  let activeStationInfo = null; // { code, uuid } —— 圖層關閉又重開時,靠這個把正在撥放的台重新跟新畫出來的 wrap 對上
  // code -> [{ s, wrap }, ...],讓同一國其他台可以合併進下拉選單方便切換,
  // 不用回地球上找小字卡。
  const byCountry = new Map();

  const audio = new Audio();
  audio.preload = "none";
  let musicWasPlaying = false;
  let hls = null;
  function teardownHls() {
    if (hls) { hls.destroy(); hls = null; }
  }

  function setNowPlaying(code, activeUuid) {
    if (!nowPlayingEl || !stationSelect) return;
    const list = code && byCountry.get(code);
    if (list && list.length) {
      if (countryNameEl) countryNameEl.textContent = zhHantName(code) || code || "";
      stationSelect.innerHTML = list.map(({ s }) =>
        `<option value="${esc(s.stationuuid)}"${s.stationuuid === activeUuid ? " selected" : ""}>${esc((s.name || "").trim() || "未知電台")}</option>`
      ).join("");
      nowPlayingEl.hidden = false;
      if (trackSelect) trackSelect.hidden = true;
    } else {
      nowPlayingEl.hidden = true;
      if (trackSelect) trackSelect.hidden = false;
    }
  }

  function stop() {
    teardownHls();
    audio.pause();
    audio.removeAttribute("src");
    if (activeWrap) { activeWrap.classList.remove("radio-active"); activeWrap = null; }
    activeStationInfo = null;
    setNowPlaying(null);
    if (musicWasPlaying && music) music.resume?.();
  }
  if (stopBtn) stopBtn.addEventListener("click", stop);

  async function play(station, wrap, code) {
    if (activeWrap === wrap) { stop(); return; } // 再點一次同一台 = 停止
    if (activeWrap) activeWrap.classList.remove("radio-active");
    musicWasPlaying = !!music?.isPlaying?.();
    if (musicWasPlaying) music.pause?.();
    teardownHls();
    const url = station.url_resolved || station.url;
    if (HLS_URL.test(url)) {
      // 優先用 hls.js(MediaSource Extensions),不要只看 canPlayType——很多瀏覽器
      // (包括這個 app 自己內嵌的 Chromium)對 HLS 的 canPlayType 會樂觀回報
      // "maybe" 但其實播不出來,只有 Safari 是真的原生支援,交給 hls.js 處理才穩定。
      try {
        const Hls = await ensureHls();
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(audio);
        } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.src = url;
        } else {
          throw new Error("瀏覽器不支援 HLS 播放");
        }
      } catch (e) {
        console.warn("[radio] HLS 播放失敗:", e.message);
        return;
      }
    } else {
      audio.src = url;
    }
    audio.volume = music?.getVolume ? music.getVolume() : 0.55;
    audio.play().catch((e) => console.warn("[radio] 播放失敗(電台可能離線):", e.name));
    activeWrap = wrap;
    activeStationInfo = { code, uuid: station.stationuuid };
    wrap.classList.add("radio-active");
    setNowPlaying(code, station.stationuuid);
  }
  if (stationSelect) stationSelect.addEventListener("change", () => {
    const code = [...byCountry.keys()].find((c) => byCountry.get(c).some(({ s }) => s.stationuuid === stationSelect.value));
    const hit = code && byCountry.get(code).find(({ s }) => s.stationuuid === stationSelect.value);
    if (hit) play(hit.s, hit.wrap, code);
  });

  function addStation(s, lat, lon, code) {
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

    const onClick = () => play(s, wrap, code);
    dot.addEventListener("click", onClick);
    label.addEventListener("click", onClick);

    host.appendChild(wrap);
    return { wrap, dir: latLonToVec3(lat, lon, 1), anchor: new THREE.Vector3(), ndc: new THREE.Vector3() };
  }

  // 抓電台清單只做一次,結果快取在 resolved 裡,不受圖層開關影響——這樣
  // 關掉圖層再打開不用重打一輪 API,正在撥放的電台資訊也不會被清掉。
  async function fetchStations() {
    if (loaded) return;
    loaded = true;
    const content = window.__earth?.content || {};
    const codes = Object.keys(content);
    const picks = await Promise.allSettled(codes.map(async (code) => {
      const list = await pickStationsForCountry(code, POPULAR_COUNTRIES.has(code) ? 4 : 2);
      return list.map((s) => ({ code, s }));
    }));

    resolved = [];
    for (const r of picks) {
      if (r.status !== "fulfilled" || !r.value.length) continue;
      r.value.forEach(({ code, s }, i) => {
        // 電台自己的經緯度優先;沒有的話(很多主流電台反而沒填)退回該國首都座標,
        // 至少能標在對的國家上,不會因為缺 geo 資料就把好台排除在外。同一國若有
        // 好幾台都要退回首都座標,依序加偏移,不然字卡會整疊在同一點上。
        let lat = s.geo_lat, lon = s.geo_long;
        if (typeof lat !== "number" || typeof lon !== "number") {
          const cap = content[code]?.capital_latlon;
          if (!Array.isArray(cap)) return;
          [lat, lon] = cap;
          if (i > 0) { lat += 0.25 * i; lon += 0.25 * i; }
        }
        resolved.push({ code, s, lat, lon });
      });
    }
  }

  // 用快取好的 resolved 資料重新畫地球上的字卡(不用重打 API)。如果重畫的
  // 當下剛好有電台在撥放,把正在撥放那台重新對應到新畫出來的 wrap 上,
  // 不然圖層關了再開,地球上會看不出哪台正在播(播放本身不受影響)。
  function buildMarkers() {
    host.innerHTML = "";
    stations = [];
    byCountry.clear();
    for (const { code, s, lat, lon } of resolved) {
      const wrap = addStation(s, lat, lon, code);
      stations.push(wrap);
      if (!byCountry.has(code)) byCountry.set(code, []);
      byCountry.get(code).push({ s, wrap: wrap.wrap });
    }
    if (activeStationInfo) {
      const hit = byCountry.get(activeStationInfo.code)?.find(({ s }) => s.stationuuid === activeStationInfo.uuid);
      if (hit) { activeWrap = hit.wrap; activeWrap.classList.add("radio-active"); }
    }
  }

  async function refresh() {
    await fetchStations();
    buildMarkers();
  }

  // 開關只控制地球上看不看得到電台字卡,不影響正在撥放的電台——使用者可能
  // 只是想收起圖層別擋畫面,不代表想停止收聽。真的想停止的話,重新打開
  // 圖層,用下面的停止鈕或再點一次同一台就好。
  function setEnabled(v) {
    enabled = !!v;
    if (enabled) refresh().catch((e) => console.error("[radio] refresh failed:", e));
    else host.innerHTML = "";
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
    teardownHls();
    host.innerHTML = "";
    stations = [];
    byCountry.clear();
  }

  return {
    update, dispose, setEnabled, isEnabled: () => enabled,
    isPlaying: () => !audio.paused && !!audio.src,
    setVolume: (v) => { audio.volume = v; },
    toggleMute: () => { audio.muted = !audio.muted; return audio.muted; },
    isMuted: () => audio.muted,
  };
}
