// src/components/ui/Tooltip.jsx
// 도움말 툴팁. 마우스를 올리거나 키보드로 초점을 주면 열리고, 터치 기기에서는 눌러서 엽니다.
import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';

const Tooltip = ({ content, label = '설명 보기', position = 'bottom', children }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="tooltip-wrapper"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="tooltip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children ?? <Icon name="help" size={14} />}
      </button>
      {open && (
        <span id={id} role="tooltip" className={`tooltip tooltip--${position}`}>
          {content}
        </span>
      )}
    </span>
  );
};

export default Tooltip;
