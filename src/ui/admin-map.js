// 2D 一級行政區地圖:給一國的 admin-1 GeoJSON,畫出所有縣市 + 標名 + 首都星號 + 可點擊。
// 資料:Natural Earth ne_10m_admin_1_states_provinces(公有領域),已篩選 + 簡化。
const cache = new Map();

export function createAdminMap() {
  let onPick = null;
  let selected = null;

  async function load(code) {
    if (cache.has(code)) return cache.get(code);
    const p = fetch(`data/admin1/${encodeURIComponent(code)}.geo.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
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

  // 幾何在投影座標下的對角線長度 —— 當「這個區有多大」的粗略指標,用於標籤淘汰
  function geomSpan(geom, toXY) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) for (const ring of poly) for (const pt of ring) {
      const [x, y] = toXY(pt[0], pt[1]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return Math.hypot(maxX - minX, maxY - minY);
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

    const fontUnit = Math.max(vb.w, vb.h) / 78;
    const viewDiag = Math.hypot(vb.w, vb.h);

    for (const f of fc.features) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", pathD(f.geometry, toXY));
      path.setAttribute("class", "admin-region");
      path.dataset.name = f.properties.name_zht || f.properties.name;
      g.appendChild(path);
    }
    const labels = [];
    for (const f of fc.features) {
      const p = f.properties;
      if (p.lon == null || p.lat == null) continue;
      const [x, y] = toXY(p.lon, p.lat);
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y);
      t.setAttribute("class", "admin-label");
      t.dataset.name = p.name_zht || p.name;   // 讓標籤本身也能點選 —— 小縣市的形狀常小到很難點準,標籤字通常比形狀好點
      t.textContent = p.name_zht || p.name;
      g.appendChild(t);
      labels.push({ el: t, span: geomSpan(f.geometry, toXY) });
    }
    labels.sort((a, b) => b.span - a.span);        // 由大到小 —— 最大的幾個永遠顯示
    const alwaysN = Math.min(labels.length, 8);

    let starEl = null;
    if (Array.isArray(opts.capital) && opts.capital.length === 2) {
      const [clat, clon] = opts.capital;
      const [x, y] = toXY(clon, clat);
      starEl = document.createElementNS(svgNS, "text");
      starEl.setAttribute("x", x); starEl.setAttribute("y", y);
      starEl.setAttribute("class", "admin-capital");
      starEl.setAttribute("text-anchor", "middle");
      starEl.setAttribute("dominant-baseline", "middle");
      starEl.textContent = "★";
      g.appendChild(starEl);
    }

    let lastDragEnd = 0;
    // click 掛在 svg(不是 g)上:pointerdown 會 setPointerCapture 在 svg,瀏覽器因此把
    // 之後合成的 click 事件也重新定位到 svg 本身(e.target 變成 svg,不是實際點到的形狀),
    // 用 e.target.closest() 永遠找不到東西。改用 elementFromPoint 在點擊當下重新做真正的
    // 命中測試,不受 pointer capture 影響。
    svg.addEventListener("click", (e) => {
      if (Date.now() - lastDragEnd < 160) return;   // 剛拖曳過 → 不算點選
      const real = document.elementFromPoint(e.clientX, e.clientY);
      const hit = real && real.closest(".admin-region, .admin-label");
      if (!hit) return;
      // 標籤點到也算數,但「選取中」的藍色高亮永遠套在區域形狀上,不是文字本身
      const r = hit.classList.contains("admin-region") ? hit : g.querySelector(`.admin-region[data-name="${CSS.escape(hit.dataset.name)}"]`);
      if (selected) selected.classList.remove("sel");
      selected = r; if (r) r.classList.add("sel");
      if (onPick) onPick(hit.dataset.name);
    });

    // ── 縮放 / 平移 ─────────────────────────────────────────
    let scale = 1, tx = 0, ty = 0;
    // 標籤字級隨縮放「次線性」增長:全景時小,放大時變大但不爆;
    // 同時依縮放淘汰太擠的小區標籤(最大的幾個永遠留著)
    const relayoutLabels = () => {
      const k = 0.64 * Math.pow(scale, 0.56);        // 螢幕上看到的相對倍率(拉到最大 ~4 倍)
      const fs = fontUnit * k / scale;               // 乘上 <g> 的 scale 後 ≈ fontUnit*k
      for (let i = 0; i < labels.length; i++) {
        const L = labels[i];
        L.el.setAttribute("font-size", fs);
        L.el.style.strokeWidth = Math.max(1.4, 2.3 * k) + "px";
        const show = i < alwaysN || L.span * scale > viewDiag * 0.05;
        L.el.style.display = show ? "" : "none";
      }
      if (starEl) starEl.setAttribute("font-size", fs * 1.7);
    };
    const apply = () => {
      g.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
      relayoutLabels();
    };
    relayoutLabels();
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
    // 雙指縮放(手機/觸控):追蹤所有按下的 pointer,兩指同時按下時算距離變化 → 縮放比例
    const pointers = new Map(); // pointerId -> {x, y}(client 座標)
    let pinch = null;           // { startDist, startScale, startTx, startTy, mid }
    svg.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture(e.pointerId); } catch {}
      if (pointers.size === 2) {
        drag = null;
        const [p1, p2] = [...pointers.values()];
        pinch = {
          startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
          startScale: scale, startTx: tx, startTy: ty,
          mid: svgPt({ clientX: (p1.x + p2.x) / 2, clientY: (p1.y + p2.y) / 2 }),
        };
      } else if (pointers.size === 1 && !pinch) {
        drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      }
    });
    svg.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const ns = Math.min(12, Math.max(1, pinch.startScale * (dist / pinch.startDist)));
        const p = pinch.mid; // 以捏合起始的中點為縮放中心(手指中點在畫面上的位置)
        tx = p.x - (p.x - pinch.startTx) * (ns / pinch.startScale);
        ty = p.y - (p.y - pinch.startTy) * (ns / pinch.startScale);
        scale = ns;
        if (scale === 1) { tx = 0; ty = 0; }
        apply();
        return;
      }
      if (!drag) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - drag.x) / rect.width * vb.w;
      const dy = (e.clientY - drag.y) / rect.height * vb.h;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
      tx = drag.tx + dx; ty = drag.ty + dy;
      apply();
    });
    const endDrag = (e) => {
      pointers.delete(e.pointerId);
      try { svg.releasePointerCapture(e.pointerId); } catch {}
      if (pinch) {
        lastDragEnd = Date.now();
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 1) {
          const [pt] = pointers.values();
          drag = { x: pt.x, y: pt.y, tx, ty, moved: true };
        }
        return;
      }
      if (drag && drag.moved) lastDragEnd = Date.now();
      drag = null;
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
