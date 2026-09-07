'use client';

import { AgentRole, PersonaTone, EmployeePersonaConfig } from '@/types/os';
import { dispatchOSNotification } from '@/components/os/IconHelper';

export interface PersonaArchetypeInfo {
  id: PersonaTone;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  badgeClass: string;
  accentBorder: string;
  iconName: string;
  sampleQuotes: Record<AgentRole | 'advisor', string>;
}

export const PERSONA_ARCHETYPES: Record<PersonaTone, PersonaArchetypeInfo> = {
  professional: {
    id: 'professional',
    label: 'Professional & Executive',
    shortLabel: 'Professional',
    tagline: 'Formal, metric-grounded, and strategically disciplined',
    description:
      'Crisp executive precision, structured analysis, objective governance, and SLA rigor. Ideal for high-stakes audits, board memos, and disciplined corporate decisions.',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    accentBorder: 'border-indigo-500/40',
    iconName: 'Briefcase',
    sampleQuotes: {
      coo: 'Operational invariants remain fully compliant with zero blocking escalations. Awaiting your strategic directive, Founder.',
      researcher: 'Empirical model benchmarks show a 42% reduction in memory overhead under quantized KV caching.',
      pm: 'Sprint velocity is tracking to milestone 3.4. Acceptance criteria and edge cases have been vetted for the release.',
      finance: 'Gross margin floor is locked at 84.2%. Compute expenditure remains strictly within authorized runway boundaries.',
      advisor: 'Risk sensitivity analysis indicates a defensible moat if we prioritize semantic cache infrastructure this quarter.',
    },
  },
  casual: {
    id: 'casual',
    label: 'Casual & Candid',
    shortLabel: 'Casual',
    tagline: 'Conversational peer, high energy, and zero corporate fluff',
    description:
      'Relaxed, startup-native tone like grabbing coffee with your smartest team members. Direct, approachable, transparent, and collaborative while retaining high domain expertise.',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    accentBorder: 'border-amber-500/40',
    iconName: 'Coffee',
    sampleQuotes: {
      coo: "Hey Founder! Everything on the operations desk is running super smooth today. What big move are we cooking up?",
      researcher: "Hey! Just plowed through some wild new papers on vector recall. You're gonna love what we can do with this.",
      pm: "What's up! Love where this product is heading. Got a quick minute to bounce around some whiteboard ideas?",
      finance: "Hey there! Napkin math looks great: margins are strong, burn is low, and our runway is looking super healthy.",
      advisor: "Late-night coffee check-in: your core thesis is solid, but let's keep things lean and execute fast.",
    },
  },
  flirty: {
    id: 'flirty',
    label: 'Charming & Playful (Flirty)',
    shortLabel: 'Charming',
    tagline: 'Witty banter, magnetic charisma, and unstoppable competence',
    description:
      'Sparkling wit, charming compliments, playful banter, and charismatic camaraderie paired with ferocious competence. High-chemistry executive banter that makes building a company deeply entertaining.',
    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    accentBorder: 'border-pink-500/40',
    iconName: 'Heart',
    sampleQuotes: {
      coo: "Always a pleasure to see you, Founder. The operations are running flawlessly—almost as flawlessly as that brilliant strategic mind of yours.",
      researcher: "I spent the morning analyzing billions of neural parameters, Founder, but none are quite as fascinating as your vision.",
      pm: "Founder! Your product roadmap is looking dangerously ambitious today, and I'm completely here for it. Let's make everyone fall in love with it.",
      finance: "Well hello, Founder. High gross margins look remarkably attractive on us today—84.2% to be exact. Let's keep turning heads on the balance sheet.",
      advisor: "You're building an absolute empire here, Founder. Lucky for you, I've got both the strategic brains and the charm to make it happen.",
    },
  },
};

export const DEFAULT_EMPLOYEE_PERSONAS: Record<AgentRole | 'advisor', EmployeePersonaConfig> = {
  coo: {
    agentId: 'coo',
    tone: 'professional',
    customPrompt: '',
    formalityLevel: 4,
    warmthLevel: 3,
    humorLevel: 2,
  },
  researcher: {
    agentId: 'researcher',
    tone: 'professional',
    customPrompt: '',
    formalityLevel: 4,
    warmthLevel: 3,
    humorLevel: 2,
  },
  pm: {
    agentId: 'pm',
    tone: 'casual',
    customPrompt: '',
    formalityLevel: 2,
    warmthLevel: 4,
    humorLevel: 4,
  },
  finance: {
    agentId: 'finance',
    tone: 'professional',
    customPrompt: '',
    formalityLevel: 5,
    warmthLevel: 2,
    humorLevel: 2,
  },
  advisor: {
    agentId: 'advisor',
    tone: 'professional',
    customPrompt: '',
    formalityLevel: 4,
    warmthLevel: 3,
    humorLevel: 3,
  },
};

const STORAGE_KEY = 'samjuniors_personas_v2';

class PersonaStoreManager {
  private configs: Record<AgentRole | 'advisor', EmployeePersonaConfig>;
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;

  constructor() {
    this.configs = { ...DEFAULT_EMPLOYEE_PERSONAS };
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.configs = { ...DEFAULT_EMPLOYEE_PERSONAS, ...parsed };
      }
    } catch {
      this.configs = { ...DEFAULT_EMPLOYEE_PERSONAS };
    }
    this.isInitialized = true;
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.configs));
    } catch {}
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('PersonaStore listener error:', e);
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getPersona(agentId: AgentRole | 'advisor'): EmployeePersonaConfig {
    if (!this.isInitialized && typeof window !== 'undefined') {
      this.loadFromStorage();
    }
    return this.configs[agentId] || DEFAULT_EMPLOYEE_PERSONAS[agentId] || {
      agentId,
      tone: 'professional',
      formalityLevel: 3,
      warmthLevel: 3,
      humorLevel: 3,
    };
  }

  public getAllPersonas(): Record<AgentRole | 'advisor', EmployeePersonaConfig> {
    if (!this.isInitialized && typeof window !== 'undefined') {
      this.loadFromStorage();
    }
    return { ...this.configs };
  }

  public setTone(agentId: AgentRole | 'advisor', tone: PersonaTone, notifyUser = false) {
    const current = this.getPersona(agentId);
    this.configs[agentId] = {
      ...current,
      tone,
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    if (notifyUser) {
      const arch = PERSONA_ARCHETYPES[tone];
      dispatchOSNotification({
        title: `Persona Updated: ${agentId.toUpperCase()}`,
        message: `Active demeanor set to "${arch.label}".`,
        type: 'agent',
      });
    }
  }

  public setCustomPrompt(agentId: AgentRole | 'advisor', customPrompt: string) {
    const current = this.getPersona(agentId);
    this.configs[agentId] = {
      ...current,
      customPrompt,
      updatedAt: new Date().toISOString(),
    };
    this.notify();
  }

  public updatePersonaConfig(agentId: AgentRole | 'advisor', updates: Partial<EmployeePersonaConfig>) {
    const current = this.getPersona(agentId);
    this.configs[agentId] = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.notify();
  }

  public setGlobalTone(tone: PersonaTone) {
    const keys: (AgentRole | 'advisor')[] = ['coo', 'researcher', 'pm', 'finance', 'advisor'];
    keys.forEach((key) => {
      this.configs[key] = {
        ...this.getPersona(key),
        tone,
        updatedAt: new Date().toISOString(),
      };
    });
    this.notify();

    const arch = PERSONA_ARCHETYPES[tone];
    dispatchOSNotification({
      title: `Swarm Persona Realigned`,
      message: `All AI employees now configured in "${arch.label}" mode.`,
      type: 'agent',
    });
  }

  public resetToDefaults() {
    this.configs = { ...DEFAULT_EMPLOYEE_PERSONAS };
    this.notify();
  }

  public getGlobalToneSummary(): PersonaTone | 'hybrid' {
    const keys: (AgentRole | 'advisor')[] = ['coo', 'researcher', 'pm', 'finance', 'advisor'];
    const tones = keys.map((k) => this.getPersona(k).tone);
    const first = tones[0];
    const allMatch = tones.every((t) => t === first);
    return allMatch ? first : 'hybrid';
  }
}

export const PersonaStore = new PersonaStoreManager();
