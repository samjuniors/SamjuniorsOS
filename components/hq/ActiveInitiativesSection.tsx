'use client';

import React from 'react';
import { Target, Users, AlertTriangle, ArrowRight, CheckCircle2, FileText, Layers, BrainCircuit } from 'lucide-react';
import { CompanyInitiative, AdvisorTargetContext } from '@/types/os';

interface ActiveInitiativesProps {
  initiatives: CompanyInitiative[];
  onViewWork: () => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const ActiveInitiativesSection: React.FC<ActiveInitiativesProps> = ({
  initiatives,
  onViewWork,
  onAskAdvisor,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            Active Company Initiatives
          </h2>
          <p className="text-xs text-slate-400">
            Core business objectives currently being scoped, researched, and executed by your team.
          </p>
        </div>
        <button
          onClick={onViewWork}
          className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
        >
          <span>All Company Work</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {initiatives.length === 0 ? (
        <div className="os-glass-card rounded-2xl p-6 border border-white/10 text-center space-y-1.5">
          <Target className="w-6 h-6 text-blue-400 mx-auto opacity-70" />
          <h4 className="text-xs font-bold text-white">No Active Initiatives Yet</h4>
          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
            Dispatch a strategic directive to the Executive Council to spawn cross-functional initiatives across Research, Product, and Finance.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initiatives.map((init) => (
            <div
              key={init.id}
              className="bg-slate-900/80 border border-white/10 rounded-2xl p-4.5 hover:border-blue-500/30 transition-all space-y-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs font-bold text-white">{init.title}</h3>
                    {init.codeName && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                        {init.codeName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 font-medium">{init.currentObjective}</p>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                    init.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      : init.status === 'In Progress'
                      ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}
                >
                  {init.status}
                </span>
              </div>

              {/* Progress and Contributors */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-300">Council Contributors:</span>
                  <span>{init.contributors.length} agents</span>
                </div>

                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  {init.contributors.map((c) => (
                    <span
                      key={c.agentId}
                      className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5"
                    >
                      {c.name.split(' ')[0]} ({c.role.split(' ')[0]})
                    </span>
                  ))}
                </div>
              </div>

              {/* Latest Result */}
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Latest Milestone Output
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{init.latestResult}</p>
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                <span className="text-[10px] font-mono text-slate-400">{init.updatedAt}</span>

                <div className="flex items-center space-x-2">
                  {onAskAdvisor && (
                    <button
                      onClick={() =>
                        onAskAdvisor({
                          section: 'hq_initiatives',
                          title: init.title,
                          category: 'initiative',
                          sourceEntityId: init.id,
                          sourceEntityName: init.codeName || init.title,
                          recommendation: init.nextRecommendedAction,
                          whyItMatters: init.currentObjective,
                          resultSnippet: init.latestResult,
                          evidenceBasis: 'model_reasoning',
                          suggestedQuestions: [
                            'Is this initiative moving fast enough?',
                            'What are the key execution bottlenecks?',
                            'Should we rebalance agent allocation here?',
                          ],
                        })
                      }
                      className="px-2 py-0.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-[10px] font-medium transition-colors flex items-center space-x-1"
                      title="Ask Founder Intelligence about this initiative"
                    >
                      <BrainCircuit className="w-3 h-3 text-indigo-400" />
                      <span>Ask Advisor</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
