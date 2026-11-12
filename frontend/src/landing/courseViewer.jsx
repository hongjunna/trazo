/* eslint-disable react-refresh/only-export-components -- 페이지 진입점이라 다른 곳에서 불러오지 않습니다 */
// 공유 코스 페이지(/c/<토큰>, 백엔드 templates/course.html)의 지도와 고도 프로필.
// 코스 보기 모달과 같은 CourseMap·ElevationPanel을 그대로 써서 경로 색·마커·경사 색·확대가 앱과 같게 보이고,
// 고도 차트를 훑으면 지도에 같은 위치가 표시됩니다.
// 서버가 그린 SVG 경로·고도선은 자바스크립트를 쓸 수 없을 때 남는 대체 화면입니다.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import CourseMap from '../components/CourseMap';
import ElevationPanel from '../components/ElevationPanel';
import { SPORTS } from '../sports';
import { locateWaypoints } from '../utils/course';
import './courseViewer.css';

const readJson = (id) => {
    try {
        return JSON.parse(document.getElementById(id)?.textContent || 'null');
    } catch {
        return null;
    }
};

// 서버가 그린 대체 화면(SVG)을 비우고 React가 그릴 새 칸을 만들어 돌려줍니다.
const mountTarget = (node) => {
    const container = document.createElement('div');
    container.style.height = '100%';
    node.replaceChildren(container);
    return container;
};

// 지도 공급자와 관계없이 공통 지도를 마운트합니다. SDK 실패 시에도 다른 지도를 고를 수 있습니다.
const useMapTarget = (node) => {
    const [target, setTarget] = useState(null);
    useEffect(() => {
        if (!node) return undefined;
        const timer = window.setTimeout(() => setTarget(mountTarget(node)), 0);
        return () => window.clearTimeout(timer);
    }, [node]);
    return target;
};

const Viewer = ({ mapNode, elevationTarget, polylines, rawWaypoints, sport }) => {
    const [hoverPoint, setHoverPoint] = useState(null);
    const waypoints = useMemo(() => locateWaypoints(polylines, rawWaypoints), [polylines, rawWaypoints]);
    const mapTarget = useMapTarget(mapNode);

    return (
        <>
            {mapTarget && createPortal(
                <CourseMap polylines={polylines} markers={[]} waypoints={waypoints} color={sport.color} hoverPoint={hoverPoint} />,
                mapTarget,
            )}
            {elevationTarget && createPortal(
                <ElevationPanel variant="inline" polylines={polylines} waypoints={waypoints} zones={sport.gradeZones} onHoverPoint={setHoverPoint} />,
                elevationTarget,
            )}
        </>
    );
};

const polylines = readJson('course-data');
const mapNode = document.getElementById('course-map');
const elevationNode = document.getElementById('course-elevation');
if (polylines?.length && (mapNode || elevationNode)) {
    const sport = SPORTS[(mapNode ?? elevationNode).dataset.sport] ?? SPORTS.bike;
    const hasElevation = polylines.some(segment => segment.some(point => Number.isFinite(point.ele)));
    const elevationTarget = hasElevation && elevationNode ? mountTarget(elevationNode) : null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    createRoot(host).render(
        <Viewer mapNode={mapNode} elevationTarget={elevationTarget} polylines={polylines} rawWaypoints={readJson('course-waypoints') ?? []} sport={sport} />,
    );
}
