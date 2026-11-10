// src/utils/pages.js
// 상단 메뉴의 화면과 주소. 코스 생성 화면은 공유 링크(/c/<토큰>)로도 열립니다.
// 화면마다 검색용 제목·설명(SEO)도 여기서 정합니다. 서버가 처음 보내는 HTML(index.html의 SSI 분기)과
// public/sitemap-pages.xml에도 같은 주소·문구가 있으니, 바꾸면 함께 고칩니다.
export const SITE_URL = 'https://trazo.runvia.app';

export const PAGES = {
    create: { path: '/', label: '코스 생성', icon: 'route' },
    explore: { path: '/explore', label: '코스 지도', icon: 'map' },
    library: { path: '/my', label: '내 코스', icon: 'folder', loginOnly: true },
    community: { path: '/community', label: '커뮤니티', icon: 'users' },
    connect: { path: '/connect', label: '연동센터', icon: 'link' },
    utility: { path: '/utility', label: '유틸리티', icon: 'gauge' },
};

export const PAGE_IDS = Object.keys(PAGES);

// 유틸리티 안의 종목 섹션. 섹션마다 주소가 있어 검색에 따로 노출됩니다.
export const UTILITY_SECTIONS = {
    run: { path: '/utility', label: '러닝', icon: 'run' },
    bike: { path: '/utility/bike', label: '자전거', icon: 'bike' },
};

const normalize = (pathname) => pathname.replace(/\/+$/, '') || '/';

export const pageFromPath = (pathname) => {
    const path = normalize(pathname);
    if (path === '/utility' || path.startsWith('/utility/')) return 'utility';
    return PAGE_IDS.find(id => id !== 'create' && PAGES[id].path === path) ?? 'create';
};

export const utilitySectionFromPath = (pathname) => (normalize(pathname) === UTILITY_SECTIONS.bike.path ? 'bike' : 'run');

// 검색 결과에 보일 제목·설명. index는 false면 검색에서 빼고(noindex) 링크만 따라갑니다.
export const PAGE_META = {
    '/': {
        title: 'Trazo (트라소) | 자전거·러닝 코스 만들기 · GPX 경로 플래너',
        description: '지도 위에 점을 찍어 자전거·러닝 코스를 만드는 Trazo(트라소). 종목에 맞는 길찾기로 경로와 고도를 확인하고 GPX·FIT 파일로 내려받으세요.',
    },
    '/explore': {
        title: '코스 지도 | 공개 러닝·자전거 코스와 육상 트랙 지도 - Trazo',
        description: '다른 러너와 라이더가 공개한 러닝·자전거 코스, 전국 공공 육상 트랙을 지도에서 한눈에 보고 거리·상승 고도로 비교하세요.',
    },
    '/community': {
        title: '커뮤니티 | 러닝·자전거 코스 공유 - Trazo',
        description: '전국 러닝·자전거 코스를 최신순·인기순·거리순·상승 고도순으로 둘러보고 좋아요와 댓글을 남기세요. 마음에 드는 코스는 내 코스에 담아 GPX로 내려받을 수 있어요.',
    },
    '/connect': {
        title: '연동센터 | ChatGPT·Claude로 러닝·자전거 코스 추천받기 - Trazo',
        description: 'Trazo MCP 서버를 ChatGPT·Claude에 연결해 내 코스와 공개 코스를 근거로 코스 추천과 훈련 계획을 받아보세요.',
    },
    '/utility': {
        title: '러닝 페이스 계산기 | 페이스·완주 시간·거리·400m 트랙 랩 계산 - Trazo',
        description: '5km·10km·하프·풀코스 마라톤 목표 기록으로 1km 페이스와 속도, 완주 시간, 1km 구간 기록, 400m 트랙 한 바퀴 기록, 다른 거리 예상 기록을 계산하세요.',
    },
    '/utility/bike': {
        title: '자전거 유틸리티 (준비 중) - Trazo',
        description: '자전거 라이딩에 필요한 계산 도구를 준비하고 있어요. Trazo 코스 생성에서 자전거 코스를 만들고 예상 시간과 고도를 확인하세요.',
    },
    '/my': {
        title: '내 코스 - Trazo',
        description: '저장한 러닝·자전거 코스를 폴더별로 관리하고 공유 설정을 바꾸세요.',
        index: false,
    },
};

export const metaForPath = (pathname) => {
    const path = normalize(pathname);
    return { path, ...(PAGE_META[path] ?? PAGE_META['/']) };
};
