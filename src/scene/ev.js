import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "../ui/draggable.js";

// ⚡ 全台電動車充電站:資料 data/ev/stations.json(tools/build-ev-chargers.py 從交通部 TDX 整理,每週更新)。
// 面板可以搜尋地名/站名/地址/業者、依縣市與充電槍規格篩選、「找我附近」依距離排序;
// 點一站看詳細資料(地址、業者、充電槍、營業時間、費率、電話)並可用 Google 地圖導航。
// 面板開著時地球上會標出所有充電站:橘點 = 有快充(DC)、綠點 = 只有慢充(AC)。
const DATA_URL = "data/ev/stations.json";
const MAX_ROWS = 60;
// 篩選晶片:key → 判斷這站有沒有符合的充電槍
const CHIPS = [
  ["dc", "⚡ 快充 DC", (c) => c.some(([, p]) => p === 2)],
  ["tesla", "特斯拉", (c) => c.some(([t]) => t === 4)],
  ["ccs2", "CCS2", (c) => c.some(([t]) => t === 2)],
  ["ccs1", "CCS1", (c) => c.some(([t]) => t === 1)],
  ["chademo", "CHAdeMO", (c) => c.some(([t]) => t === 3)],
  ["ac", "🔌 慢充 AC", (c) => c.some(([, p]) => p === 1)],
];
const COUNTY_ORDER = ["臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣",
  "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣", "國道服務區"];
const norm = (t) => String(t || "").replace(/臺/g, "台").toLowerCase();

function kmBetween(a, b, c, d) {
  const r = Math.PI / 180, h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function createEvLayer({ globeObject, rig, onClose }) {
  const panel = document.getElementById("ev-panel");
  const body = document.getElementById("ev-body");
  const noop = { setEnabled() {}, isEnabled: () => false };
  if (!panel || !body) return noop;
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, doc = null, loading = null, types = {};
  let q = "", county = "", chips = new Set(), me = null, openId = null, limit = MAX_ROWS;
  let rows = [];   // 已經整理好的站:{ s(原始陣列), text(搜尋用), dc }

  // ---------- 地球上的點 ----------
  const dotTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    // 白色圓心(會被染成橘/綠)+ 深色外圈:在夜晚的城市燈光上也看得清楚
    const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,.85)"; g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(16, 16, 10, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
    size: 8, sizeAttenuation: false, vertexColors: true, map: dotTex, transparent: true, alphaTest: 0.15, depthWrite: false,
  }));
  points.visible = false;
  points.renderOrder = 4;
  points.raycast = () => {};
  globeObject.add(points);
  function buildPoints(list) {
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
    const c1 = new THREE.Color(0xffa62b), c2 = new THREE.Color(0x3ddc84), sel = new THREE.Color(0xffffff);
    list.forEach((r, i) => {
      const lat = r.s[2] * Math.PI / 180, lon = r.s[3] * Math.PI / 180, R = 1.008, cl = Math.cos(lat);   // 放在雲層(1.006)上面
      pos.set([R * cl * Math.cos(lon), R * Math.sin(lat), -R * cl * Math.sin(lon)], i * 3);
      const c = r.s[0] === openId ? sel : r.dc ? c1 : c2;
      col.set([c.r, c.g, c.b], i * 3);
    });
    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry();
    points.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    points.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }

  async function load() {
    if (doc) return;
    if (!loading) loading = fetch(DATA_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    doc = await loading;
    loading = null;
    if (!doc) return;
    types = doc.types || {};
    rows = doc.stations.map((s) => ({
      s, dc: s[9].some(([, p]) => p === 2),
      text: norm(`${s[1]} ${s[4]} ${s[5]} ${s[6]} ${s[15]}`),
    }));
  }

  function filtered() {
    const words = norm(q).trim().split(/\s+/).filter(Boolean);
    const tests = CHIPS.filter(([k]) => chips.has(k)).map(([, , f]) => f);
    let list = rows.filter((r) => (!county || r.s[4] === county) && words.every((w) => r.text.includes(w)) && tests.every((f) => f(r.s[9])));
    if (me) list = list.map((r) => ({ ...r, km: kmBetween(me[0], me[1], r.s[2], r.s[3]) })).sort((a, b) => a.km - b.km);
    return list;
  }

  function connSummary(conns) {
    const dc = [], ac = [];
    for (const [t, p, n] of conns) (p === 2 ? dc : ac).push(`${types[t] || "未知"}${n > 1 ? ` ×${n}` : ""}`);
    return (dc.length ? `<span class="ev-dc">⚡ 快充 ${esc(dc.join("、"))}</span>` : "") + (ac.length ? `<span class="ev-ac">🔌 慢充 ${esc(ac.join("、"))}</span>` : "");
  }
  function detail(s) {
    const nav = `https://www.google.com/maps/dir/?api=1&destination=${s[2]},${s[3]}`;
    const line = (k, v) => (v ? `<div><span>${k}</span>${esc(v)}</div>` : "");
    return `<div class="ev-detail">` +
      line("📍 地址", s[6]) + line("🏢 業者", s[15]) + line("🅿️ 車位", s[7] ? `${s[7]} 格 · 充電樁 ${s[8]} 座` : "") +
      line("🕐 營業時間", s[10]) + line("💰 充電費率", s[11]) + line("🚗 停車費", s[12]) + line("🏬 樓層", s[13]) +
      (s[14] ? `<div><span>📞 電話</span><a href="tel:${esc(s[14].replace(/[^\d+#-]/g, ""))}">${esc(s[14])}</a></div>` : "") +
      line("⚠️ 使用限制", s[16]) +
      `<div class="ev-actions"><a class="tc-btn" href="${nav}" target="_blank" rel="noopener">🧭 Google 地圖導航</a>` +
      `<button type="button" class="tc-btn" data-fly="${esc(s[0])}">🌏 在地球上看</button></div></div>`;
  }

  function render() {
    if (!doc) {
      body.innerHTML = `<div class="ap-empty">充電站資料準備中,之後會自動更新。<br>(資料來源:交通部 TDX,每週整理一次)</div>`;
      return;
    }
    const list = filtered();
    buildPoints(list);
    const counties = COUNTY_ORDER.filter((c) => rows.some((r) => r.s[4] === c));
    const keepScroll = body.querySelector(".ev-list")?.scrollTop || 0;
    body.innerHTML =
      `<input class="ev-q" type="search" placeholder="🔎 地名、站名、地址或業者(例:板橋、特斯拉、裕電)" value="${esc(q)}" aria-label="搜尋充電站" autocomplete="off">` +
      `<div class="ev-row"><select class="ev-county" aria-label="縣市"><option value="">全部縣市</option>${counties.map((c) => `<option${c === county ? " selected" : ""}>${c}</option>`).join("")}</select>` +
      `<button type="button" class="tc-btn ev-near${me ? " on" : ""}" data-act="near">${me ? "📍 依距離排序中" : "📍 找我附近"}</button></div>` +
      `<div class="ev-chips">${CHIPS.map(([k, label]) => `<button type="button" data-chip="${k}" class="${chips.has(k) ? "on" : ""}">${label}</button>`).join("")}</div>` +
      `<div class="ev-sum">全台 ${rows.length.toLocaleString("en-US")} 站 · 符合 <b>${list.length.toLocaleString("en-US")}</b> 站` +
      `<span class="ev-legend"><i class="dc"></i>有快充 <i class="ac"></i>只有慢充</span></div>` +
      `<div class="ev-list">${list.slice(0, limit).map(({ s, km, dc }) =>
        `<div class="ev-item${s[0] === openId ? " open" : ""}" data-id="${esc(s[0])}">` +
        `<div class="ev-top"><i class="${dc ? "dc" : "ac"}"></i><b>${esc(s[1])}</b>${km != null ? `<span class="ev-km">${km < 10 ? km.toFixed(1) : Math.round(km)} km</span>` : ""}</div>` +
        `<div class="ev-sub">${esc(s[4])}${s[5] && s[4] !== "國道服務區" ? ` ${esc(s[5])}` : ""}${s[15] ? ` · ${esc(s[15])}` : ""}</div>` +
        `<div class="ev-conn">${connSummary(s[9])}</div>` +
        (s[0] === openId ? detail(s) : "") + `</div>`).join("")}` +
      (list.length > limit ? `<button type="button" class="cmp-more" data-act="more">再顯示 ${Math.min(MAX_ROWS, list.length - limit)} 站(共 ${list.length} 站)</button>` : "") +
      (!list.length ? `<div class="ap-empty">找不到符合的充電站,換個關鍵字或少選幾個條件試試</div>` : "") + `</div>` +
      `<div class="sat-caption">資料:交通部 TDX 電動車充電站(${esc(doc.built || "")} 整理)· 實際營業與費率以現場為準</div>`;
    const el = body.querySelector(".ev-list");
    if (el) el.scrollTop = keepScroll;
  }

  function flyTo(id) {
    const r = rows.find((x) => x.s[0] === id);
    if (r) rig.flyTo(r.s[2], r.s[3], { distance: 1.06, ms: 1200 });
  }

  // 打字時只重畫清單(不重建整個面板,輸入框才不會失焦)
  // 注音等輸入法組字中不處理(重畫會把組字打斷,只剩注音符號),選完字再更新
  let typing = null, composing = false;
  body.addEventListener("compositionstart", () => { composing = true; });
  const onSearch = (e) => {
    if (e.type === "compositionend") composing = false;
    if (e.isComposing || composing || !e.target.matches(".ev-q")) return;
    q = e.target.value; limit = MAX_ROWS;
    clearTimeout(typing);
    typing = setTimeout(() => {
      if (composing) return;   // 讀者又開始打下一個字了,等選完字再更新
      const pos = e.target.selectionStart;
      render();
      const inp = body.querySelector(".ev-q");
      inp?.focus(); inp?.setSelectionRange(pos, pos);
    }, 200);
  };
  body.addEventListener("input", onSearch);
  body.addEventListener("compositionend", onSearch);
  body.addEventListener("change", (e) => {
    if (e.target.matches(".ev-county")) { county = e.target.value; limit = MAX_ROWS; render(); }
  });
  body.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (chip) { const k = chip.dataset.chip; chips.has(k) ? chips.delete(k) : chips.add(k); limit = MAX_ROWS; render(); return; }
    const fly = e.target.closest("[data-fly]");
    if (fly) { flyTo(fly.dataset.fly); return; }
    if (e.target.closest("a")) return;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "more") { limit += MAX_ROWS; render(); return; }
    if (act === "near") {
      if (me) { me = null; render(); return; }
      if (!navigator.geolocation) { alert("這個瀏覽器不支援定位"); return; }
      e.target.textContent = "📍 定位中…";
      navigator.geolocation.getCurrentPosition(
        (p) => { me = [p.coords.latitude, p.coords.longitude]; limit = MAX_ROWS; render(); rig.flyTo(me[0], me[1], { distance: 1.08, ms: 1200 }); },
        () => { alert("沒辦法取得你的位置(可能沒有開啟定位權限)"); render(); },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
      return;
    }
    const item = e.target.closest(".ev-item");
    if (item && !e.target.closest(".ev-detail")) {
      openId = openId === item.dataset.id ? null : item.dataset.id;
      render();
      if (openId) flyTo(openId);
    }
  });
  document.getElementById("ev-close")?.addEventListener("click", () => onClose && onClose());

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    points.visible = enabled;
    if (!enabled) return;
    body.innerHTML = `<div class="ap-empty">載入全台充電站中…</div>`;
    await load();
    if (enabled) render();
  }

  return { setEnabled, isEnabled: () => enabled };
}
