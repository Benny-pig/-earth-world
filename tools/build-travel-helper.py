"""🧳 產生 data/travel-helper.json:「出國小幫手」要用的各國資料(以台灣旅客的角度)。

  visa   台灣護照的簽證待遇(免簽/電子旅行許可/電子簽證/落地簽/需要簽證)與可停留天數
         來源:維基百科 Visa requirements for Taiwanese citizens(CC BY-SA,整理自各國官方與 IATA Timatic)
         網頁上一律提醒「出發前以外交部領事事務局公告為準」並附官方連結
  power  插座類型、電壓、頻率    來源:維基百科 Mains electricity by country(CC BY-SA)
  drive  靠左或靠右行駛          來源:維基百科 Left- and right-hand traffic(CC BY-SA)

小費、付款習慣、常用語在 data/deep/(國家大百科),緊急電話在 data/emergency.json,不在這裡重複。
簽證規定偶爾會變,排進每週自動更新(update-data.yml)。

用法:python tools/build-travel-helper.py
"""
import html, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "travel-helper.json")
UA = {"User-Agent": "earth-world build tool (https://github.com/Benny-pig/-earth-world)"}
PAGES = {
    "visa": "Visa requirements for Taiwanese citizens",
    "power": "Mains electricity by country",
    "drive": "Left- and right-hand traffic",
}
ALIAS = {
    "united states": "US", "united kingdom": "GB", "south korea": "KR", "north korea": "KP", "russia": "RU", "czech republic": "CZ",
    "czechia": "CZ", "ivory coast": "CI", "cote d ivoire": "CI", "democratic congo": "CD", "congo": "CG",
    "east timor": "TL", "timor leste": "TL", "eswatini": "SZ", "swaziland": "SZ", "cape verde": "CV", "cabo verde": "CV", "gambia": "GM",
    "bahamas": "BS", "micronesia": "FM", "federated states micronesia": "FM", "vatican city": "VA", "vatican": "VA", "holy see": "VA",
    "palestine": "PS", "taiwan": "TW", "hong kong": "HK", "macau": "MO", "macao": "MO", "north macedonia": "MK", "myanmar": "MM",
    "laos": "LA", "brunei": "BN", "syria": "SY", "iran": "IR", "vietnam": "VN", "moldova": "MD", "bolivia": "BO", "venezuela": "VE",
    "tanzania": "TZ", "sao tome principe": "ST", "curacao": "CW", "sint maarten": "SX", "saint barthelemy": "BL",
    "saint martin": "MF", "collectivity saint martin": "MF", "falkland islands": "FK", "aland islands": "AX", "aland": "AX",
    "kosovo": "XK", "china": "CN", "people s china": "CN", "united arab emirates": "AE", "turkey": "TR", "turkiye": "TR",
    "saint kitts nevis": "KN", "saint lucia": "LC", "saint vincent grenadines": "VC", "antigua barbuda": "AG", "trinidad tobago": "TT",
    "bosnia herzegovina": "BA", "central african": "CF", "dominican": "DO", "equatorial guinea": "GQ", "guinea bissau": "GW",
    "marshall islands": "MH", "solomon islands": "SB", "papua new guinea": "PG", "new caledonia": "NC", "french polynesia": "PF",
    "wallis futuna": "WF", "american samoa": "AS", "northern mariana islands": "MP", "guam": "GU", "puerto rico": "PR",
    "united states virgin islands": "VI", "us virgin islands": "VI", "british virgin islands": "VG", "turks caicos islands": "TC",
    "cayman islands": "KY", "bermuda": "BM", "anguilla": "AI", "montserrat": "MS", "greenland": "GL", "faroe islands": "FO",
    "isle man": "IM", "jersey": "JE", "guernsey": "GG", "gibraltar": "GI", "saint helena": "SH", "saint pierre miquelon": "PM",
    "cook islands": "CK", "niue": "NU", "pitcairn islands": "PN", "norfolk island": "NF", "western sahara": "EH",
    "sahrawi arab": "EH", "south sudan": "SS", "sudan": "SD", "south africa": "ZA", "new zealand": "NZ", "sri lanka": "LK",
    "el salvador": "SV", "costa rica": "CR", "saudi arabia": "SA", "north cyprus": None, "northern cyprus": None,
    "turkish northern cyprus": None, "abkhazia": None, "south ossetia": None, "transnistria": None, "somaliland": None,
    "artsakh": None, "british indian ocean territory": "IO", "south georgia south sandwich islands": "GS",
    "french southern antarctic lands": "TF", "heard island mcdonald islands": "HM", "antarctica": "AQ", "aruba": "AW",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"[^a-z ]", " ", s)
    s = re.sub(r"\b(the|and|of|republic|kingdom|state|federal|democratic|islamic|plurinational|federation|commonwealth)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def name_index():
    g = json.load(open(os.path.join(ROOT, "data", "countries.geo.json"), encoding="utf-8"))
    idx = {}
    for f in g["features"]:
        p = f["properties"]
        code = next((p[k].upper() for k in ("ISO_A2_EH", "ISO_A2") if p.get(k) and p[k] != "-99"), None)
        if not code:
            continue
        for k in ("NAME", "NAME_EN"):
            if p.get(k):
                idx.setdefault(norm(p[k]), code)
    for k, v in ALIAS.items():
        idx[norm(k)] = v
    return idx


def code_of(name, idx):
    low = name.lower()
    if "congo" in low:   # 兩個剛果:正規化後名字會一樣,先分開
        return "CD" if ("democratic" in low or low.startswith("dr ") or "kinshasa" in low) else "CG"
    return idx.get(norm(name))


def wikitext(title):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "parse", "page": title, "prop": "wikitext", "format": "json", "formatversion": 2})
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))["parse"]["wikitext"]
        except Exception as e:
            print("  讀取失敗,重試:", e)
            time.sleep(5)
    raise SystemExit(f"讀不到維基百科:{title}")


def clean(s):
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{efn.*?\}\}", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = s.replace("&nbsp;", " ").replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n")
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def rows(text):
    """把維基表格切成列,每列回傳 (國名, [欄位…])。"""
    for chunk in re.split(r"\n\|-", text):
        m = re.search(r"\{\{[Ff]lag(?:country)?\|([^}|]+)", chunk)
        if not m:
            continue
        cells = re.split(r"\n\s*\|(?!\|)", "\n" + chunk.split("\n", 1)[-1] if "\n" in chunk else chunk)
        yield m.group(1).strip(), [c for c in cells], chunk


# ---------- 簽證 ----------
def stay_zh(s):
    s = clean(re.sub(r"\{\{sort\|[^|}]*\|", "", s))
    s = s.split("\n")[0].strip()
    m = re.match(r"^(\d+)\s*(day|days|month|months|year|years|week|weeks)\b", s, re.I)
    if not m:
        return ""
    unit = {"day": "天", "month": "個月", "year": "年", "week": "週"}[m.group(2).lower().rstrip("s")]
    return f"{m.group(1)} {unit}"


def visa_type(tpl, label):
    label = clean(label).lower()
    tpl = tpl.lower()
    if "admission refused" in label:
        return "refused"
    if tpl == "optional":
        return "voa" if "arrival" in label else "evisa" if "visa" in label else None
    if tpl == "free" or "mainland travel permit" in label:
        return "permit_cn"
    if tpl in ("yes",) and re.search(r"electronic (travel|border)|eta\b|visa waiver|esta", label):
        return "eta"
    if tpl == "yes":
        return "free"
    if tpl in ("yes2",):
        return "evisa"
    if tpl in ("yes-no", "yes-no2"):
        return "voa"
    if tpl in ("no",):
        return "visa"
    if tpl in ("no2",):
        return "permit"
    return None


def build_visa(idx, unmatched):
    text = wikitext(PAGES["visa"])
    out = {}
    for name, cells, chunk in rows(text):
        req = re.search(r"\{\{(yes2?|no2?|yes-no2?|partial|free|n/a|dunno|optional|black)\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}", chunk, re.I)
        if not req:
            continue
        t = visa_type(req.group(1), req.group(2))
        if not t:
            continue
        dest = re.search(r"destination=([A-Z]{2})", chunk)
        code = dest.group(1) if dest else code_of(name, idx)
        if not code:
            unmatched.add(("visa", name))
            continue
        stay = ""
        # 第三欄是可停留天數
        parts = re.split(r"\n\|", chunk)
        if len(parts) >= 4:
            stay = stay_zh(parts[3])
        if code not in out:
            out[code] = {"t": t, "stay": stay}
    # 香港、澳門在維基表格的另一段,格式不同:依陸委會/外交部現行規定手動補上
    out.setdefault("HK", {"t": "hk_par", "stay": "30 天"})
    out.setdefault("MO", {"t": "free", "stay": "30 天"})
    out["CN"] = {"t": "permit_cn", "stay": ""}
    return out


# ---------- 插座與電壓 ----------
def build_power(idx, unmatched):
    text = wikitext(PAGES["power"])
    out = {}
    for name, cells, chunk in rows(text):
        parts = re.split(r"\n\|", chunk)
        # parts[0] 是空的、[1] 國名、[2] 插座、[3] 國家標準、[4] 電壓、[5] 頻率
        if len(parts) < 6:
            continue
        plugs = sorted(set(re.findall(r"\b([A-O])\b", clean(parts[2]))))
        volt = re.search(r"(\d{2,3})\s*(?:/\s*\d+)?\s*V", clean(parts[4]))
        hz = sorted(set(re.findall(r"(50|60)", clean(parts[5]))))
        code = code_of(name, idx)
        if not code:
            unmatched.add(("power", name))
            continue
        if not plugs and not volt:
            continue
        out.setdefault(code, {"plugs": plugs, "v": int(volt.group(1)) if volt else None, "hz": "/".join(hz)})
    return out


# ---------- 靠左/靠右 ----------
def build_drive(idx, unmatched):
    text = wikitext(PAGES["drive"])
    start = text.find('{| class="wikitable sortable')
    out = {}
    for name, cells, chunk in rows(text[start:]):
        m = re.search(r"\|\s*(LHT|RHT)\b", chunk)
        if not m:
            continue
        code = code_of(name, idx)
        if not code:
            unmatched.add(("drive", name))
            continue
        out.setdefault(code, "L" if m.group(1) == "LHT" else "R")
    return out


def main():
    idx = name_index()
    unmatched = set()
    visa = build_visa(idx, unmatched)
    power = build_power(idx, unmatched)
    drive = build_drive(idx, unmatched)
    doc = {
        "asOf": date.today().isoformat(),
        "sources": {
            "visa": "https://en.wikipedia.org/wiki/Visa_requirements_for_Taiwanese_citizens",
            "visa_official": "https://www.boca.gov.tw/cp-37-220-9f130-1.html",
            "power": "https://en.wikipedia.org/wiki/Mains_electricity_by_country",
            "drive": "https://en.wikipedia.org/wiki/Left-_and_right-hand_traffic",
            "license": "維基百科內容以 CC BY-SA 4.0 授權",
        },
        "visa": dict(sorted(visa.items())),
        "power": dict(sorted(power.items())),
        "drive": dict(sorted(drive.items())),
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print(f"簽證 {len(visa)} 國 {dict(Counter(v['t'] for v in visa.values()))}")
    print(f"插座電壓 {len(power)} 國,行車方向 {len(drive)} 國(靠左 {sum(1 for v in drive.values() if v == 'L')})")
    miss = sorted(n for n in unmatched if n[1] and idx.get(norm(n[1]), "x") != None)
    if miss:
        print("對不到國碼(略過):", ", ".join(f"{k}:{n}" for k, n in miss))


if __name__ == "__main__":
    main()
