"""Build data/travel-alert.json — 外交部領事事務局「全球旅遊警示」分級(國家側欄、大百科用)。

來源:https://www.boca.gov.tw/sp-trwa-list-1.html(公開網頁)。每國取「最高」警示等級;
最高等級只適用某些地區時,記在 note(特定地區)。等級沒變的國家保留原本的原因說明
(有些是人工整理的),等級變了才換成該等級的通用說明。

用法:python tools/build-travel-alert.py [已下載的 sp-trwa-list-1.html]
"""
import html, json, os, re, sys, unicodedata, urllib.request
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "travel-alert.json")
URL = "https://www.boca.gov.tw/sp-trwa-list-1.html"
LEVELS = {
    "grayblock": (1, "灰色：提醒注意", "#9aa5b1", "整體情勢平穩,維持一般旅外安全警覺即可。"),
    "yellowblock": (2, "黃色：特別注意旅遊安全並檢討是否有必要前往", "#f5d90a", "局部治安或情勢需留意,建議提高警覺。"),
    "orangeblock": (3, "橙色：避免非必要旅行", "#f5a524", "安全風險升高,避免非必要旅行。"),
    "redblock": (4, "紅色：儘速離境", "#e5484d", "安全情勢嚴峻,不宜前往,已在當地者宜儘速離境。"),
}
ZH_ALIAS = {"澳大利亞": "AU", "美國": "US", "英國": "GB", "南韓": "KR", "韓國": "KR", "北韓": "KP", "紐西蘭": "NZ", "日本": "JP",
            "中國大陸": "CN", "香港": "HK", "澳門": "MO", "俄羅斯": "RU", "教廷": "VA", "史瓦帝尼": "SZ", "緬甸": "MM", "寮國": "LA",
            "諾埃羅共和國": "NR", "諾魯": "NR", "美屬波多黎各": "PR", "波多黎各": "PR"}
# 法屬、荷屬的海外省/特別行政區在我們的地圖上是法國、荷蘭本身的一部分,沒有獨立國家可以標,略過
SKIP = {"馬約特島", "留尼旺", "法屬圭亞那", "法屬瓜地洛普", "馬丁尼克", "荷屬沙巴", "荷屬聖佑達修斯", "荷屬波奈"}


def norm_en(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", "", s); s = re.sub(r"[^a-z ]", " ", s)
    return re.sub(r"\s+", " ", re.sub(r"\b(the|and|of|republic|kingdom|state|federal|democratic|islamic)\b", " ", s)).strip()


def fcode(p):
    for k in ("ISO_A2_EH", "ISO_A2"):
        if p.get(k) and p[k] != "-99": return p[k].upper()
    return (p.get("NAME") or "??").upper()


def main():
    raw = open(sys.argv[1], encoding="utf-8", errors="replace").read() if len(sys.argv) > 1 else \
        urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (earth-world data refresh)"}), timeout=60).read().decode("utf-8", "replace")
    # 一列一列解析(有些國家名稱後面會附更新日期之類的標記,整頁用一條正規式比對會錯位)
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", raw, re.S):
        c = re.search(r'<td data-title="國家">\s*<a[^>]*>(.*?)</a>', tr, re.S)
        r = re.search(r'<td data-title="國家地區">(.*?)</td>', tr, re.S)
        l = re.search(r'<span class="square (\w+)"></span>', tr)
        if c and r and l and l.group(1) in LEVELS:
            rows.append((c.group(1), r.group(1), l.group(1)))
    if len(rows) < 100:
        sys.exit(f"只解析到 {len(rows)} 列,網頁格式可能改了,不更新")

    geo = json.load(open(os.path.join(ROOT, "data", "countries.geo.json"), encoding="utf-8"))
    zh_names = json.load(open(os.path.join(ROOT, "data", "country-names-zh-hant.json"), encoding="utf-8"))
    by_zh = {n: c for c, n in zh_names.items()}; by_zh.update(ZH_ALIAS)
    by_en = {}
    for f in geo["features"]:
        for k in ("NAME", "NAME_EN"):
            if f["properties"].get(k): by_en[norm_en(f["properties"][k])] = fcode(f["properties"])

    def split(cell):
        t = html.unescape(re.sub(r"<[^>]+>", "", cell))
        t = re.sub(r"[（(]\d{4}-\d{2}-\d{2}[)）]", "", re.sub(r"\s+", " ", t)).strip()   # 名稱後面的更新日期
        m = re.match(r"^([^A-Za-z]+?)\s*([A-Za-z].*)?$", t)
        zh = re.sub(r"[(（].*?[)）]", "", m.group(1)).strip() if m else t
        return zh, (m.group(2) or "").strip() if m else ""

    per = {}
    unmatched = []
    for country, region, cls in rows:
        zh, en = split(country)
        if zh in SKIP: continue
        code = by_zh.get(zh) or by_en.get(norm_en(en))
        if not code:
            unmatched.append(zh); continue
        rzh, _ = split(region)
        level = LEVELS[cls][0]
        area = None if (rzh == zh or rzh.startswith(zh)) else rzh.strip(" 、")
        per.setdefault(code, []).append((level, area))

    old = {}
    try: old = json.load(open(OUT, encoding="utf-8")).get("countries", {})
    except Exception: pass
    countries = {}
    for code, items in per.items():
        top = max(l for l, _ in items)
        areas = [a for l, a in items if l == top and a]
        whole = any(l == top and a is None for l, a in items)
        note = None if whole or not areas else "、".join(dict.fromkeys(areas))[:60]
        cls = next(k for k, v in LEVELS.items() if v[0] == top)
        _, label, color, generic = LEVELS[cls]
        prev = old.get(code)
        reason = prev["reason"] if prev and prev.get("level") == top and prev.get("reason") else generic
        countries[code] = {"level": top, "label": label, "color": color, "note": note, "reason": reason}

    doc = {
        "as_of": date.today().isoformat(),
        "source": f"中華民國外交部領事事務局 全球旅遊警示 {URL}",
        "disclaimer": "警示等級會隨情勢變動,僅供參考,出發前請至外交部官網查詢最新狀態。",
        "countries": dict(sorted(countries.items())),
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    changed = [f"{c}:{old[c]['level']}→{countries[c]['level']}" for c in countries if c in old and old[c].get("level") != countries[c]["level"]]
    added = [c for c in countries if c not in old]
    print(f"{len(rows)} 列 → {len(countries)} 國;等級變動:{changed};新增:{len(added)} 國;對應不到:{unmatched}")


if __name__ == "__main__":
    main()
