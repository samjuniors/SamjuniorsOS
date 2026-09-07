'use client';

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Coffee,
  Heart,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Flame,
  Info,
  Sliders,
  Bot,
  Zap,
} from 'lucide-react';
import { AgentRole, PersonaTone, EmployeePersonaConfig } from '@/types/os';
import {
  PersonaStore,
  PERSONA_ARCHETYPES,
  DEFAULT_EMPLOYEE_PERSONAS,
} from '@/lib/persona-store';
import { AgentAvatar, playOSSound } from '../os/IconHelper';

interface EmployeeMetadata {
  id: AgentRole | 'advisor';
  name: string;
  role: string;
  department: string;
  avatarColor: string;
  defaultTone: PersonaTone;
}

const EMPLOYEES: EmployeeMetadata[] = [
  {
    id: 'coo',
    name: 'Sophia Vance',
    role: 'Chief Operating Officer & Orchestrator',
    department: 'Executive Operations',
    avatarColor: 'from-purple-500 to-indigo-600',
    defaultTone: 'professional',
  },
  {
    id: 'researcher',
    name: 'Dr. Aris Thorne',
    role: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech',
    avatarColor: 'from-amber-500 to-orange-600',
    defaultTone: 'professional',
  },
  {
    id: 'pm',
    name: 'Maya Lin',
    role: 'Principal Product Manager',
    department: 'Product Architecture & UX',
    avatarColor: 'from-pink-500 to-rose-600',
    defaultTone: 'casual',
  },
  {
    id: 'finance',
    name: 'Julian Cruz',
    role: 'Chief Financial Analyst',
    department: 'Finance & Capital Planning',
    avatarColor: 'from-emerald-400 to-green-600',
    defaultTone: 'professional',
  },
  {
    id: 'advisor',
    name: 'Founder Intelligence',
    role: 'Strategic Co-Pilot & Advisor',
    department: 'Founder Strategic Advisory',
    avatarColor: 'from-purple-500 via-indigo-500 to-pink-500',
    defaultTone: 'professional',
  },
];

interface PersonaConfigViewProps {
  onOpenApp?: (appId: string) => void;
  soundEnabled?: boolean;
}

export const PersonaConfigView: React.FC<PersonaConfigViewProps> = ({
  onOpenApp,
  soundEnabled = true,
}) => {
  const [personas, setPersonas] = useState<Record<AgentRole | 'advisor', EmployeePersonaConfig>>(
    () => PersonaStore.getAllPersonas()
  );
  const [expandedCustomPrompt, setExpandedCustomPrompt] = useState<Record<string, boolean>>({});

  useEffect(() => {
    return PersonaStore.subscribe(() => {
      setPersonas(PersonaStore.getAllPersonas());
    });
  }, []);

  const handleSetTone = (agentId: AgentRole | 'advisor', tone: PersonaTone) => {
    if (soundEnabled) playOSSound('click');
    PersonaStore.setTone(agentId, tone, true);
  };

  const handleSetGlobalTone = (tone: PersonaTone) => {
    if (soundEnabled) playOSSound('notification');
    PersonaStore.setGlobalTone(tone);
  };

  const handleReset = () => {
    if (soundEnabled) playOSSound('click');
    PersonaStore.resetToDefaults();
  };

  const globalTone = PersonaStore.getGlobalToneSummary();

  const toggleCustomPrompt = (agentId: string) => {
    if (soundEnabled) playOSSound('click');
    setExpandedCustomPrompt((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Strategic Architecture Recommendation Callout */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/50 border border-indigo-500/20 text-slate-300 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Executive Persona & Demeanor Architecture
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  Recommended Hybrid Architecture
                </span>
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                We recommend the <strong className="text-white">Per-Employee Customizer with 1-Click Global Presets</strong>. A flat single tone across the entire company makes Julian in Finance and Maya in Product sound identical, whereas granular personas preserve their specialized roles while allowing instant company-wide alignment whenever you prefer.
              </p>
            </div>
          </div>

          <button
            id="persona-reset-defaults-btn"
            onClick={handleReset}
            className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 transition-colors whitespace-nowrap"
            title="Reset all employees to default tones"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>
        </div>

        {/* 1-Click Global Swarm Alignment */}
        <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-200">1-Click Swarm Tone:</span>
            <span className="text-[10px] font-mono text-slate-400">
              {globalTone === 'hybrid' ? '(Currently Mixed / Custom)' : `(All set to ${globalTone})`}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="global-tone-professional-btn"
              onClick={() => handleSetGlobalTone('professional')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                globalTone === 'professional'
                  ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/40'
                  : 'bg-white/5 hover:bg-indigo-600/20 text-slate-300 hover:text-white border border-white/10'
              }`}
            >
              <Briefcase className="w-3 h-3 text-indigo-400" />
              <span>All Professional</span>
            </button>

            <button
              id="global-tone-casual-btn"
              onClick={() => handleSetGlobalTone('casual')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                globalTone === 'casual'
                  ? 'bg-amber-600 text-white shadow-md ring-1 ring-amber-400/40'
                  : 'bg-white/5 hover:bg-amber-600/20 text-slate-300 hover:text-white border border-white/10'
              }`}
            >
              <Coffee className="w-3 h-3 text-amber-400" />
              <span>All Casual</span>
            </button>

            <button
              id="global-tone-flirty-btn"
              onClick={() => handleSetGlobalTone('flirty')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                globalTone === 'flirty'
                  ? 'bg-pink-600 text-white shadow-md ring-1 ring-pink-400/40'
                  : 'bg-white/5 hover:bg-pink-600/20 text-slate-300 hover:text-white border border-white/10'
              }`}
            >
              <Heart className="w-3 h-3 text-pink-400" />
              <span>All Charming (Flirty)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tone Archetype Reference Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {(Object.keys(PERSONA_ARCHETYPES) as PersonaTone[]).map((toneKey) => {
          const arch = PERSONA_ARCHETYPES[toneKey];
          const Icon = toneKey === 'professional' ? Briefcase : toneKey === 'casual' ? Coffee : Heart;

          return (
            <div
              key={toneKey}
              className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border flex items-center gap-1.5 ${arch.badgeClass}`}>
                  <Icon className="w-3 h-3" />
                  {arch.shortLabel}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Archetype</span>
              </div>
              <h5 className="text-xs font-bold text-white">{arch.label}</h5>
              <p className="text-[11px] text-slate-300 leading-relaxed">{arch.tagline}</p>
              <p className="text-[10px] text-slate-400 leading-normal pt-1 border-t border-white/5">
                {arch.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Granular Per-Employee Configuration Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            Individual AI Employee Demeanor & Persona Tuning
          </h4>
          <span className="text-[10px] text-slate-400 font-mono">5 Active Officers</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {EMPLOYEES.map((employee) => {
            const config = personas[employee.id] || DEFAULT_EMPLOYEE_PERSONAS[employee.id];
            const currentTone = config.tone;
            const currentArch = PERSONA_ARCHETYPES[currentTone];
            const sampleQuote = currentArch.sampleQuotes[employee.id];
            const isCustomOpen = !!expandedCustomPrompt[employee.id];

            return (
              <div
                key={employee.id}
                id={`persona-card-${employee.id}`}
                className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-white/20 transition-all space-y-4 shadow-lg"
              >
                {/* Employee Header & 3-Way Tone Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AgentAvatar roleOrId={employee.id} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{employee.name}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${currentArch.badgeClass}`}>
                          {currentArch.shortLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {employee.role} • <span className="text-slate-500">{employee.department}</span>
                      </p>
                    </div>
                  </div>

                  {/* 3 Tone Buttons */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 self-start sm:self-auto">
                    <button
                      id={`persona-${employee.id}-professional`}
                      onClick={() => handleSetTone(employee.id, 'professional')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        currentTone === 'professional'
                          ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                      title="Set to Professional & Executive"
                    >
                      <Briefcase className="w-3 h-3" />
                      <span>Professional</span>
                    </button>

                    <button
                      id={`persona-${employee.id}-casual`}
                      onClick={() => handleSetTone(employee.id, 'casual')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        currentTone === 'casual'
                          ? 'bg-amber-600 text-white shadow-md ring-1 ring-amber-400/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                      title="Set to Casual & Candid"
                    >
                      <Coffee className="w-3 h-3" />
                      <span>Casual</span>
                    </button>

                    <button
                      id={`persona-${employee.id}-flirty`}
                      onClick={() => handleSetTone(employee.id, 'flirty')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        currentTone === 'flirty'
                          ? 'bg-pink-600 text-white shadow-md ring-1 ring-pink-400/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                      title="Set to Charming & Playful (Flirty)"
                    >
                      <Heart className="w-3 h-3" />
                      <span>Charming</span>
                    </button>
                  </div>
                </div>

                {/* Live Dialogue Preview Box */}
                <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1 text-indigo-300">
                      <Sparkles className="w-3 h-3" />
                      Live Demeanor Preview ({currentArch.label}):
                    </span>
                    {onOpenApp && (
                      <button
                        onClick={() => onOpenApp('messages')}
                        className="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Test Chat in Messages</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-200 italic leading-relaxed">
                    &ldquo;{sampleQuote}&rdquo;
                  </p>
                </div>

                {/* Advanced Custom Persona Instructions Accordion */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    onClick={() => toggleCustomPrompt(employee.id)}
                    className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 py-1 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sliders className="w-3 h-3 text-slate-400" />
                      Custom Personality Traits & Quirks (Optional Overrides)
                      {config.customPrompt && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      )}
                    </span>
                    {isCustomOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </button>

                  {isCustomOpen && (
                    <div className="mt-2.5 p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Add specific personality directives for {employee.name} (e.g., &quot;Frequently uses espresso metaphors&quot;, &quot;Obsessed with vector latency&quot;, &quot;High-energy encouragement&quot;):
                      </p>
                      <textarea
                        id={`persona-custom-prompt-${employee.id}`}
                        rows={2}
                        value={config.customPrompt || ''}
                        onChange={(e) =>
                          PersonaStore.setCustomPrompt(employee.id, e.target.value)
                        }
                        placeholder={`Custom behavior rules or specific banter style for ${employee.name}...`}
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
