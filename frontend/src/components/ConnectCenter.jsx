// src/components/ConnectCenter.jsx
// 연동센터: Trazo MCP 서버 소개, ChatGPT·Claude 연결 방법, 연결된 AI 서비스 관리
import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, deleteAiConnection, getAiConnections } from '../api/courseApi';
import { copyText } from '../utils/share';
import PageFrame from './PageFrame';
import AiReadScope from './AiReadScope';
import Button from './ui/Button';
import Icon from './ui/Icon';
import { useFeedback } from './ui/feedbackContext';

const EXAMPLES = [
    '오늘 저녁에 뛸 5km 정도 러닝 코스 추천해줘',
    '한강에서 뛸 만한 평지 코스 찾아줘',
    '내가 만든 코스 중에 언덕 인터벌 훈련하기 좋은 코스 있어?',
    '내 "남산 업힐" 코스로 템포런 하면 어때? 구간별로 알려줘',
    '여의도 근처에서 출발하는 40km 자전거 코스 추천해줘',
];

const GUIDES = [
    {
        id: 'claude',
        name: 'Claude',
        note: 'claude.ai 웹·데스크톱 앱에서 연결하면 모바일 앱에서도 함께 쓸 수 있어요.',
        steps: [
            <>Claude에서 <b>설정 → 커넥터</b>로 들어갑니다.</>,
            <><b>커스텀 커넥터 추가</b>를 누르고 이름에 <b>Trazo</b>, URL에 위 연결 주소를 넣은 뒤 <b>추가</b>를 누릅니다.</>,
            <>목록의 Trazo에서 <b>연결</b>을 누르면 Trazo 로그인 창이 열립니다. 구글 계정으로 로그인하고 <b>허용</b>을 누릅니다.</>,
            <>새 대화의 입력창 아래 도구(검색 및 도구) 메뉴에서 Trazo가 켜져 있는지 확인하고 질문하세요.</>,
        ],
    },
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        note: '개발자 모드로 직접 만든 앱(커넥터)을 추가하는 방식이에요. 요금제와 계정 종류에 따라 메뉴가 없을 수 있어요.',
        steps: [
            <>ChatGPT에서 <b>설정 → 앱(Apps & Connectors) → 고급 설정</b>으로 들어가 <b>개발자 모드</b>를 켭니다.</>,
            <>앱 화면에서 <b>만들기(Create)</b>를 누르고 이름에 <b>Trazo</b>, MCP 서버 URL에 위 연결 주소를 넣고, 인증은 <b>OAuth</b>를 고릅니다.</>,
            <><b>만들기</b>를 누르면 Trazo 로그인 창이 열립니다. 구글 계정으로 로그인하고 <b>허용</b>을 누릅니다.</>,
            <>새 대화의 <b>+</b> 메뉴에서 Trazo를 고른 뒤 질문하세요.</>,
        ],
    },
];

const Connections = ({ user, onLogin }) => {
    const { toast, confirm } = useFeedback();
    const [items, setItems] = useState(null);

    const load = useCallback(() => {
        getAiConnections().then(({ data }) => setItems(data)).catch(() => setItems([]));
    }, []);
    useEffect(() => { if (user) load(); }, [user, load]);

    const disconnect = async (item) => {
        const ok = await confirm({
            title: '연결 끊기',
            message: `${item.client_name}에서 더 이상 Trazo 코스를 읽지 못해요. 다시 쓰려면 AI 서비스에서 다시 연결해야 해요.`,
            confirmLabel: '연결 끊기',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await deleteAiConnection(item.client_id);
            toast('연결을 끊었어요.', { tone: 'success' });
            load();
        } catch (error) {
            toast(apiErrorMessage(error, '연결을 끊지 못했어요.'), { tone: 'error' });
        }
    };

    if (!user) {
        return (
            <div className="connect-empty">
                <p>로그인하면 연결된 AI 서비스를 확인하고 연결을 끊을 수 있어요.</p>
                <Button icon="user" onClick={onLogin}>구글 로그인</Button>
            </div>
        );
    }
    if (items === null) return <p className="connect-muted"><Icon name="loader" size={16} className="spin" /> 불러오는 중…</p>;
    if (!items.length) return <p className="connect-muted">아직 연결된 AI 서비스가 없어요.</p>;
    const day = (value) => new Date(value).toLocaleDateString('ko-KR');
    return (
        <ul className="connect-list">
            {items.map(item => (
                <li key={item.client_id}>
                    <div>
                        <strong>{item.client_name}</strong>
                        <span className="connect-muted">연결 {day(item.connected_at)} · 최근 사용 {day(item.last_refreshed_at)}</span>
                    </div>
                    <Button size="sm" variant="danger-ghost" onClick={() => disconnect(item)}>연결 끊기</Button>
                </li>
            ))}
        </ul>
    );
};

const ConnectCenter = ({ user, onLogin }) => {
    const { toast } = useFeedback();
    const [guide, setGuide] = useState('claude');
    const mcpUrl = `${window.location.origin}/mcp`;
    const active = GUIDES.find(item => item.id === guide);
    const copy = async () => toast(await copyText(mcpUrl) ? '연결 주소를 복사했어요.' : '복사하지 못했어요. 직접 선택해 복사하세요.', { tone: 'info' });

    return (
        <PageFrame
            className="connect"
            title="연동센터"
            description="ChatGPT·Claude 같은 AI에 Trazo를 연결하면, AI가 내 코스와 커뮤니티 코스를 읽고 코스를 추천하거나 훈련 계획을 함께 세워 줘요."
        >
            <div className="connect-grid">
                <section className="connect-card connect-card--hero">
                    <span className="connect-badge"><Icon name="link" size={14} />MCP 서버</span>
                    <h2>Trazo를 AI의 도구로 쓰세요</h2>
                    <p>MCP(Model Context Protocol)는 AI 서비스가 다른 서비스의 정보를 안전하게 읽어 오는 표준 방식이에요. 아래 주소를 AI 서비스에 한 번 등록하고 Trazo 계정으로 허용하면, 대화 중에 AI가 필요한 코스를 직접 찾아봐요.</p>
                    <a className="connect-more" href="/ai/">AI 연동으로 할 수 있는 일 자세히 보기 →</a>
                    <div className="connect-copy">
                        <code>{mcpUrl}</code>
                        <Button size="sm" variant="primary" icon="copy" onClick={copy}>복사</Button>
                    </div>
                </section>

                <section className="connect-card">
                    <h2>연결 방법</h2>
                    <div className="connect-tabs" role="tablist" aria-label="AI 서비스">
                        {GUIDES.map(item => (
                            <button key={item.id} type="button" role="tab" aria-selected={guide === item.id} className="connect-tab" onClick={() => setGuide(item.id)}>
                                {item.name}
                            </button>
                        ))}
                    </div>
                    <ol className="connect-steps">
                        {active.steps.map((step, index) => <li key={index}>{step}</li>)}
                    </ol>
                    <p className="connect-muted">{active.note} AI 서비스의 메뉴 이름은 업데이트에 따라 조금씩 바뀔 수 있어요.</p>
                </section>

                <section className="connect-card">
                    <h2>이렇게 물어보세요</h2>
                    <ul className="connect-examples">
                        {EXAMPLES.map(text => <li key={text}>“{text}”</li>)}
                    </ul>
                </section>

                <section className="connect-card">
                    <h2>AI가 읽을 수 있는 정보</h2>
                    <AiReadScope />
                    <p className="connect-muted">AI 서비스로 보낸 정보는 그 서비스의 개인정보 정책에 따라 처리돼요.</p>
                </section>

                <section className="connect-card">
                    <h2>연결된 AI 서비스</h2>
                    <Connections user={user} onLogin={onLogin} />
                </section>
            </div>
        </PageFrame>
    );
};

export default ConnectCenter;
