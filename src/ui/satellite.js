import * as THREE from "three";

// 即時衛星雲圖:西太平洋用日本 NICT 向日葵9號、大西洋用美國 NOAA GOES-19,
// 兩個都免金鑰、公開圖片。地球同步衛星固定盯著自己那半球,看不到另一半——
// 這是物理限制,想看大西洋只能換一顆真的看得到大西洋的衛星,不是切換設定
// 就能讓同一張圖片變出另一半地球。
//
// 向日葵沒有乾淨的 CORS JSON API 可以查「最新一張是幾點」,得自己猜時間戳記
// (見 himawariUrl);GOES 的 CDN 反而簡單,固定檔名(例如 678x678.jpg)永遠是
// 最新一張,不用猜、也真的有開 CORS(比向日葵更寬鬆)。兩邊都用 <img> 顯示,
// 不需要 CORS 就能單純顯示,猜錯時間的 fallback 只有向日葵需要。
// 延遲抓太保守(原本 20 分鐘)使用者會覺得畫面一直沒更新,抓太激進(試過
// 3 分鐘)又常常猜到「還沒發布/剛好缺這一格」的時間戳記——這種情況向日葵
// 不是回 404,是回一張畫著「No Image」文字的正常 PNG(HTTP 200),onerror
// 完全偵測不到、也無法用 <img> 讀像素內容去分辨(跨網域畫布會被污染,讀不
// 出來)。折衷抓 15 分鐘,大幅降低撞到這種情況的機率,但沒辦法保證絕對不會
// 撞到——真的撞到的話畫面上就是那張「No Image」圖,只能等下一輪 2 分鐘後
// 的檢查自動換成更新的一張。
const PUBLISH_DELAY_MIN = 15;
const STEP_MIN = 10;
const MAX_TRIES = 6;
// 圖片本身每 10 分鐘才換一次沒錯,但檢查頻率拉到跟資料週期一樣長,萬一畫面
// 打開的時間點跟資料發布時間點沒對齊,最差情況要等快 10 分鐘才會看到新的一張
// ——改成每 2 分鐘就檢查一次「現在能猜到的最新時間戳記」變了沒,新圖一發布
// 最多 2 分鐘內就會換上來,不用整整等一輪。
const CHECK_MS = 2 * 60_000;

function pad(n) { return String(n).padStart(2, "0"); }
function himawariUrl(bandPath, d) {
  const y = d.getUTCFullYear(), mo = pad(d.getUTCMonth() + 1), da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours()), mi = pad(d.getUTCMinutes());
  return `https://himawari8.nict.go.jp/img/${bandPath}/1d/550/${y}/${mo}/${da}/${h}${mi}00_0_0.png`;
}
function roundedNow() {
  const d = new Date(Date.now() - PUBLISH_DELAY_MIN * 60000);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / STEP_MIN) * STEP_MIN, 0, 0);
  return d;
}

// 西太平洋(UTC 時間戳記換算)、大西洋(沒有時間戳記,只能顯示現在時刻)兩邊
// 原本一個顯示 UTC、一個完全不顯示,混在一起容易讓人誤會兩張圖差了 8 小時。
// 統一都換算成台灣時間顯示。
function fmtTaipei(d) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

// 兩顆衛星都固定在赤道上空的地球同步軌道,只是經度不同——向日葵9號對著
// 東經140.7度(亞洲/澳洲/西太平洋),GOES-19對著西經75.2度(美洲/大西洋)。
// 用簡化版正射投影(球體近似,不是衛星實際用的橢球體精算公式)大致算出幾個
// 地標跟颱風/颶風好發區在圖上的位置,精度只求「看得出大概在哪」。
function projectLabel({ lat, lon }, subLon) {
  const latR = lat * Math.PI / 180, dLonR = (lon - subLon) * Math.PI / 180;
  const visible = Math.cos(latR) * Math.cos(dLonR) > 0.08; // 太靠近圓盤邊緣就不標,容易跑到圖外
  if (!visible) return null;
  const x = Math.cos(latR) * Math.sin(dLonR);
  const y = Math.sin(latR);
  return { leftPct: 50 + x * 48, topPct: 50 - y * 48 };
}

const REGIONS = {
  wpac: {
    label: "西太平洋",
    subLon: 140.7,
    bands: {
      ir: { label: "紅外線", himawari: "FULL_24h/B13" },
      true_color: { label: "真色", himawari: "D531106" },
    },
    source: "NICT 向日葵9號",
    tip: "找螺旋狀的白色雲團,中心有清楚圓圈就是颱風眼。正確位置與強度請看官方發布。",
    tipEn: "Look for a white spiral cloud mass — a clear circle at the center is the eye. Check official forecasts for exact position and strength.",
    tipLink: { text: "中央氣象署颱風消息 ↗", href: "https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html" },
    labels: [
      { name: "台灣", lat: 23.7, lon: 121.0 },
      { name: "日本", lat: 36.2, lon: 138.3 },
      { name: "中國", lat: 34.0, lon: 108.0 },
      { name: "韓國", lat: 36.5, lon: 127.8 },
      { name: "菲律賓", lat: 12.9, lon: 121.8 },
      { name: "印尼", lat: -2.5, lon: 118.0 },
      { name: "澳洲", lat: -25.0, lon: 133.0 },
      { name: "🌀 颱風常在這裡生成", lat: 13, lon: 148, className: "sat-zone" },
    ],
  },
  atlantic: {
    label: "大西洋",
    subLon: -75.2,
    bands: {
      geocolor: { label: "真色", goes: "GEOCOLOR" },
      ir: { label: "紅外線", goes: "13" },
    },
    source: "NOAA GOES-19",
    tip: "颶風跟颱風是同一種天氣現象,只是海域不同的叫法。一樣找白色螺旋雲團跟颶風眼,正確位置與強度請看官方發布。",
    tipEn: "A hurricane is the same phenomenon as a typhoon, just named differently by ocean. Same spiral clouds and eye — check official forecasts for exact position and strength.",
    tipLink: { text: "美國國家颶風中心 NHC ↗", href: "https://www.nhc.noaa.gov/" },
    labels: [
      { name: "美國", lat: 39.0, lon: -98.0 },
      { name: "佛羅里達", lat: 27.8, lon: -81.5 },
      { name: "古巴", lat: 21.5, lon: -79.0 },
      { name: "加勒比海", lat: 15.5, lon: -68.0 },
      { name: "巴西", lat: -10.0, lon: -55.0 },
      { name: "西非", lat: 12.0, lon: -12.0 },
      { name: "🌀 颶風常在這裡生成", lat: 13, lon: -40, className: "sat-zone" },
    ],
  },
};

// 2026/09 新增:把衛星圖也貼到真正的 3D 地球上(不只是平面照片),可以直接
// 轉動地球本身的視角去看。實測 GOES(大西洋)本來就開放跨網域讀取像素,可以
// 直接當 WebGL 材質用;向日葵(西太平洋)還是沒開放,材質載入會失敗——這是
// 預期中的情況,失敗就靜靜略過,2D 那張照片版本不受影響照常顯示。之後如果
// 幫向日葵也做一個圖片代理(跟航班代理同樣做法,轉發圖片位元組+補 CORS
// 標頭),這裡不用改,失敗會自動變成成功。
//
// 衛星圖是「從外太空看地球」的正射投影圓盤照片,不是攤平的經緯度地圖,沒辦法
// 直接當一般貼圖包住整顆球(球面 UV 跟這張圖的座標系不是同一套)。這裡用自訂
// shader,對球面上每一點反推「站在衛星角度看,這裡對應照片上的哪個座標」
// (跟 projectLabel 算地標位置用的是同一套正射投影公式,方向相反),算出來
// 落在圓盤外(地球背對衛星那一面)就直接不畫,只有衛星實際看得到的那半球
// 會疊上真的雲圖,邊緣用 smoothstep 羽化避免出現生硬的圓形邊界。
const SAT_VERTEX = `
varying vec3 vPos;
void main() {
  vPos = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SAT_FRAGMENT = `
uniform sampler2D uTex;
uniform float uSubLon;
uniform float uHasTex;
varying vec3 vPos;
const float PI = 3.14159265358979;
void main() {
  if (uHasTex < 0.5) discard;
  float lat = asin(clamp(vPos.y, -1.0, 1.0));
  float lon = atan(-vPos.z, vPos.x);
  float dLon = mod(lon - uSubLon + PI, 2.0 * PI) - PI;
  float vis = cos(lat) * cos(dLon);
  if (vis < 0.0) discard;
  float u = 0.5 + 0.5 * cos(lat) * sin(dLon);
  float v = 0.5 - 0.5 * sin(lat);
  vec4 tex = texture2D(uTex, vec2(u, v));
  float edge = smoothstep(0.0, 0.12, vis);
  gl_FragColor = vec4(tex.rgb, tex.a * edge);
}
`;

function createGlobeOverlay(globeObject) {
  if (!globeObject) return { setVisible() {}, applyTexture() {}, clear() {} };

  const material = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null }, uSubLon: { value: 0 }, uHasTex: { value: 0 } },
    vertexShader: SAT_VERTEX,
    fragmentShader: SAT_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 96), material);
  mesh.renderOrder = 2;
  mesh.visible = false;
  globeObject.add(mesh);

  const loader = new THREE.TextureLoader();
  loader.crossOrigin = "anonymous";
  let currentTex = null;

  return {
    setVisible(v) { mesh.visible = !!v; },
    clear() { material.uniforms.uHasTex.value = 0; },
    applyTexture(url, subLonDeg) {
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        material.uniforms.uTex.value = tex;
        material.uniforms.uSubLon.value = (subLonDeg * Math.PI) / 180;
        material.uniforms.uHasTex.value = 1;
        if (currentTex && currentTex !== tex) currentTex.dispose();
        currentTex = tex;
      }, undefined, () => {
        // 預期中的失敗(來源沒開 CORS,例如向日葵)——安靜略過,2D 照片版本
        // 不受影響照常顯示,不用把這個當成錯誤處理。
      });
    },
  };
}

export function createSatellitePanel({ globeObject } = {}) {
  const panel = document.getElementById("satellite-panel");
  const img = document.getElementById("satellite-img");
  const caption = document.getElementById("satellite-caption");
  const closeBtn = document.getElementById("satellite-close");
  const labelsEl = document.getElementById("satellite-labels");
  const bandsEl = panel?.querySelector(".sat-bands");
  const regionBtns = panel ? [...panel.querySelectorAll("[data-region]")] : [];
  const tipTextEl = document.getElementById("satellite-tip-text");
  const tipEnEl = document.getElementById("satellite-tip-en");
  const tipLinkEl = document.getElementById("satellite-tip-link");
  if (!panel || !img) return { setEnabled() {}, isEnabled: () => false };

  const globeOverlay = createGlobeOverlay(globeObject);

  let enabled = false;
  let region = "wpac";
  let band = "ir";
  let timer = null;
  let tries = 0;
  let baseTime = null;

  function setRegionUI() {
    regionBtns.forEach((b) => b.classList.toggle("active", b.dataset.region === region));
    const r = REGIONS[region];
    bandsEl.innerHTML = Object.entries(r.bands).map(([key, b]) =>
      `<button type="button" data-band="${key}" class="${key === band ? "active" : ""}">${b.label}</button>`
    ).join("");
    bandsEl.querySelectorAll("[data-band]").forEach((b) => b.addEventListener("click", () => {
      if (band === b.dataset.band) return;
      band = b.dataset.band;
      setRegionUI();
      load();
    }));
    if (tipTextEl) tipTextEl.textContent = r.tip;
    if (tipEnEl) tipEnEl.textContent = r.tipEn;
    if (tipLinkEl) { tipLinkEl.textContent = r.tipLink.text; tipLinkEl.href = r.tipLink.href; }
  }

  function renderLabels() {
    if (!labelsEl) return;
    labelsEl.innerHTML = "";
    const r = REGIONS[region];
    for (const l of r.labels) {
      const p = projectLabel(l, r.subLon);
      if (!p) continue;
      const span = document.createElement("span");
      if (l.className) span.className = l.className;
      span.textContent = l.name;
      span.style.left = `${p.leftPct}%`;
      span.style.top = `${p.topPct}%`;
      labelsEl.appendChild(span);
    }
  }

  function load() {
    tries = 0;
    const r = REGIONS[region], b = r.bands[band];
    globeOverlay.clear();
    if (b.goes) {
      const url = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/${b.goes}/678x678.jpg?t=${Date.now()}`;
      img.src = url;
      globeOverlay.applyTexture(url, r.subLon);
      caption.textContent = `${b.label} · 每 10 分鐘更新 · 現在台灣時間 ${fmtTaipei(new Date())} · 資料來源 ${r.source}`;
    } else {
      baseTime = roundedNow();
      tryLoad();
    }
  }
  function tryLoad() {
    const r = REGIONS[region], b = r.bands[band];
    const d = new Date(baseTime.getTime() - tries * STEP_MIN * 60000);
    const url = himawariUrl(b.himawari, d);
    img.src = url;
    globeOverlay.applyTexture(url, r.subLon);
    caption.textContent = `${b.label} · ${fmtTaipei(d)} 台灣時間 · 資料來源 ${r.source}`;
  }
  img.addEventListener("error", () => {
    if (!enabled) return;
    const b = REGIONS[region].bands[band];
    if (b.goes) { caption.textContent = "圖片暫時載入不到,稍後再試。"; return; }
    tries++;
    if (tries <= MAX_TRIES) tryLoad();
    else caption.textContent = "圖片暫時載入不到,稍後再試。";
  });

  if (closeBtn) closeBtn.addEventListener("click", () => {
    setEnabled(false);
    document.getElementById("satellite-toggle")?.setAttribute("aria-pressed", "false");
  });
  regionBtns.forEach((b) => b.addEventListener("click", () => {
    if (region === b.dataset.region) return;
    region = b.dataset.region;
    band = Object.keys(REGIONS[region].bands)[0];
    setRegionUI();
    renderLabels();
    load();
  }));

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    globeOverlay.setVisible(enabled);
    if (enabled) {
      setRegionUI();
      renderLabels();
      load();
      if (!timer) timer = setInterval(load, CHECK_MS);
    } else {
      clearInterval(timer);
      timer = null;
    }
  }

  return { setEnabled, isEnabled: () => enabled };
}
