// src/components/CourseLibrary.jsx
// 내 코스: 검색·종목 필터·정렬, 코스 모양 미리보기, 불러오기·이름 바꾸기·삭제
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteCourse, getCourseList, updateCourse } from '../api/courseApi';
import { SPORTS, SPORT_IDS } from '../sports';
import { courseStats, flattenCourse } from '../utils/course';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';
import CourseThumbnail from './CourseThumbnail';
import { useFeedback } from './ui/feedbackContext';

// 러닝을 지원하기 전에 저장한 코스에는 종목이 없으므로 자전거로 봅니다.
const courseSport = (course) => (SPORTS[course.sport] ? course.sport : 'bike');

const parseCourse = (course) => {
    let points = [];
    let stats = { distanceKm: 0, ascentM: 0 };
    try {
        const polylines = JSON.parse(course.polylines_json || '[]');
        points = flattenCourse(polylines);
        stats = courseStats(polylines);
    } catch { /* 손상된 코스도 목록에는 보여줍니다 */ }
    return { ...course, sport: courseSport(course), points, stats, createdAt: new Date(course.created_at) };
};

const SORTS = {
    recent: { label: '최근 만든 순', compare: (a, b) => b.createdAt - a.createdAt },
    name: { label: '이름순', compare: (a, b) => a.title.localeCompare(b.title, 'ko') },
    distance: { label: '거리 긴 순', compare: (a, b) => b.stats.distanceKm - a.stats.distanceKm },
};

const CourseCard = ({ course, isCurrent, onLoad, onRename, onDelete }) => {
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const sport = SPORTS[course.sport];

    const saveRename = async (event) => {
        event.preventDefault();
        const next = draft.trim();
        if (!next || next === course.title) { setDraft(null); return; }
        setBusy(true);
        const ok = await onRename(course, next);
        setBusy(false);
        if (ok) setDraft(null);
    };

    return (
        <li className={`course-card ${isCurrent ? 'course-card--current' : ''}`}>
            <button type="button" className="course-card__thumb" onClick={() => onLoad(course)} aria-label={`${course.title} 불러오기`}>
                <CourseThumbnail points={course.points} color={sport.color} />
            </button>
            <div className="course-card__main">
                <div className="course-card__title" title={course.title}>{course.title}</div>
                <div className="course-card__meta">
                    <span className="sport-tag" style={{ background: sport.color, color: sport.onColor }}>
                        <Icon name={sport.icon} size={12} strokeWidth={2.5} />{sport.label}
                    </span>
                    <span>{course.stats.distanceKm.toFixed(1)}km</span>
                    <span>↗ {Math.round(course.stats.ascentM)}m</span>
                    <span>{course.createdAt.toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric' })}</span>
                </div>
                {draft !== null ? (
                    <form className="course-card__rename" onSubmit={saveRename}>
                        <input
                            className="input"
                            aria-label="새 코스 이름"
                            value={draft}
                            maxLength={60}
                            autoFocus
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setDraft(null); } }}
                        />
                        <Button size="sm" variant="primary" type="submit" loading={busy}>저장</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>취소</Button>
                    </form>
                ) : (
                    <div className="course-card__actions">
                        <Button size="sm" variant="primary" onClick={() => onLoad(course)}>{isCurrent ? '편집 중' : '불러오기'}</Button>
                        <Button size="sm" variant="ghost" icon="pencil" aria-label="이름 바꾸기" title="이름 바꾸기" onClick={() => setDraft(course.title)} />
                        <Button size="sm" variant="danger-ghost" icon="trash" aria-label="삭제" title="삭제" onClick={() => onDelete(course)} />
                    </div>
                )}
            </div>
        </li>
    );
};

const CourseLibrary = ({ onClose, currentId, onLoad, onRenamed, onDeleted }) => {
    const { toast, confirm } = useFeedback();
    const [courses, setCourses] = useState(null);
    const [error, setError] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('recent');

    // 대화상자를 열 때마다 새로 그려지므로(App에서 열린 동안만 표시) 처음 한 번 목록을 가져옵니다.
    const load = useCallback(() => getCourseList()
        .then(response => { setCourses(response.data.map(parseCourse)); setError(false); })
        .catch(err => setError(err.response?.status === 401 ? 'auth' : 'network')), []);

    useEffect(() => { load(); }, [load]);

    const retry = () => {
        setError(false);
        setCourses(null);
        load();
    };

    const visible = useMemo(() => {
        if (!courses) return [];
        const keyword = query.trim().toLowerCase();
        return courses
            .filter(course => filter === 'all' || course.sport === filter)
            .filter(course => !keyword || course.title.toLowerCase().includes(keyword))
            .sort(SORTS[sort].compare);
    }, [courses, filter, query, sort]);

    const handleRename = async (course, title) => {
        try {
            await updateCourse(course.id, title);
            setCourses(list => list.map(item => item.id === course.id ? { ...item, title } : item));
            onRenamed(course.id, title);
            toast('코스 이름을 바꿨어요.', { tone: 'success' });
            return true;
        } catch {
            toast('이름을 바꾸지 못했어요. 잠시 후 다시 시도하세요.', { tone: 'error' });
            return false;
        }
    };

    const handleDelete = async (course) => {
        const ok = await confirm({
            title: '코스를 삭제할까요?',
            message: `'${course.title}' 코스를 삭제합니다. 삭제한 코스는 되돌릴 수 없어요.`,
            confirmLabel: '삭제',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await deleteCourse(course.id);
            setCourses(list => list.filter(item => item.id !== course.id));
            onDeleted(course.id);
            toast('코스를 삭제했어요.', { tone: 'success' });
        } catch {
            toast('삭제하지 못했어요. 잠시 후 다시 시도하세요.', { tone: 'error' });
        }
    };

    const counts = useMemo(() => {
        const result = { all: courses?.length ?? 0 };
        SPORT_IDS.forEach(id => { result[id] = courses?.filter(course => course.sport === id).length ?? 0; });
        return result;
    }, [courses]);

    let content;
    if (error) {
        content = (
            <div className="empty">
                <Icon name="alert" size={32} />
                <span className="empty__title">코스 목록을 불러오지 못했어요</span>
                <span>{error === 'auth'
                    ? '로그인 확인에 실패했어요. 로그아웃 후 다시 로그인하거나, 컴퓨터 시계가 맞는지 확인하세요.'
                    : '인터넷 연결이나 서버 상태를 확인하고 다시 시도하세요.'}</span>
                <Button variant="secondary" icon="loop" onClick={retry}>다시 시도</Button>
            </div>
        );
    } else if (!courses) {
        content = <div className="library__list" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>;
    } else if (courses.length === 0) {
        content = (
            <div className="empty">
                <Icon name="map" size={32} />
                <span className="empty__title">아직 저장한 코스가 없어요</span>
                <span>지도에서 코스를 만들고 '코스 저장'을 눌러보세요.</span>
            </div>
        );
    } else if (visible.length === 0) {
        content = (
            <div className="empty">
                <Icon name="search" size={32} />
                <span className="empty__title">조건에 맞는 코스가 없어요</span>
                <Button variant="ghost" onClick={() => { setQuery(''); setFilter('all'); }}>필터 초기화</Button>
            </div>
        );
    } else {
        content = (
            <ul className="library__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {visible.map(course => (
                    <CourseCard
                        key={course.id}
                        course={course}
                        isCurrent={course.id === currentId}
                        onLoad={onLoad}
                        onRename={handleRename}
                        onDelete={handleDelete}
                    />
                ))}
            </ul>
        );
    }

    return (
        <Dialog
            open
            onClose={onClose}
            title="내 코스"
            description={courses ? `저장한 코스 ${courses.length}개` : '불러오는 중…'}
            size="lg"
            initialFocus="dialog"
        >
            <div className="library__toolbar" style={{ margin: '0 -20px 14px' }}>
                <div className="input-wrap">
                    <Icon name="search" size={16} />
                    <input className="input" type="search" placeholder="코스 이름 검색" aria-label="코스 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <select className="select" aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value)}>
                    {Object.entries(SORTS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <SegmentedControl
                    label="종목별 보기"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: `전체 ${counts.all}` },
                        ...SPORT_IDS.map(id => ({ value: id, label: `${SPORTS[id].label} ${counts[id]}`, swatch: SPORTS[id].color })),
                    ]}
                />
            </div>
            {content}
        </Dialog>
    );
};

export default CourseLibrary;
