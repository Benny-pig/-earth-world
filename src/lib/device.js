// 地球貼圖一律先用小一號的(assets/lite/,由 tools/build-textures-lite.py 產生),地球很快就出現;
// 電腦在載入完成後再換成 4K。手機、平板或開了「省流量」的裝置(LITE)就維持小張:
// 螢幕小看不出 4K 和 2K 的差別,下載量卻少八成。網址加 ?lite 可以在電腦上測試。
export const LITE = (() => {
  try {
    const s = Math.min(screen.width, screen.height);   // 讀不到螢幕大小(0)時當成一般電腦
    return (s > 0 && s <= 820) || !!navigator.connection?.saveData || new URLSearchParams(location.search).has("lite");
  } catch { return false; }
})();

// 載入畫面結束(地球已經出現)之後才做的事:例如把小張貼圖換成 4K 高畫質。
// 不跟首屏要用的資料搶頻寬;萬一一直沒收到「載入完成」,20 秒後也照做。
export function afterReady(fn, delay = 600) {
  let done = false;
  const go = () => { if (done) return; done = true; setTimeout(fn, delay); };
  if (window.__earthReady) go();
  else { window.addEventListener("earth-ready", go, { once: true }); setTimeout(go, 20000); }
}
