// src/components/ui/FeedbackProvider.jsx
// 브라우저 기본 alert/confirm 대신 쓰는 알림(토스트)과 확인 대화상자
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeedbackContext } from './feedbackContext';
import Dialog from './Dialog';
import Button from './Button';
import Icon from './Icon';

const TONE_ICON = { success: 'check-circle', error: 'alert', info: 'info' };

const FeedbackProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const [request, setRequest] = useState(null);
    const seq = useRef(0);

    const toast = useCallback((message, { tone = 'info', duration = 3200 } = {}) => {
        const id = ++seq.current;
        setToasts(list => [...list.slice(-2), { id, message, tone }]);
        window.setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), duration);
    }, []);

    const confirm = useCallback((options) => new Promise(resolve => {
        setRequest({ ...options, resolve });
    }), []);

    const settle = (result) => {
        request?.resolve(result);
        setRequest(null);
    };

    const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}
            <Dialog
                open={Boolean(request)}
                onClose={() => settle(false)}
                title={request?.title}
                description={request?.message}
                size="sm"
                initialFocus="button"
                footer={<>
                    <Button variant="secondary" onClick={() => settle(false)}>{request?.cancelLabel || '취소'}</Button>
                    <Button variant={request?.tone === 'danger' ? 'danger' : 'primary'} data-autofocus onClick={() => settle(true)}>
                        {request?.confirmLabel || '확인'}
                    </Button>
                </>}
            />
            {createPortal(
                <div className="toasts" role="status" aria-live="polite">
                    {toasts.map(item => (
                        <div key={item.id} className={`toast toast--${item.tone}`}>
                            <Icon name={TONE_ICON[item.tone]} size={18} />
                            <span>{item.message}</span>
                        </div>
                    ))}
                </div>,
                document.body,
            )}
        </FeedbackContext.Provider>
    );
};

export default FeedbackProvider;
