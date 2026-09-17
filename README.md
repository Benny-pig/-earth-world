# 地球世界 (Earth World)

3D 互動地球儀:在星空中緩慢自轉的貼圖地球,搭配柔光照明與溫和的 Bloom 後製,營造寧靜、深邃的太空氛圍。

**線上體驗:https://benny-pig.github.io/-earth-world/**(GitHub Pages)

## 地球世界

一個以 3D 地球儀為中心的互動式視覺作品:地球置於銀河星海中自轉,雲層飄動;
國家邊界常駐、中文(繁體)名稱標籤,滑鼠移上去高亮、點擊則鏡頭飛入、該國抬起並在
右側側欄顯示國旗、特色、適合旅遊月份、歷史;右上角依所選國家顯示當地時間與即時天氣;
背景有宇宙 ambient 音樂。

## 執行

需求:Windows + PowerShell + Chrome/Edge。

1. `powershell -ExecutionPolicy Bypass -File .\serve.ps1`
2. 瀏覽器開 `http://localhost:8761/`(這台機器上 Windows 偶爾會動態排除某個埠導致綁定失敗;若啟動失敗,換個埠重跑即可:`$env:PORT=8762; .\serve.ps1`)

不需安裝任何套件(three.js / earcut 由 CDN 載入)。

## 操作

- 左鍵拖曳:轉動地球;滾輪:縮放
- 移到地球上:暫停自轉;移到國家:高亮 + 名稱
- 點擊國家:鏡頭飛入 + 該國抬起 + 右側介紹面板;Esc 或關閉鈕:回全球視角
- 側欄「詳細介紹 ›」:開啟整頁「國家大百科」(見下)
- 頂部搜尋欄:輸入中/英名或代碼跳到該國
- 左下角:背景音樂靜音 / 音量 / 曲目切換(第一次點畫面後開始播放)

## 國家大百科

側欄的「詳細介紹 ›」會開啟一頁全螢幕大百科:國旗、總覽、**國家的生成與發展**、
**重大歷史事蹟**年表、**特色動物 / 特色食物 / 著名景點 / 著名名人**(圖文卡片)、
**推薦玩法**、**圖片來源**。Esc / 返回 收起、回到地球(側欄保留)。

- 內容每國一檔:`data/deep/<CODE>.json`,**點「詳細介紹」時才載入**(Map 快取;沒有該檔 → 顯示「建置中」)。
- 目前有 20 個重點國:`JP TW US KR CN TH VN IN FR IT ES DE GB GR EG CA MX BR AU NZ`,每國約 20 張圖。其餘國家之後分批補。
- 每張卡片(動物/食物/景點/名人)標題與圖片都連到中文維基。
- 「匯率換算(對新臺幣)」:即時匯率(open.er-api.com,每日更新)+ 雙向換算輸入框。
- 「行程建議」:每國 5 條熱門路線(含天數)+ 3 條私房路線;「找台灣出發的行程」一鍵連到雄獅/易遊網/KKday/Klook 的該國搜尋頁。
- 「縣市地圖」(臺灣/日本/美國):2D 一級行政區地圖,全縣市繁中標名、首都 ★,點縣市看特色 + 推薦。資料 Natural Earth ne_10m_admin_1(公有領域)。
- 右上角可切換版面主題:「深空」(深色)/「旅誌」(米白編輯風)。
- 圖片:`assets/deep/<CODE>/*.jpg`,全部來自 **Wikimedia Commons**,授權限 **CC0 / 公有領域 / CC BY / CC BY-SA**,
  每張都在該國 JSON 的 `credits` 標註作者 / 授權 / 來源網址,大百科頁底列出。
- 加新國家:內容 subagent 依 `.superpowers/sdd/country-encyclopedia/content-brief-template.md` 產 `batch-deep-N.json`
  → `node .superpowers/sdd/country-encyclopedia/deep-merge.mjs batch-deep-N.json`(驗授權 + 抓圖 + Pillow 縮到 1024/q82)。
- 大百科短片(pilot,TW/JP/CH/GR):`tools/seedance.mjs` 是 Seedance 2.5 image-to-video 的核心模組 + 獨立 CLI(金鑰/base URL/model 從環境變數 `SEEDANCE_API_KEY`/`SEEDANCE_API_BASE`/`SEEDANCE_MODEL` 讀);批次跑 `node .superpowers/sdd/country-encyclopedia/video-merge.mjs TW JP CH GR` 補齊卡片與頁首短片。

## 開發

- 前端純 ES Modules,無建置工具;`three@0.160.0` 透過 importmap 載入。
- 本機開發伺服器:`serve.ps1`(預設 http://localhost:8761/;8760 在部分 Windows 機器上被系統保留無法綁定,故改用 8761)。
- 純函式測試:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test`(在 repo 根目錄執行)
- 設計文件:`docs/superpowers/specs/2026-09-08-earth-world-design.md`、`…/2026-09-09-earth-world-encyclopedia-design.md`
- 實作計畫:`docs/superpowers/plans/2026-09-08-earth-world.md`、`…/2026-09-09-earth-world-encyclopedia.md`

## 資料來源

- 8K 地球貼圖:Solar System Scope (https://www.solarsystemscope.com/textures/), CC BY 4.0
- 雲層貼圖:Solar System Scope (https://www.solarsystemscope.com/textures/), CC BY 4.0(縮至 2K)
- 銀河星空全景:ESO / Serge Brunier — "The Milky Way panorama" (eso0932a), CC BY 4.0
- 背景音樂(左下角可切換,選擇會記住;預設「地球世界」):
  - **原創配樂**(`tools/compose-music.py` 用 numpy/scipy 合成,無縫循環):
    「地球世界」流行宇宙 · 「水晶空靈」玻璃鐘 + 超長殘響 · 「SPA 療養」暖 pad + 五聲慢旋律 + 水聲 ·
    「深空冥想」低頻 drone + 稀疏高音 · 「星塵電子」十六分琶音 + 旋律 lead(atmospheric melodic electronic)
  - 「Invariance」— Kevin MacLeod (incompetech.com), CC BY 4.0(沉浸式宇宙 ambient)
  - 重算原創曲:`python tools/compose-music.py [preset ...]`。新增曲目:檔案放 `assets/music/`,在 `src/audio/music.js` 的 `TRACKS` 加一列
  - (拉格納洛克 Prontera 主題有版權,不能用)
- 大百科圖片:Wikimedia Commons,各張授權見 `data/deep/<CODE>.json` 的 `credits`(CC0 / 公有領域 / CC BY / CC BY-SA)
