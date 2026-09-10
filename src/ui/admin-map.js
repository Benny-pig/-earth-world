// 2D 一級行政區地圖:給一國的 admin-1 GeoJSON,畫出所有縣市 + 標名 + 首都星號 + 可點擊。
// 資料:Natural Earth ne_10m_admin_1_states_provinces(公有領域),已篩選 + 簡化。
const cache = new Map();

export function createAdminMap() {
  let onPick = null;
  let selected = null;

  async function load(code) {
    if (cache.has(code)) return cache.get(code);
    const p = fetch(`/data/admin1/${encodeURIComponent(code)}.geo.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cache.set(code, p);
    return p;
  }

  // 粗略等距投影(經度乘 cos(中緯度)修正橫向拉伸),fit 到 viewBox
  function project(fc) {
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    const eachPt = (fn) => {
      for (const f of fc.features) {
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const poly of polys) for (const ring of poly) for (const pt of ring) fn(pt);
      }
    };
    eachPt(([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; });
    const midLat = (minY + maxY) / 2;
    const kx = Math.cos(midLat * Math.PI / 180) || 1;
    const W = (maxX - minX) * kx, H = (maxY - minY);
    const pad = Math.max(W, H) * 0.04;
    const vb = { x: -pad, y: -pad, w: W + pad * 2, h: H + pad * 2 };
    const toXY = (lon, lat) => [(lon - minX) * kx, (maxY - lat)];
    return { toXY, vb };
  }

  function pathD(geom, toXY) {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    let d = "";
    for (const poly of polys) {
      for (const ring of poly) {
        d += ring.map((pt, i) => {
          const [x, y] = toXY(pt[0], pt[1]);
          return (i ? "L" : "M") + x.toFixed(3) + " " + y.toFixed(3);
        }).join("") + "Z";
      }
    }
    return d;
  }

  async function render(container, code, opts = {}) {
    onPick = opts.onPick || null;
    selected = null;
    container.innerHTML = `<p class="enc-dim">載入地圖…</p>`;
    const fc = await load(code);
    if (!fc || !fc.features || !fc.features.length) { container.innerHTML = `<p class="enc-dim">這個國家的縣市地圖尚未建置。</p>`; return; }

    const { toXY, vb } = project(fc);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.setAttribute("class", "admin-map-svg");
    svg.setAttribute("role", "img");

    const fontUnit = Math.max(vb.w, vb.h) / 68;

    for (const f of fc.features) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", pathD(f.geometry, toXY));
      path.setAttribute("class", "admin-region");
      path.dataset.name = f.properties.name_zht || f.properties.name;
      svg.appendChild(path);
    }
    // 標名(畫在多邊形之上)
    for (const f of fc.features) {
      const p = f.properties;
      if (p.lon == null || p.lat == null) continue;
      const [x, y] = toXY(p.lon, p.lat);
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y);
      t.setAttribute("class", "admin-label");
      t.setAttribute("font-size", fontUnit);
      t.textContent = p.name_zht || p.name;
      svg.appendChild(t);
    }
    // 首都星號
    if (Array.isArray(opts.capital) && opts.capital.length === 2) {
      const [clat, clon] = opts.capital;
      const [x, y] = toXY(clon, clat);
      const star = document.createElementNS(svgNS, "text");
      star.setAttribute("x", x); star.setAttribute("y", y);
      star.setAttribute("class", "admin-capital");
      star.setAttribute("font-size", fontUnit * 1.4);
      star.setAttribute("text-anchor", "middle");
      star.setAttribute("dominant-baseline", "middle");
      star.textContent = "★";
      svg.appendChild(star);
    }

    svg.addEventListener("click", (e) => {
      const r = e.target.closest(".admin-region");
      if (!r) return;
      if (selected) selected.classList.remove("sel");
      selected = r; r.classList.add("sel");
      if (onPick) onPick(r.dataset.name);
    });

    container.innerHTML = "";
    container.appendChild(svg);
  }

  return { render };
}
