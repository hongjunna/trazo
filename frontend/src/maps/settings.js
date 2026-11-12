import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from '../utils/storage';

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';
export const OSM_TILE_URL = import.meta.env.VITE_OSM_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = import.meta.env.VITE_OSM_ATTRIBUTION?.trim() || '© OpenStreetMap contributors';
export const MAP_LAYERS = [
    { id: 'kakao', label: '카카오 일반 지도' },
    { id: 'kakao-satellite', label: '카카오 위성 지도' },
    { id: 'osm', label: 'OpenStreetMap' },
    ...(GOOGLE_MAPS_KEY ? [
        { id: 'google', label: '구글 일반 지도' },
        { id: 'google-satellite', label: '구글 위성 지도' },
    ] : []),
];
const EVENT = 'trazo-map-layer';
const snapshot = () => {
    const saved = readStored('trazo:mapLayer', readStored('trazo:satellite', false) ? 'kakao-satellite' : 'kakao');
    return MAP_LAYERS.some(layer => layer.id === saved && !layer.disabled) ? saved : 'kakao';
};
const subscribe = (notify) => {
    window.addEventListener(EVENT, notify);
    window.addEventListener('storage', notify);
    return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', notify); };
};
export const setMapLayer = (id) => {
    if (!MAP_LAYERS.some(layer => layer.id === id && !layer.disabled)) return;
    writeStored('trazo:mapLayer', id);
    window.dispatchEvent(new Event(EVENT));
};
export const useMapLayer = () => useSyncExternalStore(subscribe, snapshot, () => 'kakao');

// 기존 카카오 지도의 줌 단계와 위경도 인터페이스를 모든 지도에서 공유합니다.
export const coordinates = (p) => ({ lat: typeof p.getLat === 'function' ? p.getLat() : typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.getLng === 'function' ? p.getLng() : typeof p.lng === 'function' ? p.lng() : p.lng });
export const latLng = (lat, lng) => window.kakao?.maps?.LatLng ? new window.kakao.maps.LatLng(lat, lng) : { getLat: () => lat, getLng: () => lng };
export const mapPoint = (x, y) => window.kakao?.maps?.Point ? new window.kakao.maps.Point(x, y) : { x, y };
export const mapBounds = () => {
    if (window.kakao?.maps?.LatLngBounds) return new window.kakao.maps.LatLngBounds();
    const points = [];
    return { extend: p => points.push(coordinates(p)), getSouthWest: () => latLng(Math.min(...points.map(p => p.lat)), Math.min(...points.map(p => p.lng))), getNorthEast: () => latLng(Math.max(...points.map(p => p.lat)), Math.max(...points.map(p => p.lng))) };
};
