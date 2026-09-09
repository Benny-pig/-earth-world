import { weatherCodeToIcon, weekdayFromISODate } from "/src/lib/geo.js";

export const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function fmtPop(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return esc(String(v));
  if (v >= 1e8) return `約 ${(v / 1e8).toFixed(v >= 1e9 ? 1 : 2)} 億`;
  if (v >= 1e4) return `約 ${Math.round(v / 1e4).toLocaleString("en-US")} 萬`;
  return `約 ${Math.round(v).toLocaleString("en-US")} 人`;
}

export function createSidePanel({ onClose }) {
  const el = document.getElementById("side-panel");
  const body = document.getElementById("side-panel-body");
  let openCode = null;
  el.querySelector(".close").addEventListener("click", () => { close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open")) close(); });

  function section(title, html) { return `<h3>${title}</h3>${html}`; }

  function forecastHtml(days) {
    if (days === null) return `<p class="dim">未來一週天氣暫時取得不到。</p>`;
    if (!days || !days.length) return `<p class="dim">載入中…</p>`;
    const cells = days.map((d) => {
      const { icon } = weatherCodeToIcon(d.code);
      const pop = (d.pop == null || Number.isNaN(d.pop))
        ? "" : `<span class="fc-pop">☔ ${d.pop}%</span>`;
      const tmax = Number.isNaN(d.tmax) ? "—" : `${d.tmax}°`;
      const tmin = Number.isNaN(d.tmin) ? "—" : `${d.tmin}°`;
      return `<div class="fc-day"><span class="fc-wd">${weekdayFromISODate(d.date)}</span>` +
        `<span class="fc-icon">${icon}</span>` +
        `<span class="fc-temp">${tmax}<i>${tmin}</i></span>${pop}</div>`;
    }).join("");
    return `<div class="fc-grid">${cells}</div>`;
  }

  function renderForecast(days) {
    const box = document.getElementById("sp-forecast");
    if (box) box.innerHTML = forecastHtml(days);
  }

  function open(p) {
    openCode = p.code || null;
    const hasContent = (p.features && p.features.length) || (p.history && p.history.length) || p.travel || p.food;
    const flag = p.code
      ? `<img class="flag" src="https://flagcdn.com/w160/${p.code.toLowerCase()}.png" alt="" onerror="this.style.display='none'">`
      : "";
    let html = `${flag}<h2>${esc(p.names.zh)}</h2><div class="en">${esc(p.names.en)}</div>`;
    const meta = [];
    if (p.capital && p.capital.zh) meta.push(`首都:${esc(p.capital.zh)}${p.capital.en ? ` (${esc(p.capital.en)})` : ""}`);
    if (p.population != null && p.population !== "") meta.push(`人口:${fmtPop(p.population)}`);
    if (p.timezone) meta.push(`時區:${esc(p.timezone)}`);
    if (p.latlon) meta.push(`位置:${p.latlon[0].toFixed(1)}, ${p.latlon[1].toFixed(1)}`);
    if (meta.length) html += `<div class="meta">${meta.join("　·　")}</div>`;

    if (p.features && p.features.length)
      html += section("特色", p.features.map((t) => `<p>${esc(t)}</p>`).join(""));

    if (p.food) {
      let f = "";
      if (p.food.culture) f += `<p>${esc(p.food.culture)}</p>`;
      if (p.food.dishes && p.food.dishes.length)
        f += `<ul class="dishes">` + p.food.dishes.map((d) =>
          `<li><b>${esc(d.zh)}</b> <span class="dish-en">${esc(d.en)}</span><br>${esc(d.note)}</li>`
        ).join("") + `</ul>`;
      html += section("美食", f);
    }

    // 未來一週天氣:有聚落的國家都顯示(座標沿用質心後援);南極洲、法屬南部領地等無聚落者略過
    if (p.showForecast !== false)
      html += section("未來一週天氣", `<div class="forecast" id="sp-forecast">${forecastHtml(p.forecast)}</div>`);

    if (p.travel) {
      const cells = MONTH_LABELS.map((m, i) =>
        `<span class="${p.travel.best.includes(i + 1) ? "best" : ""}">${m}</span>`).join("");
      html += section("適合旅遊月份", `<div class="months">${cells}</div><p>${esc(p.travel.note)}</p>`);
    }
    if (p.history && p.history.length)
      html += section("歷史介紹", p.history.map((t) => `<p>${esc(t)}</p>`).join(""));

    if (!hasContent)
      html += `<p class="dim">國家基本資料建置中,之後會補上更多介紹。</p>`;

    body.innerHTML = html;
    el.classList.add("open");
  }

  function close() {
    if (!el.classList.contains("open")) return;
    openCode = null;
    el.classList.remove("open");
    onClose && onClose();
  }

  return {
    open,
    close,
    isOpen: () => el.classList.contains("open"),
    // 非同步預報回來時呼叫;面板已換國或關閉就忽略
    setForecast(code, days) {
      if (!el.classList.contains("open") || openCode !== code) return;
      renderForecast(days);
    },
  };
}
