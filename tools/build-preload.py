"""🚀 更新 index.html 裡的「程式預先下載清單」和「程式版本號」。

為什麼需要:網站的程式分成八十幾個小檔(ES modules),瀏覽器原本要先下載 main.js、看到裡面 import 了誰
才去抓下一層,一層一層往下,光是等檔案就要好幾秒。這支工具從 src/main.js 開始把所有用到的檔案找出來,
在 <head> 裡列成 <link rel="modulepreload">,瀏覽器一打開網頁就能同時全部下載。

另外算出所有程式檔內容的指紋當「程式版本號」(<meta name="app-version">):Service Worker(sw.js)
用它當快取的名字——版本沒變,第二次打開網站時程式直接從快取拿,不用一個一個跟伺服器確認;
程式一有改動版本號就跟著變,讀者馬上拿到新版,不會新舊檔混在一起。

改了 src/ 底下的程式都要重跑一次(本機的 git pre-commit hook 會自動跑;每日健康檢查也會核對)。

用法:python tools/build-preload.py          更新 index.html
      python tools/build-preload.py --check  只檢查是不是最新(不是就以錯誤結束)
"""
import hashlib, json, os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
INDEX = os.path.join(ROOT, "index.html")
START = "<!-- modulepreload:start"
END = "<!-- modulepreload:end -->"
IMPORT_RE = re.compile(r"""(?:^|[;\s])(?:import|export)\s+(?:[^;'"]*?\sfrom\s*)?["']([^"']+)["']""", re.S)


def importmap(html):
    m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    return json.loads(m.group(1))["imports"] if m else {}


def resolve_bare(spec, imports):
    if spec in imports:
        return imports[spec]
    for k, v in imports.items():
        if k.endswith("/") and spec.startswith(k):
            return v + spec[len(k):]
    return None


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", src)


def graph(imports):
    local, remote, seen = [], [], set()
    stack = ["src/main.js"]
    while stack:
        rel = stack.pop()
        if rel in seen:
            continue
        seen.add(rel)
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            continue
        local.append(rel)
        src = strip_comments(open(path, encoding="utf-8").read())
        for spec in IMPORT_RE.findall(src):
            if spec.startswith("."):
                nxt = os.path.normpath(os.path.join(os.path.dirname(rel), spec)).replace("\\", "/")
                stack.append(nxt)
            else:
                url = resolve_bare(spec, imports)
                if url and url not in remote:
                    remote.append(url)
    return sorted(local, key=lambda p: (p != "src/main.js", p)), sorted(remote)


def build(html):
    local, remote = graph(importmap(html))
    h = hashlib.sha1()
    for rel in sorted(local):
        h.update(rel.encode())
        # 換行一律當成 LF 算(Windows 取出的檔案是 CRLF、GitHub 上是 LF,版本號要一樣)
        h.update(open(os.path.join(ROOT, rel), "rb").read().replace(b"\r\n", b"\n"))
    version = h.hexdigest()[:10]
    lines = [f"{START}(tools/build-preload.py 自動產生,不要手動改) -->",
             f'<meta name="app-version" content="{version}">']
    lines += [f'<link rel="modulepreload" href="{u}">' for u in remote]
    lines += [f'<link rel="modulepreload" href="{p}">' for p in local]
    lines.append(END)
    block = "\n".join(lines)
    a, b = html.index(START), html.index(END) + len(END)
    return html[:a] + block + html[b:], version, len(local), len(remote)


def main():
    html = open(INDEX, encoding="utf-8").read()
    new, version, n_local, n_remote = build(html)
    if "--check" in sys.argv:
        if new != html:
            print("index.html 的程式預先下載清單/版本號不是最新,請執行 python tools/build-preload.py")
            sys.exit(1)
        print(f"最新(版本 {version},{n_local} 個程式檔 + {n_remote} 個外部函式庫)")
        return
    if new != html:
        open(INDEX, "w", encoding="utf-8", newline="").write(new)
        print(f"已更新 index.html:版本 {version},{n_local} 個程式檔 + {n_remote} 個外部函式庫")
    else:
        print(f"不用更新(版本 {version})")


if __name__ == "__main__":
    main()
