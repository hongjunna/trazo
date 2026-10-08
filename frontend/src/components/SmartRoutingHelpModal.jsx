// src/components/SmartRoutingHelpModal.jsx
import React from 'react';
import { COLORS, SHADOWS } from '../styles/theme';
import Button from './ui/Button';

const SmartRoutingHelpModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const modalStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)'
    };

    const contentStyle = {
        backgroundColor: COLORS.white,
        borderRadius: '16px',
        width: '420px',
        boxShadow: SHADOWS.modal,
        overflow: 'hidden',
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
                        ⚡ 자동 경로 연결 가이드
                    </h2>
                </div>

                {/* Content 1: ON (자동) */}
                <div style={sectionStyle(COLORS.white)}>
                    <div style={badgeStyle(COLORS.primary, COLORS.accent)}>
                        켜짐 : 자동 경로 완성
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMain, lineHeight: '1.5' }}>
                        자전거 도로와 공도를 따라 <strong>길을 자동으로 찾아줍니다.</strong><br />
                        일반적인 라이딩 경로를 계획할 때 사용하세요.
                    </p>
                </div>

                {/* Content 2: OFF (Straight) */}
                <div style={sectionStyle('#FAF5F0')}> {/* 아주 연한 갈색 배경 */}
                    <div style={badgeStyle(COLORS.white, COLORS.secondary)}>
                        꺼짐 : 직선 연결 (수동)
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMain, lineHeight: '1.5' }}>
                        점과 점 사이를 <strong>직선으로 연결</strong>합니다.<br />
                        <span style={{ fontSize: '13px', color: COLORS.textSub }}>
                            예: 다리가 없는 강 도하, 계단, 지도에 없는 샛길 등
                        </span>
                    </p>
                </div>

                {/* Tip */}
                <div style={{ padding: '15px 20px', backgroundColor: COLORS.background, fontSize: '13px', color: COLORS.textSub }}>
                    💡 <strong>도움말:</strong> 직선 모드에서도 Trazo는 지형 데이터를 분석해 고도를 계산합니다.
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