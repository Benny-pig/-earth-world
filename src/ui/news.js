// 📰 各國新聞(國家側欄用)。兩個來源:
//   1. Google 新聞(台灣繁中版)當日頭條:透過我們的 Cloudflare Worker(/?news=國名)。
//      Worker 還是舊版時(還沒部署新聞路線)會回 400,這時就只顯示第 2 種。
//   2. 維基百科「新聞動態」:全球重大新聞、繁體中文、網頁可以直接讀取(不用 Worker),
//      挑出最近兩週提到這個國家的條目。
const WORKER = "https://earth-world-flights.a7779782.workers.dev";
const WIKI = "https://zh.wikipedia.org/w/api.php?action=parse&page=" + encodeURIComponent("Portal:新聞動態") +
  "&prop=text&format=json&origin=*&variant=zh-tw&formatversion=2";
const WIKI_TTL = 15 * 60 * 1000;

// 國名以外常用來指這個國家的說法(首都會自動從國家資料補上)
const ALIASES = {
  TW: ["台灣", "中華民國"], CN: ["中華人民共和國", "中共", "北京當局"], US: ["美方", "華府", "白宮"],
  RU: ["俄國", "克里姆林宮"], KR: ["韓國", "大韓民國"], KP: ["朝鮮", "平壤"], GB: ["英方", "唐寧街"],
  JP: ["日方"], UA: ["烏方"], IL: ["以軍"], PS: ["加薩", "約旦河西岸", "哈瑪斯"], IR: ["伊方"],
  VA: ["教宗", "梵蒂岡"], HK: ["香港"], MO: ["澳門"],
};

let wikiCache = null, wikiAt = 0;
async function wikiNews() {
  if (wikiCache && Date.now() - wikiAt < WIKI_TTL) return wikiCache;
  const j = await fetch(WIKI).then((r) => r.json());
  const div = document.createElement("div");
  div.innerHTML = j?.parse?.text || "";
  // 依序走過頁面:遇到「9月27日」這種標題就換日期,底下最內層的條目(沒有子清單的 li)就是一則新聞
  const out = [];
  let date = null;
  const now = new Date();
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/^H[2-4]$/.test(n.tagName)) {
      const m = n.textContent.match(/(\d{1,2})月(\d{1,2})日/);
      if (m) {
        let y = now.getFullYear();
        if (+m[1] > now.getMonth() + 2) y--;   // 一月初看到十二月的條目
        date = { label: `${+m[1]}月${+m[2]}日`, t: new Date(y, +m[1] - 1, +m[2]).getTime() };
      }
      continue;
    }
    if (n.tagName === "LI" && date && !n.querySelector("li")) {
      const text = n.textContent.replace(/\[\d+\]/g, "").replace(/（圖）|\(圖\)/g, "").replace(/\s+/g, " ").trim();
      if (text.length >= 12) out.push({ date: date.label, t: date.t, text });
    }
  }
  wikiCache = out; wikiAt = Date.now();
  return out;
}

// 這個國家的各種說法;比對時先把「包含這個名字的其他國名」拿掉(例如找「蘇丹」時先去掉「南蘇丹」)
function namesFor(code, zh) {
  const set = new Set([zh, ...(ALIASES[code] || [])]);
  const cap = window.__earth?.content?.[code]?.capital_zh;
  if (cap) set.add(cap.split("(")[0].trim());
  return [...set].filter((s) => s && s.length >= 2);
}
function allCountryNames() {
  const m = window.__earth?.countryLayer?.meshByCode;
  return m ? [...m.values()].map((w) => w.userData?.names?.zh).filter(Boolean) : [];
}
function mentions(text, names, others) {
  for (const n of names) {
    let s = text;
    for (const o of others) if (o !== n && o.includes(n)) s = s.split(o).join("");
    if (s.includes(n)) return true;
  }
  return false;
}

export async function wikiNewsFor(code, zh) {
  const list = await wikiNews();
  const names = namesFor(code, zh), others = allCountryNames();
  const since = Date.now() - 15 * 86400000;   // 只看最近兩週(頁面上會留著整個月的條目)
  return list.filter((it) => it.t >= since && mentions(it.text, names, others)).sort((a, b) => b.t - a.t).slice(0, 6);
}

// 回傳 { items } 或 null(Worker 還沒部署新聞路線 / 暫時失敗)
export async function googleNewsFor(zh) {
  try {
    const r = await fetch(`${WORKER}/?news=${encodeURIComponent(zh)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.items) ? j : null;
  } catch { return null; }
}

export const googleNewsLink = (zh) => `https://news.google.com/search?q=${encodeURIComponent(zh)}%20when%3A1d&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant`;

export function timeAgo(s) {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m || 1} 分鐘前`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} 小時前` : `${Math.round(h / 24)} 天前`;
}
