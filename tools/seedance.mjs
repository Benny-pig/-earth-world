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
