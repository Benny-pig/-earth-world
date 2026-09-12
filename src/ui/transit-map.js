// 捷運 / 地鐵路網示意圖。資料:data/transit/<city>.json(octilinear 人工排版座標)。
// 每條線一條折線 + 站點圓點 + 轉乘站白心大圈;標籤:轉乘站永遠顯示,其餘拉近才顯示、hover 補顯示。
// 縮放 / 平移沿用 admin-map.js 的作法。
const cache = new Map();

export function createTransitMap() {
  async function load(city) {
    if (cache.has(city)) return cache.get(city);
    const p = fetch(`data/transit/${encodeURIComponent(city)}.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cache.set(city, p);
    return p;
  }

  async function render(container, city) {
    container.innerHTML = `<p class="enc-dim">載入路網圖…</p>`;
    const data = await load(city);
    if (!data || !data.stations || !data.lines) {
      container.innerHTML = `<p class="enc-dim">這個城市的捷運路網圖尚未建置。</p>`;
      return;
    }
    const S = data.stations;
    const [vx, vy, vw, vh] = data.viewBox || [0, 0, 200, 200];
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    svg.setAttribute("class", "transit-svg");
    svg.setAttribute("role", "img");
    const g = document.createElementNS(svgNS, "g");
    svg.appendChild(g);

    const unit = Math.max(vw, vh);
    const LW = unit / 90;               // 線寬
    const DOT = unit / 150;             // 一般站半徑

    // 路線折線
    for (const ln of data.lines) {
      const pts = ln.stations.map((id) => S[id]).filter(Boolean);
      if (pts.length < 2) continue;
      const pl = document.createElementNS(svgNS, "polyline");
      pl.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
      pl.setAttribute("fill", "none");
      pl.setAttribute("stroke", ln.color);
      pl.setAttribute("stroke-width", LW);
      pl.setAttribute("stroke-linejoin", "round");
      pl.setAttribute("stroke-linecap", "round");
      pl.setAttribute("class", "transit-line");
      if (ln.dashed) pl.setAttribute("stroke-dasharray", `${LW * 1.1} ${LW * 1.1}`);
      g.appendChild(pl);
    }

    // 站點:先算每站屬於哪些線(決定圓點顏色 / 是否轉乘)
    const stLines = new Map();
    for (const ln of data.lines) for (const id of ln.stations) {
      if (!stLines.has(id)) stLines.set(id, new Set());
      stLines.get(id).add(ln.color);
    }

    const labels = [];
    for (const [id, st] of Object.entries(S)) {
      const isInt = !!st.int || (stLines.get(id) && stLines.get(id).size > 1);
      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", st.x); c.setAttribute("cy", st.y);
      c.setAttribute("r", isInt ? DOT * 1.9 : DOT);
      c.setAttribute("class", isInt ? "transit-dot transit-int" : "transit-dot");
      if (!isInt) {
        const only = [...(stLines.get(id) || ["#888"])][0];
        c.setAttribute("stroke", only);
      }
      c.dataset.name = st.zh;
      g.appendChild(c);

      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", st.x); t.setAttribute("y", st.y - (isInt ? DOT * 3 : DOT * 2.4));
      t.setAttribute("class", "transit-label");
      t.setAttribute("text-anchor", "middle");
      t.textContent = st.zh;
      g.appendChild(t);
      labels.push({ el: t, dot: c, isInt });
    }

    // ── 縮放 / 平移 + 標籤依縮放顯隱 ──────────────────────────
    let scale = 1, tx = 0, ty = 0;
    const relayout = () => {
      const k = 0.6 * Math.pow(scale, 0.4);
      const fs = (unit / 55) * k / scale;
      for (const L of labels) {
        L.el.setAttribute("font-size", fs);
        L.el.style.strokeWidth = Math.max(1.2, 2 * k) + "px";
        L.el.style.display = (L.isInt || scale > 1.8 || L.hover) ? "" : "none";
      }
    };
    const apply = () => { g.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`); relayout(); };
    relayout();

    const svgPt = (evt) => {
      const r = svg.getBoundingClientRect();
      return { x: vx + (evt.clientX - r.left) / r.width * vw, y: vy + (evt.clientY - r.top) / r.height * vh };
    };
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = svgPt(e);
      const k = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const ns = Math.min(14, Math.max(1, scale * k));
      if (ns === scale) return;
      tx = p.x - (p.x - tx) * (ns / scale);
      ty = p.y - (p.y - ty) * (ns / scale);
      scale = ns;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, tx, ty }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", (e) => {
      if (drag) {
        const r = svg.getBoundingClientRect();
        tx = drag.tx + (e.clientX - drag.x) / r.width * vw;
        ty = drag.ty + (e.clientY - drag.y) / r.height * vh;
        apply();
        return;
      }
      const hit = e.target.closest(".transit-dot");
      for (const L of labels) {
        const want = L.dot === hit;
        if (want !== !!L.hover) { L.hover = want; }
      }
      relayout();
    });
    const end = (e) => { drag = null; try { svg.releasePointerCapture(e.pointerId); } catch {} };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("dblclick", () => { scale = 1; tx = 0; ty = 0; apply(); });

    container.innerHTML = "";
    const hint = document.createElement("p");
    hint.className = "enc-dim";
    hint.style.cssText = "font-size:11px;margin:0 0 6px";
    hint.textContent = "滾輪縮放 · 拖曳平移 · 雙擊還原 · 滑過站點看站名";
    container.appendChild(hint);
    container.appendChild(svg);

    const legend = document.createElement("div");
    legend.className = "transit-legend";
    const seen = new Set();
    legend.innerHTML = data.lines.filter((l) => {
      if (l.dashed || l.legendHide || seen.has(l.color)) return false;
      seen.add(l.color);
      return true;
    }).map((l) => `<span><i style="background:${l.color}"></i>${l.zh}</span>`).join("");
    container.appendChild(legend);

    if (data.note) {
      const n = document.createElement("p");
      n.className = "enc-dim";
      n.style.cssText = "font-size:10.5px;margin:8px 0 0";
      n.textContent = data.note;
      container.appendChild(n);
    }
  }

  return { render };
}
