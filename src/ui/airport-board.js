import { esc } from "../lib/esc.js";

// 台灣機場即時航班時刻表(桃園/松山/高雄/台中)。資料源是交通部 TDX 運輸
// 資料流通服務,透過 cloudflare-worker/flight-proxy.js 的 ?airports= 這個
// 路由查詢(跟「世界機場航班」共用同一支 Worker,不是另外架一支)。
const PROXY_URL = "https://earth-world-flights.a7779782.workers.dev";
const AIRPORTS = [
  { iata: "TPE", name: "桃園" },
  { iata: "TSA", name: "松山" },
  { iata: "KHH", name: "高雄" },
  { iata: "RMQ", name: "台中" },
];
const REFRESH_MS = 3 * 60_000; // TDX 免費額度每月 4,500 次,一次查 4 個機場只算 1 次,3 分鐘一次很夠用
const MAX_ROWS = 40;

// 只收錄常見、確定譯名的航空公司/機場代碼,查不到就顯示原始代碼——不瞎猜
// 沒把握的譯名,寧可讓使用者看到代碼自己查,也不要顯示錯的中文名稱。
const AIRLINE_NAMES = {
  CI: "中華航空", BR: "長榮航空", JX: "星宇航空", IT: "台灣虎航", B7: "立榮航空",
  AE: "華信航空", DA: "德安航空",
  CX: "國泰航空", JL: "日本航空", NH: "全日空", KE: "大韓航空", OZ: "韓亞航空",
  LJ: "真航空", "7C": "濟州航空", TW: "德威航空", ZE: "易斯達航空",
  SQ: "新加坡航空", TG: "泰國航空", MH: "馬來西亞航空", PR: "菲律賓航空",
  VN: "越南航空", VJ: "越捷航空", "5J": "宿霧太平洋航空",
  CA: "中國國際航空", MU: "中國東方航空", CZ: "中國南方航空",
  AK: "亞洲航空", FD: "泰國亞洲航空", D7: "亞洲航空X",
  UA: "美國聯合航空", AA: "美國航空", DL: "達美航空", AS: "阿拉斯加航空", AC: "加拿大航空",
  BA: "英國航空", KL: "荷蘭皇家航空", LH: "漢莎航空", QF: "澳洲航空",
  EK: "阿聯酋航空", QR: "卡達航空",
};
const AIRPORT_NAMES = {
  NRT: "東京成田", HND: "東京羽田", KIX: "大阪關西", NGO: "名古屋", FUK: "福岡", CTS: "札幌",
  ICN: "首爾仁川", GMP: "首爾金浦", PUS: "釜山", CJU: "濟州",
  HKG: "香港", MFM: "澳門",
  PVG: "上海浦東", SHA: "上海虹橋", PEK: "北京首都", PKX: "北京大興", CAN: "廣州", SZX: "深圳", XMN: "廈門", CTU: "成都",
  SIN: "新加坡", BKK: "曼谷", DMK: "曼谷", KUL: "吉隆坡", MNL: "馬尼拉", CEB: "宿霧",
  SGN: "胡志明市", HAN: "河內", DAD: "峴港", RGN: "仰光", DPS: "峇里島", CGK: "雅加達",
  DXB: "杜拜", DOH: "多哈",
  LAX: "洛杉磯", SFO: "舊金山", SEA: "西雅圖", JFK: "紐約", ORD: "芝加哥", YVR: "溫哥華", ANC: "安克拉治",
  LHR: "倫敦", CDG: "巴黎", FRA: "法蘭克福", AMS: "阿姆斯特丹",
  SYD: "雪梨", MEL: "墨爾本", AKL: "奧克蘭",
  MZG: "澎湖", KNH: "金門", TTT: "台東", HUN: "花蓮", MFK: "馬祖北竿", LZN: "馬祖南竿",
};

function fmtTime(s) {
  return typeof s === "string" && s.length >= 16 ? s.slice(11, 16) : "—";
}
function statusInfo(remark) {
  const s = String(remark || "").trim();
  if (!s) return { label: "表定班次", cls: "" };
  if (/取消|CANCEL/i.test(s)) return { label: s, cls: "ap-bad" };
  if (/延誤|DELAY/i.test(s)) return { label: s, cls: "ap-warn" };
  if (/已到|ARRIVED|已飛|DEPARTED|降落|LANDED/i.test(s)) return { label: s, cls: "ap-good" };
  return { label: s, cls: "" };
}
function sortByTime(list, key) {
  return [...list].sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || "")));
}
function placeLabel(code) {
  const name = AIRPORT_NAMES[code];
  return name ? `${name}(${code})` : (code || "—");
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
    const dirLabel = dir === "departure" ? "飛往" : "來自";
    listEl.innerHTML = rows.map((f) => {
      const airline = AIRLINE_NAMES[f.AirlineID] || f.AirlineID || "—";
      const no = `${f.AirlineID || ""}${f.FlightNumber || ""}`;
      const place = dir === "departure" ? f.ArrivalAirportID : f.DepartureAirportID;
      const scheduled = fmtTime(dir === "departure" ? f.ScheduleDepartureTime : f.ScheduleArrivalTime);
      const actualRaw = dir === "departure" ? f.ActualDepartureTime : f.ActualArrivalTime;
      const estRaw = dir === "departure" ? f.EstimatedDepartureTime : f.EstimatedArrivalTime;
      const otherTime = actualRaw ? { label: "實際", value: fmtTime(actualRaw) } : (estRaw ? { label: "預計", value: fmtTime(estRaw) } : null);
      const remark = dir === "departure" ? f.DepartureRemark : f.ArrivalRemark;
      const status = statusInfo(remark);
      const gateInfo = dir === "departure"
        ? [f.Terminal && `第${f.Terminal}航廈`, f.Gate && `${f.Gate}登機門`].filter(Boolean).join(" · ")
        : [f.Terminal && `第${f.Terminal}航廈`, f.BaggageClaim && `${f.BaggageClaim}號行李轉盤`].filter(Boolean).join(" · ");
      return `<div class="ap-row">
        <div class="ap-row-top">
          <span class="ap-flight">${esc(airline)} <b>${esc(no || "—")}</b></span>
          <span class="ap-badge ${status.cls}">${esc(status.label)}</span>
        </div>
        <div class="ap-row-mid">${esc(dirLabel)} ${esc(placeLabel(place))}</div>
        <div class="ap-row-bottom">
          <span>表定 ${scheduled}</span>
          ${otherTime && otherTime.value !== scheduled ? `<span>${esc(otherTime.label)} ${otherTime.value}</span>` : ""}
          ${gateInfo ? `<span>${esc(gateInfo)}</span>` : ""}
        </div>
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
