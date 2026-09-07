'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  MessageSquare,
  Sparkles,
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  CheckCheck,
  Zap,
  Layers,
  ArrowRight,
  HelpCircle,
  ExternalLink,
  Briefcase,
  X,
  FileCode,
  Smile,
  Copy,
  Info,
  MoreVertical,
  Shield,
  Trash2,
  Pin,
  Check,
  Mic,
  MicOff,
  PhoneCall,
  Volume2,
  VolumeX,
  Scale,
  ChevronRight,
  Heart,
  Coffee,
  ChevronDown,
} from 'lucide-react';
import {
  AppId,
  AgentRole,
  OrchestrationRun,
  ExecutionDeliverable,
  CompanyDecision,
  AttentionItem,
  DelegatedSubTask,
  OrchestratorMediation,
  CollaborationDialogueIntent,
} from '@/types/os';
import { APPS_CONFIG, INITIAL_AGENTS } from '@/lib/os-data';
import { CollaborationStore } from '@/lib/collaboration-store';
import { PersonaStore, PERSONA_ARCHETYPES, PersonaTone } from '@/lib/persona-store';
import { playOSSound, dispatchOSNotification } from '../os/IconHelper';
import { AgentAvatar } from '@/components/os/AgentAvatar';
import { ContextMenu, ContextMenuState } from '@/components/os/ContextMenu';
import { MarkdownMessage } from '@/components/os/MarkdownMessage';
import { VoiceCallModal } from '@/components/os/VoiceCallModal';

export type ParticipantId = 'advisor' | 'council' | AgentRole;
export type MessageIntent = 'conversation' | 'information_request' | 'directive' | 'ambiguous';

export interface MessageReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

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
  reactions?: MessageReaction[];
  directiveProposal?: {
    title?: string;
    suggestedScope?: string;
    reason?: string;
  };
  isDirectiveExecuting?: boolean;
  directiveProgressStep?: string;
  orchestrationRun?: OrchestrationRun;
  isDismissedProposal?: boolean;
  interAgentMeta?: {
    fromAgent: AgentRole | 'coo';
    fromName: string;
    toAgent: AgentRole | 'coo' | 'council';
    toName: string;
    intent?: CollaborationDialogueIntent;
    subtask?: DelegatedSubTask;
    mediation?: OrchestratorMediation;
  };
}

const PARTICIPANTS: MessageParticipant[] = [
  {
    id: 'council',
    name: 'Executive Council (AI Mesh)',
    role: 'Autonomous Multi-Agent Bus',
    department: 'Inter-Agent Collaboration Mesh',
    avatarColor: 'from-blue-600 via-indigo-600 to-purple-600',
    isAdvisor: false,
    status: 'active',
    welcomeMessage:
      'Autonomous Executive Council Mesh online. Sophia Vance (COO), Dr. Aris Thorne (Research), Maya Lin (PM), and Julian Cruz (Finance) communicate directly in this bus to delegate sub-tasks, exchange verified findings, and mediate trade-offs.',
    starterPrompts: [
      'Team: Can we launch in Europe without violating GDPR or exceeding $0.04/op?',
      'Evaluate lowering self-serve pricing by 25% while maintaining an 80% gross margin.',
      'Coordinate architecture specs for sub-100ms vector memory caching.',
    ],
  },
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
    council: [],
    advisor: [],
    coo: [],
    researcher: [],
    pm: [],
    finance: [],
  });

  // Per-participant isolated typing state (Fixes bug where chatting with one person shows everyone typing)
  const [typingMap, setTypingMap] = useState<Record<ParticipantId, boolean>>({
    council: false,
    advisor: false,
    coo: false,
    researcher: false,
    pm: false,
    finance: false,
  });

  const [inputMessage, setInputMessage] = useState('');
  const [selectedDeliverableModal, setSelectedDeliverableModal] = useState<ExecutionDeliverable | null>(null);
  const [inspectingProvenanceModal, setInspectingProvenanceModal] = useState<DirectMessage | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<ParticipantId, number>>({
    council: 0,
    advisor: 0,
    coo: 0,
    researcher: 0,
    pm: 0,
    finance: 0,
  });

  // Context Menu state
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  // Real Voice Interaction & Calling State
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [isDictatingInput, setIsDictatingInput] = useState(false);
  const [activeSpeakingMsgId, setActiveSpeakingMsgId] = useState<string | null>(null);
  const dictationRecRef = useRef<any>(null);

  // Active AI employee persona & tone tracking
  const [agentPersonas, setAgentPersonas] = useState(() => PersonaStore.getAllPersonas());
  const [isToneMenuOpen, setIsToneMenuOpen] = useState(false);

  useEffect(() => {
    return PersonaStore.subscribe(() => {
      setAgentPersonas(PersonaStore.getAllPersonas());
    });
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedParticipant = PARTICIPANTS.find((p) => p.id === selectedId) || PARTICIPANTS[0];
  const isCurrentParticipantTyping = Boolean(typingMap[selectedId]);

  // Voice Speech Synthesis Handler
  const handleSpeakMessage = (msgId: string, text: string, senderId: ParticipantId | 'founder') => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (activeSpeakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setActiveSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\[.*?\]/g, '').replace(/[*#_`~]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Persona voice matching
    if (senderId === 'coo') {
      utterance.pitch = 1.05;
      utterance.rate = 1.02;
    } else if (senderId === 'researcher') {
      utterance.pitch = 0.9;
      utterance.rate = 0.98;
    } else if (senderId === 'pm') {
      utterance.pitch = 1.15;
      utterance.rate = 1.05;
    } else if (senderId === 'finance') {
      utterance.pitch = 0.95;
      utterance.rate = 1.08;
    } else if (senderId === 'advisor') {
      utterance.pitch = 0.85;
      utterance.rate = 0.96;
    }

    utterance.onstart = () => {
      setActiveSpeakingMsgId(msgId);
      if (soundEnabled) playOSSound('pop');
    };

    utterance.onend = () => {
      setActiveSpeakingMsgId(null);
    };

    utterance.onerror = () => {
      setActiveSpeakingMsgId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // In-Chat Speech-to-Text Input Dictation
  const handleToggleDictation = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      dispatchOSNotification({
        title: 'Microphone Notice',
        message: 'Speech recognition is not supported in this browser. Please use text input or open Voice Call.',
        type: 'system',
      });
      return;
    }

    if (isDictatingInput) {
      if (dictationRecRef.current) {
        try {
          dictationRecRef.current.stop();
        } catch {}
      }
      setIsDictatingInput(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsDictatingInput(true);
        if (soundEnabled) playOSSound('click');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onend = () => {
        setIsDictatingInput(false);
      };

      recognition.onerror = () => {
        setIsDictatingInput(false);
      };

      dictationRecRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Dictation failed:', err);
      setIsDictatingInput(false);
    }
  };

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesByParticipant, selectedId, isCurrentParticipantTyping]);

  // Clear unread badge on selecting a participant
  const handleSelectParticipant = (id: ParticipantId) => {
    if (soundEnabled) playOSSound('click');
    setSelectedId(id);
    setIsToneMenuOpen(false);
    setUnreadCounts((prev) => ({ ...prev, [id]: 0 }));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Toggle emoji reactions on messages
  const handleToggleReaction = (messageId: string, emoji: string) => {
    if (soundEnabled) playOSSound('react');

    setMessagesByParticipant((prev) => {
      const thread = prev[selectedId] || [];
      return {
        ...prev,
        [selectedId]: thread.map((msg) => {
          if (msg.id !== messageId) return msg;

          const currentReactions = msg.reactions || [];
          const existingIdx = currentReactions.findIndex((r) => r.emoji === emoji);

          let updatedReactions: MessageReaction[];
          if (existingIdx >= 0) {
            const existing = currentReactions[existingIdx];
            if (existing.hasReacted) {
              // Remove reaction if 1 or decrement
              if (existing.count <= 1) {
                updatedReactions = currentReactions.filter((_, i) => i !== existingIdx);
              } else {
                updatedReactions = currentReactions.map((r, i) =>
                  i === existingIdx ? { ...r, count: r.count - 1, hasReacted: false } : r
                );
              }
            } else {
              // Increment
              updatedReactions = currentReactions.map((r, i) =>
                i === existingIdx ? { ...r, count: r.count + 1, hasReacted: true } : r
              );
            }
          } else {
            // New reaction
            updatedReactions = [...currentReactions, { emoji, count: 1, hasReacted: true }];
          }

          return {
            ...msg,
            reactions: updatedReactions,
          };
        }),
      };
    });
  };

  // Copy message text with sound and toast
  const handleCopyMessage = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      if (soundEnabled) playOSSound('copy');
      dispatchOSNotification({
        title: 'Copied to Clipboard',
        message: 'Message content copied successfully.',
        type: 'system',
      });
    }
  };

  // Execute directive through orchestration architecture
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
            title: `Executive Directive Ready: ${finalizedRun.title}`,
            whatHappened: `${finalizedRun.deliverables.length} deliverables verified across Sophia, Dr. Thorne, Maya, and Julian.`,
            whyItMatters: 'Requires founder ratification before full autonomous execution.',
            recommendedAction: 'Review deliverables in Company HQ and authorize.',
            authorAgentId: 'coo',
            authorName: 'Sophia Vance',
            type: 'approval_required',
            founderActionRequired: true,
            status: 'pending',
            timestamp: 'Just now',
          };
        }

        // Add system deliverable message into thread
        const completionMsg: DirectMessage = {
          id: generateMsgId('msg-exec-result'),
          sender: selectedId,
          text: `**Directive Completed**: ${finalizedRun.title}\n\n${finalizedRun.summary}\n\n*${finalizedRun.deliverables.length} verified deliverables generated across the executive council.*`,
          timestamp: getFormattedTime(),
          status: 'delivered',
          liveAi: data.liveAi,
          modelUsed: 'Council Mesh v2.5',
          intent: 'conversation',
          orchestrationRun: finalizedRun,
        };

        setMessagesByParticipant((prev) => {
          const thread = prev[selectedId] || [];
          return {
            ...prev,
            [selectedId]: [
              ...thread.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      isDirectiveExecuting: false,
                      orchestrationRun: finalizedRun,
                    }
                  : m
              ),
              completionMsg,
            ],
          };
        });

        dispatchOSNotification({
          title: `Directive Completed: ${finalizedRun.title}`,
          message: `${finalizedRun.deliverables.length} deliverables ready for inspection in Company HQ.`,
          type: 'agent',
          agent: 'Sophia Vance',
          actionable: true,
          actionLabel: 'Open HQ',
          appTarget: 'workforce',
        });
      } else {
        throw new Error(data.error || 'Directive execution failed');
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
    if (!textToSend || typingMap[selectedId]) return;

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

    // Set isolated typing state for TARGET participant only
    setTypingMap((prev) => ({
      ...prev,
      [targetParticipantId]: true,
    }));

    // Special routing if chatting with Executive Council (Inter-Agent Mesh)
    if (targetParticipantId === 'council') {
      try {
        const res = await fetch('/api/agent-collab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directive: textToSend }),
        });

        const data = await res.json();

        if (res.ok && data.dialogues && data.dialogues.length > 0) {
          // Trigger custom mission state in store
          CollaborationStore.initiateCustomMission(textToSend).catch(() => {});

          const newDialogues = data.dialogues;
          for (let i = 0; i < newDialogues.length; i++) {
            const diag = newDialogues[i];
            const interMsg: DirectMessage = {
              id: generateMsgId(`msg-council-${i}`),
              sender: (diag.from as ParticipantId) || 'coo',
              text: diag.message,
              timestamp: diag.timestamp || getFormattedTime(),
              status: 'delivered',
              liveAi: data.liveAi,
              modelUsed: `${diag.fromName} via Mesh`,
              intent: diag.intent === 'delegate_subtask' ? 'directive' : 'conversation',
              interAgentMeta: {
                fromAgent: diag.from,
                fromName: diag.fromName,
                toAgent: diag.to,
                toName: diag.toName,
                intent: diag.intent,
                subtask: diag.subtask,
                mediation: diag.mediation,
              },
            };

            await new Promise((resolve) => setTimeout(resolve, i === 0 ? 300 : 500));

            setMessagesByParticipant((prev) => ({
              ...prev,
              council: [...(prev.council || []), interMsg],
            }));

            if (soundEnabled) playOSSound('notification');
          }

          dispatchOSNotification({
            title: 'Council Alignment Achieved',
            message: `Sophia Vance, Aris Thorne, Maya Lin & Julian Cruz synchronized on: "${textToSend.slice(0, 40)}..."`,
            type: 'agent',
            agent: 'Sophia Vance (COO)',
            actionable: true,
            actionLabel: 'Open Collaboration View',
            appTarget: 'workforce',
          });
        } else {
          throw new Error(data.error || 'Failed to achieve council consensus');
        }
      } catch (err: any) {
        const errorMsg: DirectMessage = {
          id: generateMsgId('msg-err-council'),
          sender: 'coo',
          text: `Council Notice: ${err.message || 'Inter-agent communication bus timeout.'}`,
          timestamp: getFormattedTime(),
          status: 'error',
          errorMessage: err.message,
        };
        setMessagesByParticipant((prev) => ({
          ...prev,
          council: [...(prev.council || []), errorMsg],
        }));
      } finally {
        setTypingMap((prev) => ({
          ...prev,
          council: false,
        }));
      }
      return;
    }

    try {
      // Build conversation history for context continuity
      const history = (messagesByParticipant[targetParticipantId] || []).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      // Pass active persona configuration for tone tuning
      const personaConfig = PersonaStore.getPersona(targetParticipantId as AgentRole | 'advisor');

      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: targetParticipantId,
          message: textToSend,
          history,
          personaConfig,
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
            title: `New Message from ${agentName}`,
            message: `${data.reply.slice(0, 60)}...`,
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
      // Clear isolated typing state for target participant
      setTypingMap((prev) => ({
        ...prev,
        [targetParticipantId]: false,
      }));
    }
  };

  const handleClearHistory = () => {
    if (soundEnabled) playOSSound('dismiss');
    setMessagesByParticipant((prev) => ({
      ...prev,
      [selectedId]: [],
    }));
  };

  // Right-click context menu handlers
  const handleOpenMessageContextMenu = (e: React.MouseEvent, msg: DirectMessage) => {
    e.preventDefault();
    e.stopPropagation();

    const isFounder = msg.sender === 'founder';

    setContextMenuState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      title: isFounder ? 'Founder Message' : `${selectedParticipant.name}`,
      items: [
        {
          id: 'copy-text',
          label: 'Copy Message Text',
          icon: Copy,
          shortcut: '⌘C',
          onClick: () => handleCopyMessage(msg.text),
        },
        {
          id: 'react-thumbs',
          label: 'React with 👍',
          onClick: () => handleToggleReaction(msg.id, '👍'),
        },
        {
          id: 'react-rocket',
          label: 'React with 🚀',
          onClick: () => handleToggleReaction(msg.id, '🚀'),
        },
        {
          id: 'react-lightbulb',
          label: 'React with 💡',
          onClick: () => handleToggleReaction(msg.id, '💡'),
        },
        { id: 'sep-1', label: '', isSeparator: true },
        {
          id: 'execute-as-directive',
          label: 'Execute as Work Directive',
          icon: Play,
          shortcut: '⌘↵',
          onClick: () => handleExecuteDirective(msg.text, msg.id),
        },
        {
          id: 'inspect-provenance',
          label: 'Inspect AI Provenance',
          icon: Info,
          disabled: !msg.liveAi,
          onClick: () => setInspectingProvenanceModal(msg),
        },
        { id: 'sep-2', label: '', isSeparator: true },
        {
          id: 'dismiss-msg',
          label: 'Delete from Thread',
          icon: Trash2,
          destructive: true,
          onClick: () => {
            setMessagesByParticipant((prev) => ({
              ...prev,
              [selectedId]: (prev[selectedId] || []).filter((m) => m.id !== msg.id),
            }));
            if (soundEnabled) playOSSound('dismiss');
          },
        },
      ],
    });
  };

  const handleOpenParticipantContextMenu = (e: React.MouseEvent, participant: MessageParticipant) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      title: participant.name,
      items: [
        {
          id: 'open-channel',
          label: 'Open Direct Message Channel',
          icon: MessageSquare,
          onClick: () => handleSelectParticipant(participant.id),
        },
        {
          id: 'view-profile-hq',
          label: 'View Profile in Company HQ',
          icon: ExternalLink,
          onClick: () => onOpenApp?.('workforce'),
        },
        {
          id: 'mark-read',
          label: 'Mark as Read',
          icon: Check,
          onClick: () => {
            setUnreadCounts((prev) => ({ ...prev, [participant.id]: 0 }));
            if (soundEnabled) playOSSound('pop');
          },
        },
        { id: 'sep-part-1', label: '', isSeparator: true },
        {
          id: 'clear-channel',
          label: 'Clear Conversation History',
          icon: Trash2,
          destructive: true,
          onClick: () => {
            setMessagesByParticipant((prev) => ({
              ...prev,
              [participant.id]: [],
            }));
            if (soundEnabled) playOSSound('dismiss');
          },
        },
      ],
    });
  };

  const filteredParticipants = PARTICIPANTS.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || p.department.toLowerCase().includes(q);
  });

  const currentMessages = messagesByParticipant[selectedId] || [];

  return (
    <div className="h-full w-full flex bg-[#0c0d12] text-slate-200 overflow-hidden select-text text-xs relative">
      {/* Universal Context Menu */}
      <ContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState((prev) => ({ ...prev, isOpen: false }))}
        soundEnabled={soundEnabled}
      />

      {/* LEFT COLUMN: Conversations List */}
      <div className="w-72 sm:w-80 flex flex-col border-r border-white/10 bg-[#0f1017]/95 shrink-0">
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
                <span>5 Executive Channels</span>
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

        {/* Participant Channels List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filteredParticipants.map((p) => {
            const isSelected = p.id === selectedId;
            const unread = unreadCounts[p.id] || 0;
            const thread = messagesByParticipant[p.id] || [];
            const lastMsg = thread[thread.length - 1];
            const isParticipantTyping = Boolean(typingMap[p.id]);

            return (
              <button
                key={p.id}
                id={`participant-btn-${p.id}`}
                onClick={() => handleSelectParticipant(p.id)}
                onContextMenu={(e) => handleOpenParticipantContextMenu(e, p)}
                className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start space-x-2.5 group relative ${
                  isSelected
                    ? 'bg-indigo-600/20 border border-indigo-500/30 text-white shadow-sm'
                    : 'hover:bg-white/5 text-slate-400 border border-transparent'
                }`}
              >
                {/* Modern Futuristic Vector Avatar */}
                <div className="relative shrink-0 mt-0.5">
                  <AgentAvatar roleOrId={p.id} size="sm" showStatus status="active" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold truncate text-xs ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {p.name}
                    </span>
                    {lastMsg && (
                      <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                        {lastMsg.timestamp}
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                    {p.role}
                  </div>

                  {/* Typing or Last Message preview */}
                  <div className="mt-1 flex items-center justify-between text-[11px] truncate">
                    {isParticipantTyping ? (
                      <span className="text-indigo-400 font-medium flex items-center gap-1.5 animate-pulse">
                        <span className="flex space-x-0.5">
                          <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                        <span>Synthesizing...</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 truncate">
                        {lastMsg ? (
                          <>
                            {lastMsg.sender === 'founder' ? 'You: ' : ''}
                            {lastMsg.text.slice(0, 32)}...
                          </>
                        ) : (
                          'No messages yet'
                        )}
                      </span>
                    )}

                    {unread > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[9px] font-mono font-bold shrink-0 shadow-sm animate-pulse">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Advisor Bridge Pill */}
        <div className="p-2.5 border-t border-white/10 bg-black/30">
          <button
            onClick={() => onOpenApp?.('workforce')}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold flex items-center justify-between hover:bg-indigo-500/20 transition-all group"
          >
            <div className="flex items-center space-x-2">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Full Company Council</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Active Chat Channel */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0c0d12]">
        {/* Top Channel Header */}
        <div className="p-3 sm:p-3.5 border-b border-white/10 bg-[#0f1017]/90 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <AgentAvatar roleOrId={selectedParticipant.id} size="md" showStatus status="active" />

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white truncate tracking-tight">
                  {selectedParticipant.name}
                </h2>
                {selectedParticipant.isAdvisor ? (
                  <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30">
                    Strategic Co-Pilot
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                    Executive Role
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {selectedParticipant.role} • <span className="text-slate-500">{selectedParticipant.department}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Tone & Demeanor Quick Switcher */}
            {selectedParticipant.id !== 'council' && (() => {
              const currentConfig = agentPersonas[selectedParticipant.id as AgentRole | 'advisor'] || { tone: 'professional' };
              const currentTone = currentConfig.tone;
              const currentArch = PERSONA_ARCHETYPES[currentTone];
              const ToneIcon = currentTone === 'professional' ? Briefcase : currentTone === 'casual' ? Coffee : Heart;

              return (
                <div className="relative">
                  <button
                    id={`messages-tone-switch-${selectedParticipant.id}`}
                    onClick={() => {
                      if (soundEnabled) playOSSound('click');
                      setIsToneMenuOpen((prev) => !prev);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition-all ${currentArch.badgeClass}`}
                    title={`Active Demeanor: ${currentArch.label}. Click to switch.`}
                  >
                    <ToneIcon className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{currentArch.shortLabel}</span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>

                  {isToneMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 p-2 rounded-2xl bg-[#141622] border border-white/15 shadow-2xl z-50 space-y-1 backdrop-blur-xl">
                      <div className="px-2.5 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                        Employee Demeanor
                      </div>
                      {(['professional', 'casual', 'flirty'] as PersonaTone[]).map((t) => {
                        const arch = PERSONA_ARCHETYPES[t];
                        const Icon = t === 'professional' ? Briefcase : t === 'casual' ? Coffee : Heart;
                        const isSelected = currentTone === t;
                        return (
                          <button
                            key={t}
                            id={`messages-tone-opt-${t}`}
                            onClick={() => {
                              if (soundEnabled) playOSSound('click');
                              PersonaStore.setTone(selectedParticipant.id as AgentRole | 'advisor', t, true);
                              setIsToneMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 text-white font-bold shadow-md'
                                : 'text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <Icon className="w-3.5 h-3.5" />
                              <span>{arch.label}</span>
                            </div>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </button>
                        );
                      })}
                      <div className="pt-1.5 border-t border-white/5 px-2">
                        <button
                          onClick={() => {
                            setIsToneMenuOpen(false);
                            onOpenApp?.('settings');
                          }}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 py-1"
                        >
                          <span>Manage all personas in Settings</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Live Voice Call Button */}
            <button
              id="messages-voice-call-btn"
              onClick={() => {
                if (soundEnabled) playOSSound('open');
                setIsVoiceCallOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-sky-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all hover:scale-[1.02] active:scale-95 group"
              title={`Start real-time encrypted voice call with ${selectedParticipant.name}`}
            >
              <PhoneCall className="w-3.5 h-3.5 text-indigo-400 group-hover:animate-pulse" />
              <span className="hidden xs:inline">Voice Call</span>
            </button>

            <button
              onClick={() => onOpenApp?.('workforce')}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs flex items-center space-x-1.5 transition-colors hidden sm:flex"
            >
              <span>Profile</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>

            <button
              onClick={handleClearHistory}
              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
              title="Clear Thread History"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div
          id="messages-stream-container"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar"
        >
          {/* Welcome Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-[#151722] to-[#0e1017] border border-white/10 shadow-lg text-slate-300 space-y-3">
            <div className="flex items-center space-x-3">
              <AgentAvatar roleOrId={selectedParticipant.id} size="md" />
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{selectedParticipant.name}</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-normal">Online & Ready</span>
                </div>
                <div className="text-[11px] text-slate-400">{selectedParticipant.welcomeMessage}</div>

                {selectedParticipant.id !== 'council' && (() => {
                  const currentConfig = agentPersonas[selectedParticipant.id as AgentRole | 'advisor'] || { tone: 'professional' };
                  const currentArch = PERSONA_ARCHETYPES[currentConfig.tone];
                  const quote = currentArch.sampleQuotes[selectedParticipant.id];
                  return (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${currentArch.badgeClass}`}>
                        {currentArch.label}
                      </span>
                      {quote && (
                        <span className="text-[10px] text-slate-400 italic truncate max-w-md">
                          &ldquo;{quote}&rdquo;
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Quick Starter Prompts */}
            <div className="pt-2 border-t border-white/5">
              <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-2">
                Suggested Directives & Queries:
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedParticipant.starterPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(prompt)}
                    disabled={isCurrentParticipantTyping}
                    className="text-left px-3 py-1.5 rounded-xl bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/30 text-xs text-slate-200 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Render Thread Messages */}
          {currentMessages.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No active messages in this channel.</p>
              <p className="text-[11px] text-slate-600 mt-1">Send a message or select a prompt above to start.</p>
            </div>
          ) : (
            currentMessages.map((msg) => {
              const isFounder = msg.sender === 'founder';

              return (
                <div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  onContextMenu={(e) => handleOpenMessageContextMenu(e, msg)}
                  className={`flex flex-col group ${isFounder ? 'items-end' : 'items-start'} space-y-1`}
                >
                  {/* Sender & Timestamp Header */}
                  <div className="flex items-center space-x-2 text-[10px] text-slate-500 px-1">
                    {msg.interAgentMeta ? (
                      <div className="flex items-center space-x-1.5">
                        <AgentAvatar roleOrId={msg.interAgentMeta.fromAgent} size="xs" />
                        <span className="font-bold text-indigo-300">{msg.interAgentMeta.fromName}</span>
                        <span className="text-slate-500">➔</span>
                        <span className="font-semibold text-slate-300">{msg.interAgentMeta.toName}</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-slate-400">
                        {isFounder ? 'Founder (You)' : selectedParticipant.name}
                      </span>
                    )}
                    <span>•</span>
                    <span className="font-mono">{msg.timestamp}</span>

                    {/* Inter-Agent Intent Tag */}
                    {msg.interAgentMeta?.intent && (
                      <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[9px] font-mono border border-purple-500/30">
                        {msg.interAgentMeta.intent.replace(/_/g, ' ')}
                      </span>
                    )}

                    {/* Intent Tag */}
                    {!isFounder && !msg.interAgentMeta && msg.intent === 'directive' && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono border border-amber-500/30">
                        Directive
                      </span>
                    )}
                    {!isFounder && !msg.interAgentMeta && msg.intent === 'information_request' && (
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono border border-cyan-500/30">
                        Info Request
                      </span>
                    )}
                    {!isFounder && !msg.interAgentMeta && msg.intent === 'ambiguous' && (
                      <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-mono border border-purple-500/30 flex items-center gap-1">
                        <HelpCircle className="w-2.5 h-2.5" />
                        Clarification
                      </span>
                    )}

                    {msg.liveAi && (
                      <button
                        onClick={() => setInspectingProvenanceModal(msg)}
                        className="px-1.5 py-0.2 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[9px] font-mono flex items-center gap-1 transition-colors"
                        title="Click to inspect model provenance"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Live AI ({msg.modelUsed || 'Gemini'})</span>
                      </button>
                    )}
                  </div>

                  {/* Message Bubble Container with Hover Quick Actions */}
                  <div className="relative group max-w-xl sm:max-w-2xl">
                    {/* Hover Quick Action Bar (Apple / Linear style) */}
                    <div
                      className={`absolute -top-3.5 ${
                        isFounder ? 'right-2' : 'left-2'
                      } hidden group-hover:flex items-center space-x-1 bg-[#161824] border border-white/15 rounded-full px-1.5 py-0.5 shadow-xl z-20 backdrop-blur-md`}
                    >
                      <button
                        onClick={() => handleToggleReaction(msg.id, '👍')}
                        className="p-1 hover:bg-white/10 rounded-full text-xs transition-transform active:scale-125"
                        title="React 👍"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleToggleReaction(msg.id, '🚀')}
                        className="p-1 hover:bg-white/10 rounded-full text-xs transition-transform active:scale-125"
                        title="React 🚀"
                      >
                        🚀
                      </button>
                      <button
                        onClick={() => handleToggleReaction(msg.id, '💡')}
                        className="p-1 hover:bg-white/10 rounded-full text-xs transition-transform active:scale-125"
                        title="React 💡"
                      >
                        💡
                      </button>
                      {/* Read Aloud TTS Button */}
                      <button
                        onClick={() => handleSpeakMessage(msg.id, msg.text, msg.sender)}
                        className={`p-1 hover:bg-white/10 rounded-full transition-colors ${
                          activeSpeakingMsgId === msg.id ? 'text-indigo-400 bg-indigo-500/20 animate-pulse' : 'text-slate-400 hover:text-white'
                        }`}
                        title={activeSpeakingMsgId === msg.id ? 'Stop reading' : 'Read message aloud (TTS)'}
                      >
                        {activeSpeakingMsgId === msg.id ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      <div className="w-px h-3 bg-white/15 mx-0.5" />
                      <button
                        onClick={() => handleCopyMessage(msg.text)}
                        className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                        title="Copy text"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleOpenMessageContextMenu(e, msg)}
                        className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                        title="More options"
                      >
                        <MoreVertical className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`px-4 py-3 rounded-2xl text-xs sm:text-[13px] shadow-md transition-all ${
                        isFounder
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-indigo-950/40'
                          : selectedParticipant.isAdvisor
                          ? 'bg-[#141624] border border-purple-500/25 text-slate-100 rounded-tl-sm shadow-purple-950/20'
                          : 'bg-[#141520] border border-white/10 text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      {/* High-Craft Markdown & Paragraph Formatter */}
                      <MarkdownMessage content={msg.text} isFounder={isFounder} soundEnabled={soundEnabled} />

                      {/* Inter-Agent Subtask Card */}
                      {msg.interAgentMeta?.subtask && (
                        <div className="mt-3 p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="font-bold text-purple-300 flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              Sub-Task: {msg.interAgentMeta.subtask.title}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 text-[9px] uppercase font-bold">
                              {msg.interAgentMeta.subtask.priority}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300">
                            Deliverable: {msg.interAgentMeta.subtask.deliverableExpected}
                          </div>
                        </div>
                      )}

                      {/* Inter-Agent Mediation Card */}
                      {msg.interAgentMeta?.mediation && (
                        <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="font-bold text-rose-300 flex items-center gap-1">
                              <Scale className="w-3 h-3" />
                              Binding Orchestrator Ruling
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-200 font-medium">
                            {msg.interAgentMeta.mediation.orchestratorRuling}
                          </div>
                          <div className="text-[10px] text-slate-400 italic">
                            Trade-off: {msg.interAgentMeta.mediation.compromiseStrategy}
                          </div>
                        </div>
                      )}

                      {/* Council Quick Link if in council channel */}
                      {selectedId === 'council' && onOpenApp && (
                        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">Autonomous Council Bus</span>
                          <button
                            onClick={() => onOpenApp('workforce')}
                            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                          >
                            <span>Open in AI Collaboration Hub</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

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
                                      className="p-2 rounded-xl bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/30 text-left transition-all flex items-center justify-between group"
                                    >
                                      <div className="flex items-center space-x-2 min-w-0">
                                        <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                        <div className="min-w-0">
                                          <div className="font-semibold text-slate-200 truncate text-[11px]">
                                            {deliv.name || (deliv as any).title || 'Deliverable Document'}
                                          </div>
                                          <div className="text-[9px] text-slate-400 font-mono">
                                            {deliv.type || 'Deliverable'} • {deliv.owner || deliv.authorName || 'Council'}
                                          </div>
                                        </div>
                                      </div>
                                      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 shrink-0" />
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Action Button */}
                          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">
                              Logged to Company Architecture & Evidence Store
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

                    {/* Reaction Badges List */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                        {msg.reactions.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => handleToggleReaction(msg.id, r.emoji)}
                            className={`px-2 py-0.5 rounded-full text-[11px] flex items-center space-x-1 border transition-all active:scale-95 ${
                              r.hasReacted
                                ? 'bg-indigo-600/30 border-indigo-500/50 text-white font-semibold shadow-sm'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span className="text-[10px] font-mono">{r.count}</span>
                          </button>
                        ))}
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

          {/* ISOLATED PER-PARTICIPANT TYPING INDICATOR */}
          {isCurrentParticipantTyping && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="flex items-center space-x-2.5 p-3 max-w-sm rounded-2xl rounded-tl-sm bg-[#151620] border border-white/10 text-slate-400 shadow-md"
            >
              <AgentAvatar roleOrId={selectedParticipant.id} size="xs" />
              <span className="text-xs text-slate-300 font-medium">
                {selectedParticipant.name} is synthesizing
              </span>
              <div className="flex space-x-1 pl-1">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Modern Input Bar */}
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
              disabled={isCurrentParticipantTyping}
              rows={1}
              placeholder={`Direct message ${selectedParticipant.name}... (Press Enter to send, Shift+Enter for new line)`}
              className="flex-1 bg-transparent border-none text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none max-h-32 min-h-[42px] px-3 py-2.5 custom-scrollbar"
            />

            {/* Speech Dictation Button */}
            <button
              type="button"
              onClick={handleToggleDictation}
              className={`p-2.5 rounded-xl border transition-all active:scale-95 shrink-0 ${
                isDictatingInput
                  ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/30'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-400 hover:text-white'
              }`}
              title={isDictatingInput ? 'Stop Dictating' : 'Voice Dictate into Input (STT)'}
            >
              {isDictatingInput ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              id="messages-send-btn"
              type="submit"
              disabled={!inputMessage.trim() || isCurrentParticipantTyping}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white shadow-md transition-all active:scale-95 shrink-0"
              title="Send Message (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Right-click message for context menu</span>
            </span>
            <span className="font-mono text-indigo-400">Gemini Multi-Agent Mesh Active</span>
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
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      {selectedDeliverableModal.name || (selectedDeliverableModal as any).title || 'Deliverable Document'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Type: {selectedDeliverableModal.type || 'Document'} • Owner: {selectedDeliverableModal.owner || selectedDeliverableModal.authorName || 'Council'}
                    </p>
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
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-200 custom-scrollbar">
                {selectedDeliverableModal.content && (
                  <div>
                    <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Content & Verified Data
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 text-slate-200 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {selectedDeliverableModal.content}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 border-t border-white/10 bg-[#161824] flex items-center justify-between">
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Idempotency & Safe Mock Invariants Verified</span>
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

      {/* AI PROVENANCE INSPECTOR MODAL */}
      <AnimatePresence>
        {inspectingProvenanceModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#12131c] border border-emerald-500/30 rounded-2xl max-w-lg w-full flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#161824]">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      AI Model Provenance & Invariant Audit
                    </h3>
                    <p className="text-[10px] text-emerald-400 font-mono">
                      Safe Sandbox Invariant Verified
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setInspectingProvenanceModal(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 sm:p-5 space-y-3 text-xs text-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Inference Engine</span>
                    <span className="font-semibold text-white">{inspectingProvenanceModal.modelUsed || 'Gemini 2.5 Flash'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Intent Classification</span>
                    <span className="font-semibold text-indigo-300 capitalize">{inspectingProvenanceModal.intent || 'Conversation'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Clearance Gate</span>
                    <span className="font-semibold text-emerald-400">Constitutional Grade 5</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Safety & Mock Invariants</span>
                    <span className="font-semibold text-emerald-400">Enforced & Clean</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Message Preview</span>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-slate-300 font-mono text-[11px] max-h-36 overflow-y-auto custom-scrollbar">
                    {inspectingProvenanceModal.text}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 border-t border-white/10 bg-[#161824] flex items-center justify-end">
                <button
                  onClick={() => setInspectingProvenanceModal(null)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors"
                >
                  Close Audit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Real-time Voice Call Modal with Gemini Live Architecture */}
      <VoiceCallModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        initialAgentId={selectedParticipant.id}
        onSendToChat={(agentId, msg) => {
          setSelectedId(agentId);
          handleSendMessage(msg);
        }}
        onLaunchDirective={(topic) => {
          handleExecuteDirective(topic, `voice-${Date.now()}`);
        }}
      />
    </div>
  );
};
