// 👋 新手導覽:第一次來的讀者,開場運鏡結束後依序介紹畫面上的重點(其他地方變暗、只亮出那一塊),
// 可以略過、上一步、下一步;右上角「❓」隨時重看。
// 另外每個功能第一次打開時,跳出一句說明它在做什麼(每個功能只提示一次)。
const KEY = "earth-world.tour";
const SEEN_KEY = "earth-world.hints";

const STEPS = [
  { sel: null, title: "👋 歡迎來到地球世界!", text: "用手指或滑鼠<b>拖曳</b>就能轉動地球,<b>滾輪或兩指</b>可以放大縮小。" },
  { sel: null, title: "🌏 點任何一個國家", text: "會打開這個國家的介紹:當地時間、天氣、緊急電話、今日新聞,還有更詳細的國家大百科。" },
  { sel: "#country-search", title: "🔎 搜尋國家", text: "打中文或英文都可以,選了就直接飛過去。" },
  { sel: "#layer-controls", title: "🎛️ 功能選單", text: "地震、天氣、航班、衛星、直播、猜謎遊戲…都在這裡,<b>按一下打開、再按一下關掉</b>。" },
  { sel: "#tw-controls", title: "🚦 台灣交通", text: "台灣機場即時航班、國道路況與監視器、高鐵台鐵時刻。" },
  { sel: "#audio-ui", title: "🎵 音樂", text: "背景音樂可以換曲子;按「🎵 RO」可以聽仙境傳說的懷舊原聲。" },
  { sel: "#top-tools", title: "🔗 分享與主題", text: "把現在的畫面分享給朋友、換版面風格,或把網站安裝成 App。看不懂的時候按「❓」再看一次導覽。" },
];

// 功能第一次打開時的一句話說明
const HINTS = {
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
  "otd-toggle": "今天在歷史上發生過的大事;點一則,地球會飛到事發地點,也可以按「自動導覽」。",
  "radio-toggle": "地球上的字卡是各國電台,點一下就能收聽;面板裡可以依洲挑台。",
  "airport-toggle": "台灣各機場的即時起降班次,最近要出發的航班會特別標示。",
  "traffic-toggle": "國道即時路況,越紅越塞;可以切換北中南、看監視器畫面。",
  "thsr-toggle": "選出發站和抵達站,查高鐵時刻與剩餘座位。",
  "tra-toggle": "選出發站和抵達站,查台鐵時刻。",
};

export function createTour() {
  let i = 0, active = false, overlay = null, spot = null, card = null;

  const done = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return true; } };
  const markDone = () => { try { localStorage.setItem(KEY, "done"); } catch { /* 存不了就算了 */ } };

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
    if (n >= STEPS.length) { end(); return; }
    // 目標不在畫面上(例如某些區塊被收起來)就跳過這一步
    const s = STEPS[n];
    const el = s.sel ? document.querySelector(s.sel) : null;
    if (s.sel && !visible(el)) { go(n > i ? n + 1 : n - 1); return; }
    i = n;
    const last = i === STEPS.length - 1;
    card.innerHTML = `<div class="tour-step">${i + 1} / ${STEPS.length}</div><div class="tour-title">${s.title}</div><div class="tour-text">${s.text}</div>` +
      `<div class="tour-btns"><button type="button" data-act="skip" class="tour-skip">略過</button>` +
      (i > 0 ? `<button type="button" data-act="prev">上一步</button>` : "") +
      `<button type="button" data-act="next" class="tour-next">${last ? "開始探索 🌏" : "下一步"}</button></div>`;
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

  function start() {
    if (active) return;
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
  }
  window.addEventListener("resize", () => { if (active) go(i); });
  document.getElementById("tour-btn")?.addEventListener("click", () => start());

  // ---------- 功能第一次打開的一句話說明 ----------
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { /* 沒有紀錄 */ }
  let hintEl = null, hintTimer = null;
  function showHint(id) {
    const text = HINTS[id];
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
    hintEl.innerHTML = `<b>💡 ${label}</b><span>${text}</span><small>點一下關閉</small>`;
    hintEl.classList.remove("show"); void hintEl.offsetWidth; hintEl.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove("show"), 9000);
  }
  document.getElementById("ctrl-dock")?.addEventListener("click", (e) => {
    const row = e.target.closest(".layer-row");
    if (!row?.id) return;
    setTimeout(() => { if (row.getAttribute("aria-pressed") === "true") showHint(row.id); }, 0);
  });

  return { start, maybeStart: () => { if (!done()) start(); }, isActive: () => active };
}
