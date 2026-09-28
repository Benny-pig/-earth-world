// 🕰️ 模擬時間:平常就是現在;時光機拖到別的時間時,太陽、月亮、星空、行星都照這個時間擺。
// 需要「天上現在長怎樣」的地方都改用 simNow(),不要直接 new Date()。
let fixed = null;
const listeners = new Set();

export const simNow = () => (fixed == null ? new Date() : new Date(fixed));
export const isSimulating = () => fixed != null;

export function setSimTime(date) {
  fixed = date == null ? null : +date;
  const d = simNow();
  for (const fn of listeners) fn(d, fixed != null);
}

export function onSimTimeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
