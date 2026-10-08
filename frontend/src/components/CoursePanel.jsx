// src/components/CoursePanel.jsx
// 코스 요약(이름·거리·고도·시간·저장/내보내기)과 코스 설정(편집 도구·길찾기·예상 속도)
// 데스크톱 사이드바와 모바일 바텀 시트가 같은 구성 요소를 사용합니다.
import { useState } from 'react';
import { SPORTS, formatDuration, formatPace, parsePace, speedFromPace } from '../sports';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';

const TITLE_MAX = 60;

const EditableTitle = ({ title, onRename }) => {
    const [draft, setDraft] = useState(null);

    const commit = () => {
        const next = draft?.trim();
        if (next && next !== title) onRename(next.slice(0, TITLE_MAX));
        setDraft(null);
    };

    if (draft !== null) {
        return (
            <input
                className="course-title-input"
                aria-label="코스 이름"
                value={draft}
                maxLength={TITLE_MAX}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onFocus={(event) => event.target.select()}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') setDraft(null);
                }}
            />
        );
    }
    return (
        <button type="button" className="course-title" onClick={() => setDraft(title)} title="코스 이름 바꾸기">
            <span>{title}</span>
            <Icon name="pencil" size={14} />
        </button>
    );
};

const Stat = ({ label, value, unit, sub }) => (
    <div className="stat">
        <span className="stat__label">{label}</span>
        <span className="stat__value">{value}{unit && <span className="stat__unit">{unit}</span>}</span>
        {sub && <span className="stat__sub">{sub}</span>}
    </div>
);

export const CourseSummary = ({
    sport, title, onRename, isModified, isSavedCourse, stats, speedKmh, hasCourse,
    onSave, canSave, isSaving, onDownloadGpx, onDownloadTcx, isExportingTcx,
}) => {
    const current = SPORTS[sport];
    const speedLabel = current.speedInput === 'pace' ? `${formatPace(speedKmh)}/km 기준` : `${Math.round(speedKmh * 10) / 10}km/h 기준`;
    let status = null;
    if (hasCourse && isModified) status = <span className="status-chip status-chip--dirty">저장 안 됨</span>;
    else if (isSavedCourse && !isModified) status = <span className="status-chip status-chip--saved">저장됨</span>;

    return (
        <section className="card summary" aria-label="코스 요약">
            <div className="summary__head">
                <EditableTitle title={title} onRename={onRename} />
                {status}
            </div>
            <div className="stats">
                <Stat label="거리" value={stats.distanceKm.toFixed(stats.distanceKm >= 100 ? 1 : 2)} unit="km" />
                <Stat label="상승 고도" value={Math.round(stats.ascentM).toLocaleString()} unit="m" sub={hasCourse ? `하강 ${Math.round(stats.descentM).toLocaleString()}m` : undefined} />
                <Stat label="예상 시간" value={formatDuration(stats.distanceKm / speedKmh)} sub={speedLabel} />
            </div>
            <div className="summary__actions">
                <Button variant="primary" icon="save" onClick={onSave} disabled={!canSave} loading={isSaving}>
                    {isSavedCourse ? '저장' : '코스 저장'}
                </Button>
                <Button variant="secondary" icon="download" onClick={onDownloadGpx} disabled={!hasCourse} title="GPX 파일 내려받기 (대부분의 앱·기기 지원)">GPX</Button>
                <Button variant="secondary" icon="download" onClick={onDownloadTcx} disabled={!hasCourse} loading={isExportingTcx} title="TCX 파일 내려받기 (가민 등 코스 시간 포함)">TCX</Button>
            </div>
        </section>
    );
};

// 종목별 예상 속도 입력 (자전거: km/h, 러닝: 분:초/km)
const SpeedField = ({ sport, speedKmh, onChange }) => {
    const isPace = SPORTS[sport].speedInput === 'pace';
    const display = isPace ? formatPace(speedKmh) : String(Math.round(speedKmh * 10) / 10);
    const [draft, setDraft] = useState(null);
    const [invalid, setInvalid] = useState(false);

    const commit = () => {
        if (draft === null) return;
        let ok = false;
        if (isPace) {
            const pace = parsePace(draft);
            if (pace) { onChange(speedFromPace(pace)); ok = true; }
        } else {
            const speed = Number(draft);
            if (speed >= 5 && speed <= 50) { onChange(speed); ok = true; }
        }
        setInvalid(!ok);
        setDraft(null);
    };

    return (
        <div className="section">
            <div className="section__head">
                <Icon name="gauge" size={16} />
                <h3 className="section__title">예상 시간 기준</h3>
            </div>
            <label className="field">
                {isPace ? '평균 페이스' : '평균 속도'}
                <input
                    className="input input--sm"
                    aria-label={isPace ? '러닝 평균 페이스 (분:초/km)' : '자전거 평균 속도 (km/h)'}
                    aria-invalid={invalid || undefined}
                    value={draft ?? display}
                    inputMode={isPace ? 'text' : 'decimal'}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') setDraft(null);
                    }}
                />
                {isPace ? '/km' : 'km/h'}
            </label>
            <p className="section__note">
                {invalid
                    ? (isPace ? '2:00~20:00 사이의 페이스를 "분:초" 형식으로 입력하세요.' : '5~50 사이의 속도를 입력하세요.')
                    : '예상 시간과 TCX 파일의 시간 정보 계산에 사용해요.'}
            </p>
        </div>
    );
};

export const CourseSettings = ({
    sport, markerCount, isLoop, isBusy,
    onCloseLoop, onOutAndBack, onNewCourse,
    isAutoRouting, onToggleAutoRouting, routeOptions, onToggleRouteOption, onOpenHelp,
    speedKmh, onChangeSpeed,
}) => {
    const current = SPORTS[sport];
    const hasCourse = markerCount >= 2;

    return (
        <>
            <div className="section">
                <div className="section__head">
                    <Icon name="route" size={16} />
                    <h3 className="section__title">점 연결 방식</h3>
                    <button type="button" className="help-btn" onClick={onOpenHelp} aria-label="점 연결 방식 도움말" title="도움말">
                        <Icon name="help" size={16} />
                    </button>
                </div>
                <SegmentedControl
                    label="점 연결 방식"
                    value={isAutoRouting ? 'route' : 'straight'}
                    onChange={(value) => onToggleAutoRouting(value === 'route')}
                    disabled={isBusy}
                    options={[
                        { value: 'route', label: `${current.label} 길 따라`, icon: 'route' },
                        { value: 'straight', label: '직선 연결', icon: 'straight' },
                    ]}
                />
                {isAutoRouting ? (
                    <div className="option-list" role="group" aria-label={`${current.label} 길찾기 옵션`}>
                        {current.routeOptions.map(option => (
                            <label key={option.id} className={`option-row ${isBusy ? 'option-row--disabled' : ''}`}>
                                <span className="option-row__text">
                                    <span className="option-row__label">{option.label}</span>
                                    <span className="option-row__desc">{option.desc}</span>
                                </span>
                                <input
                                    type="checkbox"
                                    role="switch"
                                    className="switch"
                                    checked={Boolean(routeOptions[option.id])}
                                    disabled={isBusy}
                                    onChange={() => onToggleRouteOption(option.id)}
                                />
                            </label>
                        ))}
                    </div>
                ) : (
                    <p className="section__note">길을 찾지 않고 점과 점을 곧게 이어요. 지도에 없는 길이나 운동장 트랙에 사용하세요.</p>
                )}
                {isAutoRouting && <p className="section__note">옵션은 다음에 찍는 점부터 적용돼요.</p>}
            </div>

            <div className="section">
                <div className="section__head">
                    <Icon name="sliders" size={16} />
                    <h3 className="section__title">코스 편집</h3>
                    <span className="section__meta">찍은 점 {markerCount}개</span>
                </div>
                <div className="tool-grid">
                    <button type="button" className="tool-btn" onClick={onCloseLoop} disabled={!hasCourse || isLoop || isBusy}>
                        <span className="tool-btn__label"><Icon name="loop" size={16} />출발점으로 복귀</span>
                        <span className="tool-btn__desc">마지막 점에서 출발점까지 이어 순환 코스로</span>
                    </button>
                    <button type="button" className="tool-btn" onClick={onOutAndBack} disabled={!hasCourse || isBusy}>
                        <span className="tool-btn__label"><Icon name="outback" size={16} />왕복 코스</span>
                        <span className="tool-btn__desc">지금까지의 길을 그대로 되돌아오기</span>
                    </button>
                </div>
                <Button variant="danger-ghost" size="sm" icon="plus" onClick={onNewCourse} style={{ alignSelf: 'flex-start' }}>
                    새 코스 시작
                </Button>
            </div>

            <SpeedField key={sport} sport={sport} speedKmh={speedKmh} onChange={onChangeSpeed} />
        </>
    );
};
