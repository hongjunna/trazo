import { useEffect, useRef, useState } from 'react';
import Button from '../components/ui/Button';
import { MAP_LAYERS, setMapLayer, useMapLayer } from './settings';

export default function MapLayerPicker() {
    const layer = useMapLayer();
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const trigger = useRef(null);
    useEffect(() => {
        if (!open) return;
        root.current?.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus();
        const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        const key = event => {
            if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const items = [...root.current.querySelectorAll('[role="menuitemradio"]')];
            const at = items.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            event.preventDefault(); items[next]?.focus();
        };
        document.addEventListener('pointerdown', outside);
        root.current?.addEventListener('keydown', key);
        const node = root.current;
        return () => { document.removeEventListener('pointerdown', outside); node?.removeEventListener('keydown', key); };
    }, [open]);
    return <div className="map-layer-picker" ref={root} onPointerDown={event => event.stopPropagation()}>
        <Button ref={trigger} variant="ghost" icon="layers" iconSize={20} onClick={() => setOpen(value => !value)} aria-haspopup="menu" aria-expanded={open} aria-label="지도 선택" title="지도 선택" />
        {open && <div className="menu map-layer-menu" role="menu" aria-label="지도 종류">
            {MAP_LAYERS.map(item => <button key={item.id} type="button" className="menu__item" role="menuitemradio" aria-checked={layer === item.id} onClick={() => { setMapLayer(item.id); setOpen(false); trigger.current?.focus(); }}>
                <span className="map-layer-check" aria-hidden="true">{layer === item.id ? '✓' : ''}</span>{item.label}
            </button>)}
        </div>}
    </div>;
}
