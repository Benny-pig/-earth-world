// 🌐 英文介面。右上角「EN / 中」切換(記在這台瀏覽器,預設中文)。
// 做法:一張「中文 → 英文」對照表,英文模式時把畫面上完全符合的文字(包括之後才打開的面板)
// 換成英文;國名本來就有英文,改成只顯示英文。國家介紹、百科等內文只有中文,維持原樣,
// 並提示外國讀者可以用瀏覽器內建的翻譯看全文。
const KEY = "earth-world.lang";
export const LANG = (() => { try { return localStorage.getItem(KEY) === "en" ? "en" : "zh"; } catch { return "zh"; } })();
export const isEn = LANG === "en";

const DICT = {
  // 載入、共用
  "地球世界": "Earth World", "‹ 返回": "‹ Back", "返回地球": "Back to globe", "關閉": "Close", "收合": "Collapse", "收合面板": "Collapse panel",
  "你的瀏覽器不支援 WebGL,無法顯示地球世界。": "Your browser doesn't support WebGL, so Earth World can't be shown.",
  "請改用較新版本的 Chrome / Edge / Firefox。": "Please use a recent version of Chrome, Edge or Firefox.",
  // 右上角
  "🔗 分享": "🔗 Share", "分享這一頁": "Share this page", "分享目前畫面": "Share this view", "分享目前畫面(複製連結)": "Share this view (copy link)",
  "🌙 星空": "🌙 Night", "☀ 旅誌": "☀ Journal", "⚜ 史詩": "⚜ Epic", "◎ 戰術": "◎ HUD", "切換版面主題": "Change theme",
  "📲 安裝 App": "📲 Install app", "把地球世界安裝成 App": "Install Earth World as an app", "安裝到手機/電腦,像 App 一樣全螢幕開啟": "Install on your phone or computer and open it full-screen like an app",
  "重看新手導覽": "Replay the tour", "新手導覽": "Tour",
  // 搜尋
  "搜尋國家(中 / English)": "Search countries (English / 中文)", "搜尋國家": "Search countries",
  "🔍 搜尋國家、城市、功能、景點…": "🔍 Search countries, cities, features, places…", "搜尋國家、城市、功能、景點": "Search countries, cities, features, places",
  "快速鍵:Ctrl+K 或 /": "Shortcut: Ctrl+K or /",
  // 收藏、極光、流星雨、電影巡航
  "⭐ 收藏": "⭐ Saved", "我的收藏": "Saved", "⭐ 我的收藏": "⭐ Saved", "＋ 收藏目前畫面": "＋ Save this view", "☆ 收藏": "☆ Save", "★ 已收藏": "★ Saved",
  "加入我的收藏": "Save", "收藏這個電台": "Save this station", "把這個電台加入我的收藏": "Save this station",
  "國家介紹、景點直播、廣播電台旁邊按「☆ 收藏」也會記在這裡": "Tap “☆ Save” on a country, live cam or radio station to keep it here",
  "📌 畫面": "📌 Views", "🌍 國家": "🌍 Countries", "📺 景點直播": "📺 Live cams", "📻 廣播電台": "📻 Radio",
  "收藏只存在這台裝置的瀏覽器裡,不會上傳;清除瀏覽器資料會一起清掉。": "Saved items stay in this browser only — nothing is uploaded. Clearing browser data removes them.",
  "極光即時預報": "Aurora forecast", "🌌 極光即時預報": "🌌 Aurora forecast", "📍 熱門極光地點 · 現在": "📍 Aurora spots · now",
  "流星雨": "Meteor showers", "🌠 流星雨": "🌠 Meteor showers", "▶ 在地球旁看流星雨": "▶ Watch the shower", "⏹ 停止流星雨": "⏹ Stop the shower", "📅 接下來一年": "📅 Next 12 months",
  "電影巡航": "Cinematic tour", "板塊與地震帶": "Plates & quake belts", "🧩 板塊與地震帶": "🧩 Plates & quake belts",
  "即時世界": "Live world", "今日地球": "Today on Earth", "📰 今日地球": "📰 Today on Earth", "旅人百科": "Travel", "全球風場": "Global winds", "數據地球": "Data globe", "出國小幫手": "Travel helper",
  "🌬️ 全球風場": "🌬️ Global winds", "📊 數據地球": "📊 Data globe", "🧳 出國小幫手": "🧳 Travel helper", "太空天象": "Space & sky", "探索遊戲": "Explore & play", "地球剖面:大氣到地心": "Earth's layers: sky to core", "世界溫度排行": "World temperatures", "🌡️ 世界溫度排行": "🌡️ World temperatures", "搭上國際太空站": "Ride the ISS",
  "從月球看地球": "Earth from the Moon", "小行星掠過地球": "Asteroid flybys", "☄️ 小行星掠過地球": "☄️ Asteroid flybys", "生日那天的天空": "Your birthday sky",
  "🎂 生日那天的天空": "🎂 Your birthday sky", "🔥 最熱": "🔥 Hottest", "❄️ 最冷": "❄️ Coldest", "✨ 看那天的天空": "✨ Show that sky", "火山與野火": "Volcanoes & wildfires", "🌋 火山與野火": "🌋 Volcanoes & wildfires", "颱風路徑": "Typhoon tracks", "🌀 颱風路徑": "🌀 Typhoon tracks", "五大行星": "Planets", "🪐 五大行星": "🪐 Planets",
  "時光機": "Time machine", "🕰️ 時光機": "🕰️ Time machine", "📅 日期": "📅 Date", "🕐 時間": "🕐 Time", "▶ 一秒一小時": "▶ 1 hour/sec", "⏩ 一秒一天": "⏩ 1 day/sec",
  "↺ 回到現在": "↺ Now", "跳到:": "Jump to:", "今晚 21:00": "Tonight 21:00", "下次滿月": "Next full moon", "夏至": "June solstice", "冬至": "December solstice",
  "春分": "March equinox", "秋分": "September equinox", "⚙️ 設定": "⚙️ Settings", "設定": "Settings", "🔤 字體": "🔤 Text", "🎨 主題": "🎨 Theme", "🌐 語言": "🌐 Language",
  "❓ 新手導覽": "❓ Tour", "📲 安裝成 App": "📲 Install app", "標準": "M", "特大": "XL", "星空": "Night", "旅誌": "Journal", "史詩": "Epic", "戰術": "HUD",
  "設定:字體大小、主題、語言、導覽": "Settings: text size, theme, language, tour", "星座與亮星": "Constellations", "太陽與節氣": "Sun & solar terms", "☀️ 太陽與節氣": "☀️ Sun & solar terms", "☀️ 太陽": "☀️ Sun", "北方朝上": "North up", "回到台灣": "Back to Taiwan", "字體大小": "Text size", "人聲播報": "Voice narration", "🗣️ 人聲播報": "🗣️ Voice narration", "🔊 朗讀": "🔊 Read aloud",
  "用語音唸出這個國家的介紹": "Read this country's intro aloud", "要播報哪些內容": "What to announce", "聲音": "Voice", "▶ 試聽": "▶ Preview",
  "🌍 打開國家時的介紹": "🌍 Country intros", "🎬 電影巡航的地名": "🎬 Cinematic tour places", "✈️ 飛行模擬的機長廣播": "✈️ Flight announcements", "📳 規模 6 以上的地震快報": "📳 Earthquakes M6+",
  "開啟播報": "Turn on", "關閉播報": "Turn off", "🔊 播報中": "🔊 On", "🔇 已關閉": "🔇 Off",
  "用語音播報國家介紹、電影巡航地名、機長廣播、地震快報": "Read out country intros, tour places, flight announcements and earthquake alerts", "點任何地方結束": "Tap anywhere to exit", "不要在閒置時自動播放": "Don't auto-play when idle", "閒置時自動播放:已關閉": "Auto-play when idle: off",
  "介面淡出,鏡頭像紀錄片一樣飛過世界各地(點任何地方結束)": "The interface fades away and the camera glides around the world like a documentary (tap anywhere to exit)",
  // 右下選單
  "台灣交通": "Taiwan transport", "機場航班": "Airport flights", "即時路況": "Live traffic", "高鐵時刻": "High-speed rail", "台鐵時刻": "TRA trains",
  "功能": "Features", "🌍 即時世界": "🌍 Live world", "🚀 太空與天象": "🚀 Space & sky", "🧭 探索與遊戲": "🧭 Explore & play", "🎵 聲音": "🎵 Sound",
  "全球氣溫與降雨": "Global temperature & rain", "全球地震顯示": "Earthquakes", "颱風衛星雲圖": "Typhoon satellite images", "世界機場航班": "World flights",
  "世界即時景點直播": "Live cams around the world", "衛星與太空站": "Satellites & space stations", "太空發射日曆": "Rocket launch calendar",
  "真實晨昏線": "Real day & night", "地理猜謎遊戲": "Geography quiz", "旅行護照集章": "Travel passport", "飛行旅程模擬": "Flight simulator",
  "國家比較": "Compare countries", "電動車充電站": "EV charging", "⚡ 電動車充電站 · 全台": "⚡ EV charging · Taiwan", "月亮與月相": "Moon & phases", "🌙 月亮與月相": "🌙 Moon & phases", "歷史上的今天": "On this day", "當地廣播電台": "Local radio",
  "偵測到規模 6 以上地震": "Magnitude 6+ earthquake detected", "地球停止自轉,白天黑夜照現在的真實時間顯示": "Stop spinning and show real day and night right now",
  // 音樂列
  "背景音樂開關": "Music on/off", "背景音樂": "Background music", "音量": "Volume", "選擇背景音樂": "Choose music",
  "RO 懷舊原聲(官方 YouTube)": "Ragnarok Online soundtrack (official YouTube)", "切換該國電台": "Switch station", "停止電台": "Stop radio",
  // 各面板標題
  "⚖️ 國家比較": "⚖️ Compare countries", "🌡️ 全球即時天氣": "🌡️ Live world weather", "🎵 RO 懷舊原聲": "🎵 Ragnarok Online soundtrack",
  "📺 世界即時直播": "📺 Live cams", "✈️ 飛行旅程模擬": "✈️ Flight simulator", "🛂 我的旅行護照": "🛂 My travel passport", "🎯 地理猜謎": "🎯 Geography quiz",
  "📅 歷史上的今天 ·": "📅 On this day ·", "▶ 自動導覽": "▶ Auto tour", "🚀 太空發射日曆": "🚀 Rocket launches", "🛰️ 衛星與太空站": "🛰️ Satellites & stations",
  "🛰️ 國際太空站 ISS 現在": "🛰️ The ISS right now", "📍 鎖定追蹤太空站": "📍 Follow the ISS", "🔭 下次飛過台灣(台北)上空": "🔭 Next passes over Taipei",
  "🚆 鐵路時刻": "🚆 Train times", "🚄 高鐵": "🚄 HSR", "🚆 台鐵": "🚆 TRA", "出發": "From", "抵達": "To", "今天": "Today", "明天": "Tomorrow", "後天": "In 2 days",
  "📻 電台選台": "📻 Radio stations", "🚗 台灣路況中心 · 國道": "🚗 Taiwan traffic · freeways", "🗺️ 路況地圖": "🗺️ Map", "📋 壅塞排行": "📋 Worst jams", "📹 監視器": "📹 Cameras",
  "🏝️ 全台": "🏝️ All", "🏙️ 北部": "🏙️ North", "⛰️ 中部": "⛰️ Central", "🌴 南部": "🌴 South",
  "順暢": "Smooth", "車多": "Busy", "壅塞": "Congested", "嚴重壅塞": "Heavy", "幾乎停滯": "Standstill", "無資料": "No data",
  "全部方向": "All directions", "北向": "Northbound", "南向": "Southbound", "東向": "Eastbound", "西向": "Westbound",
  "◀ 上一支": "◀ Previous", "⏸ 暫停": "⏸ Pause", "下一支 ▶": "Next ▶",
  "✈️ 當地即時航班": "✈️ Live flights nearby", "在 OpenSky 完整地圖看即時航班 ↗": "See all live flights on OpenSky ↗",
  "🌀 即時衛星雲圖": "🌀 Live satellite images", "西太平洋(颱風)": "West Pacific (typhoons)", "大西洋(颶風)": "Atlantic (hurricanes)",
  "🛫 台灣機場即時航班": "🛫 Taiwan airport flights", "桃園": "Taoyuan", "松山": "Songshan", "高雄": "Kaohsiung", "台中": "Taichung",
  "出境 Departures": "Departures", "入境 Arrivals": "Arrivals", "準時": "On time", "已出發/已抵達": "Departed / arrived", "延誤/改時間": "Delayed / changed", "取消": "Cancelled", "表定": "Scheduled",
  "立即更新最新資訊": "Refresh now", "燈號說明": "Legend", "重新查詢": "Search again", "出發站": "From station", "交換出發/抵達": "Swap", "抵達站": "To station",
  "其他日期": "Other date", "關閉當地廣播電台": "Close radio", "洲別": "Region", "🔍 搜尋國家或電台名稱": "🔍 Search a country or station", "搜尋國家或電台": "Search a country or station",
  "地區": "Region", "路況顏色說明": "Traffic colours", "國道": "Freeway", "方向": "Direction", "交流道/地名": "Interchange / place", "搜尋交流道或地名": "Search an interchange or place",
  "關閉監視器畫面": "Close camera",
  // 國家側欄
  "國家大百科 · 詳細介紹": "Encyclopedia · details", "大百科 · 詳細介紹": "Encyclopedia · details", "🔗 分享這個國家": "🔗 Share this country",
  "🛂 我去過這裡": "🛂 I've been here", "✅ 去過了・已蓋章": "✅ Visited · stamped",
  "緊急聯絡": "Emergency contacts", "📰 今日新聞": "📰 Today's news", "特色": "Highlights", "美食": "Food", "未來一週天氣": "7-day weather",
  "適合旅遊月份": "Best months to visit", "歷史介紹": "History", "載入中…": "Loading…",
  // 旅遊警示等級與通用說明(外交部分級)
  "灰色：提醒注意": "Grey: stay alert", "黃色：特別注意旅遊安全並檢討是否有必要前往": "Yellow: take extra care, reconsider travel",
  "橙色：避免非必要旅行": "Orange: avoid non-essential travel", "紅色：儘速離境": "Red: leave as soon as possible",
  "整體情勢平穩,維持一般旅外安全警覺即可。": "Generally stable — normal travel caution is enough.",
  "局部治安或情勢需留意,建議提高警覺。": "Some areas need attention — stay alert.",
  "安全風險升高,避免非必要旅行。": "Higher safety risk — avoid non-essential travel.",
  "安全情勢嚴峻,不宜前往,已在當地者宜儘速離境。": "Serious safety situation — do not travel; leave if you are there.",
  // 背景音樂曲名
  "冥想即興 · 靜心鋼琴": "Meditation · calm piano", "吉諾佩第 No.1 · 古典鋼琴": "Gymnopédie No.1 · classical piano",
  "雨天小鎮 · 奇幻 lofi": "Rainy Town · fantasy lofi", "城堡 · lofi 奇幻鋼琴": "Castle · lofi fantasy piano", "伊甸細語 · lofi 奇幻鋼琴": "Whisper Eden · lofi fantasy piano",
  "古堡迴圈 · 中世紀 lofi": "Castle Loops · medieval lofi", "中世紀旅店": "Medieval Inn",
  "🔎 在 Google 新聞看": "🔎 Google News:", "(維基百科 · 點一下看全文)": "(Wikipedia · tap to expand)", "🌍 近兩週國際大事": "🌍 World events, past 2 weeks",
  // 其他常見按鈕
  "下一步": "Next", "上一步": "Back", "略過": "Skip", "開始探索 🌏": "Start exploring 🌏", "跳過 ›": "Skip ›",
};
const ATTRS = ["placeholder", "title", "aria-label"];
// 短標籤裡常見的詞(只用在 70 字以內、不是內文段落的短文字,長段落不動,免得變成中英夾雜)
const PARTS = [
  ["臺灣時間", "Taiwan time"], ["當地時間", "Local time"], ["與台灣", "vs Taiwan"], ["首都:", "Capital: "], ["人口:", "Population: "],
  ["時區:", "Time zone: "], ["位置:", "Location: "], ["警察", "Police"], ["消防・救護", "Fire & ambulance"], ["消防", "Fire"], ["救護", "Ambulance"],
  ["小時", "h"], ["我國駐外館處", "Taiwan missions"], ["中國大使館", "PRC embassies"], [" 處", ""],
  ["(週日)", "(Sun)"], ["(週一)", "(Mon)"], ["(週二)", "(Tue)"], ["(週三)", "(Wed)"], ["(週四)", "(Thu)"], ["(週五)", "(Fri)"], ["(週六)", "(Sat)"],
];

function translateText(node) {
  const raw = node.nodeValue;
  const key = raw.replace(/\s+/g, " ").trim();
  if (!key) return;
  // \u53ea\u6709\u771f\u7684\u6709\u8b8a\u624d\u5beb\u56de\u53bb:\u5beb\u56de\u4e00\u6a21\u4e00\u6a23\u7684\u6587\u5b57\u4e5f\u7b97\u300c\u6587\u5b57\u8b8a\u4e86\u300d,\u6703\u8ddf\u4e0b\u9762\u7684\u76e3\u807d\u5668\u7121\u9650\u5faa\u74b0
  const put = (to) => { const next = raw.includes(key) ? raw.replace(key, to) : to; if (next !== raw) node.nodeValue = next; };
  const en = DICT[key];
  if (en) { put(en); return; }
  if (key.length <= 70 && /[\u4e00-\u9fff]/.test(key) && !node.parentElement?.closest("#side-panel p, #side-panel li, .enc-body, #encyclopedia")) {
    let out = key;
    for (const [zh, e] of PARTS) out = out.split(zh).join(e);
    if (out !== key) put(out);
  }
}
function translateEl(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v && DICT[v.trim()]) el.setAttribute(a, DICT[v.trim()]);
  }
}
function translateTree(root) {
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 || root.closest?.("script,style")) return;
  translateEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? translateText(n) : translateEl(n);
}

export function t(zh) { return isEn && DICT[zh] ? DICT[zh] : zh; }

export function setupI18n() {
  const btn = document.getElementById("lang-btn");
  if (btn) {
    btn.textContent = isEn ? "中" : "EN";
    btn.title = isEn ? "切換成中文" : "Switch to English";
    btn.addEventListener("click", () => {
      try { localStorage.setItem(KEY, isEn ? "zh" : "en"); } catch { /* 存不了就只換這一次 */ }
      location.href = location.pathname + "?nointro";   // 重新載入,整個介面用新語言畫一次
    });
  }
  if (!isEn) return;
  document.documentElement.lang = "en";
  document.documentElement.classList.add("lang-en");
  document.title = "Earth World";
  translateTree(document.body);
  // 之後才打開的面板、更新的文字也翻
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") translateText(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  // 內文只有中文:提醒一次可以用瀏覽器翻譯
  try {
    if (!sessionStorage.getItem("earth-world.en-note")) {
      sessionStorage.setItem("earth-world.en-note", "1");
      const n = document.createElement("div");
      n.id = "en-note";
      n.innerHTML = `ℹ️ Country descriptions and the encyclopedia are written in Traditional Chinese. For full English, use your browser's built-in <b>Translate</b>. <button type="button" aria-label="Close">✕</button>`;
      n.querySelector("button").addEventListener("click", () => n.remove());
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 15000);
    }
  } catch { /* 無痕模式存不了就不提醒 */ }
}
