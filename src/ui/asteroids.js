import { makeDraggable } from "./draggable.js";
import { esc } from "../lib/esc.js";

// ☄️ 小行星掠過地球:NASA 近地天體資料(NeoWs)這 7 天會經過地球附近的小行星——
// 離地球多近(用「月球距離」比較好想像)、多大(跟公車、足球場、台北 101 比)、多快。
// 用 NASA 的公用示範金鑰(每個網路位址每小時有查詢上限),所以結果在這台瀏覽器快取 6 小時。
const API = "https://api.nasa.gov/neo/rest/v1/feed";
const KEY = "DEMO_KEY";
const CACHE = "earth-world.neo.v1";
const CACHE_MS = 6 * 3600 * 1000;

function sizeWord(m) {
  if (m < 6) return "一輛小汽車";
  if (m < 15) return "一輛公車";
  if (m < 30) return "一棟十層樓";
  if (m < 70) return "半座足球場";
  if (m < 130) return "一座足球場";
  if (m < 350) return "艾菲爾鐵塔的高度";
  if (m < 700) return "台北 101 的高度";
  if (m < 2000) return "一座小山";
  return "一座城市";
}

export function createAsteroids({ onClose }) {
  const panel = document.getElementById("neo-panel");
  const body = document.getElementById("neo-body");
  if (!panel || !body) return { setEnabled() {}, isEnabled: () => false };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("neo-close")?.addEventListener("click", () => onClose && onClose());
  let enabled = false, list = null, err = "";

  async function load() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || "null");
      if (c && Date.now() - c.at < CACHE_MS && Array.isArray(c.list)) { list = c.list; return; }
    } catch { /* 沒快取就查 */ }
    const d0 = new Date(), d1 = new Date(Date.now() + 6 * 86400000);
    const ymd = (d) => d.toISOString().slice(0, 10);
    const r = await fetch(`${API}?start_date=${ymd(d0)}&end_date=${ymd(d1)}&api_key=${KEY}`);
    if (r.status === 429) throw new Error("NASA 的免費查詢次數暫時用完了,過一陣子再試");
    if (!r.ok) throw new Error("NASA 資料暫時讀不到(HTTP " + r.status + ")");
    const j = await r.json();
    const out = [];
    for (const arr of Object.values(j.near_earth_objects || {})) {
      for (const o of arr) {
        const ca = (o.close_approach_data || []).find((x) => x.orbiting_body === "Earth");
        if (!ca) continue;
        const dm = o.estimated_diameter?.meters || {};
        out.push({
          name: String(o.name || "").replace(/[()]/g, "").trim(),
          size: Math.round(((dm.estimated_diameter_min || 0) + (dm.estimated_diameter_max || 0)) / 2),
          pha: !!o.is_potentially_hazardous_asteroid,
          at: ca.epoch_date_close_approach,
          ld: Number(ca.miss_distance?.lunar),
          km: Number(ca.miss_distance?.kilometers),
          kms: Number(ca.relative_velocity?.kilometers_per_second),
          url: o.nasa_jpl_url,
        });
      }
    }
    list = out.sort((a, b) => a.ld - b.ld);
    try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), list })); } catch { /* 存不下就算了 */ }
  }

  const fmt = (ms) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
  // 距離尺:地球在最左邊,月球在 1 倍月球距離,小行星依距離放在尺上(對數刻度,0.05~50 倍)
  function scale() {
    const W = 300, H = 74, x0 = 16, x1 = W - 10;
    const lx = (ld) => x0 + (Math.log10(Math.max(0.05, Math.min(50, ld))) + 1.3) / (1.7 + 1.3) * (x1 - x0);
    const pts = list.slice(0, 30).map((a, i) => {
      const r = Math.max(2, Math.min(7, Math.log10(Math.max(5, a.size)) * 2.2));
      return `<circle cx="${lx(a.ld).toFixed(1)}" cy="${(H / 2 + ((i % 5) - 2) * 7).toFixed(1)}" r="${r.toFixed(1)}" class="${a.pha ? "neo-pha" : "neo-dot"}"><title>${esc(a.name)} · ${a.ld.toFixed(2)} 倍月球距離</title></circle>`;
    }).join("");
    const tick = (ld, t) => `<line x1="${lx(ld)}" x2="${lx(ld)}" y1="${H - 14}" y2="${H - 9}" class="neo-tick"/><text x="${lx(ld)}" y="${H - 1}" class="neo-tt">${t}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="neo-scale" role="img" aria-label="小行星離地球的距離">` +
      `<line x1="${x0}" x2="${x1}" y1="${H - 12}" y2="${H - 12}" class="neo-axis"/>` +
      `<circle cx="${x0}" cy="${H / 2}" r="9" class="neo-earth"/><text x="${x0}" y="12" class="neo-lab">地球</text>` +
      `<circle cx="${lx(1)}" cy="${H / 2}" r="4" class="neo-moon"/><text x="${lx(1)}" y="12" class="neo-lab">月球</text>` +
      tick(0.1, "0.1") + tick(1, "1") + tick(10, "10") + tick(50, "50 倍月距") + pts + `</svg>`;
  }
  function render() {
    if (err) { body.innerHTML = `<div class="ap-empty">${esc(err)}</div>`; return; }
    if (!list) { body.innerHTML = `<div class="ap-empty">查詢 NASA 近地小行星資料…</div>`; return; }
    if (!list.length) { body.innerHTML = `<div class="ap-empty">這 7 天沒有記錄到經過的小行星</div>`; return; }
    const closer = list.filter((a) => a.ld < 1).length;
    body.innerHTML =
      `<div class="tr-sum">未來 7 天有 <b>${list.length}</b> 顆小行星經過地球附近${closer ? `,其中 <b class="tr-hot">${closer}</b> 顆比月球還近` : ""}</div>` +
      scale() +
      list.slice(0, 12).map((a) => `<a class="neo-row" href="${esc(a.url || "#")}" target="_blank" rel="noopener">` +
        `<span class="neo-name">☄️ ${esc(a.name)}${a.pha ? `<span class="neo-tag" title="夠大、軌道夠靠近地球而被特別追蹤的分類,不代表會撞上地球">需追蹤</span>` : ""}</span>` +
        `<span class="neo-d"><b>${a.ld < 10 ? a.ld.toFixed(2) : Math.round(a.ld)}</b> 倍月球距離 · ${Math.round(a.km / 10000).toLocaleString()} 萬公里</span>` +
        `<span class="neo-m">約 ${a.size.toLocaleString()} 公尺(${sizeWord(a.size)})· 每秒 ${a.kms.toFixed(1)} 公里 · ${fmt(a.at)}</span></a>`).join("") +
      `<div class="sat-caption">資料:NASA 近地天體網路服務(NeoWs)。「月球距離」約 38.4 萬公里。這些小行星都只是從旁邊經過,「需追蹤」是天文學家的分類名稱,不代表會撞上地球。大小是依亮度推估的範圍中間值。</div>`;
  }

  async function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (!enabled) return;
    render();
    if (!list) {
      try { err = ""; await load(); } catch (e) { err = e.message; }
      if (enabled) render();
    }
  }
  return { setEnabled, isEnabled: () => enabled };
}
