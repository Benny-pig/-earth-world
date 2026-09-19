import { esc } from "../lib/esc.js";
import { createAdminMap } from "./admin-map.js";
import { createTransitMap } from "./transit-map.js";
import { THEME_LABEL, getTheme, cycleTheme, onThemeChange, initTheme } from "./theme.js";

// 有捷運路網示意圖的國家 → 城市檔名(data/transit/<city>.json)
const TRANSIT = { TW: "taipei", JP: "tokyo", KR: "seoul", US: "newyork", SG: "singapore" };

// 國家 → 免費 YouTube 當地新聞直播(官方頻道,用 live_stream 內嵌網址,嵌入時
// 由 YouTube 自己判斷該頻道現在有沒有在開直播;沒有就顯示離線畫面,不會壞掉)
const LIVE_STREAMS = {
  TW: { channelId: "UCexpzYDEnfmAvPSfG4xbcjA", label: "公視新聞網 PTS News", url: "https://www.youtube.com/@PNNPTS" },
  US: { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", label: "ABC News", url: "https://www.youtube.com/@ABCNews" },
};

export function createEncyclopedia() {
  const adminMap = createAdminMap();
  const transitMap = createTransitMap();
  const regionCache = new Map();

  // 哪些國家有一級行政區地圖(data/admin1/index.json;載入前先當作沒有)
  let adminSet = null;
  fetch("data/admin1/index.json").then((r) => (r.ok ? r.json() : [])).then((a) => { adminSet = new Set(a); }).catch(() => { adminSet = new Set(); });
  const hasAdminMap = (code) => adminSet && adminSet.has(code);

  // 外交部領事事務局旅遊警示等級(見 data/travel-alert.json 的產出腳本);載入前
  // 就當作沒有資料,跟 adminSet 同樣的容錯方式,不擋 render()。
  let travelAlertData = null;
  fetch("data/travel-alert.json").then((r) => (r.ok ? r.json() : null)).then((j) => { travelAlertData = j; }).catch(() => { travelAlertData = null; });
  const el = document.getElementById("encyclopedia");
  const titleEl = el.querySelector(".enc-title");
  const bodyEl = document.getElementById("enc-body");
  const scrollEl = el.querySelector(".enc-scroll");

  // 卡片圖片:原本用瀏覽器原生 loading="lazy",但這頁是自訂捲動容器
  // (.enc-scroll,不是視窗本身),原生機制對非視窗捲動容器的判定在部分
  // 瀏覽器環境不可靠(實測過捲到看得見的位置圖片仍不觸發)。試過改用
  // IntersectionObserver 自己控制,結果在這個環境完全不觸發(比原生
  // lazy 更糟,20 張圖一張都載入不出來)——查不出根因,先退回最單純、
  // 已經實測會動的做法:直接載入,不做任何懶載入。單一國家的圖片量
  // 通常一兩 MB,直接載入沒有真的很不合理。
  const codeToFile = (c) => String(c).replace(/[ .]/g, "_");

  el.querySelector(".enc-close").addEventListener("click", close);
  el.querySelector(".enc-back").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("open")) { e.stopImmediatePropagation(); close(); }
  });

  // 版面主題:深空(預設)/ 旅誌(暖色編輯風)/ 奇幻史詩(金色紋飾風)/ 戰術HUD(青色情報機關風),
  // 邏輯在 theme.js,這裡只負責按鈕文字跟切換——首頁也有一顆一樣的按鈕,兩邊共用同一份狀態。
  const themeBtn = el.querySelector(".enc-theme-btn");
  function refreshThemeBtn() { if (themeBtn) themeBtn.textContent = THEME_LABEL[getTheme()]; }
  initTheme();
  refreshThemeBtn();
  onThemeChange(refreshThemeBtn);
  if (themeBtn) themeBtn.addEventListener("click", cycleTheme);

  const cache = new Map();
  let reqSeq = 0;

  const IMG_BASE = "assets/deep/";

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
        `<label>新臺幣 <input type="number" id="fx-twd" value="1" min="0" step="any"></label>` +
        `<button type="button" class="enc-fx-swap" id="fx-swap" title="切換基準幣別">⇄</button>` +
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
    // ⇄ 切換哪一邊是「基準的 1」:例如「1 新臺幣 ≈ 0.03125 美元」按一下變成
    // 「1 美元 ≈ 31.25 新臺幣」,而不是把兩邊數字互相搬過去、越換越亂。
    let base = "twd";
    box.querySelector("#fx-swap").addEventListener("click", () => {
      base = base === "twd" ? "for" : "twd";
      if (base === "twd") { twd.value = "1"; sync("twd"); }
      else { forr.value = "1"; sync("for"); }
    });
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
    const base = `${IMG_BASE}${encodeURIComponent(codeToFile(code))}/`;
    let img = "";
    if (it.video) {
      const posterAttr = it.image ? ` poster="${base}${encodeURIComponent(it.image)}"` : "";
      img = `<a href="${href}" target="_blank" rel="noopener" class="enc-card-imglink">` +
        `<video class="enc-card-video"${posterAttr} src="${base}${encodeURIComponent(it.video)}" autoplay muted loop playsinline onerror="this.parentNode.remove()"></video></a>`;
    } else if (it.image) {
      img = `<a href="${href}" target="_blank" rel="noopener" class="enc-card-imglink">` +
        `<img src="${base}${encodeURIComponent(it.image)}" alt="" onerror="this.parentNode.remove()"></a>`;
    }
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
      ? `<img class="enc-flag" src="https://flagcdn.com/w320/${code.toLowerCase()}.png" alt="" onerror="this.remove()">`
      : "";
    const heroVideo = d.hero_video
      ? `<video class="enc-hero-video" src="${IMG_BASE}${encodeURIComponent(codeToFile(code))}/${encodeURIComponent(d.hero_video)}" autoplay muted loop playsinline onerror="this.remove()"></video>`
      : "";
    let h = `<header class="enc-hero enc-reveal"><div class="enc-hero-main">` +
      `<div class="enc-en">${esc(d.name_en || "")}</div>` +
      `<h2>${esc(d.name_zh || code)}</h2>` +
      (d.summary ? `<p class="enc-lead">${esc(d.summary)}</p>` : "") +
      `<p class="enc-ext-hint">帶 <span class="enc-ext">↗</span> 的標題與圖片可點擊,連到維基百科查看更完整的介紹(另開新分頁)。</p>` +
      `</div>${heroVideo}${flag}</header>`;

    if (LIVE_STREAMS[code]) {
      const ls = LIVE_STREAMS[code];
      h += section("當地直播",
        `<p class="enc-dim" style="font-size:12px">來源:${esc(ls.label)}官方 YouTube 頻道。是否正在直播由該頻道自行決定,離峰時段可能顯示離線畫面。</p>` +
        `<div class="enc-live-wrap"><iframe src="https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(ls.channelId)}" title="${esc(ls.label)} 直播" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` +
        `<p class="enc-dim" style="font-size:11px;margin-top:6px"><a href="${esc(ls.url)}" target="_blank" rel="noopener">在 YouTube 開啟${esc(ls.label)} ↗</a></p>`);
    }

    const alert = travelAlertData && travelAlertData.countries ? travelAlertData.countries[code] : null;
    if (alert) {
      const stars = "★".repeat(alert.level) + "☆".repeat(4 - alert.level);
      h += section("旅遊安全提醒",
        `<div class="enc-alert" style="border-color:${esc(alert.color)}">` +
          `<span class="enc-alert-dot" style="background:${esc(alert.color)}"></span>` +
          `<b>${esc(alert.label)}</b>` +
          `<span class="enc-alert-stars" style="color:${esc(alert.color)}" title="危險程度 ${alert.level}/4">${stars}</span>` +
          (alert.reason ? `<p class="enc-dim">危險原因:${esc(alert.reason)}</p>` : "") +
          (alert.note ? `<p class="enc-dim">特定地區:${esc(alert.note)}</p>` : "") +
        `</div>` +
        `<p class="enc-dim enc-fx-src">資料來源:中華民國外交部領事事務局(查詢日 ${esc(travelAlertData.as_of || "")}) · ` +
        `<a href="https://www.boca.gov.tw/sp-trwa-list-1.html" target="_blank" rel="noopener">查看最新公告 ↗</a><br>` +
        `${esc(travelAlertData.disclaimer || "")}</p>`
      );
    }

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

    if (Array.isArray(d.souvenirs) && d.souvenirs.length)
      h += section("必買伴手禮", `<ul class="enc-buys">` + d.souvenirs.map((s) =>
        `<li><b>${esc(s.zh)}</b>${s.note ? ` — ${esc(s.note)}` : ""}${s.where ? ` <span class="enc-dim">(${esc(s.where)})</span>` : ""}</li>`).join("") + `</ul>`);

    if (Array.isArray(d.street_food) && d.street_food.length)
      h += section("經典小吃 / 夜市", `<ul class="enc-buys enc-street-food">` + d.street_food.map((s) =>
        `<li><b>${esc(s.zh)}</b>${s.note ? ` — ${esc(s.note)}` : ""}${s.where ? ` <span class="enc-dim">(${esc(s.where)})</span>` : ""}</li>`).join("") + `</ul>`);

    if (Array.isArray(d.festivals) && d.festivals.length)
      h += section("節慶與慶典", `<ul class="enc-buys enc-festivals">` + d.festivals.map((f) =>
        `<li>${f.month ? `<span class="enc-dim">${esc(f.month)}</span> ` : ""}<b>${esc(f.zh)}</b>${f.note ? ` — ${esc(f.note)}` : ""}</li>`).join("") + `</ul>`);

    const pi = d.practical_info;
    if (pi && ((Array.isArray(pi.greetings) && pi.greetings.length) || pi.tipping || pi.money_note)) {
      let ph = "";
      if (Array.isArray(pi.greetings) && pi.greetings.length)
        ph += `<dl class="enc-facts enc-practical">` + pi.greetings.map((g) =>
          `<dt>${esc(g.phrase)}</dt><dd>${esc(g.local || "")}${g.romanized ? ` <span class="enc-dim">(${esc(g.romanized)})</span>` : ""}</dd>`).join("") + `</dl>`;
      if (pi.money_note) ph += `<p>${esc(pi.money_note)}</p>`;
      if (pi.tipping) ph += `<p>${esc(pi.tipping)}</p>`;
      h += section("實用資訊", ph);
    }

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

    // 台灣旅行社「一鍵搜尋」+ 機票查詢 —— 不內嵌即時價格(套裝與票價天天變、且爬取違反 ToS),
    // 連到各家該國搜尋頁 / Google Flights,使用者在原站比價。
    const nm = d.name_zh || code;
    const q = encodeURIComponent(nm);
    const g = (t) => `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    const AGENCIES = [
      ["雄獅旅遊", `https://travel.liontravel.com/search?keyword=${q}`],
      ["易遊網", `https://www.eztravel.com.tw/search?keyword=${q}`],
      ["KKday", `https://www.kkday.com/zh-tw/search?keyword=${q}`],
      ["Klook", `https://www.klook.com/zh-TW/search/?query=${q}`],
      ["東南旅遊", g(`東南旅遊 ${nm} 行程`)],
      ["喜鴻假期", g(`喜鴻假期 ${nm} 行程`)],
      ["可樂旅遊", g(`可樂旅遊 ${nm} 行程`)],
      ["百威旅遊", g(`百威旅遊 ${nm} 行程`)],
    ];
    h += section("找台灣出發的行程",
      `<div class="enc-agencies">` + AGENCIES.map(([n, u]) =>
        `<a href="${esc(u)}" target="_blank" rel="noopener" class="enc-agency">${esc(n)} ↗</a>`).join("") + `</div>` +
      `<div class="enc-agencies" style="margin-top:10px">` +
        `<a href="https://www.google.com/travel/flights?q=${encodeURIComponent(`台北 飛 ${nm} 機票`)}" target="_blank" rel="noopener" class="enc-agency enc-flight">✈ 查台北出發機票(Google Flights)</a>` +
      `</div>` +
      `<p class="enc-dim" style="font-size:11px;margin-top:8px">連到各旅行社「${esc(nm)}」搜尋結果與機票比價;實際價格、檔期以各站為準。</p>`);

    if (hasAdminMap(code))
      h += section("縣市地圖",
        `<p class="enc-dim" style="font-size:12px">點縣市看特色與推薦。★ = 首都。</p>` +
        `<div id="enc-admin-map"></div><div id="enc-region-info"></div>`);

    if (TRANSIT[code])
      h += section("捷運路網圖",
        `<p class="enc-dim" style="font-size:12px">白心大圈 = 轉乘站。自由行搭捷運最實用。</p>` +
        `<div id="enc-transit-map"></div>`);

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

    if (hasAdminMap(code)) {
      const mapBox = document.getElementById("enc-admin-map");
      const cap = window.__earth && window.__earth.content && window.__earth.content[code];
      adminMap.render(mapBox, code, {
        capital: cap && cap.capital_latlon,
        onPick: (name) => renderRegionInfo(code, name),
      }).catch((e) => {
        console.error("[encyclopedia] admin map render failed:", code, e);
        if (mapBox) mapBox.innerHTML = `<p class="enc-dim">縣市地圖載入失敗。</p>`;
      });
    }

    if (TRANSIT[code]) {
      const tBox = document.getElementById("enc-transit-map");
      if (tBox) {
        transitMap.render(tBox, TRANSIT[code]).catch((e) => {
          console.error("[encyclopedia] transit map render failed:", code, e);
          tBox.innerHTML = `<p class="enc-dim">捷運路網圖載入失敗。</p>`;
        });
      }
    }
  }

  async function renderRegionInfo(code, name) {
    const box = document.getElementById("enc-region-info");
    if (!box) return;
    box.innerHTML = `<h4 class="enc-sub">${esc(name)}</h4><p class="enc-dim">載入中…</p>`;
    let data = regionCache.get(code);
    if (!data) {
      data = fetch(`data/admin1/${encodeURIComponent(code)}.regions.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
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

    try {
      let d;
      if (cache.has(code)) {
        d = cache.get(code);
      } else {
        const r = await fetch(`data/deep/${encodeURIComponent(codeToFile(code))}.json`);
        if (seq !== reqSeq) return;          // 已切到別國
        if (!r.ok) throw new Error("not found");
        d = await r.json();
        cache.set(code, d);
      }
      if (seq === reqSeq) render(code, d);
    } catch (e) {
      console.error("[encyclopedia] open failed:", code, e);
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
