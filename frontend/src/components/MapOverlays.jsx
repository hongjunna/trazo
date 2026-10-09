// src/components/MapOverlays.jsx
// 지도 위에 떠 있는 요소: 오른쪽 도구 버튼, 우클릭 메뉴, 처음 안내, 길찾기 진행·실패 알림
import { useEffect, useRef, useState } from 'react';
import { SPORTS } from '../sports';
import { readStored, writeStored } from '../utils/storage';
import Button from './ui/Button';
import Icon from './ui/Icon';

export const MapControls = ({ onUndo, onRedo, canUndo, canRedo, onLocate, isLocating, onFit, canFit, isSatellite, onToggleSatellite }) => (
    <div className="map-controls">
        <div className="control-group" role="group" aria-label="편집">
            <Button variant="ghost" icon="undo" iconSize={20} onClick={onUndo} disabled={!canUndo} aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" />
            <Button variant="ghost" icon="redo" iconSize={20} onClick={onRedo} disabled={!canRedo} aria-label="다시 실행" title="다시 실행 (Ctrl+Shift+Z)" />
        </div>
        <div className="control-group" role="group" aria-label="지도 보기">
            <Button variant="ghost" icon="locate" iconSize={20} onClick={onLocate} loading={isLocating} aria-label="내 위치로 이동" title="내 위치로 이동" />
            <Button variant="ghost" icon="fit" iconSize={20} onClick={onFit} disabled={!canFit} aria-label="코스 전체 보기" title="코스 전체 보기" />
            <Button
                variant="ghost"
                icon="layers"
                iconSize={20}
                className={isSatellite ? 'is-active' : undefined}
                onClick={onToggleSatellite}
                aria-pressed={isSatellite}
                aria-label="위성 지도"
                title={isSatellite ? '일반 지도로 보기' : '위성 지도로 보기'}
            />
        </div>
    </div>
);

// 지도 위를 우클릭하면 그 위치의 거리 사진(로드뷰·스트리트 뷰)을 새 탭에서 엽니다.
// 경로 근처를 우클릭하면 그 자리에 웨이포인트를 추가하는 메뉴도 보여줍니다.
const STREET_VIEWS = [
    { id: 'kakao', label: '다음 지도 로드뷰 열기', url: ({ lat, lng }) => `https://map.kakao.com/link/roadview/${lat},${lng}` },
    { id: 'google', label: '구글 스트리트 뷰 열기', url: ({ lat, lng }) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` },
];
const MENU_W = 236;
const MENU_H = 150;

export const MapContextMenu = ({ menu, onClose, onAddWaypoint }) => {
    const rootRef = useRef(null);

    useEffect(() => {
        if (!menu) return;
        rootRef.current?.querySelector('[role="menuitem"]')?.focus();
        // 지도 위를 누르면 지도 클릭 처리에서 메뉴만 닫으므로, 여기서는 지도 밖을 누른 경우만 닫습니다.
        const close = (event) => {
            if (rootRef.current?.contains(event.target) || event.target.closest?.('.map-canvas')) return;
            onClose();
        };
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onClose);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onClose);
        };
    }, [menu, onClose]);

    if (!menu) return null;
    const { point, x, y, width, height } = menu;
    // 지도 가장자리에서 열면 메뉴가 화면 밖으로 나가지 않게 반대쪽으로 엽니다.
    const menuHeight = MENU_H + (menu.near ? 38 : 0);
    const left = x + MENU_W > width ? Math.max(8, x - MENU_W) : x;
    const top = y + menuHeight > height ? Math.max(8, y - menuHeight) : y;
    const coords = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;

    return (
        <div ref={rootRef} className="menu map-menu" role="menu" aria-label="이 위치에서" style={{ left, top }}>
            <div className="menu__header">
                <span className="menu__name">이 위치에서</span>
                <span className="menu__email">{coords}</span>
            </div>
            {menu.near && (
                <button type="button" role="menuitem" className="menu__item" onClick={() => onAddWaypoint(menu.near)}>
                    <Icon name="flag" /> 여기에 웨이포인트 추가
                </button>
            )}
            {STREET_VIEWS.map(view => (
                <a
                    key={view.id}
                    role="menuitem"
                    className="menu__item"
                    href={view.url(point)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                >
                    <Icon name="street" /> {view.label}
                </a>
            ))}
        </div>
    );
};

// '이번만 닫기'는 새로고침 전까지, '앞으로도 닫기'는 브라우저에 기억해 계속 숨깁니다.
const HINT_HIDDEN_KEY = 'trazo.hintHidden';
let hintClosedThisVisit = false;

export const MapHint = ({ sport, markerCount }) => {
    const current = SPORTS[sport];
    const [isHidden, setIsHidden] = useState(() => hintClosedThisVisit || readStored(HINT_HIDDEN_KEY, false));
    const [isAsking, setIsAsking] = useState(false);

    const closeHint = (forever) => {
        hintClosedThisVisit = true;
        if (forever) writeStored(HINT_HIDDEN_KEY, true);
        setIsHidden(true);
    };

    if (markerCount === 0) {
        if (isHidden) return null;
        if (isAsking) {
            return (
                <div className="map-hint" role="dialog" aria-label="안내 닫기">
                    <div className="map-hint__title"><Icon name="help" size={18} />앞으로는 안 보이게 해드릴까요?</div>
                    <p className="map-hint__ask">'앞으로도 닫기'를 누르면 다음에 방문해도 이 안내가 나오지 않아요.</p>
                    <div className="map-hint__actions">
                        <Button size="sm" variant="ghost" onClick={() => closeHint(false)}>이번만 닫기</Button>
                        <Button size="sm" variant="primary" onClick={() => closeHint(true)}>앞으로도 닫기</Button>
                    </div>
                </div>
            );
        }
        return (
            <div className="map-hint" role="status">
                <Button
                    variant="ghost"
                    size="sm"
                    icon="x"
                    className="map-hint__close"
                    onClick={() => setIsAsking(true)}
                    aria-label="안내 닫기"
                    title="안내 닫기"
                />
                <div className="map-hint__title"><Icon name={current.icon} size={18} />{current.label} 코스 만들기</div>
                <ol className="map-hint__steps">
                    <li><span className="map-hint__num">1</span>지도를 눌러 출발점을 찍어요.</li>
                    <li><span className="map-hint__num">2</span>다음 지점을 찍으면 {current.label}에 맞는 길로 이어져요.</li>
                    <li><span className="map-hint__num">3</span>경로 위를 누르면(휴대폰은 꾹 눌렀다 떼면) 웨이포인트를 표시해요.</li>
                    <li><span className="map-hint__num">4</span>완성되면 저장하거나 GPX·FIT 파일, 이미지로 내려받으세요.</li>
                </ol>
                <p className="map-hint__foot"><Icon name="upload" size={14} />가지고 있는 GPX·TCX·FIT 파일은 지도에 끌어다 놓아 불러올 수 있어요.</p>
            </div>
        );
    }
    if (markerCount === 1) {
        return (
            <div className="map-pill map-pill--plain" role="status">
                <Icon name="pointer" size={16} /> 다음 지점을 눌러 길을 이어가세요
            </div>
        );
    }
    return null;
};

export const RouteStatus = ({ sport, isRouting, error, onCancel, onRetry, onStraight, onDismiss }) => {
    if (isRouting) {
        return (
            <div className="map-pill" role="status">
                <Icon name="loader" size={16} className="spin" />
                {SPORTS[sport].label} 길을 찾는 중…
                <Button size="sm" onClick={onCancel}>취소</Button>
            </div>
        );
    }
    if (!error) return null;
    return (
        <div className="route-error" role="alert">
            <div className="route-error__msg"><Icon name="alert" size={18} />{error.message}</div>
            <div className="route-error__actions">
                <Button size="sm" variant="ghost" onClick={onDismiss}>닫기</Button>
                <Button size="sm" variant="secondary" icon="straight" onClick={onStraight}>직선으로 잇기</Button>
                <Button size="sm" variant="primary" icon="loop" onClick={onRetry}>다시 시도</Button>
            </div>
        </div>
    );
};
