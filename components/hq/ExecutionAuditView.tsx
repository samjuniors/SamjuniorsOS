'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Layers,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import { OrchestrationRun, AIAgent } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface ExecutionAuditViewProps {
  run: OrchestrationRun;
  agents: AIAgent[];
}

export const ExecutionAuditView: React.FC<ExecutionAuditViewProps> = ({ run, agents }) => {
  const [selectedProtocolFilter, setSelectedProtocolFilter] = useState<string>('all');
  const [selectedMessageEvidence, setSelectedMessageEvidence] = useState<any>(null);

  const filteredMessages = run.messages.filter((m) => {
    if (selectedProtocolFilter === 'all') return true;
    return m.protocolStep === selectedProtocolFilter;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Secondary Technical Execution & Provenance Audit
          </h2>
          <p className="text-xs text-slate-400">
            Inspection view for internal agent message buses, 9-step protocol transitions, and model reasoning logs.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-indigo-400" />
            Gemini 2.5 Multi-Agent Orchestrator
          </span>
        </div>
      </div>

      {/* 9-Step Protocol Tracker */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3">
        <span className="text-xs font-bold text-white tracking-wide block">
          9-Step Agent Work Protocol Execution Pipeline
        </span>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
          {run.plan.map((step) => {
            const isCompleted = (step.status as string) === 'done' || (step.status as string) === 'completed';
            const isInProgress = (step.status as string) === 'in_progress' || (step.status as string) === 'active';

            return (
              <div
                key={step.stage}
                className={`p-2 rounded-xl border text-center transition-all ${
                  isCompleted
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : isInProgress
                    ? 'bg-indigo-950/50 border-indigo-500/50 text-indigo-200 animate-pulse'
                    : 'bg-black/30 border-white/5 text-slate-500'
                }`}
              >
                <div className="text-[9px] font-mono font-bold uppercase">
                  Step {step.stage}
                </div>
                <div className="text-[10px] font-bold truncate mt-0.5" title={step.title}>
                  {step.protocolStep}
                </div>
                <div className="text-[8px] opacity-75 mt-0.5 truncate">
                  {step.agentId}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Message Bus & Protocol Filter */}
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Inter-Agent Message Bus Log</span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs">
            {['all', 'understand', 'research', 'analyze', 'plan', 'build_execute', 'test', 'verify', 'review', 'report'].map(
              (p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProtocolFilter(p)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap transition-colors ${
                    selectedProtocolFilter === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>
        </div>

        {/* Message Stream */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredMessages.map((msg) => {
            const senderAgent = agents.find((a) => a.id === msg.sender);
            return (
              <div
                key={msg.id}
                className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-1.5 font-mono text-xs"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-indigo-300">
                      [{senderAgent?.name || msg.sender.toUpperCase()}]
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-400 uppercase">
                      {msg.protocolStep}
                    </span>
                  </div>
                  <span className="text-slate-500">{msg.timestamp}</span>
                </div>

                <p className="text-slate-200 text-[11px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                {msg.provenance && (
                  <div className="pt-1 border-t border-white/5 flex justify-end">
                    <button
                      onClick={() => setSelectedMessageEvidence(msg)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Grounding Proof ({msg.provenance.evidenceBasis})</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedMessageEvidence && (
        <EvidenceModal
          isOpen={!!selectedMessageEvidence}
          onClose={() => setSelectedMessageEvidence(null)}
          title={`Inter-Agent Message: Step ${selectedMessageEvidence.protocolStep}`}
          provenance={selectedMessageEvidence.provenance}
          sourceText={selectedMessageEvidence.text}
          details="Verified across council consensus and constitutional safety filters."
        />
      )}
    </div>
  );
};
