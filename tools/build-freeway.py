"""Build data/traffic/freeway.json + cctv.json — 國道路段線形/名稱 + 國道監視器清單(台灣即時路況用)。

路段線形與名稱幾乎不會變(高速公路局約半年改版一次),預先做成精簡靜態檔放在網站上,
網站平常只需要透過 Worker 抓「即時車速」那一份小資料,不用每次都下載好幾 MB 的線形。

資料來源:
  - 路段線形/名稱:交通部 TDX(高速公路局),透過我們自己的 Cloudflare Worker 轉發
    (/?tdx=freeway-section、/?tdx=freeway-shape,金鑰存在 Worker 的 Secrets 裡)
  - 監視器清單:高速公路局公開資料 tisvcloud(免金鑰),影像本身是各監視器的 https
    MJPEG 串流,網頁用 <img> 直接播,不需要經過 Worker

用法:
    python tools/build-freeway.py                 # 從 Worker / 高公局下載最新資料
    python tools/build-freeway.py section.json shape.json [cctv.xml]   # 用已下載的檔案
"""
import json, os, re, sys, urllib.request
from datetime import date

WORKER = "https://earth-world-flights.a7779782.workers.dev"
CCTV_URL = "https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "traffic", "freeway.json")
OUT_CCTV = os.path.join(os.path.dirname(__file__), "..", "data", "traffic", "cctv.json")
# 只收高公局自己的串流主機(實測都是 https MJPEG、可直接播);其他單位的零星網址格式不同,
# 實測打不開,不收
CCTV_HOSTS = ("cctvn.freeway.gov.tw", "cctvn5.freeway.gov.tw", "cctvc.freeway.gov.tw", "cctvs.freeway.gov.tw")
TOL = 0.00012   # 簡化容許誤差(度,約 13 公尺);拉到最近時一個像素也遠大於這個距離


COUNTIES = os.path.join(os.path.dirname(__file__), "..", "data", "admin1", "TW.geo.json")
# 北中南東分區(路況中心的「全台/北部/中部/南部」切換用)
REGION_OF_COUNTY = {
    "基隆市": "N", "臺北市": "N", "台北市": "N", "新北市": "N", "桃園市": "N", "新竹縣": "N", "新竹市": "N", "宜蘭縣": "N",
    "苗栗縣": "C", "台中市": "C", "臺中市": "C", "彰化縣": "C", "南投縣": "C", "雲林縣": "C",
    "嘉義縣": "S", "嘉義市": "S", "臺南市": "S", "台南市": "S", "高雄市": "S", "屏東縣": "S", "澎湖縣": "S",
    "花蓮縣": "E", "臺東縣": "E", "台東縣": "E",
}


def _inside(ring, x, y):
    res, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi: res = not res
        j = i
    return res


def region_finder():
    """回傳 f(lon, lat) -> 'N'/'C'/'S'/'E':先看點落在哪個縣市;國道常貼著簡化過的
    海岸線或縣界,落在縫隙裡的就找最近的縣市邊界點。"""
    polys = []
    for f in json.load(open(COUNTIES, encoding="utf-8"))["features"]:
        r = REGION_OF_COUNTY.get(f["properties"].get("name_zht"))
        if not r: continue
        g = f["geometry"]
        for poly in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]):
            polys.append((r, poly))

    def find(lon, lat):
        for r, poly in polys:
            if _inside(poly[0], lon, lat): return r
        best, bd = None, 1e9
        for r, poly in polys:
            for x, y in poly[0]:
                d = (x - lon) ** 2 + (y - lat) ** 2
                if d < bd: bd, best = d, r
        return best
    return find


def load(arg, key):
    if arg:
        return json.load(open(arg, encoding="utf-8"))
    req = urllib.request.Request(f"{WORKER}/?tdx={key}", headers={"User-Agent": "earth-world build script"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def parse_linestring(wkt):
    m = re.match(r"\s*LINESTRING\s*\((.*)\)\s*$", wkt)
    if not m:
        return []
    return [tuple(map(float, p.split())) for p in m.group(1).split(",")]


def simplify(pts, tol):
    """Douglas-Peucker(經緯度直接當平面算,台灣範圍內誤差可忽略)。"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L2 == 0:
                d = (px - x1) ** 2 + (py - y1) ** 2
            else:
                t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / L2))
                d = (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2
            if d > best:
                best, idx = d, i
        if best > tol * tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def main():
    args = sys.argv[1:] + [None, None, None]
    sections = {s["SectionID"]: s for s in load(args[0], "freeway-section")["Sections"]}
    shapes = load(args[1], "freeway-shape")
    region = region_finder()
    out, n_in, n_out = {}, 0, 0
    for sh in shapes["SectionShapes"]:
        pts = parse_linestring(sh.get("Geometry", ""))
        if len(pts) < 2:
            continue
        n_in += len(pts)
        simp = simplify(pts, TOL)
        n_out += len(simp)
        s = sections.get(sh["SectionID"], {})
        rs = s.get("RoadSection") or {}
        mid = simp[len(simp) // 2]
        entry = {
            "r": s.get("RoadName"), "d": s.get("RoadDirection"),
            "f": rs.get("Start"), "t": rs.get("End"), "l": s.get("SpeedLimit"),
            "g": region(*mid),
            "c": [round(v, 4) for p in simp for v in p],
        }
        out[sh["SectionID"]] = {k: v for k, v in entry.items() if v is not None}
    doc = {
        "source": "交通部 TDX 運輸資料流通服務(交通部高速公路局)",
        "linkVersion": shapes.get("LinkVersion"),
        "built": date.today().isoformat(),
        "sections": dict(sorted(out.items())),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} sections, points {n_in} -> {n_out}, {os.path.getsize(OUT):,} bytes -> {os.path.normpath(OUT)}")
    build_cctv(args[2])


def build_cctv(path=None):
    if path:
        xml = open(path, encoding="utf-8").read()
    else:
        req = urllib.request.Request(CCTV_URL, headers={"User-Agent": "earth-world build script"})
        with urllib.request.urlopen(req, timeout=90) as r:
            xml = r.read().decode("utf-8")
    tag = lambda b, t: (re.search(rf"<{t}>(.*?)</{t}>", b, re.S) or [None, ""])[1].strip()
    region = region_finder()
    roads, cams = [], []
    for b in re.findall(r"<CCTV>(.*?)</CCTV>", xml, re.S):
        url = tag(b, "VideoStreamURL")
        if not url.startswith("https://") or urllib.request.urlparse(url).hostname not in CCTV_HOSTS:
            continue
        road = tag(b, "RoadName")
        if road not in roads: roads.append(road)
        lon, lat = round(float(tag(b, "PositionLon")), 5), round(float(tag(b, "PositionLat")), 5)
        cams.append([lon, lat, roads.index(road), tag(b, "RoadDirection"), tag(b, "LocationMile"),
                     tag(b, "Start"), tag(b, "End"), url, region(lon, lat)])
    doc = {
        "source": "交通部高速公路局 CCTV 公開資料(tisvcloud)",
        "updated": tag(xml, "UpdateTime"),
        "built": date.today().isoformat(),
        "fields": ["lon", "lat", "road", "dir", "mile", "from", "to", "url", "region"],
        "roads": roads, "cams": cams,
    }
    with open(OUT_CCTV, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(cams)} cameras, {len(roads)} roads, {os.path.getsize(OUT_CCTV):,} bytes -> {os.path.normpath(OUT_CCTV)}")


if __name__ == "__main__":
    main()
