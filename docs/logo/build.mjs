// docs/logo/build.mjs
// Trazo 로고(고도 획) 원본. 모양은 이 파일 한 곳에서 고치고, 실행하면 docs/logo/svg/에 SVG를 다시 만듭니다.
//   node docs/logo/build.mjs
// PNG는 render_png.py로 SVG를 그려 만듭니다 (Playwright 필요). 서비스에 쓰는 파일은 sync.sh로 복사합니다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'svg');
mkdirSync(out, { recursive: true });

export const COLORS = {
    teal: '#0B4F57',
    tealDeep: '#083C42',
    lime: '#8FCE3A',
    limeOnLight: '#6FAE28',
    white: '#FFFFFF',
};

// 색 조합: 짙은 바탕(기본) · 밝은 바탕 · 한 가지 색
const PALETTES = {
    dark: { line: COLORS.white, accent: COLORS.lime, hole: COLORS.teal, fill: 0.2 },
    light: { line: COLORS.teal, accent: COLORS.limeOnLight, hole: COLORS.white, fill: 0.18 },
    white: { line: COLORS.white, accent: COLORS.white, hole: 'none', fill: 0.18 },
    teal: { line: COLORS.teal, accent: COLORS.teal, hole: 'none', fill: 0.14 },
    black: { line: '#000000', accent: '#000000', hole: 'none', fill: 0.14 },
};

const PROFILE = 'M10 46L20 33L27 40L38 21L46 33L54 27';

// 고도 획: 출발점(링) → 오르내리는 고도 선 → 꼭대기 깃발 → 도착점
// small: 16~48px용. 선을 굵히고 면 채움을 빼서 작은 크기에서도 뭉개지지 않게 합니다.
const mark = (p, { small = false } = {}) => {
    const w = small ? 7 : 5.5;
    const hollow = p.hole === 'none'
        ? `<circle cx="10" cy="46" r="${small ? 5 : 4.5}" fill="${p.line}"/>`
        : `<circle cx="10" cy="46" r="${small ? 5 : 4.5}" fill="${p.hole}" stroke="${p.line}" stroke-width="${small ? 3.5 : 3}"/>`;
    return [
        small ? '' : `<path d="${PROFILE}V52H10Z" fill="${p.accent}" opacity="${p.fill}"/>`,
        `<path d="${PROFILE}" fill="none" stroke="${p.accent}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<path d="M38 21V${small ? 7 : 8}" stroke="${p.line}" stroke-width="${small ? 3.5 : 3}" stroke-linecap="round"/>`,
        small
            ? `<path d="M38 6.5L50 11.25L38 16Z" fill="${p.line}" stroke="${p.line}" stroke-width="1.5" stroke-linejoin="round"/>`
            : `<path d="M38 8.5L48 12L38 15.5Z" fill="${p.line}" stroke="${p.line}" stroke-width="1.5" stroke-linejoin="round"/>`,
        hollow,
        `<circle cx="54" cy="27" r="${small ? 5.5 : 4.5}" fill="${p.line}"/>`,
    ].filter(Boolean).join('\n  ');
};

// 아이콘 타일 안에서 마크가 가운데 오도록 살짝 내립니다 (마크 중심 31.3, 29.3).
const CENTER = 'translate(0.7 2.7)';

const svg = (viewBox, body, { title = 'Trazo', size } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size ? ` width="${size}" height="${size}"` : ''}>
  <title>${title}</title>
  ${body}
</svg>
`;

const files = {
    // 앱 아이콘: 둥근 사각 타일 (파비콘·MCP·스토어 등록)
    'trazo-icon.svg': svg('0 0 64 64', `<rect width="64" height="64" rx="15" fill="${COLORS.teal}"/>\n  <g transform="${CENTER}">\n  ${mark(PALETTES.dark)}\n  </g>`),
    // 작은 크기용 앱 아이콘 (파비콘 16·32px)
    'trazo-icon-small.svg': svg('0 0 64 64', `<rect width="64" height="64" rx="15" fill="${COLORS.teal}"/>\n  <g transform="${CENTER}">\n  ${mark(PALETTES.dark, { small: true })}\n  </g>`),
    // 꽉 찬 사각 (iOS 홈 화면·안드로이드 maskable처럼 운영체제가 모서리를 깎는 곳). 가운데 80% 안에 마크를 둡니다.
    'trazo-icon-square.svg': svg('0 0 64 64', `<rect width="64" height="64" fill="${COLORS.teal}"/>\n  <g transform="translate(6.4 6.4) scale(0.8) ${CENTER}">\n  ${mark(PALETTES.dark)}\n  </g>`),
    // 원형 (가민 Connect IQ 런처 아이콘처럼 둥근 화면)
    'trazo-icon-round.svg': svg('0 0 64 64', `<circle cx="32" cy="32" r="32" fill="${COLORS.teal}"/>\n  <g transform="translate(5.12 5.12) scale(0.84) ${CENTER}">\n  ${mark(PALETTES.dark, { small: true })}\n  </g>`),
    // 마크만 (바탕 없음). 짙은 바탕 위 · 밝은 바탕 위 · 한 가지 색
    'trazo-mark-on-dark.svg': svg('2 0 58 58', mark(PALETTES.dark)),
    'trazo-mark-on-light.svg': svg('2 0 58 58', mark(PALETTES.light)),
    'trazo-mark-white.svg': svg('2 0 58 58', mark(PALETTES.white)),
    'trazo-mark-teal.svg': svg('2 0 58 58', mark(PALETTES.teal)),
    'trazo-mark-black.svg': svg('2 0 58 58', mark(PALETTES.black)),
};

// 로고 + 글자 (가로형). 글자는 Pretendard → 시스템 고딕 순서로 그립니다. 글꼴이 없는 곳에는 PNG를 쓰세요.
const lockup = (name, { bg, text, palette, tile }) => {
    const icon = tile
        ? `<rect width="64" height="64" rx="15" fill="${COLORS.teal}"/>\n  <g transform="${CENTER}">\n  ${mark(PALETTES.dark)}\n  </g>`
        : `<g transform="translate(-2 3)">\n  ${mark(palette)}\n  </g>`;
    files[name] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 64">
  <title>Trazo</title>${bg ? `\n  <rect width="236" height="64" fill="${bg}"/>` : ''}
  ${icon}
  <text x="80" y="45.5" font-family="Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" font-size="42" font-weight="800" letter-spacing="-1" fill="${text}">Trazo</text>
</svg>
`;
};
lockup('trazo-lockup-light.svg', { text: COLORS.teal, tile: true });
lockup('trazo-lockup-dark.svg', { text: COLORS.white, tile: true });
lockup('trazo-lockup-mark-light.svg', { text: COLORS.teal, palette: PALETTES.light });
lockup('trazo-lockup-mark-dark.svg', { text: COLORS.white, palette: PALETTES.dark });

for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);
console.log(`${Object.keys(files).length} SVG files → ${out}`);
