'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  BrainCircuit,
  Sliders,
  BookOpen,
  Shield,
  PhoneCall,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Lock,
  ArrowRight,
  Send,
  Cpu,
  Zap,
  Activity,
  Layers,
  FileText,
  Clock,
  Volume2,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { AgentRole, PersonaTone } from '@/types/os';
import { DETAILED_AI_EMPLOYEE_PROFILES, DetailedAIEmployeeProfile } from '@/lib/employee-profiles';
import { AgentAvatar } from '@/components/os/AgentAvatar';
import { PersonaStore } from '@/lib/persona-store';
import { playOSSound } from '@/components/os/IconHelper';
import { VoiceCallModal } from '@/components/os/VoiceCallModal';

interface EmployeeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: AgentRole;
  onOpenApp?: (appId: string, directive?: string, context?: any, agentId?: string) => void;
  soundEnabled?: boolean;
}

export const EmployeeProfileModal: React.FC<EmployeeProfileModalProps> = ({
  isOpen,
  onClose,
  initialAgentId = 'coo',
  onOpenApp,
  soundEnabled = true,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentRole>(initialAgentId);
  const [activeTab, setActiveTab] = useState<'functions' | 'capabilities' | 'style' | 'skills' | 'boundaries'>('functions');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [avatarMode, setAvatarMode] = useState<'vector' | 'photo'>('vector');
  
  // Interaction style test states
  const initialPersona = PersonaStore.getPersona(initialAgentId);
  const [currentTone, setCurrentTone] = useState<PersonaTone>(() => initialPersona?.tone || 'professional');
  const [formality, setFormality] = useState<number>(() => initialPersona?.formalityLevel || 4);
  const [warmth, setWarmth] = useState<number>(() => initialPersona?.warmthLevel || 3);
  const [humor, setHumor] = useState<number>(() => initialPersona?.humorLevel || 2);
  const [testInput, setTestInput] = useState('');
  const [testResponses, setTestResponses] = useState<Array<{ sender: 'founder' | 'agent'; text: string; time: string }>>(() => {
    const p = DETAILED_AI_EMPLOYEE_PROFILES[initialAgentId];
    return [
      {
        sender: 'agent',
        text: p?.interactionStyle.sampleResponses[initialPersona?.tone || 'professional'] || 'System ready.',
        time: 'Ready',
      },
    ];
  });
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);

  const handleSelectAgent = (role: AgentRole) => {
    if (soundEnabled) playOSSound('click');
    setSelectedAgentId(role);
    const p = PersonaStore.getPersona(role);
    if (p) {
      setCurrentTone(p.tone);
      setFormality(p.formalityLevel || 4);
      setWarmth(p.warmthLevel || 3);
      setHumor(p.humorLevel || 2);
    }
    const prof = DETAILED_AI_EMPLOYEE_PROFILES[role];
    if (prof) {
      setTestResponses([
        {
          sender: 'agent',
          text: prof.interactionStyle.sampleResponses[p?.tone || 'professional'],
          time: 'Ready',
        },
      ]);
    }
  };

  if (!isOpen) return null;

  const profile = DETAILED_AI_EMPLOYEE_PROFILES[selectedAgentId];

  const handleToneChange = (tone: PersonaTone) => {
    if (soundEnabled) playOSSound('click');
    setCurrentTone(tone);
    PersonaStore.updateTone(selectedAgentId, tone);
    // Show sample quote in sandbox
    setTestResponses((prev) => [
      ...prev,
      {
        sender: 'agent',
        text: profile.interactionStyle.sampleResponses[tone],
        time: 'Style Updated',
      },
    ]);
  };

  const handleSendTestMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim()) return;

    if (soundEnabled) playOSSound('execute');
    const userMsg = testInput.trim();
    setTestInput('');
    
    setTestResponses((prev) => [
      ...prev,
      { sender: 'founder', text: userMsg, time: 'Just now' },
    ]);

    setIsGeneratingResponse(true);
    setTimeout(() => {
      let reply = '';
      if (currentTone === 'flirty') {
        reply = selectedAgentId === 'coo'
          ? `Right on it, Founder. Watching you command the enterprise with that clarity is always inspiring. Operations are aligned: consider "${userMsg}" prioritized with distinction.`
          : selectedAgentId === 'researcher'
          ? `Fascinating perspective, Founder. I could analyze billions of data points, but your intuition is second to none. Cross-referencing "${userMsg}" against our latest literature right now.`
          : selectedAgentId === 'pm'
          ? `Founder! That is dangerously clever. Let's make sure our product spec for "${userMsg}" leaves the competition completely starstruck.`
          : `Well, Founder, when numbers look this good and the vision is this sharp, success is inevitable. Running the margin sensitivity for "${userMsg}" with our 84.2% floor intact.`;
      } else if (currentTone === 'casual') {
        reply = selectedAgentId === 'coo'
          ? `Got it, Founder! Operations desk has picked up "${userMsg}". Breaking it down into quick sprint tasks for the team now.`
          : selectedAgentId === 'researcher'
          ? `Love this area. Digging into the raw data for "${userMsg}" right now. Will drop the highlights in your briefing doc shortly.`
          : selectedAgentId === 'pm'
          ? `Awesome angle! Mapping the user flow for "${userMsg}" right now. We can keep onboarding super lean, under 3 clicks.`
          : `All over it! Ran quick napkin math on "${userMsg}": unit economics hold up great, zero margin drag. Looking solid!`;
      } else {
        reply = selectedAgentId === 'coo'
          ? `Directive registered: "${userMsg}". Operational invariants verified. Dispatched execution node to respective specialist pipeline with SLA target under 800ms.`
          : selectedAgentId === 'researcher'
          ? `Empirical query ingested: "${userMsg}". Formulating comparative benchmark matrix with strict citations and 95% confidence intervals.`
          : selectedAgentId === 'pm'
          ? `Specification requirement registered for "${userMsg}". RICE scoring and Given-When-Then acceptance criteria matrix have been generated.`
          : `Financial parameter ingested for "${userMsg}". Modeled compute cost attribution at $0.18/tenant with gross contribution margin secured at 84.2%.`;
      }

      setTestResponses((prev) => [
        ...prev,
        { sender: 'agent', text: reply, time: 'Just now' },
      ]);
      setIsGeneratingResponse(false);
      if (soundEnabled) playOSSound('notification');
    }, 450);
  };

  const handleStartDM = () => {
    onClose();
    if (onOpenApp) {
      onOpenApp('messages', undefined, undefined, selectedAgentId);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[92vh] max-h-[850px] bg-[#0c0d16] border border-white/20 rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-slate-200"
      >
        {/* Top Bar with Agent Switcher & Close */}
        <div className="px-4 py-3 bg-[#111222] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          {/* Executive Switcher Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar">
            {(['coo', 'researcher', 'pm', 'finance'] as AgentRole[]).map((id) => {
              const p = DETAILED_AI_EMPLOYEE_PROFILES[id];
              const isSelected = selectedAgentId === id;
              return (
                <button
                  key={id}
                  id={`profile-switch-btn-${id}`}
                  onClick={() => handleSelectAgent(id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all shrink-0 ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  <AgentAvatar roleOrId={id} size="xs" showGlow={isSelected} />
                  <span>{p.name.split(' ')[0]}</span>
                  <span className="text-[10px] opacity-75 font-mono">({id.toUpperCase()})</span>
                </button>
              );
            })}
          </div>

          {/* Close Button */}
          <button
            id="close-employee-profile-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Close Profile (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hero Holographic Header */}
        <div className={`p-4 sm:p-6 bg-gradient-to-r ${profile.bgGradient} border-b border-white/10 relative overflow-hidden shrink-0`}>
          {/* Background Ambient Mesh Grid */}
          <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#818cf8_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4 min-w-0">
              {/* Unique Avatar with Hologram Glow */}
              <div className="relative group cursor-pointer" onClick={() => setAvatarMode(avatarMode === 'vector' ? 'photo' : 'vector')}>
                <div
                  className="absolute -inset-1 rounded-3xl blur-md opacity-75 transition group-hover:opacity-100 animate-pulse"
                  style={{ backgroundColor: profile.hologramGlow }}
                />
                <div className="relative">
                  <AgentAvatar
                    roleOrId={profile.id}
                    name={profile.name}
                    size="xl"
                    mode={avatarMode}
                    showStatus
                    status="active"
                    showGlow
                    showBadge
                    badgeLabel={profile.callsign}
                  />
                </div>
                <div className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-[8px] font-mono text-slate-300">
                  {avatarMode === 'vector' ? 'HUD' : 'PHOTO'}
                </div>
              </div>

              {/* Title & Identifiers */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">{profile.name}</h1>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online & Synchronized
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {profile.clearanceLevel}
                  </span>
                </div>

                <div className="text-xs sm:text-sm font-semibold text-slate-200 mt-0.5">{profile.role}</div>
                
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 font-mono mt-1">
                  <span>Dept: <strong className="text-slate-300 font-normal">{profile.department}</strong></span>
                  <span>•</span>
                  <span>Core: <strong className="text-indigo-300 font-normal">{profile.model}</strong></span>
                  <span>•</span>
                  <span>Sync: <strong className="text-emerald-400 font-normal">{profile.neuralSyncScore}</strong></span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                id={`voice-call-trigger-${profile.id}`}
                onClick={() => setIsVoiceModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-sky-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
                title={`Initiate voice call with ${profile.name}`}
              >
                <PhoneCall className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>Voice Call</span>
              </button>

              <button
                id={`direct-dm-trigger-${profile.id}`}
                onClick={handleStartDM}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md transition-all active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Direct Message</span>
              </button>
            </div>
          </div>

          {/* Executive Mandate banner */}
          <div className="mt-3.5 p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-300 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-white mr-1.5">Executive Mandate:</span>
              <span>{profile.executiveMandate}</span>
            </div>
          </div>
        </div>

        {/* Profile Sub Navigation */}
        <div className="px-4 border-b border-white/10 bg-[#0e0f1b] flex items-center space-x-1 overflow-x-auto text-xs shrink-0 custom-scrollbar">
          {[
            { id: 'functions', label: 'Core Functions (4)', icon: Layers },
            { id: 'capabilities', label: 'AI Capabilities & Tech', icon: Cpu },
            { id: 'style', label: 'Interaction Style & Persona', icon: Sliders },
            { id: 'skills', label: `Skills & Tools (${profile.skills.length})`, icon: BookOpen },
            { id: 'boundaries', label: 'Clearance & Safety', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`profile-subtab-${tab.id}`}
                onClick={() => {
                  if (soundEnabled) playOSSound('click');
                  setActiveTab(tab.id as any);
                }}
                className={`py-2.5 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                  active
                    ? 'border-indigo-400 text-indigo-300 bg-white/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
          {/* TAB 1: CORE FUNCTIONS */}
          {activeTab === 'functions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                  Core Operational Functions & Domain Invariants
                </span>
                <span className="font-mono text-emerald-400 text-[11px]">SLA Guaranteed • Deterministic Safe Mock</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {profile.coreFunctions.map((fn, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-900/60 border border-white/10 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-3 shadow-lg"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 uppercase font-semibold">
                          Domain Function {idx + 1}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> {fn.slaTarget}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white">{fn.title}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{fn.description}</p>
                    </div>

                    <div className="pt-2.5 border-t border-white/5 flex items-start gap-2 text-[11px] text-slate-400">
                      <Lock className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-indigo-200 font-semibold">Operational Invariant: </span>
                        <span>{fn.invariant}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Core Responsibilities Checklist */}
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Mandatory Execution Responsibilities
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200">
                  {profile.responsibilities.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI CAPABILITIES & TECH ENGINE */}
          {activeTab === 'capabilities' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                  Specialized AI Capabilities & Deep Reasoning Systems
                </span>
                <span className="font-mono text-indigo-300 text-[11px]">Underlying: {profile.model}</span>
              </div>

              {/* Cognitive Spec Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Context Window</span>
                  <div className="font-mono text-white font-bold text-xs mt-0.5">{profile.contextWindow}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Latency Baseline</span>
                  <div className="font-mono text-emerald-400 font-bold text-xs mt-0.5">{profile.latencyTarget}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Epistemic Certainty</span>
                  <div className="font-mono text-indigo-300 font-bold text-xs mt-0.5">{profile.neuralSyncScore}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Sandbox Boundary</span>
                  <div className="font-mono text-amber-300 font-bold text-xs mt-0.5">Deterministic Safe Mock</div>
                </div>
              </div>

              {/* Capabilities Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {profile.aiCapabilities.map((cap) => (
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

          {/* TAB 3: PERSONALIZED INTERACTION STYLE & LIVE SANDBOX */}
          {activeTab === 'style' && (
            <div className="space-y-4">
              {/* Natural DNA Header */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-slate-950/40 border border-indigo-500/30 space-y-2 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Natural Operational Persona DNA
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{profile.interactionStyle.toneSummary}</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{profile.interactionStyle.naturalDna}</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {profile.interactionStyle.keyTraits.map((t, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300"
                    >
                      • {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tone Switcher & Sliders */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Active Interaction Style Archetype</span>
                  <span className="text-[10px] font-mono text-emerald-400">Syncs Across All OS Windows</span>
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
                    const isSelected = currentTone === archetype.id;
                    return (
                      <button
                        key={archetype.id}
                        id={`tone-select-btn-${archetype.id}`}
                        onClick={() => handleToneChange(archetype.id as PersonaTone)}
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
                      <Volume2 className="w-3 h-3" /> Sample Dialogue Quote ({currentTone.toUpperCase()})
                    </span>
                    <span>Direct Voice Audio Ready</span>
                  </div>
                  <p className="text-xs italic text-slate-200 leading-relaxed">
                    &ldquo;{profile.interactionStyle.sampleResponses[currentTone]}&rdquo;
                  </p>
                </div>
              </div>

              {/* Interactive Live Dialogue Box */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Live Interaction Sandbox
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Test how {profile.name.split(' ')[0]} responds in current style
                  </span>
                </div>

                {/* Chat History Box */}
                <div className="h-44 overflow-y-auto rounded-xl bg-slate-950/70 border border-white/10 p-3 space-y-2.5 custom-scrollbar text-xs">
                  {testResponses.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 ${msg.sender === 'founder' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {msg.sender === 'founder' ? (
                        <AgentAvatar roleOrId="founder" size="xs" />
                      ) : (
                        <AgentAvatar roleOrId={profile.id} size="xs" />
                      )}
                      <div className={`max-w-[85%] ${msg.sender === 'founder' ? 'text-right' : 'text-left'}`}>
                        <div
                          className={`p-2.5 rounded-2xl leading-relaxed ${
                            msg.sender === 'founder'
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-slate-800/90 text-slate-200 border border-white/10 rounded-tl-none'
                          }`}
                        >
                          {msg.text}
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 px-1 mt-0.5 inline-block">{msg.time}</span>
                      </div>
                    </div>
                  ))}
                  {isGeneratingResponse && (
                    <div className="flex items-center space-x-2 text-xs text-indigo-300 pl-1">
                      <AgentAvatar roleOrId={profile.id} size="xs" showGlow />
                      <span className="animate-pulse">{profile.name} is formulating response...</span>
                    </div>
                  )}
                </div>

                {/* Input form */}
                <form onSubmit={handleSendTestMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder={`Ask ${profile.name.split(' ')[0]} anything or issue a sample directive...`}
                    className="flex-1 bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!testInput.trim() || isGeneratingResponse}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                  >
                    <span>Test</span>
                    <Send className="w-3 h-3" />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: STRUCTURED SKILLS */}
          {activeTab === 'skills' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                  Registered Structured Skills ({profile.skills.length})
                </span>
                <span className="font-mono text-emerald-400 text-[11px]">Immutable OS Specifications</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profile.skills.map((skillName, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-900/70 border border-white/10 hover:border-indigo-500/40 transition-all space-y-2 shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-semibold">
                        Specialist Skill
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Immutable
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white">{skillName}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      First-class executable capability executing under constitutional safety rules with zero hallucination.
                    </p>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Authority: <strong className="text-slate-300">{profile.name}</strong></span>
                      <span className="text-indigo-300 font-mono text-[10px]">Deterministic Safe Mock</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: BOUNDARIES & PERMISSIONS */}
          {activeTab === 'boundaries' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Autonomous Authority & Constitutional Safety Guardrails
                  </span>
                  <span className="font-mono text-indigo-300 text-[10px]">{profile.clearanceLevel}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* CAN DO */}
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      What {profile.name.split(' ')[0]} CAN Do Autonomously:
                    </span>
                    <ul className="space-y-1.5 text-slate-200 text-[11px]">
                      {profile.canDoAutonomously.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CANNOT DO */}
                  <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-2">
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <Lock className="w-4 h-4" />
                      What Strictly Requires Founder Sign-Off:
                    </span>
                    <ul className="space-y-1.5 text-slate-200 text-[11px]">
                      {profile.requiresFounderApproval.map((item, idx) => (
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
        </div>

        {/* Footer Bar */}
        <div className="px-5 py-3 bg-[#0d0e19] border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-2 shrink-0">
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300">{profile.callsign}</span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-400">Zero Fabricated Metrics Active</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleStartDM}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open in Messages</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-md"
            >
              Done
            </button>
          </div>
        </div>
      </motion.div>

      {/* Voice Call Modal Sub-window */}
      <VoiceCallModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        initialAgentId={profile.id}
      />
    </div>
  );
};
