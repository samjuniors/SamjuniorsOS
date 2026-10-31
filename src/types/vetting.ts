import { z } from "zod";
import {
  CapabilityKindSchema,
  CapabilityManifestSchema,
  CapabilityPermissionSchema,
  CapabilityTrustTierSchema,
  type CapabilityKind,
  type CapabilityManifest,
  type CapabilityPermission,
  type CapabilityTrustTier,
} from "./capability";

/**
 * Third-Party Candidate Provenance Schema (Gate G14.4)
 *
 * Verifies exact source origin, repository, pinned version, and cryptographic hash.
 */
export const CapabilityProvenanceSchema = z.object({
  source: z.enum(["npm", "github", "agentskills", "mcp_registry", "local_file"]),
  identifier: z.string().min(1, "Identifier/package name is required"),
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must be strictly pinned semantic version (floating versions or tags like 'latest', '^1.0' are forbidden)"
    ),
  commitHash: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/i, "Commit hash must be 40 or 64 hex characters")
    .optional(),
  integrityHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Integrity hash must be a 64-character SHA-256 hex string"),
  repositoryUrl: z.string().url().optional(),
  author: z.string().optional(),
});

export type CapabilityProvenance = z.infer<typeof CapabilityProvenanceSchema>;

/**
 * Automated Security Vetting Finding
 */
export const SecurityFindingSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
  "critical",
]);

export type SecurityFindingSeverity = z.infer<typeof SecurityFindingSeveritySchema>;

export const SecurityFindingSchema = z.object({
  ruleId: z.string().min(1),
  severity: SecurityFindingSeveritySchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.any()).optional(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

/**
 * Capability Risk Assessment
 */
export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const CapabilityRiskAssessmentSchema = z.object({
  riskLevel: RiskLevelSchema,
  findings: z.array(SecurityFindingSchema).default([]),
  automatedCheckPassed: z.boolean(),
  analyzedAt: z.string().datetime(),
});

export type CapabilityRiskAssessment = z.infer<typeof CapabilityRiskAssessmentSchema>;

/**
 * Vetting Proposal Status
 */
export const VettingProposalStatusSchema = z.enum([
  "pending_founder_confirmation",
  "founder_confirmed",
  "rejected",
  "quarantined",
]);

export type VettingProposalStatus = z.infer<typeof VettingProposalStatusSchema>;

/**
 * Founder Confirmation Decision Payload
 */
export const FounderConfirmationPayloadSchema = z.object({
  founderId: z.string().min(1),
  role: z.literal("founder"),
  decision: z.enum(["approve", "reject", "quarantine"]),
  targetTrustTier: CapabilityTrustTierSchema.default("community"),
  notes: z.string().optional(),
  confirmedAt: z.string().datetime(),
});

export type FounderConfirmationPayload = z.infer<typeof FounderConfirmationPayloadSchema>;

/**
 * Capability Vetting Proposal
 */
export const CapabilityVettingProposalSchema = z.object({
  id: z.string().min(1),
  capabilityId: z.string().min(1),
  kind: CapabilityKindSchema,
  candidateManifest: CapabilityManifestSchema,
  provenance: CapabilityProvenanceSchema,
  riskAssessment: CapabilityRiskAssessmentSchema,
  status: VettingProposalStatusSchema,
  requestedBy: z.string().min(1),
  requestedAt: z.string().datetime(),
  payloadHash: z.string().min(1),
  founderConfirmation: FounderConfirmationPayloadSchema.optional(),
});

export type CapabilityVettingProposal = z.infer<typeof CapabilityVettingProposalSchema>;

/**
 * Capability Vetting Permanent Record
 */
export const CapabilityVettingRecordSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  capabilityId: z.string().min(1),
  kind: CapabilityKindSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  provenance: CapabilityProvenanceSchema,
  riskAssessment: CapabilityRiskAssessmentSchema,
  admittedTrustTier: CapabilityTrustTierSchema,
  status: VettingProposalStatusSchema,
  confirmedBy: z.string().min(1),
  confirmedAt: z.string().datetime(),
  payloadHash: z.string().min(1),
  notes: z.string().optional(),
});

export type CapabilityVettingRecord = z.infer<typeof CapabilityVettingRecordSchema>;

/**
 * Vetting and Installation Errors
 */
export class RuntimeSelfInstallForbiddenError extends Error {
  constructor(callerId: string, capabilityId: string) {
    super(
      `[RuntimeSelfInstallForbiddenError] Agent "${callerId}" attempted to self-install capability "${capabilityId}". Runtime self-installation is strictly forbidden. All additions require founder confirmation.`
    );
    this.name = "RuntimeSelfInstallForbiddenError";
  }
}

export class FounderConfirmationRequiredError extends Error {
  constructor(message?: string) {
    super(
      `[FounderConfirmationRequiredError] ${message || "Installing third-party tools, skills, or MCP servers is impossible without explicit founder confirmation."}`
    );
    this.name = "FounderConfirmationRequiredError";
  }
}

export class UnpinnedVersionForbiddenError extends Error {
  constructor(identifier: string, version: string) {
    super(
      `[UnpinnedVersionForbiddenError] Candidate "${identifier}" declares unpinned version "${version}". Only strictly pinned semantic versions (e.g. 1.0.0) are allowed.`
    );
    this.name = "UnpinnedVersionForbiddenError";
  }
}

export class SecurityVettingFailedError extends Error {
  constructor(capabilityId: string, findings: SecurityFinding[]) {
    const findingMsgs = findings.map((f) => `[${f.severity.toUpperCase()}] ${f.message}`).join("; ");
    super(
      `[SecurityVettingFailedError] Automated security vetting failed for "${capabilityId}": ${findingMsgs}`
    );
    this.name = "SecurityVettingFailedError";
  }
}

export class UntrustedQuarantinedError extends Error {
  constructor(capabilityId: string, reason?: string) {
    super(
      `[UntrustedQuarantinedError] Capability "${capabilityId}" is treated as untrusted and quarantined: ${reason || "Third-party community capability has not received founder confirmation."}`
    );
    this.name = "UntrustedQuarantinedError";
  }
}
