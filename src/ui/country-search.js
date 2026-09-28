import { esc } from "../lib/esc.js";
import { isEn } from "../lib/i18n.js";

// 🔍 萬用搜尋:國家、首都城市、功能(打「地震」「充電站」「高鐵」直接打開)、景點直播、
// 山脈河流等地理、我的收藏,全部在同一個框搜尋。方向鍵 + Enter 或點選;Ctrl+K 或 / 快速叫出。
const MAX_RESULTS = 14;
const KIND_ORDER = { recent: -1, fav: 0, feature: 1, country: 2, capital: 3, cam: 4, geo: 5, sky: 6 };
// 結果分組的標題(組跟組之間有分隔線)
const GROUP = {
  recent: ["🕘 最近看過", "🕘 Recent"], fav: ["⭐ 我的收藏", "⭐ Saved"], feature: ["🎛️ 功能", "🎛️ Features"], country: ["🌍 國家", "🌍 Countries"],
  capital: ["🏙️ 首都城市", "🏙️ Capitals"], cam: ["📺 景點直播", "📺 Live cams"], geo: ["⛰️ 山川地理", "⛰️ Nature"],
  sky: ["✨ 星座與行星", "✨ Sky"],
};
const PER_GROUP = 6;

// 功能的別名:讀者不一定知道選單上的名稱
const SYNONYMS = {
  "weather-toggle": "天氣 氣溫 溫度 下雨 降雨 冷 熱 weather rain temperature",
  "quake-toggle": "地震 震度 earthquake quake",
  "satellite-toggle": "颱風 雲圖 颶風 衛星雲圖 typhoon hurricane cloud",
  "flight-toggle": "飛機 航班 飛航 班機 flight plane",
  "livecam-toggle": "直播 攝影機 鏡頭 即時影像 webcam live cam",
  "moon-toggle": "月亮 月相 滿月 月球 moon",
  "orbit-toggle": "衛星 太空站 ISS 星鏈 satellite station",
  "launch-toggle": "火箭 發射 SpaceX 太空 rocket launch",
  "sun-toggle": "晨昏 白天 黑夜 日夜 太陽 day night sun",
  "quiz-toggle": "猜謎 遊戲 測驗 考試 quiz game",
  "passport-toggle": "護照 集章 蓋章 去過 passport",
  "flightsim-toggle": "模擬 飛行 旅程 flight simulator",
  "compare-toggle": "比較 對比 compare",
  "otd-toggle": "歷史 今天 history",
  "radio-toggle": "電台 廣播 收音機 radio",
  "airport-toggle": "機場 航班 桃園 松山 小港 airport",
  "traffic-toggle": "路況 塞車 國道 高速公路 監視器 CCTV 交通 traffic",
  "thsr-toggle": "高鐵 時刻表 THSR high speed rail",
  "tra-toggle": "台鐵 臺鐵 火車 時刻表 train railway",
  "ev-toggle": "充電 充電站 充電樁 電動車 特斯拉 EV charger",
  "aurora-toggle": "極光 北極光 南極光 aurora",
  "meteor-toggle": "流星 流星雨 英仙座 雙子座 獅子座 meteor",
  "cinema-toggle": "電影 巡航 螢幕保護 自動播放 cinema",
  "voice-toggle": "人聲 播報 語音 朗讀 念 說話 voice speech narration",
  "constellation-toggle": "星座 星空 星星 恆星 獵戶座 北斗七星 constellation star",
  "sunpanel-toggle": "太陽 節氣 日出 日落 直射 sun sunrise sunset",
  "planet-toggle": "行星 五大行星 金星 火星 木星 土星 水星 planet",
  "timemachine-toggle": "時光機 時間 時光 過去 未來 夏至 冬至 time machine",
  "typhoon-toggle": "颱風 路徑 颶風 熱帶風暴 暴風圈 typhoon hurricane cyclone track",
  "hazard-toggle": "火山 噴發 野火 森林大火 冰山 災害 volcano eruption wildfire iceberg",
  "temp-toggle": "溫度 氣溫 最熱 最冷 排行 首都 temperature hottest coldest",
  "iss-ride-toggle": "太空站 ISS 太空人 視角 搭乘 astronaut",
  "moonview-toggle": "月球 月亮 地出 阿波羅 從月球 earthrise",
  "neo-toggle": "小行星 隕石 彗星 近地 撞地球 asteroid meteor",
  "bday-toggle": "生日 出生 那一天 紀念日 星座 birthday",
  "plates-toggle": "板塊 板塊構造 地震帶 火環帶 環太平洋 隱沒帶 海溝 中洋脊 斷層 大陸漂移 為什麼台灣地震多 plate tectonics ring of fire subduction",
  "layers-toggle": "地球剖面 地心 地核 地函 地殼 岩漿 大氣層 臭氧層 內部 構造 earth layers core mantle crust atmosphere",
  "fav-btn": "收藏 最愛 書籤 我的 favorite bookmark",
  "tour-btn": "導覽 教學 說明 怎麼用 help tour",
  "theme-toggle": "主題 版面 風格 theme",
  "share-btn": "分享 連結 share link",
};
const ICONS = {
  "weather-toggle": "🌡️", "quake-toggle": "📳", "satellite-toggle": "🌀", "flight-toggle": "✈️", "livecam-toggle": "📺", "moon-toggle": "🌙",
  "orbit-toggle": "🛰️", "launch-toggle": "🚀", "sun-toggle": "🌗", "quiz-toggle": "🎯", "passport-toggle": "🛂", "flightsim-toggle": "🛫",
  "compare-toggle": "⚖️", "otd-toggle": "📜", "radio-toggle": "📻", "aurora-toggle": "🌌", "meteor-toggle": "🌠", "cinema-toggle": "🎬", "voice-toggle": "🗣️", "constellation-toggle": "✨", "sunpanel-toggle": "☀️", "planet-toggle": "🪐", "timemachine-toggle": "🕰️", "typhoon-toggle": "🌀", "hazard-toggle": "🌋", "temp-toggle": "🌡️", "iss-ride-toggle": "🛰️", "moonview-toggle": "🌙", "neo-toggle": "☄️", "bday-toggle": "🎂", "layers-toggle": "🌍", "plates-toggle": "🧩",
  "fav-btn": "⭐", "tour-btn": "❓", "theme-toggle": "🎨", "share-btn": "🔗",
};
const GEO_ICONS = { mountain: "⛰️", peak: "🏔️", river: "🌊", desert: "🏜️", plateau: "🗻", plain: "🌾", lake: "💧", other: "📍" };
const HOT = ["quake-toggle", "weather-toggle", "livecam-toggle", "aurora-toggle", "meteor-toggle", "traffic-toggle", "cinema-toggle"];

export function createCountrySearch({ index, onPick, content = {}, favorites = null, recent = null, onFav, onCam, onGeo, sky, onSky }) {
  const box = document.getElementById("country-search");
  if (!box || !Array.isArray(index) || !index.length) return { destroy() {} };
  const input = box.querySelector("input");
  const list = box.querySelector("ul");
  let matches = [];
  let active = -1;

  const norm = (s) => String(s || "").toLowerCase().trim();
  // 「台」「臺」是同一個字的異體(臺灣/台灣都通用),中文比對前先統一成同一個字,
  // 不然打「台灣」搜不到條目裡登記的「臺灣」。
  const normZh = (s) => String(s || "").trim().replace(/臺/g, "台").toLowerCase();
  const nameOf = (code) => index.find((x) => x.code === code)?.zh || code;

  // ---------- 搜尋來源 ----------
  const countries = index.map((it) => ({ kind: "country", zh: it.zh, en: it.en, code: it.code, go: () => onPick(it.code) }));
  const capitals = [];
  for (const [code, c] of Object.entries(content || {})) {
    if (c && c.capital_zh && Array.isArray(c.capital_latlon)) {
      capitals.push({ kind: "capital", zh: c.capital_zh, en: c.capital_en || "", sub: `${nameOf(code)}的首都`, code, go: () => onPick(code) });
    }
  }
  function features() {
    const out = [];
    const ids = [...document.querySelectorAll("#ctrl-dock .layer-row[id], #top-tools button[id]")].filter((b) => !b.hidden);
    for (const b of ids) {
      if (!SYNONYMS[b.id]) continue;
      const clone = b.cloneNode(true);
      clone.querySelectorAll(".layer-badge, .layer-icon, .layer-dot").forEach((x) => x.remove());
      const label = clone.textContent.replace(/\s+/g, " ").trim();
      const icon = b.querySelector(".layer-icon")?.textContent.trim() || ICONS[b.id] || "";
      out.push({
        kind: "feature", zh: label, en: "", keys: SYNONYMS[b.id], icon, id: b.id,
        go: () => {
          // 功能選單收合著也照樣打開;已經開著的不要再按(會變成關掉)
          if (b.getAttribute("aria-pressed") !== "true") b.click();
          else b.animate?.([{ background: "rgba(120,170,255,.35)" }, { background: "transparent" }], { duration: 900 });
        },
      });
    }
    return out;
  }
  let cams = [], geo = [], extrasLoaded = false;
  function loadExtras() {
    if (extrasLoaded) return;
    extrasLoaded = true;
    fetch("data/livecams.json").then((r) => (r.ok ? r.json() : null)).then((d) => {
      cams = (d?.cams || []).map((c) => ({ kind: "cam", zh: c.zh, en: "", keys: c.t, icon: c.ico || "📺", go: () => onCam && onCam(c.id) }));
      if (document.activeElement === input && input.value.trim()) refresh();
    }).catch(() => {});
    fetch("data/physical.json").then((r) => (r.ok ? r.json() : null)).then((d) => {
      geo = (d?.features || []).map((f) => ({ kind: "geo", zh: f.zh, en: f.en, sub: f.note, icon: GEO_ICONS[f.k] || "📍", go: () => onGeo && onGeo(f) }));
      if (document.activeElement === input && input.value.trim()) refresh();
    }).catch(() => {});
  }
  const favItems = () => (favorites ? favorites.list().map((x) => ({ kind: "fav", zh: x.name, en: "", icon: x.icon || "⭐", go: () => onFav && onFav(x) })) : []);

  function search(q) {
    const n = normZh(q);
    if (!n) return [];
    const scored = [];
    const stars = (sky ? sky() : []).map((c) => ({ kind: "sky", zh: c.zh, en: c.en, keys: c.alias, icon: c.icon || "✨", go: () => onSky && onSky(c.id) }));
    for (const it of [...favItems(), ...features(), ...countries, ...capitals, ...cams, ...geo, ...stars]) {
      const zh = normZh(it.zh), en = norm(it.en), keys = normZh(it.keys);
      let s = -1;
      if (zh === n || en === n || norm(it.code) === n) s = 0;
      else if (zh.startsWith(n) || en.startsWith(n)) s = 1;
      else if (zh.includes(n) || en.includes(n)) s = 2;
      else if (keys && keys.split(/\s+/).some((k) => k && (k.startsWith(n) || (n.length >= 2 && k.includes(n))))) s = 2;
      else if (n.length >= 2 && keys && keys.includes(n)) s = 3;
      if (s >= 0) scored.push([s, KIND_ORDER[it.kind], it]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    // 同一類放在一起(國家一組、功能一組…),最符合的那一組排最前面;每組最多 6 筆
    const groups = new Map();
    for (const [sc, , it] of scored) {
      if (!groups.has(it.kind)) groups.set(it.kind, { best: sc, items: [] });
      const g = groups.get(it.kind);
      if (g.items.length < PER_GROUP) g.items.push(it);
    }
    return [...groups.entries()]
      .sort((a, b) => a[1].best - b[1].best || KIND_ORDER[a[0]] - KIND_ORDER[b[0]])
      .flatMap(([, g]) => g.items)
      .slice(0, MAX_RESULTS);
  }

  // 還沒打字:最近看過 + 收藏 + 熱門功能 + 全部國家(A–Z)
  function browse() {
    const f = features();
    const hot = HOT.map((id) => f.find((x) => x.id === id)).filter(Boolean);
    const all = [...countries].sort((a, b) => String(a.en || "").localeCompare(String(b.en || "")));
    const rec = (recent ? recent.list() : []).map((code) => countries.find((c) => c.code === code)).filter(Boolean)
      .slice(0, 5).map((c) => ({ ...c, kind: "recent" }));
    return [...rec, ...favItems().slice(0, 6), ...hot, ...all];
  }

  let browsing = false;
  const header = (k) => {
    const label = browsing && k === "country" ? (isEn ? "🌍 All countries (A–Z)" : "🌍 全部國家(A–Z)")
      : browsing && k === "feature" ? (isEn ? "🎛️ Popular features" : "🎛️ 常用功能") : GROUP[k][isEn ? 1 : 0];
    const clear = k === "recent" ? `<button type="button" class="cs-clear">${isEn ? "Clear" : "全部清除"}</button>` : "";
    return `<li class="cs-sep">${label}${clear}</li>`;
  };
  function render() {
    if (!matches.length) {
      if (input.value.trim()) { list.innerHTML = `<li class="cs-none">找不到「${esc(input.value.trim())}」,換個關鍵字試試(國家、城市、功能、景點)</li>`; list.hidden = false; }
      else { list.hidden = true; list.innerHTML = ""; }
      return;
    }
    // 國旗用跟大百科/側欄同一個免費 CDN(flagcdn.com);找不到旗子的代碼就把圖藏起來,不留破圖示
    let prevKind = null;
    list.innerHTML = matches.map((m, i) => {
      const sep = m.kind !== prevKind ? header(m.kind) : "";
      prevKind = m.kind;
      const lead = m.kind === "country" || m.kind === "capital" || m.kind === "recent"
        ? `<img class="cs-flag" src="https://flagcdn.com/w40/${String(m.code || "").toLowerCase()}.png" alt="" onerror="this.style.visibility='hidden'">`
        : `<span class="cs-ico">${esc(m.icon || (m.kind === "geo" ? "⛰️" : "🎛️"))}</span>`;
      const sub = m.sub ? `<span class="cs-sub">${esc(m.sub)}</span>` : m.en ? `<span class="cs-en">${esc(m.en)}</span>` : "";
      const del = m.kind === "recent" ? `<button type="button" class="cs-del" data-del="${esc(m.code)}" title="${isEn ? "Remove" : "從最近看過移除"}" aria-label="${isEn ? "Remove" : "移除"}">✕</button>` : "";
      return `${sep}<li data-i="${i}" class="${i === active ? "active" : ""}">${lead}<span class="cs-txt"><span class="cs-zh">${esc(m.zh)}</span>${sub}</span>${del}</li>`;
    }).join("");
    list.hidden = false;
    list.querySelector("li.active")?.scrollIntoView({ block: "nearest" });
  }
  function refresh() { browsing = false; matches = search(input.value); active = matches.length ? 0 : -1; render(); }

  function choose(m) {
    if (!m) return;
    input.value = "";
    matches = []; active = -1; render();
    input.blur();
    m.go();
  }

  input.addEventListener("input", refresh);
  input.addEventListener("focus", () => {
    loadExtras();
    if (input.value.trim()) return;
    browsing = true;
    matches = browse();
    active = -1;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, matches.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(matches[Math.max(0, active)]); }
    else if (e.key === "Escape") { input.value = ""; matches = []; render(); input.blur(); }
  });
  list.addEventListener("mousedown", (e) => {
    // 最近看過:✕ 刪一筆、「全部清除」;畫面維持在瀏覽清單,輸入框不失去焦點
    const del = e.target.closest(".cs-del"), clr = e.target.closest(".cs-clear");
    if (del || clr) {
      e.preventDefault();
      if (del) recent?.remove(del.dataset.del); else recent?.clear();
      browsing = true; matches = browse(); active = -1; render();
      return;
    }
    const li = e.target.closest("li[data-i]");
    if (li) { e.preventDefault(); choose(matches[Number(li.dataset.i)]); }
  });
  input.addEventListener("blur", () => { setTimeout(() => { matches = []; render(); }, 120); });

  // Ctrl+K / ⌘K / 「/」:從任何地方叫出搜尋(正在打字的欄位裡不攔截「/」)
  window.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  return { destroy() { box.remove(); }, focus: () => input.focus() };
}
