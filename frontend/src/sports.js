// src/sports.js
// 종목별 길찾기, 표시, 기록 기준을 한곳에서 정의합니다.
import { COLORS } from './styles/theme';

export const SPORTS = {
    bike: {
        id: 'bike',
        label: '자전거',
        icon: 'bike',
        color: COLORS.bike,
        // 경로 위 글자색 (라임 위에는 흰 글씨가 잘 보이지 않음)
        onColor: COLORS.primary,
        tagline: '자전거도로와 자전거 노선을 우선으로 길을 찾아요',
        defaultTitle: '나의 라이딩 코스',
        gpxType: 'cycling',
        showBicycleOverlay: true,
        // 1km 표시는 자전거 코스에 너무 촘촘하므로 5km마다 표시합니다.
        distanceMarkerKm: 5,
        // 예상 시간과 코스 파일 시간 계산의 기본값
        defaultSpeedKmh: 20,
        speedInput: 'speed',
        routeOptions: [
            { id: 'prefer_bikeway', label: '자전거길 우선', desc: '자전거도로·국토종주 등 자전거 노선을 더 많이 이용해요', defaultOn: true },
            { id: 'avoid_big_roads', label: '큰 차도 피하기', desc: '차량이 많은 간선도로를 덜 지나가요', defaultOn: true },
            { id: 'avoid_unpaved', label: '비포장 피하기', desc: '흙길·자갈길을 피해 포장도로로 달려요', defaultOn: true },
            { id: 'avoid_hills', label: '오르막 줄이기', desc: '경사가 급한 길을 돌아가요', defaultOn: false },
        ],
        // 경사 구간 (절댓값 기준, 고도 차트와 범례에 함께 사용)
        gradeZones: [
            { max: 3, label: '평지 (0~3%)', desc: '편하게 달리는 구간', color: '#4A90E2' },
            { max: 6, label: '완만한 오르막 (3~6%)', desc: '꾸준히 밟는 구간', color: COLORS.bike },
            { max: 10, label: '업힐 (6~10%)', desc: '기어를 낮추는 구간', color: COLORS.secondary },
            { max: Infinity, label: '급경사 (10%+)', desc: '한계에 도전하는 구간', color: COLORS.danger },
        ],
        emptyHint: '지도를 클릭해 출발점을 찍고, 이어서 경유지를 찍어 라이딩 코스를 만드세요.',
    },
    run: {
        id: 'run',
        label: '러닝',
        icon: 'run',
        color: COLORS.run,
        onColor: COLORS.white,
        tagline: '공원길·강변 산책로처럼 달리기 좋은 길을 우선으로 찾아요',
        defaultTitle: '나의 러닝 코스',
        gpxType: 'running',
        showBicycleOverlay: false,
        distanceMarkerKm: 1,
        defaultSpeedKmh: 10, // 6:00/km
        speedInput: 'pace',
        routeOptions: [
            { id: 'prefer_trails', label: '공원·산책로 우선', desc: '보행로·공원길·강변길·걷기 노선을 더 많이 이용해요', defaultOn: true },
            { id: 'avoid_big_roads', label: '큰 차도 피하기', desc: '차량이 많은 큰길 옆 인도를 덜 지나가요', defaultOn: true },
            { id: 'avoid_stairs', label: '계단 피하기', desc: '흐름이 끊기는 계단을 돌아가요', defaultOn: true },
            { id: 'avoid_unpaved', label: '비포장 피하기', desc: '트레일·흙길을 피해 포장된 길로 달려요', defaultOn: false },
            { id: 'avoid_hills', label: '오르막 줄이기', desc: '경사가 급한 길을 돌아가요', defaultOn: false },
        ],
        gradeZones: [
            { max: 2, label: '평지 (0~2%)', desc: '페이스를 유지하는 구간', color: '#4A90E2' },
            { max: 5, label: '완만한 오르막 (2~5%)', desc: '호흡이 올라가는 구간', color: COLORS.bike },
            { max: 8, label: '오르막 (5~8%)', desc: '보폭을 줄이는 구간', color: COLORS.secondary },
            { max: Infinity, label: '급경사 (8%+)', desc: '걷기도 고려할 구간', color: COLORS.danger },
        ],
        emptyHint: '지도를 클릭해 출발점을 찍고, 이어서 경유지를 찍어 러닝 코스를 만드세요.',
    },
};

export const SPORT_IDS = Object.keys(SPORTS);

export const isSport = (value) => SPORT_IDS.includes(value);

export const defaultRouteOptions = (sportId) =>
    Object.fromEntries(SPORTS[sportId].routeOptions.map(option => [option.id, option.defaultOn]));

// 러닝 페이스(분/km) ↔ 속도(km/h)
export const paceFromSpeed = (kmh) => 60 / kmh;
export const speedFromPace = (minPerKm) => 60 / minPerKm;

export const formatPace = (kmh) => {
    const totalSeconds = Math.round(paceFromSpeed(kmh) * 60);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export const parsePace = (text) => {
    const match = /^\s*(\d{1,2})(?::(\d{1,2}))?\s*$/.exec(text);
    if (!match) return null;
    const minutes = Number(match[1]) + Number(match[2] || 0) / 60;
    return minutes >= 2 && minutes <= 20 ? minutes : null;
};

export const formatDuration = (hours) => {
    if (!Number.isFinite(hours) || hours <= 0) return '0분';
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h ? `${h}시간 ${m}분` : `${m}분`;
};
