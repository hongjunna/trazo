// src/constants.js

const svgUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// 지도 위 점 아이콘. 출발점은 브랜드 색 링, 도착점은 과녁 모양, 경유점은 종목 색 테두리입니다.
export const markerIcons = (sportColor) => ({
    start: {
        src: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#0B4F57" stroke="#fff" stroke-width="3"/><circle cx="14" cy="14" r="4" fill="#fff"/></svg>`),
        size: { width: 28, height: 28 },
        options: { offset: { x: 14, y: 14 } },
    },
    end: {
        src: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#fff" stroke="#15262C" stroke-width="3"/><circle cx="14" cy="14" r="5" fill="#C0392B"/></svg>`),
        size: { width: 28, height: 28 },
        options: { offset: { x: 14, y: 14 } },
    },
    waypoint: {
        src: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="#fff" stroke="${sportColor}" stroke-width="3.5"/></svg>`),
        size: { width: 18, height: 18 },
        options: { offset: { x: 9, y: 9 } },
    },
});

// 고도 차트를 따라 지도에 표시하는 현재 위치 점
export const HOVER_MARKER_ICON = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#15262C" stroke="#fff" stroke-width="3"/></svg>`);
