// src/components/NicknameDialog.jsx
// 처음 로그인하면 닉네임을 정하고(필수), 계정 메뉴에서 언제든 바꿀 수 있습니다.
// 커뮤니티에 공개한 코스와 댓글에 이 닉네임이 표시됩니다.
import { useEffect, useState } from 'react';
import { apiErrorMessage, checkNickname, updateNickname } from '../api/courseApi';
import { NICKNAME_PATTERN } from '../utils/share';
import Dialog from './ui/Dialog';
import Button from './ui/Button';

const NICKNAME_MAX = 16;
const CHECK_DELAY_MS = 350;

const NicknameDialog = ({ initial, required, onClose, onSaved, onLogout }) => {
    const [value, setValue] = useState(initial ?? '');
    // 서버에서 확인한 결과: { nickname, available, reason }
    const [check, setCheck] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const trimmed = value.trim();
    const isValid = NICKNAME_PATTERN.test(trimmed);
    const unchanged = Boolean(initial) && trimmed === initial;

    // 입력을 멈추면 다른 사람이 쓰는 닉네임인지 미리 확인합니다.
    useEffect(() => {
        if (!isValid || unchanged) return;
        const timer = window.setTimeout(() => {
            checkNickname(trimmed)
                .then(response => setCheck({ nickname: trimmed, ...response.data }))
                .catch(() => { /* 확인하지 못해도 저장할 때 다시 확인합니다 */ });
        }, CHECK_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [trimmed, isValid, unchanged]);

    const checked = check?.nickname === trimmed ? check : null;
    let hint = '한글·영문·숫자·밑줄(_)로 3~16자, 띄어쓰기 없이 입력하세요.';
    let tone = '';
    if (error) { hint = error; tone = 'error'; }
    else if (trimmed && !isValid) { tone = 'error'; }
    else if (unchanged) { hint = '지금 쓰고 있는 닉네임이에요.'; }
    else if (checked?.available) { hint = '사용할 수 있는 닉네임이에요.'; tone = 'ok'; }
    else if (checked) { hint = checked.reason === 'taken' ? '이미 사용 중인 닉네임이에요.' : hint; tone = 'error'; }

    const canSubmit = isValid && !unchanged && checked?.available !== false && !busy;

    const submit = async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        try {
            const response = await updateNickname(trimmed);
            onSaved(response.data.nickname);
        } catch (err) {
            setError(apiErrorMessage(err, '닉네임을 저장하지 못했어요. 잠시 후 다시 시도하세요.'));
            setBusy(false);
        }
    };

    return (
        <Dialog
            open
            onClose={required || busy ? undefined : onClose}
            dismissible={!required && !busy}
            title={required ? '닉네임을 정해주세요' : '닉네임 변경'}
            description={required
                ? '커뮤니티에 코스를 공개하거나 댓글을 남길 때 이 닉네임이 표시돼요. 나중에 바꿀 수 있어요.'
                : '바꾸면 지금까지 공개한 코스와 댓글에도 새 닉네임이 표시돼요.'}
            size="sm"
            footer={<>
                {required
                    ? <Button variant="ghost" icon="logout" onClick={onLogout} disabled={busy}>로그아웃</Button>
                    : <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>}
                <Button variant="primary" type="submit" form="nickname-form" loading={busy} disabled={!canSubmit}>
                    {required ? '시작하기' : '저장'}
                </Button>
            </>}
        >
            <form id="nickname-form" onSubmit={submit}>
                <label className="form-label" htmlFor="nickname-input">닉네임</label>
                <input
                    id="nickname-input"
                    className="input"
                    style={{ width: '100%' }}
                    value={value}
                    maxLength={NICKNAME_MAX}
                    autoComplete="nickname"
                    placeholder="예: 한강라이더"
                    aria-invalid={tone === 'error' || undefined}
                    aria-describedby="nickname-hint"
                    onChange={(event) => { setValue(event.target.value); setError(null); }}
                    disabled={busy}
                />
                <p id="nickname-hint" className={`form-hint ${tone ? `form-hint--${tone}` : ''}`} aria-live="polite">
                    {hint}
                </p>
            </form>
        </Dialog>
    );
};

export default NicknameDialog;
