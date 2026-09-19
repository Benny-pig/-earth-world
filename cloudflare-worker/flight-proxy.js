// 地球世界 · 即時航班 CORS 代理(部署到 Cloudflare Workers)
//
// 為什麼需要這個:adsb.lol(免金鑰的社群 ADS-B 資料源)跟大部分航班追蹤 API 一樣,
// 不開放瀏覽器直接跨網域 fetch(直接開網址沒問題,但網站前端的 JS 會被 CORS 擋)。
// 這支 Worker 純粹是「轉發 + 補上 CORS 標頭」,不碰任何金鑰、不做其他事——
// 跟 God's Eye View 用自己的後端代理 OpenSky 是同一個做法。
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
// 用法(部署好之後,網址後面加這些參數):
//   /?lat=23.7&lon=121&radius=250   → 查某個座標半徑內(海浬,最大 250)的所有飛機

const UPSTREAM = "https://api.adsb.lol/v2/point";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

    const upstreamUrl = `${UPSTREAM}/${lat}/${lon}/${radius}`;
    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { "User-Agent": "earth-world (educational globe app)" },
        cf: { cacheTtl: 15, cacheEverything: true }, // 15 秒快取,同一個座標短時間內重複查不用一直打上游
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "上游資料源暫時連不到", detail: String(e) }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  },
};
