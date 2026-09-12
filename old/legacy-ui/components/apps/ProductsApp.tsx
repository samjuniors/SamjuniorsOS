'use client';

import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  FileCode,
  Tag,
  Kanban,
  Sliders,
  Play,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  BrainCircuit,
  DollarSign,
} from 'lucide-react';
import { ProductFeature, AppId } from '@/types/os';
import { INITIAL_FEATURES } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';
import { CollaborationStore } from '@/lib/collaboration-store';

interface ProductsAppProps {
  onOpenApp?: (appId: AppId) => void;
  soundEnabled?: boolean;
}

export const ProductsApp: React.FC<ProductsAppProps> = ({ onOpenApp, soundEnabled }) => {
  const [features, setFeatures] = useState<ProductFeature[]>(INITIAL_FEATURES);
  const [activeTab, setActiveTab] = useState<'roadmap' | 'sprint' | 'prd'>('roadmap');
  const [selectedFeature, setSelectedFeature] = useState<ProductFeature>(INITIAL_FEATURES[0]);
  const [prdPrompt, setPrdPrompt] = useState('');
  const [generatedPrd, setGeneratedPrd] = useState<string | null>(null);
  const [isGeneratingPrd, setIsGeneratingPrd] = useState(false);
  const [collabState, setCollabState] = useState(() => CollaborationStore.getState());

  useEffect(() => {
    const unsub = CollaborationStore.subscribe(() => {
      const state = CollaborationStore.getState();
      setCollabState({ ...state });

      // If step 6 or completed, ensure feature is in features list
      if (state.currentStepIndex >= 5 || state.status === 'completed') {
        setFeatures((prev) => {
          if (prev.some((f) => f.id === state.artifacts.feature.id)) return prev;
          return [state.artifacts.feature, ...prev];
        });
        if (!generatedPrd) {
          setGeneratedPrd(state.artifacts.prdSnippet);
        }
      }
    });

    const handleCollabEvent = () => {
      const state = CollaborationStore.getState();
      setCollabState({ ...state });
      if (state.currentStepIndex >= 5 || state.status === 'completed') {
        setFeatures((prev) => {
          if (prev.some((f) => f.id === state.artifacts.feature.id)) return prev;
          return [state.artifacts.feature, ...prev];
        });
        setGeneratedPrd(state.artifacts.prdSnippet);
      }
    };

    window.addEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    return () => {
      unsub();
      window.removeEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    };
  }, [generatedPrd]);

  const handleGeneratePrd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prdPrompt.trim() || isGeneratingPrd) return;

    setIsGeneratingPrd(true);
    if (soundEnabled) playOSSound('execute');

    setTimeout(() => {
      setGeneratedPrd(`## Product Requirements Document (PRD): ${prdPrompt.trim()}
**Author:** Maya Lin (Principal PM)  
**Status:** Approved for Sprint Backlog  
**Target Release:** Sprint 16 (14-day turnaround)

### 1. Problem & Customer Friction
Users demand rapid autonomous execution for "${prdPrompt.trim()}" without managing prompt chains or handling server configurations.

### 2. User Stories & Acceptance Criteria
- **US-1**: As an executive, I can trigger "${prdPrompt.trim()}" with 1 click from SamJuniors OS desktop.
- **US-2**: All 4 specialized agents (COO, Research, PM, Finance) review and approve specs before build.
- **US-3**: System provides sub-100ms response streaming with zero data drift.

### 3. Edge Cases & Guardrails
- Automatic fallback if external API exceeds 5,000ms latency.
- Strict token spend cap of $0.05 per task execution.`);
      setIsGeneratingPrd(false);
      if (soundEnabled) playOSSound('notification');
    }, 1000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Sub-Header */}
      <div className="h-11 px-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'roadmap'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Product Roadmap</span>
          </button>

          <button
            onClick={() => setActiveTab('sprint')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'sprint'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Autonomous Sprint Board</span>
          </button>

          <button
            onClick={() => setActiveTab('prd')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'prd'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>PRD Generator</span>
          </button>
        </div>

        <span className="text-[10px] text-rose-400 font-mono bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/20">
          Lead PM: Maya Lin
        </span>
      </div>

      {/* AI Employee Collaboration Workflow Banner */}
      <div className="bg-gradient-to-r from-rose-950/40 via-purple-950/40 to-slate-900 border-b border-rose-500/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-xs">
                AI Employee Collaboration: PM ↔ Researcher ↔ Finance
              </span>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${
                  collabState.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : collabState.status === 'running'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-white/10'
                }`}
              >
                {collabState.status === 'completed'
                  ? 'Completed & Synced'
                  : collabState.status === 'running'
                  ? `Step ${collabState.currentStepIndex + 1}/7 Running`
                  : 'Ready to Simulate'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {collabState.status === 'completed'
                ? 'Maya Lin (PM) authored PRD after consulting Dr. Thorne (Market) & Julian Cruz ($0.038 compute cap).'
                : collabState.status === 'running'
                ? collabState.steps[collabState.currentStepIndex]?.title
                : 'Simulate Maya Lin requesting market research, Dr. Thorne consulting Finance for budget caps, and delivering findings.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {collabState.status === 'idle' && (
            <>
              <button
                onClick={() => CollaborationStore.runFullSimulation(1400)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Simulate Collaboration</span>
              </button>
              <button
                onClick={() => CollaborationStore.stepForward()}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold transition-all"
              >
                Step 1
              </button>
            </>
          )}

          {collabState.status === 'running' && (
            <>
              <button
                onClick={() => CollaborationStore.stepForward()}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md transition-all"
              >
                <span>Next Step ({collabState.currentStepIndex + 1}/7)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => CollaborationStore.completeInstantly()}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-xs transition-all"
              >
                Fast-Forward
              </button>
            </>
          )}

          {collabState.status === 'completed' && (
            <>
              {onOpenApp && (
                <>
                  <button
                    onClick={() => onOpenApp('research')}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-medium flex items-center space-x-1 transition-all"
                    title="View Dr. Thorne's Market Memo"
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>View in Research</span>
                  </button>
                  <button
                    onClick={() => onOpenApp('finance')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium flex items-center space-x-1 transition-all"
                    title="View Julian Cruz's Financial Constraints"
                  >
                    <DollarSign className="w-3 h-3" />
                    <span>View in Finance</span>
                  </button>
                  <button
                    onClick={() => onOpenApp('workforce')}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium flex items-center space-x-1 transition-all"
                    title="View Orchestration Run"
                  >
                    <BrainCircuit className="w-3 h-3" />
                    <span>Orchestrator</span>
                  </button>
                </>
              )}
              <button
                onClick={() => CollaborationStore.reset()}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-xs transition-all"
                title="Reset simulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {activeTab === 'roadmap' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-rose-400" />
                  Autonomous Feature Pipeline & Roadmap
                </h3>
                <p className="text-xs text-slate-400">
                  Maya Lin coordinates user stories and technical dependencies with AI engineering swarms.
                </p>
              </div>
            </div>

            {features.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2 os-glass-card rounded-2xl border border-white/10">
                <Boxes className="w-8 h-8 mx-auto opacity-30 text-rose-400" />
                <p className="text-xs font-semibold text-slate-300">No Features in Roadmap</p>
                <p className="text-[11px] text-slate-500">
                  Switch to the PRD Generator tab or dispatch an initiative in Company HQ to author product specifications.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((feat) => {
                  const isCollabFeature = feat.id === 'feat-collab-mem-1';
                  return (
                    <div
                      key={feat.id}
                      className={`os-glass-card rounded-2xl p-4 border transition-all ${
                        isCollabFeature
                          ? 'border-rose-500/60 bg-gradient-to-b from-rose-950/30 to-slate-900 ring-1 ring-rose-500/30'
                          : 'border-white/10 hover:border-rose-500/40'
                      } space-y-2.5`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-white">{feat.title}</span>
                          {isCollabFeature && (
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Multi-Agent Collab
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${
                            feat.status === 'Shipped'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : feat.status === 'In Progress'
                              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {feat.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{feat.description}</p>

                      {isCollabFeature && (
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between text-slate-300 font-mono text-[10px]">
                            <span>Market Validation: <strong className="text-amber-400">Dr. Thorne (98%)</strong></span>
                            <span>Compute Cap: <strong className="text-emerald-400">$0.038 / 1k ops</strong></span>
                          </div>
                          {onOpenApp && (
                            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                              <button
                                onClick={() => onOpenApp('research')}
                                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                              >
                                <span>Inspect Market Memo</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                              <span className="text-slate-600">•</span>
                              <button
                                onClick={() => onOpenApp('finance')}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                              >
                                <span>Inspect Financial Guardrail</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Owner: <strong className="text-slate-200">{feat.owner}</strong></span>
                        <span className="font-mono text-rose-400">{feat.completion}% Complete</span>
                      </div>

                      {/* Mini Progress */}
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full"
                          style={{ width: `${feat.completion}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sprint' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Kanban className="w-4 h-4 text-rose-400" />
              Active Sprint: Autonomous Execution Board
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Backlog */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Backlog ({features.filter((f) => f.status === 'Backlog').length})
                </span>
                {features.filter((f) => f.status === 'Backlog').length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic p-2">No backlog items</p>
                ) : (
                  features.filter((f) => f.status === 'Backlog').map((f) => (
                    <div key={f.id} className="p-3 rounded-xl bg-slate-900 border border-white/5 text-xs space-y-1">
                      <div className="font-semibold text-white">{f.title}</div>
                      <div className="text-[10px] text-slate-400">Owner: {f.owner}</div>
                    </div>
                  ))
                )}
              </div>

              {/* In Progress */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                  In Progress ({features.filter((f) => f.status === 'In Progress' || f.status === 'In Review').length})
                </span>
                {features.filter((f) => f.status === 'In Progress' || f.status === 'In Review').length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic p-2">No active tasks in progress</p>
                ) : (
                  features.filter((f) => f.status === 'In Progress' || f.status === 'In Review').map((f) => (
                    <div key={f.id} className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs space-y-1">
                      <div className="font-semibold text-white">{f.title}</div>
                      <div className="text-[10px] text-indigo-300">{f.completion}% • {f.owner}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Shipped */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                  Shipped ({features.filter((f) => f.status === 'Shipped').length})
                </span>
                {features.filter((f) => f.status === 'Shipped').length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic p-2">No completed features yet</p>
                ) : (
                  features.filter((f) => f.status === 'Shipped').map((f) => (
                    <div key={f.id} className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-xs space-y-1">
                      <div className="font-semibold text-white">{f.title}</div>
                      <div className="text-[10px] text-emerald-300">100% • {f.owner}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prd' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                Automated PRD (Product Requirements Document) Generator
              </h3>
              {(collabState.currentStepIndex >= 5 || collabState.status === 'completed') && (
                <button
                  onClick={() => setGeneratedPrd(collabState.artifacts.prdSnippet)}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center space-x-1 transition-all"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Load Ratified Collab PRD (Memory Tier)</span>
                </button>
              )}
            </div>

            <form onSubmit={handleGeneratePrd} className="flex gap-2">
              <input
                type="text"
                value={prdPrompt}
                onChange={(e) => setPrdPrompt(e.target.value)}
                placeholder="Describe product capability to spec (e.g. Automated multi-tenant billing with stripe webhooks)..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={isGeneratingPrd || !prdPrompt.trim()}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isGeneratingPrd ? 'Authoring PRD...' : 'Generate PRD'}</span>
              </button>
            </form>

            {generatedPrd ? (
              <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {generatedPrd}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs os-glass-card rounded-2xl border border-white/10">
                Enter a feature capability above to have Maya Lin author a complete technical PRD.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
