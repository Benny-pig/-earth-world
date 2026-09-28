import { setSimTime } from "../lib/sim-time.js";
import { moonPhase, drawPhase, moonEcliptic } from "../scene/moon.js";
import { eclipticToSubPoint } from "../lib/geo.js";
import { termAt } from "../scene/sun-info.js";
import { tonight } from "../scene/planets.js";
import { SHOWERS } from "../scene/meteors.js";
import { makeDraggable } from "./draggable.js";
import { esc } from "../lib/esc.js";

// 🎂 我出生那天的天空:輸入生日,地球、月亮、星空、行星都回到那一天(用時光機同一套模擬時間),
// 面板告訴你那天的月相、節氣、太陽星座、晚上看得到哪些行星、有沒有流星雨,
// 再加上「歷史上的這一天」。生日不會存起來;按「分享」才會放進網址。
const OTD = "https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events";
const ZODIAC = [   // [結束月, 結束日, 星座](前一個星座到這天為止)
  [1, 19, "摩羯座 ♑"], [2, 18, "水瓶座 ♒"], [3, 20, "雙魚座 ♓"], [4, 19, "牡羊座 ♈"], [5, 20, "金牛座 ♉"], [6, 21, "雙子座 ♊"],
  [7, 22, "巨蟹座 ♋"], [8, 22, "獅子座 ♌"], [9, 22, "處女座 ♍"], [10, 23, "天秤座 ♎"], [11, 22, "天蠍座 ♏"], [12, 21, "射手座 ♐"], [12, 31, "摩羯座 ♑"],
];
const zodiacOf = (m, d) => ZODIAC.find(([em, ed]) => m < em || (m === em && d <= ed))[2];
const DIRS = ["北方", "東北方", "東方", "東南方", "南方", "西南方", "西方", "西北方"];

export function createBirthday({ rig, onClose, onOpen, lookUp, stopLooking }) {
  const panel = document.getElementById("bday-panel");
  const body = document.getElementById("bday-body");
  if (!panel || !body) return { setEnabled() {}, isEnabled: () => false, openWith() {} };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("bday-close")?.addEventListener("click", () => onClose && onClose());
  // 收合:只留標題列,把天空讓出來
  const minBtn = document.getElementById("bday-min");
  function setMin(on) {
    panel.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));
  let enabled = false, current = null;

  const today = new Date();
  const maxDate = today.toISOString().slice(0, 10);
  body.innerHTML =
    `<div class="bd-form"><label>📅 生日<input type="date" class="bd-date" min="1900-01-01" max="${maxDate}"></label>` +
    `<label>🕘 時間<select class="bd-time"><option value="21">晚上 9 點(看星空)</option><option value="6">清晨 6 點</option>` +
    `<option value="12">中午 12 點</option><option value="18">傍晚 6 點</option><option value="0">半夜 12 點</option></select></label>` +
    `<button type="button" class="tc-btn bd-go">✨ 看那天的天空</button></div>` +
    `<div class="bd-out"><div class="au-dim">輸入生日(或任何想紀念的日子),地球、月亮、星空、行星都會回到那一天。生日不會被記錄。</div></div>`;
  const $ = (s) => body.querySelector(s);

  async function show(ymd, hour) {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return;
    const when = new Date(Date.UTC(y, m - 1, d, hour - 8));   // 台灣時間
    current = { ymd, hour };
    setSimTime(when);
    // 站在台北仰望那一刻的天空(月亮在天上就轉過去看月亮),面板先收起來,把天空讓出來
    const mo = moonEcliptic(when);
    const hourText = { 0: "半夜 12 點", 6: "清晨 6 點", 12: "中午 12 點", 18: "傍晚 6 點", 21: "晚上 9 點" }[hour] || `${hour} 點`;
    if (lookUp) lookUp({ title: `${y}/${m}/${d} ${hourText} · 台北的天空`, sub: "展開「🎂 生日那天的天空」面板,看那天的月相、行星和歷史", target: eclipticToSubPoint(mo.lon, mo.lat, mo.d) });
    else rig.flyTo(23.7, 121, { distance: 2.6, ms: 1400 });
    setTimeout(() => setMin(true), 900);
    const days = Math.floor((Date.now() - when) / 86400000);
    const years = Math.floor(days / 365.2425);
    const ph = moonPhase(when);
    const plan = tonight(when).filter((p) => p.best);
    const showers = SHOWERS.filter((s) => {
      const md = m * 100 + d, a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1];
      return a <= b ? md >= a && md <= b : md >= a || md <= b;
    });
    const wd = new Intl.DateTimeFormat("zh-TW", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
    $(".bd-out").innerHTML =
      `<div class="bd-head"><canvas width="160" height="160" class="bd-moon" style="width:80px;height:80px"></canvas><div>` +
      `<div class="bd-date-big">${y} 年 ${m} 月 ${d} 日</div><div class="au-dim">${wd} · 距今 ${days.toLocaleString()} 天${years > 0 ? `(${years} 年)` : ""}</div>` +
      `<div class="bd-moon-t">${ph.emoji} 那天的月亮是<b>${ph.name}</b>(照亮 ${Math.round(ph.illum * 100)}%)</div></div></div>` +
      `<div class="mt-grid">` +
      `<span>太陽星座</span><b>${zodiacOf(m, d)}</b>` +
      `<span>節氣</span><b>${termAt(when)}</b>` +
      `<span>那晚的行星</span><b>${plan.length ? plan.map((p) => `${p.zh}(${DIRS[Math.round(p.best.az / 45) % 8]})`).join("、") : "都不在夜空中"}</b>` +
      (showers.length ? `<span>流星雨</span><b>剛好是${showers.map((s) => s.zh).join("、")}的活動期間 🌠</b>` : "") +
      `</div>` +
      `<div class="mt-h">📜 歷史上的這一天</div><div class="bd-otd au-dim">讀取中…</div>` +
      `<div class="bd-btns"><button type="button" class="tc-btn" data-act="sky">🔭 再看一次天空</button><button type="button" class="tc-btn" data-act="share">🔗 分享</button>` +
      `<button type="button" class="tc-btn" data-act="now">↺ 回到現在</button></div>`;
    const cv = $(".bd-moon");
    if (cv) drawPhase(cv, ph);
    // 歷史上的這一天(維基百科):挑 3 件,盡量靠近出生那一年
    try {
      const r = await fetch(`${OTD}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`, { headers: { "Accept-Language": "zh-TW" } });
      const j = await r.json();
      const ev = (j.events || []).filter((e) => e.year && e.text).sort((a, b) => Math.abs(a.year - y) - Math.abs(b.year - y)).slice(0, 3).sort((a, b) => a.year - b.year);
      const box = $(".bd-otd");
      if (box && current?.ymd === ymd) box.innerHTML = ev.length ? ev.map((e) => `<div class="bd-ev"><b>${e.year}</b> ${esc(e.text)}</div>`).join("") : "查不到這一天的紀錄";
    } catch { const box = $(".bd-otd"); if (box) box.textContent = "暫時讀不到維基百科"; }
  }

  body.addEventListener("click", (e) => {
    if (e.target.closest(".bd-go")) {
      const v = $(".bd-date").value;
      if (v) show(v, Number($(".bd-time").value));
      else $(".bd-date").focus();
      return;
    }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "now") { stopLooking && stopLooking(); setSimTime(null); current = null; $(".bd-out").innerHTML = `<div class="au-dim">已經回到現在。</div>`; }
    else if (a.dataset.act === "sky" && current) show(current.ymd, current.hour);
    else if (a.dataset.act === "share" && current) {
      // 讀者自己按分享才把日期放進網址
      const url = `${location.origin}${location.pathname}?bday=${current.ymd}&bt=${current.hour}`;
      if (navigator.share && matchMedia("(pointer: coarse)").matches) navigator.share({ title: "我出生那天的天空 · 地球世界", url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(() => { a.textContent = "✅ 已複製連結"; setTimeout(() => { a.textContent = "🔗 分享這一天的天空"; }, 1800); }).catch(() => window.prompt("複製這個連結:", url));
    }
  });

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (enabled) { setMin(false); onOpen && onOpen(); }
    else { stopLooking && stopLooking(); setSimTime(null); current = null; }
  }
  // 從分享連結打開:?bday=YYYY-MM-DD&bt=21
  function openWith(ymd, hour = 21) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    $(".bd-date").value = ymd;
    $(".bd-time").value = String([0, 6, 12, 18, 21].includes(hour) ? hour : 21);
    show(ymd, [0, 6, 12, 18, 21].includes(hour) ? hour : 21);
  }

  return { setEnabled, isEnabled: () => enabled, openWith };
}
