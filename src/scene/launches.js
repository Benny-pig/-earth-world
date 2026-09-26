import * as THREE from "three";
import { esc } from "../lib/esc.js";
import { makeDraggable } from "../ui/draggable.js";

// 🚀 太空發射日曆:Launch Library 2(The Space Devs,免金鑰、允許網頁直接讀取)的
// 未來發射清單。免費額度每小時 15 次,所以抓到的資料在瀏覽器存 30 分鐘。
// 地球上在各發射場標 🚀(同一發射場的班次合併),面板列未來 30 天的發射與倒數。
const API = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=60&mode=normal";
const CACHE_KEY = "earth-world.launches.v1";
const CACHE_MS = 30 * 60 * 1000;
const DAYS = 30;

const STATUS = {
  Go: ["確定發射", "ok"], TBC: ["待確認", "warn"], TBD: ["時間未定", "idle"], Hold: ["暫停", "warn"],
  "In Flight": ["飛行中", "ok"], Success: ["發射成功", "done"], Deployed: ["酬載已部署", "done"],
  Failure: ["失敗", "bad"], "Partial Failure": ["部分失敗", "bad"],
};
const ORBIT_ZH = {
  LEO: "低軌道", SSO: "太陽同步軌道", GTO: "地球同步轉移軌道", GEO: "地球同步軌道", MEO: "中軌道",
  PO: "極軌道", HEO: "高橢圓軌道", "Sub": "次軌道", Lunar: "月球", TLI: "月球轉移", "L1": "拉格朗日點 L1", "L2": "拉格朗日點 L2",
  "Mars": "火星", Heliocentric: "繞日軌道", "Elliptical": "橢圓軌道", VLEO: "極低軌道", "Suborbital": "次軌道",
};
const TYPE_ZH = {
  Communications: "通訊", "Earth Science": "地球觀測", Government: "政府任務", "Government/Top Secret": "機密任務",
  "Human Exploration": "載人任務", "Planetary Science": "行星探測", Resupply: "補給", "Test Flight": "試飛",
  Navigation: "導航", Astrophysics: "天文觀測", "Technology": "技術驗證", Tourism: "太空旅遊", Dedicated_Rideshare: "共乘發射",
  "Dedicated Rideshare": "共乘發射", Robotic_Exploration: "無人探測", "Robotic Exploration": "無人探測", Heliophysics: "太陽物理",
};
const PROVIDER_ZH = {
  "China Aerospace Science and Technology Corporation": "中國航天科技集團", "Indian Space Research Organization": "印度太空研究組織",
  "Japan Aerospace Exploration Agency": "日本宇宙航空研究開發機構 JAXA", "Mitsubishi Heavy Industries": "日本三菱重工",
  "Russian Federal Space Agency (ROSCOSMOS)": "俄羅斯航太總署", "Korea Aerospace Research Institute": "韓國航太研究院",
  "National Aeronautics and Space Administration": "美國太空總署 NASA", "China Aerospace Science and Industry Corporation": "中國航天科工集團",
};
const TW_RE = /taiwan|formosat|tasa|triton|福衛|臺灣|台灣/i;

const DEG = Math.PI / 180;
const toVec3 = (lat, lon, r = 1) => {
  const la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
  return new THREE.Vector3(r * cl * Math.cos(lo), r * Math.sin(la), -r * cl * Math.sin(lo));
};
const fmtTw = (d) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
function countdown(ms) {
  if (ms <= 0) return "發射時間已到";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `T- ${d ? `${d} 天 ` : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

async function fetchLaunches() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && Date.now() - c.at < CACHE_MS) return c.list;
  } catch { /* 重新抓 */ }
  const r = await fetch(API);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  // 只留網站用得到的欄位,存在瀏覽器比較省空間
  const list = (d.results || []).map((x) => ({
    id: x.id, name: x.name, net: x.net, status: x.status?.abbrev || "", statusName: x.status?.name || "",
    rocket: x.rocket?.configuration?.full_name || x.rocket?.configuration?.name || "",
    provider: x.launch_service_provider?.name || "",
    mission: x.mission?.name || "", mtype: x.mission?.type || "", orbit: x.mission?.orbit?.abbrev || "",
    desc: x.mission?.description || "",
    pad: x.pad ? { id: x.pad.id, name: x.pad.name, loc: x.pad.location?.name || "", cc: x.pad.country?.alpha_2_code || "",
      lat: Number(x.pad.latitude), lon: Number(x.pad.longitude) } : null,
    img: x.image?.thumbnail_url || "",
  }));
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch { /* 存不下就算了 */ }
  return list;
}

export function createLaunchLayer({ globeObject, camera, renderer, rig, naturePopup, onClose }) {
  const panel = document.getElementById("launch-panel");
  const host = document.getElementById("launch-labels");
  const $ = (id) => document.getElementById(id);
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let enabled = false, list = [], pads = [], timer = null, selectedPad = null;

  function isTaiwan(l) { return TW_RE.test(`${l.name} ${l.mission} ${l.desc} ${l.provider}`); }

  function buildPads() {
    host.innerHTML = "";
    const byPad = new Map();
    for (const l of list) {
      if (!l.pad || !Number.isFinite(l.pad.lat)) continue;
      if (!byPad.has(l.pad.id)) byPad.set(l.pad.id, { pad: l.pad, launches: [] });
      byPad.get(l.pad.id).launches.push(l);
    }
    pads = [...byPad.values()].map((p) => {
      const el = document.createElement("div");
      el.className = "launch-pin";
      el.innerHTML = `<span class="launch-ico">🚀</span>${p.launches.length > 1 ? `<span class="launch-n">${p.launches.length}</span>` : ""}`;
      el.title = `${p.pad.loc}(${p.launches.length} 次發射)`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        naturePopup.show({
          icon: "🚀", zh: p.pad.loc, en: p.pad.name,
          note: p.launches.slice(0, 4).map((l) => `${fmtTw(new Date(l.net))} ${l.rocket} · ${l.mission || l.name}`).join("|"),
        }, e.clientX, e.clientY);
        selectedPad = p.pad.id;   // 面板清單只列這個發射場的班次
        renderList();
      });
      host.appendChild(el);
      return { ...p, el, dir: toVec3(p.pad.lat, p.pad.lon) };
    });
  }

  function statusBadge(l) {
    const [label, cls] = STATUS[l.status] || [l.statusName || l.status || "—", "idle"];
    return `<span class="ap-badge launch-st-${cls}">${esc(label)}</span>`;
  }

  function renderHero() {
    const now = Date.now();
    const next = list.find((l) => new Date(l.net).getTime() > now);
    $("launch-hero").innerHTML = next
      ? `<div class="launch-hero-k">下一次發射</div>` +
        `<div class="launch-count">${countdown(new Date(next.net).getTime() - now)}</div>` +
        `<div class="launch-hero-name">${esc(next.rocket)} · ${esc(next.mission || next.name)}</div>` +
        `<div class="launch-hero-sub">${esc(fmtTw(new Date(next.net)))}(台灣時間)· ${esc(next.pad?.loc || "")}</div>`
      : `<div class="ap-empty">未來沒有排定的發射</div>`;
  }

  function renderList() {
    const now = Date.now(), until = now + DAYS * 86400000;
    const rows = list.filter((l) => {
      const t = new Date(l.net).getTime();
      return t < until && t > now - 86400000 && (!selectedPad || l.pad?.id === selectedPad);
    });
    const filterNote = selectedPad
      ? `<div class="launch-filter">只顯示:${esc(rows[0]?.pad?.loc || "這個發射場")} <button type="button" class="tc-btn" id="launch-clear">顯示全部</button></div>` : "";
    $("launch-list").innerHTML = filterNote + (rows.length ? rows.map((l) => {
      const t = new Date(l.net).getTime();
      const tw = isTaiwan(l);
      const orbit = ORBIT_ZH[l.orbit] || l.orbit;
      const type = TYPE_ZH[l.mtype] || l.mtype;
      const prov = PROVIDER_ZH[l.provider] || l.provider;
      return `<div class="ap-row launch-row${tw ? " launch-tw" : ""}${t < now ? " ap-past" : ""}" data-id="${esc(l.id)}">
        ${tw ? `<div class="launch-tw-tag">🇹🇼 台灣相關任務</div>` : ""}
        <div class="ap-row-top"><span class="ap-flight"><b>${esc(l.rocket)}</b> · ${esc(l.mission || l.name)}</span>${statusBadge(l)}</div>
        <div class="ap-row-mid">🕒 ${esc(fmtTw(new Date(l.net)))}${t > now ? ` · <span class="launch-soon">${esc(countdown(t - now).replace(/:\d\d$/, ""))}</span>` : ""}</div>
        <div class="ap-row-bottom">
          ${l.pad ? `<span>${l.pad.cc ? `<img class="launch-flag" src="https://flagcdn.com/w20/${esc(l.pad.cc.toLowerCase())}.png" alt="">` : ""}${esc(l.pad.loc)}</span>` : ""}
          ${prov ? `<span>${esc(prov)}</span>` : ""}
          ${type ? `<span>${esc(type)}</span>` : ""}${orbit ? `<span>→ ${esc(orbit)}</span>` : ""}
        </div>
      </div>`;
    }).join("") : `<div class="ap-empty">未來 ${DAYS} 天沒有排定的發射</div>`);
    $("launch-clear")?.addEventListener("click", (e) => { e.stopPropagation(); selectedPad = null; renderList(); });
  }

  if (panel) {
    $("launch-list").addEventListener("click", (e) => {
      const row = e.target.closest(".launch-row");
      if (!row) return;
      const l = list.find((x) => x.id === row.dataset.id);
      if (l?.pad) rig.flyTo(l.pad.lat, l.pad.lon, { distance: 2.2, ms: 1000 });
      const p = pads.find((x) => x.pad.id === l?.pad?.id);
      if (p) { p.el.classList.add("pulse"); setTimeout(() => p.el.classList.remove("pulse"), 2400); }
    });
    $("launch-close").addEventListener("click", () => onClose && onClose());
  }

  const wp = new THREE.Vector3(), nrm = new THREE.Vector3(), camTo = new THREE.Vector3(), ndc = new THREE.Vector3();
  function update() {
    if (!enabled || !pads.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    for (const p of pads) {
      wp.copy(p.dir).applyMatrix4(globeObject.matrixWorld);
      nrm.copy(p.dir).transformDirection(globeObject.matrixWorld);
      camTo.copy(camera.position).sub(wp).normalize();
      const facing = nrm.dot(camTo);
      ndc.copy(wp).project(camera);
      if (facing < 0.05 || ndc.z > 1) { p.el.style.opacity = "0"; p.el.style.transform = "translate(-9999px,-9999px)"; continue; }
      const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width, y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
      p.el.style.opacity = THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1).toFixed(2);
      p.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  async function setEnabled(v) {
    enabled = !!v;
    host.hidden = !enabled;
    if (panel) panel.hidden = !enabled;
    clearInterval(timer); timer = null;
    if (!enabled) return;
    try {
      if (!list.length) { $("launch-list").innerHTML = `<div class="ap-empty">載入發射資料中…</div>`; list = await fetchLaunches(); }
      if (!enabled) return;
      list.sort((a, b) => new Date(a.net) - new Date(b.net));
      buildPads();
      renderHero();
      renderList();
      timer = setInterval(renderHero, 1000);   // 倒數每秒跳
    } catch (e) {
      console.warn("[launches] 載入失敗:", e.message);
      $("launch-list").innerHTML = `<div class="ap-empty">發射資料暫時載入失敗(資料來源每小時有次數上限),稍後再試</div>`;
    }
  }

  return { setEnabled, isEnabled: () => enabled, update };
}
