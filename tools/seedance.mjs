// tools/seedance.mjs
// Seedance 2.5 image-to-video 生成:核心模組(可 import)+ 獨立 CLI。
// 用法(CLI):node tools/seedance.mjs --image assets/deep/JP/animals-macaque.jpg \
//   --prompt "日本獼猴在溫泉中泡湯,蒸氣緩緩升起,寫實紀錄片風格" --duration 5 --out /tmp/test.mp4
// 金鑰/base URL/model 一律從環境變數讀:SEEDANCE_API_KEY、SEEDANCE_API_BASE、SEEDANCE_MODEL。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

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
