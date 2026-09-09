# 國家大百科(Wave B)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 側欄加「詳細介紹 ›」→ 全螢幕疊層的國家大百科(發展史 / 大事年表 / 特色動物 / 特色食物 / 著名景點 / 推薦景點 / 著名名人 / 圖片來源),資料每國一檔、點擊時才載入,先做重點 20 國。

**Architecture:** 新 `src/ui/encyclopedia.js` 管理 `#encyclopedia` 疊層,`open(code)` fetch `/data/deep/<code>.json`(Map 快取,404 → 建置中)並渲染分區塊。內容由 subagent 從 Wikipedia 研究產出 `batch-deep-N.json`(圖片欄位是「請求物件」),controller 跑 `deep-merge.mjs` 驗證授權 + `curl` 抓圖 + Pillow 縮到 1024/q82 存 `assets/deep/<CODE>/`,產出 `data/deep/<CODE>.json`。

**Tech Stack:** 原生 ES modules、three@0.160.0(不動)、`serve.ps1`、Node 22 內建 test runner、SD venv 的 Python(Pillow)做縮圖、`curl` 抓圖。

**Spec:** `docs/superpowers/specs/2026-09-09-earth-world-encyclopedia-design.md`

## Global Constraints

- three.js 固定 `0.160.0`,無建置步驟,靜態站 port 8760,所有站內路徑用根相對(`/src/...`、`/data/...`、`/assets/...`)。
- 全繁體中文、台灣用法。所有寫進 DOM 的字串過 `esc()`。
- 每國內容獨立檔 `data/deep/<CODE>.json`,疊層開啟時才 fetch;不併入 `countries.content.json`。
- `<CODE>` = `ISO_A2_EH → ISO_A2 → NAME.toUpperCase()`;含空白/點的代碼(`N. CYPRUS`)檔名把 ` ` 與 `.` 換成 `_`:`data/deep/N._CYPRUS.json`。
- 圖片只收 **CC0 / 公有領域 / CC BY / CC BY-SA**;來源限 Wikimedia Commons;每張都要 `credits` 有 `author` + `license` + `source`(Commons File: 網址)。
- 圖片長邊 1024px、JPEG q82;每國 ≤ 12 張(國旗除外,國旗續用 flagcdn)。
- 不做網址路由 / 深連結。不做編輯 / 投稿。不做影片音訊。
- git 身分:per-repo `user.email = a7779782@gmail.com`、`user.name = Claude`。commit trailer:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01P8D1soP2WJHoREEJK675M1`
- SDD 工作區 `.superpowers/sdd/country-encyclopedia/`(已 gitignore);ledger `progress.md`、`deep-merge.mjs`、`batch-deep-N.json`。

---

### Task 1: 抽出 `src/lib/esc.js` 共用 HTML 逸脫

**Files:**
- Create: `src/lib/esc.js`
- Create: `test/esc.test.mjs`
- Modify: `src/ui/side-panel.js`(移除本地 `esc`,改 import)

**Interfaces:**
- Produces: `export function esc(s): string` —— 把 `& < > " '` 換成對應 HTML entity,非字串先 `String()`。

- [ ] **Step 1: 寫失敗測試**

```js
// test/esc.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc } from "../src/lib/esc.js";

test("esc 逸脫 HTML 特殊字元", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});
test("esc 對非字串先轉字串", () => {
  assert.equal(esc(42), "42");
  assert.equal(esc(null), "null");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --test`(repo 根目錄)
Expected: FAIL —— `Cannot find module '../src/lib/esc.js'`

- [ ] **Step 3: 建立模組**

```js
// src/lib/esc.js
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
```

- [ ] **Step 4: side-panel.js 改用**

`src/ui/side-panel.js` 頂部:把本地 `function esc(s) {...}` 整段刪除,改成
```js
import { esc } from "/src/lib/esc.js";
```
(該檔已有 `import { weatherCodeToIcon, ... } from "/src/lib/geo.js";`,新增這行即可。`fmtPop` 內部呼叫的 `esc` 不變。)

- [ ] **Step 5: 跑測試 + node --check**

Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --test` → 全綠(含既有 10 項 + 新 2 項)
Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --check src/ui/side-panel.js` → OK

- [ ] **Step 6: Commit**

```bash
git add src/lib/esc.js test/esc.test.mjs src/ui/side-panel.js
git -c user.email=a7779782@gmail.com -c user.name=Claude commit -m "refactor: 抽出 src/lib/esc.js 共用(side-panel 與即將加入的 encyclopedia 共用)"
```

---

### Task 2: `#encyclopedia` 疊層骨架(HTML + CSS + open/close)

**Files:**
- Modify: `index.html`(新增 `#encyclopedia` 容器 + CSS)
- Create: `src/ui/encyclopedia.js`
- Modify: `src/main.js`(建立 + 暫時掛到 `window.__earth.encyclopedia` 供實測)

**Interfaces:**
- Produces: `createEncyclopedia() -> { open(code: string): void, close(): void, isOpen(): boolean }`
  - `open(code)`：把 `#encyclopedia` 加 `.open`(CSS transform 滑入)、內容區先顯示「載入中…」。Task 3 接資料。
  - `close()`：移除 `.open`。
  - `isOpen()`：`#encyclopedia` 是否有 `.open`。
- Consumes(Task 1):`esc` from `/src/lib/esc.js`。

- [ ] **Step 1: index.html 加容器**

`<div id="tw-clock"></div>` 之後、`<div id="country-labels"></div>` 之前插入:
```html
  <div id="encyclopedia" aria-hidden="true">
    <div class="enc-topbar">
      <button class="enc-back" aria-label="返回地球">‹ 返回</button>
      <span class="enc-title"></span>
      <button class="enc-close" aria-label="關閉">×</button>
    </div>
    <div class="enc-scroll"><div id="enc-body"></div></div>
  </div>
```

- [ ] **Step 2: index.html 加 CSS**

在 `#side-panel` 相關樣式後面加:
```css
  #encyclopedia {
    position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
    background: rgba(6, 9, 18, 0.94); backdrop-filter: blur(18px); color: #e7edfb;
    font: 14px/1.75 system-ui, "Microsoft JhengHei", sans-serif;
    transform: translateY(100%); transition: transform .5s cubic-bezier(.22,.61,.36,1);
    will-change: transform;
  }
  #encyclopedia.open { transform: translateY(0); }
  #encyclopedia .enc-topbar {
    flex: 0 0 auto; display: flex; align-items: center; gap: 14px;
    padding: 14px 22px; border-bottom: 1px solid rgba(120,170,255,.18);
    background: rgba(10,14,26,.6);
  }
  #encyclopedia .enc-title { flex: 1; font-size: 16px; font-weight: 700; letter-spacing: .04em; }
  #encyclopedia .enc-topbar button {
    background: none; border: 1px solid rgba(120,170,255,.28); color: #dfe8ff;
    border-radius: 7px; padding: 5px 12px; font: inherit; cursor: pointer;
  }
  #encyclopedia .enc-topbar button:hover { background: rgba(77,163,255,.18); }
  #encyclopedia .enc-close { font-size: 18px; line-height: 1; padding: 2px 10px; }
  #encyclopedia .enc-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
  #encyclopedia #enc-body { max-width: 920px; margin: 0 auto; padding: 26px 24px 120px; }
  #encyclopedia h2 { font-size: 30px; margin: 0 0 4px; }
  #encyclopedia .enc-en { color: #9fb2d8; font-size: 14px; margin-bottom: 14px; }
  #encyclopedia h3 {
    font-size: 15px; letter-spacing: .06em; color: #8fd4ff;
    margin: 34px 0 12px; padding-bottom: 6px; border-bottom: 1px solid rgba(120,170,255,.15);
  }
  #encyclopedia p { margin: 0 0 12px; }
  #encyclopedia .enc-facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; font-size: 13px; }
  #encyclopedia .enc-facts dt { color: #8fd4ff; }
  #encyclopedia .enc-facts dd { margin: 0; color: #dbe4f7; }
  #encyclopedia .enc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; }
  #encyclopedia .enc-card { background: rgba(255,255,255,.04); border: 1px solid rgba(120,170,255,.14); border-radius: 10px; overflow: hidden; }
  #encyclopedia .enc-card img { display: block; width: 100%; height: 132px; object-fit: cover; background: rgba(255,255,255,.05); }
  #encyclopedia .enc-card .enc-card-body { padding: 10px 12px 12px; }
  #encyclopedia .enc-card b { font-size: 14px; }
  #encyclopedia .enc-card .enc-card-en { color: #9fb2d8; font-size: 12px; }
  #encyclopedia .enc-card p { font-size: 12.5px; margin: 6px 0 0; color: #cdd8ef; }
  #encyclopedia .enc-timeline { list-style: none; padding: 0; margin: 0; }
  #encyclopedia .enc-timeline li { display: grid; grid-template-columns: 68px 1fr; gap: 12px; padding: 7px 0; border-bottom: 1px dashed rgba(120,170,255,.12); }
  #encyclopedia .enc-timeline .enc-year { color: #8fd4ff; font-variant-numeric: tabular-nums; }
  #encyclopedia .enc-credits { font-size: 11.5px; color: #8093b5; }
  #encyclopedia .enc-credits li { margin: 3px 0; }
  #encyclopedia .enc-dim { color: #9fb2d8; }
  @media (prefers-reduced-motion: reduce) {
    #encyclopedia { transition: none; }
  }
```

- [ ] **Step 3: 建立 `src/ui/encyclopedia.js`(僅 open/close)**

```js
import { esc } from "/src/lib/esc.js";

export function createEncyclopedia() {
  const el = document.getElementById("encyclopedia");
  const titleEl = el.querySelector(".enc-title");
  const bodyEl = document.getElementById("enc-body");

  el.querySelector(".enc-close").addEventListener("click", close);
  el.querySelector(".enc-back").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("open")) { e.stopPropagation(); close(); }
  });

  function open(code) {
    titleEl.textContent = "";
    bodyEl.innerHTML = `<p class="enc-dim">載入中…</p>`;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    // Task 3 會在這裡 fetch /data/deep/<code>.json 並渲染
  }
  function close() {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  }
  return { open, close, isOpen: () => el.classList.contains("open") };
}
```

- [ ] **Step 4: main.js 建立(暫時)**

`src/main.js` import 區加 `import { createEncyclopedia } from "/src/ui/encyclopedia.js";`;
在 `const sidePanel = createSidePanel({...})` 之後加:
```js
  const encyclopedia = createEncyclopedia();
  window.__earth.encyclopedia = encyclopedia;
```

- [ ] **Step 5: node --check + 瀏覽器實測(controller)**

Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --check src/ui/encyclopedia.js src/main.js`
瀏覽器:`window.__earth.encyclopedia.open("JP")` → 疊層由下滑入、顯示「載入中…」;按 ✕ / 返回 / Esc → 滑出。

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/encyclopedia.js src/main.js
git -c user.email=a7779782@gmail.com -c user.name=Claude commit -m "feat: 國家大百科疊層骨架(#encyclopedia + open/close + 滑入動畫)"
```

---

### Task 3: encyclopedia 資料載入 + 分區塊渲染

**Files:**
- Modify: `src/ui/encyclopedia.js`
- Create: `data/deep/JP.json`(手寫最小樣本,供開發 / 審查對照;之後由產線覆蓋)

**Interfaces:**
- Consumes: `data/deep/<CODE>.json`,schema(spec §3.2):
  `{ code, name_zh, name_en, summary, founding: string[], quick_facts: {official_name_zh?, area_km2?, languages?: string[], religion?, currency?, government?}, animals/foods/landmarks/people: {zh, en?, note, image?, latlon?}[], recommended: {zh, note}[], events: {year:number, zh:string}[], credits: {file, title?, author, license, source}[] }`
- Produces:(`encyclopedia.js` 內部)`render(code, data)`;`open(code)` 帶 fetch + Map 快取 + 404 fallback。

- [ ] **Step 1: 寫 `data/deep/JP.json` 樣本**

```json
{
  "code": "JP",
  "name_zh": "日本", "name_en": "Japan",
  "summary": "東亞的弧狀島國,由四大島與數千小島組成,融合古老傳統與尖端科技。",
  "founding": [
    "傳說神武天皇於西元前 660 年建國;考古上,繩文、彌生文化之後,大和政權於古墳時代(3–6 世紀)逐步統一列島。",
    "7 世紀大化改新引入唐制,建立律令國家;平安時代發展出假名與宮廷文學。",
    "12 世紀鎌倉幕府開啟武家政治,延續近七百年;江戶時代長期鎖國,町人文化繁盛。",
    "1868 年明治維新推動現代化;二戰戰敗後在和平憲法下重建,成為經濟與科技大國。"
  ],
  "quick_facts": {
    "official_name_zh": "日本國",
    "area_km2": 377975,
    "languages": ["日語"],
    "religion": "神道與佛教並行,無國教",
    "currency": "日圓(JPY)",
    "government": "議會內閣制君主立憲"
  },
  "animals": [
    { "zh": "日本獼猴", "en": "Japanese macaque", "note": "分布最北的靈長類,以雪地泡溫泉聞名。" },
    { "zh": "丹頂鶴", "en": "Red-crowned crane", "note": "北海道濕原的象徵,古來視為長壽吉兆。" },
    { "zh": "日本鹿", "en": "Sika deer", "note": "奈良公園的野鹿與神社文化緊密相連。" }
  ],
  "foods": [
    { "zh": "壽司", "en": "Sushi", "note": "醋飯配生鮮魚貝,江戶前握壽司為代表。" },
    { "zh": "拉麵", "en": "Ramen", "note": "鹼水麵配長時間熬煮高湯,各地湯頭差異極大。" },
    { "zh": "天婦羅", "en": "Tempura", "note": "海鮮蔬菜裹薄衣油炸,講究酥而不膩。" }
  ],
  "landmarks": [
    { "zh": "富士山", "en": "Mount Fuji", "note": "海拔 3776 公尺的活火山,日本精神象徵。", "latlon": [35.36, 138.73] },
    { "zh": "京都清水寺", "en": "Kiyomizu-dera", "note": "懸空木造舞台,春櫻秋楓名所。", "latlon": [34.99, 135.78] },
    { "zh": "嚴島神社", "en": "Itsukushima Shrine", "note": "海上大鳥居,漲潮時彷彿浮於水面。", "latlon": [34.30, 132.32] }
  ],
  "recommended": [
    { "zh": "3–4 月的京都", "note": "櫻花與寺院庭園相映,建議清晨避開人潮。" },
    { "zh": "冬季的北海道", "note": "雪祭、滑雪與流冰;函館夜景值得一訪。" }
  ],
  "people": [
    { "zh": "宮崎駿", "en": "Hayao Miyazaki", "note": "吉卜力工作室動畫導演,《神隱少女》奪奧斯卡。" },
    { "zh": "村上春樹", "en": "Haruki Murakami", "note": "當代最具國際知名度的日本小說家之一。" },
    { "zh": "大谷翔平", "en": "Shohei Ohtani", "note": "投打二刀流的棒球選手,多次美職 MVP。" }
  ],
  "events": [
    { "year": 794, "zh": "遷都平安京(今京都),平安時代開始。" },
    { "year": 1192, "zh": "源賴朝就任征夷大將軍,鎌倉幕府成立。" },
    { "year": 1854, "zh": "《神奈川條約》結束鎖國。" },
    { "year": 1868, "zh": "明治維新,推動現代化與工業化。" },
    { "year": 1945, "zh": "二戰戰敗,其後在和平憲法下重建。" },
    { "year": 2011, "zh": "東日本大震災與福島核災。" }
  ],
  "credits": []
}
```

- [ ] **Step 2: encyclopedia.js 加 render + fetch + 快取**

`createEncyclopedia()` 內,`open` / `close` 上方加:
```js
  const cache = new Map();
  let reqSeq = 0;

  const IMG_BASE = "/assets/deep/";

  function fmtArea(km2) {
    if (typeof km2 !== "number" || !Number.isFinite(km2)) return null;
    if (km2 >= 1e4) return `約 ${(km2 / 1e4).toFixed(km2 >= 1e6 ? 0 : 1)} 萬 km²`;
    return `約 ${Math.round(km2).toLocaleString("en-US")} km²`;
  }

  function card(code, it) {
    const img = it.image
      ? `<img src="${IMG_BASE}${encodeURIComponent(code)}/${encodeURIComponent(it.image)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    const en = it.en ? `<span class="enc-card-en">${esc(it.en)}</span>` : "";
    return `<div class="enc-card">${img}<div class="enc-card-body"><b>${esc(it.zh)}</b> ${en}` +
      `<p>${esc(it.note || "")}</p></div></div>`;
  }

  function section(title, inner) { return `<h3>${esc(title)}</h3>${inner}`; }

  function render(code, d) {
    titleEl.textContent = d.name_zh || code;
    const flag = /^[A-Za-z]{2}$/.test(code)
      ? `<img src="https://flagcdn.com/w160/${code.toLowerCase()}.png" alt="" style="width:104px;border-radius:4px;margin-bottom:12px" onerror="this.remove()">`
      : "";
    let h = `${flag}<h2>${esc(d.name_zh || code)}</h2><div class="enc-en">${esc(d.name_en || "")}</div>`;
    if (d.summary) h += `<p>${esc(d.summary)}</p>`;

    const qf = d.quick_facts || {};
    const rows = [];
    if (qf.official_name_zh) rows.push(["正式國名", qf.official_name_zh]);
    const area = fmtArea(qf.area_km2);
    if (area) rows.push(["面積", area]);
    if (Array.isArray(qf.languages) && qf.languages.length) rows.push(["語言", qf.languages.join("、")]);
    if (qf.religion) rows.push(["宗教", qf.religion]);
    if (qf.currency) rows.push(["貨幣", qf.currency]);
    if (qf.government) rows.push(["政體", qf.government]);
    if (rows.length)
      h += `<dl class="enc-facts">` + rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") + `</dl>`;

    if (Array.isArray(d.founding) && d.founding.length)
      h += section("國家的生成與發展", d.founding.map((p) => `<p>${esc(p)}</p>`).join(""));

    if (Array.isArray(d.events) && d.events.length)
      h += section("重大歷史事蹟", `<ul class="enc-timeline">` +
        d.events.map((e) => `<li><span class="enc-year">${esc(String(e.year))}</span><span>${esc(e.zh)}</span></li>`).join("") +
        `</ul>`);

    for (const [key, title] of [["animals", "特色動物"], ["foods", "特色食物"], ["landmarks", "著名景點"], ["people", "著名名人"]]) {
      const arr = d[key];
      if (Array.isArray(arr) && arr.length)
        h += section(title, `<div class="enc-cards">` + arr.map((it) => card(code, it)).join("") + `</div>`);
    }

    if (Array.isArray(d.recommended) && d.recommended.length)
      h += section("推薦玩法", d.recommended.map((r) => `<p><b>${esc(r.zh)}</b> — ${esc(r.note || "")}</p>`).join(""));

    if (Array.isArray(d.credits) && d.credits.length)
      h += section("圖片來源", `<ul class="enc-credits">` + d.credits.map((c) =>
        `<li>${esc(c.title || c.file)} — ${esc(c.author)} / ${esc(c.license)} · <a href="${esc(c.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></li>`
      ).join("") + `</ul>`);

    bodyEl.innerHTML = h;
    document.querySelector(".enc-scroll").scrollTop = 0;
  }
```

- [ ] **Step 3: 改寫 `open(code)` 帶 fetch**

```js
  async function open(code) {
    const seq = ++reqSeq;
    titleEl.textContent = "";
    bodyEl.innerHTML = `<p class="enc-dim">載入中…</p>`;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    document.querySelector(".enc-scroll").scrollTop = 0;

    if (cache.has(code)) { if (seq === reqSeq) render(code, cache.get(code)); return; }
    try {
      const r = await fetch(`/data/deep/${encodeURIComponent(code).replace(/%20/g, "_").replace(/\./g, "_")}.json`);
      if (seq !== reqSeq) return;            // 已切到別國
      if (!r.ok) throw new Error("not found");
      const d = await r.json();
      cache.set(code, d);
      if (seq === reqSeq) render(code, d);
    } catch {
      if (seq === reqSeq)
        bodyEl.innerHTML = `<p class="enc-dim">這個國家的大百科還在建置中,之後會補上。</p>`;
    }
  }
```
注意檔名轉換:`N. CYPRUS` → `encodeURIComponent` 得 `N.%20CYPRUS` → replace 後 `N._CYPRUS`。與 Global Constraints 一致。

- [ ] **Step 4: node --check + 瀏覽器實測**

Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --check src/ui/encyclopedia.js`
Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --test`(仍全綠,12 項)
瀏覽器:`window.__earth.encyclopedia.open("JP")` → 顯示封面 / quick_facts 表 / 發展史 / 年表 / 動物・食物・景點・名人卡片(無圖時卡片仍完整)/ 推薦玩法。`open("ZZ")` → 「建置中」。快速 `open("JP")` 後立刻 `open("US")` → 不殘留 JP(seq 防競態)。

- [ ] **Step 5: Commit**

```bash
git add src/ui/encyclopedia.js data/deep/JP.json
git -c user.email=a7779782@gmail.com -c user.name=Claude commit -m "feat: 大百科資料載入 + 分區塊渲染(封面/facts/發展史/年表/卡片/推薦/來源)+ JP 樣本"
```

---

### Task 4: 側欄「詳細介紹 ›」按鈕 + main.js 接線

**Files:**
- Modify: `src/ui/side-panel.js`(`createSidePanel` 加 `onMore`;`open(p)` 標題區加按鈕)
- Modify: `index.html`(按鈕樣式)
- Modify: `src/main.js`(把 `encyclopedia.open` 接到 `onMore`;移除 Task 2 的暫時 `window.__earth.encyclopedia` 註解不必動)

**Interfaces:**
- Consumes:`createEncyclopedia()`(Task 2/3)。
- Produces:`createSidePanel({ onClose, onMore })`;`onMore(code: string)` 於使用者點「詳細介紹 ›」時呼叫。

- [ ] **Step 1: side-panel.js 收 onMore + render 按鈕**

`export function createSidePanel({ onClose }) {` → `export function createSidePanel({ onClose, onMore }) {`

`open(p)` 內,產生 `html` 的第一行由:
```js
let html = `${flag}<h2>${esc(p.names.zh)}</h2><div class="en">${esc(p.names.en)}</div>`;
```
改為:
```js
const moreBtn = onMore && p.code
  ? `<button type="button" class="sp-more" data-code="${esc(p.code)}">詳細介紹 ›</button>` : "";
let html = `${flag}<h2>${esc(p.names.zh)}</h2><div class="en">${esc(p.names.en)}</div>${moreBtn}`;
```

`body.innerHTML = html;` 之後(`startClock` 之前)加委派監聽(用一次性委派,body 每次 open 都會重建):
```js
    const mb = body.querySelector(".sp-more");
    if (mb) mb.addEventListener("click", () => onMore(mb.dataset.code));
```

- [ ] **Step 2: index.html 按鈕樣式**

`#side-panel .sp-clock { ... }` 附近加:
```css
  #side-panel .sp-more {
    display: inline-block; margin: 4px 0 2px; padding: 6px 14px; cursor: pointer;
    background: rgba(77,163,255,.16); border: 1px solid rgba(120,170,255,.4);
    border-radius: 999px; color: #dfe8ff; font: 13px system-ui, "Microsoft JhengHei", sans-serif;
  }
  #side-panel .sp-more:hover { background: rgba(77,163,255,.3); }
```

- [ ] **Step 3: main.js 接線**

`src/main.js` 的 `createSidePanel({ onClose: () => { ... } })` 改成帶 `onMore`:
```js
  const encyclopedia = createEncyclopedia();
  window.__earth.encyclopedia = encyclopedia;

  const sidePanel = createSidePanel({
    onClose: () => { /* 原本內容不動 */ },
    onMore: (code) => encyclopedia.open(code),
  });
```
(把 Task 2 暫時加的 `const encyclopedia = createEncyclopedia();` 移到 `createSidePanel` 之前,只保留一份。)

- [ ] **Step 4: node --check + 瀏覽器實測**

Run: `"F:/Claude/ai-tools/node-v22.14.0-win-x64/node.exe" --check src/ui/side-panel.js src/main.js`
瀏覽器:點日本 → 側欄出現「詳細介紹 ›」→ 點它 → 大百科疊層滑入顯示日本;返回 → 疊層收起、側欄還在。點一個沒有 deep 檔的國家(如 波蘭 `PL`)→ 「建置中」。

- [ ] **Step 5: Commit**

```bash
git add src/ui/side-panel.js src/main.js index.html
git -c user.email=a7779782@gmail.com -c user.name=Claude commit -m "feat: 側欄「詳細介紹 ›」按鈕開啟國家大百科"
```

---

### Task 5: `deep-merge.mjs` —— 驗證 + 抓圖縮圖 + 產出 `data/deep/<CODE>.json`

**Files:**
- Create: `.superpowers/sdd/country-encyclopedia/deep-merge.mjs`
- Create: `.superpowers/sdd/country-encyclopedia/progress.md`(ledger,首行 = plan 路徑)

**Interfaces:**
- Consumes:`batch-deep-N.json` = `{ "<CODE>": { …schema,但每個 `image` 欄位是 request 物件 `{ slug, commons_file, license, author, source, thumb_url }` } }`
- Produces:每國 `data/deep/<CODE>.json`(image 欄位改成檔名、credits 補齊)+ `assets/deep/<CODE>/<slug>.jpg`

- [ ] **Step 1: 寫 `deep-merge.mjs`**

```js
// node deep-merge.mjs batch-deep-N.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../");
const PY = "F:/Claude/stable-diffusion-webui/venv/Scripts/python.exe";
const LICENSES_OK = [/^cc0/i, /^public domain/i, /^cc by(?!-nc)(?!-nd)/i]; // CC0 / PD / CC BY / CC BY-SA

const batchFile = process.argv[2];
if (!batchFile) { console.error("用法: node deep-merge.mjs batch-deep-N.json"); process.exit(1); }
const batch = JSON.parse(fs.readFileSync(path.resolve(here, batchFile), "utf8"));

const LIST_KEYS = ["animals", "foods", "landmarks", "people"];
const errors = [], warnings = [];

function codeToFile(code) { return code.replace(/[ .]/g, "_"); }

function fetchThumb(url, dest) {
  execFileSync("curl", ["-sSL", "--max-time", "45", "-o", dest, url], { stdio: "ignore" });
}
function resize(src, dest) {
  const code = `from PIL import Image;im=Image.open(r'${src}').convert('RGB');` +
    `w,h=im.size;s=1024/max(w,h);` +
    `im=im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.LANCZOS) if s<1 else im;` +
    `im.save(r'${dest}',quality=82,optimize=True)`;
  execFileSync(PY, ["-c", code], { stdio: "ignore" });
}

for (const [code, e] of Object.entries(batch)) {
  const tag = `[${code}]`;
  for (const k of ["name_zh", "name_en", "summary"])
    if (typeof e[k] !== "string" || !e[k].trim()) errors.push(`${tag} 缺 ${k}`);
  if (!Array.isArray(e.founding) || e.founding.length < 3) errors.push(`${tag} founding 應 ≥ 3 段`);
  if (!Array.isArray(e.events) || e.events.length < 4) errors.push(`${tag} events 應 ≥ 4 筆`);
  for (const k of LIST_KEYS) {
    const a = e[k];
    if (!Array.isArray(a) || a.length < 3 || a.length > 6) errors.push(`${tag} ${k} 應 3–6 筆`);
    else a.forEach((it, i) => { if (!it.zh || !it.note) errors.push(`${tag} ${k}[${i}] 缺 zh/note`); });
  }
  if (!Array.isArray(e.recommended) || !e.recommended.length) errors.push(`${tag} recommended 至少 1 筆`);

  // 圖片:蒐集所有 image request,驗授權,抓圖縮圖
  const outDir = path.join(repo, "assets", "deep", codeToFile(code));
  const credits = [];
  let imgCount = 0;
  for (const k of [...LIST_KEYS]) {
    for (const it of (e[k] || [])) {
      const req = it.image;
      if (!req || typeof req !== "object") { delete it.image; continue; }
      const licOk = LICENSES_OK.some((rx) => rx.test(String(req.license || "")));
      if (!licOk) { warnings.push(`${tag} ${k} 圖片授權不符「${req.license}」→ 略過`); delete it.image; continue; }
      if (imgCount >= 12) { delete it.image; continue; }
      const slug = String(req.slug || `${k}-${imgCount}`).replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
      const fname = `${slug}.jpg`;
      fs.mkdirSync(outDir, { recursive: true });
      const tmp = path.join(outDir, `_tmp_${slug}`);
      try {
        fetchThumb(req.thumb_url, tmp);
        if (fs.statSync(tmp).size < 3000) throw new Error("下載太小");
        resize(tmp, path.join(outDir, fname));
        fs.rmSync(tmp, { force: true });
        it.image = fname;
        credits.push({ file: fname, title: req.title || "", author: req.author || "?", license: req.license, source: req.source || "" });
        imgCount++;
      } catch (err) {
        warnings.push(`${tag} ${k} 圖片 ${slug} 失敗:${err.message} → 該筆無圖`);
        fs.rmSync(tmp, { force: true });
        delete it.image;
      }
    }
  }
  e.credits = credits;
  e.code = code;

  if (!errors.some((x) => x.startsWith(tag))) {
    const outFile = path.join(repo, "data", "deep", `${codeToFile(code)}.json`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(e, null, 2) + "\n", "utf8");
    console.log(`✓ ${code}: ${imgCount} 張圖 → data/deep/${codeToFile(code)}.json`);
  }
}

if (errors.length) { console.error("✗ 錯誤:\n" + errors.map((x) => "  - " + x).join("\n")); }
if (warnings.length) console.log("警告:\n" + warnings.map((x) => "  - " + x).join("\n"));
process.exit(errors.length ? 1 : 0);
```

- [ ] **Step 2: 寫 ledger**

`.superpowers/sdd/country-encyclopedia/progress.md` 首行:
```
# SDD ledger — plan: docs/superpowers/plans/2026-09-09-earth-world-encyclopedia.md
```
其後記批次規劃(Batch 1 = JP TW US;Batch 2 = KR CN TH VN IN FR IT ES DE GB GR EG CA MX BR AU NZ)。

- [ ] **Step 3: 自測(無真圖,驗 schema 路徑)**

用 `data/deep/JP.json`(Task 3 的樣本,把它包成 `{ "JP": { …,且各卡片 image 拿掉 } }` 存成 `batch-deep-0.json`)跑
`node deep-merge.mjs batch-deep-0.json` → 應 `✓ JP: 0 張圖`,且 `data/deep/JP.json` 被重新寫出(格式正規化)。

- [ ] **Step 4: Commit(只有腳本,`.superpowers/` 已 gitignore → 實際上無檔可 commit;跳過或 commit ledger 說明用)**

```bash
git add -A   # 通常沒有變更(deep-merge.mjs 在 gitignore 下);若 data/deep/JP.json 格式有變則一起
git -c user.email=a7779782@gmail.com -c user.name=Claude commit -m "chore: deep-merge.mjs 內容產線(驗證 + 抓圖縮圖 + 產出 data/deep/<CODE>.json)" --allow-empty
```

---

### Task 6: 內容產線 Batch 1 —— JP / TW / US(打通全流程)

**Files:**
- Create(產線輸出): `data/deep/JP.json`、`data/deep/TW.json`、`data/deep/US.json`、`assets/deep/{JP,TW,US}/*.jpg`

**做法(controller 執行):**

- [ ] **Step 1: 派一個 subagent(sonnet)研究 + 產 `batch-deep-1.json`**

給 subagent:
- schema(spec §3.2),每個 `image` 欄位改成 request 物件 `{ slug, title, commons_file, license, author, source, thumb_url }`;
- 可用 `WebSearch` / `WebFetch` 查英文 / 中文 Wikipedia 與 Wikimedia Commons;
- 每國:`summary`(2–3 句)、`founding`(4–6 段)、`quick_facts`(正式國名 / 面積 km² / 語言 / 宗教 / 貨幣 / 政體)、`animals`/`foods`/`landmarks`/`people` 各 3–5 筆(每筆 `zh` + `en` + `note` 一句 + 盡量附一張 Commons **CC0/PD/CC BY/CC BY-SA** 圖的 request)、`recommended` 2–3 筆、`events` 5–7 筆(`year` 數字 + `zh`)。
- 圖片 `thumb_url` 用 Commons 的 `Special:FilePath/<File>?width=1400` 形式;`license` / `author` 從該 File 頁抓;**找不到合規圖就省略該筆的 image**,不要硬湊。
- 全繁體、台灣用法;敏感題中性事實。
- 只把 JSON 寫到 `.superpowers/sdd/country-encyclopedia/batch-deep-1.json`,回報 3 行:DONE / 各國圖片數 / 沒把握的事實。

- [ ] **Step 2: `node deep-merge.mjs batch-deep-1.json`**

檢視輸出:每國應 `✓`、有數張圖;warnings 逐條看(授權不符 / 下載失敗可接受,但若某國 0 圖要回頭補)。

- [ ] **Step 3: `node --test`(仍全綠)+ 瀏覽器實測**

`window.__earth.sidePanel` 開 JP/TW/US → 點「詳細介紹」→ 檢查:封面 + facts 表 + 發展史 + 年表 + 四類卡片(圖有載入、無圖不破版)+ 推薦 + 圖片來源列表。Esc / 返回正常。console 無錯誤。

- [ ] **Step 4: 抽查內容正確性 + Commit**

抽查首都 / 面積 / 重大事件年份 / 圖片與說明相符。
```bash
git add data/deep/JP.json data/deep/TW.json data/deep/US.json assets/deep/JP assets/deep/TW assets/deep/US
git -c user.email=a7779782@gmail.com -c user.name=Claude commit -m "content(deep): 大百科 Batch 1 — 日本 / 臺灣 / 美國(全流程打通)"
```

---

### Task 7: 內容產線 Batch 2 —— 其餘 17 個重點國

**Files:**
- Create(產線輸出): `data/deep/{KR,CN,TH,VN,IN,FR,IT,ES,DE,GB,GR,EG,CA,MX,BR,AU,NZ}.json` + 對應 `assets/deep/<CODE>/`

**做法:** 同 Task 6,但分 2 個 subagent(各 8–9 國)串行(不並行)。每個 subagent 產一個 `batch-deep-2a.json` / `batch-deep-2b.json`,各自 `deep-merge.mjs` → `node --test` → 瀏覽器抽測 3–4 國 → 一批一 commit。

- [ ] **Step 1: subagent A → `batch-deep-2a.json`(KR CN TH VN IN FR IT ES DE)→ merge → 抽測 → commit**
- [ ] **Step 2: subagent B → `batch-deep-2b.json`(GB GR EG CA MX BR AU NZ)→ merge → 抽測 → commit**

commit 訊息:`content(deep): 大百科 Batch 2a/2b — <國名清單>`

---

### Task 8: 收尾 + 文件 + 公司庫

**Files:**
- Modify: `README.md`、`docs/superpowers/plans/...`(勾選)
- Modify: 公司庫 `01-開發設計部/專案/地球世界.md`、`02-品保監督部/review-log.md`、`06-秘書處/daily/2026-09-09.md`

- [ ] **Step 1: 全面檢查**
  - `assets/deep/` 總量(每國 ≤ 12 張、每張 ≤ ~200KB;超標就回頭壓)。
  - `prefers-reduced-motion` 下疊層無滑入動畫。
  - 疊層開啟時 `Esc` 先關疊層、不關側欄(`e.stopPropagation()` 已處理);再按 `Esc` 才關側欄。
  - 手機寬度(~380px)卡片單欄不破版。
  - 20 國以外點「詳細介紹」→「建置中」。
  - `node --test` 全綠;console 無錯誤;`node --check` 所有改動的 js。
- [ ] **Step 2: README** 加「## 大百科」段:操作、資料位置(`data/deep/`、`assets/deep/`)、圖片授權原則、如何加新國家(產線腳本路徑)。
- [ ] **Step 3: 公司庫**:專案筆記加「Wave B 完成」段(20 國、UI/產線架構、後續擴到 177 的方式);review-log 加一筆;daily digest 補一段。
- [ ] **Step 4: Commit**(earth-world + ObsidianVault 各一);更新本 plan 勾選狀態。

---

## Self-Review

**Spec coverage:**
- §2 使用者流程 → Task 2(疊層 + Esc/返回)、Task 4(側欄按鈕、側欄維持開)、Task 3(建置中 fallback)。✅
- §3.1 每國一檔、Map 快取、404 → Task 3。✅ 檔名代碼轉換(`N. CYPRUS` → `N._CYPRUS`)在 Task 3 Step 3 與 Task 5 `codeToFile` 一致。✅
- §3.2 schema → Task 3 render 全欄位覆蓋(summary/founding/quick_facts/animals/foods/landmarks/people/recommended/events/credits)。✅
- §3.3 圖片:Wikimedia、授權白名單、1024/q82、≤12 張、credits → Task 5 `LICENSES_OK` + `resize` + `imgCount` cap + `credits`。✅ 疊層圖 `loading="lazy"` + `onerror` → Task 3 `card()`。✅
- §3.4 產線分工(subagent 文字+選圖 / controller 下載縮圖驗證)→ Task 5 + 6 + 7。✅
- §4.1 檔案清單 → Task 1(esc.js)、Task 2/3(encyclopedia.js)、Task 2(index.html)、Task 4(side-panel.js、main.js)。✅
- §4.2 效能(點開才載入)→ Task 3 fetch on open + Map 快取。✅
- §5 測試 → Task 1(esc.test.mjs)、各 Task 的 `node --test` + 瀏覽器實測。✅
- §6 YAGNI:無路由 / 無編輯 / 無影音 / 單一 1024 JPG —— 計畫均未觸及。✅
- §7 分批:Task 6(JP TW US)+ Task 7(其餘 17)。✅

**Placeholder scan:** 各 code step 均有完整程式碼;無 TBD / 「類似上題」。Task 5 的 `deep-merge.mjs`、Task 3 的 render 皆完整。

**Type consistency:**
- `createEncyclopedia() -> { open, close, isOpen }` —— Task 2 定義、Task 4 用 `encyclopedia.open(code)`。✅
- `createSidePanel({ onClose, onMore })` —— Task 4 定義、main.js 傳兩者。✅(既有呼叫端只有 main.js 一處)
- `esc` 由 `/src/lib/esc.js` export,side-panel.js 與 encyclopedia.js 皆 import。✅
- deep JSON schema 的 key 名在 Task 3 render 與 Task 5 驗證兩處一致(`founding`/`events`/`animals`/`foods`/`landmarks`/`people`/`recommended`/`quick_facts`/`credits`)。✅
- 檔名代碼轉換規則兩處一致(` ` 與 `.` → `_`)。✅

**Scope check:** 單一實作計畫可完成(UI 3 個 code task + 產線 1 個 + 2 個內容批次 + 收尾)。內容擴到 177 國是後續、另立 ledger,不在本計畫。
