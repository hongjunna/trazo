// src/components/ElevationPanel.jsx
// 고도 프로필 + 최고·최저 고도 + 경사 구간 범례.
// 데스크톱은 지도 아래에 붙어 접고 펼 수 있고(dock), 모바일은 시트 안의 카드로 들어갑니다(inline).
import { useMemo } from 'react';
import ElevationChart from './ElevationChart';
import Button from './ui/Button';
import Icon from './ui/Icon';
import { flattenCourse } from '../utils/course';

const ElevationPanel = ({ polylines, zones, onHoverPoint, variant = 'dock', open = true, onToggle }) => {
    const range = useMemo(() => {
        const elevations = flattenCourse(polylines).map(point => point.ele ?? 0);
        if (!elevations.length) return null;
        return { max: Math.max(...elevations), min: Math.min(...elevations) };
    }, [polylines]);

    const isDock = variant === 'dock';
    const collapsed = isDock && !open;

    return (
        <section className={`elevation ${isDock ? '' : 'elevation--inline'} ${collapsed ? 'elevation--collapsed' : ''}`} aria-label="고도 프로필">
            <div className="elevation__bar">
                <h3 className="elevation__title"><Icon name="mountain" size={16} />고도</h3>
                {range && (
                    <div className="elevation__facts">
                        <span>최고 <b>{Math.round(range.max)}m</b></span>
                        <span>최저 <b>{Math.round(range.min)}m</b></span>
                    </div>
                )}
                {!collapsed && (
                    <div className="legend" aria-label="경사 구간">
                        {zones.map(zone => (
                            <span key={zone.label} className="legend__item" title={zone.desc}>
                                <span className="legend__swatch" style={{ background: zone.color }} />
                                {zone.label}
                            </span>
                        ))}
                    </div>
                )}
                {isDock && (
                    <Button
                        variant="ghost"
                        size="sm"
                        iconRight={open ? 'chevron-down' : 'chevron-up'}
                        onClick={onToggle}
                        aria-expanded={open}
                        style={collapsed ? { marginLeft: 'auto' } : undefined}
                    >
                        {open ? '접기' : '펼치기'}
                    </Button>
                )}
            </div>
            <div className="elevation__chart">
                {!collapsed && <ElevationChart polylines={polylines} zones={zones} onHoverPoint={onHoverPoint} />}
            </div>
        </section>
    );
};

export default ElevationPanel;
