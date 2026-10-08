// src/components/ui/MenuButton.jsx
// 버튼을 누르면 펼쳐지는 작은 메뉴. 스크롤되는 대화상자 안에서도 잘리지 않도록 화면 기준 위치(fixed)로 띄웁니다.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import Icon from './Icon';

const MENU_GAP = 6;
const ITEM_HEIGHT = 38;
const ITEM_HEIGHT_DESC = 50;
const MENU_PADDING = 14;

// items: [{ label, desc?, icon?, onSelect, danger?, disabled? }]
// text를 주면 글자가 있는 버튼이 됩니다 (예: 내보내기 ▾).
const MenuButton = ({ items, label = '더 보기', icon = 'more', size = 'sm', disabled = false, text, variant = 'ghost', loading = false, className }) => {
    const [position, setPosition] = useState(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const open = position !== null;

    const toggle = () => {
        if (open) { setPosition(null); return; }
        const rect = triggerRef.current.getBoundingClientRect();
        // 화면 아래쪽이라 메뉴가 잘리면 버튼 위로 띄웁니다.
        const height = items.reduce((sum, item) => sum + (item.desc ? ITEM_HEIGHT_DESC : ITEM_HEIGHT), MENU_PADDING);
        const below = rect.bottom + MENU_GAP;
        const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - MENU_GAP - height) : below;
        setPosition({ top, right: window.innerWidth - rect.right });
    };

    useEffect(() => {
        if (!open) return;
        const close = (event) => {
            if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setPosition(null);
        };
        const onKey = (event) => {
            if (event.key !== 'Escape') return;
            // 메뉴만 닫고, 메뉴가 들어 있는 대화상자는 닫지 않습니다.
            event.stopPropagation();
            setPosition(null);
            triggerRef.current?.focus();
        };
        const dismiss = () => setPosition(null);
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', dismiss);
        window.addEventListener('scroll', dismiss, true);
        menuRef.current?.querySelector('button:not(:disabled)')?.focus();
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', dismiss);
            window.removeEventListener('scroll', dismiss, true);
        };
    }, [open]);

    return (
        <>
            <Button
                ref={triggerRef}
                size={size}
                variant={variant}
                icon={icon}
                iconRight={text ? (open ? 'chevron-up' : 'chevron-down') : undefined}
                aria-label={text ? undefined : label}
                title={label}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                loading={loading}
                className={className}
                onClick={toggle}
            >
                {text}
            </Button>
            {open && createPortal(
                <div ref={menuRef} className="menu menu--floating" role="menu" style={{ top: position.top, right: position.right }}>
                    {items.map(item => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            className={`menu__item ${item.danger ? 'menu__item--danger' : ''} ${item.desc ? 'menu__item--desc' : ''}`}
                            disabled={item.disabled}
                            onClick={() => { setPosition(null); item.onSelect(); }}
                        >
                            {item.icon && <Icon name={item.icon} />}
                            {item.desc ? (
                                <span className="menu__text">
                                    <span>{item.label}</span>
                                    <span className="menu__desc">{item.desc}</span>
                                </span>
                            ) : item.label}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
};

export default MenuButton;
