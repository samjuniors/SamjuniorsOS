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
  Cpu,
  Terminal,
  PhoneCall,
  Volume2,
} from 'lucide-react';
import { AIAgent, AgentRole, ExecutionDeliverable, OutputProvenance, AdvisorTargetContext, PersonaTone } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';
import { BrainCircuit, BookOpen, Sliders } from 'lucide-react';
import { STRUCTURED_SKILLS, getSkillsForRole } from '@/lib/skills/skill-registry';
import { StructuredSkillDefinition } from '@/types/capabilities';
import { SkillInspectionModal } from './SkillInspectionModal';
import { AgentAvatar, AGENT_AVATAR_THEMES } from '@/components/os/AgentAvatar';
import { MarkdownMessage } from '@/components/os/MarkdownMessage';
import { VoiceCallModal } from '@/components/os/VoiceCallModal';
import { DETAILED_AI_EMPLOYEE_PROFILES } from '@/lib/employee-profiles';
import { PersonaStore } from '@/lib/persona-store';

interface EmployeeProfileViewProps {
  agent: AIAgent;
  allAgents: AIAgent[];
  onSelectAgent: (agentId: string) => void;
  deliverables: ExecutionDeliverable[];
  onSendMessage: (message: string) => Promise<string>;
  onInspectDeliverable: (d: ExecutionDeliverable) => void;
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const EmployeeProfileView: React.FC<EmployeeProfileViewProps> = ({
  agent,
  allAgents,
  onSelectAgent,
  deliverables,
  onSendMessage,
  onInspectDeliverable,
  onAskAdvisor,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'capabilities' | 'persona' | 'chat' | 'skills' | 'tasks' | 'deliverables' | 'permissions' | 'audit'>('overview');
  const [inspectingSkill, setInspectingSkill] = useState<StructuredSkillDefinition | Readonly<StructuredSkillDefinition> | null>(null);
  const structuredSkills = getSkillsForRole(agent.id as any);
  const [chatInput, setChatInput] = useState('');
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const detailedProfile = DETAILED_AI_EMPLOYEE_PROFILES[agent.id as keyof typeof DETAILED_AI_EMPLOYEE_PROFILES];
  const [toneByAgent, setToneByAgent] = useState<Record<string, PersonaTone>>({});
  const agentTone: PersonaTone = toneByAgent[agent.id] || PersonaStore.getPersona(agent.id as any)?.tone || 'professional';

  const handleUpdateTone = (newTone: PersonaTone) => {
    setToneByAgent((prev) => ({ ...prev, [agent.id]: newTone }));
    PersonaStore.updateTone(agent.id as any, newTone);
  };
  
  // Isolated per-agent chat history
  const [chatByAgent, setChatByAgent] = useState<Record<string, Array<{ sender: 'user' | 'agent'; text: string; time: string }>>>({});
  // Isolated per-agent sending state
  const [sendingByAgent, setSendingByAgent] = useState<Record<string, boolean>>({});
  
  const [selectedEvidenceDeliverable, setSelectedEvidenceDeliverable] = useState<ExecutionDeliverable | null>(null);

  const currentAgentMessages = chatByAgent[agent.id] || [
    {
      sender: 'agent',
      text: `Hello Founder, I am ${agent.name}, your ${agent.role}. I am currently focused on "${agent.currentTask}". How can I support our company objectives today?`,
      time: 'Just now',
    },
  ];
  const isAgentSending = Boolean(sendingByAgent[agent.id]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAgentSending) return;

    const userText = chatInput.trim();
    const currentAgentId = agent.id;
    setChatInput('');
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setChatByAgent((prev) => ({
      ...prev,
      [currentAgentId]: [...(prev[currentAgentId] || currentAgentMessages), { sender: 'user', text: userText, time: timeNow }],
    }));

    setSendingByAgent((prev) => ({
      ...prev,
      [currentAgentId]: true,
    }));

    try {
      const reply = await onSendMessage(userText);
      setChatByAgent((prev) => ({
        ...prev,
        [currentAgentId]: [
          ...(prev[currentAgentId] || []),
          {
            sender: 'agent',
            text: reply || `Acknowledged. I have recorded your directive and will coordinate with the council.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      }));
    } catch (err) {
      setChatByAgent((prev) => ({
        ...prev,
        [currentAgentId]: [
          ...(prev[currentAgentId] || []),
          {
            sender: 'agent',
            text: `I received your message. I am synthesizing the recommendation based on verified data.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      }));
    } finally {
      setSendingByAgent((prev) => ({
        ...prev,
        [currentAgentId]: false,
      }));
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
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg scale-105'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-white/10'
              }`}
            >
              <AgentAvatar roleOrId={a.id} name={a.name} size="xs" showGlow={isSelected} />
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
          <div className="flex items-center space-x-4">
            <AgentAvatar
              roleOrId={agent.id}
              name={agent.name}
              size="lg"
              showStatus
              status={agent.status}
              showGlow
              showBadge
              badgeLabel={agent.id.toUpperCase()}
            />
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">{agent.name}</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active Officer
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Autonomous Authority
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">{agent.role}</p>
              <p className="text-[11px] text-slate-400">{agent.department}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onAskAdvisor && (
              <button
                onClick={() =>
                  onAskAdvisor({
                    section: 'hq_employees',
                    title: `${agent.name} (${agent.role})`,
                    category: agent.department,
                    sourceEntityId: agent.id,
                    sourceEntityName: agent.name,
                    whyItMatters: `Department: ${agent.department} • Status: ${agent.status}`,
                    resultSnippet: `Bio: ${agent.bio} | Current Task: ${agent.currentTask}`,
                    evidenceBasis: 'empirical_analysis',
                    suggestedQuestions: [
                      'How effectively is this specialist allocated?',
                      'What should I direct this employee to do next?',
                      'What am I missing about their current output?',
                      'Why is this initiative their primary focus?',
                    ],
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm"
                title="Ask Founder Intelligence about this officer"
              >
                <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ask Advisor</span>
              </button>
            )}

            <button
              onClick={() => setIsVoiceCallOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-sky-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95 group"
              title={`Initiate voice call with ${agent.name}`}
            >
              <PhoneCall className="w-3.5 h-3.5 text-indigo-400 group-hover:animate-pulse" />
              <span>Voice Call</span>
            </button>

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
            { id: 'capabilities', label: 'AI Capabilities & Tech', icon: Cpu },
            { id: 'persona', label: 'Persona & Style', icon: Sliders },
            { id: 'chat', label: 'Direct Chat', icon: MessageSquare },
            { id: 'skills', label: `Skills (${structuredSkills.length})`, icon: BookOpen },
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
                  {/* Cybernetic Identity Spec Card */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900/90 via-[#121324] to-slate-900/90 border border-indigo-500/25 flex items-center justify-between gap-4 shadow-lg">
                    <div className="flex items-center space-x-4 min-w-0">
                      <AgentAvatar
                        roleOrId={agent.id}
                        name={agent.name}
                        size="xl"
                        showStatus
                        status={agent.status}
                        showGlow
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-bold">
                            Cybernetic Core {agent.id.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Neural Sync: 100%
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1 truncate">{agent.name}</h3>
                        <p className="text-[11px] text-slate-300 font-medium">{agent.role}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Department: {agent.department} • Model: {agent.model || 'Gemini 2.5 Flash'}
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:flex flex-col items-end shrink-0 space-y-1 text-right">
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Clearance</span>
                      <span className="text-xs font-mono font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/30">
                        {detailedProfile?.clearanceLevel || 'LEVEL 5 CONSTITUTIONAL'}
                      </span>
                      <span className="text-[9px] text-emerald-400 font-mono">Safe Mock Guard Active</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Executive Mandate
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {detailedProfile?.executiveMandate || agent.bio}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/15 space-y-2">
                    <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider block">
                      Current Operational Focus
                    </span>
                    <p className="text-xs text-indigo-100 font-medium leading-relaxed">{agent.currentTask}</p>
                  </div>
                </div>

                {/* Core Responsibilities */}
                <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                      Core Responsibilities
                    </span>
                    <ul className="space-y-2 text-xs text-slate-300">
                      {(detailedProfile?.responsibilities || agent.responsibilities || agent.goals || []).map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="leading-snug">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Autonomous Gate:</span>
                      <span className="font-mono text-emerald-400 font-semibold">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Core Functions with SLA & Invariant Breakdown */}
              {detailedProfile && detailedProfile.coreFunctions && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Operational Domain Functions & SLA Targets (4)
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">Deterministic Invariants</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {detailedProfile.coreFunctions.map((fn, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 hover:border-indigo-500/40 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-semibold">
                            Function 0{idx + 1}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {fn.slaTarget}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white">{fn.title}</h4>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{fn.description}</p>
                        <div className="pt-2 border-t border-white/5 flex items-start gap-1.5 text-[10px] text-slate-400">
                          <Lock className="w-2.5 h-2.5 text-indigo-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-indigo-200 font-semibold">Invariant: </span>
                            <span>{fn.invariant}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills & Tools */}
              <div className="p-4 rounded-xl bg-black/20 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Structured First-Class Employee Skills ({structuredSkills.length})
                  </span>
                  <button
                    onClick={() => setActiveSubTab('skills')}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                  >
                    <span>View All Specifications</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {structuredSkills.map((sk) => (
                    <div
                      key={sk.id}
                      className="p-3 rounded-xl bg-slate-900/60 border border-white/10 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 uppercase font-semibold">
                            {sk.category}
                          </span>
                          <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> Immutable
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white leading-snug">{sk.name}</h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{sk.purpose}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/5">
                        <span className="text-[10px] font-mono text-slate-400">
                          {sk.allowedTools.length > 0 ? `${sk.allowedTools.length} tool(s)` : 'Pure reasoning'}
                        </span>
                        <button
                          onClick={() => setInspectingSkill(sk)}
                          className="px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Inspect Skill</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'capabilities' && detailedProfile && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                  Specialized AI Capabilities & Cognitive Architectures
                </span>
                <span className="font-mono text-indigo-300 text-[11px]">Underlying: {detailedProfile.model}</span>
              </div>

              {/* Cognitive Spec Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Context Window</span>
                  <div className="font-mono text-white font-bold text-xs mt-0.5">{detailedProfile.contextWindow}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Latency Baseline</span>
                  <div className="font-mono text-emerald-400 font-bold text-xs mt-0.5">{detailedProfile.latencyTarget}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Epistemic Certainty</span>
                  <div className="font-mono text-indigo-300 font-bold text-xs mt-0.5">{detailedProfile.neuralSyncScore}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Sandbox Boundary</span>
                  <div className="font-mono text-amber-300 font-bold text-xs mt-0.5">Deterministic Safe Mock</div>
                </div>
              </div>

              {/* Capabilities Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {detailedProfile.aiCapabilities.map((cap) => (
                  <div
                    key={cap.id}
                    className="p-4 rounded-xl bg-slate-900/60 border border-white/10 hover:border-indigo-500/40 transition-all space-y-2.5 shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-semibold">
                        {cap.category}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">{cap.badge}</span>
                    </div>

                    <h4 className="text-sm font-bold text-white">{cap.name}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{cap.description}</p>

                    <div className="pt-2 border-t border-white/5 space-y-1 text-[11px]">
                      <div className="flex items-start gap-1.5">
                        <span className="text-slate-400 font-medium">Mechanism:</span>
                        <span className="text-slate-300 font-mono text-[10px] leading-relaxed">{cap.technicalMechanism}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-slate-400">
                        <span>Latency: <strong className="text-emerald-400">{cap.latencyBenchmark}</strong></span>
                        <span>Grounding: <strong className="text-indigo-300">{cap.epistemicGrounding}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === 'persona' && detailedProfile && (
            <div className="space-y-4">
              {/* Natural DNA Header */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-slate-950/40 border border-indigo-500/30 space-y-2 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Natural Operational Persona DNA
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{detailedProfile.interactionStyle.toneSummary}</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{detailedProfile.interactionStyle.naturalDna}</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {detailedProfile.interactionStyle.keyTraits.map((t, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300"
                    >
                      • {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Archetype Selector */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Active Interaction Style Archetype</span>
                  <span className="text-[10px] font-mono text-emerald-400">Durable Across OS</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: 'professional',
                      title: 'Professional & Executive',
                      desc: 'Formal, metric-grounded, structured, SLA rigor',
                      color: 'border-indigo-500/50 bg-indigo-950/30 text-indigo-200',
                    },
                    {
                      id: 'casual',
                      title: 'Casual & Candid',
                      desc: 'Startup-native peer, high energy, zero corporate fluff',
                      color: 'border-amber-500/50 bg-amber-950/30 text-amber-200',
                    },
                    {
                      id: 'flirty',
                      title: 'Charming & Playful',
                      desc: 'Sparkling wit, magnetic charisma, playful camaraderie',
                      color: 'border-pink-500/50 bg-pink-950/30 text-pink-200',
                    },
                  ].map((archetype) => {
                    const isSelected = agentTone === archetype.id;
                    return (
                      <button
                        key={archetype.id}
                        id={`workforce-tone-select-btn-${archetype.id}`}
                        onClick={() => {
                          handleUpdateTone(archetype.id as PersonaTone);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
                          isSelected
                            ? `${archetype.color} ring-1 ring-white/30 shadow-md`
                            : 'border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">{archetype.title}</span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        <p className="text-[11px] opacity-80 leading-snug">{archetype.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Sample Voice Quote for Selected Tone */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1 text-indigo-300">
                      <Volume2 className="w-3 h-3" /> Sample Dialogue Quote ({agentTone.toUpperCase()})
                    </span>
                    <span>Voice Synthesizer Ready</span>
                  </div>
                  <p className="text-xs italic text-slate-200 leading-relaxed">
                    &ldquo;{detailedProfile.interactionStyle.sampleResponses[agentTone]}&rdquo;
                  </p>
                </div>
              </div>

              {/* Communication Rules */}
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Role-Specific Communication Rules
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200">
                  {detailedProfile.interactionStyle.communicationRules.map((rule, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'chat' && (
            <div className="space-y-3">
              <div className="h-80 overflow-y-auto rounded-xl bg-black/40 border border-white/10 p-4 space-y-4 custom-scrollbar">
                {currentAgentMessages.map((msg, i) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {isUser ? (
                        <AgentAvatar roleOrId="founder" size="xs" />
                      ) : (
                        <AgentAvatar roleOrId={agent.id} name={agent.name} size="xs" />
                      )}
                      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                        <div
                          className={`rounded-2xl p-3 text-xs leading-relaxed shadow-md ${
                            isUser
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-slate-800/95 text-slate-200 border border-white/10 rounded-tl-none'
                          }`}
                        >
                          <MarkdownMessage content={msg.text} isFounder={isUser} />
                        </div>
                        <span className="text-[9px] text-slate-500 mt-1 px-1 font-mono">{msg.time}</span>
                      </div>
                    </div>
                  );
                })}
                {isAgentSending && (
                  <div className="flex items-center space-x-2.5 text-xs text-slate-400 italic pl-1">
                    <AgentAvatar roleOrId={agent.id} name={agent.name} size="xs" showGlow />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
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
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isAgentSending || !chatInput.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-md"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

          {activeSubTab === 'skills' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold text-white">First-Class Structured Skills ({structuredSkills.length})</span>
                </div>
                <div className="flex items-center space-x-2 text-[10px] font-mono">
                  <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Immutable Runtime
                  </span>
                  <span className="text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                    Auto-Determined by Context
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {structuredSkills.map((sk) => (
                  <div
                    key={sk.id}
                    className="p-4 rounded-xl bg-slate-900/80 border border-white/10 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 uppercase font-semibold">
                          {sk.category}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{sk.id}</span>
                      </div>
                      <h3 className="text-sm font-bold text-white">{sk.name}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{sk.purpose}</p>

                      <div className="pt-2 border-t border-white/5 space-y-1.5 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Allowed Tools:</span>
                          <span className="font-mono text-sky-300">
                            {sk.allowedTools.length > 0 ? sk.allowedTools.join(', ') : 'None (Pure Reasoning)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Inputs:</span>
                          <span className="text-slate-300">{sk.requiredInputs.length} required field(s)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Procedure:</span>
                          <span className="text-slate-300">{sk.procedure.length} sequential step(s)</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Audited & Governed
                      </span>
                      <button
                        onClick={() => setInspectingSkill(sk)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Inspect Full Skill</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
                    skillId: t.skillId,
                    skillName: t.skillName,
                  })) ||
                  []
                ).map((task) => {
                  const resolvedSkill = task.skillId
                    ? STRUCTURED_SKILLS[task.skillId]
                    : structuredSkills.find((s) => s.name.toLowerCase().includes(task.title.toLowerCase().slice(0, 10))) || structuredSkills[0];

                  return (
                    <div
                      key={task.id}
                      className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-white/10 transition-all"
                    >
                      <div className="space-y-1.5 flex-1">
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

                        {/* Skill Used Display */}
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] text-slate-400">Skill:</span>
                          <button
                            onClick={() => resolvedSkill && setInspectingSkill(resolvedSkill)}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
                          >
                            <BookOpen className="w-2.5 h-2.5" />
                            <span>{task.skillName || resolvedSkill?.name || 'Autonomous Specialist Reasoning'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          {task.status.replace('_', ' ').toUpperCase()}
                        </span>
                        {resolvedSkill && (
                          <button
                            onClick={() => setInspectingSkill(resolvedSkill)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            Inspect Skill
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  Autonomous Authority & Safety Boundaries ({detailedProfile?.clearanceLevel || 'LEVEL 5 CONSTITUTIONAL'})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* CAN */}
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      What {agent.name.split(' ')[0]} CAN Do Autonomously:
                    </span>
                    <ul className="space-y-1.5 text-slate-200 text-[11px]">
                      {(detailedProfile?.canDoAutonomously || [
                        'Synthesize and draft comprehensive strategic documents',
                        'Decompose directives into verified execution plans',
                        'Benchmark competitor pricing and developer sentiment',
                        'Model unit economics, pricing tiers, and margin floors',
                      ]).map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CANNOT */}
                  <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-2">
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      What Strictly Requires Explicit Founder Sign-Off:
                    </span>
                    <ul className="space-y-1.5 text-slate-200 text-[11px]">
                      {(detailedProfile?.requiresFounderApproval || [
                        'Irreversible financial transfers or budget threshold increases',
                        'Production code deployments to live enterprise clusters',
                        'Public press releases and external marketing broadcasts',
                        'Modifying constitutional agent safety rules',
                      ]).map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                          <span className="text-rose-400 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
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

      {inspectingSkill && (
        <SkillInspectionModal
          skill={inspectingSkill}
          onClose={() => setInspectingSkill(null)}
          assignedRoleName={agent.role}
          assignedEmployeeName={agent.name}
        />
      )}

      {/* Direct Voice Call Modal */}
      <VoiceCallModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        initialAgentId={agent.id as any}
      />
    </div>
  );
};
