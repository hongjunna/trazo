import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map as KakaoMap, MapMarker as KakaoMarker, Polyline as KakaoPolyline, CustomOverlayMap as KakaoOverlay } from 'react-kakao-maps-sdk';
import 'leaflet/dist/leaflet.css';
import './maps.css';
import { coordinates, setMapLayer, useMapLayer } from './settings';
import { createExternalMap, createExternalOverlay } from './external';
import MapLayerPicker from './MapLayerPicker';

const Context = createContext(null);

export function Map({ children, center, level = 5, style, className, showLayerPicker = false, ...events }) {
    const layer = useMapLayer();
    const isKakao = layer.startsWith('kakao');
    const container = useRef(null);
    const [view, setView] = useState({ center, level });
    const viewRef = useRef(view);
    useLayoutEffect(() => { viewRef.current = view; }, [view]);
    const callbacks = useRef(events);
    useLayoutEffect(() => { callbacks.current = events; });
    const [loaded, setLoaded] = useState(null);
    const map = loaded?.layer === layer && !loaded.map.destroyed ? loaded.map : null;
    const [error, setError] = useState(null);
    const [kakaoReady, setKakaoReady] = useState(Boolean(window.kakao?.maps?.Map));
    useEffect(() => {
        if (!isKakao || kakaoReady) return;
        const check = () => {
            if (window.kakao?.maps?.load) window.kakao.maps.load(() => setKakaoReady(true));
        };
        const timer = window.setInterval(check, 250);
        check();
        return () => window.clearInterval(timer);
    }, [isKakao, kakaoReady]);
    useEffect(() => {
        const failed = () => { if (layer.startsWith('google')) setError({ layer, message: '구글 지도 인증에 실패했어요. 다른 지도를 선택해주세요.' }); };
        window.addEventListener('trazo-google-auth-error', failed);
        return () => window.removeEventListener('trazo-google-auth-error', failed);
    }, [layer]);
    const remember = target => {
        setView({ center: coordinates(target.getCenter()), level: target.getLevel() });
        callbacks.current.onIdle?.(target);
    };
    useEffect(() => {
        if (isKakao) return;
        let cancelled = false;
        let instance;
        const emit = (name, target, event) => {
            if (cancelled) return;
            if (name === 'onIdle') setView({ center: coordinates(target.getCenter()), level: target.getLevel() });
            callbacks.current[name]?.(target, event);
        };
        createExternalMap(container.current, layer, viewRef.current, emit, () => cancelled).then(value => {
            if (cancelled) { value.destroy(); return; }
            instance = value;
            setLoaded({ layer, map: value });
            callbacks.current.onCreate?.(value);
            // Leaflet's first move event fires before event registration.
            if (value.provider === 'osm') requestAnimationFrame(() => { if (!cancelled) emit('onIdle', value); });
        }).catch(reason => { if (!cancelled) setError({ layer, message: reason.message }); });
        return () => {
            cancelled = true;
            if (instance) { viewRef.current = { center: coordinates(instance.getCenter()), level: instance.getLevel() }; callbacks.current.onCreate?.(null); instance.destroy(); }
        };
    }, [isKakao, layer]);
    const nativeMap = target => {
        target.setMapTypeId(layer.endsWith('satellite') ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP);
        callbacks.current.onCreate?.(target);
    };
    return <div className={`trazo-map ${className || ''}`} style={style}>
        {isKakao && !kakaoReady ? <div className="map-provider-error" role="status"><p>카카오 지도를 불러오는 중이에요.</p><button type="button" onClick={() => setMapLayer('osm')}>OpenStreetMap으로 보기</button></div> : isKakao ? <KakaoMap key={layer} center={view.center} level={view.level} style={{ width: '100%', height: '100%' }} {...events} onCreate={nativeMap} onIdle={remember}>
            <Context.Provider value={null}>{children}</Context.Provider>
        </KakaoMap> : <>
            <div ref={container} className="trazo-map__surface" key={layer} />
            {map?.provider === (layer.startsWith('google') ? 'google' : 'osm') && <Context.Provider value={map}>{children}</Context.Provider>}
            {error?.layer === layer && <div className="map-provider-error" role="alert"><p>{error.message}</p><button type="button" onClick={() => { setError(null); setMapLayer('osm'); }}>OpenStreetMap으로 보기</button><button type="button" onClick={() => setMapLayer('kakao')}>카카오 지도로 보기</button></div>}
        </>}
        {showLayerPicker && <div className="map-layer-floating"><MapLayerPicker /></div>}
    </div>;
}

export function CustomOverlayMap({ children, position, zIndex = 0, xAnchor = 0.5, yAnchor = 0.5, clickable = false }) {
    const map = useContext(Context);
    const [node] = useState(() => document.createElement('div'));
    const overlay = useRef(null);
    const initialPosition = useRef(position);
    useEffect(() => {
        if (!map) return;
        overlay.current = createExternalOverlay(map, node, { position: initialPosition.current, zIndex, xAnchor, yAnchor, clickable });
        return () => { overlay.current?.remove(); overlay.current = null; };
    }, [map, node, zIndex, xAnchor, yAnchor, clickable]); // position updates without recreating the overlay
    useEffect(() => { overlay.current?.setPosition(position); }, [position, map, zIndex, xAnchor, yAnchor, clickable]);
    return map ? createPortal(children, node) : <KakaoOverlay position={position} zIndex={zIndex} xAnchor={xAnchor} yAnchor={yAnchor} clickable={clickable}>{children}</KakaoOverlay>;
}

export function MapMarker({ position, image, zIndex, onClick }) {
    const map = useContext(Context);
    if (!map) return <KakaoMarker position={position} image={image} zIndex={zIndex} onClick={onClick} />;
    const size = image?.size ?? { width: 24, height: 24 };
    const offset = image?.options?.offset ?? { x: size.width / 2, y: size.height };
    return <CustomOverlayMap position={position} zIndex={zIndex} xAnchor={offset.x / size.width} yAnchor={offset.y / size.height} clickable={Boolean(onClick)}>
        <img src={image?.src} width={size.width} height={size.height} alt="" draggable={false} onClick={onClick} />
    </CustomOverlayMap>;
}

export function Polyline(props) {
    const map = useContext(Context);
    const callbacks = useRef(props); useLayoutEffect(() => { callbacks.current = props; });
    const { path, strokeColor, strokeWeight, strokeOpacity, strokeStyle, zIndex } = props;
    const clickable = Boolean(props.onClick || props.onMouseover || props.onMouseout);
    useEffect(() => {
        if (!map || !path.length) return;
        const { raw, engine, provider } = map;
        const points = path.map(coordinates);
        const dashed = strokeStyle && strokeStyle !== 'solid';
        const line = provider === 'osm'
            ? engine.polyline(points.map(p => [p.lat, p.lng]), { color: strokeColor, weight: strokeWeight, opacity: strokeOpacity, dashArray: dashed ? '8 6' : undefined, interactive: clickable, bubblingMouseEvents: !clickable }).addTo(raw)
            : new engine.Polyline({ map: raw, path: points, strokeColor, strokeWeight, strokeOpacity: dashed ? 0 : strokeOpacity, zIndex, clickable, icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity, scale: 2 }, offset: '0', repeat: '12px' }] : undefined });
        const listeners = [];
        for (const [event, name] of [['click', 'onClick'], ['mouseover', 'onMouseover'], ['mouseout', 'onMouseout']]) {
            const callback = e => callbacks.current[name]?.(line, e);
            if (provider === 'osm') line.on(event, callback);
            else listeners.push(line.addListener(event, callback));
        }
        return () => { listeners.forEach(listener => listener.remove()); if (provider === 'osm') line.remove(); else line.setMap(null); };
    }, [map, path, strokeColor, strokeWeight, strokeOpacity, strokeStyle, zIndex, clickable]);
    return map ? null : <KakaoPolyline {...props} />;
}
