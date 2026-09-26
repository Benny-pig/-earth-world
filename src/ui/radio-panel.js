import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";
import { zhHantName } from "../countries/country-names.js";

// 📻 電台選台:依洲別 → 國家 → 電台清單挑台收聽。地球上的電台字卡照樣可以直接點;
// 這個面板只是另一個入口,方便不知道某國在地球哪裡、或想一次看某國所有電台的讀者。
// 洲別來自 data/country-regions.json(tools/build-countries-geo.py 依 Natural Earth 產生)。
const REGIONS = [
  { key: "AS", label: "🐼 亞洲" },
  { key: "ME", label: "🐪 中東" },
  { key: "EU", label: "🏰 歐洲" },
  { key: "NA", label: "🗽 北美" },
  { key: "LA", label: "🌮 中南美" },
  { key: "AF", label: "🦁 非洲" },
  { key: "OC", label: "🦘 大洋洲" },
];
// 各洲的國家排序:台灣讀者最常找的放前面,其餘依台數多到少
const PINNED = { AS: ["TW", "JP", "KR", "HK", "CN", "SG"], NA: ["US", "CA"], EU: ["GB", "FR", "DE"], OC: ["AU", "NZ"] };

function tagLabel(tags) {
  const t = (tags || "").toLowerCase();
  if (/news|talk|information/.test(t)) return "新聞";
  if (/classical/.test(t)) return "古典";
  if (/jazz/.test(t)) return "爵士";
  if (/rock/.test(t)) return "搖滾";
  if (/pop|top ?40|hits?\b|chart/.test(t)) return "流行";
  if (/sport/.test(t)) return "運動";
  if (/music|variety|entertainment/.test(t)) return "音樂";
  return "";
}

export function createRadioPanel({ radio, rig, onClose }) {
  const panel = document.getElementById("radio-panel");
  if (!panel) return { setOpen() {}, refresh() {} };
  const listEl = document.getElementById("rp-list");
  const regionBox = document.getElementById("rp-regions");
  const searchEl = document.getElementById("rp-search");
  const bodyEl = document.getElementById("rp-body");
  const minBtn = document.getElementById("radio-panel-min");
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let regions = null;               // code -> 洲別
  let region = "AS";
  let expanded = null;              // 展開中的國家代碼
  let loadingMore = null;
  let open = false;

  regionBox.innerHTML = REGIONS.map((r) =>
    `<button type="button" data-region="${r.key}"${r.key === region ? ' class="active"' : ""}>${r.label}</button>`).join("");
  regionBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-region]");
    if (!b) return;
    region = b.dataset.region;
    searchEl.value = "";
    regionBox.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    render();
    listEl.scrollTop = 0;
  });
  searchEl.addEventListener("input", render);

  function countriesToShow() {
    const counts = radio.countryCounts();
    const q = searchEl.value.trim().toLowerCase();
    let codes = [...counts.keys()];
    if (q) {
      // 搜尋時不分洲:國名(中/英)或電台名稱符合都列出
      codes = codes.filter((c) => {
        const zh = zhHantName(c) || "";
        const en = (window.__earth?.countryLayer?.meshByCode.get(c)?.userData?.names?.en || "").toLowerCase();
        return zh.includes(q) || en.includes(q) || c.toLowerCase() === q ||
          radio.stationsOf(c).some((s) => (s.name || "").toLowerCase().includes(q));
      });
    } else {
      codes = codes.filter((c) => regions && regions[c] === region);
    }
    const pin = PINNED[region] || [];
    codes.sort((a, b) => {
      const pa = pin.indexOf(a), pb = pin.indexOf(b);
      if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
      return (counts.get(b) - counts.get(a)) || (zhHantName(a) || a).localeCompare(zhHantName(b) || b, "zh-Hant");
    });
    return { codes, counts };
  }

  function stationRows(code) {
    const cur = radio.current();
    const rows = radio.stationsOf(code).map((s) => {
      const playing = cur && cur.uuid === s.stationuuid;
      const tag = tagLabel(s.tags);
      return `<button type="button" class="rp-station${playing ? " playing" : ""}" data-code="${esc(code)}" data-uuid="${esc(s.stationuuid)}">` +
        `<span class="rp-play">${playing ? "🔊" : "▶"}</span>` +
        `<span class="rp-sname">${esc((s.name || "").trim() || "未知電台")}</span>` +
        (tag ? `<span class="rp-tag">${tag}</span>` : "") + `</button>`;
    }).join("");
    const more = loadingMore === code
      ? `<div class="ap-empty">載入更多電台中…</div>`
      : `<button type="button" class="tc-btn rp-more" data-more="${esc(code)}">＋ 載入更多電台</button>`;
    return `<div class="rp-stations">${rows || `<div class="ap-empty">這個國家目前沒有可播放的電台</div>`}${more}</div>`;
  }

  function render() {
    if (!open) return;
    if (!regions) { listEl.innerHTML = `<div class="ap-empty">載入中…</div>`; return; }
    const { codes, counts } = countriesToShow();
    if (!codes.length) {
      listEl.innerHTML = `<div class="ap-empty">${searchEl.value ? "找不到符合的國家或電台" : "電台清單載入中…"}</div>`;
      return;
    }
    listEl.innerHTML = codes.map((c) => {
      const cur = radio.current();
      const on = cur && cur.code === c;
      return `<div class="rp-country${expanded === c ? " open" : ""}">` +
        `<button type="button" class="rp-crow" data-country="${esc(c)}">` +
        `<img class="rp-flag" src="https://flagcdn.com/w40/${c.toLowerCase()}.png" alt="" onerror="this.style.visibility='hidden'">` +
        `<span class="rp-cname">${esc(zhHantName(c) || c)}</span>` +
        `${on ? `<span class="rp-on">🔊</span>` : ""}` +
        `<span class="rp-count">${counts.get(c)} 台</span><span class="rp-arrow">▸</span></button>` +
        (expanded === c ? stationRows(c) : "") + `</div>`;
    }).join("");
  }

  listEl.addEventListener("click", async (e) => {
    const st = e.target.closest(".rp-station");
    if (st) {
      radio.playStation(st.dataset.code, st.dataset.uuid);
      // 地球轉到這個國家(首都位置),讓讀者知道現在聽的是哪裡
      const cap = window.__earth?.content?.[st.dataset.code]?.capital_latlon;
      if (rig && Array.isArray(cap)) rig.flyTo(cap[0], cap[1], { distance: 2.4, ms: 1000 });
      return;
    }
    const more = e.target.closest("[data-more]");
    if (more) {
      const code = more.dataset.more;
      loadingMore = code;
      render();
      const added = await radio.loadMore(code);
      loadingMore = null;
      render();
      if (!added) {
        const btn = listEl.querySelector(`[data-more="${CSS.escape(code)}"]`);
        if (btn) { btn.textContent = "沒有更多可播放的電台了"; btn.disabled = true; }
      }
      return;
    }
    const row = e.target.closest("[data-country]");
    if (row) {
      expanded = expanded === row.dataset.country ? null : row.dataset.country;
      render();
    }
  });

  minBtn.addEventListener("click", () => {
    const willHide = !bodyEl.hidden;
    bodyEl.hidden = willHide;
    minBtn.textContent = willHide ? "▸" : "▾";
    minBtn.title = willHide ? "展開" : "收合";
    panel.classList.toggle("rp-min", willHide);
  });
  document.getElementById("radio-panel-close")?.addEventListener("click", () => onClose && onClose());

  async function setOpen(v) {
    open = !!v;
    panel.hidden = !open;
    if (!open) return;
    if (!regions) {
      regions = await fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    }
    render();
    await radio.ready();
    render();
  }

  // 分享連結:直接跳到某國(切到該國所在的洲、展開電台清單)
  async function showCountry(code) {
    if (!regions) regions = await fetch("data/country-regions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    if (regions[code]) {
      region = regions[code];
      regionBox.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.region === region));
    }
    expanded = code;
    render();
    await radio.ready();
    render();
    listEl.querySelector(`[data-country="${CSS.escape(code)}"]`)?.scrollIntoView({ block: "start" });
  }

  return { setOpen, refresh: render, showCountry, expandedCountry: () => expanded };
}
