import React, { useMemo, useState, useRef } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
    zoomPlugin
);

// --- 유틸리티 함수들 ---

const lerp = (start, end, t) => {
    return start + (end - start) * t;
};

// ⚡ [핵심 수정] 스무딩 함수 업그레이드 (반복 실행 지원)
// iterations(반복 횟수)를 늘릴수록 그래프가 매끄러워집니다.
const applySmoothing = (points, windowSize = 5, iterations = 2) => {
    let currentPoints = points;

    for (let iter = 0; iter < iterations; iter++) {
        if (currentPoints.length < windowSize) return currentPoints;

        currentPoints = currentPoints.map((pt, i) => {
            let sum = 0;
            let count = 0;
            // 앞뒤로 windowSize만큼 평균을 냄
            for (let j = i - Math.floor(windowSize / 2); j <= i + Math.floor(windowSize / 2); j++) {
                if (j >= 0 && j < currentPoints.length) {
                    sum += currentPoints[j].y !== undefined ? currentPoints[j].y : currentPoints[j];
                    count++;
                }
            }
            const avg = sum / count;
            return pt.y !== undefined ? { ...pt, y: avg } : avg;
        });
    }
    return currentPoints;
};

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// 경사 구간 색 (범례와 같은 구간 정의 사용)
const zoneFor = (zones, slope) => zones.find(zone => Math.abs(slope) < zone.max) || zones[zones.length - 1];

const withAlpha = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const crosshairPlugin = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        if (chart.activeMouseX && chart.activeMouseY) {
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#FF3399';
            ctx.setLineDash([5, 5]);
            const lineX = Math.max(left, Math.min(right, chart.activeMouseX));
            const lineY = Math.max(top, Math.min(bottom, chart.activeMouseY));
            ctx.moveTo(lineX, top);
            ctx.lineTo(lineX, bottom);
            ctx.moveTo(left, lineY);
            ctx.lineTo(right, lineY);
            ctx.stroke();
            ctx.restore();
        }
    }
};

const ElevationChart = ({ polylines, zones, onHoverPoint }) => {
    const [hudData, setHudData] = useState(null);
    const chartContainerRef = useRef(null);
    const scrollbarThumbRef = useRef(null);

    const { chartData, rawCoords, elevations, slopes, distances, totalDistance } = useMemo(() => {
        if (!polylines || polylines.length === 0) return { chartData: null, rawCoords: [], elevations: [], slopes: [], distances: [], totalDistance: 0 };

        // 1. 원본 데이터 평탄화
        let flatPoints = [];
        polylines.forEach((segment) => flatPoints = [...flatPoints, ...segment]);
        if (flatPoints.length === 0) return { chartData: null, rawCoords: [], elevations: [], slopes: [], distances: [], totalDistance: 0 };

        // 2. 원본 누적 거리 계산
        const originalCumDist = [0];
        let totalOriginalDist = 0;
        for (let i = 1; i < flatPoints.length; i++) {
            const d = getDistanceFromLatLonInKm(
                flatPoints[i - 1].lat, flatPoints[i - 1].lng,
                flatPoints[i].lat, flatPoints[i].lng
            );
            totalOriginalDist += d;
            originalCumDist.push(totalOriginalDist);
        }

        // 3. 재샘플링 (10m 간격) - 수학적 안정성 확보
        const SAMPLING_INTERVAL_KM = 0.01;
        let resampledPoints = [];
        let resampledCoords = [];
        let resampledDistances = [];
        let currentSampleDist = 0;
        let idx = 0;

        while (currentSampleDist <= totalOriginalDist) {
            while (idx < originalCumDist.length - 1 && originalCumDist[idx + 1] < currentSampleDist) {
                idx++;
            }
            if (idx >= flatPoints.length - 1) break;

            const p1 = flatPoints[idx];
            const p2 = flatPoints[idx + 1];
            const d1 = originalCumDist[idx];
            const d2 = originalCumDist[idx + 1];
            const segmentLen = d2 - d1;
            const t = segmentLen > 0 ? (currentSampleDist - d1) / segmentLen : 0;

            const newLat = lerp(p1.lat, p2.lat, t);
            const newLng = lerp(p1.lng, p2.lng, t);
            const newEle = lerp(p1.ele, p2.ele, t);

            resampledPoints.push({ x: currentSampleDist, y: newEle });
            resampledCoords.push({ lat: newLat, lng: newLng });
            resampledDistances.push(currentSampleDist);

            currentSampleDist += SAMPLING_INTERVAL_KM;
        }

        // ⚡ [핵심 수정] 강력한 스무딩 적용 (2회 반복)
        // windowSize: 7 (약 70m 범위), iterations: 2 (두 번 문지름)
        // 이렇게 하면 각진 부분이 완전히 사라지고 유려한 곡선이 됩니다.
        const smoothedPoints = applySmoothing(resampledPoints, 7, 2);

        // 4. 경사도 재계산
        const finalSlopes = [0];
        for (let i = 1; i < smoothedPoints.length; i++) {
            const curr = smoothedPoints[i];
            const prev = smoothedPoints[i - 1];
            const distKm = curr.x - prev.x;
            const distM = distKm * 1000;
            const eleDiff = curr.y - prev.y;

            let slope = 0;
            if (distM > 0) {
                slope = (eleDiff / distM) * 100;
            }
            // 캡핑 (30% 이상은 자름)
            if (Math.abs(slope) > 30) slope = slope > 0 ? 30 : -30;
            finalSlopes.push(slope);
        }

        return {
            rawCoords: resampledCoords,
            elevations: smoothedPoints.map(p => p.y),
            slopes: finalSlopes,
            distances: resampledDistances,
            totalDistance: totalOriginalDist,
            chartData: {
                datasets: [
                    {
                        fill: true,
                        label: '고도 (m)',
                        data: smoothedPoints,
                        borderWidth: 2,

                        // ⚡ 곡선 텐션 강화 (부드럽게 보이기)
                        tension: 0.4,

                        pointRadius: 0,
                        pointHitRadius: 0,
                        pointHoverRadius: 0,
                        segment: {
                            backgroundColor: (ctx) => withAlpha(zoneFor(zones, finalSlopes[ctx.p0DataIndex]).color, 0.35),
                            borderColor: (ctx) => zoneFor(zones, finalSlopes[ctx.p0DataIndex]).color
                        }
                    },
                ],
            }
        };
    }, [polylines, zones]);

    const updateScrollbar = (chart) => {
        if (!scrollbarThumbRef.current) return;
        const xScale = chart.scales.x;
        const total = totalDistance || xScale.max;
        const currentMin = xScale.min;
        const currentMax = xScale.max;
        const currentRange = currentMax - currentMin;
        let widthPct = (currentRange / total) * 100;
        let leftPct = (currentMin / total) * 100;
        if (widthPct > 100) widthPct = 100;
        if (leftPct < 0) leftPct = 0;
        if (leftPct + widthPct > 100) leftPct = 100 - widthPct;
        scrollbarThumbRef.current.style.width = `${widthPct}%`;
        scrollbarThumbRef.current.style.left = `${leftPct}%`;
    };

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 10 } },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x',
                    modifierKey: null,
                    onPan: ({ chart }) => updateScrollbar(chart),
                },
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                    onZoom: ({ chart }) => updateScrollbar(chart),
                },
                limits: { x: { min: 0, max: 'original' }, y: { min: 'original', max: 'original' } }
            }
        },
        scales: {
            x: {
                type: 'linear',
                display: true,
                title: { display: true, text: '거리 (km)' },
                ticks: { maxTicksLimit: 10, maxRotation: 0 },
                min: 0,
            },
            y: { display: true },
        },
        interaction: { mode: 'nearest', intersect: false },
        animation: { duration: 0, onComplete: ({ chart }) => updateScrollbar(chart) },
        onHover: (event, elements, chart) => {
            if (!event.native) return;
            const chartArea = chart.chartArea;
            const mouseX = event.x;
            if (mouseX < chartArea.left || mouseX > chartArea.right || event.y < chartArea.top || event.y > chartArea.bottom) {
                chart.activeMouseX = null;
                chart.activeMouseY = null;
                chart.draw();
                setHudData(null);
                onHoverPoint(null);
                return;
            }
            const targetDist = chart.scales.x.getValueForPixel(mouseX);
            let index = Math.round(targetDist / 0.01);
            if (index < 0) index = 0;
            if (index >= distances.length) index = distances.length - 1;

            const ele = elevations[index];
            const slope = slopes[index];
            const dist = distances[index];
            const targetYPixel = chart.scales.y.getPixelForValue(ele);

            chart.activeMouseX = mouseX;
            chart.activeMouseY = targetYPixel;
            chart.draw();

            const canvasRect = chart.canvas.getBoundingClientRect();
            setHudData({
                screenX: canvasRect.left + mouseX,
                screenY: canvasRect.top + targetYPixel,
                screenLeftLimit: canvasRect.left + chartArea.left,
                screenRightLimit: canvasRect.left + chartArea.right,
                dist: dist,
                ele: ele,
                slope: slope
            });
            const coord = rawCoords[index];
            if (coord) onHoverPoint({ lat: coord.lat, lng: coord.lng });
        }
    }), [rawCoords, elevations, slopes, distances, totalDistance, onHoverPoint]);

    const renderFloatingHUD = () => {
        if (!hudData) return null;
        const boxWidth = 140;
        const halfWidth = boxWidth / 2;
        const boxHeight = 95;
        const margin = 20;
        const safeX = Math.max(hudData.screenLeftLimit + halfWidth + 10, Math.min(hudData.screenRightLimit - halfWidth - 10, hudData.screenX));
        const topPosition = hudData.screenY - boxHeight - margin;

        return (
            <div style={{
                position: 'fixed',
                top: `${topPosition}px`,
                left: `${safeX}px`,
                transform: 'translateX(-50%)',
                width: `${boxWidth}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                color: 'white',
                padding: '12px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                fontSize: '13px',
                fontWeight: 'bold',
                zIndex: 9999,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                transition: 'left 0.05s linear'
            }}>
                <div style={{ color: '#ddd' }}>📏 거리: {hudData.dist.toFixed(2)} km</div>
                <div style={{ color: '#fff' }}>⛰️ 고도: {Math.round(hudData.ele)} m</div>
                <div style={{ color: hudData.slope >= zones[zones.length - 2].max ? '#FF5A5A' : (hudData.slope <= -zones[zones.length - 2].max ? '#5ABEFF' : '#fff') }}>
                    📈 경사: {hudData.slope.toFixed(1)} %
                </div>
            </div>
        );
    };

    if (!chartData) return null;

    return (
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }} onMouseLeave={() => { setHudData(null); onHoverPoint(null); }}>
            {renderFloatingHUD()}
            <div style={{ position: 'absolute', bottom: '1px', left: '40px', right: '10px', height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', zIndex: 5, pointerEvents: 'none' }}>
                <div ref={scrollbarThumbRef} style={{ position: 'absolute', top: 0, left: '0%', width: '100%', height: '100%', backgroundColor: '#bbb', borderRadius: '4px', transition: 'background-color 0.2s' }} />
            </div>
            <Line options={options} data={chartData} plugins={[crosshairPlugin]} />
        </div>
    );
};

export default React.memo(ElevationChart);