// src/components/CourseLibrary.jsx
// 내 코스: 폴더별 보기, 검색·종목 필터·정렬, 코스 모양 미리보기, 불러오기·이름 바꾸기·폴더 이동·공유 설정·삭제
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiErrorMessage, createFolder, deleteCourse, deleteFolder, getCourseList, getFolders, renameFolder, updateCourse } from '../api/courseApi';
import { SPORTS, SPORT_IDS } from '../sports';
import { courseStats, flattenCourse } from '../utils/course';
import { VISIBILITY, visibilityOf } from '../utils/share';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';
import MenuButton from './ui/MenuButton';
import PromptDialog from './ui/PromptDialog';
import SegmentedControl from './ui/SegmentedControl';
import CourseThumbnail from './CourseThumbnail';
import ShareDialog from './ShareDialog';
import { FolderPickerDialog } from './FolderSelect';
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
    shared: { label: '많이 담긴 순', compare: (a, b) => (b.share_count || 0) - (a.share_count || 0) },
};

// 폴더 보기: 'all'(전체) · 'none'(폴더 없음) · 폴더 ID
const inFolder = (course, folder, folderIds) => {
    if (folder === 'all') return true;
    const hasFolder = course.folder_id != null && folderIds.has(course.folder_id);
    return folder === 'none' ? !hasFolder : course.folder_id === folder;
};

const CourseCard = ({ course, folderName, isCurrent, onLoad, onRename, onShare, onMove, onDelete }) => {
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const sport = SPORTS[course.sport];
    const visibility = VISIBILITY[visibilityOf(course)];

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
                <div className="course-card__meta">
                    <span className={`visibility-tag visibility-tag--${visibilityOf(course)}`} title={visibility.desc}>
                        <Icon name={visibility.icon} size={12} strokeWidth={2.5} />{visibility.label}
                    </span>
                    {course.share_count > 0 && <span title="이 코스를 내 코스에 담은 사람 수"><Icon name="folder-plus" size={12} /> {course.share_count}명이 담음</span>}
                    {course.source_course_id && <span className="muted-tag">공유받은 코스</span>}
                    {folderName && <span className="muted-tag"><Icon name="folder" size={12} />{folderName}</span>}
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
                        <Button size="sm" variant="ghost" icon="share" aria-label="공유 설정" title="공유 설정" onClick={() => onShare(course)} />
                        <MenuButton
                            label={`${course.title} 더 보기`}
                            items={[
                                { label: '이름 바꾸기', icon: 'pencil', onSelect: () => setDraft(course.title) },
                                { label: '폴더 이동', icon: 'folder-move', onSelect: () => onMove(course) },
                                { label: '삭제', icon: 'trash', danger: true, onSelect: () => onDelete(course) },
                            ]}
                        />
                    </div>
                )}
            </div>
        </li>
    );
};

const CourseLibrary = ({ onClose, currentId, onLoad, onUpdated, onDeleted }) => {
    const { toast, confirm } = useFeedback();
    const [courses, setCourses] = useState(null);
    const [folders, setFolders] = useState([]);
    const [error, setError] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [folder, setFolder] = useState('all');
    const [sort, setSort] = useState('recent');
    const [sharingId, setSharingId] = useState(null);
    const [moving, setMoving] = useState(null);
    // 폴더 이름 입력: { folder: null(새 폴더) | 폴더 }
    const [folderPrompt, setFolderPrompt] = useState(null);

    // 대화상자를 열 때마다 새로 그려지므로(App에서 열린 동안만 표시) 처음 한 번 목록을 가져옵니다.
    const load = useCallback(() => Promise.all([getCourseList(), getFolders()])
        .then(([courseResponse, folderResponse]) => {
            setCourses(courseResponse.data.map(parseCourse));
            setFolders(folderResponse.data);
            setError(false);
        })
        .catch(err => setError(err.response?.status === 401 ? 'auth' : 'network')), []);

    useEffect(() => { load(); }, [load]);

    const retry = () => {
        setError(false);
        setCourses(null);
        load();
    };

    const folderIds = useMemo(() => new Set(folders.map(item => item.id)), [folders]);
    const folderNames = useMemo(() => Object.fromEntries(folders.map(item => [item.id, item.name])), [folders]);
    const activeFolder = typeof folder === 'number' ? folders.find(item => item.id === folder) : null;

    const visible = useMemo(() => {
        if (!courses) return [];
        const keyword = query.trim().toLowerCase();
        return courses
            .filter(course => inFolder(course, folder, folderIds))
            .filter(course => filter === 'all' || course.sport === filter)
            .filter(course => !keyword || course.title.toLowerCase().includes(keyword))
            .sort(SORTS[sort].compare);
    }, [courses, folder, folderIds, filter, query, sort]);

    const applyUpdate = (course) => {
        setCourses(list => list.map(item => item.id === course.id ? parseCourse(course) : item));
        onUpdated(course);
    };

    const handleRename = async (course, title) => {
        try {
            const response = await updateCourse(course.id, { title });
            applyUpdate(response.data.course);
            toast('코스 이름을 바꿨어요.', { tone: 'success' });
            return true;
        } catch {
            toast('이름을 바꾸지 못했어요. 잠시 후 다시 시도하세요.', { tone: 'error' });
            return false;
        }
    };

    const handleMove = async (folderId) => {
        try {
            const response = await updateCourse(moving.id, { folder_id: folderId });
            applyUpdate(response.data.course);
            setMoving(null);
            toast(folderId ? `'${folderNames[folderId] ?? '새 폴더'}' 폴더로 옮겼어요.` : '폴더에서 뺐어요.', { tone: 'success' });
            return true;
        } catch (err) {
            toast(apiErrorMessage(err, '폴더를 옮기지 못했어요. 잠시 후 다시 시도하세요.'), { tone: 'error' });
            return false;
        }
    };

    const handleDelete = async (course) => {
        const ok = await confirm({
            title: '코스를 삭제할까요?',
            message: `'${course.title}' 코스를 삭제합니다. 삭제한 코스는 되돌릴 수 없어요.${visibilityOf(course) !== 'private' ? '\n공유 링크와 커뮤니티 게시도 함께 사라져요.' : ''}`,
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

    const handleSaveFolder = async (name) => {
        const target = folderPrompt.folder;
        try {
            if (target) {
                const { data } = await renameFolder(target.id, name);
                setFolders(list => list.map(item => item.id === data.id ? data : item));
            } else {
                const { data } = await createFolder(name);
                setFolders(list => [...list, data]);
                setFolder(data.id);
            }
            setFolderPrompt(null);
            toast(target ? '폴더 이름을 바꿨어요.' : `'${name}' 폴더를 만들었어요.`, { tone: 'success' });
            return true;
        } catch (err) {
            return apiErrorMessage(err, '폴더를 저장하지 못했어요. 잠시 후 다시 시도하세요.');
        }
    };

    const handleDeleteFolder = async (target) => {
        const inside = courses?.filter(course => course.folder_id === target.id) ?? [];
        const ok = await confirm({
            title: '폴더를 삭제할까요?',
            message: inside.length
                ? `'${target.name}' 폴더를 삭제해요. 안에 있던 코스 ${inside.length}개는 지우지 않고 '폴더 없음'으로 옮겨요.`
                : `'${target.name}' 폴더를 삭제해요.`,
            confirmLabel: '삭제',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await deleteFolder(target.id);
            setFolders(list => list.filter(item => item.id !== target.id));
            setCourses(list => list.map(course => course.folder_id === target.id ? { ...course, folder_id: null } : course));
            inside.forEach(course => onUpdated({ ...course, folder_id: null }));
            setFolder('all');
            toast('폴더를 삭제했어요.', { tone: 'success' });
        } catch {
            toast('폴더를 삭제하지 못했어요. 잠시 후 다시 시도하세요.', { tone: 'error' });
        }
    };

    const counts = useMemo(() => {
        const inView = courses?.filter(course => inFolder(course, folder, folderIds)) ?? [];
        const result = { all: inView.length };
        SPORT_IDS.forEach(id => { result[id] = inView.filter(course => course.sport === id).length; });
        return result;
    }, [courses, folder, folderIds]);

    const folderCounts = useMemo(() => {
        const result = { all: courses?.length ?? 0, none: 0 };
        courses?.forEach(course => {
            if (course.folder_id != null && folderIds.has(course.folder_id)) result[course.folder_id] = (result[course.folder_id] || 0) + 1;
            else result.none += 1;
        });
        return result;
    }, [courses, folderIds]);

    const sharing = courses?.find(course => course.id === sharingId);

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
                <span>지도에서 코스를 만들고 '코스 저장'을 누르거나, 커뮤니티에서 마음에 드는 코스를 담아보세요.</span>
            </div>
        );
    } else if (visible.length === 0) {
        const emptyFolder = folder !== 'all' && counts.all === 0;
        content = (
            <div className="empty">
                <Icon name={emptyFolder ? 'folder' : 'search'} size={32} />
                <span className="empty__title">{emptyFolder ? '이 폴더에 코스가 없어요' : '조건에 맞는 코스가 없어요'}</span>
                {emptyFolder
                    ? <span>코스의 ⋯ 메뉴에서 '폴더 이동'을 눌러 이 폴더로 옮겨보세요.</span>
                    : <Button variant="ghost" onClick={() => { setQuery(''); setFilter('all'); }}>필터 초기화</Button>}
            </div>
        );
    } else {
        content = (
            <ul className="library__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {visible.map(course => (
                    <CourseCard
                        key={course.id}
                        course={course}
                        folderName={folder === 'all' ? folderNames[course.folder_id] : null}
                        isCurrent={course.id === currentId}
                        onLoad={onLoad}
                        onRename={handleRename}
                        onShare={(item) => setSharingId(item.id)}
                        onMove={setMoving}
                        onDelete={handleDelete}
                    />
                ))}
            </ul>
        );
    }

    const folderChip = (value, label, icon) => (
        <button key={value} type="button" className="chip" aria-pressed={folder === value} onClick={() => setFolder(value)}>
            {icon && <Icon name={icon} size={14} />}
            <span className="chip__label">{label}</span>
            <span className="chip__count">{folderCounts[value] ?? 0}</span>
        </button>
    );

    return (
        <Dialog
            open
            onClose={onClose}
            title="내 코스"
            description={courses ? `저장한 코스 ${courses.length}개 · 폴더 ${folders.length}개` : '불러오는 중…'}
            size="lg"
            initialFocus="dialog"
        >
            <div className="library__toolbar" style={{ margin: '0 -20px 14px' }}>
                <div className="folder-bar" role="group" aria-label="폴더">
                    {folderChip('all', '전체')}
                    {folders.map(item => folderChip(item.id, item.name, 'folder'))}
                    {folders.length > 0 && folderCounts.none > 0 && folderChip('none', '폴더 없음')}
                    <button type="button" className="chip chip--add" onClick={() => setFolderPrompt({ folder: null })} disabled={!courses}>
                        <Icon name="folder-plus" size={14} />새 폴더
                    </button>
                </div>
                {activeFolder && (
                    <div className="folder-head">
                        <Icon name="folder" size={16} />
                        <span className="folder-head__name">{activeFolder.name}</span>
                        <span className="folder-head__meta">코스 {folderCounts[activeFolder.id] ?? 0}개</span>
                        <MenuButton
                            label="폴더 관리"
                            items={[
                                { label: '폴더 이름 바꾸기', icon: 'pencil', onSelect: () => setFolderPrompt({ folder: activeFolder }) },
                                { label: '폴더 삭제', icon: 'trash', danger: true, onSelect: () => handleDeleteFolder(activeFolder) },
                            ]}
                        />
                    </div>
                )}
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

            {sharing && <ShareDialog course={sharing} onUpdated={applyUpdate} onClose={() => setSharingId(null)} />}
            {moving && (
                <FolderPickerDialog
                    title="폴더 이동"
                    description={`'${moving.title}'을(를) 옮길 폴더를 고르세요.`}
                    confirmLabel="옮기기"
                    initialFolderId={folderIds.has(moving.folder_id) ? moving.folder_id : null}
                    onSubmit={handleMove}
                    onCreated={(created) => setFolders(list => [...list, created])}
                    onClose={() => setMoving(null)}
                />
            )}
            {folderPrompt && (
                <PromptDialog
                    title={folderPrompt.folder ? '폴더 이름 바꾸기' : '새 폴더'}
                    label="폴더 이름"
                    placeholder="예: 주말 라이딩"
                    initialValue={folderPrompt.folder?.name ?? ''}
                    confirmLabel={folderPrompt.folder ? '바꾸기' : '만들기'}
                    onSubmit={handleSaveFolder}
                    onClose={() => setFolderPrompt(null)}
                />
            )}
        </Dialog>
    );
};

export default CourseLibrary;
