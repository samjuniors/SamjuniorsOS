'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Compass, ExternalLink, ShieldCheck, Sparkles, TrendingUp, Search } from 'lucide-react';
import { ResearchTopic } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface RecentIntelligenceProps {
  researchTopics: ResearchTopic[];
}

export const RecentIntelligenceSection: React.FC<RecentIntelligenceProps> = ({ researchTopics }) => {
  const [selectedTopic, setSelectedTopic] = useState<ResearchTopic | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            Recent Company Intelligence
          </h2>
          <p className="text-xs text-slate-400">
            Empirically grounded findings and strategic assessments synthesized by research and finance.
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-white/5 px-2.5 py-0.5 rounded border border-white/10">
          Peer-Reviewed Intel
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {researchTopics.map((topic) => (
          <div
            key={topic.id}
            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-amber-500/30 transition-all flex flex-col justify-between space-y-3"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {topic.category}
                </span>
                <span className="text-[10px] font-mono text-slate-400">{topic.date}</span>
              </div>

              <h3 className="text-xs font-bold text-white leading-snug">{topic.title}</h3>
              <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3">{topic.summary}</p>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Author: <strong className="text-slate-200">{topic.author.split('&')[0]}</strong>
              </span>

              <button
                onClick={() => setSelectedTopic(topic)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition-colors flex items-center space-x-1"
              >
                <span>View Evidence</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedTopic && (
        <EvidenceModal
          isOpen={!!selectedTopic}
          onClose={() => setSelectedTopic(null)}
          title={selectedTopic.title}
          evidenceBasis="external_evidence"
          sourceText={selectedTopic.summary}
          details={`Synthesized by ${selectedTopic.author} based on continuous market monitoring and empirical competitor benchmarks. Tags: ${selectedTopic.tags.join(', ')}.`}
        />
      )}
    </div>
  );
};
