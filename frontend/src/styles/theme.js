// src/styles/theme.js
// 자바스크립트에서 직접 색을 써야 하는 곳(지도 선, 차트)에 쓰는 값입니다.
// 화면 요소의 색은 index.css의 CSS 변수를 사용합니다.

export const COLORS = {
    primary: '#0B4F57',   // Topo Deep Teal
    secondary: '#965A3E', // Terra Brown
    accent: '#8FCE3A',    // Contour Lime
    danger: '#C0392B',    // Threshold Red

    bike: '#8FCE3A',
    run: '#FF7A45',
    // 육상 트랙 (코스 지도). 러닝 주황·자전거 라임과 겹치지 않는 보라
    track: '#7C5CFF',

    white: '#FFFFFF',
    text: '#15262C',
    textSub: '#536269',
    textMuted: '#869399',
    border: '#E2E7E9',
};
