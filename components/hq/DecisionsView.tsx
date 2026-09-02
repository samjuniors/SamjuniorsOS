'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  ShieldCheck,
  Award,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { CompanyDecision, AdvisorTargetContext } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';
import { BrainCircuit } from 'lucide-react';

interface DecisionsViewProps {
  decisions: CompanyDecision[];
  onApproveDecision: (id: string) => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const DecisionsView: React.FC<DecisionsViewProps> = ({ decisions, onApproveDecision, onAskAdvisor }) => {
  const [selectedEvidenceDecision, setSelectedEvidenceDecision] = useState<CompanyDecision | null>(null);

  const pendingDecisions = decisions.filter((d) => d.status === 'pending_approval');
  const ratifiedDecisions = decisions.filter((d) => d.status === 'approved');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Scale className="w-4 h-4 text-purple-400" />
            Company Decisions & Governance Log
          </h2>
          <p className="text-xs text-slate-400">
            Strategic recommendations, founder approvals, and irreversible action authorizations.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
          {pendingDecisions.length} Awaiting Founder Sign-Off
        </span>
      </div>

      {/* Section 1: Pending Approvals */}
      {pendingDecisions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" />
            Action Required: Pending Founder Authorization
          </h3>

          <div className="space-y-3">
            {pendingDecisions.map((dec) => (
              <div
                key={dec.id}
                className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-4.5 shadow-xl space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold uppercase">
                        {dec.category}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">Proposed: {dec.date}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white mt-1">{dec.title}</h4>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                    SIGN-OFF REQUIRED
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Recommendation
                    </span>
                    <p className="text-[11px] text-slate-200 leading-relaxed">{dec.recommendation}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Business Impact & Unit Economics
                    </span>
                    <p className="text-[11px] text-slate-200 leading-relaxed">{dec.businessImpact}</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/15 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-[11px]">
                    <span className="text-slate-400">Recommended by:</span>
                    <span className="text-blue-300 font-semibold">{dec.recommendedBy}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {onAskAdvisor && (
                      <button
                        onClick={() =>
                          onAskAdvisor({
                            section: 'hq_decisions',
                            title: dec.title,
                            category: dec.category,
                            sourceEntityId: dec.id,
                            sourceEntityName: dec.recommendedBy,
                            recommendation: dec.recommendation,
                            whyItMatters: dec.businessImpact,
                            resultSnippet: dec.evidenceSummary,
                            evidenceBasis: 'model_reasoning',
                            suggestedQuestions: [
                              'Is this recommendation actually correct?',
                              'What should I do?',
                              'What am I missing?',
                              'Why is this happening now?',
                            ],
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-[11px] font-medium transition-colors flex items-center space-x-1"
                        title="Ask Founder Intelligence about this decision"
                      >
                        <BrainCircuit className="w-3 h-3 text-indigo-400" />
                        <span>Ask Advisor</span>
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedEvidenceDecision(dec)}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <span>View Evidence</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 flex justify-end">
                  <button
                    onClick={() => onApproveDecision(dec.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-lg transition-all flex items-center space-x-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Authorize & Ratify Decision</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Ratified Decisions & Governance Log */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          Ratified Company Decisions ({ratifiedDecisions.length})
        </h3>

        <div className="space-y-2">
          {ratifiedDecisions.map((dec) => (
            <div
              key={dec.id}
              className="bg-slate-900/60 border border-white/5 rounded-xl p-3.5 hover:border-white/15 transition-all space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 uppercase">
                    {dec.category}
                  </span>
                  <h4 className="font-bold text-white">{dec.title}</h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Ratified
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">{dec.recommendation}</p>

              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
                <span>Recommended by {dec.recommendedBy}</span>
                <div className="flex items-center space-x-2">
                  {onAskAdvisor && (
                    <button
                      onClick={() =>
                        onAskAdvisor({
                          section: 'hq_decisions',
                          title: dec.title,
                          category: dec.category,
                          sourceEntityId: dec.id,
                          sourceEntityName: dec.recommendedBy,
                          recommendation: dec.recommendation,
                          whyItMatters: dec.businessImpact,
                          resultSnippet: dec.evidenceSummary,
                          evidenceBasis: 'model_reasoning',
                          suggestedQuestions: [
                            'What should I monitor following this ratified decision?',
                            'What am I missing?',
                            'Why did we prioritize this decision?',
                          ],
                        })
                      }
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                    >
                      <BrainCircuit className="w-3 h-3" />
                      <span>Ask Advisor</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedEvidenceDecision(dec)}
                    className="hover:text-slate-300 flex items-center gap-1 font-mono"
                  >
                    <span>Inspect Audit Proof</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedEvidenceDecision && (
        <EvidenceModal
          isOpen={!!selectedEvidenceDecision}
          onClose={() => setSelectedEvidenceDecision(null)}
          title={selectedEvidenceDecision.title}
          evidenceBasis="model_reasoning"
          sourceText={selectedEvidenceDecision.recommendation}
          details={`Evidence Summary: ${selectedEvidenceDecision.evidenceSummary}. Recommended by ${selectedEvidenceDecision.recommendedBy}.`}
        />
      )}
    </div>
  );
};
