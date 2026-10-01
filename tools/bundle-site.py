"""🚀 部署前打包:把 src/ 底下八十幾個程式檔用 esbuild 合併成 dist/main.js(加上幾個按需載入的小檔),
再把 index.html 改成載入打包後的版本。第一次打開網站時只要下載一兩個程式檔,不用一個一個抓。

只在 GitHub Actions 部署時跑(.github/workflows/deploy.yml),對象是準備上線的 _site 資料夾,
不會改到專案本身——本機開發照舊直接用 src/ 的原始檔,改了重新整理就看得到。
three.js、earcut 還是從 CDN 載入(index.html 的 import map),不打包進來。

用法:python tools/bundle-site.py _site      (需要 Node.js;會用 npx 下載固定版本的 esbuild)
"""
import os, re, subprocess, sys

ESBUILD = "esbuild@0.24.0"


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else "_site"
    entry = os.path.join(site, "src", "main.js")
    out = os.path.join(site, "dist")
    cmd = ["npx", "--yes", ESBUILD, entry, "--bundle", "--format=esm", "--splitting", "--minify", "--target=es2020",
           f"--outdir={out}", "--entry-names=[name]", "--chunk-names=chunks/[name]-[hash]", "--charset=utf8", "--legal-comments=none",
           "--external:three", "--external:three/addons/*", "--external:earcut"]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True, shell=(os.name == "nt"))

    path = os.path.join(site, "index.html")
    html = open(path, encoding="utf-8").read()
    # 主程式改成打包後的檔案
    a = 'import { start } from "./src/main.js";'
    if a not in html:
        raise SystemExit("index.html 裡找不到載入主程式的那一行")
    html = html.replace(a, 'import { start } from "./dist/main.js";')
    # 預先下載清單:外部函式庫照舊,src/ 的八十幾個換成一個 dist/main.js
    block = re.search(r"<!-- modulepreload:start.*?<!-- modulepreload:end -->", html, re.S)
    if not block:
        raise SystemExit("index.html 裡找不到 modulepreload 區塊")
    lines = [l for l in block.group(0).split("\n") if 'href="src/' not in l]
    lines.insert(-1, '<link rel="modulepreload" href="dist/main.js">')
    html = html[:block.start()] + "\n".join(lines) + html[block.end():]
    open(path, "w", encoding="utf-8", newline="\n").write(html)

    total = 0
    for root, _, files in os.walk(out):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    n = sum(len(f) for _, _, f in os.walk(out))
    print(f"打包完成:{n} 個檔案,共 {total // 1024} KB(原本 src/ 有 {sum(len(f) for _, _, f in os.walk(os.path.join(site, 'src')))} 個檔)")


if __name__ == "__main__":
    main()
