import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskBody, backoffDelayMs, parseArgs } from "../tools/seedance.mjs";

test("buildTaskBody 有參考圖時附 image_url", () => {
  const body = buildTaskBody({ model: "doubao-seedance-2.5", prompt: "測試", imageDataUri: "data:image/jpeg;base64,AAA", durationSec: 5 });
  assert.equal(body.model, "doubao-seedance-2.5");
  assert.equal(body.duration, 5);
  assert.deepEqual(body.content, [
    { type: "text", text: "測試" },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
  ]);
});

test("buildTaskBody 無參考圖時只有文字(text-to-video)", () => {
  const body = buildTaskBody({ model: "doubao-seedance-2.5", prompt: "測試", imageDataUri: undefined, durationSec: 6 });
  assert.deepEqual(body.content, [{ type: "text", text: "測試" }]);
});

test("backoffDelayMs 前三次固定 2000ms,之後每次 +1000ms,上限 10000ms", () => {
  assert.equal(backoffDelayMs(1), 2000);
  assert.equal(backoffDelayMs(3), 2000);
  assert.equal(backoffDelayMs(4), 3000);
  assert.equal(backoffDelayMs(20), 10000);
});

test("parseArgs 解析 --flag value 配對", () => {
  const args = parseArgs(["--image", "a.jpg", "--prompt", "hello world", "--duration", "5", "--out", "b.mp4"]);
  assert.deepEqual(args, { image: "a.jpg", prompt: "hello world", duration: 5, out: "b.mp4" });
});

test("parseArgs 沒給的 flag 是 undefined", () => {
  const args = parseArgs(["--image", "a.jpg"]);
  assert.equal(args.prompt, undefined);
  assert.equal(args.out, undefined);
});
