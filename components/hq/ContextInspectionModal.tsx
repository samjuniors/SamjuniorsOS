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
} from 'lucide-react';
import {
  TaskRetrievedContextBundle,
  RetrievedStateItem,
  RetrievedKnowledgeItem,
  ContextConflict,
} from '@/types/context';
import { RetrievedHistoricalMemory } from '@/types/os';

interface ContextInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  contextBundle?: TaskRetrievedContextBundle | null;
  agentRole?: string;
}

export const ContextInspectionModal: React.FC<ContextInspectionModalProps> = ({
  isOpen,
  onClose,
  title,
  contextBundle,
  agentRole,
}) => {
  const [activeTab, setActiveTab] = useState<'separation' | 'conflicts' | 'prompt'>('separation');

  if (!isOpen || !contextBundle) return null;

  const stateItems = contextBundle.retrievedState?.items || [];
  const knowledgeItems = contextBundle.retrievedKnowledge?.items || [];
  const memoryItems = contextBundle.retrievedMemory?.items || [];
  const conflicts = contextBundle.conflicts || [];
  const totalCount =
    (contextBundle.retrievedState?.totalCount ?? stateItems.length) +
    (contextBundle.retrievedKnowledge?.totalCount ?? knowledgeItems.length) +
    (contextBundle.retrievedMemory?.totalCount ?? memoryItems.length);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-3xl bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-slate-800/90 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Persistent Context & Epistemic Separation Audit
                  </h3>
                  {agentRole && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase">
                      {agentRole}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-lg">{title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Epistemic Hierarchy Law Banner */}
          <div className="px-6 py-2.5 bg-slate-950/60 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Precedence Order:</span>
              <span className="text-emerald-400 font-bold">1. Current State</span>
              <span className="text-slate-600">&gt;</span>
              <span className="text-sky-400 font-bold">2. Durable Knowledge</span>
              <span className="text-slate-600">&gt;</span>
              <span className="text-purple-400 font-bold">3. Historical Memory</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Retrieved: {totalCount} items • {new Date(contextBundle.timestamp).toLocaleTimeString()}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="px-6 pt-3 border-b border-white/10 flex items-center space-x-2 bg-slate-900/40">
            <button
              onClick={() => setActiveTab('separation')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'separation'
                  ? 'border-indigo-400 text-indigo-300 bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Three Distinct Stores</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                {totalCount}
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
              <span>Conflict Resolutions</span>
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
              <span>Clean Injected Prompt</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans text-xs">
            {activeTab === 'separation' && (
              <div className="space-y-6">
                {/* 1. Company State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <Database className="w-4 h-4" />
                      <span>Company State (Operational Ground Truth)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        {stateItems.length} items
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 italic">Epistemic: `current_truth` • Highest Precedence</span>
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
                              {item.entityType}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{item.summary}</p>
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-400">
                            <span>Relevance: {Math.round(item.relevanceScore * 100)}%</span>
                            <span className="truncate max-w-[140px]">{item.provenance.authority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Company Knowledge */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sky-400 font-bold">
                      <BookOpen className="w-4 h-4" />
                      <span>Company Knowledge (Durable Reference & SOPs)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300">
                        {knowledgeItems.length} items
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 italic">Epistemic: `durable_reference` • Reference Authority</span>
                  </div>

                  {knowledgeItems.length === 0 ? (
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-slate-500 text-center">
                      No knowledge documents matched for this query.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {knowledgeItems.map((item) => (
                        <div
                          key={item.knowledgeId}
                          className="p-3 rounded-xl border border-sky-500/20 bg-sky-950/10 hover:border-sky-500/40 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100 text-xs">{item.title}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-sky-500/15 text-sky-300 border-sky-500/30 font-semibold uppercase">
                              {item.category} • v{item.version}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{item.contentSnippet || item.summary}</p>
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-400">
                            <span>Doc: {item.documentId}</span>
                            <span className="truncate max-w-[140px]">{item.provenance.authority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Company Memory */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-400 font-bold">
                      <History className="w-4 h-4" />
                      <span>Company Memory (Historical Decisions & Precedents)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300">
                        {memoryItems.length} items
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 italic">Epistemic: `historical_memory` • Precedent Only</span>
                  </div>

                  {memoryItems.length === 0 ? (
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-slate-500 text-center">
                      No historical memory records relevant for this query.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {memoryItems.map((item) => (
                        <div
                          key={item.memoryId}
                          className="p-3 rounded-xl border border-purple-500/20 bg-purple-950/10 hover:border-purple-500/40 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-100 text-xs">
                              Precedent: {item.sourceDecisionId || item.pastDecisionId || item.memoryId || item.id || 'Historical Record'}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-purple-500/15 text-purple-300 border-purple-500/30 font-semibold uppercase">
                              {item.epistemicConfidence}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{item.approvedAction}</p>
                          <div className="text-[10px] text-slate-400 bg-black/30 p-1.5 rounded border border-white/5">
                            <span className="text-slate-500">Outcome: </span>
                            {item.executionOutcome}
                          </div>
                          {item.relevanceExplanation && (
                            <div className="text-[10px] text-indigo-300/80 italic">
                              Precedent: {item.relevanceExplanation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'conflicts' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-indigo-200 text-xs">
                  <span className="font-bold">Epistemic Invariant:</span> When historical memory contradicts current verified state,
                  the system automatically resolves the conflict in favor of current evidence and logs the explicit override.
                </div>

                {conflicts.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-black/30 border border-white/5 text-center space-y-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                    <div className="text-sm font-bold text-white">Zero Epistemic Inconsistencies Detected</div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      All retrieved facts across State, Knowledge, and Memory are mathematically and empirically aligned.
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

            {activeTab === 'prompt' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Structured Separated Context Injected into Agent Execution Prompt:</span>
                  <span className="font-mono text-[10px] text-indigo-300">
                    Prompt length: {contextBundle.formattedSeparatedPrompt.length} chars
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px] text-slate-300 max-h-[50vh] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {contextBundle.formattedSeparatedPrompt}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-slate-800/70 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Storage Architecture: PostgreSQL/Supabase Pluggable</span>
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
