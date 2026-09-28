import { esc } from "../lib/esc.js";

// 🎲 驚喜一下:左下角一顆骰子,按一下隨機飛到世界上某個地方——一半是國家(附一句國家特色),
// 一半是山脈、河流、沙漠、湖泊這類自然景觀。不知道要看什麼的時候按它就對了。
// 用「洗牌袋」抽,全部抽完才會重複;人聲播報開著的話會唸出來。
const KIND_ICON = { mountain: "⛰️", peak: "🏔️", river: "🌊", desert: "🏜️", plateau: "🗻", plain: "🌾", lake: "💧", other: "📍" };

export function createSurprise({ rig, getContent, nameOf, openCountryByCode, voice }) {
  const dock = document.getElementById("home-dock");
  if (!dock) return { roll() {} };
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hd-btn hd-dice";
  btn.title = btn.ariaLabel = "驚喜一下:隨機帶我去一個地方";
  btn.textContent = "🎲";
  dock.prepend(btn);

  const card = document.createElement("div");
  card.id = "surprise-card";
  card.hidden = true;
  document.body.appendChild(card);

  let bag = [], nature = null, hideTimer = null, current = null;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  async function refill() {
    if (!nature) nature = await fetch("data/physical.json").then((r) => (r.ok ? r.json() : null)).then((j) => j?.features || []).catch(() => []);
    const content = getContent() || {};
    const countries = Object.entries(content)
      .filter(([c, v]) => /^[A-Z]{2}$/.test(c) && Array.isArray(v?.capital_latlon) && v.features?.length)
      .map(([c, v]) => ({ type: "country", code: c, lat: v.capital_latlon[0], lon: v.capital_latlon[1], facts: v.features }));
    const places = nature.filter((n) => n.note).map((n) => ({ type: "nature", ...n }));
    // 國家和自然景觀各半,交錯排好再洗牌
    bag = shuffle([...shuffle(countries).slice(0, 60), ...shuffle(places).slice(0, 60)]);
  }

  function show(p) {
    current = p;
    const isC = p.type === "country";
    const name = isC ? nameOf(p.code) : p.zh;
    const fact = isC ? p.facts[Math.floor(Math.random() * p.facts.length)] : p.note;
    card.innerHTML =
      `<div class="sp-top"><span>🎲 驚喜一下</span><button type="button" class="sp-x" data-act="close" aria-label="關閉">×</button></div>` +
      `<div class="sp-title">${isC ? `<img src="https://flagcdn.com/w40/${p.code.toLowerCase()}.png" alt="" onerror="this.remove()">` : `<span>${KIND_ICON[p.k] || "📍"}</span>`}` +
      `<b>${esc(name)}</b>${isC ? "" : `<small>${esc(p.en || "")}</small>`}</div>` +
      `<p>${esc(fact)}</p>` +
      `<div class="sp-btns">${isC ? `<button type="button" class="tc-btn" data-act="more">📖 看介紹</button>` : ""}` +
      `<button type="button" class="tc-btn sp-again" data-act="again">🎲 再一次</button></div>`;
    card.hidden = false;
    card.classList.remove("show"); void card.offsetWidth; card.classList.add("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { card.hidden = true; }, 20000);
    voice?.speak?.(`${name}。${fact}`, { kind: "country" });
  }

  async function roll() {
    if (!bag.length) await refill();
    const p = bag.pop();
    if (!p) return;
    rig.flyTo(p.lat, p.lon, { distance: p.type === "country" ? 1.9 : 2.1, ms: 1800 });
    setTimeout(() => show(p), 600);
  }

  btn.addEventListener("click", roll);
  card.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    if (a.dataset.act === "close") { card.hidden = true; voice?.stop?.(); }
    else if (a.dataset.act === "again") roll();
    else if (a.dataset.act === "more" && current?.code) { card.hidden = true; openCountryByCode(current.code); }
  });
  return { roll };
}
