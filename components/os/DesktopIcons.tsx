'use client';

import React from 'react';
import { motion } from 'motion/react';
import { APPS_CONFIG, INITIAL_AGENTS, INITIAL_FINANCIALS } from '@/lib/os-data';
import { AppId } from '@/types/os';
import { getAppIcon, playOSSound } from './IconHelper';
import { Sparkles, ArrowRight, Zap, TrendingUp, Send } from 'lucide-react';

interface DesktopIconsProps {
  openApp: (id: AppId) => void;
  soundEnabled: boolean;
  onQuickDirective: (directive: string) => void;
  onAppContextMenu?: (e: React.MouseEvent, app: any) => void;
}

export const DesktopIcons: React.FC<DesktopIconsProps> = ({
  openApp,
  soundEnabled,
  onQuickDirective,
  onAppContextMenu,
}) => {
  const [quickInput, setQuickInput] = React.useState('');

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    if (soundEnabled) playOSSound('execute');
    onQuickDirective(quickInput.trim());
    setQuickInput('');
  };

  return (
    <div className="absolute inset-0 pt-10 pb-20 sm:pt-12 sm:pb-24 px-3 sm:px-6 md:px-12 flex flex-col justify-between pointer-events-none z-10 select-none overflow-y-auto sm:overflow-hidden">
      {/* Top / Main Section */}
      <div className="w-full flex flex-col lg:flex-row items-center lg:items-start justify-between gap-4 sm:gap-6 pointer-events-auto">
        
        {/* Mobile-Only Top Compact Company Pulse Widget */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex md:hidden w-full bg-[#121218]/90 backdrop-blur-2xl rounded-2xl p-3 border border-white/10 shadow-xl items-center justify-between"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-bold text-white tracking-wide">
                  Company Headquarters
                </span>
              </div>
              <div className="text-xs font-mono text-emerald-400 font-bold">
                4 Executive Officers <span className="text-[9px] text-slate-400 font-normal">Active & Online</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => openApp('workforce')}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold flex items-center space-x-1 hover:bg-indigo-500/30 active:scale-95 transition-all"
          >
            <span>Open HQ</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </motion.div>

        {/* App Icons Grid */}
        <div className="w-full grid grid-cols-4 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6 max-w-xl">
          {APPS_CONFIG.map((app, index) => {
            const Icon = getAppIcon(app.iconName);
            return (
              <motion.button
                id={`desktop-icon-${app.id}`}
                key={app.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.25 }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  if (soundEnabled) playOSSound('open');
                  openApp(app.id);
                }}
                onContextMenu={(e) => onAppContextMenu?.(e, app)}
                className="group flex flex-col items-center text-center p-1.5 sm:p-2 rounded-2xl hover:bg-white/5 active:bg-white/10 backdrop-blur-sm transition-all cursor-pointer focus:outline-none"
              >
                <div
                  className="w-14 h-14 sm:w-16 sm:h-16 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl flex items-center justify-center transition-all group-hover:bg-white/10 group-hover:border-white/20 group-active:scale-95 relative"
                >
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-sm" />
                  </div>
                  
                  {/* Live indicator on Workforce */}
                  {app.id === 'workforce' && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 sm:h-3.5 sm:w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 bg-emerald-500 border-2 border-[#0a0a0f]" />
                    </span>
                  )}
                </div>

                <span className="text-[10px] sm:text-[11px] mt-1.5 sm:mt-2 font-medium tracking-tight sm:tracking-wide text-slate-200 group-hover:text-white transition-colors truncate max-w-[72px] sm:max-w-[84px]">
                  {app.name}
                </span>
                <span className="text-[9px] text-slate-500 hidden sm:block truncate max-w-[80px]">
                  {app.category.split(' ')[0]}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Desktop-Only Executive Hub & Live Company Pulse Widget */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="hidden md:flex flex-col w-full max-w-sm bg-[#121218]/90 backdrop-blur-2xl rounded-xl p-4 border border-white/10 shadow-2xl space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-widest">
                Company Pulse
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
              Safe Sandboxing Enforced
            </span>
          </div>

          {/* Key Status row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Active Initiatives</span>
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-base font-mono font-bold text-white mt-1">
                4 Projects
              </div>
              <div className="text-[9px] text-emerald-400 mt-0.5">All Streams Nominal</div>
            </div>

            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Executive Team</span>
                <Zap className="w-3 h-3 text-indigo-400" />
              </div>
              <div className="text-base font-mono font-bold text-indigo-300 mt-1">
                4 Officers
              </div>
              <div className="text-[9px] text-indigo-300 mt-0.5">Online & Coordinated</div>
            </div>
          </div>

          {/* Quick Agent Status Pill */}
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-indigo-200">
                Executive Leadership
              </span>
              <button
                onClick={() => openApp('workforce')}
                className="text-[10px] text-indigo-400 hover:text-indigo-200 flex items-center gap-0.5 font-medium"
              >
                Open HQ <ArrowRight className="w-2.5 h-2.5" />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              {INITIAL_AGENTS.map((agent) => (
                <div
                  key={agent.id}
                  title={`${agent.name} (${agent.role}): ${agent.status}`}
                  className="flex-1 p-1.5 rounded-md bg-black/40 border border-white/5 text-center"
                >
                  <div className="text-[9px] font-bold text-slate-300 truncate">
                    {agent.name.split(' ')[0]}
                  </div>
                  <div className="text-[8px] text-emerald-400 flex items-center justify-center gap-0.5 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    Live
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Center: Direct Founder Prompt Bar */}
      <div className="w-full flex justify-center pointer-events-auto mb-1 sm:mb-2">
        <motion.form
          onSubmit={handleQuickSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="w-full max-w-xl bg-black/50 backdrop-blur-2xl rounded-xl p-1 sm:p-1.5 flex items-center space-x-2 border border-white/10 shadow-2xl hover:border-indigo-500/30 transition-all focus-within:border-indigo-500/50"
        >
          <div className="pl-2 sm:pl-3 text-indigo-400 flex items-center">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
          </div>
          <input
            id="desktop-quick-prompt-input"
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Direct COO command (Strategy, Intel, PRDs, Finance)..."
            className="flex-1 bg-transparent text-[11px] sm:text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none py-1.5 sm:py-2"
          />
          <div className="hidden sm:flex items-center px-2 py-1 bg-white/5 rounded text-[9px] font-bold text-slate-500">
            ⌘ ENT
          </div>
          <button
            id="desktop-quick-prompt-submit"
            type="submit"
            disabled={!quickInput.trim()}
            className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] sm:text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all active:scale-95"
          >
            <span>Dispatch</span>
            <Send className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          </button>
        </motion.form>
      </div>
    </div>
  );
};
