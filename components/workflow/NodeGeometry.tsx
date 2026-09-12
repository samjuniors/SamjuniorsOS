import React, { ReactNode } from 'react';
import {
  NodeGeometryType,
  NodeStateType,
  NodeSize,
  GEOMETRY_SIZES,
  DEPTH_TOKENS,
  WORKFLOW_COLORS,
} from './tokens';

export interface NodeGeometryProps {
  geometry?: NodeGeometryType;
  state?: NodeStateType;
  size?: NodeSize;
  customWidth?: number;
  customHeight?: number;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const NodeGeometry: React.FC<NodeGeometryProps> = ({
  geometry = 'square',
  state = 'default',
  size = 'md',
  customWidth,
  customHeight,
  children,
  className = '',
  style: customStyle,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const dims = GEOMETRY_SIZES[geometry][size];
  const width = customWidth ?? dims.width;
  const height = customHeight ?? dims.height;
  const radius = dims.radius;

  // Determine state-driven border, shadow, and background
  let border = `1px solid ${WORKFLOW_COLORS.borderDefault}`;
  let boxShadow: string = DEPTH_TOKENS.nodeResting;
  let background = 'linear-gradient(165deg, rgba(20, 30, 48, 0.85), rgba(7, 12, 22, 0.95))';
  let transform = 'translateY(0px)';
  let opacity = 1;
  let cursor = 'pointer';

  switch (state) {
    case 'default':
      border = `1px solid ${WORKFLOW_COLORS.borderDefault}`;
      boxShadow = DEPTH_TOKENS.nodeResting;
      break;

    case 'hover':
      border = `1px solid rgba(0, 178, 255, 0.5)`;
      boxShadow = DEPTH_TOKENS.nodeHover;
      transform = 'translateY(-2px)';
      break;

    case 'selected':
      border = `2px solid ${WORKFLOW_COLORS.primary}`;
      boxShadow = DEPTH_TOKENS.nodeSelected;
      break;

    case 'active':
      border = `1.5px solid ${WORKFLOW_COLORS.primaryBorder}`;
      boxShadow = DEPTH_TOKENS.nodeActive;
      background = 'linear-gradient(165deg, rgba(10, 40, 75, 0.85), rgba(5, 15, 30, 0.95))';
      break;

    case 'processing':
      border = `1.5px solid ${WORKFLOW_COLORS.processingBorder}`;
      boxShadow = DEPTH_TOKENS.nodeProcessing;
      background = 'linear-gradient(165deg, rgba(55, 30, 10, 0.88), rgba(20, 10, 5, 0.96))';
      break;

    case 'success':
      border = `1.5px solid ${WORKFLOW_COLORS.successBorder}`;
      boxShadow = DEPTH_TOKENS.nodeSuccess;
      background = 'linear-gradient(165deg, rgba(12, 45, 28, 0.85), rgba(4, 18, 10, 0.95))';
      break;

    case 'error':
      border = `1.5px solid ${WORKFLOW_COLORS.errorBorder}`;
      boxShadow = DEPTH_TOKENS.nodeError;
      background = 'linear-gradient(165deg, rgba(50, 15, 18, 0.88), rgba(22, 5, 8, 0.96))';
      break;

    case 'disabled':
      border = `1px solid rgba(255, 255, 255, 0.05)`;
      boxShadow = 'none';
      opacity = 0.45;
      cursor = 'not-allowed';
      break;
  }

  const baseStyle: React.CSSProperties = {
    width,
    height,
    borderRadius: radius,
    border,
    boxShadow,
    background,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    transform,
    opacity,
    cursor,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 220ms cubic-bezier(0.16, 1, 0.3, 1)',
    userSelect: 'none',
    boxSizing: 'border-box',
    overflow: 'visible', // allow ports to sit half-outside
    ...customStyle,
  };

  return (
    <div
      className={`workflow-node-geometry ${className}`}
      style={baseStyle}
      onClick={state !== 'disabled' ? onClick : undefined}
      onDoubleClick={state !== 'disabled' ? onDoubleClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Specular hairline highlight at the top edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: geometry === 'circle' || geometry === 'pill' ? '20%' : '10%',
          right: geometry === 'circle' || geometry === 'pill' ? '20%' : '10%',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Internal node contents */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: geometry === 'pill' ? '4px 12px' : '8px 14px',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  );
};
