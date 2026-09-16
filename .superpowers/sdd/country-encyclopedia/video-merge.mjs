// node video-merge.mjs TW JP CH GR
// 掃 data/deep/<CODE>.json,對「已有 image 但沒有 video」的卡片、以及缺 hero_video 的國家,
// 呼叫 tools/seedance.mjs 的 generateVideo 生成短片,存到 assets/deep/<CODE>/,回寫 JSON + credits。
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateVideo } from "../../../tools/seedance.mjs";

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

export function isMainModule(argv1, metaUrl) {
  return Boolean(argv1) && metaUrl === pathToFileURL(argv1).href;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../");
const codeToFile = (c) => c.replace(/[ .]/g, "_");
const CLIP_DURATION_SEC = 5;
const RESOLUTION = "480p";
const RATE_USD_PER_SEC = { "480p": 0.15, "1080p": 0.79 };
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function generateOne({ apiKey, baseUrl, model, prompt, imagePath, outPath }) {
  return generateVideo({ imagePath, prompt, durationSec: CLIP_DURATION_SEC, outPath, apiKey, baseUrl, model, resolution: RESOLUTION });
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
  let skippedCards = 0;
  for (const code of codes) {
    const jsonPath = path.join(repo, "data", "deep", `${codeToFile(code)}.json`);
    if (!fs.existsSync(jsonPath)) { console.log(`[${code}] data/deep 檔不存在,跳過`); continue; }
    const d = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    d.credits = Array.isArray(d.credits) ? d.credits : [];
    const pendingCards = pickPendingCardItems(d);
    const needHero = heroPending(d);
    let totalWithImage = 0;
    for (const section of SECTIONS) {
      for (const item of d[section] || []) {
        if (item.image) totalWithImage++;
      }
    }
    skippedCards += totalWithImage - pendingCards.length;
    totalClips += pendingCards.length + (needHero ? 1 : 0);
    loaded.push({ code, jsonPath, d, pendingCards, needHero });
  }

  if (totalClips === 0) { console.log("沒有需要生成的短片(全部已有 video/hero_video,或都沒有 image 可當參考圖)。"); return; }
  const totalSec = totalClips * CLIP_DURATION_SEC;
  const estUsd = (totalSec * RATE_USD_PER_SEC[RESOLUTION]).toFixed(2);
  console.log(`即將生成 ${totalClips} 支短片,預估總時長 ${totalSec} 秒,以 ${RESOLUTION} 費率估計約 US$${estUsd}(第三方轉售參考價,實際費率以官方帳單為準)。`);
  if (!skipConfirm) {
    const ok = await confirm("確定要開始生成嗎?(y/N) ");
    if (!ok) { console.log("已取消,沒有呼叫任何 API。"); return; }
  }

  let generated = 0, skipped = skippedCards, failed = 0;
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

const isMain = isMainModule(process.argv[1], import.meta.url);
if (isMain) {
  const rawArgs = process.argv.slice(2);
  const skipConfirm = rawArgs.includes("--yes");
  const codes = [];
  for (const a of rawArgs) {
    if (a === "--yes") continue;
    if (a.startsWith("--")) { console.error(`忽略不認得的參數:${a}`); continue; }
    codes.push(a);
  }
  if (!codes.length) { console.error("用法: node video-merge.mjs TW JP CH GR [--yes]"); process.exit(1); }
  run(codes, { skipConfirm }).catch((err) => { console.error("失敗:", err); process.exit(1); });
}
