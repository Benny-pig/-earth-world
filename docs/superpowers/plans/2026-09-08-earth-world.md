# 地球世界(Earth World)階段一雛形 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一個以 3D 真實貼圖地球儀為中心、置於宇宙星空中、國家可懸停高亮與點擊查看介紹的互動式視覺作品雛形。

**Architecture:** 單頁 `index.html` + ES modules,three.js 以 importmap 從 CDN 載入,`serve.ps1` 起本機 static server。地球是貼 NASA 貼圖的球體並自轉;GeoJSON 國界以 earcut 三角化投影到略高於地表的球面,組成約 200 個近乎透明的 mesh,用 `Raycaster` 逐幀偵測游標命中哪一國;命中提高該 mesh 的 opacity + 轉淡青作高亮,點擊則鏡頭 tween 飛到該國並開右側側欄。右上角依選取國家的時區顯示當地時間 + Open-Meteo 天氣。背景音以 Web Audio 即時合成。

**Tech Stack:** three.js 0.160.0(module + OrbitControls addon,importmap)、earcut 3.0.1(jsdelivr `+esm`)、原生 Web Audio API、原生 `fetch` + Open-Meteo API、PowerShell `System.Net.HttpListener` static server、Node(免安裝版)+ `node --test` 跑純函式測試。

**Spec:** `F:\Claude\earth-world\docs\superpowers\specs\2026-09-08-earth-world-design.md`

## Global Constraints

- **無建置工具鏈**:不使用 Vite/webpack/npm 依賴打包。全部走瀏覽器原生 ES modules + importmap。
- **three.js 版本 pin**:`three@0.160.0`,兩個進入點:
  - `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  - `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js`
- **earcut 版本 pin**:`https://cdn.jsdelivr.net/npm/earcut@3.0.1/+esm`
- **本機服務**:`serve.ps1` 監聽 `http://localhost:8760/`,mime 至少涵蓋 `.html .js .mjs .json .jpg .png .geojson`。
- **靜態資源路徑**:相對路徑,全部從網站根 `/` 起算(例:`/assets/earth-color.jpg`、`/data/countries.geo.json`)。
- **語言**:所有介面文字用繁體中文;國名以中文為主、英文為次(小字備註)。
- **git**:`F:\Claude\earth-world` 是獨立 repo(已 `git init`,已有 spec/plan 兩次 commit)。commit 身分用 repo 層設定 `user.email=a7779782@gmail.com`、`user.name=Benny`(已設)。每個 Task 結束 commit 一次。
- **測試環境**:Node 執行檔在 `F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe`;純函式測試用 `node --test test/`。
- **瀏覽器目標**:Chrome(用 Claude in Chrome 自動化實測)。
- **下載資源需先取得創辦人同意**:Task 4 與 Task 6 會下載檔案,執行到該步時必須先在對話中列出「檔名 / 來源 URL / 大小」並等創辦人同意,才可下載。
- **座標約定**:經度 lon ∈ [-180,180],緯度 lat ∈ [-90,90]。地球半徑 = 1。國家層 mesh 半徑 = 1.002,國界線半徑 = 1.0025。貼圖經度 0 對齊 +X 軸慣例見 `latLonToVector3`。

---

## 檔案結構

| 檔案 | 職責 |
|---|---|
| `index.html` | 單頁進入點:canvas、UI 容器 DOM、importmap、載入 `src/main.js` |
| `serve.ps1` | 本機 static server(port 8760) |
| `src/main.js` | 啟動流程、資源載入協調、動畫迴圈、事件接線、錯誤橫幅 |
| `src/lib/geo.js` | 純函式:經緯度↔球面向量、多邊形質心、時區時間格式化、WMO 天氣碼→圖示 |
| `src/scene/starfield.js` | 星空 Points + 深色背景 |
| `src/scene/globe.js` | 地球球體、貼圖、太陽光、自轉、hover 暫停旗標 |
| `src/scene/camera-controls.js` | OrbitControls 包裝、`flyTo(latLon)`、`resetView()` |
| `src/countries/borders.js` | 由 geojson 外環建國界 `LineSegments` |
| `src/countries/country-layer.js` | 由 geojson 建近乎透明國家 mesh、逐幀 raycast、hover 高亮、click 回呼 |
| `src/ui/tooltip.js` | 跟隨游標的國名標籤 |
| `src/ui/side-panel.js` | 右側國家詳情面板:open(code)/close |
| `src/ui/clock-weather.js` | 右上角:選取國家時區時間(每秒)+ Open-Meteo 天氣 + 快取 + 降級 |
| `src/audio/ambient.js` | Web Audio 合成環境音 + 靜音/音量 UI 接線 |
| `data/countries.geo.json` | Natural Earth 110m 國界(Task 6 下載) |
| `data/countries.content.json` | 精選 20 國的內容(Task 9 撰寫) |
| `assets/earth-*.jpg/png` | 地球貼圖 4 張(Task 4 下載) |
| `test/geo.test.mjs` | `src/lib/geo.js` 的 `node --test` 測試 |
| `README.md` | 專案說明與啟動方式(Task 12) |

---

## Task 1: 專案骨架 + 本機服務 + 空場景渲染迴圈

**Files:**
- Create: `F:\Claude\earth-world\index.html`
- Create: `F:\Claude\earth-world\serve.ps1`
- Create: `F:\Claude\earth-world\src\main.js`
- Create: `F:\Claude\earth-world\.gitignore`

**Interfaces:**
- Consumes: 無
- Produces:
  - `src/main.js` 匯出 `export function start()`(由 index.html 呼叫),內部建立並掛在 `window.__earth = { scene, camera, renderer }`(僅供除錯與後續 Task 的瀏覽器實測讀取)。
  - 全域慣例:UI 容器 DOM id — `#error-banner`、`#tooltip`、`#side-panel`、`#clock-weather`、`#audio-ui`(本 Task 先建空的 `#error-banner`,其餘 Task 各自建立時沿用這些 id)。

- [ ] **Step 1: 建 `.gitignore`**

```
# 本機服務暫存
*.log
# 編輯器
.vscode/
.DS_Store
```

- [ ] **Step 2: 建 `serve.ps1`**

```powershell
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:8760/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "地球世界 serving $root at $prefix (Ctrl+C 停止)"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".mjs"  = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".geojson" = "application/json; charset=utf-8"
  ".jpg"  = "image/jpeg"
  ".png"  = "image/png"
  ".css"  = "text/css; charset=utf-8"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($rel -eq "/") { $rel = "/index.html" }
  $path = Join-Path $root ($rel.TrimStart("/") -replace "/", "\")
  if (Test-Path $path -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ctx.Response.ContentType = $ct
    $ctx.Response.Headers.Add("Cache-Control", "no-cache")
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.OutputStream.Close()
}
```

- [ ] **Step 3: 建 `index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>地球世界</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #05060d; }
  #app { position: fixed; inset: 0; }
  canvas { display: block; }
  #error-banner {
    position: fixed; left: 50%; top: 24px; transform: translateX(-50%);
    max-width: 80vw; padding: 12px 18px; border-radius: 8px;
    background: rgba(140, 20, 30, 0.92); color: #fff; font: 14px/1.5 system-ui, "Microsoft JhengHei", sans-serif;
    z-index: 50; display: none;
  }
  #webgl-fallback {
    position: fixed; inset: 0; display: none; place-content: center;
    color: #cdd3e0; font: 16px/1.6 system-ui, "Microsoft JhengHei", sans-serif; text-align: center;
    padding: 40px;
  }
</style>
</head>
<body>
  <div id="app"></div>
  <div id="error-banner"></div>
  <div id="webgl-fallback">你的瀏覽器不支援 WebGL,無法顯示地球世界。<br>請改用較新版本的 Chrome / Edge / Firefox。</div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
      "earcut": "https://cdn.jsdelivr.net/npm/earcut@3.0.1/+esm"
    }
  }
  </script>
  <script type="module">
    import { start } from "/src/main.js";
    start();
  </script>
</body>
</html>
```

- [ ] **Step 4: 建 `src/main.js`(空場景 + 迴圈 + resize + WebGL 偵測)**

```js
import * as THREE from "three";

const container = document.getElementById("app");

export function showError(msg) {
  const el = document.getElementById("error-banner");
  el.textContent = msg;
  el.style.display = "block";
  console.error("[earth-world]", msg);
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

export function start() {
  if (!webglAvailable()) {
    document.getElementById("webgl-fallback").style.display = "grid";
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 0, 3.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  window.__earth = { scene, camera, renderer };

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function loop() {
    const dt = clock.getDelta();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
}
```

- [ ] **Step 5: 啟動服務並實測**

Run(背景):`powershell -ExecutionPolicy Bypass -File F:\Claude\earth-world\serve.ps1`
用 Claude in Chrome 開 `http://localhost:8760/`。
Expected:整頁深藍近黑、無錯誤橫幅、DevTools console 無紅字;縮放視窗畫布跟著變。截圖存證。

- [ ] **Step 6: Commit**

```bash
cd /f/Claude/earth-world
git add -A
git commit -m "feat: 專案骨架、serve.ps1、空場景渲染迴圈與 WebGL 偵測"
```

---

## Task 2: `src/lib/geo.js` 純函式 + `node --test`

**Files:**
- Create: `F:\Claude\earth-world\src\lib\geo.js`
- Test: `F:\Claude\earth-world\test\geo.test.mjs`

**Interfaces:**
- Consumes: `THREE.Vector3`(僅型別;為讓測試不需 three,函式回傳 `{x,y,z}` 純物件,呼叫端自行包成 Vector3)。
- Produces:
  - `latLonToXYZ(latDeg, lonDeg, radius = 1) -> {x, y, z}` — 球面座標。約定:lat=0,lon=0 → `{x: radius, y: 0, z: 0}`;lat=90 → `{x:0, y:radius, z:0}`;lon=90 → `{x:0, y:0, z:-radius}`(右手座標、Y 為地軸)。
  - `xyzToLatLon({x,y,z}) -> {lat, lon}` — 反向,回傳度數。
  - `ringCentroid(ring) -> [lon, lat]` — `ring` 是 `[[lon,lat], ...]`;用球面向量平均再正規化投影回經緯度(避開經度環繞問題)。
  - `formatZonedTime(date, timeZone) -> { date: "YYYY/MM/DD", time: "HH:MM:SS", weekday: "週一" }` — 用 `Intl.DateTimeFormat`。
  - `weatherCodeToIcon(code) -> { icon: string, label: string }` — WMO code 對應 emoji + 繁中描述。

- [ ] **Step 1: 寫失敗測試 `test/geo.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { latLonToXYZ, xyzToLatLon, ringCentroid, formatZonedTime, weatherCodeToIcon } from "../src/lib/geo.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("latLonToXYZ 原點對齊 +X", () => {
  const p = latLonToXYZ(0, 0, 1);
  near(p.x, 1); near(p.y, 0); near(p.z, 0);
});

test("latLonToXYZ 北極對齊 +Y", () => {
  const p = latLonToXYZ(90, 0, 2);
  near(p.x, 0); near(p.y, 2); near(p.z, 0);
});

test("latLonToXYZ 經度 90 度落在 -Z", () => {
  const p = latLonToXYZ(0, 90, 1);
  near(p.x, 0); near(p.z, -1);
});

test("xyzToLatLon 為 latLonToXYZ 的逆", () => {
  for (const [lat, lon] of [[0, 0], [35.68, 139.69], [-33.9, 18.4], [64, -21]]) {
    const b = xyzToLatLon(latLonToXYZ(lat, lon, 1));
    near(b.lat, lat, 1e-6); near(b.lon, lon, 1e-6);
  }
});

test("ringCentroid 傳回矩形中心附近", () => {
  const ring = [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]];
  const [lon, lat] = ringCentroid(ring);
  assert.ok(lon > 13 && lon < 17, `lon=${lon}`);
  assert.ok(lat > 13 && lat < 17, `lat=${lat}`);
});

test("formatZonedTime 依時區給出日期時間與星期", () => {
  const d = new Date("2026-01-15T00:00:00Z");
  const tokyo = formatZonedTime(d, "Asia/Tokyo");
  assert.equal(tokyo.date, "2026/01/15");
  assert.equal(tokyo.time, "09:00:00");
  assert.equal(tokyo.weekday, "週四");
});

test("weatherCodeToIcon 對應已知碼", () => {
  assert.equal(weatherCodeToIcon(0).label, "晴");
  assert.equal(weatherCodeToIcon(3).label, "陰");
  assert.equal(weatherCodeToIcon(61).label, "下雨");
  assert.equal(weatherCodeToIcon(95).label, "雷雨");
  assert.equal(weatherCodeToIcon(999).label, "—");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/`
Expected:FAIL —「Cannot find module '../src/lib/geo.js'」或匯出未定義。

- [ ] **Step 3: 實作 `src/lib/geo.js`**

```js
const DEG = Math.PI / 180;

export function latLonToXYZ(latDeg, lonDeg, radius = 1) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cosLat = Math.cos(lat);
  return {
    x: radius * cosLat * Math.cos(lon),
    y: radius * Math.sin(lat),
    z: -radius * cosLat * Math.sin(lon),
  };
}

export function xyzToLatLon({ x, y, z }) {
  const r = Math.hypot(x, y, z);
  const lat = Math.asin(y / r) / DEG;
  const lon = Math.atan2(-z, x) / DEG;
  return { lat, lon };
}

export function ringCentroid(ring) {
  let x = 0, y = 0, z = 0, n = 0;
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1) : ring;
  for (const [lon, lat] of pts) {
    const p = latLonToXYZ(lat, lon, 1);
    x += p.x; y += p.y; z += p.z; n++;
  }
  const b = xyzToLatLon({ x: x / n, y: y / n, z: z / n });
  return [b.lon, b.lat];
}

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export function formatZonedTime(date, timeZone) {
  const dp = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).replace(/-/g, "/");
  const tp = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
  const wdIndex = new Date(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).format(date)
  ).getDay();
  return { date: dp, time: tp, weekday: WEEKDAYS[wdIndex] };
}

export function weatherCodeToIcon(code) {
  const table = [
    [[0], "☀️", "晴"],
    [[1, 2], "⛅", "多雲"],
    [[3], "☁️", "陰"],
    [[45, 48], "🌫️", "起霧"],
    [[51, 53, 55, 56, 57], "🌦️", "毛毛雨"],
    [[61, 63, 65, 66, 67], "🌧️", "下雨"],
    [[71, 73, 75, 77], "🌨️", "下雪"],
    [[80, 81, 82], "🌦️", "陣雨"],
    [[85, 86], "🌨️", "陣雪"],
    [[95, 96, 99], "⛈️", "雷雨"],
  ];
  for (const [codes, icon, label] of table) if (codes.includes(code)) return { icon, label };
  return { icon: "—", label: "—" };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/`
Expected:PASS(7 個 test 全綠)。若 `formatZonedTime` 星期或補零有落差,依實測輸出微調格式字串直到符合斷言。

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.js test/geo.test.mjs
git commit -m "feat: geo.js 純函式(經緯度↔球面、質心、時區時間、天氣碼)+ node --test"
```

---

## Task 3: 星空背景 `src/scene/starfield.js`

**Files:**
- Create: `F:\Claude\earth-world\src\scene\starfield.js`
- Modify: `F:\Claude\earth-world\src\main.js`(import 並加入場景)

**Interfaces:**
- Consumes: `THREE`(from "three")。
- Produces:
  - `createStarfield({ count = 5000, radius = 60 }) -> { object: THREE.Points, update(elapsed) }` — `object` 直接 `scene.add`;`update` 每幀傳入 `clock.getElapsedTime()` 讓星星微弱閃爍。

- [ ] **Step 1: 實作 `src/scene/starfield.js`**

```js
import * as THREE from "three";

export function createStarfield({ count = 5000, radius = 60 } = {}) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.7 + Math.random() * 0.3);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.18, sizeAttenuation: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  });

  const object = new THREE.Points(geom, material);
  object.renderOrder = -1;

  return {
    object,
    update(elapsed) {
      material.opacity = 0.75 + 0.2 * Math.sin(elapsed * 0.6);
    },
  };
}
```

- [ ] **Step 2: 接進 `src/main.js`**

在 `start()` 內 `scene` 建立後加入,並在 `loop()` 呼叫 `update`:

```js
import { createStarfield } from "/src/scene/starfield.js";
// ...
const starfield = createStarfield();
scene.add(starfield.object);
// loop() 內:
starfield.update(clock.getElapsedTime());
```

- [ ] **Step 3: 實測**

重整 `http://localhost:8760/`。Expected:深色背景上佈滿白色星點、整體亮度緩慢起伏、無 console 錯誤。截圖。

- [ ] **Step 4: Commit**

```bash
git add src/scene/starfield.js src/main.js
git commit -m "feat: 星空背景(5000 Points + 緩慢閃爍)"
```

---

## Task 4: 地球球體 + 貼圖 + 太陽光 + 自轉 `src/scene/globe.js`

**Files:**
- Create: `F:\Claude\earth-world\src\scene\globe.js`
- Create: `F:\Claude\earth-world\assets\`(下載 4 張貼圖)
- Modify: `F:\Claude\earth-world\src\main.js`

**Interfaces:**
- Consumes: `THREE`。
- Produces:
  - `createGlobe() -> { object: THREE.Group, mesh: THREE.Mesh, sun: THREE.DirectionalLight, setSpinPaused(bool), update(dt) }`
    - `object` 加進場景;`mesh` 是半徑 1 的地球(供後續 Task 的 raycast 當「是否指到地球」判斷)。
    - `update(dt)`:未暫停時繞 `object.rotation.y` 以 `2π/60` rad/س 轉。
    - `setSpinPaused(true/false)`:Task 5 hover 時呼叫。

- [ ] **Step 1: 列出待下載貼圖並取得同意**

在對話中向創辦人列出,等同意後才下載(來源為 NASA 製作、three.js 官方範例庫轉存,公有領域):

| 存檔名 | 來源 URL | 約大小 |
|---|---|---|
| `assets/earth-color.jpg` | `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_atmos_2048.jpg` | ~250 KB |
| `assets/earth-normal.jpg` | `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_normal_2048.jpg` | ~1 MB |
| `assets/earth-spec.jpg` | `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_specular_2048.jpg` | ~120 KB |
| `assets/earth-night.jpg` | `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_lights_2048.png` 另存為 `.jpg` 前先轉檔,或直接存 `earth-night.png` 並改程式副檔名 | ~300 KB |

- [ ] **Step 2: 下載(同意後)**

Run(逐一):`curl -L -o F:\Claude\earth-world\assets\earth-color.jpg "<url>"` … 其餘同。
下載後 `ls -la assets/` 確認四個檔都存在且大小合理(> 50 KB)。

- [ ] **Step 3: 實作 `src/scene/globe.js`**

```js
import * as THREE from "three";

const SPIN_RATE = (2 * Math.PI) / 60; // 一圈 60 秒

export function createGlobe() {
  const object = new THREE.Group();
  const loader = new THREE.TextureLoader();

  const load = (url) => new Promise((res) => loader.load(
    url,
    (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); },
    undefined,
    () => { console.warn("[globe] 貼圖載入失敗:", url); res(null); },
  ));

  const geometry = new THREE.SphereGeometry(1, 96, 96);
  const material = new THREE.MeshStandardMaterial({ color: 0x2b3a55, metalness: 0.0, roughness: 1.0 });
  const mesh = new THREE.Mesh(geometry, material);
  object.add(mesh);

  // 非同步套貼圖;失敗就保留純色球
  (async () => {
    const [color, normal, spec, night] = await Promise.all([
      load("/assets/earth-color.jpg"),
      load("/assets/earth-normal.jpg"),
      load("/assets/earth-spec.jpg"),
      load("/assets/earth-night.jpg"),
    ]);
    if (color) { material.map = color; material.color.set(0xffffff); }
    if (normal) { material.normalMap = normal; material.normalScale.set(0.8, 0.8); }
    if (spec) { material.roughnessMap = spec; material.roughness = 0.9; }
    if (night) {
      night.colorSpace = THREE.SRGBColorSpace;
      material.emissiveMap = night;
      material.emissive.set(0xffee88);
      material.emissiveIntensity = 1.1;
    }
    material.needsUpdate = true;
  })();

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 1.2, 2.5);
  object.add(sun);
  object.add(new THREE.AmbientLight(0x334466, 0.35));

  let paused = false;
  return {
    object,
    mesh,
    sun,
    setSpinPaused(v) { paused = v; },
    update(dt) { if (!paused) object.rotation.y += SPIN_RATE * dt; },
  };
}
```

- [ ] **Step 4: 接進 `src/main.js`**

```js
import { createGlobe } from "/src/scene/globe.js";
// start() 內:
const globe = createGlobe();
scene.add(globe.object);
window.__earth.globe = globe;
// loop() 內(在 render 前):
globe.update(dt);
```

- [ ] **Step 5: 實測**

重整。Expected:畫面中央一顆貼真實地貌的地球、緩慢自轉、朝光側明亮、背光側可見城市燈光微光;console 無錯誤。若貼圖沒出現,檢查 serve.ps1 是否回 `.jpg`、Network 面板狀態碼。截圖。

- [ ] **Step 6: Commit**

```bash
git add src/scene/globe.js src/main.js assets/
git commit -m "feat: 地球球體 + NASA 貼圖(色/法線/海洋/夜燈)+ 太陽光 + 自轉"
```

---

## Task 5: 鏡頭操作 + hover 暫停自轉 `src/scene/camera-controls.js`

**Files:**
- Create: `F:\Claude\earth-world\src\scene\camera-controls.js`
- Modify: `F:\Claude\earth-world\src\main.js`

**Interfaces:**
- Consumes: `THREE`、`OrbitControls`(from "three/addons/controls/OrbitControls.js")、`latLonToXYZ`(from "/src/lib/geo.js")、`globe.setSpinPaused`。
- Produces:
  - `createCameraRig({ camera, domElement, onHoverGlobeChange }) -> { controls, flyTo(latDeg, lonDeg, opts?), resetView(), update(dt) }`
    - `flyTo(lat, lon, { distance = 1.8, ms = 1000 })`:把相機沿目標方向 tween 到指定距離,`controls.target` 固定原點。
    - `resetView()`:tween 回預設距離 3.2、正視 `(0,0)`。
    - hover 判斷不在這裡做(在 Task 7 的 raycast),此檔只提供 `flyTo/resetView` 與 OrbitControls 包裝。
  - 匯出 `easeInOutCubic(t)` 供測試/重用。

- [ ] **Step 1: 實作 `src/scene/camera-controls.js`**

```js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLonToXYZ } from "/src/lib/geo.js";

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig({ camera, domElement }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.35;
  controls.maxDistance = 6;
  controls.target.set(0, 0, 0);

  let tween = null; // { from: Vector3, toDir: Vector3, dist, t, ms }

  function flyTo(latDeg, lonDeg, { distance = 1.8, ms = 1000 } = {}) {
    const p = latLonToXYZ(latDeg, lonDeg, 1);
    const toDir = new THREE.Vector3(p.x, p.y, p.z).normalize();
    tween = { from: camera.position.clone(), toDir, dist: distance, t: 0, ms };
  }

  function resetView() {
    tween = { from: camera.position.clone(), toDir: new THREE.Vector3(0, 0, 1), dist: 3.2, t: 0, ms: 900 };
  }

  function update(dt) {
    if (tween) {
      tween.t = Math.min(1, tween.t + (dt * 1000) / tween.ms);
      const k = easeInOutCubic(tween.t);
      const target = tween.toDir.clone().multiplyScalar(tween.dist);
      camera.position.lerpVectors(tween.from, target, k);
      camera.lookAt(0, 0, 0);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
  }

  return { controls, flyTo, resetView, update };
}
```

- [ ] **Step 2: 接進 `src/main.js` + 綁 hover 暫停**

```js
import { createCameraRig } from "/src/scene/camera-controls.js";
// start() 內:
const rig = createCameraRig({ camera, domElement: renderer.domElement });
window.__earth.rig = rig;

// hover 暫停:用 raycaster 判斷游標是否指到地球(Task 7 會擴充成國家偵測,這裡先做地球層級)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
let resumeTimer = null;
renderer.domElement.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
window.__earth.pointer = pointer;
window.__earth.raycaster = raycaster;

// loop() 內,globe.update(dt) 之前:
raycaster.setFromCamera(pointer, camera);
const hitGlobe = raycaster.intersectObject(globe.mesh, false).length > 0;
if (hitGlobe) {
  globe.setSpinPaused(true);
  if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
} else if (!resumeTimer) {
  resumeTimer = setTimeout(() => { globe.setSpinPaused(false); resumeTimer = null; }, 1500);
}
rig.update(dt);
```

- [ ] **Step 3: 實測**

重整。Expected:左鍵拖曳可轉動地球、滾輪縮放且到最近/最遠會停住、放開後有阻尼緩停;游標移到地球上自轉停止,移開約 1.5 秒後恢復自轉;console 無錯誤。截圖(至少兩張:拖曳後角度、縮到最近)。

- [ ] **Step 4: Commit**

```bash
git add src/scene/camera-controls.js src/main.js
git commit -m "feat: OrbitControls 包裝 + flyTo/resetView 補間 + hover 暫停自轉"
```

---

## Task 6: 國界資料 + 國界線 `src/countries/borders.js`

**Files:**
- Create: `F:\Claude\earth-world\data\countries.geo.json`(下載)
- Create: `F:\Claude\earth-world\src\countries\borders.js`
- Modify: `F:\Claude\earth-world\src\main.js`

**Interfaces:**
- Consumes: `THREE`、`latLonToXYZ`。
- Produces:
  - `buildBorders(geojson, { radius = 1.0025 }) -> THREE.LineSegments` — 所有國家外環 + 內環的線段合併成一個物件。
  - `iterCountryPolygons(feature) -> Array<Array<[lon,lat]>>` — 把 `Polygon`/`MultiPolygon` 攤平成「多個 ring 群組」,每個元素是 `[outerRing, hole1, ...]`;供 Task 7 重用。匯出。
  - 約定屬性讀取:`feature.properties` 內國名用 `NAME_ZH`(中)與 `NAME`(英);ISO 代碼優先 `ISO_A2_EH`,退回 `ISO_A2`,再退回 `POSTAL`。匯出 `countryCode(feature)` 與 `countryNames(feature) -> { zh, en }`。

- [ ] **Step 1: 列出下載並取得同意**

| 存檔名 | 來源 URL | 約大小 |
|---|---|---|
| `data/countries.geo.json` | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson` | ~700 KB |

來源 Natural Earth(公有領域)。

- [ ] **Step 2: 下載(同意後)並抽查**

Run:`curl -L -o F:\Claude\earth-world\data\countries.geo.json "<url>"`
Run:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe -e "const g=require('./data/countries.geo.json');console.log(g.features.length, g.features[0].properties.NAME, g.features[0].properties.NAME_ZH, g.features[0].properties.ISO_A2_EH)"`
Expected:約 177 個 feature,能印出英文名、(可能有)中文名、兩碼 ISO。

- [ ] **Step 3: 實作 `src/countries/borders.js`**

```js
import * as THREE from "three";
import { latLonToXYZ } from "/src/lib/geo.js";

export function countryCode(feature) {
  const p = feature.properties || {};
  for (const k of ["ISO_A2_EH", "ISO_A2", "POSTAL"]) {
    if (p[k] && p[k] !== "-99") return String(p[k]).toUpperCase();
  }
  return (p.NAME || "??").toUpperCase();
}

export function countryNames(feature) {
  const p = feature.properties || {};
  return { zh: p.NAME_ZH || p.NAME || "未知", en: p.NAME || "" };
}

export function iterCountryPolygons(feature) {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

export function buildBorders(geojson, { radius = 1.0025 } = {}) {
  const verts = [];
  for (const feature of geojson.features) {
    for (const rings of iterCountryPolygons(feature)) {
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = latLonToXYZ(ring[i][1], ring[i][0], radius);
          const b = latLonToXYZ(ring[i + 1][1], ring[i + 1][0], radius);
          verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  const material = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.35 });
  const lines = new THREE.LineSegments(geom, material);
  lines.renderOrder = 2;
  return lines;
}
```

- [ ] **Step 4: 接進 `src/main.js`(非同步載入 geojson)**

```js
import { buildBorders } from "/src/countries/borders.js";
// start() 內,globe 建好後:
fetch("/data/countries.geo.json")
  .then((r) => { if (!r.ok) throw new Error("國界資料載入失敗 " + r.status); return r.json(); })
  .then((geojson) => {
    window.__earth.geojson = geojson;
    const borders = buildBorders(geojson);
    globe.object.add(borders);        // 掛在地球 group,跟著自轉
    window.__earth.borders = borders;
  })
  .catch((err) => showError(err.message));
```

- [ ] **Step 5: 實測**

重整。Expected:地球表面浮現細白色國界線,隨地球自轉;console 無錯誤。截圖。

- [ ] **Step 6: Commit**

```bash
git add data/countries.geo.json src/countries/borders.js src/main.js
git commit -m "feat: 載入 Natural Earth 110m 國界並繪製白色邊界線"
```

---

## Task 7: 國家層 + raycast hover 高亮 + tooltip

**Files:**
- Create: `F:\Claude\earth-world\src\countries\country-layer.js`
- Create: `F:\Claude\earth-world\src\ui\tooltip.js`
- Modify: `F:\Claude\earth-world\index.html`(加 `#tooltip`)
- Modify: `F:\Claude\earth-world\src\main.js`

**Interfaces:**
- Consumes: `THREE`、`earcut`(from "earcut")、`latLonToXYZ`、`iterCountryPolygons`/`countryCode`/`countryNames`(from borders.js)。
- Produces:
  - `buildCountryLayer(geojson, { radius = 1.002 }) -> { group: THREE.Group, pick(raycaster) , setHover(code|null), meshByCode: Map }`
    - `group` 加到 `globe.object`(跟著自轉)。
    - `pick(raycaster) -> { code, names, centroidLatLon } | null`:對 `group.children` 做 `intersectObjects`,回最近命中國家資訊。
    - `setHover(code)`:把該國 mesh `opacity` 設 0.28、`color` 設 `0x66e0ff`;其餘還原成 `opacity` 0.001。
  - `createTooltip() -> { show(x, y, names), hide() }` — 操作 `#tooltip` DOM。

- [ ] **Step 1: `index.html` 加 tooltip 容器與樣式**

`<style>` 內追加:

```css
#tooltip {
  position: fixed; z-index: 40; pointer-events: none; display: none;
  padding: 6px 10px; border-radius: 6px; background: rgba(8, 12, 24, 0.82);
  color: #eaf1ff; font: 13px/1.2 system-ui, "Microsoft JhengHei", sans-serif;
  border: 1px solid rgba(120, 180, 255, 0.35); white-space: nowrap;
}
#tooltip .zh { font-size: 15px; font-weight: 700; }
#tooltip .en { font-size: 11px; opacity: 0.7; margin-left: 6px; }
```

`<body>` 內加:`<div id="tooltip"></div>`

- [ ] **Step 2: 實作 `src/ui/tooltip.js`**

```js
export function createTooltip() {
  const el = document.getElementById("tooltip");
  return {
    show(x, y, names) {
      el.innerHTML = `<span class="zh">${names.zh}</span><span class="en">${names.en}</span>`;
      el.style.left = `${x + 14}px`;
      el.style.top = `${y + 14}px`;
      el.style.display = "block";
    },
    hide() { el.style.display = "none"; },
  };
}
```

- [ ] **Step 3: 實作 `src/countries/country-layer.js`**

```js
import * as THREE from "three";
import earcut from "earcut";
import { latLonToXYZ } from "/src/lib/geo.js";
import { iterCountryPolygons, countryCode, countryNames } from "/src/countries/borders.js";
import { ringCentroid } from "/src/lib/geo.js";

const HOVER_COLOR = 0x66e0ff;
const BASE_OPACITY = 0.001;
const HOVER_OPACITY = 0.28;

function ringsToMeshGeometry(rings, radius) {
  // rings: [outer, hole1, ...] 每個是 [[lon,lat],...]
  const flat = [];
  const holes = [];
  for (let r = 0; r < rings.length; r++) {
    if (r > 0) holes.push(flat.length / 2);
    for (const [lon, lat] of rings[r]) flat.push(lon, lat);
  }
  const idx = earcut(flat, holes, 2);
  const positions = new Float32Array((flat.length / 2) * 3);
  for (let i = 0; i < flat.length / 2; i++) {
    const p = latLonToXYZ(flat[i * 2 + 1], flat[i * 2], radius);
    positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(idx);
  return geom;
}

export function buildCountryLayer(geojson, { radius = 1.002 } = {}) {
  const group = new THREE.Group();
  const meshByCode = new Map();

  for (const feature of geojson.features) {
    const code = countryCode(feature);
    const names = countryNames(feature);
    const geoms = [];
    let biggestRing = null, biggestLen = -1;

    for (const rings of iterCountryPolygons(feature)) {
      try {
        geoms.push(ringsToMeshGeometry(rings, radius));
        if (rings[0].length > biggestLen) { biggestLen = rings[0].length; biggestRing = rings[0]; }
      } catch (e) {
        console.warn("[country-layer] 三角化失敗,略過一塊多邊形:", code, e.message);
      }
    }
    if (!geoms.length) continue;

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: BASE_OPACITY,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const meshes = geoms.map((g) => new THREE.Mesh(g, material));
    const wrap = new THREE.Group();
    meshes.forEach((m) => wrap.add(m));
    wrap.userData = { code, names, centroidLatLon: biggestRing ? ringCentroid(biggestRing) : [0, 0], material };
    group.add(wrap);
    meshByCode.set(code, wrap);
  }

  let hoverCode = null;
  function setHover(code) {
    if (code === hoverCode) return;
    if (hoverCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      m.opacity = BASE_OPACITY; m.color.set(0xffffff);
    }
    hoverCode = code;
    if (hoverCode && meshByCode.has(hoverCode)) {
      const m = meshByCode.get(hoverCode).userData.material;
      m.opacity = HOVER_OPACITY; m.color.set(HOVER_COLOR);
    }
  }

  function pick(raycaster) {
    const hits = raycaster.intersectObjects(group.children, true);
    if (!hits.length) return null;
    let node = hits[0].object;
    while (node && !node.userData.code) node = node.parent;
    if (!node) return null;
    const { code, names, centroidLatLon } = node.userData;
    return { code, names, centroidLatLon };
  }

  return { group, pick, setHover, meshByCode };
}
```

- [ ] **Step 4: 接進 `src/main.js`**

在 geojson `.then` 內、`buildBorders` 之後:

```js
import { buildCountryLayer } from "/src/countries/country-layer.js";
import { createTooltip } from "/src/ui/tooltip.js";
// ...
const countryLayer = buildCountryLayer(geojson);
globe.object.add(countryLayer.group);
window.__earth.countryLayer = countryLayer;
```

在 `start()` 內建立 tooltip 與滑鼠螢幕座標追蹤:

```js
const tooltip = createTooltip();
let pointerPx = { x: -100, y: -100 };
renderer.domElement.addEventListener("pointermove", (e) => { pointerPx = { x: e.clientX, y: e.clientY }; });
```

把 Task 5 loop 內「hitGlobe」那段改成先問國家層:

```js
raycaster.setFromCamera(pointer, camera);
let hovered = null;
if (window.__earth.countryLayer) hovered = window.__earth.countryLayer.pick(raycaster);
const hitGlobe = hovered || raycaster.intersectObject(globe.mesh, false).length > 0;

if (window.__earth.countryLayer) window.__earth.countryLayer.setHover(hovered ? hovered.code : null);
if (hovered) tooltip.show(pointerPx.x, pointerPx.y, hovered.names);
else tooltip.hide();

// 自轉暫停沿用 hitGlobe 判斷
```

- [ ] **Step 5: 實測**

重整。Expected:游標移到任一國家,該國範圍淡青色高亮 + 游標旁出現「中文名 English」tooltip;移到海洋 tooltip 消失、無高亮;移到地球自轉暫停。console 若有零星「三角化失敗」warn 可接受(記下是哪些國)。截圖 2–3 張不同國家。

- [ ] **Step 6: Commit**

```bash
git add index.html src/countries/country-layer.js src/ui/tooltip.js src/main.js
git commit -m "feat: earcut 國家多邊形層 + raycast hover 高亮 + 國名 tooltip"
```

---

## Task 8: 點擊 → 鏡頭飛入 + 側欄(先接假資料)

**Files:**
- Create: `F:\Claude\earth-world\src\ui\side-panel.js`
- Modify: `F:\Claude\earth-world\index.html`(加 `#side-panel` + 樣式)
- Modify: `F:\Claude\earth-world\src\main.js`(click 偵測、接線)

**Interfaces:**
- Consumes: `rig.flyTo`、`rig.resetView`。
- Produces:
  - `createSidePanel({ onClose }) -> { open(payload), close(), isOpen() }`
    - `payload` 形狀:`{ code, names:{zh,en}, capital:{zh,en}|null, timezone|null, latlon:[lat,lon]|null, features:string[], travel:{best:number[], note:string}|null, history:string[] }`
    - `features`/`history` 為空、`travel` 為 null → 顯示「內容建置中,之後會補上」。
  - 匯出 `MONTH_LABELS = ["1月",…,"12月"]`。

- [ ] **Step 1: `index.html` 加側欄容器與樣式**

`<style>` 追加:

```css
#side-panel {
  position: fixed; top: 0; right: 0; height: 100%; width: 380px; max-width: 86vw;
  transform: translateX(105%); transition: transform .45s cubic-bezier(.22,.61,.36,1);
  background: rgba(10, 14, 26, 0.82); backdrop-filter: blur(14px);
  border-left: 1px solid rgba(120, 170, 255, 0.25); color: #e7edfb;
  font: 14px/1.7 system-ui, "Microsoft JhengHei", sans-serif; z-index: 45;
  overflow-y: auto; padding: 28px 26px 40px;
}
#side-panel.open { transform: translateX(0); }
#side-panel h2 { margin: 0; font-size: 26px; }
#side-panel .en { color: #9fb2d8; font-size: 13px; margin: 2px 0 14px; }
#side-panel .meta { color: #b9c6e6; font-size: 12.5px; margin-bottom: 18px; }
#side-panel h3 { font-size: 14px; letter-spacing: .05em; color: #8fd4ff; margin: 22px 0 8px; }
#side-panel .months { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin: 6px 0; }
#side-panel .months span { text-align: center; font-size: 11px; padding: 5px 0; border-radius: 4px;
  background: rgba(255,255,255,.06); color: #93a3c4; }
#side-panel .months span.best { background: #2f6df6; color: #fff; }
#side-panel .close { position: absolute; top: 14px; right: 16px; cursor: pointer;
  background: none; border: none; color: #cdd8f0; font-size: 22px; line-height: 1; }
```

`<body>` 加:

```html
<div id="side-panel"><button class="close" aria-label="關閉">×</button><div id="side-panel-body"></div></div>
```

- [ ] **Step 2: 實作 `src/ui/side-panel.js`**

```js
export const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

export function createSidePanel({ onClose }) {
  const el = document.getElementById("side-panel");
  const body = document.getElementById("side-panel-body");
  el.querySelector(".close").addEventListener("click", () => { close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open")) close(); });

  function section(title, html) { return `<h3>${title}</h3>${html}`; }

  function open(p) {
    const hasContent = (p.features && p.features.length) || (p.history && p.history.length) || p.travel;
    let html = `<h2>${p.names.zh}</h2><div class="en">${p.names.en}</div>`;
    const meta = [];
    if (p.capital) meta.push(`首都:${p.capital.zh}${p.capital.en ? ` (${p.capital.en})` : ""}`);
    if (p.timezone) meta.push(`時區:${p.timezone}`);
    if (p.latlon) meta.push(`位置:${p.latlon[0].toFixed(1)}, ${p.latlon[1].toFixed(1)}`);
    if (meta.length) html += `<div class="meta">${meta.join("　·　")}</div>`;

    if (!hasContent) {
      html += `<p style="color:#9fb2d8">內容建置中,之後會補上。</p>`;
    } else {
      if (p.features && p.features.length)
        html += section("特色", p.features.map((t) => `<p>${t}</p>`).join(""));
      if (p.travel) {
        const cells = MONTH_LABELS.map((m, i) =>
          `<span class="${p.travel.best.includes(i + 1) ? "best" : ""}">${m}</span>`).join("");
        html += section("適合旅遊月份", `<div class="months">${cells}</div><p>${p.travel.note}</p>`);
      }
      if (p.history && p.history.length)
        html += section("歷史介紹", p.history.map((t) => `<p>${t}</p>`).join(""));
    }
    body.innerHTML = html;
    el.classList.add("open");
  }

  function close() {
    if (!el.classList.contains("open")) return;
    el.classList.remove("open");
    onClose && onClose();
  }

  return { open, close, isOpen: () => el.classList.contains("open") };
}
```

- [ ] **Step 3: `src/main.js` 加 click 偵測與接線**

```js
import { createSidePanel } from "/src/ui/side-panel.js";
// start() 內:
const sidePanel = createSidePanel({ onClose: () => rig.resetView() });
window.__earth.sidePanel = sidePanel;

let downPos = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downPos = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;                 // 拖曳,不算點擊
  const cl = window.__earth.countryLayer;
  if (!cl) return;
  raycaster.setFromCamera(pointer, camera);
  const hit = cl.pick(raycaster);
  if (!hit) return;
  const [lon, lat] = hit.centroidLatLon;
  rig.flyTo(lat, lon, { distance: 1.7, ms: 1000 });
  sidePanel.open({
    code: hit.code, names: hit.names,
    capital: null, timezone: null, latlon: [lat, lon],
    features: [], travel: null, history: [],   // Task 9 換成真資料
  });
});
```

- [ ] **Step 4: 實測**

重整。Expected:點任一國家 → 鏡頭約 1 秒平滑飛到該國正面並拉近 → 右側面板滑入,顯示中英名 + 位置 + 「內容建置中」;按 × 或 Esc → 面板滑出、鏡頭飛回全球視角。拖曳地球不會誤觸開面板。截圖(飛入後 + 面板開啟)。

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/side-panel.js src/main.js
git commit -m "feat: 點擊國家鏡頭飛入 + 右側側欄(假資料)+ Esc/關閉回全球視角"
```

---

## Task 9: `data/countries.content.json` + 側欄真資料

**Files:**
- Create: `F:\Claude\earth-world\data\countries.content.json`
- Modify: `F:\Claude\earth-world\src\main.js`(載入 content、pick 時查表)

**Interfaces:**
- Consumes: 無新增。
- Produces:
  - `data/countries.content.json` = `{ "JP": { …entry… }, … }`,key 為 ISO_A2,對齊 `countryCode(feature)`。
  - entry 形狀:`{ name_zh, name_en, capital_zh, capital_en, timezone, capital_latlon:[lat,lon], features:string[](2–4), travel_months:{best:number[], note}, history:string[](3–5) }`
  - `src/main.js` 新增 `window.__earth.content`(物件)。

- [ ] **Step 1: 建 `data/countries.content.json`,先放 3 筆完整範例**

```json
{
  "JP": {
    "name_zh": "日本", "name_en": "Japan",
    "capital_zh": "東京", "capital_en": "Tokyo",
    "timezone": "Asia/Tokyo", "capital_latlon": [35.68, 139.69],
    "features": [
      "由本州、北海道、四國、九州等數千座島嶼組成的弧狀列島,約七成國土為山地,富士山是最高峰。",
      "位處環太平洋火山帶,地震與溫泉同樣密集;黑潮與親潮交會帶來豐富漁場。",
      "四季分明,春櫻、夏祭、秋楓、冬雪各自成為代表性景觀。"
    ],
    "travel_months": { "best": [3, 4, 10, 11], "note": "3–4 月賞櫻、10–11 月賞楓,氣候乾爽舒適;梅雨季(6 月)與盛夏濕熱可避開。" },
    "history": [
      "繩文、彌生時代後,大和政權於古墳時代逐步統一;7 世紀起大量吸收唐制,建立律令國家。",
      "12 世紀進入幕府時代,武士掌權延續近七百年,江戶時代長期鎖國並發展町人文化。",
      "1868 年明治維新推動現代化與工業化;二戰後在和平憲法下重建,成為經濟大國。"
    ]
  },
  "FR": {
    "name_zh": "法國", "name_en": "France",
    "capital_zh": "巴黎", "capital_en": "Paris",
    "timezone": "Europe/Paris", "capital_latlon": [48.85, 2.35],
    "features": [
      "西歐面積最大的國家,地形從北部平原、中央高原到阿爾卑斯與庇里牛斯山脈變化豐富。",
      "塞納河、羅亞爾河、隆河串起農業與葡萄酒產區,大西洋與地中海雙海岸線。",
      "以藝術、時尚、飲食與世界遺產密度聞名,巴黎為長期的文化與思想中心。"
    ],
    "travel_months": { "best": [5, 6, 9, 10], "note": "晚春與初秋氣候宜人、遊客較少;7–8 月為旅遊旺季且許多店家休假。" },
    "history": [
      "高盧地區於羅馬時代納入版圖,法蘭克王國奠定國家雛形,卡佩王朝逐步集權。",
      "歷經百年戰爭、宗教戰爭與絕對王權的凡爾賽時代;1789 年法國大革命終結舊制度。",
      "拿破崙帝國後歷經多次共和與帝制更替,20 世紀兩次大戰皆為主戰場,戰後推動歐洲整合。"
    ]
  },
  "NZ": {
    "name_zh": "紐西蘭", "name_en": "New Zealand",
    "capital_zh": "威靈頓", "capital_en": "Wellington",
    "timezone": "Pacific/Auckland", "capital_latlon": [-41.29, 174.78],
    "features": [
      "由南、北兩大島與眾多小島構成,位於板塊交界,多火山、地熱與斷層地形。",
      "南島有南阿爾卑斯山脈與冰河峽灣,北島多火山與溫泉;人口稀少、牧場遍布。",
      "生態長期與大陸隔離,孕育奇異鳥等特有種;毛利文化為重要認同來源。"
    ],
    "travel_months": { "best": [12, 1, 2, 3], "note": "南半球夏季(12–3 月)日照長、適合健行與峽灣行程;冬季(7–8 月)則是南島滑雪季。" },
    "history": [
      "毛利人約於 13 世紀自東波利尼西亞抵達,發展出部落社會與航海傳統。",
      "1840 年《懷唐伊條約》後成為英國殖民地,19 世紀爆發土地戰爭。",
      "20 世紀逐步獨立自治,1893 年成為全球首個賦予女性投票權的自治體,近代推動雙文化政策。"
    ]
  }
}
```

- [ ] **Step 2: 補完其餘 17 國**

用下表的事實骨架(首都、時區、首都經緯度、建議月份為起點),`features`(2–4 段)與 `history`(3–5 段)參考維基百科等公開資料**自行改寫**,勿逐字複製;每段 40–90 字,繁體中文。

| code | 中/英 | 首都 | timezone | capital_latlon | best(月) |
|---|---|---|---|---|---|
| KR | 韓國 / South Korea | 首爾 Seoul | Asia/Seoul | [37.57, 126.98] | 4,5,9,10 |
| CN | 中國 / China | 北京 Beijing | Asia/Shanghai | [39.90, 116.40] | 4,5,9,10 |
| TW | 臺灣 / Taiwan | 臺北 Taipei | Asia/Taipei | [25.03, 121.57] | 10,11,12,3 |
| TH | 泰國 / Thailand | 曼谷 Bangkok | Asia/Bangkok | [13.75, 100.50] | 11,12,1,2 |
| VN | 越南 / Vietnam | 河內 Hanoi | Asia/Ho_Chi_Minh | [21.03, 105.85] | 2,3,4,11 |
| IN | 印度 / India | 新德里 New Delhi | Asia/Kolkata | [28.61, 77.21] | 10,11,12,2 |
| IT | 義大利 / Italy | 羅馬 Rome | Europe/Rome | [41.90, 12.50] | 4,5,6,9 |
| ES | 西班牙 / Spain | 馬德里 Madrid | Europe/Madrid | [40.42, -3.70] | 4,5,9,10 |
| DE | 德國 / Germany | 柏林 Berlin | Europe/Berlin | [52.52, 13.40] | 5,6,7,9 |
| GB | 英國 / United Kingdom | 倫敦 London | Europe/London | [51.51, -0.13] | 5,6,7,9 |
| GR | 希臘 / Greece | 雅典 Athens | Europe/Athens | [37.98, 23.73] | 4,5,6,9 |
| EG | 埃及 / Egypt | 開羅 Cairo | Africa/Cairo | [30.04, 31.24] | 10,11,12,2 |
| US | 美國 / United States | 華盛頓 Washington, D.C. | America/New_York | [38.90, -77.04] | 4,5,9,10 |
| CA | 加拿大 / Canada | 渥太華 Ottawa | America/Toronto | [45.42, -75.70] | 6,7,8,9 |
| MX | 墨西哥 / Mexico | 墨西哥城 Mexico City | America/Mexico_City | [19.43, -99.13] | 11,12,3,4 |
| BR | 巴西 / Brazil | 巴西利亞 Brasília | America/Sao_Paulo | [-15.79, -47.88] | 5,6,7,9 |
| AU | 澳洲 / Australia | 坎培拉 Canberra | Australia/Sydney | [-35.28, 149.13] | 3,4,9,10,11 |

> 注意:`countries.geo.json` 若某國的 `ISO_A2_EH` 不是上表 code(例如爭議地區),以 Step 3 實測時 console 印出的實際 `countryCode()` 為準修正 key。臺灣在 Natural Earth 常為 `TW`。

- [ ] **Step 3: `src/main.js` 載入 content 並在點擊時查表**

```js
// 與 geojson 併行載入:
fetch("/data/countries.content.json").then((r) => r.ok ? r.json() : {}).then((c) => {
  window.__earth.content = c;
}).catch(() => { window.__earth.content = {}; });
```

把 Task 8 Step 3 的 `sidePanel.open({...})` 換成:

```js
const c = (window.__earth.content || {})[hit.code];
sidePanel.open({
  code: hit.code,
  names: hit.names,
  capital: c ? { zh: c.capital_zh, en: c.capital_en } : null,
  timezone: c ? c.timezone : null,
  latlon: c ? c.capital_latlon : [lat, lon],
  features: c ? c.features : [],
  travel: c ? c.travel_months : null,
  history: c ? c.history : [],
});
const flyLat = c ? c.capital_latlon[0] : lat;
const flyLon = c ? c.capital_latlon[1] : lon;
rig.flyTo(flyLat, flyLon, { distance: 1.7, ms: 1000 });
```

(把先前無條件的 `rig.flyTo` 移除,改用這裡帶首都座標的版本。)

- [ ] **Step 4: 驗證 JSON 合法 + 實測**

Run:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe -e "JSON.parse(require('fs').readFileSync('./data/countries.content.json'));console.log('json ok')"`
重整。逐一點日本、法國、紐西蘭、臺灣、美國:Expected 側欄顯示特色/旅遊月份(對的月份高亮)/歷史;點一個沒建資料的國家(如冰島 IS)顯示「內容建置中」。截圖 2–3 張。

- [ ] **Step 5: Commit**

```bash
git add data/countries.content.json src/main.js
git commit -m "feat: 精選 20 國內容資料 + 側欄改接真實特色/旅遊月份/歷史"
```

---

## Task 10: 右上角時間 + 天氣 `src/ui/clock-weather.js`

**Files:**
- Create: `F:\Claude\earth-world\src\ui\clock-weather.js`
- Modify: `F:\Claude\earth-world\index.html`(加 `#clock-weather` + 樣式)
- Modify: `F:\Claude\earth-world\src\main.js`

**Interfaces:**
- Consumes: `formatZonedTime`、`weatherCodeToIcon`(from geo.js)。
- Produces:
  - `createClockWeather() -> { setCountry({ code, name_zh, timezone, latlon }), clear() }`
    - 內部每秒 `setInterval` 更新時間顯示;`setCountry` 時抓一次天氣。
    - 天氣快取:`Map<code, { at:number, html:string }>`,10 分鐘內重用。
    - fetch 逾時 3 秒(`AbortController`);失敗天氣區塊顯示 `—`,時間照常。
    - 未 `setCountry` 或 `clear()` 後:顯示提示「將滑鼠移到國家並點擊,看當地時間與天氣」。

- [ ] **Step 1: `index.html` 加容器與樣式**

`<style>` 追加:

```css
#clock-weather {
  position: fixed; top: 18px; right: 18px; z-index: 42;
  padding: 12px 16px; border-radius: 10px; text-align: right;
  background: rgba(10, 14, 26, 0.7); backdrop-filter: blur(10px);
  border: 1px solid rgba(120, 170, 255, 0.22); color: #e7edfb;
  font: 13px/1.5 system-ui, "Microsoft JhengHei", sans-serif; min-width: 180px;
}
#clock-weather .cw-country { font-size: 13px; color: #8fd4ff; }
#clock-weather .cw-date { font-size: 12px; color: #b9c6e6; }
#clock-weather .cw-time { font-size: 22px; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
#clock-weather .cw-weather { font-size: 13px; margin-top: 4px; }
#clock-weather .cw-hint { font-size: 12px; color: #9fb2d8; }
```

`<body>` 加:`<div id="clock-weather"><div class="cw-hint">將滑鼠移到國家並點擊,看當地時間與天氣</div></div>`

- [ ] **Step 2: 實作 `src/ui/clock-weather.js`**

```js
import { formatZonedTime, weatherCodeToIcon } from "/src/lib/geo.js";

const TEN_MIN = 10 * 60 * 1000;

export function createClockWeather() {
  const el = document.getElementById("clock-weather");
  const cache = new Map();
  let current = null;   // { code, name_zh, timezone, latlon }
  let weatherHtml = "";

  function renderHint() {
    el.innerHTML = `<div class="cw-hint">將滑鼠移到國家並點擊,看當地時間與天氣</div>`;
  }

  function renderTick() {
    if (!current) return;
    const { date, time, weekday } = formatZonedTime(new Date(), current.timezone);
    el.innerHTML =
      `<div class="cw-country">${current.name_zh}</div>` +
      `<div class="cw-date">${date}(${weekday})</div>` +
      `<div class="cw-time">${time}</div>` +
      `<div class="cw-weather">${weatherHtml || "天氣 —"}</div>`;
  }

  async function fetchWeather(c) {
    const hit = cache.get(c.code);
    if (hit && Date.now() - hit.at < TEN_MIN) { weatherHtml = hit.html; return; }
    const [lat, lon] = c.latlon;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error("weather " + r.status);
      const j = await r.json();
      const t = Math.round(j.current.temperature_2m);
      const { icon, label } = weatherCodeToIcon(j.current.weather_code);
      weatherHtml = `${icon} ${label} ${t}°C`;
      cache.set(c.code, { at: Date.now(), html: weatherHtml });
    } catch (e) {
      console.warn("[clock-weather] 天氣抓取失敗:", e.message);
      weatherHtml = "天氣 —";
    } finally {
      clearTimeout(timer);
      renderTick();
    }
  }

  setInterval(renderTick, 1000);

  return {
    setCountry(c) {
      if (!c || !c.timezone) { current = null; renderHint(); return; }
      current = c; weatherHtml = "";
      renderTick();
      fetchWeather(c);
    },
    clear() { current = null; renderHint(); },
  };
}
```

- [ ] **Step 3: `src/main.js` 接線**

```js
import { createClockWeather } from "/src/ui/clock-weather.js";
// start() 內:
const clockWeather = createClockWeather();
window.__earth.clockWeather = clockWeather;
```

點擊處理(Task 9)成功 `sidePanel.open` 後補:

```js
if (c) clockWeather.setCountry({ code: hit.code, name_zh: c.name_zh, timezone: c.timezone, latlon: c.capital_latlon });
else clockWeather.setCountry(null);
```

`createSidePanel` 的 `onClose` 改成:

```js
const sidePanel = createSidePanel({ onClose: () => { rig.resetView(); clockWeather.clear(); } });
```

- [ ] **Step 4: 實測**

重整。點日本:Expected 右上角顯示「日本 / 2026/…(週X)/ HH:MM:SS 每秒跳 / ☀️ 晴 12°C」之類;關閉側欄後回到提示字。斷網或擋掉 api.open-meteo.com 時,時間仍跳、天氣顯示「—」。截圖。

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/clock-weather.js src/main.js
git commit -m "feat: 右上角依選取國家時區顯示當地時間 + Open-Meteo 天氣(3s 逾時、10 分快取、降級)"
```

---

## Task 11: 環境音 `src/audio/ambient.js` + 靜音/音量 UI

**Files:**
- Create: `F:\Claude\earth-world\src\audio\ambient.js`
- Modify: `F:\Claude\earth-world\index.html`(加 `#audio-ui` + 樣式)
- Modify: `F:\Claude\earth-world\src\main.js`

**Interfaces:**
- Consumes: 無。
- Produces:
  - `createAmbientAudio() -> { toggleMute(), setVolume(0..1), isMuted() }`
    - 第一次使用者手勢(pointerdown)才 `new AudioContext()` 並啟動振盪器。
    - 預設靜音(masterGain = 0);`toggleMute` 在 0 與目前音量間切換。
    - UI:`#audio-ui` 內一個喇叭按鈕 + range slider。

- [ ] **Step 1: `index.html` 加 UI 與樣式**

`<style>` 追加:

```css
#audio-ui {
  position: fixed; left: 18px; bottom: 18px; z-index: 42; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 10px; background: rgba(10, 14, 26, 0.7); backdrop-filter: blur(10px);
  border: 1px solid rgba(120, 170, 255, 0.22); color: #e7edfb;
  font: 13px system-ui, "Microsoft JhengHei", sans-serif;
}
#audio-ui button { background: none; border: none; color: #dfe8ff; font-size: 18px; cursor: pointer; }
#audio-ui input[type=range] { width: 90px; }
```

`<body>` 加:

```html
<div id="audio-ui">
  <button id="audio-toggle" aria-label="開關背景音">🔇</button>
  <input id="audio-vol" type="range" min="0" max="100" value="45">
</div>
```

- [ ] **Step 2: 實作 `src/audio/ambient.js`**

```js
export function createAmbientAudio() {
  let ctx = null, master = null, lfo = null, filter = null;
  let muted = true;
  let volume = 0.45;          // slider 對應的「非靜音音量」比例
  const PEAK = 0.06;          // 實際送到喇叭的上限

  function ensureStarted() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * PEAK;
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 6;
    filter.connect(master).connect(ctx.destination);

    const freqs = [55, 82.5, 110];         // A1 + E2 + A2
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.006); // 微失諧
      const g = ctx.createGain();
      g.gain.value = 0.5 / freqs.length;
      osc.connect(g).connect(filter);
      osc.start();
    });

    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
  }

  function applyGain() {
    if (!master) return;
    master.gain.setTargetAtTime(muted ? 0 : volume * PEAK, ctx.currentTime, 0.4);
  }

  window.addEventListener("pointerdown", () => {
    ensureStarted();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }, { once: false });

  return {
    toggleMute() { muted = !muted; ensureStarted(); applyGain(); return muted; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (!muted) applyGain(); },
    isMuted() { return muted; },
  };
}
```

- [ ] **Step 3: `src/main.js` 接線**

```js
import { createAmbientAudio } from "/src/audio/ambient.js";
// start() 內:
const ambient = createAmbientAudio();
const audioToggle = document.getElementById("audio-toggle");
const audioVol = document.getElementById("audio-vol");
audioToggle.addEventListener("click", () => {
  const muted = ambient.toggleMute();
  audioToggle.textContent = muted ? "🔇" : "🔊";
});
audioVol.addEventListener("input", () => ambient.setVolume(audioVol.value / 100));
```

- [ ] **Step 4: 實測**

重整(先點一下畫面任意處建立 AudioContext)。按喇叭鈕:Expected 圖示切 🔊 並聽到低沉、緩慢起伏的宇宙 drone;拉音量條有反應;再按一次靜音。console 無 AudioContext 警告(除了首次未手勢前的,可忽略)。

- [ ] **Step 5: Commit**

```bash
git add index.html src/audio/ambient.js src/main.js
git commit -m "feat: Web Audio 合成宇宙環境音 + 靜音/音量 UI(預設靜音、首次手勢啟動)"
```

---

## Task 12: 錯誤處理收尾 + README + 全流程瀏覽器實測

**Files:**
- Modify: `F:\Claude\earth-world\src\main.js`(集中錯誤處理、載入序穩定化)
- Create: `F:\Claude\earth-world\README.md`

**Interfaces:**
- Consumes: 全部既有模組。
- Produces:無新介面;確保 spec §7 錯誤處理與 §8 驗證項目全數成立。

- [ ] **Step 1: 集中錯誤處理**

在 `src/main.js`:
- 包一個全域 `window.addEventListener("error", …)` 與 `unhandledrejection` → 呼叫 `showError("發生未預期錯誤,詳見主控台")`(僅第一次)。
- geojson fetch 失敗:已 `showError`;另確保地球與星空不受影響仍可轉。
- 貼圖全失敗時(4 張都 null):`showError("地球貼圖載入失敗,已切換為純色地球")`。在 `createGlobe` 的 async 區塊統計成功數,全 0 時透過傳入的 callback 通知 main。把 `createGlobe()` 簽名改為 `createGlobe({ onTextureResult })`,回報 `{ loaded, total }`。

```js
// globe.js async 區塊結尾:
const loaded = [color, normal, spec, night].filter(Boolean).length;
onTextureResult && onTextureResult({ loaded, total: 4 });
// main.js:
const globe = createGlobe({ onTextureResult: ({ loaded }) => {
  if (loaded === 0) showError("地球貼圖載入失敗,已切換為純色地球");
}});
```

- [ ] **Step 2: 寫 `README.md`**

```markdown
# 地球世界(Earth World)

3D 互動地球儀視覺作品 — 階段一雛形。地球置於宇宙星空中自轉,國家可懸停高亮、
點擊查看特色 / 適合旅遊月份 / 歷史,右上角顯示所選國家的當地時間與天氣,背景有
即時合成的宇宙環境音。

## 執行

需求:Windows + PowerShell、Chrome。

1. 開 PowerShell 執行:`powershell -ExecutionPolicy Bypass -File .\serve.ps1`
2. 瀏覽器開 `http://localhost:8760/`

無需安裝任何套件(three.js / earcut 由 CDN 載入)。

## 操作

- 滑鼠左鍵拖曳:轉動地球;滾輪:縮放
- 游標移到地球上:暫停自轉;移到國家:高亮 + 顯示名稱
- 點擊國家:鏡頭飛入 + 右側介紹面板;Esc 或關閉鈕:回全球視角
- 左下角:背景音開關與音量(預設靜音)

## 開發

- 純函式測試:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/`
- 設計文件:`docs/superpowers/specs/2026-09-08-earth-world-design.md`
- 實作計畫:`docs/superpowers/plans/2026-09-08-earth-world.md`

## 資料來源

- 地球貼圖:NASA(經 three.js 範例庫轉存),公有領域
- 國界:Natural Earth 110m Admin-0,公有領域
- 天氣:Open-Meteo API
```

- [ ] **Step 3: 純函式測試回歸**

Run:`F:\Claude\ai-tools\node-v22.14.0-win-x64\node.exe --test test/`
Expected:全綠。

- [ ] **Step 4: Claude in Chrome 全流程實測(對照 spec §8)**

起 `serve.ps1`,開 `http://localhost:8760/`,逐項截圖確認:
1. 地球有真實貼圖且自轉、星空在、亮度緩慢起伏
2. 游標移到地球上自轉暫停、移開約 1.5s 恢復
3. 左鍵拖曳可轉、滾輪縮放有上下限、放開有阻尼
4. hover 國家淡青高亮 + tooltip 顯示「中文 English」
5. 點國家:鏡頭約 1s 飛入 + 側欄滑出,特色/旅遊月份(正確月份高亮)/歷史正確
6. 右上角時間依該國時區每秒跳、天氣有值或正常降級為「—」
7. 左下角靜音鈕可開關環境音、音量條有效
8. 無資料國家顯示「內容建置中」
9. 關閉側欄回全球視角、右上角回提示字
10. DevTools console 無紅色錯誤(國家三角化 warn 可接受)

把任何未過項目當缺陷修掉後重跑本步。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 集中錯誤處理 + README + 全流程實測通過(階段一雛形完成)"
```

---

## Self-Review(對照 spec)

**Spec coverage:**
- §1 階段一 8 項功能 → 3D 地球/自轉(T4)、hover 暫停(T5)、星空(T3)、拖曳縮放(T5)、國界 hover + tooltip(T6/T7)、點擊 flyTo + 側欄(T8)、側欄五類內容(T9)、右上角時間 + 天氣(T10)、環境音預設靜音 + 控制(T11)。✓
- §1 YAGNI 不做項 → 計畫未包含每國地形建模、即時天氣以外資料、晨昏線動態、200 國深度內容、建置工具鏈。✓
- §2 方案 A(earcut + 近乎透明 mesh + raycast + opacity/color 高亮)→ T7。✓ 被否決方案未出現。
- §3 檔案結構 → 檔案表逐一對應(`src/lib/geo.js` 對應 spec 的純函式庫;spec §3 未列 `lib/` 但 §8 明確要求純函式測試,故納入,不算超出範圍)。✓
- §4.1–4.8 元件 → T4/T3/T5/T6+T7/T7/T8+T9/T10/T11。✓
- §5 資料格式 → T9 entry 形狀與 spec 一致(欄位名 `capital_latlon`、`travel_months.best/note`、`history[]`)。✓
- §5 需下載資源 → T4、T6 都含「先列清單取得同意」步驟。✓ 貼圖改用 three.js r160 範例庫的 NASA 2048 貼圖(spec 允許「2K」),與 spec 精神一致。
- §6 資料流 → T6/T7 把 borders 與 country layer 掛在 `globe.object` 隨自轉;事件對應 pointermove/enter/leave、click 非拖曳、Esc/關閉。✓
- §7 錯誤處理 → 貼圖失敗退純色(T4/T12)、geojson 失敗橫幅(T6)、Open-Meteo 逾時降級(T10)、WebGL 不支援(T1)、raycast 未命中無錯(T7)、earcut 失敗 warn 略過(T7)。✓
- §8 測試 → 純函式 `node --test`(T2,T12 回歸)、瀏覽器全流程(T12)。✓
- §9 里程碑 10 項 → T3–T12 對應(T1 骨架 + T2 純函式為前置)。✓

**Placeholder scan:** 各步均有實際程式碼或實際資料;T9 Step 2 的 17 國 prose 屬「依公開資料撰寫」的內容產出,已給欄位骨架 + 3 筆完整範例 + 每段字數規範,非 TODO。無 "TBD/待補"。

**Type consistency:**
- `latLonToXYZ(lat, lon, radius)` 參數順序在 geo.js、borders.js、country-layer.js、camera-controls.js 一致(緯度在前)。
- `countryCode(feature)` / `countryNames(feature)` 在 borders.js 定義,country-layer.js 匯入使用,名稱一致。
- `pick(raycaster) -> { code, names, centroidLatLon }`:T7 定義,T8/T9 解構同名欄位;`centroidLatLon` 為 `[lon, lat]`(T8 解構用 `const [lon, lat] =`),與 `ringCentroid` 回傳序一致。
- 側欄 `open(payload)` 的 payload 欄位(`names/capital/timezone/latlon/features/travel/history`)在 T8 定義、T9 沿用同名。
- `createGlobe` 在 T4 無參數、T12 改為 `createGlobe({ onTextureResult })` — T12 明列此簽名變更與呼叫端同步修改。
- `clockWeather.setCountry({ code, name_zh, timezone, latlon })`:T10 定義,T10 Step 3 呼叫端欄位一致。

發現並已於計畫內修正:T8 原本無條件 `rig.flyTo`,T9 Step 3 明確要求移除改用帶首都座標版本,避免雙重呼叫。
