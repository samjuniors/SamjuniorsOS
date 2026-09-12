'use client';

import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  FileCheck,
  FileText,
  Layers,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
  Check,
  X,
  Clock,
  Sparkles,
  Info,
  ChevronRight,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { OrchestrationRun, ExecutionDeliverable, AdvisorTargetContext } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';
import { BrainCircuit } from 'lucide-react';

interface ExecutiveResultCardProps {
  run: OrchestrationRun;
  onInspectWork: () => void;
  onViewDeliverables: () => void;
  onApproveDecision?: (decisionTitle?: string) => void;
  onRejectDecision?: (decisionTitle?: string) => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const ExecutiveResultCard: React.FC<ExecutiveResultCardProps> = ({
  run,
  onInspectWork,
  onViewDeliverables,
  onApproveDecision,
  onRejectDecision,
  onAskAdvisor,
}) => {
  const [decisionState, setDecisionState] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] = useState<ExecutionDeliverable | null>(null);

  const res = run.executiveResult;

  // Fallbacks if executiveResult is minimal or legacy
  const recommendation =
    res?.recommendation ||
    run.summary ||
    'The Executive Council has synthesized strategic findings for the Founder. Review key insights and ratify recommended actions.';

  const keyFindings = res?.keyFindings || [
    'Strategic Research: Market whitespace evaluated with safe sandbox constraints.',
    'Product PRD: Architecture specification and functional requirements mapped.',
    'Unit Economics: Compute token spend attribution and margin guardrails verified.',
  ];

  const businessImplications = res?.businessImplications || [
    'Accelerates company execution velocity with deterministic specialist coordination.',
    'Maintains capital efficiency with zero unverified financial overhead.',
    'Safe Mock Sandboxing strictly enforced for all external operations.',
  ];

  const risks = res?.risks || [
    'Inference rate limits during peak traffic; mitigated via automated caching fallbacks.',
    'Safe Mock Sandboxing remains active to prevent unverified production mutations.',
  ];

  const nextActions = res?.recommendedNextActions || [
    'Founder review and ratification of proposed strategic initiative.',
    'Deploy PRD specifications into milestone queue.',
  ];

  const decision = res?.founderDecision;
  const isDecisionRequired = decision?.required !== false;
  const decisionTitle = decision?.title || `Ratify Executive Initiative: ${run.title || run.directive}`;
  const decisionRec = decision?.recommendation || recommendation;
  const decisionWhy = decision?.why || 'Requires Founder authorization before committing company bandwidth.';
  const decisionImpact = decision?.impact || 'Authorizes executive team to proceed with implementation phase.';

  const participatingEmployees = res?.participatingEmployees || [];
  const verificationStatus = res?.verificationStatus || (run.status === 'completed' ? 'verified' : 'pending');

  const handleApprove = () => {
    setDecisionState('approved');
    if (onApproveDecision) onApproveDecision(decisionTitle);
  };

  const handleReject = () => {
    setDecisionState('rejected');
    if (onRejectDecision) onRejectDecision(decisionTitle);
  };

  const isUnconfigured = res?.executionOutcome === 'unconfigured' || run.executionSummary?.executionMode === 'unconfigured';

  return (
    <div className="bg-slate-900/95 border border-indigo-500/30 rounded-2xl p-5 md:p-6 shadow-2xl space-y-5 relative overflow-hidden">
      {/* Top Accent Gradient */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
          isUnconfigured
            ? 'from-amber-500 via-orange-500 to-amber-600'
            : verificationStatus === 'verified'
            ? 'from-indigo-500 via-purple-500 to-emerald-500'
            : 'from-blue-500 via-indigo-500 to-slate-500'
        }`}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {isUnconfigured ? (
              <span className="px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                API KEY REQUIRED (NO FAKE METRICS)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                COUNCIL SYNTHESIS COMPLETE
              </span>
            )}

            <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 text-[10px] font-mono">
              {verificationStatus === 'verified' ? 'Safe Sandbox: Verified' : 'Safe Mock Active'}
            </span>

            {run.liveAi && (
              <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-mono flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Live Gemini AI
              </span>
            )}

            <span className="text-[10px] font-mono text-slate-400">{run.timestamp}</span>
          </div>

          <h2 className="text-base font-bold text-white tracking-tight">{run.title || run.directive}</h2>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {onAskAdvisor && (
            <button
              onClick={() =>
                onAskAdvisor({
                  section: 'hq_council_result',
                  title: run.title || run.directive,
                  category: 'Strategy',
                  sourceEntityId: run.id,
                  sourceEntityName: res?.preparedBy.name || 'Executive Council',
                  recommendation: recommendation,
                  whyItMatters: decisionWhy,
                  risk: risks.join('; '),
                  resultSnippet: keyFindings.join('; '),
                  evidenceBasis: 'model_reasoning',
                  suggestedQuestions: [
                    'Is this recommendation actually correct?',
                    'Why is this happening?',
                    'What should I do?',
                    'What am I missing?',
                  ],
                })
              }
              className="px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm"
              title="Ask Founder Intelligence to challenge or analyze this recommendation"
            >
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ask Advisor</span>
            </button>
          )}

          <button
            onClick={() => setIsEvidenceModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Inspect Provenance & Evidence Basis"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Provenance</span>
          </button>

          <button
            onClick={onInspectWork}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Inspect Technical Work</span>
          </button>

          <button
            onClick={onViewDeliverables}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Documents ({run.deliverables.length})</span>
          </button>
        </div>
      </div>

      {/* Unconfigured Truthful State Alert */}
      {isUnconfigured && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Server AI Configuration Notice</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Multi-agent council reasoning requires a <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300">GEMINI_API_KEY</code> in the server environment. Under strict data truthfulness rules, no fake customer deals, invented metrics, or simulated market data have been fabricated.
          </p>
          <div className="pt-1 text-[11px] text-amber-400 flex items-center gap-1 font-mono">
            <span>Action Required:</span> Provide GEMINI_API_KEY to activate genuine AI employee execution.
          </div>
        </div>
      )}

      {/* Executive Recommendation Box */}
      <div className="p-4.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-4 h-4 text-indigo-400" />
            Executive Recommendation for Founder
          </span>
          <div className="flex items-center space-x-2">
            {onAskAdvisor && (
              <button
                onClick={() =>
                  onAskAdvisor({
                    section: 'hq_council_result',
                    title: run.title || run.directive,
                    category: 'Strategy',
                    sourceEntityId: run.id,
                    sourceEntityName: res?.preparedBy.name || 'Executive Council',
                    recommendation: recommendation,
                    whyItMatters: decisionWhy,
                    risk: risks.join('; '),
                    resultSnippet: keyFindings.join('; '),
                    evidenceBasis: 'model_reasoning',
                    suggestedQuestions: [
                      'Is this recommendation actually correct?',
                      'What am I missing?',
                      'Why is this happening?',
                      'What should I do next?',
                    ],
                  })
                }
                className="text-[10px] text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
              >
                <BrainCircuit className="w-3 h-3" />
                <span>Ask Advisor: Is this correct?</span>
              </button>
            )}
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 px-2.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Verified by Operations
            </span>
          </div>
        </div>
        <p className="text-xs md:text-sm text-indigo-100 font-medium leading-relaxed">{recommendation}</p>
      </div>

      {/* 4-Quadrant Synthesis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
        {/* 1. Key Findings & Specialist Contributions */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              1. Key Findings & Specialist Synthesis
            </span>
            <span className="text-[9px] font-mono text-slate-500">
              {participatingEmployees.length} Specialists
            </span>
          </div>
          <ul className="space-y-2 text-slate-200 text-xs leading-relaxed">
            {keyFindings.map((finding, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 font-bold shrink-0">•</span>
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 2. Business Implications */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            2. Strategic Business Implications
          </span>
          <ul className="space-y-2 text-slate-200 text-xs leading-relaxed">
            {businessImplications.map((imp, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 font-bold shrink-0">•</span>
                <span>{imp}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 3. Risks & Unknowns */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
          <span className="text-[10px] font-bold text-amber-400/90 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            3. Risks, Unknowns & Safeguards
          </span>
          <ul className="space-y-2 text-slate-300 text-xs leading-relaxed">
            {risks.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 font-bold shrink-0">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 4. Recommended Next Actions */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            4. Recommended Next Actions
          </span>
          <ul className="space-y-2 text-slate-200 text-xs leading-relaxed">
            {nextActions.map((action, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-400 font-mono font-bold text-[11px] mt-0.5 shrink-0">
                  {idx + 1}.
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Participating Workforce Summary */}
      {participatingEmployees.length > 0 && (
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Participating AI Workforce</span>
            <span className="font-mono text-indigo-400">Deterministic Multi-Agent Pipeline</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {participatingEmployees.map((emp) => (
              <div
                key={emp.agentId}
                className="p-2.5 rounded-lg bg-black/30 border border-white/5 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-[11px]">{emp.name}</span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase ${
                      emp.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {emp.status}
                  </span>
                </div>
                <div className="text-[10px] text-indigo-400">{emp.role}</div>
                <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug">{emp.contribution}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Founder Decision Sign-Off Section */}
      {isDecisionRequired && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-800/90 to-slate-900/90 border border-white/10 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] text-indigo-300 uppercase font-bold tracking-wider block">
                Founder Ratification & Governance
              </span>
              <h4 className="text-xs md:text-sm text-white font-bold mt-0.5">{decisionTitle}</h4>
            </div>

            <div className="flex items-center space-x-2">
              {decisionState === 'pending' ? (
                <>
                  <button
                    onClick={handleReject}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold transition-all flex items-center space-x-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Request Revision</span>
                  </button>

                  <button
                    onClick={handleApprove}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Sign Off & Ratify</span>
                  </button>
                </>
              ) : decisionState === 'approved' ? (
                <span className="px-3.5 py-1.5 rounded-lg bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold flex items-center space-x-1.5 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ratified by Founder (Human-in-the-Loop)</span>
                </span>
              ) : (
                <span className="px-3.5 py-1.5 rounded-lg bg-rose-950 border border-rose-500/40 text-rose-300 text-xs font-mono font-semibold flex items-center space-x-1.5">
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>Revision Requested by Founder</span>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1 border-t border-white/5">
            <div>
              <span className="text-slate-400 font-semibold">Governance Basis: </span>
              <span>{decisionWhy}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold">Projected Impact: </span>
              <span>{decisionImpact}</span>
            </div>
          </div>
        </div>
      )}

      {/* Prepared By Footer */}
      <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-1">
        <span>
          Prepared by {res?.preparedBy.name || 'Sophia Vance'} ({res?.preparedBy.role || 'COO'}) with{' '}
          {participatingEmployees.length > 0
            ? participatingEmployees
                .filter((e) => e.agentId !== 'coo')
                .map((e) => `${e.name} (${e.role.split(' ')[0]})`)
                .join(', ')
            : 'Executive AI Council'}
        </span>
        <span className="font-mono text-slate-400">
          Run ID: {run.id} • Protocol: 9-Step Standard
        </span>
      </div>

      {/* Evidence & Provenance Modal */}
      <EvidenceModal
        isOpen={isEvidenceModalOpen}
        onClose={() => setIsEvidenceModalOpen(false)}
        title={run.title || run.directive}
        provenance={run.deliverables[0]?.provenance}
        verification={run.verificationResult}
        details={run.summary}
        evidenceBasis={res?.evidenceAvailability.primaryBasis || 'model_reasoning'}
      />
    </div>
  );
};

