import { formatZonedTime, subsolarPoint } from "../lib/geo.js";

const RAD = Math.PI / 180;
// 台北現在太陽高度:決定顯示白天、清晨/黃昏還是晚上
function taipeiSunAlt(date) {
  const s = subsolarPoint(date);
  const v = Math.sin(25.03 * RAD) * Math.sin(s.lat * RAD) + Math.cos(25.03 * RAD) * Math.cos(s.lat * RAD) * Math.cos((121.56 - s.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, v))) / RAD;
}

// 左上角常駐:台灣(中華民國)當地時間,作為對照其他國家時間的基準。
export function createTwClock() {
  const el = document.getElementById("tw-clock");
  if (!el) return { stop() {} };

  function render() {
    const { date, time, weekday } = formatZonedTime(new Date(), "Asia/Taipei");
    el.innerHTML =
      `<div class="tw-label">臺灣時間 · UTC+8</div>` +
      `<div class="tw-date">${date}(${weekday})</div>` +
      `<div class="tw-time">${time}</div>` + dayNight();
  }
  // 地球上的晝夜是即時的:標出台灣現在白天還晚上,讓讀者知道畫面上的明暗就是現在的真實狀況
  let dnCache = "", dnAt = 0;
  function dayNight() {
    const now = Date.now();
    if (now - dnAt > 60000 || !dnCache) {
      dnAt = now;
      const alt = taipeiSunAlt(new Date());
      const [ico, word] = alt > 0 ? ["☀️", "白天"] : alt > -6 ? ["🌆", "晨昏"] : ["🌙", "夜晚"];
      dnCache = `<div class="tw-dn" title="地球上亮的一面是此刻真正的白天、暗的一面是夜晚,跟著真實時間變化">${ico} 台灣現在是${word} · 地球晝夜即時</div>`;
    }
    return dnCache;
  }
  render();
  const timer = setInterval(render, 1000);
  return { stop() { clearInterval(timer); } };
}
