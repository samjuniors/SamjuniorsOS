'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Play,
  CheckCircle2,
  AlertTriangle,
  Award,
  Sparkles,
  ShieldCheck,
  Cpu,
  Clock,
  ChevronRight,
  Filter,
  RotateCcw,
  Check,
  FileText,
  Fingerprint,
} from 'lucide-react';
import { AgentRole } from '@/types/os';
import { SimulationDrill, DrillEvaluationResult, EmployeeTrainingProfile } from '@/lib/training/types';
import { TrainingStore } from '@/lib/training/training-store';
import { playOSSound, dispatchOSNotification } from '@/components/os/IconHelper';

interface TrainingDrillsViewProps {
  selectedRole?: string;
  onOpenSkillTree?: (role: string) => void;
}

export const TrainingDrillsView: React.FC<TrainingDrillsViewProps> = ({
  selectedRole,
  onOpenSkillTree,
}) => {
  const [drills, setDrills] = useState<SimulationDrill[]>(() => TrainingStore.getDrills());
  const [profiles, setProfiles] = useState<Record<string, EmployeeTrainingProfile>>(() =>
    TrainingStore.getProfiles()
  );
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [roleFilterOverride, setRoleFilterOverride] = useState<string | null>(null);
  const selectedRoleFilter = roleFilterOverride || selectedRole || 'all';

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<DrillEvaluationResult | null>(null);
  const [historyResults, setHistoryResults] = useState<DrillEvaluationResult[]>([]);

  useEffect(() => {
    const unsub = TrainingStore.subscribe(() => {
      setDrills([...TrainingStore.getDrills()]);
      setProfiles({ ...TrainingStore.getProfiles() });
    });
    return unsub;
  }, []);

  const filteredDrills = drills.filter((d) => {
    if (selectedRoleFilter === 'all') return true;
    return d.roleId === selectedRoleFilter;
  });

  const activeDrill =
    (selectedDrillId ? drills.find((d) => d.id === selectedDrillId) : null) ||
    filteredDrills[0] ||
    drills[0] ||
    null;

  const handleRunDrill = async (drill: SimulationDrill) => {
    setIsRunning(true);
    setCurrentResult(null);
    playOSSound('click');

    try {
      const res = await fetch('/api/training/run-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drillId: drill.id,
          agentId: drill.roleId,
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        setCurrentResult(data.result);
        TrainingStore.recordDrillResult(data.result);
        setHistoryResults((prev) => [data.result, ...prev]);
        playOSSound('celebration');
        dispatchOSNotification(
          `Drill Passed: ${drill.title}`,
          `${data.result.agentName} scored ${data.result.overallScore}%! Awarded +${drill.xpReward} Skill XP.`,
          'success'
        );
      } else {
        throw new Error(data.error || 'Failed to complete drill');
      }
    } catch (err: any) {
      console.error('Error running drill:', err);
      playOSSound('alert');
      dispatchOSNotification('Drill Error', err.message || 'Execution failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="os-glass-card rounded-2xl p-6 border border-white/10 bg-gradient-to-r from-purple-950/40 via-[#121324] to-[#0c0d16] shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-purple-500/20 border border-white/20">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-white">AI Employee Certification Arena</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Stress & Invariant Testing
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Run simulated crisis drills, audit 9-step execution under stress, and award mastery Skill XP.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center space-x-2 text-xs">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300 font-semibold">Total Drills Available:</span>
              <span className="font-mono font-bold text-amber-300">{drills.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Role Selector & Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setRoleFilterOverride('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              selectedRoleFilter === 'all'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            All AI Employees
          </button>
          {Object.values(profiles).map((prof) => (
            <button
              key={prof.agentId}
              onClick={() => setRoleFilterOverride(prof.agentId as string)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-2 ${
                selectedRoleFilter === prof.agentId
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{prof.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
                {prof.completedDrillIds.length} Passed
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Left Drills List & Right Active Drill Simulation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Drills Catalog (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Certification Drills ({filteredDrills.length})
          </h4>

          <div className="space-y-3">
            {filteredDrills.map((drill) => {
              const assignedProfile = profiles[drill.roleId];
              const isPassed = assignedProfile?.completedDrillIds.includes(drill.id);
              const isSelected = activeDrill?.id === drill.id;

              return (
                <div
                  key={drill.id}
                  onClick={() => {
                    setSelectedDrillId(drill.id);
                    setCurrentResult(null);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-950/40 border-purple-500/50 shadow-lg shadow-purple-500/10'
                      : 'bg-[#10121d] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        drill.difficulty === 'Crisis Invariant'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : drill.difficulty === 'Stress Test'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {drill.difficulty}
                    </span>

                    <div className="flex items-center space-x-2">
                      {isPassed ? (
                        <span className="flex items-center space-x-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Certified</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-[11px] font-mono text-amber-300">
                          <Sparkles className="w-3 h-3" />
                          <span>+{drill.xpReward} XP</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <h5 className="text-sm font-bold text-white mb-1">{drill.title}</h5>
                  <p className="text-xs text-slate-400 line-clamp-2">{drill.scenarioDescription}</p>

                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Target: {assignedProfile?.name || drill.roleId}</span>
                    <span className="font-mono text-purple-300">{drill.category}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Simulation Arena & Execution View (7 cols) */}
        <div className="lg:col-span-7">
          {activeDrill ? (
            <div className="os-glass-card rounded-2xl p-6 border border-white/10 bg-[#10121d] shadow-xl space-y-6">
              {/* Active Drill Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {activeDrill.category} • {activeDrill.difficulty}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">{activeDrill.title}</h3>
                  <p className="text-xs text-slate-400">
                    Testing Candidate: {profiles[activeDrill.roleId]?.name || activeDrill.roleId} (Level{' '}
                    {profiles[activeDrill.roleId]?.level || 1})
                  </p>
                </div>

                <button
                  disabled={isRunning}
                  onClick={() => handleRunDrill(activeDrill)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg shadow-purple-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isRunning ? 'Simulating Scenario...' : 'Execute Simulation Drill'}</span>
                </button>
              </div>

              {/* Scenario Description */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">
                    Simulated Scenario Context
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">{activeDrill.scenarioDescription}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                    Simulated Founder Directive
                  </span>
                  <p className="text-xs font-mono text-amber-200">&quot;{activeDrill.simulatedFounderDirective}&quot;</p>
                </div>
              </div>

              {/* Invariant Enforcements Checklist */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Mandatory Invariant Enforcements
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeDrill.invariantEnforcements.map((inv, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center space-x-2 text-xs text-slate-300"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{inv}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulation Result Output / Grading */}
              {currentResult && (
                <div className="p-5 rounded-2xl bg-gradient-to-b from-purple-950/30 to-black/60 border border-purple-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <h4 className="text-sm font-bold text-white">Drill Evaluation & Grading Report</h4>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">Overall Score:</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono font-bold text-sm border border-emerald-500/30">
                        {currentResult.overallScore}%
                      </span>
                    </div>
                  </div>

                  {/* Rubric Metrics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {currentResult.metrics.map((m, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-200">{m.name}</span>
                          <span className="font-mono font-bold text-emerald-400">{m.score}%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug">{m.commentary}</p>
                      </div>
                    ))}
                  </div>

                  {/* Output Deliverable */}
                  <div className="p-3.5 rounded-xl bg-black/60 border border-white/10">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Generated Executive Deliverable
                    </span>
                    <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {currentResult.generatedDeliverable}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="os-glass-card rounded-2xl p-12 border border-white/10 bg-[#10121d] text-center text-slate-400">
              <Zap className="w-8 h-8 mx-auto text-purple-400 mb-3 opacity-50" />
              <p className="text-sm">Select a certification drill from the list to launch simulation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
