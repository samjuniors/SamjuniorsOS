'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Compass, ExternalLink, ShieldCheck, Sparkles, TrendingUp, Search, BrainCircuit } from 'lucide-react';
import { ResearchTopic, AdvisorTargetContext } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';

interface RecentIntelligenceProps {
  researchTopics: ResearchTopic[];
  onAskAdvisor?: (context: AdvisorTargetContext) => void;
}

export const RecentIntelligenceSection: React.FC<RecentIntelligenceProps> = ({ researchTopics, onAskAdvisor }) => {
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

      {researchTopics.length === 0 ? (
        <div className="os-glass-card rounded-2xl p-6 border border-white/10 text-center space-y-1.5">
          <Compass className="w-6 h-6 text-amber-400 mx-auto opacity-70" />
          <h4 className="text-xs font-bold text-white">No Market Intelligence Memos Yet</h4>
          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
            Direct Dr. Aris Thorne (Research) to crawl competitor pricing, AI reasoning benchmarks, or market opportunities to populate empirical intelligence here.
          </p>
        </div>
      ) : (
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

              <div className="flex items-center space-x-1.5">
                {onAskAdvisor && (
                  <button
                    onClick={() =>
                      onAskAdvisor({
                        section: 'hq_intelligence',
                        title: topic.title,
                        category: topic.category,
                        sourceEntityId: topic.id,
                        sourceEntityName: topic.author,
                        resultSnippet: topic.summary,
                        evidenceBasis: 'external_evidence',
                        suggestedQuestions: [
                          'How does this intelligence affect our roadmap?',
                          'What should we do in response to this finding?',
                          'What am I missing?',
                          'Why is this happening?',
                        ],
                      })
                    }
                    className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-[11px] font-medium transition-colors flex items-center space-x-1"
                    title="Ask Founder Intelligence about this intelligence"
                  >
                    <BrainCircuit className="w-3 h-3 text-indigo-400" />
                    <span>Ask Advisor</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedTopic(topic)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition-colors flex items-center space-x-1"
                >
                  <span>Evidence</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {selectedTopic && (
        <EvidenceModal
          isOpen={!!selectedTopic}
          onClose={() => setSelectedTopic(null)}
          title={selectedTopic.title}
          evidenceBasis="external_evidence"
          sourceText={selectedTopic.summary}
          details={`Synthesized by ${selectedTopic.author} based on continuous empirical monitoring. Tags: ${selectedTopic.tags.join(', ')}.`}
          evidenceData={selectedTopic.evidence}
        />
      )}
    </div>
  );
};
