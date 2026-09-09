# 地球世界 — 國家大百科(Wave B)設計

**狀態**:待創辦人審閱
**日期**:2026-09-09
**前置**:[[2026-09-08-earth-world-design]](階段一)、`data/countries.content.json`(側欄簡介,177 國)

---

## 1. 目標

側欄簡介之外,替每個國家提供一頁「大百科」:國家生成與發展史、特色動物、特色食物、著名景點、推薦景點、著名名人、重大歷史事蹟等,搭配 Wikimedia Commons 的自由授權圖片。資料上網從 Wikipedia / Wikimedia 蒐集。

本階段先做 **20 個重點國家**(與側欄簡介同一批:`JP KR CN TW TH VN IN FR IT ES DE GB GR EG US CA MX BR AU NZ`),驗證整條資料產線與版面,再分批擴到 177 國。

## 2. 使用者流程

1. 點國家 → 側欄照舊(簡介、美食、一週天氣、旅遊月份、歷史)。
2. 側欄標題下新增按鈕「**詳細介紹 ›**」。
3. 點按鈕 → 全螢幕疊層頁 `#encyclopedia` 由下往上滑入(地球在底層繼續轉、稍微變暗)。
4. 疊層頁分區塊、可捲動;右上角 ✕、鍵盤 Esc、或點頂部返回列 → 關閉,回到地球(側欄維持開著)。
5. 尚未建置的國家 → 疊層頁顯示「這個國家的大百科還在建置中,之後會補上」。

不做網址路由 / 深連結(創辦人已選「疊層頁」而非「獨立路由」)。

## 3. 資料

### 3.1 儲存:每國一檔,點擊時才載入

`data/deep/<CODE>.json`(如 `data/deep/JP.json`)。**不併進 `countries.content.json`**——避免首頁載入被拖慢。疊層頁開啟時 `fetch('/data/deep/<code>.json')`,以 `Map` 快取;404 視為「尚未建置」。

`<CODE>` 用與其他資料一致的代碼規則(`ISO_A2_EH → ISO_A2 → NAME.toUpperCase()`);`N. CYPRUS`、`SOMALILAND` 這種含空白的代碼,檔名把空白與點換成底線:`data/deep/N._CYPRUS.json`。

### 3.2 每國 JSON schema

```json
{
  "code": "JP",
  "name_zh": "日本", "name_en": "Japan",
  "summary": "2–3 句總覽,定位這個國家。",
  "founding": [
    "國家生成與發展史,4–6 段,比側欄 history 更完整:起源、關鍵轉折、現代國家的成形、當代定位。"
  ],
  "quick_facts": {
    "official_name_zh": "日本國",
    "area_km2": 377975,
    "languages": ["日語"],
    "religion": "神道與佛教並行,無國教",
    "currency": "日圓(JPY)",
    "government": "議會制君主立憲"
  },
  "animals": [
    { "zh": "日本獼猴", "en": "Japanese macaque", "note": "一句特色說明。", "image": "animals-macaque.jpg" }
  ],
  "foods": [
    { "zh": "壽司", "en": "Sushi", "note": "一句說明。", "image": "foods-sushi.jpg" }
  ],
  "landmarks": [
    { "zh": "富士山", "en": "Mount Fuji", "note": "一句說明。", "latlon": [35.36, 138.73], "image": "landmarks-fuji.jpg" }
  ],
  "recommended": [
    { "zh": "京都", "note": "為什麼推薦、適合的季節與玩法(1–2 句)。" }
  ],
  "people": [
    { "zh": "宮崎駿", "en": "Hayao Miyazaki", "field": "動畫導演", "note": "一句說明。", "image": "people-miyazaki.jpg" }
  ],
  "events": [
    { "year": 1868, "zh": "明治維新,推動現代化與工業化。" }
  ],
  "credits": [
    { "file": "landmarks-fuji.jpg", "title": "Mount Fuji from Lake Kawaguchi",
      "author": "攝影者名", "license": "CC BY-SA 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:..." }
  ]
}
```

- `founding` / `events` 必填;`quick_facts` 必填(允許欄位缺值)。
- `animals` / `foods` / `landmarks` / `recommended` / `people`:各 3–6 筆。
- 每筆的 `image` 選填,是 `assets/deep/<CODE>/` 下的檔名(不是完整路徑);對應的授權資訊一定要在 `credits` 裡。
- 全繁體、台灣用法;敏感題比照側欄:中性事實敘述。

### 3.3 圖片

- 來源:**Wikimedia Commons**,授權限 **CC0 / 公有領域 / CC BY / CC BY-SA**(不用 CC BY-ND、CC BY-NC;不用來源不明或 fair-use 圖)。
- 存放:`assets/deep/<CODE>/<section>-<slug>.jpg`。
- 尺寸:長邊縮到 **1024px**、JPEG quality 82(用 SD 環境的 Pillow;PNG 一律轉 JPG)。
- 每國圖片數上限 **12 張**(旗子不算,旗子仍用 flagcdn)。20 國約 ≤ 240 張、粗估 15–20MB。
- `credits` 每張都要有 `author` + `license` + `source`(Commons File: 頁網址)。疊層頁底部列出「圖片來源」。
- 疊層頁的圖 `loading="lazy"`;`onerror` 隱藏,不破版。

### 3.4 資料產線(subagent 分批)

沿用 177 國內容擴充的模式,但因為牽涉外部下載與授權,**文字與選圖由 subagent 做,實際下載/縮圖/驗證由 controller 做**:

1. controller 每批派一個 subagent(sonnet),給:schema、風格規則、該批國名、以及「可用 WebSearch / WebFetch 查 Wikipedia 與 Wikimedia Commons」。
2. subagent 產出 `batch-deep-N.json` = `{ "<CODE>": { …schema，且每個 image 欄位改成一個 image request 物件 {slug, commons_file, license, author, source, thumb_url} } }`。不自己下載檔案。
3. controller 跑 `deep-merge.mjs`:
   - 驗證 JSON schema、必填欄位、各清單 3–6 筆、授權在白名單、簡體字抽樣。
   - 對每個 image request:`curl` 抓 `thumb_url` → Pillow 縮到 1024/quality 82 存 `assets/deep/<CODE>/<slug>.jpg` → 把 `image` 欄位改成檔名、把授權寫進 `credits`。抓不到就把該筆的 `image` 留空、不擋。
   - 產出 `data/deep/<CODE>.json`。
4. `node --test` + 抽查 + 一批一 commit,ledger 記在 `.superpowers/sdd/country-encyclopedia/progress.md`。

## 4. UI / 程式

### 4.1 檔案

- **新增** `src/ui/encyclopedia.js` — `createEncyclopedia() -> { open(code), close(), isOpen() }`。
  - `open(code)`:顯示 `#encyclopedia`、加 `.open`(CSS transform 滑入)、`fetch` 該國 JSON(帶快取與載入中/404 狀態)、渲染區塊。
  - 區塊順序:封面(國旗 + 國名 + summary + quick_facts 表)→ 國家發展史 → 重大歷史事蹟(年表)→ 特色動物 → 特色食物 → 著名景點 → 推薦景點 → 著名名人 → 圖片來源。
  - 每個清單項目:縮圖(有的話)+ 中文名 + 英文小字 + 一句說明,卡片式。
  - `close()`:移除 `.open`;`Esc`、✕、返回列都呼叫它。
  - 全部字串過既有的 `esc()`(可從 side-panel 抽成共用小module `src/lib/esc.js`,或各自留一份——擇一,plan 定)。
- **`index.html`**:新增 `#encyclopedia` 容器(封面 + `#enc-body`)+ CSS(疊層、滑入 transition、卡片格線、年表、`prefers-reduced-motion` 時不做滑入動畫)。
- **`src/ui/side-panel.js`**:`open(p)` 在標題區加「詳細介紹 ›」按鈕;`createSidePanel({ onClose, onMore })`,按鈕呼叫 `onMore(code)`。
- **`src/main.js`**:`createEncyclopedia()`;`createSidePanel({ …, onMore: (code) => enc.open(code) })`;地球在疊層開啟時可降低 `toneMappingExposure` 或蓋一層半透明遮罩(plan 定,擇一)。
- **`serve.ps1`**:MIME already covers `.json` / `.jpg`,不用動。

### 4.2 效能

- 疊層頁 JSON 與圖都是點開才載入,不影響首頁。
- 疊層開啟時地球迴圈照跑(使用者可能想看它轉);若 FPS 有感掉,plan 階段再考慮暫停 `composer.render()`。

## 5. 測試

- `deep-merge.mjs` 對 20 國 batch 檔的 schema / 授權 / 圖片存在性驗證。
- `geo.test.mjs` 既有 10 項不受影響;若抽出 `esc()` 成 `src/lib/esc.js` 則補 1–2 個測試。
- Claude in Chrome:點「詳細介紹」→ 疊層滑入、各區塊、圖片、Esc 關閉、未建置國家的 fallback。

## 6. YAGNI(這階段不做)

- 網址路由 / 深連結。
- 疊層頁內的地圖標點、景點在地球上高亮(未來可用 `landmarks[].latlon`)。
- 編輯 / 使用者投稿。
- 影片、音訊。
- 圖片 CDN / WebP / 響應式多尺寸(先單一 1024 JPG;177 國時再談)。
- i18n(只有繁中)。

## 7. 分批計畫(概要,細節在 plan)

- Batch 1:先做 `JP TW US` 三國「打通全流程」(subagent 產文字+選圖 → controller 下載縮圖 → merge → UI 渲染 → 瀏覽器實測),確認版面與產線無誤。
- Batch 2:其餘 17 個重點國(`KR CN TH VN IN FR IT ES DE GB GR EG CA MX BR AU NZ`)。
- 之後:每批約 20 國擴到 177(另立 ledger 續跑,比照 `country-content-expansion`)。
