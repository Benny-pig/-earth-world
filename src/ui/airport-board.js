// 台灣機場即時航班時刻表(桃園/松山/高雄/台中)。資料源是交通部 TDX 運輸
// 資料流通服務,透過 cloudflare-worker/flight-proxy.js 的 ?airports= 這個
// 路由查詢(跟「當地即時航班」共用同一支 Worker,不是另外架一支)。
const PROXY_URL = "https://earth-world-flights.a7779782.workers.dev";
const AIRPORTS = [
  { iata: "TPE", name: "桃園" },
  { iata: "TSA", name: "松山" },
  { iata: "KHH", name: "高雄" },
  { iata: "RMQ", name: "台中" },
];
const REFRESH_MS = 3 * 60_000; // TDX 免費額度每月 4,500 次,一次查 4 個機場只算 1 次,3 分鐘一次很夠用
const MAX_ROWS = 40;

function fmtTime(s) {
  return typeof s === "string" && s.length >= 16 ? s.slice(11, 16) : "—";
}
function remarkClass(remark) {
  const s = String(remark || "");
  if (/取消|CANCEL/i.test(s)) return "ap-bad";
  if (/延誤|DELAY/i.test(s)) return "ap-warn";
  return "";
}
function sortByTime(list, key) {
  return [...list].sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || "")));
}

export function createAirportBoard() {
  const panel = document.getElementById("airport-panel");
  const closeBtn = document.getElementById("airport-close");
  const listEl = document.getElementById("airport-list");
  const captionEl = document.getElementById("airport-caption");
  if (!panel || !listEl) return { setEnabled() {}, isEnabled: () => false };

  const airportBtns = [...panel.querySelectorAll("[data-iata]")];
  const dirBtns = [...panel.querySelectorAll("[data-dir]")];

  let enabled = false;
  let iata = "TPE";
  let dir = "departure";
  let timer = null;
  let data = null;

  function render() {
    if (!data || !data.airports || !data.airports[iata]) {
      listEl.innerHTML = `<div class="ap-empty">暫時查不到航班資料,稍後會自動重試</div>`;
      return;
    }
    const list = data.airports[iata][dir] || [];
    const rows = sortByTime(list, dir === "departure" ? "ScheduleDepartureTime" : "ScheduleArrivalTime").slice(0, MAX_ROWS);
    if (!rows.length) {
      listEl.innerHTML = `<div class="ap-empty">目前沒有航班資料</div>`;
      return;
    }
    listEl.innerHTML = rows.map((f) => {
      const no = `${f.AirlineID || ""}${f.FlightNumber || ""}`;
      const place = dir === "departure" ? f.ArrivalAirportID : f.DepartureAirportID;
      const scheduled = fmtTime(dir === "departure" ? f.ScheduleDepartureTime : f.ScheduleArrivalTime);
      const actual = fmtTime(dir === "departure" ? (f.ActualDepartureTime || f.EstimatedDepartureTime) : (f.ActualArrivalTime || f.EstimatedArrivalTime));
      const remark = dir === "departure" ? f.DepartureRemark : f.ArrivalRemark;
      const gateInfo = dir === "departure" ? [f.Terminal && `T${f.Terminal}`, f.Gate].filter(Boolean).join(" ") : [f.Terminal && `T${f.Terminal}`, f.BaggageClaim && `轉盤${f.BaggageClaim}`].filter(Boolean).join(" ");
      return `<div class="ap-row">
        <span class="ap-no">${no || "—"}</span>
        <span class="ap-place">${place || "—"}</span>
        <span class="ap-time">${scheduled}${actual && actual !== scheduled ? ` → ${actual}` : ""}</span>
        <span class="ap-remark ${remarkClass(remark)}">${remark || gateInfo || ""}</span>
      </div>`;
    }).join("");
  }

  async function refresh() {
    if (!enabled) return;
    try {
      const r = await fetch(`${PROXY_URL}/?airports=${AIRPORTS.map((a) => a.iata).join(",")}`);
      if (!r.ok) {
        if (!data) render();
        if (captionEl) captionEl.textContent = "資料來源暫時忙線中,稍後會自動重試";
        return;
      }
      data = await r.json();
      if (captionEl) captionEl.textContent = `資料來源:交通部 TDX 運輸資料流通服務 · 每 3 分鐘更新`;
      render();
    } catch (e) {
      console.error("[airport-board] refresh failed:", e);
    }
  }

  airportBtns.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.iata === iata) return;
    iata = b.dataset.iata;
    airportBtns.forEach((x) => x.classList.toggle("active", x === b));
    render();
  }));
  dirBtns.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.dir === dir) return;
    dir = b.dataset.dir;
    dirBtns.forEach((x) => x.classList.toggle("active", x === b));
    render();
  }));
  if (closeBtn) closeBtn.addEventListener("click", () => {
    setEnabled(false);
    document.getElementById("airport-toggle")?.setAttribute("aria-pressed", "false");
  });

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (enabled) {
      refresh();
      if (!timer) timer = setInterval(refresh, REFRESH_MS);
    } else {
      clearInterval(timer);
      timer = null;
    }
  }

  return { setEnabled, isEnabled: () => enabled };
}
