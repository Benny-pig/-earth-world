# 大百科短片整合(Seedance 2.5)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `TW JP CH GR` 四國的大百科頁面,在既有圖文卡片旁多播放 AI(Seedance 2.5)生成的短片,圖片保留不取代;短片一律離線批次產生後 commit 進 repo,前端純播放不打 API。

**Architecture:** `tools/seedance.mjs` 是核心模組(送出 image-to-video 任務 → 輪詢 → 下載 mp4)兼獨立 CLI;`.superpowers/sdd/country-encyclopedia/video-merge.mjs` 是批次腳本,import 前者,仿照現有 `img-merge.mjs` 的「掃 JSON 缺欄位 → 補媒體 → 回寫」模式;`src/ui/encyclopedia.js` 的 `card()`/`render()` 在欄位存在時多輸出 `<video>`,欄位不存在時完全照舊。

**Tech Stack:** Node.js 22(ES Modules,`.mjs`,無建置工具)、`node:test` 內建測試、原生 `fetch`;前端純 DOM 字串拼接(無框架)。

**Spec:** [docs/superpowers/specs/2026-09-16-seedance-video-integration-design.md](../specs/2026-09-16-seedance-video-integration-design.md)

## Global Constraints

- 本階段只處理 4 國:`TW JP CH GR`,不動其餘 16 個既有大百科國家。
- 只在項目已有 `image` 時才生成對應 `video`(image-to-video,用現有 jpg 當參考圖);hero 短片用 `summary` 做 text-to-video。
- API 金鑰、base URL、model id 一律從環境變數讀(`SEEDANCE_API_KEY` / `SEEDANCE_API_BASE` / `SEEDANCE_MODEL`),不寫死、不進 git。
- 前端絕不在瀏覽器端呼叫 Seedance API——所有生成是本機離線批次,mp4 直接 commit 進 `assets/deep/<CODE>/`。
- 沒有 `video` / `hero_video` 欄位的項目,前端行為必須跟現在完全一樣(向下相容,零迴歸)。
- 測試一律用 `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test`(repo 根目錄執行),比照現有 `test/esc.test.mjs`、`test/geo.test.mjs` 的風格(`node:test` + `node:assert/strict`)。
- 檔名代碼規則沿用既有慣例:`codeToFile = c => c.replace(/[ .]/g, "_")`。

---

### Task 1: `tools/seedance.mjs` — 純函式(prompt 之外的邏輯)

**Files:**
- Create: `tools/seedance.mjs`
- Test: `test/seedance.test.mjs`

**Interfaces:**
- Produces:
  - `export function buildTaskBody({ model, prompt, imageDataUri, durationSec })` → 回傳 plain object,結構:
    ```js
    {
      model,
      content: [
        { type: "text", text: prompt },
        ...(imageDataUri ? [{ type: "image_url", image_url: { url: imageDataUri } }] : []),
      ],
      duration: durationSec,
    }
    ```
  - `export function backoffDelayMs(attempt)` → 輪詢間隔(毫秒),`attempt` 從 1 起算:第 1~3 次每次 2000ms,第 4 次起每次加 1000ms,上限 10000ms。公式:`Math.min(10000, 2000 + Math.max(0, attempt - 3) * 1000)`。
  - `export function parseArgs(argv)` → 解析 `--image <path> --prompt <text> --duration <sec> --out <path>` 這種 `--flag value` 配對,回傳 `{ image, prompt, duration, out }`(`duration` 轉成 Number;沒給的 flag 值是 `undefined`);不認得的 flag 直接忽略。

- [ ] **Step 1: 寫失敗測試**

建立 `test/seedance.test.mjs`:

```js
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
```

- [ ] **Step 2: 跑測試,確認失敗(找不到 tools/seedance.mjs)**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/seedance.test.mjs`
Expected: FAIL(`Cannot find module '../tools/seedance.mjs'` 或等效錯誤)

- [ ] **Step 3: 寫最小實作**

建立 `tools/seedance.mjs`,先只放這三個純函式(I/O 與 CLI entry 留到 Task 2):

```js
// tools/seedance.mjs
// Seedance 2.5 image-to-video 生成:核心模組(可 import)+ 獨立 CLI。
// 用法(CLI):node tools/seedance.mjs --image assets/deep/JP/animals-macaque.jpg \
//   --prompt "日本獼猴在溫泉中泡湯,蒸氣緩緩升起,寫實紀錄片風格" --duration 5 --out /tmp/test.mp4
// 金鑰/base URL/model 一律從環境變數讀:SEEDANCE_API_KEY、SEEDANCE_API_BASE、SEEDANCE_MODEL。

export function buildTaskBody({ model, prompt, imageDataUri, durationSec }) {
  const content = [{ type: "text", text: prompt }];
  if (imageDataUri) content.push({ type: "image_url", image_url: { url: imageDataUri } });
  return { model, content, duration: durationSec };
}

export function backoffDelayMs(attempt) {
  return Math.min(10000, 2000 + Math.max(0, attempt - 3) * 1000);
}

export function parseArgs(argv) {
  const out = { image: undefined, prompt: undefined, duration: undefined, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--image") out.image = argv[++i];
    else if (flag === "--prompt") out.prompt = argv[++i];
    else if (flag === "--duration") out.duration = Number(argv[++i]);
    else if (flag === "--out") out.out = argv[++i];
  }
  return out;
}
```

- [ ] **Step 4: 跑測試,確認通過**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/seedance.test.mjs`
Expected: PASS(5 個測試全過)

- [ ] **Step 5: Commit**

```bash
git add tools/seedance.mjs test/seedance.test.mjs
git commit -m "feat(seedance): 影片任務 body / 輪詢退避 / CLI 參數解析純函式"
```

---

### Task 2: `tools/seedance.mjs` — I/O 與 generateVideo 整合、CLI entry

**Files:**
- Modify: `tools/seedance.mjs`
- Test: `test/seedance.test.mjs`

**Interfaces:**
- Consumes:`buildTaskBody`、`backoffDelayMs`(Task 1,同檔案內直接呼叫,不需 import)
- Produces:
  - `export function imageToDataUri(filePath)` → 讀檔轉 `data:image/jpeg;base64,...`(固定當 jpeg,因為專案圖片全是 `.jpg`)。
  - `export async function submitTask(body, { apiKey, baseUrl })` → `POST ${baseUrl}/contents/generations/tasks`,header `Authorization: Bearer ${apiKey}` + `Content-Type: application/json`,body 是 `JSON.stringify(body)`;回傳 `{ id }`(讀 response JSON 的 `id` 欄位);非 2xx 要 throw `Error`,訊息含 HTTP 狀態碼與 response text。
  - `export async function pollTask(taskId, { apiKey, baseUrl })` → `GET ${baseUrl}/contents/generations/tasks/${taskId}`,同樣帶 `Authorization`;回傳 response JSON(至少含 `status` 與成功時的 `content.video_url`)。
  - `export async function downloadVideo(url, outPath)` → fetch 該 URL,把 response 的 `arrayBuffer()` 轉 `Buffer` 寫進 `outPath`(用 `node:fs/promises` 的 `mkdir(dirname, {recursive:true})` + `writeFile`)。
  - `export async function generateVideo({ imagePath, prompt, durationSec, outPath, apiKey, baseUrl, model, deps })` → 整合上面四個函式的主流程:
    1. 沒給 `apiKey` / `baseUrl` / `model` 就 throw(訊息提示要設哪個環境變數)。
    2. `imagePath` 有給就呼叫 `imageToDataUri`,沒給就是 `undefined`(text-to-video)。
    3. `buildTaskBody` 組 body → `submitTask` 拿 `id`。
    4. 迴圈輪詢 `pollTask`:`status === "succeeded"` 就跳出、`status === "failed"` 就 throw(帶 `error` 欄位)、其餘(`queued`/`running`)照 `backoffDelayMs(attempt)` 等待後繼續,最多 60 次(對應最長約 10 分鐘)超過就 throw `Error("timeout")`。
    5. 成功後用 `downloadVideo(result.content.video_url, outPath)`。
    6. 回傳 `{ outPath }`。
    - `deps` 是選填的依賴注入物件(`{ submitTask, pollTask, downloadVideo, sleep }`),預設用上面本檔案的實作;測試時整個換成假的,不用碰真實網路。

- [ ] **Step 1: 寫失敗測試(mock fetch,不打真實網路)**

在 `test/seedance.test.mjs` 加:

```js
import { generateVideo } from "../tools/seedance.mjs";

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
```

- [ ] **Step 2: 跑測試,確認失敗(`generateVideo` 尚未存在)**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/seedance.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 I/O + generateVideo + CLI entry**

在 `tools/seedance.mjs` 的兩個純函式下面補上:

```js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function imageToDataUri(filePath) {
  const buf = await readFile(filePath);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

export async function submitTask(body, { apiKey, baseUrl }) {
  const res = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`submitTask 失敗:HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export async function pollTask(taskId, { apiKey, baseUrl }) {
  const res = await fetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`pollTask 失敗:HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export async function downloadVideo(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`downloadVideo 失敗:HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generateVideo({ imagePath, prompt, durationSec, outPath, apiKey, baseUrl, model, deps = {} }) {
  if (!apiKey) throw new Error("缺 apiKey(環境變數 SEEDANCE_API_KEY)");
  if (!baseUrl) throw new Error("缺 baseUrl(環境變數 SEEDANCE_API_BASE)");
  if (!model) throw new Error("缺 model(環境變數 SEEDANCE_MODEL)");

  const doSubmit = deps.submitTask || submitTask;
  const doPoll = deps.pollTask || pollTask;
  const doDownload = deps.downloadVideo || downloadVideo;
  const sleep = deps.sleep || defaultSleep;

  const imageDataUri = imagePath ? await imageToDataUri(imagePath) : undefined;
  const body = buildTaskBody({ model, prompt, imageDataUri, durationSec });
  const { id } = await doSubmit(body, { apiKey, baseUrl });

  let attempt = 0;
  let result;
  while (true) {
    attempt++;
    if (attempt > 60) throw new Error(`generateVideo timeout(task ${id})`);
    result = await doPoll(id, { apiKey, baseUrl });
    if (result.status === "succeeded") break;
    if (result.status === "failed") throw new Error(`任務失敗(task ${id}):${result.error || "unknown"}`);
    await sleep(backoffDelayMs(attempt));
  }

  await doDownload(result.content.video_url, outPath);
  return { outPath };
}

// ---- CLI entry ----
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt || !args.out) {
    console.error("用法: node tools/seedance.mjs --prompt <text> --out <path> [--image <path>] [--duration <sec>]");
    process.exit(1);
  }
  const result = await generateVideo({
    imagePath: args.image,
    prompt: args.prompt,
    durationSec: args.duration || 5,
    outPath: args.out,
    apiKey: process.env.SEEDANCE_API_KEY,
    baseUrl: process.env.SEEDANCE_API_BASE,
    model: process.env.SEEDANCE_MODEL,
  });
  console.log(`✓ 已存到 ${result.outPath}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMain) main().catch((err) => { console.error("失敗:", err.message); process.exit(1); });
```

> **注意(對照官方文件):** `submitTask`/`pollTask` 打的路徑(`/contents/generations/tasks`)與 body 結構,是比照 Volcengine Ark 平台其他生成模型一貫用的非同步任務介面推斷,**還沒對照過 Seedance 2.5 的正式文件**。申請到 BytePlus ModelArk 或火山引擎 Ark 帳號、看到官方 API 文件後,如果欄位不同,只要改這兩個函式即可,`generateVideo` 其餘邏輯(輪詢、退避、下載、CLI)不受影響。Task 6 的手動單張測試就是抓這個落差的地方。

- [ ] **Step 4: 跑測試,確認通過**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/seedance.test.mjs`
Expected: PASS(全部測試通過,過程中不會有真實網路呼叫,因為都用 `deps` 假物件)

- [ ] **Step 5: Commit**

```bash
git add tools/seedance.mjs test/seedance.test.mjs
git commit -m "feat(seedance): generateVideo 整合流程 + CLI(可獨立測單張圖)"
```

---

### Task 3: `video-merge.mjs` — 純函式(prompt 組句、待生成清單判斷)

**Files:**
- Create: `.superpowers/sdd/country-encyclopedia/video-merge.mjs`
- Test: `test/video-merge.test.mjs`

**Interfaces:**
- Produces:
  - `export const SECTIONS = ["animals", "foods", "landmarks", "people"]`
  - `export function buildCardPrompt(sectionKey, item)` → 用 `item.zh` + `item.note` 組一句中文 prompt,格式:`` `${item.zh}(${item.en || ""}):${item.note || ""},寫實風格短片,鏡頭緩慢移動` ``(`item.en` 空的話不留多餘括號:沒有 `en` 就輸出 `` `${item.zh}:${item.note || ""},寫實風格短片,鏡頭緩慢移動` ``)。
  - `export function buildHeroPrompt(data)` → `` `${data.name_zh}(${data.name_en || ""})空拍與代表性街景,${data.summary || ""},電影感短片` ``,`name_en` 空同上省略括號。
  - `export function pickPendingCardItems(data)` → 掃 `SECTIONS`,回傳 `[{ section, item }]` 陣列,條件是 `item.image` 存在且 `item.video` 不存在;維持原陣列順序。
  - `export function heroPending(data)` → `boolean`,`true` 代表 `data.hero_video` 不存在(需要生成)。

- [ ] **Step 1: 寫失敗測試**

建立 `test/video-merge.test.mjs`:

```js
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
```

- [ ] **Step 2: 跑測試,確認失敗**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/video-merge.test.mjs`
Expected: FAIL(`video-merge.mjs` 還不存在)

- [ ] **Step 3: 寫最小實作**

建立 `.superpowers/sdd/country-encyclopedia/video-merge.mjs`,先放這四個純函式(檔案 IO 與主流程留到 Task 4):

```js
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
```

- [ ] **Step 4: 跑測試,確認通過**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/video-merge.test.mjs`
Expected: PASS(6 個測試全過)

- [ ] **Step 5: Commit**

```bash
git add .superpowers/sdd/country-encyclopedia/video-merge.mjs test/video-merge.test.mjs
git commit -m "feat(video-merge): prompt 組句 + 待生成清單純函式"
```

---

### Task 4: `video-merge.mjs` — 主流程(讀寫 JSON、呼叫 generateVideo、credits)

**Files:**
- Modify: `.superpowers/sdd/country-encyclopedia/video-merge.mjs`

**Interfaces:**
- Consumes:`SECTIONS`、`buildCardPrompt`、`buildHeroPrompt`、`pickPendingCardItems`、`heroPending`(Task 3,同檔案);`generateVideo`(Task 2,`import { generateVideo } from "../../../tools/seedance.mjs"`)
- Produces:CLI 主流程(無額外 export;`main()` 走 `process.argv.slice(2)` 當國家代碼清單)

此任務是「讀寫真實檔案 + 呼叫真實網路 API」的整合邏輯,不寫自動化測試(跟現有 `img-merge.mjs`/`deep-merge.mjs` 一致,這類批次腳本本來就沒有測試,靠 Task 6 的手動跑一次驗證)。Task 3 已經把可測的邏輯(prompt 組句、篩選待生成清單)拆成純函式測過了。

- [ ] **Step 1: 在 `video-merge.mjs` 補上主流程,比照 `img-merge.mjs` 的錯誤處理與統計輸出風格**

在檔案最後(四個純函式之後)加:

```js
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { generateVideo } from "../../../tools/seedance.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../");
const codeToFile = (c) => c.replace(/[ .]/g, "_");
const CLIP_DURATION_SEC = 5;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function generateOne({ apiKey, baseUrl, model, prompt, imagePath, outPath }) {
  return generateVideo({ imagePath, prompt, durationSec: CLIP_DURATION_SEC, outPath, apiKey, baseUrl, model });
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(/^y(es)?$/i.test(answer.trim())); }));
}

async function run(codes, { skipConfirm = false } = {}) {
  const apiKey = process.env.SEEDANCE_API_KEY;
  const baseUrl = process.env.SEEDANCE_API_BASE;
  const model = process.env.SEEDANCE_MODEL;
  if (!apiKey || !baseUrl || !model) {
    console.error("缺環境變數:SEEDANCE_API_KEY / SEEDANCE_API_BASE / SEEDANCE_MODEL 都要設");
    process.exit(1);
  }

  // 先把要處理的國家全部讀進記憶體,算出「即將生成幾支、預估幾秒」給創辦人看過再動手,
  // 不在使用者不知情的狀況下就開始打付費 API。
  const loaded = [];
  let totalClips = 0;
  for (const code of codes) {
    const jsonPath = path.join(repo, "data", "deep", `${codeToFile(code)}.json`);
    if (!fs.existsSync(jsonPath)) { console.log(`[${code}] data/deep 檔不存在,跳過`); continue; }
    const d = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    d.credits = Array.isArray(d.credits) ? d.credits : [];
    const pendingCards = pickPendingCardItems(d);
    const needHero = heroPending(d);
    totalClips += pendingCards.length + (needHero ? 1 : 0);
    loaded.push({ code, jsonPath, d, pendingCards, needHero });
  }

  if (totalClips === 0) { console.log("沒有需要生成的短片(全部已有 video/hero_video,或都沒有 image 可當參考圖)。"); return; }
  console.log(`即將生成 ${totalClips} 支短片,預估總時長 ${totalClips * CLIP_DURATION_SEC} 秒。`);
  if (!skipConfirm) {
    const ok = await confirm("確定要開始生成嗎?(y/N) ");
    if (!ok) { console.log("已取消,沒有呼叫任何 API。"); return; }
  }

  let generated = 0, skipped = 0, failed = 0;
  const warnings = [];

  for (const { code, jsonPath, d, pendingCards, needHero } of loaded) {
    const outDir = path.join(repo, "assets", "deep", codeToFile(code));
    let changed = false;

    if (needHero) {
      try {
        const outPath = path.join(outDir, "hero.mp4");
        await generateOne({ apiKey, baseUrl, model, prompt: buildHeroPrompt(d), imagePath: undefined, outPath });
        d.hero_video = "hero.mp4";
        d.credits.push({ file: "hero.mp4", title: "AI 生成短片", author: "Seedance 2.5(ByteDance)", license: "AI-generated", source: "" });
        generated++; changed = true;
        console.log(`✓ [${code}] hero.mp4`);
      } catch (err) {
        warnings.push(`[${code}] hero 短片生成失敗:${err.message}`); failed++;
      }
      await sleep(1500);
    } else skipped++;

    for (const { section, item } of pendingCards) {
      const slug = item.image.replace(/\.jpg$/i, "");
      const fname = `${slug}.mp4`;
      try {
        const outPath = path.join(outDir, fname);
        await generateOne({
          apiKey, baseUrl, model,
          prompt: buildCardPrompt(section, item),
          imagePath: path.join(outDir, item.image),
          outPath,
        });
        item.video = fname;
        d.credits.push({ file: fname, title: "AI 生成短片", author: "Seedance 2.5(ByteDance)", license: "AI-generated", source: item.image });
        generated++; changed = true;
        console.log(`✓ [${code}] ${fname}`);
      } catch (err) {
        warnings.push(`[${code}] ${section}「${item.zh}」短片生成失敗:${err.message}`); failed++;
      }
      await sleep(1500);
    }

    if (changed) fs.writeFileSync(jsonPath, JSON.stringify(d, null, 2) + "\n", "utf8");
  }

  if (warnings.length) console.log("警告:\n" + warnings.map((x) => "  - " + x).join("\n"));
  console.log(`\n合計:生成 ${generated} 支、略過 ${skipped}、失敗 ${failed}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMain) {
  const rawArgs = process.argv.slice(2);
  const skipConfirm = rawArgs.includes("--yes");
  const codes = rawArgs.filter((a) => a !== "--yes");
  if (!codes.length) { console.error("用法: node video-merge.mjs TW JP CH GR [--yes]"); process.exit(1); }
  run(codes, { skipConfirm }).catch((err) => { console.error("失敗:", err); process.exit(1); });
}
```

- [ ] **Step 2: 確認既有純函式測試沒被這次修改破壞**

Run: `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/video-merge.test.mjs test/seedance.test.mjs`
Expected: PASS(Task 1-3 的測試都還過,因為這步只是加程式碼、沒改動已 export 的純函式簽名)

- [ ] **Step 3: Commit**

```bash
git add .superpowers/sdd/country-encyclopedia/video-merge.mjs
git commit -m "feat(video-merge): 主流程串接 seedance.mjs,寫回 JSON + credits"
```

---

### Task 5: 前端播放 — `encyclopedia.js` + CSS

**Files:**
- Modify: `src/ui/encyclopedia.js:128-138`(`card()`)、`src/ui/encyclopedia.js:146-156`(`render()` 的 hero 區塊)
- Modify: `index.html:216-258`(`.enc-hero`、`.enc-card` 相關 CSS)、`index.html` journal 主題區塊(`.enc-card img` 附近,約行 351)

**Interfaces:**
- Consumes:`data/deep/<CODE>.json` 可能多出的 `hero_video`(頂層字串)、每個卡片項目可能多出的 `video`(字串)——這兩個欄位由 Task 4 的 `video-merge.mjs` 寫入。
- 沒有這兩個欄位時,輸出必須跟修改前逐位元組相同(向下相容)。

- [ ] **Step 1: 修改 `card()`,`it.video` 存在時輸出 `<video>` 取代 `<img>`**

`src/ui/encyclopedia.js:128-138` 現在是:

```js
  function card(code, it) {
    const href = esc(wikiUrl(it));
    const img = it.image
      ? `<a href="${href}" target="_blank" rel="noopener" class="enc-card-imglink">` +
        `<img src="${IMG_BASE}${encodeURIComponent(codeToFile(code))}/${encodeURIComponent(it.image)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>`
      : "";
    const en = it.en ? `<span class="enc-card-en">${esc(it.en)}</span>` : "";
    return `<div class="enc-card">${img}<div class="enc-card-body">` +
      `<a href="${href}" target="_blank" rel="noopener" class="enc-card-title"><b>${esc(it.zh)}</b> ${en} <span class="enc-ext">↗</span></a>` +
      `<p>${esc(it.note || "")}</p></div></div>`;
  }
```

改成(只動 `img` 這段的組出邏輯,其餘不動):

```js
  function card(code, it) {
    const href = esc(wikiUrl(it));
    const base = `${IMG_BASE}${encodeURIComponent(codeToFile(code))}/`;
    let img = "";
    if (it.video) {
      const posterAttr = it.image ? ` poster="${base}${encodeURIComponent(it.image)}"` : "";
      img = `<a href="${href}" target="_blank" rel="noopener" class="enc-card-imglink">` +
        `<video class="enc-card-video"${posterAttr} src="${base}${encodeURIComponent(it.video)}" autoplay muted loop playsinline onerror="this.parentNode.remove()"></video></a>`;
    } else if (it.image) {
      img = `<a href="${href}" target="_blank" rel="noopener" class="enc-card-imglink">` +
        `<img src="${base}${encodeURIComponent(it.image)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>`;
    }
    const en = it.en ? `<span class="enc-card-en">${esc(it.en)}</span>` : "";
    return `<div class="enc-card">${img}<div class="enc-card-body">` +
      `<a href="${href}" target="_blank" rel="noopener" class="enc-card-title"><b>${esc(it.zh)}</b> ${en} <span class="enc-ext">↗</span></a>` +
      `<p>${esc(it.note || "")}</p></div></div>`;
  }
```

- [ ] **Step 2: 修改 `render()` 的 hero 區塊,`d.hero_video` 存在時多插入短片**

`src/ui/encyclopedia.js:151-156` 現在是:

```js
    let h = `<header class="enc-hero enc-reveal"><div class="enc-hero-main">` +
      `<div class="enc-en">${esc(d.name_en || "")}</div>` +
      `<h2>${esc(d.name_zh || code)}</h2>` +
      (d.summary ? `<p class="enc-lead">${esc(d.summary)}</p>` : "") +
      `<p class="enc-ext-hint">帶 <span class="enc-ext">↗</span> 的標題與圖片可點擊,連到維基百科查看更完整的介紹(另開新分頁)。</p>` +
      `</div>${flag}</header>`;
```

改成(在 `</div>${flag}` 之前插入短片區塊):

```js
    const heroVideo = d.hero_video
      ? `<video class="enc-hero-video" src="${IMG_BASE}${encodeURIComponent(codeToFile(code))}/${encodeURIComponent(d.hero_video)}" autoplay muted loop playsinline onerror="this.remove()"></video>`
      : "";
    let h = `<header class="enc-hero enc-reveal"><div class="enc-hero-main">` +
      `<div class="enc-en">${esc(d.name_en || "")}</div>` +
      `<h2>${esc(d.name_zh || code)}</h2>` +
      (d.summary ? `<p class="enc-lead">${esc(d.summary)}</p>` : "") +
      `<p class="enc-ext-hint">帶 <span class="enc-ext">↗</span> 的標題與圖片可點擊,連到維基百科查看更完整的介紹(另開新分頁)。</p>` +
      `</div>${heroVideo}${flag}</header>`;
```

- [ ] **Step 3: 補 CSS(`index.html`)**

在 `index.html:250` 的 `#encyclopedia .enc-card img { ... }` 規則後面加一行同尺寸的 video 規則,並在 `#encyclopedia .enc-flag { ... }`(行 218)後面加 hero video 規則:

```css
  #encyclopedia .enc-card video { display: block; width: 100%; height: 184px; object-fit: cover; background: rgba(255,255,255,.05); }
  #encyclopedia .enc-hero-video { width: 240px; flex: 0 0 auto; border-radius: 3px; box-shadow: 0 10px 34px rgba(0,0,0,.45); object-fit: cover; }
```

在 journal 主題區塊(`#encyclopedia[data-enc-theme="journal"] .enc-card img { background: #efe7d6; height: 150px; }` 那一行附近)加對應規則:

```css
  #encyclopedia[data-enc-theme="journal"] .enc-card video { background: #efe7d6; height: 150px; }
```

- [ ] **Step 4: 手動瀏覽器驗證(向下相容 + 新欄位都要看)**

1. 起本機伺服器:`powershell -ExecutionPolicy Bypass -File .\serve.ps1`,瀏覽器開 `http://localhost:8760/`。
2. 點一個**本階段沒有處理的國家**(例如美國 US)開大百科,確認畫面跟修改前一樣(卡片是 `<img>`、頁首沒有短片區塊、無 console 錯誤)。
3. 在 `data/deep/TW.json` 手動臨時加一筆測試欄位(例如隨便一個 `animals[0].video = "test-nonexistent.mp4"`),重整頁面,確認影片載入失敗時 `onerror` 有把該卡片圖片區塊移除、不破版;改完記得 `git checkout -- data/deep/TW.json` 復原,不要把測試用的假欄位留下來。
4. Console 開著看有沒有紅字錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/ui/encyclopedia.js index.html
git commit -m "feat(大百科): 卡片/頁首支援短片播放(video 欄位不存在時完全照舊)"
```

---

### Task 6: Pilot 實跑(需要你自己的 API 帳號,會產生實際費用)

**⚠️ 這個任務不是自動化任務,需要創辦人本人執行,執行前務必先跟創辦人確認金鑰已申請好、清楚實際費率。** Subagent 或自動化流程**不應該**自己跑這個任務。

- [ ] **Step 1: 申請帳號、設定環境變數**

在 BytePlus ModelArk(國際版)或火山引擎 Ark(中國版)申請帳號、拿到 API Key,在 PowerShell(本機,不要寫進任何檔案):

```bash
$env:SEEDANCE_API_KEY = "你的金鑰"
$env:SEEDANCE_API_BASE = "https://ark.cn-beijing.volces.com/api/v3"
$env:SEEDANCE_MODEL = "doubao-seedance-2.5"
```

(實際 `SEEDANCE_API_BASE` / `SEEDANCE_MODEL` 值,以你申請到的帳號的官方文件為準;上面只是預設猜測值。)

- [ ] **Step 2: 單張圖跑 CLI,確認能拿到 mp4**

```bash
F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe tools/seedance.mjs --image assets/deep/JP/animals-macaque.jpg --prompt "日本獼猴在溫泉中泡湯,蒸氣緩緩升起,寫實紀錄片風格" --duration 5 --out /tmp/test.mp4
```

打開 `/tmp/test.mp4` 確認畫面合理。如果 API 回傳格式跟 Task 2 寫的 `submitTask`/`pollTask` 對不上,對照官方文件調整這兩個函式(其餘程式不用動),重跑這步直到成功。

- [ ] **Step 3: 跑批次,產生 TW/JP/CH/GR 四國**

```bash
F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe .superpowers/sdd/country-encyclopedia/video-merge.mjs TW JP CH GR
```

腳本會先印出「即將生成 N 支短片、預估總時長 M 秒」,等你輸入 `y` 確認才會真的開始打 API(不想每次手動按可以加 `--yes`,但建議第一次先手動確認、看清楚數字再按)。跑完看終端機印出的「生成/略過/失敗」統計與警告清單。

- [ ] **Step 4: 瀏覽器確認四國效果、確認其他國家沒受影響**

起 `serve.ps1`,分別開 台灣/日本/瑞士/希臘 大百科頁,確認頁首與卡片短片正常自動播放;隨便點一個沒在這批的國家,確認完全沒變。

- [ ] **Step 5: Commit 新產生的媒體與 JSON**

```bash
git add assets/deep/TW assets/deep/JP assets/deep/CH assets/deep/GR data/deep/TW.json data/deep/JP.json data/deep/CH.json data/deep/GR.json
git commit -m "content(大百科): TW/JP/CH/GR 短片(Seedance 2.5 pilot)"
```
