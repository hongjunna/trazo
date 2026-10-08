// src/utils/course.js
// 코스 거리·고도 계산과 GPX 파일 생성

export const distanceKm = (a, b) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// 구간을 하나의 트랙으로 이어 붙이고, 구간 경계에서 겹치는 점을 제거합니다.
export const flattenCourse = (polylines) => {
    const points = [];
    for (const segment of polylines) {
        for (const point of segment) {
            const last = points[points.length - 1];
            if (last && last.lat === point.lat && last.lng === point.lng) continue;
            points.push(point);
        }
    }
    return points;
};

export const courseStats = (polylines) => {
    const points = flattenCourse(polylines);
    let distance = 0;
    let ascent = 0;
    let descent = 0;
    for (let i = 1; i < points.length; i++) {
        distance += distanceKm(points[i - 1], points[i]);
        const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
        if (diff > 0) ascent += diff;
        else descent -= diff;
    }
    return { distanceKm: distance, ascentM: ascent, descentM: descent };
};

// 일정 거리마다 거리 표시 위치를 계산합니다. 너무 많으면 간격을 넓힙니다.
export const distanceMarkers = (polylines, intervalKm, maxMarkers = 60) => {
    const points = flattenCourse(polylines);
    const total = courseStats(polylines).distanceKm;
    let interval = intervalKm;
    while (total / interval > maxMarkers) interval *= 2;

    const markers = [];
    let travelled = 0;
    let next = interval;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const step = distanceKm(a, b);
        while (step > 0 && travelled + step >= next) {
            const t = (next - travelled) / step;
            markers.push({
                km: Math.round(next * 10) / 10,
                lat: a.lat + (b.lat - a.lat) * t,
                lng: a.lng + (b.lng - a.lng) * t,
            });
            next += interval;
        }
        travelled += step;
    }
    return markers;
};

// 지도 위 한 점에서 가장 가까운 코스 위치를 빨리 찾도록, 코스를 평면 좌표(m)의 짧은 선분 목록으로 바꿔 둡니다.
// km는 고도 차트와 같은 방식(구간을 이어 붙인 누적 거리)으로 계산합니다.
const M_PER_DEG_LAT = 110540;
export const buildTrackIndex = (polylines) => {
    const first = polylines.find(segment => segment.length)?.[0];
    if (!first) return null;
    const mPerDegLng = 111320 * Math.cos((first.lat * Math.PI) / 180);
    const toXY = (p) => ({ x: p.lng * mPerDegLng, y: p.lat * M_PER_DEG_LAT });
    const pieces = [];
    let travelled = 0;
    polylines.forEach((segment, segmentIndex) => {
        for (let i = 1; i < segment.length; i++) {
            const a = segment[i - 1];
            const b = segment[i];
            const km = distanceKm(a, b);
            pieces.push({ a, b, pa: toXY(a), pb: toXY(b), segmentIndex, startKm: travelled, km });
            travelled += km;
        }
    });
    return { pieces, toXY, mPerDegLng };
};

// 코스 위에서 point와 가장 가까운 위치. maxMeters보다 멀면 null입니다.
export const nearestOnTrack = (index, point, maxMeters) => {
    if (!index) return null;
    const p = index.toXY(point);
    let best = null;
    for (const piece of index.pieces) {
        const dx = piece.pb.x - piece.pa.x;
        const dy = piece.pb.y - piece.pa.y;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((p.x - piece.pa.x) * dx + (p.y - piece.pa.y) * dy) / lengthSq)) : 0;
        const ex = piece.pa.x + dx * t - p.x;
        const ey = piece.pa.y + dy * t - p.y;
        const distSq = ex * ex + ey * ey;
        if (!best || distSq < best.distSq) best = { piece, t, distSq };
    }
    if (!best || best.distSq > maxMeters * maxMeters) return null;
    const { piece, t } = best;
    return {
        lat: piece.a.lat + (piece.b.lat - piece.a.lat) * t,
        lng: piece.a.lng + (piece.b.lng - piece.a.lng) * t,
        km: piece.startKm + piece.km * t,
        segmentIndex: piece.segmentIndex,
        meters: Math.sqrt(best.distSq),
    };
};

const escapeXml = (text) => text.replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));

export const buildGpx = (polylines, { name, type }) => {
    const points = flattenCourse(polylines);
    const safeName = escapeXml(name);
    const trackPoints = points.map(p =>
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><ele>${(p.ele ?? 0).toFixed(1)}</ele></trkpt>`
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trazo" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <type>${type}</type>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>
`;
};

// 파일 이름에 쓸 수 없는 문자를 바꿉니다.
export const safeFileName = (title) => (title.trim() || 'trazo').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
