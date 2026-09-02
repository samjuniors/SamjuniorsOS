'use client';

import React from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Users,
  Target,
  FileCheck,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Boxes,
  Zap,
} from 'lucide-react';
import { AIAgent, CompanyInitiative } from '@/types/os';

interface CompanyPulseSectionProps {
  agents: AIAgent[];
  initiatives: CompanyInitiative[];
  pendingDecisionsCount: number;
  completedDeliverablesCount: number;
  onSelectAgent: (agentId: string) => void;
  onSelectTab: (tab: 'employees' | 'work' | 'decisions' | 'audit') => void;
}

export const CompanyPulseSection: React.FC<CompanyPulseSectionProps> = ({
  agents,
  initiatives,
  pendingDecisionsCount,
  completedDeliverablesCount,
  onSelectAgent,
  onSelectTab,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Company Pulse
          </h2>
          <p className="text-xs text-slate-400">
            Real-time operational status across active initiatives, executive leadership, and governance.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          All Systems Coordinated
        </span>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Active Initiatives */}
        <div
          onClick={() => onSelectTab('work')}
          className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 hover:border-blue-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-300">Active Work</span>
            <Target className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-bold text-white font-mono">{initiatives.length}</div>
          <div className="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
            <span>Initiatives in progress</span>
            <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Executive Officers */}
        <div
          onClick={() => onSelectTab('employees')}
          className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 hover:border-indigo-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-300">Executive Team</span>
            <Users className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-bold text-white font-mono">{agents.length}</div>
          <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>4 Officers online</span>
          </div>
        </div>

        {/* Pending Decisions */}
        <div
          onClick={() => onSelectTab('decisions')}
          className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 hover:border-amber-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-300">Decisions</span>
            <AlertTriangle className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-bold text-white font-mono">{pendingDecisionsCount}</div>
          <div className="text-[10px] text-amber-400 mt-1">Pending Founder sign-off</div>
        </div>

        {/* Authored Deliverables */}
        <div
          onClick={() => onSelectTab('work')}
          className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 hover:border-emerald-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-300">Deliverables</span>
            <FileCheck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-bold text-white font-mono">{completedDeliverablesCount}</div>
          <div className="text-[10px] text-slate-400 mt-1">Verified company documents</div>
        </div>
      </div>

      {/* Real Leadership Employee Row */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white tracking-wide">
            Executive Officers & Current Objectives
          </span>
          <button
            onClick={() => onSelectTab('employees')}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
          >
            <span>View Full Directory</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className="bg-black/30 hover:bg-white/5 border border-white/5 hover:border-white/15 rounded-xl p-3 cursor-pointer transition-all space-y-2 group"
            >
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-xl bg-gradient-to-br ${agent.avatarColor} flex items-center justify-center text-white font-bold text-xs shadow-md group-hover:scale-105 transition-transform`}
                >
                  {agent.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">{agent.name}</h4>
                  <p className="text-[10px] text-slate-400 truncate">{agent.role}</p>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed bg-black/40 p-2 rounded-lg border border-white/5">
                <span className="text-slate-500 font-medium block text-[9px] uppercase tracking-wider mb-0.5">Focus:</span>
                {agent.currentTask}
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/5 text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Active
                </span>
                <span className="font-mono text-slate-400">{agent.department.split('&')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
