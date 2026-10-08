// src/components/ui/Dialog.jsx
// 모든 대화상자의 공통 틀: Esc·바깥 클릭으로 닫기, 첫 입력란 포커스, 닫으면 원래 위치로 포커스 복귀.
// 모바일에서는 화면 아래에서 올라오는 시트 모양으로 바뀝니다 (app.css).
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

// 대화상자가 겹치면 가장 위의 대화상자만 Esc에 반응합니다.
const openStack = [];

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const Dialog = ({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md',
    dismissible = true,
    initialFocus = 'input',
    className = '',
    bodyClassName = '',
    headerExtra,
}) => {
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });
    const id = useId();

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        openStack.push(id);
        const node = dialogRef.current;
        const target = (initialFocus === 'input' && node?.querySelector('input:not([type=radio]):not([disabled]), textarea'))
            || node?.querySelector('[data-autofocus]')
            || node;
        target?.focus({ preventScroll: true });

        const handleKeyDown = (event) => {
            if (openStack.at(-1) !== id) return;
            if (event.key === 'Escape' && dismissible) {
                event.stopPropagation();
                onCloseRef.current?.();
            }
            // Tab 키가 대화상자 밖으로 나가지 않게 합니다.
            if (event.key === 'Tab' && node) {
                const items = [...node.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
                if (!items.length) return;
                const first = items[0];
                const last = items.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            const index = openStack.lastIndexOf(id);
            if (index >= 0) openStack.splice(index, 1);
            if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
        };
    }, [open, id, dismissible, initialFocus]);

    if (!open) return null;

    return createPortal(
        <div
            className="dialog-backdrop"
            onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose?.(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? `${id}-title` : undefined}
                aria-describedby={description ? `${id}-desc` : undefined}
                tabIndex={-1}
                className={`dialog dialog--${size} ${className}`}
            >
                {(title || dismissible) && (
                    <div className="dialog__header">
                        <div className="dialog__titles">
                            {title && <h2 id={`${id}-title`} className="dialog__title">{title}</h2>}
                            {description && <p id={`${id}-desc`} className="dialog__desc">{description}</p>}
                        </div>
                        {headerExtra}
                        {dismissible && (
                            <Button variant="ghost" icon="x" iconSize={20} className="dialog__close" aria-label="닫기" onClick={onClose} />
                        )}
                    </div>
                )}
                {children && <div className={`dialog__body ${bodyClassName}`}>{children}</div>}
                {footer && <div className="dialog__footer">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
};

export default Dialog;
