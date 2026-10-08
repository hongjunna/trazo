// src/utils/fit.js
// 가민 FIT 코스 파일 쓰기와 FIT 파일(코스·활동 기록) 읽기.
// 필요한 메시지만 다루는 작은 구현입니다. 형식은 FIT SDK 프로토콜 1.0을 따릅니다.
import { waypointTypeFromName, WAYPOINT_TYPE_IDS } from '../waypoints';

const FIT_EPOCH_S = 631065600; // 1989-12-31T00:00:00Z
const SEMICIRCLE = 2 ** 31 / 180;

const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
const crc16 = (bytes, start = 0, end = bytes.length) => {
    let crc = 0;
    for (let i = start; i < end; i++) {
        const byte = bytes[i];
        let tmp = CRC_TABLE[crc & 0xF];
        crc = (crc >> 4) & 0x0FFF;
        crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];
        tmp = CRC_TABLE[crc & 0xF];
        crc = (crc >> 4) & 0x0FFF;
        crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
    }
    return crc;
};

// 기본 자료형: [번호, 크기, 값이 없을 때]
const T = {
    enum: [0x00, 1, 0xFF],
    uint8: [0x02, 1, 0xFF],
    uint16: [0x84, 2, 0xFFFF],
    sint32: [0x85, 4, 0x7FFFFFFF],
    uint32: [0x86, 4, 0xFFFFFFFF],
    uint32z: [0x8C, 4, 0],
    string: [0x07, 0, 0],
};

const MESG = { file_id: 0, course: 31, lap: 19, event: 21, record: 20, course_point: 32, session: 18, sport: 12 };
const SPORT = { run: 1, bike: 2 };

const encoder = new TextEncoder();
// 고정 길이 문자열: UTF-8 글자가 중간에서 잘리지 않게 자르고 0으로 끝냅니다.
const fitString = (text, size) => {
    const bytes = encoder.encode(text);
    let length = Math.min(bytes.length, size - 1);
    while (length > 0 && (bytes[length] & 0xC0) === 0x80) length--;
    const out = new Uint8Array(size);
    out.set(bytes.subarray(0, length));
    return out;
};

class FitWriter {
    constructor() {
        this.chunks = [];
        this.size = 0;
        this.defs = {};
    }

    push(bytes) {
        this.chunks.push(bytes);
        this.size += bytes.length;
    }

    // fields: [[필드 번호, 자료형, 문자열이면 크기]]
    define(local, global, fields) {
        const resolved = fields.map(([num, type, size]) => ({ num, type: T[type], size: size ?? T[type][1] }));
        const bytes = new Uint8Array(6 + resolved.length * 3);
        const view = new DataView(bytes.buffer);
        bytes[0] = 0x40 | local;
        bytes[2] = 0; // 리틀 엔디언
        view.setUint16(3, global, true);
        bytes[5] = resolved.length;
        resolved.forEach((field, i) => {
            bytes[6 + i * 3] = field.num;
            bytes[7 + i * 3] = field.size;
            bytes[8 + i * 3] = field.type[0];
        });
        this.defs[local] = resolved;
        this.push(bytes);
    }

    write(local, values) {
        const fields = this.defs[local];
        const bytes = new Uint8Array(1 + fields.reduce((sum, field) => sum + field.size, 0));
        const view = new DataView(bytes.buffer);
        bytes[0] = local;
        let offset = 1;
        fields.forEach((field, i) => {
            const value = values[i];
            const [base, , invalid] = field.type;
            if (base === T.string[0]) {
                bytes.set(fitString(value ?? '', field.size), offset);
            } else {
                const number = value == null || !Number.isFinite(value) ? invalid : Math.round(value);
                if (field.size === 1) bytes[offset] = number;
                else if (field.size === 2) view.setUint16(offset, number, true);
                else if (base === T.sint32[0]) view.setInt32(offset, number, true);
                else view.setUint32(offset, number, true);
            }
            offset += field.size;
        });
        this.push(bytes);
    }

    finish() {
        const header = new Uint8Array(14);
        const view = new DataView(header.buffer);
        header[0] = 14;
        header[1] = 0x10; // 프로토콜 1.0
        view.setUint16(2, 2132, true); // 프로필 21.32
        view.setUint32(4, this.size, true);
        header.set(encoder.encode('.FIT'), 8);
        view.setUint16(12, crc16(header, 0, 12), true);
        const out = new Uint8Array(14 + this.size + 2);
        out.set(header);
        let offset = 14;
        this.chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.length; });
        new DataView(out.buffer).setUint16(offset, crc16(out, 0, offset), true);
        return out;
    }
}

// points: 코스 점 [{lat, lng, ele}], waypoints: locateWaypoints 결과, speedKmh: 예상 시간 계산 속도
export const buildFit = (points, { name, sport, speedKmh, waypoints = [] }, distanceKm) => {
    const speed = speedKmh / 3.6;
    const start = Math.floor(Date.now() / 1000) - FIT_EPOCH_S;
    const lat = (deg) => deg * SEMICIRCLE;
    const alt = (ele) => Math.max(0, Math.min(0xFFFE, ((ele ?? 0) + 500) * 5));

    // 점마다 누적 거리(m)와 시각을 계산합니다.
    const track = [];
    let distance = 0;
    let ascent = 0;
    let descent = 0;
    points.forEach((point, i) => {
        if (i > 0) {
            distance += distanceKm(points[i - 1], point) * 1000;
            const climb = (point.ele ?? 0) - (points[i - 1].ele ?? 0);
            if (climb > 0) ascent += climb;
            else descent -= climb;
        }
        track.push({ point, distance, time: start + Math.round(distance / speed) });
    });
    const end = track.at(-1);
    const timeAt = (meters) => start + Math.round(meters / speed);

    const fit = new FitWriter();
    fit.define(0, MESG.file_id, [[0, 'enum'], [1, 'uint16'], [2, 'uint16'], [4, 'uint32'], [3, 'uint32z']]);
    fit.write(0, [6, 255, 1, start, 1]); // 파일 종류 6: 코스, 제조사 255: 개발용

    fit.define(1, MESG.course, [[4, 'enum'], [5, 'string', 48]]);
    fit.write(1, [SPORT[sport] ?? 0, name]);

    fit.define(2, MESG.lap, [[253, 'uint32'], [2, 'uint32'], [3, 'sint32'], [4, 'sint32'], [5, 'sint32'], [6, 'sint32'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'], [21, 'uint16'], [22, 'uint16']]);
    const totalMs = (end.time - start) * 1000;
    fit.write(2, [start, start, lat(points[0].lat), lat(points[0].lng), lat(end.point.lat), lat(end.point.lng), totalMs, totalMs, end.distance * 100, ascent, descent]);

    fit.define(3, MESG.event, [[253, 'uint32'], [0, 'enum'], [1, 'enum'], [4, 'uint8']]);
    fit.write(3, [start, 0, 0, 0]); // 타이머 시작

    fit.define(4, MESG.record, [[253, 'uint32'], [0, 'sint32'], [1, 'sint32'], [5, 'uint32'], [2, 'uint16']]);
    track.forEach(({ point, distance: meters, time }) => fit.write(4, [time, lat(point.lat), lat(point.lng), meters * 100, alt(point.ele)]));

    if (waypoints.length) {
        fit.define(5, MESG.course_point, [[254, 'uint16'], [1, 'uint32'], [2, 'sint32'], [3, 'sint32'], [4, 'uint32'], [5, 'enum'], [6, 'string', 32]]);
        waypoints.forEach((waypoint, i) => {
            const meters = Math.min(waypoint.km * 1000, end.distance);
            const type = WAYPOINT_TYPE_IDS.indexOf(waypoint.type);
            fit.write(5, [i, timeAt(meters), lat(waypoint.lat), lat(waypoint.lng), meters * 100, type < 0 ? 0 : type, waypoint.name || '']);
        });
    }

    fit.write(3, [end.time, 0, 9, 0]); // 타이머 정지
    return fit.finish();
};

// --- 읽기 ---

const BASE_SIZE = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8 };
const decoder = new TextDecoder();

const readValue = (view, offset, size, baseType, little) => {
    const base = baseType & 0x1F;
    if (base === 7) {
        const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, size);
        const zero = bytes.indexOf(0);
        return decoder.decode(zero >= 0 ? bytes.subarray(0, zero) : bytes);
    }
    // 배열 필드는 첫 값만 읽습니다.
    if (BASE_SIZE[base] > size) return null;
    switch (base) {
        case 0: case 2: case 10: case 13: { const v = view.getUint8(offset); return v === 0xFF || (base === 10 && v === 0) ? null : v; }
        case 1: { const v = view.getInt8(offset); return v === 0x7F ? null : v; }
        case 3: { const v = view.getInt16(offset, little); return v === 0x7FFF ? null : v; }
        case 4: case 11: { const v = view.getUint16(offset, little); return v === 0xFFFF || (base === 11 && v === 0) ? null : v; }
        case 5: { const v = view.getInt32(offset, little); return v === 0x7FFFFFFF ? null : v; }
        case 6: case 12: { const v = view.getUint32(offset, little); return v === 0xFFFFFFFF || (base === 12 && v === 0) ? null : v; }
        case 8: { const v = view.getFloat32(offset, little); return Number.isFinite(v) ? v : null; }
        case 9: { const v = view.getFloat64(offset, little); return Number.isFinite(v) ? v : null; }
        default: return null;
    }
};

// FIT 파일의 메시지를 { global, fields: {번호: 값} } 목록으로 읽습니다.
const readMessages = (buffer, wanted) => {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if (bytes.length < 12 || decoder.decode(bytes.subarray(8, 12)) !== '.FIT') throw new Error('FIT 파일이 아니에요.');
    const headerSize = bytes[0];
    const end = Math.min(bytes.length, headerSize + view.getUint32(4, true));
    const defs = {};
    const messages = [];
    let lastTimestamp = 0;
    let pos = headerSize;
    while (pos < end) {
        const header = bytes[pos++];
        if (header & 0x80) {
            // 압축된 시각 머리글: 마지막 시각에서 하위 5비트만 바뀝니다.
            const def = defs[(header >> 5) & 0x3];
            if (!def) throw new Error('FIT 파일을 읽지 못했어요.');
            const offset = header & 0x1F;
            lastTimestamp = (lastTimestamp & ~0x1F) + offset + (offset >= (lastTimestamp & 0x1F) ? 0 : 0x20);
            pos = readData(view, pos, def, wanted, messages, lastTimestamp);
            continue;
        }
        const local = header & 0x0F;
        if (header & 0x40) {
            const little = bytes[pos + 1] === 0;
            const global = little ? view.getUint16(pos + 2, true) : view.getUint16(pos + 2, false);
            const count = bytes[pos + 4];
            pos += 5;
            const fields = [];
            for (let i = 0; i < count; i++, pos += 3) fields.push({ num: bytes[pos], size: bytes[pos + 1], type: bytes[pos + 2] });
            let devSize = 0;
            if (header & 0x20) {
                const devCount = bytes[pos++];
                for (let i = 0; i < devCount; i++, pos += 3) devSize += bytes[pos + 1];
            }
            defs[local] = { global, little, fields, devSize };
        } else {
            const def = defs[local];
            if (!def) throw new Error('FIT 파일을 읽지 못했어요.');
            const before = messages.length;
            pos = readData(view, pos, def, wanted, messages, null);
            const timestamp = messages.length > before ? messages.at(-1).fields[253] : null;
            if (timestamp != null) lastTimestamp = timestamp;
        }
    }
    return messages;
};

const readData = (view, pos, def, wanted, messages, compressedTimestamp) => {
    const keep = wanted.has(def.global);
    const fields = {};
    for (const field of def.fields) {
        if (keep) fields[field.num] = readValue(view, pos, field.size, field.type, def.little);
        pos += field.size;
    }
    if (keep) {
        if (compressedTimestamp != null) fields[253] = compressedTimestamp;
        messages.push({ global: def.global, fields });
    }
    return pos + def.devSize;
};

const FIT_TYPE_NAMES = WAYPOINT_TYPE_IDS;

// 반환: { name, sport, points: [{lat, lng, ele}], waypoints: [{lat, lng, type, name, note}] }
export const parseFit = (buffer) => {
    const messages = readMessages(buffer, new Set(Object.values(MESG)));
    const fromSemicircles = (value) => (value == null ? null : value / SEMICIRCLE);
    const points = [];
    const waypoints = [];
    let name = null;
    let sportCode = null;
    for (const { global, fields } of messages) {
        if (global === MESG.record) {
            const lat = fromSemicircles(fields[0]);
            const lng = fromSemicircles(fields[1]);
            if (lat == null || lng == null) continue;
            const altitude = fields[78] ?? fields[2];
            points.push({ lat, lng, ele: altitude == null ? null : altitude / 5 - 500 });
        } else if (global === MESG.course_point) {
            const lat = fromSemicircles(fields[2]);
            const lng = fromSemicircles(fields[3]);
            if (lat == null || lng == null) continue;
            const typeName = FIT_TYPE_NAMES[fields[5]] ?? 'generic';
            waypoints.push({ lat, lng, type: waypointTypeFromName(typeName), name: fields[6] || '', note: '' });
        } else if (global === MESG.course) {
            name = fields[5] || name;
            sportCode = fields[4] ?? sportCode;
        } else if ((global === MESG.session || global === MESG.sport) && sportCode == null) {
            sportCode = global === MESG.session ? fields[5] : fields[0];
        }
    }
    const sport = sportCode === SPORT.run ? 'run' : sportCode === SPORT.bike ? 'bike' : null;
    return { name, sport, points, waypoints };
};
