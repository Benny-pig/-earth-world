// 地球世界 Service Worker:讓網站可以「安裝」成 App、載入更快,離線時也看得到上次的畫面。
//
// 快取原則(重點:網站更新後讀者要馬上拿到新版,不能被舊快取卡住):
//   - 網頁、資料(同網域的 html/json):先抓網路上的最新版,網路不通才用快取
//   - 程式(src/*.js,部署時打包成 dist/*.js):照「程式版本號」分開快取。版本號寫在 index.html 的 <meta name="app-version">
//     (tools/build-preload.py 依程式內容算出來,程式一改就變)。版本沒變 → 直接用快取,
//     不用八十幾個檔案一個一個跟伺服器確認;版本變了 → 全部重新下載,不會新舊檔混在一起。
//     本機開發(localhost)不用這個快取,改了程式重新整理就看得到。
//   - 大張貼圖、圖片、音樂、圖示(assets/):先用快取、背景順便更新(這些很少變,又很大)
//   - 外部函式庫(jsDelivr 上的 three.js 等,網址本身帶版本號):快取優先
//   - 即時資料(Worker、TDX、維基、衛星、地震…其他網域):完全不快取,永遠抓最新
const VERSION = "v3";
const CACHE = `earth-world-${VERSION}`;
const CODE = "earth-world-code-";
const IS_DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);
let codeVersion = null;    // 目前網頁的程式版本號
let versionReady = null;   // 正在從剛載入的網頁讀版本號
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./assets/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("earth-world-") && k !== CACHE && !k.startsWith(CODE)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // cache: "no-cache" = 每次都跟伺服器確認有沒有新版(沒變只回 304,很快),
    // 不然瀏覽器自己的 HTTP 快取(GitHub Pages 給 10 分鐘)會拿到舊檔、甚至新舊檔混在一起。
    // 換頁請求(navigate)不能帶參數重建,改用網址重新發一個
    const net = req.mode === "navigate"
      ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" })
      : new Request(req, { cache: "no-cache" });
    const res = await fetch(net);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    throw new Error("offline");
  }
}

// 從網頁讀出程式版本號,記下來(Service Worker 重新啟動也找得回來),舊版本的程式快取刪掉
async function readVersion(res) {
  try {
    const m = (await res.text()).match(/<meta name="app-version" content="([\w.-]+)">/);
    const meta = await caches.open(CACHE);
    if (!m) { codeVersion = null; await meta.delete("./__app-version"); return; }
    if (m[1] === codeVersion) return;
    codeVersion = m[1];
    await meta.put("./__app-version", new Response(codeVersion));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CODE) && k !== CODE + codeVersion).map((k) => caches.delete(k)));
  } catch { /* 讀不到版本號就照舊(網路優先) */ }
}

async function navigate(req) {
  const res = await networkFirst(req);
  if (!IS_DEV) versionReady = readVersion(res.clone());
  return res;
}

async function codeByVersion(req) {
  if (versionReady) await versionReady;
  if (!codeVersion) {
    const saved = await (await caches.open(CACHE)).match("./__app-version");
    if (saved) codeVersion = await saved.text();
  }
  if (!codeVersion) return networkFirst(req);
  const cache = await caches.open(CODE + codeVersion);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(new Request(req, { cache: "no-cache" }));
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // 音樂檔很大、而且會用 Range 分段抓,不經過快取
    if (req.headers.has("range")) return;
    if (url.pathname.includes("/assets/")) { e.respondWith(staleWhileRevalidate(req)); return; }
    if (req.mode === "navigate") { e.respondWith(navigate(req)); return; }
    // 程式:開發版是 src/,部署時打包成 dist/(兩種都照版本號快取)
    if (!IS_DEV && (url.pathname.includes("/src/") || url.pathname.includes("/dist/")) && url.pathname.endsWith(".js")) { e.respondWith(codeByVersion(req)); return; }
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
  // 其他網域(即時資料)不處理,瀏覽器照常直接連線
});
