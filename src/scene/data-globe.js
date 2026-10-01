import * as THREE from "three";
import { makeDraggable } from "../ui/draggable.js";
import { esc } from "../lib/esc.js";
import { isEn } from "../lib/i18n.js";

// 英文模式:指標名稱、說明、原始來源(資料檔裡只有中文)
const EN = {
  pop: ["Population", "About 8 billion people live on Earth, more than half of them in Asia. Drag the years to watch the population triple in seventy-odd years.", "UN World Population Prospects"],
  density: ["Population density", "People per square kilometre. Taiwan is one of the most densely populated countries in the world.", "UN World Population Prospects"],
  life: ["Life expectancy", "How long a newborn can expect to live. Better medicine, food and hygiene raised the world average from under 50 in 1950 to over 70 today.", "UN World Population Prospects"],
  fert: ["Fertility rate", "Average number of children per woman. Below about 2.1 in the long run, a population starts to shrink; Taiwan is among the lowest in the world.", "UN World Population Prospects"],
  median: ["Median age", "Line everyone up by age: this is the age of the person in the middle. The higher it is, the older the society.", "UN World Population Prospects"],
  gdp: ["GDP per person", "Average value produced per person per year, adjusted for price levels so it can be compared across countries and decades.", "Maddison Project Database"],
  co2: ["CO₂ per person", "Carbon dioxide emitted per person per year (coal, oil, gas and cement).", "Global Carbon Project"],
  renew: ["Renewable electricity", "Share of electricity generated from hydro, solar, wind and other renewables.", "Ember, Energy Institute"],
};
const nameIn = (m) => (isEn && EN[m.id] ? EN[m.id][0] : m.zh);
const noteIn = (m) => (isEn && EN[m.id] ? EN[m.id][1] : m.note);
const srcIn = (m) => (isEn && EN[m.id] ? EN[m.id][2] : m.src);
const NO_DATA_TXT = isEn ? "No data" : "沒有資料";

// 📊 數據地球:選一個指標(人口、平均壽命、生育率、人均所得、碳排放…),整顆地球依數值替每個國家上色,
// 拖時間軸(或按播放)看 1950 年到最近的變化。資料:Our World in Data(tools/build-stats.py 產生 data/stats/)。
// 色階固定用「所有年份」的範圍,播放時顏色的變化就是真實的變化。
// viridis 色階:亮度一路遞增,色盲也分得出高低(原本的彩虹色階紅綠色盲會看錯)
const PALETTE = [0x440154, 0x46327e, 0x365c8d, 0x277f8e, 0x1fa187, 0x4ac16d, 0xa0da39, 0xfde725];
const COLORS = PALETTE.map((h) => new THREE.Color(h));
const NO_DATA = new THREE.Color(0x4a5060);
const LOOKBACK = 5;   // 某一年沒資料,往前找最多幾年

function fmt(id, v) {
  if (v == null || !isFinite(v)) return "—";
  if (isEn) switch (id) {
    case "pop": return v >= 1e9 ? `${(v / 1e9).toFixed(2)} billion` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : Math.round(v).toLocaleString("en-US");
    case "density": return `${Math.round(v).toLocaleString("en-US")} /km²`;
    case "life": case "median": return `${v.toFixed(1)} yrs`;
    case "fert": return `${v.toFixed(2)} children`;
    case "gdp": return `$${Math.round(v).toLocaleString("en-US")}`;
    case "co2": return `${v.toFixed(1)} t`;
    case "renew": return `${v.toFixed(1)}%`;
    default: return String(v);
  }
  switch (id) {
    case "pop": return v >= 1e8 ? `${(v / 1e8).toFixed(2)} 億人` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()} 萬人` : `${Math.round(v).toLocaleString()} 人`;
    case "density": return `${Math.round(v).toLocaleString()} 人/平方公里`;
    case "life": return `${v.toFixed(1)} 歲`;
    case "fert": return `${v.toFixed(2)} 個孩子`;
    case "median": return `${v.toFixed(1)} 歲`;
    case "gdp": return `${Math.round(v).toLocaleString()} 國際元`;
    case "co2": return `${v.toFixed(1)} 公噸`;
    case "renew": return `${v.toFixed(1)}%`;
    default: return String(v);
  }
}

export function createDataGlobe({ globeObject, countryLayer, rig, nameOf, onClose }) {
  const cl = () => (typeof countryLayer === "function" ? countryLayer() : countryLayer);   // 國家圖層是資料載入後才建好
  const panel = document.getElementById("stats-panel");
  const body = document.getElementById("stats-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("stats-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("stats-min");
  function setMin(on) {
    panel?.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  const group = new THREE.Group();
  group.visible = false;
  globeObject.add(group);
  const meshes = new Map();   // code → mesh
  let enabled = false, hidden = false, index = null, cur = null, year = 0, playing = null, q = "", pin = null;
  const cache = new Map();

  async function loadIndex() {
    if (index) return index;
    index = await fetch("data/stats/index.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return index;
  }
  async function loadIndicator(id) {
    if (cache.has(id)) return cache.get(id);
    const d = await fetch(`data/stats/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) return null;
    const meta = index.indicators.find((x) => x.id === id);
    // 色階範圍:所有年份所有國家的 2%~98% 百分位(少數極端值不會把其他國家的顏色擠在一起)
    const all = [];
    for (const arr of Object.values(d.v)) for (const x of arr) if (x != null && (meta.scale !== "log" || x > 0)) all.push(x * d.mul);
    all.sort((a, b) => a - b);
    const q = (p) => all[Math.min(all.length - 1, Math.max(0, Math.floor(p * (all.length - 1))))];
    const info = { ...d, meta, lo: q(0.02), hi: q(0.98) };
    cache.set(id, info);
    return info;
  }

  // 某國某一年的值(沒有就往前找幾年);回傳 [值, 實際年份]
  function valueOf(code, y) {
    const arr = cur?.v[code];
    if (!arr) return [null, null];
    for (let k = 0; k <= LOOKBACK; k++) {
      const i = y - k - cur.y0;
      if (i >= 0 && i < arr.length && arr[i] != null) return [arr[i] * cur.mul, y - k];
    }
    return [null, null];
  }
  function t01(v) {
    const { lo, hi, meta } = cur;
    const f = meta.scale === "log" ? (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo);
    return Math.min(1, Math.max(0, f));
  }
  function colorAt(t, target) {
    const x = t * (COLORS.length - 1), i = Math.min(COLORS.length - 2, Math.floor(x));
    return target.copy(COLORS[i]).lerp(COLORS[i + 1], x - i);
  }

  function ensureMeshes() {
    if (meshes.size || !cl()) return;
    for (const [code, wrap] of cl().meshByCode) {
      cl().ensureMesh(code);
      const src = wrap.children.find((c) => c.isMesh);
      if (!src) continue;
      const mat = new THREE.MeshBasicMaterial({ color: NO_DATA, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(src.geometry, mat);
      m.renderOrder = 1;
      m.raycast = () => {};
      group.add(m);
      meshes.set(code, m);
    }
  }
  const tmp = new THREE.Color();
  function paint() {
    if (!cur) return;
    for (const [code, m] of meshes) {
      const [v] = valueOf(code, year);
      if (v == null) { m.material.color.copy(NO_DATA); m.material.opacity = 0.35; }
      else { m.material.color.copy(colorAt(t01(v), tmp)); m.material.opacity = 0.82; }
    }
  }

  function ranking() {
    const rows = [];
    for (const code of Object.keys(cur.v)) {
      if (!meshes.has(code)) continue;
      const [v, y] = valueOf(code, year);
      if (v != null) rows.push({ code, v, y });
    }
    rows.sort((a, b) => b.v - a.v);
    return rows;
  }

  // ---------- 面板 ----------
  function legend() {
    const { lo, hi, meta } = cur;
    const at = (f) => (meta.scale === "log" ? Math.exp(Math.log(lo) + f * (Math.log(hi) - Math.log(lo))) : lo + f * (hi - lo));
    return `<div class="dg-legend"><div class="dg-bar" style="background:linear-gradient(90deg,${PALETTE.map((h) => `#${h.toString(16).padStart(6, "0")}`).join(",")})"></div>` +
      `<div class="dg-ticks"><span>${fmt(meta.id, at(0))}</span><span>${fmt(meta.id, at(0.5))}</span><span>${fmt(meta.id, at(1))}</span></div>` +
      `<div class="dg-nodata"><i></i>${NO_DATA_TXT}</div></div>`;
  }
  const row = (r, i) => `<button type="button" class="dg-row" data-code="${r.code}"><span class="dg-rk">${i}</span>` +
    `<span class="dg-nm">${esc(nameOf(r.code))}</span><b>${fmt(cur.meta.id, r.v)}</b>${r.y !== year ? `<small>(${r.y})</small>` : ""}</button>`;
  // 排在後半段就說「倒數第幾名」,比較好懂
  function rankLine(label, code, rows) {
    const i = rows.findIndex((r) => r.code === code), n = rows.length;
    if (i < 0) return isEn ? `📍 ${esc(label)}: no data for this year` : `📍 ${esc(label)}:這一年沒有資料`;
    const r = rows[i];
    if (isEn) return `📍 ${esc(label)}: <b>${fmt(cur.meta.id, r.v)}</b>${r.y !== year ? ` (${r.y})` : ""}, ` +
      (i + 1 > n / 2 ? `<b>${n - i}${ord(n - i)} from the bottom</b>` : `ranked <b>${i + 1}${ord(i + 1)}</b>`) + ` of ${n}`;
    return `📍 ${esc(label)}:<b>${fmt(cur.meta.id, r.v)}</b>${r.y !== year ? `(${r.y} 年)` : ""},` +
      (i + 1 > n / 2 ? `全球<b>倒數第 ${n - i}</b> 名` : `全球第 <b>${i + 1}</b> 名`) + `(共 ${n} 個國家與地區)`;
  }
  const ord = (k) => (k % 100 >= 11 && k % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th");
  const statusHtml = (rows) => rankLine(isEn ? "Taiwan" : "台灣", "TW", rows) + (pin && pin !== "TW" ? `<br>${rankLine(nameOf(pin), pin, rows)}` : "");
  const listsHtml = (rows) => `<div><div class="mt-h">${isEn ? "Highest" : "最高"}</div>${rows.slice(0, 5).map((r, i) => row(r, i + 1)).join("")}</div>` +
    `<div><div class="mt-h">${isEn ? "Lowest" : "最低"}</div>${rows.slice(-5).reverse().map((r, i) => row(r, rows.length - i)).join("")}</div>`;
  // 找國家:名稱或代碼有包含打的字就列出來(連同數值和名次)
  function hitsHtml(rows) {
    if (!q) return "";
    const norm = (x) => String(x || "").replace(/臺/g, "台").toLowerCase();
    const k = norm(q);
    // 開頭就對上的排前面(打「德」先出德國,不是維德角),再來名字短的
    const hits = [...meshes.keys()].filter((code) => norm(nameOf(code)).includes(k) || code.toLowerCase() === k)
      .sort((a, b) => (norm(nameOf(b)).startsWith(k) - norm(nameOf(a)).startsWith(k)) || nameOf(a).length - nameOf(b).length)
      .slice(0, 8);
    if (!hits.length) return `<div class="au-dim">${isEn ? `No match for “${esc(q)}”` : `找不到「${esc(q)}」`}</div>`;
    return hits.map((code) => {
      const i = rows.findIndex((r) => r.code === code);
      return `<button type="button" class="dg-row" data-pin="${code}"><span class="dg-rk">${i >= 0 ? i + 1 : "—"}</span>` +
        `<span class="dg-nm">${esc(nameOf(code))}</span><b>${i >= 0 ? fmt(cur.meta.id, rows[i].v) : NO_DATA_TXT}</b></button>`;
    }).join("");
  }
  function render() {
    if (!body) return;
    if (!index) { body.innerHTML = `<div class="ap-empty">${isEn ? "Loading…" : "讀取資料中…"}</div>`; return; }
    const chips = `<div class="dg-chips">${index.indicators.map((x) => `<button type="button" data-ind="${x.id}" class="${cur?.meta.id === x.id ? "on" : ""}">${esc(nameIn(x))}</button>`).join("")}</div>`;
    if (!cur) { body.innerHTML = chips + `<div class="ap-empty">${isEn ? "Loading…" : "讀取資料中…"}</div>`; return; }
    const m = cur.meta;
    const rows = ranking();
    body.innerHTML = chips +
      `<div class="dg-title">${esc(nameIn(m))} <span>${isEn ? year : `${year} 年`}</span></div>` +
      `<div class="dg-note">${esc(noteIn(m))}</div>` +
      `<div class="dg-year"><button type="button" class="tc-btn dg-play" data-act="play">${playing ? "⏸" : "▶"}</button>` +
      `<input type="range" class="dg-slider" min="${cur.y0}" max="${cur.y1}" step="1" value="${year}" aria-label="${isEn ? "Year" : "年份"}">` +
      `<b class="dg-y">${year}</b></div>` +
      legend() +
      `<div class="dg-tw">${statusHtml(rows)}</div>` +
      `<div class="dg-search"><input type="search" class="dg-q" placeholder="${isEn ? "🔍 Find a country (e.g. Japan)" : "🔍 找國家(例如 日本、德國)"}" value="${esc(q)}"><div class="dg-hits">${hitsHtml(rows)}</div></div>` +
      `<div class="dg-lists">${listsHtml(rows)}</div>` +
      (isEn
        ? `<div class="sat-caption">Point at a country to see its value; tap a country in the lists or search results to fly there and compare it with Taiwan. Data: <a href="${esc(m.url)}" target="_blank" rel="noopener">Our World in Data</a> (CC BY 4.0), original source: ${esc(srcIn(m))}. Where a year is missing, the latest value within ${LOOKBACK} years is used (year in brackets).</div>`
        : `<div class="sat-caption">滑鼠移到國家上看數值;點排行榜或搜尋結果的國家會飛過去,並跟台灣一起顯示名次。資料:<a href="${esc(m.url)}" target="_blank" rel="noopener">Our World in Data</a>` +
          `(CC BY 4.0),原始來源:${esc(m.src)}。某年沒有資料的國家,用最近 ${LOOKBACK} 年內的數字(括號標年份)。</div>`);
  }
  // 換年份(拖拉桿、播放)時只更新會變的部分,拉桿和搜尋框不會被換掉
  function refreshYear() {
    paint();
    if (!body || !cur) return;
    if (!body.querySelector(".dg-lists")) { render(); return; }
    const rows = ranking();
    body.querySelector(".dg-title span").textContent = isEn ? String(year) : `${year} 年`;
    body.querySelector(".dg-y").textContent = year;
    const slider = body.querySelector(".dg-slider");
    if (slider && document.activeElement !== slider) slider.value = year;
    const play = body.querySelector(".dg-play");
    if (play) play.textContent = playing ? "⏸" : "▶";
    body.querySelector(".dg-tw").innerHTML = statusHtml(rows);
    body.querySelector(".dg-lists").innerHTML = listsHtml(rows);
    const hits = body.querySelector(".dg-hits");
    if (hits && q) hits.innerHTML = hitsHtml(rows);
  }

  async function choose(id) {
    stop();
    const info = await loadIndicator(id);
    if (!info) return;
    cur = info;
    year = info.y1;
    ensureMeshes();
    paint();
    render();
  }
  function stop() { if (playing) { clearInterval(playing); playing = null; } }
  function play() {
    if (playing) { stop(); refreshYear(); return; }
    if (year >= cur.y1) year = cur.y0;
    playing = setInterval(() => {
      if (year >= cur.y1) { stop(); refreshYear(); return; }
      year++;
      refreshYear();
    }, 180);
    refreshYear();
  }
  function flyToCode(code) {
    const w = cl()?.meshByCode.get(code);
    const [lo, la] = w?.userData.centroidLatLon || [];   // 注意:國家質心存成 [經度, 緯度]
    if (la != null) { if (window.innerWidth <= 640) setMin(true); rig.flyTo(la, lo, { distance: 2.3, ms: 1400 }); }
  }

  body?.addEventListener("click", (e) => {
    const ind = e.target.closest("[data-ind]");
    if (ind) { choose(ind.dataset.ind); return; }
    if (e.target.closest("[data-act=play]")) { play(); return; }
    const p = e.target.closest("[data-pin]");
    if (p) { pin = p.dataset.pin; q = ""; const inp = body.querySelector(".dg-q"); if (inp) inp.value = ""; refreshYear(); body.querySelector(".dg-hits").innerHTML = ""; flyToCode(pin); return; }
    const r = e.target.closest(".dg-row[data-code]");
    if (r) { pin = r.dataset.code; refreshYear(); flyToCode(pin); }
  });
  // 搜尋框:注音等輸入法組字中不處理(不然組字會被打斷),選完字再更新結果
  function onSearch(e) {
    if (e.isComposing || !e.target.classList.contains("dg-q")) return;
    q = e.target.value.trim();
    const hits = body.querySelector(".dg-hits");
    if (hits && cur) hits.innerHTML = hitsHtml(ranking());
  }
  body?.addEventListener("compositionend", onSearch);
  body?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.target.classList.contains("dg-q")) body.querySelector(".dg-hits [data-pin]")?.click();
  });
  body?.addEventListener("input", (e) => {
    if (e.target.classList.contains("dg-q")) { onSearch(e); return; }
    if (!e.target.classList.contains("dg-slider")) return;
    stop();
    year = Number(e.target.value);
    refreshYear();
  });

  async function setEnabled(v) {
    enabled = !!v;
    if (panel) panel.hidden = !enabled;
    document.body.classList.toggle("stats-on", enabled);
    group.visible = enabled && !hidden;
    if (!enabled) { stop(); return; }
    setMin(false);
    render();
    await loadIndex();
    if (!index) { if (body) body.innerHTML = `<div class="ap-empty">${isEn ? "Data is unavailable right now. Please try again later." : "資料暫時讀不到,稍後再試"}</div>`; return; }
    if (!cur) await choose(index.indicators[0].id);
    else render();
  }

  // 滑鼠指到國家時,提示框多一行這個指標的數值
  function readout(code) {
    if (!enabled || hidden || !cur || !code) return null;
    const [v, y] = valueOf(code, year);
    return `📊 ${nameIn(cur.meta)} ${fmt(cur.meta.id, v)}${v != null && y !== year ? ` (${y})` : ""}`;
  }

  return {
    setEnabled, readout,
    isEnabled: () => enabled,
    setHidden(v) { hidden = !!v; group.visible = enabled && !hidden; },
  };
}
