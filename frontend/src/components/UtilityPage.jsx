// src/components/UtilityPage.jsx
// 유틸리티: 러닝(페이스 계산기)과 자전거(준비 중) 섹션. 섹션마다 주소가 있어(/utility, /utility/bike) 검색에 따로 노출됩니다.
import { useState } from 'react';
import PageFrame from './PageFrame';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';
import {
    MILE_KM, RACE_DISTANCES, TRACK_LAP_KM, distanceFrom, formatDuration, paceFrom, riegel, speedKmh, splits, timeFrom, toSeconds,
} from '../utils/pace';
import { UTILITY_SECTIONS } from '../utils/pages';

const MODES = [
    { value: 'pace', label: '페이스 구하기' },
    { value: 'time', label: '완주 시간 구하기' },
    { value: 'distance', label: '거리 구하기' },
];

const NumberField = ({ label, value, onChange, max, width = 64, step = 1, placeholder = '0' }) => (
    <label className="pace-field" style={{ '--w': `${width}px` }}>
        <input
            type="number"
            inputMode={step === 1 ? 'numeric' : 'decimal'}
            min="0"
            max={max}
            step={step}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
        />
        <span>{label}</span>
    </label>
);

const TimeInput = ({ value, onChange, legend }) => (
    <fieldset className="pace-group">
        <legend>{legend}</legend>
        <div className="pace-inline">
            <NumberField label="시간" value={value.h} onChange={(h) => onChange({ ...value, h })} max={99} />
            <NumberField label="분" value={value.m} onChange={(m) => onChange({ ...value, m })} max={59} />
            <NumberField label="초" value={value.s} onChange={(s) => onChange({ ...value, s })} max={59} />
        </div>
    </fieldset>
);

const PaceInput = ({ value, onChange }) => (
    <fieldset className="pace-group">
        <legend>페이스 (1km당)</legend>
        <div className="pace-inline">
            <NumberField label="분" value={value.m} onChange={(m) => onChange({ ...value, m })} max={59} />
            <NumberField label="초" value={value.s} onChange={(s) => onChange({ ...value, s })} max={59} />
            <span className="pace-unit">/km</span>
        </div>
    </fieldset>
);

const DistanceInput = ({ value, onChange }) => (
    <fieldset className="pace-group">
        <legend>거리</legend>
        <div className="pace-inline">
            <NumberField label="km" value={value} onChange={onChange} step={0.0001} width={120} placeholder="10" />
        </div>
        <div className="pace-presets" role="group" aria-label="대회 거리">
            {RACE_DISTANCES.map(race => (
                <button key={race.id} type="button" className="chip" aria-pressed={Number(value) === race.km} onClick={() => onChange(String(race.km))}>
                    {race.label}
                </button>
            ))}
        </div>
    </fieldset>
);

const Result = ({ label, value, sub }) => (
    <div className="pace-result">
        <span className="pace-result__label">{label}</span>
        <strong className="pace-result__value">{value}</strong>
        {sub && <span className="pace-result__sub">{sub}</span>}
    </div>
);

const PaceCalculator = () => {
    const [mode, setMode] = useState('pace');
    const [distance, setDistance] = useState('10');
    const [time, setTime] = useState({ h: '', m: '50', s: '00' });
    const [pace, setPace] = useState({ m: '5', s: '00' });

    const inputKm = Number(distance);
    const inputSeconds = toSeconds(time);
    const inputPace = toSeconds({ m: pace.m, s: pace.s });

    let km = null;
    let seconds = null;
    let paceSeconds = null;
    if (mode === 'pace') {
        km = inputKm > 0 ? inputKm : null;
        seconds = inputSeconds;
        paceSeconds = paceFrom(km, seconds);
    } else if (mode === 'time') {
        km = inputKm > 0 ? inputKm : null;
        paceSeconds = inputPace;
        seconds = timeFrom(km, paceSeconds);
    } else {
        seconds = inputSeconds;
        paceSeconds = inputPace;
        km = distanceFrom(seconds, paceSeconds);
    }
    const ready = Boolean(km && seconds && paceSeconds);
    const speed = speedKmh(paceSeconds);

    return (
        <section className="pace" aria-labelledby="pace-title">
            <div className="pace-card">
                <h2 id="pace-title" className="pace-title"><Icon name="run" size={18} />러닝 페이스 계산기</h2>
                <p className="pace-intro">거리·시간·페이스 중 두 가지를 넣으면 나머지를 계산하고, 1km 구간 기록과 400m 트랙 한 바퀴 기록, 다른 거리 예상 기록까지 보여줘요.</p>
                <SegmentedControl label="계산 방식" value={mode} onChange={setMode} options={MODES} className="pace-modes" />
                <div className="pace-inputs">
                    {mode !== 'distance' && <DistanceInput value={distance} onChange={setDistance} />}
                    {mode !== 'time' && <TimeInput value={time} onChange={setTime} legend={mode === 'distance' ? '달린 시간' : '완주 시간'} />}
                    {mode !== 'pace' && <PaceInput value={pace} onChange={setPace} />}
                </div>
            </div>

            <div className="pace-card" aria-live="polite">
                {ready ? (
                    <>
                        <div className="pace-results">
                            <Result label="페이스" value={`${formatDuration(paceSeconds)} /km`} sub={`1마일 ${formatDuration(paceSeconds * MILE_KM)}`} />
                            <Result label="속도" value={`${speed.toFixed(2)} km/h`} />
                            <Result label="완주 시간" value={formatDuration(seconds)} sub={`${(Math.round(km * 1000) / 1000).toLocaleString()}km`} />
                            <Result label="400m 트랙 한 바퀴" value={formatDuration(paceSeconds * TRACK_LAP_KM, { decimals: 1 })} sub={`200m ${formatDuration(paceSeconds * TRACK_LAP_KM / 2, { decimals: 1 })}`} />
                        </div>

                        <h3 className="pace-subtitle">같은 실력이면 다른 거리는? <span>(리겔 공식 예상)</span></h3>
                        <div className="pace-table-wrap">
                            <table className="pace-table">
                                <thead><tr><th>거리</th><th>예상 기록</th><th>페이스</th></tr></thead>
                                <tbody>
                                    {RACE_DISTANCES.map(race => {
                                        const predicted = riegel(km, seconds, race.km);
                                        return (
                                            <tr key={race.id}>
                                                <td>{race.label}</td>
                                                <td>{formatDuration(predicted)}</td>
                                                <td>{formatDuration(predicted / race.km)} /km</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <h3 className="pace-subtitle">1km 구간 기록</h3>
                        <div className="pace-table-wrap pace-table-wrap--splits">
                            <table className="pace-table">
                                <thead><tr><th>거리</th><th>누적 기록</th></tr></thead>
                                <tbody>
                                    {splits(km, paceSeconds).map(row => (
                                        <tr key={row.km}><td>{row.km}km</td><td>{formatDuration(row.seconds)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <p className="pace-empty"><Icon name="info" size={16} />값을 넣으면 결과가 여기에 나와요.</p>
                )}
            </div>

            <article className="pace-card pace-help">
                <h2>페이스 계산기 사용법</h2>
                <ul>
                    <li><b>페이스 구하기</b>: 목표 거리와 완주 시간을 넣으면 1km당 페이스와 속도를 알려줘요. 예) 10km를 50분에 달리려면 5:00/km.</li>
                    <li><b>완주 시간 구하기</b>: 거리와 페이스로 완주 시간을 계산해요. 예) 하프마라톤을 5:30/km로 달리면 1:56:02.</li>
                    <li><b>거리 구하기</b>: 달린 시간과 페이스로 몇 km를 달렸는지 계산해요.</li>
                </ul>
                <h3>자주 묻는 질문</h3>
                <dl>
                    <dt>페이스와 속도는 어떻게 바꾸나요?</dt>
                    <dd>속도(km/h) = 60 ÷ 페이스(분/km)예요. 5:00/km는 12km/h, 6:00/km는 10km/h예요.</dd>
                    <dt>400m 트랙 한 바퀴 기록은 왜 필요한가요?</dt>
                    <dd>트랙에서 인터벌·템포런을 할 때 한 바퀴마다 목표 기록을 확인할 수 있어요. 1레인 기준이며 바깥 레인은 한 바퀴가 더 길어요. 가까운 육상 트랙은 <a href="/explore">코스 지도</a>의 트랙 보기에서 찾을 수 있어요.</dd>
                    <dt>다른 거리 예상 기록은 얼마나 정확한가요?</dt>
                    <dd>리겔 공식(T₂ = T₁ × (D₂ ÷ D₁)<sup>1.06</sup>)으로 어림한 값이에요. 장거리 훈련량이 부족하면 하프·풀코스 실제 기록은 예상보다 느릴 수 있어요.</dd>
                </dl>
            </article>
        </section>
    );
};

const BikeComingSoon = () => (
    <section className="pace-card utility-soon" aria-labelledby="bike-soon-title">
        <span className="utility-soon__icon"><Icon name="bike" size={28} /></span>
        <h2 id="bike-soon-title">곧 새로운 기능으로 돌아올게요!</h2>
        <p>자전거 라이딩에 쓸 계산 도구를 준비하고 있어요. 그동안 <a href="/">코스 생성</a>에서 자전거 코스를 만들고 예상 시간과 고도를 확인해 보세요.</p>
    </section>
);

const UtilityPage = ({ section, onSectionChange }) => {
    const go = (event, id) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onSectionChange(id);
    };
    return (
        <PageFrame title="유틸리티" description="러닝·라이딩에 필요한 계산 도구 모음" className="utility">
            <nav className="utility-tabs" aria-label="유틸리티 종목">
                {Object.entries(UTILITY_SECTIONS).map(([id, item]) => (
                    <a key={id} href={item.path} className="utility-tab" aria-current={section === id ? 'page' : undefined} onClick={(event) => go(event, id)}>
                        <Icon name={item.icon} size={16} />{item.label}
                    </a>
                ))}
            </nav>
            {section === 'bike' ? <BikeComingSoon /> : <PaceCalculator />}
        </PageFrame>
    );
};

export default UtilityPage;
