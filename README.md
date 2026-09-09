# 地球世界 (Earth World)

3D 互動地球儀:在星空中緩慢自轉的貼圖地球,搭配柔光照明與溫和的 Bloom 後製,營造寧靜、深邃的太空氛圍。

## 地球世界

一個以 3D 地球儀為中心的互動式視覺作品:地球置於銀河星海中自轉,雲層飄動;
國家邊界常駐、中文(繁體)名稱標籤,滑鼠移上去高亮、點擊則鏡頭飛入、該國抬起並在
右側側欄顯示國旗、特色、適合旅遊月份、歷史;右上角依所選國家顯示當地時間與即時天氣;
背景有宇宙 ambient 音樂。

## 執行

需求:Windows + PowerShell + Chrome/Edge。

1. `powershell -ExecutionPolicy Bypass -File .\serve.ps1`
2. 瀏覽器開 `http://localhost:8760/`

不需安裝任何套件(three.js / earcut 由 CDN 載入)。

## 操作

- 左鍵拖曳:轉動地球;滾輪:縮放
- 移到地球上:暫停自轉;移到國家:高亮 + 名稱
- 點擊國家:鏡頭飛入 + 該國抬起 + 右側介紹面板;Esc 或關閉鈕:回全球視角
- 左下角:背景音樂靜音 / 音量(第一次點畫面後開始播放)

## 開發

- 前端純 ES Modules,無建置工具;`three@0.160.0` 透過 importmap 載入。
- 本機開發伺服器:`serve.ps1`(預設 http://localhost:8760/)。
- 純函式測試:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test`(在 repo 根目錄執行)
- 設計文件:`docs/superpowers/specs/2026-09-08-earth-world-design.md`
- 實作計畫:`docs/superpowers/plans/2026-09-08-earth-world.md`

## 資料來源

- 8K 地球貼圖:Solar System Scope (https://www.solarsystemscope.com/textures/), CC BY 4.0
- 雲層貼圖:Solar System Scope (https://www.solarsystemscope.com/textures/), CC BY 4.0(縮至 2K)
- 銀河星空全景:ESO / Serge Brunier — "The Milky Way panorama" (eso0932a), CC BY 4.0
- 背景音樂:"Impact Lento" — Kevin MacLeod (incompetech.com), CC BY 4.0
  (要換成其他曲子,把 mp3 覆蓋 `assets/music.mp3` 即可)
