// frontend/scripts/seo-pages.mjs
// index.html의 주소별 검색 태그(SSI 분기)와 public/sitemap-pages.xml을 src/utils/pages.js의 PAGE_META로 다시 만듭니다.
// 자바스크립트를 실행하지 않는 검색엔진·AI 크롤러도 화면마다 다른 제목·설명·본문을 읽게 하려는 것입니다.
// 사용: node scripts/seo-pages.mjs  (문구를 바꾼 뒤 실행하고 결과를 함께 커밋)
import { readFileSync, writeFileSync } from 'node:fs';
import { PAGE_META, SITE_URL } from '../src/utils/pages.js';
import { RACE_DISTANCES, formatDuration } from '../src/utils/pace.js';

const root = new URL('..', import.meta.url).pathname;
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = (path) => `${SITE_URL}${path === '/' ? '/' : path}`;
// SSI 정규식: 주소 끝의 / 와 ?쿼리를 허용합니다.
const match = (path) => `$request_uri = /^${path.replace(/\//g, '\\/')}\\/?(?:\\?|\\z)/`;

const NAV = [
    ['/', '코스 만들기'], ['/explore', '코스 지도·육상 트랙'], ['/community', '커뮤니티 코스'], ['/utility', '러닝 페이스 계산기'],
    ['/connect', 'ChatGPT·Claude 연동'], ['/guide/', '사용 방법'], ['/en/guide/', 'English guide'],
];
const crumbs = (path, name) => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trazo', item: urlOf('/') },
        ...(path === '/' ? [] : [{ '@type': 'ListItem', position: 2, name, item: urlOf(path) }]),
    ],
});

const PACES = [240, 270, 300, 330, 360, 390, 420];
const paceTable = `<table><caption>페이스별 완주 시간표</caption><thead><tr><th>페이스(/km)</th>${RACE_DISTANCES.map(r => `<th>${r.label}</th>`).join('')}<th>400m 한 바퀴</th></tr></thead><tbody>${
    PACES.map(p => `<tr><td>${formatDuration(p)}</td>${RACE_DISTANCES.map(r => `<td>${formatDuration(p * r.km)}</td>`).join('')}<td>${formatDuration(p * 0.4)}</td></tr>`).join('')
}</tbody></table>`;

const FAQ = [
    ['페이스와 속도는 어떻게 바꾸나요?', '속도(km/h) = 60 ÷ 페이스(분/km)입니다. 5:00/km는 12km/h, 6:00/km는 10km/h입니다.'],
    ['400m 트랙 한 바퀴 기록은 어떻게 계산하나요?', '1km 페이스에 0.4를 곱합니다. 5:00/km는 400m 한 바퀴 2:00입니다. 1레인 기준이며 바깥 레인은 한 바퀴가 더 깁니다.'],
    ['다른 거리 예상 기록은 얼마나 정확한가요?', '리겔 공식(T2 = T1 × (D2 ÷ D1)^1.06)으로 어림한 값입니다. 장거리 훈련량이 부족하면 하프·풀코스 실제 기록은 더 느릴 수 있습니다.'],
];

// 화면별 본문(자바스크립트 없이 보이는 내용, 앱이 뜨면 바뀜)과 구조화 데이터
const PAGES = {
    '/': {
        h1: 'Trazo (트라소) — 자전거·러닝 코스 만들기',
        body: '<p>한국 지도에 점을 찍어 자전거와 러닝 경로를 계획하고 거리, 상승 고도, 경사도와 예상 시간을 확인하세요. GPX·FIT·TCX·KML·GeoJSON 파일을 불러와 편집하거나 내려받고, 구글 로그인으로 내 코스를 저장하고 공유할 수 있습니다. 길찾기가 안 되는 운동장 트랙은 직선 연결과 부드럽게 다듬기로 그릴 수 있습니다.</p>',
        ld: [{ '@type': 'WebSite', name: 'Trazo', alternateName: '트라소', url: urlOf('/'), inLanguage: 'ko', description: '한국의 자전거·러닝 코스를 만들고 고도를 확인하는 경로 플래너' },
            { '@type': 'WebApplication', name: 'Trazo 코스 플래너', url: urlOf('/'), applicationCategory: 'SportsApplication', operatingSystem: 'Web', inLanguage: 'ko', offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' } }],
    },
    '/explore': {
        h1: '코스 지도 — 공개 러닝·자전거 코스와 전국 육상 트랙',
        body: '<p>Trazo 사용자가 전체 공개한 러닝·자전거 코스를 지도 위에 겹쳐 보고, 전체·자전거·러닝·트랙으로 걸러 볼 수 있습니다. 트랙 보기에서는 공원·경기장·체육시설의 공공 육상 트랙(400m 트랙 등)을 트랙 모양 그대로 보여주고 한 바퀴 거리·레인·노면·운영시간 정보와 카카오맵 길찾기를 제공합니다.</p>',
        ld: [{ '@type': 'CollectionPage', name: '코스 지도', url: urlOf('/explore'), inLanguage: 'ko' }],
    },
    '/community': {
        h1: '커뮤니티 — 러닝·자전거 코스 공유',
        body: '<p>전국 러닝·자전거 공개 코스를 최신순, 많이 담긴 순, 좋아요 순, 거리 긴 순·짧은 순, 상승 고도 높은 순·낮은 순으로 둘러보세요. 코스 이름이나 닉네임으로 찾고, 좋아요와 댓글을 남기고, 마음에 드는 코스를 내 코스에 담아 GPX·FIT 파일로 내려받을 수 있습니다.</p>',
        ld: [{ '@type': 'CollectionPage', name: '커뮤니티 코스', url: urlOf('/community'), inLanguage: 'ko' }],
    },
    '/connect': {
        h1: '연동센터 — ChatGPT·Claude로 러닝·자전거 코스 추천받기',
        body: '<p>Trazo MCP 서버(https://trazo.runvia.app/mcp)를 ChatGPT·Claude에 커스텀 커넥터로 추가하면, AI가 내 코스와 커뮤니티 공개 코스의 거리·고도·경사·지나는 지역을 읽어 코스를 추천하고 훈련 계획을 도와줍니다. 읽기 전용이며 OAuth로 로그인합니다. 자세한 소개: <a href="/ai/">AI 연동 안내</a>.</p>',
        ld: [{ '@type': 'WebPage', name: '연동센터', url: urlOf('/connect'), inLanguage: 'ko' }],
    },
    '/utility': {
        h1: '러닝 페이스 계산기 — 페이스·완주 시간·거리·400m 트랙 랩',
        body: `<p>목표 거리와 완주 시간으로 1km당 페이스와 속도를, 거리와 페이스로 완주 시간을, 달린 시간과 페이스로 거리를 계산합니다. 5km·10km·하프(21.0975km)·풀코스(42.195km) 거리 버튼, 1km 구간 누적 기록, 400m·200m 트랙 랩 기록, 리겔 공식으로 어림한 다른 거리 예상 기록을 함께 보여줍니다.</p>${paceTable}<h2>자주 묻는 질문</h2><dl>${FAQ.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>`,
        ld: [{ '@type': 'WebApplication', name: '러닝 페이스 계산기', url: urlOf('/utility'), applicationCategory: 'SportsApplication', operatingSystem: 'Web', inLanguage: 'ko', offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' } },
            { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
    },
    '/utility/bike': {
        h1: '자전거 유틸리티 — 곧 새로운 기능으로 돌아올게요',
        body: '<p>자전거 라이딩에 필요한 계산 도구를 준비하고 있습니다. 그동안 Trazo 코스 생성에서 자전거 코스를 만들고 예상 시간과 상승 고도를 확인하세요. 러닝 페이스 계산기는 <a href="/utility">유틸리티</a>에서 쓸 수 있습니다.</p>',
        ld: [{ '@type': 'WebPage', name: '자전거 유틸리티', url: urlOf('/utility/bike'), inLanguage: 'ko' }],
    },
    '/my': { h1: '내 코스', body: '<p>저장한 러닝·자전거 코스를 폴더별로 관리합니다. 구글 계정으로 로그인해야 볼 수 있습니다.</p>', ld: [] },
};

const NAMES = { '/explore': '코스 지도', '/community': '커뮤니티', '/connect': '연동센터', '/utility': '러닝 페이스 계산기', '/utility/bike': '자전거 유틸리티', '/my': '내 코스' };

const head = (path) => {
    const meta = PAGE_META[path];
    const page = PAGES[path];
    const url = urlOf(path);
    const robots = meta.index === false ? 'noindex, follow' : 'index, follow, max-image-preview:large';
    const ld = { '@context': 'https://schema.org', '@graph': [...page.ld, crumbs(path, NAMES[path])] };
    return [
        `  <title>${esc(meta.title)}</title>`,
        `  <meta name="robots" content="${robots}" />`,
        `  <link rel="canonical" href="${url}" />`,
        `  <meta name="description" content="${esc(meta.description)}" />`,
        '  <meta property="og:type" content="website" />',
        '  <meta property="og:site_name" content="Trazo" />',
        '  <meta property="og:locale" content="ko_KR" />',
        `  <meta property="og:url" content="${url}" />`,
        `  <meta property="og:title" content="${esc(meta.title)}" />`,
        `  <meta property="og:description" content="${esc(meta.description)}" />`,
        `  <meta property="og:image" content="${SITE_URL}/og-image.png" />`,
        '  <meta property="og:image:width" content="1200" />',
        '  <meta property="og:image:height" content="900" />',
        '  <meta property="og:image:alt" content="Trazo 자전거·러닝 코스 플래너" />',
        '  <meta name="twitter:card" content="summary_large_image" />',
        `  <meta name="twitter:title" content="${esc(meta.title)}" />`,
        `  <meta name="twitter:description" content="${esc(meta.description)}" />`,
        `  <meta name="twitter:image" content="${SITE_URL}/og-image.png" />`,
        `  <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    ].join('\n');
};

const body = (path) => `      <h1>${esc(PAGES[path].h1)}</h1>\n      ${PAGES[path].body}`;

// '/'는 마지막(else) 분기. 더 긴 주소(/utility/bike)를 먼저 비교합니다.
const ORDER = ['/explore', '/community', '/connect', '/utility/bike', '/utility', '/my'];
const branches = (render) => ORDER.map(path => `  <!--# elif expr="${match(path)}" -->\n${render(path)}`).join('\n') + `\n  <!--# else -->\n${render('/')}\n  <!--# endif -->`;

const HEAD_START = '  <!-- seo:head -->';
const HEAD_END = '  <!-- /seo:head -->';
const BODY_START = '      <!-- seo:body -->';
const BODY_END = '      <!-- /seo:body -->';
const nav = `      <nav aria-label="Trazo 메뉴"><ul>${NAV.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul></nav>`;

const indexPath = `${root}index.html`;
let html = readFileSync(indexPath, 'utf8');
const replaceBetween = (start, end, content) => {
    const a = html.indexOf(start);
    const b = html.indexOf(end);
    if (a < 0 || b < 0) throw new Error(`표시를 찾지 못했어요: ${start}`);
    html = html.slice(0, a + start.length) + '\n' + content + '\n' + html.slice(b);
};
// 공유 코스(/c/<토큰>)는 백엔드가 만든 태그를 넣고, 나머지는 주소별 태그를 넣습니다.
replaceBetween(HEAD_START, HEAD_END, `  <!--# if expr="$request_uri = /^\\/c\\/([A-Za-z0-9_-]{6,64})(?:[\\/?]|\\z)/" -->
  <!--# include virtual="/api/og/c/$1" stub="og_fallback" -->
${branches(head)}`);
replaceBetween(BODY_START, BODY_END, `      <!--# if expr="$request_uri = /^\\/c\\//" -->
${body('/')}
${branches(path => body(path))}
${nav}`);
writeFileSync(indexPath, html);

const today = new Date().toISOString().slice(0, 10);
const STATIC = ['/guide/', '/en/guide/', '/ai/', '/en/ai/', '/privacy/', '/en/privacy/', '/terms/', '/en/terms/', '/support/'];
const appPaths = Object.keys(PAGE_META).filter(path => PAGE_META[path].index !== false);
const urls = [...appPaths, ...STATIC].map(path => `  <url><loc>${urlOf(path)}</loc><lastmod>${today}</lastmod></url>`);
writeFileSync(`${root}public/sitemap-pages.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`index.html 주소별 태그 ${ORDER.length + 1}개, sitemap-pages.xml 주소 ${urls.length}개를 만들었어요.`);
