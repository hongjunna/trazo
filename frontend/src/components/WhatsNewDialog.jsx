// src/components/WhatsNewDialog.jsx
// 업데이트 안내. 처음 방문했거나 새 업데이트 뒤 처음 들어오면 보여줍니다.
// "다시 보지 않기"를 고르면 이 업데이트(UPDATE_ID)는 다시 보이지 않고, 그냥 닫으면 이번 방문 동안만 숨깁니다.
// 다음 업데이트를 알릴 때는 utils/aiReport.js의 UPDATE_ID와 아래 내용을 바꾸세요.
import { useState } from 'react';
import { dismissWhatsNew } from '../utils/aiReport';
import { AiReportDialog } from './AiReport';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';

const FEATURES = [
    {
        icon: 'bike',
        title: '자전거 코스도 AI 리포트',
        desc: '이제 전체 공개한 자전거 코스도 AI가 분석해 난이도, 업힐 훈련·회복 라이딩 같은 추천 훈련, 테마와 코스 소개를 붙여 드려요.',
    },
    {
        icon: 'sparkles',
        title: '분석이 끝나면 바로 공개',
        desc: '코스를 전체 공개로 저장하면 바로 분석을 시작하고, 끝나는 대로 코스에 리포트가 보여요.',
    },
    {
        icon: 'gauge',
        title: '한눈에 보는 난이도·테마',
        desc: '커뮤니티와 코스 탐색에서 난이도와 강변·공원 같은 테마를 보고 오늘 달리고 탈 코스를 골라 보세요.',
    },
    {
        icon: 'message',
        title: 'ChatGPT·Claude와 연결',
        desc: 'Trazo를 AI에 연결하면 내 코스와 공개 코스의 고도·경사를 읽고 코스를 추천하거나 훈련 계획을 함께 세워요.',
        link: { href: '/ai/', label: 'AI 연동 알아보기' },
    },
];

const WhatsNewDialog = ({ open, onClose }) => {
    const [hide, setHide] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);

    const close = () => {
        dismissWhatsNew(hide);
        onClose();
    };

    return (
        <>
            <Dialog
                open={open}
                onClose={close}
                className="whats-new"
                backdropClassName="dialog-backdrop--blur"
                ariaLabel="Trazo 자전거 AI 리포트 업데이트 안내"
                initialFocus="dialog"
                footer={<>
                    <label className="check-row whats-new__hide">
                        <input type="checkbox" checked={hide} onChange={(event) => setHide(event.target.checked)} />
                        다시 보지 않기
                    </label>
                    <Button variant="secondary" onClick={() => setIsReportOpen(true)}>AI 리포트 살펴보기</Button>
                    <Button variant="primary" onClick={close} data-autofocus>시작하기</Button>
                </>}
            >
                <div className="whats-new__hero">
                    <span className="whats-new__mark"><Icon name="bike" size={26} /></span>
                    <span className="whats-new__tag">NEW UPDATE</span>
                    <h2 className="whats-new__title">자전거 코스도 AI 리포트를 받아요</h2>
                    <p className="whats-new__lead">러닝에 이어 자전거 코스까지, 코스를 만들고 공유하는 일에 AI가 함께해요.</p>
                </div>
                <ul className="ai-features">
                    {FEATURES.map(({ icon, title, desc, link }) => (
                        <li key={title}>
                            <span className="ai-features__icon"><Icon name={icon} size={16} /></span>
                            <span>
                                <b>{title}</b>
                                <span>{desc}{link && <> <a href={link.href}>{link.label}</a></>}</span>
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="whats-new__soon">
                    <span className="whats-new__soon-tag">COMING SOON</span>
                    <p>AI와 함께하는 더 다양한 기능을 준비하고 있으니 기대해 주세요.</p>
                </div>
            </Dialog>
            <AiReportDialog open={open && isReportOpen} onClose={() => setIsReportOpen(false)} />
        </>
    );
};

export default WhatsNewDialog;
