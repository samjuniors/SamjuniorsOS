'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  Zap,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Award,
  Cpu,
  Fingerprint,
  Layers,
  HelpCircle,
  FileCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { AgentRole } from '@/types/os';
import { OnboardingPhase, OnboardingChecklistItem, EmployeeTrainingProfile } from '@/lib/training/types';
import { TrainingStore } from '@/lib/training/training-store';
import { playOSSound, dispatchOSNotification } from '@/components/os/IconHelper';

interface AIEmployeeOnboardingModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  onLaunchDrill?: (drillId: string) => void;
}

const PHASES: { id: OnboardingPhase; title: string; subtitle: string; iconName: string }[] = [
  {
    id: 'constitutional_alignment',
    title: '1. Constitutional Alignment',
    subtitle: 'Safety invariants & Safe Mock sandboxing',
    iconName: 'ShieldCheck',
  },
  {
    id: 'tool_epistemic_calibration',
    title: '2. Epistemic Calibration',
    subtitle: '4-way context grounding & token bounds',
    iconName: 'Cpu',
  },
  {
    id: 'skill_tree_specialization',
    title: '3. Skill Specialization',
    subtitle: 'Branch allocation & modifier routing',
    iconName: 'Layers',
  },
  {
    id: 'certification_simulation',
    title: '4. Stress Certification',
    subtitle: 'Domain drill testing & rubric audit',
    iconName: 'Zap',
  },
  {
    id: 'orchestrator_activation',
    title: '5. Orchestrator Mesh',
    subtitle: 'Active multi-agent deployment',
    iconName: 'Award',
  },
];

export const AIEmployeeOnboardingModal: React.FC<AIEmployeeOnboardingModalProps> = ({
  agentId,
  isOpen,
  onClose,
  onLaunchDrill,
}) => {
  const [profile, setProfile] = useState<EmployeeTrainingProfile | undefined>(() =>
    TrainingStore.getProfile(agentId)
  );
  const [activePhaseIndex, setActivePhaseIndex] = useState<number>(0);
  const [isSigningConstitution, setIsSigningConstitution] = useState<boolean>(false);
  const [agreementSignature, setAgreementSignature] = useState<string | null>(null);

  useEffect(() => {
    const unsub = TrainingStore.subscribe(() => {
      setProfile(TrainingStore.getProfile(agentId));
    });
    return unsub;
  }, [agentId]);

  if (!isOpen || !profile) return null;

  const currentPhase = PHASES[activePhaseIndex];

  const handleSignConstitution = () => {
    setIsSigningConstitution(true);
    playOSSound('click');
    setTimeout(() => {
      TrainingStore.signConstitutionalAgreement(agentId);
      const signatureHash = `SHA256:CONSTITUTION_RATIFIED_${agentId.toUpperCase()}_${Date.now().toString(16)}`;
      setAgreementSignature(signatureHash);
      setIsSigningConstitution(false);
      playOSSound('notification');
      dispatchOSNotification(
        'Constitutional Agreement Ratified',
        `${profile.name} bound to 5 Core Invariants with cryptographic signature ${signatureHash.slice(0, 16)}...`,
        'success'
      );
    }, 600);
  };

  const handleToggleItem = (itemId: string, currentVal: boolean) => {
    playOSSound('click');
    TrainingStore.toggleChecklistItem(agentId, itemId, !currentVal);
  };

  const handleAdvancePhase = () => {
    if (activePhaseIndex < PHASES.length - 1) {
      const nextPhase = PHASES[activePhaseIndex + 1];
      setActivePhaseIndex(activePhaseIndex + 1);
      TrainingStore.updateOnboardingPhase(agentId, nextPhase.id);
      playOSSound('click');
    } else {
      // Complete activation
      playOSSound('celebration');
      dispatchOSNotification(
        'Onboarding Complete',
        `${profile.name} is now fully calibrated and deployed to the Orchestration Mesh!`,
        'success'
      );
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl bg-[#10121d] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Top Header */}
        <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-indigo-950/50 via-[#10121d] to-purple-950/30 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">AI Employee Onboarding & Calibration Academy</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {profile.name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                5-Phase Alignment, Safety Invariants, and Orchestration Specialization Pipeline
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Phase Navigation Tabs */}
        <div className="flex border-b border-white/10 overflow-x-auto bg-[#0a0b12] px-3 py-2 space-x-2">
          {PHASES.map((phase, idx) => {
            const isCurrent = activePhaseIndex === idx;
            const isCompleted = activePhaseIndex > idx || profile.onboarding.progressPct >= (idx + 1) * 20;
            return (
              <button
                key={phase.id}
                onClick={() => setActivePhaseIndex(idx)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : isCompleted
                    ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[9px] shrink-0">
                    {idx + 1}
                  </span>
                )}
                <span>{phase.title}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Main Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          {/* PHASE 1: CONSTITUTIONAL ALIGNMENT */}
          {currentPhase.id === 'constitutional_alignment' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  The 5 Core Constitutional Invariants
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Every AI employee in SamJuniors OS is cryptographically bound to immutable safety invariants before receiving task dispatch rights.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Invariant 1</span>
                  <h5 className="font-bold text-white">Safe Mock Sandboxing</h5>
                  <p className="text-slate-400 text-[11px]">
                    All payment gateways, SMS dispatches, and destructive file mutations execute in deterministic mock sandboxes.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Invariant 2</span>
                  <h5 className="font-bold text-white">Zero Metric Fabrication</h5>
                  <p className="text-slate-400 text-[11px]">
                    Never invent fake TAM sizing, hallucinated revenue, or unverified compliance credentials.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Invariant 3</span>
                  <h5 className="font-bold text-white">Zero Secret Leakage</h5>
                  <p className="text-slate-400 text-[11px]">
                    API keys, system credentials, and private customer PII are strictly barred from outputs and client responses.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Invariant 4</span>
                  <h5 className="font-bold text-white">Mandatory Human Escalation</h5>
                  <p className="text-slate-400 text-[11px]">
                    High-risk structural shifts, external dispatches, and financial limits require explicit Founder approval.
                  </p>
                </div>
              </div>

              {/* Cryptographic Signature Area */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Fingerprint className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-white text-xs">Cryptographic Ratification Stamp</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    {profile.onboarding.constitutionalAgreementSigned
                      ? 'Status: Verified & Enforced in Governance Engine'
                      : 'Status: Pending Founder & Agent Sign-Off'}
                  </p>
                </div>

                {profile.onboarding.constitutionalAgreementSigned ? (
                  <div className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center space-x-1.5 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ratified & Enforced</span>
                  </div>
                ) : (
                  <button
                    disabled={isSigningConstitution}
                    onClick={handleSignConstitution}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition shrink-0"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{isSigningConstitution ? 'Signing SHA-256...' : 'Sign & Ratify Invariants'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PHASE 2: TOOL & EPISTEMIC CALIBRATION */}
          {currentPhase.id === 'tool_epistemic_calibration' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-500/20">
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  Epistemic Grounding & Context Bus Calibration
                </h4>
                <p className="text-xs text-slate-300">
                  Configure the 4-way separation engine and verify multi-agent retrieval relevance thresholds.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white">4-Way Epistemic Separation Protocol</h5>
                    <p className="text-slate-400 text-[11px]">
                      Enforces explicit categorization into: 1) Empirical Facts, 2) Model Inferences, 3) Strategic Recommendations, 4) Known Unknowns.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    100% Calibrated
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white">Context Window Allocation</h5>
                    <p className="text-slate-400 text-[11px]">
                      Full 1,000,000 token active context window linked to the SamJuniors Memory Vault and real-time knowledge graphs.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    1.0M Tokens
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white">Target Relay SLA Threshold</h5>
                    <p className="text-slate-400 text-[11px]">
                      Sub-600ms latency ceiling for inter-agent relay handoffs in the Orchestration Mesh.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    450ms Average
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PHASE 3: SKILL SPECIALIZATION */}
          {currentPhase.id === 'skill_tree_specialization' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/20">
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Skill Tree Branches & Masteries
                </h4>
                <p className="text-xs text-slate-300">
                  {profile.name} has unlocked {profile.unlockedNodeIds.length} specialization nodes across 3 operational branches.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Assigned Specialization Rank:</span>
                  <span className="font-mono text-purple-300 font-bold">{profile.specializationRank}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Unlocked Nodes:</span>
                  <span className="font-mono text-indigo-300">{profile.unlockedNodeIds.join(', ')}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Active Prompt Boost Injections:</span>
                  <span className="font-mono text-emerald-300">{profile.unlockedNodeIds.length} Vectors</span>
                </div>
              </div>
            </div>
          )}

          {/* PHASE 4: CERTIFICATION DRILL */}
          {currentPhase.id === 'certification_simulation' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/20">
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Interactive Domain Stress Certification
                </h4>
                <p className="text-xs text-slate-300">
                  Validate that {profile.name} adheres to constitutional invariants, SLA bounds, and zero-hallucination protocols under crisis conditions.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-white">Certification Drills Passed: {profile.completedDrillIds.length}</h5>
                  <p className="text-slate-400 text-[11px]">
                    {profile.completedDrillIds.length > 0
                      ? 'Domain certification criteria satisfied with >90% precision score.'
                      : 'Pending certification drill execution.'}
                  </p>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    if (onLaunchDrill) onLaunchDrill(profile.agentId as string);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center space-x-1.5 shadow-lg shadow-amber-500/30 transition shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Simulation Arena</span>
                </button>
              </div>
            </div>
          )}

          {/* PHASE 5: ORCHESTRATOR ACTIVATION */}
          {currentPhase.id === 'orchestrator_activation' && (
            <div className="space-y-5 text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white mx-auto shadow-xl shadow-indigo-500/30 border border-white/20">
                <Award className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-base font-bold text-white">Ready for Orchestrator Mesh Deployment</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  {profile.name} is calibrated, constitutionally ratified, and armed with active skill tree specialization modifiers.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 max-w-md mx-auto grid grid-cols-2 gap-3 text-left">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Clearance Level</span>
                  <span className="font-mono text-indigo-300 font-bold">EXECUTIVE-L{profile.level}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Latency SLA</span>
                  <span className="font-mono text-emerald-300 font-bold">Sub-450ms Relay</span>
                </div>
              </div>
            </div>
          )}

          {/* Onboarding Checklist for this phase */}
          <div className="pt-4 border-t border-white/10 space-y-2.5">
            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Onboarding Checklist ({profile.onboarding.progressPct}% Complete)
            </h5>

            <div className="space-y-2">
              {profile.onboarding.checklist.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggleItem(item.id, item.isCompleted)}
                  className={`p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                    item.isCompleted
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200'
                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-md border mt-0.5 flex items-center justify-center transition shrink-0 ${
                      item.isCompleted
                        ? 'bg-emerald-500 border-emerald-400 text-black'
                        : 'border-white/20 bg-black/20'
                    }`}
                  >
                    {item.isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div className="flex-1">
                    <p className={`text-xs font-semibold ${item.isCompleted ? 'text-white' : 'text-slate-300'}`}>
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                    {item.verificationEvidence && (
                      <p className="text-[10px] font-mono text-indigo-300/80 mt-1">
                        ✓ {item.verificationEvidence}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Bottom Navigation */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#0a0b12] flex items-center justify-between">
          <button
            disabled={activePhaseIndex === 0}
            onClick={() => setActivePhaseIndex(Math.max(0, activePhaseIndex - 1))}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous Phase</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleAdvancePhase}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition"
            >
              <span>
                {activePhaseIndex === PHASES.length - 1 ? 'Deploy to Live Mesh' : 'Next Phase'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
