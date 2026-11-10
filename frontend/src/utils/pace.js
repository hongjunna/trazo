// src/utils/pace.js
// 러닝 페이스 계산: 거리(km)·시간(초)·페이스(초/km) 중 둘로 나머지를 구하고, 구간 기록과 다른 거리 예상 기록을 만듭니다.

export const RACE_DISTANCES = [
    { id: '5k', label: '5km', km: 5 },
    { id: '10k', label: '10km', km: 10 },
    { id: 'half', label: '하프', km: 21.0975 },
    { id: 'full', label: '풀코스', km: 42.195 },
];
export const MILE_KM = 1.609344;
export const TRACK_LAP_KM = 0.4;
// 리겔(Riegel) 공식의 피로 지수. 한 거리 기록으로 다른 거리 기록을 어림합니다.
export const RIEGEL_EXPONENT = 1.06;

const valid = (value) => Number.isFinite(value) && value > 0;

export const paceFrom = (km, seconds) => (valid(km) && valid(seconds) ? seconds / km : null);
export const timeFrom = (km, paceSeconds) => (valid(km) && valid(paceSeconds) ? km * paceSeconds : null);
export const distanceFrom = (seconds, paceSeconds) => (valid(seconds) && valid(paceSeconds) ? seconds / paceSeconds : null);
export const speedKmh = (paceSeconds) => (valid(paceSeconds) ? 3600 / paceSeconds : null);

export const riegel = (km, seconds, targetKm) => (valid(km) && valid(seconds) && valid(targetKm)
    ? seconds * (targetKm / km) ** RIEGEL_EXPONENT
    : null);

// 1km마다 누적 기록. 마지막 구간이 1km보다 짧으면 끝 거리로 한 줄을 더합니다.
export const splits = (km, paceSeconds, limit = 60) => {
    if (!valid(km) || !valid(paceSeconds)) return [];
    const rows = [];
    for (let at = 1; at < km && rows.length < limit; at++) rows.push({ km: at, seconds: at * paceSeconds });
    rows.push({ km: Math.round(km * 1000) / 1000, seconds: km * paceSeconds });
    return rows;
};

// 초 → "1:05:09" 또는 "5:09"
export const formatDuration = (seconds, { decimals = 0 } = {}) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '-';
    const factor = 10 ** decimals;
    const total = Math.round(seconds * factor) / factor;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total - h * 3600 - m * 60;
    const sec = decimals ? s.toFixed(decimals).padStart(3 + decimals, '0') : String(Math.round(s)).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export const toSeconds = ({ h = 0, m = 0, s = 0 }) => {
    const values = [h, m, s].map(value => (value === '' || value == null ? 0 : Number(value)));
    if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
    const total = values[0] * 3600 + values[1] * 60 + values[2];
    return total > 0 ? total : null;
};
