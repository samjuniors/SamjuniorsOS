'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Sparkles, Bot, Building2, Users, Compass, Boxes, TrendingUp, Sliders, ArrowRight } from 'lucide-react';
import { AppId, AgentRole } from '@/types/os';
import { APPS_CONFIG, INITIAL_AGENTS } from '@/lib/os-data';
import { GovernanceStore } from '@/lib/governance-store';
import { playOSSound } from './IconHelper';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApp: (id: AppId) => void;
  onDispatchDirective: (dir: string) => void;
  soundEnabled: boolean;
  onInspectEmployee?: (agentId: AgentRole) => void;
}

export const SpotlightSearch: React.FC<SpotlightSearchProps> = ({
  isOpen,
  onClose,
  onOpenApp,
  onDispatchDirective,
  soundEnabled,
  onInspectEmployee,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredApps = APPS_CONFIG.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()) || a.category.toLowerCase().includes(query.toLowerCase())
  );

  const filteredAgents = INITIAL_AGENTS.filter((ag) =>
    ag.name.toLowerCase().includes(query.toLowerCase()) || ag.role.toLowerCase().includes(query.toLowerCase())
  );

  const filteredDecisions = GovernanceStore.getDecisions().filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase()) || d.category.toLowerCase().includes(query.toLowerCase())
  );

  const filteredAttention = GovernanceStore.getAttentionItems().filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase()) || a.type.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectApp = (id: AppId) => {
    if (soundEnabled) playOSSound('click');
    setQuery('');
    onOpenApp(id);
    onClose();
  };

  const handleDispatch = (text: string) => {
    if (soundEnabled) playOSSound('execute');
    setQuery('');
    onDispatchDirective(text);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-md"
      onClick={() => {
        setQuery('');
        onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl os-glass rounded-2xl border border-white/25 shadow-2xl overflow-hidden"
      >
        {/* Input Bar */}
        <div className="p-4 border-b border-white/10 flex items-center space-x-3 bg-black/40">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            id="spotlight-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                onClose();
              }
              if (e.key === 'Enter' && query.trim()) {
                handleDispatch(query.trim());
              }
            }}
            placeholder="Search OS apps, AI agents, or press Enter to dispatch directive..."
            className="w-full bg-transparent border-none text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <span className="text-[10px] font-mono text-slate-400 bg-white/10 px-2 py-0.5 rounded">ESC</span>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4 text-xs">
          {/* Direct AI Action prompt */}
          {query.trim() && (
            <button
              onClick={() => handleDispatch(query.trim())}
              className="w-full p-3 rounded-xl bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-indigo-500/40 text-left flex items-center justify-between group hover:from-indigo-900/80 hover:to-purple-900/80 transition-all"
            >
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-indigo-300 animate-pulse" />
                <div>
                  <div className="font-bold text-white">Dispatch Directive to AI Workforce</div>
                  <div className="text-[11px] text-indigo-300 truncate">&ldquo;{query.trim()}&rdquo;</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-300 group-hover:translate-x-1 transition-transform" />
            </button>
          )}

          {/* Apps */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-2 mb-1">
              Applications
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {filteredApps.map((app) => (
                <button
                  key={app.id}
                  id={`spotlight-app-${app.id}`}
                  onClick={() => handleSelectApp(app.id)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left flex items-center space-x-2.5 transition-colors"
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${app.color} flex items-center justify-center text-white`}>
                    <span className="text-xs font-bold">{app.name[0]}</span>
                  </div>
                  <div className="truncate">
                    <div className="font-semibold text-white text-xs truncate">{app.name}</div>
                    <div className="text-[10px] text-slate-400">{app.category}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* AI Executives */}
          {filteredAgents.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-2 mb-1">
                AI Executives (Conversations)
              </span>
              <div className="space-y-1">
                {filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      if (soundEnabled) playOSSound('click');
                      setQuery('');
                      onClose();
                      if (onInspectEmployee) {
                        onInspectEmployee(agent.id as AgentRole);
                      } else {
                        handleSelectApp('messages');
                      }
                    }}
                    className="w-full p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${agent.avatarColor} flex items-center justify-center text-[10px] font-bold text-white`}>
                        {agent.name[0]}
                      </div>
                      <div>
                        <span className="font-semibold text-white text-xs group-hover:text-indigo-200">{agent.name}</span>
                        <span className="text-[10px] text-indigo-400 ml-1.5">{agent.role}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 capitalize">Inspect Profile →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Company Items */}
          {(filteredDecisions.length > 0 || filteredAttention.length > 0) && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-2 mb-1">
                Company Items (HQ)
              </span>
              <div className="space-y-1">
                {filteredDecisions.slice(0, 3).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleSelectApp('company')}
                    className="w-full p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left flex items-center space-x-2.5 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <div className="truncate">
                      <div className="font-semibold text-white text-xs truncate">{d.title}</div>
                      <div className="text-[10px] text-slate-400">Decision • {d.status}</div>
                    </div>
                  </button>
                ))}
                {filteredAttention.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelectApp('company')}
                    className="w-full p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left flex items-center space-x-2.5 transition-colors"
                  >
                    <Search className="w-4 h-4 text-amber-400" />
                    <div className="truncate">
                      <div className="font-semibold text-white text-xs truncate">{a.title}</div>
                      <div className="text-[10px] text-slate-400">Attention Item • {a.status}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
