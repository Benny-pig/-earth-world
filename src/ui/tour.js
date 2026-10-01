// 👋 新手導覽:第一次來的讀者,開場運鏡結束後依序介紹畫面上的重點(其他地方變暗、只亮出那一塊),
// 可以略過、上一步、下一步;右上角「❓」隨時重看。
// 另外每個功能第一次打開時,跳出一句說明它在做什麼(每個功能只提示一次)。
import { isEn } from "../lib/i18n.js";

const KEY = "earth-world.tour";
const SEEN_KEY = "earth-world.hints";

// 新讀者看完整的導覽;看過舊版導覽的老讀者,只看一段「最近的新功能」(NEW_VERSION 換了就會再看一次)
const NEW_VERSION = "2026-10";
const STEPS = [
  { sel: null, title: "👋 歡迎來到地球世界!", text: "用手指或滑鼠<b>拖曳</b>就能轉動地球,<b>滾輪或兩指</b>可以放大縮小。" },
  { sel: null, title: "🌏 點任何一個國家", text: "會打開這個國家的介紹:當地時間、天氣、緊急電話、今日新聞、國家大百科;要出國的話按「🧳 出國小幫手」,簽證、插座、匯率一頁看完。" },
  { sel: "#country-search", title: "🔎 萬用搜尋", text: "國家、城市、功能(例如「地震」「充電站」)、景點直播都搜得到;電腦按 Ctrl+K 就能叫出來。" },
  { sel: "#layer-controls", title: "🎛️ 功能選單", text: "四十幾個功能分成五頁:<b>即時世界、太空天象、探索遊戲、旅人百科、聲音</b>。按一下打開、再按一下關掉;分頁上的小數字是那一頁開著幾個。" },
  { sel: null, title: "📰 今日地球", text: "每天第一次打開網站,會跳出今天的地球重點:最大的地震、颱風、全球最熱最冷的首都、今晚的天象…點一項就飛過去。" },
  { sel: "#home-dock", title: "🎲 不知道看什麼?", text: "按左下角的<b>骰子</b>,隨機飛到世界上某個地方,附一句冷知識。指北針讓北方朝上,🏠 一鍵回到台灣。" },
  { sel: "#tw-controls", title: "🚦 台灣交通", text: "台灣機場即時航班、國道路況與監視器、高鐵台鐵時刻、電動車充電站。" },
  { sel: "#top-tools", title: "🔗 分享、收藏、設定", text: "把現在的畫面分享給朋友、打開我的收藏;「⚙️ 設定」裡可以調字體大小、換版面主題、切換中英文、重看這個導覽。" },
  { sel: null, title: "💡 兩個小技巧", text: "同時開好幾個功能時,面板旁邊會出現<b>小分頁</b>,點一下就能切換。手機按<b>「返回」</b>會先關掉面板,不會直接離開網站。" },
];

const STEPS_EN = [
  { sel: null, title: "👋 Welcome to Earth World!", text: "<b>Drag</b> to spin the globe; use the <b>scroll wheel or two fingers</b> to zoom." },
  { sel: null, title: "🌏 Tap any country", text: "See its local time, weather, emergency numbers, today's news and a detailed encyclopedia. Travelling? Tap “🧳 Travel helper”." },
  { sel: "#country-search", title: "🔎 Search everything", text: "Countries, cities, features (try “earthquake” or “aurora”) and live cams. On a computer, press Ctrl+K." },
  { sel: "#layer-controls", title: "🎛️ Features", text: "Forty-odd features in five tabs. <b>Tap to turn on, tap again to turn off</b>; the small number on a tab shows how many are on." },
  { sel: null, title: "📰 Today on Earth", text: "The first time you open the site each day you get today's highlights: the biggest earthquake, typhoons, the hottest and coldest capitals, tonight's sky…" },
  { sel: "#home-dock", title: "🎲 Not sure where to look?", text: "Tap the <b>dice</b> at the bottom left to fly somewhere random with a fun fact. The compass turns north up; 🏠 flies home." },
  { sel: "#tw-controls", title: "🚦 Taiwan transport", text: "Live flights at Taiwan's airports, freeway traffic and cameras, train timetables and EV chargers." },
  { sel: "#top-tools", title: "🔗 Share, saved & settings", text: "Share this view or open your saved places. “⚙️ Settings” has text size, theme, language (EN / 中) and this tour." },
  { sel: null, title: "💡 Two tips", text: "With several features open, <b>small tabs</b> appear beside the panel to switch between them. On a phone, <b>Back</b> closes the panel instead of leaving the site." },
];

// 老讀者看的「最近的新功能」
const STEPS_NEW = [
  { sel: null, title: "🆕 地球世界有新東西!", text: "這陣子加了不少功能,花 30 秒看一下(可以按「略過」)。" },
  { sel: "#layer-controls", title: "🎛️ 功能選單換新了", text: "分成五頁:<b>即時世界、太空天象、探索遊戲、旅人百科、聲音</b>。新功能有 🌬️ 全球風場、📊 數據地球、🧩 板塊與地震帶、🧳 出國小幫手。" },
  { sel: null, title: "📰 今日地球", text: "每天第一次打開網站,會跳出今天的地球重點;不想看可以在面板下面關掉。" },
  { sel: "#home-dock", title: "🎲 驚喜一下", text: "左下角多了骰子:隨機飛到世界上某個地方,附一句冷知識。" },
  { sel: null, title: "💡 更好用了", text: "同時開好幾個功能時,面板旁邊會出現<b>小分頁</b>切換;手機按「返回」會先關掉面板。旅行護照也能做成<b>分享圖</b>了。" },
];
const STEPS_NEW_EN = [
  { sel: null, title: "🆕 What's new", text: "Quite a few things were added recently. Take 30 seconds (or skip)." },
  { sel: "#layer-controls", title: "🎛️ A new feature menu", text: "Five tabs now. New: 🌬️ Global winds, 📊 Data globe, 🧩 Plates, 🧳 Travel helper." },
  { sel: null, title: "📰 Today on Earth", text: "Today's highlights pop up the first time you open the site each day; you can turn that off in the panel." },
  { sel: "#home-dock", title: "🎲 Surprise me", text: "The dice at the bottom left flies you somewhere random with a fun fact." },
  { sel: null, title: "💡 Easier to use", text: "Small tabs switch between open panels; on a phone, Back closes the panel first. Your travel passport can now become a shareable map." },
];

// 功能第一次打開時的一句話說明
const HINTS_EN = {
  "quake-toggle": "Dots are recent earthquakes — tap one for magnitude, depth and time.",
  "weather-toggle": "Colours show the temperature right now (switch to rain in the panel). On a computer, point anywhere to read the temperature and rainfall.",
  "satellite-toggle": "The latest weather-satellite images — typhoons and large cloud systems.",
  "flight-toggle": "Small planes are flights in the air right now — tap one for details.",
  "livecam-toggle": "Tap a red 📺 circle, or pick a place from the list, to watch it live.",
  "orbit-toggle": "White dots are satellites, yellow ones are space stations. The panel shows when the ISS next passes over Taiwan.",
  "launch-toggle": "🚀 marks rocket launches in the next 30 days — tap one for the time and mission.",
  "sun-toggle": "The globe turns to its real position facing the Sun: the bright half is in daytime now, the dark half at night, and the line between is where the sun is rising or setting.",
  "quiz-toggle": "Look at a flag, dish, landmark or capital, then tap the right country on the globe!",
  "passport-toggle": "Keep track of countries you've really visited: tap “🛂 I've been here” in a country's panel, or stamp several on the globe.",
  "flightsim-toggle": "Pick a destination (or tap a country) and watch the plane fly the shortest route.",
  "compare-toggle": "Tap a country on the globe to compare it side by side with Taiwan.",
  "moon-toggle": "The Moon is shown in its real direction with its real phase — see how full it is and when the next full moon is. You can also tap the Moon itself.",
  "otd-toggle": "Big events that happened on this date — tap one and the globe flies there.",
  "radio-toggle": "Cards on the globe are local radio stations — tap to listen.",
  "airport-toggle": "Live departures and arrivals at Taiwan's airports.",
  "traffic-toggle": "Live freeway traffic — the redder, the busier. Switch regions and watch cameras.",
  "thsr-toggle": "Pick two stations for high-speed rail times and seats.",
  "tra-toggle": "Pick two stations for Taiwan Railway times.",
  "ev-toggle": "Every EV charging station in Taiwan — search by place, filter by connector (Tesla, CCS2…), find the nearest ones and get directions.",
  "today-toggle": "Today's highlights: the biggest earthquake, typhoons, the hottest and coldest capitals, tonight's sky and more. Tap any item to go there.",
  "wind-toggle": "Thousands of lines drift with the real wind (NOAA GFS). Colour shows the speed; point anywhere to read the wind there.",
  "stats-toggle": "Colour the whole globe by population, life expectancy, fertility, income, CO₂… and drag the timeline from 1950 to today.",
  "trip-toggle": "Pick a country: visa for Taiwan passports, plugs and voltage, time difference, exchange rate, tipping and emergency numbers on one page.",
  "plates-toggle": "Plate boundaries coloured by type, the glowing Pacific Ring of Fire, which way the plates move, and why Taiwan has so many earthquakes.",
  "layers-toggle": "The globe is cut open: every layer from the outer atmosphere to the inner core. Tap a layer, or start the journey from space to the centre of the Earth.",
  "temp-toggle": "Right now, which capitals are the hottest and coldest on Earth — and where Taipei ranks. Tap a city to fly there.",
  "neo-toggle": "Asteroids passing Earth this week (NASA): how close (in Moon distances), how big and how fast.",
  "bday-toggle": "Enter your birthday: the Sun, Moon, stars and planets go back to that day, plus what happened in history on that date.",
  "hazard-toggle": "Volcanoes erupting this week (Smithsonian/USGS), plus live wildfires and giant Antarctic icebergs from NASA — tap a marker for details.",
  "planet-toggle": "Mercury, Venus, Mars, Jupiter and Saturn in their real positions — the panel shows which ones you can see from Taiwan tonight, when and where.",
  "timemachine-toggle": "Drag the date and time: the Sun, day/night line, Moon, stars and planets all move together. Jump to the next full moon or a solstice.",
  "typhoon-toggle": "Active typhoons: the track so far, storm and gale areas now, and the 5-day forecast with 70% probability circles. Distance to Taipei included.",
  "constellation-toggle": "Real bright stars in their true directions, with constellation lines and names — tap a name to learn about it. Search “Orion” to fly there.",
  "sunpanel-toggle": "Where the Sun is overhead right now, today's sunrise and sunset in Taipei, the current solar term and how far away the Sun is.",
  "voice-toggle": "Turns on voice narration: country intros, cinematic-tour places, flight announcements and big earthquakes are read aloud. Pick the voice and speed in the panel.",
  "aurora-toggle": "Green curtains around the poles are NOAA's live aurora forecast — brighter means a better chance. Only places in darkness can see it.",
  "meteor-toggle": "The year's major meteor showers: peak dates, the best hours to watch from Taiwan and how much moonlight there is. Tap “Watch the shower” to see one beside the globe.",
};

const HINTS_ZH = {
  "quake-toggle": "地球上的圓點是最近發生的地震,點一下看規模、深度和時間。",
  "weather-toggle": "色塊是全球現在的氣溫(可以切換成降雨);電腦上滑鼠指到哪裡,就會顯示那裡的溫度和雨量。",
  "satellite-toggle": "顯示最新的氣象衛星雲圖,看得到颱風和大範圍的雲系。",
  "flight-toggle": "地球上的小飛機是正在飛的航班位置,點一下看航班資訊。",
  "livecam-toggle": "點地球上的 📺 紅圈,或從清單挑一個地方,看世界各地「現在」的直播畫面。",
  "orbit-toggle": "白點是各種衛星、黃點是太空站;面板裡有太空站下次飛過台灣的時間,可以加進行事曆。",
  "launch-toggle": "🚀 是未來 30 天的火箭發射,點一下看發射時間和任務。",
  "sun-toggle": "地球停止自轉,轉到跟太陽的真實位置:亮的一半現在是白天、暗的是晚上,交界線就是正在日出日落的地方。",
  "quiz-toggle": "看國旗、美食、景點或首都,直接在地球上點出答案!",
  "passport-toggle": "記下你真的去過的國家:在國家介紹按「🛂 我去過這裡」,或在護照裡用「點地球蓋章」。",
  "flightsim-toggle": "選一個目的地(也可以直接點地球上的國家),看飛機沿著最短航線飛過去。",
  "compare-toggle": "直接點地球上的國家,就會跟台灣並排比較。",
  "moon-toggle": "地球旁的月亮在真實的方向、月相也是真的;這裡看今天月亮有多圓、下次滿月是哪天。直接點月亮也會打開。",
  "otd-toggle": "今天在歷史上發生過的大事;點一則,地球會飛到事發地點,也可以按「自動導覽」。",
  "radio-toggle": "地球上的字卡是各國電台,點一下就能收聽;面板裡可以依洲挑台。",
  "airport-toggle": "台灣各機場的即時起降班次,最近要出發的航班會特別標示。",
  "traffic-toggle": "國道即時路況,越紅越塞;可以切換北中南、看監視器畫面。",
  "thsr-toggle": "選出發站和抵達站,查高鐵時刻與剩餘座位。",
  "tra-toggle": "選出發站和抵達站,查台鐵時刻。",
  "ev-toggle": "全台電動車充電站:可以搜尋地名、依充電規格(特斯拉、CCS2…)篩選、找離你最近的,還能直接用 Google 地圖導航。",
  "today-toggle": "今天的地球重點:最大的地震、颱風、全球最熱最冷的首都、今晚天象、節日、歷史上的今天;點任何一項就飛過去。每天第一次打開網站會自動顯示。",
  "wind-toggle": "幾千條線沿著真實的風流動(美國 NOAA 預報),顏色是風速;滑鼠指到哪裡就顯示那裡的風向風速。",
  "stats-toggle": "選一個指標(人口、平均壽命、生育率、所得、碳排放…),整顆地球依數值上色,拖時間軸看 1950 年到現在的變化。",
  "trip-toggle": "選一個要去的國家:台灣護照要不要簽證、插座電壓、時差、匯率、小費和緊急電話,一頁看完。",
  "plates-toggle": "地球表面分成十幾塊板塊,邊界依種類上色,環太平洋火環帶會發光,箭頭是板塊移動的方向;面板裡說明台灣為什麼地震這麼多,也能一鍵疊上地震和火山對照看。",
  "layers-toggle": "地球切開四分之一,從外氣層、臭氧層一路看到地殼、地函、液態外核和內核;點每一層看說明,或按「開始旅程」從太空一路往下到地心。",
  "temp-toggle": "世界各國首都現在的氣溫排行:誰最熱、誰最冷,台北排第幾;點城市就飛過去。",
  "neo-toggle": "這一週經過地球附近的小行星(NASA):離地球幾倍月球距離、有多大、多快。",
  "bday-toggle": "輸入生日,太陽、月亮、星空、行星都回到那一天,還有那天的月相、太陽星座和歷史上的這一天。",
  "hazard-toggle": "本週正在噴發或有動靜的火山(史密森尼學會/美國地質調查所),加上 NASA 即時的野火和南極大冰山;點標記看說明。",
  "planet-toggle": "水星、金星、火星、木星、土星都在真實位置;面板告訴你今晚在台灣看得到哪幾顆、幾點、往哪個方向看。",
  "timemachine-toggle": "拖日期和時間:太陽、晨昏線、月亮、星空、行星一起照那個時間移動;可以一鍵跳到下次滿月、夏至、冬至。",
  "typhoon-toggle": "活動中的颱風:走過的路徑、現在的暴風圈和強風圈、未來 5 天的預報位置與 70% 機率圓,還有離台北多遠。",
  "constellation-toggle": "肉眼看得到的亮星都放在真實方向,連成 88 個星座;點星座名稱看介紹。搜尋「獵戶座」會直接轉過去。",
  "sunpanel-toggle": "看太陽現在直射哪裡、台北今天幾點日出日落、現在是哪個節氣、太陽離地球多遠。也可以直接點地球旁的「☀️ 太陽」。",
  "voice-toggle": "開啟後會用語音唸出國家介紹、電影巡航的地名、飛行模擬的機長廣播和大地震快報;面板裡可以選聲音、調語速。",
  "aurora-toggle": "南北極上空的綠色光簾是 NOAA 的即時極光預報,越亮機率越高;只有天黑的地方看得到。面板裡看世界各大極光景點現在的機會。",
  "meteor-toggle": "一年主要的流星雨:極大期是哪天、台灣幾點最好看、月光干不干擾。按「在地球旁看流星雨」,流星會從輻射點噴出來。",
};

let mode = "full";
const STEPS_USE = () => (mode === "new" ? (isEn ? STEPS_NEW_EN : STEPS_NEW) : (isEn ? STEPS_EN : STEPS));
const HINTS = () => (isEn ? HINTS_EN : HINTS_ZH);

export function createTour() {
  let i = 0, active = false, overlay = null, spot = null, card = null;

  const done = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return true; } };
  const seenNew = () => { try { return localStorage.getItem(`${KEY}.new`) === NEW_VERSION; } catch { return true; } };
  const markDone = () => { try { localStorage.setItem(KEY, "done"); localStorage.setItem(`${KEY}.new`, NEW_VERSION); } catch { /* 存不了就算了 */ } };
  const endListeners = [];

  function build() {
    overlay = document.createElement("div");
    overlay.id = "tour";
    overlay.innerHTML = `<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite"></div>`;
    spot = overlay.querySelector(".tour-spot");
    card = overlay.querySelector(".tour-card");
    card.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]")?.dataset.act;
      if (a === "next") go(i + 1);
      else if (a === "prev") go(i - 1);
      else if (a === "skip") end();
    });
    document.body.appendChild(overlay);
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  function go(n) {
    if (n < 0) return;
    const steps = STEPS_USE();
    if (n >= steps.length) { end(); return; }
    // 目標不在畫面上(例如某些區塊被收起來)就跳過這一步
    const s = steps[n];
    const el = s.sel ? document.querySelector(s.sel) : null;
    if (s.sel && !visible(el)) { go(n > i ? n + 1 : n - 1); return; }
    i = n;
    const last = i === steps.length - 1;
    card.innerHTML = `<div class="tour-step">${i + 1} / ${steps.length}</div><div class="tour-title">${s.title}</div><div class="tour-text">${s.text}</div>` +
      `<div class="tour-btns"><button type="button" data-act="skip" class="tour-skip">${isEn ? "Skip" : "略過"}</button>` +
      (i > 0 ? `<button type="button" data-act="prev">${isEn ? "Back" : "上一步"}</button>` : "") +
      `<button type="button" data-act="next" class="tour-next">${last ? (isEn ? "Start exploring 🌏" : "開始探索 🌏") : (isEn ? "Next" : "下一步")}</button></div>`;
    if (el) {
      const vw = window.innerWidth, vh = window.innerHeight, pad = 6, gap = 12, m = 12;
      const r0 = el.getBoundingClientRect();
      // 目標超出畫面的部分不算(例如很長的選單)
      const r = { left: Math.max(0, r0.left), top: Math.max(0, r0.top), right: Math.min(vw, r0.right), bottom: Math.min(vh, r0.bottom) };
      Object.assign(spot.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.right - r.left + pad * 2}px`, height: `${r.bottom - r.top + pad * 2}px` });
      overlay.classList.remove("center");
      const cw = Math.min(320, vw - m * 2);
      Object.assign(card.style, { width: `${cw}px`, transform: "none" });
      const ch = card.offsetHeight;
      const clampX = (x) => Math.min(vw - cw - m, Math.max(m, x));
      const clampY = (y) => Math.min(vh - ch - m, Math.max(m, y));
      const cx = clampX((r.left + r.right) / 2 - cw / 2), cy = clampY(r.top);
      // 依序試:目標下方、上方、右邊、左邊;挑第一個完整放得進畫面又不蓋到目標的位置
      const tries = [
        [cx, r.bottom + pad + gap], [cx, r.top - pad - gap - ch],
        [r.right + pad + gap, cy], [r.left - pad - gap - cw, cy],
      ];
      const fits = ([x, y]) => x >= m && y >= m && x + cw <= vw - m && y + ch <= vh - m &&
        (y + ch <= r.top - pad || y >= r.bottom + pad || x + cw <= r.left - pad || x >= r.right + pad);
      let pos = tries.find(fits);
      // 都放不下(目標很大):放在目標上方或下方比較大的那塊空白
      if (!pos) pos = r.top > vh - r.bottom ? [cx, clampY(r.top - pad - gap - ch)] : [cx, clampY(r.bottom + pad + gap)];
      Object.assign(card.style, { left: `${pos[0]}px`, top: `${pos[1]}px` });
    } else {
      spot.style.display = "none";
      overlay.classList.add("center");
      Object.assign(card.style, { left: "50%", top: "50%", width: `${Math.min(340, window.innerWidth - 24)}px`, transform: "translate(-50%, -50%)" });
    }
  }

  function start(m = "full") {
    if (active) return;
    mode = m;
    active = true;
    if (!overlay) build();
    overlay.hidden = false;
    i = 0;
    go(0);
  }
  function end() {
    active = false;
    markDone();
    if (overlay) overlay.hidden = true;
    for (const fn of endListeners) fn();
  }
  window.addEventListener("resize", () => { if (active) go(i); });
  document.getElementById("tour-btn")?.addEventListener("click", () => start("full"));

  // ---------- 功能第一次打開的一句話說明 ----------
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { /* 沒有紀錄 */ }
  let hintEl = null, hintTimer = null;
  function showHint(id) {
    const text = HINTS()[id];
    if (!text || seen.has(id) || active) return;
    seen.add(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* 存不了就算了 */ }
    if (!hintEl) {
      hintEl = document.createElement("div");
      hintEl.id = "feature-hint";
      hintEl.addEventListener("click", () => { hintEl.classList.remove("show"); });
      document.body.appendChild(hintEl);
    }
    const label = document.getElementById(id)?.textContent.replace(/\s+/g, " ").trim() || "";
    hintEl.innerHTML = `<b>💡 ${label}</b><span>${text}</span><small>${isEn ? "Tap to close" : "點一下關閉"}</small>`;
    hintEl.classList.remove("show"); void hintEl.offsetWidth; hintEl.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove("show"), 9000);
  }
  document.getElementById("ctrl-dock")?.addEventListener("click", (e) => {
    const row = e.target.closest(".layer-row");
    if (!row?.id) return;
    setTimeout(() => { if (row.getAttribute("aria-pressed") === "true") showHint(row.id); }, 0);
  });

  return {
    start,
    // 第一次來:完整導覽;看過舊版導覽、還沒看過這一版新功能:只看新功能
    maybeStart: () => { if (!done()) start("full"); else if (!seenNew()) start("new"); },
    isActive: () => active,
    onEnd: (fn) => endListeners.push(fn),
  };
}
