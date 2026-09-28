// 🪟 面板打開時,地球自動移到沒被擋住的地方:
//   電腦:左邊有面板 → 整個畫面往右挪一半的面板寬;右邊有國家介紹 → 往左挪
//   手機:下方有面板(從底下升起的那種)→ 往上挪到搜尋框和面板之間的正中間
// 用相機的 setViewOffset 平移投影,所以地球上的標籤、點選位置都會跟著一起對。
const SEL = "body > .fx-panel:not([hidden]), body > [id$='-panel']:not([hidden])";
const TOP_INSET_PHONE = 140;   // 手機上方的時鐘 + 搜尋框

export function createViewOffset({ camera }) {
  let ox = 0, oy = 0, tx = 0, ty = 0, lastCheck = 0, applied = false;

  function measure() {
    const W = window.innerWidth, H = window.innerHeight;
    tx = 0; ty = 0;
    const b = document.body.classList;
    if (!W || !H || b.contains("cinema") || b.contains("intro-playing") || b.contains("pov")) return;
    let left = 0, right = 0, bottomTop = H;
    for (const el of document.querySelectorAll(SEL)) {
      const r = el.getBoundingClientRect();
      // 電腦上太寬的(像大百科那種全版)不算;手機的面板本來就是整條寬的底部面板
      if (r.width < 40 || r.height < 60 || (W > 640 && r.width > W * 0.6) || r.right <= 0 || r.left >= W) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position !== "fixed") continue;
      if (W <= 640) {
        if (r.bottom > H - 220 && r.top > H * 0.3) bottomTop = Math.min(bottomTop, r.top);
      } else if (r.left < 100) left = Math.max(left, r.right);
      else if (r.right > W - 100) right = Math.max(right, W - r.left);
    }
    if (W <= 640) {
      if (bottomTop < H - 60) ty = Math.min(H * 0.3, H / 2 - (TOP_INSET_PHONE + bottomTop) / 2);
    } else {
      tx = Math.max(-W * 0.3, Math.min(W * 0.3, (left - right) / 2));
    }
  }

  function update(dt) {
    const now = performance.now();
    if (now - lastCheck > 300) { lastCheck = now; measure(); }
    const k = Math.min(1, dt * 5);
    ox += (tx - ox) * k;
    oy += (ty - oy) * k;
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5 && tx === 0 && ty === 0) {
      if (applied) { camera.clearViewOffset(); applied = false; }
      ox = oy = 0;
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    camera.setViewOffset(W, H, -ox, oy, W, H);
    applied = true;
  }

  return { update };
}
