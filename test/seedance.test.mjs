import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskBody, backoffDelayMs, parseArgs, generateVideo } from "../tools/seedance.mjs";

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

test("generateVideo:送出任務 → 輪詢到 succeeded → 下載", async () => {
  const calls = [];
  const deps = {
    submitTask: async (body) => { calls.push(["submit", body]); return { id: "task-1" }; },
    pollTask: async (id) => { calls.push(["poll", id]); return { status: "succeeded", content: { video_url: "https://example.com/v.mp4" } }; },
    downloadVideo: async (url, outPath) => { calls.push(["download", url, outPath]); },
    sleep: async () => {},
  };
  const result = await generateVideo({
    prompt: "測試短片", durationSec: 5, outPath: "/tmp/out.mp4",
    apiKey: "k", baseUrl: "https://ark.example.com/api/v3", model: "doubao-seedance-2.5",
    deps,
  });
  assert.equal(result.outPath, "/tmp/out.mp4");
  assert.equal(calls[0][0], "submit");
  assert.equal(calls.at(-1).join(","), "download,https://example.com/v.mp4,/tmp/out.mp4");
});

test("generateVideo:任務 failed 要 throw", async () => {
  const deps = {
    submitTask: async () => ({ id: "task-2" }),
    pollTask: async () => ({ status: "failed", error: "content policy" }),
    downloadVideo: async () => { throw new Error("不該被呼叫"); },
    sleep: async () => {},
  };
  await assert.rejects(
    () => generateVideo({ prompt: "x", durationSec: 5, outPath: "/tmp/x.mp4", apiKey: "k", baseUrl: "b", model: "m", deps }),
    /content policy/
  );
});

test("generateVideo:缺 apiKey/baseUrl/model 要 throw,且不呼叫 submitTask", async () => {
  const deps = { submitTask: async () => { throw new Error("不該被呼叫"); } };
  await assert.rejects(() => generateVideo({ prompt: "x", durationSec: 5, outPath: "o", baseUrl: "b", model: "m", deps }));
});
