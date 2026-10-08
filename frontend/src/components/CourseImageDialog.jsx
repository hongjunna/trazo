// src/components/CourseImageDialog.jsx
// 코스 이미지 저장: 용지 크기·방향·지도 종류를 고르면 미리 보기를 만들고, PNG로 내려받습니다.
import { useEffect, useState } from 'react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedControl from './ui/SegmentedControl';
import { PAPERS, renderCourseImage, suggestOrientation } from '../utils/courseImage';
import { readStored, writeStored } from '../utils/storage';

const PAPER_OPTIONS = Object.entries(PAPERS).map(([value, paper]) => ({ value, label: paper.label }));
const ORIENTATION_OPTIONS = [
    { value: 'portrait', label: '세로' },
    { value: 'landscape', label: '가로' },
];
const MAP_OPTIONS = [
    { value: 'roadmap', label: '일반 지도' },
    { value: 'satellite', label: '위성 지도' },
];

const CourseImageDialog = ({ course, onDownload, onClose }) => {
    const [paper, setPaper] = useState(() => (PAPERS[readStored('trazo:imagePaper', 'A4')] ? readStored('trazo:imagePaper', 'A4') : 'A4'));
    const [orientation, setOrientation] = useState(() => suggestOrientation(course.polylines));
    const [mapType, setMapType] = useState('roadmap');
    const [result, setResult] = useState(null); // { url, blob, width, height, failedTiles, key }
    const [error, setError] = useState(null);
    const key = `${paper}-${orientation}-${mapType}`;
    const isRendering = !error && result?.key !== key;

    useEffect(() => {
        let cancelled = false;
        // 옵션을 빠르게 바꾸는 동안에는 그리지 않습니다.
        const timer = window.setTimeout(async () => {
            try {
                const image = await renderCourseImage({ ...course, paper, orientation, mapType });
                if (cancelled) return;
                setResult({ ...image, url: URL.createObjectURL(image.blob), key });
            } catch (renderError) {
                if (!cancelled) setError(renderError.message || '이미지를 만들지 못했어요.');
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [course, paper, orientation, mapType, key]);

    // 새 미리 보기로 바뀌거나 창을 닫으면 이전 이미지를 놓아줍니다.
    useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

    const changePaper = (next) => {
        setPaper(next);
        setError(null);
        writeStored('trazo:imagePaper', next);
    };

    const [shortMm, longMm] = PAPERS[paper].mm;
    const sizeLabel = orientation === 'landscape' ? `${longMm}×${shortMm}mm` : `${shortMm}×${longMm}mm`;
    const ready = result?.key === key;

    return (
        <Dialog
            open
            onClose={onClose}
            size="lg"
            title="코스 이미지로 저장"
            description="코스 전체 지도, 고도 그래프, 웨이포인트를 한 장의 PNG 이미지로 만들어요. 인쇄용(150dpi)으로 그려요."
            initialFocus="dialog"
            footer={<>
                <Button variant="secondary" onClick={onClose}>닫기</Button>
                <Button
                    variant="primary"
                    icon="download"
                    disabled={!ready}
                    loading={isRendering}
                    onClick={() => onDownload(result.blob, paper)}
                    data-autofocus
                >
                    PNG 내려받기
                </Button>
            </>}
        >
            <div className="image-export">
                <div className="image-export__options">
                    <div>
                        <span className="form-label">용지 크기</span>
                        <SegmentedControl label="용지 크기" options={PAPER_OPTIONS} value={paper} onChange={changePaper} />
                    </div>
                    <div>
                        <span className="form-label">방향</span>
                        <SegmentedControl label="용지 방향" options={ORIENTATION_OPTIONS} value={orientation} onChange={(next) => { setOrientation(next); setError(null); }} />
                    </div>
                    <div>
                        <span className="form-label">지도</span>
                        <SegmentedControl label="지도 종류" options={MAP_OPTIONS} value={mapType} onChange={(next) => { setMapType(next); setError(null); }} />
                    </div>
                    <p className="form-hint">
                        {sizeLabel}{ready ? ` · ${result.width}×${result.height}px` : ''}
                    </p>
                    {ready && result.failedTiles > 0 && (
                        <p className="form-hint form-hint--error">
                            <Icon name="alert" size={14} /> 지도 그림 일부({result.failedTiles}장)를 가져오지 못했어요. 잠시 후 다시 시도하세요.
                        </p>
                    )}
                </div>
                <div className={`image-export__preview ${orientation === 'landscape' ? 'is-landscape' : ''}`} aria-live="polite">
                    {error ? (
                        <div className="image-export__status image-export__status--error"><Icon name="alert" size={18} />{error}</div>
                    ) : result ? (
                        <img src={result.url} alt="코스 이미지 미리 보기" className={isRendering ? 'is-stale' : ''} />
                    ) : null}
                    {isRendering && (
                        <div className="image-export__status"><Icon name="loader" size={18} className="spin" />지도를 그리는 중…</div>
                    )}
                </div>
            </div>
        </Dialog>
    );
};

export default CourseImageDialog;
