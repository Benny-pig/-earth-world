"""🧪 上線前自動檢查:用無頭瀏覽器(Playwright + Chromium)真的打開網站,確認——
  1. 網站有起來:載入畫面結束(window.__earthReady)、國家圖層建好
  2. 選單上每一個功能按下去、再關掉,都沒有發生程式錯誤
  3. 手機尺寸(375×812)也一樣打得開
只算「程式本身的錯誤」(沒接住的例外、主程式的全域錯誤提示);外部資料來源暫時連不上(地震、航班、天氣…)
不算失敗,那是每日健康檢查(health-check.py)在管的事。

GitHub Actions 每次推上 master 都會跑(.github/workflows/deploy.yml),沒過就不上線。
本機要跑:pip install playwright && python -m playwright install chromium,然後 python tools/smoke-test.py
"""
import functools, http.server, json, os, socketserver, sys, threading, time

from playwright.sync_api import sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PORT = 8765
# 會接管畫面、或要一直點才能結束的功能,不在自動測試裡開關
SKIP = {"cinema-toggle", "iss-ride-toggle", "moonview-toggle", "quake-toggle", "constellation-toggle"}


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run_page(browser, viewport, label, click_all):
    errors = []
    ctx = browser.new_context(viewport=viewport, service_workers="block")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[{label}] 未處理的錯誤:{e}"))
    page.on("console", lambda m: errors.append(f"[{label}] {m.text}") if m.type == "error" and m.text.startswith("[earth-world]") else None)
    t0 = time.time()
    page.goto(f"http://127.0.0.1:{PORT}/?nointro", wait_until="domcontentloaded")
    try:
        page.wait_for_function("window.__earthReady === true && !!(window.__earth && window.__earth.countryLayer)", timeout=120000)
    except Exception:
        errors.append(f"[{label}] 120 秒內網站沒有載入完成(window.__earthReady 一直不是 true)")
        ctx.close()
        return errors, 0, 0
    ready = time.time() - t0
    tested = 0
    if click_all:
        ids = page.eval_on_selector_all("#ctrl-dock .layer-row[id]", "els => els.map(e => e.id)")
        for bid in ids:
            if bid in SKIP:
                continue
            before = len(errors)
            page.evaluate(f"document.getElementById('{bid}').click()")
            page.wait_for_timeout(1200)
            # 還開著就再按一次關掉(有些功能按了會自己收起來)
            page.evaluate(f"(() => {{ const b = document.getElementById('{bid}'); if (b.getAttribute('aria-pressed') === 'true') b.click(); }})()")
            page.wait_for_timeout(300)
            tested += 1
            if len(errors) > before:
                errors.append(f"[{label}] ↑ 發生在按下「{bid}」之後")
    ctx.close()
    return errors, ready, tested


def main():
    httpd = serve()
    report = []
    all_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        for label, vp, click_all in [("電腦", {"width": 1280, "height": 800}, True), ("手機", {"width": 375, "height": 812}, False)]:
            errs, ready, tested = run_page(browser, vp, label, click_all)
            all_errors += errs
            report.append(f"| {label} | {'✅' if not errs else '❌'} | {ready:.1f} 秒 | {tested} |")
        browser.close()
    httpd.shutdown()
    md = ["## 🧪 上線前自動檢查", "", "| 尺寸 | 結果 | 載入完成 | 測試的功能數 |", "|---|---|---|---|", *report, ""]
    if all_errors:
        md += ["### 錯誤", "", *[f"- {e}" for e in all_errors[:50]]]
    text = "\n".join(md) + "\n"
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(text)
    sys.exit(1 if all_errors else 0)


if __name__ == "__main__":
    main()
