// 版面主題(深空/旅誌/奇幻史詩/戰術HUD):抽成獨立模組,讓大百科的主題按鈕
// 跟首頁的主題按鈕共用同一份狀態,兩邊點誰都會同步、都記得使用者的選擇。
const THEME_KEY = "earth-world.enc-theme";
export const THEMES = ["dark", "journal", "fantasy", "hud"];
export const THEME_LABEL = { dark: "🌙 深空", journal: "☀ 旅誌", fantasy: "⚜ 史詩", hud: "◎ 戰術" };

const listeners = new Set();

function ensureFantasyFont() {
  if (document.getElementById("fantasy-font")) return;
  const link = document.createElement("link");
  link.id = "fantasy-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Noto+Serif+TC:wght@500;700&display=swap";
  document.head.appendChild(link);
}
function ensureHudFont() {
  if (document.getElementById("hud-font")) return;
  const link = document.createElement("link");
  link.id = "hud-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap";
  document.head.appendChild(link);
}

export function getTheme() {
  let t = "dark";
  try { t = localStorage.getItem(THEME_KEY) || "dark"; } catch {}
  return THEMES.includes(t) ? t : "dark";
}

export function applyTheme(t) {
  if (!THEMES.includes(t)) t = "dark";
  if (t === "fantasy") ensureFantasyFont();
  if (t === "hud") ensureHudFont();
  const enc = document.getElementById("encyclopedia");
  if (enc) { if (t === "dark") enc.removeAttribute("data-enc-theme"); else enc.setAttribute("data-enc-theme", t); }
  document.body.setAttribute("data-theme", t === "dark" ? "" : t);
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  listeners.forEach((fn) => fn(t));
}

export function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
  applyTheme(next);
  return next;
}

// 訂閱主題變化(例如首頁按鈕切換了主題,大百科的按鈕文字也要跟著換)
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme() {
  applyTheme(getTheme());
}
