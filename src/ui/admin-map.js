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
    const g = document.createElementNS(svgNS, "g");   // 縮放 / 平移都作用在這層
    svg.appendChild(g);

    const fontUnit = Math.max(vb.w, vb.h) / 68;

    for (const f of fc.features) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", pathD(f.geometry, toXY));
      path.setAttribute("class", "admin-region");
      path.dataset.name = f.properties.name_zht || f.properties.name;
      g.appendChild(path);
    }
    for (const f of fc.features) {
      const p = f.properties;
      if (p.lon == null || p.lat == null) continue;
      const [x, y] = toXY(p.lon, p.lat);
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y);
      t.setAttribute("class", "admin-label");
      t.setAttribute("font-size", fontUnit);
      t.textContent = p.name_zht || p.name;
      g.appendChild(t);
    }
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
      g.appendChild(star);
    }

    let lastDragEnd = 0;
    g.addEventListener("click", (e) => {
      if (Date.now() - lastDragEnd < 160) return;   // 剛拖曳過 → 不算點選
      const r = e.target.closest(".admin-region");
      if (!r) return;
      if (selected) selected.classList.remove("sel");
      selected = r; r.classList.add("sel");
      if (onPick) onPick(r.dataset.name);
    });

    // ── 縮放 / 平移 ─────────────────────────────────────────
    let scale = 1, tx = 0, ty = 0;
    const apply = () => g.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    const svgPt = (evt) => {
      const rect = svg.getBoundingClientRect();
      return {
        x: vb.x + (evt.clientX - rect.left) / rect.width * vb.w,
        y: vb.y + (evt.clientY - rect.top) / rect.height * vb.h,
      };
    };
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = svgPt(e);
      const k = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const ns = Math.min(12, Math.max(1, scale * k));
      if (ns === scale) return;
      // 以游標為中心縮放
      tx = p.x - (p.x - tx) * (ns / scale);
      ty = p.y - (p.y - ty) * (ns / scale);
      scale = ns;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - drag.x) / rect.width * vb.w;
      const dy = (e.clientY - drag.y) / rect.height * vb.h;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
      tx = drag.tx + dx; ty = drag.ty + dy;
      apply();
    });
    const endDrag = (e) => {
      if (drag && drag.moved) lastDragEnd = Date.now();
      drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch {}
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    svg.addEventListener("dblclick", () => { scale = 1; tx = 0; ty = 0; apply(); });

    container.innerHTML = "";
    const hint = document.createElement("p");
    hint.className = "enc-dim";
    hint.style.cssText = "font-size:11px;margin:0 0 6px";
    hint.textContent = "滾輪縮放 · 拖曳平移 · 雙擊還原";
    container.appendChild(hint);
    container.appendChild(svg);
  }

  return { render };
}
