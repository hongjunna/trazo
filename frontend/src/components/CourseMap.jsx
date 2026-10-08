// src/components/CourseMap.jsx
// 공유받은 코스를 보여주는 작은 지도 (편집 없음). 코스 전체가 보이도록 맞추고, 고도 차트를 훑는 위치를 점으로 표시합니다.
import { useEffect, useMemo, useState } from 'react';
import { Map, MapMarker, Polyline } from 'react-kakao-maps-sdk';
import { markerIcons, HOVER_MARKER_ICON } from '../constants';
import { flattenCourse } from '../utils/course';
import { COLORS } from '../styles/theme';

const HOVER_IMAGE = { src: HOVER_MARKER_ICON, size: { width: 24, height: 24 }, options: { offset: { x: 12, y: 12 } } };
const DIALOG_ANIMATION_MS = 280;

const CourseMap = ({ polylines, markers, color, hoverPoint }) => {
    const [map, setMap] = useState(null);
    const points = useMemo(() => flattenCourse(polylines), [polylines]);
    const icons = useMemo(() => markerIcons(color), [color]);
    const start = markers[0] ?? points[0];
    const end = markers.length > 1 ? markers.at(-1) : points.at(-1);

    useEffect(() => {
        if (!map || !points.length) return;
        const fit = () => {
            map.relayout();
            const bounds = new window.kakao.maps.LatLngBounds();
            points.forEach(point => bounds.extend(new window.kakao.maps.LatLng(point.lat, point.lng)));
            map.setBounds(bounds, 28, 28, 28, 28);
        };
        fit();
        // 대화상자가 열리는 동안 크기가 바뀌므로, 다 열린 뒤 한 번 더 맞춥니다.
        const timer = window.setTimeout(fit, DIALOG_ANIMATION_MS);
        return () => window.clearTimeout(timer);
    }, [map, points]);

    return (
        <div className="course-map">
            <Map center={start ?? { lat: 37.5665, lng: 126.978 }} level={6} style={{ width: '100%', height: '100%' }} onCreate={setMap}>
                {polylines.map((path, idx) => (
                    <Polyline key={`o-${idx}`} path={path} strokeWeight={8} strokeColor={COLORS.primary} strokeOpacity={0.45} strokeStyle="solid" />
                ))}
                {polylines.map((path, idx) => (
                    <Polyline key={`l-${idx}`} path={path} strokeWeight={4} strokeColor={color} strokeOpacity={0.95} strokeStyle="solid" />
                ))}
                {end && <MapMarker position={end} image={icons.end} zIndex={5} />}
                {start && <MapMarker position={start} image={icons.start} zIndex={6} />}
                {hoverPoint && <MapMarker position={hoverPoint} image={HOVER_IMAGE} zIndex={10} />}
            </Map>
        </div>
    );
};

export default CourseMap;
