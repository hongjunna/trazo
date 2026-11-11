// src/utils/aiReport.js
// AI 리포트 안내와 업데이트 안내를 다시 보여줄지 기억합니다.
import { readStored, writeStored } from './storage';

// AI 리포트는 지금 러닝 코스에만 안내합니다 (자전거는 준비 중).
export const isAiReportSport = (sport) => sport === 'run';

const NUDGE_KEY = 'trazo:hideAiNudge';
export const shouldNudgeAiReport = () => !readStored(NUDGE_KEY, false);
export const hideAiNudge = () => writeStored(NUDGE_KEY, true);

// 다음 업데이트를 알릴 때는 UPDATE_ID와 WhatsNewDialog 내용을 바꾸세요.
const UPDATE_ID = '2026-11-ai-report';
const SEEN_KEY = 'trazo:seenUpdate';
const SESSION_KEY = 'trazo:updateClosed';

export const shouldShowWhatsNew = () => {
    if (readStored(SEEN_KEY, null) === UPDATE_ID) return false;
    try { return window.sessionStorage.getItem(SESSION_KEY) !== UPDATE_ID; } catch { return true; }
};

// forever가 false면 이번 방문 동안만 숨깁니다.
export const dismissWhatsNew = (forever) => {
    if (forever) writeStored(SEEN_KEY, UPDATE_ID);
    try { window.sessionStorage.setItem(SESSION_KEY, UPDATE_ID); } catch { /* 저장하지 못해도 무시 */ }
};
