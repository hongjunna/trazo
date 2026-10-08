// src/waypoints.js
// 웨이포인트 유형과 아이콘. 유형 이름은 FIT 코스 포인트 이름을 그대로 써서
// GPX·TCX·FIT로 내보내면 가민·와후 등 기기에서 코스 포인트(정상·급수·회전 안내 등)로 인식합니다.

// glyph는 24×24 기준 선 그림이고, 오르막 등급은 글자로 표시합니다.
const text = (label) => `<text x="12" y="16.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${label.length > 1 ? 11.5 : 14}" fill="#fff" stroke="none">${label}</text>`;

export const WAYPOINT_TYPES = [
    { id: 'generic', label: '일반', tcx: 'Generic', sym: 'Flag, Blue', color: '#0B4F57', glyph: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4.5L17 13H6"/>' },
    { id: 'summit', label: '정상', tcx: 'Summit', sym: 'Summit', color: '#965A3E', glyph: '<path d="m3 19 6.5-11 3.5 5.5 2.5-3.5L21 19Z"/>' },
    { id: 'valley', label: '계곡', tcx: 'Valley', sym: 'Valley', color: '#3F7D5C', glyph: '<path d="M3 6c3 0 5 12 9 12s6-12 9-12"/>' },
    { id: 'water', label: '급수', tcx: 'Water', sym: 'Drinking Water', color: '#2D8CF0', glyph: '<path d="M12 21a6 6 0 0 0 6-6c0-2-1-3.6-2.6-5.2C13.6 8 12.4 6 12 3.5 11.6 6 10.4 8 8.6 9.8 7 11.4 6 13 6 15a6 6 0 0 0 6 6Z"/>' },
    { id: 'food', label: '음식', tcx: 'Food', sym: 'Restaurant', color: '#E08A00', glyph: '<path d="M5 3v6a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V3"/><path d="M7.5 3v18"/><path d="M19 15V3a4 4 0 0 0-4 4v6a2 2 0 0 0 2 2h2Zm0 0v6"/>' },
    { id: 'danger', label: '위험', tcx: 'Danger', sym: 'Danger Area', color: '#C0392B', glyph: '<path d="M12 4 3 20h18Z"/><path d="M12 10v4.5"/><path d="M12 17.6h.01"/>' },
    { id: 'left', label: '좌회전', tcx: 'Left', sym: 'Left', color: '#15262C', glyph: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-6a5 5 0 0 0-5-5H4"/>' },
    { id: 'right', label: '우회전', tcx: 'Right', sym: 'Right', color: '#15262C', glyph: '<path d="m15 14 5-5-5-5"/><path d="M4 20v-6a5 5 0 0 1 5-5h11"/>' },
    { id: 'straight', label: '직진', tcx: 'Straight', sym: 'Straight', color: '#15262C', glyph: '<path d="m6 10 6-6 6 6"/><path d="M12 4v16"/>' },
    { id: 'first_aid', label: '응급처치', tcx: 'First Aid', sym: 'First Aid', color: '#D6336C', glyph: '<path d="M12 5v14M5 12h14" stroke-width="3.4"/>' },
    { id: 'fourth_category', label: '4등급 오르막', tcx: '4th Category', sym: 'Summit', color: '#6FA83A', glyph: text('4') },
    { id: 'third_category', label: '3등급 오르막', tcx: '3rd Category', sym: 'Summit', color: '#D9A21B', glyph: text('3') },
    { id: 'second_category', label: '2등급 오르막', tcx: '2nd Category', sym: 'Summit', color: '#E07B39', glyph: text('2') },
    { id: 'first_category', label: '1등급 오르막', tcx: '1st Category', sym: 'Summit', color: '#D35233', glyph: text('1') },
    { id: 'hors_category', label: '초특급(HC) 오르막', tcx: 'Hors Category', sym: 'Summit', color: '#8E2A1E', glyph: text('HC') },
    { id: 'sprint', label: '스프린트', tcx: 'Sprint', sym: 'Flag, Green', color: '#6C4BD8', glyph: '<path d="M13 3 5 13.5h6.5L10.5 21 19 10.5h-6.5Z"/>' },
];

export const WAYPOINT_TYPE_IDS = WAYPOINT_TYPES.map(type => type.id);
const BY_ID = Object.fromEntries(WAYPOINT_TYPES.map(type => [type.id, type]));
export const waypointType = (id) => BY_ID[id] ?? BY_ID.generic;

export const WAYPOINT_NAME_MAX = 60;
export const WAYPOINT_NOTE_MAX = 200;
export const WAYPOINT_MAX = 200;

// 웨이포인트 이름이 비어 있으면 유형 이름을 보여줍니다.
export const waypointLabel = (waypoint) => waypoint.name?.trim() || waypointType(waypoint.type).label;

export const waypointIconSvg = (typeId, size = 28) => {
    const type = waypointType(typeId);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">`
        + `<circle cx="14" cy="14" r="12.5" fill="${type.color}" stroke="#fff" stroke-width="2.5"/>`
        + `<g transform="translate(7 7) scale(0.5833)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${type.glyph}</g>`
        + '</svg>';
};

export const waypointIconUri = (typeId, size) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(waypointIconSvg(typeId, size))}`;

// 캔버스(고도 차트, 코스 이미지)에 그릴 아이콘. 크게 그려 두고 줄여 쓰면 선명합니다.
const images = {};
export const waypointImagesReady = typeof Image === 'undefined' ? Promise.resolve() : Promise.all(WAYPOINT_TYPES.map(type => new Promise(resolve => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = waypointIconUri(type.id, 96);
    images[type.id] = image;
})));
export const waypointImage = (typeId) => {
    const image = images[typeId] ?? images.generic;
    return image?.complete && image.naturalWidth ? image : null;
};

// 다른 앱에서 만든 파일의 웨이포인트 종류(GPX type·sym, TCX PointType, FIT 이름)를 우리 유형으로 바꿉니다.
const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// 오르막 등급 여럿이 GPX 기호 'Summit'을 함께 쓰므로, 기호보다 유형 이름이 앞섭니다.
const ALIASES = {
    ...Object.fromEntries(WAYPOINT_TYPES.map(type => [normalize(type.sym), type.id]).reverse()),
    ...Object.fromEntries(WAYPOINT_TYPES.flatMap(type => [[normalize(type.id), type.id], [normalize(type.tcx), type.id]])),
    flag: 'generic', flagblue: 'generic', pin: 'generic', waypoint: 'generic', generic: 'generic',
    peak: 'summit', mountain: 'summit', top: 'summit',
    drinkingwater: 'water', watersource: 'water', fountain: 'water', aidstation: 'water',
    restaurant: 'food', cafe: 'food', store: 'food', convenience: 'food', foodsource: 'food',
    dangerarea: 'danger', caution: 'danger', alert: 'danger', obstacle: 'danger',
    medical: 'first_aid', hospital: 'first_aid', firstaid: 'first_aid',
    turnleft: 'left', slightleft: 'left', sharpleft: 'left', leftfork: 'left',
    turnright: 'right', slightright: 'right', sharpright: 'right', rightfork: 'right',
    continue: 'straight', middlefork: 'straight',
    cat4: 'fourth_category', category4: 'fourth_category', '4thcategory': 'fourth_category',
    cat3: 'third_category', category3: 'third_category', '3rdcategory': 'third_category',
    cat2: 'second_category', category2: 'second_category', '2ndcategory': 'second_category',
    cat1: 'first_category', category1: 'first_category', '1stcategory': 'first_category',
    hc: 'hors_category', horscategorie: 'hors_category',
    flaggreen: 'sprint',
};
export const waypointTypeFromName = (...names) => {
    for (const name of names) {
        const id = ALIASES[normalize(name)];
        if (id) return id;
    }
    return 'generic';
};
