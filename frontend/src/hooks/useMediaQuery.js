// src/hooks/useMediaQuery.js
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query) {
    return useSyncExternalStore(
        (onChange) => {
            const list = window.matchMedia(query);
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}

// 휴대폰 화면 (app.css의 모바일 기준과 같습니다)
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
