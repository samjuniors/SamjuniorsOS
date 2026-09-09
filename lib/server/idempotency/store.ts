import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '../db/authority';
import { DurableFileStore } from '../persistence/durable-file-store';
import {
  IdempotencyStatus,
  IdempotencyPayloadMismatchError,
  OperationInProgressError,
  UnknownExternalResultError,
  IdempotencyConflictError,
} from './state-machine';

export interface IdempotencyRecordData {
  id: string;
  key: string;
  actionName: string;
  payloadHash?: string | null;
  status: IdempotencyStatus;
  executionRef?: string | null;
  response?: any;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export interface IdempotencyClaimParams {
  key: string;
  actionName: string;
  payloadHash?: string;
  executionRef?: string;
  ttlMs?: number;
}

export type IdempotencyClaimResult =
  | { state: 'claimed'; record: IdempotencyRecordData }
  | { state: 'completed'; record: IdempotencyRecordData }
  | { state: 'in_progress'; record: IdempotencyRecordData }
  | { state: 'unknown'; record: IdempotencyRecordData }
  | { state: 'failed'; record: IdempotencyRecordData };

export interface IdempotencyStore {
  claim(params: IdempotencyClaimParams): Promise<IdempotencyClaimResult>;
  complete(key: string, response: any, executionRef?: string): Promise<IdempotencyRecordData>;
  fail(key: string, error: string, executionRef?: string): Promise<IdempotencyRecordData>;
  markUnknown(key: string, error: string, executionRef?: string): Promise<IdempotencyRecordData>;
  get(key: string): Promise<IdempotencyRecordData | null>;
  clear(): void;
}

/**
 * Authoritative PostgreSQL Idempotency Store.
 * Uses PostgreSQL row locking and unique constraints for atomic concurrency safety.
 * Fail-closed if database is unavailable in authoritative mode.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  private static instance: PostgresIdempotencyStore;

  public static getInstance(): PostgresIdempotencyStore {
    if (!PostgresIdempotencyStore.instance) {
      PostgresIdempotencyStore.instance = new PostgresIdempotencyStore();
    }
    return PostgresIdempotencyStore.instance;
  }

  /**
   * Claim an idempotency key using a single atomic INSERT anchored by the `key` UNIQUE constraint.
   *
   * Phase 2.6 hardening: the previous implementation caught the P2002 insert race and then
   * re-queried INSIDE the same interactive transaction. PostgreSQL has already aborted that
   * transaction (25P02), so every losing worker crashed with PrismaClientUnknownRequestError
   * instead of receiving a structured in-progress/unknown/failed verdict.
   *
   * Corrected protocol (no interactive transaction, no recovery on an aborted connection):
   *   1. Fast read — classify an already-present record (payload mismatch / completed /
   *      in_progress / unknown / failed) without writing.
   *   2. Atomic INSERT (status=in_progress) — the UNIQUE(key) constraint alone decides the
   *      winner when two workers race on a fresh key.
   *   3. P2002 loser resolution — a FRESH read on a healthy connection reclassifies the
   *      winner's record so the loser gets the exact same verdict as the fast path.
   */
  async claim(params: IdempotencyClaimParams): Promise<IdempotencyClaimResult> {
    const db = await requireAuthoritativeDatabase();

    // 1. Fast path: classify an existing record (read-only).
    const existing = await db.idempotencyRecord.findUnique({
      where: { key: params.key },
    });
    if (existing) {
      return this.classifyExistingRecord(params, existing);
    }

    // 2. Atomic anchor: single INSERT decided by the UNIQUE(key) constraint.
    try {
      const created = await db.idempotencyRecord.create({
        data: {
          key: params.key,
          actionName: params.actionName,
          payloadHash: params.payloadHash || null,
          status: 'in_progress',
          executionRef: params.executionRef || null,
          expiresAt: params.ttlMs ? new Date(Date.now() + params.ttlMs) : null,
        },
      });
      return { state: 'claimed', record: this.mapPrismaToRecord(created) };
    } catch (createErr: any) {
      if (createErr.code !== 'P2002') {
        throw createErr;
      }
      // 3. Lost the insert race: resolve the winner with a FRESH read (healthy connection).
      const winner = await db.idempotencyRecord.findUnique({
        where: { key: params.key },
      });
      if (!winner) {
        // Winner inserted and the record vanished (test cleanup edge): retry once via create.
        const retried = await db.idempotencyRecord.create({
          data: {
            key: params.key,
            actionName: params.actionName,
            payloadHash: params.payloadHash || null,
            status: 'in_progress',
            executionRef: params.executionRef || null,
            expiresAt: params.ttlMs ? new Date(Date.now() + params.ttlMs) : null,
          },
        });
        return { state: 'claimed', record: this.mapPrismaToRecord(retried) };
      }
      return this.classifyExistingRecord(params, winner);
    }
  }

  /**
   * Classify a durable idempotency record against the incoming claim parameters.
   * Shared by the fast path and the P2002 race-loser resolution path so both produce
   * identical verdicts.
   */
  private classifyExistingRecord(
    params: IdempotencyClaimParams,
    existing: any
  ): IdempotencyClaimResult {
    // Enforce cryptographic payload binding: the same key cannot be reused with an altered payload.
    if (params.payloadHash && existing.payloadHash && existing.payloadHash !== params.payloadHash) {
      throw new IdempotencyPayloadMismatchError(
        params.key,
        existing.payloadHash,
        params.payloadHash
      );
    }

    const mapped = this.mapPrismaToRecord(existing);

    if (existing.status === 'completed') {
      return { state: 'completed', record: mapped };
    }
    if (existing.status === 'in_progress') {
      throw new OperationInProgressError(
        params.key,
        existing.executionRef || undefined,
        existing.createdAt.toISOString()
      );
    }
    if (existing.status === 'unknown') {
      throw new UnknownExternalResultError(
        params.key,
        existing.executionRef || undefined,
        existing.error || undefined
      );
    }
    throw new IdempotencyConflictError(
      params.key,
      'failed',
      existing.error || 'Previous operation failed definitively'
    );
  }

  async complete(key: string, response: any, executionRef?: string): Promise<IdempotencyRecordData> {
    const db = await requireAuthoritativeDatabase();
    const updated = await db.idempotencyRecord.update({
      where: { key },
      data: {
        status: 'completed',
        response: response !== undefined ? response : {},
        executionRef: executionRef || undefined,
        updatedAt: new Date(),
      },
    });
    return this.mapPrismaToRecord(updated);
  }

  async fail(key: string, error: string, executionRef?: string): Promise<IdempotencyRecordData> {
    const db = await requireAuthoritativeDatabase();
    const updated = await db.idempotencyRecord.update({
      where: { key },
      data: {
        status: 'failed',
        error: error || 'Execution failed',
        executionRef: executionRef || undefined,
        updatedAt: new Date(),
      },
    });
    return this.mapPrismaToRecord(updated);
  }

  async markUnknown(key: string, error: string, executionRef?: string): Promise<IdempotencyRecordData> {
    const db = await requireAuthoritativeDatabase();
    const updated = await db.idempotencyRecord.update({
      where: { key },
      data: {
        status: 'unknown',
        error: error || 'External side-effect status ambiguous',
        executionRef: executionRef || undefined,
        updatedAt: new Date(),
      },
    });
    return this.mapPrismaToRecord(updated);
  }

  async get(key: string): Promise<IdempotencyRecordData | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.idempotencyRecord.findUnique({
      where: { key },
    });
    if (!found) return null;
    return this.mapPrismaToRecord(found);
  }

  clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Idempotency records are governed and cannot be cleared in production.');
    }
  }

  private mapPrismaToRecord(r: any): IdempotencyRecordData {
    return {
      id: r.id,
      key: r.key,
      actionName: r.actionName,
      payloadHash: r.payloadHash,
      status: r.status as IdempotencyStatus,
      executionRef: r.executionRef,
      response: r.response,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    };
  }
}

/**
 * Dual-Mode In-Memory Idempotency Store.
 * Used for local test execution and development adapters.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private static instance: InMemoryIdempotencyStore;
  public records: Map<string, IdempotencyRecordData> = new Map();

  private constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): InMemoryIdempotencyStore {
    if (!InMemoryIdempotencyStore.instance) {
      InMemoryIdempotencyStore.instance = new InMemoryIdempotencyStore();
    }
    return InMemoryIdempotencyStore.instance;
  }

  public loadFromDurableStorage(): void {
    try {
      const persisted = DurableFileStore.getInstance().readCollection<IdempotencyRecordData>('idempotency_records');
      for (const [key, record] of Object.entries(persisted)) {
        this.records.set(key, record);
      }
    } catch {
      // fallback
    }
  }

  async claim(params: IdempotencyClaimParams): Promise<IdempotencyClaimResult> {
    if (isAuthoritativeMode()) {
      return PostgresIdempotencyStore.getInstance().claim(params);
    }

    const existing = this.records.get(params.key);
    if (existing) {
      if (params.payloadHash && existing.payloadHash && existing.payloadHash !== params.payloadHash) {
        throw new IdempotencyPayloadMismatchError(
          params.key,
          existing.payloadHash,
          params.payloadHash
        );
      }

      const clone = JSON.parse(JSON.stringify(existing));
      if (existing.status === 'completed') return { state: 'completed', record: clone };
      if (existing.status === 'in_progress') {
        throw new OperationInProgressError(params.key, existing.executionRef || undefined, existing.createdAt);
      }
      if (existing.status === 'unknown') {
        throw new UnknownExternalResultError(params.key, existing.executionRef || undefined, existing.error || undefined);
      }
      throw new IdempotencyConflictError(params.key, 'failed', existing.error || 'Previous operation failed definitively');
    }

    const now = new Date().toISOString();
    const newRecord: IdempotencyRecordData = {
      id: `idem-rec-${uuidv4()}`,
      key: params.key,
      actionName: params.actionName,
      payloadHash: params.payloadHash || null,
      status: 'in_progress',
      executionRef: params.executionRef || null,
      createdAt: now,
      updatedAt: now,
      expiresAt: params.ttlMs ? new Date(Date.now() + params.ttlMs).toISOString() : null,
    };

    this.records.set(params.key, newRecord);
    try {
      DurableFileStore.getInstance().saveItem('idempotency_records', params.key, newRecord);
    } catch {}

    return {
      state: 'claimed',
      record: JSON.parse(JSON.stringify(newRecord)),
    };
  }

  async complete(key: string, response: any, executionRef?: string): Promise<IdempotencyRecordData> {
    if (isAuthoritativeMode()) {
      return PostgresIdempotencyStore.getInstance().complete(key, response, executionRef);
    }

    const existing = this.records.get(key);
    if (!existing) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    existing.status = 'completed';
    existing.response = response !== undefined ? response : {};
    if (executionRef) existing.executionRef = executionRef;
    existing.updatedAt = new Date().toISOString();

    this.records.set(key, existing);
    try {
      DurableFileStore.getInstance().saveItem('idempotency_records', key, existing);
    } catch {}

    return JSON.parse(JSON.stringify(existing));
  }

  async fail(key: string, error: string, executionRef?: string): Promise<IdempotencyRecordData> {
    if (isAuthoritativeMode()) {
      return PostgresIdempotencyStore.getInstance().fail(key, error, executionRef);
    }

    const existing = this.records.get(key);
    if (!existing) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    existing.status = 'failed';
    existing.error = error;
    if (executionRef) existing.executionRef = executionRef;
    existing.updatedAt = new Date().toISOString();

    this.records.set(key, existing);
    try {
      DurableFileStore.getInstance().saveItem('idempotency_records', key, existing);
    } catch {}

    return JSON.parse(JSON.stringify(existing));
  }

  async markUnknown(key: string, error: string, executionRef?: string): Promise<IdempotencyRecordData> {
    if (isAuthoritativeMode()) {
      return PostgresIdempotencyStore.getInstance().markUnknown(key, error, executionRef);
    }

    const existing = this.records.get(key);
    if (!existing) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    existing.status = 'unknown';
    existing.error = error;
    if (executionRef) existing.executionRef = executionRef;
    existing.updatedAt = new Date().toISOString();

    this.records.set(key, existing);
    try {
      DurableFileStore.getInstance().saveItem('idempotency_records', key, existing);
    } catch {}

    return JSON.parse(JSON.stringify(existing));
  }

  async get(key: string): Promise<IdempotencyRecordData | null> {
    if (isAuthoritativeMode()) {
      return PostgresIdempotencyStore.getInstance().get(key);
    }

    const existing = this.records.get(key);
    if (!existing) return null;
    return JSON.parse(JSON.stringify(existing));
  }

  clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Idempotency records are governed and cannot be cleared in production.');
    }
    this.records.clear();
    try {
      DurableFileStore.getInstance().clearCollection('idempotency_records');
    } catch {}
  }
}

export function getIdempotencyStore(): IdempotencyStore {
  if (isAuthoritativeMode()) {
    return PostgresIdempotencyStore.getInstance();
  }
  return InMemoryIdempotencyStore.getInstance();
}
