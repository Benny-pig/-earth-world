import { esc } from "/src/lib/esc.js";

export function createEncyclopedia() {
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

  const cache = new Map();
  let reqSeq = 0;

  const IMG_BASE = "/assets/deep/";

  function fmtArea(km2) {
    if (typeof km2 !== "number" || !Number.isFinite(km2)) return null;
    if (km2 >= 1e4) return `約 ${(km2 / 1e4).toFixed(km2 >= 1e6 ? 0 : 1)} 萬 km²`;
    return `約 ${Math.round(km2).toLocaleString("en-US")} km²`;
  }

  function card(code, it) {
    const img = it.image
      ? `<img src="${IMG_BASE}${encodeURIComponent(codeToFile(code))}/${encodeURIComponent(it.image)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    const en = it.en ? `<span class="enc-card-en">${esc(it.en)}</span>` : "";
    return `<div class="enc-card">${img}<div class="enc-card-body"><b>${esc(it.zh)}</b> ${en}` +
      `<p>${esc(it.note || "")}</p></div></div>`;
  }

  function section(title, inner) { return `<h3>${esc(title)}</h3>${inner}`; }

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

    if (Array.isArray(d.credits) && d.credits.length)
      h += section("圖片來源", `<ul class="enc-credits">` + d.credits.map((c) => {
        const head = `${esc(c.title || c.file)} — ${esc(c.author)} / ${esc(c.license)}`;
        return /^https:\/\//.test(c.source)
          ? `<li>${head} · <a href="${esc(c.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></li>`
          : `<li>${head}</li>`;
      }).join("") + `</ul>`);

    bodyEl.innerHTML = h;
    scrollEl.scrollTop = 0;
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
