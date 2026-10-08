// src/components/AccountButton.jsx
// 로그인 전: 구글 로그인 버튼 / 로그인 후: 프로필 사진을 누르면 내 코스·로그아웃 메뉴
import { useEffect, useRef, useState } from 'react';
import Icon from './ui/Icon';

const GoogleMark = () => (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

const AccountButton = ({ user, configured, loading, busy, onLogin, onLogout, onOpenLibrary, compact = false }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!user) {
        return (
            <button
                type="button"
                className="google-btn"
                onClick={onLogin}
                disabled={!configured || loading || busy}
                title={configured ? '구글 계정으로 로그인하면 코스를 저장할 수 있어요' : '구글 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.'}
            >
                {loading || busy ? <Icon name="loader" size={16} className="spin" /> : <GoogleMark />}
                {compact ? '로그인' : (loading ? '확인 중…' : '구글 로그인')}
            </button>
        );
    }

    const name = user.displayName || user.email || '내 계정';
    return (
        <div className="account" ref={rootRef}>
            <button
                type="button"
                className="avatar"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${name} 계정 메뉴`}
                onClick={() => setOpen(value => !value)}
            >
                {user.photoURL
                    ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                    : name.slice(0, 1).toUpperCase()}
            </button>
            {open && (
                <div className="menu" role="menu">
                    <div className="menu__header">
                        <span className="menu__name">{name}</span>
                        {user.email && user.email !== name && <span className="menu__email">{user.email}</span>}
                    </div>
                    <button type="button" role="menuitem" className="menu__item" onClick={() => { setOpen(false); onOpenLibrary(); }}>
                        <Icon name="folder" /> 내 코스
                    </button>
                    <button type="button" role="menuitem" className="menu__item" disabled={busy} onClick={() => { setOpen(false); onLogout(); }}>
                        <Icon name="logout" /> 로그아웃
                    </button>
                </div>
            )}
        </div>
    );
};

export default AccountButton;
