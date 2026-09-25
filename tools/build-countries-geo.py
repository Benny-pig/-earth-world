"""產生 data/countries.geo.json(地球上的國界/可點選國家)。

來源:Natural Earth 50m admin-0 countries(公有領域),比原本用的 110m 精細許多,
而且包含新加坡、香港、澳門、馬爾他等 110m 因為面積太小被排除的地區。

轉檔時只保留網站實際用到的欄位(原始檔每個國家有一百多個欄位,大部分用不到),
座標四捨五入到小數 3 位(約 100 公尺,地球儀縮放範圍內肉眼看不出差別),中文名
改用 data/country-names-zh-hant.json 的台灣慣用譯名。

用法:
    python tools/build-countries-geo.py [ne_50m_admin_0_countries.geojson 路徑]
沒給路徑就直接從 Natural Earth 的 GitHub 下載。
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
KEEP = ("NAME", "NAME_EN", "NAME_ZHT", "ISO_A2", "ISO_A2_EH", "POP_EST")
DECIMALS = 3


def country_code(p):
    # 要跟 src/countries/borders.js 的 countryCode() 規則一致
    for k in ("ISO_A2_EH", "ISO_A2"):
        v = p.get(k)
        if v and v != "-99":
            return str(v).upper()
    return (p.get("NAME") or "??").upper()


def clean_ring(ring):
    out = []
    for lon, lat in ring:
        pt = [round(lon, DECIMALS), round(lat, DECIMALS)]
        if not out or out[-1] != pt:
            out.append(pt)
    if len(out) >= 2 and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def main():
    if len(sys.argv) > 1:
        src = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        with urllib.request.urlopen(SRC_URL) as r:
            src = json.loads(r.read().decode("utf-8"))
    zh = json.loads((ROOT / "data/country-names-zh-hant.json").read_text(encoding="utf-8"))

    # 同一個代碼可能對應好幾個單位(例如澳洲本土、印度洋領地、亞什莫及卡地爾群島
    # 都是 AU)——網站用代碼當唯一鍵,合併成一個國家,以人口最多的那個當主體。
    groups = {}
    for f in src["features"]:
        groups.setdefault(country_code(f["properties"]), []).append(f)

    features = []
    for code, fs in groups.items():
        fs.sort(key=lambda f: f["properties"].get("POP_EST") or 0, reverse=True)
        main_props = fs[0]["properties"]
        props = {k: main_props.get(k) for k in KEEP}
        if code in zh:
            props["NAME_ZHT"] = zh[code]
        polys = []
        for f in fs:
            for poly in polygons(f["geometry"]):
                rings = [r for r in (clean_ring(ring) for ring in poly) if r]
                if rings and rings[0]:
                    polys.append(rings)
        if not polys:
            print("跳過(沒有有效多邊形):", code, file=sys.stderr)
            continue
        geom = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}
        features.append({"type": "Feature", "properties": props, "geometry": geom})
        if len(fs) > 1:
            print(f"合併 {code}:", [f["properties"]["NAME"] for f in fs], file=sys.stderr)

    features.sort(key=lambda f: country_code(f["properties"]))
    out = {"type": "FeatureCollection", "features": features}
    dest = ROOT / "data/countries.geo.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    missing_zh = [country_code(f["properties"]) for f in features if country_code(f["properties"]) not in zh]
    print(f"寫出 {len(features)} 個國家/地區 → {dest}({dest.stat().st_size:,} bytes)", file=sys.stderr)
    if missing_zh:
        print("缺中文譯名:", missing_zh, file=sys.stderr)
    build_regions(groups)


# 洲別分區(電台選台面板的分頁用):依 Natural Earth 的 REGION_UN / SUBREGION,
# 再照一般讀者的習慣微調——西亞 + 伊朗歸「中東」,北美只算美加,
# 中美洲、加勒比海併入「中南美」。
def region_of(p):
    reg, sub = p.get("REGION_UN"), p.get("SUBREGION")
    if reg == "Asia":
        return "ME" if sub == "Western Asia" or p.get("ISO_A2") == "IR" else "AS"
    if reg == "Americas":
        return "NA" if sub == "Northern America" else "LA"
    return {"Europe": "EU", "Africa": "AF", "Oceania": "OC"}.get(reg)


def build_regions(groups):
    regions = {}
    for code, fs in sorted(groups.items()):
        r = region_of(fs[0]["properties"])
        if r:
            regions[code] = r
    dest = ROOT / "data/country-regions.json"
    dest.write_text(json.dumps(regions, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"寫出 {len(regions)} 個國家的洲別 → {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
