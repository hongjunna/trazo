// src/hooks/useNickname.js
// 로그인한 계정의 닉네임. undefined: 아직 확인 전(또는 확인 실패), null: 아직 정하지 않음, 문자열: 닉네임
import { useCallback, useRef, useState } from 'react';
import { getProfile } from '../api/courseApi';
import { auth } from '../firebase';

export const useNickname = () => {
    const [nickname, setNicknameState] = useState(undefined);
    // 로그인 직후처럼 화면이 다시 그려지기 전에도 최신 값을 읽을 수 있게 함께 보관합니다.
    const nicknameRef = useRef(undefined);

    const setNickname = useCallback((value) => {
        nicknameRef.current = value;
        setNicknameState(value);
    }, []);

    const loadNickname = useCallback(async () => {
        const uid = auth?.currentUser?.uid;
        if (!uid) return undefined;
        try {
            const { data } = await getProfile();
            // 그사이 다른 계정으로 바뀌었으면 결과를 버립니다.
            if (auth.currentUser?.uid !== uid) return undefined;
            setNickname(data.nickname ?? null);
            return data.nickname ?? null;
        } catch {
            return undefined;
        }
    }, [setNickname]);

    return { nickname, nicknameRef, setNickname, loadNickname };
};
