// src/components/ControlPanel.jsx
import React, { useState } from 'react';
import { COLORS, SHADOWS } from '../styles/theme';
import { SPORTS, SPORT_IDS, formatDuration, formatPace, parsePace, speedFromPace } from '../sports';
import Button from './ui/Button';
import SmartRoutingHelpModal from './SmartRoutingHelpModal';

const sectionTitleStyle = { fontSize: '12px', fontWeight: 700, color: COLORS.textSub, marginBottom: '8px' };

// 종목별 예상 속도 입력 (자전거: km/h, 러닝: 분:초/km)
const SpeedInput = ({ sport, speedKmh, onChange, disabled }) => {
    const isPace = SPORTS[sport].speedInput === 'pace';
    const display = isPace ? formatPace(speedKmh) : String(Math.round(speedKmh * 10) / 10);
    const [draft, setDraft] = useState(null);

    const commit = () => {
        if (draft === null) return;
        if (isPace) {
            const pace = parsePace(draft);
            if (pace) onChange(speedFromPace(pace));
        } else {
            const speed = Number(draft);
            if (speed >= 5 && speed <= 50) onChange(speed);
        }
        setDraft(null);
    };

    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: COLORS.textSub }}>
            {isPace ? '페이스' : '평속'}
            <input
                aria-label={isPace ? '러닝 페이스 (분:초/km)' : '자전거 평균 속도 (km/h)'}
                value={draft ?? display}
                disabled={disabled}
                inputMode={isPace ? 'text' : 'decimal'}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(null); }}
                style={{
                    width: '52px', padding: '3px 6px', fontSize: '12px', textAlign: 'center',
                    border: `1px solid ${COLORS.border}`, borderRadius: '6px', color: COLORS.textMain, backgroundColor: COLORS.white,
                }}
            />
            {isPace ? '/km' : 'km/h'}
        </label>
    );
};

const Stat = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
        <span style={{ fontSize: '16px', fontWeight: 800, color: COLORS.textMain, whiteSpace: 'nowrap' }}>{value}</span>
        <span style={{ fontSize: '11px', color: COLORS.textSub }}>{label}</span>
    </div>
);

const ControlPanel = ({
    sport,
    onChangeSport,
    isBusy = false,
    isSaving = false,
    user, authLoading, authBusy, authError, authConfigured, onAuth,
    markerCount,
    isLoop = false,
    stats,
    speedKmh,
    onChangeSpeed,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onCloseLoop,
    onOutAndBack,
    onSave,
    onList,
    onDownloadGpx,
    onDownloadTcx,
    onReset,
    isAutoRouting,
    onToggleAutoRouting,
    routeOptions,
    onToggleRouteOption,
    currentTitle = "새 코스",
    isModified = false
}) => {
    // 휴대폰 화면에서는 지도를 가리지 않도록 접은 상태로 시작합니다.
    const [isOpen, setIsOpen] = useState(() => window.innerWidth > 640);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const current = SPORTS[sport];
    const hasCourse = markerCount >= 2;

    const containerStyle = {
        position: 'absolute',
        top: '16px',
        right: '16px',
        width: 'min(330px, calc(100vw - 32px))',
        maxHeight: 'calc(100% - 32px)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.white,
        borderRadius: '12px',
        boxShadow: SHADOWS.card,
        zIndex: 10,
        border: `1px solid ${COLORS.border}`,
        fontFamily: "'Pretendard', sans-serif",
        overflow: 'hidden',
    };

    const headerStyle = {
        backgroundColor: COLORS.primary,
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        color: COLORS.white,
        flexShrink: 0,
    };

    const contentStyle = {
        padding: '16px 18px 18px',
        display: isOpen ? 'flex' : 'none',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
        minHeight: 0,
        color: COLORS.textMain,
    };

    const segmentButton = (active, color, onColor) => ({
        flex: 1, padding: '8px 6px', border: 'none', borderRadius: '8px', cursor: isBusy ? 'not-allowed' : 'pointer',
        fontSize: '13px', fontWeight: 700,
        backgroundColor: active ? color : 'transparent',
        color: active ? onColor : COLORS.textSub,
        boxShadow: active ? SHADOWS.button : 'none',
        transition: 'all 0.2s ease',
    });

    return (
        <>
            <div style={containerStyle}>
                {/* Header */}
                <div onClick={() => setIsOpen(!isOpen)} style={headerStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>Trazo</span>
                        <span style={{ fontSize: '11px', opacity: 0.8, fontWeight: '400' }}>
                            지도 위에 그리는 나만의 자전거·러닝 코스
                        </span>
                    </div>
                    <span style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }}>▲</span>
                </div>

                {/* 종목 선택: 접어도 보이도록 헤더 바로 아래에 둡니다. */}
                <div role="tablist" aria-label="코스 종목" style={{ display: 'flex', gap: '4px', padding: '10px 12px', backgroundColor: COLORS.background, borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
                    {SPORT_IDS.map(id => (
                        <button
                            key={id}
                            role="tab"
                            aria-selected={sport === id}
                            disabled={isBusy}
                            onClick={() => onChangeSport(id)}
                            style={{ ...segmentButton(sport === id, SPORTS[id].color, SPORTS[id].onColor), fontSize: '14px', padding: '9px 6px' }}
                        >
                            {SPORTS[id].icon} {SPORTS[id].label} 코스
                        </button>
                    ))}
                </div>

                <div aria-label="계정 로그인" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 18px', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMain, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ flex: 1, fontSize: '12px', overflowWrap: 'anywhere', color: user ? COLORS.textMain : COLORS.textSub }}>
                            {user ? `${user.displayName || user.email}님` : '로그인하면 내 코스를 저장할 수 있어요.'}
                        </span>
                        <Button size="small" disabled={!authConfigured || authLoading || authBusy || isSaving} onClick={onAuth} variant={user ? 'outline' : 'primary'}>
                            {authLoading ? '확인 중…' : authBusy ? '처리 중…' : user ? '로그아웃' : '구글로 로그인'}
                        </Button>
                    </div>
                    {!authConfigured && <span role="status" style={{ fontSize: '12px' }}>구글 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.</span>}
                    {authError && <span role="alert" style={{ fontSize: '12px', color: '#b91c1c' }}>{authError}</span>}
                </div>

                {/* Body */}
                <div style={contentStyle}>

                    {/* 1. 코스 요약 */}
                    <div style={{ borderRadius: '10px', border: `1px solid ${COLORS.border}`, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ padding: '10px 12px', borderBottom: `1px dashed ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: current.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '15px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTitle}</span>
                            {isModified
                                ? <span style={{ fontSize: '11px', color: COLORS.secondary, fontWeight: 600, whiteSpace: 'nowrap' }}>● 저장 안 됨</span>
                                : <span style={{ fontSize: '11px', color: COLORS.textSub, whiteSpace: 'nowrap' }}>저장됨</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', padding: '12px 8px 8px' }}>
                            <Stat label="거리" value={`${stats.distanceKm.toFixed(2)} km`} />
                            <Stat label="상승 고도" value={`${Math.round(stats.ascentM)} m`} />
                            <Stat label="예상 시간" value={formatDuration(stats.distanceKm / speedKmh)} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 8px 10px' }}>
                            <SpeedInput key={sport} sport={sport} speedKmh={speedKmh} onChange={onChangeSpeed} />
                        </div>
                    </div>

                    {/* 2. 점 연결 방식 + 종목별 길찾기 옵션 */}
                    <div style={{ flexShrink: 0 }}>
                        <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            점 연결 방식
                            <button
                                onClick={() => setIsHelpOpen(true)}
                                title="기능 알아보기"
                                aria-label="점 연결 방식 도움말"
                                style={{
                                    width: '16px', height: '16px', padding: 0, border: 'none', borderRadius: '50%',
                                    backgroundColor: COLORS.primary, color: COLORS.white, fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >i</button>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', padding: '4px', backgroundColor: COLORS.background, borderRadius: '10px' }}>
                            <button disabled={isBusy} onClick={() => onToggleAutoRouting(true)} style={segmentButton(isAutoRouting, COLORS.primary, COLORS.white)}>
                                🧭 {current.label} 길 따라
                            </button>
                            <button disabled={isBusy} onClick={() => onToggleAutoRouting(false)} style={segmentButton(!isAutoRouting, COLORS.secondary, COLORS.white)}>
                                📏 직선 연결
                            </button>
                        </div>
                        {isAutoRouting ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                {current.routeOptions.map(option => {
                                    const on = Boolean(routeOptions[option.id]);
                                    return (
                                        <button
                                            key={option.id}
                                            aria-pressed={on}
                                            title={option.desc}
                                            disabled={isBusy}
                                            onClick={() => onToggleRouteOption(option.id)}
                                            style={{
                                                padding: '5px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                                border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                                                backgroundColor: on ? COLORS.primary : COLORS.white,
                                                color: on ? COLORS.white : COLORS.textSub,
                                            }}
                                        >
                                            {on ? '✓ ' : ''}{option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{ margin: '8px 0 0', fontSize: '12px', color: COLORS.textSub }}>
                                길을 찾지 않고 점과 점을 곧게 잇습니다. 지도에 없는 길이나 트랙에 사용하세요.
                            </p>
                        )}
                    </div>

                    {/* 3. 코스 도구 */}
                    <div style={{ flexShrink: 0 }}>
                        <div style={sectionTitleStyle}>코스 편집 <span style={{ fontWeight: 400 }}>· 경유점 {markerCount}개</span></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <Button size="small" variant="outline" onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">↩ 되돌리기</Button>
                            <Button size="small" variant="outline" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)">↪ 다시 실행</Button>
                            <Button size="small" variant="primary" onClick={onCloseLoop} disabled={!hasCourse || isLoop || isBusy} title="마지막 점에서 출발점까지 길을 이어 순환 코스를 만듭니다">⟲ 출발점으로 복귀</Button>
                            <Button size="small" variant="primary" onClick={onOutAndBack} disabled={!hasCourse || isBusy} title="지금까지의 길을 그대로 되돌아오는 왕복 코스를 만듭니다">⇄ 왕복 코스</Button>
                        </div>
                    </div>

                    {/* 4. 저장 · 내보내기 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                        <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>저장 · 내보내기</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button disabled={!hasCourse || isBusy || !user || authLoading || authBusy} onClick={onSave} variant="primary" style={{ flex: 1 }}>☁ 저장</Button>
                            <Button disabled={!user || authLoading || authBusy} onClick={onList} variant="secondary" style={{ flex: 1 }}>📂 내 코스</Button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button disabled={!hasCourse} onClick={onDownloadGpx} variant="accent" style={{ flex: 1 }}>⬇ GPX</Button>
                            <Button disabled={!hasCourse} onClick={onDownloadTcx} variant="accent" style={{ flex: 1 }}>⬇ TCX</Button>
                        </div>
                        <Button disabled={isSaving} onClick={onReset} variant="danger" size="small" style={{ width: '100%', marginTop: '4px' }}>🗑️ 새 코스 시작</Button>
                    </div>
                </div>
            </div>

            <SmartRoutingHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} sport={sport} />
        </>
    );
};

export default ControlPanel;
