/**
 * Shared Type Definitions for Proactive Briefing (Gate G6.8).
 *
 * Exit evidence required:
 *   "Briefing built from the decision log and approvals only;
 *    interruptible by voice; can be turned off."
 */

export interface BriefingSettings {
  /** Whether proactive briefings are enabled */
  enabled: boolean;
  /** Whether briefing should be spoken aloud automatically upon opening a voice session */
  spokenOnOpen: boolean;
  /** Whether decision log entries should be summarized */
  includeDecisions: boolean;
  /** Whether approvals should be summarized */
  includeApprovals: boolean;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Identity that updated settings */
  updatedBy: string;
}

export interface ProactiveBriefingOptions {
  /** Timestamp (ISO string or Date) representing the start of the window (e.g. last session time) */
  since?: string | Date;
  /** Founder identity */
  founderId?: string;
  /** Output channel: voice (concise spoken text), panel (structured text), or desktop */
  channel?: 'voice' | 'panel' | 'desktop';
  /** Force generation even if disabled in settings (e.g. user explicitly asked "brief me") */
  force?: boolean;
}

export interface DecisionLogBriefingSummary {
  totalCount: number;
  byRoute: Record<string, number>;
  byOutcome: Record<string, number>;
  sampleQueries: string[];
}

export interface ApprovalBriefingSummary {
  pendingCount: number;
  decidedCount: number;
  requestedCount: number;
  pendingActions: Array<{
    id: string;
    actionName: string;
    employeeRole: string;
    classification: string;
    requestedAt?: string;
  }>;
  recentlyDecided: Array<{
    id: string;
    actionName: string;
    decision: string;
    decidedAt?: string;
  }>;
}

export interface ProactiveBriefingData {
  /** Start of the change window */
  since: string | null;
  /** Human-readable delta description (e.g. "2 hours ago", "since yesterday") */
  sinceText: string | null;
  /** Total count of decisions logged in the window */
  decisionCount: number;
  /** Decisions summary detail */
  decisions: DecisionLogBriefingSummary;
  /** Total count of pending approvals */
  pendingApprovalCount: number;
  /** Approvals summary detail */
  approvals: ApprovalBriefingSummary;
  /** Whether any decisions or approvals changed */
  hasChanges: boolean;
  /** Structured markdown text for cockpit panel */
  text: string;
  /** Spoken turn text for neural voice mouth (concise, 1–3 sentences) */
  spokenText: string;
  /** Strict sources used: ONLY DecisionLogStore and InMemoryApprovalStore */
  sources: Array<'DecisionLogStore' | 'InMemoryApprovalStore'>;
  /** Generation latency in milliseconds (budget <= 50 ms) */
  latencyMs: number;
  /** Whether briefing is enabled in settings */
  enabled: boolean;
}

export interface ProactiveBriefingResult {
  success: boolean;
  enabled: boolean;
  briefing: ProactiveBriefingData | null;
  disabledReason?: string;
  error?: string;
}
