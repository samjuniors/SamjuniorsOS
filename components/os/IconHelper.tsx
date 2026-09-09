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

export type OSSoundType =
  | 'click'
  | 'open'
  | 'notification'
  | 'execute'
  | 'startup'
  | 'pop'
  | 'copy'
  | 'menu'
  | 'react'
  | 'dismiss'
  | 'minimize'
  | 'celebration'
  | 'alert';

export function playOSSound(type: OSSoundType) {
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
    } else if (type === 'minimize') {
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.06);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'menu') {
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.05);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'copy') {
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.setValueAtTime(840, now + 0.04);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'react') {
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(1020, now + 0.06);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'pop') {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.06);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'dismiss') {
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.06);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
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
    } else if (type === 'celebration') {
      // Rising major arpeggio (C5-E5-G5-C6) — success / completion feedback.
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const t = now + i * 0.09;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.05, t);
      });
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (type === 'alert') {
      // Double low buzz — error / warning feedback.
      osc.frequency.setValueAtTime(196, now);
      osc.frequency.setValueAtTime(196, now + 0.16);
      osc.type = 'square';
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.setValueAtTime(0.0001, now + 0.13);
      gain.gain.setValueAtTime(0.04, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch {
    // Audio context may be restricted before user gesture
  }
}

import { OSNotification } from '@/types/os';
import { NotificationStore } from '@/lib/notification-center';

export function dispatchOSNotification(notification: Omit<OSNotification, 'id' | 'time' | 'read'>) {
  if (typeof window !== 'undefined') {
    return NotificationStore.dispatch({
      title: notification.title,
      message: notification.message,
      type: notification.type,
      category: notification.category,
      priority: notification.priority,
      agent: notification.agent,
      actionable: notification.actionable,
      actionLabel: notification.actionLabel,
      appTarget: notification.appTarget,
      metadata: notification.metadata,
    });
  }
}
