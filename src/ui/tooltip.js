export function createTooltip() {
  const el = document.getElementById("tooltip");
  return {
    show(x, y, names) {
      el.innerHTML = `<span class="zh">${names.zh}</span><span class="en">${names.en}</span>`;
      el.style.left = `${x + 14}px`;
      el.style.top = `${y + 14}px`;
      el.style.display = "block";
    },
    hide() { el.style.display = "none"; },
  };
}
