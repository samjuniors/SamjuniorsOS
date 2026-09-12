'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  X,
  RotateCcw,
  ShieldCheck,
  Award,
  ExternalLink,
  ChevronRight,
  FileEdit,
  MessageSquare,
  History,
  BrainCircuit,
} from 'lucide-react';
import { CompanyDecision, AdvisorTargetContext } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface DecisionsViewProps {
  decisions: CompanyDecision[];
  onApproveDecision: (id: string) => void;
  onRejectDecision?: (id: string, reason?: string) => void;
  onRequestRevision?: (id: string, note?: string) => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const DecisionsView: React.FC<DecisionsViewProps> = ({
  decisions,
  onApproveDecision,
  onRejectDecision,
  onRequestRevision,
  onAskAdvisor,
}) => {
  const [selectedEvidenceDecision, setSelectedEvidenceDecision] = useState<CompanyDecision | null>(null);
  const [revisionModalDecision, setRevisionModalDecision] = useState<CompanyDecision | null>(null);
  const [revisionNote, setRevisionNote] = useState('');

  const pendingDecisions = decisions.filter(
    (d) => d.status === 'pending_approval' || d.founderApprovalRequired
  );
  const ratifiedDecisions = decisions.filter((d) => d.status === 'approved');
  const otherDecisions = decisions.filter(
    (d) => d.status === 'rejected' || d.status === 'revision_requested'
  );

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

      {decisions.length === 0 ? (
        <div className="bg-slate-900/60 border border-dashed border-white/10 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
            <Scale className="w-6 h-6 text-purple-400" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-bold text-white">No Governance Decisions Logged Yet</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              When the Executive Council generates proposals requiring Founder approval or ratifies strategic initiatives, they will be archived here in the permanent governance log.
            </p>
          </div>
        </div>
      ) : (
        <>
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

                {/* 4-Way Separation */}
                <div className="space-y-2.5 text-xs">
                  {/* 1. Current Evidence */}
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">
                      1. Current Verified Evidence
                    </span>
                    <p className="text-[11px] text-slate-200 leading-relaxed">
                      {typeof dec.currentEvidence === 'string'
                        ? dec.currentEvidence
                        : dec.currentEvidence?.summary || dec.evidenceSummary}
                    </p>
                  </div>

                  {/* 2. Historical Memory (Context Only) */}
                  {dec.historicalMemories && dec.historicalMemories.length > 0 && (
                    <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-2">
                      <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1">
                        <History className="w-3 h-3 text-purple-400" />
                        2. Historical Memory (Context Only • Not New Evidence)
                      </span>
                      {dec.historicalMemories.map((mem) => {
                        const isConflicting = mem.isConflicting || mem.conflictWithCurrentEvidence;
                        const conflictDesc = typeof mem.conflictDetails === 'object'
                          ? mem.conflictDetails.precedenceResolution
                          : mem.conflictDetails || 'Historical assumption conflict';

                        return (
                          <div key={mem.id || mem.memoryId} className="p-2 rounded-lg bg-black/20 border border-purple-500/10 space-y-1 text-[11px]">
                            <p className="text-slate-200">
                              <span className="text-purple-300 font-semibold">Precedent:</span> {mem.approvedAction || mem.pastAction}
                            </p>
                            <p className="text-slate-400 text-[10px]">
                              <span className="text-purple-400 font-medium">Relevance:</span> {mem.relevanceExplanation || mem.whyRelevant}
                            </p>
                            {isConflicting && (
                              <div className="p-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[10px] flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                                <span>
                                  <strong>Precedence Rule:</strong> Current verified evidence supersedes historical memory ({conflictDesc}).
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <span className="text-[9px] text-slate-500 italic block">
                        *Memory provides organizational learning but cannot override current verified evidence or auto-approve actions.
                      </span>
                    </div>
                  )}

                  {/* 3. AI Inference / Recommendation & Business Impact */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 space-y-1">
                      <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider block">
                        3. AI Inference & Recommendation
                      </span>
                      <p className="text-[11px] text-blue-100 font-medium leading-relaxed">
                        {typeof dec.aiInference === 'string'
                          ? dec.aiInference
                          : dec.aiInference?.recommendation || dec.recommendation}
                      </p>
                      {typeof dec.aiInference === 'object' && dec.aiInference?.reasoning && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Reasoning: {dec.aiInference.reasoning}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Projected Business Impact
                      </span>
                      <p className="text-[11px] text-slate-200 leading-relaxed">{dec.businessImpact}</p>
                    </div>
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

                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Requires Explicit Founder Authorization</span>
                  </span>

                  <div className="flex items-center gap-2">
                    {onRequestRevision && (
                      <button
                        id={`btn-decision-revision-${dec.id}`}
                        onClick={() => {
                          setRevisionModalDecision(dec);
                          setRevisionNote('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-300 hover:text-amber-200 text-xs font-semibold border border-amber-500/30 transition-all flex items-center space-x-1.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Request Revision</span>
                      </button>
                    )}

                    {onRejectDecision && (
                      <button
                        id={`btn-decision-reject-${dec.id}`}
                        onClick={() => onRejectDecision(dec.id, 'Rejected by Founder from Decisions View.')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold border border-rose-500/30 transition-all flex items-center space-x-1.5"
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    )}

                    <button
                      id={`btn-decision-approve-${dec.id}`}
                      onClick={() => onApproveDecision(dec.id)}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-lg transition-all flex items-center space-x-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve Decision</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Rejected & Revision Requested Decisions Log */}
      {otherDecisions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            Active Revision & Rejected Governance Log ({otherDecisions.length})
          </h3>

          <div className="space-y-2">
            {otherDecisions.map((dec) => {
              const isRevision = dec.status === 'revision_requested';
              return (
                <div
                  key={dec.id}
                  className={`border rounded-xl p-3.5 space-y-2 text-xs transition-all ${
                    isRevision
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 uppercase">
                        {dec.category}
                      </span>
                      <h4 className="font-bold text-white">{dec.title}</h4>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                        isRevision
                          ? 'text-amber-300 bg-amber-950/40 border-amber-500/30'
                          : 'text-rose-300 bg-rose-950/40 border-rose-500/30'
                      }`}
                    >
                      {isRevision ? <RotateCcw className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {isRevision ? 'Revision Requested' : 'Rejected'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">{dec.recommendation}</p>

                  {dec.resolutionNote && (
                    <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] text-slate-300">
                      <span className="text-slate-400 font-semibold font-mono">Founder Feedback: </span>
                      {dec.resolutionNote}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
                    <span>Proposed by {dec.recommendedBy} • Logged {dec.date}</span>
                    <button
                      onClick={() => setSelectedEvidenceDecision(dec)}
                      className="hover:text-slate-300 flex items-center gap-1 font-mono"
                    >
                      <span>Inspect Audit Trail</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 3: Ratified Decisions & Governance Log */}
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
                  <span className="flex items-center text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-500/20 mr-2">
                    <BrainCircuit className="w-3 h-3 mr-1" />
                    Memory Established
                  </span>
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
        </>
      )}

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

      {/* Revision Request Feedback Modal */}
      <AnimatePresence>
        {revisionModalDecision && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#12131c] border border-white/15 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Request Decision Revision</h3>
                    <p className="text-[11px] text-slate-400 truncate max-w-xs">{revisionModalDecision.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRevisionModalDecision(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Founder Instructions / Specific Changes Needed
                </label>
                <textarea
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="e.g., Reduce target compute allocation to 10%, verify enterprise SLA terms, or benchmark with European data privacy rules..."
                  rows={3}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 custom-scrollbar"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-[10px] text-slate-500 font-mono">
                  Routes back to {revisionModalDecision.recommendedBy}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRevisionModalDecision(null)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (onRequestRevision) {
                        onRequestRevision(
                          revisionModalDecision.id,
                          revisionNote.trim() || 'Please revise scope, pricing assumptions, or operational safety constraints.'
                        );
                      }
                      setRevisionModalDecision(null);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Send Revision Request</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
