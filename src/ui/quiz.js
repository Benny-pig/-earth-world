import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// 🎯 地理猜謎遊戲:看國旗/美食照片/景點照片/首都,在地球上點出是哪個國家。
// 題庫是 data/quiz.json(tools/build-quiz.py 從大百科整理),國旗用 flagcdn。
// 直接在地球上點答對 10 分;按「給我選項」變成四選一,答對 5 分。一回合 10 題,
// 最高分記在瀏覽器;「每日挑戰」用日期當亂數種子,同一天每個人拿到一樣的 5 題。
// 遊戲進行中會藏起地球上的國名與滑鼠提示(不然答案就寫在地圖上了)。
const TYPES = {
  flag: { icon: "🚩", label: "國旗", ask: "這是哪一國的國旗?" },
  food: { icon: "🍜", label: "美食", ask: "這道美食來自哪個國家?" },
  land: { icon: "🏛️", label: "景點", ask: "這個景點在哪個國家?" },
  cap: { icon: "🏙️", label: "首都", ask: "這是哪一國的首都?" },
};
const ROUND = 10, DAILY = 5;
const BEST_KEY = "earth-world.quiz-best";

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const twDateStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

export function createQuiz({ rig, sidePanel, onClose }) {
  const panel = document.getElementById("quiz-panel");
  if (!panel) return { setEnabled() {}, isEnabled: () => false, isAwaiting: () => false, answer() {} };
  const $ = (id) => document.getElementById(id);
  const body = $("quiz-body");
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, bank = null, regions = {}, round = null, awaiting = false, nextTimer = null;

  const nameOf = (code) => window.__earth?.countryLayer?.meshByCode.get(code)?.userData?.names?.zh || code;
  const best = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };

  async function loadBank() {
    if (!bank) {
      [bank, regions] = await Promise.all([
        fetch("data/quiz.json").then((r) => r.json()),
        fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
    }
  }

  // 出題:rand 決定題型與國家(每日挑戰用固定種子)
  function makeQuestion(rand, type, used) {
    const cl = window.__earth?.countryLayer;
    const ok = (c) => cl?.meshByCode.has(c) && !used.has(c);
    const pickType = type === "mix" ? ["flag", "food", "land", "cap"][Math.floor(rand() * 4)] : type;
    const pool = Object.keys(bank).filter((c) => ok(c) && (pickType === "flag" ? /^[A-Z]{2}$/.test(c) : bank[c][pickType]));
    if (!pool.length) return null;
    const code = pool[Math.floor(rand() * pool.length)];
    used.add(code);
    let prompt, detail = "";
    if (pickType === "flag") prompt = `https://flagcdn.com/w320/${code.toLowerCase()}.png`;
    else if (pickType === "cap") prompt = bank[code].cap;
    else {
      const items = bank[code][pickType];
      const [zh, img] = items[Math.floor(rand() * items.length)];
      prompt = `assets/deep/${img}`; detail = zh;
    }
    return { code, type: pickType, prompt, detail, choices: null, tries: 0, done: false, gained: 0 };
  }

  function start(mode) {
    const daily = mode === "daily";
    const rand = daily ? mulberry32(Number(twDateStr().replace(/-/g, ""))) : Math.random;
    const n = daily ? DAILY : ROUND;
    const used = new Set(), qs = [];
    for (let i = 0; i < n * 3 && qs.length < n; i++) {
      const q = makeQuestion(rand, daily ? "mix" : mode, used);
      if (q) qs.push(q);
    }
    round = { mode, daily, qs, idx: 0, score: 0, correct: 0 };
    sidePanel?.isOpen() && sidePanel.close();
    rig.resetView({ keepDirection: true });
    document.body.classList.add("quiz-mode");
    renderQuestion();
  }

  function renderStart() {
    document.body.classList.remove("quiz-mode");
    awaiting = false;
    body.innerHTML = `<p class="quiz-intro">看國旗、美食、景點或首都,在地球上<b>點出是哪個國家</b>!<br>直接點地球答對 <b>10 分</b>,用四選一答對 <b>5 分</b>。</p>` +
      `<div class="quiz-modes">` +
      `<button type="button" class="quiz-mode quiz-daily" data-mode="daily">📅 每日挑戰<small>${twDateStr()} · 5 題</small></button>` +
      `<button type="button" class="quiz-mode" data-mode="mix">🎲 綜合<small>10 題</small></button>` +
      Object.entries(TYPES).map(([k, t]) => `<button type="button" class="quiz-mode" data-mode="${k}">${t.icon} ${t.label}<small>10 題</small></button>`).join("") +
      `</div><p class="quiz-best">🏆 你的最高分:<b>${best()}</b> 分</p>`;
  }

  function renderQuestion() {
    const q = round.qs[round.idx];
    if (!q) { renderEnd(); return; }
    awaiting = true;
    const t = TYPES[q.type];
    const media = q.type === "cap"
      ? `<div class="quiz-cap">${esc(q.prompt)}</div>`
      : `<img class="quiz-img${q.type === "flag" ? " flag" : ""}" src="${esc(q.prompt)}" alt="題目圖片">`;
    body.innerHTML = `<div class="quiz-top"><span>${round.daily ? "📅 每日挑戰" : t.icon + " " + t.label} · 第 ${round.idx + 1}/${round.qs.length} 題</span><span>⭐ ${round.score} 分</span></div>` +
      `<div class="quiz-ask">${t.ask}</div>${media}` +
      ((q.tries || q.choices) ? detailHtml(q) : "") +
      `<div class="quiz-hint">👉 直接在地球上點出答案${q.tries ? `(還可以再試 ${2 - q.tries} 次)` : ""}</div>` +
      `<div id="quiz-feedback" class="quiz-feedback"></div>` +
      (q.choices
        ? `<div class="quiz-choices">${q.choices.map((c) => `<button type="button" data-choice="${esc(c)}">${esc(nameOf(c))}</button>`).join("")}</div>`
        : `<div class="quiz-actions"><button type="button" class="tc-btn" data-act="choices">🤔 給我選項(答對 5 分)</button><button type="button" class="tc-btn" data-act="skip">⏭️ 跳過</button></div>`);
  }

  // 美食/景點的名字常常直接洩漏答案(像「韓式拌飯」),所以答錯一次或改用選項後才當提示給
  const detailHtml = (q) => (q.detail ? `<div class="quiz-detail">💡 ${esc(q.detail)}</div>` : "");
  function showDetail(q) {
    if (q.detail && !body.querySelector(".quiz-detail")) body.querySelector(".quiz-img")?.insertAdjacentHTML("afterend", detailHtml(q));
  }

  function makeChoices(q) {
    const same = Object.keys(bank).filter((c) => c !== q.code && regions[c] && regions[c] === regions[q.code] && window.__earth?.countryLayer?.meshByCode.has(c));
    const any = Object.keys(bank).filter((c) => c !== q.code && window.__earth?.countryLayer?.meshByCode.has(c));
    const pool = same.length >= 3 ? same : any;
    const picks = new Set();
    while (picks.size < 3) picks.add(pool[Math.floor(Math.random() * pool.length)]);
    const all = [...picks, q.code];
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all;
  }

  function reveal(code, good) {
    const cl = window.__earth?.countryLayer;
    const w = cl?.meshByCode.get(code);
    const cap = window.__earth?.content?.[code]?.capital_latlon;
    const target = Array.isArray(cap) ? cap : (w?.userData?.centroidLatLon ? [w.userData.centroidLatLon[1], w.userData.centroidLatLon[0]] : null);
    if (target) rig.flyTo(target[0], target[1], { distance: 2.3, ms: 1000 });
    cl?.setSelected(code);
    void good;
  }

  function answer(code) {
    const q = round?.qs[round.idx];
    if (!awaiting || !q || q.done) return false;
    const fb = $("quiz-feedback");
    if (code === q.code) {
      q.done = true; awaiting = false;
      q.gained = q.choices ? 5 : 10;
      round.score += q.gained; round.correct++;
      const sc = body.querySelector(".quiz-top span:last-child");
      if (sc) sc.textContent = `⭐ ${round.score} 分`;
      fb.className = "quiz-feedback ok";
      fb.innerHTML = `✅ 答對了!就是 <b>${esc(nameOf(q.code))}</b> <span class="quiz-plus">+${q.gained}</span>`;
      reveal(q.code, true);
      finishQuestion();
    } else {
      q.tries++;
      if (q.tries >= 3 || q.choices) {
        q.done = true; awaiting = false;
        fb.className = "quiz-feedback bad";
        fb.innerHTML = `❌ 可惜!${code ? `你選的是${esc(nameOf(code))},` : ""}答案是 <b>${esc(nameOf(q.code))}</b>`;
        reveal(q.code, false);
        finishQuestion();
      } else {
        showDetail(q);
        fb.className = "quiz-feedback warn";
        fb.innerHTML = `❌ 不是 ${esc(nameOf(code))},再試一次!(還有 ${3 - q.tries} 次機會)`;
      }
    }
    return true;
  }

  function finishQuestion() {
    showDetail(round.qs[round.idx]);
    body.querySelector(".quiz-actions, .quiz-choices")?.remove();
    body.querySelector(".quiz-hint")?.remove();
    const last = round.idx >= round.qs.length - 1;
    body.insertAdjacentHTML("beforeend",
      `<div class="quiz-actions"><button type="button" class="tc-btn quiz-next" data-act="next">${last ? "🏁 看成績" : "下一題 ➡️"}</button>` +
      `<button type="button" class="tc-btn" data-act="more">📖 認識這個國家</button></div>`);
  }

  function renderEnd() {
    awaiting = false;
    document.body.classList.remove("quiz-mode");
    window.__earth?.countryLayer?.setSelected(null);
    const max = round.qs.length * 10;
    const pct = Math.round((round.score / max) * 100);
    const isBest = !round.daily && round.score > best();
    if (isBest) try { localStorage.setItem(BEST_KEY, String(round.score)); } catch { /* 不能存就算了 */ }
    const medal = pct >= 90 ? "🏆 地理大師!" : pct >= 70 ? "🥇 很厲害!" : pct >= 40 ? "🥈 不錯喔!" : "🌱 再接再厲!";
    body.innerHTML = `<div class="quiz-end"><div class="quiz-medal">${medal}</div>` +
      `<div class="quiz-final">${round.score} <small>/ ${max} 分</small></div>` +
      `<div>答對 ${round.correct} / ${round.qs.length} 題${isBest ? " · 🎉 新紀錄!" : ""}</div>` +
      `<div class="quiz-review">${round.qs.map((q) => `<span class="${q.gained ? "ok" : "bad"}">${q.gained ? "✅" : "❌"} ${esc(nameOf(q.code))}</span>`).join("")}</div>` +
      `<div class="quiz-actions"><button type="button" class="tc-btn" data-act="share">📣 分享成績</button>` +
      `<button type="button" class="tc-btn" data-act="again">🔄 再玩一次</button></div></div>`;
  }

  async function shareScore() {
    const max = round.qs.length * 10;
    const text = `我在「地球世界」${round.daily ? `每日挑戰(${twDateStr()})` : "地理猜謎"}拿到 ${round.score}/${max} 分!🌏 你也來挑戰:`;
    const url = location.origin + location.pathname + "?on=quiz";
    if (navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
      try { await navigator.share({ title: "地球世界 · 地理猜謎", text, url }); return; } catch { /* 取消就改複製 */ }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); alertToast("📣 已複製成績,貼給朋友挑戰吧!"); } catch { window.prompt("複製分享:", `${text} ${url}`); }
  }
  function alertToast(msg) {
    const el = document.getElementById("share-toast") || Object.assign(document.createElement("div"), { id: "share-toast" });
    if (!el.parentNode) document.body.appendChild(el);
    el.textContent = msg; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  body.addEventListener("click", (e) => {
    const m = e.target.closest("[data-mode]");
    if (m) { start(m.dataset.mode); return; }
    const c = e.target.closest("[data-choice]");
    if (c) { answer(c.dataset.choice); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const q = round?.qs[round.idx];
    if (a.dataset.act === "choices" && q) { q.choices = makeChoices(q); renderQuestion(); }
    else if (a.dataset.act === "skip" && q && !q.done) {
      // 放棄:公布答案(一樣飛過去看),再按下一題
      q.done = true; awaiting = false;
      const fb = $("quiz-feedback");
      fb.className = "quiz-feedback bad";
      fb.innerHTML = `⏭️ 答案是 <b>${esc(nameOf(q.code))}</b>`;
      reveal(q.code, false);
      finishQuestion();
    }
    else if (a.dataset.act === "next") { window.__earth?.countryLayer?.setSelected(null); round.idx++; renderQuestion(); }
    else if (a.dataset.act === "more" && q) { window.__earth?.encyclopedia?.open(q.code); }
    else if (a.dataset.act === "share") shareScore();
    else if (a.dataset.act === "again") renderStart();
  });
  $("quiz-close").addEventListener("click", () => onClose && onClose());

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    clearTimeout(nextTimer);
    if (!enabled) {
      awaiting = false; round = null;
      document.body.classList.remove("quiz-mode");
      window.__earth?.countryLayer?.setSelected(null);
      return;
    }
    body.innerHTML = `<div class="ap-empty">載入題庫中…</div>`;
    try { await loadBank(); if (enabled) renderStart(); }
    catch { body.innerHTML = `<div class="ap-empty">題庫載入失敗,稍後再試</div>`; }
  }

  return { setEnabled, isEnabled: () => enabled, isAwaiting: () => enabled && awaiting, answer };
}
