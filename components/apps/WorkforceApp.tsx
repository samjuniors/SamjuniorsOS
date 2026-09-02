'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AIAgent,
  AgentWorkProtocolStep,
  ExecutionDeliverable,
  ExecutionMessage,
  ExecutionPlanItem,
  OrchestrationRun,
} from '@/types/os';
import {
  INITIAL_AGENTS,
  INITIAL_ORCHESTRATION,
  AGENT_WORK_PROTOCOL,
} from '@/lib/os-data';
import {
  Bot,
  Sparkles,
  Send,
  Play,
  CheckCircle2,
  Clock,
  MessageSquare,
  FileText,
  Activity,
  Layers,
  Zap,
  Shield,
  Copy,
  Check,
  ChevronRight,
  ArrowRight,
  Sliders,
  Terminal,
  AlertCircle,
  Lock,
  ListTodo,
  History,
  Target,
  FileCode2,
  Workflow,
  Search,
  PieChart,
  Cpu,
} from 'lucide-react';
import { playOSSound } from '../os/IconHelper';

interface WorkforceAppProps {
  soundEnabled: boolean;
  initialDirective?: string;
  onClearInitialDirective?: () => void;
}

export const WorkforceApp: React.FC<WorkforceAppProps> = ({
  soundEnabled,
  initialDirective,
  onClearInitialDirective,
}) => {
  const [activeTab, setActiveTab] = useState<'orchestrator' | 'agents' | 'protocol' | 'deliverables'>('orchestrator');
  const [directiveInput, setDirectiveInput] = useState(initialDirective || '');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRun, setCurrentRun] = useState<OrchestrationRun>(INITIAL_ORCHESTRATION);
  const [agents, setAgents] = useState<AIAgent[]>(INITIAL_AGENTS);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('coo');
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const [statusFilter, setStatusFilter] = useState<'all' | 'processing' | 'standby' | 'idle' | 'active'>('all');
  const [agentDetailTab, setAgentDetailTab] = useState<'overview' | 'tasks' | 'history' | 'permissions' | 'chat'>('overview');
  const [selectedProtocolStep, setSelectedProtocolStep] = useState<AgentWorkProtocolStep>('understand');
  const [agentChatInput, setAgentChatInput] = useState('');
  const [agentChatHistory, setAgentChatHistory] = useState<Array<{ sender: 'user' | 'agent'; text: string; time: string }>>([
    {
      sender: 'agent',
      text: `Greetings Founder. I'm Sophia Vance, Chief Operating Officer & Lead Orchestrator. I coordinate Dr. Thorne (Research), Maya Lin (PM), and Julian Cruz (Finance) according to the 9-Step Agent Work Protocol. How may I direct the council today?`,
      time: 'Just now',
    },
  ]);
  const [copiedDeliverable, setCopiedDeliverable] = useState<string | null>(null);
  const [selectedDeliverableIndex, setSelectedDeliverableIndex] = useState(0);

  // Helper to compute visual status info (dots, colors, labels)
  const getAgentStatusInfo = useCallback(
    (agent: AIAgent) => {
      if (isExecuting) {
        const activeStage = currentRun.plan.find((p) => p.status === 'in_progress');
        const isCurrentAgentWorking =
          activeStage?.agentId === agent.id ||
          (agent.id === 'coo' && currentRun.currentProtocolStep === 'understand');

        if (isCurrentAgentWorking) {
          return {
            state: 'processing' as const,
            label: 'PROCESSING',
            dotColor: 'bg-emerald-400',
            pingClass: 'animate-ping bg-emerald-400 opacity-75',
            badgeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
            ringColor: 'ring-emerald-400/50',
            isPulsing: true,
            description: 'Actively processing current protocol stage',
          };
        }

        return {
          state: 'standby' as const,
          label: 'STANDBY',
          dotColor: 'bg-sky-400',
          pingClass: '',
          badgeBg: 'bg-sky-950/70 border-sky-500/40 text-sky-300',
          ringColor: 'ring-sky-400/40',
          isPulsing: false,
          description: 'Standing by on neural bus for pipeline delegation',
        };
      }

      const s = agent.status.toLowerCase();
      if (s === 'processing' || s === 'executing') {
        return {
          state: 'processing' as const,
          label: 'PROCESSING',
          dotColor: 'bg-emerald-400',
          pingClass: 'animate-ping bg-emerald-400 opacity-75',
          badgeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
          ringColor: 'ring-emerald-400/50',
          isPulsing: true,
          description: 'Actively executing autonomous tasks',
        };
      }
      if (s === 'active' || s === 'reporting') {
        return {
          state: 'active' as const,
          label: 'ACTIVE',
          dotColor: 'bg-emerald-400',
          pingClass: '',
          badgeBg: 'bg-emerald-950/70 border-emerald-500/30 text-emerald-300',
          ringColor: 'ring-emerald-400/30',
          isPulsing: false,
          description: 'Online and ready to accept directives',
        };
      }
      if (s === 'standby' || s === 'analyzing' || s === 'researching' || s === 'planning' || s === 'testing' || s === 'verifying' || s === 'reviewing' || s === 'understanding') {
        return {
          state: 'standby' as const,
          label: s === 'standby' ? 'STANDBY' : s.toUpperCase(),
          dotColor: 'bg-sky-400',
          pingClass: '',
          badgeBg: 'bg-sky-950/70 border-sky-500/30 text-sky-300',
          ringColor: 'ring-sky-400/30',
          isPulsing: false,
          description: 'Listening on neural bus for pipeline handoff',
        };
      }

      return {
        state: 'idle' as const,
        label: 'IDLE',
        dotColor: 'bg-slate-400',
        pingClass: '',
        badgeBg: 'bg-slate-900/80 border-slate-700 text-slate-300',
        ringColor: 'ring-slate-500/30',
        isPulsing: false,
        description: 'Idle and awaiting founder directives',
      };
    },
    [isExecuting, currentRun]
  );

  const handleUpdateAgentStatus = (agentId: string, newStatus: AIAgent['status']) => {
    if (soundEnabled) playOSSound('click');
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, status: newStatus } : a))
    );
  };

  const presetDirectives = [
    'Evaluate launching a self-serve tier for enterprise AI agents with unit economics & operational roadmap',
    'Audit Q4 API compute burn and recommend prompt compression & semantic caching optimizations',
    'Draft PRD & competitive moat analysis for zero-latency multi-agent neural bus',
    'Model pricing strategy for 250 enterprise autonomous agent seats with 85%+ gross margin',
  ];

  const handleExecute = useCallback(
    async (overrideDirective?: string) => {
      const textToRun = overrideDirective || directiveInput;
      if (!textToRun.trim() || isExecuting) return;

      if (soundEnabled) playOSSound('execute');
      setIsExecuting(true);
      setActiveTab('orchestrator');

      // Optimistic 9-step plan run
      const optimisticRun: OrchestrationRun = {
        id: `run-${Date.now()}`,
        directive: textToRun,
        timestamp: 'Just now',
        status: 'running',
        currentProtocolStep: 'understand',
        protocolProgress: {
          understand: 'active',
          research: 'pending',
          analyze: 'pending',
          plan: 'pending',
          build_execute: 'pending',
          test: 'pending',
          verify: 'pending',
          review: 'pending',
          report: 'pending',
        },
        title: `Autonomous Directive: ${textToRun.slice(0, 42)}...`,
        summary: 'COO Sophia Vance is deconstructing directive and activating the 9-Step Agent Work Protocol...',
        plan: [
          { stage: 1, title: 'Directive Ingestion & Scope Boundary', agentId: 'coo', protocolStep: 'understand', status: 'in_progress' },
          { stage: 2, title: 'Market & Competitive Reconnaissance', agentId: 'researcher', protocolStep: 'research', status: 'pending' },
          { stage: 3, title: 'Technical Feasibility & Risk Modeling', agentId: 'researcher', protocolStep: 'analyze', status: 'pending' },
          { stage: 4, title: 'Inter-Agent Delegation Matrix', agentId: 'coo', protocolStep: 'plan', status: 'pending' },
          { stage: 5, title: 'Product Architecture & PRD Generation', agentId: 'pm', protocolStep: 'build_execute', status: 'pending' },
          { stage: 6, title: 'Unit Economics Simulation & Stress-Test', agentId: 'finance', protocolStep: 'test', status: 'pending' },
          { stage: 7, title: 'Constitutional Compliance Verification', agentId: 'coo', protocolStep: 'verify', status: 'pending' },
          { stage: 8, title: 'Executive Council Review & Consensus', agentId: 'coo', protocolStep: 'review', status: 'pending' },
          { stage: 9, title: 'Final Executive Report Synthesis', agentId: 'coo', protocolStep: 'report', status: 'pending' },
        ],
        messages: [
          {
            id: `m-${Date.now()}-1`,
            sender: 'coo',
            protocolStep: 'understand',
            text: `[Sophia Vance - COO] Directive received: "${textToRun}". Decomposing into 9-step protocol across Research, Product, and Finance.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: 'status',
          },
        ],
        deliverables: [],
      };
      setCurrentRun(optimisticRun);

      try {
        const res = await fetch('/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directive: textToRun,
            agents: ['coo', 'researcher', 'pm', 'finance'],
          }),
        });

        const data = await res.json();
        if (data.success && data.data) {
          const payload = data.data;
          const finalizedRun: OrchestrationRun = {
            id: `run-${Date.now()}`,
            directive: textToRun,
            timestamp: 'Just now',
            status: 'completed',
            liveAi: data.liveAi,
            currentProtocolStep: payload.currentProtocolStep || 'report',
            protocolProgress: payload.protocolProgress || {
              understand: 'completed',
              research: 'completed',
              analyze: 'completed',
              plan: 'completed',
              build_execute: 'completed',
              test: 'completed',
              verify: 'completed',
              review: 'completed',
              report: 'completed',
            },
            title: payload.title || `Orchestrated: ${textToRun.slice(0, 40)}`,
            summary: payload.summary || 'Executive AI Council completed the 9-Step Agent Work Protocol.',
            plan: payload.plan || optimisticRun.plan.map((p) => ({ ...p, status: 'done' })),
            messages: payload.messages || optimisticRun.messages,
            deliverables: payload.deliverables || [],
          };
          setCurrentRun(finalizedRun);
          if (soundEnabled) playOSSound('notification');
        }
      } catch (err) {
        console.error('Orchestration error:', err);
      } finally {
        setIsExecuting(false);
      }
    },
    [directiveInput, isExecuting, soundEnabled]
  );

  // If passed an initial directive from desktop, auto-run or populate
  const initialHandledRef = useRef(false);
  useEffect(() => {
    if (initialDirective && initialDirective.trim() && !initialHandledRef.current) {
      initialHandledRef.current = true;
      const text = initialDirective.trim();
      const timer = setTimeout(() => {
        setDirectiveInput(text);
        handleExecute(text);
        if (onClearInitialDirective) onClearInitialDirective();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialDirective, handleExecute, onClearInitialDirective]);

  const handleAgentChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentChatInput.trim()) return;

    const userMsg = agentChatInput.trim();
    setAgentChatInput('');
    setAgentChatHistory((prev) => [
      ...prev,
      { sender: 'user', text: userMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ]);

    if (soundEnabled) playOSSound('click');

    try {
      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message: userMsg,
        }),
      });
      const data = await res.json();
      if (data.success && data.reply) {
        setAgentChatHistory((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: data.reply,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        if (soundEnabled) playOSSound('notification');
      }
    } catch (err) {
      setAgentChatHistory((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: `[${selectedAgent.name}] Operating strictly under safe mock bounds. Telemetry nominal; all sub-tasks progressing according to the Agent Work Protocol.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  const handleCopyDeliverable = (content: string, name: string) => {
    navigator.clipboard.writeText(content);
    setCopiedDeliverable(name);
    setTimeout(() => setCopiedDeliverable(null), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 select-none">
      {/* Top Protocol & Safe-Mode Global Banner */}
      <div className="px-4 py-2 bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[11px]">
            <Shield className="w-3 h-3" />
            <span>Safe Mock Execution: Active</span>
          </div>
          <span className="hidden md:inline text-slate-400 text-[11px]">
            No live financial transactions • Sandboxed simulations enabled
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-300">
          <span className="text-slate-400">Protocol:</span>
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            9-Step Agent Work Protocol
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 4 Executive Agents Active
          </span>
        </div>
      </div>

      {/* Sub-Header Navigation Tabs */}
      <div className="h-11 px-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <button
            id="tab-workforce-orchestrator"
            onClick={() => setActiveTab('orchestrator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'orchestrator'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
            <span>COO Orchestrator</span>
            {isExecuting && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          <button
            id="tab-workforce-agents"
            onClick={() => setActiveTab('agents')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'agents'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-purple-300" />
            <span>Executive Council (4 Agents)</span>
          </button>

          <button
            id="tab-workforce-protocol"
            onClick={() => setActiveTab('protocol')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'protocol'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Workflow className="w-3.5 h-3.5 text-amber-300" />
            <span>9-Step Work Protocol</span>
          </button>

          <button
            id="tab-workforce-deliverables"
            onClick={() => setActiveTab('deliverables')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'deliverables'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-rose-300" />
            <span>Executive Reports & Vault</span>
            {currentRun.deliverables.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                {currentRun.deliverables.length}
              </span>
            )}
          </button>
        </div>

        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400">
          <span className="font-mono text-[11px] text-slate-300">
            COO: <span className="text-indigo-400 font-semibold">Sophia Vance</span>
          </span>
        </div>
      </div>

      {/* Tab 1: Master COO Orchestrator */}
      {activeTab === 'orchestrator' && (
        <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Executive Directive Dispatcher Card */}
          <div className="os-glass-card rounded-2xl p-4 md:p-5 border border-white/10 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Founder Directive Dispatcher (Central COO Orchestration)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sophia Vance receives the Founder command, breaks it into subtasks, delegates to Aris (Research), Maya (PM), and Julian (Finance), and produces the Final Executive Report.
                </p>
              </div>

              {currentRun.liveAi && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono border border-emerald-500/30 flex items-center gap-1 self-start sm:self-auto">
                  <Zap className="w-2.5 h-2.5" /> Gemini 3.7 Flash Active
                </span>
              )}
            </div>

            {/* Input form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecute();
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <div className="flex-1 relative">
                <input
                  id="workforce-directive-input"
                  type="text"
                  value={directiveInput}
                  onChange={(e) => setDirectiveInput(e.target.value)}
                  placeholder="Enter strategic directive for COO Sophia Vance and Executive Council..."
                  className="w-full px-4 py-2.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <button
                id="workforce-execute-btn"
                type="submit"
                disabled={isExecuting || !directiveInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center space-x-2 shadow-lg transition-all"
              >
                {isExecuting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Executing Protocol...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Dispatch Workforce</span>
                  </>
                )}
              </button>
            </form>

            {/* Presets Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                Preset Founder Directives:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {presetDirectives.map((preset, idx) => (
                  <button
                    key={idx}
                    id={`preset-directive-${idx}`}
                    onClick={() => {
                      setDirectiveInput(preset);
                      handleExecute(preset);
                    }}
                    disabled={isExecuting}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors text-left"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 9-Step Protocol Progress Bar */}
          <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Workflow className="w-3.5 h-3.5 text-indigo-400" />
                Active Agent Work Protocol Pipeline
              </h4>
              <span className="text-[10px] font-mono text-indigo-400">
                Current: {currentRun.currentProtocolStep ? currentRun.currentProtocolStep.toUpperCase() : 'REPORT'}
              </span>
            </div>

            {/* 9 Steps Visual Nodes */}
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-1.5">
              {AGENT_WORK_PROTOCOL.map((step) => {
                const stepKey = step.key;
                const progressVal = currentRun.protocolProgress ? (currentRun.protocolProgress as Record<string, string>)[stepKey] : undefined;
                const isStepCompleted = progressVal === 'completed';
                const isStepActive = currentRun.currentProtocolStep === stepKey && isExecuting;

                return (
                  <div
                    key={step.number}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      isStepActive
                        ? 'bg-indigo-600/30 border-indigo-400 ring-1 ring-indigo-400'
                        : isStepCompleted
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                        : 'bg-white/5 border-white/5 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px] font-mono font-bold">
                      {isStepCompleted ? (
                        <span className="text-emerald-400">✓ Step {step.number}</span>
                      ) : isStepActive ? (
                        <span className="text-indigo-400 animate-pulse">▶ Step {step.number}</span>
                      ) : (
                        `Step ${step.number}`
                      )}
                    </div>
                    <div className="text-[11px] font-semibold text-white mt-0.5 truncate">{step.name}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5 truncate uppercase font-mono">{step.leadAgent}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Execution Run Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Inter-Agent Neural Dialogue Stream */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  Inter-Agent Coordination Stream (COO Directed)
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  {currentRun.messages.length} Events Logged
                </span>
              </div>

              {/* Message Feed */}
              <div className="os-glass-card rounded-2xl p-4 border border-white/10 max-h-[420px] overflow-y-auto space-y-3">
                {currentRun.messages.map((msg) => {
                  const senderInfo =
                    msg.sender === 'coo'
                      ? { name: 'Sophia Vance (COO / Orchestrator)', color: 'text-indigo-400', bg: 'bg-indigo-950/60 border-indigo-500/30' }
                      : msg.sender === 'researcher'
                      ? { name: 'Dr. Aris Thorne (Market Research)', color: 'text-amber-400', bg: 'bg-amber-950/60 border-amber-500/30' }
                      : msg.sender === 'pm'
                      ? { name: 'Maya Lin (Product Manager)', color: 'text-rose-400', bg: 'bg-rose-950/60 border-rose-500/30' }
                      : msg.sender === 'finance'
                      ? { name: 'Julian Cruz (Finance Analyst)', color: 'text-emerald-400', bg: 'bg-emerald-950/60 border-emerald-500/30' }
                      : { name: 'Kernel Orchestrator', color: 'text-purple-400', bg: 'bg-purple-950/60 border-purple-500/30' };

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-xl border ${senderInfo.bg} text-xs space-y-1`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold ${senderInfo.color} flex items-center gap-1.5`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {senderInfo.name}
                          </span>
                          {msg.protocolStep && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300 font-mono uppercase">
                              {msg.protocolStep}
                            </span>
                          )}
                          {msg.provenance && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-mono border border-emerald-500/20">
                              Verified • {msg.provenance.evidenceBasis}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{msg.timestamp}</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-sans">{msg.text}</p>
                    </motion.div>
                  );
                })}

                {isExecuting && (
                  <div className="flex items-center space-x-2 text-xs text-indigo-400 p-2 animate-pulse font-mono bg-indigo-950/30 rounded-xl border border-indigo-500/20">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                    <span>COO Sophia Vance synchronizing council execution across 9 protocol stages...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Multi-Stage Execution Plan & Deliverables quick list */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                Council Delegation Plan
              </h4>

              <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-2.5 max-h-[420px] overflow-y-auto">
                {currentRun.plan.map((stage) => {
                  const agent = INITIAL_AGENTS.find((a) => a.id === stage.agentId);
                  return (
                    <div
                      key={stage.stage}
                      className="p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-1.5 hover:border-white/15 transition-all"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">
                          {stage.stage}. {stage.title}
                        </span>
                        {stage.status === 'done' ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-mono">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        ) : stage.status === 'in_progress' ? (
                          <span className="text-amber-400 flex items-center gap-1 text-[10px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" /> Active
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px] font-mono">Queued</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Assigned: {agent?.name || stage.agentId}</span>
                        {stage.protocolStep && (
                          <span className="font-mono text-indigo-300 uppercase text-[9px] bg-indigo-950/60 px-1 rounded">
                            {stage.protocolStep}
                          </span>
                        )}
                      </div>

                      {stage.outputSnippet && (
                        <p className="text-[11px] text-slate-300 bg-black/40 p-1.5 rounded border border-white/5">
                          {stage.outputSnippet}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Jump to deliverables */}
                {currentRun.deliverables.length > 0 && (
                  <button
                    id="btn-view-generated-deliverables"
                    onClick={() => setActiveTab('deliverables')}
                    className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg"
                  >
                    <span>Read Executive Report ({currentRun.deliverables.length} Docs)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Executive Council (4 Agents Deep-Dive & Control) */}
      {activeTab === 'agents' && (
        <div className="flex-1 overflow-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Col (4 cols): Agent Selection Cards */}
          <div className="md:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span>Executive AI Roster</span>
              </h4>
              <span className="text-indigo-400 font-mono text-[11px] bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-500/30">
                {agents.length} Agents
              </span>
            </div>

            {/* Quick Status Legend / Filter */}
            <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-[10px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 rounded-lg font-mono transition-all ${
                  statusFilter === 'all'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({agents.length})
              </button>

              <button
                onClick={() => setStatusFilter('processing')}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 font-mono transition-all ${
                  statusFilter === 'processing'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Active</span>
              </button>

              <button
                onClick={() => setStatusFilter('standby')}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 font-mono transition-all ${
                  statusFilter === 'standby'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                    : 'text-slate-400 hover:text-sky-400'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                <span>Standby</span>
              </button>

              <button
                onClick={() => setStatusFilter('idle')}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 font-mono transition-all ${
                  statusFilter === 'idle'
                    ? 'bg-slate-700/60 text-slate-200 border border-slate-600 font-bold'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                <span>Idle</span>
              </button>
            </div>

            {agents
              .filter((agent) => {
                if (statusFilter === 'all') return true;
                const info = getAgentStatusInfo(agent);
                if (statusFilter === 'processing') return info.state === 'processing' || info.state === 'active';
                if (statusFilter === 'standby') return info.state === 'standby';
                if (statusFilter === 'idle') return info.state === 'idle';
                return true;
              })
              .map((agent) => {
                const statusInfo = getAgentStatusInfo(agent);
                const isSelected = selectedAgent.id === agent.id;

                return (
                  <button
                    key={agent.id}
                    id={`agent-card-${agent.id}`}
                    onClick={() => {
                      if (soundEnabled) playOSSound('click');
                      setSelectedAgentId(agent.id);
                      setAgentChatHistory([
                        {
                          sender: 'agent',
                          text: `Hello Founder. I'm ${agent.name}, ${agent.role}. I am operating under the 9-step Agent Work Protocol. My current queue has ${agent.taskQueue.length} items. How can I assist?`,
                          time: 'Just now',
                        },
                      ]);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'os-glass-card-active border-indigo-500/60 ring-1 ring-indigo-500/40 shadow-xl'
                        : 'os-glass-card border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {/* Avatar with small visual status indicator dot in corner */}
                      <div className="relative shrink-0">
                        <div
                          className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${agent.avatarColor} flex items-center justify-center text-sm font-bold text-white shadow-md`}
                        >
                          {agent.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>

                        {/* Status Dot Indicator Badge */}
                        <span
                          className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5"
                          title={`Status: ${statusInfo.label} (${statusInfo.description})`}
                        >
                          {statusInfo.isPulsing && (
                            <span
                              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusInfo.dotColor} opacity-75`}
                            />
                          )}
                          <span
                            className={`relative inline-flex rounded-full h-3.5 w-3.5 ${statusInfo.dotColor} ring-2 ring-slate-900 shadow-sm`}
                          />
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold text-xs text-white truncate">{agent.name}</span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 ${statusInfo.badgeBg}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor} ${
                                statusInfo.isPulsing ? 'animate-pulse' : ''
                              }`}
                            />
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">{agent.role}</div>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/5 text-[10px] text-slate-300 flex items-center justify-between">
                      <span className="text-slate-400 truncate max-w-[150px]">{agent.department}</span>
                      <span className="font-mono text-indigo-300 shrink-0">
                        {agent.taskQueue.length} Queued
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Right Col (8 cols): Selected Agent Full Management Center */}
          <div className="md:col-span-8 os-glass-card rounded-2xl p-5 border border-white/10 flex flex-col justify-between space-y-4">
            <div>
              {/* Agent Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div className="flex items-center space-x-3.5">
                  <div className="relative shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${selectedAgent.avatarColor} flex items-center justify-center text-lg font-bold text-white shadow-lg`}
                    >
                      {selectedAgent.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    {/* Header Status Indicator Dot */}
                    {(() => {
                      const currentInfo = getAgentStatusInfo(selectedAgent);
                      return (
                        <span
                          className="absolute -bottom-1 -right-1 flex h-4 w-4"
                          title={`Status: ${currentInfo.label}`}
                        >
                          {currentInfo.isPulsing && (
                            <span
                              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${currentInfo.dotColor} opacity-75`}
                            />
                          )}
                          <span
                            className={`relative inline-flex rounded-full h-4 w-4 ${currentInfo.dotColor} ring-2 ring-slate-900 shadow-md`}
                          />
                        </span>
                      );
                    })()}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{selectedAgent.name}</h3>
                      <span className="px-2 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                        {selectedAgent.id === 'coo' ? 'Central Orchestrator' : 'Specialized Executive'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {selectedAgent.role} • {selectedAgent.department} • <span className="text-emerald-400 font-mono">Accuracy: {selectedAgent.accuracyScore}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 text-xs font-mono">
                  {/* Status Toggle / Override */}
                  <div className="text-left bg-black/40 p-1.5 rounded-xl border border-white/10">
                    <div className="text-[9px] text-slate-400 mb-1 flex items-center justify-between gap-2">
                      <span>Live State:</span>
                      <span className="text-indigo-300 uppercase">{getAgentStatusInfo(selectedAgent).label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUpdateAgentStatus(selectedAgent.id, 'idle')}
                        className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all ${
                          selectedAgent.status === 'idle'
                            ? 'bg-slate-700 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Set agent to Idle"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Idle
                      </button>

                      <button
                        onClick={() => handleUpdateAgentStatus(selectedAgent.id, 'standby')}
                        className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all ${
                          selectedAgent.status === 'standby'
                            ? 'bg-sky-600 text-white font-bold'
                            : 'text-slate-400 hover:text-sky-300'
                        }`}
                        title="Set agent to Standby"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        Standby
                      </button>

                      <button
                        onClick={() => handleUpdateAgentStatus(selectedAgent.id, 'processing')}
                        className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all ${
                          selectedAgent.status === 'processing'
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'text-slate-400 hover:text-emerald-300'
                        }`}
                        title="Set agent to Processing"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">Tasks Completed</div>
                    <div className="font-bold text-emerald-400">{selectedAgent.tasksCompleted}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">Efficiency</div>
                    <div className="font-bold text-indigo-300">{selectedAgent.tokenEfficiency}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">Uptime</div>
                    <div className="font-bold text-slate-200">{selectedAgent.uptime}</div>
                  </div>
                </div>
              </div>

              {/* Sub-Tabs for Deep-Dive */}
              <div className="flex items-center space-x-1.5 mt-3 border-b border-white/5 pb-2">
                <button
                  onClick={() => setAgentDetailTab('overview')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    agentDetailTab === 'overview'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Target className="w-3 h-3" /> Goals & Instructions
                </button>

                <button
                  onClick={() => setAgentDetailTab('tasks')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    agentDetailTab === 'tasks'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <ListTodo className="w-3 h-3" /> Task Queue ({selectedAgent.taskQueue.length})
                </button>

                <button
                  onClick={() => setAgentDetailTab('history')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    agentDetailTab === 'history'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <History className="w-3 h-3" /> Activity History ({selectedAgent.activityHistory.length})
                </button>

                <button
                  onClick={() => setAgentDetailTab('permissions')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    agentDetailTab === 'permissions'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Lock className="w-3 h-3" /> Permissions ({selectedAgent.permissions.length})
                </button>

                <button
                  onClick={() => setAgentDetailTab('chat')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    agentDetailTab === 'chat'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <MessageSquare className="w-3 h-3" /> 1:1 Direct Consultation
                </button>
              </div>

              {/* View 1: Overview (Goals, Instructions, Bio) */}
              {agentDetailTab === 'overview' && (
                <div className="mt-3 space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Core Mission & Bio</h5>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{selectedAgent.bio}</p>
                  </div>

                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Primary Strategic Goals</h5>
                    <ul className="mt-1.5 space-y-1">
                      {selectedAgent.goals.map((goal, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-start gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{goal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Operating Directives & Instructions</h5>
                    <div className="mt-1.5 p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {selectedAgent.instructions}
                    </div>
                  </div>
                </div>
              )}

              {/* View 2: Task Queue */}
              {agentDetailTab === 'tasks' && (
                <div className="mt-3 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {selectedAgent.taskQueue.map((task) => (
                    <div key={task.id} className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{task.title}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                            task.priority === 'Critical'
                              ? 'bg-rose-900/60 text-rose-300 border border-rose-500/30'
                              : 'bg-indigo-900/60 text-indigo-300 border border-indigo-500/30'
                          }`}>
                            {task.priority}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300 font-mono uppercase">
                            Step: {task.protocolStep}
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400">Input: {task.inputDescription}</div>
                      {task.outputSnippet && (
                        <div className="text-[11px] text-emerald-300 bg-emerald-950/40 p-2 rounded border border-emerald-500/20 font-mono">
                          Output: {task.outputSnippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* View 3: Activity History */}
              {agentDetailTab === 'history' && (
                <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {selectedAgent.activityHistory.map((act) => (
                    <div key={act.id} className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-start justify-between gap-3 text-xs">
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{act.action}</span>
                          {act.badge && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                              {act.badge}
                            </span>
                          )}
                        </div>
                        {act.output && (
                          <p className="text-[11px] text-slate-400">{act.output}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">{act.time}</span>
                        <div className="text-[9px] text-indigo-400 uppercase font-mono">{act.protocolStep}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* View 4: Permissions */}
              {agentDetailTab === 'permissions' && (
                <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 mb-2">
                    Security Governance: All capabilities execute in safe mock sandbox mode. External financial mutations and unauthorized transactions are strictly prevented.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedAgent.permissions.map((perm, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border bg-white/5 border-white/10 text-slate-200 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-white">{perm.name}</div>
                          <div className="text-[10px] text-slate-400">{perm.description}</div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {perm.category}
                          </span>
                          {perm.isSafeMock && (
                            <div className="text-[9px] font-mono text-emerald-400 mt-1">✓ Sandboxed</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View 5: 1:1 Direct Consultation */}
              {agentDetailTab === 'chat' && (
                <div className="mt-3 space-y-3">
                  <div className="min-h-[160px] max-h-[200px] overflow-y-auto p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                    {agentChatHistory.map((chat, idx) => (
                      <div
                        key={idx}
                        className={`flex ${chat.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] p-2.5 rounded-xl text-xs ${
                            chat.sender === 'user'
                              ? 'bg-indigo-600 text-white rounded-br-none'
                              : 'bg-slate-800 text-slate-200 border border-white/10 rounded-bl-none'
                          }`}
                        >
                          <p className="leading-relaxed">{chat.text}</p>
                          <div className="text-[9px] text-white/50 text-right mt-1 font-mono">{chat.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleAgentChat} className="flex gap-2">
                    <input
                      id="agent-direct-chat-input"
                      type="text"
                      value={agentChatInput}
                      onChange={(e) => setAgentChatInput(e.target.value)}
                      placeholder={`Direct prompt to ${selectedAgent.name}...`}
                      className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      id="agent-direct-chat-submit"
                      type="submit"
                      disabled={!agentChatInput.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-1"
                    >
                      <span>Send</span>
                      <Send className="w-3 h-3" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 9-Step Agent Work Protocol & Topology */}
      {activeTab === 'protocol' && (
        <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
              <Workflow className="w-5 h-5 text-indigo-400" />
              Standard 9-Step Agent Work Protocol
            </h3>
            <p className="text-xs text-slate-400">
              The immutable execution framework binding all 4 AI agents: Understand → Research → Analyze → Plan → Build/Execute → Test → Verify → Review → Report.
            </p>
          </div>

          {/* 9-Step Interactive Diagram */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AGENT_WORK_PROTOCOL.map((step) => {
              const isSelected = selectedProtocolStep === step.key;
              return (
                <div
                  key={step.number}
                  onClick={() => setSelectedProtocolStep(step.key)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'os-glass-card-active border-indigo-400 ring-1 ring-indigo-400 shadow-xl'
                      : 'os-glass-card border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold">
                      Stage {step.number}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono uppercase">{step.leadAgent}</span>
                  </div>

                  <h4 className="text-sm font-bold text-white mt-2.5">{step.name}</h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{step.description}</p>

                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Artifact:</span>
                    <span className="text-indigo-300 font-mono font-semibold">{step.expectedOutput}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Council Hierarchy Flowchart */}
          <div className="os-glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              Executive Delegation & Governance Topology
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
              <div className="p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-500/40">
                <div className="text-[10px] uppercase font-bold text-indigo-400">Step 1 & 4 & 7 & 9</div>
                <div className="text-xs font-bold text-white mt-1">Sophia Vance (COO)</div>
                <div className="text-[11px] text-slate-300 mt-1">Orchestrates, delegates, audits SLA, and compiles final report.</div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/40">
                <div className="text-[10px] uppercase font-bold text-amber-400">Step 2 & 3</div>
                <div className="text-xs font-bold text-white mt-1">Dr. Aris Thorne (Research)</div>
                <div className="text-[11px] text-slate-300 mt-1">Scans market TAM, analyzes competitor moats & technical feasibility.</div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40">
                <div className="text-[10px] uppercase font-bold text-rose-400">Step 5</div>
                <div className="text-xs font-bold text-white mt-1">Maya Lin (Product)</div>
                <div className="text-[11px] text-slate-300 mt-1">Authors full PRD, user journeys, acceptance criteria, and feature specs.</div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40">
                <div className="text-[10px] uppercase font-bold text-emerald-400">Step 6</div>
                <div className="text-xs font-bold text-white mt-1">Julian Cruz (Finance)</div>
                <div className="text-[11px] text-slate-300 mt-1">Models token costs, unit economics, gross margins, and 12-mo ARR expansion.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Executive Deliverables & Reports Vault */}
      {activeTab === 'deliverables' && (
        <div className="flex-1 overflow-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Deliverables selector */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Executive Artifacts Vault</span>
              <span className="text-indigo-400 font-mono">{currentRun.deliverables.length} Docs</span>
            </h4>

            {currentRun.deliverables.map((del, idx) => (
              <button
                key={idx}
                id={`deliverable-tab-${idx}`}
                onClick={() => setSelectedDeliverableIndex(idx)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedDeliverableIndex === idx
                    ? 'os-glass-card-active border-indigo-500/60 shadow-lg'
                    : 'os-glass-card border-white/10 hover:border-white/20'
                }`}
              >
                <div className="text-xs font-bold text-white">{del.name}</div>
                <div className="text-[10px] text-indigo-400 mt-0.5">Author: {del.owner}</div>
                {del.protocolStep && (
                  <div className="text-[9px] text-slate-400 font-mono uppercase mt-1">
                    Protocol: {del.protocolStep}
                  </div>
                )}
              </button>
            ))}

            {currentRun.deliverables.length === 0 && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center text-xs text-slate-400">
                No deliverables generated yet. Dispatch a directive to produce executive reports.
              </div>
            )}
          </div>

          {/* Deliverable Viewer */}
          <div className="md:col-span-2 os-glass-card rounded-2xl p-5 border border-white/10 flex flex-col justify-between space-y-4">
            {currentRun.deliverables[selectedDeliverableIndex] ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {currentRun.deliverables[selectedDeliverableIndex].name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                      <span className="text-indigo-400">
                        Owner: {currentRun.deliverables[selectedDeliverableIndex].owner}
                      </span>
                      {currentRun.deliverables[selectedDeliverableIndex].provenance && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                          Basis: {currentRun.deliverables[selectedDeliverableIndex].provenance?.evidenceBasis} • {currentRun.deliverables[selectedDeliverableIndex].provenance?.modelUsed || 'live-orchestration'}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    id="copy-deliverable-btn"
                    onClick={() =>
                      handleCopyDeliverable(
                        currentRun.deliverables[selectedDeliverableIndex].content,
                        currentRun.deliverables[selectedDeliverableIndex].name
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-slate-200 hover:text-white flex items-center space-x-1.5 transition-colors border border-white/10 shrink-0 ml-2"
                  >
                    {copiedDeliverable === currentRun.deliverables[selectedDeliverableIndex].name ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">Copied Markdown</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Markdown</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[420px] p-4 rounded-xl bg-black/50 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {currentRun.deliverables[selectedDeliverableIndex].content}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-400 flex-wrap gap-2">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified by COO Sophia Vance (Constitutional Invariants Enforced)
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {currentRun.deliverables[selectedDeliverableIndex].provenance?.timestamp
                      ? new Date(currentRun.deliverables[selectedDeliverableIndex].provenance!.timestamp).toLocaleTimeString()
                      : 'Safe Mock Verified'}
                  </span>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Select a deliverable on the left to inspect content.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
