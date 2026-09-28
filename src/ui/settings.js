import { THEMES, THEME_LABEL, getTheme, applyTheme, onThemeChange } from "./theme.js";
import { isEn } from "../lib/i18n.js";

// ⚙️ 設定(右上角):字體大小、版面主題、語言、新手導覽、安裝 App 收在同一個小選單裡,
// 右上角只留「分享、收藏、設定」三顆,不再擠成一排。
// 原本的主題/語言/導覽/安裝按鈕還在(藏起來),這裡按下去就轉給它們處理,原本的功能不用重寫。
export function createSettings({ fontSize }) {
  const btn = document.getElementById("settings-btn");
  const pop = document.getElementById("settings-pop");
  if (!btn || !pop) return { close() {} };
  const $ = (id) => document.getElementById(id);

  const seg = (name, items, cur) =>
    `<div class="set-seg" role="group" data-set="${name}">` +
    items.map(([v, label]) => `<button type="button" data-v="${v}" class="${v === cur ? "on" : ""}" aria-pressed="${v === cur}">${label}</button>`).join("") +
    `</div>`;

  function render() {
    const installBtn = $("install-btn");
    pop.innerHTML =
      `<div class="set-row"><span class="set-k">🔤 字體</span>${seg("font", fontSize.steps.map((s) => [s.k, isEn ? s.en : s.zh]), fontSize.current())}</div>` +
      `<div class="set-row"><span class="set-k">🎨 主題</span>${seg("theme", THEMES.map((t) => [t, THEME_LABEL[t].split(" ")[1] || THEME_LABEL[t]]), getTheme())}</div>` +
      `<div class="set-row"><span class="set-k">🌐 語言</span>${seg("lang", [["zh", "中文"], ["en", "English"]], isEn ? "en" : "zh")}</div>` +
      `<button type="button" class="set-item" data-act="tour">❓ 新手導覽</button>` +
      (installBtn && !installBtn.hidden ? `<button type="button" class="set-item" data-act="install">📲 安裝成 App</button>` : "");
  }

  let open = false;
  function setOpen(v) {
    open = !!v;
    if (open) render();
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.parentElement.classList.toggle("pop-open", open);   // 選單打開時整排疊到搜尋框上面(手機上會重疊)
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!open); });
  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.target.closest("button");
    if (!b) return;
    const set = b.closest("[data-set]")?.dataset.set;
    if (set === "font") { fontSize.set(b.dataset.v); render(); }
    else if (set === "theme") { applyTheme(b.dataset.v); render(); }
    else if (set === "lang") { if ((b.dataset.v === "en") !== isEn) $("lang-btn")?.click(); }
    else if (b.dataset.act === "tour") { setOpen(false); $("tour-btn")?.click(); }
    else if (b.dataset.act === "install") { setOpen(false); $("install-btn")?.click(); }
  });
  // 點選單外面、按 Esc 就收起來
  document.addEventListener("click", () => { if (open) setOpen(false); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });
  onThemeChange(() => { if (open) render(); });

  return { close: () => setOpen(false) };
}
