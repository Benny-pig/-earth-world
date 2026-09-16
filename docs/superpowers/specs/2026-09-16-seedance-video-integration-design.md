# 地球世界 — 大百科短片整合(Seedance 2.5)設計

**狀態**:待創辦人審閱
**日期**:2026-09-16
**前置**:[[2026-09-09-earth-world-encyclopedia-design]](大百科 schema 與圖文卡片)

---

## 1. 目標

用 ByteDance Seedance 2.5(image-to-video)替大百科的卡片與頁首生成短片,搭配現有的圖文卡片(**圖片保留,不是取代**),讓頁面從純靜態圖文變成會動的介紹。

本階段(pilot)先做 **4 個國家**:`TW JP CH GR`(台灣、日本、瑞士、希臘)。每國生成:
- 1 支「頁首介紹短片」(`hero_video`)
- 該國 `animals` / `foods` / `landmarks` / `people` 四類中,**已有 `image` 的每一筆**各 1 支短片

跑完後由創辦人看效果與實際花費,再決定要不要擴大到其餘國家。

站台本身是**純靜態、無後端**(three.js + ES Modules,CDN 載入,無建置工具),所以短片生成一定是**離線批次**做完後把 mp4 commit 進 repo,瀏覽器端只負責播放,不會在前端呼叫 Seedance API(避免金鑰外洩與被訪客亂刷費用)。

## 2. Schema 擴充

沿用 `data/deep/<CODE>.json` 現有結構,新增兩個選填欄位:

```json
{
  "hero_video": "hero.mp4",
  "animals": [
    { "zh": "日本獼猴", "en": "Japanese macaque", "note": "...", "image": "animals-macaque.jpg", "video": "animals-macaque.mp4" }
  ]
}
```

- `hero_video`:選填,頂層欄位,`assets/deep/<CODE>/` 下的檔名。
- 每個 `animals` / `foods` / `landmarks` / `people` 項目的 `video`:選填,同目錄下的檔名,**只在該項目已有 `image` 時才會生成**(用現有圖當參考圖)。
- `credits` 陣列比照現有圖片的記法,每支生成的影片補一筆:
  ```json
  { "file": "animals-macaque.mp4", "title": "AI 生成短片", "author": "Seedance 2.5(ByteDance)",
    "license": "AI-generated", "source": "animals-macaque.jpg" }
  ```
  `source` 記來源參考圖檔名,方便追溯是哪張圖生成的。
- 沒有 `video` 欄位的項目(尚未生成,或該項目本來就沒有 `image`)完全不受影響,前端照舊只顯示圖片。

## 3. 影片產線

跟現有 `img-merge.mjs` 的分工方式一致(讀 JSON → 補媒體 → 回寫 JSON),分兩層:

### 3.1 `tools/seedance.mjs` — 核心模組 + 獨立 CLI

- 匯出 `generateVideo({ imagePath, prompt, durationSec, outPath })`:送出 image-to-video 任務、輪詢狀態、下載完成的 mp4 存到 `outPath`。
- 金鑰、API base URL、model id 一律從環境變數讀(`SEEDANCE_API_KEY`、`SEEDANCE_API_BASE`、`SEEDANCE_MODEL`),**不寫死、不進 repo**。
- 直接執行時當獨立工具用,方便單支測試:
  ```bash
  node tools/seedance.mjs --image assets/deep/JP/animals-macaque.jpg \
    --prompt "日本獼猴在溫泉中泡湯,蒸氣緩緩升起,寫實紀錄片風格" \
    --duration 5 --out /tmp/test.mp4
  ```
- **實作備註**:Seedance 2.5 目前有兩個介接管道(BytePlus ModelArk 國際版 / 火山引擎 Ark 中國版),兩者的簽章方式與確切 request/response 欄位需要在你申請帳號、拿到官方 API 文件後才能對照著寫準——本設計先把模組介面(輸入/輸出、環境變數、CLI 參數)定下來,實際打 API 那段等你有帳號後我再對著官方文件填。

### 3.2 `.superpowers/sdd/country-encyclopedia/video-merge.mjs` — 批次合併腳本

用法:`node video-merge.mjs TW JP CH GR`

對每個代碼:
1. 讀 `data/deep/<CODE>.json`。
2. 若 `hero_video` 不存在:用 `summary` 組 prompt,無參考圖(text-to-video),生成後存 `assets/deep/<CODE>/hero.mp4`,設定 `hero_video`。
3. 掃 `animals` / `foods` / `landmarks` / `people`:對每個「有 `image` 但沒有 `video`」的項目,呼叫 `generateVideo`,參考圖是現有 jpg,prompt 由 `zh` + `note` 自動組句;完成後設定 `video` 欄位、補 `credits`。
4. 已有 `video` 的項目跳過(可重複執行、中斷後可續跑,比照 `img-merge.mjs` 的 `if (target.image) { skipped++; continue; }` 模式)。
5. 單筆失敗只記警告、不中斷整批(比照現有 `warnings` 陣列 + 最後統一印出的模式)。
6. 每處理完一國就寫回該國 JSON(避免中途中斷時整批遺失進度)。
7. 呼叫之間加小間隔,避免瞬間送太多任務觸發 rate limit。

## 4. 前端整合(`src/ui/encyclopedia.js`)

- `card(code, it)`:`it.video` 存在時,圖片改成
  ```html
  <video class="enc-card-video" poster="<現有jpg路徑>" src="<mp4路徑>" autoplay muted loop playsinline></video>
  ```
  沒有 `video` 就完全照現在的邏輯輸出 `<img>`——**其餘 16 國、以及本階段沒生成到的卡片不受任何影響**。
- 頁首(`enc-hero`):`d.hero_video` 存在時,在 `enc-hero-main` 旁邊加一段背景/並排短片區塊;不存在就維持現在只有國旗的樣子。
- CSS(`src/ui` 對應的樣式檔):`.enc-card-video` 比照 `.enc-card img` 的尺寸/圓角規則;新增 `.enc-hero-video` 的版位規則。
- 影片載入失敗(檔案不存在等)比照現有圖片的 `onerror` 做法,失敗就移除該元素,不破版。

## 5. 金鑰與成本控制

- API 金鑰只存在本機環境變數,由你自己在申請帳號後設定(例如 PowerShell:`$env:SEEDANCE_API_KEY = "..."`),**不進 git、不寫進任何 commit 的檔案**。
- 生成一律是你在本機手動執行 `video-merge.mjs`,不是網站自動觸發,費用完全在你的掌控之下。
- Seedance 2.5 是照秒數/解析度計費(第三方轉售價約 480p 每秒 US$0.15、1080p 每秒 US$0.79,實際費率以你申請到的官方帳單為準),生成前腳本會印出「即將生成 N 支短片,預估總時長 M 秒」讓你確認,不會靜默狂發請求。
- 本階段只鎖定 `TW JP CH GR` 四國,不會誤觸其他 16 國。

## 6. 測試計畫

- `tools/seedance.mjs` 裡的純函式(prompt 組句、輪詢間隔退避邏輯)用 `node --test` 覆蓋,不需要真的打 API。
- `video-merge.mjs` 的 JSON 讀寫/欄位判斷邏輯(哪些項目該生成、哪些該跳過)一樣用假資料做單元測試,不觸發真實 API 呼叫。
- 真正的 API 串接:先用 `tools/seedance.mjs` 的 CLI 對單一張圖跑一次,確認能拿到 mp4 且畫面合理,再跑 `video-merge.mjs` 對 4 個國家的完整批次。
- 前端:本機起 `serve.ps1`,開大百科頁面確認 TW/JP/CH/GR 的短片自動播放、靜音、循環,其餘國家頁面維持原樣(純圖片、無迴歸)。

## 7. 範圍外(本階段不做)

- 不做其餘 16 個既有國家、也不做尚未建置大百科的其他國家。
- 不做卡片以外的其他媒體(音樂、音效)變更。
- 不做「hover 才播放」之類的互動節流,先用自動循環播放驗證效果;如果之後畫面太雜或效能有問題再回頭調整。
