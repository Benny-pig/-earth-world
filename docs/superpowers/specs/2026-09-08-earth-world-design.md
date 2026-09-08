# 地球世界(Earth World)— 階段一雛形 設計文件

- 日期:2026-09-08
- 專案位置:`F:\Claude\earth-world\`(獨立 git repo)
- 狀態:設計已與創辦人逐段確認,待 spec 覆核後進實作

## 1. 目標與範圍

一個以 3D 地球儀為中心的互動式視覺作品。地球置於宇宙夜空星海中央,無人操作時自轉;
滑鼠可拖曳轉動;國家邊界可懸停高亮、點擊後鏡頭飛入並在側欄顯示該國介紹。
右上角依目前選取的國家顯示其當地時間與天氣。背景有程式即時合成的「宇宙能量感」環境音。

這是一個會長期擴充的大型作品,本文件只涵蓋**階段一雛形**。後續階段(真實地形/山脈/河川的精細
呈現、日夜隨真實時間移動、完整約 200 國深度內容、更多互動)各自另立 spec。

### 階段一必須包含

- 3D 真實貼圖地球 + 自轉(無操作時),滑鼠移到地球上暫停自轉
- 宇宙夜空星海背景
- 滑鼠左鍵拖曳轉動地球、滾輪縮放(限制範圍),不給平移
- GeoJSON 國界:懸停高亮 + tooltip(中文大、英文小備註)
- 點擊國家:鏡頭平滑飛到該國正面並拉近,右側側欄滑入顯示介紹
- 側欄內容:中文國名(主)/ 英文(備註)、首都、時區、特色、適合旅遊月份、歷史介紹
- 右上角時間天氣小元件:依選取國家時區顯示當地日期時間(每秒更新)+ Open-Meteo 天氣
- Web Audio 即時合成環境音,預設靜音,附靜音/音量控制

### 階段一明確不做(YAGNI)

- 每個國家的獨立 3D 地形網格 / 山脈河川建模(改用全球真實高程貼圖表現)
- 即時天氣以外的資料(空氣品質、匯率等)
- 日夜晨昏線隨真實時間移動(太陽方向本階段固定)
- 完整約 200 國的深度內容(本階段精選 15–20 國;其餘可點,顯示「內容建置中」)
- 建置工具鏈(無 Vite/webpack;單頁 + ES modules + CDN three.js)
- 單元測試框架;僅少數純函式用 `node --test`

## 2. 技術方案

**已定**:單頁 `index.html` + ES modules,three.js 以 importmap 從 CDN 載入,
以 `serve.ps1` 起本機 static server(沿用 `F:\Claude\rooster-encyclopedia` 的模式)。

**國家偵測與高亮 — 採方案 A:隱形國家多邊形層 + 射線偵測**

將 GeoJSON 國界多邊形以 earcut 三角化,頂點由經緯度轉為球面座標(半徑較地表大 0.002),
組成近乎透明的 mesh(`MeshBasicMaterial` + `transparent`,靜態 `opacity` 約 0.001),
全部掛在一個 Group 下。每幀以 three.js `Raycaster` 對游標做一次偵測:命中則把該國 mesh
的 `opacity` 提到約 0.28、`color` 轉為淡青作高亮 + 顯示 tooltip;點擊命中則觸發鏡頭飛行 + 開側欄。
國界另以 `LineSegments` 畫細白線常駐。

- 被否決的方案 B(GPU 顏色 ID pickmap):渲染管線較複雜、高亮需另做一套、飛到該國較難。
- 被否決的方案 C(globe.gl / three-globe):少了控制權、多一相依、風格受限。

效能:110m 解析度約 200 國、數萬三角形,單次 raycast 對約 200 個 mesh 可接受;
若效能不足,合併為單一 `BufferGeometry` 並以 groups 區分國家。

## 3. 專案結構

```
earth-world\
  index.html                 canvas + UI 容器 + importmap
  serve.ps1                  本機 static server(含 .json/.jpg mime)
  src\
    main.js                  啟動 + 動畫迴圈
    scene\
      globe.js               地球球體、貼圖、自轉
      starfield.js           星空背景
      camera-controls.js     拖曳轉動、移入暫停、飛到某國的鏡頭補間
    countries\
      country-layer.js       由 geojson 建 mesh、射線偵測、高亮
      borders.js             國界線段幾何
    ui\
      side-panel.js          國家詳情側欄
      tooltip.js             滑鼠懸停標籤
      clock-weather.js       右上角:時區算當地時間 + Open-Meteo 天氣
    audio\
      ambient.js             Web Audio 合成 pad/drone + 靜音鈕
    lib\
      geo.js                 經緯度 <-> 球面座標等純函式
  data\
    countries.geo.json       Natural Earth 110m 國界(~200 國)
    countries.content.json   精選 15–20 國的完整內容
  assets\
    earth-color.jpg / earth-bump.jpg / earth-night.jpg / earth-spec.jpg
  test\
    geo.test.mjs             純函式測試(node --test)
  docs\superpowers\specs\    本設計文件
  README.md
```

## 4. 元件設計

### 4.1 地球 globe.js

- 半徑 1 的 `SphereGeometry`(分段數約 96)。
- `MeshStandardMaterial`:`map` = 彩色貼圖,`bumpMap` = 地形凹凸貼圖,
  `roughnessMap` = 海洋遮罩(水面較亮 / 反光),`emissiveMap` = 夜景燈光(僅在背光面可見,
  `emissive` 設暖白、`emissiveIntensity` 約 1)。
- 光照:一盞 `DirectionalLight` 當太陽(方向本階段固定),加微弱 `AmbientLight` 補暗面。
- 自轉:每幀繞 Y 軸旋轉,約 60 秒一圈。滑鼠 hover 到地球上時暫停;離開 1.5 秒後回復
  (以旗標 + 計時器控制)。

### 4.2 星空 starfield.js

- 約 5000 個 `Points` 隨機分佈於大半徑球殼內,尺寸隨機、以緩慢 sin 相位做微弱閃爍。
- 深色徑向漸層背景(CSS 或大反面球體),偏深藍紫。

### 4.3 鏡頭與操作 camera-controls.js

- 基於 three.js `OrbitControls`:啟用旋轉、縮放(`minDistance` / `maxDistance` 限制),
  停用平移(`enablePan = false`),加阻尼。
- `flyTo(latlon)`:把相機目標經緯度以 tween(約 1 秒,easeInOut)補間到該國中心並拉近一級。
- `resetView()`:回全球視角。觸發時機:側欄關閉鈕、鍵盤 Esc。

### 4.4 國家層 country-layer.js / borders.js

- 載入 `data/countries.geo.json`(FeatureCollection)。對每個 feature:
  - 逐多邊形:外環 + 洞,以 earcut 三角化(經緯度平面),頂點再映射到球面(半徑 1.002)。
  - 建立一個 `Mesh`,材質 `MeshBasicMaterial`,`transparent`、靜態 `opacity` 約 0.001(近乎隱形)。
    hover 高亮:把該 mesh 的 `opacity` 提到約 0.28、`color` 轉為淡青;離開時還原。
  - `mesh.userData = { code, feature }`。
- `borders.js`:每個外環轉 `LineSegments`(`LineBasicMaterial`,白、`opacity` 0.35),常駐。
- 每幀:`raycaster.setFromCamera(pointer, camera)` → `intersectObjects(countryGroup.children)`。
  - 命中第一個 → 設為 hovered(前一個復原),更新 tooltip 內容與位置。
  - 未命中 → 清除 hovered,隱藏 tooltip。
- 點擊(mousedown → mouseup 位移小於閾值,排除拖曳):若有 hovered,
  呼叫 `flyTo(該國 content.capital_latlon 或多邊形質心)` 並開側欄。

### 4.5 側欄 side-panel.js

- 右側滑入面板,寬約 380px,半透明深色玻璃(`backdrop-filter: blur`)。
- 區塊:
  - 標題:中文國名(大,約 28px)/ English name(小,灰)
  - meta:首都(中/英)· 時區 · 概略經緯位置
  - **特色**:2–4 段短文
  - **適合旅遊月份**:12 格月份條,`best` 月份高亮,下方一行 `note` 說明
  - **歷史介紹**:3–5 段
  - 關閉鈕(×)→ 收回面板 + `resetView()`
- 查無 content:僅顯示中英名(從 geojson 屬性取)+「內容建置中,之後會補上」。

### 4.6 懸停標籤 tooltip.js

- 絕對定位 `div`,跟隨游標(偏移約 14px)。中文國名(大)+ English(小)。
- 移到地球外或無國家(海域)即隱藏。

### 4.7 右上角時間天氣 clock-weather.js

- 未選國家:顯示「移到國家看當地時間」提示;或顯示使用者所在地(台灣,`Asia/Taipei`)時間。
- 已選國家:以 `Intl.DateTimeFormat` 搭配該國 `timezone` 每秒更新
  「YYYY/MM/DD HH:MM:SS」+ 星期。
- 天氣:以該國 `capital_latlon` 呼叫
  `GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code`。
  顯示氣溫 + 依 `weather_code` 對應的天氣圖示(emoji 或簡單 SVG)。
- 快取:同一國 10 分鐘內不重新請求(記憶體 Map,key = code)。
- 逾時 3 秒或失敗:天氣區塊顯示「—」,時間照常。

### 4.8 音訊 ambient.js

- 首次點擊畫面才 `new AudioContext()`(瀏覽器自動播放政策)。
- 合成:2–3 個微微失諧的 `OscillatorNode`(低頻正弦/三角,約 55–110 Hz 疊 5 度/8 度),
  經一個 `BiquadFilterNode`(lowpass)與 `GainNode`;以緩慢 `LFO`(0.05–0.1 Hz)
  調變 gain 與 filter cutoff,營造漂浮的「宇宙能量感」。整體 gain 低(約 0.06)。
- UI:靜音/開聲鈕 + 音量滑桿。**預設靜音**。

## 5. 資料格式

### countries.content.json(精選 15–20 國,陣列)

```json
{
  "code": "JP",
  "name_zh": "日本", "name_en": "Japan",
  "capital_zh": "東京", "capital_en": "Tokyo",
  "timezone": "Asia/Tokyo",
  "capital_latlon": [35.68, 139.69],
  "features": ["列島地形、多山、火山與溫泉……", "……"],
  "travel_months": { "best": [3, 4, 10, 11], "note": "3–4 月櫻花、10–11 月楓紅" },
  "history": ["……", "……", "……"]
}
```

- 以 ISO_A2 `code` 對應 geojson feature 的 `ISO_A2` / `properties.iso_a2`。對不到 → 走「內容建置中」。
- 初擬精選名單(約 20,可調):日本、韓國、中國、台灣、泰國、越南、印度、法國、義大利、
  西班牙、德國、英國、希臘、埃及、美國、加拿大、墨西哥、巴西、澳洲、紐西蘭。
- 內容參考維基百科等公開資料自行撰寫,不逐字照抄。

### 需下載資源(公有領域 / 開放資料;實作到該步逐一列出檔名、來源、大小再請創辦人確認)

- NASA Visible Earth「Blue Marble」貼圖:彩色、地形凹凸、夜景燈光、海洋遮罩,
  各約 1–8 MB(2K 或 4K)。來源 `visibleearth.nasa.gov`(public domain)。
- Natural Earth 110m Admin-0 國界 GeoJSON,約 100–600 KB。
  來源 Natural Earth / world-atlas(public domain)。
- three.js:CDN 執行期載入(importmap),非下載。

## 6. 資料流

```
main.js
  ├─ 載入 assets 貼圖 ──► globe.js 建地球
  ├─ 載入 countries.geo.json + countries.content.json
  │     └─ country-layer.js 建隱形國家 mesh + borders.js 建國界線
  ├─ starfield.js 建星空
  ├─ camera-controls.js 綁定滑鼠
  ├─ ui:side-panel / tooltip / clock-weather 初始化(隱藏態)
  ├─ audio:ambient.js 待首次點擊啟動
  └─ 動畫迴圈:自轉(未 hover 時)→ 更新 controls → raycast →
        更新 hover 高亮 + tooltip → renderer.render

事件:
  pointermove → 更新 pointer 向量、tooltip 位置
  pointerenter 地球  → 暫停自轉;pointerleave → 1.5s 後回復
  click(非拖曳)命中國家 → flyTo + side-panel.open(code) + clock-weather.setCountry(code)
  side-panel 關閉 / Esc → side-panel.close + resetView + clock-weather.clearCountry
```

## 7. 錯誤處理

- 貼圖或 geojson 載入失敗:畫面中央顯示錯誤訊息,console 印詳情;
  地球貼圖缺失時退回純色球體,仍可自轉/操作。
- Open-Meteo 逾時(3 秒)或非 2xx:靜默降級,天氣顯示「—」,時間照常。
- WebGL 不支援:顯示「你的瀏覽器不支援 WebGL」提示頁,不初始化場景。
- raycast 未命中:非錯誤,單純清除 hover 狀態。
- earcut 對某畸形多邊形失敗:略過該多邊形並 `console.warn`,不中斷其他國家建置。

## 8. 測試 / 驗證

- **純函式**(`src/lib/geo.js`):經緯度↔球面座標往返、質心計算、時區時間格式化,
  以 `test/geo.test.mjs` + `node --test` 跑(用 `F:\Claude\ai-tools\node-v22.14.0-win-x64`)。
- **視覺互動實測**(沿用 rooster 專案做法):`serve.ps1` 起服務 → Claude in Chrome 開啟 →
  逐項截圖確認:
  1. 地球有真實貼圖且在自轉,星空在
  2. 滑鼠移到地球上自轉暫停,移開後回復
  3. 左鍵拖曳可轉動、滾輪可縮放且有上下限
  4. hover 國家會高亮 + tooltip 顯示中英名
  5. 點國家:鏡頭飛入 + 側欄滑出,內容(特色/旅遊月份/歷史)正確
  6. 右上角時間依該國時區每秒跳動;天氣有抓到值(或正常降級為「—」)
  7. 靜音鈕可開關環境音、音量滑桿有效
  8. console 無錯誤
- 無資料國家點擊顯示「內容建置中」。

## 9. 里程碑(供實作計畫參考)

1. 專案骨架 + serve.ps1 + index.html + 空場景渲染(黑畫面 + 星空)
2. 地球貼圖 + 自轉 + hover 暫停
3. 鏡頭操作(拖曳/縮放/阻尼)
4. 國界資料載入 + 隱形國家層 + 國界線
5. raycast hover 高亮 + tooltip
6. 點擊 → flyTo + 側欄(先接假資料)
7. countries.content.json 撰寫精選國家內容 + 側欄真資料
8. 右上角時間(時區)+ Open-Meteo 天氣 + 快取/降級
9. 環境音合成 + 靜音/音量 UI
10. 錯誤處理收尾 + 純函式測試 + 瀏覽器全流程實測 + README
