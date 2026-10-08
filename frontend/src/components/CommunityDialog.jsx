// src/components/CommunityDialog.jsx
// 커뮤니티: 전체 공개된 코스를 최신순·많이 담긴 순·좋아요 순으로 둘러보고, 눌러서 전체 코스를 봅니다.
import { useCallback, useEffect, useState } from 'react';
import { getCommunity } from '../api/courseApi';
import { SPORTS, SPORT_IDS } from '../sports';
import { timeAgo } from '../utils/share';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';
import CourseThumbnail from './CourseThumbnail';
import SharedCourseDialog from './SharedCourseDialog';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;
const SORTS = { recent: '최신순', popular: '많이 담긴 순', likes: '좋아요 순' };

const CommunityCard = ({ item, onOpen }) => {
    const sport = SPORTS[item.sport] ?? SPORTS.bike;
    return (
        <li>
            <button type="button" className="course-card community-card" onClick={() => onOpen(item.token)}>
                <span className="course-card__thumb">
                    <CourseThumbnail points={item.preview} color={sport.color} />
                </span>
                <span className="course-card__main">
                    <span className="course-card__title" title={item.title}>{item.title}</span>
                    <span className="course-card__meta">
                        <span className="sport-tag" style={{ background: sport.color, color: sport.onColor }}>
                            <Icon name={sport.icon} size={12} strokeWidth={2.5} />{sport.label}
                        </span>
                        <span>{item.distance_km.toFixed(1)}km</span>
                        <span>↗ {item.ascent_m.toLocaleString()}m</span>
                    </span>
                    <span className="course-card__meta">
                        <span className="community-card__author">{item.nickname ?? '알 수 없음'}</span>
                        {item.is_owner && <span className="muted-tag">내 코스</span>}
                        {item.published_at && <span>{timeAgo(item.published_at)}</span>}
                    </span>
                    <span className="counts">
                        <span className={item.liked ? 'counts__liked' : undefined} title="좋아요"><Icon name="heart" size={14} />{item.like_count}</span>
                        <span title="내 코스에 담은 사람"><Icon name="folder-plus" size={14} />{item.share_count}</span>
                        <span title="댓글"><Icon name="message" size={14} />{item.comment_count}</span>
                    </span>
                </span>
            </button>
        </li>
    );
};

const CommunityDialog = ({ userId, ensureMember, onOpenCourse, onClose }) => {
    const [query, setQuery] = useState('');
    const [keyword, setKeyword] = useState('');
    const [sport, setSport] = useState('all');
    const [sort, setSort] = useState('recent');
    // 조건(key)과 함께 결과를 보관해, 조건이 바뀌면 이전 결과 대신 불러오는 중으로 표시합니다.
    const [page, setPage] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [openToken, setOpenToken] = useState(null);
    const [attempt, setAttempt] = useState(0);

    const params = useCallback((offset) => ({
        q: keyword || undefined,
        sport: sport === 'all' ? undefined : sport,
        sort,
        offset,
        limit: PAGE_SIZE,
    }), [keyword, sport, sort]);
    const key = JSON.stringify([keyword, sport, sort, userId ?? '', attempt]);

    useEffect(() => {
        const timer = window.setTimeout(() => setKeyword(query.trim()), SEARCH_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const controller = new AbortController();
        getCommunity(params(0), controller.signal)
            .then(response => setPage({ key, items: response.data.items, hasMore: response.data.has_more }))
            .catch(error => { if (!controller.signal.aborted) setPage({ key, error }); });
        return () => controller.abort();
    }, [params, key]);

    const current = page?.key === key ? page : null;

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const response = await getCommunity(params(current.items.length));
            setPage(prev => {
                if (prev?.key !== key) return prev;
                // 그사이 새로 공개된 코스 때문에 같은 코스가 두 번 오면 한 번만 보여줍니다.
                const seen = new Set(prev.items.map(item => item.token));
                return { ...prev, items: [...prev.items, ...response.data.items.filter(item => !seen.has(item.token))], hasMore: response.data.has_more };
            });
        } catch {
            setPage(prev => ({ ...prev, moreError: true }));
        } finally {
            setLoadingMore(false);
        }
    };

    const handleChange = useCallback(({ token, ...changes }) => {
        setPage(prev => prev?.items
            ? { ...prev, items: prev.items.map(item => item.token === token ? { ...item, ...changes } : item) }
            : prev);
    }, []);

    let content;
    if (current?.error) {
        content = (
            <div className="empty">
                <Icon name="alert" size={32} />
                <span className="empty__title">커뮤니티를 불러오지 못했어요</span>
                <span>인터넷 연결이나 서버 상태를 확인하고 다시 시도하세요.</span>
                <Button variant="secondary" icon="loop" onClick={() => setAttempt(value => value + 1)}>다시 시도</Button>
            </div>
        );
    } else if (!current) {
        content = <div className="library__list" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>;
    } else if (current.items.length === 0) {
        content = (
            <div className="empty">
                <Icon name={keyword || sport !== 'all' ? 'search' : 'users'} size={32} />
                <span className="empty__title">{keyword || sport !== 'all' ? '조건에 맞는 코스가 없어요' : '아직 공개된 코스가 없어요'}</span>
                <span>{keyword || sport !== 'all'
                    ? '다른 검색어나 종목으로 찾아보세요.'
                    : "코스를 저장할 때 공개 범위를 '전체 공개'로 고르면 이곳에 올라가요."}</span>
            </div>
        );
    } else {
        content = (
            <>
                <ul className="library__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {current.items.map(item => <CommunityCard key={item.token} item={item} onOpen={setOpenToken} />)}
                </ul>
                {current.hasMore && (
                    <div className="load-more">
                        <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                            {current.moreError ? '다시 시도' : '더 보기'}
                        </Button>
                    </div>
                )}
            </>
        );
    }

    return (
        <Dialog
            open
            onClose={onClose}
            title="커뮤니티"
            description="다른 사람들이 공개한 코스를 둘러보고, 마음에 드는 코스를 내 코스에 담아보세요."
            size="lg"
            initialFocus="dialog"
        >
            <div className="library__toolbar" style={{ margin: '0 -20px 14px' }}>
                <div className="input-wrap">
                    <Icon name="search" size={16} />
                    <input className="input" type="search" placeholder="코스 이름이나 닉네임 검색" aria-label="코스 이름이나 닉네임 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <select className="select" aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value)}>
                    {Object.entries(SORTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <SegmentedControl
                    label="종목별 보기"
                    value={sport}
                    onChange={setSport}
                    options={[
                        { value: 'all', label: '전체' },
                        ...SPORT_IDS.map(id => ({ value: id, label: SPORTS[id].label, swatch: SPORTS[id].color })),
                    ]}
                />
            </div>
            {content}
            {openToken && (
                <SharedCourseDialog
                    token={openToken}
                    userId={userId}
                    ensureMember={ensureMember}
                    onOpenCourse={onOpenCourse}
                    onChange={handleChange}
                    onClose={() => setOpenToken(null)}
                />
            )}
        </Dialog>
    );
};

export default CommunityDialog;
