// src/components/CourseExplorer.jsx
// 코스 지도: 전체 공개된 러닝·자전거 코스를 지도 위에 한꺼번에 그려 둘러봅니다.
// 지도를 움직이면 보이는 범위의 코스를 다시 불러오고, 코스를 누르면 정보와 '자세히 보기'를 보여줍니다.
// 데스크톱은 왼쪽 목록 + 지도, 모바일은 전체 화면 지도 + 아래 접히는 목록입니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { getCourseMap } from '../api/courseApi';
import { SPORTS, SPORT_IDS } from '../sports';
import { COLORS } from '../styles/theme';
import { readStored, writeStored } from '../utils/storage';
import { timeAgo } from '../utils/share';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';

const FETCH_DELAY_MS = 250;
const ROUTE_LABEL = { loop: '순환', out_and_back: '왕복', point_to_point: '편도' };
const SPORT_FILTERS = [
    { value: 'all', label: '전체' },
    ...SPORT_IDS.map(id => ({ value: id, label: SPORTS[id].label, swatch: SPORTS[id].color })),
];

const initialView = () => {
    const stored = readStored('trazo:exploreView', null) ?? readStored('trazo:view', null);
    if (stored && Number.isFinite(stored.lat) && Number.isFinite(stored.lng)) {
        return { center: { lat: stored.lat, lng: stored.lng }, level: Math.min(Math.max(Number.isInteger(stored.level) ? stored.level : 7, 5), 10) };
    }
    return { center: { lat: 37.5326, lng: 126.99 }, level: 8 };
};

const toPath = (item) => item.path.map(([lat, lng]) => ({ lat, lng }));
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

const CourseExplorer = ({ onOpenCourse }) => {
    const [view] = useState(initialView);
    const [map, setMap] = useState(null);
    const [sport, setSport] = useState(() => readStored('trazo:exploreSport', 'all'));
    const [bounds, setBounds] = useState(null);
    const [result, setResult] = useState({ key: null, items: [], total: 0, truncated: false, error: null });
    const [selectedToken, setSelectedToken] = useState(null);
    const [hoveredToken, setHoveredToken] = useState(null);
    const [listOpen, setListOpen] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [myLocation, setMyLocation] = useState(null);
    const areaRef = useRef(null);

    // 지도가 아직 뜨지 않았으면(또는 지도를 불러오지 못하면) 범위 없이 인기 코스부터 불러옵니다.
    const key = JSON.stringify([sport, bounds ?? {}, attempt]);
    const loading = result.key !== key;

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            const [filter, box] = JSON.parse(key);
            getCourseMap({ ...box, sport: filter === 'all' ? undefined : filter }, controller.signal)
                .then(({ data }) => setResult({ key, items: data.items, total: data.total, truncated: data.truncated, error: null }))
                .catch(error => { if (!controller.signal.aborted) setResult(prev => ({ ...prev, key, error })); });
        }, FETCH_DELAY_MS);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [key]);

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
        const center = target.getCenter();
        writeStored('trazo:exploreView', { lat: center.getLat(), lng: center.getLng(), level: target.getLevel() });
    }, []);

    const changeSport = (value) => {
        setSport(value);
        writeStored('trazo:exploreSport', value);
    };

    const items = result.items;
    const selected = items.find(item => item.token === selectedToken) ?? null;
    // 고른 코스와 마우스를 올린 코스를 맨 위에 그립니다.
    const ordered = useMemo(() => {
        const front = new Set([hoveredToken, selectedToken]);
        return [...items.filter(item => !front.has(item.token)), ...items.filter(item => front.has(item.token))];
    }, [items, hoveredToken, selectedToken]);

    const select = (item, fit = false) => {
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
    if (result.error && !loading) {
        listBody = (
            <div className="explore-empty">
                <Icon name="alert" size={24} />
                <span>코스를 불러오지 못했어요.</span>
                <Button size="sm" variant="secondary" onClick={() => setAttempt(value => value + 1)}>다시 시도</Button>
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

    const countLabel = loading && !items.length ? '불러오는 중…' : `이 지역 공개 코스 ${result.total.toLocaleString()}개${result.truncated ? ` (인기 ${items.length}개 표시)` : ''}`;

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

            <div className="explore__map" ref={areaRef}>
                <Map
                    center={view.center}
                    level={view.level}
                    className="map-canvas"
                    style={{ width: '100%', height: '100%' }}
                    onCreate={setMap}
                    onIdle={handleIdle}
                    onClick={() => setSelectedToken(null)}
                >
                    {ordered.map(item => {
                        const isSelected = item.token === selectedToken;
                        const isHovered = item.token === hoveredToken;
                        const dimmed = selectedToken && !isSelected;
                        const path = toPath(item);
                        return [
                            (isSelected || isHovered) && (
                                <Polyline key={`${item.token}-o`} path={path} strokeWeight={9} strokeColor={COLORS.primary} strokeOpacity={0.55} strokeStyle="solid" />
                            ),
                            <Polyline
                                key={item.token}
                                path={path}
                                strokeWeight={isSelected || isHovered ? 5 : 3}
                                strokeColor={sportOf(item).color}
                                strokeOpacity={dimmed ? 0.3 : isSelected || isHovered ? 1 : 0.72}
                                strokeStyle="solid"
                                onClick={() => select(item)}
                                onMouseover={() => setHoveredToken(item.token)}
                                onMouseout={() => setHoveredToken(token => (token === item.token ? null : token))}
                            />,
                        ];
                    })}
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
                </div>

                <div className="explore__legend" aria-hidden="true">
                    {SPORT_IDS.map(id => <span key={id}><i style={{ background: SPORTS[id].color }} />{SPORTS[id].label}</span>)}
                </div>

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
