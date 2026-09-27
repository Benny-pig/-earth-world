export function createTooltip() {
  const el = document.getElementById("tooltip");
  return {
    // extra:額外一行(例如開著全球天氣時顯示這裡的氣溫與雨量);names 可以是 null(指到海上)
    show(x, y, names, extra) {
      el.innerHTML = (names ? `<span class="zh">${names.zh}</span><span class="en">${names.en}</span>` : "") +
        (extra ? `<span class="wx">${extra}</span>` : "");
      el.style.left = `${x + 14}px`;
      el.style.top = `${y + 14}px`;
      el.style.display = "block";
    },
    hide() { el.style.display = "none"; },
  };
}
