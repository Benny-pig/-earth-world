// 畫布在畫面上的位置與大小(文字標籤圖層把 3D 座標換成螢幕座標時用)。
// 以前每個標籤圖層每一格都呼叫 getBoundingClientRect(),而前一個圖層剛改完標籤位置,
// 瀏覽器只好在同一格裡重新排版好幾次——手機上轉地球會卡。畫布大小只有視窗改變時才會變,
// 所以記下來,視窗大小改變(含手機轉向、網址列收合)時才重新量一次。
let cached = null;
const reset = () => { cached = null; };
window.addEventListener("resize", reset);
window.addEventListener("orientationchange", reset);
window.visualViewport?.addEventListener("resize", reset);

export function canvasRect(el) {
  if (!cached) {
    const r = el.getBoundingClientRect();
    cached = { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return cached;
}
