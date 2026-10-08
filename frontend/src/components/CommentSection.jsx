// src/components/CommentSection.jsx
// 전체 공개 코스의 댓글: 목록, 쓰기, 내 댓글 수정·삭제 (코스 주인은 다른 사람 댓글도 삭제 가능)
import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, createComment, deleteComment, getComments, updateComment } from '../api/courseApi';
import { timeAgo } from '../utils/share';
import Button from './ui/Button';
import Icon from './ui/Icon';
import MenuButton from './ui/MenuButton';
import { useFeedback } from './ui/feedbackContext';

const COMMENT_MAX = 500;

const CommentEditor = ({ initial = '', placeholder, submitLabel, onSubmit, onCancel, autoFocus = false }) => {
    const [body, setBody] = useState(initial);
    const [busy, setBusy] = useState(false);
    const trimmed = body.trim();

    const submit = async (event) => {
        event.preventDefault();
        if (!trimmed || busy) return;
        setBusy(true);
        const ok = await onSubmit(trimmed);
        setBusy(false);
        if (ok && !onCancel) setBody('');
    };

    return (
        <form className="comment-form" onSubmit={submit}>
            <textarea
                className="input textarea"
                rows={2}
                value={body}
                maxLength={COMMENT_MAX}
                placeholder={placeholder}
                aria-label={placeholder}
                autoFocus={autoFocus}
                disabled={busy}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
                    if (event.key === 'Escape' && onCancel) { event.stopPropagation(); onCancel(); }
                }}
            />
            <div className="comment-form__bar">
                <span className="form-hint">{trimmed.length}/{COMMENT_MAX}</span>
                {onCancel && <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>취소</Button>}
                <Button size="sm" variant="primary" type="submit" icon={onCancel ? undefined : 'send'} loading={busy} disabled={!trimmed}>{submitLabel}</Button>
            </div>
        </form>
    );
};

const Comment = ({ comment, onEdit, onDelete }) => {
    const [editing, setEditing] = useState(false);
    const items = [
        comment.is_mine && { label: '수정', icon: 'pencil', onSelect: () => setEditing(true) },
        comment.can_delete && { label: '삭제', icon: 'trash', danger: true, onSelect: () => onDelete(comment) },
    ].filter(Boolean);

    return (
        <li className="comment">
            <div className="comment__head">
                <span className="comment__author">{comment.nickname ?? '알 수 없음'}</span>
                {comment.is_mine && <span className="muted-tag">나</span>}
                <span className="comment__time" title={new Date(comment.created_at).toLocaleString('ko-KR')}>
                    {timeAgo(comment.created_at)}{comment.updated_at && ' · 수정됨'}
                </span>
                {items.length > 0 && !editing && <MenuButton label="댓글 메뉴" items={items} />}
            </div>
            {editing ? (
                <CommentEditor
                    initial={comment.body}
                    placeholder="댓글 수정"
                    submitLabel="저장"
                    autoFocus
                    onSubmit={async (body) => {
                        const ok = await onEdit(comment, body);
                        if (ok) setEditing(false);
                        return ok;
                    }}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <p className="comment__body">{comment.body}</p>
            )}
        </li>
    );
};

// onCountChange: 댓글 수가 바뀌면 코스 정보(댓글 수)를 함께 고칩니다.
const CommentSection = ({ token, canWrite, onRequireMember, onCountChange }) => {
    const { toast, confirm } = useFeedback();
    const [comments, setComments] = useState(null);
    const [error, setError] = useState(false);

    const load = useCallback(() => getComments(token)
        .then(response => { setComments(response.data); setError(false); })
        .catch(() => setError(true)), [token]);

    // canWrite가 바뀌면(로그인·로그아웃) 내 댓글 표시가 달라지므로 다시 불러옵니다.
    useEffect(() => { load(); }, [load, canWrite]);

    const handleCreate = async (body) => {
        try {
            const { data } = await createComment(token, body);
            setComments(list => [...(list || []), data]);
            onCountChange(1);
            return true;
        } catch (err) {
            toast(apiErrorMessage(err, '댓글을 남기지 못했어요. 잠시 후 다시 시도하세요.'), { tone: 'error' });
            return false;
        }
    };

    const handleEdit = async (comment, body) => {
        try {
            const { data } = await updateComment(comment.id, body);
            setComments(list => list.map(item => item.id === data.id ? data : item));
            return true;
        } catch (err) {
            toast(apiErrorMessage(err, '댓글을 고치지 못했어요. 잠시 후 다시 시도하세요.'), { tone: 'error' });
            return false;
        }
    };

    const handleDelete = async (comment) => {
        const ok = await confirm({ title: '댓글을 삭제할까요?', message: '삭제한 댓글은 되돌릴 수 없어요.', confirmLabel: '삭제', tone: 'danger' });
        if (!ok) return;
        try {
            await deleteComment(comment.id);
            setComments(list => list.filter(item => item.id !== comment.id));
            onCountChange(-1);
        } catch (err) {
            toast(apiErrorMessage(err, '댓글을 삭제하지 못했어요. 잠시 후 다시 시도하세요.'), { tone: 'error' });
        }
    };

    return (
        <section className="comments" aria-label="댓글">
            <h3 className="comments__title"><Icon name="message" size={16} />댓글 {comments ? comments.length : ''}</h3>
            {canWrite ? (
                <CommentEditor placeholder="이 코스에 대한 이야기를 남겨보세요" submitLabel="등록" onSubmit={handleCreate} />
            ) : (
                <button type="button" className="comment-login" onClick={onRequireMember}>
                    <Icon name="user" size={16} />로그인하고 댓글 남기기
                </button>
            )}
            {error && (
                <div className="comments__empty">
                    댓글을 불러오지 못했어요. <button type="button" className="link-btn" onClick={load}>다시 시도</button>
                </div>
            )}
            {!error && comments?.length === 0 && <div className="comments__empty">첫 댓글을 남겨보세요.</div>}
            {comments?.length > 0 && (
                <ul className="comments__list">
                    {comments.map(comment => (
                        <Comment key={comment.id} comment={comment} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                </ul>
            )}
        </section>
    );
};

export default CommentSection;
