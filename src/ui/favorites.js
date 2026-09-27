import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";
import { isEn } from "../lib/i18n.js";

// ⭐ 我的收藏:讀者自己按「☆ 收藏」才會記下來(國家、目前畫面、景點直播、廣播電台),
// 點一下就回到那裡;每一筆都可以單獨刪除。只存在這台瀏覽器(localStorage),不需要帳號。
const KEY = "earth-world.favorites";
const GROUPS = [["view", "📌 畫面"], ["country", "🌍 國家"], ["cam", "📺 景點直播"], ["radio", "📻 廣播電台"]];

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(d) ? d.filter((x) => x && x.type && x.key) : [];
  } catch { return []; }
}

export function createFavorites({ onGo, describeView, onClose }) {
  let items = load();
  const listeners = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* 存不了就算了 */ } };
  const changed = () => { save(); render(); for (const fn of listeners) fn(); };

  const find = (type, key) => items.find((x) => x.type === type && x.key === key);
  function add(type, key, { name, icon = "", data = null }) {
    if (find(type, key)) return;
    items.unshift({ id: `${type}:${key}:${Date.now().toString(36)}`, type, key, name, icon, data, t: Date.now() });
    changed();
    toast(`⭐ 已加入收藏:${name}`);
  }
  function remove(id) { items = items.filter((x) => x.id !== id); changed(); }
  function toggle(type, key, info) {
    const hit = find(type, key);
    if (hit) remove(hit.id); else add(type, key, info);
  }

  // 其他地方的「☆ 收藏」按鈕共用的畫法
  function starButton(type, key, cls = "") {
    const on = !!find(type, key);
    return `<button type="button" class="fav-star${on ? " on" : ""} ${cls}" data-fav-type="${esc(type)}" data-fav-key="${esc(key)}" ` +
      `title="${on ? "已收藏,再按一下取消" : "加入我的收藏"}">${on ? "★ 已收藏" : "☆ 收藏"}</button>`;
  }

  function toast(msg) {
    let el = document.getElementById("share-toast");
    if (!el) { el = document.createElement("div"); el.id = "share-toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2000);
  }

  // ---------- 面板 ----------
  const btn = document.getElementById("fav-btn");
  const panel = document.getElementById("fav-panel");
  const body = document.getElementById("fav-body");
  if (panel) makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });
  let open = false;

  function render() {
    const label = isEn ? "⭐ Saved" : "⭐ 收藏";
    if (btn) btn.textContent = items.length ? `${label} ${items.length}` : label;
    if (!body || !open) return;
    const fmt = new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" });
    body.innerHTML =
      `<button type="button" class="tc-btn fav-add" data-act="add-view">＋ 收藏目前畫面</button>` +
      `<div class="fav-hint">國家介紹、景點直播、廣播電台旁邊按「☆ 收藏」也會記在這裡</div>` +
      (items.length ? GROUPS.map(([type, label]) => {
        const list = items.filter((x) => x.type === type);
        if (!list.length) return "";
        return `<div class="fav-h">${label}<small>${list.length}</small></div>` + list.map((x) =>
          `<div class="fav-row"><button type="button" class="fav-go" data-id="${esc(x.id)}">` +
          `<span class="fav-ico">${esc(x.icon || "⭐")}</span><span class="fav-name">${esc(x.name)}</span>` +
          `<span class="fav-date">${fmt.format(new Date(x.t))}</span></button>` +
          `<button type="button" class="fav-del" data-del="${esc(x.id)}" title="刪除這一筆" aria-label="刪除 ${esc(x.name)}">🗑</button></div>`).join("");
      }).join("") : `<div class="ap-empty">還沒有收藏。<br>先轉到喜歡的地方,按上面的「＋ 收藏目前畫面」試試看!</div>`) +
      `<div class="sat-caption">收藏只存在這台裝置的瀏覽器裡,不會上傳;清除瀏覽器資料會一起清掉。</div>`;
  }

  body?.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) { remove(del.dataset.del); return; }
    const go = e.target.closest(".fav-go");
    if (go) { const it = items.find((x) => x.id === go.dataset.id); if (it) onGo(it); return; }
    if (e.target.closest("[data-act=add-view]")) {
      const v = describeView();
      if (v) add("view", v.qs, { name: v.name, icon: "📌", data: v.qs });
    }
  });
  // 其他面板裡的 ☆ 收藏(用事件委派,面板重畫也不用重新綁)
  document.addEventListener("click", (e) => {
    const star = e.target.closest("[data-fav-type]");
    if (!star || !star.dataset.favKey) return;
    const info = starInfo.get(star.dataset.favType)?.(star.dataset.favKey);
    if (!info) return;
    toggle(star.dataset.favType, star.dataset.favKey, info);
    const on = !!find(star.dataset.favType, star.dataset.favKey);
    star.classList.toggle("on", on);
    star.textContent = on ? "★ 已收藏" : "☆ 收藏";
    star.title = on ? "已收藏,再按一下取消" : "加入我的收藏";
  });
  // 各類收藏的名稱/資料由擁有它的模組提供
  const starInfo = new Map();

  function setOpen(v) {
    open = !!v;
    if (panel) panel.hidden = !open;
    if (btn) btn.setAttribute("aria-pressed", String(open));
    render();
  }
  btn?.addEventListener("click", () => setOpen(!open));
  document.getElementById("fav-close")?.addEventListener("click", () => { setOpen(false); onClose && onClose(); });
  render();

  return {
    has: (type, key) => !!find(type, key),
    toggle, add, remove, starButton, setOpen, isOpen: () => open,
    list: () => items.slice(),
    provide(type, fn) { starInfo.set(type, fn); },
    onChange(fn) { listeners.add(fn); },
  };
}
