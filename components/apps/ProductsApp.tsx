'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { ProductFeature } from '@/types/os';
import { INITIAL_FEATURES } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';

export const ProductsApp: React.FC = () => {
  const [features, setFeatures] = useState<ProductFeature[]>(INITIAL_FEATURES);
  const [activeTab, setActiveTab] = useState<'roadmap' | 'sprint' | 'prd'>('roadmap');
  const [selectedFeature, setSelectedFeature] = useState<ProductFeature>(INITIAL_FEATURES[0]);
  const [prdPrompt, setPrdPrompt] = useState('');
  const [generatedPrd, setGeneratedPrd] = useState<string | null>(null);
  const [isGeneratingPrd, setIsGeneratingPrd] = useState(false);

  const handleGeneratePrd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prdPrompt.trim() || isGeneratingPrd) return;

    setIsGeneratingPrd(true);
    playOSSound('execute');

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
      playOSSound('notification');
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feat) => (
                <div
                  key={feat.id}
                  className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-2.5 hover:border-rose-500/40 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">{feat.title}</span>
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
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sprint' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Kanban className="w-4 h-4 text-rose-400" />
              Active Sprint 15: Autonomous Execution Board
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Backlog */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Backlog (2)
                </span>
                <div className="p-3 rounded-xl bg-slate-900 border border-white/5 text-xs space-y-1">
                  <div className="font-semibold text-white">Founder Voice-to-Directive Transformer</div>
                  <div className="text-[10px] text-slate-400">Owner: Maya Lin (PM)</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-white/5 text-xs space-y-1">
                  <div className="font-semibold text-white">Autonomous SQL Query Optimizer</div>
                  <div className="text-[10px] text-slate-400">Owner: AI Data Swarm</div>
                </div>
              </div>

              {/* In Progress */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                  In Progress (2)
                </span>
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs space-y-1">
                  <div className="font-semibold text-white">Zero-Latency Inter-Agent Neural Bus</div>
                  <div className="text-[10px] text-indigo-300">82% • Sophia & Maya</div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs space-y-1">
                  <div className="font-semibold text-white">Self-Healing Workflow Exception Engine</div>
                  <div className="text-[10px] text-indigo-300">64% • Sophia Vance</div>
                </div>
              </div>

              {/* Shipped */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                  Shipped (1)
                </span>
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-xs space-y-1">
                  <div className="font-semibold text-white">Continuous Competitor Intel Crawler</div>
                  <div className="text-[10px] text-emerald-300">100% • Dr. Aris Thorne</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prd' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              Automated PRD (Product Requirements Document) Generator
            </h3>

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
