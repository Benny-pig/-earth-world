"""產生手機用的小尺寸貼圖 assets/lite/(網站在手機、平板、省流量模式時改用這一套)。

手機螢幕本來就小,4K 貼圖跟 2K 看起來幾乎一樣,但下載量差好幾倍;第一次打開網站時
要等全部貼圖下載完才能看到地球,用小一號的能明顯縮短等待。原圖更新後重跑這支就好。

用法:python tools/build-textures-lite.py(需要 Pillow)
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "assets")
OUT = os.path.join(SRC, "lite")
Image.MAX_IMAGE_PIXELS = None

# (原圖, 輸出檔名, 寬度, JPEG 品質)
JOBS = [
    ("earth-color-4k.jpg", "earth-color-2k.jpg", 2048, 85),
    ("earth-night-4k.jpg", "earth-night-2k.jpg", 2048, 85),
    ("earth-normal.jpg", "earth-normal-1k.jpg", 1024, 88),
    ("earth-clouds-2k.jpg", "earth-clouds-1k.jpg", 1024, 85),
    ("milky-way-4k.jpg", "milky-way-2k.jpg", 2048, 80),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for src, dst, w, q in JOBS:
        im = Image.open(os.path.join(SRC, src))
        mode = "L" if im.mode == "L" else "RGB"
        im = im.convert(mode)
        h = round(im.height * w / im.width)
        out = os.path.join(OUT, dst)
        im.resize((w, h), Image.LANCZOS).save(out, quality=q, optimize=True, progressive=True)
        print(f"{src} {os.path.getsize(os.path.join(SRC, src)) // 1024}KB -> lite/{dst} {w}x{h} {os.path.getsize(out) // 1024}KB")


if __name__ == "__main__":
    main()
