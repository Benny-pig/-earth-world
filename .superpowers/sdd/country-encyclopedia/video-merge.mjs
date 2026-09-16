// node video-merge.mjs TW JP CH GR
// 掃 data/deep/<CODE>.json,對「已有 image 但沒有 video」的卡片、以及缺 hero_video 的國家,
// 呼叫 tools/seedance.mjs 的 generateVideo 生成短片,存到 assets/deep/<CODE>/,回寫 JSON + credits。
export const SECTIONS = ["animals", "foods", "landmarks", "people"];

function withEn(zh, en) { return en ? `${zh}(${en})` : zh; }

export function buildCardPrompt(sectionKey, item) {
  return `${withEn(item.zh, item.en)}:${item.note || ""},寫實風格短片,鏡頭緩慢移動`;
}

export function buildHeroPrompt(data) {
  return `${withEn(data.name_zh, data.name_en)}空拍與代表性街景,${data.summary || ""},電影感短片`;
}

export function pickPendingCardItems(data) {
  const pending = [];
  for (const section of SECTIONS) {
    for (const item of data[section] || []) {
      if (item.image && !item.video) pending.push({ section, item });
    }
  }
  return pending;
}

export function heroPending(data) {
  return !data.hero_video;
}
