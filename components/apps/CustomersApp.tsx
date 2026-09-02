'use client';

import React, { useState } from 'react';
import {
  Users,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { CustomerDeal } from '@/types/os';
import { INITIAL_DEALS } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';

export const CustomersApp: React.FC = () => {
  const [deals, setDeals] = useState<CustomerDeal[]>(INITIAL_DEALS);
  const [selectedDeal, setSelectedDeal] = useState<CustomerDeal>(INITIAL_DEALS[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [isNewDealModalOpen, setIsNewDealModalOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newTier, setNewTier] = useState<'Enterprise' | 'Scale' | 'Autonomous Pro'>('Enterprise');
  const [newArr, setNewArr] = useState('$65,000');

  const filteredDeals = deals.filter((deal) => {
    const matchesSearch =
      deal.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deal.leadAgent.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = stageFilter === 'All' || deal.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const totalPipelineARR = deals.reduce((acc, deal) => {
    const val = parseInt(deal.arr.replace(/[^0-9]/g, ''), 10) || 0;
    return acc + val;
  }, 0);

  const handleAddDeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    const newDealItem: CustomerDeal = {
      id: `deal-${Date.now()}`,
      companyName: newCompanyName.trim(),
      logoLetter: newCompanyName.trim()[0].toUpperCase(),
      tier: newTier,
      arr: newArr,
      stage: 'AI Demo',
      leadAgent: 'Maya Lin & Sophia Vance',
      health: 'High',
      lastInteraction: 'Autonomous discovery synthesis dispatched to prospect',
      notes: 'Ingested public data to generate personalized AI company workspace demo.',
    };

    setDeals([newDealItem, ...deals]);
    setSelectedDeal(newDealItem);
    setIsNewDealModalOpen(false);
    setNewCompanyName('');
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Sub-Header Bar */}
      <div className="h-12 px-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between select-none">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Autonomous B2B CRM</span>
          </div>

          <span className="hidden sm:inline text-xs text-slate-400 font-mono">
            Pipeline ARR: <strong className="text-emerald-400 font-bold">${(totalPipelineARR / 1000).toFixed(0)}k</strong>
          </span>
        </div>

        {/* Filter & Search */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search accounts..."
              className="pl-8 pr-3 py-1 rounded-lg bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            id="add-customer-deal-btn"
            onClick={() => setIsNewDealModalOpen(true)}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Main Split View */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3">
        {/* Left Col: Deals List */}
        <div className="border-r border-white/10 overflow-y-auto p-3 space-y-2 bg-slate-950/50">
          {/* Stage Filter Buttons */}
          <div className="flex flex-wrap gap-1 pb-2 border-b border-white/10">
            {['All', 'Discovery', 'AI Demo', 'Contract Review', 'Closed Won'].map((st) => (
              <button
                key={st}
                onClick={() => setStageFilter(st)}
                className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                  stageFilter === st
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {filteredDeals.map((deal) => (
            <button
              key={deal.id}
              id={`customer-deal-${deal.id}`}
              onClick={() => setSelectedDeal(deal)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedDeal.id === deal.id
                  ? 'os-glass-card-active border-emerald-500/60 shadow-lg ring-1 ring-emerald-500/30'
                  : 'os-glass-card border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white truncate">{deal.companyName}</span>
                <span className="text-xs font-mono font-bold text-emerald-400">{deal.arr}</span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                <span>{deal.tier}</span>
                <span
                  className={`px-1.5 py-0.2 rounded font-mono ${
                    deal.stage === 'Closed Won'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : deal.stage === 'Contract Review'
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {deal.stage}
                </span>
              </div>

              <div className="mt-2 text-[9px] text-slate-400 border-t border-white/5 pt-1 truncate">
                Lead: <strong className="text-slate-300">{deal.leadAgent}</strong>
              </div>
            </button>
          ))}
        </div>

        {/* Right 2 Cols: Selected Account Detail & Interaction Log */}
        <div className="md:col-span-2 overflow-y-auto p-5 space-y-5 bg-slate-950/80">
          {selectedDeal ? (
            <>
              {/* Account Header */}
              <div className="flex items-start justify-between pb-4 border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-lg font-bold text-white shadow-lg">
                    {selectedDeal.logoLetter}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedDeal.companyName}</h3>
                    <p className="text-xs text-emerald-400">{selectedDeal.tier} Plan • {selectedDeal.stage}</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Contract ARR</div>
                  <div className="text-base font-mono font-bold text-emerald-400">{selectedDeal.arr}</div>
                </div>
              </div>

              {/* Status Metrics Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Account Health</div>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    {selectedDeal.health}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Lead AI Handler</div>
                  <div className="text-xs font-mono font-bold text-indigo-300 mt-1 truncate">
                    {selectedDeal.leadAgent}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-slate-400">Autonomous SLA</div>
                  <div className="text-xs font-mono font-bold text-cyan-300 mt-1">
                    99.98% Monitored
                  </div>
                </div>
              </div>

              {/* Notes & Specs */}
              <div className="os-glass-card rounded-xl p-4 border border-white/10 space-y-2">
                <h4 className="text-xs font-bold text-white">Autonomous Account Notes & Scope</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedDeal.notes}</p>
                <div className="text-[10px] text-slate-400 pt-2 border-t border-white/5">
                  Last Activity: <strong className="text-slate-200">{selectedDeal.lastInteraction}</strong>
                </div>
              </div>

              {/* Autonomous AI Action Logs */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  Live AI Engagement Log
                </h4>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="font-mono text-indigo-400">Sophia Vance (COO)</span>
                    <span>1 hour ago</span>
                  </div>
                  <p className="text-slate-300">
                    Auto-generated security posture document and token usage bounds. Sent confirmation to client technical contact.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="font-mono text-emerald-400">Julian Cruz (Finance)</span>
                    <span>4 hours ago</span>
                  </div>
                  <p className="text-slate-300">
                    Reconciled credit limits and configured Stripe billing webhook with 86% margin floor guardrail.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              Select an account to view CRM history and autonomous actions.
            </div>
          )}
        </div>
      </div>

      {/* Add Deal Modal */}
      {isNewDealModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md os-glass rounded-2xl p-5 border border-white/20 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              Provision New Autonomous Account
            </h3>

            <form onSubmit={handleAddDeal} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Acme AI Technologies"
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Contract Tier
                  </label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Enterprise">Enterprise</option>
                    <option value="Scale">Scale</option>
                    <option value="Autonomous Pro">Autonomous Pro</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Target ARR
                  </label>
                  <input
                    type="text"
                    value={newArr}
                    onChange={(e) => setNewArr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewDealModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg transition-colors"
                >
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
