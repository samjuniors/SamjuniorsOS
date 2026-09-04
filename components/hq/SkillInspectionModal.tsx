'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ShieldCheck,
  Lock,
  Wrench,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Layers,
  Terminal,
  Cpu,
  BadgeAlert,
} from 'lucide-react';
import { StructuredSkillDefinition } from '@/types/capabilities';

interface SkillInspectionModalProps {
  skill: StructuredSkillDefinition | Readonly<StructuredSkillDefinition> | null;
  onClose: () => void;
  assignedRoleName?: string;
  assignedEmployeeName?: string;
}

export const SkillInspectionModal: React.FC<SkillInspectionModalProps> = ({
  skill,
  onClose,
  assignedRoleName,
  assignedEmployeeName,
}) => {
  if (!skill) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4 bg-black/40">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 uppercase font-semibold">
                  {skill.category}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{skill.id}</span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <Lock className="w-2.5 h-2.5" /> Immutable Skill
                </span>
              </div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                {skill.name}
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">{skill.purpose}</p>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4 text-xs">
            {/* Ownership & Immutability Banner */}
            <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-indigo-200 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Assigned Specialist & Governance Boundary</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Assigned to <span className="font-semibold text-white">{assignedRoleName || `${skill.category} Specialist`}</span>
                  {assignedEmployeeName ? ` (${assignedEmployeeName})` : ''}.
                  Employees determine skills deterministically based on directive context without Founder manual tool selection.
                </p>
              </div>
              <div className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap">
                <Lock className="w-3 h-3" /> Runtime Immutable
              </div>
            </div>

            {/* Allowed Tools */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-sky-400" /> Allowed Tools & Integrations
              </span>
              <div className="flex flex-wrap gap-2">
                {skill.allowedTools.length === 0 ? (
                  <span className="text-slate-500 text-[11px] italic">Pure reasoning / deterministic internal synthesis (no external tool calls permitted).</span>
                ) : (
                  skill.allowedTools.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 font-mono text-[11px] flex items-center gap-1"
                    >
                      <Terminal className="w-3 h-3 text-sky-400" />
                      {t}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Required Inputs */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-indigo-400" /> Required Inputs
              </span>
              <div className="flex flex-wrap gap-1.5">
                {skill.requiredInputs.map((input, i) => (
                  <div
                    key={typeof input === 'string' ? input : (input.name || i)}
                    className="px-2.5 py-1 rounded bg-black/30 border border-white/10 text-slate-300 font-mono text-[11px] flex items-center gap-1.5"
                  >
                    <span className="font-bold text-white">{typeof input === 'string' ? input : input.name}</span>
                    {typeof input === 'object' && input.required && (
                      <span className="text-[9px] text-rose-400 font-sans font-semibold">*req</span>
                    )}
                    {typeof input === 'object' && input.description && (
                      <span className="text-[10px] text-slate-400 font-sans">({input.description})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step-by-Step Procedure */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-emerald-400" /> Execution Procedure / Instructions
              </span>
              <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-2">
                {skill.procedure.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-slate-200 text-xs leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence & Verification Requirements */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-amber-400" /> Evidence Requirements
                </span>
                <ul className="space-y-1.5 text-slate-300">
                  {skill.evidenceRequirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{req}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Verification Requirements
                </span>
                <ul className="space-y-1.5 text-slate-300">
                  {skill.verificationRequirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Output Format & Escalation Conditions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-1.5">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                  Structured Output Format
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {skill.outputFormat}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-1.5">
                <span className="text-[10px] font-mono uppercase font-bold text-rose-300 flex items-center gap-1.5">
                  <BadgeAlert className="w-3 h-3 text-rose-400" /> Escalation / Approval Conditions
                </span>
                <ul className="space-y-1 text-slate-300 text-[11px]">
                  {skill.escalationConditions.map((cond, i) => (
                    <li key={i} className="flex items-start gap-1 text-rose-200">
                      <span className="text-rose-400 mr-1">•</span>
                      <span>{cond}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono text-[10px]">Governance Rule: Skills cannot mutate permissions, budget, or instructions</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
            >
              Done Inspecting
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
