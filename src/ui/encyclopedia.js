import { esc } from "/src/lib/esc.js";

export function createEncyclopedia() {
  const el = document.getElementById("encyclopedia");
  const titleEl = el.querySelector(".enc-title");
  const bodyEl = document.getElementById("enc-body");

  el.querySelector(".enc-close").addEventListener("click", close);
  el.querySelector(".enc-back").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("open")) { e.stopPropagation(); close(); }
  });

  function open(code) {
    titleEl.textContent = "";
    bodyEl.innerHTML = `<p class="enc-dim">載入中…</p>`;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    // Task 3 會在這裡 fetch /data/deep/<code>.json 並渲染
  }
  function close() {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  }
  return { open, close, isOpen: () => el.classList.contains("open") };
}
