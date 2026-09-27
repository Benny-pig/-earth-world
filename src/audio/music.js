// 背景音樂:可切換曲目、記住選擇、首次互動後淡入。
const LS_KEY = "earth-world.track";

// 只留兩首鋼琴(Kevin MacLeod,CC BY 4.0,可商用、需標示作者)
export const TRACKS = [
  { id: "km-meditation", name: "冥想即興 · 靜心鋼琴",        src: "assets/music/km-meditation.mp3", credit: "Kevin MacLeod (incompetech.com) · CC BY 4.0" },
  { id: "km-gymnopedie", name: "吉諾佩第 No.1 · 古典鋼琴",   src: "assets/music/km-gymnopedie.mp3", credit: "Kevin MacLeod (incompetech.com) · CC BY 4.0" },
];

export function createMusic({ defaultVolume = 0.55 } = {}) {
  let trackId = "km-meditation";
  try { const s = localStorage.getItem(LS_KEY); if (s && TRACKS.some((x) => x.id === s)) trackId = s; } catch {}

  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  audio.src = trackFor(trackId).src;

  let targetVolume = defaultVolume;
  let muted = false;
  let started = false;
  let fadeTimer = null;
  let ok = true;

  function trackFor(id) { return TRACKS.find((x) => x.id === id) || TRACKS[0]; }

  audio.addEventListener("error", () => {
    ok = false;
    console.warn("[music] 背景音樂載入失敗:", audio.src);
    document.getElementById("audio-ui")?.setAttribute("hidden", "");
  });

  function fadeTo(v, ms = 1200) {
    if (fadeTimer) clearInterval(fadeTimer);
    const from = audio.volume;
    const startT = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - startT) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (v - from) * k));
      if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; }
    }, 40);
  }

  function play() {
    if (!ok) return;
    audio.play().then(() => {
      if (!muted) fadeTo(targetVolume);
    }).catch((e) => {
      started = false;   // 仍被瀏覽器擋:等下一次手勢
      console.warn("[music] play() 被拒,等待使用者互動:", e.name);
    });
  }

  function start() {
    if (started || !ok) return;
    started = true;
    play();
  }
  const onGesture = () => start();
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);

  // 切到別的分頁 / App 就暫停,回來再繼續播——不然背景音樂會無限期在背景耗電。
  let pausedByVisibility = false;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (started && !audio.paused) { audio.pause(); pausedByVisibility = true; }
    } else if (pausedByVisibility) {
      pausedByVisibility = false;
      if (started) audio.play().catch(() => {});
    }
  });

  return {
    tracks: TRACKS,
    currentTrackId: () => trackId,
    setTrack(id) {
      const tr = trackFor(id);
      if (tr.id === trackId) return;
      trackId = tr.id;
      try { localStorage.setItem(LS_KEY, trackId); } catch {}
      ok = true;
      const wasPlaying = started && !audio.paused;
      audio.pause();
      audio.src = tr.src;
      audio.currentTime = 0;
      audio.volume = 0;
      if (wasPlaying || started) play();
      return tr;
    },
    toggleMute() {
      muted = !muted;
      // iOS Safari 不理會 JS 動態改 audio.volume(這是 WebKit 長年的已知限制,
      // 音量交給實體按鍵/靜音開關),只調 volume 在 iPhone 上按了跟沒按一樣。
      // audio.muted 才是 iOS 真的會生效的開關,兩者都設才能跨平台都有效。
      audio.muted = muted;
      fadeTo(muted ? 0 : targetVolume, 400);
      return muted;
    },
    setVolume(v) {
      targetVolume = Math.max(0, Math.min(1, v));
      if (!muted && started) fadeTo(targetVolume, 200);
    },
    isMuted() { return muted; },
    isPlaying() { return started && !audio.paused; },
    getVolume() { return targetVolume; },
    pause() { audio.pause(); },
    resume() { if (started) play(); },
  };
}
