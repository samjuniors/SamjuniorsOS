'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Calendar as CalIcon, Clock, CheckCircle2, Users, ArrowRight } from 'lucide-react';

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkforce?: () => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({ isOpen, onClose, onOpenWorkforce }) => {
  if (!isOpen) return null;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const events: Array<{ time: string; title: string; agents: string; status: string }> = [];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute top-9 right-16 w-88 os-glass rounded-2xl p-4 border border-white/20 shadow-2xl space-y-4 text-xs text-slate-100"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <CalIcon className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-white text-xs">Executive Schedule</span>
          </div>
          <span className="text-[10px] font-mono text-indigo-300">Live AI Sync</span>
        </div>

        <div className="text-sm font-bold text-white">{dateStr}</div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-4 rounded-xl bg-black/30 border border-dashed border-white/10 text-center space-y-2">
              <Clock className="w-5 h-5 text-slate-500 mx-auto" />
              <div className="text-slate-300 font-semibold text-xs">No Meetings Scheduled</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The Executive Council operates continuously on-demand. Dispatch directives or schedule synchronous council syncs anytime.
              </p>
            </div>
          ) : (
            events.map((ev, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">{ev.title}</span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
                      ev.status === 'Completed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    {ev.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {ev.time}
                  </span>
                  <span>{ev.agents}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {onOpenWorkforce && (
          <button
            onClick={() => {
              onOpenWorkforce();
              onClose();
            }}
            className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-1 transition-colors"
          >
            <span>Dispatch Synchronous Sync</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </motion.div>
    </div>
  );
};
