import { z } from 'zod';

/**
 * Zod Schemas for Runtime Data Boundaries (FounderOS-DEMO Pattern)
 * Guarantees that external inputs, client payloads, and agent outputs
 * are strictly validated before touching the epistemic pipeline.
 */

export const EvidenceSourceSchema = z.object({
  id: z.string().min(1),
  sourceSystem: z.string().min(1),
  uri: z.string().optional(),
  title: z.string().min(1),
  rawContent: z.string().min(1),
  contentHash: z.string().min(8),
  capturedAt: z.string(),
  capturedBy: z.enum(['coo', 'researcher', 'pm', 'finance', 'founder', 'system']),
  metadata: z.record(z.string(), z.any()).optional(),
  provenanceKind: z.enum(['live_operational', 'synthetic', 'sandbox_mock']),
});

export const EpistemicClaimInputSchema = z.object({
  sourceId: z.string().optional(),
  signalId: z.string().optional(),
  statement: z.string().min(5),
  subject: z.string().min(2),
  category: z.enum(['financial', 'architectural', 'operational', 'market_research', 'governance']),
  proposedBy: z.enum(['coo', 'researcher', 'pm', 'finance', 'founder', 'advisor', 'system']),
  confidence: z.enum(['verified_fact', 'high_confidence', 'medium_confidence', 'unverified', 'hypothetical']).default('unverified'),
  evidenceReferences: z.array(z.string()).default([]),
  verificationNotes: z.string().optional(),
  agentRunId: z.string().optional(),
});

export const ClaimVerificationInputSchema = z.object({
  claimId: z.string().min(1),
  decision: z.enum(['approve_and_promote', 'reject', 'request_founder_review']),
  reason: z.string().min(3),
  reviewerRole: z.string().default('founder'),
  reviewerId: z.string().optional(),
});

export const AgentRunRecordSchema = z.object({
  runId: z.string().min(1),
  agentId: z.enum(['coo', 'researcher', 'pm', 'finance', 'advisor']),
  protocolStep: z.string().min(1),
  taskTitle: z.string().min(1),
  directive: z.string().min(1),
  status: z.enum(['completed', 'failed', 'halted']),
  durationMs: z.number().nonnegative(),
  outputContent: z.string(),
  structuredData: z.record(z.string(), z.any()).optional(),
  error: z.string().optional(),
  claimsGenerated: z.array(z.string()).optional(),
  timestamp: z.string(),
});
