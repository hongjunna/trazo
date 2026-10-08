// src/components/ShareDialog.jsx
// 공개 범위(비공개·링크 공유·전체 공개)를 바꾸고 공유 링크를 복사합니다.
import { useState } from 'react';
import { apiErrorMessage, updateCourse } from '../api/courseApi';
import { VISIBILITY, VISIBILITY_IDS, copyText, shareUrl, visibilityOf } from '../utils/share';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';
import { useFeedback } from './ui/feedbackContext';

const VISIBILITY_OPTIONS = VISIBILITY_IDS.map(id => ({ value: id, label: VISIBILITY[id].label, icon: VISIBILITY[id].icon }));

export const VisibilityPicker = ({ value, onChange, disabled = false }) => (
    <div className="visibility-picker">
        <SegmentedControl label="공개 범위" value={value} onChange={onChange} disabled={disabled} options={VISIBILITY_OPTIONS} />
        <p className="form-hint">{VISIBILITY[value].desc}</p>
    </div>
);

export const ShareLink = ({ token }) => {
    const { toast } = useFeedback();
    const url = shareUrl(token);
    const copy = async () => {
        const ok = await copyText(url);
        toast(ok ? '링크를 복사했어요.' : '복사하지 못했어요. 주소를 길게 눌러 직접 복사하세요.', { tone: ok ? 'success' : 'error' });
    };
    const share = () => navigator.share({ url }).catch(() => { /* 공유 창을 닫은 경우 */ });

    return (
        <div className="share-link">
            <input className="input" readOnly value={url} aria-label="공유 링크" onFocus={(event) => event.target.select()} />
            <Button variant="secondary" icon="copy" onClick={copy}>복사</Button>
            {typeof navigator.share === 'function' && (
                <Button variant="ghost" icon="share" onClick={share} aria-label="다른 앱으로 공유" title="다른 앱으로 공유" />
            )}
        </div>
    );
};

// course: 서버의 코스 정보. 바뀐 코스는 onUpdated로 알려주고, 부모가 새 course를 다시 넘겨줍니다.
const ShareDialog = ({ course, onUpdated, onClose }) => {
    const { toast } = useFeedback();
    const [busy, setBusy] = useState(false);
    const visibility = visibilityOf(course);

    const change = async (next) => {
        setBusy(true);
        try {
            const response = await updateCourse(course.id, { visibility: next });
            onUpdated(response.data.course);
            toast(`${VISIBILITY[next].label}(으)로 바꿨어요.`, { tone: 'success' });
        } catch (err) {
            toast(apiErrorMessage(err, '공개 범위를 바꾸지 못했어요. 잠시 후 다시 시도하세요.'), { tone: 'error' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open
            onClose={onClose}
            title="공유 설정"
            description={`'${course.title}'`}
            size="sm"
            initialFocus="dialog"
            footer={<Button variant="primary" onClick={onClose}>완료</Button>}
        >
            <span className="form-label">공개 범위</span>
            <VisibilityPicker value={visibility} onChange={change} disabled={busy} />
            {visibility !== 'private' && course.share_token && (
                <>
                    <span className="form-label" style={{ marginTop: 16 }}>공유 링크</span>
                    <ShareLink token={course.share_token} />
                </>
            )}
            <p className="share-count">
                <Icon name="folder-plus" size={16} />
                {course.share_count > 0 ? <><b>{course.share_count}명</b>이 이 코스를 내 코스에 담았어요.</> : '아직 이 코스를 담은 사람이 없어요.'}
            </p>
        </Dialog>
    );
};

export default ShareDialog;
