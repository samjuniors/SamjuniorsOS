'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Cpu,
  Zap,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Play,
  RotateCcw,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Boxes,
  Compass,
  BrainCircuit,
} from 'lucide-react';
import { SAMPLE_FINANCIAL_MODEL } from '@/lib/os-data';
import { AppId } from '@/types/os';
import { CollaborationStore } from '@/lib/collaboration-store';
import { playOSSound } from '../os/IconHelper';

interface FinanceAppProps {
  onOpenApp?: (appId: AppId) => void;
  soundEnabled?: boolean;
}

export const FinanceApp: React.FC<FinanceAppProps> = ({ onOpenApp, soundEnabled }) => {
  const [financials, setFinancials] = useState(SAMPLE_FINANCIAL_MODEL);
  const [activeTab, setActiveTab] = useState<'pnl' | 'compute' | 'guardrails' | 'simulator' | 'invoices'>('pnl');
  const [collabState, setCollabState] = useState(() => CollaborationStore.getState());

  useEffect(() => {
    const unsub = CollaborationStore.subscribe(() => {
      const state = CollaborationStore.getState();
      setCollabState({ ...state });
    });

    const handleCollabEvent = () => {
      const state = CollaborationStore.getState();
      setCollabState({ ...state });
    };

    window.addEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    return () => {
      unsub();
      window.removeEventListener('samjuniors-collaboration-updated', handleCollabEvent);
    };
  }, []);

  // Simulator Sliders
  const [simAccounts, setSimAccounts] = useState(45);
  const [simPricePerSeat, setSimPricePerSeat] = useState(249);
  const [simTokenCostRatio, setSimTokenCostRatio] = useState(14); // 14% cost

  const calculatedMRR = simAccounts * simPricePerSeat;
  const calculatedARR = calculatedMRR * 12;
  const calculatedComputeBurn = calculatedMRR * (simTokenCostRatio / 100);
  const calculatedNetMargin = 100 - simTokenCostRatio;

  // Invoices & Ledger
  const [invoices, setInvoices] = useState<Array<{ id: string; vendor: string; amount: string; status: string; date: string; auditor: string }>>([]);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Sub-Header */}
      <div className="h-11 px-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('pnl')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'pnl'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Unit Economics Model</span>
          </button>

          <button
            onClick={() => setActiveTab('compute')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'compute'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Token & Compute Cost</span>
          </button>

          <button
            onClick={() => setActiveTab('guardrails')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'guardrails'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="flex items-center gap-1">
              Budget Guardrails
              {(collabState.currentStepIndex >= 3 || collabState.status === 'completed') && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'simulator'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Runway & Pricing Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'invoices'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Simulated Cost Invoices</span>
          </button>
        </div>

        <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/20">
          Financial Desk • Julian Cruz
        </span>
      </div>

      {/* AI Employee Collaboration Workflow Banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-purple-950/40 to-slate-900 border-b border-emerald-500/20 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <span className="font-bold text-white text-xs">
              Cross-Functional Consultation: Julian Cruz ↔ Dr. Thorne (Research) ↔ Maya Lin (PM)
            </span>
            <span className="text-[10px] text-slate-400 ml-2">
              {collabState.status === 'completed'
                ? 'Julian Cruz audited and enforced $0.038 compute cap and 84.2% margin for Real-Time Memory Tier.'
                : collabState.status === 'running'
                ? `Current Step: ${collabState.steps[collabState.currentStepIndex]?.title}`
                : 'Simulate Julian setting financial guardrails when Dr. Thorne requests budget approval.'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {collabState.status === 'idle' && (
            <button
              onClick={() => CollaborationStore.runFullSimulation(1400)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Simulate Workflow</span>
            </button>
          )}

          {collabState.status === 'running' && (
            <button
              onClick={() => CollaborationStore.stepForward()}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center space-x-1"
            >
              <span>Next Step ({collabState.currentStepIndex + 1}/7)</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          {collabState.status === 'completed' && onOpenApp && (
            <>
              <button
                onClick={() => onOpenApp('research')}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-medium flex items-center space-x-1"
              >
                <Compass className="w-3 h-3" />
                <span>View Research Memo</span>
              </button>
              <button
                onClick={() => onOpenApp('products')}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-medium flex items-center space-x-1"
              >
                <Boxes className="w-3 h-3" />
                <span>View Maya Lin&apos;s PRD</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Tab View */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {activeTab === 'guardrails' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Inter-Agent Financial Guardrails & Initiative Allocations
                </h3>
                <p className="text-xs text-slate-400">
                  Julian Cruz actively reviews technical initiatives dispatched by Dr. Thorne and Maya Lin before capital deployment.
                </p>
              </div>
            </div>

            {/* Collaborative Initiative Card */}
            <div className="os-glass-card rounded-2xl p-5 border border-emerald-500/50 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-black space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Initiative: Autonomous Real-Time Memory Tier
                    </h4>
                    <p className="text-xs text-slate-400">
                      Multi-Agent Collaboration: Dr. Aris Thorne (Research) ➔ Julian Cruz (Finance) ➔ Maya Lin (PM)
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Audited & Approved
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block font-mono">Max Compute Cap</span>
                  <strong className="text-sm font-mono text-emerald-400">$0.038 / 1k queries</strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Strict execution limit</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block font-mono">Target Gross Margin</span>
                  <strong className="text-sm font-mono text-emerald-400">84.2% Floor</strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">+4.2% above baseline</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block font-mono">Incremental ARR</span>
                  <strong className="text-sm font-mono text-white">+$380,000</strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Projected annual expansion</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block font-mono">Architecture Constraint</span>
                  <strong className="text-xs font-mono text-cyan-400">LRU + Batch Embeddings</strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Caches 70%+ lookups</span>
                </div>
              </div>

              {/* Consultation Transcript snippet */}
              <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 text-xs text-slate-300 space-y-2">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Julian Cruz&apos;s Consultation Audit Note:</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  &ldquo;I have audited Dr. Thorne&apos;s market proposal for the Real-Time Memory Tier. Uncontrolled embedding updates could push compute burn to $0.09/task, eroding margins to 67%. I established a non-negotiable compute ceiling of $0.038 per 1,000 operations, requiring Maya Lin&apos;s PRD to mandate a 2-tier LRU cache. Under these terms, the feature generates 84.2% gross margin and adds ~$380k ARR. Approved.&rdquo;
                </p>
              </div>

              {onOpenApp && (
                <div className="flex items-center gap-3 pt-2 border-t border-white/10 text-xs">
                  <button
                    onClick={() => onOpenApp('research')}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>View Dr. Thorne&apos;s Market Memo</span>
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={() => onOpenApp('products')}
                    className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>View Maya Lin&apos;s Ratified PRD</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'pnl' && (
          <div className="space-y-5">
            {/* Top 4 Big Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="os-glass-card rounded-2xl p-4 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Target Run Rate (Model MRR)</div>
                <div className="text-xl font-mono font-bold text-white mt-1.5">
                  ${financials.mrr.toLocaleString()}
                </div>
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" /> Target Scenario: 600 seats
                </div>
              </div>

              <div className="os-glass-card rounded-2xl p-4 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Target Gross Margin</div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-1.5">
                  {financials.grossMargin}%
                </div>
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-0.5">
                  <ShieldCheck className="w-3 h-3" /> Minimum 80% margin floor
                </div>
              </div>

              <div className="os-glass-card rounded-2xl p-4 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Projected Compute Burn</div>
                <div className="text-xl font-mono font-bold text-indigo-300 mt-1.5">
                  ${financials.computeSpend.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  13.6% of simulated revenue
                </div>
              </div>

              <div className="os-glass-card rounded-2xl p-4 border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Modeled Runway</div>
                <div className="text-xl font-mono font-bold text-cyan-300 mt-1.5">
                  {financials.runwayMonths} Months
                </div>
                <div className="text-[10px] text-cyan-400 mt-1">
                  Capital-efficient model
                </div>
              </div>
            </div>

            {/* Detailed P&L Breakdown */}
            <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Income Statement & Unit Economics
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-200">
                  <span>Gross Subscriptions Revenue</span>
                  <span className="text-emerald-400 font-bold">${financials.mrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-400">
                  <span>(-) Batch Token Compute Cost</span>
                  <span className="text-rose-400">-${(financials.computeSpend * 0.6).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-400">
                  <span>(-) Dedicated Infrastructure & Cloud Run</span>
                  <span className="text-rose-400">-${(financials.computeSpend * 0.4).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-400">
                  <span>(-) Payment Gateway Fee (2.9%)</span>
                  <span className="text-rose-400">-${(financials.mrr * 0.029).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 text-white font-bold text-sm bg-white/5 px-3 rounded-lg">
                  <span>Net Operating Income</span>
                  <span className="text-emerald-400">
                    ${financials.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({financials.grossMargin.toFixed(1)}% Gross Margin)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'compute' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Token & Compute Cost Attribution Matrix (Model Breakdown)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white">Estimated Spend Attribution by Agent</h4>
                {financials.computeSpend === 0 ? (
                  <div className="py-6 text-center text-slate-500 space-y-1">
                    <p className="text-xs text-slate-400 font-semibold">Zero Compute Expenditure</p>
                    <p className="text-[11px] text-slate-500">All agent processes are currently idle. Token burn will accrue upon active directive dispatch.</p>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span>Dr. Aris Thorne (Research Radar & Benchmarks)</span>
                      <span className="font-mono text-amber-400 font-bold">${(financials.computeSpend * 0.41).toFixed(0)} (41%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 w-[41%]" />
                    </div>

                    <div className="flex justify-between pt-1">
                      <span>Sophia Vance (Multi-Agent Swarm Orchestration)</span>
                      <span className="font-mono text-purple-400 font-bold">${(financials.computeSpend * 0.30).toFixed(0)} (30%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-400 w-[30%]" />
                    </div>

                    <div className="flex justify-between pt-1">
                      <span>Maya Lin (PRD & Architecture Specifications)</span>
                      <span className="font-mono text-rose-400 font-bold">${(financials.computeSpend * 0.17).toFixed(0)} (17%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-400 w-[17%]" />
                    </div>

                    <div className="flex justify-between pt-1">
                      <span>Julian Cruz (Financial Audits & Ledger Sync)</span>
                      <span className="font-mono text-emerald-400 font-bold">${(financials.computeSpend * 0.12).toFixed(0)} (12%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 w-[12%]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white">Efficiency Optimization Guardrails</h4>
                <ul className="text-xs space-y-2 text-slate-300">
                  <li className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Prompt Caching:</strong> Modeled to reduce token cost by up to 74% on repetitive constitutional validation.</span>
                  </li>
                  <li className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Flash Batching:</strong> Routes offline market summaries into low-cost non-blocking inference windows.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Interactive Financial & Runway Sensitivity Simulator
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sliders */}
              <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Active Customer Workspaces:</span>
                    <span className="font-mono font-bold text-white">{simAccounts} Accounts</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={simAccounts}
                    onChange={(e) => setSimAccounts(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Monthly Price Per Seat ($):</span>
                    <span className="font-mono font-bold text-white">${simPricePerSeat}/mo</span>
                  </div>
                  <input
                    type="range"
                    min="99"
                    max="999"
                    step="10"
                    value={simPricePerSeat}
                    onChange={(e) => setSimPricePerSeat(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Compute Cost Ratio (% of revenue):</span>
                    <span className="font-mono font-bold text-white">{simTokenCostRatio}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    value={simTokenCostRatio}
                    onChange={(e) => setSimTokenCostRatio(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Real-Time Calculation Output */}
              <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-3 font-mono text-xs">
                <h4 className="font-sans font-bold text-white text-xs uppercase tracking-wider">
                  Simulated Outcomes
                </h4>

                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Projected MRR:</span>
                  <span className="font-bold text-white text-sm">${calculatedMRR.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Annual Run Rate (ARR):</span>
                  <span className="font-bold text-emerald-400 text-sm">${calculatedARR.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Monthly Compute Expense:</span>
                  <span className="font-bold text-rose-400">-${calculatedComputeBurn.toFixed(0)}</span>
                </div>
                <div className="flex justify-between py-2 text-emerald-400 font-bold bg-emerald-950/40 px-3 rounded-lg border border-emerald-500/20">
                  <span>Net Gross Margin:</span>
                  <span>{calculatedNetMargin.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Invoices & Cost Ledger
            </h3>

            {invoices.length === 0 ? (
              <div className="os-glass-card rounded-2xl p-8 text-center text-slate-500 space-y-2">
                <FileText className="w-8 h-8 mx-auto opacity-30 text-emerald-400" />
                <p className="text-xs font-semibold text-slate-300">No Invoices or Ledger Entries</p>
                <p className="text-[11px] text-slate-500">
                  Infrastructure expenses, vendor compute statements, and customer payments will be logged here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="os-glass-card rounded-xl p-3.5 border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-white">{inv.vendor}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {inv.id} • {inv.date}</div>
                    </div>

                    <div className="text-right space-y-0.5">
                      <div className={`font-mono font-bold ${inv.amount.startsWith('+') ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {inv.amount}
                      </div>
                      <div className="text-[9px] text-emerald-400 font-mono flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> {inv.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
