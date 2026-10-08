import axios from 'axios';
import { auth } from '../firebase';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const courseClient = axios.create({ baseURL: BASE_URL });
courseClient.interceptors.request.use(async (config) => {
    if (!auth) throw new Error('Firebase 로그인 설정이 필요합니다.');
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new Error('구글 로그인이 필요합니다.');
    const token = await user.getIdToken();
    if (auth.currentUser?.uid !== user.uid) throw new Error('로그인 계정이 변경됐습니다. 다시 시도하세요.');
    config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// 공유 코스와 커뮤니티는 로그인 없이 볼 수 있습니다. 로그인했으면 토큰을 붙여 좋아요·내 댓글 여부를 받습니다.
const publicClient = axios.create({ baseURL: BASE_URL });
publicClient.interceptors.request.use(async (config) => {
    if (!auth) return config;
    await auth.authStateReady();
    const user = auth.currentUser;
    if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
    return config;
});

// sport: 'bike' | 'run' (백엔드 경로 프로필), options: 켜진 경로 옵션 이름 목록
export const fetchRoutePath = async (start, end, { mode = 'turn-by-turn', sport = 'bike', options = [] } = {}, signal) => {
    const params = new URLSearchParams();
    params.append('point', `${start.lat},${start.lng}`);
    params.append('point', `${end.lat},${end.lng}`);
    params.append('profile', sport);
    params.append('mode', mode);
    options.forEach(option => params.append('option', option));
    const response = await axios.get(`${BASE_URL}/route`, { params, signal });
    const points = response.data.paths?.[0]?.decoded_points;
    if (!Array.isArray(points) || points.length < 2 || points.some(pt => !Array.isArray(pt) || pt.length < 3 || !pt.every(Number.isFinite))) {
        throw new Error('유효한 경로를 찾지 못했습니다.');
    }
    return points.map(pt => ({ lat: pt[0], lng: pt[1], ele: pt[2] }));
};

// course: { title, markers, polylines, sport, visibility, folder_id }
export const saveCourse = async (course) => {
    return await courseClient.post(`/courses`, course);
};

export const getCourseList = async () => {
    return await courseClient.get(`/courses`);
};

export const downloadTCX = async (trackPoints, { name, speedKmh }) => {
    return await axios.post(`${BASE_URL}/export/tcx`,
        { trackPoints, name, speedMps: speedKmh / 3.6 },
        { responseType: 'blob' }
    );
};

export const deleteCourse = async (courseId) => {
    return await courseClient.delete(`/courses/${courseId}`);
};

// 바꿀 항목만 보냅니다. folder_id에 null을 보내면 폴더에서 빼고, 빠진 항목은 그대로 둡니다.
export const updateCourse = async (courseId, changes) => {
    return await courseClient.put(`/courses/${courseId}`, changes);
};

// --- 닉네임 ---
export const getProfile = () => courseClient.get('/me');
export const updateNickname = (nickname) => courseClient.put('/me', { nickname });
export const checkNickname = (nickname) => publicClient.get('/nicknames/check', { params: { nickname } });

// --- 폴더 ---
export const getFolders = () => courseClient.get('/folders');
export const createFolder = (name) => courseClient.post('/folders', { name });
export const renameFolder = (folderId, name) => courseClient.put(`/folders/${folderId}`, { name });
export const deleteFolder = (folderId) => courseClient.delete(`/folders/${folderId}`);

// --- 공유 코스 · 커뮤니티 ---
const shared = (token) => `/shared/${encodeURIComponent(token)}`;
export const getSharedCourse = (token) => publicClient.get(shared(token));
export const copySharedCourse = (token, folderId) => courseClient.post(`${shared(token)}/copy`, { folder_id: folderId });
export const setCourseLike = (token, liked) => (liked ? courseClient.post : courseClient.delete)(`${shared(token)}/like`);
export const getComments = (token) => publicClient.get(`${shared(token)}/comments`);
export const createComment = (token, body) => courseClient.post(`${shared(token)}/comments`, { body });
export const updateComment = (commentId, body) => courseClient.put(`/comments/${commentId}`, { body });
export const deleteComment = (commentId) => courseClient.delete(`/comments/${commentId}`);
// params: { sport, sort: 'recent' | 'popular' | 'likes', q, offset, limit }
export const getCommunity = (params, signal) => publicClient.get('/community', { params, signal });

// 서버 응답에 맞춰 화면에 보여줄 안내 문구를 고릅니다.
export const apiErrorMessage = (error, fallback) => {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;
    if (status === 401) return '로그인 확인에 실패했어요. 다시 로그인한 뒤 시도하세요.';
    if (detail === 'Nickname required') return '닉네임을 먼저 정해주세요.';
    if (detail === 'Nickname already taken') return '이미 사용 중인 닉네임이에요.';
    if (detail === 'Folder name already exists') return '같은 이름의 폴더가 이미 있어요.';
    if (detail === 'Folder not found') return '폴더를 찾지 못했어요. 목록을 새로 고친 뒤 다시 시도하세요.';
    if (detail === 'Course is already yours') return '내가 만든 코스예요.';
    if (typeof detail === 'string' && detail.startsWith('Up to')) return '폴더는 50개까지 만들 수 있어요.';
    if (status === 404) return '코스를 찾지 못했어요. 공유가 해제됐거나 삭제된 코스일 수 있어요.';
    return fallback;
};
