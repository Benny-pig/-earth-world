import { setSimTime, simNow } from "../lib/sim-time.js";
import { moonPhase } from "../scene/moon.js";
import { termAt, nextSolarLon } from "../scene/sun-info.js";
import { makeDraggable } from "./draggable.js";

// 🕰️ 時光機:拖日期、拖時間,太陽(晨昏線)、月亮與月相、星空、行星一起照那個時間擺。
// 地球本來就固定在真實方向(晨昏線常駐),拖到哪個時間,白天黑夜就是那時候的樣子;關掉就回到現在。
// 可以播放(一秒一小時 / 一秒一天),也能一鍵跳到下次滿月、夏至、冬至、春分、秋分、今晚。
const DAY = 86400000;
const TZ = 8 * 3600000;   // 台灣時間

export function createTimeMachine({ onClose }) {
  const panel = document.getElementById("time-panel");
  const body = document.getElementById("time-body");
  if (!panel || !body) return { setEnabled() {}, isEnabled: () => false, update() {} };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("time-close")?.addEventListener("click", () => onClose && onClose());

  let enabled = false, t = Date.now(), base = 0, playing = 0;
  // base = 今天台灣時間 00:00;日期滑桿是「距今幾天」,時間滑桿是「當天幾分」
  const midnightTw = (ms) => Math.floor((ms + TZ) / DAY) * DAY - TZ;

  body.innerHTML =
    `<div class="tm-now"><b class="tm-date"></b><span class="tm-info"></span></div>` +
    `<label class="tm-row"><span>📅 日期</span><input type="range" class="tm-day" min="-365" max="365" step="1"><output class="tm-day-o"></output></label>` +
    `<label class="tm-row"><span>🕐 時間</span><input type="range" class="tm-min" min="0" max="1430" step="10"><output class="tm-min-o"></output></label>` +
    `<div class="tm-btns">` +
    `<button type="button" class="tc-btn" data-play="3600000">▶ 一秒一小時</button>` +
    `<button type="button" class="tc-btn" data-play="86400000">⏩ 一秒一天</button>` +
    `<button type="button" class="tc-btn" data-act="now">↺ 回到現在</button></div>` +
    `<div class="tm-jumps"><span>跳到:</span>` +
    `<button type="button" data-jump="tonight">今晚 21:00</button><button type="button" data-jump="full">下次滿月</button>` +
    `<button type="button" data-jump="90">夏至</button><button type="button" data-jump="180">秋分</button>` +
    `<button type="button" data-jump="270">冬至</button><button type="button" data-jump="0">春分</button></div>` +
    `<div class="sat-caption">太陽、月亮、星座與行星都照這個時間的真實位置擺放;關掉時光機就回到現在。</div>`;
  const $ = (s) => body.querySelector(s);
  const daySl = $(".tm-day"), minSl = $(".tm-min");

  const fmtDate = (ms) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
  function paint() {
    const days = Math.round((midnightTw(t) - base) / DAY);
    const mins = Math.round(((t + TZ) % DAY) / 60000);
    if (document.activeElement !== daySl) daySl.value = days;
    if (document.activeElement !== minSl) minSl.value = Math.min(1430, Math.round(mins / 10) * 10);
    $(".tm-day-o").textContent = days === 0 ? "今天" : days > 0 ? `${days} 天後` : `${-days} 天前`;
    $(".tm-min-o").textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    $(".tm-date").textContent = `${fmtDate(t)}(台灣時間)`;
    const ph = moonPhase(new Date(t), { quick: true });
    $(".tm-info").textContent = `${ph.emoji} ${ph.name} · 節氣 ${termAt(t)}`;
    body.querySelectorAll("[data-play]").forEach((b) => {
      const on = playing === Number(b.dataset.play);
      b.classList.toggle("on", on);
      b.textContent = on ? "⏸ 暫停" : b.dataset.play === "3600000" ? "▶ 一秒一小時" : "⏩ 一秒一天";
    });
  }
  function go(ms, { keepPlaying = false } = {}) {
    t = Math.max(base - 365 * DAY, Math.min(base + 366 * DAY - 60000, ms));
    if (!keepPlaying) playing = 0;
    setSimTime(new Date(t));
    paint();
  }
  const fromSliders = () => go(base + Number(daySl.value) * DAY + Number(minSl.value) * 60000);
  daySl.addEventListener("input", fromSliders);
  minSl.addEventListener("input", fromSliders);
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.play) { const r = Number(b.dataset.play); playing = playing === r ? 0 : r; paint(); return; }
    if (b.dataset.act === "now") { go(Date.now()); return; }
    const j = b.dataset.jump;
    if (j === "tonight") go(midnightTw(Date.now()) + 21 * 3600000);
    else if (j === "full") { const f = moonPhase(new Date(t)).nextFull; if (f) go(+f); }
    else if (j != null) { const d = nextSolarLon(Number(j), t); if (d) go(+d); }
  });

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (enabled) {
      base = midnightTw(Date.now());
      t = Date.now();
      playing = 0;
      go(t);
    } else {
      playing = 0;
      setSimTime(null);
    }
  }

  // 播放:每格往前推(一秒一小時 / 一秒一天)
  let lastPaint = 0;
  function update(dt) {
    if (!enabled || !playing) return;
    const next = t + dt * playing;
    if (next >= base + 366 * DAY - 60000) { playing = 0; paint(); return; }
    t = next;
    setSimTime(new Date(t));
    const now = performance.now();
    if (now - lastPaint > 120) { lastPaint = now; paint(); }   // 面板文字不用每格重畫
  }

  return { setEnabled, isEnabled: () => enabled, update, now: simNow };
}
