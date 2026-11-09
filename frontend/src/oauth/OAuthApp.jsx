// src/oauth/OAuthApp.jsx
// /oauth/authorize: AI 서비스가 사용자를 보내는 로그인 동의 화면. 허용하면 1회용 코드를 붙여 AI 서비스로 돌려보냅니다.
// 연결 방법 안내와 연결 관리는 앱의 연동센터(/connect)에 있습니다.
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, authErrorMessage, loginWithGoogle, logout } from '../firebase';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import AiReadScope from '../components/AiReadScope';
import { useFeedback } from '../components/ui/feedbackContext';

const API = import.meta.env.VITE_API_URL || '/api';
const AUTHORIZE_FIELDS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];
const query = new URLSearchParams(window.location.search);
const isAuthorizeRequest = query.has('client_id');

const request = async (path, { method = 'GET', body, login = false } = {}) => {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    const user = auth?.currentUser;
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    else if (login) throw new Error('구글 로그인이 필요합니다.');
    const response = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '요청을 처리하지 못했습니다.');
    return data;
};

const useAuthUser = () => {
    // undefined: 로그인 상태 확인 중
    const [user, setUser] = useState(auth ? undefined : null);
    useEffect(() => auth ? onAuthStateChanged(auth, setUser) : undefined, []);
    return user;
};

const useLogin = () => {
    const { toast } = useFeedback();
    const [busy, setBusy] = useState(false);
    const login = async () => {
        setBusy(true);
        try {
            await loginWithGoogle();
        } catch (error) {
            toast(authErrorMessage(error), { tone: 'error' });
        } finally {
            setBusy(false);
        }
    };
    return [login, busy];
};

const AccountLine = ({ user }) => (
    <div className="ai-account">
        <Icon name="user" size={16} />
        <span className="ai-account__email">{user.email || user.displayName}</span>
        <button type="button" className="ai-link" onClick={() => logout()}>다른 계정</button>
    </div>
);

const Consent = ({ user }) => {
    const [client, setClient] = useState(null);
    const [error, setError] = useState('');
    const [deciding, setDeciding] = useState(false);
    const [login, loggingIn] = useLogin();

    useEffect(() => {
        const params = new URLSearchParams({ client_id: query.get('client_id') || '', redirect_uri: query.get('redirect_uri') || '' });
        request(`/oauth/client?${params}`)
            .then(setClient)
            .catch(() => setError('연결 요청이 올바르지 않습니다. AI 서비스에서 연결을 처음부터 다시 시도해주세요.'));
    }, []);

    const decide = async (approve) => {
        setDeciding(true);
        try {
            const fields = Object.fromEntries(AUTHORIZE_FIELDS.filter(key => query.has(key)).map(key => [key, query.get(key)]));
            const { redirect_to: redirectTo } = await request('/oauth/authorize', { method: 'POST', body: { ...fields, approve }, login: approve });
            window.location.replace(redirectTo);
        } catch (failure) {
            setError(failure.message);
            setDeciding(false);
        }
    };

    if (error) {
        return (
            <section className="ai-card">
                <h1><Icon name="alert" /> 연결할 수 없어요</h1>
                <p>{error}</p>
                <a className="btn btn--secondary" href="/connect">연동센터 보기</a>
            </section>
        );
    }
    if (!client || user === undefined) {
        return <section className="ai-card ai-card--center"><Icon name="loader" className="spin" /> 확인 중…</section>;
    }
    return (
        <section className="ai-card">
            <h1><Icon name="link" /> <strong className="ai-client">{client.client_name}</strong>에 Trazo 연결</h1>
            <p className="ai-muted">허용하면 이 AI 서비스가 내 Trazo 계정에서 다음 정보를 읽을 수 있습니다.</p>
            <AiReadScope />
            <p className="ai-muted ai-small">
                연결 후 이동할 주소: <code>{client.redirect_host}</code><br />
                직접 연결을 시작하지 않았다면 거부하세요. 연결은 Trazo <a className="ai-link" href="/connect">연동센터</a>에서 언제든 끊을 수 있습니다.
            </p>
            {user ? (
                <>
                    <AccountLine user={user} />
                    <div className="ai-actions">
                        <Button variant="secondary" onClick={() => decide(false)} disabled={deciding}>거부</Button>
                        <Button variant="primary" onClick={() => decide(true)} loading={deciding}>허용</Button>
                    </div>
                </>
            ) : (
                <div className="ai-actions">
                    <Button variant="secondary" onClick={() => decide(false)} disabled={deciding}>거부</Button>
                    <Button variant="primary" icon="user" onClick={login} loading={loggingIn} disabled={!auth}>구글 로그인하고 계속</Button>
                </div>
            )}
        </section>
    );
};

const OAuthApp = () => {
    const user = useAuthUser();
    // 예전 안내 주소(/ai/)나 잘못된 주소로 들어오면 연동센터로 보냅니다.
    useEffect(() => { if (!isAuthorizeRequest) window.location.replace('/connect'); }, []);
    if (!isAuthorizeRequest) return null;
    return (
        <div className="ai-page">
            <header className="ai-header">
                <a href="/" className="ai-brand">Trazo</a>
            </header>
            <main className="ai-main">
                {!auth && <p className="ai-card ai-muted">로그인 설정이 아직 되어 있지 않습니다. 관리자에게 문의해주세요.</p>}
                <Consent user={user} />
            </main>
        </div>
    );
};

export default OAuthApp;
