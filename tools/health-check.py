"""🩺 每日網站健康檢查:逐項檢查網站本身與各個外部資料來源是否正常,結果寫成 health-report.md。
有「❌ 故障」就以錯誤結束(GitHub Actions 會開 Issue 提醒);「⚠️ 注意」只提醒不算故障
(例如 Worker 還沒部署新版、少數直播下線)。

用法:python tools/health-check.py [網站網址]
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timezone

SITE = (sys.argv[1] if len(sys.argv) > 1 else "https://benny-pig.github.io/-earth-world/").rstrip("/") + "/"
WORKER = "https://earth-world-flights.a7779782.workers.dev"
UA = {"User-Agent": "earth-world health check (https://github.com/Benny-pig/-earth-world)"}
results = []   # (狀態, 項目, 說明)  狀態:ok / warn / fail


def get(url, timeout=30, tries=2, headers=None):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception as e:
            last = e
            time.sleep(3)
    raise last


def check(name):
    def deco(fn):
        try:
            status, msg = fn()
        except Exception as e:
            status, msg = "fail", f"連線失敗:{e}"
        results.append((status, name, msg))
        print({"ok": "✅", "warn": "⚠️", "fail": "❌"}[status], name, "—", msg)
        return fn
    return deco


@check("網站首頁")
def _():
    s, b = get(SITE)
    if s != 200 or "地球世界".encode() not in b: return "fail", f"HTTP {s}"
    s2, _ = get(SITE + "src/main.js")
    return ("ok", "首頁與主程式都讀得到") if s2 == 200 else ("fail", f"主程式 HTTP {s2}")


@check("程式版本號")
def _():
    # index.html 的程式版本號要跟著程式內容更新(tools/build-preload.py),不然讀者的瀏覽器會一直用快取裡的舊程式
    import subprocess
    r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-preload.py"), "--check"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if r.returncode == 0: return "ok", r.stdout.strip()
    return "fail", "程式改了但 index.html 的程式版本號沒更新,讀者可能拿不到新版程式;請執行 python tools/build-preload.py 後重新提交"


@check("全球風場資料")
def _():
    s, b = get("https://raw.githubusercontent.com/Benny-pig/-earth-world/wind-data/wind.json")
    if s != 200: return "warn", f"wind-data 分支讀不到(HTTP {s}),網頁會改用舊的備份;看一下「全球風場資料」自動更新有沒有在跑"
    valid = datetime.fromisoformat(json.loads(b)["valid"].replace("Z", "+00:00"))
    hours = (datetime.now(timezone.utc) - valid).total_seconds() / 3600
    return ("ok", f"{hours:.0f} 小時前的風") if hours < 24 else ("warn", f"風場資料已經 {hours:.0f} 小時沒更新")


@check("國家資料")
def _():
    s, b = get(SITE + "data/countries.content.json")
    n = len(json.loads(b)) if s == 200 else 0
    return ("ok", f"{n} 國") if n >= 150 else ("fail", f"只有 {n} 國(HTTP {s})")


@check("旅遊警示資料")
def _():
    s, b = get(SITE + "data/travel-alert.json")
    d = json.loads(b)
    age = (date.today() - date.fromisoformat(d.get("as_of", "2000-01-01"))).days
    return ("ok", f"{age} 天前更新") if age <= 21 else ("warn", f"已經 {age} 天沒更新(每週自動更新可能失敗)")


@check("景點直播清單")
def _():
    s, b = get(SITE + "data/livecams.json")
    d = json.loads(b)
    cams = d.get("cams", [])
    dead = []
    for c in cams:
        s2, _ = get(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={c['v']}&format=json", tries=1)
        if s2 != 200: dead.append(c["zh"])
    ok = len(cams) - len(dead)
    if ok < 10: return "fail", f"只剩 {ok}/{len(cams)} 個直播能播"
    if dead: return "warn", f"{ok}/{len(cams)} 個能播;下線:{'、'.join(dead[:8])}{'…' if len(dead) > 8 else ''}(每週會自動換新)"
    return "ok", f"{len(cams)} 個直播都能播"


@check("電動車充電站資料")
def _():
    s, b = get(SITE + "data/ev/stations.json")
    if s == 404: return "warn", "還沒有資料(等 Worker 部署新版或每週自動更新)"
    d = json.loads(b)
    n = len(d.get("stations", []))
    age = (date.today() - date.fromisoformat(d.get("built", "2000-01-01"))).days
    if n < 1500: return "fail", f"只有 {n} 站"
    return ("ok", f"{n} 站 · {age} 天前更新") if age <= 21 else ("warn", f"{n} 站,但已 {age} 天沒更新")


@check("廣播電台目錄(radio-browser)")
def _():
    s, b = get("https://de1.api.radio-browser.info/json/stations/search?countrycode=TW&order=clickcount&reverse=true&limit=30&hidebroken=true")
    arr = json.loads(b) if s == 200 else []
    https = [x for x in arr if (x.get("url_resolved") or x.get("url") or "").startswith("https://")]
    if len(https) >= 2: return "ok", f"台灣 {len(https)} 台可在網站播放"
    return "fail", f"台灣只剩 {len(https)} 台 https 電台(HTTP {s})"


@check("維基百科新聞動態")
def _():
    url = "https://zh.wikipedia.org/w/api.php?action=parse&page=" + urllib.parse.quote("Portal:新聞動態") + "&prop=text&format=json&variant=zh-tw&formatversion=2"
    s, b = get(url)
    html = json.loads(b).get("parse", {}).get("text", "")
    n = len(re.findall(r"<li", html))
    return ("ok", f"{n} 則") if n >= 20 else ("fail", f"只抓到 {n} 則(頁面格式可能改了)")


@check("全球天氣(Open-Meteo)")
def _():
    s, b = get("https://api.open-meteo.com/v1/forecast?latitude=25,35&longitude=121,139&current=temperature_2m,precipitation")
    arr = json.loads(b) if s == 200 else []
    return ("ok", "正常") if isinstance(arr, list) and len(arr) == 2 else ("fail", f"HTTP {s}")


@check("極光預報(NOAA SWPC)")
def _():
    s, b = get("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", timeout=45)
    n = len(json.loads(b).get("coordinates", [])) if s == 200 else 0
    return ("ok", f"{n} 個格點") if n > 60000 else ("fail", f"HTTP {s},格點 {n}")


@check("颱風資料(日本氣象廳)")
def _():
    s, b = get("https://www.jma.go.jp/bosai/typhoon/data/targetTc.json")
    if s != 200: return "fail", f"HTTP {s}"
    n = len(json.loads(b))
    return "ok", f"目前 {n} 個颱風" if n else "目前沒有颱風(資料正常)"


@check("火山/野火(NASA EONET)")
def _():
    s, b = get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes,wildfires,seaLakeIce&days=45", timeout=45)
    n = len(json.loads(b).get("events", [])) if s == 200 else 0
    return ("ok", f"{n} 個事件") if s == 200 else ("fail", f"HTTP {s}")


@check("本週活動火山資料")
def _():
    s, b = get(SITE + "data/volcanoes.json")
    if s != 200: return "warn", "還沒有資料(等每週自動更新)"
    d = json.loads(b)
    age = (date.today() - date.fromisoformat(d.get("built", "2000-01-01"))).days
    n = len(d.get("items", []))
    return ("ok", f"{n} 座 · {age} 天前更新") if age <= 21 else ("warn", f"{n} 座,但已 {age} 天沒更新")


@check("近地小行星(NASA NeoWs)")
def _():
    d = date.today().isoformat()
    s, b = get(f"https://api.nasa.gov/neo/rest/v1/feed?start_date={d}&end_date={d}&api_key=DEMO_KEY", timeout=45)
    if s == 429: return "warn", "示範金鑰的查詢次數暫時用完(網站上讀者各自有額度,不影響)"
    n = json.loads(b).get("element_count", 0) if s == 200 else 0
    return ("ok", f"今天 {n} 顆") if s == 200 else ("fail", f"HTTP {s}")


@check("太空發射(Launch Library 2)")
def _():
    s, b = get("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=3&mode=list")
    if s == 429: return "warn", "查詢次數暫時用完(每小時上限),網站上可能短暫沒有資料"
    n = len(json.loads(b).get("results", [])) if s == 200 else 0
    return ("ok", f"有 {n} 筆") if n else ("fail", f"HTTP {s}")


@check("衛星軌道(CelesTrak)")
def _():
    s, b = get("https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle")
    n = b.count(b"\n1 ") if s == 200 else 0
    return ("ok", f"{n} 顆") if n >= 5 else ("fail", f"HTTP {s}")


@check("Worker:國道即時路況")
def _():
    s, b = get(f"{WORKER}/?tdx=freeway-live", timeout=45)
    if s != 200: return "fail", f"HTTP {s}:{b[:120].decode('utf-8', 'replace')}"
    n = len(json.loads(b).get("LiveTraffics", []))
    return ("ok", f"{n} 個路段") if n > 100 else ("fail", f"只有 {n} 個路段")


@check("Worker:今日新聞")
def _():
    s, b = get(f"{WORKER}/?news=" + urllib.parse.quote("日本"), timeout=45)
    if s == 400 and b"lat/lon" in b: return "warn", "Worker 還是舊版(還沒部署新聞路線),網站只顯示維基百科新聞"
    if s != 200: return "fail", f"HTTP {s}"
    n = len(json.loads(b).get("items", []))
    return ("ok", f"日本 {n} 則頭條") if n else ("warn", "Google 新聞暫時沒有結果")


@check("Worker:高鐵時刻")
def _():
    s, b = get(f"{WORKER}/?rail=v2/Rail/THSR/Station", timeout=45)
    if s == 400 and b"lat/lon" in b: return "warn", "Worker 還是舊版(還沒部署鐵路路線),高鐵台鐵時刻還不能用"
    if s != 200: return "fail", f"HTTP {s}"
    return ("ok", "正常") if len(json.loads(b)) >= 10 else ("fail", "車站資料異常")


def main():
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    icon = {"ok": "✅", "warn": "⚠️", "fail": "❌"}
    fails = [r for r in results if r[0] == "fail"]
    warns = [r for r in results if r[0] == "warn"]
    head = "❌ 有功能故障" if fails else ("⚠️ 大致正常,有幾項要注意" if warns else "✅ 全部正常")
    md = [f"## 🩺 地球世界健康檢查 {now}", "", f"**{head}**({len(results) - len(fails) - len(warns)} 正常 · {len(warns)} 注意 · {len(fails)} 故障)", "",
          "| 狀態 | 項目 | 說明 |", "|---|---|---|"]
    md += [f"| {icon[s]} | {n} | {m} |" for s, n, m in results]
    text = "\n".join(md) + "\n"
    open("health-report.md", "w", encoding="utf-8").write(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(text)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
