'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Shield,
  Target,
  Users,
  Award,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  TrendingUp,
  Cpu,
  ChevronRight,
  ExternalLink,
  Zap,
  Activity,
  Sparkles,
  ArrowUpRight,
  Layers,
  Clock,
  Compass,
  Boxes,
  DollarSign,
  Lock,
  Flame,
  MessageSquare,
  Sliders,
  Check,
  BarChart3,
  RefreshCw,
  Eye,
  Radio,
  Workflow,
  ChevronDown,
} from 'lucide-react';
import { INITIAL_AGENTS, SAMPLE_FINANCIAL_MODEL } from '@/lib/os-data';
import { AgentAvatar } from '@/components/os/AgentAvatar';
import { playOSSound } from '../os/IconHelper';
import { PersonaStore, PERSONA_ARCHETYPES } from '@/lib/persona-store';
import { AgentRole } from '@/types/os';

interface CompanyAppProps {
  onOpenApp?: (appId: string, param?: string) => void;
  soundEnabled?: boolean;
}

type HorizonId = 'q3-2026' | 'q4-2026' | 'fy-2027';

interface StrategicHorizon {
  id: HorizonId;
  label: string;
  tagline: string;
  quarter: string;
  targetArr: string;
  targetMargin: string;
  activeFrontiers: string[];
}

const STRATEGIC_HORIZONS: Record<HorizonId, StrategicHorizon> = {
  'q3-2026': {
    id: 'q3-2026',
    label: 'Horizon Alpha: Sovereign Sandboxing & Autonomous Pilot',
    tagline: 'Establishing deterministic multi-agent orchestration, 80%+ margin floor, and enterprise pilot readiness.',
    quarter: 'Current Active • Q3 2026',
    targetArr: '$340.8K ARR ($28.4K MRR)',
    targetMargin: '84.2% Gross Margin',
    activeFrontiers: ['Project Lumora (Self-Serve)', 'Project Ledger (Margin Guardrails)', 'Project Horizon (Market Radar)'],
  },
  'q4-2026': {
    id: 'q4-2026',
    label: 'Horizon Beta: Enterprise Fleet & Neural Streaming Bus',
    tagline: 'Sub-50ms peer-to-peer agent communication, 25 pilot enterprise cohorts, and automated SLA self-healing.',
    quarter: 'Next Horizon • Q4 2026',
    targetArr: '$780.0K ARR Target',
    targetMargin: '86.5% Gross Margin',
    activeFrontiers: ['Project Synapse (Neural Bus)', 'Enterprise SOC2 Invariants', 'Multi-Tenant Automated Onboarding'],
  },
  'fy-2027': {
    id: 'fy-2027',
    label: 'Horizon Gamma: Self-Healing Global Swarm Scale',
    tagline: 'Autonomous cross-company procurement, self-balancing capital treasury, and sovereign federated intelligence.',
    quarter: 'Strategic Vision • FY 2027',
    targetArr: '$2.4M ARR Horizon',
    targetMargin: '88.0% Gross Margin',
    activeFrontiers: ['Autonomous Treasury Management', 'Global Federated Intelligence', 'Self-Synthesizing Roadmaps'],
  },
};

export const CompanyApp: React.FC<CompanyAppProps> = ({
  onOpenApp,
  soundEnabled = true,
}) => {
  const [activeTab, setActiveTab] = useState<'command' | 'horizons' | 'swarm' | 'constitution' | 'board'>('command');
  const [activeHorizon, setActiveHorizon] = useState<HorizonId>('q3-2026');
  const [simulatedTenants, setSimulatedTenants] = useState<number>(25);
  const [expandedFrontierId, setExpandedFrontierId] = useState<string | null>('frontier-1');
  const [personas, setPersonas] = useState(() => PersonaStore.getAllPersonas());
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    return PersonaStore.subscribe(() => {
      setPersonas(PersonaStore.getAllPersonas());
    });
  }, []);

  const handleTabChange = (tab: typeof activeTab) => {
    if (soundEnabled) playOSSound('click');
    setActiveTab(tab);
  };

  const handleHorizonChange = (horizonId: HorizonId) => {
    if (soundEnabled) playOSSound('click');
    setActiveHorizon(horizonId);
  };

  const handleRunSimulation = (tenants: number) => {
    if (soundEnabled) playOSSound('execute');
    setIsSimulating(true);
    setSimulatedTenants(tenants);
    setTimeout(() => setIsSimulating(false), 400);
  };

  const currentHorizonData = STRATEGIC_HORIZONS[activeHorizon];

  // Calculated simulation metrics
  const simRevenue = (simulatedTenants * 980).toLocaleString();
  const simComputeCost = (simulatedTenants * 0.18).toFixed(2);
  const simMargin = (((simulatedTenants * 980 - simulatedTenants * 0.18 * 12) / (simulatedTenants * 980)) * 100).toFixed(1);

  return (
    <div className="h-full flex flex-col bg-[#07080c] text-slate-100 overflow-hidden select-none font-sans">
      {/* 1. TOP FUTURISTIC TELEMETRY & SOVEREIGN STATUS BANNER */}
      <div className="h-14 px-4 sm:px-6 border-b border-white/10 bg-[#0a0c14]/95 backdrop-blur-md flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shadow-sm shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white tracking-wider uppercase">
                SamJuniors Enterprise
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Autonomous Swarm Active
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              Autonomous Runtime v2.4 • Invariant Check: 100% Nominal • 0 Incidents
            </p>
          </div>
        </div>

        {/* Global Live Swarm Micro-Telemetry */}
        <div className="hidden lg:flex items-center space-x-4 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/5">
            <span className="text-slate-500">CONSENSUS:</span>
            <span className="text-indigo-300 font-semibold">100% Invariant-Checked</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/5">
            <span className="text-slate-500">TREASURY:</span>
            <span className="text-emerald-400 font-semibold">$244.8K</span>
            <span className="text-slate-500 text-[10px]">(38.2 Mo)</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/5">
            <span className="text-slate-500">OPERATING RATIO:</span>
            <span className="text-purple-300 font-semibold">1 Founder : 4 AI Officers : $0 Payroll</span>
          </div>
        </div>

        {/* Quick Strategic Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            id="company-dispatch-directive-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('open');
              onOpenApp?.('workforce');
            }}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
            title="Dispatch a company-wide directive to the AI Council"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Commission Directive</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION NAVIGATION TABS */}
      <div className="h-11 px-4 sm:px-6 border-b border-white/10 bg-[#090b12] flex items-center justify-between shrink-0 overflow-x-auto custom-scrollbar gap-2">
        <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
          <button
            id="company-tab-command"
            onClick={() => handleTabChange('command')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'command'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-blue-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Strategic Command</span>
          </button>

          <button
            id="company-tab-horizons"
            onClick={() => handleTabChange('horizons')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'horizons'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Strategic Horizons & OKRs</span>
          </button>

          <button
            id="company-tab-swarm"
            onClick={() => handleTabChange('swarm')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'swarm'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Swarm Velocity & Org</span>
          </button>

          <button
            id="company-tab-constitution"
            onClick={() => handleTabChange('constitution')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'constitution'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Constitutional Invariants</span>
          </button>

          <button
            id="company-tab-board"
            onClick={() => handleTabChange('board')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'board'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-indigo-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Board Synthesis</span>
          </button>
        </div>

        {/* Active Strategic Horizon Pill Indicator */}
        <div className="hidden md:flex items-center space-x-2 text-[11px] font-mono text-slate-400 shrink-0">
          <span className="text-slate-500">HORIZON:</span>
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-indigo-300 font-semibold">
            {currentHorizonData.quarter}
          </span>
        </div>
      </div>

      {/* 3. MAIN SCROLLABLE DASHBOARD CANVAS */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">

        {/* TAB 1: STRATEGIC COMMAND (HIGH-LEVEL FUTURISTIC OVERVIEW) */}
        {activeTab === 'command' && (
          <div className="space-y-6">

            {/* Strategic Horizon Switcher Ribbon */}
            <div className="p-4 rounded-2xl bg-[#0d0f1a]/80 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    {currentHorizonData.label}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  {currentHorizonData.tagline}
                </p>
              </div>

              {/* 3 Horizon Selectors */}
              <div className="flex items-center space-x-1.5 bg-black/40 p-1 rounded-xl border border-white/10 self-start md:self-auto shrink-0">
                {(Object.keys(STRATEGIC_HORIZONS) as HorizonId[]).map((hid) => {
                  const h = STRATEGIC_HORIZONS[hid];
                  const isSelected = activeHorizon === hid;
                  return (
                    <button
                      key={hid}
                      id={`horizon-btn-${hid}`}
                      onClick={() => handleHorizonChange(hid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {hid === 'q3-2026' ? 'Q3 Active' : hid === 'q4-2026' ? 'Q4 Expansion' : 'FY27 Scale'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* THE AUTONOMOUS OPERATING MULTIPLIER (CYBERNETIC EQUATION) */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-[#0d101d] via-[#0e1224] to-[#0d101d] border border-indigo-500/20 shadow-xl relative overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-semibold flex items-center gap-1.5">
                    <Workflow className="w-3.5 h-3.5" />
                    Autonomous Operating Architecture • The Sovereign Equation
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Pure AI Enterprise with Sovereign Human-in-the-Loop Governance
                  </h2>
                  <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                    Zero payroll overhead. 4 specialized executive AI officers operate autonomously within constitutional safety parameters, executing research, specs, financial models, and customer pipeline simulations with verified precision.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="px-4 py-2.5 rounded-xl bg-black/50 border border-white/10 text-center">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Gross Margin Floor</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-emerald-400">84.2%</div>
                  </div>
                  <div className="px-4 py-2.5 rounded-xl bg-black/50 border border-white/10 text-center">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Runway</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-indigo-300">38.2 Mo</div>
                  </div>
                </div>
              </div>

              {/* Formula Strip */}
              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Human Authority</div>
                  <div className="text-sm font-bold text-white mt-0.5">1 Sovereign Founder</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Executive Swarm</div>
                  <div className="text-sm font-bold text-indigo-300 mt-0.5">4 AI Officers</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Payroll Burn</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">$0.00 / Month</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Compute per Tenant</div>
                  <div className="text-sm font-bold text-cyan-300 mt-0.5">$0.18 Onboarding</div>
                </div>
              </div>
            </div>

            {/* KEY PERFORMANCE TELEMETRY STRIP (MINIMAL & PRECISE) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Telemetry Tile 1: Financial Sovereignty */}
              <div className="p-4 rounded-2xl bg-[#0c0e17] border border-white/10 hover:border-white/20 transition-all space-y-2 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="uppercase tracking-wider">Capital Telemetry</span>
                  <span className="text-emerald-400 font-bold">+18.2% MoM</span>
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-white">$340,800</div>
                  <div className="text-xs text-slate-400 mt-0.5">Annualized Run Rate (ARR)</div>
                </div>
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-300">
                  <span>MRR: $28,400</span>
                  <span className="text-emerald-400 font-mono font-semibold">Margin: 84.2%</span>
                </div>
              </div>

              {/* Telemetry Tile 2: Swarm Execution Velocity */}
              <div className="p-4 rounded-2xl bg-[#0c0e17] border border-white/10 hover:border-white/20 transition-all space-y-2 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="uppercase tracking-wider">Swarm Velocity</span>
                  <span className="text-indigo-400 font-bold">14.2s Median</span>
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-white">42 Directives</div>
                  <div className="text-xs text-slate-400 mt-0.5">Executed with 100% Verification</div>
                </div>
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-300">
                  <span>Protocol: 9-Step SLA</span>
                  <span className="text-indigo-300 font-mono font-semibold">99.4% Adherence</span>
                </div>
              </div>

              {/* Telemetry Tile 3: Operating Leverage */}
              <div className="p-4 rounded-2xl bg-[#0c0e17] border border-white/10 hover:border-white/20 transition-all space-y-2 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="uppercase tracking-wider">Human Leverage</span>
                  <span className="text-purple-400 font-bold">Infinite Multiple</span>
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-white">$340.8K / Human</div>
                  <div className="text-xs text-slate-400 mt-0.5">Revenue Per Human Employee</div>
                </div>
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-300">
                  <span>Traditional Burn: ~$45k</span>
                  <span className="text-emerald-400 font-mono font-semibold">Saved: $540K/yr</span>
                </div>
              </div>

              {/* Telemetry Tile 4: Constitutional Integrity */}
              <div className="p-4 rounded-2xl bg-[#0c0e17] border border-white/10 hover:border-white/20 transition-all space-y-2 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="uppercase tracking-wider">Safety & Boundaries</span>
                  <span className="text-emerald-400 font-bold">0 Violations</span>
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-white">100% Invariants</div>
                  <div className="text-xs text-slate-400 mt-0.5">Constitutional Safeguards Active</div>
                </div>
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-300">
                  <span>Grounding: 94.2%</span>
                  <span className="text-cyan-300 font-mono font-semibold">Supervised Execution</span>
                </div>
              </div>
            </div>

            {/* STRATEGIC FRONTIERS MATRIX (PROGRESS ON ACTIVE INITIATIVES) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-400" />
                    Active Corporate Frontiers & Strategic Deliverables
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    High-impact roadmaps currently executed across the 4 autonomous divisions.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                  3 Sovereign Frontiers Active
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {/* Frontier 1: Product Architecture & Self-Serve AI */}
                <div
                  id="frontier-card-1"
                  className="p-5 rounded-2xl bg-[#0d0f18] border border-white/10 hover:border-indigo-500/30 transition-all space-y-3.5 shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20 shrink-0">
                        <Boxes className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white">
                            Frontier Alpha: Autonomous Self-Serve Onboarding & Peer Streaming Bus
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-pink-500/10 text-pink-300 border border-pink-500/20">
                            SANDBOX RATIFIED
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Code Name: <strong className="text-white">Project Lumora</strong> • Primary Leads: Maya Lin (Product) & Sophia Vance (COO)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-emerald-400">88% Complete</div>
                        <div className="text-[10px] text-slate-500 font-mono">Target: Q3 Final Sprint</div>
                      </div>
                      <button
                        onClick={() => onOpenApp?.('products')}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs flex items-center space-x-1 border border-white/10 transition-colors"
                        title="Open Product Roadmap app"
                      >
                        <span>Inspect PRD</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Gauge */}
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-pink-500 to-indigo-500 rounded-full" style={{ width: '88%' }} />
                  </div>

                  {/* Verified Milestones */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300 pt-1">
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">PRD v2.4 Approved (RICE 88)</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">Sub-50ms Bus Architecture</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">15 Enterprise Cohorts Ready</span>
                    </div>
                  </div>
                </div>

                {/* Frontier 2: Capital Sovereignty & Unit Margin Hegemony */}
                <div
                  id="frontier-card-2"
                  className="p-5 rounded-2xl bg-[#0d0f18] border border-white/10 hover:border-emerald-500/30 transition-all space-y-3.5 shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white">
                            Frontier Beta: Capital Sovereignty & 80%+ Margin Floor Invariant
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            CAPITAL PROTECTED
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Code Name: <strong className="text-white">Project Ledger</strong> • Primary Lead: Julian Cruz (Chief Financial Analyst)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-emerald-400">92% Complete</div>
                        <div className="text-[10px] text-slate-500 font-mono">Target: Permanent Floor</div>
                      </div>
                      <button
                        onClick={() => onOpenApp?.('finance')}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs flex items-center space-x-1 border border-white/10 transition-colors"
                        title="Open Finance app"
                      >
                        <span>View Model</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Gauge */}
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" style={{ width: '92%' }} />
                  </div>

                  {/* Verified Milestones */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300 pt-1">
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">84.2% Gross Margin Floor Locked</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">$0.18 Compute Cap Verified</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">5,000 Tenant Concurrency Model</span>
                    </div>
                  </div>
                </div>

                {/* Frontier 3: Market Intelligence & Deep Tech Radar */}
                <div
                  id="frontier-card-3"
                  className="p-5 rounded-2xl bg-[#0d0f18] border border-white/10 hover:border-amber-500/30 transition-all space-y-3.5 shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        <Compass className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white">
                            Frontier Gamma: Empirical Market Intelligence & Regulatory Radar
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            EMPIRICALLY GROUNDED
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Code Name: <strong className="text-white">Project Horizon</strong> • Primary Lead: Dr. Aris Thorne (Lead Researcher)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-amber-400">80% Complete</div>
                        <div className="text-[10px] text-slate-500 font-mono">Target: Bi-Weekly Diff</div>
                      </div>
                      <button
                        onClick={() => onOpenApp?.('research')}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs flex items-center space-x-1 border border-white/10 transition-colors"
                        title="Open Market Research app"
                      >
                        <span>Explore Radar</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Gauge */}
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: '80%' }} />
                  </div>

                  {/* Verified Milestones */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300 pt-1">
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">12 Frontier Models Benchmarked</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">EU AI Act Sovereign Compliance</span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">Competitive Moat Analysis v3.1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* INTERACTIVE AUTONOMOUS SCALE SIMULATOR */}
            <div className="p-5 rounded-2xl bg-[#0c0e18] border border-white/10 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    Autonomous Scaling Telemetry & Economic Projection
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Simulate how the company scales revenue without hiring human personnel or deteriorating unit margins.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  Deterministic Model
                </span>
              </div>

              {/* Slider & Quick Buttons */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Active Enterprise Tenants Simulated:</span>
                  <span className="font-mono font-bold text-cyan-300 text-sm">{simulatedTenants} Accounts</span>
                </div>

                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min={5}
                    max={150}
                    step={5}
                    value={simulatedTenants}
                    onChange={(e) => handleRunSimulation(Number(e.target.value))}
                    className="w-full accent-cyan-500 bg-white/10 h-2 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-[11px] text-slate-500 font-mono">Quick Cohorts:</span>
                  {[15, 25, 50, 100].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleRunSimulation(num)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                        simulatedTenants === num
                          ? 'bg-cyan-500 text-black font-bold'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                      }`}
                    >
                      {num} Pilots
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Output Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400">Projected MRR</div>
                  <div className="text-base font-bold font-mono text-white mt-0.5">${simRevenue}</div>
                  <div className="text-[10px] text-slate-500">@ $980/mo tier</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400">Monthly Compute Burn</div>
                  <div className="text-base font-bold font-mono text-cyan-300 mt-0.5">${simComputeCost}</div>
                  <div className="text-[10px] text-slate-500">$0.18/tenant ceiling</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400">Simulated Gross Margin</div>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">{simMargin}%</div>
                  <div className="text-[10px] text-slate-500">+4.2% above floor</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400">Human Headcount Added</div>
                  <div className="text-base font-bold font-mono text-purple-300 mt-0.5">0 Humans</div>
                  <div className="text-[10px] text-slate-500">100% Swarm Managed</div>
                </div>
              </div>
            </div>

            {/* AUTONOMOUS EXECUTIVE COUNCIL STATUS STRIP */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    Executive Swarm Readiness & Operational Demeanor
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Live operational vectors across the 4 autonomous department leads.
                  </p>
                </div>
                <button
                  onClick={() => onOpenApp?.('settings')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 font-mono"
                >
                  <span>Tune Personas in Settings</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {INITIAL_AGENTS.map((agent) => {
                  const personaConfig = personas[agent.id] || { tone: 'professional' };
                  const archetype = PERSONA_ARCHETYPES[personaConfig.tone];

                  return (
                    <div
                      key={agent.id}
                      className="p-4 rounded-2xl bg-[#0c0e17] border border-white/10 hover:border-indigo-500/40 transition-all space-y-3 shadow-md group"
                    >
                      <div className="flex items-center space-x-3">
                        <AgentAvatar roleOrId={agent.id} size="md" showStatus status="active" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{agent.name}</div>
                          <div className="text-[10px] text-indigo-400 truncate">{agent.role}</div>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1 border-t border-white/5 text-[11px]">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Department:</span>
                          <span className="text-slate-300 font-medium truncate max-w-[120px]">
                            {agent.department.split('&')[0]}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Demeanor:</span>
                          <span className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${archetype.badgeClass}`}>
                            {archetype.shortLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Verification:</span>
                          <span className="text-emerald-400 font-mono font-semibold">100% Invariant</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <button
                          onClick={() => onOpenApp?.('messages')}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Direct Chat</span>
                        </button>
                        <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Autonomous
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* REAL-TIME VERIFIED AUTONOMOUS EVENT STREAM */}
            <div className="p-4 rounded-2xl bg-[#0a0c14] border border-white/10 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  Live Verified Company Event Stream
                </span>
                <span className="text-[10px] font-mono text-slate-500">Auto-Audited by 9-Step Protocol</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-2">
                    <span className="w-2 h-2 rounded-full bg-pink-400 mt-1 shrink-0" />
                    <div>
                      <span className="text-white font-semibold">Maya Lin (Product Architecture)</span>
                      <p className="text-slate-300 text-[11px]">Finalized Project Lumora self-serve onboarding spec with RICE score 88/100.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">12m ago</span>
                </div>

                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0" />
                    <div>
                      <span className="text-white font-semibold">Julian Cruz (Capital & Finance)</span>
                      <p className="text-slate-300 text-[11px]">Verified 84.2% gross margin floor under 5,000 tenant load test.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">28m ago</span>
                </div>

                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                    <div>
                      <span className="text-white font-semibold">Dr. Aris Thorne (Market Intel)</span>
                      <p className="text-slate-300 text-[11px]">Updated sovereign EU reasoning model radar with strict GDPR boundary guidelines.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">1h ago</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: STRATEGIC HORIZONS & TARGET OKRs */}
        {activeTab === 'horizons' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-400" />
                  Strategic Objectives & Measurable OKRs
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  The executive swarm operates against strict empirical key results with continuous progress tracking.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Target ARR: $1.78M Model
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* OKR 1 */}
              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-4 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">
                        Objective 1: Autonomous Enterprise Onboarding Tier
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-pink-500/10 text-pink-300 border border-pink-500/20">
                        Active Execution
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Co-Owners: Maya Lin (Product) & Julian Cruz (Finance) • Delivery Target: Q3 Sprint
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-emerald-400">88%</span>
                    <div className="text-[10px] text-slate-500 font-mono">Weighted Completion</div>
                  </div>
                </div>

                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-pink-500 to-indigo-500 rounded-full" style={{ width: '88%' }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 1: 15 Pilot Accounts</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Configure automated provisioning for enterprise cohort.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 2: $0.18 Compute Burn</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Enforce strict token caching to prevent prompt inflation.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 3: 80%+ Margin Floor</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Finance officer holds advisory veto on any pricing change.</p>
                  </div>
                </div>
              </div>

              {/* OKR 2 */}
              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-4 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">
                        Objective 2: Sub-50ms Multi-Agent Orchestration Latency
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        Sandbox Verified
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Co-Owners: Sophia Vance (COO) & Dr. Aris Thorne (Research) • Code Name: Project Synapse
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-emerald-400">92%</span>
                    <div className="text-[10px] text-slate-500 font-mono">Weighted Completion</div>
                  </div>
                </div>

                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full" style={{ width: '92%' }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 1: Zero Context Loss</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Preserve state continuity across 9-step work protocol.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 2: P2P Direct Messaging</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Inter-agent delegation with mediation audit logs.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 3: Deterministic Fallback</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Zero crashing under rate-limiting or network outage.</p>
                  </div>
                </div>
              </div>

              {/* OKR 3 */}
              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-4 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">
                        Objective 3: Continuous Market Reconnaissance & Sovereign IP
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Operational
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Lead Owner: Dr. Aris Thorne (Market & Intel) • Focus: Frontier Models & Sovereignty
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-amber-400">84%</span>
                    <div className="text-[10px] text-slate-500 font-mono">Weighted Completion</div>
                  </div>
                </div>

                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: '84%' }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 1: 12 Models Tracked</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Benchmark speed, reasoning depth, and prompt price-performance.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 2: EU AI Compliance</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Audit sovereign data isolation and verifiable provenance.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="flex items-center text-emerald-400 font-semibold gap-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>KR 3: Bi-Weekly Synthesis</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Deliver automated executive competitor diffs to Founder.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SWARM VELOCITY & ORG VECTORS */}
        {activeTab === 'swarm' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Autonomous Organizational Vector & Swarm Hierarchy
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Founder maintains sovereign ratification authority; AI executives lead departmental operations autonomously.
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                Swarm Status: Level 4 Autonomous
              </span>
            </div>

            {/* Apex: Founder Card */}
            <div className="flex justify-center">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#121424] via-[#0d0f18] to-[#0a0c14] border border-indigo-500/40 text-center shadow-xl w-80 space-y-3">
                <AgentAvatar
                  roleOrId="founder"
                  name="Founder"
                  size="lg"
                  showStatus
                  status="active"
                  showGlow
                  className="mx-auto"
                />
                <div>
                  <div className="font-bold text-sm text-white">The Founder</div>
                  <div className="text-xs text-indigo-400 font-mono">Sovereign Human-in-the-Loop Authority</div>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed border-t border-white/5 pt-2">
                  Sole executive ratification authority. Holds veto over financial transfers, external code deployments, and policy mutations.
                </p>
              </div>
            </div>

            {/* Tree Branch Visual Connector */}
            <div className="w-px h-6 bg-indigo-500/40 mx-auto" />

            {/* 4 Specialized Autonomous Leads */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {INITIAL_AGENTS.map((agent) => (
                <div
                  key={agent.id}
                  className="p-5 rounded-2xl bg-[#0c0e18] border border-white/10 text-center space-y-3 hover:border-indigo-500/40 hover:bg-white/[0.02] transition-all shadow-lg group"
                >
                  <AgentAvatar
                    roleOrId={agent.id}
                    name={agent.name}
                    size="lg"
                    showStatus
                    status="active"
                    interactive
                    showGlow
                    className="mx-auto"
                  />
                  <div>
                    <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition-colors">
                      {agent.name}
                    </div>
                    <div className="text-[10px] text-indigo-400 font-medium mt-0.5">{agent.role}</div>
                  </div>
                  <div className="text-[11px] text-slate-400 border-t border-white/5 pt-2 leading-relaxed">
                    {agent.bio.slice(0, 85)}...
                  </div>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Division:</span>
                    <span className="text-emerald-400 font-semibold">Autonomous Lead</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Swarm Communication Protocol Telemetry */}
            <div className="p-5 rounded-2xl bg-[#0b0d16] border border-white/10 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Workflow className="w-4 h-4 text-indigo-400" />
                Inter-Agent Peer Communication & Mediation Architecture
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                SamJuniors OS enforces peer-to-peer delegation between AI employees (e.g. Maya delegates research questions to Dr. Aris; Julian verifies compute costs before specs are published). Sophia Vance (COO) actively mediates all inter-agent sub-tasks to guarantee SLA compliance and eliminate circular dependencies.
              </p>
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Mediation Mode</div>
                  <div className="text-sm font-bold text-white mt-0.5">Active Auto-Resolution</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Protocol Adherence</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">99.4% Verified</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Context Provenance</div>
                  <div className="text-sm font-bold text-indigo-300 mt-0.5">Cryptographic Hashes</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONSTITUTIONAL GOVERNANCE & INVARIANTS */}
        {activeTab === 'constitution' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  SamJuniors OS Immutable Constitution
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Immutable governing articles regulating autonomous agent execution, budget limits, and human escalation.
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                4 Articles Enforced
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-2 hover:border-purple-500/30 transition-all shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Article I: Mission & Autonomous Mandate</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    Foundational
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  SamJuniors operates as a high-velocity, autonomous company where specialized AI executives plan, design, build, and optimize company value with deterministic human-in-the-loop safeguards.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-2 hover:border-emerald-500/30 transition-all shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Article II: Financial Sovereignty & Margin Floor</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Enforced Floor
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Julian Cruz (Finance) holds advisory veto over any workflow exceeding 20% compute-to-revenue ratio. All initiatives must maintain an 80%+ gross margin floor under verified simulation.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-2 hover:border-blue-500/30 transition-all shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Article III: Empirical Grounding & Truthful SLA</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    Enforced SLA
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Dr. Aris Thorne (Research) must ground all market claims in verifiable data. Sophia Vance (COO) verifies protocol compliance before delivering final executive reports to the Founder.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0c0e17] border border-white/10 space-y-2 hover:border-amber-500/30 transition-all shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Article IV: Founder Escalation Threshold</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Strict Safeguard
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Irreversible financial transfers, live external production code deployments, and breaking schema changes require explicit Founder ratification via SamJuniors OS notifications.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: BOARD SYNTHESIS BRIEFING */}
        {activeTab === 'board' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  Autonomous Executive Council Board Briefing
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Synthesized strategic intelligence auto-generated by the Executive AI Council based on verifiable company state.
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                Safe Sandbox Validated
              </span>
            </div>

            <div className="p-6 rounded-2xl bg-[#0c0e18] border border-white/10 space-y-5 text-xs text-slate-200 leading-relaxed shadow-xl">
              <div className="border-b border-white/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white">Executive Strategic Council Synthesis</h4>
                  <p className="text-[11px] text-slate-400">Prepared for: Sovereign Founder • Strategy Horizon Q3-Q4 2026</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Last Council Audit: Today at 09:30 AM
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Projected Target ARR</div>
                  <div className="text-lg font-mono font-bold text-white">$1.78M Model</div>
                  <div className="text-[10px] text-slate-500">25 Enterprise Cohort</div>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Gross Margin Floor</div>
                  <div className="text-lg font-mono font-bold text-emerald-400">86.4% Projected</div>
                  <div className="text-[10px] text-slate-500">Exceeds 80% Requirement</div>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Simulated Runway</div>
                  <div className="text-lg font-mono font-bold text-indigo-300">42 Months</div>
                  <div className="text-[10px] text-slate-500">Under Conservative Growth</div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h5 className="font-bold text-white text-xs uppercase tracking-wider text-indigo-300">
                  Executive Council Summary Points:
                </h5>
                <ul className="list-disc pl-5 space-y-2 text-slate-300 leading-relaxed">
                  <li>
                    <strong className="text-white">Radical Capital Efficiency:</strong> Operating with 4 specialized AI executive officers eliminates traditional SaaS personnel burn ($45k–$70k/month in standard developer/sales salaries), delivering immediate cash flow sovereignty.
                  </li>
                  <li>
                    <strong className="text-white">Strict Invariant Enforcement:</strong> Every deliverable produced by the company swarm undergoes the 9-Step Agent Work Protocol, guaranteeing that hallucinations, rate-limit crashes, or margin violations are stopped before founder delivery.
                  </li>
                  <li>
                    <strong className="text-white">Q4 Horizon Positioning:</strong> Project Lumora (Self-Serve Tier) is scheduled for cohort rollout to 15 waitlisted accounts, generating automated expansion revenue with strictly metered $0.18/tenant compute cost.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
