"""Build data/quiz.json — 🎯 地理猜謎遊戲的題庫索引。

從各國大百科(data/deep/*.json)挑出有照片的美食、景點,加上首都(countries.content.json),
整理成一個小檔案;遊戲只下載這份索引,不用把 180 份大百科都載入。只收照片檔真的存在的。

用法:python tools/build-quiz.py
"""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def main():
    content = json.load(open(os.path.join(ROOT, "data", "countries.content.json"), encoding="utf-8"))
    deep_dir = os.path.join(ROOT, "data", "deep")
    out = {}
    for fn in sorted(os.listdir(deep_dir)):
        if not fn.endswith(".json"): continue
        code_file = fn[:-5]
        d = json.load(open(os.path.join(deep_dir, fn), encoding="utf-8"))
        code = d.get("code") or code_file
        entry = {}
        c = content.get(code) or {}
        if c.get("capital_zh"):
            entry["cap"] = c["capital_zh"].split("(")[0]
        for key, short in (("foods", "food"), ("landmarks", "land")):
            items = []
            for it in d.get(key) or []:
                img = it.get("image")
                if img and os.path.exists(os.path.join(ROOT, "assets", "deep", code_file, img)):
                    items.append([it.get("zh") or it.get("en") or "", f"{code_file}/{img}"])
            if items: entry[short] = items
        if entry: out[code] = entry
    dest = os.path.join(ROOT, "data", "quiz.json")
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    n_food = sum(len(v.get("food", [])) for v in out.values()); n_land = sum(len(v.get("land", [])) for v in out.values())
    print(f"{len(out)} 國 · 首都 {sum(1 for v in out.values() if 'cap' in v)} · 美食照片 {n_food} · 景點照片 {n_land} · {os.path.getsize(dest):,} bytes")


if __name__ == "__main__":
    main()
