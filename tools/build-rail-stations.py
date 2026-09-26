"""Build data/rail/stations.json — 高鐵/台鐵車站清單(鐵路時刻查詢的起訖站選單用)。

  - 台鐵:國營臺灣鐵路公司「臺鐵車站基本資料集」公開資料(免金鑰,data.gov.tw 33425),
    車站代碼跟 TDX 台鐵 API 的 StationID 相同;依地址前三個字分縣市,選單用縣市分組
  - 高鐵:全線 12 站,代碼沿用 TDX 高鐵 API 的 StationID,直接寫在這裡

用法:
    python tools/build-rail-stations.py [臺鐵車站基本資料集.json]
"""
import json, os, re, sys, urllib.request
from datetime import date

TRA_URL = "https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "rail", "stations.json")

THSR = [
    ["0990", "南港", "Nangang"], ["1000", "台北", "Taipei"], ["1010", "板橋", "Banqiao"],
    ["1020", "桃園", "Taoyuan"], ["1030", "新竹", "Hsinchu"], ["1035", "苗栗", "Miaoli"],
    ["1040", "台中", "Taichung"], ["1043", "彰化", "Changhua"], ["1047", "雲林", "Yunlin"],
    ["1050", "嘉義", "Chiayi"], ["1060", "台南", "Tainan"], ["1070", "左營", "Zuoying"],
]
# 縣市排序:由北到南、再到東部
COUNTY_ORDER = ["基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "臺中市", "彰化縣", "南投縣",
                "雲林縣", "嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣"]


def main():
    if len(sys.argv) > 1:
        raw = json.load(open(sys.argv[1], encoding="utf-8"))
    else:
        req = urllib.request.Request(TRA_URL, headers={"User-Agent": "earth-world build script"})
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = json.loads(r.read().decode("utf-8"))
    tra = []
    for s in raw:
        addr = (s.get("stationAddrTw") or "").replace("台", "臺")
        m = re.match(r"^(.{2}[市縣])", addr)
        if not m:
            continue   # 沒有地址的是調車場之類的非旅客車站(例如樹林調車場),不放進選單
        county = m.group(1)
        lat = lon = None
        if s.get("gps"):
            try: lat, lon = map(float, s["gps"].split())
            except ValueError: pass
        tra.append({"id": s["stationCode"], "zh": s["stationName"], "en": s.get("stationEName") or "",
                    "county": county, "g": [lat, lon] if lat else None})
    if len(tra) < 200:   # 防呆:資料異常時不覆蓋
        sys.exit(f"台鐵車站只有 {len(tra)} 站,資料可能異常,不更新")
    tra.sort(key=lambda x: (COUNTY_ORDER.index(x["county"]) if x["county"] in COUNTY_ORDER else 99, x["id"]))
    doc = {
        "source": "臺鐵車站基本資料集(國營臺灣鐵路公司開放資料);高鐵車站依 TDX 代碼",
        "built": date.today().isoformat(),
        "thsr": [{"id": i, "zh": z, "en": e} for i, z, e in THSR],
        "tra": tra,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    counties = sorted({t["county"] for t in tra}, key=lambda c: COUNTY_ORDER.index(c) if c in COUNTY_ORDER else 99)
    print(f"thsr {len(THSR)} · tra {len(tra)} stations in {len(counties)} counties: {counties} → {os.path.getsize(OUT):,} bytes")


if __name__ == "__main__":
    main()
