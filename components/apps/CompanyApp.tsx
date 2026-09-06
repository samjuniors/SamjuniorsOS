'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { INITIAL_AGENTS, SAMPLE_FINANCIAL_MODEL } from '@/lib/os-data';
import { AgentAvatar } from '@/components/os/AgentAvatar';

export const CompanyApp: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'constitution' | 'okrs' | 'org' | 'board'>('constitution');

  const constitutionRules = [
    {
      id: 'rule-1',
      title: 'Article I: Mission & Autonomous Mandate',
      description: 'SamJuniors operates as a high-velocity, autonomous company where specialized AI executives plan, design, build, and optimize company value with deterministic human-in-the-loop safeguards.',
      severity: 'Foundational',
    },
    {
      id: 'rule-2',
      title: 'Article II: Financial Sovereignty & Unit Economics',
      description: 'Julian Cruz (Finance) holds advisory veto over any workflow exceeding 20% compute-to-revenue ratio. All initiatives must maintain an 80%+ gross margin floor.',
      severity: 'Enforced',
    },
    {
      id: 'rule-3',
      title: 'Article III: Empirical Grounding & Truthful SLA',
      description: 'Dr. Aris Thorne (Research) must ground all market claims in verifiable data. Sophia Vance (COO) verifies protocol compliance before delivering final executive reports.',
      severity: 'Enforced',
    },
    {
      id: 'rule-4',
      title: 'Article IV: Founder Escalation Threshold',
      description: 'Irreversible financial transfers, live production code deployments, and breaking schema changes require explicit Founder sign-off via SamJuniors OS notifications.',
      severity: 'Safeguard',
    },
  ];

  const okrs = [
    {
      id: 'okr-1',
      objective: 'Target Scale: Autonomous Enterprise Tier Modeling',
      progress: 75,
      owner: 'Julian Cruz & Sophia Vance',
      status: 'Active Planning',
      keyResults: [
        'Model pricing for 25 pilot Enterprise accounts',
        'Simulate unit economics with >80% gross margin target floor',
        'Model blended compute cost per tenant to <$0.20 onboarding burn',
      ],
    },
    {
      id: 'okr-2',
      objective: 'Achieve Sub-50ms Multi-Agent Orchestration Latency',
      progress: 88,
      owner: 'Maya Lin & Dr. Aris Thorne',
      status: 'In Sandbox',
      keyResults: [
        'Architect peer-to-peer neural message streaming PRD',
        'Eliminate context degradation across 9-step work protocol',
        'Automate 100% of routine PRD & research generation in safe sandbox',
      ],
    },
    {
      id: 'okr-3',
      objective: 'Zero-Downtime Autonomous Self-Healing Infrastructure',
      progress: 90,
      owner: 'Sophia Vance (COO)',
      status: 'Verified',
      keyResults: [
        'Maintain deterministic safe sandbox boundaries for all agent executions',
        'Automatic failover routing for rate-limited API calls',
        'Automated anomaly detection in simulated unit economics',
      ],
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Sub-Header Tabs */}
      <div className="h-11 px-4 border-b border-white/10 bg-slate-900/60 flex items-center space-x-2 select-none">
        <button
          id="company-tab-constitution"
          onClick={() => setActiveSection('constitution')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
            activeSection === 'constitution'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Constitution & Governance</span>
        </button>

        <button
          id="company-tab-okrs"
          onClick={() => setActiveSection('okrs')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
            activeSection === 'okrs'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>Strategic Objectives & OKRs</span>
        </button>

        <button
          id="company-tab-org"
          onClick={() => setActiveSection('org')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
            activeSection === 'org'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Autonomous Org Chart</span>
        </button>

        <button
          id="company-tab-board"
          onClick={() => setActiveSection('board')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
            activeSection === 'board'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Board Synthesis</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {activeSection === 'constitution' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  SamJuniors AI Company Constitution
                </h3>
                <p className="text-xs text-slate-400">
                  Immutable governing principles and ethical constraints regulating autonomous agent execution.
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-500/30">
                Constitution Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {constitutionRules.map((rule) => (
                <div
                  key={rule.id}
                  className="os-glass-card rounded-2xl p-4.5 border border-white/10 space-y-2 hover:border-blue-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{rule.title}</span>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                        rule.severity === 'Foundational'
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                          : rule.severity === 'Enforced'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{rule.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'okrs' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-400" />
                Strategic Objectives & Target OKRs
              </h3>
              <p className="text-xs text-slate-400">
                Core roadmap deliverables tracked across the 4 executive AI leads.
              </p>
            </div>

            <div className="space-y-4">
              {okrs.map((okr) => (
                <div
                  key={okr.id}
                  className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white">{okr.objective}</h4>
                      <p className="text-[10px] text-slate-400">Owner: {okr.owner}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {okr.status}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {okr.progress}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                      style={{ width: `${okr.progress}%` }}
                    />
                  </div>

                  {/* Key Results */}
                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                    {okr.keyResults.map((kr, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-start space-x-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                        <span>{kr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'org' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Autonomous Executive Org Hierarchy
              </h3>
              <p className="text-xs text-slate-400">
                Founder holds executive oversight; specialized AI agents hold autonomous department execution authority.
              </p>
            </div>

            {/* Top: Founder */}
            <div className="flex justify-center">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950 via-[#131326] to-slate-900 border border-indigo-500/40 text-center shadow-xl w-72 space-y-2">
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
                  <div className="font-bold text-xs text-white">Founder (Human-in-the-Loop)</div>
                  <div className="text-[10px] text-indigo-400 font-mono">Chief Executive Authority</div>
                </div>
              </div>
            </div>

            {/* Tree Branch Line */}
            <div className="w-px h-6 bg-indigo-500/40 mx-auto" />

            {/* Row: 4 Autonomous AI Executives */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {INITIAL_AGENTS.map((agent) => (
                <div
                  key={agent.id}
                  className="os-glass-card rounded-2xl p-4 border border-white/10 text-center space-y-2.5 hover:border-indigo-500/50 hover:bg-white/[0.04] transition-all group"
                >
                  <AgentAvatar
                    roleOrId={agent.id}
                    name={agent.name}
                    size="lg"
                    showStatus
                    status={agent.status}
                    interactive
                    showGlow
                    className="mx-auto"
                  />
                  <div>
                    <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition-colors">
                      {agent.name}
                    </div>
                    <div className="text-[10px] text-indigo-400 font-medium">{agent.role}</div>
                  </div>
                  <div className="text-[9px] text-slate-400 border-t border-white/5 pt-2">
                    {agent.department}
                  </div>
                  <div className="text-[9px] font-mono text-emerald-400 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Autonomous Authority
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'board' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Autonomous Executive Council Board Briefing
              </h3>
              <p className="text-xs text-slate-400">
                Synthesized strategic briefing auto-generated by the Executive AI Council based on simulation modeling.
              </p>
            </div>

            <div className="os-glass-card rounded-2xl p-6 border border-white/10 space-y-4 text-xs leading-relaxed text-slate-200">
              <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-white">Executive Strategic Briefing</span>
                  <p className="text-[10px] text-slate-400">Prepared for: Founder & Strategic Planning</p>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-500/30">
                  Safe Sandbox Validated
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Projected Target ARR</div>
                  <div className="text-base font-mono font-bold text-white mt-1">$1.78M Target</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Target Gross Margin</div>
                  <div className="text-base font-mono font-bold text-emerald-400 mt-1">86.4% Floor</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Modeled Runway</div>
                  <div className="text-base font-mono font-bold text-indigo-300 mt-1">42 Months</div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <h5 className="font-bold text-white">Executive Strategy Highlights:</h5>
                <ul className="list-disc pl-5 space-y-1 text-slate-300">
                  <li>Autonomous Workforce Model: Company functions on 4 specialized AI executive leads with zero payroll overhead.</li>
                  <li>Protocol Reliability: Strict 9-step Agent Work Protocol enforces empirical grounding, risk modeling, and multi-agent peer reviews.</li>
                  <li>Enterprise self-serve tier is positioned for Q4 release, targeting frictionless onboarding with $0.18 compute burn per tenant.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
