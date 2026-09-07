'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  User,
  Check,
  X,
  Sparkles,
  Search,
  History,
  BookOpen,
  BrainCircuit,
} from 'lucide-react';
import { AttentionItem, AdvisorTargetContext } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface AttentionSectionProps {
  items: AttentionItem[];
  onApproveItem: (id: string) => void;
  onDismissItem: (id: string) => void;
  onInspectItem?: (item: AttentionItem) => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const AttentionSection: React.FC<AttentionSectionProps> = ({
  items,
  onApproveItem,
  onDismissItem,
  onInspectItem,
  onAskAdvisor,
}) => {
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState<AttentionItem | null>(null);

  const getTypeBadge = (type: AttentionItem['type']) => {
    switch (type) {
      case 'approval_required':
        return {
          label: 'APPROVAL REQUIRED',
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
          icon: AlertTriangle,
        };
      case 'decision_required':
        return {
          label: 'DECISION REQUIRED',
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          icon: Clock,
        };
      case 'financial_warning':
        return {
          label: 'FINANCIAL NOTE',
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
          icon: ShieldCheck,
        };
      case 'research_finding':
        return {
          label: 'MARKET INTEL',
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          icon: Search,
        };
      case 'product_decision':
        return {
          label: 'PRODUCT SPEC',
          bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
          icon: Sparkles,
        };
      default:
        return {
          label: 'ATTENTION',
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
          icon: AlertTriangle,
        };
    }
  };

  const pendingItems = items.filter((i) => i.status === 'pending' || i.founderActionRequired);
  const resolvedItems = items.filter((i) => i.status === 'approved' || i.status === 'resolved');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Needs Founder Attention
          </h2>
          <p className="text-xs text-slate-400">
            Critical decisions, approvals, and risk escalations prepared by your executive team.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
          {pendingItems.length} Action{pendingItems.length === 1 ? '' : 's'} Pending
        </span>
      </div>

      {items.length === 0 ? (
        <div className="os-glass-card rounded-2xl p-6 border border-white/10 text-center space-y-1.5">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
          <h4 className="text-xs font-bold text-white">No Escalations Requiring Attention</h4>
          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
            All agent workflows are operating within constitutional safe boundaries. High-impact trade-offs or sign-offs will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const badge = getTypeBadge(item.type);
            const Icon = badge.icon;
            const isResolved = item.status === 'approved' || item.status === 'resolved';

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl p-4 border transition-all flex flex-col justify-between ${
                  isResolved
                  ? 'bg-slate-900/40 border-white/5 opacity-70'
                  : 'bg-slate-900/90 border-white/15 hover:border-blue-500/40 shadow-xl'
              }`}
            >
              <div className="space-y-3">
                {/* Top Row */}
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 font-semibold ${badge.bg}`}
                  >
                    <Icon className="w-3 h-3" />
                    {badge.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{item.timestamp}</span>
                </div>

                {/* Title */}
                <h3 className="text-xs font-bold text-white leading-snug">{item.title}</h3>

                {/* 4-Way Separation: Current Evidence | Historical Memory | AI Inference | Founder Action */}
                <div className="space-y-2 text-xs text-slate-300">
                  {/* 1. Current Evidence */}
                  <div className="bg-black/30 rounded-xl p-2.5 border border-white/5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">
                        1. Current Verified Evidence
                      </span>
                      {typeof item.currentEvidence === 'object' && item.currentEvidence?.confidence && (
                        <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          Confidence: {item.currentEvidence.confidence}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-200">
                      {typeof item.currentEvidence === 'string'
                        ? item.currentEvidence
                        : item.currentEvidence?.summary || item.whatHappened}
                    </p>
                  </div>

                  {/* 2. Historical Memory (Context Only) */}
                  {item.historicalMemories && item.historicalMemories.length > 0 ? (
                    <div className="bg-purple-950/20 rounded-xl p-2.5 border border-purple-500/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1">
                          <History className="w-3 h-3 text-purple-400" />
                          2. Historical Memory (Context Only • Not New Evidence)
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">Past Precedent</span>
                      </div>

                      {item.historicalMemories.map((mem) => {
                        const isConflicting = mem.isConflicting || mem.conflictWithCurrentEvidence;
                        const conflictDesc = typeof mem.conflictDetails === 'object'
                          ? mem.conflictDetails.precedenceResolution
                          : mem.conflictDetails || 'Historical assumption conflict';

                        return (
                          <div key={mem.id || mem.memoryId} className="space-y-1 text-[11px] bg-black/20 p-2 rounded-lg border border-purple-500/10">
                            <p className="text-slate-300">
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
                        *Memory informs strategy but cannot auto-approve expenditures or override current verified evidence.
                      </span>
                    </div>
                  ) : null}

                  {/* 3. AI Inference / Recommendation */}
                  <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/15 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider block">
                        3. AI Inference & Recommendation
                      </span>
                      <span className="text-[9px] font-mono text-blue-400">Advisory Synthesis</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-blue-100 font-medium">
                      {typeof item.aiInference === 'string'
                        ? item.aiInference
                        : item.aiInference?.recommendation || item.recommendedAction}
                    </p>
                    {typeof item.aiInference === 'object' && item.aiInference?.reasoning && (
                      <p className="text-[10px] leading-relaxed text-slate-400">
                        Reasoning: {item.aiInference.reasoning}
                      </p>
                    )}
                  </div>

                  {/* 4. Founder Decision / Action */}
                  <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/15 flex items-center justify-between text-[11px]">
                    <span className="text-amber-300 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-400" />
                      4. Founder Decision Required
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      {isResolved ? 'Authorized by Founder' : 'Awaiting Founder Ratification'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Author & Actions Bar */}
              <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-200">
                    {item.authorName.charAt(0)}
                  </div>
                  <div className="text-[11px]">
                    <span className="text-slate-400">By </span>
                    <span className="font-semibold text-slate-200">{item.authorName}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  {onAskAdvisor && (
                    <button
                      onClick={() =>
                        onAskAdvisor({
                          section: 'hq_attention',
                          title: item.title,
                          category: item.type,
                          sourceEntityId: item.id,
                          sourceEntityName: item.authorName,
                          recommendation: item.recommendedAction,
                          whyItMatters: item.whyItMatters,
                          resultSnippet: item.whatHappened,
                          evidenceBasis: item.evidence?.basis || 'empirical_analysis',
                          suggestedQuestions: [
                            'Why is this happening?',
                            'What should I do?',
                            'What am I missing?',
                            'Is this recommendation actually correct?',
                          ],
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-[11px] font-medium transition-colors flex items-center space-x-1"
                      title="Ask Founder Intelligence about this item"
                    >
                      <BrainCircuit className="w-3 h-3 text-indigo-400" />
                      <span>Ask Advisor</span>
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedEvidenceItem(item)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition-colors flex items-center space-x-1"
                    title="Inspect empirical evidence & provenance"
                  >
                    <span>Evidence</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>

                  {!isResolved ? (
                    <button
                      onClick={() => onApproveItem(item.id)}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] font-semibold shadow-md transition-all flex items-center space-x-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>{item.founderActionRequired ? 'Sign Off' : 'Approve'}</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ratified</span>
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      )}

      {/* Evidence Modal */}
      {selectedEvidenceItem && (
        <EvidenceModal
          isOpen={!!selectedEvidenceItem}
          onClose={() => setSelectedEvidenceItem(null)}
          title={selectedEvidenceItem.title}
          evidenceBasis={selectedEvidenceItem.evidence?.basis}
          sourceText={selectedEvidenceItem.evidence?.source}
          details={selectedEvidenceItem.evidence?.details}
        />
      )}
    </div>
  );
};
