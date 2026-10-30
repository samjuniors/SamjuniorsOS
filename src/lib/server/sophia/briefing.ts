/**
 * Proactive Briefing Engine & Settings Store (Gate G6.8).
 *
 * Exit evidence required:
 *   "Briefing built from the decision log and approvals only;
 *    interruptible by voice; can be turned off."
 *
 * Invariants:
 * 1. Strict source isolation: built from DecisionLogStore and InMemoryApprovalStore ONLY.
 *    No hallucinated facts, outside news, or synthetic attention items.
 * 2. Honest empty state: when nothing changed since the last session, plainly confirms
 *    zero changes rather than confabulating.
 * 3. Can be turned off: settings store persists toggle, and disabled state suppresses
 *    briefings with an explicit disabled status.
 * 4. Concise executive tone: spoken briefing adheres to Sophia Vance persona (1–3 sentences).
 * 5. Measured latency: deterministic execution with latency budget <= 50 ms.
 */

import { performance } from 'node:perf_hooks';
import {
  BriefingSettings,
  ProactiveBriefingOptions,
  ProactiveBriefingResult,
  ProactiveBriefingData,
  DecisionLogBriefingSummary,
  ApprovalBriefingSummary,
} from '../../../types/briefing';
import { DecisionLogStore } from './decision-log-store';
import { InMemoryApprovalStore } from '../authorization/approval-store';
import { DurableFileStore } from '../persistence/durable-file-store';
import { SERVER_AGENTS } from '../agents/definitions';

const SETTINGS_COLLECTION = 'briefing_settings';
const CURRENT_SETTINGS_ID = 'current';

export const DEFAULT_BRIEFING_SETTINGS: BriefingSettings = {
  enabled: true,
  spokenOnOpen: true,
  includeDecisions: true,
  includeApprovals: true,
  updatedAt: new Date(0).toISOString(),
  updatedBy: 'system',
};

/**
 * Manages durable persistence for Proactive Briefing settings.
 */
export class BriefingSettingsStore {
  private static instance: BriefingSettingsStore | null = null;
  private settings: BriefingSettings;

  private constructor() {
    this.settings = this.loadFromDisk();
  }

  public static getInstance(): BriefingSettingsStore {
    if (!BriefingSettingsStore.instance) {
      BriefingSettingsStore.instance = new BriefingSettingsStore();
    }
    return BriefingSettingsStore.instance;
  }

  public static resetForTesting(): void {
    if (BriefingSettingsStore.instance) {
      BriefingSettingsStore.instance.settings = { ...DEFAULT_BRIEFING_SETTINGS };
    }
    BriefingSettingsStore.instance = null;
  }

  private loadFromDisk(): BriefingSettings {
    try {
      const persisted = DurableFileStore.getInstance().getItem<BriefingSettings>(
        SETTINGS_COLLECTION,
        CURRENT_SETTINGS_ID
      );
      if (persisted && typeof persisted.enabled === 'boolean') {
        return persisted;
      }
    } catch {
      // Fallback
    }
    return { ...DEFAULT_BRIEFING_SETTINGS };
  }

  public getSettings(): BriefingSettings {
    return { ...this.settings };
  }

  public async updateSettings(
    patch: Partial<BriefingSettings>,
    updatedBy: string = 'founder'
  ): Promise<BriefingSettings> {
    const updated: BriefingSettings = {
      ...this.settings,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    try {
      DurableFileStore.getInstance().saveItemStrict(
        SETTINGS_COLLECTION,
        CURRENT_SETTINGS_ID,
        updated
      );
    } catch (err: any) {
      console.warn('[BriefingSettingsStore] Could not persist settings to disk:', err?.message || err);
    }

    this.settings = updated;
    return { ...this.settings };
  }
}

/**
 * Formats a duration in human-readable delta form.
 */
function formatTimeDelta(sinceDate: Date): string {
  const diffMs = Date.now() - sinceDate.getTime();
  if (diffMs <= 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'a moment ago';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(diffMs / 86400000);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Generates a proactive briefing built strictly from the Decision Log and Approvals.
 */
export async function getProactiveBriefing(
  opts: ProactiveBriefingOptions = {}
): Promise<ProactiveBriefingResult> {
  const startTime = performance.now();
  const settingsStore = BriefingSettingsStore.getInstance();
  const settings = settingsStore.getSettings();

  // If briefings are turned off and not explicitly forced, return immediately
  if (!settings.enabled && !opts.force) {
    return {
      success: true,
      enabled: false,
      briefing: null,
      disabledReason: 'Proactive briefing is turned off in settings.',
    };
  }

  let sinceDate: Date | null = null;
  let sinceText: string | null = null;

  if (opts.since) {
    const parsed = new Date(opts.since);
    if (!isNaN(parsed.getTime())) {
      sinceDate = parsed;
      sinceText = formatTimeDelta(sinceDate);
    }
  }

  // 1. Query Decision Log
  const decStore = DecisionLogStore.getInstance();
  const rawDecisions = settings.includeDecisions
    ? await decStore.queryDecisions(sinceDate ? { since: sinceDate } : { limit: 100 })
    : [];

  const decisionsSummary: DecisionLogBriefingSummary = {
    totalCount: rawDecisions.length,
    byRoute: {},
    byOutcome: {},
    sampleQueries: [],
  };

  for (const dec of rawDecisions) {
    const route = dec.route || 'unknown';
    const outcome = dec.outcome || 'unknown';
    decisionsSummary.byRoute[route] = (decisionsSummary.byRoute[route] || 0) + 1;
    decisionsSummary.byOutcome[outcome] = (decisionsSummary.byOutcome[outcome] || 0) + 1;
    if (dec.query && decisionsSummary.sampleQueries.length < 3) {
      decisionsSummary.sampleQueries.push(dec.query);
    }
  }

  // 2. Query Approvals
  const approvalStore = InMemoryApprovalStore.getInstance();
  const allApprovals = settings.includeApprovals ? await approvalStore.list() : [];

  const pendingApprovals = allApprovals.filter(
    (a) =>
      (!a.decision || (a.decision as string) === 'pending' || (a.decision as string) === 'awaiting_founder_approval') &&
      (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now()) &&
      !a.isConsumed
  );

  const recentlyDecided = sinceDate
    ? allApprovals.filter(
        (a) =>
          a.decidedAt &&
          new Date(a.decidedAt) >= sinceDate &&
          a.decision &&
          (a.decision as string) !== 'pending' &&
          (a.decision as string) !== 'awaiting_founder_approval'
      )
    : [];

  const recentlyRequested = sinceDate
    ? allApprovals.filter((a) => a.requestedAt && new Date(a.requestedAt) >= sinceDate)
    : [];

  const approvalsSummary: ApprovalBriefingSummary = {
    pendingCount: pendingApprovals.length,
    decidedCount: recentlyDecided.length,
    requestedCount: recentlyRequested.length,
    pendingActions: pendingApprovals.slice(0, 5).map((a) => ({
      id: a.id,
      actionName: a.actionName,
      employeeRole: a.employeeRole,
      classification: a.classification,
      requestedAt: a.requestedAt,
    })),
    recentlyDecided: recentlyDecided.slice(0, 5).map((a) => ({
      id: a.id,
      actionName: a.actionName,
      decision: a.decision,
      decidedAt: a.decidedAt,
    })),
  };

  // Determine change status
  const decisionCount = decisionsSummary.totalCount;
  const pendingCount = approvalsSummary.pendingCount;
  const decidedCount = approvalsSummary.decidedCount;
  const requestedCount = approvalsSummary.requestedCount;

  const hasChanges = decisionCount > 0 || pendingCount > 0 || decidedCount > 0 || requestedCount > 0;

  // 3. Strict Source Isolation (DecisionLogStore & InMemoryApprovalStore ONLY)
  const sources: Array<'DecisionLogStore' | 'InMemoryApprovalStore'> = [];
  if (decisionCount > 0) sources.push('DecisionLogStore');
  if (pendingCount > 0 || decidedCount > 0 || requestedCount > 0) sources.push('InMemoryApprovalStore');
  if (sources.length === 0) {
    sources.push('DecisionLogStore', 'InMemoryApprovalStore');
  }

  const persona = SERVER_AGENTS.coo;

  // 4. Synthesize Spoken and Written Summaries
  let spokenText = '';
  let panelText = '';

  const timeWindowClause = sinceText ? `since your last session ${sinceText}` : 'since earlier';

  if (!hasChanges) {
    // Honest empty state
    spokenText = `No decisions or approval changes have been recorded ${timeWindowClause}. All systems are standing by.`;
    panelText = `[${persona.name} • ${persona.role}]\n**Proactive Executive Briefing**\n\nNo decisions were evaluated and no approval changes occurred ${timeWindowClause}.\n\n[Scopes: governance | Sources: ${sources.join(', ')}]`;
  } else {
    // Spoken turn: 1–3 concise sentences
    const spokenClauses: string[] = [];

    if (decisionCount > 0) {
      spokenClauses.push(`${decisionCount} decision${decisionCount === 1 ? ' was' : 's were'} logged`);
    }

    if (pendingCount > 0) {
      spokenClauses.push(`${pendingCount} approval${pendingCount === 1 ? ' remains' : 's remain'} pending in the governance gate`);
    } else if (decidedCount > 0) {
      spokenClauses.push(`${decidedCount} approval${decidedCount === 1 ? ' was' : 's were'} decided`);
    }

    if (spokenClauses.length > 0) {
      spokenText = `Here is your update ${timeWindowClause}: ${spokenClauses.join(', and ')}.`;
      if (pendingCount > 0 && decisionCount > 0 && decidedCount > 0) {
        spokenText += ` Additionally, ${decidedCount} prior approval${decidedCount === 1 ? ' was' : 's were'} finalized.`;
      }
    } else {
      spokenText = `All quiet ${timeWindowClause}. No active actions require attention.`;
    }

    // Panel text: structured markdown
    const panelLines: string[] = [
      `[${persona.name} • ${persona.role}]`,
      `**Proactive Executive Briefing** (${timeWindowClause})`,
      '',
    ];

    if (pendingCount > 0) {
      panelLines.push(`### Pending Approvals (${pendingCount})`);
      for (const p of approvalsSummary.pendingActions) {
        panelLines.push(`- **[${p.classification.toUpperCase()}]** \`${p.actionName}\` (Role: ${p.employeeRole})`);
      }
      panelLines.push('');
    }

    if (decisionCount > 0) {
      panelLines.push(`### Decisions Evaluated (${decisionCount})`);
      const routeBreakdown = Object.entries(decisionsSummary.byRoute)
        .map(([r, c]) => `${r}: ${c}`)
        .join(', ');
      panelLines.push(`- **Routes**: ${routeBreakdown}`);
      if (decisionsSummary.sampleQueries.length > 0) {
        panelLines.push(`- **Recent queries**: ${decisionsSummary.sampleQueries.map((q) => `"${q}"`).join(', ')}`);
      }
      panelLines.push('');
    }

    if (decidedCount > 0) {
      panelLines.push(`### Recently Decided Approvals (${decidedCount})`);
      for (const d of approvalsSummary.recentlyDecided) {
        panelLines.push(`- \`${d.actionName}\` → **${d.decision.toUpperCase()}**`);
      }
      panelLines.push('');
    }

    panelLines.push(`[Scopes: governance | Sources: ${sources.join(', ')}]`);
    panelText = panelLines.join('\n');
  }

  const latencyMs = Math.round(performance.now() - startTime);

  const data: ProactiveBriefingData = {
    since: sinceDate ? sinceDate.toISOString() : null,
    sinceText,
    decisionCount,
    decisions: decisionsSummary,
    pendingApprovalCount: pendingCount,
    approvals: approvalsSummary,
    hasChanges,
    text: panelText,
    spokenText,
    sources,
    latencyMs,
    enabled: settings.enabled,
  };

  return {
    success: true,
    enabled: settings.enabled,
    briefing: data,
  };
}
