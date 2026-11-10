import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
    pg.goto('file://' + src); pg.wait_for_timeout(800)
    for i in range(1, 6):
        pg.locator(f'#s{i}').screenshot(path=f'{out}/trazo-detail-{i}.png')
    b.close()
