# docs/logo/render_png.py
# docs/logo/svg/의 SVG를 크기별 PNG로 그립니다. 먼저 `node docs/logo/build.mjs`를 실행하세요.
#   pip install playwright && playwright install chromium
#   python docs/logo/render_png.py
# 가로형 로고(lockup)는 글자를 Pretendard 웹 글꼴로 그리므로 인터넷 연결이 필요합니다.
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
SVG = ROOT / 'svg'
PNG = ROOT / 'png'
FONT = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'

# (폴더, 원본 SVG, 크기들, 배경 투명 여부)
SQUARE = [
    ('icon', 'trazo-icon.svg', [1024, 512, 256, 192, 128, 64], True),
    ('icon', 'trazo-icon-small.svg', [48, 32, 16], True),
    ('icon-square', 'trazo-icon-square.svg', [1024, 512, 192, 180], False),
    ('icon-round', 'trazo-icon-round.svg', [512, 128, 80, 70, 65, 60, 54, 40], True),
    ('mark', 'trazo-mark-on-dark.svg', [512, 128], True),
    ('mark', 'trazo-mark-on-light.svg', [512, 128], True),
    ('mark', 'trazo-mark-white.svg', [512, 128], True),
    ('mark', 'trazo-mark-teal.svg', [512, 128], True),
    ('mark', 'trazo-mark-black.svg', [512, 128], True),
]
LOCKUPS = ['trazo-lockup-light.svg', 'trazo-lockup-dark.svg', 'trazo-lockup-mark-light.svg', 'trazo-lockup-mark-dark.svg']
LOCKUP_HEIGHTS = [192, 96]  # 236:64 비율


def page_html(svg_markup, width, height):
    return f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="{FONT}">
<style>html,body{{margin:0;background:transparent}} svg{{display:block;width:{width}px;height:{height}px}}</style></head>
<body>{svg_markup}</body></html>'''


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for folder, name, sizes, transparent in SQUARE:
            markup = (SVG / name).read_text()
            for size in sizes:
                page.set_viewport_size({'width': size, 'height': size})
                page.set_content(page_html(markup, size, size))
                target = PNG / folder / f'{name[:-4]}-{size}.png'
                target.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(target), omit_background=transparent)
        for name in LOCKUPS:
            markup = (SVG / name).read_text()
            for height in LOCKUP_HEIGHTS:
                width = round(height * 236 / 64)
                page.set_viewport_size({'width': width, 'height': height})
                page.set_content(page_html(markup, width, height), wait_until='networkidle')
                page.evaluate('document.fonts.ready')
                target = PNG / 'lockup' / f'{name[:-4]}-{height}.png'
                target.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(target), omit_background=True)
        browser.close()
    print(f'PNG → {PNG}')


if __name__ == '__main__':
    main()
