// src/components/ui/Tooltip.jsx
// 간단한 툴팁 컴포넌트. hover/focus 시 내용 표시.
import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';

const Tooltip = ({ children, content, position = 'top' }) => {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setVisible(false);
    };
    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  return (
    <span
      ref={wrapperRef}
      className="tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      role="tooltip"
      aria-label={typeof content === 'string' ? content : undefined}
    >
      {children}
      {visible && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip--${position}`}
          role="tooltip"
        >
          {typeof content === 'function' ? content({ hide }) : content}
        </div>
      )}
    </span>
  );
};

export default Tooltip;
