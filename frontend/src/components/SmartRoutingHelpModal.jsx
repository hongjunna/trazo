// src/components/SmartRoutingHelpModal.jsx
import React from 'react';
import { COLORS, SHADOWS } from '../styles/theme';
import { SPORTS } from '../sports';
import Button from './ui/Button';

const SmartRoutingHelpModal = ({ isOpen, onClose, sport }) => {
    if (!isOpen) return null;
    const current = SPORTS[sport];

    const modalStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)', padding: '16px'
    };

    const contentStyle = {
        backgroundColor: COLORS.white,
        borderRadius: '16px',
        width: 'min(440px, 100%)',
        maxHeight: 'calc(100dvh - 32px)',
        overflowY: 'auto',
        boxShadow: SHADOWS.modal,
        fontFamily: "'Pretendard', sans-serif",
    };

    const sectionStyle = (bgColor) => ({
        padding: '20px',
        backgroundColor: bgColor,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        borderBottom: `1px solid ${COLORS.border}`
    });

    const badgeStyle = (color, bg) => ({
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: bg,
        color: color,
        fontSize: '12px',
        fontWeight: '700',
        marginBottom: '4px',
        width: 'fit-content'
    });

    return (
        <div style={modalStyle} onClick={onClose}>
            <div style={contentStyle} onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '20px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: COLORS.primary }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: COLORS.white, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {current.icon} {current.label} 코스 점 연결 가이드
                    </h2>
                </div>

                {/* Content 1: 길 따라 연결 */}
                <div style={sectionStyle(COLORS.white)}>
                    <div style={badgeStyle(current.onColor, current.color)}>
                        길 따라 연결
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMain, lineHeight: '1.5' }}>
                        점과 점 사이를 <strong>{current.label}에 맞는 길로 자동 연결</strong>합니다.<br />
                        <span style={{ fontSize: '13px', color: COLORS.textSub }}>{current.tagline}</span>
                    </p>
                    <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '13px', color: COLORS.textMain, lineHeight: 1.6 }}>
                        {current.routeOptions.map(option => (
                            <li key={option.id}><strong>{option.label}</strong>: {option.desc}</li>
                        ))}
                    </ul>
                </div>

                {/* Content 2: 직선 연결 */}
                <div style={sectionStyle('#FAF5F0')}>
                    <div style={badgeStyle(COLORS.white, COLORS.secondary)}>
                        직선 연결
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMain, lineHeight: '1.5' }}>
                        점과 점 사이를 <strong>직선으로 연결</strong>합니다.<br />
                        <span style={{ fontSize: '13px', color: COLORS.textSub }}>
                            {sport === 'run'
                                ? '예: 운동장 트랙, 지도에 없는 공원 안 샛길, 해변 등'
                                : '예: 지도에 없는 샛길, 공사로 바뀐 길 등'}
                        </span>
                    </p>
                </div>

                {/* Tip */}
                <div style={{ padding: '15px 20px', backgroundColor: COLORS.background, fontSize: '13px', color: COLORS.textSub, lineHeight: 1.6 }}>
                    💡 <strong>도움말:</strong> 직선 모드에서도 Trazo는 지형 데이터를 분석해 고도를 계산합니다.
                    <strong> 출발점으로 복귀</strong>는 마지막 점에서 출발점까지 길을 찾아 순환 코스를 만들고, <strong>왕복</strong>은 지금까지의 길을 그대로 되돌아오는 코스를 만듭니다.
                </div>

                {/* Footer */}
                <div style={{ padding: '15px', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose} variant="primary">확인</Button>
                </div>
            </div>
        </div>
    );
};

export default SmartRoutingHelpModal;
