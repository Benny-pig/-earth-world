import { weatherCodeToIcon, weekdayFromISODate, tzOffsetHours, formatZonedTime } from "../lib/geo.js";
import { esc } from "../lib/esc.js";

export const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function fmtPop(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return esc(String(v));
  if (v >= 1e8) return `約 ${(v / 1e8).toFixed(v >= 1e9 ? 1 : 2)} 億`;
  if (v >= 1e4) return `約 ${Math.round(v / 1e4).toLocaleString("en-US")} 萬`;
  return `約 ${Math.round(v).toLocaleString("en-US")} 人`;
}

// ── 緊急聯絡:當地報警/消防/救護電話 + 我國駐外館處 + 中國駐當地大使館 ──
// 資料由 tools/build-emergency.py 整理(外交部領事事務局、中國外交部、維基百科),
// 一百多 KB,第一次打開國家側欄時才載入,之後共用同一份。
let emergencyData = null;
function loadEmergency() {
  if (!emergencyData) {
    emergencyData = fetch("data/emergency.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return emergencyData;
}
// 海外急難時一定打得通的外交部 24 小時專線(領事事務局公告)
const MOFA_HOTLINE = "+886-800-085-095";

// Windows 沒有國旗 emoji(🇹🇼 會顯示成「TW」兩個字母),改用跟側欄大國旗同一個來源的小圖
function flagImg(cc) {
  return `<img class="sp-emg-flag" src="https://flagcdn.com/w40/${cc}.png" alt="" onerror="this.remove()">`;
}

function telLink(num) {
  // 「112 / 17」這種有兩個號碼的,各自做成撥號連結,不能把數字黏在一起變成 11217
  const parts = String(num).split(/\s*\/\s*/);
  if (parts.length > 1) return parts.map(telLink).join(" / ");
  const digits = String(num).replace(/[^\d+]/g, "");
  return /^\+?\d{2,15}$/.test(digits) ? `<a href="tel:${digits}">${esc(num)}</a>` : esc(num);
}
function mapHref(o) {
  const q = o.g ? o.g.join(",") : o.a;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || o.n)}`;
}

function emergencyNumbersHtml(em) {
  if (!em) return `<p class="dim sp-emg-none">暫無此地區的緊急電話資料。</p>`;
  const [police, fire, amb] = em;
  // 三個號碼都一樣(911、112、999 這類整合專線)就合併成一顆
  if (police && police === fire && fire === amb)
    return `<div class="sp-emg-nums"><span class="sp-emg-num sp-emg-all">🚓🚒🚑 警察・消防・救護 <b>${telLink(police)}</b></span></div>`;
  const cell = (ico, label, v) => v ? `<span class="sp-emg-num">${ico} ${label} <b>${telLink(v)}</b></span>` : "";
  const fireAmb = fire && fire === amb
    ? cell("🚒🚑", "消防・救護", fire)
    : cell("🚒", "消防", fire) + cell("🚑", "救護", amb);
  return `<div class="sp-emg-nums">${cell("🚓", "警察", police)}${fireAmb}</div>`;
}

function officeCardHtml(o, { host, compact }) {
  const rows = [];
  if (!host) rows.push(`<div class="sp-ms-tag">由鄰近國家的館處兼轄</div>`);
  if (o.a) rows.push(`<div class="sp-ms-row">📍 ${esc(o.a)} <a href="${esc(mapHref(o))}" target="_blank" rel="noopener">地圖 ↗</a></div>`);
  if (o.t) rows.push(`<div class="sp-ms-row">☎️ ${esc(o.t)}</div>`);
  if (o.c) rows.push(`<div class="sp-ms-row sp-ms-emg">🆘 領事保護:${esc(o.c)}</div>`);
  if (o.e) rows.push(`<div class="sp-ms-row sp-ms-emg">🆘 急難救助:${esc(o.e)}</div>`);
  if (!compact && o.h) rows.push(`<div class="sp-ms-row">🕘 ${esc(o.h)}</div>`);
  if (o.j) rows.push(`<div class="sp-ms-row dim">轄區:${esc(o.j)}</div>`);
  if (!compact && o.u) rows.push(`<div class="sp-ms-row"><a href="${esc(o.u)}" target="_blank" rel="noopener">官方網站 ↗</a></div>`);
  return `<div class="sp-ms"><div class="sp-ms-name">${esc(o.n)}</div>` +
    (o.en ? `<div class="sp-ms-en">${esc(o.en)}</div>` : "") + rows.join("") + `</div>`;
}

function missionsHtml(code, data) {
  let h = "";
  // 我國駐外館處:駐在當地的排前面(第一個是代表處/大使館),其他辦事處收在「其他」裡;
  // 沒有駐在當地、由鄰國館處兼轄的另外標示
  const tw = (data.tw && data.tw[code]) || [];
  const hostOffices = tw.filter(([, host]) => host).map(([id]) => data.twOffices[id]).filter(Boolean);
  const remote = tw.filter(([, host]) => !host).map(([id]) => data.twOffices[id]).filter(Boolean);
  h += `<h4 class="sp-emg-h">${flagImg("tw")}我國駐外館處</h4>`;
  if (hostOffices.length) {
    h += officeCardHtml(hostOffices[0], { host: true });
    if (hostOffices.length > 1)
      h += `<details class="sp-ms-others"><summary>其他 ${hostOffices.length - 1} 個辦事處(依轄區分工)</summary>` +
        hostOffices.slice(1).map((o) => officeCardHtml(o, { host: true, compact: true })).join("") + `</details>`;
  }
  remote.forEach((o) => { h += officeCardHtml(o, { host: false, compact: true }); });
  if (code === "CN")
    h += `<p class="sp-emg-hot">大陸地區急難:海基會 24 小時緊急服務專線 ${telLink("+886-2-2533-9995")}</p>`;
  else if (!hostOffices.length && !remote.length && code !== "TW")
    h += `<p class="dim">我國在當地沒有駐外館處,也沒有指定兼轄館處。</p>`;
  h += `<p class="sp-emg-hot">海外遇到急難(24 小時):外交部緊急聯絡中心 ${telLink(MOFA_HOTLINE)}` +
    `<br><span class="dim">國內親友可撥免付費 0800-085-095</span></p>`;

  const cn = ((data.cn && data.cn[code]) || []).map((id) => data.cnEmb[id]).filter(Boolean);
  h += `<h4 class="sp-emg-h">${flagImg("cn")}中國駐當地大使館</h4>`;
  h += cn.length ? cn.map((o) => officeCardHtml(o, { host: true })).join("")
    : `<p class="dim">${code === "CN" ? "中國本土,無駐外使館。" : code === "HK" || code === "MO" ? "中國特別行政區,無駐外使館。" : "中國外交部沒有列出駐當地的大使館。"}</p>`;
  return h;
}

export function createSidePanel({ onClose, onMore, visited }) {
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
    // 精細地圖新增的小屬地(關島、百慕達…)還沒有大百科內容,不顯示按鈕,免得點進去只看到「建置中」
    const moreBtn = onMore && p.code && p.hasDeep
      ? `<button type="button" class="sp-more pulse" data-code="${esc(p.code)}">` +
        `<span class="sp-more-ico">📖</span>${p.region ? "大百科" : "國家大百科"} · 詳細介紹</button>` : "";
    let html = `${flag}<h2>${esc(p.names.zh)}</h2><div class="en">${esc(p.names.en)}</div>${moreBtn}` +
      `<button type="button" class="sp-share" data-share>🔗 分享這個國家</button>` +
      `<span id="sp-visit-slot"></span>`;
    const meta = [];
    if (p.capital && p.capital.zh) meta.push(`首都:${esc(p.capital.zh)}${p.capital.en ? ` (${esc(p.capital.en)})` : ""}`);
    if (p.population != null && p.population !== "") meta.push(`人口:${fmtPop(p.population)}`);
    if (p.timezone) meta.push(`時區:${esc(p.timezone)}`);
    if (p.latlon) meta.push(`位置:${p.latlon[0].toFixed(1)}, ${p.latlon[1].toFixed(1)}`);
    if (meta.length) html += `<div class="meta">${meta.join("　·　")}</div>`;

    if (p.travelAlert) {
      const a = p.travelAlert;
      const stars = "★".repeat(a.level) + "☆".repeat(4 - a.level);
      html += `<div class="sp-alert" style="border-color:${esc(a.color)}">` +
        `<span class="sp-alert-dot" style="background:${esc(a.color)}"></span>` +
        `<b>${esc(a.label)}</b>` +
        `<span class="sp-alert-stars" style="color:${esc(a.color)}" title="危險程度 ${a.level}/4">${stars}</span>` +
        (a.note ? `<span class="sp-alert-note">・特定地區:${esc(a.note)}</span>` : "") +
        (a.reason ? `<span class="sp-alert-reason">${esc(a.reason)}</span>` : "") +
        `</div>`;
    }

    if (p.timezone) html += `<div id="sp-clock" class="sp-clock"></div>`;

    // 緊急聯絡放在時鐘下面:報警/消防/救護號碼直接看得到,館處細節收合起來
    if (p.code) html += section("緊急聯絡", `<div id="sp-emg" class="sp-emg"><p class="dim">載入中…</p></div>`);

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
      html += `<p class="dim">基本資料建置中,之後會補上更多介紹。</p>`;

    body.innerHTML = html;
    const mb = body.querySelector(".sp-more");
    if (mb) mb.addEventListener("click", () => onMore(mb.dataset.code));
    renderVisit();
    el.classList.add("open");
    startClock(p.timezone);
    if (p.code) fillEmergency(p.code);
  }

  async function fillEmergency(code) {
    const data = await loadEmergency();
    const box = document.getElementById("sp-emg");
    if (!box || openCode !== code) return;          // 資料回來前已經換國家或關閉
    if (!data) { box.innerHTML = `<p class="dim">緊急聯絡資料暫時載入失敗。</p>`; return; }
    const tw = (data.tw && data.tw[code]) || [];
    const cnN = ((data.cn && data.cn[code]) || []).length;
    const summary = code === "TW"
      ? "海外急難專線"
      : `我國駐外館處 ${tw.length ? `${tw.length} 處` : "—"} · 中國大使館 ${cnN ? `${cnN} 處` : "—"}`;
    box.innerHTML = emergencyNumbersHtml(data.em && data.em[code]) +
      `<details class="sp-emg-more"><summary>🏛️ ${esc(summary)}</summary>` +
      (code === "TW"
        ? `<p class="sp-emg-hot">國人在海外遇到急難:外交部緊急聯絡中心 ${telLink(MOFA_HOTLINE)}(24 小時)<br>` +
          `<span class="dim">國內免付費 0800-085-095;大陸地區急難可撥海基會 24 小時專線 +886-2-2533-9995</span></p>`
        : missionsHtml(code, data)) +
      `<p class="sp-emg-src dim">資料來源:外交部領事事務局、中華人民共和國外交部、維基百科(各國緊急電話)` +
      `${data.asOf ? `· 整理日期 ${esc(data.asOf)}` : ""}。聯絡資訊可能異動,出發前請再上官方網站確認。</p>` +
      `</details>`;
  }

  // 🛂「我去過這裡」:讀者自己按才蓋章(只是點開看介紹不算去過),再按一次取消
  function renderVisit() {
    const slot = document.getElementById("sp-visit-slot");
    if (!slot) return;
    if (!visited || !openCode || !visited.canStamp(openCode)) { slot.innerHTML = ""; return; }
    const on = visited.has(openCode);
    slot.innerHTML = `<button type="button" class="sp-share sp-visit${on ? " on" : ""}" title="${on ? "再按一下可以取消" : "記在旅行護照裡"}">` +
      `${on ? "✅ 去過了・已蓋章" : "🛂 我去過這裡"}</button>`;
    slot.firstChild.addEventListener("click", () => visited.toggle(openCode));
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
    code: () => (el.classList.contains("open") ? openCode : null),
    refreshVisit: renderVisit,
    isOpen: () => el.classList.contains("open"),
    // 非同步預報回來時呼叫;面板已換國或關閉就忽略
    setForecast(code, days) {
      if (!el.classList.contains("open") || openCode !== code) return;
      renderForecast(days);
    },
  };
}
