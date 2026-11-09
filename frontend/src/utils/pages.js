// src/utils/pages.js
// 상단 메뉴의 화면과 주소. 코스 생성 화면은 공유 링크(/c/<토큰>)로도 열립니다.
export const PAGES = {
    create: { path: '/', label: '코스 생성', icon: 'route' },
    explore: { path: '/explore', label: '코스 지도', icon: 'map' },
    library: { path: '/my', label: '내 코스', icon: 'folder', loginOnly: true },
    community: { path: '/community', label: '커뮤니티', icon: 'users' },
    connect: { path: '/connect', label: '연동센터', icon: 'link' },
};

export const PAGE_IDS = Object.keys(PAGES);

export const pageFromPath = (pathname) => {
    const path = pathname.replace(/\/+$/, '') || '/';
    return PAGE_IDS.find(id => id !== 'create' && PAGES[id].path === path) ?? 'create';
};
