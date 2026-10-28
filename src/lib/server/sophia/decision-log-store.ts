import { randomUUID } from 'crypto';
import { prisma, isDatabaseAvailable } from '../db/prisma';
import { DurableFileStore } from '../persistence/durable-file-store';
import {
  SophiaDecisionLogEntry,
  DecisionOutcome,
  buildDecisionLogEntry,
} from './decision-log';
import { SophiaRoute, MemoryScope } from './types';
import { DecisionPolicyResult } from '../../../types/decision';
import { SophiaIntentClassifier } from './intent-classifier';

/**
 * ============================================================================
 * DECISION LOG STORE (G12.6 / M4)
 * ============================================================================
 * Authoritative persistence and query engine for all routing and execution
 * decisions made by Sophia and AI specialists.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * - "No log entry means no action": If a decision log entry cannot be recorded,
 *   the downstream action fails closed and execution is halted.
 * - Every 'why did you do that' query cites an authoritative decision log ID.
 */

const COLLECTION = 'decision_logs';

export interface CreateDecisionLogInput {
  id?: string;
  turnId?: string;
  messageId?: string;
  conversationId: string;
  actor?: string;
  query: string;
  route: SophiaRoute;
  scopes?: MemoryScope[];
  confidence: number;
  divertedFromRoute?: SophiaRoute;
  isLowConfidenceClarification?: boolean;
  policyResult?: DecisionPolicyResult;
  outcome: DecisionOutcome;
  sources?: string[];
  reasoning: string;
  executionRef?: string;
  replayPayload?: Record<string, any>;
  timestamp?: string;
}

export interface DecisionLogFilter {
  conversationId?: string;
  route?: SophiaRoute;
  outcome?: DecisionOutcome;
  actor?: string;
  turnId?: string;
  since?: string | Date;
  until?: string | Date;
  limit?: number;
  offset?: number;
}

export interface DecisionReplayResult {
  success: boolean;
  matches: boolean;
  originalEntry: SophiaDecisionLogEntry;
  replayedRoute: SophiaRoute;
  replayedConfidence: number;
  divertedFromRoute?: SophiaRoute;
  driftExplanation?: string;
}

export class DecisionLogStore {
  private static instance: DecisionLogStore;
  private memoryCache: Map<string, SophiaDecisionLogEntry> = new Map();
  private fileStore: DurableFileStore;
  private initialized: boolean = false;

  private constructor() {
    this.fileStore = DurableFileStore.getInstance();
  }

  public static getInstance(): DecisionLogStore {
    if (!DecisionLogStore.instance) {
      DecisionLogStore.instance = new DecisionLogStore();
    }
    return DecisionLogStore.instance;
  }

  private ensureInitialized() {
    if (this.initialized) return;
    try {
      const dict = this.fileStore.readCollection<SophiaDecisionLogEntry>(COLLECTION);
      const items = Object.values(dict);
      for (const item of items) {
        if (item?.id) {
          this.memoryCache.set(item.id, item);
        }
      }
    } catch {
      // Non-fatal if local directory is empty
    }
    this.initialized = true;
  }

  /**
   * Validates and records an authoritative decision log entry.
   * Throws if validation fails or persistence fails closed.
   */
  public async recordDecision(input: CreateDecisionLogInput): Promise<SophiaDecisionLogEntry> {
    this.ensureInitialized();

    // 1. Strict Validation
    if (!input.conversationId || typeof input.conversationId !== 'string' || !input.conversationId.trim()) {
      throw new Error('Decision log rejected: conversationId is required');
    }
    if (!input.query || typeof input.query !== 'string' || !input.query.trim()) {
      throw new Error('Decision log rejected: query input is required');
    }
    if (!input.route || typeof input.route !== 'string') {
      throw new Error('Decision log rejected: valid route is required');
    }
    if (typeof input.confidence !== 'number' || isNaN(input.confidence)) {
      throw new Error('Decision log rejected: numeric confidence is required');
    }
    if (!input.outcome || typeof input.outcome !== 'string') {
      throw new Error('Decision log rejected: outcome is required');
    }
    if (!input.reasoning || typeof input.reasoning !== 'string' || !input.reasoning.trim()) {
      throw new Error('Decision log rejected: reasoning is required');
    }

    const entry = buildDecisionLogEntry({
      id: input.id,
      turnId: input.turnId,
      messageId: input.messageId,
      conversationId: input.conversationId,
      actor: input.actor || 'sophia',
      query: input.query,
      route: input.route,
      scopes: input.scopes,
      confidence: input.confidence,
      divertedFromRoute: input.divertedFromRoute,
      isLowConfidenceClarification: input.isLowConfidenceClarification,
      policyResult: input.policyResult,
      outcome: input.outcome,
      sources: input.sources,
      reasoning: input.reasoning,
      executionRef: input.executionRef,
      replayPayload: input.replayPayload || {
        query: input.query,
        route: input.route,
        confidence: input.confidence,
        scopes: input.scopes,
        divertedFromRoute: input.divertedFromRoute,
        isLowConfidenceClarification: input.isLowConfidenceClarification,
      },
      timestamp: input.timestamp,
    });

    // 2. Persist to Authoritative Prisma/SQLite Database
    let persistedToDb = false;
    try {
      const dbAvailable = await isDatabaseAvailable();
      if (dbAvailable && (prisma as any)?.decisionLogEntry) {
        await (prisma as any).decisionLogEntry.upsert({
          where: { id: entry.id },
          create: {
            id: entry.id,
            turnId: entry.turnId || null,
            messageId: entry.messageId || null,
            conversationId: entry.conversationId,
            actor: entry.actor,
            query: entry.query,
            route: entry.route,
            confidence: entry.confidence,
            divertedFromRoute: entry.divertedFromRoute || null,
            isLowConfidenceClarification: Boolean(entry.isLowConfidenceClarification),
            policyResult: entry.policyResult || {},
            outcome: entry.outcome,
            scopes: entry.scopes || [],
            sources: entry.sources || [],
            reasoning: entry.reasoning,
            executionRef: entry.executionRef || null,
            replayPayload: entry.replayPayload || null,
            createdAt: new Date(entry.timestamp),
          },
          update: {
            turnId: entry.turnId || null,
            messageId: entry.messageId || null,
            actor: entry.actor,
            query: entry.query,
            route: entry.route,
            confidence: entry.confidence,
            divertedFromRoute: entry.divertedFromRoute || null,
            isLowConfidenceClarification: Boolean(entry.isLowConfidenceClarification),
            policyResult: entry.policyResult || {},
            outcome: entry.outcome,
            scopes: entry.scopes || [],
            sources: entry.sources || [],
            reasoning: entry.reasoning,
            executionRef: entry.executionRef || null,
            replayPayload: entry.replayPayload || null,
          },
        });
        persistedToDb = true;
      }
    } catch (dbErr: any) {
      console.warn('[DecisionLogStore] Database write failed, falling back to durable store:', dbErr.message);
    }

    // 3. Persist to DurableFileStore & memory cache (ensures durability across test runners and restarts)
    try {
      this.fileStore.saveItem(COLLECTION, entry.id, entry);
      this.memoryCache.set(entry.id, entry);
    } catch (fsErr: any) {
      if (!persistedToDb) {
        throw new Error(`Failed to persist decision log entry fail-closed: ${fsErr.message}`);
      }
    }

    return entry;
  }

  /**
   * Retrieves a decision log entry by its canonical ID.
   */
  public async getDecision(id: string): Promise<SophiaDecisionLogEntry | null> {
    this.ensureInitialized();
    const cleanId = id.trim();

    try {
      const dbAvailable = await isDatabaseAvailable();
      if (dbAvailable && (prisma as any)?.decisionLogEntry) {
        const row = await (prisma as any).decisionLogEntry.findUnique({
          where: { id: cleanId },
        });
        if (row) {
          return this.mapPrismaRowToEntry(row);
        }
      }
    } catch {
      // Fallback to cache/fileStore
    }

    const cached = this.memoryCache.get(cleanId);
    if (cached) return cached;

    const fromFile = this.fileStore.getItem<SophiaDecisionLogEntry>(COLLECTION, cleanId);
    if (fromFile) {
      this.memoryCache.set(cleanId, fromFile);
      return fromFile;
    }

    return null;
  }

  /**
   * Retrieves the latest decision log entry for a conversation.
   */
  public async getLatestDecision(conversationId: string): Promise<SophiaDecisionLogEntry | null> {
    this.ensureInitialized();
    const cleanConvId = conversationId.trim();

    try {
      const dbAvailable = await isDatabaseAvailable();
      if (dbAvailable && (prisma as any)?.decisionLogEntry) {
        const row = await (prisma as any).decisionLogEntry.findFirst({
          where: { conversationId: cleanConvId },
          orderBy: { createdAt: 'desc' },
        });
        if (row) {
          return this.mapPrismaRowToEntry(row);
        }
      }
    } catch {
      // Fallback
    }

    // Search in cache
    const matched: SophiaDecisionLogEntry[] = [];
    for (const item of this.memoryCache.values()) {
      if (item.conversationId === cleanConvId) {
        matched.push(item);
      }
    }

    if (matched.length === 0) return null;
    matched.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return matched[0];
  }

  /**
   * Retrieves a decision log entry by conversationId and turnId.
   */
  public async getDecisionByTurnId(
    conversationId: string,
    turnId: string
  ): Promise<SophiaDecisionLogEntry | null> {
    this.ensureInitialized();
    const cleanConvId = conversationId.trim();
    const cleanTurnId = turnId.trim();

    try {
      const dbAvailable = await isDatabaseAvailable();
      if (dbAvailable && (prisma as any)?.decisionLogEntry) {
        const row = await (prisma as any).decisionLogEntry.findFirst({
          where: {
            conversationId: cleanConvId,
            turnId: cleanTurnId,
          },
        });
        if (row) {
          return this.mapPrismaRowToEntry(row);
        }
      }
    } catch {
      // Fallback
    }

    for (const item of this.memoryCache.values()) {
      if (item.conversationId === cleanConvId && item.turnId === cleanTurnId) {
        return item;
      }
    }

    return null;
  }

  /**
   * Queries decision log entries with flexible filtering.
   */
  public async queryDecisions(filter: DecisionLogFilter = {}): Promise<SophiaDecisionLogEntry[]> {
    this.ensureInitialized();
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
    const offset = Math.max(0, filter.offset ?? 0);

    try {
      const dbAvailable = await isDatabaseAvailable();
      if (dbAvailable && (prisma as any)?.decisionLogEntry) {
        const where: any = {};
        if (filter.conversationId) where.conversationId = filter.conversationId;
        if (filter.route) where.route = filter.route;
        if (filter.outcome) where.outcome = filter.outcome;
        if (filter.actor) where.actor = filter.actor;
        if (filter.turnId) where.turnId = filter.turnId;
        if (filter.since || filter.until) {
          where.createdAt = {};
          if (filter.since) where.createdAt.gte = new Date(filter.since);
          if (filter.until) where.createdAt.lte = new Date(filter.until);
        }

        const rows = await (prisma as any).decisionLogEntry.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        });

        return rows.map((r: any) => this.mapPrismaRowToEntry(r));
      }
    } catch {
      // Fallback to cache filtering
    }

    let items = Array.from(this.memoryCache.values());

    if (filter.conversationId) {
      items = items.filter((i) => i.conversationId === filter.conversationId);
    }
    if (filter.route) {
      items = items.filter((i) => i.route === filter.route);
    }
    if (filter.outcome) {
      items = items.filter((i) => i.outcome === filter.outcome);
    }
    if (filter.actor) {
      items = items.filter((i) => i.actor === filter.actor);
    }
    if (filter.turnId) {
      items = items.filter((i) => i.turnId === filter.turnId);
    }
    if (filter.since) {
      const sinceMs = new Date(filter.since).getTime();
      items = items.filter((i) => new Date(i.timestamp).getTime() >= sinceMs);
    }
    if (filter.until) {
      const untilMs = new Date(filter.until).getTime();
      items = items.filter((i) => new Date(i.timestamp).getTime() <= untilMs);
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items.slice(offset, offset + limit);
  }

  /**
   * Replays and re-evaluates a decision log entry deterministically.
   */
  public async replayDecision(id: string): Promise<DecisionReplayResult> {
    const entry = await this.getDecision(id);
    if (!entry) {
      throw new Error(`Decision log entry [${id}] not found for replay`);
    }

    // Replay classification
    const replayed = await SophiaIntentClassifier.route({
      message: entry.query,
    });

    const matches =
      replayed.route === entry.route &&
      (!entry.divertedFromRoute || replayed.divertedFromRoute === entry.divertedFromRoute);

    let driftExplanation: string | undefined;
    if (!matches) {
      driftExplanation = `Replay route '${replayed.route}' (confidence: ${replayed.confidence.toFixed(2)}) differed from original route '${entry.route}' (confidence: ${entry.confidence.toFixed(2)})`;
    }

    return {
      success: true,
      matches,
      originalEntry: entry,
      replayedRoute: replayed.route,
      replayedConfidence: replayed.confidence,
      divertedFromRoute: replayed.divertedFromRoute,
      driftExplanation,
    };
  }

  /**
   * Clears data for test isolation.
   */
  public async clearForTest(): Promise<void> {
    this.memoryCache.clear();
    try {
      const dbAvailable = await isDatabaseAvailable();
      if (dbAvailable && (prisma as any)?.decisionLogEntry) {
        await (prisma as any).decisionLogEntry.deleteMany({});
      }
    } catch {}
    try {
      this.fileStore.clearCollection(COLLECTION);
    } catch {}
  }

  private mapPrismaRowToEntry(row: any): SophiaDecisionLogEntry {
    const parseJson = (val: any, fallback: any) => {
      if (!val) return fallback;
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      }
      return val;
    };

    return {
      id: row.id,
      turnId: row.turnId || undefined,
      messageId: row.messageId || undefined,
      conversationId: row.conversationId,
      actor: row.actor || 'sophia',
      timestamp: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      query: row.query,
      route: row.route as SophiaRoute,
      scopes: parseJson(row.scopes, []),
      confidence: typeof row.confidence === 'number' ? row.confidence : 1.0,
      divertedFromRoute: row.divertedFromRoute || undefined,
      isLowConfidenceClarification: Boolean(row.isLowConfidenceClarification),
      policyResult: parseJson(row.policyResult, {}),
      outcome: row.outcome as DecisionOutcome,
      sources: parseJson(row.sources, []),
      reasoning: row.reasoning,
      executionRef: row.executionRef || undefined,
      replayPayload: parseJson(row.replayPayload, undefined),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}
