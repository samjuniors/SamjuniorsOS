'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  User,
  MessageSquare,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Send,
  Zap,
  Lock,
  ExternalLink,
  Target,
  FileCheck,
  Award,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { AIAgent, ExecutionDeliverable, OutputProvenance } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface EmployeeProfileViewProps {
  agent: AIAgent;
  allAgents: AIAgent[];
  onSelectAgent: (agentId: string) => void;
  deliverables: ExecutionDeliverable[];
  onSendMessage: (message: string) => Promise<string>;
  onInspectDeliverable: (d: ExecutionDeliverable) => void;
}

export const EmployeeProfileView: React.FC<EmployeeProfileViewProps> = ({
  agent,
  allAgents,
  onSelectAgent,
  deliverables,
  onSendMessage,
  onInspectDeliverable,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'chat' | 'tasks' | 'deliverables' | 'permissions' | 'audit'>('overview');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string; time: string }>>([
    {
      sender: 'agent',
      text: `Hello Founder, I am ${agent.name}, your ${agent.role}. I am currently focused on "${agent.currentTask}". How can I support our company objectives today?`,
      time: 'Just now',
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [selectedEvidenceDeliverable, setSelectedEvidenceDeliverable] = useState<ExecutionDeliverable | null>(null);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSending) return;

    const userText = chatInput.trim();
    setChatInput('');
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText, time: timeNow }]);
    setIsSending(true);

    try {
      const reply = await onSendMessage(userText);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: reply || `Acknowledged. I have recorded your directive and will coordinate with the council.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: `I received your message. I am synthesizing the recommendation based on verified data.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const agentDeliverables = deliverables.filter(
    (d) =>
      d.authorAgentId === agent.id ||
      d.owner?.toLowerCase().includes(agent.name.toLowerCase().split(' ')[0]) ||
      d.authorName?.toLowerCase().includes(agent.name.toLowerCase().split(' ')[0]) ||
      d.authorName?.toLowerCase().includes(agent.role.toLowerCase().split(' ')[0])
  );

  return (
    <div className="space-y-4">
      {/* Employee Selector Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1">
        {allAgents.map((a) => {
          const isSelected = a.id === agent.id;
          return (
            <button
              key={a.id}
              onClick={() => onSelectAgent(a.id)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md scale-105'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-white/10'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md bg-gradient-to-br ${a.avatarColor} flex items-center justify-center text-white text-[10px]`}
              >
                {a.name.charAt(0)}
              </div>
              <span>{a.name}</span>
              <span className="text-[10px] opacity-75 font-normal">({a.role.split(' ')[0]})</span>
            </button>
          );
        })}
      </div>

      {/* Main Profile Card */}
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
        {/* Profile Header */}
        <div className="p-5 bg-gradient-to-r from-slate-800/80 to-slate-900/80 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div
              className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${agent.avatarColor} flex items-center justify-center text-white font-bold text-2xl shadow-xl border border-white/20`}
            >
              {agent.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">{agent.name}</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active Officer
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">{agent.role}</p>
              <p className="text-[11px] text-slate-400">{agent.department}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveSubTab('chat')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Direct Chat</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation */}
        <div className="px-5 border-b border-white/10 bg-black/20 flex items-center space-x-1 overflow-x-auto text-xs">
          {[
            { id: 'overview', label: 'Executive Overview', icon: User },
            { id: 'chat', label: 'Direct Chat', icon: MessageSquare },
            { id: 'tasks', label: 'Work & Tasks', icon: Target },
            { id: 'deliverables', label: `Deliverables (${agentDeliverables.length})`, icon: FileText },
            { id: 'permissions', label: 'Capability Boundaries', icon: Lock },
            { id: 'audit', label: 'Audit & Provenance', icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`py-3 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                  active
                    ? 'border-blue-400 text-blue-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sub Tab Content */}
        <div className="p-5">
          {activeSubTab === 'overview' && (
            <div className="space-y-4">
              {/* Bio & Focus */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-3">
                  <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Executive Mandate
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed">{agent.bio}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/15 space-y-2">
                    <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider block">
                      Current Operational Focus
                    </span>
                    <p className="text-xs text-blue-100 font-medium leading-relaxed">{agent.currentTask}</p>
                  </div>
                </div>

                {/* Core Responsibilities */}
                <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Core Responsibilities
                  </span>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {(agent.responsibilities || agent.goals || []).map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span className="leading-snug">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Skills & Tools */}
              <div className="p-4 rounded-xl bg-black/20 border border-white/5 space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Domain Specializations & Reasoning Modules
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(agent.skills || agent.capabilities || []).map((skill, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-mono"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'chat' && (
            <div className="space-y-3">
              <div className="h-72 overflow-y-auto rounded-xl bg-black/40 border border-white/10 p-4 space-y-3">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-none'
                          : 'bg-slate-800 text-slate-200 border border-white/10 rounded-tl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 px-1">{msg.time}</span>
                  </div>
                ))}
                {isSending && (
                  <div className="flex items-center space-x-2 text-xs text-slate-400 italic">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                    <span>{agent.name} is synthesizing response...</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Ask ${agent.name.split(' ')[0]} for strategic analysis, updates, or clarifications...`}
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isSending || !chatInput.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

          {activeSubTab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active & Recent Task Delegations</span>
                <span className="font-mono text-emerald-400">Safe Sandbox Active</span>
              </div>
              <div className="space-y-2">
                {(
                  agent.tasks ||
                  agent.taskQueue?.map((t) => ({
                    id: t.id,
                    title: t.title,
                    priority: t.priority.toLowerCase(),
                    description: t.inputDescription,
                    status: t.status,
                  })) ||
                  []
                ).map((task) => (
                  <div
                    key={task.id}
                    className="bg-black/30 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">{task.title}</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            task.priority === 'urgent' || task.priority === 'critical'
                              ? 'bg-rose-500/20 text-rose-300'
                              : task.priority === 'high'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {task.priority.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{task.description}</p>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                      {task.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === 'deliverables' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Documents & Specifications Authored by {agent.name}</span>
                <span className="font-mono">{agentDeliverables.length} Deliverable(s)</span>
              </div>

              {agentDeliverables.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No deliverables authored yet for this employee in current session.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {agentDeliverables.map((d, idx) => (
                    <div
                      key={d.id || `${d.name}-${idx}`}
                      className="bg-black/30 border border-white/10 rounded-xl p-3.5 hover:border-blue-500/30 transition-all space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                            {(d.type || 'Deliverable').toUpperCase()}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{d.updatedAt || 'Today'}</span>
                        </div>
                        <h4 className="text-xs font-bold text-white">{d.name}</h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2">{d.content}</p>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <button
                          onClick={() => setSelectedEvidenceDeliverable(d)}
                          className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                        >
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>Audit</span>
                        </button>
                        <button
                          onClick={() => onInspectDeliverable(d)}
                          className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium transition-colors"
                        >
                          Read Document
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'permissions' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Autonomous Authority & Safety Boundaries
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* CAN */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      What {agent.name.split(' ')[0]} CAN Do Autonomously:
                    </span>
                    <ul className="space-y-1 text-slate-300 text-[11px]">
                      <li>• Synthesize and draft comprehensive strategic documents</li>
                      <li>• Decompose directives into verified execution plans</li>
                      <li>• Benchmark competitor pricing and developer sentiment</li>
                      <li>• Model unit economics, pricing tiers, and margin floors</li>
                      <li>• Inspect and peer-review council outputs</li>
                    </ul>
                  </div>

                  {/* CANNOT */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-rose-400 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      What Requires Explicit Founder Sign-Off:
                    </span>
                    <ul className="space-y-1 text-slate-300 text-[11px]">
                      <li>• Irreversible financial transfers or budget threshold increases</li>
                      <li>• Production code deployments to live enterprise clusters</li>
                      <li>• Public press releases and external marketing broadcasts</li>
                      <li>• Modifying constitutional agent safety rules</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'audit' && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2 font-mono text-[11px]">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Agent Identifier:</span>
                  <span className="text-white">{agent.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Underlying Model:</span>
                  <span className="text-emerald-400">{agent.model || 'Gemini 2.5 Flash'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Safety Execution Mode:</span>
                  <span className="text-blue-300">Deterministic Safe Mock Sandbox</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Hallucination Guardrail:</span>
                  <span className="text-emerald-400">Active (Empirical Grounding Mandate)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Audit Status:</span>
                  <span className="text-emerald-400">100% SLA Nominal</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedEvidenceDeliverable && (
        <EvidenceModal
          isOpen={!!selectedEvidenceDeliverable}
          onClose={() => setSelectedEvidenceDeliverable(null)}
          title={selectedEvidenceDeliverable.name}
          provenance={selectedEvidenceDeliverable.provenance}
          sourceText={selectedEvidenceDeliverable.content}
          details={`Authored by ${agent.name} as part of Company Deliverables.`}
        />
      )}
    </div>
  );
};
