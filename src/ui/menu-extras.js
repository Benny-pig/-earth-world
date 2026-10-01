import { isEn } from "../lib/i18n.js";

// 🆕 NEW 標記:最近加的功能,選單格子角落一個小小的「NEW」,點過一次就消失(記在這台瀏覽器);
//    分頁裡還有沒點過的新功能,分頁標籤上會有一個小亮點。過了期限自動不顯示。
// 👴 簡易模式(⚙️ 設定裡開關):字放大一級,功能選單只留最常用、最好上手的幾個,給長輩和小朋友。
const NEW_KEY = "earth-world.new-seen";
const NEW_UNTIL = "2026-12-31";
const NEW_IDS = ["today-toggle", "wind-toggle", "stats-toggle", "plates-toggle", "layers-toggle", "trip-toggle"];
const SIMPLE_KEY = "earth-world.simple";
const SIMPLE_KEEP = new Set([
  "today-toggle", "weather-toggle", "quake-toggle", "typhoon-toggle", "moon-toggle", "constellation-toggle", "cinema-toggle",
  "quiz-toggle", "trip-toggle", "livecam-toggle", "voice-toggle", "radio-toggle",
  "airport-toggle", "thsr-toggle", "tra-toggle",
]);

export function setupMenuExtras({ fontSize }) {
  // ---------- NEW ----------
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem(NEW_KEY) || "[]")); } catch { /* 沒有紀錄 */ }
  const expired = new Date() > new Date(`${NEW_UNTIL}T23:59:59+08:00`);
  function markTabs() {
    for (const tab of document.querySelectorAll(".lc-tab")) {
      const pane = document.querySelector(`.lc-pane[data-cat="${tab.dataset.cat}"]`);
      tab.classList.toggle("has-new", !!pane?.querySelector(".new-badge"));
    }
  }
  if (!expired) {
    for (const id of NEW_IDS) {
      const b = document.getElementById(id);
      if (!b || seen.has(id)) continue;
      const s = document.createElement("span");
      s.className = "new-badge";
      s.textContent = "NEW";
      s.setAttribute("aria-label", isEn ? "new" : "新功能");
      b.appendChild(s);
      b.addEventListener("click", () => {
        s.remove();
        seen.add(id);
        try { localStorage.setItem(NEW_KEY, JSON.stringify([...seen])); } catch { /* 存不了就算了 */ }
        markTabs();
      }, { once: true });
    }
    markTabs();
  }

  // ---------- 簡易模式 ----------
  for (const id of SIMPLE_KEEP) document.getElementById(id)?.classList.add("simple-keep");
  let simple = false, fontBefore = null;
  function applySimple() {
    document.body.classList.toggle("simple", simple);
    // 沒有留下任何功能的分頁也藏起來;目前在看的分頁被藏了就切到第一個
    for (const tab of document.querySelectorAll(".lc-tab")) {
      const pane = document.querySelector(`.lc-pane[data-cat="${tab.dataset.cat}"]`);
      const empty = simple && !pane?.querySelector(".simple-keep");
      tab.hidden = empty;
      if (empty && tab.getAttribute("aria-selected") === "true") document.querySelector(".lc-tab:not([hidden])")?.click();
    }
  }
  function setSimple(on) {
    simple = !!on;
    try { localStorage.setItem(SIMPLE_KEY, simple ? "on" : "off"); } catch { /* 存不了就算了 */ }
    if (simple) {
      // 字放大一級(原本已經是「大」以上就不動),關掉簡易模式時恢復
      const cur = fontSize.current();
      if (cur === "s" || cur === "m") { fontBefore = cur; try { localStorage.setItem(`${SIMPLE_KEY}.font`, cur); } catch { /* 略過 */ } fontSize.set("l", false); }
    } else {
      let back = fontBefore;
      try { back = back || localStorage.getItem(`${SIMPLE_KEY}.font`); localStorage.removeItem(`${SIMPLE_KEY}.font`); } catch { /* 略過 */ }
      if (back && fontSize.current() === "l") fontSize.set(back, false);
      fontBefore = null;
    }
    applySimple();
  }
  try { simple = localStorage.getItem(SIMPLE_KEY) === "on"; } catch { simple = false; }
  applySimple();
  return { isSimple: () => simple, setSimple };
}
