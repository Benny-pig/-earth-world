// 西太平洋即時衛星雲圖:日本 NICT 向日葵9號氣象衛星,免金鑰、公開給大家看。
// 沒有乾淨的 CORS JSON API 可以查「最新一張是幾點」,直接用 <img> 顯示圖片本身
// 不需要 CORS(瀏覽器一律准許跨網域顯示圖片,只有要讀像素資料才會被擋)。做法
// 是自己猜「現在時間往回推、對齊到整 10 分鐘」的時間戳記,猜錯(圖片還沒發布)
// 就用 onerror 自動往前一格再試,不用另外接一個會被擋的 API 才能知道最新時間。
const BASE = "https://himawari8.nict.go.jp/img";
// 真色只有白天看得到雲(夜間半球是黑的);紅外線不分晝夜都看得到雲頂溫度,
// 追颱風更實用,兩種都給,預設用紅外線。
const BANDS = {
  ir: { label: "紅外線", path: "FULL_24h/B13" },
  true_color: { label: "真色", path: "D531106" },
};
const PUBLISH_DELAY_MIN = 20; // 觀測到公開圖片的典型延遲,抓最新的話很容易還沒發布
const STEP_MIN = 10;
const MAX_TRIES = 6;

function pad(n) { return String(n).padStart(2, "0"); }
function urlFor(bandPath, d) {
  const y = d.getUTCFullYear(), mo = pad(d.getUTCMonth() + 1), da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours()), mi = pad(d.getUTCMinutes());
  return `${BASE}/${bandPath}/1d/550/${y}/${mo}/${da}/${h}${mi}00_0_0.png`;
}
function roundedNow() {
  const d = new Date(Date.now() - PUBLISH_DELAY_MIN * 60000);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / STEP_MIN) * STEP_MIN, 0, 0);
  return d;
}

export function createSatellitePanel() {
  const panel = document.getElementById("satellite-panel");
  const img = document.getElementById("satellite-img");
  const caption = document.getElementById("satellite-caption");
  const closeBtn = document.getElementById("satellite-close");
  const bandBtns = panel ? [...panel.querySelectorAll("[data-band]")] : [];
  if (!panel || !img) return { setEnabled() {}, isEnabled: () => false };

  let enabled = false;
  let band = "ir";
  let timer = null;
  let tries = 0;
  let baseTime = null;

  function setBandUI() {
    bandBtns.forEach((b) => b.classList.toggle("active", b.dataset.band === band));
  }

  function load() {
    tries = 0;
    baseTime = roundedNow();
    tryLoad();
  }
  function tryLoad() {
    const d = new Date(baseTime.getTime() - tries * STEP_MIN * 60000);
    img.src = urlFor(BANDS[band].path, d);
    caption.textContent = `${BANDS[band].label} · ${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC · 資料來源 NICT 向日葵9號`;
  }
  img.addEventListener("error", () => {
    if (!enabled) return;
    tries++;
    if (tries <= MAX_TRIES) tryLoad();
    else caption.textContent = "圖片暫時載入不到,稍後再試。";
  });

  if (closeBtn) closeBtn.addEventListener("click", () => {
    setEnabled(false);
    document.getElementById("satellite-toggle")?.setAttribute("aria-pressed", "false");
  });
  bandBtns.forEach((b) => b.addEventListener("click", () => {
    if (band === b.dataset.band) return;
    band = b.dataset.band;
    setBandUI();
    load();
  }));

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (enabled) {
      setBandUI();
      load();
      if (!timer) timer = setInterval(load, STEP_MIN * 60000);
    } else {
      clearInterval(timer);
      timer = null;
    }
  }

  return { setEnabled, isEnabled: () => enabled };
}
