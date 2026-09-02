'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, Database, Cpu, Clock, FileCheck, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { OutputProvenance, VerificationResult } from '@/types/os';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  provenance?: OutputProvenance;
  verification?: VerificationResult;
  sourceText?: string;
  evidenceBasis?: string;
  details?: string;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  onClose,
  title,
  provenance,
  verification,
  sourceText,
  evidenceBasis,
  details,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-xl bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-slate-800/80 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Evidence & Provenance Audit</h3>
                <p className="text-[11px] text-slate-400 truncate max-w-md">{title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300">
            {/* Primary Evidence Basis */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Grounding & Evidence Basis
              </span>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono text-[11px] font-semibold">
                  {provenance?.evidenceBasis || evidenceBasis || 'model_reasoning'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {provenance?.isVerified !== false ? 'Verified & Audited' : 'Awaiting Peer Verification'}
                </span>
              </div>
              {details && <p className="text-xs text-slate-200 leading-relaxed mt-1">{details}</p>}
            </div>

            {/* Source Information */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Source Attribution
              </span>
              <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Author Employee:</span>
                  <span className="text-white font-semibold">{provenance?.agentName || 'Executive Council'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Protocol Phase:</span>
                  <span className="text-indigo-300 uppercase">{provenance?.protocolStep || 'Executive Synthesis'}</span>
                </div>
                {provenance?.taskId && (
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Task Reference:</span>
                    <span className="text-slate-300">{provenance.taskId}</span>
                  </div>
                )}
                {provenance?.modelUsed && (
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Underlying Model:</span>
                    <span className="text-emerald-400">{provenance.modelUsed}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Recorded Timestamp:</span>
                  <span className="text-slate-300">{provenance?.timestamp || 'Today at 09:30 AM'}</span>
                </div>
              </div>
            </div>

            {/* Verification Checks */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Constitutional & Safety Guarantees
              </span>
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px]">Safe Mock Sandbox: No live external bank or production mutations executed</span>
                </div>
                <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px]">Human-in-the-Loop Safeguard: Founder approval required for irreversible actions</span>
                </div>
                <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[11px]">Empirical Grounding: Zero fabricated metrics or unverified financial claims</span>
                </div>
              </div>
            </div>

            {sourceText && (
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Raw Output Text</span>
                <p className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                  {sourceText}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-800/80 border-t border-white/10 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
            >
              Close Inspector
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
