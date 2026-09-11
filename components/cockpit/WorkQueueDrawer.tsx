'use client';

import React, { useState } from 'react';
import { X, Shield, Clock, ExternalLink, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { AgentRole } from '@/types/os';
import { SPECIALIST_NODES } from './SamJuniorsCoreCanvas';

export interface WorkQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApproval: () => void;
  onSelectSpecialist?: (role: AgentRole) => void;
  recentWorkflows?: Array<{
    instanceId: string;
    objective: string;
    status: string;
    updatedAt: string;
  }>;
  pendingApprovalsCount?: number;
}

interface DagStepDefinition {
  stepNumber: number;
  id: string;
  title: string;
  assignedRole: AgentRole;
  skill: string;
  category: 'CURRENT' | 'NEXT' | 'THEN' | 'WAITING' | 'COMPLETED';
  invariantNote: string;
  description: string;
}

// Authoritative 9-Step DAG Topology derived from lib/server/workflow/dynamic-dag.ts
const DAG_TOPOLOGY: DagStepDefinition[] = [
  {
    stepNumber: 1,
    id: 'step-coo-scope',
    title: 'Directive Decomposition & Scope Boundary',
    assignedRole: 'coo',
    skill: 'directive_decomposition',
    category: 'CURRENT',
    invariantNote: 'Deconstruct founder intent into deterministic execution graph',
    description: 'Deconstructs founder directive into strategic boundaries, KPIs, and specialist delegation parameters.',
  },
  {
    stepNumber: 2,
    id: 'step-research',
    title: 'Market & Technical Reconnaissance',
    assignedRole: 'researcher',
    skill: 'competitor_analysis',
    category: 'NEXT',
    invariantNote: 'Empirical citations required · Zero hallucinated facts',
    description: 'Conducts market reconnaissance, technical feasibility analysis, and external repository intelligence.',
  },
  {
    stepNumber: 3,
    id: 'step-finance',
    title: 'Unit Economics & Financial Audit',
    assignedRole: 'finance',
    skill: 'financial_model',
    category: 'THEN',
    invariantNote: 'Gross margin floor ≥ 80.0% verified deterministically',
    description: 'Stress-tests cost structures, gross margin viability (>80%), token burn, and capital requirements.',
  },
  {
    stepNumber: 4,
    id: 'step-pm-prd',
    title: 'Product Architecture & PRD Authoring',
    assignedRole: 'pm',
    skill: 'prd_creation',
    category: 'THEN',
    invariantNote: 'Functional specifications linked to verified research',
    description: 'Authors functional specifications, edge cases, user personas, and technical architecture.',
  },
  {
    stepNumber: 5,
    id: 'step-verification',
    title: 'Constitutional & Security Verification',
    assignedRole: 'coo',
    skill: 'compliance_verification',
    category: 'THEN',
    invariantNote: 'Deterministic rule check · 0 credentials leaked · Sandbox safe',
    description: 'Audits specialist deliverables against non-negotiable constitutional invariants.',
  },
  {
    stepNumber: 6,
    id: 'step-synthesis-report',
    title: 'Executive Council Review & Consensus',
    assignedRole: 'coo',
    skill: 'synthesis_report',
    category: 'THEN',
    invariantNote: 'Single typed deliverable package assembled',
    description: 'Compiles final executive recommendation memo, sensitivity matrix, and audit ledger.',
  },
  {
    stepNumber: 7,
    id: 'step-side-effect',
    title: 'External Side-Effect & Resource Release',
    assignedRole: 'coo',
    skill: 'execute',
    category: 'WAITING',
    invariantNote: 'Cryptographic SHA-256 founder ratification required',
    description: 'Human founder authorization required before external mutations, transfers, or ticket creations.',
  },
  {
    stepNumber: 8,
    id: 'step-memory-commit',
    title: 'Company Brain Durable Checkpoint',
    assignedRole: 'coo',
    skill: 'memory_checkpoint',
    category: 'THEN',
    invariantNote: 'Append-only audit record committed to durable store',
    description: 'Persists verified artifacts and execution evidence into durable PostgreSQL storage.',
  },
];

export function WorkQueueDrawer({
  isOpen,
  onClose,
  onOpenApproval,
  onSelectSpecialist,
  recentWorkflows = [],
  pendingApprovalsCount = 0,
}: WorkQueueDrawerProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>('step-coo-scope');

  if (!isOpen) return null;

  return (
    <>
      <div
        className="queue-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="queue-drawer open"
        role="complementary"
        aria-label="OS Work Queue and Task Sequence"
      >
        <header className="queue-header">
          <div>
            <div className="queue-title-eyebrow">
              <span className="queue-pulse-dot" />
              OS WORK QUEUE · PROTOCOL DAG
            </div>
            <h2 className="queue-main-title">Active Work Sequence</h2>
          </div>
          <button
            className="queue-close-btn"
            onClick={onClose}
            aria-label="Close Work Queue (Esc)"
            title="Close Work Queue (Esc / Q)"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Operational Honesty Banner */}
        <div className="queue-summary-banner">
          <i className="amber-dot" />
          <span>
            <strong>SERVER-ALIGNED PROTOCOL DAG</strong> &mdash; Demonstrates the 9-Step Dynamic DAG execution sequence. Live server-backed execution transitions connect in Phase 3.15.
          </span>
        </div>

        <div className="queue-content">
          {/* PENDING APPROVAL GATE NOTICE */}
          {pendingApprovalsCount > 0 && (
            <div className="queue-section">
              <div className="queue-section-label">
                <span>WAITING / FOUNDER GATES</span>
                <span style={{ color: '#f59e0b' }}>ACTION REQUIRED</span>
              </div>
              <article className="queue-card expanded" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                <div className="queue-card-top">
                  <span className="queue-status-tag status-waiting">
                    AWAITING FOUNDER RATIFICATION
                  </span>
                  <span className="queue-owner-pill" style={{ color: '#f59e0b' }}>
                    <span className="queue-owner-dot" style={{ background: '#f59e0b' }} />
                    Founder Decision Gate
                  </span>
                </div>
                <h3 className="queue-task-title">
                  {pendingApprovalsCount} Consequential Side-Effect Request{pendingApprovalsCount > 1 ? 's' : ''} Pending
                </h3>
                <div className="queue-step-flow">
                  <div className="queue-step-item">
                    <span className="queue-step-badge" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)' }}>
                      WAITING
                    </span>
                    <p className="queue-step-text" style={{ color: '#fbbf24' }}>
                      Execution paused in fail-closed state until authenticated founder ratification.
                    </p>
                  </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button
                    className="button amber-button"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '11px', padding: '7px 12px' }}
                    onClick={() => {
                      onClose();
                      onOpenApproval();
                    }}
                  >
                    <Shield className="w-3 h-3" />
                    Open Founder Decision Gate ({pendingApprovalsCount})
                  </button>
                </div>
              </article>
            </div>
          )}

          {/* PROTOCOL DAG STEPS */}
          <div className="queue-section">
            <div className="queue-section-label">
              <span>EXECUTIVE PROTOCOL DAG SEQUENCE</span>
              <span>9 STEPS</span>
            </div>

            {DAG_TOPOLOGY.map((step) => {
              const specialist = SPECIALIST_NODES.find((s) => s.id === step.assignedRole);
              const isExpanded = expandedStepId === step.id;

              return (
                <article
                  key={step.id}
                  className={'queue-card ' + (isExpanded ? 'expanded' : '')}
                  onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                >
                  <div className="queue-card-top">
                    <span className={'queue-status-tag ' + (step.category === 'WAITING' ? 'status-waiting' : step.category === 'CURRENT' ? 'status-current' : 'status-next')}>
                      STAGE {step.stepNumber}: {step.category}
                    </span>
                    {specialist && (
                      <button
                        type="button"
                        className="queue-owner-pill"
                        style={{ color: specialist.color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSpecialist && onSelectSpecialist(step.assignedRole);
                        }}
                        title={`Inspect ${specialist.fullName}`}
                      >
                        <span className="queue-owner-dot" style={{ background: specialist.color }} />
                        {specialist.fullName}
                      </button>
                    )}
                  </div>

                  <h3 className="queue-task-title">{step.title}</h3>

                  <div className="queue-step-flow">
                    <div className="queue-step-item">
                      <span className="queue-step-badge">INVARIANT</span>
                      <p className="queue-step-text">{step.invariantNote}</p>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="queue-expanded-details">
                      <p>{step.description}</p>
                      <div className="queue-detail-row">
                        <span>ASSIGNED SKILL</span>
                        <strong>{step.skill}</strong>
                      </div>
                      <div className="queue-detail-row">
                        <span>PERSISTENCE BINDING</span>
                        <strong>Durable WorkflowInstance DAG</strong>
                      </div>
                      <div className="queue-detail-row">
                        <span>LIVE CONNECTION</span>
                        <strong style={{ color: '#d8b477' }}>Ready for Phase 3.15 Wire-Up</strong>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* SERVER-PERSISTED RECENT WORKFLOWS */}
          {recentWorkflows.length > 0 && (
            <div className="queue-section">
              <div className="queue-section-label">
                <span>RECENT SERVER-PERSISTED WORKFLOWS</span>
                <span>POSTGRESQL</span>
              </div>
              {recentWorkflows.map((wf) => (
                <article key={wf.instanceId} className="queue-card">
                  <div className="queue-card-top">
                    <span className="queue-status-tag status-completed">
                      {wf.status.toUpperCase()}
                    </span>
                    <span className="font-mono text-[8px] text-slate-500">
                      {wf.instanceId}
                    </span>
                  </div>
                  <h3 className="queue-task-title">{wf.objective}</h3>
                  <div className="text-[8.5px] font-mono text-slate-500 mt-1 flex justify-between">
                    <span>PERSISTED INSTANCE</span>
                    <time>{new Date(wf.updatedAt).toLocaleTimeString()}</time>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
