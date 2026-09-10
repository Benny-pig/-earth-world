import { esc } from "/src/lib/esc.js";
import { createAdminMap } from "/src/ui/admin-map.js";

const ADMIN_MAP_COUNTRIES = new Set(["TW", "JP", "US"]);

export function createEncyclopedia() {
  const adminMap = createAdminMap();
  const regionCache = new Map();
  const el = document.getElementById("encyclopedia");
  const titleEl = el.querySelector(".enc-title");
  const bodyEl = document.getElementById("enc-body");
  const scrollEl = el.querySelector(".enc-scroll");

  const codeToFile = (c) => String(c).replace(/[ .]/g, "_");

  el.querySelector(".enc-close").addEventListener("click", close);
  el.querySelector(".enc-back").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("open")) { e.stopImmediatePropagation(); close(); }
  });

  // 版面主題:深空(預設)/ 旅誌(暖色編輯風),記住選擇
  const themeBtn = el.querySelector(".enc-theme-btn");
  const THEME_KEY = "earth-world.enc-theme";
  function applyTheme(t) {
    if (t === "journal") { el.setAttribute("data-enc-theme", "journal"); if (themeBtn) themeBtn.textContent = "☀ 旅誌"; }
    else { el.removeAttribute("data-enc-theme"); if (themeBtn) themeBtn.textContent = "🌙 深空"; }
  }
  try { applyTheme(localStorage.getItem(THEME_KEY)); } catch {}
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const next = el.getAttribute("data-enc-theme") === "journal" ? "dark" : "journal";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  });

  const cache = new Map();
  let reqSeq = 0;

  const IMG_BASE = "/assets/deep/";

  // ---- 即時匯率(以新台幣為基準,免金鑰,約每日更新)----
  let fxData = null, fxAt = 0;
  const FX_TTL = 60 * 60 * 1000;
  async function getFx() {
    if (fxData && Date.now() - fxAt < FX_TTL) return fxData;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/TWD", { signal: ctrl.signal });
      const j = await r.json();
      if (j && j.result === "success" && j.rates) { fxData = j; fxAt = Date.now(); }
    } catch { /* 靜默:renderFx 會顯示降級訊息 */ }
    finally { clearTimeout(timer); }
    return fxData;
  }
  function currencyCodeOf(qf) {
    // 貨幣字串可能用半形或全形括號:「日圓(JPY)」「美元（USD）」
    const m = /[(（]\s*([A-Za-z]{3})\s*[)）]/.exec((qf && qf.currency) || "");
    return m ? m[1].toUpperCase() : null;
  }
  function trimNum(n) {
    if (!isFinite(n)) return "—";
    if (n >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
    return n.toLocaleString("en-US", { maximumFractionDigits: 5 });
  }
  async function renderFx(code, ccy) {
    const box = document.getElementById("enc-fx");
    if (!box || !ccy) return;
    const mySeq = reqSeq;
    const fx = await getFx();
    if (mySeq !== reqSeq || !document.getElementById("enc-fx")) return;   // 已切到別國
    const rate = fx && fx.rates ? fx.rates[ccy] : null;   // 1 TWD = rate 外幣
    if (!rate) { box.innerHTML = `<p class="enc-dim">即時匯率暫時取得不到(貨幣:${esc(ccy)})。</p>`; return; }
    const inv = 1 / rate;
    const upd = fx.time_last_update_utc ? fx.time_last_update_utc.slice(5, 16) : "";
    box.innerHTML =
      `<p class="enc-fx-line">1 新臺幣 (TWD) ≈ <b>${trimNum(rate)}</b> ${esc(ccy)}　·　` +
      `1 ${esc(ccy)} ≈ <b>${trimNum(inv)}</b> 新臺幣</p>` +
      `<div class="enc-fx-conv">` +
        `<label>新臺幣 <input type="number" id="fx-twd" value="1000" min="0" step="any"></label>` +
        `<span class="enc-fx-swap">⇄</span>` +
        `<label>${esc(ccy)} <input type="number" id="fx-for" min="0" step="any"></label>` +
      `</div>` +
      `<p class="enc-dim enc-fx-src">匯率更新:${esc(upd)} UTC · 資料 open.er-api.com</p>`;
    const twd = box.querySelector("#fx-twd"), forr = box.querySelector("#fx-for");
    const sync = (from) => {
      if (from === "twd") forr.value = twd.value ? trimNum(parseFloat(twd.value) * rate).replace(/,/g, "") : "";
      else twd.value = forr.value ? trimNum(parseFloat(forr.value) * inv).replace(/,/g, "") : "";
    };
    twd.addEventListener("input", () => sync("twd"));
    forr.addEventListener("input", () => sync("for"));
    sync("twd");
  }

  function fmtArea(km2) {
    if (typeof km2 !== "number" || !Number.isFinite(km2)) return null;
    if (km2 >= 1e4) return `約 ${(km2 / 1e4).toFixed(km2 >= 1e6 ? 0 : 1)} 萬 km²`;
    return `約 ${Math.round(km2).toLocaleString("en-US")} km²`;
  }

  // 每張卡片的標題與圖片都連到中文維基(用中文名查詢),方便點擊延伸閱讀。
  function wikiUrl(it) {
    const term = it.wiki || it.zh || it.en || "";
    return "https://zh.wikipedia.org/wiki/" + encodeURIComponent(String(term).replace(/\s+/g, "_"));
  }
  function card(code, it) {
    const href = esc(wikiUrl(it));
    const img = it.image
      ? `<a href="${href}" target="_blank" rel="noopener" class="enc-card-imglink">` +
        `<img src="${IMG_BASE}${encodeURIComponent(codeToFile(code))}/${encodeURIComponent(it.image)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>`
      : "";
    const en = it.en ? `<span class="enc-card-en">${esc(it.en)}</span>` : "";
    return `<div class="enc-card">${img}<div class="enc-card-body">` +
      `<a href="${href}" target="_blank" rel="noopener" class="enc-card-title"><b>${esc(it.zh)}</b> ${en} <span class="enc-ext">↗</span></a>` +
      `<p>${esc(it.note || "")}</p></div></div>`;
  }

  // 進場動畫純 CSS(@keyframes,無 fill-mode)—— 動畫沒跑 / 被節流也不會卡在隱形,
  // 因為結束後元素回到自然樣式(可見)。錯開由 CSS :nth-of-type 處理。
  function section(title, inner) {
    return `<section class="enc-sec enc-reveal"><h3>${esc(title)}</h3>${inner}</section>`;
  }

  function render(code, d) {
    titleEl.textContent = d.name_zh || code;
    const flag = /^[A-Za-z]{2}$/.test(code)
      ? `<img src="https://flagcdn.com/w160/${code.toLowerCase()}.png" alt="" style="width:104px;border-radius:4px;margin-bottom:12px" onerror="this.remove()">`
      : "";
    let h = `${flag}<h2>${esc(d.name_zh || code)}</h2><div class="enc-en">${esc(d.name_en || "")}</div>`;
    if (d.summary) h += `<p>${esc(d.summary)}</p>`;

    const qf = d.quick_facts || {};
    const rows = [];
    if (qf.official_name_zh) rows.push(["正式國名", qf.official_name_zh]);
    const area = fmtArea(qf.area_km2);
    if (area) rows.push(["面積", area]);
    if (Array.isArray(qf.languages) && qf.languages.length) rows.push(["語言", qf.languages.join("、")]);
    if (qf.religion) rows.push(["宗教", qf.religion]);
    if (qf.currency) rows.push(["貨幣", qf.currency]);
    if (qf.government) rows.push(["政體", qf.government]);
    if (rows.length)
      h += `<dl class="enc-facts">` + rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") + `</dl>`;

    const ccy = currencyCodeOf(qf);
    if (ccy) h += section("匯率換算(對新臺幣)", `<div id="enc-fx"><p class="enc-dim">載入即時匯率…</p></div>`);

    if (Array.isArray(d.founding) && d.founding.length)
      h += section("國家的生成與發展", d.founding.map((p) => `<p>${esc(p)}</p>`).join(""));

    if (Array.isArray(d.events) && d.events.length)
      h += section("重大歷史事蹟", `<ul class="enc-timeline">` +
        d.events.map((e) => `<li><span class="enc-year">${esc(String(e.year))}</span><span>${esc(e.zh)}</span></li>`).join("") +
        `</ul>`);

    for (const [key, title] of [["animals", "特色動物"], ["foods", "特色食物"], ["landmarks", "著名景點"], ["people", "著名名人"]]) {
      const arr = d[key];
      if (Array.isArray(arr) && arr.length)
        h += section(title, `<div class="enc-cards">` + arr.map((it) => card(code, it)).join("") + `</div>`);
    }

    if (Array.isArray(d.recommended) && d.recommended.length)
      h += section("推薦玩法", d.recommended.map((r) => `<p><b>${esc(r.zh)}</b> — ${esc(r.note || "")}</p>`).join(""));

    const itin = d.itineraries || {};
    if ((Array.isArray(itin.hot) && itin.hot.length) || (Array.isArray(itin.niche) && itin.niche.length)) {
      let ih = "";
      if (Array.isArray(itin.hot) && itin.hot.length) {
        ih += `<h4 class="enc-sub">熱門路線</h4>` + itin.hot.map((r) =>
          `<div class="enc-route"><b>${esc(r.zh || r.title)}</b>` +
          `${r.days ? `<span class="enc-route-days">${esc(r.days)}</span>` : ""}` +
          `<p>${esc(r.note || "")}</p></div>`).join("");
      }
      if (Array.isArray(itin.niche) && itin.niche.length) {
        ih += `<h4 class="enc-sub">私房 / 冷門</h4>` + itin.niche.map((r) =>
          `<div class="enc-route enc-route-niche"><b>${esc(r.zh || r.title)}</b><p>${esc(r.note || "")}</p></div>`).join("");
      }
      h += section("行程建議", ih);
    }

    // 台灣旅行社「一鍵搜尋」—— 不爬價格(天天變),連到各家該國搜尋頁,使用者自行比價
    const q = encodeURIComponent(d.name_zh || code);
    const AGENCIES = [
      ["雄獅旅遊", `https://travel.liontravel.com/search?keyword=${q}`],
      ["易遊網", `https://www.eztravel.com.tw/search?keyword=${q}`],
      ["KKday", `https://www.kkday.com/zh-tw/search?keyword=${q}`],
      ["Klook", `https://www.klook.com/zh-TW/search/?query=${q}`],
    ];
    h += section("找台灣出發的行程",
      `<div class="enc-agencies">` + AGENCIES.map(([n, u]) =>
        `<a href="${esc(u)}" target="_blank" rel="noopener" class="enc-agency">${esc(n)} ↗</a>`).join("") + `</div>` +
      `<p class="enc-dim" style="font-size:11px;margin-top:8px">連到各旅行社的「${esc(d.name_zh || code)}」搜尋結果,價格與檔期以各站為準。</p>`);

    if (ADMIN_MAP_COUNTRIES.has(code))
      h += section("縣市地圖",
        `<p class="enc-dim" style="font-size:12px">點縣市看特色與推薦。★ = 首都。</p>` +
        `<div id="enc-admin-map"></div><div id="enc-region-info"></div>`);

    if (Array.isArray(d.credits) && d.credits.length)
      h += section("圖片來源", `<ul class="enc-credits">` + d.credits.map((c) => {
        const head = `${esc(c.title || c.file)} — ${esc(c.author)} / ${esc(c.license)}`;
        return /^https:\/\//.test(c.source)
          ? `<li>${head} · <a href="${esc(c.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></li>`
          : `<li>${head}</li>`;
      }).join("") + `</ul>`);

    bodyEl.innerHTML = h;
    scrollEl.scrollTop = 0;
    // 安全網:進場動畫萬一沒跑完(分頁被節流等),1.2 秒後強制顯示,絕不讓內容卡在隱形
    setTimeout(() => bodyEl.querySelectorAll(".enc-reveal").forEach((n) => {
      if (getComputedStyle(n).opacity === "0") n.style.opacity = "1";
    }), 1200);
    if (ccy) renderFx(code, ccy);

    if (ADMIN_MAP_COUNTRIES.has(code)) {
      const mapBox = document.getElementById("enc-admin-map");
      const cap = window.__earth && window.__earth.content && window.__earth.content[code];
      adminMap.render(mapBox, code, {
        capital: cap && cap.capital_latlon,
        onPick: (name) => renderRegionInfo(code, name),
      });
    }
  }

  async function renderRegionInfo(code, name) {
    const box = document.getElementById("enc-region-info");
    if (!box) return;
    box.innerHTML = `<h4 class="enc-sub">${esc(name)}</h4><p class="enc-dim">載入中…</p>`;
    let data = regionCache.get(code);
    if (!data) {
      data = fetch(`/data/admin1/${encodeURIComponent(code)}.regions.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      regionCache.set(code, data);
    }
    const map = await data;
    if (!document.getElementById("enc-region-info")) return;
    const r = map && map[name];
    box.innerHTML = `<h4 class="enc-sub">${esc(name)}</h4>` +
      (r ? `<p>${esc(r.note || "")}</p>${r.rec ? `<p><b>推薦:</b>${esc(r.rec)}</p>` : ""}`
         : `<p class="enc-dim">這個縣市的介紹之後補上。</p>`);
  }

  async function open(code) {
    const seq = ++reqSeq;
    titleEl.textContent = "";
    bodyEl.innerHTML = `<p class="enc-dim">載入中…</p>`;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    scrollEl.scrollTop = 0;

    if (cache.has(code)) { if (seq === reqSeq) render(code, cache.get(code)); return; }
    try {
      const r = await fetch(`/data/deep/${encodeURIComponent(codeToFile(code))}.json`);
      if (seq !== reqSeq) return;            // 已切到別國
      if (!r.ok) throw new Error("not found");
      const d = await r.json();
      cache.set(code, d);
      if (seq === reqSeq) render(code, d);
    } catch {
      if (seq === reqSeq)
        bodyEl.innerHTML = `<p class="enc-dim">這個國家的大百科還在建置中,之後會補上。</p>`;
    }
  }
  function close() {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  }
  return { open, close, isOpen: () => el.classList.contains("open") };
}
