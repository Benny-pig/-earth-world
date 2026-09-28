import { esc } from "../lib/esc.js";
import { isEn } from "../lib/i18n.js";
import { makeDraggable } from "../ui/draggable.js";

// 🗣️ 人聲播報:用瀏覽器內建的語音合成(Web Speech API)把畫面上的內容唸出來——
// 打開國家時的介紹、電影巡航的地名、飛行模擬的機長廣播、規模 6 以上的地震快報。
// 不需要金鑰、文字不會上傳;聲音用裝置內建的中文(台灣)語音,沒有的話退而求其次用其他中文語音。
// 播報時背景音樂自動調小聲,唸完再恢復。設定記在這台瀏覽器。
const KEY = "earth-world.voice";
// 語速稍慢、音調稍高一點點,聽起來比較像在跟人聊天,不像在唸稿
const DEFAULTS = { on: false, country: true, cinema: true, flight: true, quake: true, rate: 0.95, voice: "" };
const PITCH = 1.06;
// 聲音自不自然,最大的差別在瀏覽器提供的語音:Edge 的「自然」神經語音最像真人,其次是 Chrome 的 Google 語音
const isNatural = (v) => /natural|online|neural|premium|enhanced/i.test(v.name);
// 電影巡航的旁白改由巡航畫面右下角自己的開關控制
const KINDS = [["country", "🌍 打開國家時的介紹"], ["flight", "✈️ 飛行模擬的機長廣播"], ["quake", "📳 規模 6 以上的地震快報"]];

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
}

export function createVoice({ music, onClose }) {
  const synth = window.speechSynthesis;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === "function";
  const s = loadSettings();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 存不了就算了 */ } };
  let voices = [];

  // 中文模式:優先台灣中文(Edge 的「HsiaoChen/HsiaoYu Online (Natural)」最自然),再來其他中文;英文模式用英文語音
  function listVoices() {
    if (!supported) return [];
    const all = synth.getVoices();
    const want = isEn ? /^en/i : /^(zh|cmn)/i;
    const score = (v) => {
      let k = 0;
      if (isEn ? /en[-_]US/i.test(v.lang) : /(zh|cmn)[-_](TW|Hant)/i.test(v.lang)) k += 10;
      if (isNatural(v)) k += 12;                  // Edge「曉臻/曉雨/雲哲 Online (Natural)」
      if (/google/i.test(v.name)) k += 6;         // Chrome「Google 國語(臺灣)」
      if (/HsiaoChen|HsiaoYu|Mei-?Jia|Meijia/i.test(v.name)) k += 2;   // 溫暖的女聲(Edge、iPhone)
      if (!isEn && /(HK|yue)/i.test(v.lang)) k -= 3;   // 粵語念國語內容會怪怪的
      return k;
    };
    return all.filter((v) => want.test(v.lang)).sort((a, b) => score(b) - score(a));
  }
  function pickVoice() {
    return voices.find((v) => v.voiceURI === s.voice) || voices[0] || null;
  }
  if (supported) {
    voices = listVoices();
    synth.addEventListener?.("voiceschanged", () => { voices = listVoices(); if (panelOpen) render(); });
  }

  // 播報時背景音樂調小聲
  let speaking = 0;
  const duck = (on) => { try { music?.duck?.(on); } catch { /* 沒有這個功能就算了 */ } };

  // kind:哪一類內容(對應設定的勾選);force:讀者自己按「朗讀」的,不看總開關
  function speak(text, { kind = null, force = false, interrupt = true } = {}) {
    if (!supported || !text) return false;
    if (!force && (!s.on || (kind && !s[kind]))) return false;
    // 表情符號會被唸成「起飛的飛機」這種怪東西,先拿掉;換行當成句號,中間才會停頓
    const clean = String(text).replace(/<[^>]+>/g, "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s*\n+\s*/g, "。").replace(/[·•|]/g, ",").replace(/\s+/g, " ").replace(/。+/g, "。").replace(/^[。,\s]+/, "").trim();
    if (!clean) return false;
    if (interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = isEn ? "en-US" : "zh-TW";
    u.rate = s.rate;
    u.pitch = PITCH;
    // 回傳「唸完」的 Promise:電影巡航會等唸完才飛下一站
    return new Promise((resolve) => {
      u.onstart = () => { if (speaking++ === 0) duck(true); };
      const end = () => { speaking = Math.max(0, speaking - 1); if (!speaking) duck(false); resolve(); };
      u.onend = end;
      u.onerror = end;
      synth.speak(u);
    });
  }
  function stop() { if (supported) synth.cancel(); speaking = 0; duck(false); }

  // ---------- 設定面板 ----------
  const panel = document.getElementById("voice-panel");
  const body = document.getElementById("voice-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  let panelOpen = false;

  function render() {
    if (!body) return;
    if (!supported) {
      body.innerHTML = `<div class="ap-empty">這個瀏覽器不支援語音播報,請改用新版 Chrome、Edge 或 Safari。</div>`;
      return;
    }
    const cur = pickVoice();
    body.innerHTML =
      `<div class="vo-master"><b>${s.on ? "🔊 播報中" : "🔇 已關閉"}</b>` +
      `<button type="button" class="tc-btn vo-onoff${s.on ? " on" : ""}" data-act="onoff">${s.on ? "關閉播報" : "開啟播報"}</button></div>` +
      `<div class="vo-h">要播報哪些內容</div>` +
      KINDS.map(([k, label]) => `<label class="vo-row"><input type="checkbox" data-kind="${k}"${s[k] ? " checked" : ""}> ${label}</label>`).join("") +
      `<div class="vo-h">聲音</div>` +
      (voices.length
        ? `<select class="vo-voice">${voices.map((v) => `<option value="${esc(v.voiceURI)}"${cur && v.voiceURI === cur.voiceURI ? " selected" : ""}>${esc(v.name)}(${esc(v.lang)})</option>`).join("")}</select>`
        : `<div class="au-dim">這台裝置找不到${isEn ? "英文" : "中文"}語音,可能要到系統設定下載語音</div>`) +
      `<label class="vo-rate">語速 <input type="range" min="0.7" max="1.5" step="0.05" value="${s.rate}"> <span>${s.rate.toFixed(2)}×</span></label>` +
      `<button type="button" class="tc-btn vo-test" data-act="test">▶ 試聽</button>` +
      (cur && !isNatural(cur) && !/google/i.test(cur.name)
        ? `<div class="vo-tip">💡 想要更像真人的聲音:用 <b>Microsoft Edge</b> 開這個網站,聲音選單會多出「曉臻、曉雨、雲哲(Natural)」等自然語音;Chrome 可以選「Google 國語(臺灣)」。</div>` : "") +
      `<div class="sat-caption">用裝置內建的語音合成,文字不會上傳。國家介紹旁邊的「🔊 朗讀」隨時都能按,不受這裡的開關影響。</div>`;
  }
  body?.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.kind) { s[t.dataset.kind] = t.checked; save(); }
    else if (t.classList.contains("vo-voice")) { s.voice = t.value; save(); speak(isEn ? "Hi! I'll be your guide around the world." : "嗨,換我來當你的導覽員囉!", { force: true }); }
  });
  body?.addEventListener("input", (e) => {
    if (e.target.type !== "range") return;
    s.rate = Number(e.target.value);
    save();
    const out = e.target.parentElement.querySelector("span");
    if (out) out.textContent = `${s.rate.toFixed(2)}×`;
  });
  body?.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "test") speak(isEn ? "Hi there! Where shall we go today?" : "嗨,我是地球世界的導覽員,今天想去哪裡走走呢?", { force: true });
    else if (a.dataset.act === "onoff") setOn(!s.on);
  });
  document.getElementById("voice-close")?.addEventListener("click", () => onClose && onClose());

  let onChange = null;
  function setOn(v) {
    s.on = !!v;
    save();
    if (!s.on) stop();
    else speak(isEn ? "Great, I'll show you around the world!" : "好喔,導覽打開了,我陪你一起逛地球!", { force: true });
    render();
    onChange && onChange(s.on);
  }
  function setPanel(v) {
    panelOpen = !!v;
    if (panel) panel.hidden = !panelOpen;
    if (panelOpen) render();
  }

  return {
    supported, speak, stop, setOn, setPanel,
    isOn: () => s.on,
    isPanelOpen: () => panelOpen,
    onChange(fn) { onChange = fn; },
  };
}
