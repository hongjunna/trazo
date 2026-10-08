// src/components/MapOverlays.jsx
// 지도 위에 떠 있는 요소: 오른쪽 도구 버튼, 처음 안내, 길찾기 진행·실패 알림
import { SPORTS } from '../sports';
import Button from './ui/Button';
import Icon from './ui/Icon';

export const MapControls = ({ onUndo, onRedo, canUndo, canRedo, onLocate, isLocating, onFit, canFit }) => (
    <div className="map-controls">
        <div className="control-group" role="group" aria-label="편집">
            <Button variant="ghost" icon="undo" iconSize={20} onClick={onUndo} disabled={!canUndo} aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" />
            <Button variant="ghost" icon="redo" iconSize={20} onClick={onRedo} disabled={!canRedo} aria-label="다시 실행" title="다시 실행 (Ctrl+Shift+Z)" />
        </div>
        <div className="control-group" role="group" aria-label="지도 보기">
            <Button variant="ghost" icon="locate" iconSize={20} onClick={onLocate} loading={isLocating} aria-label="내 위치로 이동" title="내 위치로 이동" />
            <Button variant="ghost" icon="fit" iconSize={20} onClick={onFit} disabled={!canFit} aria-label="코스 전체 보기" title="코스 전체 보기" />
        </div>
    </div>
);

export const MapHint = ({ sport, markerCount }) => {
    const current = SPORTS[sport];
    if (markerCount === 0) {
        return (
            <div className="map-hint" role="status">
                <div className="map-hint__title"><Icon name={current.icon} size={18} />{current.label} 코스 만들기</div>
                <ol className="map-hint__steps">
                    <li><span className="map-hint__num">1</span>지도를 눌러 출발점을 찍어요.</li>
                    <li><span className="map-hint__num">2</span>다음 지점을 찍으면 {current.label}에 맞는 길로 이어져요.</li>
                    <li><span className="map-hint__num">3</span>완성되면 저장하거나 GPX로 내려받으세요.</li>
                </ol>
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
