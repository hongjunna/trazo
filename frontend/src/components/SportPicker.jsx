// src/components/SportPicker.jsx
// 처음 방문하거나 새 코스를 시작할 때 어떤 코스를 만들지 고르는 화면
import { SPORTS, SPORT_IDS } from '../sports';
import Dialog from './ui/Dialog';
import Icon from './ui/Icon';
import trazoMark from '../assets/trazo-mark.svg';

const featuresFor = (sport) => [
    sport.tagline,
    `${sport.distanceMarkerKm}km마다 거리 표시 · ${sport.speedInput === 'pace' ? '페이스' : '평균 속도'}로 예상 시간`,
    'GPX·TCX 파일로 내보내기',
];

const SportPicker = ({ open, onSelect, onClose, isFirstVisit }) => (
    <Dialog
        open={open}
        onClose={onClose}
        dismissible={!isFirstVisit}
        size="lg"
        initialFocus="dialog"
    >
        <div className="welcome__brand">
            <span className="brand__mark"><img src={trazoMark} alt="" /></span>
            <span className="brand__text">
                <span className="brand__name">Trazo</span>
                <span className="brand__tagline">지도 위에 점을 찍어 그리는 나만의 코스</span>
            </span>
        </div>
        <h2 className="dialog__title">어떤 코스를 만들까요?</h2>
        <p className="welcome__lead">종목에 맞는 길로 점과 점을 이어드려요. 만드는 중에도 위쪽 종목 버튼으로 언제든 바꿀 수 있어요.</p>
        <div className="sport-cards">
            {SPORT_IDS.map(id => {
                const sport = SPORTS[id];
                return (
                    <button
                        key={id}
                        type="button"
                        className="sport-card"
                        style={{ '--card-color': sport.color, '--card-on': sport.onColor }}
                        onClick={() => onSelect(id)}
                    >
                        <span className="sport-card__icon"><Icon name={sport.icon} size={26} /></span>
                        <span className="sport-card__title">{sport.label} 코스</span>
                        <ul className="sport-card__features">
                            {featuresFor(sport).map(text => (
                                <li key={text}><Icon name="check" size={14} strokeWidth={2.5} />{text}</li>
                            ))}
                        </ul>
                        <span className="sport-card__cta">{sport.label} 코스 만들기 <Icon name="chevron-right" size={16} /></span>
                    </button>
                );
            })}
        </div>
    </Dialog>
);

export default SportPicker;
