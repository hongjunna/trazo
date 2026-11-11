// frontend/src/utils/insight.js
// 코스 분석(난이도·테마·소개 문장) 관련 상수와 유틸리티
// 백엔드 backend/course_insight.py 와 동기화해야 합니다.

export const LEVEL_LABELS = {
  1: '입문',
  2: '쉬움',
  3: '보통',
  4: '어려움',
  5: '매우 어려움',
};

// 화면의 난이도 설명 (frontend/src/insight.js 에 있던 내용과 동일)
export const LEVEL_DESCRIPTIONS = {
  run: {
    1: '5km 미만 평지. 처음 달리는 사람도 걷고 뛰며 완주할 수 있어요.',
    2: '5~10km 평지, 또는 짧은 코스에 완만한 오르막. 주 1~2회 달리는 사람에게 맞아요.',
    3: '10~18km 평지, 또는 오르막이 꽤 있어요. 10km를 쉬지 않고 달리는 사람에게 맞아요.',
    4: '하프 거리 안팎, 또는 상승 300~700m의 언덕·산길. 꾸준히 훈련하는 러너에게 맞아요.',
    5: '30km 이상, 또는 상승 700m 이상의 산길·트레일. 풀코스·트레일 경험자에게 맞아요.',
  },
  bike: {
    1: '30km 미만 평지 자전거길. 누구나 가볍게 탈 수 있어요.',
    2: '30~60km, 오르막이 적어요. 자전거에 익숙한 사람에게 맞아요.',
    3: '60~100km, 또는 상승 300~1,000m. 꾸준히 타는 사람에게 맞아요.',
    4: '100~150km, 또는 상승 1,000~2,000m (메디오폰도급). 장거리 경험이 있는 사람에게 맞아요.',
    5: '150km 이상, 또는 상승 2,000m 이상 (그란폰도급). 고개 여러 개를 넘는 경험자에게 맞아요.',
  },
};

export const TERRAIN_KO = {
  flat: '평지',
  rolling: '완만한 언덕',
  hilly: '업힐이 있음',
  mountain: '고갯길',
};

export const SHAPE_KO = {
  loop: '순환',
  out_and_back: '왕복',
  point_to_point: '편도',
};

export const TRAINING_KO = {
  interval: '인터벌',
  tempo: '템포런',
  hill_repeat: '언덕 반복',
  lsd: 'LSD(장거리 천천히)',
  recovery: '회복런',
  race_pace: '레이스 페이스',
  hill_climb: '업힐 훈련',
  endurance: '지구력',
  recovery_ride: '회복 라이딩',
  steady_pace: '페이스 유지',
};

/**
 * 난이도 레벨(1~5)에 해당하는 라벨 반환
 */
export function getLevelLabel(level) {
  return LEVEL_LABELS[level] ?? `${level}단계`;
}

/**
 * 종목과 난이도 레벨에 해당하는 설명 반환
 */
export function getLevelDescription(sport, level) {
  return LEVEL_DESCRIPTIONS[sport]?.[level] ?? '';
}

/**
 * 지형 타입 한글 라벨 반환
 */
export function getTerrainLabel(terrain) {
  return TERRAIN_KO[terrain] ?? terrain;
}

/**
 * 코스 형태 한글 라벨 반환
 */
export function getShapeLabel(shape) {
  return SHAPE_KO[shape] ?? shape;
}

/**
 * 추천 훈련 타입 한글 라벨 배열 반환
 */
export function getTrainingLabels(training) {
  return (training ?? []).map((t) => TRAINING_KO[t] ?? t).filter(Boolean);
}

/**
 * 테마 한글 라벨 매핑
 */
export const THEME_LABELS = {
  riverside: '강변',
  park: '공원',
  lake: '호수',
  coast: '해안',
  mountain_forest: '산·숲길',
  urban: '도심',
  night_view: '야경',
  seasonal: '계절',
  track: '트랙',
  race_course: '대회 코스',
  commute: '출퇴근',
};

/**
 * 테마별 아이콘 매핑
 */
export const THEME_ICONS = {
  riverside: 'flag',
  park: 'mountain',
  lake: 'mountain',
  coast: 'flag',
  mountain_forest: 'mountain',
  urban: 'street',
  night_view: 'street',
  seasonal: 'sparkles',
  track: 'track',
  race_course: 'target',
  commute: 'bike',
};

/**
 * 테마 배열을 한글 라벨 배열로 변환
 * 알 수 없는 테마는 제외합니다.
 */
export function getThemeLabels(themes) {
  return (themes ?? []).map((t) => THEME_LABELS[t]).filter(Boolean);
}

/**
 * 테마 배열을 {label, icon} 객체 배열로 변환
 */
export function getThemeObjects(themes) {
  return (themes ?? [])
    .map((t) => {
      const label = THEME_LABELS[t];
      if (!label) return null;
      return { label, icon: THEME_ICONS[t] ?? 'tag' };
    })
    .filter(Boolean);
}
