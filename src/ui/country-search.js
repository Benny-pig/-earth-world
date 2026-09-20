// 國家搜尋欄:中英名 / ISO 代碼皆可,方向鍵 + Enter 或點選即跳到該國。
const MAX_RESULTS = 8;

export function createCountrySearch({ index, onPick }) {
  const box = document.getElementById("country-search");
  if (!box || !Array.isArray(index) || !index.length) return { destroy() {} };
  const input = box.querySelector("input");
  const list = box.querySelector("ul");
  let matches = [];
  let active = -1;

  const norm = (s) => String(s || "").toLowerCase().trim();
  // 「台」「臺」是同一個字的異體(臺灣/台灣都通用),中文比對前先統一成同一個字,
  // 不然打「台灣」搜不到條目裡登記的「臺灣」。
  const normZh = (s) => String(s || "").trim().replace(/臺/g, "台");

  function search(q) {
    const n = norm(q);
    const nzh = normZh(q);
    if (!n) return [];
    const starts = [], contains = [];
    for (const it of index) {
      const zh = normZh(it.zh), en = norm(it.en), code = norm(it.code);
      if (zh.startsWith(nzh) || en.startsWith(n) || code === n) starts.push(it);
      else if (zh.includes(nzh) || en.includes(n)) contains.push(it);
      if (starts.length >= MAX_RESULTS) break;
    }
    return starts.concat(contains).slice(0, MAX_RESULTS);
  }

  function render() {
    if (!matches.length) { list.hidden = true; list.innerHTML = ""; return; }
    list.innerHTML = matches.map((m, i) =>
      `<li data-code="${m.code}" class="${i === active ? "active" : ""}">` +
      `<span class="cs-zh">${m.zh}</span><span class="cs-en">${m.en || m.code}</span></li>`
    ).join("");
    list.hidden = false;
  }

  function choose(code) {
    if (!code) return;
    input.value = "";
    matches = []; active = -1; render();
    input.blur();
    onPick(code);
  }

  input.addEventListener("input", () => { matches = search(input.value); active = matches.length ? 0 : -1; render(); });
  // 點進欄位、還沒打字之前,先列出全部國家(依中文名排序)方便使用者用瀏覽的
  // 而不是一定要知道打什麼關鍵字才找得到。
  input.addEventListener("focus", () => {
    if (input.value.trim()) return;
    // 中文用 localeCompare 排出來是筆畫順序,不是一般人習慣的拼音順序,反而
    // 更難瀏覽——改用英文國名的字母順序,對中文為主的使用者來說仍然是可預期
    // 的排序邏輯(跟很多手機聯絡人/國碼選單一樣用 A-Z),不用額外做拼音轉換。
    matches = [...index].sort((a, b) => String(a.en || "").localeCompare(String(b.en || "")));
    active = -1;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, matches.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) choose(matches[active].code); }
    else if (e.key === "Escape") { input.value = ""; matches = []; render(); input.blur(); }
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-code]");
    if (li) { e.preventDefault(); choose(li.dataset.code); }
  });
  input.addEventListener("blur", () => { setTimeout(() => { matches = []; render(); }, 120); });

  return { destroy() { box.remove(); } };
}
