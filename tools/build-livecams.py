"""Build data/livecams.json — 📺 世界即時景點直播地圖的直播清單。

YouTube 上 24 小時直播的景點攝影機,影片 ID 常常因為重開直播而改變,寫死很快就失效。
所以這裡只維護「景點清單 + 搜尋關鍵字」,每次執行時到 YouTube 搜尋「正在直播」的影片,
挑標題/頻道名稱含有指定關鍵字的第一個,再用 oEmbed 確認允許嵌入別的網站播放。
每週自動更新(.github/workflows/update-data.yml)會重跑,找不到的景點那週就先不顯示。

用法:python tools/build-livecams.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "livecams.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
LIVE_FILTER = "EgJAAQ%253D%253D"   # YouTube 搜尋的「直播中」篩選

# (id, 中文名稱, 圖示, 緯度, 經度, 國碼, 時區, 搜尋字串, 必須出現的關鍵字(任一,不分大小寫))
PLACES = [
    # 台灣與東亞
    ("taipei", "台北市景・台北 101", "🏙️", 25.0340, 121.5645, "TW", "Asia/Taipei", "台北 101 即時影像 live", ["台北", "臺北", "taipei", "101"]),
    ("sunmoonlake", "日月潭", "🏞️", 23.8570, 120.9150, "TW", "Asia/Taipei", "日月潭 即時影像 live", ["日月潭", "sun moon lake"]),
    ("kenting", "墾丁海灘", "🏖️", 21.9480, 120.7797, "TW", "Asia/Taipei", "墾丁 即時影像 live", ["墾丁", "kenting"]),
    ("shibuya", "東京 澀谷十字路口", "🚦", 35.6595, 139.7005, "JP", "Asia/Tokyo", "Shibuya Scramble Crossing live camera", ["shibuya", "渋谷"]),
    ("fuji", "富士山", "🗻", 35.3606, 138.7274, "JP", "Asia/Tokyo", "Mount Fuji live camera 富士山 ライブ", ["fuji", "富士"]),
    ("dotonbori", "大阪 道頓堀", "🦀", 34.6687, 135.5013, "JP", "Asia/Tokyo", "Dotonbori live camera 道頓堀", ["dotonbori", "道頓堀", "道頓堀"]),
    ("sapporo", "北海道 札幌", "❄️", 43.0618, 141.3545, "JP", "Asia/Tokyo", "Sapporo live camera 札幌 ライブカメラ", ["sapporo", "札幌"]),
    ("seoul", "首爾", "🏯", 37.5665, 126.9780, "KR", "Asia/Seoul", "Seoul live cam", ["seoul", "서울"]),
    ("hongkong", "香港 維多利亞港", "🌃", 22.2930, 114.1694, "HK", "Asia/Hong_Kong", "Hong Kong Victoria Harbour live", ["hong kong", "香港", "victoria harbour"]),
    ("singapore", "新加坡", "🦁", 1.2966, 103.8520, "SG", "Asia/Singapore", "Singapore live cam", ["singapore"]),
    ("bangkok", "曼谷", "🛺", 13.7563, 100.5018, "TH", "Asia/Bangkok", "Bangkok live cam", ["bangkok"]),
    ("bali", "峇里島", "🌺", -8.7180, 115.1686, "ID", "Asia/Makassar", "Bali live cam beach", ["bali"]),
    ("everest", "聖母峰", "🏔️", 27.9881, 86.9250, "NP", "Asia/Kathmandu", "Everest live cam", ["everest"]),
    # 中東
    ("dubai", "杜拜 哈里發塔", "🏜️", 25.1972, 55.2744, "AE", "Asia/Dubai", "Dubai live cam Burj Khalifa", ["dubai"]),
    ("makkah", "麥加 禁寺", "🕋", 21.4225, 39.8262, "SA", "Asia/Riyadh", "Makkah live", ["makkah", "mecca", "مكة", "kaaba"]),
    ("jerusalem", "耶路撒冷 西牆", "🕍", 31.7767, 35.2345, "IL", "Asia/Jerusalem", "Western Wall live camera Jerusalem", ["western wall", "kotel", "jerusalem"]),
    ("istanbul", "伊斯坦堡", "🕌", 41.0082, 28.9784, "TR", "Europe/Istanbul", "Istanbul live cam", ["istanbul", "i̇stanbul"]),
    # 歐洲
    ("abbeyroad", "倫敦 艾比路斑馬線", "🎸", 51.5320, -0.1779, "GB", "Europe/London", "Abbey Road crossing live cam", ["abbey road"]),
    ("london", "倫敦", "💂", 51.5007, -0.1246, "GB", "Europe/London", "London live cam", ["london"]),
    ("paris", "巴黎", "🗼", 48.8566, 2.3522, "FR", "Europe/Paris", "Paris live webcam 24/7", ["paris", "eiffel"]),
    ("venice", "威尼斯 大運河", "🛶", 45.4380, 12.3358, "IT", "Europe/Rome", "Venice live cam Grand Canal", ["venice", "venezia"]),
    ("rome", "羅馬", "🏛️", 41.9028, 12.4964, "IT", "Europe/Rome", "Rome live cam", ["rome", "roma"]),
    ("amsterdam", "阿姆斯特丹", "🚲", 52.3731, 4.8926, "NL", "Europe/Amsterdam", "Amsterdam live cam", ["amsterdam"]),
    ("prague", "布拉格", "🏰", 50.0870, 14.4208, "CZ", "Europe/Prague", "Prague live cam", ["prague", "praha"]),
    ("zermatt", "瑞士 馬特洪峰", "⛰️", 45.9763, 7.6586, "CH", "Europe/Zurich", "Zermatt Matterhorn live cam", ["matterhorn", "zermatt"]),
    ("jungfrau", "瑞士 少女峰", "🏔️", 46.5475, 7.9853, "CH", "Europe/Zurich", "Jungfraujoch Grindelwald live webcam", ["jungfrau", "grindelwald", "interlaken", "lauterbrunnen"]),
    ("santorini", "聖托里尼", "🏝️", 36.4618, 25.3753, "GR", "Europe/Athens", "Santorini live cam", ["santorini"]),
    ("barcelona", "巴塞隆納", "⚽", 41.3851, 2.1734, "ES", "Europe/Madrid", "Barcelona Spain live webcam", ["barcelona"]),
    ("iceland", "冰島 火山", "🌋", 63.8800, -22.2700, "IS", "Atlantic/Reykjavik", "Iceland volcano live", ["iceland", "reykjanes", "grindav", "ísland"]),
    ("aurora", "阿拉斯加 北極光", "🌌", 64.8378, -147.7164, "US", "America/Anchorage", "Fairbanks aurora camera live", ["aurora", "northern lights"]),
    # 美洲
    ("timessquare", "紐約 時代廣場", "🗽", 40.7580, -73.9855, "US", "America/New_York", "Times Square live cam", ["times square"]),
    ("banff", "加拿大 班夫國家公園", "🦌", 51.1784, -115.5708, "CA", "America/Edmonton", "Banff live cam", ["banff", "lake louise"]),
    ("niagara", "尼加拉瀑布", "💦", 43.0799, -79.0747, "CA", "America/Toronto", "Niagara Falls live cam", ["niagara"]),
    ("sanfrancisco", "舊金山灣區", "🌉", 37.8080, -122.4177, "US", "America/Los_Angeles", "San Francisco Golden Gate Bridge live cam", ["golden gate", "san francisco"]),
    ("lasvegas", "拉斯維加斯", "🎰", 36.1147, -115.1728, "US", "America/Los_Angeles", "Las Vegas Strip live cam", ["las vegas", "vegas"]),
    ("yellowstone", "黃石公園 老忠實泉", "♨️", 44.4605, -110.8281, "US", "America/Denver", "Old Faithful live cam Yellowstone", ["old faithful"]),
    ("kilauea", "夏威夷 基拉韋亞火山", "🌋", 19.4069, -155.2834, "US", "Pacific/Honolulu", "Kilauea volcano live", ["kilauea", "kīlauea", "hawaii"]),
    ("waikiki", "夏威夷 威基基海灘", "🏄", 21.2766, -157.8278, "US", "Pacific/Honolulu", "Waikiki live cam", ["waikiki", "honolulu"]),
    ("katmai", "阿拉斯加 棕熊抓鮭魚", "🐻", 58.5549, -155.7780, "US", "America/Anchorage", "Katmai brown bear cam live", ["katmai", "brooks", "bear"]),
    ("rio", "里約熱內盧", "🏖️", -22.9519, -43.2105, "BR", "America/Sao_Paulo", "Rio de Janeiro live cam Copacabana", ["rio", "copacabana"]),
    # 非洲
    ("namib", "納米比亞 沙漠水坑", "🦓", -26.6333, 15.9167, "NA", "Africa/Windhoek", "Namibia desert waterhole live", ["namib"]),
    ("africam", "南非 野生動物", "🦁", -24.0000, 31.5000, "ZA", "Africa/Johannesburg", "Africam live safari", ["africam", "kruger", "safari", "tembe", "wildlife"]),
    ("kenya", "肯亞 動物水源", "🐘", 0.2930, 36.8990, "KE", "Africa/Nairobi", "Kenya wildlife live cam Mpala", ["kenya", "mpala"]),
    ("giza", "埃及 吉薩金字塔", "🐫", 29.9792, 31.1342, "EG", "Africa/Cairo", "Giza pyramids live cam", ["giza", "pyramid"]),
    # 大洋洲
    ("sydney", "雪梨港 歌劇院", "🦘", -33.8568, 151.2153, "AU", "Australia/Sydney", "Sydney Harbour live cam", ["sydney"]),
    ("newzealand", "紐西蘭", "🥝", -41.2865, 174.7762, "NZ", "Pacific/Auckland", "New Zealand live cam", ["new zealand", "queenstown", "wellington", "auckland"]),
    # 南極
    ("antarctica", "南極洲", "🐧", -77.8460, 166.6760, "AQ", "Antarctica/McMurdo", "Antarctica live cam", ["antarctic", "南極"]),
]


# 標題有這些字的比較像真的攝影機(優先挑);有排除字的不要(假直播、重播影片配音樂、遊戲畫面)
CAM_WORDS = ["cam", "camera", "webcam", "ライブカメラ", "即時影像", "라이브", "실시간", "live stream", "livestream", "24/7", "بث مباشر"]
EXCLUDE = ["snowstorm", "blizzard", "gta", "minecraft", "simulator", "asmr", "deep house", "lofi", "lo-fi", "breathtaking", "drone", "meditation music", "sleep music"]
EXCLUDE_AT = {"barcelona": ["westfield", ", ny", "new york"]}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def live_results(query):
    html = fetch(f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}&sp={LIVE_FILTER}")
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S)
    if not m: return []
    out = []

    def walk(o):
        if isinstance(o, dict):
            v = o.get("videoRenderer")
            if v and v.get("videoId"):
                title = "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
                ch = "".join(r.get("text", "") for r in v.get("ownerText", {}).get("runs", []))
                live = "LIVE" in json.dumps(v.get("badges", [])) or "BADGE_STYLE_TYPE_LIVE_NOW" in json.dumps(v)
                if live: out.append((v["videoId"], title, ch))
            for x in o.values(): walk(x)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk(json.loads(m.group(1)))
    return out


def embeddable(vid):
    # 不允許嵌入的影片 oEmbed 會回 401
    try:
        fetch(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json")
        return True
    except Exception:
        return False


def main():
    cams, missing, used = [], [], set()
    for pid, zh, ico, lat, lon, cc, tz, query, kws in PLACES:
        pick = None
        try:
            results = live_results(query)[:12]
            ok = []
            for vid, title, ch in results:
                if vid in used: continue          # 同一支直播不要重複出現在兩個景點
                text = f"{title} {ch}".lower()
                if not any(k.lower() in text for k in kws): continue
                if any(x in text for x in EXCLUDE + EXCLUDE_AT.get(pid, [])): continue
                ok.append((vid, title, ch, any(w in text for w in CAM_WORDS)))
            ok.sort(key=lambda r: not r[3])   # 像攝影機的排前面(sort 穩定,同組維持 YouTube 的排序)
            for vid, title, ch, _ in ok:
                if embeddable(vid):
                    pick = (vid, title, ch); break
        except Exception as e:
            print(f"  {zh}: 搜尋失敗 {e}")
        if pick:
            used.add(pick[0])
            cams.append({"id": pid, "zh": zh, "ico": ico, "lat": lat, "lon": lon, "cc": cc, "tz": tz,
                         "v": pick[0], "t": pick[1][:90], "ch": pick[2][:40]})
            print(f"✓ {zh}: {pick[1][:60]} ({pick[2]})")
        else:
            missing.append(zh)
            print(f"✗ {zh}: 目前找不到可嵌入的直播")
        time.sleep(1.2)
    if len(cams) < 15:   # 防呆:可能被 YouTube 擋了,不覆蓋舊資料
        sys.exit(f"只找到 {len(cams)} 個直播,可能被擋或格式改了,不更新")
    doc = {"built": date.today().isoformat(), "source": "YouTube 公開直播(各頻道)", "cams": cams}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(cams)}/{len(PLACES)} 個景點有直播;找不到:{missing}")


if __name__ == "__main__":
    main()
