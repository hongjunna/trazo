// src/components/SaveCourseDialog.jsx
// 저장: 불러온 코스면 "기존 코스 업데이트"와 "새 코스로 저장" 중에서 고르고, 이름·폴더·공개 범위를 정합니다.
// 러닝 코스를 전체 공개가 아닌 범위로 저장하려 하면, 전체 공개 시 받을 수 있는 AI 리포트를 한 번 더 안내합니다.
import { useState } from 'react';
import { AiNudgeDialog } from './AiReport';
import { isAiReportSport, shouldNudgeAiReport } from '../utils/aiReport';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { FolderSelect } from './FolderSelect';
import { VisibilityPicker } from './ShareDialog';

const TITLE_MAX = 60;

const SaveCourseDialog = ({ open, onClose, defaultTitle, existingTitle, defaultFolderId = null, defaultVisibility = 'public', sport, onSubmit, isSaving }) => {
    const [mode, setMode] = useState(existingTitle ? 'update' : 'new');
    const [title, setTitle] = useState(defaultTitle);
    const [folderId, setFolderId] = useState(defaultFolderId);
    const [visibility, setVisibility] = useState(defaultVisibility);
    const [isNudgeOpen, setIsNudgeOpen] = useState(false);
    const trimmed = title.trim();
    const aiReport = isAiReportSport(sport);

    const save = (nextVisibility) => onSubmit({ mode, title: trimmed.slice(0, TITLE_MAX), folderId, visibility: nextVisibility });

    const submit = (event) => {
        event.preventDefault();
        if (!trimmed || isSaving) return;
        if (aiReport && visibility !== 'public' && shouldNudgeAiReport()) {
            setIsNudgeOpen(true);
            return;
        }
        save(visibility);
    };

    return (
        <Dialog
            open={open}
            onClose={isSaving ? undefined : onClose}
            dismissible={!isSaving}
            title="코스 저장"
            description={existingTitle ? '불러온 코스를 수정했어요. 어떻게 저장할까요?' : '내 코스에 저장하면 언제든 다시 불러와 고칠 수 있어요.'}
            footer={<>
                <Button variant="secondary" onClick={onClose} disabled={isSaving}>취소</Button>
                <Button variant="primary" type="submit" form="save-course-form" icon="save" loading={isSaving} disabled={!trimmed}>
                    {mode === 'update' ? '업데이트' : '저장'}
                </Button>
            </>}
        >
            <form id="save-course-form" onSubmit={submit}>
                {existingTitle && (
                    <div className="choice-list" role="radiogroup" aria-label="저장 방식">
                        <label className="choice">
                            <input type="radio" name="save-mode" value="update" checked={mode === 'update'} onChange={() => setMode('update')} />
                            <span>
                                <span className="choice__label">기존 코스 업데이트</span><br />
                                <span className="choice__desc">'{existingTitle}'을(를) 지금 코스로 덮어써요.</span>
                            </span>
                        </label>
                        <label className="choice">
                            <input type="radio" name="save-mode" value="new" checked={mode === 'new'} onChange={() => setMode('new')} />
                            <span>
                                <span className="choice__label">새 코스로 저장</span><br />
                                <span className="choice__desc">기존 코스는 그대로 두고 사본을 만들어요.</span>
                            </span>
                        </label>
                    </div>
                )}
                <label className="form-label" htmlFor="save-course-title">코스 이름</label>
                <input
                    id="save-course-title"
                    className="input"
                    style={{ width: '100%' }}
                    value={title}
                    maxLength={TITLE_MAX}
                    onChange={(event) => setTitle(event.target.value)}
                    onFocus={(event) => event.target.select()}
                    disabled={isSaving}
                />
                <p className="form-hint">{trimmed.length}/{TITLE_MAX}자</p>

                <div className="form-group">
                    <label className="form-label" htmlFor="save-course-folder">폴더</label>
                    <FolderSelect id="save-course-folder" value={folderId} onChange={setFolderId} disabled={isSaving} />
                </div>

                <div className="form-group">
                    <span className="form-label">공개 범위</span>
                    <VisibilityPicker value={visibility} onChange={setVisibility} disabled={isSaving} aiHint={aiReport} />
                </div>
            </form>
            {isNudgeOpen && (
                <AiNudgeDialog
                    visibility={visibility}
                    onClose={() => setIsNudgeOpen(false)}
                    onSavePublic={() => { setIsNudgeOpen(false); setVisibility('public'); save('public'); }}
                    onSaveAsIs={() => { setIsNudgeOpen(false); save(visibility); }}
                />
            )}
        </Dialog>
    );
};

export default SaveCourseDialog;
