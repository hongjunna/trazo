import React, { useMemo, useState, useRef, useEffect } from 'react';
import Button from './ui/Button';
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
import { waypointImage, waypointImagesReady, waypointLabel, waypointType } from '../waypoints';

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
            ctx.strokeStyle = 'rgba(21, 38, 44, 0.55)';
            ctx.setLineDash([4, 4]);
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

// 웨이포인트: 차트 위쪽 여백에 아이콘과 이름을 그리고, 그 위치에 점선을 내립니다.
// 이름이 서로 겹치면 뒤의 이름은 생략하고 아이콘만 그립니다.
const WAYPOINT_ICON = 18;
const WAYPOINT_SPACE = 30;
const drawWaypoints = (chart, waypoints) => {
    if (!waypoints?.length || !chart.chartArea) return;
    const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
    ctx.save();
    ctx.font = '650 11px Pretendard Variable, Pretendard, sans-serif';
    ctx.textBaseline = 'middle';
    let labelEnd = -Infinity;
    const iconY = top - WAYPOINT_SPACE + 4;
    waypoints.forEach(waypoint => {
        const px = x.getPixelForValue(waypoint.km);
        if (px < left - 1 || px > right + 1) return;
        const type = waypointType(waypoint.type);
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = withAlpha(type.color, 0.7);
        ctx.moveTo(px, iconY + WAYPOINT_ICON);
        ctx.lineTo(px, bottom);
        ctx.stroke();
        const image = waypointImage(waypoint.type);
        if (image) ctx.drawImage(image, px - WAYPOINT_ICON / 2, iconY, WAYPOINT_ICON, WAYPOINT_ICON);
        const label = waypointLabel(waypoint);
        const width = ctx.measureText(label).width;
        const textX = px + WAYPOINT_ICON / 2 + 3;
        if (textX > labelEnd + 6 && textX + width <= right + 4) {
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeText(label, textX, iconY + WAYPOINT_ICON / 2);
            ctx.fillStyle = '#15262C';
            ctx.fillText(label, textX, iconY + WAYPOINT_ICON / 2);
            labelEnd = textX + width;
        } else {
            labelEnd = Math.max(labelEnd, px + WAYPOINT_ICON / 2);
        }
    });
    ctx.restore();
};

const ElevationChart = ({ polylines, zones, onHoverPoint, hoverSource, waypoints }) => {
    const waypointsRef = useRef(waypoints);
    const hasWaypoints = Boolean(waypoints?.length);
    const [waypointPlugin] = useState(() => ({ id: 'waypoints', afterDatasetsDraw: (chart) => drawWaypoints(chart, waypointsRef.current) }));
    const [hudData, setHudData] = useState(null);
    const [isZoomed, setIsZoomed] = useState(false);
    const chartRef = useRef(null);
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
                        borderWidth: 2.5,

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
        let widthPct = ((xScale.max - xScale.min) / total) * 100;
        let leftPct = (xScale.min / total) * 100;
        if (widthPct > 100) widthPct = 100;
        if (leftPct < 0) leftPct = 0;
        if (leftPct + widthPct > 100) leftPct = 100 - widthPct;
        scrollbarThumbRef.current.style.width = `${widthPct}%`;
        scrollbarThumbRef.current.style.left = `${leftPct}%`;
        scrollbarThumbRef.current.parentElement.style.opacity = widthPct < 99.5 ? 1 : 0;
    };

    const yRange = useMemo(() => {
        if (!elevations.length) return {};
        const low = Math.min(...elevations);
        const high = Math.max(...elevations);
        const half = Math.max((high - low) / 2, 10) * 1.1;
        const mid = (low + high) / 2;
        return { min: Math.floor(mid - half), max: Math.ceil(mid + half) };
    }, [elevations]);

    // 거리(km)에 해당하는 위치에 십자선과 정보 상자를 그리고, 그 표본 번호를 돌려줍니다.
    const showMarker = (chart, km) => {
        const index = Math.max(0, Math.min(distances.length - 1, Math.round(km / 0.01)));
        const { left, right } = chart.chartArea;
        const x = Math.max(left, Math.min(right, chart.scales.x.getPixelForValue(distances[index])));
        const ele = elevations[index];
        chart.activeMouseX = x;
        chart.activeMouseY = chart.scales.y.getPixelForValue(ele);
        chart.draw();
        const halfWidth = 62;
        // 웨이포인트 가까이(차트 너비의 1.5% 이내)를 훑으면 그 이름도 보여줍니다.
        const scale = chart.scales.x;
        const near = (waypointsRef.current ?? []).find(w => Math.abs(w.km - distances[index]) <= (scale.max - scale.min) * 0.015);
        setHudData({
            x: Math.max(left + halfWidth, Math.min(right - halfWidth, x)),
            dist: distances[index],
            ele,
            slope: slopes[index],
            waypoint: near ? waypointLabel(near) : null,
        });
        return index;
    };

    const clearMarker = (chart) => {
        chart.activeMouseX = null;
        chart.activeMouseY = null;
        chart.draw();
        setHudData(null);
    };

    // 터치 화면에서는 끌면 고도 위치를 훑고, 두 손가락으로 확대합니다. 마우스는 끌어서 이동, 휠로 확대합니다.
    const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: hasWaypoints ? WAYPOINT_SPACE : 8, bottom: 6 } },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            zoom: {
                pan: {
                    enabled: !isTouch,
                    mode: 'x',
                    onPan: ({ chart }) => { updateScrollbar(chart); setIsZoomed(true); },
                },
                zoom: {
                    wheel: { enabled: true, speed: 0.15 },
                    pinch: { enabled: true },
                    mode: 'x',
                    onZoom: ({ chart }) => { updateScrollbar(chart); setIsZoomed(chart.getZoomLevel() > 1.001); },
                },
                limits: { x: { min: 0, max: 'original', minRange: 0.2 }, y: { min: 'original', max: 'original' } }
            }
        },
        scales: {
            x: {
                type: 'linear',
                min: 0,
                max: totalDistance,
                grid: { display: false },
                border: { color: '#E2E7E9' },
                ticks: {
                    maxTicksLimit: 8, maxRotation: 0, color: '#869399', font: { size: 11, family: 'Pretendard Variable, Pretendard, sans-serif' },
                    callback: (value) => `${Number(value.toFixed(1))}km`,
                },
            },
            y: {
                // 평탄한 코스가 급경사처럼 보이지 않도록 고도 축은 최소 20m 범위로 보여줍니다.
                ...yRange,
                grid: { color: '#EDF1F2' },
                border: { display: false },
                ticks: {
                    maxTicksLimit: 5, precision: 0, color: '#869399', font: { size: 11, family: 'Pretendard Variable, Pretendard, sans-serif' },
                    callback: (value) => `${Math.round(value)}m`,
                },
            },
        },
        interaction: { mode: 'nearest', intersect: false },
        animation: { duration: 0, onComplete: ({ chart }) => updateScrollbar(chart) },
        onHover: (event, elements, chart) => {
            if (!event.native) return;
            const chartArea = chart.chartArea;
            const mouseX = event.x;
            if (event.type === 'mouseout' || mouseX < chartArea.left || mouseX > chartArea.right || event.y < chartArea.top || event.y > chartArea.bottom) {
                clearMarker(chart);
                onHoverPoint(null);
                return;
            }
            const index = showMarker(chart, chart.scales.x.getValueForPixel(mouseX));
            const coord = rawCoords[index];
            if (coord) onHoverPoint({ lat: coord.lat, lng: coord.lng });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [rawCoords, elevations, slopes, distances, totalDistance, onHoverPoint, isTouch, yRange, hasWaypoints]);

    // 웨이포인트가 바뀌거나 아이콘을 다 읽으면 다시 그립니다.
    useEffect(() => {
        waypointsRef.current = waypoints;
        chartRef.current?.draw();
        let cancelled = false;
        waypointImagesReady.then(() => { if (!cancelled) chartRef.current?.draw(); });
        return () => { cancelled = true; };
    }, [waypoints]);

    // 지도에서 코스 근처에 마우스를 올리면 그 위치를 차트에도 표시합니다.
    useEffect(() => {
        if (!hoverSource) return;
        return hoverSource.subscribe((km) => {
            const chart = chartRef.current;
            if (!chart?.chartArea) return;
            if (km == null) clearMarker(chart);
            else showMarker(chart, km);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hoverSource, elevations, slopes, distances]);

    const resetZoom = () => {
        chartRef.current?.resetZoom();
        setIsZoomed(false);
    };

    if (!chartData) return null;

    const steep = zones[zones.length - 2].max;
    const slopeColor = hudData && (hudData.slope >= steep ? '#FF8A7A' : hudData.slope <= -steep ? '#8FC8FF' : '#fff');

    return (
        <div className="chart" onMouseLeave={() => { setHudData(null); onHoverPoint(null); }}>
            {hudData && (
                <div className="chart__hud" style={{ left: hudData.x }}>
                    {hudData.waypoint && <div className="chart__hud-wpt">{hudData.waypoint}</div>}
                    <div><span>거리</span><b>{hudData.dist.toFixed(2)} km</b></div>
                    <div><span>고도</span><b>{Math.round(hudData.ele)} m</b></div>
                    <div><span>경사</span><b style={{ color: slopeColor }}>{hudData.slope > 0 ? '+' : ''}{hudData.slope.toFixed(1)}%</b></div>
                </div>
            )}
            {isZoomed && (
                <Button size="sm" variant="secondary" icon="zoom-reset" className="chart__reset" onClick={resetZoom}>전체 보기</Button>
            )}
            <div className="chart__scroll" style={{ opacity: 0 }}>
                <div ref={scrollbarThumbRef} />
            </div>
            <Line ref={chartRef} options={options} data={chartData} plugins={[crosshairPlugin, waypointPlugin]} />
        </div>
    );
};

export default React.memo(ElevationChart);
