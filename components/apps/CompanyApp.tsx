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
import { INITIAL_AGENTS, INITIAL_FINANCIALS } from '@/lib/os-data';

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
      description: 'Julian Cruz (Finance) holds veto power over any workflow exceeding 20% compute-to-revenue ratio. All initiatives must maintain an 80%+ gross margin floor.',
      severity: 'Enforced',
    },
    {
      id: 'rule-3',
      title: 'Article III: Zero Hallucination SLA',
      description: 'Dr. Aris Thorne (Research) must ground all competitive claims in empirical data. Sophia Vance (COO) verifies SLA uptime thresholds before approving automated deployments.',
      severity: 'Enforced',
    },
    {
      id: 'rule-4',
      title: 'Article IV: Founder Escalation Threshold',
      description: 'Expenditures over $5,000, major legal contractual modifications, and breaking schema changes require explicit Founder sign-off via SamJuniors OS notifications.',
      severity: 'Safeguard',
    },
  ];

  const okrs = [
    {
      id: 'okr-1',
      objective: 'Scale Autonomous Enterprise ARR to $3.0M',
      progress: 68,
      owner: 'Julian Cruz & Sophia Vance',
      status: 'On Track',
      keyResults: [
        'Close 25 new Enterprise accounts (Current: 18)',
        'Maintain gross margin above 85% (Current: 86.4%)',
        'Reduce blended compute cost per customer to <$18/mo',
      ],
    },
    {
      id: 'okr-2',
      objective: 'Achieve Sub-50ms Multi-Agent Orchestration Latency',
      progress: 88,
      owner: 'Maya Lin & Dr. Aris Thorne',
      status: 'Ahead',
      keyResults: [
        'Deploy peer-to-peer neural message streaming',
        'Eliminate context degradation across 50-step conversations',
        'Automate 95% of routine PRD & research generation',
      ],
    },
    {
      id: 'okr-3',
      objective: 'Zero-Downtime Autonomous Self-Healing Infrastructure',
      progress: 94,
      owner: 'Sophia Vance (COO)',
      status: 'Target Met',
      keyResults: [
        '99.98% SLA across all worker clusters',
        'Automatic failover routing for rate-limited API calls',
        'Automated real-time anomaly detection in customer billing',
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
          <span>Strategic OKRs (Q3/Q4)</span>
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
                Ratified by Founder
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {constitutionRules.map((rule) => (
                <div
                  key={rule.id}
                  className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-2 hover:border-blue-500/40 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">{rule.title}</span>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-400" />
                  Autonomous Strategic Objectives (OKRs)
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time objective tracking driven by AI workforce telemetry and financial ledger feeds.
                </p>
              </div>
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
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-500/40 text-center shadow-xl w-64">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 mx-auto flex items-center justify-center font-bold text-white text-xs mb-1.5">
                  F
                </div>
                <div className="font-bold text-xs text-white">Founder (Human-in-the-Loop)</div>
                <div className="text-[10px] text-indigo-400">Chief Executive Authority</div>
              </div>
            </div>

            {/* Tree Branch Line */}
            <div className="w-px h-6 bg-indigo-500/40 mx-auto" />

            {/* Row: 4 Autonomous AI Executives */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {INITIAL_AGENTS.map((agent) => (
                <div
                  key={agent.id}
                  className="os-glass-card rounded-2xl p-4 border border-white/10 text-center space-y-2 hover:border-indigo-500/40 transition-all"
                >
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${agent.avatarColor} mx-auto flex items-center justify-center text-xs font-bold text-white shadow-md`}
                  >
                    {agent.role.split(' ')[0]}
                  </div>
                  <div className="font-bold text-xs text-white">{agent.name}</div>
                  <div className="text-[10px] text-indigo-400">{agent.role}</div>
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
                Autonomous Board of Directors Executive Briefing
              </h3>
              <p className="text-xs text-slate-400">
                Synthesized quarterly board report auto-generated by the Executive AI Council.
              </p>
            </div>

            <div className="os-glass-card rounded-2xl p-6 border border-white/10 space-y-4 text-xs leading-relaxed text-slate-200">
              <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-white">Q3 Executive Performance Briefing</span>
                  <p className="text-[10px] text-slate-400">Prepared for: Founder & Advisory Board</p>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-500/30">
                  Audited Clean
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Annualized Revenue</div>
                  <div className="text-base font-mono font-bold text-white mt-1">$1.78M ARR</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Blended Gross Margin</div>
                  <div className="text-base font-mono font-bold text-emerald-400 mt-1">86.4%</div>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Operational Runway</div>
                  <div className="text-base font-mono font-bold text-indigo-300 mt-1">42 Months</div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <h5 className="font-bold text-white">Executive Summary Highlights:</h5>
                <ul className="list-disc pl-5 space-y-1 text-slate-300">
                  <li>Zero payroll burn: Company functions on 4 autonomous AI executive leaders, reducing overhead by 92% compared to human-equivalent leadership teams.</li>
                  <li>Multi-Agent throughput exceeded 2,100 automated directives processed with a 99.2% accuracy score.</li>
                  <li>Enterprise self-serve tier is positioned for Q4 release, targeting $3.4M ARR by end of FY2027.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
