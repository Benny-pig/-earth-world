"""✨ 產生 data/constellations.json:88 星座的連線、名稱位置,以及肉眼可見的亮星(星等 ≤ 4.5)。

資料來源:d3-celestial(Olaf Frohn,BSD-3-Clause)的 constellations.lines.json、constellations.json、
stars.6.json(恆星位置、星等、色指數,源自 Hipparcos/HYG 星表)。中文星座名用台北市立天文館的正式譯名。

用法:python tools/build-constellations.py
"""
import json, os, urllib.request

BASE = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/"
CACHE = os.path.join(os.path.dirname(__file__), ".cache", "celestial")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "constellations.json")
MAX_MAG = 4.5

ZH = {
    "And": "仙女座", "Ant": "唧筒座", "Aps": "天燕座", "Aqr": "寶瓶座", "Aql": "天鷹座", "Ara": "天壇座", "Ari": "白羊座", "Aur": "御夫座",
    "Boo": "牧夫座", "Cae": "雕具座", "Cam": "鹿豹座", "Cnc": "巨蟹座", "CVn": "獵犬座", "CMa": "大犬座", "CMi": "小犬座", "Cap": "摩羯座",
    "Car": "船底座", "Cas": "仙后座", "Cen": "半人馬座", "Cep": "仙王座", "Cet": "鯨魚座", "Cha": "蝘蜓座", "Cir": "圓規座", "Col": "天鴿座",
    "Com": "后髮座", "CrA": "南冕座", "CrB": "北冕座", "Crv": "烏鴉座", "Crt": "巨爵座", "Cru": "南十字座", "Cyg": "天鵝座", "Del": "海豚座",
    "Dor": "劍魚座", "Dra": "天龍座", "Equ": "小馬座", "Eri": "波江座", "For": "天爐座", "Gem": "雙子座", "Gru": "天鶴座", "Her": "武仙座",
    "Hor": "時鐘座", "Hya": "長蛇座", "Hyi": "水蛇座", "Ind": "印第安座", "Lac": "蠍虎座", "Leo": "獅子座", "LMi": "小獅座", "Lep": "天兔座",
    "Lib": "天秤座", "Lup": "豺狼座", "Lyn": "天貓座", "Lyr": "天琴座", "Men": "山案座", "Mic": "顯微鏡座", "Mon": "麒麟座", "Mus": "蒼蠅座",
    "Nor": "矩尺座", "Oct": "南極座", "Oph": "蛇夫座", "Ori": "獵戶座", "Pav": "孔雀座", "Peg": "飛馬座", "Per": "英仙座", "Phe": "鳳凰座",
    "Pic": "繪架座", "Psc": "雙魚座", "PsA": "南魚座", "Pup": "船尾座", "Pyx": "羅盤座", "Ret": "網罟座", "Sge": "天箭座", "Sgr": "人馬座",
    "Sco": "天蠍座", "Scl": "玉夫座", "Sct": "盾牌座", "Ser": "巨蛇座", "Sex": "六分儀座", "Tau": "金牛座", "Tel": "望遠鏡座", "Tri": "三角座",
    "TrA": "南三角座", "Tuc": "杜鵑座", "UMa": "大熊座", "UMi": "小熊座", "Vel": "船帆座", "Vir": "室女座", "Vol": "飛魚座", "Vul": "狐狸座",
}
# 星座的俗稱(搜尋用):星座運勢常用的名字、北斗七星等
ALIAS = {
    "Ari": "牡羊座", "Aqr": "水瓶座", "Vir": "處女座", "Sgr": "射手座", "UMa": "北斗七星", "UMi": "北極星", "Cas": "W",
    "Ori": "腰帶 參宿", "Sco": "蠍子", "Tau": "昴宿星團 七姊妹", "And": "仙女座大星系 M31", "Cru": "南十字星",
}
# 特別好認/有故事的星座:點名稱會跳出這段說明
NOTE = {
    "Ori": "冬季夜空最醒目的星座,中間三顆排成一直線的「腰帶」很好認;左上角偏紅的參宿四是一顆紅超巨星。",
    "UMa": "北斗七星就在這裡,沿著斗口的兩顆星往外延伸約五倍距離,就能找到北極星。",
    "UMi": "北極星在小熊座的尾巴,幾乎不隨時間移動,是辨認北方的好幫手。",
    "Cas": "五顆亮星排成 W 形,和北斗七星分別在北極星的兩側。",
    "Sco": "夏季南方天空的大星座,紅色亮星心宿二是蠍子的心臟。",
    "Sgr": "銀河中心就在人馬座的方向,其中「南斗六星」的形狀像一把小勺子。",
    "Cyg": "沿著銀河展翅的十字形星座,尾巴的天津四是「夏季大三角」之一。",
    "Lyr": "主星織女星是「夏季大三角」裡最亮的一顆,也是七夕故事裡的織女。",
    "Aql": "主星牛郎星(河鼓二)和織女星隔著銀河遙遙相望。",
    "CMa": "天狼星是全天最亮的恆星,和參宿四、南河三組成「冬季大三角」。",
    "Tau": "偏紅的畢宿五是牛眼;附近的昴宿星團(七姊妹)肉眼就看得到一小團星。",
    "Gem": "北河二、北河三兩顆亮星代表一對雙胞胎;每年 12 月有雙子座流星雨。",
    "Leo": "春季的代表星座,獅子頭像一個反寫的問號;每年 11 月有獅子座流星雨。",
    "Cru": "全天最小的星座,南半球用它找南方;台灣南部春天夜晚可在南方地平線附近看到。",
    "Per": "每年 8 月英仙座流星雨的輻射點就在這裡。",
    "And": "仙女座大星系(M31)在這個方向,是肉眼看得到最遠的天體,距離約 250 萬光年。",
    "Peg": "四顆星組成的「秋季四邊形」,是秋天找星座的起點。",
    "Cen": "南門二是離太陽最近的恆星系統,距離約 4.4 光年。",
    "Boo": "橘色的大角星是春夏夜空最亮的恆星之一。",
    "Vir": "角宿一是室女座最亮的星;這個方向有大量星系聚集,稱為室女座星系團。",
}
# 亮星的中文名(依依巴谷 HIP 編號)
STAR_ZH = {
    32349: "天狼星", 30438: "老人星", 71683: "南門二", 69673: "大角星", 91262: "織女星", 24608: "五車二", 24436: "參宿七",
    37279: "南河三", 7588: "水委一", 27989: "參宿四", 68702: "馬腹一", 97649: "牛郎星", 60718: "十字架二", 21421: "畢宿五",
    80763: "心宿二", 65474: "角宿一", 37826: "北河三", 113368: "北落師門", 102098: "天津四", 49669: "軒轅十四", 36850: "北河二",
    11767: "北極星",
}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(BASE + name, headers={"User-Agent": "earth-world build (https://github.com/Benny-pig/-earth-world)"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    lines = fetch("constellations.lines.json")
    names = fetch("constellations.json")
    stars = fetch("stars.6.json")
    info = {f["id"]: f for f in names["features"]}

    r2 = lambda v: round(v, 2)
    cons = []
    for f in lines["features"]:
        cid = f["id"]
        p = info.get(cid, {}).get("properties", {})
        disp = p.get("display") or info.get(cid, {}).get("geometry", {}).get("coordinates") or [0, 0]
        cons.append({
            "id": cid,
            "zh": ZH.get(cid, p.get("zh", cid)),
            "en": p.get("name", cid),
            "alias": ALIAS.get(cid, ""),
            "note": NOTE.get(cid, ""),
            "at": [r2(disp[0]), r2(disp[1])],
            "lines": [[[r2(x), r2(y)] for x, y in seg] for seg in f["geometry"]["coordinates"]],
        })
    out_stars = []
    for s in stars["features"]:
        mag = s["properties"]["mag"]
        if mag > MAX_MAG:
            continue
        try:
            bv = float(s["properties"].get("bv") or 0.6)
        except ValueError:
            bv = 0.6
        ra, dec = s["geometry"]["coordinates"]
        row = [r2(ra), r2(dec), round(mag, 1), round(bv, 2)]
        if s["id"] in STAR_ZH:
            row.append(STAR_ZH[s["id"]])
        out_stars.append(row)
    out_stars.sort(key=lambda x: x[2])
    doc = {
        "note": "星座連線、名稱位置與恆星資料整理自 d3-celestial(Olaf Frohn,BSD-3-Clause;恆星源自 Hipparcos/HYG 星表)。"
                "座標為赤經(度,-180~180)、赤緯(度);stars 每筆為 [赤經, 赤緯, 星等, 色指數 B-V, 中文名(選填)]。",
        "cons": cons,
        "stars": out_stars,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✓ {len(cons)} 個星座、{len(out_stars)} 顆亮星 → {os.path.relpath(OUT)}({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
