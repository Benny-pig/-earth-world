export function createMusic({ src = "/assets/music.mp3", defaultVolume = 0.55 } = {}) {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;

  let targetVolume = defaultVolume;   // the "un-muted" level the slider controls
  let muted = false;
  let started = false;
  let fadeTimer = null;
  let ok = true;

  audio.addEventListener("error", () => {
    ok = false;
    console.warn("[music] 背景音樂載入失敗:", src);
    document.getElementById("audio-ui")?.setAttribute("hidden", "");
  });

  function fadeTo(v, ms = 1200) {
    if (fadeTimer) clearInterval(fadeTimer);
    const from = audio.volume;
    const start = performance.now();
    fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / ms);
      audio.volume = from + (v - from) * t;
      if (t >= 1) { clearInterval(fadeTimer); fadeTimer = null; }
    }, 40);
  }

  function start() {
    if (started || !ok) return;
    started = true;
    audio.play().then(() => {
      if (!muted) fadeTo(targetVolume);
    }).catch((e) => {
      started = false;   // autoplay still blocked — retry on the next gesture
      console.warn("[music] play() 被拒,等待使用者互動:", e.name);
    });
  }

  const onGesture = () => start();
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);

  return {
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
