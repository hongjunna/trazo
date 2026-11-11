// src/components/AiReport.jsx
// 전체 공개 러닝 코스에 붙는 AI 리포트 안내: 공개 범위 위의 "AI 리포트 제공" 표시, 소개 대화상자,
// 전체 공개가 아닌 범위로 저장할 때 한 번 더 권하는 대화상자.
import { useState } from 'react';
import { hideAiNudge } from '../utils/aiReport';
import { VISIBILITY } from '../utils/share';
import CourseInsight from './CourseInsight';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';

const FEATURES = [
    { icon: 'gauge', title: '난이도 5단계', desc: '거리와 상승 고도로 입문부터 매우 어려움까지 코스 난이도를 매겨요.' },
    { icon: 'run', title: '추천 훈련', desc: '인터벌·템포런·언덕 반복·LSD 등 코스 성격에 맞는 훈련을 추천해요.' },
    { icon: 'sparkles', title: 'AI 코스 소개', desc: '경로·고도·주변 장소를 살펴 강변·공원 같은 테마와 코스 특징, 코스 안내를 써 드려요.' },
    { icon: 'users', title: '더 많은 러너에게', desc: '커뮤니티와 코스 탐색에 난이도·테마가 함께 보여 다른 러너가 코스를 고르기 쉬워져요.' },
];

const SAMPLE_INSIGHT = {
    difficulty: 3,
    distance: '10k',
    shape: 'loop',
    terrain: 'flat',
    training: ['tempo', 'lsd'],
    themes: ['riverside', 'park'],
    feature: '강변 자전거길 옆 보행로를 따라 신호 없이 이어지는 평탄한 순환 코스예요. 페이스를 일정하게 유지하기 좋아요.',
    route: '공원 입구에서 출발해 강을 따라 하류로 5km 달린 뒤 다리를 건너 반대편 강변으로 돌아와요.',
};

/** 공개 범위 선택 위에 붙는 "AI 리포트 제공" 표시. 누르면 소개 대화상자를 엽니다. */
export const AiReportHint = ({ active = false }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                className={`ai-hint${active ? ' ai-hint--active' : ''}`}
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                title="AI 리포트 알아보기"
            >
                <Icon name="sparkles" size={12} />
                AI 리포트 제공
                <Icon name="info" size={13} className="ai-hint__info" />
            </button>
            <AiReportDialog open={open} onClose={() => setOpen(false)} />
        </>
    );
};

export const AiReportDialog = ({ open, onClose }) => (
    <Dialog
        open={open}
        onClose={onClose}
        title="AI 코스 리포트"
        description="전체 공개한 러닝 코스를 AI가 분석해 코스에 리포트를 붙여 드려요."
        initialFocus="dialog"
        footer={<Button variant="primary" onClick={onClose} data-autofocus>확인</Button>}
    >
        <ul className="ai-features">
            {FEATURES.map(({ icon, title, desc }) => (
                <li key={title}>
                    <span className="ai-features__icon"><Icon name={icon} size={16} /></span>
                    <span>
                        <b>{title}</b>
                        <span>{desc}</span>
                    </span>
                </li>
            ))}
        </ul>
        <p className="ai-sample__label">리포트 예시</p>
        <div className="ai-sample" aria-label="AI 리포트 예시">
            <CourseInsight insight={SAMPLE_INSIGHT} sport="run" />
        </div>
        <p className="form-hint">
            저장하면 분석이 시작되고, AI 소개는 운영자가 검토한 뒤 보여요. 부분 공개·비공개 코스는 분석하지 않아요.
        </p>
    </Dialog>
);

/** 전체 공개가 아닌 범위로 저장하려 할 때 한 번 더 권합니다. */
export const AiNudgeDialog = ({ visibility, onSavePublic, onSaveAsIs, onClose }) => {
    const [hide, setHide] = useState(false);
    const remember = () => { if (hide) hideAiNudge(); };

    return (
        <Dialog
            open
            onClose={onClose}
            size="sm"
            title="전체 공개하고 AI 리포트 받아보세요"
            initialFocus="dialog"
            footer={<>
                <Button variant="secondary" onClick={() => { remember(); onSaveAsIs(); }}>
                    {VISIBILITY[visibility].label}로 저장
                </Button>
                <Button variant="primary" icon="globe" data-autofocus onClick={() => { remember(); onSavePublic(); }}>
                    전체 공개로 저장
                </Button>
            </>}
        >
            <div className="ai-nudge">
                <span className="ai-nudge__icon"><Icon name="sparkles" size={22} /></span>
                <p>
                    전체 공개로 저장하면 AI가 이 코스의 <b>난이도</b>, <b>추천 훈련</b>, <b>코스 소개</b>를 담은 리포트를 만들어 드려요.
                    {' '}{VISIBILITY[visibility].label} 코스는 분석하지 않아요.
                </p>
            </div>
            <label className="check-row">
                <input type="checkbox" checked={hide} onChange={(event) => setHide(event.target.checked)} />
                다시 보지 않기
            </label>
        </Dialog>
    );
};
