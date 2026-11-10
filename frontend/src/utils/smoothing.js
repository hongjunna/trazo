// src/utils/smoothing.js
// 직선 연결 구간을 부드러운 곡선으로 보정합니다 (운동장 트랙처럼 길찾기가 안 되는 곳을 직선으로 이을 때).
// 찍은 점(경유점)은 그대로 지나고, 점 사이를 Catmull-Rom 곡선(centripetal)으로 잇습니다.
// 보정한 구간은 첫 점에 smooth 표시를 남겨, 옆 구간이 바뀌면 다시 계산하고 보정을 끄면 직선으로 되돌립니다.

const EARTH = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

const distanceM = (a, b) => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH * Math.asin(Math.sqrt(h));
};

export const isSmoothed = (segment) => Boolean(segment?.[0]?.smooth);

// 구간의 점들이 두 끝점을 잇는 직선에서 거의 벗어나지 않으면 직선 연결 구간으로 봅니다.
export const isStraightSegment = (segment, toleranceM = 1.5) => {
    if (!segment || segment.length < 2) return false;
    const a = segment[0];
    const b = segment.at(-1);
    const k = Math.cos(toRad(a.lat)) * 111320;
    const bx = (b.lng - a.lng) * k;
    const by = (b.lat - a.lat) * 111320;
    const len = Math.hypot(bx, by);
    if (len < 1) return false;
    return segment.every(p => {
        const px = (p.lng - a.lng) * k;
        const py = (p.lat - a.lat) * 111320;
        return Math.abs(px * by - py * bx) / len <= toleranceM;
    });
};

// 구간 위 거리 비율(0~1)의 고도를 기존 점들에서 읽습니다.
const elevationAt = (segment, fractions) => {
    const cumulative = [0];
    for (let i = 1; i < segment.length; i++) cumulative.push(cumulative[i - 1] + distanceM(segment[i - 1], segment[i]));
    const total = cumulative.at(-1) || 1;
    let j = 0;
    return fractions.map(fraction => {
        const target = fraction * total;
        while (j < segment.length - 2 && cumulative[j + 1] < target) j++;
        const span = cumulative[j + 1] - cumulative[j] || 1;
        const t = Math.min(1, Math.max(0, (target - cumulative[j]) / span));
        const e0 = segment[j].ele ?? 0;
        const e1 = segment[j + 1]?.ele ?? e0;
        return Math.round((e0 + (e1 - e0) * t) * 10) / 10;
    });
};

// P1→P2 곡선. P0·P3이 없으면 반대쪽을 비춰 만들어 끝이 자연스럽게 펴지게 합니다.
const curve = (p0, p1, p2, p3, count) => {
    const lat0 = p1.lat;
    const k = Math.cos(toRad(lat0)) * 111320;
    const xy = (p) => [(p.lng - p1.lng) * k, (p.lat - p1.lat) * 111320];
    const [x1, y1] = [0, 0];
    const [x2, y2] = xy(p2);
    const [x0, y0] = p0 ? xy(p0) : [2 * x1 - x2, 2 * y1 - y2];
    const [x3, y3] = p3 ? xy(p3) : [2 * x2 - x1, 2 * y2 - y1];
    const knot = (ax, ay, bx, by, t) => t + Math.max(Math.sqrt(Math.hypot(bx - ax, by - ay)), 1e-3);
    const t0 = 0;
    const t1 = knot(x0, y0, x1, y1, t0);
    const t2 = knot(x1, y1, x2, y2, t1);
    const t3 = knot(x2, y2, x3, y3, t2);
    const lerp = (pa, pb, ta, tb, t) => [
        ((tb - t) * pa[0] + (t - ta) * pb[0]) / (tb - ta),
        ((tb - t) * pa[1] + (t - ta) * pb[1]) / (tb - ta),
    ];
    const points = [];
    for (let i = 0; i <= count; i++) {
        const t = t1 + ((t2 - t1) * i) / count;
        const a1 = lerp([x0, y0], [x1, y1], t0, t1, t);
        const a2 = lerp([x1, y1], [x2, y2], t1, t2, t);
        const a3 = lerp([x2, y2], [x3, y3], t2, t3, t);
        const b1 = lerp(a1, a2, t0, t2, t);
        const b2 = lerp(a2, a3, t1, t3, t);
        const [x, y] = lerp(b1, b2, t1, t2, t);
        points.push({ lat: p1.lat + y / 111320, lng: p1.lng + x / k });
    }
    // 끝점은 찍은 점 좌표 그대로 둡니다 (반올림 오차로 이음매가 벌어지지 않게).
    points[0] = { lat: p1.lat, lng: p1.lng };
    points[count] = { lat: p2.lat, lng: p2.lng };
    return points;
};

const sameSpot = (a, b) => a && b && a.lat === b.lat && a.lng === b.lng;

// smooth 표시가 있는 구간을 앞뒤 경유점 기준으로 다시 그립니다. markers[i] → markers[i + 1]이 polylines[i]입니다.
export const resmoothCourse = (markers, polylines) => {
    const n = polylines.length;
    if (!n || markers.length !== n + 1) return polylines;
    const loop = n > 1 && sameSpot(markers[0], markers[n]);
    return polylines.map((segment, i) => {
        if (!isSmoothed(segment)) return segment;
        const prevIndex = i > 0 ? i - 1 : (loop ? n - 1 : null);
        const nextIndex = i < n - 1 ? i + 1 : (loop ? 0 : null);
        // 이웃 구간이 길찾기 구간이면 그 방향을 따르지 않고 곡선 끝을 곧게 폅니다.
        const p0 = prevIndex != null && isSmoothed(polylines[prevIndex]) ? markers[prevIndex] : null;
        const p3 = nextIndex != null && isSmoothed(polylines[nextIndex]) ? markers[nextIndex + 1] : null;
        const p1 = markers[i];
        const p2 = markers[i + 1];
        const length = distanceM(p1, p2);
        const count = Math.min(60, Math.max(8, Math.round(length / 3)));
        const points = curve(p0, p1, p2, p3, count);
        const elevations = elevationAt(segment, points.map((_, idx) => idx / count));
        const next = points.map((point, idx) => ({ ...point, ele: elevations[idx] }));
        next[0].smooth = true;
        return next;
    });
};

// 새로 이은 직선 구간(indexes)에 보정 표시를 하고 전체를 다시 계산합니다.
export const smoothNewSegments = (markers, polylines, indexes) => {
    const marked = polylines.map((segment, i) => (indexes.includes(i) && segment.length >= 2
        ? [{ ...segment[0], smooth: true }, ...segment.slice(1)]
        : segment));
    return resmoothCourse(markers, marked);
};

// 보정 켜기: 지금 코스의 직선 구간을 모두 곡선으로 / 끄기: 보정한 구간을 다시 직선으로.
export const applySmoothing = (markers, polylines, on) => {
    if (on) {
        const indexes = polylines.map((segment, i) => (!isSmoothed(segment) && isStraightSegment(segment) ? i : -1)).filter(i => i >= 0);
        return indexes.length ? smoothNewSegments(markers, polylines, indexes) : polylines;
    }
    if (!polylines.some(isSmoothed)) return polylines;
    return polylines.map((segment, i) => {
        if (!isSmoothed(segment)) return segment;
        const count = Math.max(1, Math.round(distanceM(markers[i], markers[i + 1]) / 20));
        const fractions = Array.from({ length: count + 1 }, (_, idx) => idx / count);
        const elevations = elevationAt(segment, fractions);
        return fractions.map((f, idx) => ({
            lat: markers[i].lat + (markers[i + 1].lat - markers[i].lat) * f,
            lng: markers[i].lng + (markers[i + 1].lng - markers[i].lng) * f,
            ele: elevations[idx],
        }));
    });
};

export const countStraightOrSmoothed = (polylines, on) => polylines.filter(segment => (on ? isStraightSegment(segment) && !isSmoothed(segment) : isSmoothed(segment))).length;
