import React from 'react';
import { WORKFLOW_COLORS } from './tokens';

export type PortShape = 'circle' | 'square';
export type PortPosition = 'left' | 'right' | 'top' | 'bottom';
export type PortState = 'default' | 'hover' | 'active' | 'connected' | 'success' | 'error';

export interface NodePortProps {
  id?: string;
  shape?: PortShape;
  position?: PortPosition;
  state?: PortState;
  color?: string;
  size?: number; // Outer diameter, default 14px
  offset?: number; // Offset from edge, default -7px (half sticking out)
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: (hovered: boolean) => void;
  className?: string;
}

export const NodePort: React.FC<NodePortProps> = ({
  id,
  shape = 'circle',
  position = 'left',
  state = 'default',
  color,
  size = 14,
  offset = -Math.round(size / 2),
  label,
  onClick,
  onHover,
  className = '',
}) => {
  // Determine state-based color and glow
  let activeColor = color ?? WORKFLOW_COLORS.primary;
  let glow = 'none';
  let innerOpacity = 0.6;

  switch (state) {
    case 'default':
      activeColor = color ?? 'rgba(148, 163, 184, 0.5)';
      innerOpacity = 0.35;
      break;
    case 'hover':
      activeColor = color ?? WORKFLOW_COLORS.primary;
      glow = `0 0 10px ${activeColor}`;
      innerOpacity = 0.9;
      break;
    case 'active':
      activeColor = color ?? WORKFLOW_COLORS.primary;
      glow = `0 0 12px ${activeColor}, inset 0 0 4px ${activeColor}`;
      innerOpacity = 1;
      break;
    case 'connected':
      activeColor = color ?? WORKFLOW_COLORS.primary;
      glow = `0 0 8px ${activeColor}`;
      innerOpacity = 0.95;
      break;
    case 'success':
      activeColor = WORKFLOW_COLORS.success;
      glow = `0 0 12px ${activeColor}`;
      innerOpacity = 1;
      break;
    case 'error':
      activeColor = WORKFLOW_COLORS.error;
      glow = `0 0 12px ${activeColor}`;
      innerOpacity = 1;
      break;
  }

  // Positioning coordinates on node perimeter
  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 20,
    width: size,
    height: size,
    cursor: 'crosshair',
  };

  if (position === 'left') {
    positionStyle.left = offset;
    positionStyle.top = '50%';
    positionStyle.transform = 'translateY(-50%)';
  } else if (position === 'right') {
    positionStyle.right = offset;
    positionStyle.top = '50%';
    positionStyle.transform = 'translateY(-50%)';
  } else if (position === 'top') {
    positionStyle.top = offset;
    positionStyle.left = '50%';
    positionStyle.transform = 'translateX(-50%)';
  } else if (position === 'bottom') {
    positionStyle.bottom = offset;
    positionStyle.left = '50%';
    positionStyle.transform = 'translateX(-50%)';
  }

  const isSquare = shape === 'square';
  const borderRadius = isSquare ? '3px' : '9999px';

  return (
    <div
      id={id}
      style={positionStyle}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`group/port ${className}`}
      title={label}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius,
          backgroundColor: '#050A14',
          border: `2px solid ${activeColor}`,
          boxShadow: glow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 180ms ease-out',
        }}
        className="group-hover/port:scale-125"
      >
        {/* Inner center core dot */}
        <div
          style={{
            width: Math.max(3, Math.round(size * 0.35)),
            height: Math.max(3, Math.round(size * 0.35)),
            borderRadius,
            backgroundColor: activeColor,
            opacity: innerOpacity,
            transition: 'opacity 180ms ease-out',
          }}
        />
      </div>
    </div>
  );
};
