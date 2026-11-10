// src/components/PlaceSearch.jsx
// 코스 생성 지도 오른쪽 위의 장소 검색 (카카오 지도 키워드 검색).
// 결과는 목록과 지도 위 번호 핀으로 보여주고, 고르면 그 위치로 옮깁니다. 닫으면 결과 핀도 함께 지웁니다.
// 상태는 hooks/usePlaceSearch.js
import { useEffect, useRef, useState } from 'react';
import { CustomOverlayMap } from 'react-kakao-maps-sdk';
import Button from './ui/Button';
import Icon from './ui/Icon';

// 지도 안에 그리는 검색 결과 핀
export const PlaceSearchMarkers = ({ search }) => search.results.map((place, index) => {
    const active = place.id === search.activeId;
    return (
        <CustomOverlayMap key={place.id} position={place} zIndex={active ? 12 : 9} yAnchor={1} clickable>
            <button
                type="button"
                className={`place-pin ${active ? 'is-active' : ''}`}
                onClick={(event) => { event.stopPropagation(); search.choose(place); }}
                title={place.name}
            >
                <span className="place-pin__num">{index + 1}</span>
                {active && <span className="place-pin__label">{place.name}</span>}
            </button>
        </CustomOverlayMap>
    );
});

// 지도 오른쪽 위의 검색 버튼·검색창
export const PlaceSearchPanel = ({ search }) => {
    const inputRef = useRef(null);
    const [listOpen, setListOpen] = useState(true);
    const { open, setOpen, close } = search;

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, close]);

    if (!search.available) return null;
    if (!open) {
        return (
            <div className="place-search place-search--closed">
                <Button variant="secondary" icon="search" iconSize={20} onClick={() => setOpen(true)} aria-label="장소 검색" title="장소 검색" />
            </div>
        );
    }

    const submit = (event) => {
        event.preventDefault();
        setListOpen(true);
        search.search(search.query);
    };

    const pick = (place) => {
        search.choose(place);
        // 목록이 지도와 오른쪽 도구 버튼을 가리므로 고르면 목록을 접습니다 (결과 핀은 그대로).
        setListOpen(false);
    };

    let body = null;
    if (search.status === 'loading') body = <p className="place-search__note"><Icon name="loader" size={14} className="spin" />찾는 중…</p>;
    else if (search.status === 'empty') body = <p className="place-search__note">'{search.searched}' 검색 결과가 없어요.</p>;
    else if (search.status === 'error') body = <p className="place-search__note">검색하지 못했어요. 잠시 후 다시 시도하세요.</p>;
    else if (search.results.length) {
        body = listOpen ? (
            <ul className="place-search__list">
                {search.results.map((place, index) => (
                    <li key={place.id}>
                        <button type="button" className={`place-search__item ${place.id === search.activeId ? 'is-active' : ''}`} onClick={() => pick(place)}>
                            <span className="place-search__num">{index + 1}</span>
                            <span className="place-search__text">
                                <strong>{place.name}</strong>
                                <span>{[place.category, place.address].filter(Boolean).join(' · ')}</span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        ) : (
            <button type="button" className="place-search__more" onClick={() => setListOpen(true)}>
                <Icon name="chevron-down" size={14} />검색 결과 {search.results.length}개 보기
            </button>
        );
    }

    return (
        <div className="place-search" role="search">
            <form className="place-search__bar" onSubmit={submit}>
                <Icon name="search" size={18} />
                <input
                    ref={inputRef}
                    type="search"
                    enterKeyHint="search"
                    value={search.query}
                    onChange={(event) => search.setQuery(event.target.value)}
                    placeholder="장소·주소 검색 (예: 반포한강공원)"
                    aria-label="장소 검색"
                />
                <button type="button" className="place-search__close" onClick={close} aria-label="검색 닫기" title="검색 닫기 (결과 핀도 지워요)">
                    <Icon name="x" size={18} />
                </button>
            </form>
            {body}
        </div>
    );
};
