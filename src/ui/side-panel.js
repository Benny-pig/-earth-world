export const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function createSidePanel({ onClose }) {
  const el = document.getElementById("side-panel");
  const body = document.getElementById("side-panel-body");
  el.querySelector(".close").addEventListener("click", () => { close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open")) close(); });

  function section(title, html) { return `<h3>${title}</h3>${html}`; }

  function open(p) {
    const hasContent = (p.features && p.features.length) || (p.history && p.history.length) || p.travel;
    const flag = p.code
      ? `<img class="flag" src="https://flagcdn.com/w160/${p.code.toLowerCase()}.png" alt="" onerror="this.style.display='none'">`
      : "";
    let html = `${flag}<h2>${esc(p.names.zh)}</h2><div class="en">${esc(p.names.en)}</div>`;
    const meta = [];
    if (p.capital) meta.push(`首都:${esc(p.capital.zh)}${p.capital.en ? ` (${esc(p.capital.en)})` : ""}`);
    if (p.timezone) meta.push(`時區:${esc(p.timezone)}`);
    if (p.latlon) meta.push(`位置:${p.latlon[0].toFixed(1)}, ${p.latlon[1].toFixed(1)}`);
    if (meta.length) html += `<div class="meta">${meta.join("　·　")}</div>`;

    if (!hasContent) {
      html += `<p style="color:#9fb2d8">內容建置中,之後會補上。</p>`;
    } else {
      if (p.features && p.features.length)
        html += section("特色", p.features.map((t) => `<p>${esc(t)}</p>`).join(""));
      if (p.travel) {
        const cells = MONTH_LABELS.map((m, i) =>
          `<span class="${p.travel.best.includes(i + 1) ? "best" : ""}">${m}</span>`).join("");
        html += section("適合旅遊月份", `<div class="months">${cells}</div><p>${esc(p.travel.note)}</p>`);
      }
      if (p.history && p.history.length)
        html += section("歷史介紹", p.history.map((t) => `<p>${esc(t)}</p>`).join(""));
    }
    body.innerHTML = html;
    el.classList.add("open");
  }

  function close() {
    if (!el.classList.contains("open")) return;
    el.classList.remove("open");
    onClose && onClose();
  }

  return { open, close, isOpen: () => el.classList.contains("open") };
}
