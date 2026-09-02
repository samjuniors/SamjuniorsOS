'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  ArrowRight,
  Check,
} from 'lucide-react';
import { OrchestrationRun, ExecutionDeliverable } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface ExecutiveResultCardProps {
  run: OrchestrationRun;
  onInspectWork: () => void;
  onViewDeliverables: () => void;
  onApproveDecision?: () => void;
}

export const ExecutiveResultCard: React.FC<ExecutiveResultCardProps> = ({
  run,
  onInspectWork,
  onViewDeliverables,
  onApproveDecision,
}) => {
  const [isDecisionApproved, setIsDecisionApproved] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] = useState<ExecutionDeliverable | null>(null);

  const handleApprove = () => {
    setIsDecisionApproved(true);
    if (onApproveDecision) onApproveDecision();
  };

  // Find deliverables
  const mainReport = run.deliverables.find((d) => d.name.toLowerCase().includes('report')) || run.deliverables[0];

  return (
    <div className="bg-slate-900/95 border border-indigo-500/30 rounded-2xl p-5 shadow-2xl space-y-4 relative overflow-hidden">
      {/* Top Accent Gradient */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-mono font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              COUNCIL SYNTHESIS COMPLETE
            </span>
            <span className="text-[10px] font-mono text-slate-400">{run.timestamp}</span>
          </div>
          <h2 className="text-sm font-bold text-white mt-1">{run.title || run.directive}</h2>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onInspectWork}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Inspect Technical Work</span>
          </button>

          <button
            onClick={onViewDeliverables}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Documents ({run.deliverables.length})</span>
          </button>
        </div>
      </div>

      {/* Executive Recommendation Box */}
      <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" />
            Executive Recommendation
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/20">
            Unanimous Council Alignment
          </span>
        </div>
        <p className="text-xs text-indigo-100 font-medium leading-relaxed">
          {run.summary ||
            'The Executive Council recommends launching the Self-Serve Enterprise Tier in Q4. All unit economics verify $0.18 compute cost per onboarded workspace with zero infrastructure bottlenecks.'}
        </p>
      </div>

      {/* Findings, Implications, Risks & Next Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* Key Findings */}
        <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            1. Key Findings & Evidence
          </span>
          <ul className="space-y-1.5 text-slate-200 text-[11px] leading-relaxed">
            <li className="flex items-start gap-1.5">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>
                <strong>Market Research (Dr. Thorne):</strong> 78% of enterprise buyers drop off on mandatory sales calls.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-pink-400 mt-0.5">•</span>
              <span>
                <strong>Product PRD (Maya Lin):</strong> 3-click automated workspace provisioning flow pre-trains on public domain data.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>
                <strong>Unit Economics (Julian Cruz):</strong> Compute burn held at $0.18/tenant onboarding via batching.
              </span>
            </li>
          </ul>
        </div>

        {/* Business Implications */}
        <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            2. Business Implications
          </span>
          <ul className="space-y-1.5 text-slate-200 text-[11px] leading-relaxed">
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Bypasses 6-week enterprise sales cycles to accelerate self-serve pipeline velocity.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Maintains capital efficiency with zero additional human onboarding overhead.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>Empowers mid-market founders to evaluate autonomous multi-agent capability in &lt;60s.</span>
            </li>
          </ul>
        </div>

        {/* Risks & Unknowns */}
        <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
          <span className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            3. Risks & Considerations
          </span>
          <ul className="space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
            <li className="flex items-start gap-1.5">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>Inference rate limits during spike traffic; mitigated via automated caching fallbacks.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>Safe Mock Sandboxing remains strictly enforced to prevent unverified financial executions.</span>
            </li>
          </ul>
        </div>

        {/* Recommended Next Actions */}
        <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            4. Recommended Next Actions
          </span>
          <ul className="space-y-1.5 text-slate-200 text-[11px] leading-relaxed">
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-400 mt-0.5">1.</span>
              <span>Founder approval on Beta cohort launch parameters (15 waitlisted accounts).</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-400 mt-0.5">2.</span>
              <span>Sprint 1: Deploy domain crawler and instant agent workspace generator.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Founder Sign-off Callout */}
      <div className="p-3.5 rounded-xl bg-slate-800/80 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Decision Sign-off</span>
          <p className="text-xs text-white font-medium">
            Approve Q4 Beta Launch & Provisioning Architecture
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {!isDecisionApproved ? (
            <button
              onClick={handleApprove}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Sign Off & Approve</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ratified by Founder</span>
            </span>
          )}
        </div>
      </div>

      {/* Sign-off Footnote */}
      <div className="pt-2 text-center text-[10px] text-slate-500 italic">
        Prepared by Sophia Vance (COO) with Dr. Aris Thorne (Research), Maya Lin (Product), and Julian Cruz (Finance)
      </div>
    </div>
  );
};
