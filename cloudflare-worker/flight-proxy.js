// 地球世界 · 即時航班 CORS 代理(部署到 Cloudflare Workers)
//
// 為什麼需要這個:大部分免費航班追蹤 API 都不開放瀏覽器直接跨網域 fetch
// (直接開網址沒問題,但網站前端的 JS 會被 CORS 擋)。這支 Worker 純粹是
// 「轉發 + 補上 CORS 標頭」,不碰任何金鑰、不做其他事——跟 God's Eye View
// 用自己的後端代理 OpenSky 是同一個做法。
//
// 為什麼主要資料源是 OpenSky、不是 adsb.lol(2026/09 改版):實測發現社群
// ADS-B 資料源(adsb.lol / adsb.one / airplanes.live,同一套 readsb/tar1090
// 系列開源軟體)全都會擋掉 Cloudflare Workers 的對外 IP(不是我們自己打太
// 多次——直接從瀏覽器或其他伺服器打都正常,推測是這些社群網站專門防範
// 雲端/機房代理式的爬取)。OpenSky Network 是有正式 API 文件、設計給第三方
// 串接用的學術機構服務(免登入每天 400 次額度),實測不會擋雲端 IP,穩定
// 很多。缺點是免費額度沒有機型/註冊號資料、且每天有次數上限——所以還是
// 把 adsb.lol 留著當第二順位,OpenSky 打不到時試試看能不能撿到。
//
// OpenSky 的資料格式(座標範圍框 + 陣列狀態向量)跟 adsb.lol 那系列(座標
// 圓心+半徑 + 物件陣列)完全不同,所以這支 Worker 會把兩邊都轉換成同一種
// 「{ac:[{lat,lon,...}]}」格式回傳給網站,網站前端不用管背後是哪個來源。
//
// 部署方式(不需要在本機裝 Node/wrangler,直接在 Cloudflare 網站上做):
//   1. 到 https://dash.cloudflare.com 註冊/登入(免費)
//   2. 左側選單 Workers & Pages → Create → Create Worker
//   3. 取個名字(例如 earth-world-flights),按 Deploy 建立一個空白 Worker
//   4. 進去 Worker 的 Edit code(或 Quick edit),把這個檔案的內容整個貼進去、
//      蓋掉預設的範例程式碼
//   5. 按 Deploy / Save and deploy
//   6. 部署完成後會拿到一個網址,長得像:
//      https://earth-world-flights.<你的帳號>.workers.dev
//      把這個網址告訴我,我會把它接進網站的航班功能裡。
//
// 已經部署過的話:更新程式碼只要重複第 4~5 步(進 Edit code、整個蓋掉貼上、
// Deploy),網址不會變,不用重新建立 Worker。
//
// 用法(部署好之後,網址後面加這些參數):
//   /?lat=23.7&lon=121&radius=250   → 查某個座標半徑內(海浬,最大 250)的所有飛機

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const UA = { "User-Agent": "earth-world (educational globe app)" };

// OpenSky 用經緯度範圍框(lamin/lomin/lamax/lomax)查詢,不是圓心+半徑,
// 用海浬半徑粗略換算成一個涵蓋範圍差不多大的正方形框(1 海浬≈1/60 緯度度數;
// 經度度數隨緯度變窄,除以 cos(緯度) 修正)。
function fetchOpenSky(lat, lon, radiusNm) {
  const latDelta = radiusNm / 60;
  const lonDelta = radiusNm / 60 / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const qs = new URLSearchParams({
    lamin: (lat - latDelta).toFixed(4),
    lamax: (lat + latDelta).toFixed(4),
    lomin: (lon - lonDelta).toFixed(4),
    lomax: (lon + lonDelta).toFixed(4),
  });
  return fetch(`https://opensky-network.org/api/states/all?${qs}`, {
    headers: UA,
    cf: { cacheTtl: 15, cacheEverything: true },
    signal: AbortSignal.timeout(6000),
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
    signal: AbortSignal.timeout(6000),
  }).then(async (res) => {
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.text() };
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const radius = Math.min(250, parseFloat(url.searchParams.get("radius")) || 200);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: "缺少或錯誤的 lat/lon 參數" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const attempts = [
      () => fetchOpenSky(lat, lon, radius),
      () => fetchPointApi("https://api.adsb.lol/v2/point", lat, lon, radius),
    ];

    let lastStatus = null;
    let lastDetail = null;
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        if (result.ok) {
          return new Response(result.body, {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        lastStatus = result.status;
      } catch (e) {
        lastStatus = 0;
        lastDetail = String(e);
      }
    }

    return new Response(JSON.stringify({
      error: "所有航班資料來源目前都連不到或忙線中,稍後會自動重試",
      lastStatus,
      detail: lastDetail,
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
