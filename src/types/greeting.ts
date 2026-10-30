/**
 * Sofia Greeting types (M1.5 / G6.6).
 * Grounded strictly in real company state and client time/session.
 */

export interface SofiaGreetingOptions {
  founderId?: string;
  clientTime?: string;
  clientHour?: number;
  lastSessionAt?: string | null;
}

export interface SofiaGreetingStateSummary {
  pendingApprovalsCount: number;
  activeWorkstreamsCount: number;
  openAlertsCount: number;
  openAlerts: string[];
  mrr?: number | null;
  runwayMonths?: number | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  formattedTime: string;
  lastSessionAt: string | null;
  lastSessionText: string | null;
}

export interface SofiaGreetingResult {
  text: string;
  hasRealState: boolean;
  stateSummary: SofiaGreetingStateSummary;
  latencyMs: number;
  liveAi: boolean;
  fallback: boolean;
  scopes: string[];
  sources: string[];
}
