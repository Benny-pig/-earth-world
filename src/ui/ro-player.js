import { esc } from "../lib/esc.js";
import { makeDraggable } from "./draggable.js";

// 🎵 RO 懷舊原聲:《仙境傳說》Prontera 主題曲,用版權方/原作相關頻道在 YouTube 上的官方影片播放。
// 曲子版權屬於 Gravity,不能把音樂檔放進網站;用 YouTube 播放器嵌入則是合法的(播放與收益都歸
// 上傳者)。YouTube 規定不能把播放器藏起來、只拿聲音當背景音樂,所以做成看得到畫面的小視窗
// (播放器至少 200×200 像素)。打開時先讓背景音樂與電台停下來,關掉後恢復原本的背景音樂。
const VIDEOS = [
  { id: "uAkntMI9rEs", title: "Theme of Prontera(夜晚版)", by: "Gravity 官方頻道 · Ragnarok Origin" },
  { id: "nyhal-5FlrM", title: "Return to Prontera(融合爵士版)", by: "ESTí 朴珍培 · 2002 年親自編曲" },
  { id: "4E6ofgjJsDI", title: "Theme of Prontera(村莊 BGM)", by: "正式發行原聲" },
  { id: "t1YhapeqnVo", title: "Theme Of Prontera(演唱版)", by: "KANGTA · The Memory of Ragnarok" },
];

export function createRoPlayer({ music }) {
  const $ = (id) => document.getElementById(id);
  const panel = $("ro-panel"), frame = $("ro-frame"), list = $("ro-list"), btn = $("ro-toggle");
  if (!panel || !frame || !list || !btn) return { setOpen() {}, isOpen: () => false };
  makeDraggable(panel, panel.querySelector(".sat-head"), { disableBelow: 641 });

  let open = false, current = VIDEOS[0], musicWasPlaying = false;

  function renderList() {
    list.innerHTML = VIDEOS.map((v) => `<button type="button" class="ro-row${v === current ? " on" : ""}" data-id="${esc(v.id)}">` +
      `${v === current ? "▶ " : ""}${esc(v.title)}<small>${esc(v.by)}</small></button>`).join("");
  }
  function play(v) {
    current = v;
    // loop=1 + playlist=同一支:單曲循環,適合當作背景聽
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0&playsinline=1&loop=1&playlist=${encodeURIComponent(v.id)}" ` +
      `title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    renderList();
  }

  function setOpen(v) {
    open = !!v;
    panel.hidden = !open;
    btn.setAttribute("aria-pressed", String(open));
    if (open) {
      musicWasPlaying = music.isPlaying();
      music.hold(true);
      if (window.__earth?.radio?.isPlaying()) $("radio-stop")?.click();   // 電台也先停,免得兩個聲音疊在一起
      // 手機:右下的選單卡片會蓋住播放器,先收起來(想再選功能點卡片標題就會展開)
      if (window.innerWidth <= 640) {
        for (const id of ["twc-collapse-toggle", "lc-collapse-toggle"]) {
          const t = $(id);
          if (t && t.getAttribute("aria-expanded") === "true") t.click();
        }
      }
      play(current);
    } else {
      frame.innerHTML = "";   // 移除播放器 = 停止播放
      music.hold(false);
      if (musicWasPlaying) music.resume();
    }
  }

  btn.addEventListener("click", () => setOpen(!open));
  $("ro-close")?.addEventListener("click", () => setOpen(false));
  list.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    const v = row && VIDEOS.find((x) => x.id === row.dataset.id);
    if (v && v !== current) play(v);
  });

  return { setOpen, isOpen: () => open };
}
