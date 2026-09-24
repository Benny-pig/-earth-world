"""Build data/traffic/freeway.json — 國道路段線形 + 名稱(台灣即時路況用)。

路段線形與名稱幾乎不會變(高速公路局約半年改版一次),預先做成精簡靜態檔放在網站上,
網站平常只需要透過 Worker 抓「即時車速」那一份小資料,不用每次都下載好幾 MB 的線形。

資料來源:交通部 TDX(高速公路局),透過我們自己的 Cloudflare Worker 轉發
(/?tdx=freeway-section、/?tdx=freeway-shape,金鑰存在 Worker 的 Secrets 裡)。

用法:
    python tools/build-freeway.py                 # 從 Worker 下載最新資料
    python tools/build-freeway.py section.json shape.json   # 用已下載的檔案
"""
import json, os, re, sys, urllib.request
from datetime import date

WORKER = "https://earth-world-flights.a7779782.workers.dev"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "traffic", "freeway.json")
TOL = 0.00012   # 簡化容許誤差(度,約 13 公尺);拉到最近時一個像素也遠大於這個距離


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
    args = sys.argv[1:] + [None, None]
    sections = {s["SectionID"]: s for s in load(args[0], "freeway-section")["Sections"]}
    shapes = load(args[1], "freeway-shape")
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
        entry = {
            "r": s.get("RoadName"), "d": s.get("RoadDirection"),
            "f": rs.get("Start"), "t": rs.get("End"), "l": s.get("SpeedLimit"),
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


if __name__ == "__main__":
    main()
