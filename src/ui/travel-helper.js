import { makeDraggable } from "./draggable.js";
import { esc } from "../lib/esc.js";
import { isEn } from "../lib/i18n.js";

const L = (zh, en) => (isEn ? en : zh);

// 🧳 出國小幫手:選一個國家,一頁看完台灣旅客出發前要知道的事——
// 簽證、旅遊警示、插座電壓(要不要帶轉接頭/變壓器)、時差、匯率、小費與付款習慣、
// 靠左還是靠右開車、緊急電話與我國駐外館處、當地話怎麼說「你好/謝謝」(可以唸出來)。
// 資料:data/travel-helper.json(簽證/插座/行車,tools/build-travel-helper.py)、data/travel-alert.json、
// data/emergency.json、data/deep/(國家大百科:貨幣、小費、常用語)、open.er-api.com(即時匯率)。
const POPULAR = ["JP", "KR", "TH", "VN", "SG", "HK", "US", "GB", "FR", "AU"];
const TW_TZ = "Asia/Taipei";
const MOFA_HOTLINE = "+886-800-085-095";
const VISA = {
  free: ["ok", "免簽證", ""],
  eta: ["ok", "免簽,但要先上網申請「電子旅行許可」", "例如美國 ESTA、英國 ETA、加拿大 eTA、澳洲 ETA:出發前上對方政府的官方網站申請、繳費,通常幾分鐘到幾天就核准。小心假冒的代辦網站。"],
  hk_par: ["ok", "免簽,先上網辦「預辦入境登記」", "在香港入境事務處網站申請,免費,通常馬上就核准。"],
  voa: ["mid", "落地簽證", "到了當地機場再辦,記得準備照片、回程機票和當地貨幣或美金。"],
  evisa: ["mid", "電子簽證", "出發前上對方政府的官方網站申請,核准信印出來或存在手機裡。"],
  visa: ["bad", "需要事先申請簽證", "要先向對方的駐台機構申請,需要一段時間,請提早準備。"],
  permit: ["bad", "需要特別許可", "要事先申請特別入境許可,一般觀光不容易成行。"],
  permit_cn: ["mid", "要用「台胞證」入境", "前往中國大陸要持「臺灣居民來往大陸通行證」(台胞證),不是用中華民國護照。出發前請留意陸委會的提醒。"],
  refused: ["bad", "目前不接受中華民國護照入境", ""],
};
const VISA_EN = {
  free: ["ok", "Visa-free", ""],
  eta: ["ok", "Visa-free, but apply online for an electronic travel authorisation first", "e.g. US ESTA, UK ETA, Canada eTA, Australia ETA: apply and pay on the official government site before you go; approval takes minutes to days. Beware of look-alike agent sites."],
  hk_par: ["ok", "Visa-free with online Pre-arrival Registration", "Apply on the Hong Kong Immigration Department website; it's free and usually approved at once."],
  voa: ["mid", "Visa on arrival", "Get it at the airport on arrival; bring a photo, a return ticket and local cash or US dollars."],
  evisa: ["mid", "e-Visa", "Apply on the official government website before you go, and keep the approval printed or on your phone."],
  visa: ["bad", "Visa required in advance", "Apply at the country's office in Taiwan well ahead of time."],
  permit: ["bad", "Special permit required", "A special entry permit is needed in advance; ordinary tourism is difficult."],
  permit_cn: ["mid", "Enter with the Mainland Travel Permit", "Taiwan residents travel to mainland China with the Mainland Travel Permit for Taiwan Residents, not the ROC passport."],
  refused: ["bad", "ROC (Taiwan) passports are currently not accepted", ""],
};
const PLUG_EN = {
  A: "US flat 2-pin", B: "US 3-pin", C: "Euro round 2-pin", D: "Old British round 3-pin", E: "French", F: "Schuko", G: "UK 3-pin", H: "Israeli",
  I: "Australian", J: "Swiss", K: "Danish", L: "Italian", M: "South African", N: "Brazilian", O: "Thai",
};
const PHRASE_EN = ["Hello", "Thank you", "Goodbye"];
const PLUG = {
  A: "美式扁腳", B: "美式三腳", C: "歐規雙圓腳", D: "舊英式三圓腳", E: "法式圓腳", F: "德式圓腳", G: "英式三方腳", H: "以色列式",
  I: "澳式八字腳", J: "瑞士式", K: "丹麥式", L: "義大利式", M: "南非大圓腳", N: "巴西式", O: "泰式",
};
// 常用語要用哪一種語言的聲音唸(主要語言)
const LANG = {
  JP: "ja-JP", KR: "ko-KR", CN: "zh-CN", HK: "zh-HK", MO: "zh-HK", TH: "th-TH", VN: "vi-VN", ID: "id-ID", MY: "ms-MY", PH: "fil-PH",
  IN: "hi-IN", FR: "fr-FR", DE: "de-DE", AT: "de-AT", IT: "it-IT", ES: "es-ES", MX: "es-MX", AR: "es-AR", CL: "es-CL", CO: "es-CO",
  PE: "es-PE", PT: "pt-PT", BR: "pt-BR", NL: "nl-NL", SE: "sv-SE", NO: "nb-NO", DK: "da-DK", FI: "fi-FI", PL: "pl-PL", CZ: "cs-CZ",
  HU: "hu-HU", GR: "el-GR", TR: "tr-TR", RU: "ru-RU", UA: "uk-UA", EG: "ar-EG", SA: "ar-SA", AE: "ar-AE", IL: "he-IL",
  US: "en-US", GB: "en-GB", AU: "en-AU", NZ: "en-NZ", CA: "en-CA", IE: "en-IE", SG: "en-SG",
};

function tzOffsetMin(tz, d = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - d.getTime()) / 60000);
  } catch { return null; }
}
const trim = (n) => (!isFinite(n) ? "—" : n >= 100 ? Math.round(n).toLocaleString() : n >= 1 ? (+n.toFixed(2)).toLocaleString() : (+n.toPrecision(3)).toString());

export function createTravelHelper({ getContent, nameOf, flyTo, onClose }) {
  const panel = document.getElementById("trip-panel");
  const body = document.getElementById("trip-body");
  if (!panel || !body) return { setEnabled() {}, isEnabled: () => false, show() {} };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  document.getElementById("trip-close")?.addEventListener("click", () => onClose && onClose());
  const minBtn = document.getElementById("trip-min");
  function setMin(on) {
    panel.classList.toggle("min", on);
    if (minBtn) { minBtn.textContent = on ? "▴" : "▾"; minBtn.title = on ? "展開面板" : "收合面板"; }
  }
  minBtn?.addEventListener("click", () => setMin(!panel.classList.contains("min")));

  let enabled = false, code = null, q = "", seq = 0;
  const once = (url) => { let p = null; return () => (p ||= fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)); };
  const getHelper = once("data/travel-helper.json");
  const getAlerts = once("data/travel-alert.json");
  const getEmergency = once("data/emergency.json");
  let fx = null, fxAt = 0;
  async function getFx() {
    if (fx && Date.now() - fxAt < 3600000) return fx;
    try { const j = await (await fetch("https://open.er-api.com/v6/latest/TWD")).json(); if (j?.rates) { fx = j; fxAt = Date.now(); } } catch { /* 匯率讀不到就不顯示 */ }
    return fx;
  }
  const deepCache = new Map();
  function getDeep(c) {
    if (!deepCache.has(c)) deepCache.set(c, fetch(`data/deep/${c}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return deepCache.get(c);
  }

  // ---------- 選國家 ----------
  function countries() {
    const content = getContent() || {};
    return Object.keys(content).filter((c) => /^[A-Z]{2}$/.test(c) && c !== "TW").map((c) => ({ c, zh: nameOf(c) }));
  }
  function hitsHtml() {
    const norm = (s) => String(s || "").replace(/臺/g, "台").toLowerCase();
    const k = norm(q);
    // 開頭就對上的排前面(打「日」先出日本),再來名字短的
    const hits = q ? countries().filter((x) => norm(x.zh).includes(k) || x.c.toLowerCase() === k)
      .sort((a, b) => (norm(b.zh).startsWith(k) - norm(a.zh).startsWith(k)) || a.zh.length - b.zh.length).slice(0, 8) : [];
    return hits.map((x) => `<button type="button" data-go="${x.c}">${esc(x.zh)}</button>`).join("") ||
      (q ? `<span class="au-dim">${L(`找不到「${esc(q)}」`, `No match for “${esc(q)}”`)}</span>` : "");
  }
  function pickerHtml() {
    return `<div class="tp-pick"><input type="search" class="tp-q" placeholder="${L("🔍 要去哪一國?(例如 日本、泰國)", "🔍 Where are you going? (e.g. Japan)")}" value="${esc(q)}">` +
      `<div class="tp-hits">${hitsHtml()}</div>` +
      `<div class="tp-pop">${POPULAR.map((c) => `<button type="button" data-go="${c}" class="${c === code ? "on" : ""}">${esc(nameOf(c))}</button>`).join("")}</div></div>`;
  }

  // ---------- 各區塊 ----------
  function visaHtml(v) {
    if (!v) return `<div class="tp-card"><h4>🛂 ${L("簽證", "Visa")}</h4><p class="au-dim">${L("這裡查不到資料,請看外交部的清單。", "No data here; please check the official list.")}</p>${visaLink()}</div>`;
    const [lvl, label, tip] = (isEn ? VISA_EN : VISA)[v.t] || ["mid", L("請查詢外交部", "Check with the authorities"), ""];
    const stay = isEn ? v.stay.replace(/ 天$/, " days").replace(/ 個月$/, " months").replace(/ 年$/, " years").replace(/ 週$/, " weeks") : v.stay;
    return `<div class="tp-card"><h4>🛂 ${L("簽證(持中華民國護照)", "Visa (Taiwan / ROC passport)")}</h4><div class="tp-badge tp-${lvl}">${esc(label)}${stay ? `<span>${L(`可停留 ${esc(stay)}`, `stay up to ${esc(stay)}`)}</span>` : ""}</div>` +
      (tip ? `<p>${esc(tip)}</p>` : "") + `<p class="au-dim">${L("護照效期通常要還有 6 個月以上。", "Your passport usually needs at least 6 months of validity.")}</p>${visaLink()}</div>`;
  }
  const visaLink = () => `<a class="tp-link" href="https://www.boca.gov.tw/cp-37-220-9f130-1.html" target="_blank" rel="noopener">${L("外交部領事事務局:免簽證、落地簽證、電子簽證國家清單", "Taiwan's Bureau of Consular Affairs: visa-free / visa-on-arrival list (Chinese)")} ↗</a>`;
  function alertHtml(a) {
    if (!a) return `<div class="tp-card"><h4>⚠️ ${L("旅遊警示", "Travel advisory")}</h4><p>${L("目前沒有外交部的旅遊警示。", "No travel advisory from Taiwan's foreign ministry.")}</p></div>`;
    const label = isEn ? `Level ${a.level} of 4 (${["", "grey: be aware", "yellow: take extra care", "orange: avoid non-essential travel", "red: leave as soon as possible"][a.level] || ""})` : a.label;
    return `<div class="tp-card"><h4>⚠️ ${L("旅遊警示", "Travel advisory")}</h4><div class="tp-alert" style="border-color:${esc(a.color)}"><i style="background:${esc(a.color)}"></i><b>${esc(label)}</b></div>` +
      (a.reason && !isEn ? `<p>${esc(a.reason)}${a.note ? `(${esc(a.note)})` : ""}</p>` : "") +
      `<a class="tp-link" href="https://www.boca.gov.tw/sp-trwa-list-1.html" target="_blank" rel="noopener">${L("外交部旅遊警示", "Taiwan MOFA travel advisories (Chinese)")} ↗</a></div>`;
  }
  function powerHtml(p, tw) {
    if (!p) return "";
    const plugs = p.plugs || [];
    const fits = plugs.includes("A") || plugs.includes("B");
    const v = p.v;
    const sameV = v && v >= 100 && v <= 127;
    if (isEn) return `<div class="tp-card"><h4>🔌 Plugs & voltage</h4>` +
      `<div class="tp-plugs">${plugs.map((x) => `<span><b>${x}</b>${PLUG_EN[x] || ""}</span>`).join("")}</div>` +
      `<p>${v ? `<b>${v}V</b>` : ""}${p.hz ? ` · ${esc(p.hz)}Hz` : ""} (Taiwan: ${tw?.v || 110}V, type A/B)</p>` +
      `<p class="tp-ok-${fits ? "yes" : "no"}">${fits ? "✅ Taiwanese plugs fit (flat 2-pin is safest)." : `🔁 Bring an <b>adapter</b> (to type ${plugs.slice(0, 3).join("/")}).`}</p>` +
      `<p class="tp-ok-${sameV ? "yes" : "no"}">${sameV ? "✅ Similar voltage to Taiwan; appliances work as they are."
        : `⚡ Higher voltage than Taiwan: phone, laptop and camera chargers marked “100–240V” are fine; <b>hair dryers, curling irons and kettles</b> rated only 110V need a converter or a dual-voltage model.`}</p></div>`;
    return `<div class="tp-card"><h4>🔌 插座與電壓</h4>` +
      `<div class="tp-plugs">${plugs.map((x) => `<span><b>${x}</b>${PLUG[x] || ""}</span>`).join("")}</div>` +
      `<p>${v ? `電壓 <b>${v}V</b>` : ""}${p.hz ? ` · ${esc(p.hz)}Hz` : ""}(台灣是 ${tw?.v || 110}V、A/B 型)</p>` +
      `<p class="tp-ok-${fits ? "yes" : "no"}">${fits ? "✅ 台灣的插頭可以直接插(兩腳扁頭最保險)。" : `🔁 要帶<b>轉接頭</b>(轉成 ${plugs.slice(0, 3).join("/")} 型)。`}</p>` +
      `<p class="tp-ok-${sameV ? "yes" : "no"}">${sameV ? "✅ 電壓跟台灣差不多,電器可以直接用。"
        : `⚡ 電壓比台灣高:手機、筆電、相機的充電器多半標示「100–240V」可以直接用;<b>吹風機、電棒捲、快煮壺</b>只寫 110V 的不能插,要用變壓器或帶國際電壓款。`}</p></div>`;
  }
  function timeHtml(tz) {
    if (!tz) return "";
    const diff = tzOffsetMin(tz), tw = tzOffsetMin(TW_TZ);
    if (diff == null || tw == null) return "";
    const d = (diff - tw) / 60;
    const h = Math.abs(d);
    const hh = Number.isInteger(h) ? h : h.toFixed(1);
    const txt = isEn ? (d === 0 ? "Same as Taiwan" : `${hh} h ${d > 0 ? "ahead of" : "behind"} Taiwan`) : d === 0 ? "跟台灣一樣" : `比台灣${d > 0 ? "快" : "慢"} ${hh} 小時`;
    const now = new Intl.DateTimeFormat(isEn ? "en-GB" : "zh-TW", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    return `<div class="tp-card tp-half"><h4>🕘 ${L("時差", "Time difference")}</h4><div class="tp-big">${txt}</div><p class="au-dim">${L("當地現在", "Local time")} ${now}</p></div>`;
  }
  function driveHtml(side) {
    if (!side) return "";
    if (isEn) return `<div class="tp-card tp-half"><h4>🚗 Driving side</h4><div class="tp-big">${side === "L" ? "Drive on the left" : "Drive on the right"}</div>` +
      `<p class="au-dim">${side === "L" ? "Opposite to Taiwan! Look <b>right</b> first when crossing." : "Same as Taiwan."}</p></div>`;
    return `<div class="tp-card tp-half"><h4>🚗 開車方向</h4><div class="tp-big">${side === "L" ? "靠左行駛" : "靠右行駛"}</div>` +
      `<p class="au-dim">${side === "L" ? "跟台灣相反!過馬路先看<b>右邊</b>來車。" : "跟台灣一樣。"}</p></div>`;
  }
  // 駐外館處的急難救助欄位常常是一大段說明,只挑出有電話號碼的那一兩行(手機、境內直撥優先)
  function phones(e) {
    const lines = String(e || "").split("\n").map((l) => l.replace(/^[●•\s]+/, "").trim())
      .filter((l) => l.length < 90 && /\d{2,}[\d\s\-)）]*\d{3,}/.test(l));
    const pref = lines.filter((l) => /手機|行動電話|境內直撥|^[（(+\d]/.test(l));
    return (pref.length ? pref : lines).slice(0, 2);
  }
  function emergencyHtml(em, data) {
    const nums = em ? (() => {
      const [po, fi, am] = em;
      if (po && po === fi && fi === am) return `<span>🚓🚒🚑 <b>${esc(po)}</b></span>`;
      return [[L("🚓 警察", "🚓 Police"), po], [L("🚒 消防", "🚒 Fire"), fi], [L("🚑 救護", "🚑 Ambulance"), am]].filter(([, n]) => n).map(([l, n]) => `<span>${l} <b>${esc(n)}</b></span>`).join("");
    })() : "";
    const offices = (data?.tw?.[code] || []).map(([id]) => data.twOffices?.[id]).filter(Boolean);
    const o = offices[0];
    return `<div class="tp-card"><h4>🆘 ${L("緊急聯絡", "Emergency")}</h4>${nums ? `<div class="tp-nums">${nums}</div>` : ""}` +
      (o ? `<p><b>${esc(isEn && o.en ? o.en : o.n)}</b>${phones(o.e).map((l) => `<br>🆘 ${esc(l)}`).join("") || (o.t ? `<br>☎️ ${esc(o.t.split(/[;\n]/)[0])}` : "")}</p>` : "") +
      `<p>${L("外交部緊急聯絡中心(24 小時)", "Taiwan MOFA emergency centre (24 h)")}:<b>${MOFA_HOTLINE}</b></p></div>`;
  }
  function moneyHtml(deep, rates) {
    const ccyText = deep?.quick_facts?.currency || "";
    const ccy = (/[(（]\s*([A-Za-z]{3})\s*[)）]/.exec(ccyText) || [])[1]?.toUpperCase();
    const rate = ccy && rates?.rates?.[ccy];
    const pi = deep?.practical_info || {};
    const name = ccyText.replace(/[(（].*$/, "").trim() || ccy || "";
    if (isEn) return rate ? `<div class="tp-card"><h4>💱 Money</h4>` +
      `<div class="tp-fx"><input type="number" class="tp-fx-in" value="1000" min="0" step="100" aria-label="Amount in TWD"> TWD ≈ <b class="tp-fx-out" data-rate="${rate}">${trim(1000 * rate)}</b> ${esc(ccy)}</div>` +
      `<p class="au-dim">1 ${esc(ccy)} ≈ ${trim(1 / rate)} TWD · rates from open.er-api.com, updated daily</p></div>` : "";
    return `<div class="tp-card"><h4>💱 錢</h4>` +
      (rate ? `<div class="tp-fx"><input type="number" class="tp-fx-in" value="1000" min="0" step="100" aria-label="新台幣金額"> 新台幣 ≈ <b class="tp-fx-out" data-rate="${rate}">${trim(1000 * rate)}</b> ${esc(name)}</div>` +
        `<p class="au-dim">1 ${esc(name)} ≈ ${trim(1 / rate)} 新台幣 · 匯率 open.er-api.com,每天更新</p>` : ccyText ? `<p>貨幣:${esc(ccyText)}</p>` : "") +
      (pi.money_note ? `<p>💳 ${esc(pi.money_note)}</p>` : "") +
      (pi.tipping ? `<p>💵 <b>小費</b>:${esc(pi.tipping)}</p>` : "") + `</div>`;
  }
  function phrasesHtml(deep) {
    const g = deep?.practical_info?.greetings;
    if (!Array.isArray(g) || !g.length) return "";
    const lang = LANG[code];
    const canSay = lang && window.speechSynthesis && speechSynthesis.getVoices().some((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.slice(0, 2)));
    return `<div class="tp-card"><h4>🗣️ ${L("當地話這樣說", "Say it locally")}</h4><div class="tp-phr">${g.map((x, i) =>
      `<div><small>${esc(isEn ? PHRASE_EN[i] || "" : x.phrase)}</small><b>${esc(x.local)}</b><span>${esc(x.romanized || "")}</span>` +
      (canSay ? `<button type="button" class="tp-say" data-say="${esc(x.local)}" title="${L("唸出來", "Say it")}">🔊</button>` : "") + `</div>`).join("")}</div></div>`;
  }
  const checklist = () => isEn ? `<div class="tp-card"><h4>✅ Before you go</h4><ul class="tp-check">` +
    `<li>Passport valid for at least 6 more months</li><li>Travel and overseas medical insurance</li>` +
    `<li>Register your trip with Taiwan's <a href="https://www.boca.gov.tw/sp-abre-main-1.html" target="_blank" rel="noopener">Bureau of Consular Affairs</a> so they can reach you in an emergency</li>` +
    `<li>Save the MOFA emergency number ${MOFA_HOTLINE} in your phone</li><li>Check plugs, SIM/roaming and local transport cards</li></ul></div>` :
    `<div class="tp-card"><h4>✅ 出發前檢查</h4><ul class="tp-check">` +
    `<li>護照效期還有 6 個月以上</li><li>投保旅遊平安險與海外醫療險</li>` +
    `<li>上外交部<a href="https://www.boca.gov.tw/sp-abre-main-1.html" target="_blank" rel="noopener">「出國登錄」</a>,有急難時找得到你</li>` +
    `<li>手機存好外交部緊急聯絡中心 ${MOFA_HOTLINE}</li><li>確認插頭、網卡或漫遊、當地交通卡</li></ul></div>`;

  async function render() {
    const my = ++seq;
    if (!code) {
      body.innerHTML = pickerHtml() + `<div class="ap-empty">${L("選一個要去的國家,一頁看完簽證、插座、時差、匯率、小費和緊急電話。<br>也可以在國家介紹裡按「🧳 出國小幫手」。",
        "Pick a destination to see visa, plugs, time difference, exchange rate and emergency numbers on one page.<br>You can also tap “🧳 Travel helper” in a country's info panel.")}</div>`;
      return;
    }
    body.innerHTML = pickerHtml() + `<div class="ap-empty">${L("整理中…", "Loading…")}</div>`;
    const [helper, alerts, emData, deep, rates] = await Promise.all([getHelper(), getAlerts(), getEmergency(), getDeep(code), getFx()]);
    if (my !== seq || !enabled) return;
    const content = (getContent() || {})[code] || {};
    body.innerHTML = pickerHtml() +
      `<div class="tp-head"><img src="https://flagcdn.com/w80/${code.toLowerCase()}.png" alt="" onerror="this.remove()"><div><b>${esc(nameOf(code))}</b>` +
      `<small>${L("出發前請再以外交部和對方政府的官方公告為準", "Always double-check official government sources before you travel")}</small></div><button type="button" class="tc-btn" data-act="fly">${L("🌍 飛過去", "🌍 Fly there")}</button></div>` +
      visaHtml(helper?.visa?.[code]) +
      alertHtml(alerts?.countries?.[code]) +
      `<div class="tp-row">${timeHtml(content.timezone)}${driveHtml(helper?.drive?.[code])}</div>` +
      powerHtml(helper?.power?.[code], helper?.power?.TW) +
      moneyHtml(deep, rates) +
      phrasesHtml(deep) +
      emergencyHtml(emData?.em?.[code], emData) +
      checklist() +
      (isEn ? `<div class="sat-caption">Visa, plugs and driving side compiled from Wikipedia (CC BY-SA, ${esc(helper?.asOf || "")}); advisories and Taiwan's overseas offices from Taiwan's Bureau of Consular Affairs. Rules change — always check official sources.</div>`
        : `<div class="sat-caption">簽證、插座電壓、行車方向整理自維基百科(CC BY-SA,${esc(helper?.asOf || "")});旅遊警示、駐外館處來自外交部領事事務局;` +
          `小費、付款習慣、常用語來自本站國家大百科。規定可能隨時變動,請以官方公告為準。</div>`);
  }

  function show(c) {
    code = c;
    q = "";
    if (!enabled) { setEnabled(true); return; }
    setMin(false);
    panel.dispatchEvent(new CustomEvent("panel:front", { bubbles: true }));   // 收在分頁裡的話拿到最前面
    render();
  }
  body.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { show(go.dataset.go); return; }
    if (e.target.closest("[data-act=fly]") && code) { if (window.innerWidth <= 640) setMin(true); flyTo(code); return; }
    const say = e.target.closest("[data-say]");
    if (say && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(say.dataset.say);
      const lang = LANG[code];
      u.lang = lang;
      const v = speechSynthesis.getVoices().filter((x) => x.lang.replace("_", "-").toLowerCase().startsWith(lang.slice(0, 2)));
      u.voice = v.find((x) => x.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) || v[0] || null;
      u.rate = 0.85;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  });
  // 搜尋:只更新下面的結果,輸入框本身不動——注音、倉頡、拼音輸入法選字時(組字中)也不處理,
  // 不然組字會被打斷,只留下注音符號
  function onSearch(e) {
    if (e.isComposing || !e.target.classList.contains("tp-q")) return;
    q = e.target.value.trim();
    const box = body.querySelector(".tp-hits");
    if (box) box.innerHTML = hitsHtml();
  }
  body.addEventListener("compositionend", onSearch);
  body.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.target.classList.contains("tp-q")) body.querySelector(".tp-hits [data-go]")?.click();
  });
  body.addEventListener("input", (e) => {
    if (e.target.classList.contains("tp-q")) onSearch(e);
    else if (e.target.classList.contains("tp-fx-in")) {
      const out = body.querySelector(".tp-fx-out");
      if (out) out.textContent = trim((Number(e.target.value) || 0) * Number(out.dataset.rate));
    }
  });

  function setEnabled(v) {
    enabled = !!v;
    panel.hidden = !enabled;
    if (enabled) { setMin(false); render(); }
  }
  return { setEnabled, isEnabled: () => enabled, show };
}
