"""🌋 產生 data/volcanoes.json:美國史密森尼學會全球火山計畫(GVP)與美國地質調查所(USGS)
每週火山活動報告(Weekly Volcanic Activity Report)裡這一週有動靜的火山。

這份報告不能直接從網頁讀(沒有開放跨網域),所以跟其他資料一樣,由 GitHub Actions 每週抓一次存成檔案。
NASA EONET 的即時火山/野火/冰山事件則由網頁直接讀(scene/hazards.js)。

用法:python tools/build-volcanoes.py
"""
import html, json, os, re, sys, urllib.request
import xml.etree.ElementTree as ET
from datetime import date

RSS = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "volcanoes.json")
NS = {"georss": "http://www.georss.org/georss"}

# 常見活躍火山的中文名(沒有的就顯示英文原名)
ZH = {
    "Aira": "姶良(櫻島)", "Sakurajima": "櫻島", "Suwanosejima": "諏訪之瀨島", "Kirishimayama": "霧島山", "Asosan": "阿蘇山", "Kikai": "鬼界",
    "Etna": "埃特納火山", "Stromboli": "斯特隆波利火山", "Campi Flegrei": "坎皮佛萊格瑞", "Kilauea": "基拉韋厄火山", "Mauna Loa": "茂納羅亞火山",
    "Krakatau": "喀拉喀托火山", "Merapi": "默拉皮火山", "Semeru": "塞梅魯火山", "Dukono": "杜科諾火山", "Ibu": "伊布火山", "Lewotobi": "勒沃托比火山",
    "Marapi": "馬拉皮火山", "Ruang": "魯昂火山", "Karangetang": "卡蘭格坦火山", "Lokon-Empung": "洛孔火山",
    "Kanlaon": "坎拉翁火山", "Taal": "塔阿爾火山", "Mayon": "馬榮火山", "Bulusan": "布盧桑火山",
    "Popocatepetl": "波波卡特佩特火山", "Fuego": "富埃戈火山", "Santa Maria": "聖瑪利亞火山", "Pacaya": "帕卡亞火山",
    "Masaya": "馬薩亞火山", "Telica": "特利卡火山", "San Cristobal": "聖克里斯托瓦爾火山", "Poas": "波阿斯火山", "Rincon de la Vieja": "比耶哈火山",
    "Reventador": "雷文塔多火山", "Sangay": "桑蓋火山", "Cotopaxi": "科多帕希火山", "Sabancaya": "薩班卡亞火山", "Ubinas": "烏維納斯火山",
    "Nevado del Ruiz": "魯伊斯火山", "Purace": "普拉塞火山", "Sinabung": "錫納朋火山", "Lewotolok": "勒沃托洛克火山", "Krasheninnikov": "克拉舍寧尼科夫火山", "Villarrica": "維亞里卡火山", "Nevados de Chillan": "奇廉火山", "Lascar": "拉斯卡火山",
    "Sheveluch": "希韋盧奇火山", "Klyuchevskoy": "克留赤夫火山", "Bezymianny": "別茲米安納火山", "Karymsky": "卡雷姆火山", "Ebeko": "埃別科火山",
    "Great Sitkin": "大錫特金火山", "Shishaldin": "希沙爾丁火山", "Spurr": "斯珀火山", "Pavlof": "帕夫洛夫火山",
    "Nyiragongo": "尼拉貢戈火山", "Nyamulagira": "尼亞穆拉吉拉火山", "Erta Ale": "爾塔阿雷火山", "Piton de la Fournaise": "富爾奈斯火山",
    "Reykjanes": "雷克雅內斯火山", "Sundhnukur": "松德赫努克火山", "Fagradalsfjall": "法格拉達爾火山",
    "Yasur": "亞蘇爾火山", "Ambrym": "安布里姆火山", "Manam": "馬南火山", "Bagana": "巴加納火山", "Ulawun": "烏拉旺火山", "Langila": "蘭吉拉火山",
    "White Island": "懷特島", "Whakaari/White Island": "懷特島", "Home Reef": "霍姆礁", "Hunga Tonga-Hunga Ha'apai": "洪加東加火山",
}
COUNTRY = {
    "Indonesia": "印尼", "Japan": "日本", "United States": "美國", "Russia": "俄羅斯", "Chile": "智利", "Mexico": "墨西哥", "Guatemala": "瓜地馬拉",
    "Ecuador": "厄瓜多", "Peru": "秘魯", "Colombia": "哥倫比亞", "Philippines": "菲律賓", "Papua New Guinea": "巴布亞紐幾內亞", "Italy": "義大利",
    "Iceland": "冰島", "Nicaragua": "尼加拉瓜", "Costa Rica": "哥斯大黎加", "Vanuatu": "萬那杜", "New Zealand": "紐西蘭", "Ethiopia": "衣索比亞",
    "DR Congo": "剛果民主共和國", "France": "法國", "Tonga": "東加", "Argentina": "阿根廷", "Chile-Argentina": "智利/阿根廷", "El Salvador": "薩爾瓦多",
    "Solomon Islands": "索羅門群島", "Greece": "希臘", "Turkey": "土耳其", "Iran": "伊朗", "Taiwan": "台灣", "Montserrat": "蒙哲臘",
    "Saint Vincent and the Grenadines": "聖文森", "Cape Verde": "維德角", "Tanzania": "坦尚尼亞", "Eritrea": "厄利垂亞", "Yemen": "葉門",
}
STATUS = {
    "New Eruptive Activity": ("新噴發", "new"), "Continuing Eruptive Activity": ("持續噴發", "cont"),
    "New Unrest": ("新的異常", "unrest"), "Other Observations": ("其他觀測", "unrest"), "Continuing Unrest": ("持續異常", "unrest"), "New Activity/Unrest": ("新的活動", "unrest"),
}


def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main():
    req = urllib.request.Request(RSS, headers={"User-Agent": "earth-world data build (https://github.com/Benny-pig/-earth-world)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    root = ET.fromstring(raw)
    ch = root.find("channel")
    items, period = [], ""
    for it in ch.findall("item"):
        title = it.findtext("title") or ""
        m = re.match(r"(.+?) \((.+?)\) - Report for (.+?) - (.+)$", title)
        pt = it.find("georss:point", NS)
        if not m or pt is None or not (pt.text or "").strip():
            continue
        name, country, period, status = m.groups()
        lat, lon = map(float, pt.text.split())
        st_zh, st_k = STATUS.get(status.strip(), (status.strip(), "unrest"))
        text = clean(it.findtext("description"))
        items.append({
            "name": name, "zh": ZH.get(name, ""), "country": country, "countryZh": COUNTRY.get(country, country),
            "status": st_k, "statusZh": st_zh, "lat": round(lat, 3), "lon": round(lon, 3),
            "text": text[:420] + ("…" if len(text) > 420 else ""),
        })
    if len(items) < 3:
        print(f"只抓到 {len(items)} 座火山,資料可能異常,不更新")
        sys.exit(1)
    doc = {
        "built": date.today().isoformat(),
        "period": period,
        "note": "來源:Smithsonian Institution Global Volcanism Program / USGS Weekly Volcanic Activity Report(每週四更新,初步報告)。",
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"✓ {len(items)} 座火山({period})→ {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
