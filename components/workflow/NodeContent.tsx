import React, { ReactNode } from 'react';
import { IconContainer, IconSurfaceVariant } from './IconContainer';
import { WORKFLOW_COLORS } from './tokens';

/** 1. Icon Only Content */
export interface IconOnlyContentProps {
  icon: ReactNode;
  iconVariant?: IconSurfaceVariant;
  color?: string;
  glow?: boolean;
}

export const IconOnlyContent: React.FC<IconOnlyContentProps> = ({
  icon,
  iconVariant = 'filled',
  color = WORKFLOW_COLORS.primary,
  glow = false,
}) => (
  <IconContainer variant={iconVariant} color={color} glow={glow} size="md">
    {icon}
  </IconContainer>
);

/** 2. Icon + Label (Vertical Stack) */
export interface IconLabelContentProps {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  iconVariant?: IconSurfaceVariant;
  color?: string;
}

export const IconLabelContent: React.FC<IconLabelContentProps> = ({
  icon,
  label,
  sublabel,
  iconVariant = 'filled',
  color = WORKFLOW_COLORS.primary,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
    <IconContainer variant={iconVariant} color={color} size="sm">
      {icon}
    </IconContainer>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: 10, color: WORKFLOW_COLORS.textMuted, marginTop: 2, letterSpacing: '0.04em' }}>
          {sublabel}
        </div>
      )}
    </div>
  </div>
);

/** 3. Icon + Title (Horizontal Layout for Wide Rectangles) */
export interface IconTitleContentProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  iconVariant?: IconSurfaceVariant;
  color?: string;
}

export const IconTitleContent: React.FC<IconTitleContentProps> = ({
  icon,
  title,
  subtitle,
  iconVariant = 'glass',
  color = WORKFLOW_COLORS.primary,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
    <IconContainer variant={iconVariant} color={color} size="md">
      {icon}
    </IconContainer>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: WORKFLOW_COLORS.textMuted, marginTop: 2, letterSpacing: '0.02em' }}>
          {subtitle}
        </div>
      )}
    </div>
  </div>
);

/** 4. Icon + Meta (Title + Subtitle + Meta Tag) */
export interface IconMetaContentProps {
  icon: ReactNode;
  title: string;
  meta: string;
  tag?: string;
  iconVariant?: IconSurfaceVariant;
  color?: string;
}

export const IconMetaContent: React.FC<IconMetaContentProps> = ({
  icon,
  title,
  meta,
  tag,
  iconVariant = 'squircle',
  color = WORKFLOW_COLORS.success,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
    <IconContainer variant={iconVariant} color={color} size="md">
      {icon}
    </IconContainer>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        {tag && (
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: WORKFLOW_COLORS.textMuted }}>
            {tag}
          </span>
        )}
        <span style={{ fontSize: 11, color: WORKFLOW_COLORS.textMuted }}>{meta}</span>
      </div>
    </div>
  </div>
);

/** 5. AI Agent Content (Specialist / Employee Presentation) */
export interface AgentContentProps {
  icon: ReactNode;
  name: string;
  role: string;
  statusText?: string;
  statusTone?: 'active' | 'waiting' | 'idle';
  color?: string;
}

export const AgentContent: React.FC<AgentContentProps> = ({
  icon,
  name,
  role,
  statusText,
  statusTone = 'idle',
  color = WORKFLOW_COLORS.primary,
}) => {
  const dotColor = statusTone === 'active' ? WORKFLOW_COLORS.processing : statusTone === 'waiting' ? '#FCD34D' : WORKFLOW_COLORS.success;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <IconContainer variant="floating" color={color} size="md">
        {icon}
      </IconContainer>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '9999px', backgroundColor: dotColor }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: WORKFLOW_COLORS.textMuted }}>
            {role}
          </span>
          {statusText && (
            <span style={{ fontSize: 10, color: 'rgba(148, 163, 184, 0.7)' }}>· {statusText}</span>
          )}
        </div>
      </div>
    </div>
  );
};

/** 6. Model Content (LLM / Foundational Model) */
export interface ModelContentProps {
  icon: ReactNode;
  modelName: string;
  provider?: string;
  tag?: string;
}

export const ModelContent: React.FC<ModelContentProps> = ({
  icon,
  modelName,
  provider = 'Google Gemini',
  tag = 'LLM',
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
    <IconContainer variant="glass" color="#4285F4" size="md">
      {icon}
    </IconContainer>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
        {modelName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(66, 133, 244, 0.2)', color: '#93C5FD' }}>
          {tag}
        </span>
        <span style={{ fontSize: 10, color: WORKFLOW_COLORS.textMuted }}>{provider}</span>
      </div>
    </div>
  </div>
);
