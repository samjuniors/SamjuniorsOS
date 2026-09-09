'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Zap,
  ShieldCheck,
  Lock,
  CheckCircle2,
  ChevronRight,
  Award,
  Layers,
  Cpu,
  Clock,
  Gauge,
  HelpCircle,
  TrendingUp,
  BrainCircuit,
  Filter,
  Users,
  Compass,
  Boxes,
  Coins,
  ArrowRight,
  Info,
  Check,
  AlertCircle,
  Star,
  PlusCircle,
} from 'lucide-react';
import { AgentRole } from '@/types/os';
import {
  RoleSkillTree,
  SkillNode,
  SkillBranch,
  EmployeeTrainingProfile,
} from '@/lib/training/types';
import { TrainingStore } from '@/lib/training/training-store';
import { playOSSound, dispatchOSNotification } from '@/components/os/IconHelper';

interface SkillTreeViewProps {
  selectedRole?: string;
  onSelectRole?: (role: string) => void;
  onOpenOnboarding?: (role: string) => void;
  onOpenDrills?: (role: string) => void;
  onOpenCustomOnboarder?: () => void;
}

export const SkillTreeView: React.FC<SkillTreeViewProps> = ({
  selectedRole = 'coo',
  onSelectRole,
  onOpenOnboarding,
  onOpenDrills,
  onOpenCustomOnboarder,
}) => {
  const [roleOverride, setRoleOverride] = useState<string | null>(null);
  const activeRole = roleOverride || selectedRole || 'coo';
  const [profiles, setProfiles] = useState(() => TrainingStore.getProfiles());
  const [skillTrees, setSkillTrees] = useState(() => TrainingStore.getSkillTrees());
  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [unlockMessage, setUnlockMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsub = TrainingStore.subscribe(() => {
      setProfiles({ ...TrainingStore.getProfiles() });
      setSkillTrees({ ...TrainingStore.getSkillTrees() });
    });
    return unsub;
  }, []);

  const currentProfile = profiles[activeRole] || profiles.coo;
  const currentTree = skillTrees[activeRole] || skillTrees.coo;

  const handleRoleChange = (role: string) => {
    setRoleOverride(role);
    setSelectedNode(null);
    setSelectedBranchId('all');
    setUnlockMessage(null);
    if (onSelectRole) onSelectRole(role);
  };

  const handleUnlockNode = (node: SkillNode) => {
    playOSSound('click');
    const res = TrainingStore.unlockSkillNode(activeRole, node.id);
    if (res.success) {
      playOSSound('notification');
      setUnlockMessage({ type: 'success', text: res.message });
      dispatchOSNotification({
        title: `Specialization Unlocked: ${node.title}`,
        message: `${currentProfile.name} mastered Tier ${node.level} (${node.tierName})! Orchestrator boost is now active.`,
        type: 'agent',
      });
      // refresh selected node with updated state
      const updatedTree = TrainingStore.getSkillTree(activeRole);
      if (updatedTree) {
        for (const b of updatedTree.branches) {
          const n = b.nodes.find((x) => x.id === node.id);
          if (n) setSelectedNode(n);
        }
      }
    } else {
      playOSSound('alert');
      setUnlockMessage({ type: 'error', text: res.message });
    }
    setTimeout(() => setUnlockMessage(null), 5000);
  };

  const activeModifiers = useMemo(() => {
    return TrainingStore.getActiveModifiersForAgent(activeRole);
  }, [activeRole]);

  const filteredBranches = useMemo(() => {
    if (!currentTree) return [];
    if (selectedBranchId === 'all') return currentTree.branches;
    return currentTree.branches.filter((b) => b.id === selectedBranchId);
  }, [currentTree, selectedBranchId]);

  const totalUnlockedInRole = useMemo(() => {
    return currentProfile?.unlockedNodeIds.length || 0;
  }, [currentProfile]);

  const totalNodesInRole = useMemo(() => {
    if (!currentTree) return 0;
    return currentTree.branches.reduce((acc, b) => acc + b.nodes.length, 0);
  }, [currentTree]);

  const roleList = Object.keys(skillTrees);

  return (
    <div className="space-y-6">
      {/* Top Banner: Employee Academy & Level Header */}
      <div className="os-glass-card rounded-2xl p-6 border border-white/10 bg-gradient-to-r from-[#121324] via-[#10121d] to-[#0c0d16] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Employee Avatar & Identity */}
          <div className="flex items-center space-x-4">
            <div
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${currentProfile.onboarding.assignedSpecializationTitle.includes('Orchestrator') ? 'from-purple-500 via-indigo-600 to-indigo-800' : currentProfile.onboarding.assignedSpecializationTitle.includes('Research') ? 'from-sky-500 via-blue-600 to-indigo-800' : currentProfile.onboarding.assignedSpecializationTitle.includes('Product') ? 'from-emerald-500 via-teal-600 to-cyan-800' : 'from-amber-500 via-orange-600 to-rose-800'} flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-500/20 border border-white/20`}
            >
              {currentProfile.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold text-white tracking-tight">{currentProfile.name}</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Level {currentProfile.level} • {currentProfile.specializationRank}
                </span>
                {currentProfile.onboarding.isFullyOnboarded ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Onboarded & Calibrated
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Onboarding in Progress ({currentProfile.onboarding.progressPct}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">{currentProfile.roleTitle}</p>
            </div>
          </div>

          {/* Quick Metrics & Progression XP */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Available XP */}
            <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Available Skill XP</p>
                <p className="text-base font-mono font-bold text-amber-300">{currentProfile.currentXp} XP</p>
              </div>
            </div>

            {/* Tree Mastery Progress */}
            <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <BrainCircuit className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tree Specialization</p>
                <p className="text-base font-mono font-bold text-indigo-300">
                  {totalUnlockedInRole} / {totalNodesInRole} Nodes
                </p>
              </div>
            </div>

            {/* Actions: Onboarding Wizard & Certification Drills */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenOnboarding && onOpenOnboarding(activeRole)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Onboarding Checklist</span>
              </button>
              <button
                onClick={() => onOpenDrills && onOpenDrills(activeRole)}
                className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Run Certification Drill</span>
              </button>
            </div>
          </div>
        </div>

        {/* Level XP Progress Bar */}
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
            <span>Mastery Progression to Level {currentProfile.level + 1}</span>
            <span className="font-mono text-indigo-300">
              {currentProfile.currentXp} / {currentProfile.nextLevelXp} XP
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (currentProfile.currentXp / currentProfile.nextLevelXp) * 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Role Switcher & Branch Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Role Selector Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1">
          {roleList.map((roleKey) => {
            const prof = profiles[roleKey];
            const isSelected = activeRole === roleKey;
            return (
              <button
                key={roleKey}
                onClick={() => handleRoleChange(roleKey)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-2 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border border-white/5'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                <span>{prof?.name || roleKey}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-black/30 font-mono">
                  Lvl {prof?.level || 1}
                </span>
              </button>
            );
          })}

          {onOpenCustomOnboarder && (
            <button
              onClick={onOpenCustomOnboarder}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 flex items-center space-x-1.5 transition whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Onboard New Agent</span>
            </button>
          )}
        </div>

        {/* Branch Filter */}
        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[11px] font-semibold uppercase text-slate-500">Branch:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="bg-[#151726] border border-white/10 text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Specialization Branches</option>
            {currentTree?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Unlock Message Toast */}
      <AnimatePresence>
        {unlockMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-3.5 rounded-xl border text-xs flex items-center space-x-3 shadow-lg ${
              unlockMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
            }`}
          >
            {unlockMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{unlockMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ACTIVE ORCHESTRATOR BOOST SUMMARY CARD */}
      <div className="os-glass-card rounded-2xl p-5 border border-indigo-500/20 bg-gradient-to-r from-indigo-950/30 via-slate-900/60 to-purple-950/30 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Live Orchestrator Performance Modifiers
              </h4>
              <p className="text-[11px] text-slate-400">
                Active specialization enhancements dynamically injected into {currentProfile.name}&apos;s system prompt during directive execution.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {activeModifiers.specializedCapabilities.length} Active Boosts
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center space-x-3">
            <Clock className="w-4 h-4 text-sky-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Routing Latency Bonus</p>
              <p className="font-mono font-bold text-sky-300">-{activeModifiers.latencyReductionMs}ms Relay SLA</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center space-x-3">
            <Gauge className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Epistemic Confidence</p>
              <p className="font-mono font-bold text-emerald-300">
                +{Math.round((activeModifiers.epistemicConfidenceMultiplier - 1) * 100)}% Grounding Boost
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center space-x-3">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Error Tolerance Cut</p>
              <p className="font-mono font-bold text-purple-300">-{activeModifiers.errorToleranceReductionPct}% Variance</p>
            </div>
          </div>
        </div>

        {/* Specialized Capabilities Badges */}
        {activeModifiers.specializedCapabilities.length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-white/5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Unlocked Abilities:</span>
            {activeModifiers.specializedCapabilities.map((cap, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-slate-300 border border-white/10"
              >
                {cap}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* MAIN SKILL TREE VISUAL CANVAS & BRANCHES */}
      <div className="space-y-8">
        {filteredBranches.map((branch, bIdx) => (
          <div
            key={branch.id}
            className="os-glass-card rounded-2xl p-6 border border-white/10 bg-[#0e0f19]/90 shadow-xl space-y-6"
          >
            {/* Branch Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: `${branch.accentColor}25`, borderColor: `${branch.accentColor}50` }}
                >
                  <BrainCircuit className="w-5 h-5" style={{ color: branch.accentColor }} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-base font-bold text-white">{branch.name}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                      Branch {bIdx + 1}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{branch.description}</p>
                </div>
              </div>

              <div className="text-xs text-slate-400 font-mono">
                {branch.nodes.filter((n) => currentProfile.unlockedNodeIds.includes(n.id)).length} / {branch.nodes.length} Mastered
              </div>
            </div>

            {/* Branch Nodes: Tier 1 -> Tier 2 -> Tier 3 Progression */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              {branch.nodes.map((node, nodeIdx) => {
                const isUnlocked = currentProfile.unlockedNodeIds.includes(node.id) || node.isUnlocked;
                const hasPrereqs =
                  node.prerequisiteNodeIds.length === 0 ||
                  node.prerequisiteNodeIds.every((preId) => currentProfile.unlockedNodeIds.includes(preId));
                const canAfford = currentProfile.currentXp >= node.xpCost;
                const isSelected = selectedNode?.id === node.id;

                return (
                  <div key={node.id} className="relative flex flex-col">
                    {/* Connecting line indicator for tier progression */}
                    {nodeIdx > 0 && (
                      <div className="hidden md:block absolute -left-3 top-8 w-3 h-0.5 bg-gradient-to-r from-white/20 to-white/5" />
                    )}

                    <div
                      onClick={() => setSelectedNode(node)}
                      className={`h-full rounded-2xl p-5 border transition-all cursor-pointer flex flex-col justify-between ${
                        isUnlocked
                          ? 'bg-gradient-to-b from-indigo-950/40 to-slate-900/80 border-indigo-500/40 shadow-lg shadow-indigo-500/10 hover:border-indigo-400'
                          : hasPrereqs
                          ? 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                          : 'bg-black/30 border-white/5 opacity-60'
                      } ${isSelected ? 'ring-2 ring-indigo-400 border-indigo-400' : ''}`}
                    >
                      {/* Node Header */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              node.level === 1
                                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                : node.level === 2
                                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            Tier {node.level} • {node.tierName}
                          </span>

                          {isUnlocked ? (
                            <span className="flex items-center space-x-1 text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Mastered</span>
                            </span>
                          ) : (
                            <span className="flex items-center space-x-1 text-[11px] font-mono text-amber-400">
                              <Sparkles className="w-3 h-3" />
                              <span>{node.xpCost} XP</span>
                            </span>
                          )}
                        </div>

                        <h5 className="text-sm font-bold text-white mb-1">{node.title}</h5>
                        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{node.description}</p>
                      </div>

                      {/* Node Footer / Modifiers & Action */}
                      <div className="mt-4 pt-3 border-t border-white/5">
                        <div className="text-[11px] text-slate-300 font-mono mb-2 flex items-center justify-between">
                          <span className="text-slate-500">Latency Bonus:</span>
                          <span className="text-sky-300">-{node.boostModifiers.latencyReductionMs}ms</span>
                        </div>

                        {isUnlocked ? (
                          <div className="w-full py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-center text-xs font-semibold flex items-center justify-center space-x-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Active in Orchestrator</span>
                          </div>
                        ) : (
                          <button
                            disabled={!hasPrereqs || !canAfford}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnlockNode(node);
                            }}
                            className={`w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                              hasPrereqs && canAfford
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 cursor-pointer'
                                : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                            }`}
                          >
                            {!hasPrereqs ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Prerequisite Locked</span>
                              </>
                            ) : !canAfford ? (
                              <>
                                <Sparkles className="w-3 h-3" />
                                <span>Need {node.xpCost - currentProfile.currentXp} More XP</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-3 h-3" />
                                <span>Unlock Ability ({node.xpCost} XP)</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* DETAIL INSPECTION MODAL / DRAWER IF SELECTED */}
      <AnimatePresence>
        {selectedNode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-[#11121f] border border-indigo-500/30 rounded-2xl p-6 shadow-2xl text-slate-100 relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Tier {selectedNode.level} Specialization • {selectedNode.tierName}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1.5">{selectedNode.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed mb-4">{selectedNode.description}</p>

              {/* Injected Prompt Directive */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 mb-4">
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Dynamic Orchestrator Prompt Directive Injection
                </p>
                <p className="text-xs font-mono text-slate-200 bg-white/5 p-2 rounded-lg border border-white/5">
                  &quot;{selectedNode.boostModifiers.promptDirectiveInjection}&quot;
                </p>
              </div>

              {/* Modifiers List */}
              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-500 block">Routing Latency Bonus</span>
                  <span className="font-mono font-bold text-sky-300">-{selectedNode.boostModifiers.latencyReductionMs}ms</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-500 block">Epistemic Confidence Boost</span>
                  <span className="font-mono font-bold text-emerald-300">
                    +{Math.round((selectedNode.boostModifiers.epistemicConfidenceMultiplier - 1) * 100)}%
                  </span>
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => setSelectedNode(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition"
                >
                  Close
                </button>

                {currentProfile.unlockedNodeIds.includes(selectedNode.id) ? (
                  <div className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Unlocked & Active</span>
                  </div>
                ) : (
                  <button
                    disabled={currentProfile.currentXp < selectedNode.xpCost}
                    onClick={() => handleUnlockNode(selectedNode)}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Unlock Ability ({selectedNode.xpCost} XP)</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
