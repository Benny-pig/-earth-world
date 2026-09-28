"""🧩 產生 data/plates.json:全球板塊邊界(PB2002 板塊邊界模型)。

資料:Bird, P. (2003) An updated digital model of plate boundaries(PB2002),
      GeoJSON 版本取自 github.com/fraxen/tectonicplates(Open Data Commons Attribution License,ODC-BY)。
PB2002 把邊界切成五千多段「小步」,每段都有類型(隱沒、中洋脊、轉形斷層…)和相對速度。
這裡把同一條邊界、同一種類型、首尾相接的小步接成折線,類型併成網頁上用的四種:

  sub 隱沒帶(SUB)            一個板塊鑽到另一個底下,深海溝、火山島弧、大地震最多
  con 碰撞/聚合(OCB、CCB)    兩個板塊互相擠壓,擠出山脈(喜馬拉雅、台灣中央山脈)
  div 張裂(OSR、CRB)          板塊往兩邊分開,中洋脊、東非大裂谷
  tra 轉形斷層(OTF、CTF)      兩個板塊互相錯開滑動(聖安德烈斯斷層)

每條線另外標記是不是「環太平洋火環帶」(太平洋周圍的隱沒/聚合邊界)。
板塊邊界幾十年不會變,這支工具跑一次就好,不用排進每週更新。

用法:python tools/build-plates.py
"""
import json, os, sys, urllib.request

SRC = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_steps.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "plates.json")
KIND = {"SUB": "sub", "OCB": "con", "CCB": "con", "OSR": "div", "CRB": "div", "OTF": "tra", "CTF": "tra"}


def ring_of_fire(cls, lon, lat):
    """太平洋周圍的隱沒帶與海洋聚合邊界(不含加勒比海、地中海、喜馬拉雅)。"""
    if cls not in ("SUB", "OCB") or not (-60 <= lat <= 66):
        return False
    if -80 < lon < -60 and lat > 9:      # 加勒比海的小安地列斯、波多黎各海溝
        return False
    return lon >= 95 or lon <= -63


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if path:
        data = json.load(open(path, encoding="utf-8"))
    else:
        print("下載", SRC)
        with urllib.request.urlopen(SRC, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))

    lines, cur, key, last = [], None, None, None
    for f in data["features"]:
        p = f["properties"]
        kind = KIND.get(p.get("STEPCLASS"))
        if not kind:
            continue
        a = (round(p["STARTLONG"], 2), round(p["STARTLAT"], 2))
        b = (round(p["FINALLONG"], 2), round(p["FINALLAT"], 2))
        mid_lon, mid_lat = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        rf = ring_of_fire(p["STEPCLASS"], mid_lon, mid_lat)
        k = (p.get("PLATEBOUND"), kind, rf)
        joined = cur is not None and k == key and last is not None and abs(last[0] - a[0]) < 0.02 and abs(last[1] - a[1]) < 0.02
        if not joined:
            cur = {"k": kind, "rf": rf, "b": p.get("PLATEBOUND"), "v": [], "pts": [a]}
            lines.append(cur)
            key = k
        cur["pts"].append(b)
        cur["v"].append(float(p.get("VELOCITYLE") or 0))
        last = b

    out = []
    for L in lines:
        flat = []
        for lon, lat in L["pts"]:
            flat += [lon, lat]
        v = round(sum(L["v"]) / len(L["v"])) if L["v"] else 0
        out.append([L["k"], 1 if L["rf"] else 0, v, L["b"], flat])

    doc = {
        "source": "Bird (2003) PB2002 plate boundary model, via github.com/fraxen/tectonicplates (ODC-BY)",
        "note": "每條線:[類型, 是否火環帶, 平均相對速度 mm/年, 兩側板塊代碼, [經度, 緯度, 經度, 緯度, ...]]",
        "lines": out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print("折線", len(out), "條;類型", dict(Counter(L[0] for L in out)), ";火環帶", sum(L[1] for L in out), "條")
    print("寫入", os.path.normpath(OUT), os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
