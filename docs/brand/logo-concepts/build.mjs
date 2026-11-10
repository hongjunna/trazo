// docs/brand/logo-concepts/build.mjs
// Trazo 로고 아이콘 시안. 서비스에는 아직 적용하지 않았습니다.
// 실행: node docs/brand/logo-concepts/build.mjs → 시안별 SVG(앱 아이콘·밝은 배경용)와 비교용 index.html을 만듭니다.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// 서비스 색 (frontend/src/index.css)
const TILE = { bg: '#0B4F57', line: '#FFFFFF', accent: '#8FCE3A', hole: '#0B4F57', soft: 'rgba(255,255,255,0.35)' };
const LIGHT = { bg: null, line: '#0B4F57', accent: '#78B52C', hole: '#FFFFFF', soft: 'rgba(11,79,87,0.3)' };

const concepts = [
    {
        id: 'merge',
        name: 'A. 합류',
        idea: '자전거 길(라임)과 러닝 길(흰색)이 한 점에서 만나 하나의 코스가 됩니다. 두 종목과 함께 달리는 커뮤니티를 한 번에 보여줍니다.',
        draw: (c) => `
  <path d="M14 46C24 46 26 32 36 32" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round"/>
  <path d="M14 18C24 18 26 32 36 32H48" fill="none" stroke="${c.line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="14" cy="46" r="5" fill="${c.hole}" stroke="${c.accent}" stroke-width="3.5"/>
  <circle cx="14" cy="18" r="5" fill="${c.hole}" stroke="${c.line}" stroke-width="3.5"/>
  <circle cx="50" cy="32" r="6.5" fill="${c.line}"/>
  <circle cx="50" cy="32" r="2.5" fill="${c.accent}"/>`,
    },
    {
        id: 'track-loop',
        name: 'B. 트랙에서 길로',
        idea: '400m 트랙을 돌던 선(훈련)이 트랙을 벗어나 바깥 길(코스)로 뻗어 나갑니다. 트랙 지도·페이스 계산기 같은 훈련 기능과 코스 만들기를 잇습니다.',
        draw: (c) => `
  <rect x="9" y="27" width="35" height="22" rx="11" fill="none" stroke="${c.line}" stroke-width="5"/>
  <rect x="16" y="33.5" width="21" height="9" rx="4.5" fill="none" stroke="${c.soft}" stroke-width="2"/>
  <path d="M20 49H33A11 11 0 0 0 44 38C44 27 47 19 52 14" fill="none" stroke="${c.accent}" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="20" cy="49" r="4.5" fill="${c.hole}" stroke="${c.accent}" stroke-width="3"/>
  <circle cx="52" cy="14" r="5.5" fill="${c.line}"/>`,
    },
    {
        id: 'elevation',
        name: 'C. 고도 획',
        idea: '한 획으로 그린 고도 그래프 꼭대기에 깃발을 꽂았습니다. 오르막을 확인하고 목표를 세워 훈련하는 느낌입니다.',
        draw: (c) => `
  <path d="M10 46L20 33L27 40L38 21L46 33L54 27V52H10Z" fill="${c.accent}" opacity="0.2"/>
  <path d="M10 46L20 33L27 40L38 21L46 33L54 27" fill="none" stroke="${c.accent}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M38 21V8" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/>
  <path d="M38 8.5L48 12L38 15.5Z" fill="${c.line}" stroke="${c.line}" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="10" cy="46" r="4.5" fill="${c.hole}" stroke="${c.line}" stroke-width="3"/>
  <circle cx="54" cy="27" r="4.5" fill="${c.line}"/>`,
    },
    {
        id: 'route-t',
        name: 'D. 경로 T',
        idea: 'Trazo의 T. 가로획은 지도 위에 찍은 두 점, 세로획은 그 사이를 구불구불 이어 가는 실제 경로입니다. 작은 크기에서도 글자로 읽힙니다.',
        draw: (c) => `
  <path d="M14 17H50" stroke="${c.line}" stroke-width="6" stroke-linecap="round"/>
  <path d="M32 17C32 28 41 29 41 37C41 46 32 45 32 51" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="14" cy="17" r="4" fill="${c.line}"/>
  <circle cx="50" cy="17" r="4" fill="${c.line}"/>
  <circle cx="32" cy="51" r="5.5" fill="${c.hole}" stroke="${c.line}" stroke-width="3.5"/>`,
    },
    {
        id: 'pin-ridge',
        name: 'E. 지도 핀 + 능선',
        idea: '지도 핀 안에 오르내리는 길을 넣었습니다. "어디서, 어떤 길을 달릴지"를 한 아이콘에 담아 지도 서비스라는 점이 가장 분명하게 보입니다.',
        draw: (c) => `
  <path d="M32 55C25 46 15 38 15 27A17 17 0 0 1 49 27C49 38 39 46 32 55Z" fill="none" stroke="${c.line}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M22 31L27.5 24.5L31.5 28.5L36.5 21L42 28" fill="none" stroke="${c.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    {
        id: 'switchback',
        name: 'F. 스위치백',
        idea: '산길을 지그재그로 오르는 헤어핀 길을 한 획(trazo)으로 그렸습니다. 아래에서 출발해 위에서 끝나 성장·훈련의 방향감을 줍니다.',
        draw: (c) => `
  <path d="M12 48H42A8 8 0 0 0 42 32H22A8 8 0 0 1 22 16H49" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="12" cy="48" r="5" fill="${c.hole}" stroke="${c.line}" stroke-width="3.5"/>
  <circle cx="50" cy="16" r="6" fill="${c.line}"/>`,
    },
    {
        id: 'crew',
        name: 'G. 크루 루프',
        idea: '세 갈래 길이 하나의 순환 코스를 함께 그립니다. 각자 만든 코스를 공유하고 함께 달리는 커뮤니티를 강조한 시안입니다.',
        draw: (c) => `
  <path d="M32 13A19 19 0 0 1 48.5 41.5" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round"/>
  <path d="M45 46A19 19 0 0 1 15.5 41.5" fill="none" stroke="${c.line}" stroke-width="6" stroke-linecap="round"/>
  <path d="M13.2 36A19 19 0 0 1 26 14" fill="none" stroke="${c.line}" stroke-width="6" stroke-linecap="round" opacity="0.55"/>
  <circle cx="32" cy="13" r="4.5" fill="${c.accent}"/>
  <circle cx="48.5" cy="41.5" r="4.5" fill="${c.line}"/>
  <circle cx="15.5" cy="41.5" r="4.5" fill="${c.line}"/>
  <circle cx="32" cy="32" r="5" fill="${c.accent}"/>`,
    },
    {
        id: 'runner-route',
        name: 'H. 러너와 길',
        idea: '앞으로 기울어 달리는 러너 아래로 라임색 코스가 출발점에서 도착점까지 이어집니다. "내가 만든 길을 달린다"를 가장 직접적으로 보여줍니다.',
        draw: (c) => `
  ${runner(c.line, 'translate(1 -1)')}
  <path d="M10 53C22 53 26 49 36 49C44 49 48 52 54 52" fill="none" stroke="${c.accent}" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="10" cy="53" r="4" fill="${c.hole}" stroke="${c.accent}" stroke-width="3"/>
  <circle cx="54" cy="52" r="4" fill="${c.accent}"/>`,
    },
    {
        id: 'rider-route',
        name: 'I. 라이더와 길',
        idea: '자전거를 탄 라이더가 라임색 코스 위를 달립니다. 바퀴와 길을 단순한 선으로 그려 작은 크기에서도 자전거로 읽힙니다.',
        draw: (c) => `
  ${rider(c.line)}
  <path d="M8 55H56" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`,
    },
    {
        id: 'ring-runner',
        name: 'J. 링 위의 러너',
        idea: '자전거 바퀴이자 육상 트랙인 고리 안을 러너가 달립니다. 라임 고리는 아직 다 그리지 않은 코스(획)여서 "자전거·러닝·트랙 훈련"을 한 기호로 묶습니다.',
        draw: (c) => `
  <circle cx="32" cy="32" r="22" fill="none" stroke="${c.soft}" stroke-width="4"/>
  <path d="M32 10A22 22 0 1 1 10 32" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="10" cy="32" r="4" fill="${c.accent}"/>
  ${runner(c.line, 'translate(9.5 8.5) scale(0.68)')}`,
    },
    {
        id: 'speed-lines',
        name: 'K. 속도선 러너',
        idea: '러너 뒤로 남는 속도선이 곧 지도 위 코스 선입니다. 점으로 끝나는 선은 찍은 경유점을 뜻해 "달리면서 그리는 코스"를 표현합니다.',
        draw: (c) => `
  <path d="M8 26H18M6 35H17M10 44H20" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="8" cy="26" r="3" fill="${c.accent}"/>
  <circle cx="6" cy="35" r="3" fill="${c.accent}"/>
  <circle cx="10" cy="44" r="3" fill="${c.accent}"/>
  ${runner(c.line, 'translate(6 0)')}`,
    },
    {
        id: 'summit',
        name: 'L. 정상에서 만세',
        idea: '고도 그래프 꼭대기에서 두 팔을 든 사람. 오르막을 이겨 낸 성취감과 훈련의 목표를 보여줍니다.',
        draw: (c) => `
  <path d="M8 52L22 38L28 43L36 31L46 42L56 34V56H8Z" fill="${c.accent}" opacity="0.2"/>
  <path d="M8 52L22 38L28 43L36 31L46 42L56 34" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="36" cy="11" r="4.5" fill="${c.line}"/>
  <path d="M36 18V26M36 26L32.5 31M36 26L39.5 31M29 12L36 19L43 12" fill="none" stroke="${c.line}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    {
        id: 'together',
        name: 'M. 함께 달리기',
        idea: '두 사람(라임·흰색)이 한 코스의 양 끝에서 서로를 향합니다. 코스를 공유하고 함께 달리는 커뮤니티를 사람 중심으로 표현했습니다.',
        draw: (c) => `
  <path d="M15 40C15 52 26 54 32 46C38 38 49 40 49 52" fill="none" stroke="${c.soft}" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.1 7"/>
  <circle cx="17" cy="18" r="6" fill="${c.accent}"/>
  <path d="M7 38C7 30 11 27 17 27S27 30 27 38" fill="${c.accent}"/>
  <circle cx="47" cy="26" r="6" fill="${c.line}"/>
  <path d="M37 46C37 38 41 35 47 35S57 38 57 46" fill="${c.line}"/>`,
    },
];

// 앞으로 기울어 달리는 러너 (64 기준 좌표)
function runner(color, transform = '') {
    return `<g transform="${transform}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="40" cy="12" r="5" fill="${color}" stroke="none"/>
    <path d="M36 21L30 34"/>
    <path d="M35 23L28 25L24 30"/>
    <path d="M35 23L41 28L47 25"/>
    <path d="M30 34L38 39L36 46"/>
    <path d="M30 34L24 41L17 41"/>
  </g>`;
}

// 자전거 탄 라이더
function rider(color) {
    return `<g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="43" r="8.5" stroke-width="3.5"/>
    <circle cx="48" cy="43" r="8.5" stroke-width="3.5"/>
    <path d="M16 43L24 32H39L48 43M24 32L30 43H16M30 43L39 32M39 32L37 27" stroke-width="3"/>
    <circle cx="41" cy="11" r="4.5" fill="${color}" stroke="none"/>
    <path d="M25 28L37 18L42 27" stroke-width="4"/>
    <path d="M25 28L33 33L30 43" stroke-width="4"/>
  </g>`;
}

const svg = (concept, c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>Trazo – ${concept.name}</title>${c.bg ? `\n  <rect width="64" height="64" rx="15" fill="${c.bg}"/>` : ''}${concept.draw(c)}
</svg>
`;

for (const concept of concepts) {
    writeFileSync(join(here, `${concept.id}.svg`), svg(concept, TILE));
    writeFileSync(join(here, `${concept.id}-light.svg`), svg(concept, LIGHT));
}

const current = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#0B4F57"/><path d="M15 47C34 47 30 17 49 17" fill="none" stroke="#8FCE3A" stroke-width="8" stroke-linecap="round"/><circle cx="32" cy="32" r="3.4" fill="#FFFFFF"/><circle cx="15" cy="47" r="6.5" fill="#0B4F57" stroke="#FFFFFF" stroke-width="4"/><circle cx="49" cy="17" r="7" fill="#FFFFFF"/></svg>`;

const card = (concept) => `
<article class="card">
  <div class="sizes">
    <img src="${concept.id}.svg" width="128" height="128" alt="">
    <img src="${concept.id}.svg" width="48" height="48" alt="">
    <img src="${concept.id}.svg" width="32" height="32" alt="">
    <img src="${concept.id}.svg" width="16" height="16" alt="">
  </div>
  <div class="lockups">
    <span class="lockup lockup--light"><img src="${concept.id}-light.svg" width="36" height="36" alt="">Trazo</span>
    <span class="lockup lockup--dark"><img src="${concept.id}.svg" width="36" height="36" alt="">Trazo</span>
  </div>
  <h2>${concept.name}</h2>
  <p>${concept.idea}</p>
  <code>${concept.id}.svg · ${concept.id}-light.svg</code>
</article>`;

writeFileSync(join(here, 'index.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trazo 로고 시안</title>
<style>
  :root { --bg:#F3F5F6; --surface:#fff; --text:#15262C; --text-2:#536269; --border:#E2E7E9; --primary:#0B4F57; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 16px 64px; background:var(--bg); color:var(--text); font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif; }
  main { max-width: 1120px; margin: 0 auto; }
  header { display:flex; gap:20px; align-items:center; margin-bottom:28px; flex-wrap:wrap; }
  header h1 { margin:0 0 4px; font-size:24px; }
  header p { margin:0; color:var(--text-2); }
  .current { display:flex; align-items:center; gap:10px; padding:10px 14px; background:var(--surface); border:1px solid var(--border); border-radius:12px; font-size:13px; color:var(--text-2); margin-left:auto; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:16px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px; }
  .sizes { display:flex; align-items:flex-end; gap:14px; }
  .lockups { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
  .lockup { display:inline-flex; align-items:center; gap:8px; padding:8px 14px 8px 8px; border-radius:12px; font-weight:800; font-size:20px; letter-spacing:-0.02em; }
  .lockup--light { background:#fff; color:var(--primary); border:1px solid var(--border); }
  .lockup--dark { background:#083C42; color:#fff; }
  h2 { margin:18px 0 6px; font-size:17px; }
  p { margin:0 0 10px; color:var(--text-2); font-size:14px; line-height:1.6; }
  code { font-size:12px; color:var(--text-2); }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Trazo 로고 아이콘 시안</h1>
      <p>서비스 색(딥 틸 #0B4F57 · 라임 #8FCE3A)은 그대로 두고 모양만 바꾼 시안입니다. 크기별(128·48·32·16px)과 글자 조합으로 비교하세요.</p>
    </div>
    <span class="current">${current.replace('<svg ', '<svg width="36" height="36" ')}지금 로고</span>
  </header>
  <section class="grid">${concepts.map(card).join('')}
  </section>
</main>
</body>
</html>
`);
console.log(`${concepts.length} concepts written to ${here}`);
