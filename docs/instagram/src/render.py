# docs/instagram/src/render.py
# 게시물 HTML의 슬라이드(section.s)를 1080×1350 PNG로 저장합니다.
#   python docs/instagram/src/render.py   (Playwright 필요, 글꼴 때문에 인터넷 연결 필요)
from pathlib import Path
from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parent
POSTS = {'01-service-intro.html': '01-service-intro', '02-ai-mcp-update.html': '02-ai-mcp-update'}

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=1)
    for html, folder in POSTS.items():
        if not (SRC / html).exists():
            continue
        out = SRC.parent / folder
        out.mkdir(exist_ok=True)
        page.goto((SRC / html).as_uri(), wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(300)
        slides = page.locator('section.s')
        for i in range(slides.count()):
            slides.nth(i).screenshot(path=str(out / f'{i + 1:02d}.png'))
        print(f'{folder}: {slides.count()}장')
    browser.close()
