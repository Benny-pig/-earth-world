// 地球世界 · 即時航班 CORS 代理(部署到 Cloudflare Workers)
//
// 為什麼需要這個:大部分免費航班追蹤 API 都不開放瀏覽器直接跨網域 fetch
// (直接開網址沒問題,但網站前端的 JS 會被 CORS 擋)。這支 Worker 純粹是
// 「轉發 + 補上 CORS 標頭」,不做其他事——跟 God's Eye View 用自己的後端
// 代理 OpenSky 是同一個做法。
//
// 為什麼要用 OpenSky 的登入認證、不是匿名存取(2026/09 改版):實測發現
// 匿名/免登入的社群 ADS-B 資料源(adsb.lol、adsb.one、airplanes.live、
// 還有 OpenSky 自己的匿名存取)全都會針對 Cloudflare Workers 的對外 IP
// 特別刁難(擋掉或拖住不回應)——因為 Cloudflare Workers 的對外 IP 是全
// 世界共用的一小批位址,太容易被拿來爬資料,這些網站會針對「匿名雲端
// IP」加強防範。但用「已登入帳號 + OAuth2 金鑰認證」查詢是不同的信任
// 機制(認的是有沒有帶對的金鑰,不是看 IP 名聲),所以改用這個管道。
// adsb.lol 留著當第二順位備援(萬一哪天真的打得到)。
//
// 需要設定的 Cloudflare 環境變數(在 Worker 的 Settings → Variables and
// Secrets 加,類型選 Secret,不要直接寫在這份程式碼裡):
//   OPENSKY_CLIENT_ID      → OpenSky 帳號頁面建立 API client 拿到的 client_id
//   OPENSKY_CLIENT_SECRET  → 同上拿到的 client_secret
// 兩個都沒設的話,會自動退回匿名查詢(能力有限,但至少不會整個掛掉)。
//
// OpenSky 的資料格式(座標範圍框 + 陣列狀態向量)跟 adsb.lol 那系列(座標
// 圓心+半徑 + 物件陣列)完全不同,這支 Worker 會把兩邊都轉換成同一種
// 「{ac:[{lat,lon,...}]}」格式回傳給網站,網站前端不用管背後是哪個來源。
//
// 部署方式(不需要在本機裝 Node/wrangler,直接在 Cloudflare 網站上做):
//   1. 到 https://dash.cloudflare.com 註冊/登入(免費)
//   2. 左側選單 Workers & Pages → Create → Create Worker
//   3. 取個名字(例如 earth-world-flights),按 Deploy 建立一個空白 Worker
//   4. 進去 Worker 的 Edit code(或 Quick edit),把這個檔案的內容整個貼進去、
//      蓋掉預設的範例程式碼,按 Deploy / Save and deploy
//   5. 到 Worker 的 Settings → Variables and Secrets,新增兩個 Secret
//      變數:OPENSKY_CLIENT_ID、OPENSKY_CLIENT_SECRET(值填你從 OpenSky
//      帳號頁面拿到的那兩組),存檔後可能需要重新 Deploy 一次才會生效
//   6. 部署完成後會拿到一個網址,長得像:
//      https://earth-world-flights.<你的帳號>.workers.dev
//
// 已經部署過的話:更新程式碼只要重複第 4 步(進 Edit code、整個蓋掉貼上、
// Deploy),網址不會變,不用重新建立 Worker,Secrets 設定過就會留著。
//
// 2026/09 再加:台灣機場即時航班時刻表(桃園/松山/高雄/台中),資料源是
// 交通部「TDX 運輸資料流通服務」(前身 PTX)——這是政府官方設計給第三方
// 開發者串接用的平台(很多台灣公車動態 App 都接這個),不是防代理的社群
// 網站,不會有像 adsb.lol 那系列刁難 Cloudflare 的問題。一樣是 OAuth2
// 帳號金鑰認證,免費方案每月 4,500 次額度,遠超過我們的用量。
// 需要再設定兩個 Secret 環境變數:
//   TDX_CLIENT_ID / TDX_CLIENT_SECRET → TDX 會員中心建立 API client 拿到的值
//
// 2026/09 再加:向日葵衛星圖片代理。西太平洋衛星雲圖要貼到 3D 地球上(跟
// 大西洋 GOES 一樣)得用 WebGL 材質讀取圖片像素,但向日葵的圖片伺服器沒開
// 放跨網域讀取像素(CORS),只能顯示不能拿來當材質——用這支 Worker 轉發
// 圖片本身、補上 CORS 標頭來解決,跟最上面那段 CORS 代理的原理一樣,只是
// 這次代理的是圖片而不是 JSON。只允許轉發向日葵官方網域的圖片(白名單檢查),
// 不是任意網址都能轉發,避免被拿去當開放代理濫用。
const ALLOWED_IMAGE_HOSTS = ["himawari8.nict.go.jp"];

// 用法(部署好之後,網址後面加這些參數,三種模式互斥):
//   /?lat=23.7&lon=121&radius=250   → 查某個座標半徑內(海浬,最大 250)的所有飛機
//   /?airports=TPE,TSA,KHH,RMQ      → 查這幾個機場代碼的即時進出港航班
//   /?proxyImage=<向日葵圖片網址>    → 轉發圖片本身並補上 CORS 標頭

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const UA = { "User-Agent": "earth-world (educational globe app)" };
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

// Worker 同一個 isolate 可能會處理好幾個請求,把 token 快取在模組層級變數
// 裡,沒過期就不用每次都重新換一次(換 token 是 30 分鐘有效)。
let tokenCache = { token: null, expiresAt: 0 };

async function getOpenSkyToken(env) {
  const id = env?.OPENSKY_CLIENT_ID;
  const secret = env?.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.access_token) return null;
    tokenCache = { token: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in || 1800) - 60) * 1000 };
    return tokenCache.token;
  } catch {
    return null;
  }
}

// OpenSky 用經緯度範圍框(lamin/lomin/lamax/lomax)查詢,不是圓心+半徑,
// 用海浬半徑粗略換算成一個涵蓋範圍差不多大的正方形框(1 海浬≈1/60 緯度度數;
// 經度度數隨緯度變窄,除以 cos(緯度) 修正)。
function fetchOpenSky(lat, lon, radiusNm, token) {
  const latDelta = radiusNm / 60;
  const lonDelta = radiusNm / 60 / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const qs = new URLSearchParams({
    lamin: (lat - latDelta).toFixed(4),
    lamax: (lat + latDelta).toFixed(4),
    lomin: (lon - lonDelta).toFixed(4),
    lomax: (lon + lonDelta).toFixed(4),
  });
  const headers = token ? { ...UA, Authorization: `Bearer ${token}` } : UA;
  return fetch(`https://opensky-network.org/api/states/all?${qs}`, {
    headers,
    cf: { cacheTtl: 15, cacheEverything: true },
    signal: AbortSignal.timeout(9000),
  }).then(async (res) => {
    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    const states = Array.isArray(json.states) ? json.states : [];
    // 狀態向量欄位順序(OpenSky 官方文件):
    // [0]icao24 [1]callsign [5]經度 [6]緯度 [7]氣壓高度(公尺) [9]地速(公尺/秒) [10]真航向
    const ac = states
      .filter((s) => typeof s[5] === "number" && typeof s[6] === "number")
      .map((s) => ({
        hex: s[0],
        flight: (s[1] || "").trim(),
        lon: s[5],
        lat: s[6],
        alt_baro: typeof s[7] === "number" ? Math.round(s[7] * 3.28084) : null,
        gs: typeof s[9] === "number" ? s[9] * 1.94384 : null,
        true_heading: s[10] ?? 0,
        t: "",
      }));
    return { ok: true, body: JSON.stringify({ ac }) };
  });
}

// adsb.lol 系列(v2 point API)本來就是我們要的 {ac:[...]} 格式,直接轉發。
function fetchPointApi(base, lat, lon, radiusNm) {
  return fetch(`${base}/${lat}/${lon}/${radiusNm}`, {
    headers: UA,
    cf: { cacheTtl: 15, cacheEverything: true },
    signal: AbortSignal.timeout(9000),
  }).then(async (res) => {
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.text() };
  });
}

const TDX_TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
let tdxTokenCache = { token: null, expiresAt: 0 };

// 回傳 {token, reason} 而不是單純 null——診斷「到底是沒設變數、還是金鑰被
// 拒絕、還是連不到」用,不然出錯只看得到一個 401,猜不出是哪一種情況。
async function getTdxToken(env) {
  const id = env?.TDX_CLIENT_ID;
  const secret = env?.TDX_CLIENT_SECRET;
  if (!id || !secret) return { token: null, reason: "缺少 TDX_CLIENT_ID 或 TDX_CLIENT_SECRET 環境變數" };
  if (tdxTokenCache.token && Date.now() < tdxTokenCache.expiresAt) return { token: tdxTokenCache.token, reason: null };

  try {
    const res = await fetch(TDX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { token: null, reason: `TDX 換 token 失敗,狀態碼 ${res.status}(可能是 Client ID/Secret 不正確)` };
    const json = await res.json();
    if (!json.access_token) return { token: null, reason: "TDX 回應沒有 access_token" };
    // token 有效期通常 86400 秒(1 天),提前 5 分鐘視為過期,避免卡在邊界。
    tdxTokenCache = { token: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in || 86400) - 300) * 1000 };
    return { token: tdxTokenCache.token, reason: null };
  } catch (e) {
    return { token: null, reason: `連不到 TDX 認證伺服器:${String(e)}` };
  }
}

// 一次用 $filter 把好幾個機場代碼都查在同一次呼叫裡,不用每個機場各打一次,
// 大幅省下每月額度(4 個機場一次查完只算 1 次,不是 4 次)。
async function fetchAirportFids(env, iataList) {
  const { token, reason } = await getTdxToken(env);
  if (!token) return { ok: false, status: 401, detail: reason };

  const filter = iataList.map((c) => `AirportID eq '${c}'`).join(" or ");
  const qs = `%24format=JSON&%24filter=${encodeURIComponent(filter)}`;
  try {
    const res = await fetch(`https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport?${qs}`, {
      headers: { ...UA, Authorization: `Bearer ${token}` },
      cf: { cacheTtl: 120, cacheEverything: true },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    const airports = {};
    for (const a of Array.isArray(json) ? json : []) {
      airports[a.AirportID] = { departure: a.FIDSDeparture || [], arrival: a.FIDSArrival || [] };
    }
    return { ok: true, body: JSON.stringify({ airports }) };
  } catch (e) {
    return { ok: false, status: 0, detail: String(e) };
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    const proxyImage = url.searchParams.get("proxyImage");
    if (proxyImage) {
      let target;
      try {
        target = new URL(proxyImage);
      } catch {
        return new Response("圖片網址格式錯誤", { status: 400, headers: CORS_HEADERS });
      }
      if (!ALLOWED_IMAGE_HOSTS.includes(target.hostname)) {
        return new Response("不允許代理這個網域的圖片", { status: 403, headers: CORS_HEADERS });
      }
      try {
        const upstream = await fetch(target.toString(), {
          headers: UA,
          cf: { cacheTtl: 300, cacheEverything: true },
          signal: AbortSignal.timeout(9000),
        });
        const body = await upstream.arrayBuffer();
        return new Response(body, {
          status: upstream.status,
          headers: { ...CORS_HEADERS, "Content-Type": upstream.headers.get("content-type") || "image/png" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "圖片代理失敗", detail: String(e) }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    const airportsParam = url.searchParams.get("airports");
    if (airportsParam) {
      const list = airportsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
      const result = await fetchAirportFids(env, list);
      if (result.ok) {
        return new Response(result.body, { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "機場航班資料暫時查不到,稍後會自動重試", status: result.status, detail: result.detail }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const radius = Math.min(250, parseFloat(url.searchParams.get("radius")) || 200);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: "缺少或錯誤的 lat/lon 參數" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = await getOpenSkyToken(env);

    // 兩個來源同時打(不是打完一個再打下一個),取先成功的那個——避免兩邊
    // 都要等到逾時的話,使用者要等 9+9=18 秒,同時打最久也只要等 9 秒。
    const settled = await Promise.allSettled([
      fetchOpenSky(lat, lon, radius, token),
      fetchPointApi("https://api.adsb.lol/v2/point", lat, lon, radius),
    ]);

    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.ok) {
        return new Response(s.value.body, {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    let lastStatus = null;
    let lastDetail = null;
    for (const s of settled) {
      if (s.status === "fulfilled") lastStatus = s.value.status;
      else lastDetail = String(s.reason);
    }

    return new Response(JSON.stringify({
      error: "所有航班資料來源目前都連不到或忙線中,稍後會自動重試",
      lastStatus,
      detail: lastDetail,
      authenticated: !!token,
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
