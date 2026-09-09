'use client';

import React from 'react';
import { AgentRole } from '@/types/os';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'hero' | 'call';

interface AgentAvatarProps {
  roleOrId?: AgentRole | 'advisor' | 'founder' | string;
  name?: string;
  size?: AvatarSize;
  className?: string;
  showStatus?: boolean;
  status?: 'active' | 'processing' | 'idle' | 'standby' | string;
  showGlow?: boolean;
  interactive?: boolean;
  showBadge?: boolean;
  badgeLabel?: string;
  mode?: 'photo' | 'vector';
  isSpeaking?: boolean;
  audioLevel?: number;
  onClick?: () => void;
}

const SIZE_MAP: Record<AvatarSize, { container: string; iconSize: number; statusDot: string; badgeText: string }> = {
  xs: { container: 'w-5 h-5 rounded-md', iconSize: 12, statusDot: 'w-1.5 h-1.5 -bottom-0.5 -right-0.5', badgeText: 'text-[8px]' },
  sm: { container: 'w-7 h-7 rounded-lg', iconSize: 16, statusDot: 'w-2 h-2 -bottom-0.5 -right-0.5', badgeText: 'text-[9px]' },
  md: { container: 'w-10 h-10 rounded-xl', iconSize: 22, statusDot: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5', badgeText: 'text-[10px]' },
  lg: { container: 'w-14 h-14 rounded-2xl', iconSize: 32, statusDot: 'w-3 h-3 bottom-0 right-0', badgeText: 'text-xs' },
  xl: { container: 'w-20 h-20 rounded-3xl', iconSize: 44, statusDot: 'w-3.5 h-3.5 bottom-0.5 right-0.5', badgeText: 'text-xs' },
  '2xl': { container: 'w-28 h-28 rounded-3xl', iconSize: 60, statusDot: 'w-4 h-4 bottom-1 right-1', badgeText: 'text-sm' },
  hero: { container: 'w-36 h-36 rounded-3xl', iconSize: 80, statusDot: 'w-5 h-5 bottom-1.5 right-1.5', badgeText: 'text-sm' },
  call: { container: 'w-44 h-44 rounded-full', iconSize: 96, statusDot: 'w-6 h-6 bottom-2 right-2', badgeText: 'text-sm' },
};

export const AGENT_REAL_PORTRAITS: Record<
  string,
  {
    photoUrl: string;
    fallbackPhotoUrl: string;
    name: string;
    title: string;
  }
> = {
  coo: {
    photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Sophia Vance',
    title: 'Chief Operating Officer & Orchestrator',
  },
  researcher: {
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Dr. Aris Thorne',
    title: 'Lead Market & Intelligence Researcher',
  },
  pm: {
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Maya Lin',
    title: 'Principal Product Manager',
  },
  finance: {
    photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Julian Cruz',
    title: 'Chief Financial Analyst',
  },
  advisor: {
    photoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Founder Intelligence',
    title: 'Strategic Advisor & Co-Pilot',
  },
  founder: {
    photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Founder',
    title: 'Chief Executive Authority',
  },
  council: {
    photoUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&h=400&q=80',
    fallbackPhotoUrl: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=400&h=400&q=80',
    name: 'Executive Council (AI Mesh)',
    title: 'Autonomous Multi-Agent Bus',
  },
};

export const AGENT_AVATAR_THEMES: Record<
  string,
  {
    roleTitle: string;
    department: string;
    primaryColor: string;
    secondaryColor: string;
    glowColor: string;
    bgGradient: string;
    borderGradient: string;
    darkBg: string;
  }
> = {
  coo: {
    roleTitle: 'Chief Operating Officer & Orchestrator',
    department: 'Executive Operations',
    primaryColor: '#a855f7',
    secondaryColor: '#6366f1',
    glowColor: 'rgba(168, 85, 247, 0.45)',
    bgGradient: 'from-purple-950 via-[#1a0f2e] to-indigo-950',
    borderGradient: 'border-purple-500/40',
    darkBg: '#130d24',
  },
  researcher: {
    roleTitle: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech',
    primaryColor: '#f59e0b',
    secondaryColor: '#06b6d4',
    glowColor: 'rgba(245, 158, 11, 0.45)',
    bgGradient: 'from-amber-950 via-[#261705] to-cyan-950',
    borderGradient: 'border-amber-500/40',
    darkBg: '#1c1308',
  },
  pm: {
    roleTitle: 'Principal Product Manager',
    department: 'Product Strategy & UX',
    primaryColor: '#f43f5e',
    secondaryColor: '#ec4899',
    glowColor: 'rgba(244, 63, 94, 0.45)',
    bgGradient: 'from-rose-950 via-[#260916] to-pink-950',
    borderGradient: 'border-rose-500/40',
    darkBg: '#1c0813',
  },
  finance: {
    roleTitle: 'Chief Financial Analyst',
    department: 'Capital & Unit Economics',
    primaryColor: '#10b981',
    secondaryColor: '#06b6d4',
    glowColor: 'rgba(16, 185, 129, 0.45)',
    bgGradient: 'from-emerald-950 via-[#062117] to-teal-950',
    borderGradient: 'border-emerald-500/40',
    darkBg: '#081a13',
  },
  advisor: {
    roleTitle: 'Strategic Advisor & Co-Pilot',
    department: 'Founder Intelligence',
    primaryColor: '#8b5cf6',
    secondaryColor: '#38bdf8',
    glowColor: 'rgba(139, 92, 246, 0.45)',
    bgGradient: 'from-violet-950 via-[#160c2e] to-sky-950',
    borderGradient: 'border-violet-500/40',
    darkBg: '#110b24',
  },
  founder: {
    roleTitle: 'Founder (Human-in-the-Loop)',
    department: 'Chief Executive Authority',
    primaryColor: '#6366f1',
    secondaryColor: '#ec4899',
    glowColor: 'rgba(99, 102, 241, 0.45)',
    bgGradient: 'from-indigo-950 via-[#14122b] to-slate-900',
    borderGradient: 'border-indigo-500/40',
    darkBg: '#0f0e1d',
  },
  council: {
    roleTitle: 'Autonomous Multi-Agent Bus',
    department: 'Inter-Agent Collaboration Mesh',
    primaryColor: '#3b82f6',
    secondaryColor: '#8b5cf6',
    glowColor: 'rgba(59, 130, 246, 0.45)',
    bgGradient: 'from-blue-950 via-[#0f172a] to-indigo-950',
    borderGradient: 'border-blue-500/40',
    darkBg: '#0b1120',
  },
};

/**
 * Normalizes input role string to one of our standard keys.
 */
function normalizeRole(roleOrId?: string): 'coo' | 'researcher' | 'pm' | 'finance' | 'advisor' | 'founder' | 'council' {
  if (!roleOrId) return 'coo';
  const lower = roleOrId.toLowerCase();
  if (lower.includes('council') || lower.includes('mesh') || lower.includes('collab') || lower.includes('multi')) {
    return 'council';
  }
  if (lower.includes('coo') || lower.includes('sophia') || lower.includes('orchestrat') || lower.includes('operations')) {
    return 'coo';
  }
  if (lower.includes('research') || lower.includes('aris') || lower.includes('market') || lower.includes('intel')) {
    return 'researcher';
  }
  if (lower.includes('pm') || lower.includes('product') || lower.includes('maya') || lower.includes('spec') || lower.includes('prd')) {
    return 'pm';
  }
  if (lower.includes('finance') || lower.includes('julian') || lower.includes('cruz') || lower.includes('capital') || lower.includes('economic')) {
    return 'finance';
  }
  if (lower.includes('advisor') || lower.includes('copilot') || lower.includes('intelligence')) {
    return 'advisor';
  }
  if (lower.includes('founder') || lower.includes('human') || lower.includes('admin')) {
    return 'founder';
  }
  return 'coo';
}

/**
 * SVG Vector Artwork for Sophia Vance (COO - Executive Orchestrator)
 */
const SophiaVanceAvatarSvg: React.FC<{ size?: number }> = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sophia-core" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="50%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#4f46e5" />
      </linearGradient>
      <linearGradient id="sophia-sheen" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#e879f9" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
      </linearGradient>
      <radialGradient id="sophia-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
        <stop offset="60%" stopColor="#6366f1" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <filter id="sophia-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Background Halo */}
    <circle cx="50" cy="50" r="46" fill="url(#sophia-halo)" />

    {/* Outer Orbital Lattice Ring */}
    <circle
      cx="50"
      cy="50"
      r="43"
      stroke="url(#sophia-sheen)"
      strokeWidth="1.2"
      strokeDasharray="4 6"
      strokeOpacity="0.7"
    />
    <circle cx="50" cy="7" r="2" fill="#c084fc" filter="url(#sophia-glow)" />
    <circle cx="50" cy="93" r="2" fill="#818cf8" />
    <circle cx="7" cy="50" r="2" fill="#38bdf8" />
    <circle cx="93" cy="50" r="2" fill="#e879f9" />

    {/* Futuristic Geometric Executive Head / Visor Silhouette */}
    <path
      d="M50 14 L74 28 L74 62 L50 84 L26 62 L26 28 Z"
      fill="#130d24"
      stroke="url(#sophia-core)"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Multi-layered Inner Shield Matrix */}
    <path
      d="M50 22 L68 33 L68 59 L50 75 L32 59 L32 33 Z"
      fill="#1e1338"
      stroke="#a855f7"
      strokeWidth="1.2"
      strokeOpacity="0.8"
    />

    {/* Holographic Visor Bar */}
    <path
      d="M34 42 L66 42 L62 52 L38 52 Z"
      fill="url(#sophia-core)"
      filter="url(#sophia-glow)"
      opacity="0.95"
    />
    <line x1="38" y1="47" x2="62" y2="47" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.9" />

    {/* Neural Sync Core / Orchestrator Gem */}
    <polygon points="50,28 58,36 50,44 42,36" fill="#f472b6" filter="url(#sophia-glow)" />
    <polygon points="50,31 55,36 50,41 45,36" fill="#ffffff" />

    {/* Executive Collar / Lower Command Nodes */}
    <path d="M40 60 L50 69 L60 60" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
    <circle cx="50" cy="69" r="2.5" fill="#38bdf8" filter="url(#sophia-glow)" />

    {/* Micro Circuit Nodes */}
    <line x1="32" y1="33" x2="20" y2="24" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.6" />
    <circle cx="20" cy="24" r="1.5" fill="#c084fc" />
    <line x1="68" y1="33" x2="80" y2="24" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.6" />
    <circle cx="80" cy="24" r="1.5" fill="#c084fc" />

    <line x1="26" y1="62" x2="16" y2="70" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.6" />
    <circle cx="16" cy="70" r="1.5" fill="#818cf8" />
    <line x1="74" y1="62" x2="84" y2="70" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.6" />
    <circle cx="84" cy="70" r="1.5" fill="#818cf8" />
  </svg>
);

/**
 * SVG Vector Artwork for Dr. Aris Thorne (Researcher - Market Intelligence & Deep Tech)
 */
const ArisThorneAvatarSvg: React.FC<{ size?: number }> = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="aris-core" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <linearGradient id="aris-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#67e8f9" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
      <radialGradient id="aris-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.55" />
        <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <filter id="aris-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Background Halo */}
    <circle cx="50" cy="50" r="46" fill="url(#aris-halo)" />

    {/* Azimuth / Radar Dial Outer Ring */}
    <circle
      cx="50"
      cy="50"
      r="43"
      stroke="url(#aris-core)"
      strokeWidth="1.2"
      strokeDasharray="2 4"
      strokeOpacity="0.8"
    />
    <circle cx="50" cy="50" r="38" stroke="#06b6d4" strokeWidth="0.8" strokeOpacity="0.5" />

    {/* Reticle Crosshairs */}
    <line x1="50" y1="8" x2="50" y2="20" stroke="#f59e0b" strokeWidth="1.5" />
    <line x1="50" y1="80" x2="50" y2="92" stroke="#f59e0b" strokeWidth="1.5" />
    <line x1="8" y1="50" x2="20" y2="50" stroke="#06b6d4" strokeWidth="1.5" />
    <line x1="80" y1="50" x2="92" y2="50" stroke="#06b6d4" strokeWidth="1.5" />

    {/* Octagonal Researcher Cyber-Chassis */}
    <polygon
      points="36,15 64,15 82,33 82,67 64,85 36,85 18,67 18,33"
      fill="#1c1308"
      stroke="url(#aris-core)"
      strokeWidth="2.5"
    />

    {/* Inner Quantum Prism Lattice */}
    <polygon
      points="39,23 61,23 75,37 75,63 61,77 39,77 25,63 25,37"
      fill="#2b1a0a"
      stroke="#fbbf24"
      strokeWidth="1"
      strokeOpacity="0.7"
    />

    {/* Asymmetrical Cybernetic Ocular Scanner (Right Eye Target Lens) */}
    <circle cx="59" cy="46" r="11" fill="#083344" stroke="url(#aris-cyan)" strokeWidth="2" />
    <circle cx="59" cy="46" r="7" fill="url(#aris-cyan)" filter="url(#aris-glow)" opacity="0.8" />
    <circle cx="59" cy="46" r="3" fill="#ffffff" />
    {/* Targeting HUD lines */}
    <path d="M48 46 L70 46 M59 35 L59 57" stroke="#67e8f9" strokeWidth="1" strokeOpacity="0.8" />

    {/* Left Analytic Sensor Visor */}
    <path
      d="M31 43 L45 43 L43 49 L33 49 Z"
      fill="url(#aris-core)"
      filter="url(#aris-glow)"
      opacity="0.9"
    />

    {/* Forehead Quantum Brain / Data Prism */}
    <polygon points="50,22 55,28 50,34 45,28" fill="#fbbf24" filter="url(#aris-glow)" />

    {/* Spectrum Analysis Waves / Lower Collar */}
    <path
      d="M34 65 Q50 72 66 65"
      stroke="#f59e0b"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M38 71 Q50 77 62 71"
      stroke="#06b6d4"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />

    {/* Satellite Data Orbiters */}
    <circle cx="28" cy="28" r="2" fill="#fbbf24" filter="url(#aris-glow)" />
    <circle cx="72" cy="72" r="2" fill="#06b6d4" filter="url(#aris-glow)" />
  </svg>
);

/**
 * SVG Vector Artwork for Maya Lin (Product Manager - Product Strategy & UX)
 */
const MayaLinAvatarSvg: React.FC<{ size?: number }> = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="maya-core" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fda4af" />
        <stop offset="50%" stopColor="#f43f5e" />
        <stop offset="100%" stopColor="#e11d48" />
      </linearGradient>
      <linearGradient id="maya-violet" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f472b6" />
        <stop offset="100%" stopColor="#c084fc" />
      </linearGradient>
      <radialGradient id="maya-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.55" />
        <stop offset="60%" stopColor="#ec4899" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <filter id="maya-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Background Halo */}
    <circle cx="50" cy="50" r="46" fill="url(#maya-halo)" />

    {/* Isometric PRD Blueprint Grid Circles */}
    <circle
      cx="50"
      cy="50"
      r="43"
      stroke="url(#maya-violet)"
      strokeWidth="1.2"
      strokeDasharray="6 4"
      strokeOpacity="0.8"
    />
    <circle cx="50" cy="50" r="36" stroke="#f43f5e" strokeWidth="0.8" strokeOpacity="0.4" />

    {/* Geometric PRD Hexagon Hull */}
    <polygon
      points="50,13 83,32 83,68 50,87 17,68 17,32"
      fill="#1c0813"
      stroke="url(#maya-core)"
      strokeWidth="2.5"
    />

    {/* Inner Wireframe Prism Structure */}
    <polygon
      points="50,22 75,36 75,64 50,78 25,64 25,36"
      fill="#2d0d1f"
      stroke="#fb7185"
      strokeWidth="1.2"
      strokeOpacity="0.8"
    />

    {/* 3D Isometric Product Cube at Core */}
    {/* Top Face */}
    <polygon points="50,33 63,40 50,47 37,40" fill="url(#maya-violet)" opacity="0.9" />
    {/* Left Face */}
    <polygon points="37,40 50,47 50,62 37,55" fill="#be123c" opacity="0.85" />
    {/* Right Face */}
    <polygon points="50,47 63,40 63,55 50,62" fill="url(#maya-core)" opacity="0.95" />

    {/* Core Sparkle / Anchor Node */}
    <circle cx="50" cy="47" r="3.5" fill="#ffffff" filter="url(#maya-glow)" />

    {/* UX Constellation Lines & Milestones */}
    <line x1="50" y1="22" x2="50" y2="33" stroke="#fda4af" strokeWidth="1.5" />
    <circle cx="50" cy="22" r="2.5" fill="#fda4af" filter="url(#maya-glow)" />

    <line x1="25" y1="36" x2="37" y2="40" stroke="#f472b6" strokeWidth="1.5" />
    <circle cx="25" cy="36" r="2" fill="#f472b6" />

    <line x1="75" y1="36" x2="63" y2="40" stroke="#f472b6" strokeWidth="1.5" />
    <circle cx="75" cy="36" r="2" fill="#f472b6" />

    {/* Dynamic Wireframe Arc across Base */}
    <path
      d="M32 68 Q50 77 68 68"
      stroke="url(#maya-core)"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
      filter="url(#maya-glow)"
    />
    <circle cx="50" cy="74" r="2.5" fill="#ffffff" />
  </svg>
);

/**
 * SVG Vector Artwork for Julian Cruz (Finance Analyst - Capital & Unit Economics)
 */
const JulianCruzAvatarSvg: React.FC<{ size?: number }> = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="julian-core" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6ee7b7" />
        <stop offset="50%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="julian-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <radialGradient id="julian-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
        <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <filter id="julian-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Background Halo */}
    <circle cx="50" cy="50" r="46" fill="url(#julian-halo)" />

    {/* Outer Precision Ticks Ring */}
    <circle
      cx="50"
      cy="50"
      r="43"
      stroke="url(#julian-core)"
      strokeWidth="1.2"
      strokeDasharray="3 3"
      strokeOpacity="0.8"
    />
    <circle cx="50" cy="50" r="38" stroke="#34d399" strokeWidth="0.8" strokeOpacity="0.4" />

    {/* Polyhedral Diamond Matrix Hull */}
    <polygon
      points="50,12 84,38 84,62 50,88 16,62 16,38"
      fill="#081a13"
      stroke="url(#julian-core)"
      strokeWidth="2.5"
    />

    {/* Inner Ledger Vault Structure */}
    <polygon
      points="50,22 75,41 75,59 50,78 25,59 25,41"
      fill="#0d291e"
      stroke="#34d399"
      strokeWidth="1.2"
      strokeOpacity="0.8"
    />

    {/* Quantum Delta / Upward Yield Vectors */}
    {/* Center Diamond / Margin Matrix */}
    <polygon points="50,28 65,47 50,66 35,47" fill="url(#julian-cyan)" opacity="0.85" filter="url(#julian-glow)" />
    <polygon points="50,34 60,47 50,60 40,47" fill="#064e3b" />
    <polygon points="50,38 56,47 50,56 44,47" fill="#ffffff" />

    {/* Algorithmic Frequency Lines */}
    <path
      d="M26 47 L35 47 L42 38 L50 56 L58 42 L65 47 L74 47"
      stroke="#6ee7b7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      filter="url(#julian-glow)"
    />

    {/* Mathematical Balance Vector Nodes */}
    <circle cx="50" cy="18" r="2.5" fill="#34d399" filter="url(#julian-glow)" />
    <circle cx="84" cy="50" r="2" fill="#38bdf8" />
    <circle cx="16" cy="50" r="2" fill="#38bdf8" />
    <circle cx="50" cy="82" r="2.5" fill="#10b981" />

    {/* Unit Economics Shield Ticks */}
    <line x1="38" y1="71" x2="62" y2="71" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * SVG Vector Artwork for Strategic Advisor (Co-Pilot / Founder Intelligence)
 */
const AdvisorAvatarSvg: React.FC<{ size?: number }> = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="advisor-core" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="50%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#38bdf8" />
      </linearGradient>
      <radialGradient id="advisor-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.6" />
        <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <filter id="advisor-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Background Halo */}
    <circle cx="50" cy="50" r="46" fill="url(#advisor-halo)" />
    <circle cx="50" cy="50" r="43" stroke="url(#advisor-core)" strokeWidth="1.2" strokeDasharray="4 4" strokeOpacity="0.8" />

    {/* Neuro-Cortex Hex Shell */}
    <polygon points="50,14 82,32 82,68 50,86 18,68 18,32" fill="#110b24" stroke="url(#advisor-core)" strokeWidth="2.5" />

    {/* Quantum Neural Network Filaments */}
    <circle cx="50" cy="50" r="14" fill="#2e1065" stroke="#a78bfa" strokeWidth="1.5" />
    <circle cx="50" cy="50" r="7" fill="#38bdf8" filter="url(#advisor-glow)" />
    <circle cx="50" cy="50" r="3" fill="#ffffff" />

    {/* Synaptic Radiance Nodes */}
    <circle cx="50" cy="26" r="3" fill="#c084fc" filter="url(#advisor-glow)" />
    <circle cx="70" cy="38" r="3" fill="#38bdf8" filter="url(#advisor-glow)" />
    <circle cx="70" cy="62" r="3" fill="#a78bfa" filter="url(#advisor-glow)" />
    <circle cx="50" cy="74" r="3" fill="#38bdf8" filter="url(#advisor-glow)" />
    <circle cx="30" cy="62" r="3" fill="#c084fc" filter="url(#advisor-glow)" />
    <circle cx="30" cy="38" r="3" fill="#a78bfa" filter="url(#advisor-glow)" />

    {/* Connectors */}
    <line x1="50" y1="26" x2="50" y2="43" stroke="#a78bfa" strokeWidth="1.2" />
    <line x1="70" y1="38" x2="57" y2="46" stroke="#38bdf8" strokeWidth="1.2" />
    <line x1="70" y1="62" x2="57" y2="54" stroke="#a78bfa" strokeWidth="1.2" />
    <line x1="50" y1="74" x2="50" y2="57" stroke="#38bdf8" strokeWidth="1.2" />
    <line x1="30" y1="62" x2="43" y2="54" stroke="#c084fc" strokeWidth="1.2" />
    <line x1="30" y1="38" x2="43" y2="46" stroke="#a78bfa" strokeWidth="1.2" />
  </svg>
);

/**
 * SVG Vector Artwork for Founder (Human-in-the-Loop)
 */
const FounderAvatarSvg: React.FC<{ size?: number }> = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="founder-core" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="50%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
      <radialGradient id="founder-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
        <stop offset="70%" stopColor="#ec4899" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <filter id="founder-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <circle cx="50" cy="50" r="46" fill="url(#founder-halo)" />
    <circle cx="50" cy="50" r="43" stroke="url(#founder-core)" strokeWidth="1.5" />

    {/* Founder Executive Crest Shield */}
    <path
      d="M50 16 L78 28 L78 56 C78 72 50 86 50 86 C50 86 22 72 22 56 L22 28 Z"
      fill="#0f0e1d"
      stroke="url(#founder-core)"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Executive Crown Geometry */}
    <path
      d="M34 38 L42 46 L50 32 L58 46 L66 38 L64 54 L36 54 Z"
      fill="url(#founder-core)"
      filter="url(#founder-glow)"
    />

    {/* Central Core Star */}
    <circle cx="50" cy="65" r="4" fill="#ffffff" filter="url(#founder-glow)" />
    <line x1="50" y1="57" x2="50" y2="73" stroke="#818cf8" strokeWidth="1.5" />
    <line x1="42" y1="65" x2="58" y2="65" stroke="#818cf8" strokeWidth="1.5" />
  </svg>
);

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  roleOrId,
  name,
  size = 'md',
  className = '',
  showStatus = false,
  status = 'active',
  showGlow = false,
  interactive = false,
  showBadge = false,
  badgeLabel,
  mode = 'photo',
  isSpeaking = false,
  audioLevel = 0,
  onClick,
}) => {
  const normalizedKey = normalizeRole(roleOrId || name);
  const theme = AGENT_AVATAR_THEMES[normalizedKey] || AGENT_AVATAR_THEMES.coo;
  const portrait = AGENT_REAL_PORTRAITS[normalizedKey] || AGENT_REAL_PORTRAITS.coo;
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;

  const [imageFailed, setImageFailed] = React.useState(false);
  const isOnline = status === 'active' || status === 'processing' || status === 'in_progress';

  const shouldUsePhoto = mode === 'photo' && !imageFailed && portrait?.photoUrl;

  const renderSvg = () => {
    switch (normalizedKey) {
      case 'coo':
        return <SophiaVanceAvatarSvg size={sizeConfig.iconSize} />;
      case 'researcher':
        return <ArisThorneAvatarSvg size={sizeConfig.iconSize} />;
      case 'pm':
        return <MayaLinAvatarSvg size={sizeConfig.iconSize} />;
      case 'finance':
        return <JulianCruzAvatarSvg size={sizeConfig.iconSize} />;
      case 'advisor':
        return <AdvisorAvatarSvg size={sizeConfig.iconSize} />;
      case 'founder':
        return <FounderAvatarSvg size={sizeConfig.iconSize} />;
      default:
        return <SophiaVanceAvatarSvg size={sizeConfig.iconSize} />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center shrink-0 ${sizeConfig.container} ${
        interactive ? 'cursor-pointer hover:scale-105 transition-all duration-200' : ''
      } ${className}`}
      style={{
        boxShadow: showGlow || isSpeaking ? `0 0 20px ${theme.glowColor}` : undefined,
      }}
      title={name ? `${name} — ${theme.roleTitle}` : theme.roleTitle}
      role={onClick ? 'button' : 'img'}
      aria-label={name ? `${name} avatar` : `${theme.roleTitle} avatar`}
    >
      {/* Speaking Audio Ripple Ring (When AI is speaking aloud) */}
      {isSpeaking && (
        <>
          <div
            className="absolute -inset-2.5 rounded-inherit animate-ping opacity-40 pointer-events-none"
            style={{
              border: `2px solid ${theme.primaryColor}`,
              animationDuration: '1.4s',
            }}
          />
          <div
            className="absolute -inset-1 rounded-inherit opacity-75 pointer-events-none transition-all duration-150"
            style={{
              boxShadow: `0 0 ${12 + (audioLevel || 0.5) * 16}px ${theme.primaryColor}`,
              border: `1.5px solid ${theme.secondaryColor}`,
            }}
          />
        </>
      )}

      {/* Outer Glow Halo on hover/active */}
      {showGlow && !isSpeaking && (
        <div
          className="absolute inset-0 rounded-inherit opacity-40 blur-md pointer-events-none"
          style={{ background: theme.primaryColor }}
        />
      )}

      {/* Avatar Container: Photo or Cybernetic Vector Artwork */}
      <div
        className={`w-full h-full rounded-inherit overflow-hidden bg-gradient-to-br ${theme.bgGradient} border ${
          isSpeaking ? 'border-indigo-400 ring-2 ring-indigo-500/50' : theme.borderGradient
        } shadow-inner flex items-center justify-center relative ${shouldUsePhoto ? 'p-0' : 'p-[5%]'}`}
        style={{
          backgroundColor: theme.darkBg,
        }}
      >
        {shouldUsePhoto ? (
          <div className="w-full h-full relative overflow-hidden rounded-inherit group">
            {/* Real Executive Photographic Portrait */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait.photoUrl}
              alt={name || portrait.name}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="w-full h-full object-cover object-center filter brightness-105 contrast-[1.03] transition-transform duration-300 group-hover:scale-105"
            />

            {/* Subtle Futuristic Holographic Rim Overlay */}
            <div
              className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30 bg-gradient-to-tr"
              style={{
                backgroundImage: `linear-gradient(135deg, ${theme.primaryColor}22 0%, transparent 60%, ${theme.secondaryColor}33 100%)`,
              }}
            />

            {/* Inner Vignette / Rim Shadow */}
            <div className="absolute inset-0 pointer-events-none rounded-inherit shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]" />
          </div>
        ) : (
          <>
            {/* Futuristic Grid / Scanlines Overlay */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
                backgroundSize: '100% 4px',
              }}
            />

            {/* Vector Artwork */}
            {renderSvg()}
          </>
        )}
      </div>

      {/* Status Dot */}
      {showStatus && (
        <span
          className={`absolute ${sizeConfig.statusDot} rounded-full border-2 border-[#0b0c12] ${
            isOnline ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
        >
          {isOnline && (
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
          )}
        </span>
      )}

      {/* Role Badge Chip (Optional) */}
      {showBadge && (
        <span
          className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.2 rounded font-mono font-bold uppercase tracking-wider bg-black/85 text-white border border-white/20 whitespace-nowrap shadow-sm ${sizeConfig.badgeText}`}
        >
          {badgeLabel || normalizedKey.toUpperCase()}
        </span>
      )}
    </div>
  );
};

export default AgentAvatar;
