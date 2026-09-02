'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Search,
  Bot,
  BrainCircuit,
  Sparkles,
  CheckCheck,
  Check,
  RotateCcw,
  Trash2,
  ChevronRight,
  ArrowRight,
  Shield,
  Clock,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Play,
  FileText,
  CheckCircle2,
  XCircle,
  Layers,
  FileCheck,
  TrendingUp,
  HelpCircle,
  Briefcase,
  X,
  FileCode
} from 'lucide-react';
import {
  AppId,
  AgentRole,
  OrchestrationRun,
  ExecutionDeliverable,
  CompanyDecision,
  AttentionItem,
} from '@/types/os';
import { APPS_CONFIG, INITIAL_AGENTS } from '@/lib/os-data';
import { playOSSound, dispatchOSNotification } from '../os/IconHelper';

export type ParticipantId = 'advisor' | AgentRole;
export type MessageIntent = 'conversation' | 'information_request' | 'directive' | 'ambiguous';

export interface MessageParticipant {
  id: ParticipantId;
  name: string;
  role: string;
  department: string;
  avatarColor: string;
  isAdvisor: boolean;
  status: 'active' | 'busy' | 'idle';
  starterPrompts: string[];
  welcomeMessage: string;
}

export interface DirectMessage {
  id: string;
  sender: 'founder' | ParticipantId;
  text: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
  liveAi?: boolean;
  modelUsed?: string;
  errorMessage?: string;
  intent?: MessageIntent;
  directiveProposal?: {
    title?: string;
    suggestedScope?: string;
    reason?: string;
  };
  isDirectiveExecuting?: boolean;
  directiveProgressStep?: string;
  orchestrationRun?: OrchestrationRun;
  isDismissedProposal?: boolean;
}

const PARTICIPANTS: MessageParticipant[] = [
  {
    id: 'advisor',
    name: 'Founder Intelligence',
    role: 'Strategic Co-Pilot & Advisor',
    department: 'Founder Strategic Advisory',
    avatarColor: 'from-purple-500 via-indigo-500 to-pink-500',
    isAdvisor: true,
    status: 'active',
    welcomeMessage:
      'Direct strategic line open. I can evaluate company-level trade-offs, governance decisions, unit economics, or cross-functional alignment.',
    starterPrompts: [
      'What are our biggest operational risks right now?',
      'How should we sequence the self-serve pricing rollout?',
      'Evaluate our current compute gross margins and burn rate.',
    ],
  },
  {
    id: 'coo',
    name: 'Sophia Vance',
    role: 'Chief Operating Officer',
    department: 'Executive Operations & Orchestration',
    avatarColor: 'from-purple-500 to-indigo-600',
    isAdvisor: false,
    status: 'active',
    welcomeMessage:
      'Executive Operations online. Let me know if you need to coordinate cross-agent work, check task SLAs, or audit protocol compliance.',
    starterPrompts: [
      'What is the current bottleneck in our task queue?',
      'Research the European market and give me a recommendation.',
      'Can you look into our API compute latency?',
    ],
  },
  {
    id: 'researcher',
    name: 'Dr. Aris Thorne',
    role: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech',
    avatarColor: 'from-amber-500 to-orange-600',
    isAdvisor: false,
    status: 'active',
    welcomeMessage:
      'Market Intelligence desk ready. I can provide competitor landscape analysis, model architecture benchmarks, or tech radar updates.',
    starterPrompts: [
      'What did you find about the European market?',
      'Research competitor agent frameworks and synthesize a moat report.',
      'Check this out maybe regarding open weights models?',
    ],
  },
  {
    id: 'pm',
    name: 'Maya Lin',
    role: 'Principal Product Manager',
    department: 'Product Architecture & UX',
    avatarColor: 'from-pink-500 to-rose-600',
    isAdvisor: false,
    status: 'active',
    welcomeMessage:
      'Product specs and PRDs ready. Message me with feature ideas, UX edge cases, or roadmap sequencing questions.',
    starterPrompts: [
      'What is the status of Project Lumora?',
      'Draft a PRD for 3-click enterprise developer onboarding with acceptance criteria.',
      'Can you look into our user activation friction?',
    ],
  },
  {
    id: 'finance',
    name: 'Julian Cruz',
    role: 'VP of Finance & Unit Economics',
    department: 'Financial Modeling & Capital Planning',
    avatarColor: 'from-emerald-500 to-teal-600',
    isAdvisor: false,
    status: 'active',
    welcomeMessage:
      'Financial desk open. I can stress-test token unit economics, model compute infrastructure costs, or project operational runway.',
    starterPrompts: [
      'What is our current MRR and gross margin?',
      'Model pricing strategy for 250 enterprise autonomous agent seats with 85%+ gross margin.',
      'Look into pricing adjustments for Q4.',
    ],
  },
];

let msgSequence = 0;
function generateMsgId(prefix: string): string {
  msgSequence += 1;
  return `${prefix}-${msgSequence}-${Math.random().toString(36).slice(2, 7)}`;
}

function getFormattedTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessagesAppProps {
  soundEnabled?: boolean;
  onOpenApp?: (appId: AppId, directive?: string) => void;
  initialParticipantId?: ParticipantId;
}

export const MessagesApp: React.FC<MessagesAppProps> = ({
  soundEnabled = true,
  onOpenApp,
  initialParticipantId = 'advisor',
}) => {
  const [selectedId, setSelectedId] = useState<ParticipantId>(initialParticipantId);
  const [searchQuery, setSearchQuery] = useState('');
  const [messagesByParticipant, setMessagesByParticipant] = useState<Record<ParticipantId, DirectMessage[]>>({
    advisor: [
      {
        id: 'init-adv-1',
        sender: 'advisor',
        text: 'Direct executive line active. Ask me about high-level trade-offs, company strategy, or cross-functional alignment anytime.',
        timestamp: '10:30 AM',
        status: 'delivered',
        liveAi: false,
        intent: 'conversation',
      },
    ],
    coo: [
      {
        id: 'init-coo-1',
        sender: 'coo',
        text: 'Operations kernel online. I am supervising the 9-step execution protocol across all streams. How can I assist you?',
        timestamp: '10:32 AM',
        status: 'delivered',
        liveAi: false,
        intent: 'conversation',
      },
    ],
    researcher: [],
    pm: [],
    finance: [],
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedDeliverableModal, setSelectedDeliverableModal] = useState<ExecutionDeliverable | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<ParticipantId, number>>({
    advisor: 0,
    coo: 0,
    researcher: 0,
    pm: 0,
    finance: 0,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedParticipant = PARTICIPANTS.find((p) => p.id === selectedId) || PARTICIPANTS[0];

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesByParticipant, selectedId, isSending]);

  // Clear unread badge on selecting a participant
  const handleSelectParticipant = (id: ParticipantId) => {
    if (soundEnabled) playOSSound('click');
    setSelectedId(id);
    setUnreadCounts((prev) => ({ ...prev, [id]: 0 }));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Execute directive through the existing orchestration architecture
  const handleExecuteDirective = async (directiveText: string, messageId: string) => {
    if (soundEnabled) playOSSound('execute');

    // Update message state to show executing
    setMessagesByParticipant((prev) => {
      const thread = prev[selectedId] || [];
      return {
        ...prev,
        [selectedId]: thread.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isDirectiveExecuting: true,
                directiveProgressStep: 'Sophia Vance deconstructing directive into 9-step Council protocol...',
              }
            : m
        ),
      };
    });

    const progressSteps = [
      'Sophia Vance is deconstructing directive into 9-step Agent Protocol...',
      'Dr. Aris Thorne conducting market dynamics and technical feasibility recon...',
      'Maya Lin drafting Product Requirements Document (PRD) & user flows...',
      'Julian Cruz stress-testing compute burn, pricing tiers & unit economics...',
      'Sophia Vance verifying constitutional SLA & safe sandbox compliance...',
      'Executive Council synthesizing final recommendations for Founder HQ...',
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      stepIdx = (stepIdx + 1) % progressSteps.length;
      setMessagesByParticipant((prev) => {
        const thread = prev[selectedId] || [];
        return {
          ...prev,
          [selectedId]: thread.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  directiveProgressStep: progressSteps[stepIdx],
                }
              : m
          ),
        };
      });
    }, 1300);

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directive: directiveText,
          agents: ['coo', 'researcher', 'pm', 'finance'],
        }),
      });

      clearInterval(interval);
      const data = await res.json();

      if (res.ok && data.success && data.data) {
        if (soundEnabled) playOSSound('notification');

        const payload = data.data;
        const finalizedRun: OrchestrationRun = {
          id: payload.id || `run-${Date.now()}`,
          directive: directiveText,
          timestamp: payload.timestamp || getFormattedTime(),
          status: payload.status || 'completed',
          liveAi: data.liveAi,
          currentProtocolStep: 'report',
          title: payload.title || `Directive: ${directiveText.slice(0, 48)}`,
          summary: payload.summary || 'Executive Council completed multi-agent strategic package.',
          plan: payload.plan || [],
          messages: payload.messages || [],
          deliverables: payload.deliverables || [],
          finalExecutiveReport: payload.finalExecutiveReport,
          executiveResult: payload.executiveResult,
          verificationResult: payload.verificationResult,
          executionSummary: payload.executionSummary,
        };

        // Decision / Attention items creation for Company HQ
        const decisionDetails = payload.executiveResult?.founderDecision;
        let newDecision: CompanyDecision | undefined;
        let newAttentionItem: AttentionItem | undefined;

        if (decisionDetails?.required) {
          newDecision = {
            id: `dec-${Date.now()}`,
            title: decisionDetails.title || `Ratify Directive: ${finalizedRun.title}`,
            status: 'pending_approval',
            category: 'Strategic',
            recommendedBy: 'Executive Council (COO, Research, PM, Finance)',
            agentId: 'coo',
            recommendation: decisionDetails.recommendation || finalizedRun.summary,
            businessImpact: decisionDetails.impact || 'Authorizes executive workforce to proceed under Safe Mock constraints.',
            evidenceSummary: 'Synthesized and audited across Research, Product, and Finance specialists.',
            date: 'Today',
            founderApprovalRequired: true,
          };

          newAttentionItem = {
            id: `att-run-${Date.now()}`,
            type: 'approval_required',
            title: `Decision Required: ${newDecision.title}`,
            whatHappened: `Executive Council produced verified deliverables for "${directiveText.slice(0, 60)}...".`,
            whyItMatters: decisionDetails.why || 'Requires Founder sign-off before allocating execution capacity.',
            recommendedAction: 'Review Executive Recommendation in Company HQ.',
            authorAgentId: 'coo',
            authorName: 'Sophia Vance (COO)',
            founderActionRequired: true,
            status: 'pending',
            timestamp: getFormattedTime(),
            evidence: {
              basis: (payload.executiveResult?.evidenceAvailability?.primaryBasis as any) || 'model_reasoning',
              source: 'Multi-Agent Council Protocol',
              details: 'Synthesized across Research, Product Architecture, and Financial Modeling under 9-step governance.',
            },
          };
        }

        // Synchronize with Company HQ via CustomEvent
        window.dispatchEvent(
          new CustomEvent('samjuniors-directive-orchestrated', {
            detail: {
              run: finalizedRun,
              decision: newDecision,
              attentionItem: newAttentionItem,
            },
          })
        );

        // Update message with finalized run
        setMessagesByParticipant((prev) => {
          const thread = prev[selectedId] || [];
          return {
            ...prev,
            [selectedId]: thread.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    isDirectiveExecuting: false,
                    orchestrationRun: finalizedRun,
                    text: `${m.text}\n\n✅ [Executive Council Deliverables Generated]\nStrategic Package: "${finalizedRun.title}"\nStatus: Completed & Verified across Research, Product, and Finance.`,
                  }
                : m
            ),
          };
        });
      } else {
        throw new Error(data.error || 'Failed to complete directive execution');
      }
    } catch (err: any) {
      clearInterval(interval);
      setMessagesByParticipant((prev) => {
        const thread = prev[selectedId] || [];
        return {
          ...prev,
          [selectedId]: thread.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  isDirectiveExecuting: false,
                  status: 'error',
                  errorMessage: err.message || 'Directive execution failed.',
                }
              : m
          ),
        };
      });
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isSending) return;

    if (soundEnabled) playOSSound('click');

    const timestamp = getFormattedTime();
    const userMsgId = generateMsgId('msg-founder');
    const targetParticipantId = selectedId;

    const userMessage: DirectMessage = {
      id: userMsgId,
      sender: 'founder',
      text: textToSend,
      timestamp,
      status: 'delivered',
    };

    // Append founder message
    setMessagesByParticipant((prev) => ({
      ...prev,
      [targetParticipantId]: [...(prev[targetParticipantId] || []), userMessage],
    }));

    if (!customText) {
      setInputMessage('');
    }

    setIsSending(true);

    try {
      // Build conversation history for context continuity
      const history = (messagesByParticipant[targetParticipantId] || []).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: targetParticipantId,
          message: textToSend,
          history,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (soundEnabled) playOSSound('notification');

        const replyMessage: DirectMessage = {
          id: generateMsgId('msg-reply'),
          sender: targetParticipantId,
          text: data.reply || 'Message received.',
          timestamp: getFormattedTime(),
          status: 'delivered',
          liveAi: data.liveAi,
          modelUsed: data.modelUsed,
          intent: data.intent,
          directiveProposal:
            data.classification?.intent === 'directive' || data.classification?.intent === 'ambiguous'
              ? {
                  title: data.classification.directiveTitle || textToSend,
                  suggestedScope: data.classification.suggestedScope,
                  reason: data.classification.reason,
                }
              : undefined,
        };

        setMessagesByParticipant((prev) => ({
          ...prev,
          [targetParticipantId]: [...(prev[targetParticipantId] || []), replyMessage],
        }));

        // If user navigated away while waiting, increment unread count
        if (selectedId !== targetParticipantId) {
          setUnreadCounts((prev) => ({
            ...prev,
            [targetParticipantId]: (prev[targetParticipantId] || 0) + 1,
          }));
          
          const agentName = INITIAL_AGENTS.find((a) => a.id === targetParticipantId)?.name || 'Advisor';
          dispatchOSNotification({
            title: 'New Message',
            message: `${agentName}: ${data.reply.slice(0, 40)}...`,
            type: 'agent',
            agent: agentName,
          });
        }
      } else {
        throw new Error(data.error || 'Failed to receive response');
      }
    } catch (err: any) {
      const errorMsg: DirectMessage = {
        id: generateMsgId('msg-err'),
        sender: targetParticipantId,
        text: 'Unable to deliver response. Please retry.',
        timestamp: getFormattedTime(),
        status: 'error',
        errorMessage: err.message || 'Connection error',
      };

      setMessagesByParticipant((prev) => ({
        ...prev,
        [targetParticipantId]: [...(prev[targetParticipantId] || []), errorMsg],
      }));
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = () => {
    if (soundEnabled) playOSSound('click');
    setMessagesByParticipant((prev) => ({
      ...prev,
      [selectedId]: [],
    }));
  };

  const filteredParticipants = PARTICIPANTS.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || p.department.toLowerCase().includes(q);
  });

  const currentMessages = messagesByParticipant[selectedId] || [];

  return (
    <div className="h-full w-full flex bg-[#0c0d12] text-slate-200 overflow-hidden select-text text-xs relative">
      {/* LEFT COLUMN: Conversations List */}
      <div className="w-72 sm:w-80 flex flex-col border-r border-white/10 bg-[#0f1017]/90 shrink-0">
        {/* Header */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center text-white shadow-md">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Messages</h1>
              <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>5 Direct Channels</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-2.5 border-b border-white/5 bg-black/20">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="messages-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        {/* Participants / Conversation Threads */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredParticipants.map((participant) => {
            const isSelected = participant.id === selectedId;
            const thread = messagesByParticipant[participant.id] || [];
            const lastMsg = thread[thread.length - 1];
            const unread = unreadCounts[participant.id] || 0;

            return (
              <button
                key={participant.id}
                id={`messages-thread-${participant.id}`}
                onClick={() => handleSelectParticipant(participant.id)}
                className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start space-x-3 relative group border ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-500/50 shadow-md'
                    : 'bg-white/[0.02] hover:bg-white/[0.06] border-transparent'
                }`}
              >
                {/* Avatar with Status Indicator */}
                <div className="relative shrink-0 mt-0.5">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${participant.avatarColor} flex items-center justify-center text-white shadow-md`}
                  >
                    {participant.isAdvisor ? (
                      <BrainCircuit className="w-5 h-5 text-white drop-shadow" />
                    ) : (
                      <span className="text-sm font-bold">{participant.name[0]}</span>
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0f1017]" />
                </div>

                {/* Conversation Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                      {participant.name}
                      {participant.isAdvisor && (
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 text-[9px] font-mono border border-purple-500/40">
                          Advisor
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                      {lastMsg ? lastMsg.timestamp : 'Online'}
                    </span>
                  </div>

                  <div className="text-[10px] text-indigo-300 font-medium truncate mt-0.5">
                    {participant.role}
                  </div>

                  <p className="text-[11px] text-slate-400 truncate mt-1 leading-tight">
                    {lastMsg ? (
                      <span>
                        {lastMsg.sender === 'founder' ? 'You: ' : ''}
                        {lastMsg.text}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">No messages yet</span>
                    )}
                  </p>
                </div>

                {/* Unread Counter Badge */}
                {unread > 0 && (
                  <span className="absolute right-2.5 bottom-2.5 px-1.5 py-0.2 rounded-full bg-indigo-500 text-white text-[9px] font-bold shadow-sm">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer info pill */}
        <div className="p-2.5 border-t border-white/5 bg-black/40 text-[10px] text-slate-500 flex items-center justify-between">
          <span>End-to-end Sandbox DM</span>
          <span className="text-emerald-400 font-mono">Orchestration Active</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0b0c10] overflow-hidden">
        {/* Chat Top Bar */}
        <div className="p-3.5 sm:p-4 border-b border-white/10 bg-[#12131a] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${selectedParticipant.avatarColor} flex items-center justify-center text-white shadow-md`}
            >
              {selectedParticipant.isAdvisor ? (
                <BrainCircuit className="w-5 h-5 text-white" />
              ) : (
                <span className="text-sm font-bold">{selectedParticipant.name[0]}</span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white">{selectedParticipant.name}</h2>
                {selectedParticipant.isAdvisor ? (
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30 flex items-center gap-1 font-semibold">
                    <Sparkles className="w-3 h-3" />
                    Strategic Co-Pilot
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono">
                    {selectedParticipant.department}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-2">
                <span>{selectedParticipant.role}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="text-emerald-400 flex items-center gap-1 font-mono text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            {selectedParticipant.isAdvisor ? (
              <button
                id="messages-btn-open-advisor"
                onClick={() => onOpenApp?.('advisor')}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open deep strategic advisor"
              >
                <span>Full Advisor App</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            ) : (
              <button
                id="messages-btn-open-workforce"
                onClick={() => onOpenApp?.('workforce')}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="View in Company Headquarters"
              >
                <span>Company HQ</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            <button
              id="messages-btn-clear-history"
              onClick={handleClearHistory}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
              title="Clear message thread"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
          {/* Empty Conversation State with Starter Prompts */}
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center py-8 space-y-4">
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${selectedParticipant.avatarColor} flex items-center justify-center text-white shadow-xl`}
              >
                {selectedParticipant.isAdvisor ? (
                  <BrainCircuit className="w-7 h-7" />
                ) : (
                  <Bot className="w-7 h-7" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Direct Message with {selectedParticipant.name}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {selectedParticipant.welcomeMessage}
                </p>
              </div>

              {/* Starter Quick Actions */}
              <div className="w-full space-y-2 pt-2 text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-1">
                  Quick Directives & Inquiries
                </span>
                {selectedParticipant.starterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    id={`starter-prompt-${selectedParticipant.id}-${idx}`}
                    onClick={() => handleSendMessage(prompt)}
                    className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition-all flex items-center justify-between group"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            currentMessages.map((msg) => {
              const isFounder = msg.sender === 'founder';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isFounder ? 'items-end' : 'items-start'} space-y-1.5`}
                >
                  {/* Sender Name & Meta */}
                  <div className="flex items-center space-x-2 text-[10px] px-1 text-slate-400">
                    <span className="font-semibold text-slate-300">
                      {isFounder ? 'Founder' : selectedParticipant.name}
                    </span>
                    <span>{msg.timestamp}</span>

                    {/* Intent Badges */}
                    {!isFounder && msg.intent === 'directive' && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono border border-amber-500/30 flex items-center gap-1">
                        <Briefcase className="w-2.5 h-2.5" />
                        Directive
                      </span>
                    )}
                    {!isFounder && msg.intent === 'information_request' && (
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono border border-cyan-500/30">
                        Info Request
                      </span>
                    )}
                    {!isFounder && msg.intent === 'ambiguous' && (
                      <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono border border-purple-500/30 flex items-center gap-1">
                        <HelpCircle className="w-2.5 h-2.5" />
                        Clarification
                      </span>
                    )}

                    {msg.liveAi && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono">
                        Live AI ({msg.modelUsed || 'Gemini'})
                      </span>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-xl sm:max-w-2xl px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md ${
                      isFounder
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-sm'
                        : selectedParticipant.isAdvisor
                        ? 'bg-[#151624] border border-purple-500/30 text-slate-100 rounded-tl-sm shadow-purple-950/20'
                        : 'bg-[#151620] border border-white/10 text-slate-100 rounded-tl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {/* AMBIGUOUS CLARIFICATION CARD */}
                    {!isFounder && msg.intent === 'ambiguous' && !msg.isDismissedProposal && !msg.orchestrationRun && (
                      <div className="mt-3 p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs space-y-2">
                        <div className="flex items-center space-x-2 text-purple-300 font-semibold text-[11px]">
                          <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                          <span>Clarification Required (Ambiguous Intent)</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          This query was identified as open-ended. To protect execution bounds, would you like to launch a structured Multi-Agent Task or keep this conversational?
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              const targetText = msg.directiveProposal?.title || msg.text;
                              handleExecuteDirective(targetText, msg.id);
                            }}
                            disabled={msg.isDirectiveExecuting}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow transition-all"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Launch Multi-Agent Task</span>
                          </button>
                          <button
                            onClick={() => {
                              setMessagesByParticipant((prev) => {
                                const thread = prev[selectedId] || [];
                                return {
                                  ...prev,
                                  [selectedId]: thread.map((m) =>
                                    m.id === msg.id ? { ...m, isDismissedProposal: true } : m
                                  ),
                                };
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] transition-colors"
                          >
                            Keep Conversational
                          </button>
                        </div>
                      </div>
                    )}

                    {/* EXPLICIT DIRECTIVE EXECUTION PROPOSAL CARD */}
                    {!isFounder &&
                      msg.intent === 'directive' &&
                      !msg.orchestrationRun &&
                      !msg.isDirectiveExecuting && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-amber-300 font-semibold text-[11px]">
                              <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                              <span>Work Directive Detected</span>
                            </div>
                            <span className="text-[10px] text-amber-400 font-mono">9-Step Council Ready</span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            {msg.directiveProposal?.suggestedScope ||
                              'Ready to coordinate Research, Product Architecture, and Financial Modeling under safe sandbox invariants.'}
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              id={`btn-execute-directive-${msg.id}`}
                              onClick={() => {
                                const targetDirective = msg.directiveProposal?.title || msg.text;
                                handleExecuteDirective(targetDirective, msg.id);
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Execute Directive via Council</span>
                            </button>
                          </div>
                        </div>
                      )}

                    {/* REAL-TIME DIRECTIVE EXECUTION PROGRESS */}
                    {msg.isDirectiveExecuting && (
                      <div className="mt-3 p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-xs space-y-2.5 animate-pulse">
                        <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px]">
                          <div className="flex items-center space-x-2">
                            <Layers className="w-4 h-4 text-indigo-400 animate-spin" />
                            <span>Executive Council Multi-Agent Execution</span>
                          </div>
                          <span className="text-[10px] text-indigo-400 font-mono">Live Orchestration</span>
                        </div>
                        <p className="text-slate-200 text-xs font-mono">
                          {msg.directiveProgressStep || 'Ingesting scope across Sophia, Dr. Thorne, Maya, and Julian...'}
                        </p>
                      </div>
                    )}

                    {/* COMPLETED ORCHESTRATION RESULT & DELIVERABLES CARD */}
                    {msg.orchestrationRun && (
                      <div className="mt-3 p-3.5 rounded-xl bg-[#0e1017] border border-emerald-500/30 text-xs space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <div className="flex items-center space-x-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="font-bold text-white text-xs">
                              {msg.orchestrationRun.title}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30 font-semibold">
                            Completed & Verified
                          </span>
                        </div>

                        {/* Executive Summary */}
                        <p className="text-slate-300 text-xs leading-relaxed">
                          {msg.orchestrationRun.summary}
                        </p>

                        {/* Generated Deliverables */}
                        {msg.orchestrationRun.deliverables && msg.orchestrationRun.deliverables.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              Generated Deliverables ({msg.orchestrationRun.deliverables.length})
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.orchestrationRun.deliverables.map((deliv, idx) => (
                                <button
                                  key={deliv.id || idx}
                                  onClick={() => setSelectedDeliverableModal(deliv)}
                                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-left transition-colors flex items-start space-x-2 group"
                                >
                                  <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-white">
                                      {deliv.name}
                                    </div>
                                    <div className="text-[9px] text-slate-500 font-mono truncate">
                                      {(deliv.authorName || deliv.owner || 'AI Specialist').toUpperCase()} • {deliv.type || 'Deliverable'}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Synchronization Footer & Jump to Company HQ */}
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Synced to Company HQ (0 duplicate tasks)
                          </span>
                          <button
                            onClick={() => onOpenApp?.('workforce')}
                            className="px-2.5 py-1 rounded-md bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium flex items-center gap-1 transition-colors"
                          >
                            <span>View in Company HQ</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Error / Retry banner if failure */}
                    {msg.status === 'error' && (
                      <div className="mt-2 pt-2 border-t border-rose-500/20 flex items-center justify-between text-rose-300 text-xs">
                        <div className="flex items-center space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{msg.errorMessage || 'Failed to deliver message.'}</span>
                        </div>
                        <button
                          onClick={() => {
                            if (msg.intent === 'directive') {
                              handleExecuteDirective(msg.text, msg.id);
                            } else {
                              handleSendMessage(msg.text);
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-white font-medium text-[10px] transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status Indicator */}
                  {isFounder && (
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 pr-1 font-mono">
                      <CheckCheck className="w-3 h-3 text-indigo-400" />
                      <span>Delivered</span>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Typing Indicator */}
          {isSending && (
            <div className="flex items-center space-x-2 p-3 max-w-sm rounded-2xl rounded-tl-sm bg-[#151620] border border-white/10 text-slate-400">
              <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                {selectedParticipant.name[0]}
              </div>
              <span className="text-xs text-slate-300 font-medium">
                {selectedParticipant.name} is typing
              </span>
              <div className="flex space-x-1 pl-1">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 bg-[#12131a] border-t border-white/10 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end space-x-2 bg-[#0c0d12] border border-white/15 focus-within:border-indigo-500/60 rounded-2xl p-1.5 shadow-inner transition-colors"
          >
            <textarea
              ref={inputRef}
              id="messages-chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isSending}
              rows={1}
              placeholder={`Direct message ${selectedParticipant.name}... (e.g., questions, status check, or work directives)`}
              className="flex-1 bg-transparent border-none text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none max-h-32 min-h-[42px] px-3 py-2.5 custom-scrollbar"
            />

            <button
              id="messages-send-btn"
              type="submit"
              disabled={!inputMessage.trim() || isSending}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white shadow-md transition-all active:scale-95 shrink-0"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
            <span>Direct conversation & work directive bridge</span>
            <span>Gemini Multi-Agent Mesh Active</span>
          </div>
        </div>
      </div>

      {/* DELIVERABLE DOCUMENT MODAL PREVIEW */}
      <AnimatePresence>
        {selectedDeliverableModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#12131c] border border-white/15 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#161824]">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {selectedDeliverableModal.name}
                    </h3>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                      <span>Authored by {(selectedDeliverableModal.authorName || selectedDeliverableModal.owner || 'AI Specialist').toUpperCase()}</span>
                      <span>•</span>
                      <span>Category: {selectedDeliverableModal.type || 'Deliverable'}</span>
                      <span>•</span>
                      <span className="text-emerald-400">Status: Verified Artifact</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDeliverableModal(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 overflow-y-auto custom-scrollbar flex-1 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap bg-black/30">
                {selectedDeliverableModal.content}
              </div>

              {/* Modal Footer */}
              <div className="p-3 border-t border-white/10 bg-[#161824] flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  Verified Executive Artifact
                </span>
                <button
                  onClick={() => setSelectedDeliverableModal(null)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors"
                >
                  Close Document
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

