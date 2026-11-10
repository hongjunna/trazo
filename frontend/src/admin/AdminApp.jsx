// src/admin/AdminApp.jsx
// 관리자 페이지: 개요, 회원 목록, 공개 범위와 상관없는 전체 코스 목록과 코스 상세(지도·댓글), 가상 계정, 육상 트랙.
import { useCallback, useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import Icon from '../components/ui/Icon';
import CourseMap from '../components/CourseMap';
import CourseThumbnail from '../components/CourseThumbnail';
import { useFeedback } from '../components/ui/feedbackContext';
import { SPORTS } from '../sports';
import { VISIBILITY, copyText, sharePath } from '../utils/share';
import { assignVirtualAccounts, createTrack, createVirtualAccounts, deleteTrack, deleteVirtualAccount, getCourse, getTracks, importOsmTracks, updateTrack, getCourses, getSummary, getUsers, getVirtualAccounts, isUnauthorized, loadToken, login, loginErrorMessage, saveToken } from './adminApi';

const USER_PAGE = 50;
const COURSE_PAGE = 30;
const TABS = [
    { id: 'overview', label: '개요', icon: 'chart' },
    { id: 'users', label: '회원', icon: 'users' },
    { id: 'courses', label: '코스', icon: 'route' },
    { id: 'virtual', label: '가상 계정', icon: 'user' },
    { id: 'tracks', label: '트랙', icon: 'track' },
];

// 코스 저장 시각은 시간대 없이 UTC로 저장돼 있어, 표시할 때 UTC로 읽습니다.
const parseDate = (value) => (value ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`) : null);
const formatDate = (value) => {
    const date = parseDate(value);
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '-';
};
const ownerName = (item) => item.nickname
    ?? (item.legacy_user_id != null ? `이전 계정 #${item.legacy_user_id}` : '닉네임 없음');
const shortUid = (uid) => (uid && uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid ?? '-');

// 목록 요청: 조건이 바뀌면 이전 요청을 취소하고, 로그인이 풀리면 로그인 화면으로 돌아갑니다.
const useList = (fetcher, params, onUnauthorized) => {
    // 새 조건의 응답이 오기 전까지 이전 목록을 흐리게 보여줍니다.
    const [state, setState] = useState({ key: null, data: null, error: null });
    const key = JSON.stringify(params);
    useEffect(() => {
        const controller = new AbortController();
        fetcher(JSON.parse(key), controller.signal)
            .then(({ data }) => setState({ key, data, error: null }))
            .catch(error => {
                if (controller.signal.aborted) return;
                if (isUnauthorized(error)) onUnauthorized();
                setState(prev => ({ ...prev, key, error }));
            });
        return () => controller.abort();
    }, [fetcher, key, onUnauthorized]);
    return { loading: state.key !== key, data: state.data, error: state.key === key ? state.error : null };
};

const LoginScreen = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const { data } = await login(username.trim(), password);
            onLogin(data.token);
        } catch (err) {
            setError(loginErrorMessage(err));
            setBusy(false);
        }
    };

    return (
        <main className="admin-login">
            <form className="admin-login__card" onSubmit={handleSubmit}>
                <h1><Icon name="lock" size={20} /> Trazo 관리자</h1>
                <label className="admin-field">
                    <span>아이디</span>
                    <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required autoFocus />
                </label>
                <label className="admin-field">
                    <span>비밀번호</span>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
                </label>
                {error && <p className="admin-error" role="alert">{error}</p>}
                <Button type="submit" variant="primary" block loading={busy}>로그인</Button>
            </form>
        </main>
    );
};

const Stat = ({ label, value, sub }) => (
    <div className="admin-stat">
        <span className="admin-stat__label">{label}</span>
        <span className="admin-stat__value">{value?.toLocaleString('ko-KR') ?? '-'}</span>
        {sub && <span className="admin-stat__sub">{sub}</span>}
    </div>
);

const Overview = ({ onUnauthorized }) => {
    const [state, setState] = useState({ data: null, error: null });
    useEffect(() => {
        getSummary()
            .then(({ data }) => setState({ data, error: null }))
            .catch(error => {
                if (isUnauthorized(error)) onUnauthorized();
                setState({ data: null, error });
            });
    }, [onUnauthorized]);
    const { data, error } = state;
    if (error) return <p className="admin-error">개요를 불러오지 못했어요.</p>;
    if (!data) return <p className="admin-muted">불러오는 중…</p>;
    return (
        <div className="admin-stats">
            <Stat label="회원" value={data.users} sub={`닉네임 설정 ${data.users_with_nickname}명 · 최근 7일 신규 ${data.new_users_7d}명`} />
            <Stat label="코스" value={data.courses} sub={`최근 7일 ${data.new_courses_7d}개 · 삭제됨 ${data.deleted_courses}개`} />
            <Stat label="공개 범위" value={data.visibility.public} sub={`전체 공개 · 링크 ${data.visibility.link} · 비공개 ${data.visibility.private}`} />
            <Stat label="종목" value={data.sport.bike} sub={`자전거 · 러닝 ${data.sport.run}`} />
            <Stat label="댓글" value={data.comments} />
            <Stat label="좋아요" value={data.likes} sub={`가상 계정이 누른 좋아요 ${data.virtual_likes}`} />
            <Stat label="가상 계정" value={data.virtual_accounts} sub="회원 수에서 빠집니다" />
        </div>
    );
};

const Pager = ({ offset, limit, total, onChange }) => {
    if (!total) return null;
    return (
        <div className="admin-pager">
            <Button size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>이전</Button>
            <span>{offset + 1}–{Math.min(offset + limit, total)} / {total.toLocaleString('ko-KR')}</span>
            <Button size="sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>다음</Button>
        </div>
    );
};

const SearchInput = ({ value, onChange, placeholder }) => {
    const [text, setText] = useState(value);
    // 입력이 멈춘 뒤에 검색해 글자마다 요청하지 않습니다.
    useEffect(() => {
        const timer = window.setTimeout(() => { if (text !== value) onChange(text); }, 300);
        return () => window.clearTimeout(timer);
    }, [text, value, onChange]);
    return (
        <label className="admin-search">
            <Icon name="search" size={16} />
            <input type="search" value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} />
        </label>
    );
};

const UsersTab = ({ onUnauthorized, onShowCourses }) => {
    const [q, setQ] = useState('');
    const [offset, setOffset] = useState(0);
    const { loading, data, error } = useList(getUsers, { q, offset, limit: USER_PAGE }, onUnauthorized);
    const changeQuery = useCallback((value) => { setQ(value); setOffset(0); }, []);

    return (
        <section>
            <div className="admin-toolbar">
                <SearchInput value={q} onChange={changeQuery} placeholder="닉네임 또는 UID 검색" />
            </div>
            {error && <p className="admin-error">회원 목록을 불러오지 못했어요.</p>}
            <div className="admin-table-wrap" aria-busy={loading}>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>닉네임</th><th>Firebase UID</th><th>가입</th><th>최근 활동</th>
                            <th className="num">코스</th><th className="num">공개·링크</th><th className="num">삭제</th>
                            <th className="num">댓글</th><th className="num">좋아요</th><th className="num">폴더</th><th />
                        </tr>
                    </thead>
                    <tbody>
                        {data?.items.map(user => (
                            <tr key={user.firebase_uid}>
                                <td>
                                    {user.nickname ?? <span className="admin-muted">닉네임 없음</span>}
                                    {user.is_virtual && <span className="admin-tag">가상</span>}
                                    {user.is_seed && <span className="admin-tag">운영</span>}
                                </td>
                                <td><CopyUid uid={user.firebase_uid} /></td>
                                <td>{formatDate(user.joined_at)}</td>
                                <td>{formatDate(user.last_active_at)}</td>
                                <td className="num">{user.course_count}</td>
                                <td className="num">{user.public_count} · {user.link_count}</td>
                                <td className="num">{user.deleted_count}</td>
                                <td className="num">{user.comment_count}</td>
                                <td className="num">{user.like_count}</td>
                                <td className="num">{user.folder_count}</td>
                                <td>
                                    <Button size="sm" variant="soft" onClick={() => onShowCourses(user)}>코스 보기</Button>
                                </td>
                            </tr>
                        ))}
                        {data && !data.items.length && <tr><td colSpan={11} className="admin-empty">회원이 없어요.</td></tr>}
                    </tbody>
                </table>
            </div>
            <Pager offset={offset} limit={USER_PAGE} total={data?.total} onChange={setOffset} />
        </section>
    );
};

const CopyUid = ({ uid }) => {
    const { toast } = useFeedback();
    if (!uid) return <span className="admin-muted">-</span>;
    return (
        <button type="button" className="admin-uid" title={`${uid} (눌러서 복사)`}
            onClick={async () => toast(await copyText(uid) ? 'UID를 복사했어요.' : '복사하지 못했어요.', { tone: 'info' })}>
            {shortUid(uid)}
        </button>
    );
};

const VisibilityTag = ({ course }) => {
    if (course.is_deleted) return <span className="admin-tag admin-tag--deleted">삭제됨</span>;
    const visibility = VISIBILITY[course.visibility] ?? VISIBILITY.private;
    return (
        <span className={`visibility-tag visibility-tag--${course.visibility}`}>
            <Icon name={visibility.icon} size={12} />{visibility.label}
        </span>
    );
};

const SportTag = ({ sportId }) => {
    const sport = SPORTS[sportId] ?? SPORTS.bike;
    return (
        <span className="sport-tag" style={{ background: sport.color, color: sport.onColor }}>
            <Icon name={sport.icon} size={12} strokeWidth={2.5} />{sport.label}
        </span>
    );
};

const CoursesTab = ({ owner, onClearOwner, onUnauthorized, onOpen }) => {
    const [filters, setFilters] = useState({ q: '', sport: '', visibility: '', deleted: 'exclude', sort: 'recent' });
    const [offset, setOffset] = useState(0);
    const params = { ...filters, uid: owner?.firebase_uid || undefined, offset, limit: COURSE_PAGE };
    Object.keys(params).forEach(key => { if (params[key] === '') delete params[key]; });
    const { loading, data, error } = useList(getCourses, params, onUnauthorized);
    const update = (changes) => { setFilters(prev => ({ ...prev, ...changes })); setOffset(0); };
    const changeQuery = useCallback((q) => { setFilters(prev => ({ ...prev, q })); setOffset(0); }, []);

    return (
        <section>
            <div className="admin-toolbar">
                <SearchInput value={filters.q} onChange={changeQuery} placeholder="코스 이름, 닉네임, 코스 번호" />
                <select value={filters.sport} onChange={e => update({ sport: e.target.value })} aria-label="종목">
                    <option value="">모든 종목</option>
                    <option value="bike">자전거</option>
                    <option value="run">러닝</option>
                </select>
                <select value={filters.visibility} onChange={e => update({ visibility: e.target.value })} aria-label="공개 범위">
                    <option value="">모든 공개 범위</option>
                    {Object.entries(VISIBILITY).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
                </select>
                <select value={filters.deleted} onChange={e => update({ deleted: e.target.value })} aria-label="삭제한 코스">
                    <option value="exclude">삭제한 코스 빼기</option>
                    <option value="include">삭제한 코스 포함</option>
                    <option value="only">삭제한 코스만</option>
                </select>
                <select value={filters.sort} onChange={e => update({ sort: e.target.value })} aria-label="정렬">
                    <option value="recent">최신순</option>
                    <option value="oldest">오래된순</option>
                    <option value="title">이름순</option>
                </select>
                {owner && (
                    <span className="admin-chip">
                        <Icon name="user" size={14} />{ownerName(owner)}
                        <button type="button" onClick={onClearOwner} aria-label="회원 필터 해제"><Icon name="x" size={14} /></button>
                    </span>
                )}
            </div>
            {error && <p className="admin-error">코스 목록을 불러오지 못했어요.</p>}
            <div className="admin-courses" aria-busy={loading}>
                {data?.items.map(course => (
                    <button type="button" key={course.id} className={`admin-course${course.is_deleted ? ' admin-course--deleted' : ''}`} onClick={() => onOpen(course.id)}>
                        <span className="admin-course__thumb">
                            <CourseThumbnail points={course.preview} color={(SPORTS[course.sport] ?? SPORTS.bike).color} />
                        </span>
                        <span className="admin-course__body">
                            <span className="admin-course__title">{course.title || '(이름 없음)'}</span>
                            <span className="admin-course__tags"><SportTag sportId={course.sport} /><VisibilityTag course={course} /></span>
                            <span className="admin-course__meta">
                                {course.distance_km.toLocaleString('ko-KR')}km · 상승 {course.ascent_m.toLocaleString('ko-KR')}m
                                {course.waypoint_count > 0 && ` · 웨이포인트 ${course.waypoint_count}`}
                            </span>
                            <span className="admin-course__meta">#{course.id} · {ownerName(course)}{course.display_nickname ? ` (표시: ${course.display_nickname})` : ''} · {formatDate(course.created_at)}</span>
                            {course.visibility === 'public' && !course.is_deleted && (
                                <span className="admin-course__meta">좋아요 {course.like_count} · 댓글 {course.comment_count} · 담기 {course.share_count}</span>
                            )}
                        </span>
                    </button>
                ))}
                {data && !data.items.length && <p className="admin-empty">조건에 맞는 코스가 없어요.</p>}
            </div>
            <Pager offset={offset} limit={COURSE_PAGE} total={data?.total} onChange={setOffset} />
        </section>
    );
};

const CourseDetail = ({ courseId, onClose, onUnauthorized, onShowOwner }) => {
    const [state, setState] = useState({ id: null, course: null, error: null });
    useEffect(() => {
        if (courseId == null) return;
        let active = true;
        getCourse(courseId)
            .then(({ data }) => { if (active) setState({ id: courseId, course: data, error: null }); })
            .catch(error => {
                if (!active) return;
                if (isUnauthorized(error)) onUnauthorized();
                setState({ id: courseId, course: null, error });
            });
        return () => { active = false; };
    }, [courseId, onUnauthorized]);
    const current = state.id === courseId ? state : { course: null, error: null };
    const { course, error } = current;
    const sport = SPORTS[course?.sport] ?? SPORTS.bike;
    const waypoints = course?.waypoints.map((waypoint, index) => ({ ...waypoint, index })) ?? [];
    const shared = course && !course.is_deleted && course.visibility !== 'private' && course.share_token;

    return (
        <Dialog open={courseId != null} onClose={onClose} size="lg" initialFocus="dialog"
            title={course ? course.title || '(이름 없음)' : `코스 #${courseId ?? ''}`}>
            {error && <p className="admin-error">코스를 불러오지 못했어요.</p>}
            {!course && !error && <div className="skeleton course-map" />}
            {course && (
                <div className="viewer" style={{ '--sport': sport.color, '--on-sport': sport.onColor }}>
                    {course.polylines.length
                        ? <CourseMap polylines={course.polylines} markers={course.markers} waypoints={waypoints} color={sport.color} />
                        : <p className="admin-muted">경로가 없는 코스예요.</p>}
                    <div className="admin-course__tags"><SportTag sportId={course.sport} /><VisibilityTag course={course} /></div>
                    <dl className="admin-detail">
                        <dt>코스 번호</dt><dd>#{course.id}{course.source_course_id ? ` (원본 #${course.source_course_id}에서 담음)` : ''}</dd>
                        <dt>작성자</dt>
                        <dd>
                            {ownerName(course)} {course.firebase_uid && <CopyUid uid={course.firebase_uid} />}
                            {course.firebase_uid && <Button size="sm" variant="ghost" onClick={() => onShowOwner(course)}>이 회원의 코스</Button>}
                        </dd>
                        {course.display_nickname && <><dt>표시 작성자</dt><dd>{course.display_nickname} <span className="admin-muted">(가상 계정)</span></dd></>}
                        <dt>거리 · 상승</dt><dd>{course.distance_km.toLocaleString('ko-KR')}km · {course.ascent_m.toLocaleString('ko-KR')}m</dd>
                        <dt>만든 시각</dt><dd>{formatDate(course.created_at)}</dd>
                        {course.published_at && <><dt>전체 공개</dt><dd>{formatDate(course.published_at)}</dd></>}
                        {course.folder && <><dt>폴더</dt><dd>{course.folder}</dd></>}
                        <dt>반응</dt><dd>좋아요 {course.like_count} · 담기 {course.copies} · 웨이포인트 {course.waypoints.length}</dd>
                        {course.description && <><dt>설명</dt><dd className="admin-pre">{course.description}</dd></>}
                        {shared && <><dt>공유 링크</dt><dd><a href={sharePath(course.share_token)} target="_blank" rel="noreferrer">{sharePath(course.share_token)}</a></dd></>}
                    </dl>
                    {course.comments.length > 0 && (
                        <div>
                            <h3 className="admin-subtitle">댓글 {course.comments.length}</h3>
                            <ul className="admin-comments">
                                {course.comments.map(comment => (
                                    <li key={comment.id}>
                                        <strong>{comment.nickname ?? shortUid(comment.firebase_uid)}</strong>
                                        <span className="admin-muted"> · {formatDate(comment.created_at)}{comment.updated_at ? ' (수정됨)' : ''}</span>
                                        <p className="admin-pre">{comment.body}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </Dialog>
    );
};

const VirtualTab = ({ onUnauthorized }) => {
    const { toast, confirm } = useFeedback();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [problems, setProblems] = useState([]);

    const fail = useCallback((err, message) => {
        if (isUnauthorized(err)) onUnauthorized();
        else toast(message, { tone: 'error' });
    }, [onUnauthorized, toast]);
    const load = useCallback(() => {
        getVirtualAccounts()
            .then(({ data: next }) => { setData(next); setError(null); })
            .catch(err => { setError(err); if (isUnauthorized(err)) onUnauthorized(); });
    }, [onUnauthorized]);
    useEffect(load, [load]);

    const add = async (event) => {
        event.preventDefault();
        const nicknames = text.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
        if (!nicknames.length) return;
        setBusy(true);
        try {
            const { data: result } = await createVirtualAccounts(nicknames.slice(0, 100));
            setProblems(result.errors);
            setText(result.errors.map(item => item.nickname).join('\n'));
            toast(`가상 계정 ${result.created.length}개를 만들었어요${result.assigned ? ` · 코스 ${result.assigned}개에 배정` : ''}.`, { tone: 'success' });
            load();
        } catch (err) {
            fail(err, '가상 계정을 만들지 못했어요.');
        } finally {
            setBusy(false);
        }
    };

    const assign = async (mode) => {
        if (mode === 'all' && !(await confirm({ title: '작성자 다시 섞기', message: '운영 계정의 공개 코스 작성자를 모두 무작위로 다시 정해요. 이미 보이던 작성자 이름도 바뀌어요. 제목 머리말이 같은 시리즈([제주 5km] …)는 같은 작성자로 맞춰요.', confirmLabel: '다시 섞기' }))) return;
        try {
            const { data: result } = await assignVirtualAccounts(mode);
            toast(`코스 ${result.assigned}개에 작성자를 배정했어요.`, { tone: 'success' });
            load();
        } catch (err) {
            fail(err, '배정하지 못했어요. 가상 계정이 있는지 확인하세요.');
        }
    };

    const remove = async (item) => {
        const ok = await confirm({
            title: `'${item.nickname}' 삭제`,
            message: `이 계정이 누른 좋아요 ${item.like_count}개가 지워지고, 작성자로 보이던 코스 ${item.course_count}개는 다른 가상 계정으로 바뀌어요.`,
            confirmLabel: '삭제', tone: 'danger',
        });
        if (!ok) return;
        try {
            await deleteVirtualAccount(item.firebase_uid);
            toast('가상 계정을 지웠어요.', { tone: 'success' });
            load();
        } catch (err) {
            fail(err, '지우지 못했어요.');
        }
    };

    if (error && !data) return <p className="admin-error">가상 계정을 불러오지 못했어요.</p>;
    if (!data) return <p className="admin-muted">불러오는 중…</p>;
    return (
        <section className="admin-virtual">
            <div className="admin-panel">
                <h3 className="admin-subtitle">운영 계정</h3>
                {data.seed_emails.length === 0 ? (
                    <p className="admin-muted">서버 .env의 SEED_ACCOUNT_EMAILS에 운영 계정 이메일을 넣어야 해요.</p>
                ) : (
                    <>
                        <p className="admin-muted">이 계정이 전체 공개한 코스는 아래 가상 계정 중 하나가 작성자로 보여요: {data.seed_emails.join(', ')}. 제목 머리말이 같은 시리즈([제주 3km], [제주 5km] …)는 같은 작성자로 보여요.</p>
                        {data.seed_accounts.length === 0
                            ? <p className="admin-muted">아직 확인된 계정이 없어요. 서비스에 운영 계정으로 한 번 로그인하면 표시돼요.</p>
                            : (
                                <ul className="admin-list">
                                    {data.seed_accounts.map(seed => (
                                        <li key={seed.firebase_uid}>{seed.nickname ?? '닉네임 없음'} · {seed.email} · 전체 공개 코스 {seed.public_count}개</li>
                                    ))}
                                </ul>
                            )}
                        <div className="admin-actions">
                            <Button size="sm" variant="soft" onClick={() => assign('unassigned')} disabled={!data.items.length || !data.unassigned_count}>
                                작성자 없는 코스에 배정 ({data.unassigned_count})
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => assign('all')} disabled={!data.items.length}>모두 다시 섞기</Button>
                        </div>
                    </>
                )}
                <p className="admin-muted">좋아요 봇: {data.like_bot_enabled ? '켜짐 (가상 계정이 무작위 간격으로 공개 코스에 좋아요를 눌러요)' : '꺼짐 (서버 .env의 LIKE_BOT_TOKEN이 비어 있어요)'}</p>
            </div>

            <form className="admin-panel" onSubmit={add}>
                <h3 className="admin-subtitle">가상 계정 추가</h3>
                <p className="admin-muted">닉네임을 한 줄에 하나씩(또는 쉼표로 나눠) 입력하세요. 한글·영문·숫자·밑줄 3~16자, 실제 회원과 겹치지 않아야 해요.</p>
                <textarea className="admin-textarea" rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={'한강러너\n주말라이더\nrun_seoul'} />
                {problems.length > 0 && (
                    <ul className="admin-list admin-error">
                        {problems.map(item => <li key={item.nickname}>{item.nickname}: {item.reason}</li>)}
                    </ul>
                )}
                <div className="admin-actions">
                    <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!text.trim()}>추가</Button>
                </div>
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr><th>닉네임</th><th>만든 시각</th><th className="num">작성자로 보이는 코스</th><th className="num">누른 좋아요</th><th /></tr>
                    </thead>
                    <tbody>
                        {data.items.map(item => (
                            <tr key={item.firebase_uid}>
                                <td>{item.nickname}</td>
                                <td>{formatDate(item.created_at)}</td>
                                <td className="num">{item.course_count}</td>
                                <td className="num">{item.like_count}</td>
                                <td><Button size="sm" variant="danger-ghost" onClick={() => remove(item)}>삭제</Button></td>
                            </tr>
                        ))}
                        {!data.items.length && <tr><td colSpan={5} className="admin-empty">아직 가상 계정이 없어요.</td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const EMPTY_TRACK = { name: '', coords: '', shape: 'oval', bearing: '0', size: '400', length: '', note: '', hours: '' };
// "37.5006, 126.9942"처럼 붙여 넣은 좌표를 읽습니다 (카카오맵·구글 지도에서 복사한 형식).
const parseCoords = (text) => {
    const numbers = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return numbers.length >= 2 && Math.abs(numbers[0]) <= 90 && Math.abs(numbers[1]) <= 180 ? { lat: numbers[0], lng: numbers[1] } : null;
};

const TracksTab = ({ onUnauthorized }) => {
    const { toast, confirm } = useFeedback();
    const [data, setData] = useState(null);
    const [q, setQ] = useState('');
    const [form, setForm] = useState(EMPTY_TRACK);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const fail = useCallback((err, message) => {
        if (isUnauthorized(err)) onUnauthorized();
        else toast(message, { tone: 'error' });
    }, [onUnauthorized, toast]);
    const load = useCallback(() => {
        getTracks({ q })
            .then(({ data: next }) => { setData(next); setError(null); })
            .catch(err => { setError(err); if (isUnauthorized(err)) onUnauthorized(); });
    }, [q, onUnauthorized]);
    useEffect(() => {
        const timer = window.setTimeout(load, 250);
        return () => window.clearTimeout(timer);
    }, [load]);
    // OSM 가져오기는 서버에서 수십 초 걸려, 끝날 때까지 몇 초마다 다시 확인합니다.
    const running = data?.import?.running;
    useEffect(() => {
        if (!running) return undefined;
        const timer = window.setInterval(load, 4000);
        return () => window.clearInterval(timer);
    }, [running, load]);

    const startImport = async () => {
        try {
            await importOsmTracks();
            toast('OpenStreetMap에서 트랙을 가져오는 중이에요. 1~3분 걸려요.', { tone: 'info' });
            load();
        } catch (err) {
            fail(err, '가져오기를 시작하지 못했어요.');
        }
    };

    const coords = parseCoords(form.coords);
    const add = async (event) => {
        event.preventDefault();
        if (!form.name.trim() || !coords) return;
        setBusy(true);
        try {
            await createTrack({
                name: form.name.trim(), ...coords, shape: form.shape, bearing: Number(form.bearing) || 0, size_m: Number(form.size) || 400,
                length_m: form.length ? Number(form.length) : null, note: form.note.trim() || null, opening_hours: form.hours.trim() || null,
            });
            toast('트랙을 추가했어요.', { tone: 'success' });
            setForm(EMPTY_TRACK);
            load();
        } catch (err) {
            fail(err, '추가하지 못했어요. 입력값을 확인하세요.');
        } finally {
            setBusy(false);
        }
    };

    const update = async (track, changes, message) => {
        try {
            await updateTrack(track.id, changes);
            if (message) toast(message, { tone: 'success' });
            load();
        } catch (err) {
            fail(err, '바꾸지 못했어요.');
        }
    };

    const rename = async (track) => {
        const name = window.prompt('트랙 이름', track.name);
        if (name && name.trim() && name.trim() !== track.name) update(track, { name: name.trim() }, '이름을 바꿨어요.');
    };

    const editLength = async (track) => {
        const value = window.prompt('한 바퀴 거리(m). 비우면 모름으로 표시해요.', track.length_m ?? '');
        if (value === null) return;
        update(track, { length_m: value.trim() ? Number(value) : 0 });
    };

    // OSM에 운영시간·레인·노면이 거의 없어 관리자가 채웁니다. 비우면 지웁니다.
    const editInfo = async (track) => {
        const hours = window.prompt('운영시간 (예: 06:00-22:00, 월 휴무). 비우면 지워요.', track.info?.opening_hours ?? '');
        if (hours === null) return;
        const lanes = window.prompt('레인 수 (숫자). 비우면 모름.', track.lanes ?? '');
        if (lanes === null) return;
        const surface = window.prompt('노면 (예: 우레탄, 흙, 인조잔디). 비우면 모름.', track.surface ?? '');
        if (surface === null) return;
        update(track, { opening_hours: hours.trim(), lanes: lanes.trim() ? Number(lanes) || 0 : 0, surface: surface.trim() || null }, '정보를 고쳤어요.');
    };

    const remove = async (track) => {
        const isOsm = track.source === 'osm';
        const ok = await confirm({
            title: `'${track.name}' ${isOsm ? '숨기기' : '삭제'}`,
            message: isOsm ? 'OpenStreetMap 트랙은 지우지 않고 지도에서 숨겨요. 다시 가져와도 숨긴 상태로 남아요.' : '직접 추가한 트랙을 지워요.',
            confirmLabel: isOsm ? '숨기기' : '삭제', tone: 'danger',
        });
        if (!ok) return;
        try {
            await deleteTrack(track.id);
            load();
        } catch (err) {
            fail(err, '지우지 못했어요.');
        }
    };

    const status = data?.import;
    if (error && !data) return <p className="admin-error">트랙을 불러오지 못했어요.</p>;
    if (!data) return <p className="admin-muted">불러오는 중…</p>;
    return (
        <section className="admin-virtual">
            <div className="admin-panel">
                <h3 className="admin-subtitle">OpenStreetMap에서 가져오기</h3>
                <p className="admin-muted">
                    공원·경기장·체육시설 안의 육상 트랙과 이름이 있는 트랙을 가져와요 (학교 운동장은 빼요). 다시 가져오면 모양·거리는 새로 고치고, 직접 고친 이름과 숨김은 그대로 둬요.
                    지금 {data.total}개 · 숨김 {data.hidden}개
                </p>
                {status?.running && <p className="admin-muted"><Icon name="loader" size={12} className="spin" /> 가져오는 중… ({formatDate(status.started_at)} 시작)</p>}
                {!status?.running && status?.result && <p className="admin-muted">마지막 결과: 찾음 {status.result.found} · 새로 추가 {status.result.created} · 갱신 {status.result.updated} · 사라져 숨김 {status.result.hidden}</p>}
                {!status?.running && status?.error && <p className="admin-error">실패: {status.error}</p>}
                <div className="admin-actions">
                    <Button size="sm" variant="soft" onClick={startImport} disabled={status?.running}>지금 가져오기</Button>
                </div>
            </div>

            <form className="admin-panel" onSubmit={add}>
                <h3 className="admin-subtitle">트랙 직접 추가</h3>
                <p className="admin-muted">OSM에 없는 트랙(예: 반포종합운동장)을 넣어요. 좌표는 트랙 가운데, 방향은 직선 구간이 향하는 방위(북 0°, 동 90°)예요.</p>
                <div className="admin-track-form">
                    <input className="input" placeholder="이름 (예: 반포종합운동장)" value={form.name} maxLength={60} onChange={e => setForm({ ...form, name: e.target.value })} />
                    <input className="input" placeholder="좌표 (예: 37.5006, 126.9942)" value={form.coords} onChange={e => setForm({ ...form, coords: e.target.value })} />
                    <select className="input" value={form.shape} onChange={e => setForm({ ...form, shape: e.target.value })} aria-label="모양">
                        <option value="oval">트랙 모양으로 그리기</option>
                        <option value="pin">핀만 표시</option>
                    </select>
                    {form.shape === 'oval' && <>
                        <label>방향(°)<input className="input" type="number" value={form.bearing} onChange={e => setForm({ ...form, bearing: e.target.value })} /></label>
                        <label>그릴 크기(m)<input className="input" type="number" min="100" max="1000" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} /></label>
                    </>}
                    <label>한 바퀴(m, 모르면 비움)<input className="input" type="number" min="50" value={form.length} onChange={e => setForm({ ...form, length: e.target.value })} /></label>
                    <input className="input" placeholder="운영시간 (예: 06:00-22:00, 월 휴무)" value={form.hours} maxLength={200} onChange={e => setForm({ ...form, hours: e.target.value })} />
                    <input className="input" placeholder="메모 (예: 야간 개방, 우레탄 8레인)" value={form.note} maxLength={200} onChange={e => setForm({ ...form, note: e.target.value })} />
                </div>
                {form.coords && !coords && <p className="admin-error">좌표를 읽지 못했어요. "위도, 경도" 형식으로 넣어주세요.</p>}
                <div className="admin-actions">
                    <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!form.name.trim() || !coords}>추가</Button>
                </div>
            </form>

            <SearchInput value={q} onChange={setQ} placeholder="이름·지역 검색" />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr><th>이름</th><th>지역</th><th>출처</th><th className="num">한 바퀴</th><th>정보</th><th>표시</th><th /></tr>
                    </thead>
                    <tbody>
                        {data.items.map(track => (
                            <tr key={track.id} className={track.hidden ? 'is-deleted' : undefined}>
                                <td>
                                    <a href={`https://map.kakao.com/link/map/${encodeURIComponent(track.name)},${track.lat},${track.lng}`} target="_blank" rel="noreferrer">{track.name}</a>
                                    {track.note && <div className="admin-muted">{track.note}</div>}
                                </td>
                                <td>{track.region ?? '-'}</td>
                                <td>{track.source === 'osm' ? 'OSM' : '직접'}{track.path ? '' : ' · 핀'}</td>
                                <td className="num">{track.length_m ? `${track.length_m}m` : '-'}</td>
                                <td className="admin-muted">{[track.lanes && `${track.lanes}레인`, track.surface, track.info?.opening_hours].filter(Boolean).join(' · ') || '-'}</td>
                                <td>{track.hidden ? '숨김' : '보임'}</td>
                                <td className="admin-row-actions">
                                    <Button size="sm" variant="ghost" onClick={() => rename(track)}>이름</Button>
                                    <Button size="sm" variant="ghost" onClick={() => editLength(track)}>거리</Button>
                                    <Button size="sm" variant="ghost" onClick={() => editInfo(track)}>정보</Button>
                                    {track.hidden
                                        ? <Button size="sm" variant="ghost" onClick={() => update(track, { hidden: false }, '다시 보이게 했어요.')}>보이기</Button>
                                        : <Button size="sm" variant="danger-ghost" onClick={() => remove(track)}>{track.source === 'osm' ? '숨기기' : '삭제'}</Button>}
                                </td>
                            </tr>
                        ))}
                        {!data.items.length && <tr><td colSpan={7} className="admin-empty">트랙이 없어요. 위에서 OpenStreetMap 트랙을 가져오세요.</td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const AdminApp = () => {
    const [token, setToken] = useState(loadToken);
    const [tab, setTab] = useState('overview');
    const [owner, setOwner] = useState(null);
    const [openCourse, setOpenCourse] = useState(null);
    const { toast } = useFeedback();

    const handleLogin = (value) => { saveToken(value); setToken(value); };
    const logout = useCallback(() => { saveToken(null); setToken(null); setOpenCourse(null); }, []);
    const handleUnauthorized = useCallback(() => {
        logout();
        toast('로그인이 만료됐어요. 다시 로그인하세요.', { tone: 'info' });
    }, [logout, toast]);
    const showCourses = (user) => {
        setOwner(user);
        setOpenCourse(null);
        setTab('courses');
    };

    if (!token) return <LoginScreen onLogin={handleLogin} />;

    return (
        <div className="admin">
            <header className="admin-header">
                <h1>Trazo 관리자</h1>
                <nav className="admin-tabs" aria-label="관리 메뉴">
                    {TABS.map(item => (
                        <button key={item.id} type="button" className="admin-tab" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>
                            <Icon name={item.icon} size={16} />{item.label}
                        </button>
                    ))}
                </nav>
                <Button size="sm" variant="ghost" icon="logout" onClick={logout}>로그아웃</Button>
            </header>
            <main className="admin-main">
                {tab === 'overview' && <Overview onUnauthorized={handleUnauthorized} />}
                {tab === 'users' && <UsersTab onUnauthorized={handleUnauthorized} onShowCourses={showCourses} />}
                {/* 회원을 바꾸면 필터와 쪽을 처음부터 다시 봅니다. */}
                {tab === 'virtual' && <VirtualTab onUnauthorized={handleUnauthorized} />}
                {tab === 'tracks' && <TracksTab onUnauthorized={handleUnauthorized} />}
                {tab === 'courses' && <CoursesTab key={owner?.firebase_uid ?? 'all'} owner={owner} onClearOwner={() => setOwner(null)} onUnauthorized={handleUnauthorized} onOpen={setOpenCourse} />}
            </main>
            <CourseDetail courseId={openCourse} onClose={() => setOpenCourse(null)} onUnauthorized={handleUnauthorized} onShowOwner={showCourses} />
        </div>
    );
};

export default AdminApp;
