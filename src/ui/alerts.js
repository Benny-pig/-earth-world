import { esc } from "../lib/esc.js";
import { SHOWERS } from "../scene/meteors.js";

// 🔔 重要事件提醒:有大事時,畫面上方跳一條提醒(點了就飛過去或打開對應的功能,× 可以關掉)——
//   📳 台灣附近(350 公里內)3 小時內有規模 5 以上的地震;或全世界 6 小時內有規模 7 以上的大地震
//   🌀 颱風中心離台灣 1000 公里以內(日本氣象廳,每 30 分鐘檢查)
//   🌠 今晚是大型流星雨(每小時 40 顆以上)的極大期
// 關掉的提醒記在這台瀏覽器,同一件事不會再跳(3 天後忘記)。
const TW = [23.7, 121];
const JMA = "https://www.jma.go.jp/bosai/typhoon/data/";
const KEY = "earth-world.alerts.dismissed";
const TC_CAT = { TY: "颱風", STS: "強烈熱帶風暴", TS: "熱帶風暴", TD: "熱帶性低氣壓" };

function km([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} 分鐘前` : `${Math.round(m / 60)} 小時前`; };
const twDate = () => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" })
  .formatToParts(new Date()).map((p) => [p.type, Number(p.value)]));

export function createAlerts({ rig, codeAt, nameOf, turnOn }) {
  const bar = document.createElement("div");
  bar.id = "alert-bar";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.hidden = true;
  document.body.appendChild(bar);

  let dismissed = {};
  try { dismissed = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { dismissed = {}; }
  const now0 = Date.now();
  for (const [k, t] of Object.entries(dismissed)) if (now0 - t > 3 * 86400000) delete dismissed[k];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(dismissed)); } catch { /* 存不了就算了 */ } };

  const groups = { quake: [], tc: [], meteor: [] };   // 各來源目前的提醒
  // 電腦:左邊開著面板時,提醒條移到右邊的空位,不要蓋住面板
  function place() {
    if (bar.hidden || window.innerWidth <= 640) { bar.style.left = ""; return; }
    let edge = 0;
    for (const el of document.querySelectorAll("body > [id$='-panel']")) {
      if (el.hidden || el.id === "side-panel") continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.left < 100 && r.top < 200) edge = Math.max(edge, r.right);
    }
    bar.style.left = edge ? `${Math.round((edge + 12 + window.innerWidth) / 2)}px` : "";
  }
  setInterval(place, 800);
  function render() {
    const list = [...groups.quake, ...groups.tc, ...groups.meteor].filter((a) => !dismissed[a.id]).sort((a, b) => b.pri - a.pri).slice(0, 2);
    bar.hidden = !list.length;
    bar.innerHTML = list.map((a) => `<div class="al-row al-${a.kind}"><button type="button" class="al-go" data-id="${esc(a.id)}">` +
      `<span class="al-ico">${a.icon}</span><span class="al-txt"><b>${esc(a.title)}</b><small>${esc(a.text)}</small></span><span class="al-more">${esc(a.cta)} ›</span></button>` +
      `<button type="button" class="al-x" data-x="${esc(a.id)}" aria-label="關閉這則提醒">×</button></div>`).join("");
    place();
  }
  const all = () => [...groups.quake, ...groups.tc, ...groups.meteor];
  bar.addEventListener("click", (e) => {
    const x = e.target.closest("[data-x]");
    if (x) { dismissed[x.dataset.x] = Date.now(); save(); render(); return; }
    const g = e.target.closest("[data-id]");
    const a = g && all().find((v) => v.id === g.dataset.id);
    if (a) a.go();
  });

  // ---------- 地震(跟著地震圖層每分鐘的資料更新) ----------
  function onQuakes(features) {
    const out = [];
    for (const f of features || []) {
      const p = f.properties || {};
      const [lon, lat] = f.geometry?.coordinates || [];
      if (typeof p.mag !== "number" || lat == null) continue;
      const age = Date.now() - p.time;
      const d = km(TW, [lat, lon]);
      const near = d <= 350 && p.mag >= 5 && age <= 3 * 3600000;
      const big = p.mag >= 7 && age <= 6 * 3600000;
      if (!near && !big) continue;
      const code = codeAt?.(lat, lon);
      // 在海上:從 USGS 英文地名最後一段對照國名(例如「Lima, Peru」→ 秘魯附近海域)
      const place = (p.place || "").replace(/^.*\bof\s+/i, "");
      const tail = place.split(",").pop().trim().replace(/\s+region$/i, "").toLowerCase();
      const feat = window.__earth?.geojson?.features?.find((x) => x.properties?.NAME_EN?.toLowerCase() === tail);
      const where = near ? (code === "TW" ? "台灣" : "台灣附近") : code ? nameOf(code) : feat?.properties?.NAME_ZHT ? `${feat.properties.NAME_ZHT}附近海域` : `${place || "海上"} `;
      out.push({
        id: `q-${f.id}`, kind: "quake", icon: "📳", pri: near ? 30 : 20,
        title: near ? `台灣附近發生規模 ${p.mag.toFixed(1)} 地震` : `${where}發生規模 ${p.mag.toFixed(1)} 大地震`,
        text: `${near ? `離台灣約 ${Math.round(d)} 公里 · ` : ""}${ago(p.time)}${near ? "。請以中央氣象署的發布為準。" : ""}`,
        cta: "看位置",
        go: () => { turnOn("quake-toggle"); rig.flyTo(lat, lon, { distance: near ? 1.9 : 2.3, ms: 1500 }); },
      });
    }
    groups.quake = out;
    render();
  }

  // ---------- 颱風 ----------
  async function checkTyphoons() {
    try {
      const list = await fetch(JMA + "targetTc.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : []));
      const out = [];
      for (const tc of (list || []).slice(0, 4)) {
        const sp = await fetch(`${JMA}${tc.tropicalCyclone}/specifications.json`, { cache: "no-cache" }).then((r) => r.json()).catch(() => null);
        if (!sp) continue;
        const now = sp.find((x) => x.advancedHours === 0) || sp[1] || {};
        const c = now.position?.deg;
        if (!Array.isArray(c)) continue;
        const d = km(TW, c);
        if (d > 1000) continue;
        const title = sp.find((x) => x.part === "title") || {};
        const nm = title.name?.en ? title.name.en.charAt(0) + title.name.en.slice(1).toLowerCase() : "";
        const cat = TC_CAT[now.category?.en] || "熱帶氣旋";
        out.push({
          id: `tc-${tc.tropicalCyclone}-${Math.round(d / 100)}`, kind: "tc", icon: "🌀", pri: d < 500 ? 28 : 18,
          title: `${cat}${nm ? ` ${nm}` : ""} 距離台灣約 ${Math.round(d / 10) * 10} 公里`,
          text: `${now.maximumWind?.sustained?.["m/s"] ? `最大風速 ${now.maximumWind.sustained["m/s"]} m/s。` : ""}請留意中央氣象署的颱風警報。`,
          cta: "看路徑",
          go: () => { turnOn("typhoon-toggle"); rig.flyTo(c[0], c[1], { distance: 2.4, ms: 1500 }); },
        });
      }
      groups.tc = out;
      render();
    } catch { /* 讀不到就下次再試 */ }
  }

  // ---------- 流星雨極大期 ----------
  function checkMeteors() {
    const d = twDate();
    const sh = SHOWERS.find((s) => s.zhr >= 40 && s.night[0] === d.month && s.night[1] === d.day);
    groups.meteor = sh ? [{
      id: `m-${sh.id}-${d.year}`, kind: "meteor", icon: "🌠", pri: 10,
      title: `今晚是${sh.zh}的極大期`, text: `理想狀況每小時約 ${sh.zhr} 顆,找個光害少的地方往${sh.con}方向看。`,
      cta: "怎麼看", go: () => turnOn("meteor-toggle"),
    }] : [];
    render();
  }

  checkMeteors();
  setTimeout(checkTyphoons, 8000);   // 等網站載入完再查,不搶首屏頻寬
  setInterval(checkTyphoons, 30 * 60000);
  setInterval(checkMeteors, 60 * 60000);
  return { onQuakes, refresh: () => { checkTyphoons(); checkMeteors(); } };
}
