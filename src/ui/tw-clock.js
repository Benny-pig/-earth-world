import { formatZonedTime } from "../lib/geo.js";

// 左上角常駐:台灣(中華民國)當地時間,作為對照其他國家時間的基準。
export function createTwClock() {
  const el = document.getElementById("tw-clock");
  if (!el) return { stop() {} };

  function render() {
    const { date, time, weekday } = formatZonedTime(new Date(), "Asia/Taipei");
    el.innerHTML =
      `<div class="tw-label">臺灣時間 · UTC+8</div>` +
      `<div class="tw-date">${date}(${weekday})</div>` +
      `<div class="tw-time">${time}</div>`;
  }
  render();
  const timer = setInterval(render, 1000);
  return { stop() { clearInterval(timer); } };
}
