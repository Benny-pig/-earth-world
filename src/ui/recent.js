// 🕘 最近看過的國家:點開國家介紹時記下來(最多 8 個),搜尋框一打開就列在最上面,
// 每一筆都能按 ✕ 單獨刪掉,也可以一次清除。只存在這台瀏覽器。
const KEY = "earth-world.recent";
const MAX = 8;

export function createRecent() {
  let codes = (() => {
    try { const d = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(d) ? d.filter((c) => typeof c === "string") : []; } catch { return []; }
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(codes)); } catch { /* 存不了就算了 */ } };
  return {
    list: () => codes.slice(),
    add(code) { if (!code) return; codes = [code, ...codes.filter((c) => c !== code)].slice(0, MAX); save(); },
    remove(code) { codes = codes.filter((c) => c !== code); save(); },
    clear() { codes = []; save(); },
  };
}
