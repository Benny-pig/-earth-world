"""📊 產生「數據地球」的資料:data/stats/index.json + 每個指標一個檔(打開那個指標才下載)。

資料:Our World in Data(CC BY 4.0),原始來源依指標不同(聯合國人口展望、麥迪森計畫、全球碳計畫、Ember…)。
選的指標都有台灣的數字(世界銀行的資料沒有台灣,所以不用)。每年更新一次就夠了。

每個指標檔:{"id", "y0", "y1", "v": {"TW": [y0 那年的值, …, y1 那年的值](缺的年份是 null)}}

用法:python tools/build-stats.py
"""
import csv, io, json, os, re, sys, time, unicodedata, urllib.request
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "stats")
UA = {"User-Agent": "earth-world build tool (https://github.com/Benny-pig/-earth-world)"}
GRAPHER = "https://ourworldindata.org/grapher/{slug}.csv?v=1&csvType=full&useColumnShortNames=true"
THIS_YEAR = date.today().year

# id, 網址代號, 欄位, 中文名稱, 單位, 小數位, 色階(log/lin), 顏色方向(high=數字大顏色深), 一句話說明, 原始來源
INDICATORS = [
    ("pop", "population", "population_historical", "人口", "人", 0, "log", "high",
     "全世界約八十億人,一半以上住在亞洲。拖動年份看看人口怎麼在七十多年間變成三倍。", "聯合國《世界人口展望》(UN WPP)"),
    ("density", "population-density", "population_density", "人口密度", "人/平方公里", 0, "log", "high",
     "每平方公里住多少人。台灣是全世界人口最密集的國家之一。", "聯合國《世界人口展望》"),
    ("life", "life-expectancy", "life_expectancy_0", "平均壽命", "歲", 1, "lin", "high",
     "剛出生的嬰兒平均能活幾歲。醫療、營養和衛生進步,讓全世界的平均壽命從 1950 年的不到 50 歲提高到 70 多歲。", "聯合國《世界人口展望》"),
    ("fert", "children-born-per-woman", "fertility_rate_hist", "生育率", "個孩子/每位女性", 2, "lin", "high",
     "每位女性一生平均生幾個孩子。長期低於 2.1,人口就會開始減少;台灣是全世界最低的地方之一。", "聯合國《世界人口展望》"),
    ("median", "median-age", "median_age__sex_all__age_all__variant_estimates", "年齡中位數", "歲", 1, "lin", "high",
     "把全國的人按年齡排隊,站在正中間那個人的年紀。數字越大代表社會越老。", "聯合國《世界人口展望》"),
    ("gdp", "gdp-per-capita-maddison-project-database", "gdp_per_capita", "人均所得", "國際元(2011 年購買力)", 0, "log", "high",
     "每個人平均一年生產多少價值,已經依各國物價調整,可以跨國、跨年代比較。", "麥迪森計畫(Maddison Project Database)"),
    ("co2", "co-emissions-per-capita", "emissions_total_per_capita", "人均碳排放", "公噸二氧化碳/人", 1, "log", "high",
     "每個人一年平均排放多少二氧化碳(燒煤、石油、天然氣和水泥)。", "全球碳計畫(Global Carbon Project)"),
    ("renew", "electricity-mix", "renewable_share_of_electricity__pct", "再生能源發電比例", "%", 1, "lin", "high",
     "發電量裡有多少來自水力、太陽能、風力等再生能源。", "Ember、Energy Institute"),
]
EXTRA_QS = {"electricity-mix": "&frequency=annual&metric=share_of_generation&source=renewables"}
START_MIN = 1950


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"[^a-z ]", " ", s)
    s = re.sub(r"\b(the|and|of|republic|kingdom|state|federal|democratic|islamic|plurinational|federation|commonwealth)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


ALIAS = {"united states": "US", "united kingdom": "GB", "south korea": "KR", "north korea": "KP", "russia": "RU", "czechia": "CZ",
         "cote d ivoire": "CI", "east timor": "TL", "eswatini": "SZ", "cape verde": "CV", "gambia": "GM", "bahamas": "BS",
         "micronesia": "FM", "vatican": "VA", "palestine": "PS", "taiwan": "TW", "hong kong": "HK", "macao": "MO",
         "north macedonia": "MK", "myanmar": "MM", "laos": "LA", "brunei": "BN", "syria": "SY", "iran": "IR", "vietnam": "VN",
         "moldova": "MD", "bolivia": "BO", "venezuela": "VE", "tanzania": "TZ", "sao tome principe": "ST", "curacao": "CW",
         "kosovo": "XK", "china": "CN", "turkey": "TR", "united arab emirates": "AE", "bosnia herzegovina": "BA",
         "central african": "CF", "dominican": "DO", "western sahara": "EH", "united states virgin islands": "VI",
         "british virgin islands": "VG", "saint kitts nevis": "KN", "saint vincent grenadines": "VC", "saint lucia": "LC",
         "antigua barbuda": "AG", "trinidad tobago": "TT", "saint pierre miquelon": "PM", "falkland islands": "FK",
         "wallis futuna": "WF", "sint maarten": "SX", "saint barthelemy": "BL", "saint martin": "MF", "aland islands": "AX"}


def name_index():
    g = json.load(open(os.path.join(ROOT, "data", "countries.geo.json"), encoding="utf-8"))
    idx = {}
    for f in g["features"]:
        p = f["properties"]
        code = next((p[k].upper() for k in ("ISO_A2_EH", "ISO_A2") if p.get(k) and p[k] != "-99"), None)
        if code:
            for k in ("NAME", "NAME_EN"):
                if p.get(k):
                    idx.setdefault(norm(p[k]), code)
    idx.update({norm(k): v for k, v in ALIAS.items()})
    return idx


def code_of(entity, idx):
    low = entity.lower()
    if "congo" in low:
        return "CD" if "democratic" in low else "CG"
    return idx.get(norm(entity))


def fetch(slug):
    url = GRAPHER.format(slug=slug) + EXTRA_QS.get(slug, "")
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read().decode("utf-8")
        except Exception as e:
            print("  讀取失敗,重試:", e)
            time.sleep(5)
    raise SystemExit(f"讀不到 {slug}")


def round_sig(x, digits):
    if x is None:
        return None
    if digits == 0:
        return int(round(x))
    return round(x, digits)


def main():
    idx = name_index()
    os.makedirs(OUT, exist_ok=True)
    index = []
    last_estimate = THIS_YEAR   # 人口密度的資料裡混了未來推估,用「人口」的最後一年當上限
    for (iid, slug, col, zh, unit, dec, scale, _dir, note, src) in INDICATORS:
        text = fetch(slug)
        rows = list(csv.DictReader(io.StringIO(text)))
        series, unmatched = {}, set()
        for r in rows:
            code3 = r.get("code") or ""
            if not code3 or code3.startswith("OWID_") and code3 != "OWID_KOS":
                continue   # 洲、世界、所得分組等彙總資料不要
            y = int(r["year"])
            if y < START_MIN or y > (last_estimate if iid == "density" else THIS_YEAR):
                continue   # 不要推估的未來年份
            v = r.get(col)
            if v in (None, ""):
                continue
            code = "XK" if code3 == "OWID_KOS" else code_of(r["entity"], idx)
            if not code:
                unmatched.add(r["entity"])
                continue
            series.setdefault(code, {})[y] = float(v)
        # 起始年份:至少 30 國有資料的第一年(有些指標早年只有少數國家)
        years = sorted({y for s in series.values() for y in s})
        y0 = next(y for y in years if sum(1 for s in series.values() if y in s) >= 30)
        y1 = years[-1]
        if iid == "pop":
            last_estimate = y1
        mul = 1000 if iid == "pop" else 1   # 人口用「千人」存,檔案小一點
        vals = {}
        for code, s in series.items():
            arr = [round_sig(s[y] / mul, dec) if y in s else None for y in range(y0, y1 + 1)]
            while arr and arr[-1] is None:
                arr.pop()
            vals[code] = arr
        doc = {"id": iid, "y0": y0, "y1": y1, "mul": mul, "v": dict(sorted(vals.items()))}
        path = os.path.join(OUT, f"{iid}.json")
        json.dump(doc, open(path, "w", encoding="utf-8"), separators=(",", ":"))
        tw = series.get("TW", {})
        index.append({"id": iid, "zh": zh, "unit": unit, "dec": dec, "scale": scale, "note": note, "src": src,
                      "url": f"https://ourworldindata.org/grapher/{slug}", "y0": y0, "y1": y1})
        print(f"{zh}:{len(vals)} 國,{y0}–{y1},台灣最新 {max(tw) if tw else '無'}={tw[max(tw)] if tw else '-'},"
              f"{os.path.getsize(path) // 1024} KB" + (f";對不到:{', '.join(sorted(unmatched))}" if unmatched else ""))
        time.sleep(1)
    json.dump({"asOf": date.today().isoformat(), "license": "Our World in Data,CC BY 4.0", "indicators": index},
              open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
