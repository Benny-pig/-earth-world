// 📱 安裝成 App(PWA):註冊 Service Worker(離線快取,見 sw.js),並在右上角顯示
// 「📲 安裝 App」:Android/電腦 Chrome、Edge 可以一鍵安裝;iPhone Safari 沒有一鍵安裝,
// 改顯示「分享 → 加入主畫面」的步驟。已經是從主畫面打開(App 模式)就不顯示。
export function setupPwa() {
  const btn = document.getElementById("install-btn");
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("[pwa] Service Worker 註冊失敗:", e));
  }
  if (!btn || standalone) return;

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();          // 不要讓瀏覽器自己跳,改由我們的按鈕觸發
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener("appinstalled", () => { btn.hidden = true; deferred = null; });

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) btn.hidden = false;

  btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
      if (outcome === "accepted") btn.hidden = true;
      deferred = null;
      return;
    }
    if (ios) {
      let tip = document.getElementById("install-ios");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "install-ios";
        tip.innerHTML = `📲 <b>把地球世界加到主畫面</b><br>` +
          `1. 用 <b>Safari</b> 開這個網站<br>2. 點下方的「分享」按鈕 <b>⬆︎</b><br>3. 往下找「<b>加入主畫面</b>」→ 右上角「新增」<br>` +
          `之後從主畫面點開,就像 App 一樣全螢幕使用 🌏<br><button type="button">知道了</button>`;
        tip.querySelector("button").addEventListener("click", () => tip.remove());
        document.body.appendChild(tip);
      }
    }
  });
}
