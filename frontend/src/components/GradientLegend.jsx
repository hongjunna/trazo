// src/components/GradientLegend.jsx
import React from 'react';
import { COLORS } from '../styles/theme';

const GradientLegend = ({ zones }) => {
    return (
        <div style={{
            width: '190px',
            padding: '16px',
            backgroundColor: COLORS.white,
            borderLeft: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            color: COLORS.textMain
        }}>
            <h4 style={{
                margin: '0 0 12px 0',
                fontSize: '13px',
                color: COLORS.primary,
                letterSpacing: '0.5px'
            }}>
                경사 구간
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {zones.map((item, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '14px',
                            height: '14px',
                            backgroundColor: item.color,
                            borderRadius: '4px',
                            flexShrink: 0
                        }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: '700', fontSize: '12px', color: COLORS.textMain }}>
                                {item.label}
                            </span>
                            <span style={{ fontSize: '10px', color: COLORS.textSub }}>
                                {item.desc}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GradientLegend;