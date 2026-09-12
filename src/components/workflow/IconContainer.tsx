import React, { ReactNode } from 'react';
import { WORKFLOW_COLORS } from './tokens';

export type IconSurfaceVariant = 'filled' | 'glass' | 'outline' | 'squircle' | 'recessed' | 'floating';

export interface IconContainerProps {
  children: ReactNode;
  variant?: IconSurfaceVariant;
  size?: 'sm' | 'md' | 'lg';
  color?: string; // Hex or CSS color, defaults to primary blue
  glow?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 32, icon: 16, radius: '10px' },
  md: { box: 44, icon: 22, radius: '14px' },
  lg: { box: 56, icon: 28, radius: '18px' },
};

export const IconContainer: React.FC<IconContainerProps> = ({
  children,
  variant = 'filled',
  size = 'md',
  color = WORKFLOW_COLORS.primary,
  glow = false,
  className = '',
}) => {
  const s = SIZE_MAP[size];

  // Base dynamic styles depending on variant
  let style: React.CSSProperties = {
    width: s.box,
    height: s.box,
    borderRadius: variant === 'squircle' ? s.radius : '9999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    flexShrink: 0,
  };

  switch (variant) {
    case 'filled':
      style = {
        ...style,
        background: `linear-gradient(135deg, ${color}33, ${color}1A)`,
        border: `1px solid ${color}4D`,
        boxShadow: glow ? `0 0 16px ${color}55` : undefined,
        color: '#FFFFFF',
      };
      break;

    case 'glass':
      style = {
        ...style,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: glow
          ? `0 0 20px ${color}40, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 4px 12px rgba(0, 0, 0, 0.5)',
        color: color,
      };
      break;

    case 'outline':
      style = {
        ...style,
        background: 'transparent',
        border: `2px solid ${color}`,
        boxShadow: glow ? `0 0 14px ${color}66` : undefined,
        color: color,
      };
      break;

    case 'squircle':
      style = {
        ...style,
        borderRadius: s.radius,
        background: `linear-gradient(145deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))`,
        border: `1px solid ${color}66`,
        boxShadow: glow ? `0 0 18px ${color}45` : '0 4px 14px rgba(0,0,0,0.6)',
        color: color,
      };
      break;

    case 'recessed':
      style = {
        ...style,
        background: 'rgba(5, 10, 20, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 255, 255, 0.05)',
        color: color,
      };
      break;

    case 'floating':
      style = {
        ...style,
        background: `linear-gradient(160deg, rgba(30, 50, 80, 0.9), rgba(10, 20, 35, 0.95))`,
        border: `1px solid ${color}88`,
        boxShadow: `0 8px 24px -4px rgba(0, 0, 0, 0.8), 0 0 16px ${color}33`,
        transform: 'translateY(-2px)',
        color: '#FFFFFF',
      };
      break;
  }

  return (
    <div className={`icon-container ${className}`} style={style}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </span>
    </div>
  );
};
