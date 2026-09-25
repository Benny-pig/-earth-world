import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// 🚆 鐵路時刻:高鐵/台鐵起訖站 + 日期查當天班次。資料是交通部 TDX,經我們的
// Cloudflare Worker 轉發(/?rail=<TDX 路徑>,金鑰在 Worker 的 Secrets)。
// 車站清單是靜態檔 data/rail/stations.json(tools/build-rail-stations.py)。
//   高鐵:DailyTimetable/OD 當日班次 + AvailableSeatStatusList 剩餘座位(只有今天)
//   台鐵:DailyTrainTimetable/OD 當日班次 + TrainLiveBoard 列車即時誤點(只有今天)
const PROXY_URL = "https://earth-world-flights.a7779782.workers.dev";
const STATIONS_URL = "data/rail/stations.json";
const DEFAULT_OD = { thsr: ["1000", "1070"], tra: ["1000", "3300"] };   // 台北→左營、臺北→臺中
const STORE_KEY = "earth-world.rail-od";
const LIVE_REFRESH_MS = 60 * 1000;
const SEAT_LABEL = { Available: ["尚有座位", "ok"], Limited: ["座位有限", "warn"], Full: ["已售完", "bad"] };
const TRIP_LINE = { 1: "經山線", 2: "經海線", 3: "經成追線" };

// 台灣時間的今天/明天日期字串(YYYY-MM-DD)與現在分鐘數
const twDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date(Date.now() + offsetDays * 86400000));
function twNowMin() {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date()).split(":").map(Number);
  return (h % 24) * 60 + m;
}
const toMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return h * 60 + m; };
function fmtDur(dep, arr) {
  let d = toMin(arr) - toMin(dep);
  if (d < 0) d += 1440;
  const h = Math.floor(d / 60), m = d % 60;
  return h ? `${h} 小時 ${m} 分` : `${m} 分`;
}
// 台鐵車種依名稱配色(自強系列紅、莒光橘、復興/區間藍…)
function traTypeClass(name) {
  if (/自強|普悠瑪|太魯閣|EMU3000|新自強/.test(name)) return "rl-t-tc";
  if (/莒光/.test(name)) return "rl-t-cg";
  if (/復興/.test(name)) return "rl-t-fx";
  return "rl-t-local";
}

export function createRailPanel({ onClose, onModeChange }) {
  const panel = document.getElementById("rail-panel");
  if (!panel) return { open() {}, close() {}, isOpen: () => false, mode: () => "thsr" };
  const $ = (id) => document.getElementById(id);
  const fromSel = $("rl-from"), toSel = $("rl-to"), dateInput = $("rl-date");
  const listEl = $("rl-list"), summaryEl = $("rl-summary"), captionEl = $("rl-caption");
  const tabBtns = [...panel.querySelectorAll(".rl-tabs [data-mode]")];
  const dayBtns = [...panel.querySelectorAll(".rl-dates [data-day]")];
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let stations = null;
  let mode = "thsr";
  let dateStr = twDate(0);
  let isOpen = false;
  let reqSeq = 0;
  let liveTimer = null;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { saved = {}; }

  async function loadStations() {
    if (!stations) stations = await fetch(STATIONS_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return stations;
  }

  // Worker 還沒更新時,舊版 Worker 不認得 ?rail=,會回 400「缺少 lat/lon」——要讓讀者知道
  // 是還沒啟用,不是查不到車
  async function railFetch(path) {
    let r = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((res) => setTimeout(res, 2500 * attempt));
      r = await fetch(`${PROXY_URL}/?rail=${path}`).catch(() => null);
      if (r && (r.ok || r.status === 400)) break;
    }
    if (!r) throw Object.assign(new Error("network"), { kind: "net" });
    if (r.status === 400) {
      const t = await r.text();
      throw Object.assign(new Error(t), { kind: /lat\/lon/.test(t) ? "worker-old" : "bad" });
    }
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { kind: "http" });
    return r.json();
  }

  function stationName(id) {
    const list = stations ? stations[mode] : [];
    return list.find((s) => s.id === id)?.zh || id;
  }

  function fillSelects() {
    const list = stations[mode];
    let opts;
    if (mode === "tra") {
      // 台鐵 244 站:依縣市分組(由北到南),選單才找得到
      const groups = new Map();
      for (const s of list) {
        if (!groups.has(s.county)) groups.set(s.county, []);
        groups.get(s.county).push(s);
      }
      opts = [...groups].map(([county, ss]) =>
        `<optgroup label="${esc(county)}">${ss.map((s) => `<option value="${s.id}">${esc(s.zh)}</option>`).join("")}</optgroup>`).join("");
    } else {
      opts = list.map((s) => `<option value="${s.id}">${esc(s.zh)}</option>`).join("");
    }
    fromSel.innerHTML = opts;
    toSel.innerHTML = opts;
    const [f, t] = saved[mode] || DEFAULT_OD[mode];
    fromSel.value = f; toSel.value = t;
    if (!fromSel.value) fromSel.value = DEFAULT_OD[mode][0];
    if (!toSel.value) toSel.value = DEFAULT_OD[mode][1];
  }

  function setMode(m) {
    mode = m;
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    if (stations) { fillSelects(); query(); }
    onModeChange && onModeChange(isOpen ? mode : null);
  }

  function setDay(offset) {
    dateStr = twDate(offset);
    dateInput.value = dateStr;
    dayBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.day) === offset));
    query();
  }

  // ───── 查詢 ─────
  async function query() {
    if (!isOpen || !stations) return;
    const seq = ++reqSeq;
    const from = fromSel.value, to = toSel.value;
    saved[mode] = [from, to];
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch {}
    clearInterval(liveTimer); liveTimer = null;
    if (from === to) {
      summaryEl.textContent = "";
      listEl.innerHTML = `<div class="ap-empty">出發站和抵達站相同,請換一站</div>`;
      return;
    }
    summaryEl.textContent = "";
    listEl.innerHTML = `<div class="ap-empty">查詢班次中…</div>`;
    const isToday = dateStr === twDate(0);
    try {
      const rows = mode === "thsr" ? await queryThsr(from, to) : await queryTra(from, to);
      if (seq !== reqSeq) return;
      render(rows, isToday);
      if (isToday) {
        loadLive(rows, from, to, seq);
        liveTimer = setInterval(() => loadLive(rows, from, to, seq), LIVE_REFRESH_MS);
      }
    } catch (e) {
      if (seq !== reqSeq) return;
      summaryEl.textContent = "";
      listEl.innerHTML = e.kind === "worker-old"
        ? `<div class="ap-empty">🔧 高鐵/台鐵資料要等 Worker 更新後才能查詢<br><span class="dim">(把最新的 flight-proxy.js 貼到 Cloudflare 並 Deploy)</span></div>`
        : `<div class="ap-empty">班次資料暫時查不到,稍後再試一次</div>`;
      console.warn("[rail] 查詢失敗:", e.message);
    }
  }

  async function queryThsr(from, to) {
    const data = await railFetch(`v2/Rail/THSR/DailyTimetable/OD/${from}/to/${to}/${dateStr}`);
    const list = Array.isArray(data) ? data : (data.DailyTimetables || data.Timetables || []);
    return list.map((x) => ({
      no: x.DailyTrainInfo?.TrainNo,
      type: "",
      dep: x.OriginStopTime?.DepartureTime,
      arr: x.DestinationStopTime?.ArrivalTime,
      end: x.DailyTrainInfo?.EndingStationName?.Zh_tw || "",
      note: "",
    })).filter((r) => r.no && r.dep && r.arr).sort((a, b) => toMin(a.dep) - toMin(b.dep));
  }

  async function queryTra(from, to) {
    const data = await railFetch(`v3/Rail/TRA/DailyTrainTimetable/OD/${from}/to/${to}/${dateStr}`);
    const list = data.TrainTimetables || (Array.isArray(data) ? data : []);
    return list.map((x) => {
      const info = x.TrainInfo || x.DailyTrainInfo || {};
      const stops = x.StopTimes || [];
      const o = stops.find((s) => s.StationID === from) || stops[0] || x.OriginStopTime || {};
      const d = stops.find((s) => s.StationID === to) || stops[stops.length - 1] || x.DestinationStopTime || {};
      return {
        no: info.TrainNo,
        type: (info.TrainTypeName?.Zh_tw || "").replace(/\(.*?\)/g, "").trim(),
        dep: o.DepartureTime,
        arr: d.ArrivalTime,
        end: info.EndingStationName?.Zh_tw || "",
        note: TRIP_LINE[info.TripLine] || "",
      };
    }).filter((r) => r.no && r.dep && r.arr).sort((a, b) => toMin(a.dep) - toMin(b.dep));
  }

  // 今天的班次:台鐵抓全線列車即時誤點、高鐵抓起站的剩餘座位,更新每一列的狀態
  async function loadLive(rows, from, to, seq) {
    try {
      if (mode === "tra") {
        const data = await railFetch("v3/Rail/TRA/TrainLiveBoard");
        if (seq !== reqSeq) return;
        const delay = new Map();
        for (const t of data.TrainLiveBoards || []) delay.set(String(t.TrainNo), Number(t.DelayTime) || 0);
        for (const r of rows) r.delay = delay.has(String(r.no)) ? delay.get(String(r.no)) : undefined;
      } else {
        const data = await railFetch(`v2/Rail/THSR/AvailableSeatStatusList/${from}`);
        if (seq !== reqSeq) return;
        const seats = new Map();
        const all = Array.isArray(data) ? data.flatMap((d) => d.AvailableSeats || []) : (data.AvailableSeats || []);
        for (const t of all) {
          const stop = (t.StopStations || []).find((s) => s.StationID === to);
          if (stop) seats.set(String(t.TrainNo), stop.StandardSeatStatus);
        }
        for (const r of rows) r.seat = seats.get(String(r.no));
      }
      render(rows, true);
    } catch (e) {
      console.warn("[rail] 即時資料更新失敗:", e.message);
    }
  }

  function render(rows, isToday) {
    const now = twNowMin();
    const fromName = stationName(fromSel.value), toName = stationName(toSel.value);
    if (!rows.length) {
      summaryEl.textContent = "";
      listEl.innerHTML = `<div class="ap-empty">${esc(dateStr)} 沒有 ${esc(fromName)} → ${esc(toName)} 的直達班次</div>`;
      return;
    }
    const upcoming = isToday ? rows.findIndex((r) => toMin(r.dep) >= now) : 0;
    const left = isToday ? (upcoming < 0 ? 0 : rows.length - upcoming) : rows.length;
    summaryEl.innerHTML = `${esc(fromName)} → ${esc(toName)} · ${esc(dateStr)}` +
      (isToday ? `:今天還有 <b>${left}</b> 班(全天 ${rows.length} 班)` : `:全天 <b>${rows.length}</b> 班`);
    const scrollTop = listEl.scrollTop;
    listEl.innerHTML = rows.map((r, i) => {
      const past = isToday && (upcoming < 0 || i < upcoming);
      const next = isToday && i === upcoming;
      let badge = "";
      if (mode === "tra" && r.delay !== undefined) {
        badge = r.delay > 0 ? `<span class="ap-badge ap-warn">晚 ${r.delay} 分</span>` : `<span class="ap-badge ap-ontime">準時</span>`;
      } else if (mode === "thsr" && r.seat && SEAT_LABEL[r.seat]) {
        const [label, cls] = SEAT_LABEL[r.seat];
        badge = `<span class="ap-badge rl-seat-${cls}">${label}</span>`;
      }
      const typeTag = r.type ? `<span class="rl-type ${traTypeClass(r.type)}">${esc(r.type)}</span>` : `<span class="rl-type rl-t-hsr">高鐵</span>`;
      return `<div class="ap-row rl-row${past ? " rl-past" : ""}${next ? " rl-next" : ""}">
        <div class="ap-row-top">
          <span class="ap-flight">${typeTag} <b>${esc(r.no)}</b> 車次${next ? ` <span class="rl-next-tag">下一班</span>` : ""}</span>
          ${badge}
        </div>
        <div class="rl-times"><b>${esc(r.dep)}</b> ${esc(fromName)} <span class="rl-arrow">→</span> <b>${esc(r.arr)}</b> ${esc(toName)}</div>
        <div class="ap-row-bottom">
          <span>行駛 ${fmtDur(r.dep, r.arr)}</span>
          ${r.end ? `<span>往 ${esc(r.end)}</span>` : ""}
          ${r.note ? `<span>${esc(r.note)}</span>` : ""}
        </div>
      </div>`;
    }).join("");
    // 第一次查今天的班次:自動捲到下一班;之後每分鐘更新狀態時維持讀者捲動的位置
    if (isToday && upcoming > 0 && scrollTop === 0) {
      listEl.querySelector(".rl-next")?.scrollIntoView({ block: "start" });
    } else {
      listEl.scrollTop = scrollTop;
    }
    captionEl.innerHTML = `資料來源:交通部 TDX(${mode === "thsr" ? "台灣高鐵" : "國營臺灣鐵路公司"})` +
      `${isToday ? (mode === "tra" ? " · 誤點每分鐘更新" : " · 剩餘座位為標準車廂") : ""} · ` +
      (mode === "thsr"
        ? `<a href="https://www.thsrc.com.tw/" target="_blank" rel="noopener">高鐵官網訂票 ↗</a>`
        : `<a href="https://www.railway.gov.tw/" target="_blank" rel="noopener">台鐵官網訂票 ↗</a>`);
  }

  // ───── 事件 ─────
  tabBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  dayBtns.forEach((b) => b.addEventListener("click", () => setDay(Number(b.dataset.day))));
  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    dateStr = dateInput.value;
    dayBtns.forEach((b) => b.classList.toggle("active", twDate(Number(b.dataset.day)) === dateStr));
    query();
  });
  fromSel.addEventListener("change", query);
  toSel.addEventListener("change", query);
  $("rl-swap").addEventListener("click", () => {
    const f = fromSel.value; fromSel.value = toSel.value; toSel.value = f;
    query();
  });
  $("rail-refresh")?.addEventListener("click", query);
  $("rail-close")?.addEventListener("click", () => onClose && onClose());

  async function open(m) {
    isOpen = true;
    panel.hidden = false;
    dateInput.min = twDate(0);
    dateInput.max = twDate(60);
    if (!dateInput.value) dateInput.value = dateStr;
    await loadStations();
    if (!stations) { listEl.innerHTML = `<div class="ap-empty">車站清單載入失敗,請稍後再開一次</div>`; return; }
    setMode(m || mode);
  }
  function close() {
    isOpen = false;
    panel.hidden = true;
    clearInterval(liveTimer); liveTimer = null;
    reqSeq++;
    onModeChange && onModeChange(null);
  }

  return { open, close, isOpen: () => isOpen, mode: () => mode };
}
