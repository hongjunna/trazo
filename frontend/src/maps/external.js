import { GOOGLE_MAPS_KEY, OSM_ATTRIBUTION, OSM_TILE_URL, coordinates, latLng } from './settings';

let googlePromise;
export function loadGoogle() {
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('구글 지도 키가 설정되지 않았습니다.'));
    if (!window.trazoGoogleAuthHandler) {
        const previous = window.gm_authFailure;
        window.gm_authFailure = () => { window.dispatchEvent(new Event('trazo-google-auth-error')); previous?.(); };
        window.trazoGoogleAuthHandler = true;
    }
    if (!googlePromise) googlePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => { script.remove(); reject(new Error('구글 지도를 불러오지 못했어요.')); }, 20000);
        window.trazoGoogleReady = () => { clearTimeout(timer); resolve(window.google.maps); delete window.trazoGoogleReady; };
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&loading=async&callback=trazoGoogleReady&v=quarterly&language=ko`;
        script.async = true;
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('구글 지도를 불러오지 못했어요.')); };
        document.head.appendChild(script);
    }).catch(error => { googlePromise = null; throw error; });
    return googlePromise;
}

export const levelToZoom = level => Math.max(0, Math.min(19, 20 - level));
export const zoomToLevel = zoom => 20 - zoom;
const boundsCoordinates = bounds => [coordinates(bounds.getSouthWest()), coordinates(bounds.getNorthEast())];
const wrapBounds = (sw, ne) => ({ getSouthWest: () => latLng(sw.lat, sw.lng), getNorthEast: () => latLng(ne.lat, ne.lng) });

export async function createExternalMap(node, layer, view, emit, cancelled = () => false) {
    const provider = layer.startsWith('google') ? 'google' : 'osm';
    const engine = provider === 'osm' ? await import('leaflet') : await loadGoogle();
    if (cancelled()) throw new Error('지도 전환 취소');
    const raw = provider === 'osm'
        ? engine.map(node, { center: [view.center.lat, view.center.lng], zoom: levelToZoom(view.level), zoomControl: false, attributionControl: true })
        : new engine.Map(node, { center: view.center, zoom: levelToZoom(view.level), mapTypeId: layer.endsWith('satellite') ? 'hybrid' : 'roadmap', disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', keyboardShortcuts: true });
    let projectionOverlay;
    if (provider === 'osm') {
        // Attribution comes from deployment configuration as text, never as executable HTML.
        const attribution = document.createElement('span'); attribution.textContent = OSM_ATTRIBUTION;
        const source = document.createElement('a'); source.href = 'https://www.openstreetmap.org/copyright'; source.textContent = 'OpenStreetMap'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        engine.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: `${attribution.innerHTML} · ${source.outerHTML}` }).addTo(raw);
        raw.attributionControl.setPrefix(false);
    } else {
        projectionOverlay = new engine.OverlayView();
        projectionOverlay.onAdd = () => {};
        projectionOverlay.draw = () => {};
        projectionOverlay.onRemove = () => {};
        projectionOverlay.setMap(raw);
    }
    const api = {
        provider, raw, engine,
        getNode: () => node,
        getCenter: () => { const p = coordinates(raw.getCenter()); return latLng(p.lat, p.lng); },
        getLevel: () => zoomToLevel(raw.getZoom()),
        setLevel: value => raw.setZoom(levelToZoom(value)),
        panTo: value => { const p = coordinates(value); raw.panTo(provider === 'osm' ? [p.lat, p.lng] : p); },
        getBounds: () => { const b = raw.getBounds(); return wrapBounds(coordinates(b.getSouthWest()), coordinates(b.getNorthEast())); },
        setBounds: (value, top = 24, right = 24, bottom = 24, left = 24) => {
            const [sw, ne] = boundsCoordinates(value);
            if (provider === 'osm') raw.fitBounds([[sw.lat, sw.lng], [ne.lat, ne.lng]], { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom: 18, animate: false });
            else raw.fitBounds({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, { top, right, bottom, left });
        },
        relayout: () => provider === 'osm' ? raw.invalidateSize({ pan: false }) : engine.event.trigger(raw, 'resize'),
        setDraggable: value => provider === 'osm' ? raw.dragging[value ? 'enable' : 'disable']() : raw.setOptions({ draggable: value }),
        setMapTypeId: () => {}, removeOverlayMapTypeId: () => {}, addOverlayMapTypeId: () => {},
        getProjection: () => ({
            containerPointFromCoords: value => {
                const p = coordinates(value);
                if (provider === 'osm') return raw.latLngToContainerPoint([p.lat, p.lng]);
                const point = projectionOverlay.getProjection()?.fromLatLngToContainerPixel(new engine.LatLng(p.lat, p.lng));
                return point ?? { x: -10000, y: -10000 };
            },
            coordsFromContainerPoint: p => {
                const value = provider === 'osm' ? raw.containerPointToLatLng([p.x, p.y]) : projectionOverlay.getProjection()?.fromContainerPixelToLatLng(new engine.Point(p.x, p.y));
                const result = coordinates(value ?? raw.getCenter()); return latLng(result.lat, result.lng);
            },
        }),
        destroy: () => { if (provider === 'osm') raw.remove(); else { projectionOverlay.setMap(null); engine.event.clearInstanceListeners(raw); node.replaceChildren(); } },
    };
    const listeners = [];
    const on = (name, callback) => provider === 'osm' ? raw.on(name, callback) : listeners.push(raw.addListener(name, callback));
    for (const [native, event] of provider === 'osm' ? [['moveend', 'onIdle'], ['zoomstart', 'onZoomStart'], ['dragstart', 'onDragStart']] : [['idle', 'onIdle'], ['zoom_changed', 'onZoomStart'], ['dragstart', 'onDragStart']]) on(native, () => emit(event, api));
    for (const [native, event] of [['click', 'onClick'], [provider === 'osm' ? 'contextmenu' : 'rightclick', 'onRightClick']]) on(native, value => {
        const p = coordinates(value.latlng ?? value.latLng);
        const point = api.getProjection().containerPointFromCoords(p);
        emit(event, api, { latLng: latLng(p.lat, p.lng), point });
    });
    const destroy = api.destroy;
    api.destroy = () => { api.destroyed = true; listeners.forEach(listener => listener.remove()); destroy(); };
    return api;
}

export function createExternalOverlay(map, node, { position, zIndex = 0, xAnchor = 0.5, yAnchor = 0.5, clickable = false }) {
    const { provider, raw, engine } = map;
    const p = coordinates(position);
    node.style.pointerEvents = clickable ? 'auto' : 'none';
    if (provider === 'osm') {
        const content = document.createElement('div'); content.appendChild(node);
        node.style.transform = `translate(${-100 * xAnchor}%, ${-100 * yAnchor}%)`;
        node.style.width = 'max-content';
        const marker = engine.marker([p.lat, p.lng], { icon: engine.divIcon({ html: content, className: 'trazo-overlay', iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: clickable, zIndexOffset: zIndex * 1000, keyboard: false, bubblingMouseEvents: !clickable }).addTo(raw);
        // Leaflet's marker pane has pointer-events:none; only intentional controls receive events.
        if (clickable) engine.DomEvent.disableClickPropagation(content);
        return { setPosition: value => { const q = coordinates(value); marker.setLatLng([q.lat, q.lng]); }, remove: () => marker.remove() };
    }
    let point = new engine.LatLng(p.lat, p.lng);
    const overlay = new engine.OverlayView();
    node.style.position = 'absolute'; node.style.zIndex = zIndex; node.style.width = 'max-content';
    overlay.onAdd = () => { overlay.getPanes()[clickable ? 'overlayMouseTarget' : 'overlayLayer'].appendChild(node); if (clickable) engine.OverlayView.preventMapHitsAndGesturesFrom(node); };
    overlay.draw = () => { const at = overlay.getProjection()?.fromLatLngToDivPixel(point); if (at) { node.style.left = `${at.x}px`; node.style.top = `${at.y}px`; node.style.transform = `translate(${-100 * xAnchor}%, ${-100 * yAnchor}%)`; } };
    overlay.onRemove = () => node.remove();
    overlay.setMap(raw);
    return { setPosition: value => { const q = coordinates(value); point = new engine.LatLng(q.lat, q.lng); overlay.draw(); }, remove: () => overlay.setMap(null) };
}

export function createHoverOverlay(map, content) {
    if (!map.provider) {
        const marker = new window.kakao.maps.CustomOverlay({ position: map.getCenter(), content, zIndex: 100, clickable: false });
        marker.setMap(map); marker.setVisible(false); return marker;
    }
    const marker = createExternalOverlay(map, content, { position: map.getCenter(), zIndex: 100, xAnchor: 0.5, yAnchor: 0.5 });
    content.style.display = 'none';
    return { setPosition: marker.setPosition, setVisible: value => { content.style.display = value ? '' : 'none'; }, setMap: () => marker.remove() };
}
