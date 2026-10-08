// src/utils/share.js
// 공개 범위, 공유 링크 주소, 링크 복사, 시간 표시

export const VISIBILITY = {
    private: { label: '비공개', icon: 'lock', desc: '나만 볼 수 있어요.' },
    link: { label: '링크 공유', icon: 'link', desc: '링크를 받은 사람만 볼 수 있어요. 커뮤니티에는 올라가지 않아요.' },
    public: { label: '전체 공개', icon: 'globe', desc: '커뮤니티에 올라가 누구나 보고 좋아요·댓글을 남길 수 있어요.' },
};
export const VISIBILITY_IDS = Object.keys(VISIBILITY);
export const visibilityOf = (course) => (VISIBILITY[course?.visibility] ? course.visibility : 'private');

// 공유 링크는 /c/<토큰> 형식입니다. 서버(Nginx·Vite)는 모든 경로에 같은 화면을 돌려줍니다.
const SHARE_PATH = /^\/c\/([A-Za-z0-9_-]{6,64})\/?$/;
export const shareTokenFromPath = (pathname) => SHARE_PATH.exec(pathname)?.[1] ?? null;
export const sharePath = (token) => `/c/${token}`;
export const shareUrl = (token) => `${window.location.origin}${sharePath(token)}`;

export const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // HTTP 접속이나 권한 문제로 클립보드 API를 못 쓰면 예전 방식으로 복사합니다.
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    }
};

export const timeAgo = (value) => {
    const date = new Date(value);
    const seconds = (Date.now() - date.getTime()) / 1000;
    if (!Number.isFinite(seconds)) return '';
    if (seconds < 60) return '방금';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}일 전`;
    return date.toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric' });
};

export const NICKNAME_PATTERN = /^[0-9A-Za-z가-힣_]{3,16}$/;
