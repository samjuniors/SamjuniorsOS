'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import {
  Sparkles,
  Send,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Shield,
  Layers,
  ChevronDown,
  ChevronRight,
  Info,
  CheckCircle2,
  BrainCircuit,
  Database,
  ArrowRight,
  ExternalLink,
  Bot,
  Pin,
  X,
  Link2,
} from 'lucide-react';
import {
  AdvisorStrategicInsight,
  AgentRole,
  AppId,
  EpistemicKnowledgeBreakdown,
  FounderAdvisorResponse,
  AdvisorTargetContext,
} from '@/types/os';
import { playOSSound } from '../os/IconHelper';
import { INITIAL_INITIATIVES, INITIAL_COMPANY_DECISIONS, SAMPLE_FINANCIAL_MODEL } from '@/lib/os-data';

export interface ChatMessage {
  id: string;
  sender: 'founder' | 'advisor';
  text: string;
  timestamp: string;
  responsePayload?: FounderAdvisorResponse;
  isLoading?: boolean;
  error?: string;
  attachedContext?: AdvisorTargetContext;
}

const STARTER_PROMPTS = [
  {
    title: 'Assess Q4 Financial Runway',
    subtitle: 'Evaluate burn rate against self-serve expansion model',
    query: 'Analyze our current runway, compute spend, and gross margin guardrails under the self-serve launch.',
    category: 'Economics',
  },
  {
    title: 'Review Pending Governance',
    subtitle: 'Check decisions requiring immediate Founder ratification',
    query: 'What pending decisions and attention items require my immediate review and ratification?',
    category: 'Governance',
  },
  {
    title: 'Research Radar Intel',
    subtitle: 'Synthesize Dr. Thorne’s latest model & agent benchmarks',
    query: 'Summarize the latest research findings from Dr. Aris Thorne and how they affect our product specs.',
    category: 'Intelligence',
  },
  {
    title: 'Challenge Strategic Assumptions',
    subtitle: 'Stress-test our multi-agent architecture assumptions',
    query: 'Critique our autonomous multi-agent operational assumptions and highlight the highest operational risks.',
    category: 'Strategy',
  },
];

interface AdvisorAppProps {
  soundEnabled?: boolean;
  onOpenApp?: (appId: AppId, directive?: string) => void;
  targetContext?: AdvisorTargetContext | null;
  onClearTargetContext?: () => void;
}

export const AdvisorApp: React.FC<AdvisorAppProps> = ({
  soundEnabled = true,
  onOpenApp,
  targetContext = null,
  onClearTargetContext,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showContextInspector, setShowContextInspector] = useState(false);
  const [activeEpistemicTab, setActiveEpistemicTab] = useState<Record<string, 'all' | 'facts' | 'inferences' | 'recommendations' | 'unknowns'>>({});
  const [activeContext, setActiveContext] = useState<AdvisorTargetContext | null>(targetContext);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync incoming target context prop when it changes
  useEffect(() => {
    if (targetContext) {
      setActiveContext(targetContext);
    }
  }, [targetContext]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSubmitting]);

  const handleSend = async (queryText?: string, explicitContext?: AdvisorTargetContext | null) => {
    const textToSend = (queryText || input).trim();
    if (!textToSend || isSubmitting) return;

    const currentContext = explicitContext !== undefined ? explicitContext : activeContext;

    if (soundEnabled) playOSSound('click');

    const userMsgId = `msg-user-${Date.now()}`;
    const advisorMsgId = `msg-advisor-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: 'founder',
      text: textToSend,
      timestamp,
      attachedContext: currentContext || undefined,
    };

    const newAdvisorLoadingMsg: ChatMessage = {
      id: advisorMsgId,
      sender: 'advisor',
      text: '',
      timestamp,
      isLoading: true,
      attachedContext: currentContext || undefined,
    };

    // Update conversation state with user message and loading bubble
    const updatedMessages = [...messages, newUserMsg];
    setMessages([...updatedMessages, newAdvisorLoadingMsg]);
    setInput('');
    setIsSubmitting(true);

    try {
      // Build conversation history for context
      const history = updatedMessages.map((m) => ({
        sender: m.sender,
        text: m.text || (m.responsePayload?.summary ? m.responsePayload.summary : ''),
      }));

      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          history,
          contextAttachment: currentContext || undefined,
        }),
      });

      const data: FounderAdvisorResponse = await res.json();

      if (soundEnabled) playOSSound('notification');

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === advisorMsgId
            ? {
                ...msg,
                isLoading: false,
                text: data.summary,
                responsePayload: data,
                error: data.success ? undefined : (data.error || 'Query failed'),
              }
            : msg
        )
      );
    } catch (err: any) {
      if (soundEnabled) playOSSound('notification');
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === advisorMsgId
            ? {
                ...msg,
                isLoading: false,
                text: 'Connection failed',
                error: err?.message || 'Failed to reach Founder Intelligence service.',
              }
            : msg
        )
      );
    } finally {
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearSession = () => {
    if (soundEnabled) playOSSound('click');
    setMessages([]);
  };

  const handleDetachContext = () => {
    setActiveContext(null);
    onClearTargetContext?.();
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0b0c10] text-slate-200 overflow-hidden select-text relative">
      {/* Top Navigation & Status Bar */}
      <div className="h-12 px-4 border-b border-white/10 bg-[#12131a]/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white tracking-wide">Founder Intelligence</span>
              <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-[9px] font-mono text-indigo-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span>Grounded Co-Pilot</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="advisor-context-toggle-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setShowContextInspector((prev) => !prev);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center space-x-1.5 ${
              showContextInspector
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Context Base</span>
          </button>

          <button
            id="advisor-clear-session-btn"
            onClick={handleClearSession}
            disabled={messages.length === 0}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Clear conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chat Stream */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto text-center my-auto py-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl"
              >
                <Sparkles className="w-7 h-7" />
              </motion.div>

              <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mb-2">
                Founder Strategic Intelligence
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mb-6 leading-relaxed">
                Your cognitive strategic advisor grounded in SamJuniors OS company state, active initiatives,
                unit economics, research radar, and governance decisions.
              </p>

              {/* Context-Grounded Spotlight Banner if activeContext is present */}
              {activeContext ? (
                <div className="w-full bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-5 text-left shadow-2xl space-y-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold uppercase">
                        HQ Context: {activeContext.category}
                      </span>
                      {activeContext.sourceEntityName && (
                        <span className="text-[10px] font-mono text-slate-400">
                          Source: {activeContext.sourceEntityName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleDetachContext}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono transition-colors"
                      title="Clear Context"
                    >
                      <span>Detach Context</span>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white leading-snug">{activeContext.title}</h3>
                    {activeContext.recommendation && (
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <strong className="text-indigo-300">Recommendation:</strong> {activeContext.recommendation}
                      </p>
                    )}
                    {activeContext.whyItMatters && (
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                        <strong className="text-slate-300">Context:</strong> {activeContext.whyItMatters}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Recommended Questions for Advisor:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(activeContext.suggestedQuestions || [
                        'Why is this happening?',
                        'What should I do?',
                        'What am I missing?',
                        'Is this recommendation actually correct?',
                      ]).map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(q, activeContext)}
                          className="px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/60 text-left text-xs text-indigo-200 hover:text-white transition-all flex items-center justify-between group"
                        >
                          <span className="truncate">{q}</span>
                          <ArrowRight className="w-3 h-3 text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-1.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Starter Query Cards */
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {STARTER_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      id={`advisor-starter-prompt-${idx}`}
                      onClick={() => handleSend(prompt.query)}
                      className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-left transition-all group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                            {prompt.title}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                            {prompt.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {prompt.subtitle}
                        </p>
                      </div>
                      <div className="flex items-center text-[10px] text-indigo-400 font-medium mt-3 group-hover:translate-x-0.5 transition-transform">
                        <span>Ask Advisor</span>
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'founder' ? 'items-end' : 'items-start'}`}
              >
                {/* Message Header */}
                <div className="flex items-center space-x-2 mb-1.5 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {msg.sender === 'founder' ? 'Founder' : 'Founder Intelligence'}
                  </span>
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                  {msg.attachedContext && (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-mono border border-indigo-500/30 flex items-center gap-1">
                      <Link2 className="w-2.5 h-2.5" />
                      <span>{msg.attachedContext.title}</span>
                    </span>
                  )}
                  {msg.responsePayload?.liveAi && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono">
                      Gemini Live
                    </span>
                  )}
                  {msg.responsePayload?.executionOutcome === 'unconfigured' && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono">
                      Safe Grounded Mode
                    </span>
                  )}
                </div>

                {/* Message Bubble */}
                {msg.sender === 'founder' ? (
                  <div className="max-w-2xl space-y-1.5 text-right">
                    <div className="inline-block text-left px-4 py-3 rounded-2xl rounded-tr-sm bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs sm:text-sm shadow-md leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-3xl space-y-4">
                    {msg.isLoading ? (
                      <div className="p-4 rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 flex items-center space-x-3 text-xs text-indigo-300 animate-pulse">
                        <Sparkles className="w-4 h-4 animate-spin" />
                        <span>Synthesizing company state, epistemic taxonomy & strategic reasoning...</span>
                      </div>
                    ) : msg.error ? (
                      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-3">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                        <div>
                          <div className="font-bold mb-1">Query Failed</div>
                          <div>{msg.error}</div>
                          <button
                            onClick={() => handleSend(messages[messages.length - 2]?.text)}
                            className="mt-2 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-medium transition-colors"
                          >
                            Retry Query
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 sm:p-6 rounded-2xl rounded-tl-sm bg-[#13141d] border border-white/10 shadow-xl space-y-5">
                        {/* Context provenance if present */}
                        {msg.attachedContext && (
                          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2 text-[11px] text-indigo-300">
                              <Link2 className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                              <span>
                                Grounded on HQ Context: <strong>{msg.attachedContext.title}</strong> ({msg.attachedContext.category})
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              Evidence: {msg.attachedContext.evidenceBasis || 'grounded'}
                            </span>
                          </div>
                        )}

                        {/* Executive Summary Card */}
                        {msg.responsePayload?.summary && (
                          <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                            <div className="flex items-center space-x-2 mb-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                                Executive Synthesis
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                              {msg.responsePayload.summary}
                            </p>
                          </div>
                        )}

                        {/* Detailed Markdown Analysis */}
                        {msg.responsePayload?.analysisMarkdown && (
                          <div className="markdown-body prose prose-invert prose-xs sm:prose-sm max-w-none text-slate-300 leading-relaxed space-y-2 border-b border-white/10 pb-4">
                            <Markdown>{msg.responsePayload.analysisMarkdown}</Markdown>
                          </div>
                        )}

                        {/* Epistemic Knowledge Breakdown */}
                        {msg.responsePayload?.epistemicBreakdown && (
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Shield className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                  Epistemic Knowledge Taxonomy
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500">
                                Grounded Separation of Truth
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {/* FACTS */}
                              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                                <div className="flex items-center space-x-1.5 mb-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <span className="text-[10px] font-bold uppercase text-emerald-400">
                                    Facts (Company Records)
                                  </span>
                                </div>
                                <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                                  {msg.responsePayload.epistemicBreakdown.facts.length > 0 ? (
                                    msg.responsePayload.epistemicBreakdown.facts.map((fact, fIdx) => (
                                      <li key={fIdx}>{fact}</li>
                                    ))
                                  ) : (
                                    <li className="text-slate-500 italic">No specific metric facts cited</li>
                                  )}
                                </ul>
                              </div>

                              {/* INFERENCES */}
                              <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
                                <div className="flex items-center space-x-1.5 mb-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                  <span className="text-[10px] font-bold uppercase text-indigo-400">
                                    Inferences (Logical Deductions)
                                  </span>
                                </div>
                                <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                                  {msg.responsePayload.epistemicBreakdown.inferences.length > 0 ? (
                                    msg.responsePayload.epistemicBreakdown.inferences.map((inf, iIdx) => (
                                      <li key={iIdx}>{inf}</li>
                                    ))
                                  ) : (
                                    <li className="text-slate-500 italic">Direct correlation only</li>
                                  )}
                                </ul>
                              </div>

                              {/* RECOMMENDATIONS */}
                              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20">
                                <div className="flex items-center space-x-1.5 mb-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  <span className="text-[10px] font-bold uppercase text-amber-400">
                                    Recommendations (Founder Actions)
                                  </span>
                                </div>
                                <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                                  {msg.responsePayload.epistemicBreakdown.recommendations.length > 0 ? (
                                    msg.responsePayload.epistemicBreakdown.recommendations.map((rec, rIdx) => (
                                      <li key={rIdx}>{rec}</li>
                                    ))
                                  ) : (
                                    <li className="text-slate-500 italic">No explicit actions required</li>
                                  )}
                                </ul>
                              </div>

                              {/* UNKNOWNS / UNCERTAINTIES */}
                              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/20">
                                <div className="flex items-center space-x-1.5 mb-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                  <span className="text-[10px] font-bold uppercase text-purple-400">
                                    Unknowns (Missing / Unmeasured Data)
                                  </span>
                                </div>
                                <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                                  {msg.responsePayload.epistemicBreakdown.unknowns.length > 0 ? (
                                    msg.responsePayload.epistemicBreakdown.unknowns.map((unk, uIdx) => (
                                      <li key={uIdx}>{unk}</li>
                                    ))
                                  ) : (
                                    <li className="text-slate-500 italic">Context sufficient for evaluation</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Strategic Insight Cards */}
                        {msg.responsePayload?.strategicInsights && msg.responsePayload.strategicInsights.length > 0 && (
                          <div className="space-y-2.5 pt-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                              Strategic Implications
                            </span>
                            <div className="grid grid-cols-1 gap-2">
                              {msg.responsePayload.strategicInsights.map((insight) => (
                                <div
                                  key={insight.id}
                                  className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-white">{insight.title}</span>
                                    <span
                                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                                        insight.severity === 'Critical'
                                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                          : insight.severity === 'High'
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      }`}
                                    >
                                      {insight.severity} • {insight.category}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-300 mb-2">{insight.summary}</p>
                                  <div className="p-2 rounded bg-black/40 border border-white/5 text-[10px] text-indigo-300 flex items-center space-x-1.5">
                                    <span className="font-bold text-white">Suggested Action:</span>
                                    <span>{insight.suggestedAction}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Suggested Follow-up Prompts */}
                        {msg.responsePayload?.suggestedFollowUpPrompts && msg.responsePayload.suggestedFollowUpPrompts.length > 0 && (
                          <div className="pt-3 border-t border-white/10 space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              Recommended Follow-Up Inquiries
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {msg.responsePayload.suggestedFollowUpPrompts.map((prompt, pIdx) => (
                                <button
                                  key={pIdx}
                                  id={`advisor-followup-${pIdx}`}
                                  onClick={() => handleSend(prompt)}
                                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-xs text-slate-200 hover:text-indigo-300 transition-all text-left flex items-center space-x-1.5"
                                >
                                  <span>{prompt}</span>
                                  <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Expandable Context Base Drawer */}
        <AnimatePresence>
          {showContextInspector && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="w-80 border-l border-white/10 bg-[#0f1017] p-4 flex flex-col justify-between overflow-y-auto custom-scrollbar shrink-0 text-xs z-10"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-white">Active Company Context</span>
                  </div>
                  <button
                    onClick={() => setShowContextInspector(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    Close
                  </button>
                </div>

                {/* Company Metrics */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Unit Economics</span>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">MRR:</span>
                      <span className="font-mono font-bold text-white">${SAMPLE_FINANCIAL_MODEL.mrr.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross Margin:</span>
                      <span className="font-mono font-bold text-emerald-400">{SAMPLE_FINANCIAL_MODEL.grossMargin}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Runway:</span>
                      <span className="font-mono font-bold text-white">{SAMPLE_FINANCIAL_MODEL.runwayMonths} months</span>
                    </div>
                  </div>
                </div>

                {/* Active Initiatives */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Strategic OKRs</span>
                  <div className="space-y-1.5">
                    {INITIAL_INITIATIVES.map((init) => (
                      <div key={init.id} className="p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="font-semibold text-white truncate">{init.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{init.currentObjective}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pending Governance */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Pending Governance</span>
                  <div className="space-y-1.5">
                    {INITIAL_COMPANY_DECISIONS.filter((d) => d.status === 'pending_approval').map((dec) => (
                      <div key={dec.id} className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="font-semibold text-amber-300 truncate">{dec.title}</div>
                        <div className="text-[10px] text-slate-300">{dec.category} • Rec: {dec.recommendedBy}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 text-[10px] text-slate-500 text-center">
                Single Source of Truth • Unified with Company HQ
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Message Input Bar */}
      <div className="p-3 sm:p-4 bg-[#12131a] border-t border-white/10 shrink-0 space-y-2">
        {/* Active Context Dock Bar */}
        {activeContext && (
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs">
            <div className="flex items-center space-x-2 text-indigo-200">
              <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-[11px] font-medium truncate">
                Context Attached: <strong>{activeContext.title}</strong>
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 uppercase">
                {activeContext.category}
              </span>
            </div>

            <div className="flex items-center space-x-1.5 overflow-x-auto custom-scrollbar shrink-0">
              {['Why is this happening?', 'What should I do?', 'What am I missing?', 'Is this recommendation correct?'].map((quickQ, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(quickQ, activeContext)}
                  className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-[10px] text-indigo-200 hover:text-white border border-indigo-500/30 whitespace-nowrap transition-colors"
                >
                  {quickQ}
                </button>
              ))}
              <button
                type="button"
                onClick={handleDetachContext}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Detach context"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="max-w-4xl mx-auto flex items-end space-x-2"
        >
          <div className="flex-1 relative rounded-xl bg-black/50 border border-white/15 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
            <textarea
              ref={inputRef}
              id="advisor-query-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              placeholder={
                activeContext
                  ? `Ask Advisor about "${activeContext.title.slice(0, 30)}..."`
                  : 'Ask Founder Intelligence about company state, strategic trade-offs, unit economics...'
              }
              rows={1}
              className="w-full px-3.5 py-3 bg-transparent border-none text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none max-h-32 min-h-[44px]"
            />
          </div>

          <button
            id="advisor-submit-btn"
            type="submit"
            disabled={!input.trim() || isSubmitting}
            className="h-11 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:pointer-events-none active:scale-95"
          >
            {isSubmitting ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ask</span>
              </>
            )}
          </button>
        </form>
        <div className="max-w-4xl mx-auto mt-1 flex items-center justify-between text-[10px] text-slate-500 px-1">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>Epistemic Grounding Model Active</span>
        </div>
      </div>
    </div>
  );
};
