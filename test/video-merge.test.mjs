import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardPrompt, buildHeroPrompt, pickPendingCardItems, heroPending } from "../.superpowers/sdd/country-encyclopedia/video-merge.mjs";

test("buildCardPrompt 有 en 時帶括號", () => {
  const p = buildCardPrompt("animals", { zh: "日本獼猴", en: "Japanese macaque", note: "冬季會泡溫泉取暖。" });
  assert.equal(p, "日本獼猴(Japanese macaque):冬季會泡溫泉取暖。,寫實風格短片,鏡頭緩慢移動");
});

test("buildCardPrompt 沒 en 時不留多餘括號", () => {
  const p = buildCardPrompt("animals", { zh: "秋田犬", note: "忠誠形象。" });
  assert.equal(p, "秋田犬:忠誠形象。,寫實風格短片,鏡頭緩慢移動");
});

test("buildHeroPrompt 組出國名+摘要", () => {
  const p = buildHeroPrompt({ name_zh: "日本", name_en: "Japan", summary: "四大島組成的島國。" });
  assert.equal(p, "日本(Japan)空拍與代表性街景,四大島組成的島國。,電影感短片");
});

test("pickPendingCardItems 只挑有 image 沒 video 的項目", () => {
  const data = {
    animals: [{ zh: "A", image: "a.jpg" }, { zh: "B", image: "b.jpg", video: "b.mp4" }, { zh: "C" }],
    foods: [{ zh: "D", image: "d.jpg" }],
  };
  const pending = pickPendingCardItems(data);
  assert.deepEqual(pending.map((p) => [p.section, p.item.zh]), [["animals", "A"], ["foods", "D"]]);
});

test("heroPending:沒有 hero_video 才要生成", () => {
  assert.equal(heroPending({}), true);
  assert.equal(heroPending({ hero_video: "hero.mp4" }), false);
});
