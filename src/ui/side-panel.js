import { weatherCodeToIcon, weekdayFromISODate, tzOffsetHours, formatZonedTime } from "../lib/geo.js";
import { esc } from "../lib/esc.js";

export const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function fmtPop(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return esc(String(v));
  if (v >= 1e8) return `約 ${(v / 1e8).toFixed(v >= 1e9 ? 1 : 2)} 億`;
  if (v >= 1e4) return `約 ${Math.round(v / 1e4).toLocaleString("en-US")} 萬`;
  return `約 ${Math.round(v).toLocaleString("en-US")} 人`;
}

export function createSidePanel({ onClose, onMore }) {
  const el = document.getElementById("side-panel");
  const body = document.getElementById("side-panel-body");
  let openCode = null;
  let clockTz = null;
  let clockTimer = null;
  el.querySelector(".close").addEventListener("click", () => { close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open") && !document.getElementById("encyclopedia")?.classList.contains("open")) close(); });

  function section(title, html) { return `<h3>${title}</h3>${html}`; }

  // 側欄內的當地時鐘,格式同首頁左上角的台灣時鐘,每秒更新。
  function renderClock() {
    const box = document.getElementById("sp-clock");
    if (!box || !clockTz) return;
    const { date, time, weekday } = formatZonedTime(new Date(), clockTz);
    const oh = tzOffsetHours(clockTz);
    let rel = "";
    if (oh != null) {
      const d = Math.round((oh - 8) * 10) / 10;
      rel = d === 0 ? "與台灣同時" : `與台灣 ${d > 0 ? "+" : "−"}${Math.abs(d)} 小時`;
    }
    box.innerHTML =
      `<div class="spc-label">當地時間${rel ? `　·　${rel}` : ""}</div>` +
      `<div class="spc-date">${date}(${weekday})</div>` +
      `<div class="spc-time">${time}</div>`;
  }
  function startClock(tz) {
    stopClock();
    clockTz = tz || null;
    if (!clockTz) return;
    renderClock();
    clockTimer = setInterval(renderClock, 1000);
  }
  function stopClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
    clockTz = null;
  }

  function forecastHtml(days) {
    if (days === null) return `<p class="dim">未來一週天氣暫時取得不到。</p>`;
    if (!days || !days.length) return `<p class="dim">載入中…</p>`;
    const cells = days.map((d, i) => {
      const { icon } = weatherCodeToIcon(d.code);
      const md = (() => {
        if (!d.date) return "";
        const [mo, dy] = d.date.slice(5).split("-");
        return `${Number(mo)}/${Number(dy)}`;
      })();
      const popTier = d.pop == null ? "" : d.pop >= 60 ? " fc-pop-high" : d.pop >= 30 ? " fc-pop-mid" : " fc-pop-low";
      const pop = (d.pop == null || Number.isNaN(d.pop))
        ? "" : `<span class="fc-pop${popTier}">☔ ${d.pop}%</span>`;
      const mm = (d.precip != null && d.precip >= 0.5)
        ? `<span class="fc-mm">${d.precip.toFixed(d.precip < 10 ? 1 : 0)}mm</span>` : "";
      const tmax = Number.isNaN(d.tmax) ? "—" : `${d.tmax}°`;
      const tmin = Number.isNaN(d.tmin) ? "—" : `${d.tmin}°`;
      return `<div class="fc-day${i === 0 ? " fc-today" : ""}">` +
        `<span class="fc-wd">${i === 0 ? "今天" : weekdayFromISODate(d.date)}</span>` +
        `<span class="fc-date">${md}</span>` +
        `<span class="fc-icon">${icon}</span>` +
        `<span class="fc-temp">${tmax}<i>${tmin}</i></span>${pop}${mm}</div>`;
    }).join("");
    return `<div class="fc-grid">${cells}</div>` +
      `<p class="fc-note">資料來源 Open-Meteo(多模式綜合預報)—— 是氣象模型的預測,並非即時觀測,` +
      `即使「今天」也可能與實際天氣不同(尤其局部短暫對流雨最難預報準)。天數愈後誤差愈大,建議出發前 1–2 天再查一次；` +
      `長期旅遊規劃請參考下方「適合旅遊月份」。</p>`;
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
    const moreBtn = onMore && p.code
      ? `<button type="button" class="sp-more pulse" data-code="${esc(p.code)}">` +
        `<span class="sp-more-ico">📖</span>國家大百科 · 詳細介紹</button>` : "";
    let html = `${flag}<h2>${esc(p.names.zh)}</h2><div class="en">${esc(p.names.en)}</div>${moreBtn}`;
    const meta = [];
    if (p.capital && p.capital.zh) meta.push(`首都:${esc(p.capital.zh)}${p.capital.en ? ` (${esc(p.capital.en)})` : ""}`);
    if (p.population != null && p.population !== "") meta.push(`人口:${fmtPop(p.population)}`);
    if (p.timezone) meta.push(`時區:${esc(p.timezone)}`);
    if (p.latlon) meta.push(`位置:${p.latlon[0].toFixed(1)}, ${p.latlon[1].toFixed(1)}`);
    if (meta.length) html += `<div class="meta">${meta.join("　·　")}</div>`;

    if (p.travelAlert) {
      const a = p.travelAlert;
      html += `<div class="sp-alert" style="border-color:${esc(a.color)}">` +
        `<span class="sp-alert-dot" style="background:${esc(a.color)}"></span>` +
        `<b>${esc(a.label)}</b>` +
        (a.note ? `<span class="sp-alert-note">・特定地區:${esc(a.note)}</span>` : "") +
        `</div>`;
    }

    if (p.timezone) html += `<div id="sp-clock" class="sp-clock"></div>`;

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
    const mb = body.querySelector(".sp-more");
    if (mb) mb.addEventListener("click", () => onMore(mb.dataset.code));
    el.classList.add("open");
    startClock(p.timezone);
  }

  function close() {
    if (!el.classList.contains("open")) return;
    openCode = null;
    stopClock();
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
