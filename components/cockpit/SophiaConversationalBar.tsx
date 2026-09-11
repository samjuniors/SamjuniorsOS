'use client';

import React, { useState, useRef } from 'react';
import { Zap, Shield, List, Activity, Users, ArrowRight, Sparkles } from 'lucide-react';

interface SophiaConversationalBarProps {
  onOpenQueue: () => void;
  onOpenApproval: () => void;
  onOpenAudit: () => void;
  onOpenTelemetry: () => void;
  onToggleRoster: () => void;
  onNotice: (msg: string) => void;
  approvalPendingCount?: number;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SophiaConversationalBar({
  onOpenQueue,
  onOpenApproval,
  onOpenAudit,
  onOpenTelemetry,
  onToggleRoster,
  onNotice,
  approvalPendingCount = 0,
  inputRef,
}: SophiaConversationalBarProps) {
  const [command, setCommand] = useState('');
  const localInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = inputRef || localInputRef;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = command.trim();
    if (!text) return;
    setCommand('');

    // Phase 3.14: UI inspection only — zero backend mutations
    onNotice(
      `[Sophia Vance - COO] UI Mode: Directive "${text}" received in safe shell. Live /api/orchestrate wiring deferred to Phase 3.15 per integration contract.`
    );
  };

  return (
    <section className="sophia-conversational-bar" aria-label="Sophia Vance founder interface">
      <div className="sophia-bar-header">
        <div className="sophia-identity">
          <span style={{ display: 'grid', placeItems: 'center' }}>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </span>
          <div>
            <strong>SOPHIA VANCE</strong>
            <span>CHIEF OPERATING OFFICER · FOUNDER-FACING INTERFACE</span>
          </div>
        </div>
        <div className="sophia-bar-meta">
          <span className="sophia-meta-pill">
            <i className="amber-dot" /> ACTIVE V1 ORCHESTRATION
          </span>
          <span className="sophia-meta-pill">
            <Shield className="w-2.5 h-2.5" /> INVARIANTS SATISFIED
          </span>
          <span className="sophia-meta-pill opacity-75">
            PHASE 3.14 UI SHELL
          </span>
        </div>
      </div>

      {/* Quick Input Bar */}
      <form className="sophia-form" onSubmit={handleSubmit}>
        <label htmlFor="sophia-input-cmd" className="sophia-prompt-prefix">
          founder ›
        </label>
        <input
          id="sophia-input-cmd"
          ref={activeInputRef as any}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Direct Sophia, inspect sequence, or type question... (press /)"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="button amber-button"
          type="submit"
          style={{ padding: '5px 10px', fontSize: '9px' }}
        >
          Send <ArrowRight className="w-3 h-3" />
        </button>
      </form>

      {/* Action Chips */}
      <div className="sophia-action-chips">
        <button
          type="button"
          className="calm-chip amber"
          onClick={() =>
            onNotice(
              '[Sophia Vance - COO] Directive dispatch surface inspected. Server DAG orchestration connects in Phase 3.15.'
            )
          }
          title="Issue directive in UI mode"
        >
          <Zap className="w-2.5 h-2.5" /> Issue Directive
        </button>
        <button
          type="button"
          className="calm-chip"
          onClick={onOpenQueue}
          title="Open OS Work Queue Drawer (Q)"
        >
          <List className="w-2.5 h-2.5" /> Work Queue
        </button>
        <button
          type="button"
          className={'calm-chip ' + (approvalPendingCount > 0 ? 'urgent' : '')}
          onClick={onOpenApproval}
          title="Open founder decision gate"
        >
          <Shield className="w-2.5 h-2.5" />
          {approvalPendingCount > 0
            ? `Founder Approval Gate (${approvalPendingCount})`
            : 'Approval Gate (Nominal)'}
        </button>
        <button
          type="button"
          className="calm-chip"
          onClick={onOpenAudit}
          title="Verify constitutional safety bounds"
        >
          <Shield className="w-2.5 h-2.5" /> Invariant Audit
        </button>
        <button
          type="button"
          className="calm-chip"
          onClick={onOpenTelemetry}
          title="View operational telemetry & health"
        >
          <Activity className="w-2.5 h-2.5" /> Telemetry & Health
        </button>
        <button
          type="button"
          className="calm-chip"
          onClick={onToggleRoster}
          title="Toggle workforce roster"
        >
          <Users className="w-2.5 h-2.5" /> Specialists (6)
        </button>
      </div>
    </section>
  );
}
