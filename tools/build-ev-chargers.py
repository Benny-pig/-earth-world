"""Build data/ev/stations.json — 全台電動汽車充電站(交通部 TDX,政府資料開放授權)。

來源:TDX「電動車充電站」API——各縣市充電站、高速公路服務區充電站,以及各縣市的營運業者名稱。
優先透過我們的 Cloudflare Worker(/?ev=路徑,Worker 有 TDX 金鑰、沒有次數限制);Worker 還沒部署
新路線時,改用 TDX 免金鑰查詢(有次數限制:碰到就等一分鐘再試)。抓過的縣市先存在 tools/.cache/ev/,
重跑不會重抓;這次還是抓不到的縣市,沿用上一版 data/ev/stations.json 裡的資料。

用法:python tools/build-ev-chargers.py
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "ev", "stations.json")
CACHE = os.path.join(ROOT, "tools", ".cache", "ev")
WORKER = "https://earth-world-flights.a7779782.workers.dev"
TDX = "https://tdx.transportdata.tw/api/basic/"
UA = {"User-Agent": "earth-world build script"}
CITIES = [("Taipei", "臺北市"), ("NewTaipei", "新北市"), ("Taoyuan", "桃園市"), ("Taichung", "臺中市"), ("Tainan", "臺南市"),
          ("Kaohsiung", "高雄市"), ("Keelung", "基隆市"), ("Hsinchu", "新竹市"), ("HsinchuCounty", "新竹縣"), ("MiaoliCounty", "苗栗縣"),
          ("ChanghuaCounty", "彰化縣"), ("NantouCounty", "南投縣"), ("YunlinCounty", "雲林縣"), ("ChiayiCounty", "嘉義縣"),
          ("Chiayi", "嘉義市"), ("PingtungCounty", "屏東縣"), ("YilanCounty", "宜蘭縣"), ("HualienCounty", "花蓮縣"),
          ("TaitungCounty", "臺東縣"), ("KinmenCounty", "金門縣"), ("PenghuCounty", "澎湖縣"), ("LienchiangCounty", "連江縣")]
# 充電槍規格(TDX 定義)
TYPES = {1: "CCS1", 2: "CCS2", 3: "CHAdeMO", 4: "特斯拉 TPC", 5: "J1772", 6: "Type 2", 254: "其他", 255: "未知"}


def fetch(path):
    """回傳 JSON;先試 Worker,不行再用 TDX 免金鑰(碰到次數限制最多等三次)"""
    os.makedirs(CACHE, exist_ok=True)
    cf = os.path.join(CACHE, path.replace("/", "_") + ".json")
    if os.path.exists(cf) and time.time() - os.path.getmtime(cf) < 20 * 3600:
        return json.load(open(cf, encoding="utf-8"))
    data = None
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{WORKER}/?ev={urllib.parse.quote(path, safe='/')}", headers=UA), timeout=60) as r:
            data = json.loads(r.read())
    except Exception:
        data = None
    if data is None:
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(f"{TDX}{path}?%24format=JSON", headers=UA), timeout=90) as r:
                    data = json.loads(r.read())
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 2:
                    print(f"  {path}:查詢次數用完,等 65 秒再試…", flush=True)
                    time.sleep(65)
                    continue
                raise
    json.dump(data, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
    time.sleep(2)
    return data


def addr(loc):
    a = (loc or {}).get("Address") or {}
    return "".join(a.get(k) or "" for k in ("City", "Town", "Road", "Lane", "Alley", "No")).replace("台", "臺", 1)


def main():
    old = {}
    try:
        for s in json.load(open(OUT, encoding="utf-8"))["stations"]:
            old.setdefault(s[4], []).append(s)   # 依來源(縣市或服務區)分組,抓不到時沿用
    except Exception:
        pass

    out, got, failed = [], set(), []
    sources = [(f"v1/EV/Station/City/{en}", f"v1/EV/Operator/City/{en}", zh) for en, zh in CITIES]
    sources.append(("v1/EV/Station/Freeway/ServiceArea", "v1/EV/Operator/Freeway/ServiceArea", "國道服務區"))
    # 先把各地的充電站抓完(最重要),次數還夠再抓營運業者名稱
    stations = {}
    for st_path, _, zh in sources:
        try:
            stations[zh] = fetch(st_path).get("Stations", [])
        except Exception as e:
            print(f"✗ {zh}:{e}")
            failed.append(zh)
    ops = {}
    for _, op_path, zh in sources:
        if zh not in stations: continue
        try:
            for o in fetch(op_path).get("Operators", []):
                ops[o.get("OperatorID")] = ((o.get("OperatorName") or {}).get("Zh_tw") or "").strip()
        except Exception:
            pass   # 營運業者名稱抓不到就留空
    for _, _, zh in sources:
        if zh not in stations:
            out += old.get(zh, [])   # 這次抓不到:沿用上一版
            continue
        n = 0
        for s in stations[zh]:
            sid = s.get("StationID")
            lat, lon = s.get("PositionLat"), s.get("PositionLon")
            if not sid or sid in got or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (20 < lat < 27.5 and 118 < lon < 123):
                continue
            got.add(sid)
            conns = [[c.get("Type"), c.get("Power"), c.get("Quantity") or 0] for c in (s.get("Connectors") or [])]
            town = ((s.get("Location") or {}).get("Address") or {}).get("Town") or ""
            out.append([sid, ((s.get("StationName") or {}).get("Zh_tw") or "").strip(), round(lat, 5), round(lon, 5), zh, town,
                        addr(s.get("Location")), s.get("Spaces") or 0, s.get("ChargingPoints") or 0, conns,
                        (s.get("ServiceTime") or "").strip(), (s.get("ChargingRate") or "").strip(), (s.get("ParkingRate") or "").strip(),
                        (s.get("Floors") or "").strip(), (s.get("Telephone") or "").strip(), ops.get(s.get("OperatorID"), ""),
                        (s.get("UsageRestriction") or "").strip()])
            n += 1
        print(f"✓ {zh}:{n} 站")
    if len(out) < 1500:
        sys.exit(f"只有 {len(out)} 站,資料可能異常,不更新")
    doc = {
        "built": date.today().isoformat(),
        "source": "交通部 TDX 運輸資料流通服務(電動車充電站),政府資料開放授權條款第 1 版",
        "types": TYPES,
        "fields": ["id", "name", "lat", "lon", "county", "town", "address", "spaces", "points", "connectors[type,power(1=AC,2=DC),qty]",
                   "serviceTime", "chargingRate", "parkingRate", "floors", "tel", "operator", "restriction"],
        "stations": out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} 站 · {os.path.getsize(OUT):,} bytes · 沿用舊資料:{failed or '無'}")


if __name__ == "__main__":
    main()
