import { isEn } from "./i18n.js";

// 📮 錯誤回報:讀者那邊發生程式錯誤時,匿名送一筆到我們的 Cloudflare Worker,
// 內容只有「錯誤訊息、哪個檔案第幾行、程式版本、語言、畫面寬度」——不含任何個人資料、不含網址參數。
// 每次打開網站最多送 3 筆;本機開發(localhost)不送。每日健康檢查會列出最近的錯誤。
const ENDPOINT = "https://earth-world-flights.a7779782.workers.dev/?report";
const MAX = 3;
let sent = 0;
const seen = new Set();

export function reportError({ msg, src, line }) {
  if (["localhost", "127.0.0.1"].includes(location.hostname) || sent >= MAX || !navigator.sendBeacon) return;
  const m = String(msg || "").slice(0, 200);
  if (!m || seen.has(m)) return;
  seen.add(m);
  sent++;
  const body = JSON.stringify({
    msg: m,
    src: String(src || "").replace(location.origin, "").replace(/[?#].*$/, "").slice(0, 120),
    line: Number(line) || 0,
    ver: document.querySelector('meta[name="app-version"]')?.content || "",
    lang: isEn ? "en" : "zh",
    w: window.innerWidth,
  });
  try { navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" })); } catch { /* 送不出去就算了 */ }
}

export function setupErrorReport() {
  window.addEventListener("error", (e) => {
    if (!e.message) return;   // 圖片、腳本載入失敗這類資源錯誤不算(那是網路問題)
    reportError({ msg: e.message, src: e.filename, line: e.lineno });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const top = String(r?.stack || "").split("\n").find((l) => /https?:\/\//.test(l)) || "";
    const at = top.match(/(https?:\/\/[^\s)]+?):(\d+):\d+/);
    reportError({ msg: `Unhandled: ${r?.message || r}`, src: at?.[1], line: at?.[2] });
  });
}
