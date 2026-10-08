// src/components/BottomSheet.jsx
// 모바일 아래 시트: 접으면 요약(peek)만 보이고, 손잡이를 끌어올리거나 누르면 펼쳐집니다.
import { useLayoutEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD = 48;
const GRIP_HEIGHT = 22;

const BottomSheet = ({ peek, children, expanded, onExpandedChange, onPeekHeightChange, label }) => {
    const peekRef = useRef(null);
    const dragRef = useRef(null);
    const [peekHeight, setPeekHeight] = useState(180);
    const [dragOffset, setDragOffset] = useState(null);

    // 요약 영역 높이가 바뀌면(내용·화면 회전) 접힌 위치와 지도 높이를 다시 맞춥니다.
    useLayoutEffect(() => {
        const node = peekRef.current;
        if (!node) return;
        const update = () => {
            const height = Math.ceil(node.getBoundingClientRect().height) + GRIP_HEIGHT;
            setPeekHeight(height);
            onPeekHeightChange?.(height);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, [onPeekHeightChange]);

    const onPointerDown = (event) => {
        dragRef.current = { startY: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = event.clientY - drag.startY;
        if (Math.abs(delta) > 4) drag.moved = true;
        if (drag.moved) setDragOffset(expanded ? Math.max(0, delta) : Math.min(0, delta));
    };

    const onPointerUp = (event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        setDragOffset(null);
        if (!drag) return;
        const delta = event.clientY - drag.startY;
        if (!drag.moved) onExpandedChange(!expanded);
        else if (expanded && delta > DRAG_THRESHOLD) onExpandedChange(false);
        else if (!expanded && delta < -DRAG_THRESHOLD) onExpandedChange(true);
    };

    const offset = dragOffset ?? 0;
    const transform = expanded
        ? `translateY(${offset}px)`
        : `translateY(calc(100% - ${peekHeight}px + ${offset}px))`;

    return (
        <section
            className={`sheet ${dragOffset !== null ? 'sheet--dragging' : ''}`}
            style={{ transform }}
            aria-label={label}
        >
            <button
                type="button"
                className="sheet__grip"
                aria-label={expanded ? '시트 접기' : '시트 펼치기'}
                aria-expanded={expanded}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { dragRef.current = null; setDragOffset(null); }}
            />
            <div className="sheet__peek" ref={peekRef}>{peek}</div>
            <div className="sheet__body" aria-hidden={!expanded} inert={!expanded ? '' : undefined}>
                {children}
            </div>
        </section>
    );
};

export default BottomSheet;
