// src/hooks/useHistoryState.js
import { useState, useCallback, useEffect, useRef } from 'react';

export function useHistoryState(initialState, isLocked = () => false) {
    const lockRef = useRef(isLocked);
    useEffect(() => { lockRef.current = isLocked; });
    const [history, setHistory] = useState([initialState]);
    const [step, setStep] = useState(0);

    const currentState = history[step];

    const pushState = useCallback((newState) => {
        const newHistory = history.slice(0, step + 1);
        setHistory([...newHistory, newState]);
        setStep(newHistory.length);
    }, [history, step]);

    const undo = useCallback(() => {
        if (lockRef.current()) return;
        if (step > 0) setStep((prev) => prev - 1);
    }, [step]);

    const redo = useCallback(() => {
        if (lockRef.current()) return;
        if (step < history.length - 1) setStep((prev) => prev + 1);
    }, [step, history.length]);

    const reset = useCallback((initialData) => {
        setHistory([initialData]);
        setStep(0);
    }, []);

    // 키보드 단축키 지원
    useEffect(() => {
        const handleKeyDown = (e) => {
            // 글자를 입력하는 중에는 입력란의 되돌리기를 그대로 둡니다.
            const target = e.target;
            if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (document.querySelector('[role="dialog"]')) return;
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    if (e.shiftKey) {
                        e.preventDefault();
                        redo();
                    } else {
                        e.preventDefault();
                        undo();
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    return {
        currentState,
        pushState,
        undo,
        redo,
        reset,
        canUndo: step > 0,
        canRedo: step < history.length - 1,
        historyLength: history.length,
        step,
    };
}