import { isEn } from "../lib/i18n.js";

// 🔤 字體大小(右上角「Aa」):小 / 標準 / 大 / 特大,記在這台瀏覽器。
// 做法:把樣式表裡每一個以 px 寫的字級改成 calc(原本的 px × var(--fs)),
// 之後只要改 --fs 一個變數,全站的字(面板、選單、地球上的國名)一起放大縮小,版面寬度不變。
const KEY = "earth-world.fontsize";
const STEPS = [
  { k: "s", v: 0.9, zh: "小", en: "S" },
  { k: "m", v: 1, zh: "標準", en: "M" },
  { k: "l", v: 1.15, zh: "大", en: "L" },
  { k: "xl", v: 1.3, zh: "特大", en: "XL" },
];

let rewritten = false;
function rewriteRules() {
  if (rewritten) return;
  rewritten = true;
  const walk = (rules) => {
    for (const r of rules) {
      if (r.style) {
        const fs = r.style.getPropertyValue("font-size").trim();
        if (/^[\d.]+px$/.test(fs)) r.style.setProperty("font-size", `calc(${fs} * var(--fs, 1))`, r.style.getPropertyPriority("font-size"));
      }
      if (r.cssRules) walk(r.cssRules);   // @media 裡的規則
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* 外部字型的樣式表讀不到,跳過 */ }
  }
}

export function setupFontSize({ toast } = {}) {
  const btn = document.getElementById("font-btn");
  let cur = (() => { try { return localStorage.getItem(KEY) || "m"; } catch { return "m"; } })();
  if (!STEPS.some((s) => s.k === cur)) cur = "m";

  function apply(announce) {
    const st = STEPS.find((s) => s.k === cur);
    if (st.v !== 1) rewriteRules();
    document.documentElement.style.setProperty("--fs", String(st.v));
    if (btn) {
      btn.textContent = `Aa ${isEn ? st.en : st.zh}`;
      btn.title = isEn ? `Text size: ${st.en} (tap to change)` : `字體大小:${st.zh}(按一下換)`;
    }
    if (announce && toast) toast(isEn ? `Text size: ${st.en}` : `🔤 字體大小:${st.zh}`);
  }
  function set(k, announce = true) {
    if (!STEPS.some((s) => s.k === k)) return;
    cur = k;
    try { localStorage.setItem(KEY, cur); } catch { /* 存不了就算了 */ }
    apply(announce);
  }
  btn?.addEventListener("click", () => set(STEPS[(STEPS.findIndex((s) => s.k === cur) + 1) % STEPS.length].k));
  apply(false);
  return { steps: STEPS, current: () => cur, set };
}
