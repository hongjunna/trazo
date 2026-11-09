// src/components/TopNav.jsx
// 화면 맨 위의 가로 메뉴: 로고 · 코스 생성 · 코스 지도 · 내 코스(로그인 시) · 커뮤니티 · 연동센터 · 로그인/계정
// 모바일에서는 로고 옆에 지금 화면 이름을 보여주고, 메뉴는 오른쪽 ☰ 버튼으로 펼쳐 고릅니다.
import { useEffect, useRef, useState } from 'react';
import { PAGES, PAGE_IDS } from '../utils/pages';
import Icon from './ui/Icon';
import trazoMark from '../assets/trazo-mark.svg';

const BurgerIcon = ({ open }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
);

const TopNav = ({ page, onNavigate, loggedIn, account }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const pages = PAGE_IDS.filter(id => !PAGES[id].loginOnly || loggedIn);

    // 펼친 메뉴는 바깥을 누르거나 Esc를 누르면 닫습니다.
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

    const go = (event, id) => {
        // 새 탭으로 열기(⌘·Ctrl·가운데 클릭)는 브라우저에 맡깁니다.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        setOpen(false);
        onNavigate(id);
    };

    return (
        <header className={`topnav ${open ? 'is-open' : ''}`} ref={rootRef}>
            <a className="topnav__brand" href="/" onClick={(event) => go(event, 'create')}>
                <span className="topnav__mark"><img src={trazoMark} alt="" /></span>
                <span className="topnav__name">Trazo</span>
            </a>
            <span className="topnav__current" aria-hidden="true">{PAGES[page].label}</span>
            <nav className="topnav__menu" id="topnav-menu" aria-label="주 메뉴">
                <ul>
                    {pages.map(id => (
                        <li key={id}>
                            <a
                                href={PAGES[id].path}
                                className="topnav__link"
                                aria-current={page === id ? 'page' : undefined}
                                onClick={(event) => go(event, id)}
                            >
                                <Icon name={PAGES[id].icon} size={16} />
                                <span>{PAGES[id].label}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="topnav__account">{account}</div>
            <button
                type="button"
                className="topnav__burger"
                aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
                aria-expanded={open}
                aria-controls="topnav-menu"
                onClick={() => setOpen(value => !value)}
            >
                <BurgerIcon open={open} />
            </button>
        </header>
    );
};

export default TopNav;
