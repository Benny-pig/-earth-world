import { esc } from "../lib/esc.js";

// 山脈/河流/沙漠/海洋等自然地理標籤的輕量小彈窗:點一下標籤,在附近彈出
// 名稱+一句簡介的卡片,不像國家側欄那麼重,點外面或 × 就關掉。
export function createNaturePopup() {
  const el = document.getElementById("nature-popup");
  if (!el) return { show() {}, hide() {} };

  function hide() { el.classList.remove("open"); }

  function show({ icon, zh, en, note }, x, y) {
    el.innerHTML =
      `<button type="button" class="np-close" aria-label="關閉">×</button>` +
      `<div class="np-title">${icon ? `<span class="np-ico">${esc(icon)}</span>` : ""}<b>${esc(zh)}</b></div>` +
      (en ? `<div class="np-en">${esc(en)}</div>` : "") +
      (note ? `<p class="np-note">${esc(note)}</p>` : "");
    el.classList.add("open");
    // 先顯示才量得到寬高,再夾在畫面內、避免彈出去外面被切掉
    const pad = 10;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = x - w / 2, top = y - h - 14;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    if (top < pad) top = y + 22; // 上面放不下就改放到標籤下方
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.querySelector(".np-close").addEventListener("click", hide);
  }

  el.addEventListener("click", (e) => e.stopPropagation());
  window.addEventListener("pointerdown", (e) => { if (!el.contains(e.target)) hide(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });

  return { show, hide };
}
