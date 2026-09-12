import React, { ReactNode } from 'react';
import { NodeGeometry } from './NodeGeometry';
import { NodePort, NodePortProps } from './NodePort';
import { PulseEffect, ProcessingEffect, SuccessBurst, ErrorPulse } from './Effects';
import {
  NodeGeometryType,
  NodeStateType,
  NodeSize,
  EffectsBudget,
  WORKFLOW_COLORS,
} from './tokens';

export interface NodeIndicator {
  status: 'active' | 'waiting' | 'success' | 'error';
  label?: string;
  glow?: boolean;
}

export interface NodeProps {
  id?: string;
  geometry?: NodeGeometryType;
  state?: NodeStateType;
  size?: NodeSize;
  customWidth?: number;
  customHeight?: number;
  indicator?: NodeIndicator;
  ports?: NodePortProps[];
  hasInputPort?: boolean;
  hasOutputPort?: boolean;
  portShape?: 'circle' | 'square';
  budget?: EffectsBudget;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onPortClick?: (portId: string, e: React.MouseEvent) => void;
}

export const Node: React.FC<NodeProps> = ({
  id,
  geometry = 'square',
  state = 'default',
  size = 'md',
  customWidth,
  customHeight,
  indicator,
  ports,
  hasInputPort = false,
  hasOutputPort = false,
  portShape = 'circle',
  budget = 'full',
  children,
  className = '',
  style,
  onClick,
  onDoubleClick,
  onPortClick,
}) => {
  // Derive ports if custom ports array not provided
  const renderedPorts: NodePortProps[] = ports ?? [
    ...(hasInputPort ? [{ shape: portShape, position: 'left' as const, state: state === 'active' ? 'active' as const : 'default' as const }] : []),
    ...(hasOutputPort ? [{ shape: portShape, position: 'right' as const, state: state === 'active' ? 'active' as const : 'default' as const }] : []),
  ];

  // Map indicator color
  let indicatorColor: string = WORKFLOW_COLORS.primary;
  if (indicator) {
    switch (indicator.status) {
      case 'active':
        indicatorColor = WORKFLOW_COLORS.processing;
        break;
      case 'waiting':
        indicatorColor = '#FCD34D';
        break;
      case 'success':
        indicatorColor = WORKFLOW_COLORS.success;
        break;
      case 'error':
        indicatorColor = WORKFLOW_COLORS.error;
        break;
    }
  }

  return (
    <div id={id} className={`workflow-node-wrapper relative inline-block ${className}`} style={{ margin: 6 }}>
      {/* Outer Effect Auras */}
      {state === 'processing' && <ProcessingEffect budget={budget} />}
      {state === 'active' && <PulseEffect color={WORKFLOW_COLORS.primary} budget={budget} />}
      {state === 'success' && <SuccessBurst />}
      {state === 'error' && <ErrorPulse />}

      {/* Geometry Core Shell */}
      <NodeGeometry
        geometry={geometry}
        state={state}
        size={size}
        budget={budget}
        customWidth={customWidth}
        customHeight={customHeight}
        style={style}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {/* Optional Status Indicator Badge (Top Left of Node) */}
        {indicator && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 10,
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '9999px',
                backgroundColor: indicatorColor,
                boxShadow: indicator.glow ? `0 0 8px ${indicatorColor}` : 'none',
              }}
            />
            {indicator.label && (
              <span style={{ fontSize: 9, color: WORKFLOW_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {indicator.label}
              </span>
            )}
          </div>
        )}

        {/* Node Child Content */}
        {children}
      </NodeGeometry>

      {/* Connection Ports on perimeter */}
      {renderedPorts.map((p, idx) => (
        <NodePort
          key={p.id ?? `${p.position}-${idx}`}
          {...p}
          shape={p.shape ?? portShape}
          onClick={(e) => onPortClick?.(p.id ?? `${p.position}-${idx}`, e)}
        />
      ))}
    </div>
  );
};
