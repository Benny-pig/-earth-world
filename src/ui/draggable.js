// 讓浮動面板可以用標題列拖曳移動位置(不是縮放大小,縮放另外靠 CSS 的
// resize:both 處理)。原本面板都是 position:fixed 用 top/left 或 top/right
// 寫死位置,拖曳開始時先換算成目前實際的 left/top 像素值再接手,不會一拖
// 就跳位置。點到標題列裡的按鈕(關閉/更新)不要觸發拖曳,不然會搶走按鈕
// 的點擊。
//
// 移動/放開的監聽器掛在 document 上(不是掛在標題列本身)——拖曳過程中
// 滑鼠很快就會移出這條窄窄的標題列範圍,掛在 document 上才能一路追蹤到
// 放開為止,不會拖到一半就斷掉。
export function makeDraggable(panel, handle) {
  if (!panel || !handle) return;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function onMove(e) {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const maxLeft = Math.max(0, window.innerWidth - 60);
    const maxTop = Math.max(0, window.innerHeight - 40);
    panel.style.left = `${Math.min(Math.max(0, startLeft + dx), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(0, startTop + dy), maxTop)}px`;
  }
  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  }
  function onDown(e) {
    if (e.target.closest("button, a, select, input")) return;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;
    // 手機版有的面板是左右貼邊(left+right、width:auto)撐開寬度,改成只用 left 定位
    // 之後寬度會縮成內容寬,先把目前寬度固定下來
    panel.style.width = getComputedStyle(panel).width;   // 內容寬(不含 padding),避免每拖一次就變寬
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    e.preventDefault();
  }

  handle.style.cursor = "move";
  handle.addEventListener("pointerdown", onDown);
}
