import { esc } from "../lib/esc.js";

// 🗂️ 面板管家:三十幾個功能面板預設都開在同一個位置(電腦在左上、手機是底部整條),同時開兩個以上會互相蓋住。
//   1. 面板分頁:同一區開了兩個以上的面板時,只顯示最新的那個,其他的收到旁邊一排小分頁(電腦在面板右側直排、
//      手機在面板上方橫排),點分頁就切換。被收起來的面板只是不顯示,它在地球上的圖層(風場、板塊…)照樣開著。
//   2. 手機返回鍵:有面板開著時按「返回」,先關掉最上面那個(大百科、國家介紹、面板、特別視角、電影巡航…),
//      全部關完才真的離開網站。做法:有東西開著時在瀏覽紀錄裡放一個「墊子」,按返回只會吃掉墊子。
//   3. 在選單上按一個「開著、但被收到分頁裡」的功能:拿到最前面,不會直接把它關掉。
const PANEL_SEL = "body > [id$='-panel']";
// 選單按鈕 → 面板(大部分是同名,少數不同)
const TOGGLE_PANEL = { "sunpanel-toggle": "sun-panel", "timemachine-toggle": "time-panel", "thsr-toggle": "rail-panel", "tra-toggle": "rail-panel" };

export function createPanelManager() {
  const panels = [...document.querySelectorAll(PANEL_SEL)].filter((el) => el.id !== "side-panel");
  const side = document.getElementById("side-panel");
  const enc = document.getElementById("encyclopedia");
  const strip = document.createElement("div");
  strip.id = "panel-tabs";
  strip.hidden = true;
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-label", "開著的面板");
  document.body.appendChild(strip);

  let order = [];          // 開著的東西(面板 id、"side-panel"、"encyclopedia"),最新的在最後
  const group = new Set(); // 會排成分頁的面板
  let front = null;
  const isPhone = () => window.innerWidth <= 640;
  const isOpen = (id) => {
    if (id === "side-panel") return side?.classList.contains("open");
    if (id === "encyclopedia") return enc?.classList.contains("open");
    const el = document.getElementById(id);
    return !!el && !el.hidden;
  };
  // 打開的當下在「預設位置」的面板才排進分頁(讀者自己拖到別的地方的就不管它)
  function inGroup(el) {
    const r = el.getBoundingClientRect();
    if (!r.width) return false;
    if (isPhone()) return r.width >= window.innerWidth - 40 || (r.left <= 40 && r.top <= 260);
    return r.left <= 40 && r.top <= 260;
  }
  const titleOf = (id) => document.getElementById(id)?.querySelector(".sat-title")?.textContent.trim() || id;
  const iconOf = (t) => (t.match(/^\p{Extended_Pictographic}️?/u) || ["📄"])[0];
  const shortOf = (t) => { const s = t.replace(/^\p{Extended_Pictographic}️?\s*/u, "").split(/[··]/)[0].trim(); return s.length > 6 ? s.slice(0, 6) + "…" : s; };

  function apply() {
    for (const id of group) document.getElementById(id)?.classList.toggle("pm-bg", id !== front);
    renderTabs();
  }
  function bringToFront(id) {
    if (!group.has(id)) return;
    front = id;
    order = order.filter((x) => x !== id).concat(id);
    apply();
  }

  function sync() {
    const all = [...panels.map((el) => el.id), "side-panel", "encyclopedia"];
    for (const id of all) {
      if (isOpen(id) && !order.includes(id)) {
        order.push(id);
        const el = document.getElementById(id);
        if (el && id !== "side-panel" && id !== "encyclopedia") {
          el.classList.remove("pm-bg");
          if (inGroup(el)) { group.add(id); front = id; }
        }
      }
    }
    order = order.filter(isOpen);
    for (const id of [...group]) if (!order.includes(id)) { group.delete(id); document.getElementById(id)?.classList.remove("pm-bg"); }
    if (!group.has(front)) front = [...order].reverse().find((id) => group.has(id)) || null;
    apply();
    syncGuard();
  }

  // ---------- 分頁 ----------
  function renderTabs() {
    const ids = [...group];   // 依打開的先後排,切換分頁時位置不會跳來跳去
    strip.hidden = ids.length < 2;
    strip.classList.toggle("pm-phone", isPhone());
    if (strip.hidden) return;
    strip.innerHTML = ids.map((id) => {
      const t = titleOf(id);
      return `<button type="button" role="tab" class="pm-tab${id === front ? " on" : ""}" data-id="${id}" aria-selected="${id === front}" title="${esc(t)}">` +
        `<span>${iconOf(t)}</span><small>${esc(shortOf(t))}</small></button>`;
    }).join("");
    place();
  }
  function place() {
    const el = front && document.getElementById(front);
    if (!el || strip.hidden) return;
    const r = el.getBoundingClientRect();
    if (isPhone()) {
      strip.style.left = "8px";
      strip.style.top = `${Math.max(60, r.top - 44)}px`;
    } else {
      strip.style.left = `${Math.round(r.right + 8)}px`;
      strip.style.top = `${Math.round(r.top)}px`;
    }
  }
  strip.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (b) bringToFront(b.dataset.id);
  });
  // 面板會被拖動、收合、改變高度:分頁開著時定期對齊
  setInterval(() => { if (!strip.hidden) place(); }, 300);
  window.addEventListener("resize", () => renderTabs());
  // 其他功能要求把自己的面板拿到最前面(例如「🧳 出國小幫手」換國家)
  document.addEventListener("panel:front", (e) => bringToFront(e.target.id));

  // 選單上按「開著、但收在分頁裡」的功能:拿到最前面,不要直接關掉
  document.getElementById("ctrl-dock")?.addEventListener("click", (e) => {
    const row = e.target.closest(".layer-row[id]");
    if (!row || row.getAttribute("aria-pressed") !== "true") return;
    const pid = TOGGLE_PANEL[row.id] || row.id.replace(/-toggle$/, "-panel");
    if (!group.has(pid) || pid === front) return;
    e.stopPropagation();
    e.preventDefault();
    bringToFront(pid);
    if (isPhone()) for (const t of ["twc-collapse-toggle", "lc-collapse-toggle"]) {
      const b = document.getElementById(t);
      if (b?.getAttribute("aria-expanded") === "true") b.click();
    }
  }, true);

  // ---------- 返回鍵 ----------
  const extras = [
    { open: () => !!document.getElementById("tc-card-modal"), close: () => document.getElementById("tc-card-modal")?.remove() },
    { open: () => document.getElementById("surprise-card")?.hidden === false, close: () => { document.getElementById("surprise-card").hidden = true; } },
    { open: () => document.getElementById("settings-pop")?.hidden === false, close: () => document.getElementById("settings-btn")?.click() },
    { open: () => document.body.classList.contains("pov"), close: () => document.querySelector("#pov-hud [data-act=exit]")?.click() },
    { open: () => document.body.classList.contains("cinema"), close: () => window.__earth?.cinema?.stop?.() },
  ];
  function closeId(id) {
    if (id === "side-panel") { side?.querySelector(".close")?.click(); return; }
    if (id === "encyclopedia") { enc?.querySelector(".enc-close")?.click(); return; }
    const el = document.getElementById(id);
    if (!el) return;
    const base = id.replace(/-panel$/, "");
    const btn = document.getElementById(`${base}-close`) || document.getElementById(`${id}-close`) || el.querySelector(".sat-head [id$='-close']");
    if (btn) btn.click(); else el.hidden = true;
  }
  function closeTop() {
    const x = extras.find((e) => e.open());
    if (x) { x.close(); return; }
    // 依打開的順序往回關;最後打開的是分頁裡的面板,就關正在看的那一個
    const last = order[order.length - 1];
    const id = group.has(last) ? front : last;
    if (id) closeId(id);
  }
  const anyOpen = () => order.length > 0 || extras.some((e) => e.open());
  let guard = false, ignore = 0;
  function syncGuard() {
    if (anyOpen() && !guard) {
      try { history.pushState({ ewPanel: 1 }, ""); guard = true; } catch { /* 有些環境不允許 */ }
    } else if (!anyOpen() && guard) {
      // 讀者自己按 × 關光了:把墊子拿掉,下次按返回才會正常離開
      guard = false;
      ignore++;
      history.back();
    }
  }
  window.addEventListener("popstate", () => {
    if (ignore > 0) { ignore--; return; }
    if (!guard) return;
    guard = false;
    closeTop();
    setTimeout(sync, 50);
  });

  // ---------- 監看面板開關 ----------
  const mo = new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(sync, 30); });
  for (const el of panels) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
  if (side) mo.observe(side, { attributes: true, attributeFilter: ["class"] });
  if (enc) mo.observe(enc, { attributes: true, attributeFilter: ["class"] });
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"], childList: true });
  for (const id of ["surprise-card", "settings-pop"]) { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] }); }
  sync();

  return { bringToFront, closeTop, openList: () => order.slice() };
}
