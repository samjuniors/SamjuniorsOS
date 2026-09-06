'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  DollarSign,
  Compass,
  Boxes,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  Cpu,
  Layers,
  FastForward,
  Plus,
  Filter,
  Volume2,
  VolumeX,
  Scale,
  Send,
  Check,
  Briefcase,
  Share2,
  FileText,
  AlertCircle,
  Network,
} from 'lucide-react';
import {
  AppId,
  AgentRole,
  CollaborationStep,
  DelegatedSubTask,
  OrchestratorMediation,
  CollaborationDialogueIntent,
} from '@/types/os';
import { CollaborationStore, COLLABORATION_PRESETS } from '@/lib/collaboration-store';
import { playOSSound, dispatchOSNotification } from '../os/IconHelper';
import { AgentAvatar } from '@/components/os/AgentAvatar';

interface CollaborationWorkflowViewProps {
  soundEnabled?: boolean;
  onOpenApp?: (appId: AppId, directive?: string) => void;
}

type FilterIntent = 'all' | 'delegate_subtask' | 'share_information' | 'status_update' | 'orchestrator_mediation';

export const CollaborationWorkflowView: React.FC<CollaborationWorkflowViewProps> = ({
  soundEnabled,
  onOpenApp,
}) => {
  const [collabState, setCollabState] = useState(() => CollaborationStore.getState());
  const [activeSubTab, setActiveSubTab] = useState<'dialogue' | 'subtasks' | 'mediations' | 'artifacts'>('dialogue');
  const [intentFilter, setIntentFilter] = useState<FilterIntent>('all');
  const [customDirectiveInput, setCustomDirectiveInput] = useState('');
  const [isLaunchingMission, setIsLaunchingMission] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('memory-tier');
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Manual subtask delegation dialog state
  const [isDelegateModalOpen, setIsDelegateModalOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('');
  const [newSubtaskAssigner, setNewSubtaskAssigner] = useState<AgentRole>('coo');
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState<AgentRole>('pm');
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<'normal' | 'high' | 'critical'>('high');

  useEffect(() => {
    const unsub = CollaborationStore.subscribe(() => {
      setCollabState({ ...CollaborationStore.getState() });
    });

    const handleCollabEvent = () => {
      setCollabState({ ...CollaborationStore.getState() });
    };

    window.addEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    return () => {
      unsub();
      window.removeEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    };
  }, []);

  const handleRunFull = () => {
    if (soundEnabled) playOSSound('execute');
    CollaborationStore.runFullSimulation(1400);
  };

  const handleStepForward = () => {
    if (soundEnabled) playOSSound('click');
    CollaborationStore.stepForward();
  };

  const handleCompleteInstantly = () => {
    if (soundEnabled) playOSSound('notification');
    CollaborationStore.completeInstantly();
  };

  const handleReset = () => {
    if (soundEnabled) playOSSound('click');
    CollaborationStore.reset();
  };

  const handleSelectPreset = (presetId: string) => {
    if (soundEnabled) playOSSound('click');
    setSelectedPresetId(presetId);
    CollaborationStore.loadPreset(presetId);
  };

  const handleLaunchCustomMission = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const directive = customDirectiveInput.trim();
    if (!directive || isLaunchingMission) return;

    if (soundEnabled) playOSSound('execute');
    setIsLaunchingMission(true);

    try {
      await CollaborationStore.initiateCustomMission(directive);
      setCustomDirectiveInput('');
      dispatchOSNotification({
        title: 'Mission Deconstructed',
        message: `Sophia Vance coordinated 4 AI employees for: "${directive.slice(0, 42)}..."`,
        type: 'agent',
        agent: 'Sophia Vance (COO)',
      });
      // Start simulation
      CollaborationStore.runFullSimulation(1400);
    } catch (err) {
      console.error('Mission launch failed:', err);
    } finally {
      setIsLaunchingMission(false);
    }
  };

  const handleCreateSubTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    if (soundEnabled) playOSSound('notification');
    CollaborationStore.delegateSubTask({
      title: newSubtaskTitle.trim(),
      description: newSubtaskDesc.trim() || newSubtaskTitle.trim(),
      assignedBy: newSubtaskAssigner,
      assignedTo: newSubtaskAssignee,
      priority: newSubtaskPriority,
      status: 'pending',
      deliverableExpected: 'Executive Memorandum & Action Plan',
      orchestratorNote: 'Directly delegated by Founder via Inter-Agent Bus.',
    });

    setIsDelegateModalOpen(false);
    setNewSubtaskTitle('');
    setNewSubtaskDesc('');

    dispatchOSNotification({
      title: 'Sub-Task Injected',
      message: `Assigned to ${agentAvatars[newSubtaskAssignee]?.name || newSubtaskAssignee} with ${newSubtaskPriority} priority.`,
      type: 'agent',
      agent: 'Sophia Vance (COO)',
    });
  };

  const handleSpeakText = (id: string, text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speakingMsgId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(id);
    window.speechSynthesis.speak(utterance);
  };

  const currentStep = collabState.steps[collabState.currentStepIndex] || collabState.steps[0];

  const agentAvatars: Record<
    string,
    { name: string; role: string; color: string; border: string; bg: string; ring: string }
  > = {
    pm: {
      name: 'Maya Lin',
      role: 'Principal Product Manager',
      color: 'text-rose-400',
      border: 'border-rose-500/30',
      bg: 'bg-rose-500/10',
      ring: 'ring-rose-500',
    },
    researcher: {
      name: 'Dr. Aris Thorne',
      role: 'Lead AI Researcher',
      color: 'text-amber-400',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      ring: 'ring-amber-500',
    },
    finance: {
      name: 'Julian Cruz',
      role: 'Chief Financial Analyst',
      color: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      ring: 'ring-emerald-500',
    },
    coo: {
      name: 'Sophia Vance',
      role: 'Chief Operating Officer & Orchestrator',
      color: 'text-purple-400',
      border: 'border-purple-500/30',
      bg: 'bg-purple-500/10',
      ring: 'ring-purple-500',
    },
  };

  // Filter dialogues based on selected intent
  const displayedSteps = collabState.steps.slice(0, collabState.currentStepIndex + 1).filter((step) => {
    if (intentFilter === 'all') return true;
    return step.dialogue.intent === intentFilter;
  });

  const totalSubtasks = collabState.delegatedTasks?.length || 0;
  const completedSubtasks = collabState.delegatedTasks?.filter((t) => t.status === 'completed').length || 0;
  const totalMediations = collabState.mediations?.length || 0;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. HERO / PROTOCOL MISSION CONTROL */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-5 bg-gradient-to-r from-[#170e28] via-[#0f111a] to-[#0c1626]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                AI Employee Communication Mesh v2.5
              </span>
              <span
                className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  collabState.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : collabState.status === 'running'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-300 border border-white/10'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    collabState.status === 'completed'
                      ? 'bg-emerald-400'
                      : collabState.status === 'running'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-slate-400'
                  }`}
                />
                {collabState.status === 'completed'
                  ? `All ${collabState.steps.length} Steps Ratified & Synced`
                  : collabState.status === 'running'
                  ? `Active Step ${collabState.currentStepIndex + 1} of ${collabState.steps.length} Executing`
                  : 'Mesh Standing By'}
              </span>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight">{collabState.title}</h2>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">{collabState.directive}</p>
          </div>

          {/* Controls Toolbar */}
          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-2">
            {collabState.status === 'idle' && (
              <>
                <button
                  onClick={handleRunFull}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Mesh Simulation</span>
                </button>
                <button
                  onClick={handleStepForward}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-all"
                  title="Execute next communication step manually"
                >
                  <span>Step 1</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </>
            )}

            {collabState.status === 'running' && (
              <>
                <button
                  onClick={handleStepForward}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg transition-all"
                >
                  <span>
                    Step {collabState.currentStepIndex + 1} ➔{' '}
                    {Math.min(collabState.steps.length, collabState.currentStepIndex + 2)}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCompleteInstantly}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold flex items-center space-x-1 transition-all"
                  title="Fast forward all steps"
                >
                  <FastForward className="w-3 h-3" />
                  <span>Fast-Forward</span>
                </button>
              </>
            )}

            {collabState.status === 'completed' && (
              <button
                onClick={handleReset}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Simulation</span>
              </button>
            )}

            <button
              onClick={() => setIsDelegateModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Inject Sub-Task</span>
            </button>
          </div>
        </div>

        {/* Strategic Preset Switcher */}
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Strategic Mission Presets
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Cross-functional multi-agent templates</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {COLLABORATION_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/40 shadow-sm'
                      : 'border-white/5 bg-black/30 hover:border-white/15 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 uppercase text-slate-400">
                        {preset.category}
                      </span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                    </div>
                    <div className="text-xs font-bold text-white line-clamp-1">{preset.title}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 line-clamp-1 mt-1">{preset.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Mission Formulator */}
        <form onSubmit={handleLaunchCustomMission} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customDirectiveInput}
              onChange={(e) => setCustomDirectiveInput(e.target.value)}
              placeholder="Formulate any custom directive for the 4 AI employees to collaborate on (e.g. Evaluate sub-100ms vector memory within $15k compute cap)..."
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
            />
            {customDirectiveInput && (
              <button
                type="button"
                onClick={() => setCustomDirectiveInput('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!customDirectiveInput.trim() || isLaunchingMission}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center space-x-1.5 shrink-0 transition-all"
          >
            {isLaunchingMission ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Launch Directive</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 2. DYNAMIC AI EMPLOYEE MESH TOPOLOGY VISUALIZER */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-4 bg-gradient-to-b from-[#10121d] to-[#0c0d14]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Network className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Autonomous Inter-Agent Communication Mesh
            </h3>
          </div>
          <div className="flex items-center space-x-4 text-[11px] font-mono">
            <span className="text-slate-400">
              Sub-Tasks:{' '}
              <strong className="text-white">
                {completedSubtasks}/{totalSubtasks}
              </strong>
            </span>
            <span className="text-slate-400">
              Mediations: <strong className="text-amber-400">{totalMediations}</strong>
            </span>
            <span className="text-slate-400">
              Margin Guardrail: <strong className="text-emerald-400">84.2%</strong>
            </span>
          </div>
        </div>

        {/* 4 Agent Mesh Nodes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(agentAvatars).map(([agentId, meta]) => {
            const isSpeaker = currentStep?.initiatingAgent === agentId;
            const isTarget = currentStep?.targetAgent === agentId;
            const isMediator = currentStep?.initiatingAgent === 'coo' && agentId === 'coo';

            return (
              <div
                key={agentId}
                className={`p-3.5 rounded-2xl border transition-all relative overflow-hidden ${
                  isSpeaker
                    ? 'border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500/40 shadow-lg scale-[1.01]'
                    : isTarget
                    ? 'border-amber-500/60 bg-amber-950/30 ring-1 ring-amber-500/30'
                    : 'border-white/5 bg-black/40'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2.5">
                    <AgentAvatar roleOrId={agentId} size="sm" showStatus status="active" />
                    <div>
                      <div className={`text-xs font-bold ${meta.color}`}>{meta.name}</div>
                      <div className="text-[10px] text-slate-400">{meta.role}</div>
                    </div>
                  </div>

                  {isSpeaker && (
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 font-bold animate-pulse border border-indigo-500/40">
                      Speaking
                    </span>
                  )}
                  {isTarget && !isSpeaker && (
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      Receiving
                    </span>
                  )}
                </div>

                {/* Subtask count for this agent */}
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Assigned Work</span>
                  <span className="text-white font-semibold">
                    {collabState.delegatedTasks?.filter((t) => t.assignedTo === agentId).length || 0} sub-tasks
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. PROTOCOL PROGRESSION PIPELINE (Steps) */}
      <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Inter-Agent Protocol Sequence ({collabState.steps.length} Steps)
          </span>
          <span className="font-mono text-slate-400 text-[11px]">
            {Math.min(collabState.currentStepIndex + 1, collabState.steps.length)} of {collabState.steps.length}{' '}
            Milestones Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {collabState.steps.map((step, idx) => {
            const isDone = idx < collabState.currentStepIndex || collabState.status === 'completed';
            const isCurrent = idx === collabState.currentStepIndex && collabState.status !== 'completed';

            return (
              <div
                key={step.id}
                className={`p-2.5 rounded-xl border text-[11px] transition-all flex flex-col justify-between ${
                  isDone
                    ? 'border-emerald-500/40 bg-emerald-950/20 text-slate-300'
                    : isCurrent
                    ? 'border-amber-500 bg-amber-950/30 text-white ring-1 ring-amber-500/40'
                    : 'border-white/5 bg-black/30 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] font-bold">0{idx + 1}</span>
                  {isDone ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : isCurrent ? (
                    <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-white/10" />
                  )}
                </div>
                <div className="font-semibold text-[10px] leading-tight line-clamp-2">{step.title}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. MULTI-VIEW SUB-TABS (Dialogue / Sub-Tasks / Mediations / Artifacts) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-2">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setActiveSubTab('dialogue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'dialogue'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Inter-Agent Dialogue ({collabState.steps.slice(0, collabState.currentStepIndex + 1).length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('subtasks')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'subtasks'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Delegated Sub-Tasks ({totalSubtasks})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('mediations')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'mediations'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Orchestrator Mediations ({totalMediations})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('artifacts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'artifacts'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Cross-App Artifacts</span>
            </button>
          </div>

          {/* Intent Filter when on Dialogue Tab */}
          {activeSubTab === 'dialogue' && (
            <div className="flex items-center space-x-1 text-[11px]">
              <Filter className="w-3 h-3 text-slate-500" />
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'delegate_subtask', label: 'Delegations' },
                  { id: 'share_information', label: 'Info Shared' },
                  { id: 'status_update', label: 'Status' },
                  { id: 'orchestrator_mediation', label: 'Mediations' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setIntentFilter(f.id)}
                  className={`px-2 py-0.5 rounded-lg font-mono transition-colors ${
                    intentFilter === f.id
                      ? 'bg-indigo-500/30 text-indigo-300 font-bold border border-indigo-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: DIALOGUE STREAM */}
        {activeSubTab === 'dialogue' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Live Inter-Agent Messages */}
            <div className="lg:col-span-2 space-y-3">
              {displayedSteps.length === 0 ? (
                <div className="p-8 text-center text-slate-500 os-glass-card rounded-2xl border border-white/5">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No dialogues match this filter.</p>
                </div>
              ) : (
                displayedSteps.map((stepItem, i) => {
                  const msg = stepItem.dialogue;
                  const senderKey = msg.from;
                  const targetKey = msg.to;
                  const meta = agentAvatars[senderKey] || {
                    name: msg.fromName,
                    role: 'AI Executive',
                    color: 'text-indigo-400',
                  };
                  const targetMeta = agentAvatars[targetKey] || {
                    name: msg.toName,
                    role: 'AI Executive',
                  };
                  const isSpeaking = speakingMsgId === msg.id;

                  return (
                    <motion.div
                      key={msg.id || `step-diag-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3 hover:border-white/20 transition-all shadow-md"
                    >
                      {/* Message Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <AgentAvatar roleOrId={senderKey} name={meta.name} size="xs" />
                          <div className="flex items-center space-x-1.5 text-xs">
                            <span className={`font-bold ${meta.color}`}>{meta.name}</span>
                            <span className="text-slate-500">➔</span>
                            <span className="text-slate-300 font-semibold">{targetMeta.name}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {/* Intent Badge */}
                          {msg.intent === 'delegate_subtask' && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[9px] font-mono border border-purple-500/30">
                              Delegate Sub-Task
                            </span>
                          )}
                          {msg.intent === 'share_information' && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-mono border border-cyan-500/30">
                              Share Info
                            </span>
                          )}
                          {msg.intent === 'status_update' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-mono border border-amber-500/30">
                              Status Update
                            </span>
                          )}
                          {msg.intent === 'orchestrator_mediation' && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[9px] font-mono border border-rose-500/30">
                              Orchestrator Mediation
                            </span>
                          )}
                          {msg.intent === 'ratify' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-mono border border-emerald-500/30">
                              Executive Ratification
                            </span>
                          )}

                          {/* TTS Audio Button */}
                          <button
                            onClick={() => handleSpeakText(msg.id, msg.message)}
                            className={`p-1 rounded-lg transition-colors ${
                              isSpeaking
                                ? 'text-indigo-400 bg-indigo-500/20 animate-pulse'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                            title={isSpeaking ? 'Stop speaking' : 'Read aloud with AI voice'}
                          >
                            {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>

                          <span className="text-[10px] font-mono text-slate-500">{msg.timestamp}</span>
                        </div>
                      </div>

                      {/* Body Text */}
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap pl-7 font-sans">
                        {msg.message}
                      </p>

                      {/* Sub-Task Embed Card if present */}
                      {msg.subtask && (
                        <div className="ml-7 p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="font-bold text-purple-300 flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              Sub-Task: {msg.subtask.title}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-200 text-[9px] uppercase font-bold">
                              Priority: {msg.subtask.priority}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300">
                            Deliverable: {msg.subtask.deliverableExpected}
                          </div>
                        </div>
                      )}

                      {/* Mediation Embed Card if present */}
                      {msg.mediation && (
                        <div className="ml-7 p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="font-bold text-rose-300 flex items-center gap-1">
                              <Scale className="w-3 h-3" />
                              Orchestrator Binding Ruling
                            </span>
                            <span className="text-emerald-400 font-bold">{msg.mediation.slaImpact}</span>
                          </div>
                          <div className="text-[11px] text-slate-200 font-medium">
                            {msg.mediation.orchestratorRuling}
                          </div>
                          <div className="text-[10px] text-slate-400 italic">
                            Trade-off: {msg.mediation.compromiseStrategy}
                          </div>
                        </div>
                      )}

                      {/* Attachment / Evidence */}
                      {msg.attachment && (
                        <div className="ml-7 p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span className="font-semibold text-slate-300">{msg.attachment.title}</span>
                            <span className="px-1.5 py-0.2 rounded bg-white/5 text-[9px] uppercase">
                              {msg.attachment.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300">{msg.attachment.snippet}</div>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Right Col: Cross-App Linkage Callouts */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                Cross-App Real-Time Synchronizations
              </h3>

              {/* Products App */}
              <div className="os-glass-card rounded-2xl p-4 border border-rose-500/30 space-y-2.5 bg-gradient-to-br from-rose-950/20 to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-rose-400" />
                    Products App
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                    Roadmap & PRD
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Maya Lin published feature spec <strong>#feat-collab-mem-1</strong> with vetted acceptance criteria.
                </p>
                {onOpenApp && (
                  <button
                    onClick={() => onOpenApp('products')}
                    className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <span>Inspect in Products App</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Research App */}
              <div className="os-glass-card rounded-2xl p-4 border border-amber-500/30 space-y-2.5 bg-gradient-to-br from-amber-950/20 to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-amber-400" />
                    Research App
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                    Market Recon
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Dr. Aris Thorne archived <strong>Market Brief #res-collab-mem-1</strong> validating sub-120ms recall.
                </p>
                {onOpenApp && (
                  <button
                    onClick={() => onOpenApp('research')}
                    className="w-full py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <span>Inspect in Research App</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Finance App */}
              <div className="os-glass-card rounded-2xl p-4 border border-emerald-500/30 space-y-2.5 bg-gradient-to-br from-emerald-950/20 to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Finance App
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    Margin Guardrail
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Julian Cruz locked compute unit economics at <strong>$0.038 / 1k queries cap</strong> and{' '}
                  <strong>84.2% margin floor</strong>.
                </p>
                {onOpenApp && (
                  <button
                    onClick={() => onOpenApp('finance')}
                    className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <span>Inspect in Finance App</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Messages App */}
              <div className="os-glass-card rounded-2xl p-4 border border-indigo-500/30 space-y-2.5 bg-gradient-to-br from-indigo-950/20 to-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                    Executive Council Thread
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                    Live Channel
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Direct cross-agent channel <strong>#council</strong> mirrors live messages with full cryptographic audit.
                </p>
                {onOpenApp && (
                  <button
                    onClick={() => onOpenApp('messages')}
                    className="w-full py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <span>Open in Messages App</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DELEGATED SUB-TASKS BOARD */}
        {activeSubTab === 'subtasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-300">
                AI employees autonomously decompose high-level directives into structured sub-tasks with clear assigners,
                assignees, and expected deliverables.
              </p>
              <button
                onClick={() => setIsDelegateModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign New Sub-Task</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collabState.delegatedTasks?.map((task) => {
                const assigner = agentAvatars[task.assignedBy];
                const assignee = agentAvatars[task.assignedTo];

                return (
                  <div
                    key={task.id}
                    className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3 hover:border-white/20 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-500">{task.id}</span>
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                              task.priority === 'critical'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : task.priority === 'high'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {task.priority}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                              task.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                      </div>

                      <h4 className="text-xs font-bold text-white leading-snug">{task.title}</h4>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{task.description}</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Delegation:</span>
                        <div className="flex items-center space-x-1 font-semibold">
                          <span className={assigner?.color || 'text-white'}>{assigner?.name || task.assignedBy}</span>
                          <span className="text-slate-500">➔</span>
                          <span className={assignee?.color || 'text-white'}>{assignee?.name || task.assignedTo}</span>
                        </div>
                      </div>

                      {task.deliverableExpected && (
                        <div className="p-2 rounded-lg bg-black/40 text-[10px] text-slate-300 space-y-0.5">
                          <div className="text-slate-400 font-mono">Deliverable:</div>
                          <div className="font-medium text-slate-200">{task.deliverableExpected}</div>
                        </div>
                      )}

                      {task.orchestratorNote && (
                        <div className="text-[10px] text-purple-300 font-mono flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-purple-400" />
                          <span>{task.orchestratorNote}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ORCHESTRATOR MEDIATIONS */}
        {activeSubTab === 'mediations' && (
          <div className="space-y-4">
            <div className="os-glass-card rounded-2xl p-4 border border-purple-500/20 bg-gradient-to-r from-purple-950/20 to-slate-900 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white">Sophia Vance (COO) - Executive Arbitration Record</h4>
                <p className="text-[11px] text-slate-300">
                  When AI employees face conflicting optimization metrics (e.g. speed vs. unit margin), the
                  Orchestrator arbitrates binding compromises.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                100% Conflict Resolution SLA
              </span>
            </div>

            <div className="space-y-3">
              {collabState.mediations?.map((med) => (
                <div key={med.id} className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-rose-400 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-rose-400" />
                      Friction Point & Dispute
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      SLA: {med.slaImpact}
                    </span>
                  </div>

                  <p className="text-xs text-white font-medium pl-6 leading-relaxed font-sans">
                    {med.disputeOrFriction}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 pl-6">
                    <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                        Compromise Strategy
                      </span>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{med.compromiseStrategy}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 space-y-1">
                      <span className="text-[10px] font-mono text-purple-300 uppercase tracking-wider font-bold">
                        Binding Ruling
                      </span>
                      <p className="text-[11px] text-purple-200 leading-relaxed font-sans">
                        {med.orchestratorRuling}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: CROSS-APP ARTIFACTS */}
        {activeSubTab === 'artifacts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="os-glass-card rounded-2xl p-5 border border-rose-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-rose-400" />
                  Product Requirement Document (PRD)
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                  Sprint 15 Ready
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Full PRD drafted by Maya Lin incorporating latency benchmarks and compute guardrails ratified by the
                executive council.
              </p>
              {onOpenApp && (
                <button
                  onClick={() => onOpenApp('products')}
                  className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <span>Open in Products App</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="os-glass-card rounded-2xl p-5 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-amber-400" />
                  Market Intelligence & Competitive Recon Dossier
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  98/100 Moat Score
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Technical feasibility memo generated by Dr. Aris Thorne with architectural benchmarks across frontier LLM
                frameworks.
              </p>
              {onOpenApp && (
                <button
                  onClick={() => onOpenApp('research')}
                  className="w-full py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <span>Open in Research App</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="os-glass-card rounded-2xl p-5 border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Unit Economics & Margin Model
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  84.2% Margin Floor
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Julian Cruz stress-tested financial model with strict cost ceilings: $0.038 per 1k operations with zero
                unbounded GPU burn.
              </p>
              {onOpenApp && (
                <button
                  onClick={() => onOpenApp('finance')}
                  className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <span>Open in Finance App</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="os-glass-card rounded-2xl p-5 border border-indigo-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  Messages App Inter-Agent Bus
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  Cryptographic Log
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Full inter-agent dialogue transcript stored in real-time in the executive council channel with
                interactive voice playback.
              </p>
              {onOpenApp && (
                <button
                  onClick={() => onOpenApp('messages')}
                  className="w-full py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <span>Open in Messages App</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. INJECT SUB-TASK MODAL */}
      <AnimatePresence>
        {isDelegateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#141522] border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4 text-white"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Briefcase className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold">Inject Sub-Task into AI Mesh</h3>
                </div>
                <button
                  onClick={() => setIsDelegateModalOpen(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Assign a specific cross-functional task directly from one AI employee to another. The orchestrator will
                monitor delivery SLA.
              </p>

              <form onSubmit={handleCreateSubTask} className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Sub-Task Title</label>
                  <input
                    type="text"
                    required
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="e.g. Audit vector quantization memory footprint..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Description & Deliverable Expectation
                  </label>
                  <textarea
                    rows={2}
                    value={newSubtaskDesc}
                    onChange={(e) => setNewSubtaskDesc(e.target.value)}
                    placeholder="Specify constraints, required latency thresholds, or data schema..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Assigning Agent</label>
                    <select
                      value={newSubtaskAssigner}
                      onChange={(e) => setNewSubtaskAssigner(e.target.value as AgentRole)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="coo">Sophia Vance (COO)</option>
                      <option value="pm">Maya Lin (PM)</option>
                      <option value="researcher">Dr. Aris Thorne (Research)</option>
                      <option value="finance">Julian Cruz (Finance)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Assignee Agent</label>
                    <select
                      value={newSubtaskAssignee}
                      onChange={(e) => setNewSubtaskAssignee(e.target.value as AgentRole)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="pm">Maya Lin (PM)</option>
                      <option value="researcher">Dr. Aris Thorne (Research)</option>
                      <option value="finance">Julian Cruz (Finance)</option>
                      <option value="coo">Sophia Vance (COO)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['normal', 'high', 'critical'] as const).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setNewSubtaskPriority(p)}
                        className={`py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold border transition-colors ${
                          newSubtaskPriority === p
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                            : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsDelegateModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-lg transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Delegate into Mesh</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
