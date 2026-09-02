import React from 'react';
import {
  Bot,
  BrainCircuit,
  Building2,
  Users,
  Compass,
  Boxes,
  TrendingUp,
  Sliders,
  Terminal,
  FileEdit,
  Sparkles,
  Search,
  Wifi,
  Bell,
  Volume2,
  VolumeX,
  Battery,
  Shield,
  Clock,
  Calendar,
  Layers,
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  ChevronRight,
  ChevronDown,
  Activity,
  Send,
  MessageSquare,
  FileText,
  DollarSign,
  Briefcase,
  Check,
  Copy,
  FolderOpen,
  Power,
  Lock,
  Moon,
  Sun,
  Globe,
  Plus,
  RefreshCw,
  ExternalLink,
  LucideIcon
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  BrainCircuit,
  Building2,
  Users,
  Compass,
  Boxes,
  TrendingUp,
  Sliders,
  Terminal,
  FileEdit,
  Sparkles,
  Search,
  Wifi,
  Bell,
  Volume2,
  VolumeX,
  Battery,
  Shield,
  Clock,
  Calendar,
  Layers,
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  ChevronRight,
  ChevronDown,
  Activity,
  Send,
  MessageSquare,
  FileText,
  DollarSign,
  Briefcase,
  Check,
  Copy,
  FolderOpen,
  Power,
  Lock,
  Moon,
  Sun,
  Globe,
  Plus,
  RefreshCw,
  ExternalLink,
};

export function getAppIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Bot;
}

export function playOSSound(type: 'click' | 'open' | 'notification' | 'execute' | 'startup') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'click') {
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'open') {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'notification') {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'execute') {
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(960, now + 0.15);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'startup') {
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch {
    // Audio context may be restricted before user gesture
  }
}

import { OSNotification } from '@/types/os';

export function dispatchOSNotification(notification: Omit<OSNotification, 'id' | 'time' | 'read'>) {
  if (typeof window !== 'undefined') {
    const detail: OSNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false,
    };
    window.dispatchEvent(new CustomEvent('samjuniors-os-notification', { detail }));
  }
}
