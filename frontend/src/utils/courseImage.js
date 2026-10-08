// src/utils/courseImage.js
// 코스를 A5·A4·A3 용지 크기의 PNG 이미지로 그립니다.
// 화면 밖에 카카오 지도를 하나 더 띄워 코스 전체가 들어오게 맞춘 뒤, 지도 타일을 캔버스에 옮겨 그리고
// 그 위에 코스·웨이포인트를, 아래에 고도 그래프와 웨이포인트 목록을 그립니다.
// 카카오 지도 타일 서버는 CORS를 허용하지 않으므로 같은 주소의 /map-tiles/ 프록시(nginx·vite)를 거쳐 받습니다.
import { distanceMarkers, flattenCourse, distanceKm } from './course';
import { formatDuration } from '../sports';
import { COLORS } from '../styles/theme';
import { waypointImage, waypointImagesReady, waypointLabel } from '../waypoints';
import trazoMark from '../assets/trazo-mark.svg';

export const PAPERS = {
    A5: { label: 'A5', mm: [148, 210] },
    A4: { label: 'A4', mm: [210, 297] },
    A3: { label: 'A3', mm: [297, 420] },
};

const DPI = 150;
const PX_PER_MM = DPI / 25.4;
// 지도는 화면에서 보던 글자 크기와 비슷하게 인쇄되도록 1.5배로 키워 그립니다.
const MAP_SCALE = 1.5;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const TILE_HOSTS = { 'mts.kakaocdn.net': 'mts', 'map.kakaocdn.net': 'map' };
const tileProxyUrl = (src) => {
    try {
        const url = new URL(src, window.location.href);
        const host = TILE_HOSTS[url.hostname];
        return host ? `${import.meta.env.BASE_URL}map-tiles/${host}${url.pathname}${url.search}` : null;
    } catch {
        return null;
    }
};

const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image load failed: ${src}`));
    image.src = src;
});

// 코스의 가로·세로 비율로 알맞은 용지 방향을 고릅니다.
export const suggestOrientation = (polylines) => {
    const points = flattenCourse(polylines);
    if (points.length < 2) return 'portrait';
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const width = distanceKm({ lat: midLat, lng: Math.min(...lngs) }, { lat: midLat, lng: Math.max(...lngs) });
    const height = distanceKm({ lat: Math.min(...lats), lng: 0 }, { lat: Math.max(...lats), lng: 0 });
    return width > height * 1.15 ? 'landscape' : 'portrait';
};

// --- 화면 밖 카카오 지도 ---

const waitForTiles = (map, timeoutMs) => new Promise(resolve => {
    const { event } = window.kakao.maps;
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        event.removeListener(map, 'tilesloaded', finish);
        clearTimeout(timer);
        // 마지막 타일이 화면에 붙을 때까지 한두 프레임 기다립니다.
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    };
    const timer = setTimeout(finish, timeoutMs);
    event.addListener(map, 'tilesloaded', finish);
});

// 지도 영역(캔버스 px) 크기에 맞춰 지도를 띄우고, 타일 그림과 좌표 → 캔버스 위치 변환 결과를 돌려줍니다.
const captureMap = async ({ width, height, bounds, mapType, project }) => {
    const { kakao } = window;
    const cssWidth = Math.round(width / MAP_SCALE);
    const cssHeight = Math.round(height / MAP_SCALE);
    const container = document.createElement('div');
    Object.assign(container.style, { position: 'fixed', left: '-30000px', top: '0', width: `${cssWidth}px`, height: `${cssHeight}px`, pointerEvents: 'none' });
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
    try {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const map = new kakao.maps.Map(container, {
            center: new kakao.maps.LatLng((sw.getLat() + ne.getLat()) / 2, (sw.getLng() + ne.getLng()) / 2),
            level: 8,
            draggable: false,
            scrollwheel: false,
            disableDoubleClick: true,
            disableDoubleClickZoom: true,
            keyboardShortcuts: false,
            tileAnimation: false,
            mapTypeId: mapType === 'satellite' ? kakao.maps.MapTypeId.HYBRID : kakao.maps.MapTypeId.ROADMAP,
        });
        const loaded = waitForTiles(map, 15000);
        const pad = 36;
        map.setBounds(bounds, pad, pad, pad, pad);
        await loaded;

        const box = container.getBoundingClientRect();
        const tiles = [...container.querySelectorAll('img')]
            .map(img => {
                const src = tileProxyUrl(img.currentSrc || img.src);
                if (!src || !/\/(api\/v1\/tile|map_skyview)/.test(src)) return null;
                const rect = img.getBoundingClientRect();
                const tile = {
                    src,
                    x: (rect.left - box.left) * MAP_SCALE,
                    y: (rect.top - box.top) * MAP_SCALE,
                    w: rect.width * MAP_SCALE,
                    h: rect.height * MAP_SCALE,
                };
                const visible = tile.x < width && tile.y < height && tile.x + tile.w > 0 && tile.y + tile.h > 0;
                return visible && rect.width > 0 ? tile : null;
            })
            .filter(Boolean);

        const projection = map.getProjection();
        const toCanvas = (point) => {
            const p = projection.containerPointFromCoords(new kakao.maps.LatLng(point.lat, point.lng));
            return { x: p.x * MAP_SCALE, y: p.y * MAP_SCALE };
        };
        const projected = project(toCanvas);

        const images = await Promise.all(tiles.map(tile => loadImage(tile.src).catch(() => null)));
        return {
            tiles: tiles.map((tile, i) => ({ ...tile, image: images[i] })).filter(tile => tile.image),
            failedTiles: images.filter(image => !image).length,
            ...projected,
        };
    } finally {
        container.remove();
    }
};

// --- 그리기 도우미 ---

const roundRectPath = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

const font = (weight, sizePx) => `${weight} ${Math.round(sizePx)}px ${FONT}`;

const ellipsize = (ctx, text, maxWidth) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return `${text.slice(0, lo)}…`;
};

const haloText = (ctx, text, x, y, haloWidth) => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = haloWidth;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
};

const withAlpha = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const overlaps = (a, list) => list.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);

const niceStep = (range, maxTicks) => {
    const raw = range / maxTicks;
    const power = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map(m => m * power).find(step => range / step <= maxTicks) ?? power * 10;
};

// --- 고도 그래프 ---

const elevationSamples = (points, count) => {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distanceKm(points[i - 1], points[i]));
    const total = cumulative.at(-1);
    const samples = [];
    let j = 0;
    for (let i = 0; i <= count; i++) {
        const km = (total * i) / count;
        while (j < points.length - 2 && cumulative[j + 1] < km) j++;
        const span = cumulative[j + 1] - cumulative[j];
        const t = span > 0 ? (km - cumulative[j]) / span : 0;
        samples.push({ km, ele: (points[j].ele ?? 0) + ((points[j + 1].ele ?? 0) - (points[j].ele ?? 0)) * t });
    }
    // 화면 차트처럼 고도를 조금 부드럽게 다듬습니다.
    const smoothed = samples.map((sample, i) => {
        let sum = 0;
        let n = 0;
        for (let k = i - 2; k <= i + 2; k++) if (samples[k]) { sum += samples[k].ele; n++; }
        return { km: sample.km, ele: sum / n };
    });
    return { samples: smoothed, total };
};

const drawElevation = (ctx, box, { points, zones, waypoints, u }) => {
    const labelSize = 2.6 * u;
    ctx.font = font(500, labelSize);
    const axisWidth = ctx.measureText('8888m').width + 1.5 * u;
    const iconSize = waypoints.length ? 4.6 * u : 0;
    const plot = {
        x: box.x + axisWidth,
        y: box.y + (waypoints.length ? iconSize + 1.8 * u : 1 * u),
        w: box.w - axisWidth - 1 * u,
    };
    plot.h = box.y + box.h - plot.y - labelSize - 1.8 * u;
    const { samples, total } = elevationSamples(points, Math.max(60, Math.round(plot.w / 3)));
    const elevations = samples.map(s => s.ele);
    const low = Math.min(...elevations);
    const high = Math.max(...elevations);
    const half = Math.max((high - low) / 2, 10) * 1.1;
    const mid = (low + high) / 2;
    const yMin = mid - half;
    const yMax = mid + half;
    const xOf = (km) => plot.x + (km / total) * plot.w;
    const yOf = (ele) => plot.y + plot.h - ((ele - yMin) / (yMax - yMin)) * plot.h;

    // 눈금
    ctx.font = font(500, labelSize);
    ctx.fillStyle = COLORS.textMuted;
    ctx.strokeStyle = '#E4E9EB';
    ctx.lineWidth = Math.max(1, 0.2 * u);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const yStep = niceStep(yMax - yMin, 4);
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
        const y = yOf(v);
        ctx.beginPath();
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.w, y);
        ctx.stroke();
        ctx.fillText(`${Math.round(v)}m`, plot.x - 1.2 * u, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = niceStep(total, 8);
    for (let km = 0; km <= total + 1e-9; km += xStep) {
        ctx.fillText(`${Number(km.toFixed(1))}km`, Math.min(plot.x + plot.w - 3 * u, Math.max(plot.x + 3 * u, xOf(km))), plot.y + plot.h + 1.2 * u);
    }

    // 경사 구간별 색으로 칠합니다.
    const zoneFor = (slope) => zones.find(zone => Math.abs(slope) < zone.max) || zones.at(-1);
    // 같은 경사 구간이 이어지는 부분은 한 덩어리로 칠해야 경계에 줄무늬가 생기지 않습니다.
    const colors = samples.map((sample, i) => {
        if (i === 0) return null;
        const meters = (sample.km - samples[i - 1].km) * 1000;
        const slope = meters > 0 ? Math.max(-30, Math.min(30, ((sample.ele - samples[i - 1].ele) / meters) * 100)) : 0;
        return zoneFor(slope).color;
    });
    let runStart = 0;
    for (let i = 1; i < samples.length; i++) {
        if (i < samples.length - 1 && colors[i + 1] === colors[i]) continue;
        const run = samples.slice(runStart, i + 1);
        const color = colors[i];
        ctx.beginPath();
        ctx.moveTo(xOf(run[0].km), plot.y + plot.h);
        run.forEach(sample => ctx.lineTo(xOf(sample.km), yOf(sample.ele)));
        ctx.lineTo(xOf(run.at(-1).km), plot.y + plot.h);
        ctx.closePath();
        ctx.fillStyle = withAlpha(color, 0.38);
        ctx.fill();
        ctx.beginPath();
        run.forEach((sample, k) => (k ? ctx.lineTo(xOf(sample.km), yOf(sample.ele)) : ctx.moveTo(xOf(sample.km), yOf(sample.ele))));
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.55 * u;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        runStart = i;
    }
    ctx.strokeStyle = '#CBD3D6';
    ctx.lineWidth = Math.max(1, 0.25 * u);
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();

    // 웨이포인트
    ctx.font = font(650, 2.5 * u);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let labelEnd = -Infinity;
    waypoints.forEach(waypoint => {
        const x = xOf(Math.min(waypoint.km, total));
        ctx.save();
        ctx.setLineDash([0.9 * u, 0.9 * u]);
        ctx.strokeStyle = 'rgba(21, 38, 44, 0.45)';
        ctx.lineWidth = Math.max(1, 0.25 * u);
        ctx.beginPath();
        ctx.moveTo(x, plot.y - 0.6 * u);
        ctx.lineTo(x, plot.y + plot.h);
        ctx.stroke();
        ctx.restore();
        const image = waypointImage(waypoint.type);
        const iconY = box.y;
        if (image) ctx.drawImage(image, x - iconSize / 2, iconY, iconSize, iconSize);
        const label = waypointLabel(waypoint);
        const width = ctx.measureText(label).width;
        const textX = x + iconSize / 2 + 0.8 * u;
        if (textX > labelEnd + 1.5 * u && textX + width <= box.x + box.w) {
            ctx.fillStyle = COLORS.text;
            haloText(ctx, label, textX, iconY + iconSize / 2, 0.8 * u);
            labelEnd = textX + width;
        } else {
            labelEnd = Math.max(labelEnd, x + iconSize / 2);
        }
    });
};

// --- 지도 위 표시 ---

const drawStart = (ctx, { x, y }, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.primary;
    ctx.fill();
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
};

const drawEnd = (ctx, { x, y }, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = COLORS.text;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.danger;
    ctx.fill();
};

const drawMapLayer = (ctx, box, layer, { sportColor, u }) => {
    ctx.save();
    roundRectPath(ctx, box.x, box.y, box.w, box.h, 2.2 * u);
    ctx.clip();
    ctx.fillStyle = '#EEF1F0';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.translate(box.x, box.y);

    // 지도는 채도를 낮추고 흰색을 덮어 연하게, 코스는 그 위에 진하게 그립니다.
    if ('filter' in ctx) ctx.filter = 'saturate(0.6)';
    layer.tiles.forEach(tile => ctx.drawImage(tile.image, tile.x, tile.y, tile.w, tile.h));
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(0, 0, box.w, box.h);

    const route = new Path2D();
    layer.segments.forEach(segment => segment.forEach((p, i) => (i ? route.lineTo(p.x, p.y) : route.moveTo(p.x, p.y))));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.6 * u;
    ctx.stroke(route);
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 1.8 * u;
    ctx.stroke(route);
    ctx.strokeStyle = sportColor;
    ctx.lineWidth = 1.05 * u;
    ctx.stroke(route);

    const taken = [];
    // 거리 표시
    ctx.font = font(800, 2.3 * u);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    layer.kmMarkers.forEach(marker => {
        const text = `${marker.km}km`;
        const w = ctx.measureText(text).width + 2.4 * u;
        const h = 3.6 * u;
        const rect = { x: marker.x - w / 2, y: marker.y - h / 2, w, h };
        if (overlaps(rect, taken)) return;
        taken.push(rect);
        roundRectPath(ctx, rect.x, rect.y, w, h, h / 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 0.45 * u;
        ctx.strokeStyle = sportColor;
        ctx.stroke();
        ctx.fillStyle = COLORS.primary;
        ctx.fillText(text, marker.x, marker.y + 0.1 * u);
    });

    if (layer.end) drawEnd(ctx, layer.end, 2.2 * u);
    if (layer.start) drawStart(ctx, layer.start, 2.2 * u);

    // 웨이포인트: 아이콘을 먼저 모두 그리고, 이름은 겹치지 않는 쪽(오른쪽→왼쪽)에 붙입니다.
    const iconSize = 5.6 * u;
    layer.waypoints.forEach(w => {
        const image = waypointImage(w.type);
        if (image) ctx.drawImage(image, w.x - iconSize / 2, w.y - iconSize / 2, iconSize, iconSize);
        taken.push({ x: w.x - iconSize / 2, y: w.y - iconSize / 2, w: iconSize, h: iconSize });
    });
    ctx.font = font(700, 2.7 * u);
    ctx.textBaseline = 'middle';
    layer.waypoints.forEach(w => {
        const label = ellipsize(ctx, waypointLabel(w), 40 * u);
        const width = ctx.measureText(label).width;
        const h = 3.4 * u;
        const right = { x: w.x + iconSize / 2 + 0.8 * u, y: w.y - h / 2, w: width, h };
        const left = { x: w.x - iconSize / 2 - 0.8 * u - width, y: w.y - h / 2, w: width, h };
        const spot = [right, left].find(rect => rect.x >= 0 && rect.x + rect.w <= box.w && !overlaps(rect, taken));
        if (!spot) return;
        taken.push(spot);
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.text;
        haloText(ctx, label, spot.x, w.y, 0.9 * u);
    });
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, box.x, box.y, box.w, box.h, 2.2 * u);
    ctx.strokeStyle = '#CBD3D6';
    ctx.lineWidth = Math.max(1, 0.3 * u);
    ctx.stroke();
    ctx.restore();
};

// --- 웨이포인트 목록 ---

const WAYPOINT_ROWS = 6;
const waypointListLayout = (count, columns) => {
    const rows = Math.min(WAYPOINT_ROWS, Math.ceil(count / columns));
    return { rows, shown: Math.min(count, rows * columns) };
};

const drawWaypointList = (ctx, box, { waypoints, columns, rowHeight, u }) => {
    const { rows, shown } = waypointListLayout(waypoints.length, columns);
    const gap = 5 * u;
    const columnWidth = (box.w - gap * (columns - 1)) / columns;
    const iconSize = 4.4 * u;
    ctx.textBaseline = 'middle';
    waypoints.slice(0, shown).forEach((w, i) => {
        // 위에서 아래로, 다음 열로 채웁니다.
        const column = Math.floor(i / rows);
        const row = i % rows;
        const x = box.x + column * (columnWidth + gap);
        const y = box.y + row * rowHeight + rowHeight / 2;
        const image = waypointImage(w.type);
        if (image) ctx.drawImage(image, x, y - iconSize / 2, iconSize, iconSize);
        ctx.font = font(500, 2.6 * u);
        const facts = `${w.km.toFixed(1)}km · ${Math.round(w.ele)}m`;
        const factsWidth = ctx.measureText(facts).width;
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.textSub;
        ctx.fillText(facts, x + columnWidth, y);
        ctx.textAlign = 'left';
        const textX = x + iconSize + 1.6 * u;
        const space = columnWidth - (textX - x) - factsWidth - 2 * u;
        ctx.font = font(700, 2.9 * u);
        ctx.fillStyle = COLORS.text;
        const name = ellipsize(ctx, waypointLabel(w), space);
        ctx.fillText(name, textX, y);
        const nameWidth = ctx.measureText(name).width;
        if (w.note && space - nameWidth > 8 * u) {
            ctx.font = font(500, 2.5 * u);
            ctx.fillStyle = COLORS.textMuted;
            ctx.fillText(ellipsize(ctx, w.note, space - nameWidth - 1.6 * u), textX + nameWidth + 1.6 * u, y);
        }
        ctx.strokeStyle = '#EDF1F2';
        ctx.lineWidth = Math.max(1, 0.2 * u);
        ctx.beginPath();
        ctx.moveTo(x, y + rowHeight / 2);
        ctx.lineTo(x + columnWidth, y + rowHeight / 2);
        ctx.stroke();
    });
    if (shown < waypoints.length) {
        ctx.font = font(600, 2.5 * u);
        ctx.fillStyle = COLORS.textMuted;
        ctx.textAlign = 'right';
        ctx.fillText(`외 ${waypoints.length - shown}개`, box.x + box.w, box.y + rows * rowHeight + 2 * u);
    }
};

// --- 전체 ---

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

// 반환: { blob, width, height, failedTiles }
export const renderCourseImage = async ({ paper = 'A4', orientation = 'portrait', mapType = 'roadmap', title, sport, polylines, markers, waypoints, stats, speedKmh }) => {
    const points = flattenCourse(polylines);
    if (points.length < 2) throw new Error('코스가 없어요.');
    const [shortMm, longMm] = PAPERS[paper].mm;
    const landscape = orientation === 'landscape';
    const width = Math.round((landscape ? longMm : shortMm) * PX_PER_MM);
    const height = Math.round((landscape ? shortMm : longMm) * PX_PER_MM);
    // u: 1mm를 용지 크기에 맞춰 키운 길이 (A4 = 1mm). 글자와 선 굵기의 기준입니다.
    const u = PX_PER_MM * (shortMm / 210);

    const margin = 11 * u;
    const headerHeight = 21 * u;
    const footerHeight = 6 * u;
    const elevationHeight = (landscape ? 30 : 38) * u;
    const columns = landscape ? 3 : 2;
    const rowHeight = 6.4 * u;
    const list = waypointListLayout(waypoints.length, columns);
    const listHeight = waypoints.length ? list.rows * rowHeight + (list.shown < waypoints.length ? 4 * u : 0) + 7 * u : 0;
    const gap = 5 * u;
    const inner = { x: margin, w: width - margin * 2 };
    const mapBox = { x: inner.x, y: margin + headerHeight, w: inner.w };
    mapBox.h = height - margin - footerHeight - gap - listHeight - elevationHeight - gap - mapBox.y;
    const elevationBox = { x: inner.x, y: mapBox.y + mapBox.h + gap, w: inner.w, h: elevationHeight };
    const listBox = { x: inner.x, y: elevationBox.y + elevationBox.h + gap + 6 * u, w: inner.w };

    const { kakao } = window;
    const bounds = new kakao.maps.LatLngBounds();
    points.forEach(p => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    waypoints.forEach(w => bounds.extend(new kakao.maps.LatLng(w.lat, w.lng)));
    const kmMarkers = distanceMarkers(polylines, sport.distanceMarkerKm, 24);
    const startPoint = markers[0] ?? points[0];
    const endPoint = markers.length > 1 ? markers.at(-1) : points.at(-1);

    const sportLabel = sport.label;
    const statsLine = [
        `${sportLabel} 코스`,
        `거리 ${stats.distanceKm.toFixed(stats.distanceKm >= 100 ? 1 : 2)}km`,
        `상승 ${Math.round(stats.ascentM).toLocaleString()}m`,
        `하강 ${Math.round(stats.descentM).toLocaleString()}m`,
        `예상 ${formatDuration(stats.distanceKm / speedKmh)}`,
    ].join('  ·  ');
    const footerLeft = '지도 © Kakao  ·  경로 데이터 © OpenStreetMap 기여자';
    const footerRight = `${window.location.host}  ·  ${today()}`;

    // 웹 글꼴은 쓰는 글자만 받아 오므로, 그리기 전에 필요한 글자를 모두 불러 둡니다.
    const allText = [title, statsLine, footerLeft, footerRight, 'Trazo 고도 외개km0123456789m·…', ...waypoints.flatMap(w => [waypointLabel(w), w.note || ''])].join('');
    const fontLoads = document.fonts ? Promise.all([500, 600, 650, 700, 800].map(weight => document.fonts.load(`${weight} 16px "Pretendard Variable"`, allText).catch(() => null))) : Promise.resolve();

    const [layer, logo] = await Promise.all([
        captureMap({
            width: mapBox.w,
            height: mapBox.h,
            bounds,
            mapType,
            project: (toCanvas) => ({
                segments: polylines.map(segment => segment.map(toCanvas)),
                kmMarkers: kmMarkers.map(marker => ({ km: marker.km, ...toCanvas(marker) })),
                start: startPoint && toCanvas(startPoint),
                end: endPoint && toCanvas(endPoint),
                waypoints: waypoints.map(w => ({ ...w, ...toCanvas(w) })),
            }),
        }),
        loadImage(trazoMark).catch(() => null),
        fontLoads,
        waypointImagesReady,
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // 로고 (오른쪽 위)
    const logoSize = 9 * u;
    ctx.font = font(800, 5.6 * u);
    const wordWidth = ctx.measureText('Trazo').width;
    const logoWidth = logoSize + 2 * u + wordWidth;
    const logoX = width - margin - logoWidth;
    const logoY = margin;
    roundRectPath(ctx, logoX, logoY, logoSize, logoSize, 2.2 * u);
    ctx.fillStyle = COLORS.primary;
    ctx.fill();
    if (logo) ctx.drawImage(logo, logoX + logoSize * 0.14, logoY + logoSize * 0.14, logoSize * 0.72, logoSize * 0.72);
    ctx.fillStyle = COLORS.primary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Trazo', logoX + logoSize + 2 * u, logoY + logoSize / 2 + 0.2 * u);

    // 제목과 코스 정보
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.text;
    ctx.font = font(800, 7.4 * u);
    ctx.fillText(ellipsize(ctx, title, inner.w - logoWidth - 8 * u), margin, margin + 7.2 * u);
    ctx.font = font(600, 3.2 * u);
    ctx.fillStyle = COLORS.textSub;
    ctx.fillText(ellipsize(ctx, statsLine, inner.w - logoWidth - 6 * u), margin, margin + 14.2 * u);
    ctx.fillStyle = sport.color;
    ctx.fillRect(margin, margin + 17.2 * u, 14 * u, 1 * u);

    drawMapLayer(ctx, mapBox, layer, { sportColor: sport.color, u });

    // 고도 그래프
    ctx.save();
    ctx.font = font(700, 3 * u);
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const elevations = points.map(p => p.ele ?? 0);
    const heading = '고도';
    ctx.fillText(heading, elevationBox.x, elevationBox.y + 3 * u);
    ctx.font = font(500, 2.6 * u);
    ctx.fillStyle = COLORS.textSub;
    ctx.fillText(`최고 ${Math.round(Math.max(...elevations))}m · 최저 ${Math.round(Math.min(...elevations))}m`, elevationBox.x + ctx.measureText(heading).width * 1.25 + 3 * u, elevationBox.y + 3 * u);
    // 경사 범례 (오른쪽)
    ctx.textAlign = 'right';
    let legendX = elevationBox.x + elevationBox.w;
    [...sport.gradeZones].reverse().forEach(zone => {
        ctx.fillStyle = COLORS.textSub;
        ctx.fillText(zone.label, legendX, elevationBox.y + 3 * u);
        legendX -= ctx.measureText(zone.label).width + 1.2 * u;
        ctx.fillStyle = zone.color;
        ctx.fillRect(legendX - 2.2 * u, elevationBox.y + 1 * u, 2.2 * u, 2.2 * u);
        legendX -= 5 * u;
    });
    ctx.restore();
    drawElevation(ctx, { x: elevationBox.x, y: elevationBox.y + 5.5 * u, w: elevationBox.w, h: elevationBox.h - 5.5 * u }, { points, zones: sport.gradeZones, waypoints, u });

    // 웨이포인트 목록
    if (waypoints.length) {
        ctx.font = font(700, 3 * u);
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`웨이포인트 ${waypoints.length}개`, listBox.x, listBox.y - 2 * u);
        drawWaypointList(ctx, listBox, { waypoints, columns, rowHeight, u });
    }

    // 출처
    ctx.font = font(500, 2.4 * u);
    ctx.fillStyle = COLORS.textMuted;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(footerLeft, margin, height - margin + 1 * u);
    ctx.textAlign = 'right';
    ctx.fillText(footerRight, width - margin, height - margin + 1 * u);

    const blob = await new Promise((resolve, reject) => canvas.toBlob(result => (result ? resolve(result) : reject(new Error('이미지를 만들지 못했어요.'))), 'image/png'));
    return { blob, width, height, failedTiles: layer.failedTiles, tileCount: layer.tiles.length };
};
