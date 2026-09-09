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
  const [selectedDeal, setSelectedDeal] = useState<CustomerDeal | null>(INITIAL_DEALS[0] || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [isNewDealModalOpen, setIsNewDealModalOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newTier, setNewTier] = useState<'Enterprise' | 'Scale' | 'Autonomous Pro'>('Enterprise');
  const [newArr, setNewArr] = useState('$65,000 (Target)');

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
      companyName: `${newCompanyName.trim()} (Target Account)`,
      logoLetter: newCompanyName.trim()[0].toUpperCase(),
      tier: newTier,
      arr: newArr.includes('Target') ? newArr : `${newArr} (Target)`,
      stage: 'Discovery',
      leadAgent: 'Maya Lin & Sophia Vance',
      health: 'High',
      lastInteraction: 'Autonomous discovery brief generated in sandbox',
      notes: 'Ingested public data to generate personalized AI company workspace demo.',
      isProspectAccount: true,
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
            <span className="text-xs font-bold text-white">Target Account Pipeline (Prospective CRM)</span>
          </div>

          <span className="hidden sm:inline text-xs text-slate-400 font-mono">
            Modeled Pipeline: <strong className="text-emerald-400 font-bold">${(totalPipelineARR / 1000).toFixed(0)}k Target</strong>
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
              placeholder="Search target accounts..."
              className="pl-8 pr-3 py-1 rounded-lg bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            id="add-customer-deal-btn"
            onClick={() => setIsNewDealModalOpen(true)}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Target Account</span>
          </button>
        </div>
      </div>

      {/* Prospective Notice */}
      <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-1.5 flex items-center justify-between text-[11px] text-emerald-300">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <strong>Prospective Account Sandbox:</strong> Evaluates enterprise account fit, customized agent configurations, and token budgets.
        </span>
        <span className="font-mono text-[10px] text-emerald-400">Target Accounts</span>
      </div>

      {/* Main Body: 2-Column Split View */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
        {/* Left Column: Accounts List */}
        <div className="md:col-span-5 border-r border-white/10 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between pb-1 text-xs text-slate-400">
            <span>{filteredDeals.length} Target Accounts</span>
            <div className="flex space-x-1 text-[11px]">
              {['All', 'Discovery', 'AI Demo'].map((stage) => (
                <button
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  className={`px-2 py-0.5 rounded ${
                    stageFilter === stage
                      ? 'bg-white/20 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {filteredDeals.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Users className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs font-semibold text-slate-400">No Target Accounts</p>
              <p className="text-[11px] text-slate-500">
                Click &quot;New Account&quot; to add prospective enterprise accounts to the CRM pipeline.
              </p>
            </div>
          ) : (
            filteredDeals.map((deal) => {
              const isSelected = selectedDeal?.id === deal.id;
              return (
                <div
                  key={deal.id}
                  onClick={() => setSelectedDeal(deal)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg'
                      : 'bg-slate-900/60 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center font-bold text-white text-xs">
                        {deal.logoLetter}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{deal.companyName}</div>
                        <div className="text-[10px] text-slate-400">{deal.tier}</div>
                      </div>
                    </div>

                    <span className="font-mono text-xs font-bold text-emerald-400">{deal.arr}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                    <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 font-mono">
                      {deal.stage}
                    </span>
                    <span>Lead: {deal.leadAgent.split(' ')[0]}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Account Detail & Autonomous Actions */}
        <div className="md:col-span-7 overflow-y-auto p-4 md:p-6 space-y-5 bg-slate-950/50">
          {selectedDeal ? (
            <>
              {/* Account Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center font-bold text-white text-xl shadow-lg">
                    {selectedDeal.logoLetter}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedDeal.companyName}</h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        {selectedDeal.tier}
                      </span>
                      <span className="text-xs text-slate-400">Target Pipeline Model</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">Target Annual Contract</div>
                  <div className="text-lg font-mono font-bold text-emerald-400">{selectedDeal.arr}</div>
                </div>
              </div>

              {/* Account Strategic Recon */}
              <div className="os-glass-card rounded-2xl p-4 border border-white/10 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Autonomous Account Recon & Strategy
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{selectedDeal.notes}</p>
                <div className="text-[10px] text-slate-400 pt-1">
                  Last Agent Interaction: <strong className="text-slate-300">{selectedDeal.lastInteraction}</strong>
                </div>
              </div>

              {/* Lead Agent Assignment */}
              <div className="os-glass-card rounded-2xl p-4 border border-white/10 flex items-center justify-between text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Designated Executive Leads</div>
                  <div className="font-bold text-white mt-0.5">{selectedDeal.leadAgent}</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-mono">
                  Sandbox Active
                </span>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-300">No Target Account Selected</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Add target enterprise accounts to model discovery briefs, pricing tiers, and executive assignments.
                </p>
              </div>
              <button
                onClick={() => setIsNewDealModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Target Account</span>
              </button>
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
              Add Target Account
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
                  Save Target Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
