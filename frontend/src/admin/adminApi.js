// src/admin/adminApi.js
// 관리자 API. 로그인 토큰은 탭을 닫으면 사라지도록 sessionStorage에 둡니다.
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'trazo:admin-token';

export const loadToken = () => {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const saveToken = (token) => {
    try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* 저장하지 못하면 이 화면에서만 로그인 상태를 유지합니다. */ }
};

const client = axios.create({ baseURL: `${BASE_URL}/admin` });
client.interceptors.request.use((config) => {
    const token = loadToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const login = (username, password) => client.post('/login', { username, password });
export const getSummary = () => client.get('/summary');
export const getInsights = (params, signal) => client.get('/insights', { params, signal });
export const reviewInsight = (courseId, changes) => client.put(`/insights/${courseId}`, changes);
export const rerunInsight = (courseId) => client.post(`/insights/${courseId}/rerun`);
// SEO 테스트: 검색어로 전체 공개 코스 페이지를 채점합니다
export const getSeoSearch = (q) => client.get('/seo/search', { params: { q } });
// params: { q, offset, limit }
export const getUsers = (params, signal) => client.get('/users', { params, signal });
// params: { q, uid, sport, visibility, deleted, sort, offset, limit }
export const getCourses = (params, signal) => client.get('/courses', { params, signal });
export const getCourse = (courseId) => client.get(`/courses/${courseId}`);
// 가상 계정: 운영 계정이 공개한 코스의 작성자로 보이고, 좋아요 봇이 좋아요를 누르는 계정
export const getVirtualAccounts = () => client.get('/virtual-accounts');
export const createVirtualAccounts = (nicknames) => client.post('/virtual-accounts', { nicknames });
export const deleteVirtualAccount = (uid) => client.delete(`/virtual-accounts/${encodeURIComponent(uid)}`);
// mode: 'unassigned'(아직 배정 안 된 코스만) | 'all'(모두 다시 섞기)
export const assignVirtualAccounts = (mode) => client.post('/virtual-accounts/assign', { mode });

// 육상 트랙 (코스 지도의 트랙 보기)
export const getTracks = (params, signal) => client.get('/tracks', { params, signal });
export const importOsmTracks = () => client.post('/tracks/import-osm');
export const createTrack = (track) => client.post('/tracks', track);
export const updateTrack = (trackId, changes) => client.put(`/tracks/${trackId}`, changes);
export const deleteTrack = (trackId) => client.delete(`/tracks/${trackId}`);

export const isUnauthorized = (error) => error.response?.status === 401;

export const loginErrorMessage = (error) => {
    const status = error.response?.status;
    if (status === 401) return '아이디 또는 비밀번호가 맞지 않아요.';
    if (status === 429) return '로그인 시도가 너무 많아요. 15분 뒤에 다시 시도하세요.';
    if (status === 404) return '관리자 계정이 설정되지 않았어요. 서버 .env의 ADMIN_USERNAME·ADMIN_PASSWORD를 확인하세요.';
    return '로그인하지 못했어요. 잠시 후 다시 시도하세요.';
};
