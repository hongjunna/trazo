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

// ChatGPT '설명' 칸에 넣을 문구 (선택 항목)
export const CHATGPT_DESCRIPTION = '내 Trazo 러닝·자전거 코스와 커뮤니티 공개 코스를 읽어, 거리·고도·경사·위치를 근거로 코스를 추천하고 훈련 계획을 도와줘요. 읽기 전용이라 코스를 바꾸지 않아요.';

// 각 단계: text(설명), fields(입력 칸 이름과 넣을 값), check(확인 문구)
const GUIDES = [
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        steps: [
            { text: <>ChatGPT 왼쪽 <b>사이드바 → 플러그인</b>으로 들어가 <b>추가</b>를 누르고 <b>사용자 지정 MCP 서버 추가</b>를 고릅니다.</> },
            {
                text: <>아래 값을 입력합니다.</>,
                fields: [
                    { label: '이름', value: 'Trazo' },
                    { label: '설명 (선택)', value: CHATGPT_DESCRIPTION },
                    { label: '연결 세팅 › 서버 URL', value: 'MCP_URL' },
                    { label: '인증', value: 'OAuth', plain: true },
                ],
            },
            { text: <>아래쪽의 <b>“이해했으며 계속 진행하겠습니다”</b>에 체크하고 <b>플러그인으로 생성</b>을 누릅니다.</> },
            { text: <><b>Trazo 연결</b> 창이 뜨면 <b>Trazo 연결 ↗︎</b>을 누르고, 열린 Trazo 화면에서 구글 계정으로 로그인한 뒤 <b>허용</b>을 누릅니다.</> },
            { text: <>ChatGPT로 돌아와 <b>“Primary 연결이 완료되었습니다”</b> 녹색 알림이 보이면 연결 완료예요.</> },
            { text: <>새 채팅에서 이렇게 보내 확인해 보세요.</>, fields: [{ label: '확인 메시지', value: '@Trazo 서비스 연결 상태 확인해줘' }] },
        ],
        notes: [
            '연결되면 ChatGPT가 내 코스 수와 최근 코스를 읽어 “연결 정상”을 알려줘요. 이후에는 @Trazo를 붙이거나 그냥 코스 관련 질문을 하면 돼요.',
            '플러그인 메뉴가 보이지 않으면 요금제나 워크스페이스 설정에서 사용자 지정 MCP 서버(개발자 모드)가 허용돼 있는지 확인하세요.',
        ],
    },
    {
        id: 'claude',
        name: 'Claude',
        steps: [
            { text: <>Claude 웹(claude.ai) 또는 데스크톱 앱에서 <b>맞춤 설정(Customize) → 커넥터(Connectors)</b>로 들어갑니다.</> },
            { text: <><b>+ 추가(+ Add)</b>를 누르고 <b>커스텀 커넥터 추가(Add custom connector)</b>를 고릅니다.</> },
            {
                text: <>이름과 주소를 넣고 <b>계속(Continue)</b>을 누릅니다.</>,
                fields: [
                    { label: '이름', value: 'Trazo' },
                    { label: '원격 MCP 서버 URL', value: 'MCP_URL' },
                ],
            },
            { text: <>감지된 인증 설정이 나오면 기본값(OAuth 로그인, <b>Use Claude’s published identity (권장)</b>)을 그대로 두고 <b>추가(Add)</b>를 누릅니다.</> },
            { text: <>목록의 Trazo에서 <b>연결(Connect)</b>을 누르고, 열린 Trazo 화면에서 구글 계정으로 로그인한 뒤 <b>허용</b>을 누릅니다.</> },
            { text: <>채팅 입력창 왼쪽 아래 <b>+</b> → <b>커넥터(Connectors)</b>에서 Trazo가 켜져 있는지 확인하고 질문하세요.</>, fields: [{ label: '확인 메시지', value: 'Trazo 서비스 연결 상태 확인해줘' }] },
        ],
        notes: [
            '무료 요금제는 커스텀 커넥터를 1개까지 추가할 수 있어요.',
            'Team·Enterprise는 조직 Owner가 먼저 조직 설정 → 커넥터 → 추가 → Custom → Web으로 Trazo를 추가해야 하고, 구성원은 맞춤 설정 → 커넥터에서 Trazo의 연결을 누르면 돼요.',
            '웹·데스크톱에서 연결하면 같은 계정의 Claude 모바일 앱에서도 쓸 수 있어요. 메뉴 이름은 Claude 업데이트에 따라 조금 다를 수 있어요.',
        ],
    },
];

const GuideField = ({ label, value, plain, onCopy }) => (
    <div className="connect-field">
        <span className="connect-field__label">{label}</span>
        <span className="connect-field__value">{value}</span>
        {!plain && <Button size="sm" variant="ghost" icon="copy" onClick={() => onCopy(value)} aria-label={`${label} 복사`} title="복사" />}
    </div>
);

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
    const [guide, setGuide] = useState('chatgpt');
    const mcpUrl = `${window.location.origin}/mcp`;
    const active = GUIDES.find(item => item.id === guide);
    const copyValue = async (value) => toast(await copyText(value) ? '복사했어요.' : '복사하지 못했어요. 직접 선택해 복사하세요.', { tone: 'info' });
    const copy = () => copyValue(mcpUrl);

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

                <section className="connect-card connect-card--wide">
                    <h2>연결 방법</h2>
                    <div className="connect-tabs" role="tablist" aria-label="AI 서비스">
                        {GUIDES.map(item => (
                            <button key={item.id} type="button" role="tab" aria-selected={guide === item.id} className="connect-tab" onClick={() => setGuide(item.id)}>
                                {item.name}
                            </button>
                        ))}
                    </div>
                    <ol className="connect-steps">
                        {active.steps.map((step, index) => (
                            <li key={index}>
                                {step.text}
                                {step.fields && (
                                    <div className="connect-fields">
                                        {step.fields.map(field => (
                                            <GuideField key={field.label} label={field.label} plain={field.plain} value={field.value === 'MCP_URL' ? mcpUrl : field.value} onCopy={copyValue} />
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                    <ul className="connect-notes">
                        {active.notes.map(note => <li key={note}>{note}</li>)}
                    </ul>
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
