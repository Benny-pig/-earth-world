// 地球上的文字標籤(國名、海洋、地形、地震、電台…)共用的位置更新。
// 1. 位置/透明度有變才寫進 DOM(每一格重寫幾百個標籤,瀏覽器每格都要重算樣式)
// 2. 藏起來用 display:none,不要只是移到畫面外:標籤都有 will-change 會各自佔一個合成圖層,
//    移到畫面外還是佔著——三百多個圖層每格都要更新,轉地球會卡;真的拿掉只剩看得到的幾十個
export function placeLabel(el, x, y, opacity, extra = "") {
  const t = `translate(${Math.round(x)}px, ${Math.round(y)}px)${extra}`;
  if (el._hidden !== false) { el.style.display = ""; el._hidden = false; }
  if (el._t !== t) { el.style.transform = t; el._t = t; }
  if (el._o !== opacity) { el.style.opacity = opacity; el._o = opacity; }
}

export function hideLabel(el) {
  if (el._hidden === true) return;
  el.style.display = "none";
  el._hidden = true;
}

// 拖曳地球的時候(主程式設定):標籤少畫一點、滑過偵測先停,手感比較順
export const drag = { active: false };
