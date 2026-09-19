// 即時衛星雲圖:西太平洋用日本 NICT 向日葵9號、大西洋用美國 NOAA GOES-19,
// 兩個都免金鑰、公開圖片。地球同步衛星固定盯著自己那半球,看不到另一半——
// 這是物理限制,想看大西洋只能換一顆真的看得到大西洋的衛星,不是切換設定
// 就能讓同一張圖片變出另一半地球。
//
// 向日葵沒有乾淨的 CORS JSON API 可以查「最新一張是幾點」,得自己猜時間戳記
// (見 himawariUrl);GOES 的 CDN 反而簡單,固定檔名(例如 678x678.jpg)永遠是
// 最新一張,不用猜、也真的有開 CORS(比向日葵更寬鬆)。兩邊都用 <img> 顯示,
// 不需要 CORS 就能單純顯示,猜錯時間的 fallback 只有向日葵需要。
const PUBLISH_DELAY_MIN = 20; // 向日葵觀測到公開圖片的典型延遲,抓最新的話很容易還沒發布
const STEP_MIN = 10;
const MAX_TRIES = 6;

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
    tip: "怎麼看颱風:找一團白色雲系呈螺旋狀捲起、越捲越紮實密實,強的話中心會有一個清楚的小圓圈(颱風眼);紅外線圖裡顏色越亮白代表雲頂越高、通常越劇烈。",
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
    tip: "怎麼看颶風(大西洋這邊的颱風叫「颶風」,是同一種天氣現象、不同海域的名稱):一樣是找螺旋狀的白色雲團、中心有沒有清楚的圓圈(颶風眼)。",
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

export function createSatellitePanel() {
  const panel = document.getElementById("satellite-panel");
  const img = document.getElementById("satellite-img");
  const caption = document.getElementById("satellite-caption");
  const closeBtn = document.getElementById("satellite-close");
  const labelsEl = document.getElementById("satellite-labels");
  const bandsEl = panel?.querySelector(".sat-bands");
  const regionBtns = panel ? [...panel.querySelectorAll("[data-region]")] : [];
  const tipTextEl = document.getElementById("satellite-tip-text");
  const tipLinkEl = document.getElementById("satellite-tip-link");
  if (!panel || !img) return { setEnabled() {}, isEnabled: () => false };

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
    if (b.goes) {
      img.src = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/${b.goes}/678x678.jpg?t=${Date.now()}`;
      caption.textContent = `${b.label} · 每 10 分鐘更新 · 資料來源 ${r.source}`;
    } else {
      baseTime = roundedNow();
      tryLoad();
    }
  }
  function tryLoad() {
    const r = REGIONS[region], b = r.bands[band];
    const d = new Date(baseTime.getTime() - tries * STEP_MIN * 60000);
    img.src = himawariUrl(b.himawari, d);
    caption.textContent = `${b.label} · ${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC · 資料來源 ${r.source}`;
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
    if (enabled) {
      setRegionUI();
      renderLabels();
      load();
      if (!timer) timer = setInterval(load, STEP_MIN * 60000);
    } else {
      clearInterval(timer);
      timer = null;
    }
  }

  return { setEnabled, isEnabled: () => enabled };
}
