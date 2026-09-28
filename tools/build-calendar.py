"""📅 產生 data/calendar.json:「今天是哪國的節日」(今日地球用)。

從國家大百科(data/deep/*.json)的 festivals 裡,挑出有「固定日期」的(例如「6月17日」「10月10日」),
依日期整理成 {"MM-DD": [[國碼, 節日名稱, 說明], …]}。只有月份或日期會變動的(例如「1-2月」「農曆正月初一」)不列入。
大百科內容更新後重跑一次就好。

用法:python tools/build-calendar.py
"""
import glob, json, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "calendar.json")
DATE = re.compile(r"^\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*$")


def main():
    cal = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "deep", "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        code = d.get("code") or os.path.splitext(os.path.basename(path))[0]
        for f in d.get("festivals") or []:
            m = DATE.match(str(f.get("month") or ""))
            if not m:
                continue
            mo, day = int(m.group(1)), int(m.group(2))
            if not (1 <= mo <= 12 and 1 <= day <= 31):
                continue
            cal.setdefault(f"{mo:02d}-{day:02d}", []).append([code, f.get("zh", ""), f.get("note", "")])
    json.dump(dict(sorted(cal.items())), open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n = sum(len(v) for v in cal.values())
    print(f"寫入 {os.path.normpath(OUT)}:{len(cal)} 天、{n} 個節日,{os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
