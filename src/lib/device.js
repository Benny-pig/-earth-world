// 手機、平板或開了「省流量」的裝置:改用小一號的貼圖(assets/lite/,由 tools/build-textures-lite.py 產生)。
// 螢幕小看不出 4K 和 2K 的差別,下載量卻少八成,第一次打開等待時間明顯縮短。網址加 ?lite 可以在電腦上測試。
export const LITE = (() => {
  try {
    const s = Math.min(screen.width, screen.height);   // 讀不到螢幕大小(0)時當成一般電腦
    return (s > 0 && s <= 820) || !!navigator.connection?.saveData || new URLSearchParams(location.search).has("lite");
  } catch { return false; }
})();

export const texUrl = (full, lite) => (LITE ? `assets/lite/${lite}` : `assets/${full}`);
