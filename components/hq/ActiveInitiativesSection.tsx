'use client';

import React from 'react';
import { Target, Users, AlertTriangle, ArrowRight, CheckCircle2, FileText, Layers } from 'lucide-react';
import { CompanyInitiative } from '@/types/os';

interface ActiveInitiativesProps {
  initiatives: CompanyInitiative[];
  onViewWork: () => void;
}

export const ActiveInitiativesSection: React.FC<ActiveInitiativesProps> = ({
  initiatives,
  onViewWork,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            Active Company Initiatives
          </h2>
          <p className="text-xs text-slate-400">
            Core business objectives currently being scoped, researched, and executed by your team.
          </p>
        </div>
        <button
          onClick={onViewWork}
          className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
        >
          <span>All Company Work</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {initiatives.map((init) => (
          <div
            key={init.id}
            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4.5 hover:border-blue-500/30 transition-all space-y-3"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-white">{init.title}</h3>
                  {init.codeName && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      {init.codeName}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 mt-1 font-medium">{init.currentObjective}</p>
              </div>

              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                  init.status === 'Active'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : init.status === 'In Progress'
                    ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}
              >
                {init.status}
              </span>
            </div>

            {/* Latest Result */}
            <div className="bg-black/30 rounded-xl p-3 border border-white/5 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Latest Result
              </span>
              <p className="text-[11px] text-slate-200 leading-relaxed">{init.latestResult}</p>
            </div>

            {/* Next Recommended Action */}
            <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/15 space-y-1">
              <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider block">
                Next Recommended Step
              </span>
              <p className="text-[11px] text-blue-100 leading-relaxed">{init.nextRecommendedAction}</p>
            </div>

            {/* Contributors & Risks */}
            <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              {/* Contributors */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] text-slate-400">Assigned:</span>
                <div className="flex -space-x-1.5 overflow-hidden">
                  {init.contributors.map((c) => (
                    <div
                      key={c.agentId}
                      title={`${c.name} (${c.role})`}
                      className="inline-block h-5 w-5 rounded-full bg-slate-800 border border-white/20 text-[9px] font-bold text-center leading-5 text-slate-200"
                    >
                      {c.name.charAt(0)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Risks Count */}
              {init.risks.length > 0 && (
                <div className="text-[10px] text-amber-400/90 flex items-center gap-1 font-mono">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{init.risks.length} Risk Flagged</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
