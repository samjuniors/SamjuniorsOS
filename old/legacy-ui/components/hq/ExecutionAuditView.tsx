'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Layers,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Terminal,
  BookOpen,
  Lock,
} from 'lucide-react';
import { OrchestrationRun, AIAgent } from '@/types/os';
import { EvidenceModal } from './EvidenceModal';
import { STRUCTURED_SKILLS, determineSkillForTask } from '@/lib/skills/skill-registry';
import { StructuredSkillDefinition } from '@/types/capabilities';
import { SkillInspectionModal } from './SkillInspectionModal';
import { ContextInspectionModal } from './ContextInspectionModal';
import { TaskRetrievedContextBundle } from '@/types/context';

interface ExecutionAuditViewProps {
  run: OrchestrationRun;
  agents: AIAgent[];
}

export const ExecutionAuditView: React.FC<ExecutionAuditViewProps> = ({ run, agents }) => {
  const [selectedProtocolFilter, setSelectedProtocolFilter] = useState<string>('all');
  const [selectedMessageEvidence, setSelectedMessageEvidence] = useState<any>(null);
  const [inspectedSkill, setInspectedSkill] = useState<StructuredSkillDefinition | Readonly<StructuredSkillDefinition> | null>(null);
  const [inspectedContext, setInspectedContext] = useState<{ bundle: TaskRetrievedContextBundle; title: string; role?: string } | null>(null);

  const filteredMessages = run.messages.filter((m) => {
    if (selectedProtocolFilter === 'all') return true;
    return m.protocolStep === selectedProtocolFilter;
  });

  // Find all retrieved context bundles from plan items and messages
  const planContexts = run.plan
    .filter((p) => Boolean(p.retrievedContext))
    .map((p) => ({ bundle: p.retrievedContext!, title: p.title, role: p.agentId }));
  const messageContexts = run.messages
    .filter((m) => Boolean(m.retrievedContext))
    .map((m) => ({ bundle: m.retrievedContext!, title: `Message Step: ${m.protocolStep}`, role: m.sender }));
  const allContexts = [...planContexts, ...messageContexts];
  const primaryContextBundle = allContexts[allContexts.length - 1]?.bundle;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Secondary Technical Execution & Provenance Audit
          </h2>
          <p className="text-xs text-slate-400">
            Inspection view for internal agent message buses, 9-step protocol transitions, and model reasoning logs.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-indigo-400" />
            Gemini 2.5 Multi-Agent Orchestrator
          </span>
        </div>
      </div>

      {/* 9-Step Protocol Tracker */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3">
        <span className="text-xs font-bold text-white tracking-wide block">
          9-Step Agent Work Protocol Execution Pipeline
        </span>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
          {run.plan.map((step) => {
            const isCompleted = (step.status as string) === 'done' || (step.status as string) === 'completed';
            const isInProgress = (step.status as string) === 'in_progress' || (step.status as string) === 'active';

            return (
              <div
                key={step.stage}
                className={`p-2 rounded-xl border text-center transition-all ${
                  isCompleted
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : isInProgress
                    ? 'bg-indigo-950/50 border-indigo-500/50 text-indigo-200 animate-pulse'
                    : 'bg-black/30 border-white/5 text-slate-500'
                }`}
              >
                <div className="text-[9px] font-mono font-bold uppercase">
                  Step {step.stage}
                </div>
                <div className="text-[10px] font-bold truncate mt-0.5" title={step.title}>
                  {step.protocolStep}
                </div>
                <div className="text-[8px] opacity-75 mt-0.5 truncate">
                  {step.agentId}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Persistent Context & Epistemic Separation Audit */}
      <div id="persistent-context-audit-panel" className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-xs font-bold text-white">Company Knowledge & Persistent Context Separation</span>
              <p className="text-[11px] text-slate-400">
                Epistemic Separation: Current State &gt; Durable Knowledge &gt; Historical Memory
              </p>
            </div>
          </div>

          {primaryContextBundle ? (
            <button
              onClick={() =>
                setInspectedContext({
                  bundle: primaryContextBundle,
                  title: 'Task Primary Context Bundle',
                  role: allContexts[allContexts.length - 1]?.role,
                })
              }
              className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition-all self-start sm:self-auto"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                Inspect Context Separation (
                {(primaryContextBundle.retrievedState?.totalCount ?? 0) +
                  (primaryContextBundle.retrievedKnowledge?.totalCount ?? 0) +
                  (primaryContextBundle.retrievedMemory?.totalCount ?? 0)}{' '}
                Items)
              </span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-slate-500 bg-black/30 px-2.5 py-1 rounded border border-white/5">
              3-Store Architecture Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Store 1: State */}
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300">1. Company State</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {primaryContextBundle ? `${primaryContextBundle.retrievedState?.totalCount ?? 0} items` : 'Active Truth'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Live operational truth: active initiatives, runway, MRR, active PRDs, and pending governance decisions.
            </p>
            <div className="text-[10px] font-mono text-emerald-400/80 pt-1">
              Epistemic: `current_truth` (Precedence: 1)
            </div>
          </div>

          {/* Store 2: Knowledge */}
          <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300">2. Company Knowledge</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                {primaryContextBundle ? `${primaryContextBundle.retrievedKnowledge?.totalCount ?? 0} items` : 'Durable Ref'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Durable reference material: standard operating procedures (SOPs), PRD guidelines, and architectural RFCs.
            </p>
            <div className="text-[10px] font-mono text-sky-400/80 pt-1">
              Epistemic: `durable_reference` (Precedence: 2)
            </div>
          </div>

          {/* Store 3: Memory */}
          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300">3. Company Memory</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {primaryContextBundle ? `${primaryContextBundle.retrievedMemory?.totalCount ?? 0} items` : 'Precedents'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Historical experience: Founder-ratified decisions, post-mortem findings, and operational lessons learned.
            </p>
            <div className="text-[10px] font-mono text-purple-400/80 pt-1">
              Epistemic: `historical_memory` (Precedence: 3)
            </div>
          </div>
        </div>
      </div>

      {/* Structured Skills Pipeline & Governance Boundary */}
      <div id="skills-execution-pipeline-panel" className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white">First-Class Structured Skills Execution Pipeline</span>
          </div>
          <div className="flex items-center space-x-2 text-[10px] font-mono">
            <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Immutable
            </span>
            <span className="text-slate-400 bg-black/30 border border-white/10 px-2 py-0.5 rounded">
              Deterministic Role Routing
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {run.plan.map((step) => {
            const skillId = step.skillId || (step.selectedSkill && 'id' in step.selectedSkill ? step.selectedSkill.id : undefined);
            const skill: StructuredSkillDefinition | Readonly<StructuredSkillDefinition> | null = (skillId && STRUCTURED_SKILLS[skillId])
              ? STRUCTURED_SKILLS[skillId]
              : (step.selectedSkill && 'procedure' in step.selectedSkill
                  ? (step.selectedSkill as StructuredSkillDefinition)
                  : (determineSkillForTask({
                      title: step.title,
                      protocolStep: step.protocolStep,
                      directive: run.title,
                    }, (step.agentId || 'coo') as any).selectedSkill ?? null));

            const agent = agents.find((a) => a.id === step.agentId);

            return (
              <div
                key={step.stage}
                className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2 flex flex-col justify-between hover:border-indigo-500/30 transition-all text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase">
                      Stage {step.stage} • {step.protocolStep}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      {agent?.name || step.agentId}
                    </span>
                  </div>
                  <h4 className="font-semibold text-white leading-snug">{step.title}</h4>
                  
                  {skill ? (
                    <div className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/20 space-y-1 mt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-semibold text-indigo-300 uppercase">
                          {skill.category}
                        </span>
                        <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-0.5">
                          <Lock className="w-2 h-2" /> Safe
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-slate-200">{skill.name}</div>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{skill.purpose}</p>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 italic">Autonomous Core Reasoning</div>
                  )}
                </div>

                {skill && (
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[9px] font-mono text-slate-400">
                      {skill.allowedTools.length > 0 ? `${skill.allowedTools.length} tool(s)` : 'Pure reasoning'}
                    </span>
                    <button
                      onClick={() => setInspectedSkill(skill)}
                      className="px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-colors"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Inspect Skill</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* External Tool Execution & Verification Evidence Section */}
      {run.plan?.some((s) => s.toolEvidence) && (
        <div id="tool-evidence-audit-panel" className="bg-slate-900/90 border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">Tool Execution & Verification Evidence Boundary</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Phase 11.4 Hardened</span>
          </div>

          <div className="space-y-3">
            {run.plan
              .filter((s) => s.toolEvidence)
              .map((step) => {
                const evidence = step.toolEvidence!;
                const statusColor =
                  evidence.status === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : evidence.status === 'not_executed'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : evidence.status === 'partial'
                    ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                const verifyColor =
                  evidence.verificationState === 'claim_supported' || evidence.verificationState === 'verified_safe'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : evidence.verificationState === 'source_retrieved' || evidence.verificationState === 'evidence_extracted'
                    ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                    : evidence.verificationState === 'conflicting'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-white/10';

                return (
                  <div
                    key={step.stage}
                    id={`tool-evidence-card-step-${step.stage}`}
                    className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-3 font-mono text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-indigo-300 uppercase">
                          Step {step.stage} • {step.protocolStep}
                        </span>
                        <span className="text-slate-400">({evidence.toolName})</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`px-2 py-0.5 rounded border text-[9px] uppercase font-bold ${statusColor}`}>
                          Status: {evidence.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded border text-[9px] uppercase font-bold ${verifyColor}`}>
                          Verification: {evidence.verificationState}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-300 space-y-1">
                      <div><span className="text-slate-500">Input:</span> {evidence.inputSummary}</div>
                      <div><span className="text-slate-500">Output:</span> {evidence.outputSummary}</div>
                      {evidence.errorMessage && (
                        <div className="text-rose-400"><span className="text-rose-500">Error:</span> {evidence.errorMessage}</div>
                      )}
                    </div>

                    {/* Claims Traceability */}
                    {evidence.claims && evidence.claims.length > 0 && (
                      <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Authoritative Claim Traceability</div>
                        <div className="space-y-1.5">
                          {evidence.claims.map((claim) => (
                            <div
                              key={claim.id}
                              className="bg-slate-900/80 border border-white/5 rounded p-2 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-sans text-slate-200">{claim.statement}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono uppercase whitespace-nowrap ${
                                  claim.verificationState === 'claim_supported'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : claim.verificationState === 'conflicting'
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                    : 'bg-slate-800 text-slate-400 border-white/10'
                                }`}>
                                  {claim.verificationState}
                                </span>
                              </div>
                              {claim.evidenceExcerpt && (
                                <div className="text-slate-400 text-[10px] italic border-l-2 border-slate-700 pl-2">
                                  &quot;{claim.evidenceExcerpt}&quot;
                                </div>
                              )}
                              {claim.supportingSourceUrls.length > 0 && (
                                <div className="text-[9px] text-blue-400 truncate">
                                  Sources: {claim.supportingSourceUrls.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sources List */}
                    {evidence.sources && evidence.sources.length > 0 && (
                      <div className="pt-2 border-t border-white/5 space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Validated Sources ({evidence.sources.length})</div>
                        <div className="space-y-1">
                          {evidence.sources.map((src, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="truncate pr-2 text-slate-300">{src.title}</span>
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono shrink-0"
                              >
                                <span className="truncate max-w-[180px]">{src.url}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Limitations and Bounds */}
                    {evidence.limitations && evidence.limitations.length > 0 && (
                      <div className="pt-2 border-t border-white/5 text-[10px] text-amber-400/90 space-y-0.5">
                        <div className="uppercase font-bold text-amber-400">Verification Bounds & Limitations:</div>
                        {evidence.limitations.map((lim, idx) => (
                          <div key={idx} className="text-slate-400">• {lim}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Message Bus & Protocol Filter */}
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Inter-Agent Message Bus Log</span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs">
            {['all', 'understand', 'research', 'analyze', 'plan', 'build_execute', 'test', 'verify', 'review', 'report'].map(
              (p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProtocolFilter(p)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap transition-colors ${
                    selectedProtocolFilter === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>
        </div>

        {/* Message Stream */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredMessages.map((msg) => {
            const senderAgent = agents.find((a) => a.id === msg.sender);
            return (
              <div
                key={msg.id}
                className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-1.5 font-mono text-xs"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-indigo-300">
                      [{senderAgent?.name || msg.sender.toUpperCase()}]
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-400 uppercase">
                      {msg.protocolStep}
                    </span>
                  </div>
                  <span className="text-slate-500">{msg.timestamp}</span>
                </div>

                <p className="text-slate-200 text-[11px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                <div className="pt-1 border-t border-white/5 flex flex-wrap items-center justify-end gap-2">
                  {msg.retrievedContext && (
                    <button
                      onClick={() =>
                        setInspectedContext({
                          bundle: msg.retrievedContext!,
                          title: `Task Context: ${msg.protocolStep}`,
                          role: msg.sender,
                        })
                      }
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                    >
                      <Database className="w-3 h-3 text-emerald-400" />
                      <span>
                        Context (
                        {(msg.retrievedContext.retrievedState?.totalCount ?? 0) +
                          (msg.retrievedContext.retrievedKnowledge?.totalCount ?? 0) +
                          (msg.retrievedContext.retrievedMemory?.totalCount ?? 0)}{' '}
                        items)
                      </span>
                    </button>
                  )}

                  {msg.provenance && (
                    <button
                      onClick={() => setSelectedMessageEvidence(msg)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Grounding Proof ({msg.provenance.evidenceBasis})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedMessageEvidence && (
        <EvidenceModal
          isOpen={!!selectedMessageEvidence}
          onClose={() => setSelectedMessageEvidence(null)}
          title={`Inter-Agent Message: Step ${selectedMessageEvidence.protocolStep}`}
          provenance={selectedMessageEvidence.provenance}
          sourceText={selectedMessageEvidence.text}
          details="Verified across council consensus and constitutional safety filters."
        />
      )}

      {inspectedSkill && (
        <SkillInspectionModal
          skill={inspectedSkill}
          onClose={() => setInspectedSkill(null)}
        />
      )}

      {inspectedContext && (
        <ContextInspectionModal
          isOpen={!!inspectedContext}
          onClose={() => setInspectedContext(null)}
          title={inspectedContext.title}
          contextBundle={inspectedContext.bundle}
          agentRole={inspectedContext.role}
        />
      )}
    </div>
  );
};
