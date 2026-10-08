// src/components/ui/PromptDialog.jsx
// 이름 하나를 입력받는 작은 대화상자 (새 폴더, 폴더 이름 바꾸기)
// onSubmit은 성공하면 true, 실패하면 화면에 보여줄 안내 문구를 돌려줍니다.
import { useState } from 'react';
import Dialog from './Dialog';
import Button from './Button';

const PromptDialog = ({ title, description, label, initialValue = '', placeholder, maxLength = 30, confirmLabel = '확인', onSubmit, onClose }) => {
    const [value, setValue] = useState(initialValue);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const trimmed = value.trim();

    const submit = async (event) => {
        event.preventDefault();
        if (!trimmed || busy) return;
        setBusy(true);
        const result = await onSubmit(trimmed);
        setBusy(false);
        if (result !== true) setError(result);
    };

    return (
        <Dialog
            open
            onClose={busy ? undefined : onClose}
            dismissible={!busy}
            title={title}
            description={description}
            size="sm"
            footer={<>
                <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
                <Button variant="primary" type="submit" form="prompt-form" loading={busy} disabled={!trimmed}>{confirmLabel}</Button>
            </>}
        >
            <form id="prompt-form" onSubmit={submit}>
                <label className="form-label" htmlFor="prompt-input">{label}</label>
                <input
                    id="prompt-input"
                    className="input"
                    style={{ width: '100%' }}
                    value={value}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(event) => { setValue(event.target.value); setError(null); }}
                    onFocus={(event) => event.target.select()}
                    disabled={busy}
                />
                <p className={`form-hint ${error ? 'form-hint--error' : ''}`}>{error || `${trimmed.length}/${maxLength}자`}</p>
            </form>
        </Dialog>
    );
};

export default PromptDialog;
