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
  MessageSquare
} from 'lucide-react';
import { AppId, AgentRole } from '@/types/os';
import { INITIAL_AGENTS } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';

export type ParticipantId = 'advisor' | AgentRole;

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
      'Coordinate a rapid review across Research and Product.',
      'Check SLA adherence for active deliverables.',
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
      'What recent frontier model releases should we track?',
      'Analyze competitor agent pricing and monetization models.',
      'What are the key technical moat opportunities for our OS?',
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
      'How should we spec the enterprise audit log feature?',
      'What are the core acceptance criteria for self-serve sign-up?',
      'Review the UX friction points in our onboarding flow.',
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
      'What is our projected compute cost per active user session?',
      'Stress-test gross margins if model inference latency drops 50%.',
      'How does the $149/mo Pro tier affect our unit economics?',
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
      },
    ],
    researcher: [],
    pm: [],
    finance: [],
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
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
    <div className="h-full w-full flex bg-[#0c0d12] text-slate-200 overflow-hidden select-text text-xs">
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
                <span>5 Participants Active</span>
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
          <span className="text-emerald-400 font-mono">Neural Bus Active</span>
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
                onClick={() => onOpenApp?.('advisor')}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open deep strategic advisor"
              >
                <span>Full Advisor App</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            ) : (
              <button
                onClick={() => onOpenApp?.('workforce')}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="View in Company Headquarters"
              >
                <span>Company HQ</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            <button
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
                  Quick Topics
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
                  className={`flex flex-col ${isFounder ? 'items-end' : 'items-start'} space-y-1`}
                >
                  {/* Sender Name & Meta */}
                  <div className="flex items-center space-x-2 text-[10px] px-1 text-slate-400">
                    <span className="font-semibold text-slate-300">
                      {isFounder ? 'Founder' : selectedParticipant.name}
                    </span>
                    <span>{msg.timestamp}</span>
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

                    {/* Error / Retry banner if failure */}
                    {msg.status === 'error' && (
                      <div className="mt-2 pt-2 border-t border-rose-500/20 flex items-center justify-between text-rose-300 text-xs">
                        <div className="flex items-center space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{msg.errorMessage || 'Failed to deliver message.'}</span>
                        </div>
                        <button
                          onClick={() => handleSendMessage(msg.text)}
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
              placeholder={`Direct message ${selectedParticipant.name}... (Enter to send, Shift+Enter for new line)`}
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
            <span>Direct agent link • Sandboxed session</span>
            <span>Gemini Neural Mesh Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
