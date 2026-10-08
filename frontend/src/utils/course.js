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
