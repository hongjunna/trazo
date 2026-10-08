// src/components/ui/Button.jsx
import { forwardRef } from 'react';
import Icon from './Icon';

const cx = (...names) => names.filter(Boolean).join(' ');

// variant: primary | sport | secondary | soft | ghost | danger | danger-ghost
// size: sm | md | lg. 글자 없이 아이콘만 쓰면 정사각형 버튼이 되며, 이때는 aria-label을 꼭 넘겨주세요.
const Button = forwardRef(({
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    iconSize,
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
}, ref) => {
    const glyph = iconSize ?? (size === 'sm' ? 16 : 18);
    return (
        <button
            ref={ref}
            type={type}
            className={cx('btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', !children && 'btn--icon', className)}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...rest}
        >
            {loading ? <Icon name="loader" size={glyph} className="spin" /> : icon && <Icon name={icon} size={glyph} />}
            {children}
            {iconRight && <Icon name={iconRight} size={glyph} />}
        </button>
    );
});

Button.displayName = 'Button';

export default Button;
