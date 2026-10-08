// src/components/FolderSelect.jsx
// 코스를 넣을 폴더 고르기. 목록 맨 아래에서 바로 새 폴더를 만들 수 있습니다.
// FolderPickerDialog: 폴더 하나를 골라 확인하는 대화상자 (공유받은 코스 담기, 폴더 이동)
import { useEffect, useId, useRef, useState } from 'react';
import { apiErrorMessage, createFolder, getFolders } from '../api/courseApi';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import PromptDialog from './ui/PromptDialog';

const NEW_FOLDER = '__new__';

export const FolderSelect = ({ value, onChange, onCreated, disabled = false, id }) => {
    const [folders, setFolders] = useState(null);
    const [creating, setCreating] = useState(false);
    const initialValue = useRef(value);
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; });

    useEffect(() => {
        getFolders()
            .then(response => {
                setFolders(response.data);
                // 지난번에 쓴 폴더가 그사이 지워졌으면 '폴더 없음'으로 돌립니다.
                const selected = initialValue.current;
                if (selected != null && !response.data.some(folder => folder.id === selected)) onChangeRef.current(null);
            })
            .catch(() => setFolders([]));
    }, []);

    const handleCreate = async (name) => {
        try {
            const { data } = await createFolder(name);
            setFolders(list => [...(list || []), data]);
            onChange(data.id);
            onCreated?.(data);
            setCreating(false);
            return true;
        } catch (err) {
            return apiErrorMessage(err, '폴더를 만들지 못했어요. 잠시 후 다시 시도하세요.');
        }
    };

    const known = folders?.some(folder => folder.id === value);
    return (
        <>
            <select
                id={id}
                className="select"
                style={{ width: '100%' }}
                value={known ? String(value) : ''}
                disabled={disabled || !folders}
                onChange={(event) => {
                    const next = event.target.value;
                    if (next === NEW_FOLDER) setCreating(true);
                    else onChange(next ? Number(next) : null);
                }}
            >
                <option value="">{folders ? '폴더 없음' : '폴더 불러오는 중…'}</option>
                {folders?.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                <option value={NEW_FOLDER}>+ 새 폴더 만들기…</option>
            </select>
            {creating && (
                <PromptDialog
                    title="새 폴더"
                    label="폴더 이름"
                    placeholder="예: 주말 라이딩"
                    confirmLabel="만들기"
                    onSubmit={handleCreate}
                    onClose={() => setCreating(false)}
                />
            )}
        </>
    );
};

export const FolderPickerDialog = ({ title, description, confirmLabel, initialFolderId = null, onSubmit, onClose, onCreated }) => {
    const [folderId, setFolderId] = useState(initialFolderId);
    const [busy, setBusy] = useState(false);
    const selectId = useId();

    // onSubmit이 성공하면 부모가 대화상자를 닫습니다.
    const submit = async () => {
        setBusy(true);
        const ok = await onSubmit(folderId);
        if (!ok) setBusy(false);
    };

    return (
        <Dialog
            open
            onClose={busy ? undefined : onClose}
            dismissible={!busy}
            title={title}
            description={description}
            size="sm"
            initialFocus="dialog"
            footer={<>
                <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
                <Button variant="primary" onClick={submit} loading={busy}>{confirmLabel}</Button>
            </>}
        >
            <label className="form-label" htmlFor={selectId}>폴더</label>
            <FolderSelect id={selectId} value={folderId} onChange={setFolderId} onCreated={onCreated} disabled={busy} />
        </Dialog>
    );
};
