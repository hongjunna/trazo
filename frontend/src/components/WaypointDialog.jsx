// src/components/WaypointDialog.jsx
// 경로 위 한 지점에 웨이포인트(유형·이름·메모)를 추가하거나 고칩니다.
import { useState } from 'react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { WAYPOINT_TYPES, WAYPOINT_NAME_MAX, WAYPOINT_NOTE_MAX, waypointIconUri } from '../waypoints';

// target: { waypoint?: 고칠 웨이포인트, lat, lng, km, ele }
const WaypointDialog = ({ target, onSubmit, onDelete, onClose }) => {
    const editing = Boolean(target.waypoint);
    const [type, setType] = useState(target.waypoint?.type ?? 'generic');
    const [name, setName] = useState(target.waypoint?.name ?? '');
    const [note, setNote] = useState(target.waypoint?.note ?? '');

    const submit = (event) => {
        event.preventDefault();
        onSubmit({ type, name: name.trim().slice(0, WAYPOINT_NAME_MAX), note: note.trim().slice(0, WAYPOINT_NOTE_MAX) });
    };

    const place = Number.isFinite(target.km) ? `출발점에서 ${target.km.toFixed(2)}km · 고도 ${Math.round(target.ele ?? 0)}m` : undefined;

    return (
        <Dialog
            open
            onClose={onClose}
            size="sm"
            title={editing ? '웨이포인트 편집' : '웨이포인트 추가'}
            description={place}
            footer={<>
                {editing && <Button variant="danger-ghost" icon="trash" onClick={onDelete} style={{ marginRight: 'auto' }}>삭제</Button>}
                <Button variant="secondary" onClick={onClose}>취소</Button>
                <Button variant="primary" type="submit" form="waypoint-form">확인</Button>
            </>}
        >
            <form id="waypoint-form" className="waypoint-form" onSubmit={submit}>
                <div>
                    <label className="form-label" htmlFor="waypoint-type">유형</label>
                    <div className="waypoint-type">
                        <img src={waypointIconUri(type, 32)} alt="" width={32} height={32} />
                        <select id="waypoint-type" className="select" value={type} onChange={(event) => setType(event.target.value)}>
                            {WAYPOINT_TYPES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="form-label" htmlFor="waypoint-name">이름</label>
                    <input
                        id="waypoint-name"
                        className="input"
                        style={{ width: '100%' }}
                        value={name}
                        maxLength={WAYPOINT_NAME_MAX}
                        placeholder={WAYPOINT_TYPES.find(option => option.id === type)?.label}
                        onChange={(event) => setName(event.target.value)}
                    />
                    <p className="form-hint">기기에 따라 이름 앞부분만 보일 수 있어요. (TCX는 10자)</p>
                </div>
                <div>
                    <label className="form-label" htmlFor="waypoint-note">메모</label>
                    <input
                        id="waypoint-note"
                        className="input"
                        style={{ width: '100%' }}
                        value={note}
                        maxLength={WAYPOINT_NOTE_MAX}
                        placeholder="예: 편의점 앞, 화장실 있음"
                        onChange={(event) => setNote(event.target.value)}
                    />
                </div>
            </form>
        </Dialog>
    );
};

export default WaypointDialog;
