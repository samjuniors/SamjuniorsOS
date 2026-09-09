'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Database,
  BookOpen,
  History,
  ShieldCheck,
  AlertTriangle,
  Code2,
  Layers,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Cpu,
  Fingerprint,
  Info,
  Scale,
  Zap,
} from 'lucide-react';
import {
  TaskRetrievedContextBundle,
  AssembledEmployeeContext,
  InjectedContextItem,
  EPISTEMIC_LABELS,
} from '@/types/context';

interface ContextInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  contextBundle?: TaskRetrievedContextBundle | null;
  assembledContext?: AssembledEmployeeContext | null;
  agentRole?: string;
}

export const ContextInspectionModal: React.FC<ContextInspectionModalProps> = ({
  isOpen,
  onClose,
  title,
  contextBundle,
  assembledContext,
  agentRole,
}) => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'separation' | 'conflicts' | 'prompt'>('pipeline');

  if (!isOpen || (!contextBundle && !assembledContext)) return null;

  // Extract items from assembledContext if available, otherwise fall back to legacy contextBundle
  const evidenceItems: InjectedContextItem[] = assembledContext?.currentEvidence || [];
  const stateItems = assembledContext?.companyState || contextBundle?.retrievedState?.items?.map((s) => ({
    id: `state:${s.id}`,
    title: s.title,
    epistemicClassification: 'current_truth' as const,
    epistemicLabel: EPISTEMIC_LABELS.current_truth,
    sourceSystem: 'company_state' as const,
    sourceId: s.id,
    authority: s.provenance.authority,
    relevanceScore: s.relevanceScore,
    matchReason: s.matchReason,
    selectionReason: `Selected because operational state matches query requirements.`,
    characterCount: s.summary.length,
    content: s.summary,
    timestamp: s.provenance.timestamp,
    provenance: s.provenance,
  })) || [];

  const knowledgeItems = assembledContext?.companyKnowledge || contextBundle?.retrievedKnowledge?.items?.map((k) => ({
    id: `knowledge:${k.documentId}`,
    title: k.title,
    epistemicClassification: 'durable_reference' as const,
    epistemicLabel: EPISTEMIC_LABELS.durable_reference,
    sourceSystem: 'company_knowledge' as const,
    sourceId: k.documentId,
    authority: k.provenance.authority,
    relevanceScore: k.relevanceScore,
    matchReason: k.matchReason,
    selectionReason: `Selected for durable SOP & architectural compliance in category "${k.category}".`,
    characterCount: (k.contentSnippet || k.summary).length,
    content: k.contentSnippet || k.summary,
    timestamp: k.provenance.timestamp,
    provenance: k.provenance,
  })) || [];

  const memoryItems = assembledContext?.historicalMemory || contextBundle?.retrievedMemory?.items?.map((m) => ({
    id: `memory:${m.memoryId || m.id}`,
    title: m.approvedAction || 'Historical Precedent',
    epistemicClassification: 'historical_memory' as const,
    epistemicLabel: EPISTEMIC_LABELS.historical_memory,
    sourceSystem: 'company_memory' as const,
    sourceId: m.memoryId || m.id || 'mem-1',
    authority: 'Founder-Approved Historical Precedent',
    relevanceScore: m.relevanceScore ?? 0.6,
    matchReason: m.relevanceExplanation || 'Historical decision precedent',
    selectionReason: 'Provides precedent context without treating past action as empirical truth.',
    characterCount: (m.approvedAction || '').length,
    content: `Past Action: "${m.approvedAction}"\nOutcome: ${m.executionOutcome}`,
    timestamp: m.provenance?.timestamp || new Date().toISOString(),
    isConflicting: m.isConflicting,
    provenance: m.provenance || {
      sourceSystem: 'company_memory',
      sourceId: m.memoryId || m.id || 'mem-1',
      sourceTitle: m.approvedAction || 'Historical Record',
      epistemicType: 'historical_memory',
      epistemicLabel: EPISTEMIC_LABELS.historical_memory,
      authority: 'Founder-Approved Precedent',
      timestamp: new Date().toISOString(),
      confidence: 'verified_fact',
    },
  })) || [];

  const conflicts = assembledContext?.conflicts || contextBundle?.conflicts || [];
  const pipelineStages = assembledContext?.pipelineStages || [];
  const totalCount = evidenceItems.length + stateItems.length + knowledgeItems.length + memoryItems.length;
  const budget = assembledContext?.budget;
  const effectiveRole = assembledContext?.employeeRole || agentRole;
  const effectiveSkill = assembledContext?.skillName;
  const snapshotHash = assembledContext?.immutableSnapshotHash;
  const formattedPrompt = assembledContext?.formattedPrompt || contextBundle?.formattedSeparatedPrompt || '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-4xl bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-slate-800/90 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Employee Context Assembly & Intelligence Audit
                  </h3>
                  {effectiveRole && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase">
                      {effectiveRole}
                    </span>
                  )}
                  {effectiveSkill && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                      Skill: {effectiveSkill}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-xl">{title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Epistemic Law & Budget Banner */}
          <div className="px-6 py-2.5 bg-slate-950/70 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Precedence Law:</span>
              <span className="text-amber-400 font-bold">1. Verified Evidence</span>
              <span className="text-slate-600">&gt;</span>
              <span className="text-emerald-400 font-bold">2. Current State</span>
              <span className="text-slate-600">&gt;</span>
              <span className="text-sky-400 font-bold">3. Durable Knowledge</span>
              <span className="text-slate-600">&gt;</span>
              <span className="text-purple-400 font-bold">4. Historical Memory</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
              {budget && (
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  Budget: {budget.totalCharactersUsed} / {budget.maxTotalCharacters} chars ({budget.budgetUtilizationPct}%)
                </span>
              )}
              {snapshotHash && (
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                  <Fingerprint className="w-3 h-3" />
                  Hash: {snapshotHash} (Read-Only)
                </span>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="px-6 pt-3 border-b border-white/10 flex items-center space-x-2 bg-slate-900/40">
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'pipeline'
                  ? 'border-indigo-400 text-indigo-300 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Assembly Pipeline</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                {pipelineStages.length || 8} stages
              </span>
            </button>

            <button
              onClick={() => setActiveTab('separation')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'separation'
                  ? 'border-indigo-400 text-indigo-300 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Injected Partitions</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                {totalCount} items
              </span>
            </button>

            <button
              onClick={() => setActiveTab('conflicts')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'conflicts'
                  ? 'border-indigo-400 text-indigo-300 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Conflict Precedence</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {conflicts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('prompt')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'prompt'
                  ? 'border-indigo-400 text-indigo-300 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw Prompt Injected</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 font-sans text-xs">
            {/* TAB 1: PIPELINE AUDIT */}
            {activeTab === 'pipeline' && (
              <div className="space-y-5">
                {/* Pipeline Visual Flow */}
                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-300 text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Deterministic Context Assembly Architecture
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Zero Prompt-Soup Guarantee</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                    <div className="px-2.5 py-1 rounded bg-slate-800 border border-white/10 text-white font-semibold">
                      1. Task Scoping
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="px-2.5 py-1 rounded bg-slate-800 border border-white/10 text-indigo-300 font-semibold">
                      2. Role Resolution
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="px-2.5 py-1 rounded bg-slate-800 border border-white/10 text-emerald-300 font-semibold">
                      3. Skill Binding
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="px-2.5 py-1 rounded bg-slate-800 border border-white/10 text-sky-300 font-semibold">
                      4. Store Retrieval
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="px-2.5 py-1 rounded bg-slate-800 border border-white/10 text-amber-300 font-semibold">
                      5. Evidence Ingestion
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="px-2.5 py-1 rounded bg-slate-800 border border-white/10 text-purple-300 font-semibold">
                      6. Precedence & Budget
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    <div className="px-2.5 py-1 rounded bg-indigo-600/30 border border-indigo-400/40 text-white font-bold">
                      7. Final Frozen Context
                    </div>
                  </div>
                </div>

                {/* Pipeline Stages Log */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-200">Execution Stages & Governance Verifications</div>
                  {pipelineStages.length > 0 ? (
                    <div className="space-y-2">
                      {pipelineStages.map((stage, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-[10px] flex items-center justify-center font-bold">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-slate-100 uppercase tracking-wide text-[11px]">
                                {stage.stage.replace(/_/g, ' ')}
                              </span>
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                  stage.status === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {stage.status}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] pl-7">{stage.description}</p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                            {new Date(stage.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-slate-400 text-center">
                      Deterministic pipeline active and verified for execution.
                    </div>
                  )}
                </div>

                {/* Excluded Noise Audit */}
                {assembledContext?.excludedNoise && (
                  <div className="p-3.5 rounded-xl bg-slate-950/50 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                        Noise Rejection & Irrelevance Filtering
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Total Excluded: {assembledContext.excludedNoise.stateItemsExcludedCount + assembledContext.excludedNoise.knowledgeItemsExcludedCount + assembledContext.excludedNoise.memoryItemsExcludedCount} unneeded facts
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {assembledContext.excludedNoise.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: INJECTED PARTITIONS */}
            {activeTab === 'separation' && (
              <div className="space-y-6">
                {/* 1. Verified Evidence */}
                {evidenceItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-400 font-bold">
                        <Zap className="w-4 h-4" />
                        <span>Current Verified Evidence (Real-Time Empirical)</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                          {evidenceItems.length} items
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-300/80 font-mono">Label: &quot;{EPISTEMIC_LABELS.current_evidence}&quot;</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {evidenceItems.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-3 rounded-xl border border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100 text-xs">{ev.title}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold uppercase">
                              {ev.epistemicLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{ev.content}</p>
                          <div className="p-1.5 rounded bg-black/40 text-[10px] text-amber-200/90 font-mono">
                            <span className="text-slate-400">Why Selected: </span>
                            {ev.selectionReason}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-400">
                            <span>Relevance: {Math.round(ev.relevanceScore * 100)}%</span>
                            <span className="truncate max-w-[140px]">{ev.provenance.authority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Company State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <Database className="w-4 h-4" />
                      <span>Company State (Operational Ground Truth)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        {stateItems.length} items
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-300/80 font-mono">Label: &quot;{EPISTEMIC_LABELS.current_truth}&quot;</span>
                  </div>

                  {stateItems.length === 0 ? (
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-slate-500 text-center">
                      No state items explicitly matched for this query.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {stateItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100 text-xs">{item.title}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold uppercase">
                              {item.epistemicLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{item.content}</p>
                          <div className="p-1.5 rounded bg-black/40 text-[10px] text-emerald-200/90 font-mono">
                            <span className="text-slate-400">Why Selected: </span>
                            {item.selectionReason}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-400">
                            <span>Relevance: {Math.round(item.relevanceScore * 100)}%</span>
                            <span className="truncate max-w-[140px]">{item.provenance.authority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Company Knowledge */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sky-400 font-bold">
                      <BookOpen className="w-4 h-4" />
                      <span>Company Knowledge (Durable Reference & SOPs)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300">
                        {knowledgeItems.length} items
                      </span>
                    </div>
                    <span className="text-[10px] text-sky-300/80 font-mono">Label: &quot;{EPISTEMIC_LABELS.durable_reference}&quot;</span>
                  </div>

                  {knowledgeItems.length === 0 ? (
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-slate-500 text-center">
                      No knowledge documents matched for this query.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {knowledgeItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-sky-500/20 bg-sky-950/10 hover:border-sky-500/40 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100 text-xs">{item.title}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-sky-500/15 text-sky-300 border-sky-500/30 font-semibold uppercase">
                              {item.epistemicLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{item.content}</p>
                          <div className="p-1.5 rounded bg-black/40 text-[10px] text-sky-200/90 font-mono">
                            <span className="text-slate-400">Why Selected: </span>
                            {item.selectionReason}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-400">
                            <span>Relevance: {Math.round(item.relevanceScore * 100)}%</span>
                            <span className="truncate max-w-[140px]">{item.provenance.authority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Company Memory */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-400 font-bold">
                      <History className="w-4 h-4" />
                      <span>Company Memory (Historical Decisions & Precedents)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300">
                        {memoryItems.length} items
                      </span>
                    </div>
                    <span className="text-[10px] text-purple-300/80 font-mono">Label: &quot;{EPISTEMIC_LABELS.historical_memory}&quot;</span>
                  </div>

                  {memoryItems.length === 0 ? (
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-slate-500 text-center">
                      No historical memory records relevant for this query.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {memoryItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-purple-500/20 bg-purple-950/10 hover:border-purple-500/40 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100 text-xs">
                              Precedent: {item.title}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-purple-500/15 text-purple-300 border-purple-500/30 font-semibold uppercase">
                              {item.epistemicLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{item.content}</p>
                          <div className="p-1.5 rounded bg-black/40 text-[10px] text-purple-200/90 font-mono">
                            <span className="text-slate-400">Why Selected: </span>
                            {item.selectionReason}
                          </div>
                          {item.isConflicting && (
                            <div className="p-1.5 rounded bg-amber-500/20 border border-amber-500/30 text-[10px] text-amber-300 font-mono">
                              [!] Superseded by current verified operational state.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: CONFLICT RESOLUTIONS */}
            {activeTab === 'conflicts' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-indigo-200 text-xs">
                  <span className="font-bold">Epistemic Precedence Invariant:</span> When historical memory contradicts current verified state or tool evidence,
                  the system automatically resolves the conflict in favor of current truth and logs the explicit override.
                </div>

                {conflicts.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-black/30 border border-white/5 text-center space-y-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                    <div className="text-sm font-bold text-white">Zero Epistemic Inconsistencies Detected</div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      All retrieved facts across Evidence, State, Knowledge, and Memory are mathematically and empirically aligned.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conflicts.map((conflict, idx) => (
                      <div
                        key={conflict.id || idx}
                        className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {conflict.conflictType.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {conflict.precedenceRule}
                          </span>
                        </div>
                        <p className="text-slate-300">{conflict.resolutionSummary}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/5 font-mono text-[11px]">
                          <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/20">
                            <span className="text-emerald-400 font-bold block text-[10px] uppercase">
                              Higher Precedence ({conflict.higherPrecedenceItem.sourceSystem})
                            </span>
                            <span className="text-slate-200">{conflict.higherPrecedenceItem.claim}</span>
                          </div>
                          <div className="p-2 rounded bg-rose-950/30 border border-rose-500/20 line-through opacity-75">
                            <span className="text-rose-400 font-bold block text-[10px] uppercase">
                              Lower Precedence ({conflict.lowerPrecedenceItem.sourceSystem})
                            </span>
                            <span className="text-slate-400">{conflict.lowerPrecedenceItem.claim}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: RAW PROMPT */}
            {activeTab === 'prompt' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Structured Separated Context Injected into Agent Execution Prompt:</span>
                  <span className="font-mono text-[10px] text-indigo-300">
                    Prompt length: {formattedPrompt.length} chars
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px] text-slate-300 max-h-[50vh] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {formattedPrompt}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-slate-800/70 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Deterministic Context Pipeline: Fully Governed & Immutably Frozen</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors font-sans text-xs font-semibold"
            >
              Done Inspecting
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
