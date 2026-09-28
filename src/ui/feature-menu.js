// 🎛️ 功能選單分頁:四十幾個功能原本排成一長串要一直捲,改成「即時世界/太空天象/探索遊戲/聲音」四個分頁,
// 每頁是一格一格的圖示。分頁標籤上的小數字 = 這一頁有幾個功能開著,切到別頁也知道哪裡還開著東西。
// 記住上次看的分頁;從搜尋或設定打開某個功能時,自動切到那個功能所在的分頁。
const KEY = "earth-world.lc-tab";

export function createFeatureMenu() {
  const root = document.getElementById("lc-body");
  if (!root) return { reveal() {} };
  const tabs = [...root.querySelectorAll(".lc-tab")];
  const panes = [...root.querySelectorAll(".lc-pane")];
  if (!tabs.length || !panes.length) return { reveal() {} };

  function select(cat, { save = true } = {}) {
    if (!panes.some((p) => p.dataset.cat === cat)) cat = panes[0].dataset.cat;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.cat === cat));
    for (const p of panes) p.hidden = p.dataset.cat !== cat;
    if (save) try { localStorage.setItem(KEY, cat); } catch { /* 存不了就算了 */ }
  }
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* 讀不到就用第一頁 */ }
  select(saved || panes[0].dataset.cat, { save: false });

  for (const t of tabs) t.addEventListener("click", () => select(t.dataset.cat));
  // 左右方向鍵切換分頁(鍵盤操作)
  root.querySelector(".lc-tabs")?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    select(next.dataset.cat);
    next.focus();
    e.preventDefault();
  });

  // 分頁上的「開著幾個」小數字
  function counts() {
    for (const t of tabs) {
      const pane = panes.find((p) => p.dataset.cat === t.dataset.cat);
      const n = pane ? pane.querySelectorAll('.layer-row[aria-pressed="true"]').length : 0;
      const b = t.querySelector(".lc-tab-n");
      if (!b) continue;
      b.hidden = !n;
      b.textContent = n;
      t.title = n ? `${t.textContent.replace(/\d+$/, "").trim()}:開著 ${n} 個` : "";
    }
  }
  new MutationObserver(counts).observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
  counts();

  // 從搜尋、設定等其他地方按下(程式觸發的 click)某個功能:切到它所在的分頁,看得到它亮起來
  function reveal(id) {
    const row = document.getElementById(id);
    const pane = row?.closest(".lc-pane");
    if (pane && pane.hidden) select(pane.dataset.cat);
  }
  root.addEventListener("click", (e) => {
    const row = e.target.closest(".layer-row");
    if (row?.id) reveal(row.id);
  });

  return { reveal, select };
}
