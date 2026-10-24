/**
 * SamJuniorsOS — First-Class Versioned Artifact Model
 * 
 * Target: Gate G4.2
 * Provides formal versioning, cryptographic provenance, approval linkages,
 * and immutable history for all company deliverables (PRDs, ADRs, financial models,
 * architecture specs, SOPs, and executive reports).
 * 
 * Strict Invariants:
 * 1. Provenance Integrity: Every artifact version tracks its author/creator agent or human,
 *    source workflow instance, input parameters fingerprint, and SHA-256 payload hash.
 * 2. Version Immutability: Once sealed, an artifact version cannot be overwritten in place.
 *    Modifications create a monotonically incremented new version (v1 -> v2 -> v3).
 * 3. Governance Linkage: High-impact or side-effect producing artifacts must be bound
 *    to an authoritative FounderApprovalRecord (by approvalId, status, and payload hash).
 * 4. Anti-Fabrication: Synthetic/fabricated artifacts are blocked; artifacts require
 *    either an authenticated agent run, verified tool execution, or founder directive.
 */

import { z } from 'zod';

export type ArtifactKind =
  | 'PRD'
  | 'ARCHITECTURE'
  | 'FINANCIAL_MODEL'
  | 'EXECUTIVE_REPORT'
  | 'DECISION_MEMO'
  | 'SOP'
  | 'CODE_DELIVERABLE'
  | 'RESEARCH_BRIEF';

export type ArtifactStatus = 'draft' | 'pending_approval' | 'approved' | 'superseded' | 'rejected' | 'archived';

export interface ArtifactProvenance {
  /** The creator agent, employee ID, or human user */
  createdBy: string;
  /** Role of the creator (e.g., 'researcher', 'product_manager', 'financial_modeler', 'founder') */
  creatorRole: string;
  /** Optional source workflow execution ID */
  workflowInstanceId?: string;
  /** Optional step within workflow */
  stepId?: string;
  /** Optional agent run reference */
  agentRunId?: string;
  /** Input hash / specification fingerprint driving this artifact generation */
  inputFingerprint?: string;
  /** Deterministic SHA-256 hash of the artifact content */
  contentHash: string;
  /** Timestamp when this provenance record was established */
  createdAt: string;
}

export interface ArtifactApprovalLinkage {
  /** The bound FounderApprovalRecord ID */
  approvalId: string;
  /** Approval decision status at time of linking */
  decision: 'approved' | 'rejected' | 'pending';
  /** Founder / Decider identity who executed the approval */
  decidedBy?: string;
  /** Timestamp of decision */
  decidedAt?: string;
  /** Cryptographic canonical payload hash bound to the approval gate */
  boundPayloadHash: string;
}

export interface ArtifactVersionRecord {
  /** Sequential version number starting at 1 */
  version: number;
  /** Markdown or structured content payload */
  content: string;
  /** Summary or change description for this version */
  changelog?: string;
  /** Formal provenance record */
  provenance: ArtifactProvenance;
  /** Optional approval binding */
  approval?: ArtifactApprovalLinkage;
  /** ISO timestamp of version creation */
  createdAt: string;
}

export interface ArtifactRecord {
  /** Unique permanent ID of the artifact across all versions */
  id: string;
  /** Human-readable slug (e.g. 'lumora-prd', 'adr-0007-stack-migration') */
  slug: string;
  /** Display title */
  title: string;
  /** Category / Domain */
  kind: ArtifactKind;
  /** Current active lifecycle status */
  status: ArtifactStatus;
  /** Latest active version number */
  currentVersion: number;
  /** Complete version history */
  versions: ArtifactVersionRecord[];
  /** Optional tags */
  tags: string[];
  /** Epistemic evidence references validating the claims within the artifact */
  evidenceClaimIds?: string[];
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

export const ArtifactKindSchema = z.enum([
  'PRD',
  'ARCHITECTURE',
  'FINANCIAL_MODEL',
  'EXECUTIVE_REPORT',
  'DECISION_MEMO',
  'SOP',
  'CODE_DELIVERABLE',
  'RESEARCH_BRIEF',
]);

export const ArtifactProvenanceSchema = z.object({
  createdBy: z.string().min(1),
  creatorRole: z.string().min(1),
  workflowInstanceId: z.string().optional(),
  stepId: z.string().optional(),
  agentRunId: z.string().optional(),
  inputFingerprint: z.string().optional(),
  contentHash: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const ArtifactApprovalLinkageSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approved', 'rejected', 'pending']),
  decidedBy: z.string().optional(),
  decidedAt: z.string().datetime().optional(),
  boundPayloadHash: z.string().min(1),
});

export const CreateArtifactInputSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-_]+$/i, 'Slug must be alphanumeric, hyphen, or underscore'),
  title: z.string().min(1),
  kind: ArtifactKindSchema,
  content: z.string().min(1),
  createdBy: z.string().min(1),
  creatorRole: z.string().min(1),
  workflowInstanceId: z.string().optional(),
  stepId: z.string().optional(),
  agentRunId: z.string().optional(),
  inputFingerprint: z.string().optional(),
  tags: z.array(z.string()).default([]),
  evidenceClaimIds: z.array(z.string()).default([]),
  approval: ArtifactApprovalLinkageSchema.optional(),
});

export type CreateArtifactInput = z.infer<typeof CreateArtifactInputSchema>;

export const CreateArtifactVersionInputSchema = z.object({
  content: z.string().min(1),
  changelog: z.string().optional(),
  createdBy: z.string().min(1),
  creatorRole: z.string().min(1),
  workflowInstanceId: z.string().optional(),
  stepId: z.string().optional(),
  agentRunId: z.string().optional(),
  inputFingerprint: z.string().optional(),
  approval: ArtifactApprovalLinkageSchema.optional(),
});

export type CreateArtifactVersionInput = z.infer<typeof CreateArtifactVersionInputSchema>;
