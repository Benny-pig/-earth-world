"""Build data/emergency.json — 各國緊急電話 + 我國駐外館處 + 中國駐外大使館(國家側欄「緊急聯絡」用)。

資料來源(都是公開網頁,每頁間隔 0.5 秒,避免造成對方伺服器負擔):
  1. 各國報警/消防/救護電話:英文維基百科 List of emergency telephone numbers
  2. 我國駐外館處:外交部領事事務局「駐外館處」頁面(館址、電話、急難救助電話、轄區)
  3. 中國駐外大使館:中華人民共和國外交部「駐外使館」頁面(簡體中文,轉成台灣繁體)

用法:
    python tools/build-emergency.py                # 重新抓全部來源(約 5–10 分鐘)
    python tools/build-emergency.py --cache DIR    # 抓過的原始資料存在 DIR,下次直接沿用

需要:pip install opencc-python-reimplemented(簡轉繁)
"""
import html, json, os, re, string, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import date
from html.parser import HTMLParser

import opencc

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "emergency.json")
UA = {"User-Agent": "Mozilla/5.0 (earth-world educational globe; data refresh)"}
S2T = opencc.OpenCC("s2twp")


def get(url):
    req = urllib.request.Request(url, headers=UA)
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if i == 2: raise
        except Exception:
            if i == 2: raise
        time.sleep(3)


def cached(cache, name, fn):
    if cache:
        p = os.path.join(cache, name)
        if os.path.exists(p):
            return json.load(open(p, encoding="utf-8"))
    data = fn()
    if cache:
        os.makedirs(cache, exist_ok=True)
        json.dump(data, open(os.path.join(cache, name), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return data


def clean(fragment):
    t = re.sub(r"<br\s*/?>", "\n", fragment)
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    lines = [re.sub(r"[ \t　\xa0]+", " ", l).strip() for l in t.split("\n")]
    return "\n".join(l for l in lines if l)


# ───────────────────────── 國家代碼對應 ─────────────────────────
geo = json.load(open(os.path.join(ROOT, "data", "countries.geo.json"), encoding="utf-8"))
zh_names = json.load(open(os.path.join(ROOT, "data", "country-names-zh-hant.json"), encoding="utf-8"))


def fcode(p):
    for k in ("ISO_A2_EH", "ISO_A2"):
        if p.get(k) and p[k] != "-99": return p[k].upper()
    return (p.get("NAME") or "??").upper()


CODES = {fcode(f["properties"]) for f in geo["features"]}
POLYS = []
for f in geo["features"]:
    g = f["geometry"]
    for poly in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]):
        xs = [p[0] for p in poly[0]]; ys = [p[1] for p in poly[0]]
        POLYS.append((fcode(f["properties"]), (min(xs), min(ys), max(xs), max(ys)), poly))


def _inside(ring, x, y):
    res, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi: res = not res
        j = i
    return res


def country_at(lat, lon):
    for c, (x0, y0, x1, y1), poly in POLYS:
        if x0 <= lon <= x1 and y0 <= lat <= y1 and _inside(poly[0], lon, lat) and not any(_inside(h, lon, lat) for h in poly[1:]):
            return c
    return None


def norm_en(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", "", s); s = re.sub(r"[^a-z ]", " ", s)
    s = re.sub(r"\b(the|and|of)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


EN = {}
for f in geo["features"]:
    for k in ("NAME", "NAME_EN"):
        if f["properties"].get(k): EN[norm_en(f["properties"][k])] = fcode(f["properties"])
EN.update({norm_en(k): v for k, v in {
    "Democratic People's Republic of Korea": "KP", "Republic of Korea": "KR", "Republic of China": "TW",
    "Turks and Caicos": "TC", "U.S. Virgin Islands": "VI", "Åland Islands": "AX", "Northern Cyprus": "N. CYPRUS",
    "Norfolk Island": "NF", "Czechia": "CZ", "Ivory Coast": "CI", "Cote d'Ivoire": "CI", "Eswatini": "SZ",
    "Swaziland": "SZ", "Cabo Verde": "CV", "East Timor": "TL", "Timor-Leste": "TL", "Burma": "MM",
    "Lao People's Democratic Republic": "LA", "Laos": "LA", "Viet Nam": "VN", "Russian Federation": "RU",
    "Syrian Arab Republic": "SY", "Iran": "IR", "Brunei Darussalam": "BN", "United States": "US",
    "United States of America": "US", "United Kingdom": "GB", "UK": "GB", "Congo": "CG",
    "Democratic Republic of Congo": "CD", "Democratic Republic of the Congo": "CD", "Republic of Congo": "CG",
    "The Bahamas": "BS", "The Gambia": "GM", "Gambia": "GM", "Micronesia": "FM", "Macedonia": "MK",
    "Bosnia and Herzegovina": "BA", "Holy See": "VA", "Vatican": "VA", "Palestine": "PS",
    "Sao Tome and Principe": "ST", "Saint Kitts and Nevis": "KN", "Saint Vincent and the Grenadines": "VC",
    "Antigua and Barbuda": "AG", "Trinidad and Tobago": "TT", "Solomon Islands": "SB", "Marshall Islands": "MH",
    "Central African Republic": "CF", "Equatorial Guinea": "GQ", "Guinea-Bissau": "GW", "South Sudan": "SS",
    "Dominican Republic": "DO", "Somaliland": "SOMALILAND", "Kosovo": "XK",
    "Portuguese Republic": "PT", "Slovak Republic": "SK", "Naoero": "NR", "Republic of Naoero": "NR",
}.items()})
# 中國使館頁面沒有英文館名時,用簡體館名判斷
CN_ZH = {"圣马力诺": "SM"}


# 台灣譯名 → 代碼(地圖用名 + 領事事務局常見寫法)
ZH = {n: c for c, n in zh_names.items() if c in CODES}
ZH.update({
    "澳洲": "AU", "澳大利亞": "AU", "美國": "US", "南韓": "KR", "韓國": "KR", "北韓": "KP", "紐西蘭": "NZ", "英國": "GB",
    "諾魯": "NR", "諾埃羅": "NR", "吐瓦魯": "TV", "馬紹爾群島": "MH", "帛琉": "PW", "索羅門群島": "SB", "萬那杜": "VU",
    "新喀里多尼亞": "NC", "法屬玻里尼西亞": "PF", "大溪地": "PF", "瓦利斯和富圖那群島": "WF", "東加": "TO",
    "薩摩亞": "WS", "美屬薩摩亞": "AS", "密克羅尼西亞": "FM", "關島": "GU", "北馬利安納群島": "MP",
    "北馬里亞納群島": "MP", "庫克群島": "CK", "紐埃": "NU", "史瓦帝尼": "SZ", "索馬利蘭": "SOMALILAND",
    "北賽普勒斯": "N. CYPRUS", "教廷": "VA", "梵蒂岡": "VA", "波赫": "BA", "蒙古國": "MN", "印度尼西亞": "ID",
    "美屬維京群島": "VI", "維京群島": "VG", "英屬維京群島": "VG", "開曼群島": "KY", "福克蘭群島": "FK",
    "土克凱可群島": "TC", "百慕達": "BM", "波多黎各": "PR", "阿魯巴": "AW", "古拉索": "CW", "聖皮埃與密克隆": "PM",
    "法屬聖皮埃與密克隆群島": "PM", "聖巴瑟米": "BL", "蒙哲臘": "MS", "科索沃": "XK", "西撒哈拉": "EH",
    "剛果民主共和國": "CD", "剛果共和國": "CG", "中非": "CF", "厄利垂亞": "ER", "葛摩": "KM", "甘比亞": "GM",
    "獅子山": "SL", "賴比瑞亞": "LR", "布吉納法索": "BF", "幾內亞": "GN", "茅利塔尼亞": "MR", "赤道幾內亞": "GQ",
    "聖多美普林西比": "ST", "幾內亞比索": "GW", "維德角": "CV", "南蘇丹": "SS", "Guernsey": "GG", "Jersey": "JE",
    "Isle of Man": "IM",
})
# 轄區文字裡「看起來像國名、其實不是」的字串,比對前先塗掉
ZH_NOISE = ["喬治亞州", "哥倫比亞特區", "紐芬蘭", "北愛爾蘭", "聖卡達莉納", "英國海外", "英國政府", "英國之", "駐法國代表處",
            "駐奈及利亞", "新墨西哥", "新南威爾斯", "西維吉尼亞", "北卡羅萊納", "南卡羅萊納"]
ZH_KEYS = sorted(ZH, key=len, reverse=True)
# 沒有座標的館處:用駐在城市判斷所在國
CITY = {"墨爾本": "AU", "布里斯本": "AU", "雪梨": "AU", "大阪": "JP", "福岡": "JP", "那霸": "JP", "札幌": "JP", "橫濱": "JP",
        "駐日": "JP", "釜山": "KR", "多倫多": "CA", "溫哥華": "CA", "蒙特婁": "CA", "亞特蘭大": "US", "波士頓": "US",
        "芝加哥": "US", "丹佛": "US", "檀香山": "US", "休士頓": "US", "洛杉磯": "US", "邁阿密": "US", "紐約": "US",
        "舊金山": "US", "西雅圖": "US", "米蘭": "IT", "法蘭克福": "DE", "愛丁堡": "GB", "孟買": "IN", "杜拜": "AE",
        "奧克蘭": "NZ", "清奈": "IN", "泗水": "ID", "普羅旺斯": "FR", "開普敦": "ZA", "聖保羅": "BR", "東方市": "PY",
        "胡志明": "VN", "台拉維夫": "IL", "日內瓦": "CH", "莫斯科": "RU", "安卡拉": "TR", "烏蘭巴托": "MN"}


def zh_codes(text):
    for noise in ZH_NOISE: text = text.replace(noise, "＿")
    found = []
    for n in ZH_KEYS:
        if n in text:
            if ZH[n] not in found: found.append(ZH[n])
            text = text.replace(n, "＿" * len(n))   # 避免「印度尼西亞」又被算成「印度」
    return found


# ───────────────────────── 1. 各國緊急電話(維基百科) ─────────────────────────
class _Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.stack, self.cell, self.skip = [], [], None, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("style", "sup"): self.skip += 1; return
        if tag == "table": self.stack.append([])
        elif tag == "tr" and self.stack: self.stack[-1].append([])
        elif tag in ("td", "th") and self.stack:
            self.cell = {"text": "", "rs": int(a.get("rowspan", 1) or 1), "cs": int(a.get("colspan", 1) or 1)}
        elif tag == "br" and self.cell is not None: self.cell["text"] += " / "

    def handle_endtag(self, tag):
        if tag in ("style", "sup"):
            if self.skip: self.skip -= 1
            return
        if tag in ("td", "th") and self.cell is not None and self.stack:
            self.stack[-1][-1].append(self.cell); self.cell = None
        elif tag == "table" and self.stack: self.tables.append(self.stack.pop())

    def handle_data(self, d):
        if self.cell is not None and not self.skip: self.cell["text"] += d


def _grid(rows):
    out, pending = [], {}
    for r in rows:
        line, ci, k = [], 0, 0
        while k < len(r) or ci in pending:
            if ci in pending:
                c, left = pending[ci]; line.append(c)
                if left <= 1: del pending[ci]
                else: pending[ci] = (c, left - 1)
                ci += 1; continue
            c = r[k]; k += 1
            for _ in range(c["cs"]):
                line.append(c)
                if c["rs"] > 1: pending[ci] = (c, c["rs"] - 1)
                ci += 1
        out.append(line)
    return out


def fetch_emergency_numbers():
    page = get("https://en.wikipedia.org/api/rest_v1/page/html/List_of_emergency_telephone_numbers")
    p = _Tables(); p.feed(page)
    rows = []
    for t in p.tables:
        if not t: continue
        hdr = [re.sub(r"\s+", " ", c["text"]).strip() for c in t[0]]
        if hdr[:4] != ["Country", "Police", "Ambulance", "Fire"]: continue
        for line in _grid(t[1:]):
            if len(line) < 4: continue
            val = lambda c: re.sub(r"\s+", " ", c["text"]).strip(" /")
            rows.append({"country": val(line[0]), "police": val(line[1]), "ambulance": val(line[2]), "fire": val(line[3])})
    return rows


SPECIAL_NUM = {"local numbers only": None, "depends on town/city": "依城市而異"}


def tidy_number(v):
    v = (v or "").strip()
    if not v: return None
    if v.lower() in SPECIAL_NUM: return SPECIAL_NUM[v.lower()]
    v = re.sub(r"^McMurdo Station:\s*(\d+).*", r"麥克默多站 \1", v)
    v = re.sub(r"\s+(CBV|CBM|ASOBOMBD)\s*\([^)]*\)", "", v)   # 瓜地馬拉的單位縮寫說明
    v = re.sub(r"\s+(or|and)\s+", " / ", v)
    v = re.sub(r"\s*/\s*", " / ", v)
    return v


# ───────────────────────── 2. 我國駐外館處(領事事務局) ─────────────────────────
def scrape_boca():
    lst = get("https://www.boca.gov.tw/sp-foof-arealp-All-1.html")
    out = []
    for href, name in re.findall(r'<td data-title="駐外館處"><a href="(/sp-foof-areacp-[^"]+)"[^>]*>(.*?)</a>', lst, re.S):
        s = get("https://www.boca.gov.tw" + href)
        rec = {"href": href}
        for th, td in re.findall(r"<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", s, re.S):
            k = re.sub(r"<[^>]+>|\s+", "", th)
            if any(x in k for x in ("休假", "街道圖", "時差")): continue
            m = re.search(r'href="([^"]+)"', td) if k == "網址" else None
            rec[k] = m.group(1) if m else clean(td)
        m = re.search(r'maps\.google\.com/maps\?[^"]*?q=([^"&]+)', s)
        if m: rec["mapq"] = html.unescape(urllib.parse.unquote(m.group(1)))
        out.append(rec)
        print("  BOCA", clean(name))
        time.sleep(0.5)
    return out


def pick(rec, *keys):
    for k in keys:
        for rk, v in rec.items():
            if rk.startswith(k): return v
    return None


def build_tw(offices):
    tw_off, by_country = {}, {}
    for i, o in enumerate(offices):
        oid = f"t{i}"
        name, juris = pick(o, "駐外館處中文名稱") or "", pick(o, "領務轄區") or ""
        g = None
        if o.get("mapq") and re.match(r"^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$", o["mapq"]):
            g = [round(float(x), 5) for x in o["mapq"].split(",")]
        # 所在國:館名裡的國名最可靠(駐教廷大使館座標在羅馬,不能算成義大利),
        # 其次是座標,再來是駐在城市
        in_name = [c for c in zh_codes(name) if c != "TW"]
        host = (in_name[0] if in_name else None) or (country_at(*g) if g else None) \
            or next((c for k, c in CITY.items() if k in name), None)
        covered = [c for c in dict.fromkeys([host] + zh_codes(name) + zh_codes(juris)) if c and c != "TW"]
        tw_off[oid] = {k: v for k, v in {
            "n": name, "en": pick(o, "駐外館處英"), "a": pick(o, "館址"), "t": pick(o, "電話"),
            "e": pick(o, "緊急聯絡電話"), "m": pick(o, "電子郵件"), "h": pick(o, "服務時間"),
            "j": juris, "u": pick(o, "網址"), "g": g,
        }.items() if v}
        for c in covered:
            by_country.setdefault(c, []).append((oid, 1 if c == host else 0, name))
    # 排序:駐在當地的在前;其中館名以「分處/辦事處」結尾的(城市辦事處、分處)排後面;
    # 再來館名有寫國名的優先(駐越南… 排在 駐胡志明市… 前面)
    zh_of = {c: n for n, c in ZH.items()}
    def branch(n):
        return 1 if re.search(r"(分處|辦事處)$", re.sub(r"[(（].*?[)）]", "", n).strip()) else 0
    tw = {}
    for c, lst in by_country.items():
        lst.sort(key=lambda x: (-x[1], branch(x[2]), 0 if zh_names.get(c, zh_of.get(c, "?")) in x[2] else 1))
        tw[c] = [[oid, host] for oid, host, _ in lst]
    return tw_off, tw


# ───────────────────────── 3. 中國駐外大使館(中國外交部) ─────────────────────────
CN_BASE = "https://www.fmprc.gov.cn/web/zwjg_674741/zwsg_674743/"
CN_REGIONS = ["yz_674745/", "fz_674747/", "xo_674749/", "xybf_674751/", "dozy_674753/", "bmdyz_674755/"]


def scrape_cn():
    links = {}
    for reg in CN_REGIONS:
        for page in ["index.shtml"] + [f"index_{i}.shtml" for i in range(1, 6)]:
            url = CN_BASE + reg + page
            s = get(url)
            if not s: break
            found = 0
            for href, name in re.findall(r'href="(\./[^"]+\.shtml)"[^>]*>([^<]{2,40})</a>', s):
                if "使馆" in name:
                    links[urllib.parse.urljoin(url, href)] = name.strip(); found += 1
            if not found: break
            time.sleep(0.5)
    out = []
    for url, name in links.items():
        s = get(url)
        if not s: continue
        t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
        t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
        t = re.sub(r"[ \t　\xa0]+", " ", t)
        t = re.sub(r"\n\s*\n+", "\n", t)
        k = t.find(name)
        body = (t[k:k + 3000] if k >= 0 else t).split("相关附件")[0]
        out.append({"url": url, "name": name, "body": body})
        print("  CN", name)
        time.sleep(0.5)
    return out


_LABEL_LINE = re.compile(r"^\s*(?!https?:)[^\s：:，,]{1,6}(?:\s[^\s：:，,]{1,6})?\s*(?:[（(][^）)]*[）)])?\s*[：:]")


def cn_field(body, *labels, url=False, first_line=False, prefix=False):
    """中國外交部使館頁是「標籤:值」一行一欄,但值常常換行(「电 话：」下一行才是號碼,
    或「0066-2-」下一行接「2450088」)。值是空的或以 - 結尾時接續下一行,遇到下一個標籤就停。
    標籤字中間可能有空白(「地 址」),後面可能帶括號(「地 址（临时）」)。"""
    lines = body.split("\n")
    for lab in labels:
        # prefix=True:標籤前面可以有其他字(「中国公民领事保护与协助咨询电话」也算「领事保护与协助咨询电话」)
        pat = re.compile(r"^\s*" + (r"[^\s：:]{0,12}?" if prefix else "") + r"\s*".join(map(re.escape, lab)) +
                         r"\s*(?:[（(][^）)]*[）)])?\s*[：:]\s*(.*)$")
        for i, line in enumerate(lines):
            m = pat.match(line)
            if not m: continue
            val = m.group(1).strip()
            for nxt in lines[i + 1:i + 4]:
                if val and not val.endswith(("-", "－")): break
                if _LABEL_LINE.match(nxt) or not nxt.strip(): break
                val += nxt.strip()
            if first_line: val = val.split(" ")[0]
            if not val or (not url and re.match(r"^https?://", val)): continue
            if len(val) > 90:   # 過長的附註說明(辦公時間、業務範圍…)截掉,保留號碼本身
                cut = val.find("（", 10)
                if cut > 0: val = val[:cut]
            return val
    return None


def build_cn(pages):
    emb, by_country = {}, {}
    for i, p in enumerate(pages):
        body = p["body"]
        site = cn_field(body, "网址", "网站", url=True) or ""
        code = None
        m = re.search(r"https?://([a-z]{2})\.china-embassy\.(?:gov|org)\.cn", site)
        if m and m.group(1).upper() in CODES: code = m.group(1).upper()
        en = re.search(r"\n(EMBASSY OF [^\n]+)", body)
        if not code and en:
            tail = re.sub(r"^EMBASSY OF THE PEOPLE'?S REPUBLIC OF CHINA (IN|TO) (THE )?", "", en.group(1).strip(), flags=re.I)
            code = EN.get(norm_en(tail))
            if not code:   # 例如 "REPUBLIC OF KENYA"、"KINGDOM OF THAILAND":逐步去掉開頭的國體字樣
                words = norm_en(tail).split()
                for j in range(len(words)):
                    code = EN.get(" ".join(words[j:]))
                    if code: break
        if not code:
            code = next((c for k, c in CN_ZH.items() if k in p["name"]), None)
        if not code:
            print("  ! 無法對應國家:", p["name"], en.group(1) if en else "")
            continue
        area = (cn_field(body, "国家地区号", "国家区号") or "").replace("－", "-").replace("—", "-")
        area = re.sub(r"^00", "+", area.strip())
        tel = cn_field(body, "电话", "办公电话", "总机", "办公室") or cn_field(body, "联系电话", prefix=True)
        if tel and area and not tel.startswith(("+", "00")): tel = f"({area}) {tel}"
        eid = f"c{i}"
        emb[eid] = {k: (S2T.convert(v) if isinstance(v, str) and k in ("n", "a", "c", "t") else v) for k, v in {
            "n": "中華人民共和國" + p["name"] if not p["name"].startswith("中华") else p["name"],
            "en": re.sub(r"(?<=\s)(Of|The|In|To|And)\b", lambda w: w.group(1).lower(), string.capwords(en.group(1).strip())) if en else None,
            "a": cn_field(body, "地址", "馆址"),
            "t": tel,
            "c": cn_field(body, "领事保护与协助电话", "领事保护与协助咨询电话", "领事保护电话", "领保电话",
                          "领事保护与协助热线", "领事部", "领侨处", prefix=True),
            "m": cn_field(body, "电子邮箱", "电子信箱", "电子邮件", "邮箱", first_line=True),
            "u": site or None,
        }.items() if v}
        by_country.setdefault(code, []).append(eid)
    return emb, by_country


# ───────────────────────── main ─────────────────────────
def main():
    cache = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else None
    em_rows = cached(cache, "em_rows.json", fetch_emergency_numbers)
    offices = cached(cache, "boca_offices.json", scrape_boca)
    cn_pages = cached(cache, "cn_pages.json", scrape_cn)

    em = {}
    for r in em_rows:
        c = EN.get(norm_en(r["country"]))
        if not c or c in em: continue
        em[c] = [tidy_number(r["police"]), tidy_number(r["fire"]), tidy_number(r["ambulance"])]
    em.setdefault("NF", ["000", "000", "000"])   # 諾福克島沿用澳洲 000

    tw_off, tw = build_tw(offices)
    cn_emb, cn = build_cn(cn_pages)
    doc = {
        "asOf": date.today().isoformat(),
        "sources": {
            "em": "https://en.wikipedia.org/wiki/List_of_emergency_telephone_numbers",
            "tw": "https://www.boca.gov.tw/sp-foof-areamp-1.html",
            "cn": "https://www.fmprc.gov.cn/web/zwjg_674741/zwsg_674743/",
        },
        "em": dict(sorted(em.items())), "tw": dict(sorted(tw.items())), "cn": dict(sorted(cn.items())),
        "twOffices": tw_off, "cnEmb": cn_emb,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"em {len(em)} · tw offices {len(tw_off)} → {len(tw)} 國 · cn {len(cn_emb)} → {len(cn)} 國 · {os.path.getsize(OUT):,} bytes")


if __name__ == "__main__":
    main()
