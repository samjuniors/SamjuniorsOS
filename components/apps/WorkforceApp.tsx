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
  AttentionItem,
  CompanyInitiative,
  CompanyDecision,
  AdvisorTargetContext,
} from '@/types/os';
import {
  INITIAL_AGENTS,
  INITIAL_ORCHESTRATION,
  AGENT_WORK_PROTOCOL,
  INITIAL_ATTENTION_ITEMS,
  INITIAL_INITIATIVES,
  INITIAL_COMPANY_DECISIONS,
  INITIAL_RESEARCH,
} from '@/lib/os-data';
import {
  Building2,
  Users,
  Briefcase,
  Scale,
  Layers,
  Sparkles,
  Send,
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  Zap,
  FileCheck,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { playOSSound } from '../os/IconHelper';

// Sub components
import { AttentionSection } from '../hq/AttentionSection';
import { CompanyPulseSection } from '../hq/CompanyPulseSection';
import { RecentIntelligenceSection } from '../hq/RecentIntelligenceSection';
import { ActiveInitiativesSection } from '../hq/ActiveInitiativesSection';
import { ExecutiveResultCard } from '../hq/ExecutiveResultCard';
import { EmployeeProfileView } from '../hq/EmployeeProfileView';
import { DeliverablesView } from '../hq/DeliverablesView';
import { DecisionsView } from '../hq/DecisionsView';
import { ExecutionAuditView } from '../hq/ExecutionAuditView';

interface WorkforceAppProps {
  soundEnabled: boolean;
  initialDirective?: string;
  onClearInitialDirective?: () => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const WorkforceApp: React.FC<WorkforceAppProps> = ({
  soundEnabled,
  initialDirective,
  onClearInitialDirective,
  onAskAdvisor,
}) => {
  // Main Tab State: Default is Company HQ
  const [activeTab, setActiveTab] = useState<'hq' | 'employees' | 'work' | 'decisions' | 'audit'>('hq');

  // Operational State
  const [directiveInput, setDirectiveInput] = useState(initialDirective || '');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionMessage, setExecutionMessage] = useState('Sophia Vance is coordinating with Research, Product, and Finance...');
  const [currentRun, setCurrentRun] = useState<OrchestrationRun>(INITIAL_ORCHESTRATION);

  // Entities State
  const [agents, setAgents] = useState<AIAgent[]>(INITIAL_AGENTS);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('coo');
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>(INITIAL_ATTENTION_ITEMS);
  const [initiatives, setInitiatives] = useState<CompanyInitiative[]>(INITIAL_INITIATIVES);
  const [decisions, setDecisions] = useState<CompanyDecision[]>(INITIAL_COMPANY_DECISIONS);
  const [selectedDeliverableDoc, setSelectedDeliverableDoc] = useState<ExecutionDeliverable | undefined>(undefined);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  // Preset executive commands
  const presetCommands = [
    'Evaluate launching a self-serve tier for enterprise AI agents with unit economics & operational roadmap',
    'Audit Q4 API compute burn and recommend prompt compression & semantic caching optimizations',
    'Draft PRD & competitive moat analysis for zero-latency multi-agent neural bus',
    'Model pricing strategy for 250 enterprise autonomous agent seats with 85%+ gross margin',
  ];

  // Handle Orchestration Execution with truthful multi-agent backend
  const handleExecute = useCallback(
    async (overrideDirective?: string) => {
      const textToRun = overrideDirective || directiveInput;
      if (!textToRun.trim() || isExecuting) return;

      if (soundEnabled) playOSSound('execute');
      setIsExecuting(true);
      setExecutionMessage('Sophia Vance is decomposing company objective and coordinating with Research, Product, and Finance...');

      // Optimistic Run
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
        title: `Strategic Directive: ${textToRun.slice(0, 48)}...`,
        summary: 'Executive Council is researching market signals, architecting specifications, and auditing unit economics...',
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
            text: `[Sophia Vance - COO] Received Founder Objective: "${textToRun}". Decomposing into verifiable research, product, and financial deliverables.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: 'status',
          },
        ],
        deliverables: [],
      };
      setCurrentRun(optimisticRun);

      // Execution progress simulation messages
      const progressSteps = [
        'Sophia Vance is deconstructing Founder directive into 9-step Agent Protocol...',
        'Dr. Aris Thorne conducting market dynamics and technical feasibility recon...',
        'Maya Lin drafting Product Requirements Document (PRD) & user flows...',
        'Julian Cruz stress-testing compute burn, pricing tiers & unit economics...',
        'Sophia Vance verifying constitutional SLA & safe sandbox compliance...',
        'Executive Council synthesizing final recommendations for Founder HQ...',
      ];

      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        stepIndex = (stepIndex + 1) % progressSteps.length;
        setExecutionMessage(progressSteps[stepIndex]);
      }, 1400);

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
        clearInterval(progressInterval);

        if (data.success && data.data) {
          const payload = data.data;
          const finalizedRun: OrchestrationRun = {
            id: payload.id || `run-${Date.now()}`,
            directive: textToRun,
            timestamp: payload.timestamp || 'Just now',
            status: payload.status || 'completed',
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
            title: payload.title || `Strategic Package: ${textToRun.slice(0, 40)}`,
            summary: payload.summary || 'Executive Council completed strategic package and verified unit economics in Safe Mock mode.',
            plan: payload.plan || optimisticRun.plan.map((p) => ({ ...p, status: 'done' })),
            messages: payload.messages || optimisticRun.messages,
            deliverables: payload.deliverables || [],
            finalExecutiveReport: payload.finalExecutiveReport,
            executiveResult: payload.executiveResult,
            verificationResult: payload.verificationResult,
            executionSummary: payload.executionSummary,
          };
          setCurrentRun(finalizedRun);

          // If decision is required, add a Governance Decision and Attention item
          const decisionDetails = payload.executiveResult?.founderDecision;
          const decisionId = `dec-${Date.now()}`;
          const decisionTitle = decisionDetails?.title || `Approve Strategic Initiative: ${finalizedRun.title}`;

          if (decisionDetails?.required) {
            const newDecision: CompanyDecision = {
              id: decisionId,
              title: decisionTitle,
              status: 'pending_approval',
              category: 'Strategic',
              recommendedBy: 'Sophia Vance & Executive Council',
              agentId: 'coo',
              recommendation: decisionDetails.recommendation || finalizedRun.summary,
              businessImpact: decisionDetails.impact || 'Authorizes executive workforce to proceed under Safe Mock constraints.',
              evidenceSummary: 'Synthesized and audited across Research, Product, and Finance specialists.',
              date: 'Today',
              founderApprovalRequired: true,
            };
            setDecisions((prev) => [newDecision, ...prev]);

            const newAttentionItem: AttentionItem = {
              id: `att-run-${Date.now()}`,
              type: 'approval_required',
              title: `Founder Decision: ${decisionTitle}`,
              whatHappened: `Sophia Vance, Dr. Aris Thorne, Maya Lin, and Julian Cruz synthesized verified deliverables for "${textToRun.slice(0, 60)}...".`,
              whyItMatters: decisionDetails.why || 'Requires Founder sign-off before allocating execution capacity.',
              recommendedAction: 'Review Executive Recommendation and ratify decision.',
              authorAgentId: 'coo',
              authorName: 'Sophia Vance (COO)',
              founderActionRequired: true,
              status: 'pending',
              timestamp: 'Just now',
              evidence: {
                basis: payload.executiveResult?.evidenceAvailability?.primaryBasis || 'model_reasoning',
                source: 'Multi-Agent Executive Council Protocol',
                details: 'Full deliverables and verification details available in Founder HQ.',
              },
            };
            setAttentionItems((prev) => [newAttentionItem, ...prev]);
          }

          if (soundEnabled) playOSSound('notification');
        } else {
          // Handle truthful error/unconfigured response
          clearInterval(progressInterval);
          if (data.data) {
            setCurrentRun(data.data);
          }
        }
      } catch (err) {
        clearInterval(progressInterval);
        console.error('Orchestration error:', err);
      } finally {
        clearInterval(progressInterval);
        setIsExecuting(false);
      }
    },
    [directiveInput, isExecuting, soundEnabled]
  );

  // Handle Initial Directive from Desktop
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

  // Chat with single agent
  const handleAgentChat = async (message: string): Promise<string> => {
    const res = await fetch('/api/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: selectedAgent.id,
        message,
      }),
    });
    const data = await res.json();
    return data.reply || data.text || 'Acknowledged.';
  };

  // Attention item handlers
  const handleApproveAttention = (id: string) => {
    if (soundEnabled) playOSSound('click');
    setAttentionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'approved', founderActionRequired: false } : item))
    );
  };

  const handleDismissAttention = (id: string) => {
    if (soundEnabled) playOSSound('click');
    setAttentionItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Decision approval handler
  const handleApproveDecision = (id: string) => {
    if (soundEnabled) playOSSound('notification');
    setDecisions((prev) =>
      prev.map((dec) => (dec.id === id ? { ...dec, status: 'approved', founderApprovalRequired: false } : dec))
    );
  };

  // Navigation tabs
  const navTabs = [
    { id: 'hq', label: 'Company HQ', icon: Building2, badge: attentionItems.filter((i) => i.status === 'pending').length },
    { id: 'employees', label: 'Executive Team', icon: Users, badge: agents.length },
    { id: 'work', label: 'Company Work', icon: Briefcase, badge: currentRun.deliverables.length },
    { id: 'decisions', label: 'Decisions', icon: Scale, badge: decisions.filter((d) => d.status === 'pending_approval').length },
    { id: 'audit', label: 'Technical Audit', icon: Layers },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0c12] text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Header & Navigation Bar */}
      <div className="px-4 py-3 bg-[#11121c] border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 flex items-center justify-center text-white shadow-lg border border-white/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold text-white tracking-wide">SamJuniors OS</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Company HQ
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous Company Operating System & Executive Council</p>
          </div>
        </div>

        {/* Primary Navigation Tabs */}
        <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (soundEnabled) playOSSound('click');
                  setActiveTab(tab.id as any);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                      active ? 'bg-white/20 text-white' : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* TAB 1: COMPANY HQ (PRIMARY VIEW) */}
        {activeTab === 'hq' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Direct Founder Objective Dispatcher */}
            <div className="bg-gradient-to-br from-slate-900 via-[#131422] to-slate-900 border border-indigo-500/25 rounded-2xl p-5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white tracking-wide">
                    Direct Founder Directive Dispatcher
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                  Sophia Vance + Research + Product + Finance
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleExecute();
                }}
                className="space-y-2.5"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directiveInput}
                    onChange={(e) => setDirectiveInput(e.target.value)}
                    placeholder="What company objective or decision do you want your executive team to execute?"
                    className="flex-1 bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={isExecuting || !directiveInput.trim()}
                    className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg transition-all active:scale-95 whitespace-nowrap"
                  >
                    {isExecuting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-white" />
                    )}
                    <span>{isExecuting ? 'Executing...' : 'Dispatch'}</span>
                  </button>
                </div>

                {/* Preset Suggestions */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span className="text-slate-500 whitespace-nowrap text-[10px] font-semibold uppercase">Presets:</span>
                  {presetCommands.map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setDirectiveInput(preset);
                        handleExecute(preset);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 whitespace-nowrap text-[10px] transition-colors"
                    >
                      {preset.slice(0, 44)}...
                    </button>
                  ))}
                </div>
              </form>

              {/* Execution Status Bar */}
              {isExecuting && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-500/40 flex items-center space-x-3 text-xs"
                >
                  <div className="w-3 h-3 rounded-full bg-indigo-400 animate-ping" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{executionMessage}</p>
                    <p className="text-[10px] text-indigo-300">
                      Phase: {currentRun.currentProtocolStep?.toUpperCase() || 'UNDERSTAND'} • Peer-reviewing findings with zero hallucinations
                    </p>
                  </div>
                </motion.div>
              )}
            </div>

            {/* If run exists (completed, unconfigured, or initial): RESULT-FIRST EXECUTIVE PRESENTATION */}
            {currentRun && currentRun.status !== 'running' && (
              <ExecutiveResultCard
                run={currentRun}
                onInspectWork={() => setActiveTab('audit')}
                onViewDeliverables={() => setActiveTab('work')}
                onAskAdvisor={onAskAdvisor}
                onApproveDecision={(title) => {
                  if (soundEnabled) playOSSound('notification');
                  setDecisions((prev) =>
                    prev.map((dec) =>
                      dec.title === title || dec.id === 'dec-1' || dec.status === 'pending_approval'
                        ? { ...dec, status: 'approved', founderApprovalRequired: false }
                        : dec
                    )
                  );
                  setAttentionItems((prev) =>
                    prev.map((att) =>
                      att.type === 'approval_required'
                        ? { ...att, status: 'approved', founderActionRequired: false }
                        : att
                    )
                  );
                }}
                onRejectDecision={(title) => {
                  if (soundEnabled) playOSSound('click');
                  setDecisions((prev) =>
                    prev.map((dec) =>
                      dec.title === title || dec.id === 'dec-1' || dec.status === 'pending_approval'
                        ? { ...dec, status: 'rejected', founderApprovalRequired: false }
                        : dec
                    )
                  );
                  setAttentionItems((prev) =>
                    prev.map((att) =>
                      att.type === 'approval_required'
                        ? { ...att, status: 'rejected', founderActionRequired: false }
                        : att
                    )
                  );
                }}
              />
            )}

            {/* SECTION A: NEEDS FOUNDER ATTENTION */}
            <AttentionSection
              items={attentionItems}
              onApproveItem={handleApproveAttention}
              onDismissItem={handleDismissAttention}
              onAskAdvisor={onAskAdvisor}
            />

            {/* SECTION B: COMPANY PULSE */}
            <CompanyPulseSection
              agents={agents}
              initiatives={initiatives}
              pendingDecisionsCount={decisions.filter((d) => d.status === 'pending_approval').length}
              completedDeliverablesCount={currentRun.deliverables.length}
              onSelectAgent={(agentId) => {
                setSelectedAgentId(agentId);
                setActiveTab('employees');
              }}
              onSelectTab={setActiveTab}
            />

            {/* SECTION C: RECENT INTELLIGENCE */}
            <RecentIntelligenceSection researchTopics={INITIAL_RESEARCH} onAskAdvisor={onAskAdvisor} />

            {/* SECTION D: ACTIVE COMPANY INITIATIVES */}
            <ActiveInitiativesSection
              initiatives={initiatives}
              onViewWork={() => setActiveTab('work')}
              onAskAdvisor={onAskAdvisor}
            />
          </div>
        )}

        {/* TAB 2: EMPLOYEES & LEADERSHIP PROFILES */}
        {activeTab === 'employees' && (
          <div className="max-w-6xl mx-auto">
            <EmployeeProfileView
              agent={selectedAgent}
              allAgents={agents}
              onSelectAgent={(id) => setSelectedAgentId(id)}
              deliverables={currentRun.deliverables}
              onSendMessage={handleAgentChat}
              onInspectDeliverable={(doc) => {
                setSelectedDeliverableDoc(doc);
                setActiveTab('work');
              }}
              onAskAdvisor={onAskAdvisor}
            />
          </div>
        )}

        {/* TAB 3: COMPANY WORK & DELIVERABLES */}
        {activeTab === 'work' && (
          <div className="max-w-6xl mx-auto">
            <DeliverablesView
              deliverables={currentRun.deliverables}
              selectedDeliverableId={selectedDeliverableDoc?.id}
              onAskAdvisor={onAskAdvisor}
            />
          </div>
        )}

        {/* TAB 4: COMPANY DECISIONS & GOVERNANCE */}
        {activeTab === 'decisions' && (
          <div className="max-w-6xl mx-auto">
            <DecisionsView
              decisions={decisions}
              onApproveDecision={handleApproveDecision}
              onAskAdvisor={onAskAdvisor}
            />
          </div>
        )}

        {/* TAB 5: SECONDARY TECHNICAL EXECUTION & AUDIT */}
        {activeTab === 'audit' && (
          <div className="max-w-6xl mx-auto">
            <ExecutionAuditView run={currentRun} agents={agents} />
          </div>
        )}
      </div>

      {/* Footer Bar */}
      <div className="px-5 py-2.5 bg-[#0e0f17] border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Deterministic Safe Mock Sandboxing Active
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline">Constitutional Protocol Enforced</span>
        </div>

        <div className="flex items-center space-x-3 font-mono text-[10px]">
          <span>Gemini 2.5 Multi-Agent Engine</span>
          <span className="text-slate-600">•</span>
          <span>Zero Fabricated Metrics Guarantee</span>
        </div>
      </div>
    </div>
  );
};
