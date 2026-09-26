"""產生網站/App 圖示(assets/icons/):用網站自己的地球貼圖畫一顆正射投影的地球,
視角對著西太平洋、台灣用金色光點標出來。

用法:python tools/build-icons.py(需要 Pillow、numpy)
"""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
tex = np.asarray(Image.open(os.path.join(ROOT, "assets", "earth-color-4k.jpg")).convert("RGB")).astype(np.float32)
H, W, _ = tex.shape
LAT0, LON0 = math.radians(18), math.radians(125)   # 視角中心:西太平洋,看得到台灣


def render(size, maskable=False):
    S = size * 2
    pad = 0.2 if maskable else 0.08          # maskable 圖示外圈會被裁,地球要縮小一點
    R = S * (0.5 - pad); cx = cy = S / 2
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    x = (xs - cx) / R; y = (cy - ys) / R
    rho2 = x * x + y * y; inside = rho2 <= 1
    z = np.sqrt(np.clip(1 - rho2, 0, 1))
    lat = np.arcsin(np.clip(z * math.sin(LAT0) + y * math.cos(LAT0), -1, 1))   # 正射投影反算經緯度
    lon = LON0 + np.arctan2(x, z * math.cos(LAT0) - y * math.sin(LAT0))
    u = ((lon / (2 * math.pi) + 0.5) % 1.0) * (W - 1); v = (0.5 - lat / math.pi) * (H - 1)
    col = tex[v.astype(int).clip(0, H - 1), u.astype(int).clip(0, W - 1)]
    shade = np.clip(0.55 + 0.55 * (z * 0.8 + (-x * 0.25 + y * 0.25)), 0.25, 1.15)[..., None]   # 左上打光
    col = np.clip(col * shade * 1.05, 0, 255)
    img = np.zeros((S, S, 4), np.float32); img[..., :3] = [7, 11, 24]; img[..., 3] = 255
    img[inside, :3] = col[inside]
    out = Image.fromarray(img.astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(out)
    random.seed(3)
    for _ in range(40):
        px, py = random.randint(0, S), random.randint(0, S)
        if (px - cx) ** 2 + (py - cy) ** 2 < (R * 1.05) ** 2: continue
        r = random.choice([1, 1.5, 2]) * S / 512
        d.ellipse([px - r, py - r, px + r, py + r], fill=(255, 255, 255, random.randint(90, 200)))
    la, lo = math.radians(23.7), math.radians(121)   # 台灣
    tx = cx + R * math.cos(la) * math.sin(lo - LON0)
    ty = cy - R * (math.cos(LAT0) * math.sin(la) - math.sin(LAT0) * math.cos(la) * math.cos(lo - LON0))
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([tx - R * 0.13, ty - R * 0.13, tx + R * 0.13, ty + R * 0.13], fill=(255, 200, 80, 200))
    out = Image.alpha_composite(out, glow.filter(ImageFilter.GaussianBlur(R * 0.05)))
    ImageDraw.Draw(out).ellipse([tx - R * 0.035, ty - R * 0.035, tx + R * 0.035, ty + R * 0.035], fill=(255, 226, 140, 255))
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([cx - R * 1.02, cy - R * 1.02, cx + R * 1.02, cy + R * 1.02], outline=(120, 190, 255, 210), width=max(2, int(S / 110)))
    out = Image.alpha_composite(out, ring.filter(ImageFilter.GaussianBlur(S / 350)))
    return out.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    d = os.path.join(ROOT, "assets", "icons")
    os.makedirs(d, exist_ok=True)
    render(192).save(os.path.join(d, "icon-192.png"))
    render(512).save(os.path.join(d, "icon-512.png"))
    render(512, True).save(os.path.join(d, "maskable-512.png"))
    render(180).convert("RGB").save(os.path.join(d, "apple-touch-icon.png"))
    render(32).save(os.path.join(d, "favicon-32.png"))
    print("icons ->", d)
