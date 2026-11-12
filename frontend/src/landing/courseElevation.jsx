// 공유 코스 페이지(/c/<토큰>, 백엔드 templates/course.html)의 고도 프로필.
// 코스 보기 모달과 같은 ElevationPanel을 그대로 써서 경사 색·확대·정보 상자가 같게 보입니다.
// 서버가 그린 SVG 고도선은 이 스크립트가 실패해도 남는 대체 화면입니다.
import { createRoot } from 'react-dom/client';
import ElevationPanel from '../components/ElevationPanel';
import { SPORTS } from '../sports';
import { locateWaypoints } from '../utils/course';
import './courseElevation.css';

const readJson = (id) => {
    try {
        return JSON.parse(document.getElementById(id)?.textContent || 'null');
    } catch {
        return null;
    }
};

// 고도 위치를 훑으면 페이지의 카카오 지도(course-landing.js)에 같은 위치를 표시합니다.
const onHoverPoint = (point) => window.dispatchEvent(new CustomEvent('trazo:elevation-hover', { detail: point }));

const node = document.getElementById('course-elevation');
const polylines = readJson('course-data');
const hasElevation = polylines?.some(segment => segment.some(point => Number.isFinite(point.ele)));
if (node && hasElevation) {
    const sport = SPORTS[node.dataset.sport] ?? SPORTS.bike;
    const waypoints = locateWaypoints(polylines, readJson('course-waypoints') ?? []);
    node.classList.add('course-elevation--ready');
    createRoot(node).render(
        <ElevationPanel variant="inline" polylines={polylines} waypoints={waypoints} zones={sport.gradeZones} onHoverPoint={onHoverPoint} />,
    );
}
