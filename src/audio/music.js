// 背景音樂:可切換曲目、記住選擇、首次互動後淡入。
const LS_KEY = "earth-world.track";

export const TRACKS = [
  { id: "earth-world", name: "地球世界(原創)",   src: "/assets/music/earth-world.wav", credit: "原創配樂 · Claude" },
  { id: "crystal",     name: "水晶空靈",          src: "/assets/music/crystal.wav",     credit: "原創配樂 · Claude" },
  { id: "spa",         name: "SPA 療養",          src: "/assets/music/spa.wav",         credit: "原創配樂 · Claude" },
  { id: "deepspace",   name: "深空冥想",          src: "/assets/music/deepspace.wav",   credit: "原創配樂 · Claude" },
  { id: "nebula",      name: "星塵電子",          src: "/assets/music/nebula.wav",      credit: "原創配樂 · Claude" },
  { id: "invariance",  name: "Invariance · 沉浸宇宙", src: "/assets/music/invariance.mp3", credit: "Kevin MacLeod (incompetech.com) · CC BY 4.0" },
];

export function createMusic({ defaultVolume = 0.55 } = {}) {
  let trackId = TRACKS[0].id;
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
      fadeTo(muted ? 0 : targetVolume, 400);
      return muted;
    },
    setVolume(v) {
      targetVolume = Math.max(0, Math.min(1, v));
      if (!muted && started) fadeTo(targetVolume, 200);
    },
    isMuted() { return muted; },
    isPlaying() { return started && !audio.paused; },
  };
}
