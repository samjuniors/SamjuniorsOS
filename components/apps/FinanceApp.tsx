'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { SAMPLE_FINANCIAL_MODEL } from '@/lib/os-data';

export const FinanceApp: React.FC = () => {
  const [financials, setFinancials] = useState(SAMPLE_FINANCIAL_MODEL);
  const [activeTab, setActiveTab] = useState<'pnl' | 'compute' | 'simulator' | 'invoices'>('pnl');

  // Simulator Sliders
  const [simAccounts, setSimAccounts] = useState(45);
  const [simPricePerSeat, setSimPricePerSeat] = useState(249);
  const [simTokenCostRatio, setSimTokenCostRatio] = useState(14); // 14% cost

  const calculatedMRR = simAccounts * simPricePerSeat;
  const calculatedARR = calculatedMRR * 12;
  const calculatedComputeBurn = calculatedMRR * (simTokenCostRatio / 100);
  const calculatedNetMargin = 100 - simTokenCostRatio;

  const simulatedInvoices = [
    { id: 'sim-inv-892', vendor: 'Google Cloud Platform (Vertex/TPU - Projected)', amount: '$14,820.00', status: 'Model Estimate', date: 'Sep 1, 2026', auditor: 'Julian Cruz' },
    { id: 'sim-inv-891', vendor: 'Anthropic Claude 3.5 API Tier (Projected)', amount: '$3,420.00', status: 'Model Estimate', date: 'Aug 28, 2026', auditor: 'Julian Cruz' },
    { id: 'sim-inv-890', vendor: 'Target Customer Net Inflow (Projected)', amount: '+$142,000.00', status: 'Model Estimate', date: 'Aug 25, 2026', auditor: 'Julian Cruz' },
  ];

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
            <span>Token & Compute Cost Attribution</span>
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
          Financial Sandbox • Julian Cruz
        </span>
      </div>

      {/* Simulation Banner Notice */}
      <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-1.5 flex items-center justify-between text-[11px] text-emerald-300">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <strong>Financial Sandbox & Planning Mode:</strong> All figures represent computational unit models, pricing stress-tests, and compute attribution.
        </span>
        <span className="font-mono text-[10px] text-emerald-400">Deterministic Formula Model</span>
      </div>

      {/* Main Tab View */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
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
                Simulated Income Statement (P&L Model)
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-200">
                  <span>Gross Target Subscriptions (Simulated)</span>
                  <span className="text-emerald-400 font-bold">$148,500.00</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-400">
                  <span>(-) Gemini 2.5 Flash Batch Token Cost Estimate</span>
                  <span className="text-rose-400">-$12,400.00</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-400">
                  <span>(-) Dedicated Cloud Run & VPC Infrastructure Estimate</span>
                  <span className="text-rose-400">-$7,000.00</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5 text-slate-400">
                  <span>(-) Payment Gateway Fee Estimate (2.9%)</span>
                  <span className="text-rose-400">-$4,306.50</span>
                </div>
                <div className="flex justify-between py-2 text-white font-bold text-sm bg-white/5 px-3 rounded-lg">
                  <span>Projected Net Operating Income (Model EBITDA)</span>
                  <span className="text-emerald-400">$124,793.50 (84.0% Net Margin)</span>
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
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Dr. Aris Thorne (Research Radar & Benchmarks)</span>
                    <span className="font-mono text-amber-400 font-bold">$5,820 (41%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 w-[41%]" />
                  </div>

                  <div className="flex justify-between pt-1">
                    <span>Sophia Vance (Multi-Agent Swarm Orchestration)</span>
                    <span className="font-mono text-purple-400 font-bold">$4,200 (30%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400 w-[30%]" />
                  </div>

                  <div className="flex justify-between pt-1">
                    <span>Maya Lin (PRD & Architecture Specifications)</span>
                    <span className="font-mono text-rose-400 font-bold">$2,380 (17%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-400 w-[17%]" />
                  </div>

                  <div className="flex justify-between pt-1">
                    <span>Julian Cruz (Financial Audits & Ledger Sync)</span>
                    <span className="font-mono text-emerald-400 font-bold">$1,600 (12%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 w-[12%]" />
                  </div>
                </div>
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
              Simulated Invoice & Cost Estimates Ledger
            </h3>

            <div className="space-y-2">
              {simulatedInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="os-glass-card rounded-xl p-3.5 border border-white/10 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-white">{inv.vendor}</div>
                    <div className="text-[10px] text-slate-400 font-mono">Simulated ID: {inv.id} • {inv.date}</div>
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
          </div>
        )}
      </div>
    </div>
  );
};
