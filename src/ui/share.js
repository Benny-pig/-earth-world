import * as THREE from "three";

// 🔗 分享連結:把「目前在看什麼」存進網址參數,朋友點開就是同一個畫面。
//   c=JP            打開的國家(側欄)        e=1    同時打開該國大百科
//   on=radio,orbit  開著的圖層/面板           off=quake  關掉的預設圖層(地震預設是開的)
//   r=N             台灣路況中心的地區         rc=KR  電台選台展開的國家
//   rail=tra:1000-3300  鐵路時刻(高鐵 thsr / 台鐵 tra)與起訖站
//   v=23.6,121,2.2  地球視角(緯度,經度,距離;沒有打開國家時才帶)
// 不需要帳號、不存任何個人資料,資訊都在網址本身。
const LAYERS = {
  radio: "radio-toggle", typhoon: "satellite-toggle", flights: "flight-toggle", orbit: "orbit-toggle",
  airport: "airport-toggle", traffic: "traffic-toggle",
};
const DEFAULT_ON = new Set(["quake"]);
const pressed = (id) => document.getElementById(id)?.getAttribute("aria-pressed") === "true";

export function createShare({ camera, globeObject, rig, sidePanel, encyclopedia, trafficCenter, radioPanel, railPanel, openCountryByCode }) {
  const btn = document.getElementById("share-btn");

  function viewParam() {
    const inv = globeObject.quaternion.clone().invert();
    const d = camera.position.clone().normalize().applyQuaternion(inv);
    const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI;
    const lon = Math.atan2(-d.z, d.x) * 180 / Math.PI;
    return `${lat.toFixed(1)},${lon.toFixed(1)},${camera.position.length().toFixed(2)}`;
  }

  function buildUrl() {
    const p = new URLSearchParams();
    const code = encyclopedia.code() || sidePanel.code();
    if (code) p.set("c", code);
    if (encyclopedia.code()) p.set("e", "1");
    const on = Object.entries(LAYERS).filter(([, id]) => pressed(id)).map(([k]) => k);
    if (on.length) p.set("on", on.join(","));
    if (!pressed("quake-toggle")) p.set("off", "quake");
    if (pressed("traffic-toggle") && trafficCenter.region()) p.set("r", trafficCenter.region());
    if (pressed("radio-toggle") && radioPanel.expandedCountry()) p.set("rc", radioPanel.expandedCountry());
    const rail = railPanel.state();
    if (rail) p.set("rail", `${rail.mode}:${rail.from}-${rail.to}`);
    if (!code) p.set("v", viewParam());
    const base = location.origin + location.pathname;
    const qs = p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
    return qs ? `${base}?${qs}` : base;
  }

  function describe() {
    const code = encyclopedia.code() || sidePanel.code();
    const name = code ? (window.__earth?.countryLayer?.meshByCode.get(code)?.userData?.names?.zh || code) : "";
    return name ? `地球世界 · ${name}` : "地球世界 · 3D 互動地球";
  }

  function toast(msg) {
    let el = document.getElementById("share-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "share-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  async function share() {
    const url = buildUrl();
    // 手機(觸控)用系統分享選單(LINE、FB…);電腦直接複製到剪貼簿
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      try { await navigator.share({ title: describe(), text: describe(), url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("🔗 已複製分享連結,貼給朋友就能看到同一個畫面");
    } catch {
      window.prompt("複製這個連結分享給朋友:", url);
    }
  }
  if (btn) btn.addEventListener("click", share);
  // 國家側欄、大百科裡的分享鈕(有 data-share 屬性的按鈕)
  document.addEventListener("click", (e) => { if (e.target.closest("[data-share]")) share(); });

  // 開網站時:照網址參數還原畫面,還原完把參數從網址列拿掉(之後讀者自己操作,
  // 網址列才不會一直停在舊的狀態;要分享新的畫面再按一次分享鈕)
  async function applyFromUrl() {
    const p = new URLSearchParams(location.search);
    if (![...p.keys()].length) return;
    const click = (id, want) => { const b = document.getElementById(id); if (b && pressed(id) !== want) b.click(); };
    if ((p.get("off") || "").split(",").includes("quake")) click("quake-toggle", false);
    for (const k of (p.get("on") || "").split(",")) if (LAYERS[k]) click(LAYERS[k], true);
    const r = p.get("r");
    if (r && /^[NCS]$/.test(r) && pressed("traffic-toggle")) trafficCenter.setRegion(r);
    const rc = (p.get("rc") || "").toUpperCase();
    if (/^[A-Z]{2}$/.test(rc) && pressed("radio-toggle")) radioPanel.showCountry(rc);
    const rail = /^(thsr|tra):(\d{4})-(\d{4})$/.exec(p.get("rail") || "");
    if (rail) railPanel.openWith({ mode: rail[1], from: rail[2], to: rail[3] });
    const c = (p.get("c") || "").toUpperCase();
    if (/^[A-Z .]{2,20}$/.test(c) && window.__earth?.countryLayer?.meshByCode.has(c)) {
      openCountryByCode(c);
      if (p.get("e") === "1") encyclopedia.open(c);
    } else {
      const v = (p.get("v") || "").split(",").map(Number);
      if (v.length === 3 && v.every(Number.isFinite)) rig.flyTo(v[0], v[1], { distance: Math.min(6, Math.max(1.35, v[2])), ms: 1200 });
    }
    history.replaceState(null, "", location.pathname);
  }

  return { buildUrl, share, applyFromUrl };
}
