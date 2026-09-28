"""🌬️ 產生全球風場資料(離地 10 公尺的風):NOAA GFS 全球預報模式,1° 網格。

資料:NOAA NOMADS 的 GRIB 篩選服務(公有領域),只抓 10 公尺高的 U(東西向)、V(南北向)風速。
GRIB2 是氣象界的二進位格式,這裡自己寫了一個小解碼器(只支援 GFS 用的「complex packing +
spatial differencing」,Data Representation Template 5.3),不用裝任何套件,GitHub Actions 直接跑。

輸出:wind.json(約 180KB)——U、V 各 360×181 個值,每個值用 1 byte(0.5 m/s 一格)再 base64。
  GitHub Actions 每 6 小時跑一次(.github/workflows/update-wind.yml),推到 wind-data 分支(只留最新一份,
  不在主分支累積歷史);網頁從 raw.githubusercontent.com 讀,讀不到才用主分支的 data/wind.json(舊的備份)。

用法:python tools/build-wind.py [輸出路徑,預設 data/wind.json] [--file 已下載的.grb2]
"""
import base64, json, math, os, struct, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FILTER = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?dir=%2Fgfs.{ymd}%2F{hh}%2Fatmos"
          "&file=gfs.t{hh}z.pgrb2.1p00.f{fh:03d}&var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on")
UA = {"User-Agent": "earth-world wind (https://github.com/Benny-pig/-earth-world)"}
STEP = 0.5   # 每一格 0.5 m/s


# ---------------- GRIB2 解碼(只做 GFS 需要的部分) ----------------
class Bits:
    def __init__(self, data, pos=0):
        self.d, self.p = data, pos * 8

    def read(self, n):
        if n == 0:
            return 0
        v = 0
        for _ in range(n):
            byte = self.d[self.p >> 3]
            v = (v << 1) | ((byte >> (7 - (self.p & 7))) & 1)
            self.p += 1
        return v

    def align(self):
        self.p = (self.p + 7) & ~7


def sm16(b):   # 16-bit sign-magnitude
    v = struct.unpack(">H", b)[0]
    return -(v & 0x7FFF) if v & 0x8000 else v


def sm_n(b):   # n-byte sign-magnitude
    v = int.from_bytes(b, "big")
    top = 1 << (len(b) * 8 - 1)
    return -(v & (top - 1)) if v & top else v


def decode_53(s5, s7, n):
    """Data Representation Template 5.3:complex packing + spatial differencing。回傳 n 個浮點數。"""
    R = struct.unpack(">f", s5[11:15])[0]
    E = sm16(s5[15:17])
    D = sm16(s5[17:19])
    nbits = s5[19]
    ng = struct.unpack(">I", s5[31:35])[0]
    ref_w = s5[35]
    bits_w = s5[36]
    ref_l = struct.unpack(">I", s5[37:41])[0]
    inc_l = s5[41]
    last_l = struct.unpack(">I", s5[42:46])[0]
    bits_l = s5[46]
    order = s5[47]
    nextra = s5[48]
    miss_mgmt = s5[22]
    if miss_mgmt != 0:
        raise ValueError("不支援有缺值的 GRIB 欄位")
    d = s7[5:]
    pos = 0
    h = []
    for _ in range(order):
        h.append(sm_n(d[pos:pos + nextra])); pos += nextra
    gmin = sm_n(d[pos:pos + nextra]); pos += nextra
    br = Bits(d, pos)
    refs = [br.read(nbits) for _ in range(ng)]; br.align()
    widths = [ref_w + br.read(bits_w) for _ in range(ng)]; br.align()
    lens = [ref_l + br.read(bits_l) * inc_l for _ in range(ng)]; br.align()
    lens[-1] = last_l
    vals = []
    for g in range(ng):
        w, r = widths[g], refs[g]
        if w == 0:
            vals.extend([r] * lens[g])
        else:
            for _ in range(lens[g]):
                vals.append(r + br.read(w))
    if len(vals) != n:
        raise ValueError(f"解碼出 {len(vals)} 個值,應該是 {n}")
    # 還原空間差分
    for i in range(order, n):
        vals[i] += gmin
    if order == 1:
        vals[0] = h[0]
        for i in range(1, n):
            vals[i] += vals[i - 1]
    elif order == 2:
        vals[0], vals[1] = h[0], h[1]
        for i in range(2, n):
            vals[i] += 2 * vals[i - 1] - vals[i - 2]
    s = 2.0 ** E
    k = 10.0 ** D
    return [(R + v * s) / k for v in vals]


def parse_grib(buf):
    """回傳 {"UGRD": (grid, values), "VGRD": ...} 與參考時間、預報時數。"""
    out, meta, i = {}, {}, 0
    while True:
        j = buf.find(b"GRIB", i)
        if j < 0:
            break
        total = struct.unpack(">Q", buf[j + 8:j + 16])[0]
        msg = buf[j:j + total]
        k = 16
        grid = s5 = name = None
        while k < total - 4:
            L = struct.unpack(">I", msg[k:k + 4])[0]
            sec = msg[k + 4]
            body = msg[k:k + L]
            if sec == 1:
                y = struct.unpack(">H", body[12:14])[0]
                meta["ref"] = datetime(y, body[14], body[15], body[16], tzinfo=timezone.utc)
            elif sec == 3:
                if struct.unpack(">H", body[12:14])[0] != 0:
                    raise ValueError("只支援經緯度網格(Grid Template 3.0)")
                ni, nj = struct.unpack(">II", body[30:38])
                la1, lo1 = sm_n(body[46:50]) / 1e6, sm_n(body[50:54]) / 1e6
                la2, lo2 = sm_n(body[55:59]) / 1e6, sm_n(body[59:63]) / 1e6
                grid = {"ni": ni, "nj": nj, "la1": la1, "lo1": lo1, "la2": la2, "lo2": lo2, "scan": body[71]}
            elif sec == 4:
                cat, num = body[9], body[10]
                name = {(2, 2): "UGRD", (2, 3): "VGRD"}.get((cat, num))
                meta["fh"] = struct.unpack(">I", body[18:22])[0]
            elif sec == 5:
                if struct.unpack(">H", body[9:11])[0] != 3:
                    raise ValueError("只支援 Data Representation Template 5.3")
                s5 = body
            elif sec == 6 and body[5] != 255:
                raise ValueError("不支援有 bitmap 的欄位")
            elif sec == 7 and name:
                n = grid["ni"] * grid["nj"]
                out[name] = (grid, decode_53(s5, body, n))
            k += L
        i = j + total
    return out, meta


# ---------------- 下載最新一輪預報 ----------------
def fetch_latest(now):
    """GFS 每 6 小時一輪(00/06/12/18Z),大約 4 小時後才抓得到;挑最近一輪、預報時間最接近現在的那一格。"""
    base = now.replace(minute=0, second=0, microsecond=0, hour=now.hour - now.hour % 6)
    for back in range(0, 5):
        run = base - timedelta(hours=6 * back)
        fh = int(round((now - run).total_seconds() / 3600 / 3)) * 3
        fh = max(0, min(fh, 24))
        url = FILTER.format(ymd=run.strftime("%Y%m%d"), hh=run.strftime("%H"), fh=fh)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                data = r.read()
            if data[:4] == b"GRIB":
                print(f"GFS {run:%Y-%m-%d %H}Z +{fh}h")
                return data
        except Exception as e:
            print(f"  {run:%Y-%m-%d %H}Z +{fh}h 還沒有:{e}")
        time.sleep(2)
    raise SystemExit("抓不到最近幾輪的 GFS 資料")


def pack(vals):
    b = bytearray(len(vals))
    for i, v in enumerate(vals):
        q = int(round(v / STEP))
        b[i] = max(-127, min(127, q)) & 0xFF
    return base64.b64encode(bytes(b)).decode("ascii")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_path = args[0] if args else os.path.join(ROOT, "data", "wind.json")
    if "--file" in sys.argv:
        buf = open(sys.argv[sys.argv.index("--file") + 1], "rb").read()
    else:
        buf = fetch_latest(datetime.now(timezone.utc))
    fields, meta = parse_grib(buf)
    if "UGRD" not in fields or "VGRD" not in fields:
        raise SystemExit("GRIB 裡沒有 U/V 風")
    grid, u = fields["UGRD"]
    _, v = fields["VGRD"]
    if grid["scan"] != 0:
        raise SystemExit(f"不支援的掃描方式 {grid['scan']}")
    speeds = [math.hypot(a, b) for a, b in zip(u, v)]
    valid = meta["ref"] + timedelta(hours=meta.get("fh", 0))
    doc = {
        "source": "NOAA GFS 0-hour/short-range forecast, 10 m wind (public domain), via NOMADS",
        "run": meta["ref"].strftime("%Y-%m-%dT%H:%MZ"),
        "valid": valid.strftime("%Y-%m-%dT%H:%MZ"),
        "nx": grid["ni"], "ny": grid["nj"],
        "lat0": grid["la1"], "lon0": grid["lo1"],
        "dlat": (grid["la2"] - grid["la1"]) / (grid["nj"] - 1),
        "dlon": ((grid["lo2"] - grid["lo1"]) % 360) / (grid["ni"] - 1),
        "step": STEP,
        "max": round(max(speeds), 1),
        "u": pack(u), "v": pack(v),
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    json.dump(doc, open(out_path, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"寫入 {out_path}:{grid['ni']}×{grid['nj']},有效時間 {doc['valid']},最大風速 {doc['max']} m/s,"
          f"{os.path.getsize(out_path) // 1024} KB")


if __name__ == "__main__":
    main()
