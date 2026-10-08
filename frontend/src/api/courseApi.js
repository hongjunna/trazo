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

export const saveCourse = async (title, markers, polylines, sport) => {
    return await courseClient.post(`/courses`, { title, markers, polylines, sport });
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

// ⚡ [수정] 제목뿐만 아니라 경로 데이터도 함께 업데이트 가능하도록 변경
export const updateCourse = async (courseId, title, markers, polylines, sport) => {
    return await courseClient.put(`/courses/${courseId}`, {
        title,
        markers,
        polylines,
        sport
    });
};