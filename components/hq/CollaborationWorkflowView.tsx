'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  RotateCcw,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  DollarSign,
  Compass,
  Boxes,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  Cpu,
  Layers,
  UserCheck,
  FastForward,
} from 'lucide-react';
import { AppId } from '@/types/os';
import { CollaborationStore } from '@/lib/collaboration-store';
import { playOSSound } from '../os/IconHelper';
import { AgentAvatar } from '@/components/os/AgentAvatar';

interface CollaborationWorkflowViewProps {
  soundEnabled?: boolean;
  onOpenApp?: (appId: AppId, directive?: string) => void;
}

export const CollaborationWorkflowView: React.FC<CollaborationWorkflowViewProps> = ({
  soundEnabled,
  onOpenApp,
}) => {
  const [collabState, setCollabState] = useState(() => CollaborationStore.getState());

  useEffect(() => {
    const unsub = CollaborationStore.subscribe(() => {
      setCollabState({ ...CollaborationStore.getState() });
    });

    const handleCollabEvent = () => {
      setCollabState({ ...CollaborationStore.getState() });
    };

    window.addEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    return () => {
      unsub();
      window.removeEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    };
  }, []);

  const handleRunFull = () => {
    if (soundEnabled) playOSSound('execute');
    CollaborationStore.runFullSimulation(1500);
  };

  const handleStepForward = () => {
    if (soundEnabled) playOSSound('click');
    CollaborationStore.stepForward();
  };

  const handleCompleteInstantly = () => {
    if (soundEnabled) playOSSound('notification');
    CollaborationStore.completeInstantly();
  };

  const handleReset = () => {
    if (soundEnabled) playOSSound('click');
    CollaborationStore.reset();
  };

  const currentStep = collabState.steps[collabState.currentStepIndex] || collabState.steps[0];

  const agentAvatars: Record<string, { name: string; role: string; color: string; border: string; bg: string }> = {
    pm: {
      name: 'Maya Lin',
      role: 'Principal Product Manager',
      color: 'text-rose-400',
      border: 'border-rose-500/30',
      bg: 'bg-rose-500/10',
    },
    researcher: {
      name: 'Dr. Aris Thorne',
      role: 'Lead AI Researcher',
      color: 'text-amber-400',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
    },
    finance: {
      name: 'Julian Cruz',
      role: 'VP of Finance & Unit Economics',
      color: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
    },
    coo: {
      name: 'Sophia Vance',
      role: 'Chief Operating Officer',
      color: 'text-purple-400',
      border: 'border-purple-500/30',
      bg: 'bg-purple-500/10',
    },
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero / Control Header */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-4 bg-gradient-to-r from-purple-950/30 via-slate-900 to-indigo-950/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-wider text-purple-400 font-bold">
                Core Protocol Simulation
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  collabState.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : collabState.status === 'running'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-white/10'
                }`}
              >
                {collabState.status === 'completed'
                  ? 'All 7 Steps Completed'
                  : collabState.status === 'running'
                  ? `Step ${collabState.currentStepIndex + 1} of 7 Active`
                  : 'Ready to Run'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">
              AI Employee Collaboration: Product ↔ Research ↔ Finance
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Demonstrates end-to-end multi-agent handoffs coordinated by the Orchestrator (Sophia Vance):
              Product Manager requests market analysis from Researcher, who halts to consult Finance for compute budget constraints before delivering final findings and syncing with the Founder.
            </p>
          </div>

          {/* Interactive Playback Toolbar */}
          <div className="flex items-center space-x-2 shrink-0">
            {collabState.status === 'idle' && (
              <>
                <button
                  onClick={handleRunFull}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg transition-all active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Live Simulation</span>
                </button>
                <button
                  onClick={handleStepForward}
                  className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-all"
                  title="Execute Step 1 manually"
                >
                  <span>Step 1</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {collabState.status === 'running' && (
              <>
                <button
                  onClick={handleStepForward}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg transition-all"
                >
                  <span>Step {collabState.currentStepIndex + 1} ➔ {Math.min(7, collabState.currentStepIndex + 2)}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCompleteInstantly}
                  className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold flex items-center space-x-1 transition-all"
                  title="Fast forward remaining steps"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Fast-Forward</span>
                </button>
              </>
            )}

            {collabState.status === 'completed' && (
              <button
                onClick={handleReset}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Simulation</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Agent Collaboration Nodes Flow Map */}
        <div className="pt-3 border-t border-white/10">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Participating AI Employees & Orchestration Bus
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(agentAvatars).map(([agentId, meta]) => {
              const isSpeaker = currentStep?.initiatingAgent === agentId;
              const isTarget = currentStep?.targetAgent === agentId;
              const isActive = isSpeaker || isTarget;

              return (
                <div
                  key={agentId}
                  className={`p-3 rounded-xl border transition-all ${
                    isSpeaker
                      ? 'border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500 shadow-md scale-[1.02]'
                      : isTarget
                      ? 'border-amber-500/50 bg-amber-950/20'
                      : 'border-white/5 bg-black/40 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${meta.color}`}>{meta.name}</span>
                    {isSpeaker && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 animate-pulse">
                        Speaking
                      </span>
                    )}
                    {isTarget && !isSpeaker && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        Target
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{meta.role}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step Progress Tracker (7 Steps) */}
      <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Protocol Progression Matrix
          </span>
          <span className="font-mono text-slate-400 text-[11px]">
            {collabState.currentStepIndex + 1} of 7 Steps Completed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {collabState.steps.map((step, idx) => {
            const isDone = idx < collabState.currentStepIndex || collabState.status === 'completed';
            const isCurrent = idx === collabState.currentStepIndex && collabState.status !== 'completed';

            return (
              <div
                key={step.id}
                className={`p-2.5 rounded-xl border text-[11px] transition-all flex flex-col justify-between ${
                  isDone
                    ? 'border-emerald-500/40 bg-emerald-950/20 text-slate-300'
                    : isCurrent
                    ? 'border-amber-500 bg-amber-950/30 text-white ring-1 ring-amber-500/40'
                    : 'border-white/5 bg-black/30 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] font-bold">0{idx + 1}</span>
                  {isDone ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : isCurrent ? (
                    <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-white/10" />
                  )}
                </div>
                <div className="font-semibold text-[10px] leading-tight line-clamp-2">
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Dialogue & Step Details Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Dialogue Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              Inter-Agent Dialogue Stream (
              {collabState.steps.slice(0, collabState.currentStepIndex + 1).length} Messages Exchanged)
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Channel: #collab-pm-research-finance</span>
          </div>

          <div className="space-y-3">
            {collabState.steps.slice(0, collabState.currentStepIndex + 1).map((stepItem, i) => {
              const msg = stepItem.dialogue;
              const senderKey = msg.from;
              const meta = agentAvatars[senderKey] || {
                name: msg.fromName,
                role: 'AI Executive',
                color: 'text-indigo-400',
                border: 'border-indigo-500/30',
                bg: 'bg-indigo-950/20',
              };

              return (
                <motion.div
                  key={msg.id || `step-diag-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-2.5 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <AgentAvatar roleOrId={senderKey} name={meta.name} size="xs" />
                      <div>
                        <span className={`font-bold text-xs ${meta.color}`}>{meta.name}</span>
                        <span className="text-[10px] text-slate-400 ml-2">➔ {msg.toName}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{msg.timestamp}</span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap pl-8 font-sans">
                    {msg.message}
                  </p>

                  {/* Message Attachment / Evidence */}
                  {msg.attachment && (
                    <div className="ml-8 p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="font-semibold text-slate-300">{msg.attachment.title}</span>
                        <span className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] uppercase">
                          {msg.attachment.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">{msg.attachment.snippet}</div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Cross-App Window Synchronization Callouts */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            Cross-App Updates & Synchronized Artifacts
          </h3>

          {/* 1. Products App Synced */}
          <div className="os-glass-card rounded-2xl p-4 border border-rose-500/30 space-y-2.5 bg-gradient-to-br from-rose-950/20 to-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-rose-400" />
                Products App
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                Roadmap & PRD
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Maya Lin scoped and published <strong>Feature #feat-collab-mem-1: Autonomous Real-Time Memory Tier</strong> with vetted specs.
            </p>
            {onOpenApp && (
              <button
                onClick={() => onOpenApp('products')}
                className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <span>Inspect in Products App</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 2. Research App Synced */}
          <div className="os-glass-card rounded-2xl p-4 border border-amber-500/30 space-y-2.5 bg-gradient-to-br from-amber-950/20 to-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                Research App
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                Market Recon Dossier
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Dr. Aris Thorne archived <strong>Market Intelligence Brief #res-collab-mem-1</strong> including consultation record with Julian Cruz.
            </p>
            {onOpenApp && (
              <button
                onClick={() => onOpenApp('research')}
                className="w-full py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <span>Inspect in Research App</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 3. Finance App Synced */}
          <div className="os-glass-card rounded-2xl p-4 border border-emerald-500/30 space-y-2.5 bg-gradient-to-br from-emerald-950/20 to-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Finance App
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                Budget Guardrail
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Julian Cruz established strict unit economic guardrails: <strong>$0.038 / 1k queries cap</strong> and <strong>84.2% margin floor</strong>.
            </p>
            {onOpenApp && (
              <button
                onClick={() => onOpenApp('finance')}
                className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <span>Inspect in Finance App</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 4. Messages App Collaboration Channel */}
          <div className="os-glass-card rounded-2xl p-4 border border-indigo-500/30 space-y-2.5 bg-gradient-to-br from-indigo-950/20 to-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                Messages App
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                Collab Channel
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Dedicated channel <strong>#collab-pm-research-finance</strong> maintains live stream with full audit trail.
            </p>
            {onOpenApp && (
              <button
                onClick={() => onOpenApp('messages')}
                className="w-full py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <span>Open in Messages App</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
