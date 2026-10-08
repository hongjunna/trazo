// src/components/ui/SegmentedControl.jsx
import { useRef } from 'react';
import Icon from './Icon';

// options: [{ value, label, icon?, swatch?, title? }]
const SegmentedControl = ({ options, value, onChange, label, disabled = false, size, className = '' }) => {
    const groupRef = useRef(null);

    // 방향키로 선택을 옮깁니다 (라디오 그룹 동작).
    const handleKeyDown = (event) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step || disabled) return;
        event.preventDefault();
        const index = options.findIndex(option => option.value === value);
        const next = options[(index + step + options.length) % options.length];
        onChange(next.value);
        groupRef.current?.querySelector(`[data-value="${next.value}"]`)?.focus();
    };

    return (
        <div
            ref={groupRef}
            role="radiogroup"
            aria-label={label}
            className={`segmented ${size === 'lg' ? 'segmented--lg' : ''} ${className}`}
            onKeyDown={handleKeyDown}
        >
            {options.map(option => {
                const checked = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        data-value={option.value}
                        className="segmented__option"
                        disabled={disabled}
                        title={option.title}
                        onClick={() => !checked && onChange(option.value)}
                    >
                        {option.swatch && <span className="segmented__swatch" style={{ background: option.swatch }} />}
                        {option.icon && <Icon name={option.icon} size={16} />}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

export default SegmentedControl;
