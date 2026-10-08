// src/components/SportPicker.jsx
// 처음 방문했을 때 어떤 코스를 만들지 고르는 화면
import React from 'react';
import { COLORS, SHADOWS } from '../styles/theme';
import { SPORTS, SPORT_IDS } from '../sports';

const SportPicker = ({ isOpen, onSelect }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(11, 79, 87, 0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
            <div role="dialog" aria-modal="true" aria-labelledby="sport-picker-title" style={{
                backgroundColor: COLORS.white, borderRadius: '16px', boxShadow: SHADOWS.modal,
                width: 'min(560px, 100%)', padding: '28px', color: COLORS.textMain,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '22px', fontWeight: 800, color: COLORS.primary, letterSpacing: '-0.5px' }}>
                    <img src="/favicon.svg" alt="" width={36} height={36} />
                    Trazo
                </div>
                <h2 id="sport-picker-title" style={{ margin: '6px 0 4px', fontSize: '18px' }}>어떤 코스를 만들까요?</h2>
                <p style={{ margin: '0 0 20px', fontSize: '13px', color: COLORS.textSub }}>
                    종목에 맞춰 길을 찾아드려요. 만드는 중에도 패널 위쪽에서 언제든 바꿀 수 있어요.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {SPORT_IDS.map(id => {
                        const sport = SPORTS[id];
                        return (
                            <button
                                key={id}
                                onClick={() => onSelect(id)}
                                style={{
                                    textAlign: 'left', cursor: 'pointer', padding: '18px',
                                    borderRadius: '12px', border: `2px solid ${sport.color}`,
                                    backgroundColor: COLORS.white, color: COLORS.textMain,
                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                }}
                            >
                                <span style={{ fontSize: '32px', lineHeight: 1 }}>{sport.icon}</span>
                                <span style={{ fontSize: '16px', fontWeight: 800 }}>{sport.label} 코스 만들기</span>
                                <span style={{ fontSize: '12px', color: COLORS.textSub, lineHeight: 1.5 }}>{sport.tagline}</span>
                                <span style={{
                                    marginTop: '4px', alignSelf: 'flex-start', fontSize: '11px', fontWeight: 700,
                                    padding: '3px 8px', borderRadius: '999px', backgroundColor: sport.color, color: sport.onColor,
                                }}>
                                    {sport.distanceMarkerKm}km마다 거리 표시 · GPX 내보내기
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SportPicker;
