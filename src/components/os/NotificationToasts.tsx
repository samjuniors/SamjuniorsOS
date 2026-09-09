'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Sparkles,
  Shield,
  Building2,
  DollarSign,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  X,
  ExternalLink,
  Bot,
  Zap,
} from 'lucide-react';
import { AppId, OSNotification } from '@/types/os';
import { ToastItem, NotificationStore } from '@/lib/notification-center';
import { playOSSound } from './IconHelper';

interface NotificationToastsProps {
  toasts: ToastItem[];
  onOpenApp?: (appId: AppId) => void;
  soundEnabled: boolean;
}

export const NotificationToasts: React.FC<NotificationToastsProps> = ({
  toasts,
  onOpenApp,
  soundEnabled,
}) => {
  const getCategoryIcon = (notification: OSNotification) => {
    if (notification.category === 'ai_employee' || notification.type === 'agent') {
      return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
    }
    if (notification.category === 'company_update' || notification.type === 'company' || notification.type === 'deal') {
      return <Building2 className="w-3.5 h-3.5 text-rose-400" />;
    }
    if (notification.type === 'finance') {
      return <DollarSign className="w-3.5 h-3.5 text-emerald-400" />;
    }
    return <Zap className="w-3.5 h-3.5 text-amber-400" />;
  };

  const getPriorityBadge = (priority?: string) => {
    if (priority === 'critical') {
      return (
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
          CRITICAL
        </span>
      );
    }
    if (priority === 'high') {
      return (
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
          HIGH
        </span>
      );
    }
    return null;
  };

  const getCategoryLabel = (notification: OSNotification) => {
    if (notification.category === 'ai_employee') return 'AI Employee';
    if (notification.category === 'company_update') return 'Company Update';
    if (notification.category === 'system_event') return 'System Event';
    return notification.type.toUpperCase();
  };

  return (
    <div
      id="os-notification-toast-container"
      className="fixed top-10 right-4 z-50 flex flex-col space-y-2.5 pointer-events-none max-w-sm w-full select-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const { notification } = toast;
          const isCritical = notification.priority === 'critical';

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.94, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.92, x: 40, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              onMouseEnter={() => NotificationStore.pauseToast(toast.id)}
              onMouseLeave={() => NotificationStore.resumeToast(toast.id)}
              className={`pointer-events-auto w-full rounded-xl p-3.5 backdrop-blur-2xl shadow-2xl border transition-all relative overflow-hidden group ${
                isCritical
                  ? 'bg-slate-950/95 border-rose-500/40 shadow-rose-950/50'
                  : 'bg-slate-950/90 border-white/15 shadow-black/80 hover:border-white/25'
              }`}
            >
              {/* Subtle accent glow border on top */}
              <div
                className={`absolute top-0 left-0 right-0 h-0.5 ${
                  isCritical
                    ? 'bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500'
                    : notification.category === 'ai_employee'
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500'
                    : notification.category === 'company_update'
                    ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500'
                    : 'bg-gradient-to-r from-cyan-500 via-emerald-500 to-indigo-500'
                }`}
              />

              {/* Header row: Category, Origin Agent, Priority, Close */}
              <div className="flex items-center justify-between gap-2 pb-1.5">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                    {getCategoryIcon(notification)}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider truncate">
                    {getCategoryLabel(notification)}
                  </span>
                  {notification.agent && (
                    <span className="text-[10px] text-slate-500 truncate hidden sm:inline">
                      • {notification.agent}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  {getPriorityBadge(notification.priority)}
                  <button
                    id={`toast-dismiss-${toast.id}`}
                    onClick={() => {
                      if (soundEnabled) playOSSound('click');
                      NotificationStore.dismissToast(toast.id);
                    }}
                    title="Dismiss alert"
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Title & Body */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white tracking-tight leading-snug">
                  {notification.title}
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                  {notification.message}
                </p>
              </div>

              {/* Bottom Actions Row */}
              <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-white/5 text-[10px]">
                <span className="text-slate-500 font-mono">{notification.time}</span>

                <div className="flex items-center space-x-2">
                  {notification.appTarget && onOpenApp && (
                    <button
                      id={`toast-action-${toast.id}`}
                      onClick={() => {
                        if (soundEnabled) playOSSound('open');
                        NotificationStore.markAsRead(notification.id);
                        NotificationStore.dismissToast(toast.id);
                        onOpenApp(notification.appTarget!);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all flex items-center gap-1 shadow-sm shadow-indigo-600/30 active:scale-95"
                    >
                      <span>{notification.actionLabel || 'Open App'}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Countdown progress indicator bar */}
              {!toast.isPaused && (
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 origin-left"
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
