'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  Sparkles,
  Search,
  BookOpen,
  Activity,
  Layers,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Cpu,
  Flame,
  Globe,
  Play,
  RotateCcw,
  TrendingUp,
  BrainCircuit,
  DollarSign,
  ShieldAlert,
  Boxes,
} from 'lucide-react';
import { ResearchTopic, AppId } from '@/types/os';
import { INITIAL_RESEARCH } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';
import { CollaborationStore } from '@/lib/collaboration-store';

interface ResearchAppProps {
  onOpenApp?: (appId: AppId) => void;
  soundEnabled?: boolean;
}

export const ResearchApp: React.FC<ResearchAppProps> = ({ onOpenApp, soundEnabled }) => {
  const [researchList, setResearchList] = useState<ResearchTopic[]>(INITIAL_RESEARCH);
  const [selectedTopic, setSelectedTopic] = useState<ResearchTopic>(INITIAL_RESEARCH[0]);
  const [customQuery, setCustomQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collabState, setCollabState] = useState(() => CollaborationStore.getState());

  useEffect(() => {
    const unsub = CollaborationStore.subscribe(() => {
      const state = CollaborationStore.getState();
      setCollabState({ ...state });

      // If step 3+ or completed, include collab topic
      if (state.currentStepIndex >= 2 || state.status === 'completed') {
        const collabTopic = state.artifacts.researchTopic;
        setResearchList((prev) => {
          if (prev.some((t) => t.id === collabTopic.id)) return prev;
          return [collabTopic, ...prev];
        });
        setSelectedTopic(collabTopic);
      }
    });

    const handleCollabEvent = () => {
      const state = CollaborationStore.getState();
      setCollabState({ ...state });
      if (state.currentStepIndex >= 2 || state.status === 'completed') {
        const collabTopic = state.artifacts.researchTopic;
        setResearchList((prev) => {
          if (prev.some((t) => t.id === collabTopic.id)) return prev;
          return [collabTopic, ...prev];
        });
        setSelectedTopic(collabTopic);
      }
    };

    window.addEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    return () => {
      unsub();
      window.removeEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    };
  }, []);

  const trendRadar = [
    { name: 'Hierarchical Multi-Agent OS', stage: 'Mainstream Adoption', impact: 'Transformative', score: 98 },
    { name: 'Zero-Latency Token Streaming', stage: 'Production Standard', impact: 'High', score: 92 },
    { name: 'Autonomous Enterprise Guardrails', stage: 'Regulatory Mandate', impact: 'High', score: 89 },
    { name: 'Speculative SLM Routing', stage: 'Early Scale', impact: 'Moderate', score: 76 },
  ];

  const handleGenerateResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuery.trim() || isGenerating) return;

    setIsGenerating(true);
    if (soundEnabled) playOSSound('execute');

    const newTopic: ResearchTopic = {
      id: `res-${Date.now()}`,
      title: customQuery.trim(),
      category: 'Model Tech',
      confidence: 97,
      impact: 'Transformative',
      date: 'Just now',
      author: 'Dr. Aris Thorne (Lead Researcher)',
      summary: `Automated deep research completed on "${customQuery.trim()}". Analysis confirms high strategic viability with immediate architectural integration potential into SamJuniors OS.`,
      tags: ['Autonomous AI', 'Market Intel', 'Technical Moat'],
    };

    setTimeout(() => {
      setResearchList([newTopic, ...researchList]);
      setSelectedTopic(newTopic);
      setIsGenerating(false);
      setCustomQuery('');
      if (soundEnabled) playOSSound('notification');
    }, 1200);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedTopic.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCollabTopic = selectedTopic?.id === 'res-collab-mem-1';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Sub-Header */}
      <div className="h-12 px-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white">Market Intelligence & Trend Radar</span>
          <span className="text-[10px] text-amber-400 font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/20">
            Curated by Dr. Aris Thorne
          </span>
        </div>

        {/* Quick query trigger */}
        <form onSubmit={handleGenerateResearch} className="flex items-center space-x-2">
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Run deep research crawl..."
            className="w-48 sm:w-64 px-3 py-1 rounded-lg bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={isGenerating || !customQuery.trim()}
            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-1 shadow-md transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isGenerating ? 'Crawling...' : 'Synthesize'}</span>
          </button>
        </form>
      </div>

      {/* AI Employee Collaboration Workflow Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900 border-b border-amber-500/20 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <span className="font-bold text-white text-xs">
              Cross-Agent Collaboration: PM (Maya) ↔ Research (Dr. Thorne) ↔ Finance (Julian Cruz)
            </span>
            <span className="text-[10px] text-slate-400 ml-2">
              {collabState.status === 'completed'
                ? 'Research completed after consulting Finance for unit economics & delivered to PM.'
                : collabState.status === 'running'
                ? `Active: ${collabState.steps[collabState.currentStepIndex]?.title}`
                : 'Simulate Dr. Thorne consulting Julian Cruz before briefing Maya Lin.'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {collabState.status === 'idle' && (
            <button
              onClick={() => CollaborationStore.runFullSimulation(1400)}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Simulate Workflow</span>
            </button>
          )}

          {collabState.status === 'running' && (
            <button
              onClick={() => CollaborationStore.stepForward()}
              className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold flex items-center space-x-1"
            >
              <span>Next Step ({collabState.currentStepIndex + 1}/7)</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          {collabState.status === 'completed' && onOpenApp && (
            <>
              <button
                onClick={() => onOpenApp('products')}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-medium flex items-center space-x-1"
              >
                <Boxes className="w-3 h-3" />
                <span>View Maya Lin&apos;s PRD</span>
              </button>
              <button
                onClick={() => onOpenApp('finance')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium flex items-center space-x-1"
              >
                <DollarSign className="w-3 h-3" />
                <span>View Julian&apos;s Budget</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3">
        {/* Left Col: Research Repository & Trend Radar */}
        <div className="border-r border-white/10 overflow-y-auto p-3 space-y-4 bg-slate-950/50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Synthesized Research Memos ({researchList.length})
            </span>

            <div className="space-y-2">
              {researchList.map((topic) => {
                const isCollab = topic.id === 'res-collab-mem-1';
                return (
                  <button
                    key={topic.id}
                    id={`research-topic-${topic.id}`}
                    onClick={() => setSelectedTopic(topic)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedTopic.id === topic.id
                        ? 'os-glass-card-active border-amber-500/60 shadow-lg ring-1 ring-amber-500/30'
                        : isCollab
                        ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-500/60'
                        : 'os-glass-card border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-amber-400 font-mono mb-1">
                      <span>{topic.category}</span>
                      <div className="flex items-center space-x-1">
                        {isCollab && (
                          <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded text-[9px] border border-amber-500/30">
                            Collab
                          </span>
                        )}
                        <span>{topic.date}</span>
                      </div>
                    </div>

                    <h4 className="text-xs font-bold text-white line-clamp-2">{topic.title}</h4>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-white/5">
                      <span>Confidence: {topic.confidence}%</span>
                      <span className="text-emerald-400 font-mono">{topic.impact}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Tech Trend Radar */}
          <div className="pt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-amber-400" />
              Strategic Tech Radar
            </span>

            <div className="space-y-1.5">
              {trendRadar.map((trend, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{trend.name}</span>
                    <span className="text-[10px] font-mono text-amber-400">{trend.score}/100</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>{trend.stage}</span>
                    <span className="text-emerald-400">{trend.impact}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Deep Memo Viewer & Strategic Breakdown */}
        <div className="md:col-span-2 overflow-y-auto p-5 space-y-5 bg-slate-950/80">
          {selectedTopic ? (
            <>
              {/* Header */}
              <div className="pb-4 border-b border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-500/20">
                    {selectedTopic.category} • {selectedTopic.date}
                  </span>

                  <button
                    onClick={handleCopy}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] text-slate-300 hover:text-white flex items-center space-x-1 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Memo</span>
                      </>
                    )}
                  </button>
                </div>

                <h3 className="text-base font-bold text-white leading-snug">{selectedTopic.title}</h3>
                <p className="text-xs text-indigo-400">Author: {selectedTopic.author}</p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {selectedTopic.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {/* Special Inter-Agent Consultation Callout if Collab topic */}
              {isCollabTopic && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 via-emerald-950/30 to-slate-900 border border-emerald-500/40 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      Inter-Agent Consultation Record: Julian Cruz (Finance)
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-500/20 rounded-full border border-emerald-500/30">
                      Budget Cap Enforced
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    During Step 3 of the feasibility study, Dr. Thorne identified that uncapped real-time vector indexing could trigger exponential token inflation. Dr. Thorne halted to consult <strong>Julian Cruz (Finance)</strong>, who stress-tested the unit economics and established:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-black/50 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-mono">Max Compute Ceiling</span>
                      <strong className="text-emerald-400 font-mono text-sm">$0.038 / 1k ops</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/50 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-mono">Target Gross Margin</span>
                      <strong className="text-emerald-400 font-mono text-sm">84.2% Floor</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/50 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-mono">Mandatory Mitigation</span>
                      <strong className="text-cyan-400 text-xs">Two-tier LRU Cache</strong>
                    </div>
                  </div>

                  {onOpenApp && (
                    <div className="flex items-center gap-3 pt-2 border-t border-white/10 text-xs">
                      <button
                        onClick={() => onOpenApp('products')}
                        className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium"
                      >
                        <Boxes className="w-3.5 h-3.5" />
                        <span>Inspect Maya Lin&apos;s Final PRD</span>
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        onClick={() => onOpenApp('finance')}
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Inspect Financial Model</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Executive Analysis */}
              <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  Executive Research Analysis & Empirical Grounding
                </h4>

                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedTopic.summary}
                </p>

                <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-slate-400 block">Statistical Confidence</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {selectedTopic.confidence}% Verified
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <span className="text-[10px] text-slate-400 block">Moat Value</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      High Proprietary Leverage
                    </span>
                  </div>
                </div>
              </div>

              {/* Downstream Hand-offs */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Downstream Action Items Dispatched by Research
                </h4>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center space-x-2 text-indigo-400 font-semibold">
                    <ArrowRight className="w-3 h-3" />
                    <span>To Maya Lin (PM): PRD for Autonomous Memory Tier scoped and accepted.</span>
                  </div>
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
                    <ArrowRight className="w-3 h-3" />
                    <span>To Julian Cruz (Finance): Unit economics validated under $0.038 budget cap.</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              Select a research memo on the left.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
