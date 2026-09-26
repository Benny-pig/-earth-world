"""產生分享預覽圖 assets/og-image.jpg(1200×630)——在 LINE、Facebook 貼網址時顯示的那張大圖。

右邊用網站自己的地球貼圖畫一顆正射投影的地球(白天那半邊照亮、夜晚那半邊亮起城市燈光、
外圈淡藍色大氣層、台灣金色光點),左邊是標題與功能標籤。字型用 Noto Sans TC(開源授權)。

用法:python tools/build-og-image.py(需要 Pillow、numpy;Windows 內建的 Noto Sans TC,
或用 --font 指定其他繁中字型檔)
"""
import math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "og-image.jpg")
W, H = 1200, 630
SS = 2                                    # 先畫兩倍大再縮小,邊緣比較平滑
FONT = sys.argv[sys.argv.index("--font") + 1] if "--font" in sys.argv else "C:/Windows/Fonts/NotoSansTC-VF.ttf"
LAT0, LON0 = math.radians(22), math.radians(116)   # 視角中心:看得到台灣、東亞、東南亞
SUN = np.array([-0.78, 0.30, 0.55])                 # 太陽從左上前方照過來(右後方是夜晚)
SUN = SUN / np.linalg.norm(SUN)


def font(size, weight=700):
    f = ImageFont.truetype(FONT, size * SS)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f


def load(name):
    return np.asarray(Image.open(os.path.join(ROOT, "assets", name)).convert("RGB")).astype(np.float32)


def globe(R):
    day, night = load("earth-color-4k.jpg"), load("earth-night-4k.jpg")
    th, tw, _ = day.shape
    nh, nw, _ = night.shape
    S = int(R * 2.6)                       # 畫布比地球大,留空間給大氣光暈
    c = S / 2
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    x = (xs - c) / R; y = (c - ys) / R
    rho2 = x * x + y * y; inside = rho2 <= 1
    z = np.sqrt(np.clip(1 - rho2, 0, 1))
    lat = np.arcsin(np.clip(z * math.sin(LAT0) + y * math.cos(LAT0), -1, 1))
    lon = LON0 + np.arctan2(x, z * math.cos(LAT0) - y * math.sin(LAT0))
    u = ((lon / (2 * math.pi) + 0.5) % 1.0)
    v = (0.5 - lat / math.pi)
    dcol = day[(v * (th - 1)).astype(int).clip(0, th - 1), (u * (tw - 1)).astype(int).clip(0, tw - 1)]
    ncol = night[(v * (nh - 1)).astype(int).clip(0, nh - 1), (u * (nw - 1)).astype(int).clip(0, nw - 1)]
    lit = x * SUN[0] + y * SUN[1] + z * SUN[2]                 # 表面法向量 · 太陽方向
    dayk = np.clip((lit + 0.08) / 0.3, 0, 1)[..., None]         # 晨昏線附近柔和過渡
    shade = np.clip(0.35 + 0.85 * lit, 0.1, 1.1)[..., None]
    col = dcol * shade * dayk + ncol * 1.25 * (1 - dayk) + np.array([4, 8, 20]) * (1 - dayk)
    # 晨昏線上的一抹橘紅(日出日落)
    dusk = np.exp(-((lit - 0.0) / 0.09) ** 2)[..., None]
    col = col + dusk * np.array([70, 30, 6]) * 0.55
    # 邊緣加一點藍色大氣
    rim = (np.clip(rho2, 0, 1) ** 3)[..., None]
    col = col * (1 - rim * 0.45) + np.array([90, 160, 255]) * rim * 0.45 * np.clip(dayk + 0.25, 0, 1)
    img = np.zeros((S, S, 4), np.float32)
    img[inside, :3] = np.clip(col, 0, 255)[inside]
    img[inside, 3] = 255
    out = Image.fromarray(img.astype(np.uint8), "RGBA")
    # 大氣光暈:比地球大一點的藍色光圈,模糊後墊在底下
    halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([c - R * 1.06, c - R * 1.06, c + R * 1.06, c + R * 1.06], fill=(70, 150, 255, 150))
    halo = halo.filter(ImageFilter.GaussianBlur(R * 0.08))
    out = Image.alpha_composite(halo, out)
    # 台灣金色光點
    la, lo = math.radians(23.7), math.radians(121)
    tx = c + R * math.cos(la) * math.sin(lo - LON0)
    ty = c - R * (math.cos(LAT0) * math.sin(la) - math.sin(LAT0) * math.cos(la) * math.cos(lo - LON0))
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([tx - R * 0.09, ty - R * 0.09, tx + R * 0.09, ty + R * 0.09], fill=(255, 200, 80, 210))
    out = Image.alpha_composite(out, glow.filter(ImageFilter.GaussianBlur(R * 0.035)))
    ImageDraw.Draw(out).ellipse([tx - R * 0.022, ty - R * 0.022, tx + R * 0.022, ty + R * 0.022], fill=(255, 232, 160, 255))
    return out


def main():
    Wb, Hb = W * SS, H * SS
    # 背景:網站的銀河貼圖壓暗 + 深藍漸層
    bg = Image.open(os.path.join(ROOT, "assets", "milky-way-4k.jpg")).convert("RGB")
    bw, bh = bg.size
    crop_h = int(bw * Hb / Wb)
    bg = bg.crop((0, (bh - crop_h) // 2, bw, (bh - crop_h) // 2 + crop_h)).resize((Wb, Hb), Image.LANCZOS)
    arr = np.asarray(bg).astype(np.float32) * 0.55
    gx = np.linspace(1, 0.35, Wb)[None, :, None]                 # 左邊更暗,文字比較清楚
    arr = arr * (0.45 + 0.55 * (1 - gx)) + np.array([6, 10, 26]) * gx
    canvas = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    # 半透明的東西都畫在另一層再疊上去(直接畫在底圖上會把透明度蓋掉,顏色變得灰白)
    stars = Image.new("RGBA", (Wb, Hb), (0, 0, 0, 0))
    d = ImageDraw.Draw(stars)
    random.seed(7)
    for _ in range(140):
        px, py = random.randint(0, Wb), random.randint(0, Hb)
        r = random.choice([1, 1, 1.5, 2]) * SS
        d.ellipse([px - r, py - r, px + r, py + r], fill=(255, 255, 255, random.randint(60, 190)))
    canvas.alpha_composite(stars)

    R = int(282 * SS)
    g = globe(R)
    gx0 = int(Wb * 0.735 - g.width / 2); gy0 = int(Hb * 0.5 - g.height / 2)
    canvas.alpha_composite(g, (gx0, gy0))

    # 左邊文字
    d = ImageDraw.Draw(canvas)
    left = 72 * SS
    d.text((left, 150 * SS), "地球世界", font=font(104, 800), fill=(255, 255, 255, 255))
    d.text((left + 4 * SS, 292 * SS), "轉動 3D 地球，探索全世界", font=font(36, 500), fill=(214, 228, 255, 255))
    chips = [("即時航班", (255, 201, 77)), ("地震", (255, 110, 110)), ("各國電台", (120, 200, 255)),
             ("衛星與太空站", (140, 230, 170)), ("景點直播", (255, 120, 150)), ("地理猜謎", (200, 160, 255))]
    f = font(24, 600)
    layer = Image.new("RGBA", (Wb, Hb), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    x, yy = left, 370 * SS
    for text, colr in chips:
        tw = d.textlength(text, font=f)
        w = tw + 40 * SS
        if x + w > Wb * 0.53:
            x, yy = left, yy + 54 * SS
        ld.rounded_rectangle([x, yy, x + w, yy + 42 * SS], radius=21 * SS, fill=(12, 18, 40, 190), outline=colr + (220,), width=2 * SS)
        ld.ellipse([x + 14 * SS, yy + 17 * SS, x + 22 * SS, yy + 25 * SS], fill=colr + (255,))
        ld.text((x + 30 * SS, yy + 5 * SS), text, font=f, fill=(244, 247, 255, 255))
        x += w + 12 * SS
    canvas.alpha_composite(layer)
    d = ImageDraw.Draw(canvas)
    d.text((left, 540 * SS), "benny-pig.github.io/-earth-world", font=font(22, 500), fill=(150, 170, 210, 255))

    out = canvas.convert("RGB").resize((W, H), Image.LANCZOS)
    out.save(OUT, quality=88, optimize=True, progressive=True)
    print(f"-> {os.path.normpath(OUT)} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
