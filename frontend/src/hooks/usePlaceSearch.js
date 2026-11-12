// src/hooks/usePlaceSearch.js
// 코스 생성 지도의 장소 검색 상태 (카카오 지도 키워드 검색). 검색창과 지도 위 결과 핀이 함께 씁니다.
import { useCallback, useRef, useState } from 'react';
import { latLng, mapBounds } from '../maps/settings';

const MAX_RESULTS = 15;

const placesService = () => (window.kakao?.maps?.services ? new window.kakao.maps.services.Places() : null);

// 검색 상태는 지도 안(핀)과 지도 위(검색창) 두 곳에서 쓰므로 App에서 한 번 만들어 나눠 줍니다.
export const usePlaceSearch = (map) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [state, setState] = useState({ status: 'idle', results: [], searched: '' });
    const [activeId, setActiveId] = useState(null);
    const requestRef = useRef(0);

    const search = useCallback((text) => {
        const keyword = text.trim();
        const service = placesService();
        if (!keyword || !service) return;
        const request = ++requestRef.current;
        setState(prev => ({ ...prev, status: 'loading', searched: keyword }));
        const options = { size: MAX_RESULTS };
        // 지금 보고 있는 지도 가운데와 가까운 곳을 먼저 보여줍니다.
        if (map) { const c = map.getCenter(); options.location = new window.kakao.maps.LatLng(c.getLat(), c.getLng()); }
        service.keywordSearch(keyword, (data, status) => {
            if (request !== requestRef.current) return;
            const { Status } = window.kakao.maps.services;
            if (status === Status.OK) {
                const results = data.map(place => ({
                    id: place.id,
                    name: place.place_name,
                    address: place.road_address_name || place.address_name,
                    category: place.category_group_name || place.category_name?.split(' > ').at(-1) || '',
                    lat: Number(place.y),
                    lng: Number(place.x),
                }));
                setState({ status: 'done', results, searched: keyword });
                setActiveId(null);
                if (map && results.length) {
                    const bounds = mapBounds();
                    results.forEach(place => bounds.extend(latLng(place.lat, place.lng)));
                    map.setBounds(bounds, 80, 80, 80, 80);
                }
            } else {
                setState({ status: status === Status.ZERO_RESULT ? 'empty' : 'error', results: [], searched: keyword });
            }
        }, options);
    }, [map]);

    const choose = useCallback((place) => {
        setActiveId(place.id);
        if (!map) return;
        if (map.getLevel() > 4) map.setLevel(4);
        map.panTo(latLng(place.lat, place.lng));
    }, [map]);

    const close = useCallback(() => {
        requestRef.current += 1;
        setOpen(false);
        setQuery('');
        setState({ status: 'idle', results: [], searched: '' });
        setActiveId(null);
    }, []);

    return { available: Boolean(window.kakao?.maps?.services), open, setOpen, query, setQuery, ...state, activeId, search, choose, close };
};
