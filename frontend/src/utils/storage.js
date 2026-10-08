// src/utils/storage.js
// 브라우저 저장소를 쓸 수 없어도(사생활 보호 모드 등) 화면은 동작해야 합니다.
export const readStored = (key, fallback) => {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch { return fallback; }
};

export const writeStored = (key, value) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장하지 못해도 무시 */ }
};
