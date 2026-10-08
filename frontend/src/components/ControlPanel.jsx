// src/components/ControlPanel.jsx
import React, { useState } from 'react';
import { COLORS, SHADOWS } from '../styles/theme';
import Button from './ui/Button';
import SmartRoutingHelpModal from './SmartRoutingHelpModal'; // ⚡ 모달 임포트

const ControlPanel = ({
    isBusy = false,
    isSaving = false,
    user, authLoading, authBusy, authError, authConfigured, onAuth,
    markerCount,
    polylineCount,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onSave,
    onList,
    onDownload,
    onReset,
    isAutoRouting,
    onToggleAutoRouting,
    currentTitle = "새 코스",
    isModified = false
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [isHelpOpen, setIsHelpOpen] = useState(false); // ⚡ 모달 상태
    const [showTooltip, setShowTooltip] = useState(false); // ⚡ 툴팁 상태

    // ... (기존 스타일 containerStyle, headerStyle 등은 그대로 유지) ...
    const containerStyle = {
        position: 'absolute',
        top: '20px',
        right: '20px',
        left: 'auto',
        width: 'min(320px, calc(100vw - 40px))',
        maxHeight: 'calc(100dvh - 40px)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.white,
        borderRadius: '12px',
        boxShadow: SHADOWS.card,
        zIndex: 10,
        overflow: 'visible', // ⚡ 툴팁이 잘리지 않도록 visible로 변경
        transition: 'all 0.3s ease',
        border: `1px solid ${COLORS.border}`,
        fontFamily: "'Pretendard', sans-serif",
    };

    // ... (headerStyle 등 기존 코드 생략) ...
    const headerStyle = {
        backgroundColor: COLORS.primary,
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        color: COLORS.white,
        flexShrink: 0,
        borderTopLeftRadius: '12px',  // 둥근 모서리 명시
        borderTopRightRadius: '12px',
    };

    const contentStyle = {
        padding: '20px',
        display: isOpen ? 'flex' : 'none',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
        minHeight: 0,
    };

    return (
        <>
            <div style={containerStyle}>
                {/* Header */}
                <div onClick={() => setIsOpen(!isOpen)} style={headerStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                            Trazo
                        </span>
                        <span style={{ fontSize: '11px', opacity: 0.8, fontWeight: '400' }}>
                            지도 위에 그리는 나만의 라이딩
                        </span>
                    </div>
                    <span style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }}>
                        ▲
                    </span>
                </div>

                <div aria-label="계정 로그인" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 20px', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMain, flexShrink: 0 }}>
                    {user && <span style={{ fontSize: '12px', overflowWrap: 'anywhere' }}>{user.displayName || user.email}님</span>}
                    <Button disabled={!authConfigured || authLoading || authBusy || isSaving} onClick={onAuth} variant="primary">
                        {authLoading ? '로그인 확인 중…' : authBusy ? '처리 중…' : user ? '로그아웃' : '구글로 로그인'}
                    </Button>
                    {!authConfigured && <span role="status" style={{ fontSize: '12px' }}>구글 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.</span>}
                    {authConfigured && !user && <span style={{ fontSize: '12px' }}>로그인하면 내 코스를 저장하고 불러올 수 있어요.</span>}
                    {authError && <span role="alert" style={{ fontSize: '12px', color: '#b91c1c' }}>{authError}</span>}
                </div>

                {/* Body */}
                <div style={contentStyle}>

                    {/* 1. 코스 정보 (생략 - 기존 코드 유지) */}
                    <div style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: `1px dashed ${COLORS.border}` }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: COLORS.textMain, marginBottom: '4px' }}>
                            {currentTitle}
                        </div>
                        {isModified ? (
                            <span style={{ fontSize: '12px', color: COLORS.secondary, fontWeight: '600' }}>● 저장하지 않은 변경 사항</span>
                        ) : (
                            <span style={{ fontSize: '12px', color: COLORS.textSub }}>변경 사항 없음</span>
                        )}
                    </div>

                    {/* 2. 통계 및 히스토리 (생략 - 기존 코드 유지) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', color: COLORS.textSub, lineHeight: '1.4' }}>
                            <strong style={{ color: COLORS.primary }}>{markerCount}</strong> 경유점<br />
                            <strong style={{ color: COLORS.primary }}>{polylineCount}</strong> 연결 구간
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button size="small" variant="outline" onClick={onUndo} disabled={!canUndo} title="되돌리기">↩</Button>
                            <Button size="small" variant="outline" onClick={onRedo} disabled={!canRedo} title="다시 실행">↪</Button>
                        </div>
                    </div>

                    {/* 3. 옵션 (Auto Routing) */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: COLORS.background,
                        padding: '10px 12px',
                        borderRadius: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: COLORS.textMain }}>
                                ⚡ 자동 경로 연결
                            </span>

                            {/* ℹ️ 아이콘 & 툴팁 영역 */}
                            <div
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                                onClick={() => setIsHelpOpen(true)}
                                style={{
                                    width: '16px', height: '16px',
                                    backgroundColor: COLORS.primary,
                                    borderRadius: '50%',
                                    color: 'white',
                                    fontSize: '11px', fontWeight: 'bold',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                            >
                                i
                                {/* Tooltip (Hover 시 등장) */}
                                {showTooltip && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '100%', left: '50%',
                                        transform: 'translateX(-50%)',
                                        marginBottom: '8px',
                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                        color: 'white',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none',
                                        zIndex: 20
                                    }}>
                                        기능 알아보기
                                        <div style={{ // 말풍선 꼬리
                                            position: 'absolute', top: '100%', left: '50%',
                                            transform: 'translateX(-50%)',
                                            borderWidth: '4px', borderStyle: 'solid',
                                            borderColor: 'rgba(0,0,0,0.8) transparent transparent transparent'
                                        }} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                            <input
                                type="checkbox"
                                disabled={isBusy}
                                checked={isAutoRouting}
                                onChange={(e) => onToggleAutoRouting(e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: isAutoRouting ? COLORS.accent : '#ccc',
                                transition: '.3s', borderRadius: '34px'
                            }}>
                                <span style={{
                                    position: 'absolute', content: '""', height: '16px', width: '16px',
                                    left: isAutoRouting ? '18px' : '2px', bottom: '2px',
                                    backgroundColor: 'white', transition: '.3s', borderRadius: '50%',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                }}></span>
                            </span>
                        </label>
                    </div>

                    {/* 4. 메인 액션 버튼 (생략 - 기존 코드 유지) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button disabled={isBusy || !user || authLoading || authBusy} onClick={onSave} variant="primary" style={{ flex: 1 }}>☁ 저장</Button>
                            <Button disabled={!user || authLoading || authBusy} onClick={onList} variant="secondary" style={{ flex: 1 }}>📂 목록</Button>
                        </div>
                        <Button onClick={onDownload} variant="accent" style={{ width: '100%' }}>💾 TCX 다운로드</Button>
                        <Button disabled={isSaving} onClick={onReset} variant="danger" size="small" style={{ width: '100%', marginTop: '5px' }}>🗑️ 초기화</Button>
                    </div>
                </div>
            </div>

            {/* ⚡ 도움말 모달 컴포넌트 렌더링 */}
            <SmartRoutingHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </>
    );
};

export default ControlPanel;