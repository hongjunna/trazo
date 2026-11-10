// src/components/CourseExplorer.jsx
// 코스 지도: 전체 공개된 러닝·자전거 코스를 지도 위에 한꺼번에 그려 둘러봅니다.
// 지도를 움직이면 보이는 범위의 코스를 다시 불러오고, 코스를 누르면 정보와 '자세히 보기'를 보여줍니다.
// 데스크톱은 왼쪽 목록 + 지도, 모바일은 전체 화면 지도 + 아래 접히는 목록입니다.
// '전체'와 '트랙' 보기에서는 육상 트랙(OpenStreetMap·관리자 등록)도 트랙 모양 선이나 핀으로 함께 보여줍니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { getCourseMap, getTrackMap } from '../api/courseApi';
import { SPORTS, SPORT_IDS } from '../sports';
import { COLORS } from '../styles/theme';
import { readStored, writeStored } from '../utils/storage';
import { timeAgo } from '../utils/share';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';

const FETCH_DELAY_MS = 250;
const NONE = [];
// 이 축척보다 넓게 보면(숫자가 클수록 넓음) 출발점 핀을 숨겨 지도가 복잡해지지 않게 합니다.
const PIN_MAX_LEVEL = 8;
// 선 아래에 까는 짙은 테두리. 카카오 지도의 주황 도로·초록 공원과 코스 선이 섞여 보이지 않게 합니다.
const CASING_COLOR = '#0E2A2E';
const ROUTE_LABEL = { loop: '순환', out_and_back: '왕복', point_to_point: '편도' };
const SPORT_FILTERS = [
    { value: 'all', label: '전체' },
    ...SPORT_IDS.map(id => ({ value: id, label: SPORTS[id].label, swatch: SPORTS[id].color })),
    { value: 'track', label: '트랙', swatch: COLORS.track },
];
const FILTER_IDS = new Set(SPORT_FILTERS.map(filter => filter.value));
// 이 축척보다 넓게 보면 트랙 선이 점처럼 작아지므로 트랙 핀을 함께 보여줍니다.
const TRACK_PIN_MIN_LEVEL = 6;
const SURFACE_LABEL = { tartan: '우레탄(탄성)', synthetic: '우레탄(탄성)', rubber: '고무', asphalt: '아스팔트', dirt: '흙', ground: '흙', clay: '흙', grass: '잔디', artificial_turf: '인조잔디', gravel: '자갈', sand: '모래', concrete: '콘크리트', paved: '포장', unpaved: '비포장', compacted: '다짐 흙' };
const trackPath = (track) => (track.path ?? []).map(([lat, lng]) => ({ lat, lng }));
const trackMeta = (track) => [
    track.length_m ? `한 바퀴 ${track.length_m.toLocaleString()}m` : null,
    track.lanes ? `${track.lanes}레인` : null,
    track.surface ? (SURFACE_LABEL[track.surface] ?? track.surface) : null,
].filter(Boolean);

const initialView = () => {
    const stored = readStored('trazo:exploreView', null) ?? readStored('trazo:view', null);
    if (stored && Number.isFinite(stored.lat) && Number.isFinite(stored.lng)) {
        return { center: { lat: stored.lat, lng: stored.lng }, level: Math.min(Math.max(Number.isInteger(stored.level) ? stored.level : 7, 5), 10) };
    }
    return { center: { lat: 37.5326, lng: 126.99 }, level: 8 };
};

const toPath = (item) => item.path.map(([lat, lng]) => ({ lat, lng }));
const midpoint = (item) => {
    const [lat, lng] = item.path[Math.floor(item.path.length / 2)];
    return { lat, lng };
};
const sportOf = (item) => SPORTS[item.sport] ?? SPORTS.bike;

const CourseMeta = ({ item }) => (
    <span className="explore-item__meta">
        <span>{item.distance_km.toFixed(1)}km</span>
        <span>↗ {item.ascent_m.toLocaleString()}m</span>
        {ROUTE_LABEL[item.route_type] && <span>{ROUTE_LABEL[item.route_type]}</span>}
        <span className="explore-item__likes"><Icon name="heart" size={12} />{item.like_count}</span>
    </span>
);

const ExploreItem = ({ item, selected, onSelect, onHover }) => {
    const sport = sportOf(item);
    return (
        <li>
            <button
                type="button"
                className="explore-item"
                aria-pressed={selected}
                onClick={() => onSelect(item)}
                onMouseEnter={() => onHover(item.token)}
                onMouseLeave={() => onHover(null)}
            >
                <span className="explore-item__bar" style={{ background: sport.color }} />
                <span className="explore-item__body">
                    <span className="explore-item__title">{item.title}</span>
                    <CourseMeta item={item} />
                    <span className="explore-item__author">{sport.label} · {item.nickname ?? '알 수 없음'}{item.published_at ? ` · ${timeAgo(item.published_at)}` : ''}</span>
                </span>
            </button>
        </li>
    );
};

const TrackItem = ({ track, selected, onSelect, onHover }) => (
    <li>
        <button
            type="button"
            className="explore-item"
            aria-pressed={selected}
            onClick={() => onSelect(track)}
            onMouseEnter={() => onHover(track.id)}
            onMouseLeave={() => onHover(null)}
        >
            <span className="explore-item__bar" style={{ background: COLORS.track }} />
            <span className="explore-item__body">
                <span className="explore-item__title">{track.name}</span>
                <span className="explore-item__meta">
                    {trackMeta(track).map(text => <span key={text}>{text}</span>)}
                    {!trackMeta(track).length && <span>트랙 정보 없음</span>}
                </span>
                <span className="explore-item__author">육상 트랙{track.region ? ` · ${track.region}` : ''}</span>
            </span>
        </button>
    </li>
);

const CourseExplorer = ({ onOpenCourse }) => {
    const [view] = useState(initialView);
    const [map, setMap] = useState(null);
    const [sport, setSport] = useState(() => {
        const stored = readStored('trazo:exploreSport', 'all');
        return FILTER_IDS.has(stored) ? stored : 'all';
    });
    const [bounds, setBounds] = useState(null);
    const [result, setResult] = useState({ key: null, items: [], total: 0, truncated: false, error: null });
    const [selectedToken, setSelectedToken] = useState(null);
    const [trackResult, setTrackResult] = useState({ key: null, items: [], error: null });
    const [selectedTrackId, setSelectedTrackId] = useState(null);
    const [hoveredTrackId, setHoveredTrackId] = useState(null);
    const [hoveredToken, setHoveredToken] = useState(null);
    const [listOpen, setListOpen] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [myLocation, setMyLocation] = useState(null);
    const [level, setLevel] = useState(view.level);
    // 바탕 지도를 흑백으로 흐리게 해 코스 선이 잘 보이게 합니다 (기본 켜짐).
    const [muted, setMuted] = useState(() => readStored('trazo:exploreMuted', true) !== false);
    const areaRef = useRef(null);

    // 지도가 아직 뜨지 않았으면(또는 지도를 불러오지 못하면) 범위 없이 인기 코스부터 불러옵니다.
    const key = JSON.stringify([sport, bounds ?? {}, attempt]);
    const showCourses = sport !== 'track';
    const showTracks = sport === 'all' || sport === 'track';
    const trackKey = JSON.stringify([bounds ?? {}, attempt]);
    const loading = showCourses ? result.key !== key : trackResult.key !== trackKey;

    useEffect(() => {
        if (!showTracks) return undefined;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            const [box] = JSON.parse(trackKey);
            getTrackMap(box, controller.signal)
                .then(({ data }) => setTrackResult({ key: trackKey, items: data.items, error: null }))
                .catch(error => { if (!controller.signal.aborted) setTrackResult(prev => ({ ...prev, key: trackKey, error })); });
        }, FETCH_DELAY_MS);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [trackKey, showTracks]);

    useEffect(() => {
        const controller = new AbortController();
        if (!showCourses) return undefined;
        const timer = window.setTimeout(() => {
            const [filter, box] = JSON.parse(key);
            getCourseMap({ ...box, sport: filter === 'all' ? undefined : filter }, controller.signal)
                .then(({ data }) => setResult({ key, items: data.items, total: data.total, truncated: data.truncated, error: null }))
                .catch(error => { if (!controller.signal.aborted) setResult(prev => ({ ...prev, key, error })); });
        }, FETCH_DELAY_MS);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [key, showCourses]);

    // 페이지 크기가 바뀌면(모바일 회전, 창 크기) 지도 크기를 다시 계산합니다.
    useEffect(() => {
        const node = areaRef.current;
        if (!map || !node) return;
        const observer = new ResizeObserver(() => map.relayout());
        observer.observe(node);
        return () => observer.disconnect();
    }, [map]);

    const handleIdle = useCallback((target) => {
        const box = target.getBounds();
        const sw = box.getSouthWest();
        const ne = box.getNorthEast();
        // 조금 넓게 불러와 지도를 살짝 움직여도 코스가 끊겨 보이지 않게 합니다.
        const padLat = (ne.getLat() - sw.getLat()) * 0.15;
        const padLng = (ne.getLng() - sw.getLng()) * 0.15;
        const round = (value) => Math.round(value * 1000) / 1000;
        setBounds({ south: round(sw.getLat() - padLat), west: round(sw.getLng() - padLng), north: round(ne.getLat() + padLat), east: round(ne.getLng() + padLng) });
        setLevel(target.getLevel());
        const center = target.getCenter();
        writeStored('trazo:exploreView', { lat: center.getLat(), lng: center.getLng(), level: target.getLevel() });
    }, []);

    const toggleMuted = () => {
        setMuted(value => {
            writeStored('trazo:exploreMuted', !value);
            return !value;
        });
    };

    const changeSport = (value) => {
        setSport(value);
        setSelectedToken(null);
        setSelectedTrackId(null);
        writeStored('trazo:exploreSport', value);
    };

    const items = showCourses ? result.items : NONE;
    const tracks = showTracks ? trackResult.items : NONE;
    const selectedTrack = tracks.find(track => track.id === selectedTrackId) ?? null;
    const hoveredTrack = tracks.find(track => track.id === hoveredTrackId) ?? null;
    const selected = items.find(item => item.token === selectedToken) ?? null;
    const hovered = items.find(item => item.token === hoveredToken) ?? null;
    // 고른 코스와 마우스를 올린 코스를 맨 위에 그립니다.
    const ordered = useMemo(() => {
        const front = new Set([hoveredToken, selectedToken]);
        return [...items.filter(item => !front.has(item.token)), ...items.filter(item => front.has(item.token))];
    }, [items, hoveredToken, selectedToken]);

    const selectTrack = (track, fit = false) => {
        setSelectedTrackId(track.id);
        setSelectedToken(null);
        if (fit && map) {
            if (track.path?.length) {
                const box = new window.kakao.maps.LatLngBounds();
                track.path.forEach(([lat, lng]) => box.extend(new window.kakao.maps.LatLng(lat, lng)));
                map.setBounds(box, 80, 80, 80, 80);
            } else {
                map.setLevel(3);
                map.panTo(new window.kakao.maps.LatLng(track.lat, track.lng));
            }
        }
    };

    const handleTrackListSelect = (track) => {
        selectTrack(track, true);
        setListOpen(false);
    };

    const clearSelection = () => {
        setSelectedToken(null);
        setSelectedTrackId(null);
    };

    const select = (item, fit = false) => {
        setSelectedTrackId(null);
        setSelectedToken(item.token);
        if (fit && map) {
            const box = new window.kakao.maps.LatLngBounds();
            item.path.forEach(([lat, lng]) => box.extend(new window.kakao.maps.LatLng(lat, lng)));
            map.setBounds(box, 60, 60, 60, 60);
        }
    };

    const handleListSelect = (item) => {
        select(item, true);
        setListOpen(false);
    };

    const locate = () => {
        navigator.geolocation?.getCurrentPosition((position) => {
            const point = { lat: position.coords.latitude, lng: position.coords.longitude };
            setMyLocation(point);
            map?.setLevel(6);
            map?.panTo(new window.kakao.maps.LatLng(point.lat, point.lng));
        }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    };

    let listBody;
    const listError = showCourses ? result.error : trackResult.error;
    if (listError && !loading) {
        listBody = (
            <div className="explore-empty">
                <Icon name="alert" size={24} />
                <span>{showCourses ? '코스를' : '트랙을'} 불러오지 못했어요.</span>
                <Button size="sm" variant="secondary" onClick={() => setAttempt(value => value + 1)}>다시 시도</Button>
            </div>
        );
    } else if (!showCourses) {
        listBody = tracks.length ? (
            <ul className="explore-list">
                {tracks.map(track => (
                    <TrackItem key={track.id} track={track} selected={track.id === selectedTrackId} onSelect={handleTrackListSelect} onHover={setHoveredTrackId} />
                ))}
            </ul>
        ) : (
            <div className="explore-empty">
                <Icon name="track" size={24} />
                <span>{loading ? '트랙을 찾는 중…' : '이 지역에는 등록된 육상 트랙이 없어요. 지도를 옮기거나 축소해 보세요.'}</span>
            </div>
        );
    } else if (!items.length) {
        listBody = (
            <div className="explore-empty">
                <Icon name="map" size={24} />
                <span>{loading ? '코스를 찾는 중…' : '이 지역에는 아직 공개된 코스가 없어요. 지도를 옮기거나 축소해 보세요.'}</span>
            </div>
        );
    } else {
        listBody = (
            <ul className="explore-list">
                {items.map(item => (
                    <ExploreItem key={item.token} item={item} selected={item.token === selectedToken} onSelect={handleListSelect} onHover={setHoveredToken} />
                ))}
            </ul>
        );
    }

    let countLabel;
    if (!showCourses) countLabel = loading && !tracks.length ? '불러오는 중…' : `이 지역 육상 트랙 ${tracks.length.toLocaleString()}개`;
    else if (loading && !items.length) countLabel = '불러오는 중…';
    else countLabel = `이 지역 공개 코스 ${result.total.toLocaleString()}개${result.truncated ? ` (인기 ${items.length}개 표시)` : ''}${showTracks && tracks.length ? ` · 트랙 ${tracks.length}개` : ''}`;

    return (
        <div className="explore">
            <aside className={`explore__panel ${listOpen ? 'is-open' : ''}`}>
                <div className="explore__head">
                    <div className="explore__titles">
                        <h1>코스 지도</h1>
                        <span className="explore__count" aria-live="polite">
                            {loading && <Icon name="loader" size={12} className="spin" />}{countLabel}
                        </span>
                    </div>
                    <button type="button" className="explore__toggle" aria-expanded={listOpen} onClick={() => setListOpen(open => !open)}>
                        <Icon name="layers" size={16} />{listOpen ? '지도 보기' : '목록'}
                    </button>
                </div>
                <SegmentedControl label="종목별 보기" options={SPORT_FILTERS} value={sport} onChange={changeSport} className="explore__filter" />
                <div className="explore__list">{listBody}</div>
            </aside>

            <div className={`explore__map ${muted ? 'is-muted' : ''}`} ref={areaRef}>
                <Map
                    center={view.center}
                    level={view.level}
                    className="map-canvas"
                    style={{ width: '100%', height: '100%' }}
                    onCreate={setMap}
                    onIdle={handleIdle}
                    onClick={clearSelection}
                >
                    {/* 육상 트랙: 코스 선보다 아래에 깔아, 트랙 위를 지나는 코스도 잘 보이게 합니다. */}
                    {tracks.filter(track => track.path?.length).map(track => {
                        const focused = track.id === selectedTrackId || track.id === hoveredTrackId;
                        return (
                            <Polyline
                                key={`track-${track.id}-casing`}
                                path={trackPath(track)}
                                strokeWeight={focused ? 10 : 7}
                                strokeColor={focused ? '#FFFFFF' : CASING_COLOR}
                                strokeOpacity={focused ? 1 : 0.55}
                                strokeStyle="solid"
                            />
                        );
                    })}
                    {tracks.filter(track => track.path?.length).map(track => {
                        const focused = track.id === selectedTrackId || track.id === hoveredTrackId;
                        return (
                            <Polyline
                                key={`track-${track.id}`}
                                path={trackPath(track)}
                                strokeWeight={focused ? 6 : 4}
                                strokeColor={COLORS.track}
                                strokeOpacity={1}
                                strokeStyle="solid"
                                onClick={() => selectTrack(track)}
                                onMouseover={() => setHoveredTrackId(track.id)}
                                onMouseout={() => setHoveredTrackId(id => (id === track.id ? null : id))}
                            />
                        );
                    })}
                    {tracks.filter(track => !track.path?.length || level >= TRACK_PIN_MIN_LEVEL).map(track => {
                        const focused = track.id === selectedTrackId || track.id === hoveredTrackId;
                        return (
                            <CustomOverlayMap key={`track-${track.id}-pin`} position={{ lat: track.lat, lng: track.lng }} zIndex={focused ? 8 : 3} clickable>
                                <button
                                    type="button"
                                    className={`explore-pin explore-pin--track ${focused ? 'is-focused' : ''}`}
                                    style={{ '--pin': COLORS.track, '--pin-on': '#FFFFFF' }}
                                    aria-label={`${track.name} 육상 트랙`}
                                    onClick={() => selectTrack(track)}
                                    onMouseEnter={() => setHoveredTrackId(track.id)}
                                    onMouseLeave={() => setHoveredTrackId(id => (id === track.id ? null : id))}
                                >
                                    <Icon name="track" size={12} strokeWidth={2.5} />
                                </button>
                            </CustomOverlayMap>
                        );
                    })}
                    {hoveredTrack && hoveredTrack.id !== selectedTrackId && (
                        <CustomOverlayMap position={{ lat: hoveredTrack.lat, lng: hoveredTrack.lng }} zIndex={9} yAnchor={1.8}>
                            <div className="explore-tip">{hoveredTrack.name}{hoveredTrack.length_m ? ` · ${hoveredTrack.length_m}m` : ''}</div>
                        </CustomOverlayMap>
                    )}
                    {/* 모든 코스의 짙은 테두리를 먼저 깔고, 그 위에 종목 색 선을 그립니다. */}
                    {ordered.map(item => {
                        const focused = item.token === selectedToken || item.token === hoveredToken;
                        const dimmed = selectedToken && !focused;
                        return (
                            <Polyline
                                key={`${item.token}-casing`}
                                path={toPath(item)}
                                strokeWeight={focused ? 11 : 6.5}
                                strokeColor={focused ? '#FFFFFF' : CASING_COLOR}
                                strokeOpacity={dimmed ? 0.15 : focused ? 1 : 0.7}
                                strokeStyle="solid"
                            />
                        );
                    })}
                    {ordered.map(item => {
                        const focused = item.token === selectedToken || item.token === hoveredToken;
                        const dimmed = selectedToken && !focused;
                        return (
                            <Polyline
                                key={item.token}
                                path={toPath(item)}
                                strokeWeight={focused ? 6 : 3.5}
                                strokeColor={sportOf(item).color}
                                strokeOpacity={dimmed ? 0.3 : 1}
                                strokeStyle="solid"
                                onClick={() => select(item)}
                                onMouseover={() => setHoveredToken(item.token)}
                                onMouseout={() => setHoveredToken(token => (token === item.token ? null : token))}
                            />
                        );
                    })}
                    {/* 출발점 핀: 코스가 겹쳐도 하나하나 눌러 고를 수 있게 합니다. */}
                    {level <= PIN_MAX_LEVEL && items.map(item => {
                        const focused = item.token === selectedToken || item.token === hoveredToken;
                        return (
                            <CustomOverlayMap key={`${item.token}-pin`} position={toPath(item)[0]} zIndex={focused ? 8 : 4} clickable>
                                <button
                                    type="button"
                                    className={`explore-pin ${focused ? 'is-focused' : ''} ${selectedToken && !focused ? 'is-dimmed' : ''}`}
                                    style={{ '--pin': sportOf(item).color, '--pin-on': sportOf(item).onColor }}
                                    aria-label={`${item.title} 출발점`}
                                    onClick={() => select(item)}
                                    onMouseEnter={() => setHoveredToken(item.token)}
                                    onMouseLeave={() => setHoveredToken(token => (token === item.token ? null : token))}
                                >
                                    <Icon name={sportOf(item).icon} size={12} strokeWidth={2.5} />
                                </button>
                            </CustomOverlayMap>
                        );
                    })}
                    {hovered && hovered.token !== selectedToken && (
                        <CustomOverlayMap position={midpoint(hovered)} zIndex={9} yAnchor={1.6}>
                            <div className="explore-tip">{hovered.title} · {hovered.distance_km.toFixed(1)}km</div>
                        </CustomOverlayMap>
                    )}
                    {selected && (
                        <CustomOverlayMap position={toPath(selected)[0]} zIndex={5}>
                            <div className="explore-start" aria-hidden="true" />
                        </CustomOverlayMap>
                    )}
                    {myLocation && (
                        <CustomOverlayMap position={myLocation} zIndex={4}>
                            <div className="my-location" aria-label="내 위치" />
                        </CustomOverlayMap>
                    )}
                </Map>

                <div className="explore__tools">
                    <Button variant="secondary" icon="locate" iconSize={18} onClick={locate} aria-label="내 위치" title="내 위치" />
                    <Button
                        variant="secondary"
                        icon="layers"
                        iconSize={18}
                        onClick={toggleMuted}
                        aria-pressed={!muted}
                        aria-label={muted ? '컬러 지도로 보기' : '지도 흐리게 보기'}
                        title={muted ? '컬러 지도로 보기' : '지도 흐리게 보기 (코스가 잘 보여요)'}
                    />
                </div>

                <div className="explore__legend" aria-hidden="true">
                    {showCourses && SPORT_IDS.filter(id => sport === 'all' || sport === id).map(id => <span key={id}><i style={{ background: SPORTS[id].color }} />{SPORTS[id].label}</span>)}
                    {showTracks && <span><i style={{ background: COLORS.track }} />육상 트랙</span>}
                </div>

                {selectedTrack && (
                    <div className="explore-card" role="dialog" aria-label={`${selectedTrack.name} 트랙 정보`}>
                        <span className="explore-card__bar" style={{ background: COLORS.track }} />
                        <div className="explore-card__body">
                            <div className="explore-card__top">
                                <span className="sport-tag" style={{ background: COLORS.track, color: '#FFFFFF' }}>
                                    <Icon name="track" size={12} strokeWidth={2.5} />육상 트랙
                                </span>
                                <button type="button" className="explore-card__close" aria-label="닫기" onClick={clearSelection}><Icon name="x" size={16} /></button>
                            </div>
                            <strong className="explore-card__title">{selectedTrack.name}</strong>
                            <span className="explore-item__meta">
                                {trackMeta(selectedTrack).map(text => <span key={text}>{text}</span>)}
                                {selectedTrack.region && <span>{selectedTrack.region}</span>}
                            </span>
                            {selectedTrack.note && <span className="explore-item__author">{selectedTrack.note}</span>}
                            <span className="explore-item__author">
                                {selectedTrack.source === 'osm' ? '위치 정보: © OpenStreetMap 기여자' : 'Trazo가 등록한 트랙'} · 이용 시간은 시설에 확인하세요
                            </span>
                            <Button
                                variant="primary"
                                size="sm"
                                icon="map"
                                onClick={() => window.open(`https://map.kakao.com/link/to/${encodeURIComponent(selectedTrack.name)},${selectedTrack.lat},${selectedTrack.lng}`, '_blank', 'noopener')}
                            >
                                카카오맵 길찾기
                            </Button>
                        </div>
                    </div>
                )}
                {selected && (
                    <div className="explore-card" role="dialog" aria-label={`${selected.title} 코스 정보`}>
                        <span className="explore-card__bar" style={{ background: sportOf(selected).color }} />
                        <div className="explore-card__body">
                            <div className="explore-card__top">
                                <span className="sport-tag" style={{ background: sportOf(selected).color, color: sportOf(selected).onColor }}>
                                    <Icon name={sportOf(selected).icon} size={12} strokeWidth={2.5} />{sportOf(selected).label}
                                </span>
                                <button type="button" className="explore-card__close" aria-label="닫기" onClick={() => setSelectedToken(null)}><Icon name="x" size={16} /></button>
                            </div>
                            <strong className="explore-card__title">{selected.title}</strong>
                            <CourseMeta item={selected} />
                            <span className="explore-item__author">{selected.nickname ?? '알 수 없음'} · 담기 {selected.share_count}</span>
                            <Button variant="primary" size="sm" icon="route" onClick={() => onOpenCourse(selected.token)}>코스 자세히 보기</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CourseExplorer;
