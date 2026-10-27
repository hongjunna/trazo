// src/admin/AdminApp.jsx
// 관리자 페이지: 개요, 회원 목록, 공개 범위와 상관없는 전체 코스 목록과 코스 상세(지도·댓글).
import { useCallback, useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import Icon from '../components/ui/Icon';
import CourseMap from '../components/CourseMap';
import CourseThumbnail from '../components/CourseThumbnail';
import { useFeedback } from '../components/ui/feedbackContext';
import { SPORTS } from '../sports';
import { VISIBILITY, copyText, sharePath } from '../utils/share';
import { getCourse, getCourses, getSummary, getUsers, isUnauthorized, loadToken, login, loginErrorMessage, saveToken } from './adminApi';

const USER_PAGE = 50;
const COURSE_PAGE = 30;
const TABS = [
    { id: 'overview', label: '개요', icon: 'chart' },
    { id: 'users', label: '회원', icon: 'users' },
    { id: 'courses', label: '코스', icon: 'route' },
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
            <Stat label="좋아요" value={data.likes} />
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
                                <td>{user.nickname ?? <span className="admin-muted">닉네임 없음</span>}</td>
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
                            <span className="admin-course__meta">#{course.id} · {ownerName(course)} · {formatDate(course.created_at)}</span>
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
                {tab === 'courses' && <CoursesTab key={owner?.firebase_uid ?? 'all'} owner={owner} onClearOwner={() => setOwner(null)} onUnauthorized={handleUnauthorized} onOpen={setOpenCourse} />}
            </main>
            <CourseDetail courseId={openCourse} onClose={() => setOpenCourse(null)} onUnauthorized={handleUnauthorized} onShowOwner={showCourses} />
        </div>
    );
};

export default AdminApp;
