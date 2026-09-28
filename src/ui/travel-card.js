import { iterCountryPolygons, countryCode } from "../countries/borders.js";

// 🗺️ 我的旅行地圖:把護照裡蓋過章的國家畫成一張分享圖(1200×630,剛好是 LINE / Facebook 預覽的比例)。
// 全部在瀏覽器裡用 canvas 畫,不上傳任何資料;手機可以直接分享圖片,電腦就下載 PNG。
// 不畫國旗圖片:跨網域圖片會讓 canvas 不能匯出。
const W = 1200, H = 630;
const FONT = `"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif`;

export function drawTravelCard({ geojson, visited, regions, regionOf, stats, nameOf }) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");

  // 背景:深藍漸層 + 固定位置的小星星
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1430"); bg.addColorStop(1, "#050814");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`;
    g.fillRect(rnd() * W, rnd() * H, rnd() < 0.9 ? 1 : 2, rnd() < 0.9 ? 1 : 2);
  }

  // 右邊:世界地圖(等距圓柱投影,北緯 84° 到南緯 58°,南極洲不畫)
  const MX = 430, MY = 70, MW = 740, MH = 430, LAT0 = 84, LAT1 = -58;
  const px = (lon) => MX + ((lon + 180) / 360) * MW;
  const py = (lat) => MY + ((LAT0 - lat) / (LAT0 - LAT1)) * MH;
  const color = Object.fromEntries(regions.map((r) => [r.key, r.color]));
  const set = new Set(visited);
  g.lineJoin = "round";
  for (const f of geojson.features) {
    const code = countryCode(f);
    if (code === "AQ") continue;
    const on = set.has(code);
    g.beginPath();
    for (const rings of iterCountryPolygons(f)) {
      for (const ring of rings) {
        ring.forEach(([lon, lat], i) => (i ? g.lineTo(px(lon), py(Math.max(LAT1, lat))) : g.moveTo(px(lon), py(Math.max(LAT1, lat)))));
        g.closePath();
      }
    }
    g.fillStyle = on ? color[regionOf(code)] || "#ffc94d" : "rgba(120,140,180,.22)";
    g.fill("evenodd");
    g.strokeStyle = on ? "rgba(255,255,255,.85)" : "rgba(160,180,220,.28)";
    g.lineWidth = on ? 0.9 : 0.5;
    g.stroke();
  }

  // 左邊:標題、數字、各區進度
  g.fillStyle = "#ffd98a";
  g.font = `700 30px ${FONT}`;
  g.fillText("🛂 我的旅行地圖", 48, 92);
  g.fillStyle = "#ffffff";
  g.font = `800 120px ${FONT}`;
  const nText = String(stats.n);
  g.fillText(nText, 44, 230);
  const nW = g.measureText(nText).width;
  g.font = `600 28px ${FONT}`;
  g.fillStyle = "#cfd8ee";
  g.fillText("個國家與地區", 56 + nW, 226);
  const pct = stats.total ? Math.round((stats.n / stats.total) * 100) : 0;
  g.font = `500 22px ${FONT}`;
  g.fillStyle = "#9fb0d6";
  g.fillText(`去過全世界的 ${pct}%`, 50, 272);

  let y = 318;
  g.font = `500 19px ${FONT}`;
  for (const r of regions) {
    const got = stats.byRegion[r.key] || 0, tot = stats.totals[r.key] || 0;
    g.fillStyle = "#dbe3f5";
    g.fillText(r.label.replace(/^\S+\s/, ""), 52, y + 6);
    g.fillStyle = "rgba(255,255,255,.12)";
    roundRect(g, 150, y - 8, 170, 12, 6); g.fill();
    g.fillStyle = r.color;
    roundRect(g, 150, y - 8, Math.max(tot ? (170 * got) / tot : 0, got ? 8 : 0), 12, 6); g.fill();
    g.fillStyle = "#9fb0d6";
    g.fillText(`${got}/${tot}`, 334, y + 6);
    y += 34;
  }

  // 最近去的幾國
  const recent = visited.slice(0, 6).map(nameOf).join("、");
  if (recent) {
    g.font = `500 18px ${FONT}`;
    g.fillStyle = "#cfd8ee";
    wrap(g, `最近:${recent}${visited.length > 6 ? "…" : ""}`, 48, 572, 360, 24);
  }

  // 頁尾
  g.font = `600 20px ${FONT}`;
  g.fillStyle = "#ffd98a";
  g.textAlign = "right";
  g.fillText("地球世界 · 你去過幾國?", W - 40, H - 58);
  g.font = `400 16px ${FONT}`;
  g.fillStyle = "#8ea0c8";
  g.fillText("benny-pig.github.io/-earth-world", W - 40, H - 32);
  g.textAlign = "left";
  return cv;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g, text, x, y, maxW, lh) {
  let line = "";
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) { g.fillText(line, x, y); line = ch; y += lh; }
    else line += ch;
  }
  if (line) g.fillText(line, x, y);
}

// 預覽視窗:下載或分享
export async function showTravelCard(canvas, { title = "我的旅行地圖", text = "" } = {}) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const url = URL.createObjectURL(blob);
  const box = document.createElement("div");
  box.id = "tc-card-modal";
  box.innerHTML = `<div class="tcm-inner"><div class="tcm-head"><b>🗺️ ${title}</b><button type="button" data-act="close" aria-label="關閉">×</button></div>` +
    `<img src="${url}" alt="${title}">` +
    `<div class="tcm-btns"><button type="button" class="tc-btn" data-act="share">📤 分享圖片</button>` +
    `<a class="tc-btn" href="${url}" download="my-travel-map.png">⬇️ 下載圖片</a></div>` +
    `<small>圖片是在你的瀏覽器裡畫出來的,不會上傳。</small></div>`;
  document.body.appendChild(box);
  const file = new File([blob], "my-travel-map.png", { type: "image/png" });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  if (!canShare) box.querySelector("[data-act=share]").remove();
  const close = () => { box.remove(); URL.revokeObjectURL(url); };
  box.addEventListener("click", async (e) => {
    if (e.target === box || e.target.closest("[data-act=close]")) { close(); return; }
    if (e.target.closest("[data-act=share]")) {
      try { await navigator.share({ files: [file], title, text }); } catch { /* 取消分享 */ }
    }
  });
}
