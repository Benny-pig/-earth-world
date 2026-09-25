import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

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
const MAX_ROWS = 400;   // 前後 4 小時,桃園合併共掛後約 200 列以內;只是防呆上限

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
  "5Y": "亞特拉斯貨運航空", OD: "馬印航空",
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
// 狀態燈號:綠=準時、藍=已出發/已抵達、黃=延誤/改時間、紅=取消、灰=表定。
// TDX 實際回傳的狀態字串有中英並列也有只有中文的(「出發DEPARTED」「出發」「已飛」
// 「抵達」「預計22:40到站」…)。「預計 xx:xx 出發/到站」是時間有變動,要比
// 「出發/到站」先判斷,不然會被當成已經飛走。
function statusInfo(remark) {
  const s = String(remark || "").trim();
  if (!s) return { label: "表定班次", cls: "" };
  if (/取消|CANCEL/i.test(s)) return { label: s, cls: "ap-bad" };
  if (/延誤|DELAY|時間更改|SCHEDULE ?CHANGE|預計/i.test(s)) return { label: s, cls: "ap-warn" };
  if (/已到|抵達|到站|ARRIVED|已飛|出發|DEPARTED|降落|LANDED/i.test(s)) return { label: s, cls: "ap-done" };
  if (/準時|ON ?TIME|表定/i.test(s)) return { label: s, cls: "ap-ontime" };
  return { label: s, cls: "" };
}
// 實測發現 TDX 一次回傳的資料橫跨「今天、明天、後天」三天(不是只有今天),
// 原本排序只比對時分(不看日期),會把不同天但時分剛好相同的班次混在一起
// 排——例如今天 08:00 跟明天 08:00 算出來的「跟現在時刻差幾分鐘」一樣,
// 導致早上快 10 點,畫面卻還卡在顯示 07:55 這種不合理的結果(明明應該早就
// 往後推進到接近中午的班次)。改成組出完整的日期時間再算真正的時間差,
// 不只比時分。時間字串本身沒有時區資訊,視為台灣本地時刻,加上 +08:00
// 再解析,不管開啟網站的人在哪個時區都會算對。
// 原本留 2 小時前的班次、最多 40 列——桃園機場 2 小時內就有 75 班(含共掛),清單
// 前 40 列全是已經飛走的,下午 1:40 看到的最晚只到 12:45。改成列出前後 4 小時
// (往上捲看剛飛走/降落的、往下是接下來的),共掛班號合併成一列,清單打開自動捲到
// 「現在」。深夜班次少,接下來 4 小時不滿 20 班的話,至少列到接下來的 20 班。
const PAST_WINDOW_MS = 4 * 3600_000;
const FUTURE_WINDOW_MS = 4 * 3600_000;
const MIN_UPCOMING = 20;
const REMIND_MS = 30 * 60_000;   // 半小時提醒

function toTimestamp(s) {
  if (typeof s !== "string" || s.length < 16) return null;
  const t = new Date(`${s}:00+08:00`).getTime();
  return Number.isFinite(t) ? t : null;
}
function sortByTime(list, key) {
  const now = Date.now();
  return list
    .map((f) => {
      const t = toTimestamp(f[key]);
      if (t == null) return null;
      return { f, diff: t - now };
    })
    .filter((x) => x && x.diff >= -PAST_WINDOW_MS)
    .sort((a, b) => a.diff - b.diff)
    .filter((x, i, arr) => {
      if (x.diff <= FUTURE_WINDOW_MS) return true;
      const firstUp = arr.findIndex((y) => y.diff >= 0);
      return firstUp >= 0 && i < firstUp + MIN_UPCOMING;
    });
}

// 共掛班號:同一架飛機常掛好幾家航空公司的班號(例如 BR178 同時是 TG6354、NH5834),
// TDX 每個班號各一筆,桃園出境 2,107 筆裡其實只有 1,166 班。表定時間、對方機場、航廈、
// 登機門/行李轉盤都一樣的視為同一班,以班號數字最小的當主班號(實際執飛的航空公司
// 班號通常比較短),其他列在「共掛」。貨機不列。
function mergeCodeshares(list, dir) {
  const other = dir === "departure" ? "ArrivalAirportID" : "DepartureAirportID";
  const timeKey = dir === "departure" ? "ScheduleDepartureTime" : "ScheduleArrivalTime";
  const groups = new Map();
  for (const f of list) {
    if (f.IsCargo) continue;
    const k = [f[timeKey], f[other], f.Terminal, f.Gate, f.BaggageClaim].join("|");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const num = (f) => parseInt(f.FlightNumber, 10) || 99999;
  return [...groups.values()].map((g) => {
    g.sort((a, b) => num(a) - num(b));
    return { ...g[0], codeshares: g.slice(1).map((f) => `${f.AirlineID || ""}${f.FlightNumber || ""}`) };
  });
}
function placeLabel(code) {
  const name = AIRPORT_NAMES[code];
  return name ? `${name}(${code})` : (code || "—");
}

export function createAirportBoard() {
  const panel = document.getElementById("airport-panel");
  const closeBtn = document.getElementById("airport-close");
  const refreshBtn = document.getElementById("airport-refresh");
  const listEl = document.getElementById("airport-list");
  const captionEl = document.getElementById("airport-caption");
  if (!panel || !listEl) return { setEnabled() {}, isEnabled: () => false };
  makeDraggable(panel, panel.querySelector(".sat-head"));

  const airportBtns = [...panel.querySelectorAll("[data-iata]")];
  const dirBtns = [...panel.querySelectorAll("[data-dir]")];

  let enabled = false;
  let iata = "TPE";
  let dir = "departure";
  let timer = null;
  let data = null;
  let scrollToNow = true;
  let tick = null;

  function render() {
    if (!data || !data.airports || !data.airports[iata]) {
      listEl.innerHTML = `<div class="ap-empty">暫時查不到航班資料,稍後會自動重試</div>`;
      return;
    }
    const list = mergeCodeshares(data.airports[iata][dir] || [], dir);
    const sorted = sortByTime(list, dir === "departure" ? "ScheduleDepartureTime" : "ScheduleArrivalTime").slice(0, MAX_ROWS);
    if (!sorted.length) {
      listEl.innerHTML = `<div class="ap-empty">目前沒有航班資料</div>`;
      return;
    }
    const rows = sorted.map((x) => x.f);
    const firstUpcoming = sorted.findIndex((x) => x.diff >= 0);
    // 半小時提醒:30 分鐘內出發/抵達的班次全部醒目標示(只標最近一班的話常常只剩 5~10 分鐘,
    // 讀者根本趕不上);30 分鐘內一班都沒有時,改標離現在最近的下一班(同一分鐘的幾班一起標)。
    // 一小時內的班次另外顯示「還有 X 分鐘」倒數。
    const soon = sorted.some((x) => x.diff >= 0 && x.diff <= REMIND_MS);
    const nearestTime = firstUpcoming >= 0 ? rows[firstUpcoming][dir === "departure" ? "ScheduleDepartureTime" : "ScheduleArrivalTime"] : null;
    // 重畫前記下「目前捲動位置距離『現在』分隔線多遠」,重畫後維持同樣的相對位置
    const oldNow = listEl.querySelector(".ap-now");
    const anchor = oldNow ? listEl.scrollTop - (oldNow.offsetTop - listEl.offsetTop) : null;
    const nowLabel = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const dirLabel = dir === "departure" ? "飛往" : "來自";
    listEl.innerHTML = rows.map((f, i) => {
      // 對照表查不到航空公司就不要重複顯示同一個代碼(例如「5Y 5Y4608」看起來
      // 像故障),改顯示「代碼(航空公司代碼)」提示這是查不到中文名的公司,
      // 而不是假裝那就是公司名稱。
      const airline = AIRLINE_NAMES[f.AirlineID] || (f.AirlineID ? `${f.AirlineID}(航空公司代碼)` : "—");
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
      const divider = i === firstUpcoming ? `<div class="ap-now">── 現在 ${esc(nowLabel)} ──</div>` : "";
      const past = firstUpcoming < 0 || i < firstUpcoming;
      const nearest = !past && (soon
        ? sorted[i].diff <= REMIND_MS
        : (dir === "departure" ? f.ScheduleDepartureTime : f.ScheduleArrivalTime) === nearestTime);
      const mins = Math.round(sorted[i].diff / 60_000);
      const eta = !past && mins <= 60
        ? `<span class="ap-eta">${mins <= 0 ? "就是現在" : `還有 ${mins} 分鐘`}</span>` : "";
      return `${divider}<div class="ap-row${past ? " ap-past" : ""}${nearest ? " ap-nearest" : ""}">
        ${nearest ? `<div class="ap-nearest-tag">⏰ ${soon ? `30 分鐘內${dir === "departure" ? "出發" : "抵達"}` : `最近航班(下一班${dir === "departure" ? "出發" : "抵達"})`}</div>` : ""}
        <div class="ap-row-top">
          <span class="ap-flight">${esc(airline)} <b>${esc(no || "—")}</b> ${eta}</span>
          <span class="ap-badge ${status.cls}">${esc(status.label)}</span>
        </div>
        <div class="ap-row-mid">${esc(dirLabel)} ${esc(placeLabel(place))}</div>
        <div class="ap-row-bottom">
          <span>表定 ${scheduled}</span>
          ${otherTime && otherTime.value !== scheduled ? `<span>${esc(otherTime.label)} ${otherTime.value}</span>` : ""}
          ${gateInfo ? `<span>${esc(gateInfo)}</span>` : ""}
          ${f.codeshares && f.codeshares.length ? `<span class="ap-codeshare">共掛 ${esc(f.codeshares.join("、"))}</span>` : ""}
        </div>
      </div>`;
    }).join("");
    // 切換機場/方向或第一次載入時捲到「現在」;自動更新時以「現在」分隔線為基準維持讀者
    // 原本的相對位置(直接沿用 scrollTop 的話,列表內容變了位置會跑掉,之前實測會跳到最底)
    const nowEl = listEl.querySelector(".ap-now");
    if (nowEl) {
      const nowPos = nowEl.offsetTop - listEl.offsetTop;
      listEl.scrollTop = scrollToNow || anchor == null ? nowPos : nowPos + anchor;
    }
    scrollToNow = false;
  }

  async function refresh() {
    if (!enabled) return;
    try {
      // TDX 偶爾對 Worker 換 token 回 429(太頻繁),通常隔幾秒就好——自動重試兩次
      let r = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((res) => setTimeout(res, 3000 * attempt));
        r = await fetch(`${PROXY_URL}/?airports=${AIRPORTS.map((a) => a.iata).join(",")}`).catch(() => null);
        if (r && r.ok) break;
      }
      if (!r || !r.ok) {
        if (!data) render();
        if (captionEl) captionEl.textContent = "資料來源暫時忙線中,稍後會自動重試";
        return;
      }
      data = await r.json();
      if (captionEl) captionEl.textContent = `資料來源:交通部 TDX 運輸資料流通服務 · 每 3 分鐘更新 · 共掛班號已合併、不列貨機`;
      render();
    } catch (e) {
      console.error("[airport-board] refresh failed:", e);
    }
  }

  airportBtns.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.iata === iata) return;
    iata = b.dataset.iata;
    airportBtns.forEach((x) => x.classList.toggle("active", x === b));
    scrollToNow = true;
    render();
  }));
  dirBtns.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.dir === dir) return;
    dir = b.dataset.dir;
    dirBtns.forEach((x) => x.classList.toggle("active", x === b));
    scrollToNow = true;
    render();
  }));
  if (closeBtn) closeBtn.addEventListener("click", () => {
    setEnabled(false);
    document.getElementById("airport-toggle")?.setAttribute("aria-pressed", "false");
  });
  if (refreshBtn) refreshBtn.addEventListener("click", () => { if (enabled) refresh(); });

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (enabled) {
      scrollToNow = true;
      refresh();
      if (!timer) timer = setInterval(refresh, REFRESH_MS);
      if (!tick) tick = setInterval(() => { if (data) render(); }, 60_000);
    } else {
      clearInterval(timer);
      clearInterval(tick);
      timer = tick = null;
    }
  }

  return { setEnabled, isEnabled: () => enabled };
}
