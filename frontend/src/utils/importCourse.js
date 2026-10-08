// src/utils/importCourse.js
// 컴퓨터에 있는 코스·활동 파일(GPX, TCX, FIT, KML, GeoJSON)을 읽어 지도에서 고칠 수 있는 코스로 바꿉니다.
import { distanceKm } from './course';
import { parseFit } from './fit';
import { waypointTypeFromName, WAYPOINT_MAX, WAYPOINT_NAME_MAX, WAYPOINT_NOTE_MAX } from '../waypoints';

export const IMPORT_ACCEPT = '.gpx,.tcx,.fit,.kml,.geojson,.json';
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const sportFromName = (value) => {
    const text = String(value ?? '').toLowerCase();
    if (/run|jog|trail|hik|walk|foot/.test(text)) return 'run';
    if (/bik|cycl|ride|road|gravel|mtb/.test(text)) return 'bike';
    return null;
};

const number = (value) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
};

// --- XML 형식 ---
// 네임스페이스와 상관없이 태그 이름으로 찾습니다.
const children = (node, name) => [...node.children].filter(child => child.localName === name);
const child = (node, name) => children(node, name)[0] ?? null;
const textOf = (node, name) => child(node, name)?.textContent.trim() ?? '';
const all = (node, name) => [...node.getElementsByTagNameNS('*', name)];

const parseXml = (text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('파일 내용을 읽지 못했어요.');
    return doc;
};

const parseGpx = (doc) => {
    const toPoint = (node) => ({ lat: number(node.getAttribute('lat')), lng: number(node.getAttribute('lon')), ele: number(textOf(node, 'ele')) });
    // 트랙이 없으면 경로(rte)를 씁니다.
    let points = all(doc, 'trkpt').map(toPoint);
    if (!points.length) points = all(doc, 'rtept').map(toPoint);
    const track = all(doc, 'trk')[0] ?? all(doc, 'rte')[0];
    const metadata = all(doc, 'metadata')[0];
    return {
        name: (track && textOf(track, 'name')) || (metadata && textOf(metadata, 'name')) || null,
        sport: sportFromName(track && textOf(track, 'type')),
        points,
        waypoints: all(doc, 'wpt').map(node => ({
            ...toPoint(node),
            type: waypointTypeFromName(textOf(node, 'type'), textOf(node, 'sym')),
            name: textOf(node, 'name'),
            note: textOf(node, 'desc') || textOf(node, 'cmt'),
        })),
    };
};

const tcxPosition = (node) => {
    const position = child(node, 'Position');
    return position ? { lat: number(textOf(position, 'LatitudeDegrees')), lng: number(textOf(position, 'LongitudeDegrees')) } : null;
};

const parseTcx = (doc) => {
    const points = all(doc, 'Trackpoint').map(node => {
        const position = tcxPosition(node);
        return position && { ...position, ele: number(textOf(node, 'AltitudeMeters')) };
    }).filter(Boolean);
    const course = all(doc, 'Course')[0];
    const activity = all(doc, 'Activity')[0];
    return {
        name: (course && textOf(course, 'Name')) || null,
        sport: sportFromName(activity?.getAttribute('Sport')),
        points,
        waypoints: all(doc, 'CoursePoint').map(node => {
            const position = tcxPosition(node);
            if (!position) return null;
            const name = textOf(node, 'Name');
            const notes = textOf(node, 'Notes');
            // Trazo가 만든 TCX는 Notes에 "전체 이름 - 메모"를 넣으므로, 잘린 이름을 전체 이름으로 되돌립니다.
            const fullName = name && notes.startsWith(name) ? notes.split(' - ')[0] : name;
            const note = fullName && notes.startsWith(fullName) ? notes.slice(fullName.length).replace(/^ - /, '') : notes;
            return { ...position, type: waypointTypeFromName(textOf(node, 'PointType')), name: fullName, note };
        }).filter(Boolean),
    };
};

const kmlCoordinates = (text) => text.trim().split(/\s+/).map(tuple => {
    const [lng, lat, ele] = tuple.split(',').map(number);
    return { lat, lng, ele };
});

const parseKml = (doc) => {
    let points = all(doc, 'LineString').flatMap(node => kmlCoordinates(textOf(node, 'coordinates')));
    // 구글 내 지도·스트라바 등이 쓰는 gx:Track
    if (!points.length) {
        points = all(doc, 'coord').map(node => {
            const [lng, lat, ele] = node.textContent.trim().split(/\s+/).map(number);
            return { lat, lng, ele };
        });
    }
    const documentNode = all(doc, 'Document')[0];
    return {
        name: (documentNode && textOf(documentNode, 'name')) || null,
        sport: null,
        points,
        waypoints: all(doc, 'Placemark').map(node => {
            const point = all(node, 'Point')[0];
            if (!point) return null;
            const [coord] = kmlCoordinates(textOf(point, 'coordinates'));
            // Trazo가 만든 KML은 ExtendedData에 유형과 메모를 넣습니다.
            const data = (key) => all(node, 'Data').find(item => item.getAttribute('name') === key)?.textContent.trim();
            const description = textOf(node, 'description').replace(/<[^>]*>/g, ' ').trim();
            return { ...coord, type: waypointTypeFromName(data('type'), textOf(node, 'name')), name: textOf(node, 'name'), note: data('note') ?? description };
        }).filter(Boolean),
    };
};

// --- GeoJSON ---
const parseGeoJson = (text) => {
    const data = JSON.parse(text);
    const features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [{ type: 'Feature', geometry: data, properties: {} }];
    const toPoint = ([lng, lat, ele]) => ({ lat: number(lat), lng: number(lng), ele: number(ele) });
    const points = [];
    const waypoints = [];
    let name = null;
    let sport = null;
    for (const feature of features ?? []) {
        const { geometry, properties = {} } = feature ?? {};
        if (!geometry) continue;
        if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
            const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
            lines.forEach(line => points.push(...line.map(toPoint)));
            name ??= properties.name ?? properties.title ?? null;
            sport ??= sportFromName(properties.sport ?? properties.type);
        } else if (geometry.type === 'Point') {
            waypoints.push({
                ...toPoint(geometry.coordinates),
                type: waypointTypeFromName(properties.type, properties.sym, properties.name),
                name: String(properties.name ?? ''),
                note: String(properties.note ?? properties.description ?? properties.desc ?? ''),
            });
        }
    }
    return { name, sport, points, waypoints };
};

// --- 지도에서 고칠 수 있는 코스로 바꾸기 ---

const isValid = (point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;

// 고도가 빠진 점은 앞뒤 점의 고도로 채웁니다. 고도가 하나도 없으면 0m로 둡니다.
const fillElevation = (points) => {
    const known = points.map((point, i) => (Number.isFinite(point.ele) ? i : -1)).filter(i => i >= 0);
    if (!known.length) return { points: points.map(p => ({ ...p, ele: 0 })), hasElevation: false };
    let k = 0;
    const filled = points.map((point, i) => {
        if (Number.isFinite(point.ele)) return point;
        while (k < known.length - 1 && known[k + 1] < i) k++;
        const before = known[k] < i ? known[k] : null;
        const after = known[k] > i ? known[k] : known[k + 1] ?? null;
        if (before == null) return { ...point, ele: points[after].ele };
        if (after == null) return { ...point, ele: points[before].ele };
        const t = (i - before) / (after - before);
        return { ...point, ele: points[before].ele + (points[after].ele - points[before].ele) * t };
    });
    return { points: filled, hasElevation: true };
};

const MIN_STEP_KM = 0.003;

// 트랙을 몇 km마다 경유점으로 나눕니다. 경유점을 끌면 그 앞뒤 구간만 다시 길을 찾습니다.
const splitTrack = (points) => {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += distanceKm(points[i - 1], points[i]);
    const interval = Math.min(10, Math.max(1, total / 12));
    const cuts = [0];
    let travelled = 0;
    let sinceCut = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const step = distanceKm(points[i - 1], points[i]);
        travelled += step;
        sinceCut += step;
        if (sinceCut >= interval && total - travelled >= interval / 2) {
            cuts.push(i);
            sinceCut = 0;
        }
    }
    cuts.push(points.length - 1);
    const polylines = [];
    for (let i = 1; i < cuts.length; i++) polylines.push(points.slice(cuts[i - 1], cuts[i] + 1));
    const markers = cuts.map(i => ({ lat: points[i].lat, lng: points[i].lng }));
    return { markers, polylines };
};

const readFile = (file, as) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('파일을 열지 못했어요.'));
    if (as === 'buffer') reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
});

// 반환: { title, sport, course: { markers, polylines, waypoints }, hasElevation, skippedWaypoints }
export const importCourseFile = async (file) => {
    if (file.size > MAX_FILE_BYTES) throw new Error('30MB보다 큰 파일은 불러올 수 없어요.');
    const extension = file.name.split('.').pop().toLowerCase();
    let parsed;
    if (extension === 'fit') {
        parsed = parseFit(await readFile(file, 'buffer'));
    } else {
        const text = await readFile(file, 'text');
        if (extension === 'geojson' || extension === 'json') {
            try { parsed = parseGeoJson(text); } catch { throw new Error('GeoJSON 파일을 읽지 못했어요.'); }
        } else {
            const doc = parseXml(text);
            const root = doc.documentElement.localName;
            if (root === 'gpx') parsed = parseGpx(doc);
            else if (root === 'TrainingCenterDatabase') parsed = parseTcx(doc);
            else if (root === 'kml') parsed = parseKml(doc);
            else throw new Error('GPX, TCX, FIT, KML, GeoJSON 파일만 불러올 수 있어요.');
        }
    }

    // 잘못된 점과 너무 가까이 붙은 점을 빼서 코스를 가볍게 만듭니다.
    const points = [];
    for (const point of parsed.points) {
        if (!isValid(point)) continue;
        const last = points.at(-1);
        if (last && distanceKm(last, point) < MIN_STEP_KM) continue;
        points.push({ lat: point.lat, lng: point.lng, ele: point.ele });
    }
    const lastRaw = parsed.points.filter(isValid).at(-1);
    if (lastRaw && points.length && points.at(-1) !== lastRaw && distanceKm(points.at(-1), lastRaw) > 0) {
        points.push({ lat: lastRaw.lat, lng: lastRaw.lng, ele: lastRaw.ele });
    }
    if (points.length < 2) throw new Error('파일에 코스 경로(트랙)가 없어요.');

    const { points: track, hasElevation } = fillElevation(points);
    const rounded = track.map(p => ({ lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)), ele: Math.round(p.ele * 10) / 10 }));
    const validWaypoints = parsed.waypoints.filter(isValid);
    const waypoints = validWaypoints.slice(0, WAYPOINT_MAX).map(w => ({
        lat: Number(w.lat.toFixed(7)),
        lng: Number(w.lng.toFixed(7)),
        type: w.type,
        name: (w.name || '').trim().slice(0, WAYPOINT_NAME_MAX),
        note: (w.note || '').trim().slice(0, WAYPOINT_NOTE_MAX),
    }));
    const fileTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    return {
        title: (parsed.name || fileTitle || '불러온 코스').trim().slice(0, 60),
        sport: parsed.sport,
        course: { ...splitTrack(rounded), waypoints },
        hasElevation,
        skippedWaypoints: validWaypoints.length - waypoints.length,
    };
};
