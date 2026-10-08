// src/components/CourseThumbnail.jsx
// 저장된 코스의 모양을 작은 그림으로 보여줍니다.
import { useMemo } from 'react';

const SIZE = 100;
const PAD = 12;
const MAX_POINTS = 160;

const CourseThumbnail = ({ points, color }) => {
    const shape = useMemo(() => {
        if (!points || points.length < 2) return null;
        const step = Math.max(1, Math.floor(points.length / MAX_POINTS));
        const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
        // 위도에 따라 경도 간격이 줄어드는 만큼 보정해 실제 모양에 가깝게 그립니다.
        const scaleX = Math.cos((sampled[0].lat * Math.PI) / 180);
        const xs = sampled.map(p => p.lng * scaleX);
        const ys = sampled.map(p => -p.lat);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
        const scale = (SIZE - PAD * 2) / span;
        const offsetX = (SIZE - (Math.max(...xs) - minX) * scale) / 2;
        const offsetY = (SIZE - (Math.max(...ys) - minY) * scale) / 2;
        const coords = xs.map((x, i) => [offsetX + (x - minX) * scale, offsetY + (ys[i] - minY) * scale]);
        return {
            d: coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
            start: coords[0],
            end: coords.at(-1),
        };
    }, [points]);

    return (
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
            <defs>
                <pattern id="thumb-grid" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
                    <path d="M12.5 0H0V12.5" fill="none" stroke="#E2E7E9" strokeWidth="0.6" />
                </pattern>
            </defs>
            <rect width={SIZE} height={SIZE} fill="url(#thumb-grid)" />
            {shape && <>
                <path d={shape.d} fill="none" stroke="#0B4F57" strokeOpacity="0.35" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                <path d={shape.d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={shape.end[0]} cy={shape.end[1]} r="4" fill="#fff" stroke="#15262C" strokeWidth="2" />
                <circle cx={shape.start[0]} cy={shape.start[1]} r="4.5" fill="#0B4F57" stroke="#fff" strokeWidth="2" />
            </>}
        </svg>
    );
};

export default CourseThumbnail;
