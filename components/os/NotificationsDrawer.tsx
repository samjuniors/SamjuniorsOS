'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Bell, Check, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { OSNotification } from '@/types/os';
import { playOSSound } from './IconHelper';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: OSNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  soundEnabled: boolean;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onDismiss,
  onClearAll,
  soundEnabled,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute top-9 right-8 w-84 os-glass rounded-2xl p-4 border border-white/20 shadow-2xl space-y-3 text-xs text-slate-100"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-white text-xs">Autonomous Alerts</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300">
              {notifications.length}
            </span>
          </div>

          {notifications.length > 0 && (
            <button
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                onClearAll();
              }}
              className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1 relative group"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-[11px]">{notif.title}</span>
                <span className="text-[9px] font-mono text-slate-400">{notif.time}</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">{notif.message}</p>
              <div className="flex items-center justify-between pt-1 text-[10px] text-indigo-400 font-mono">
                <span>From: {notif.agent || notif.type.toUpperCase()}</span>
                <button
                  onClick={() => {
                    if (soundEnabled) playOSSound('click');
                    onDismiss(notif.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {notifications.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-xs">
              All clear. No pending autonomous alerts.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
