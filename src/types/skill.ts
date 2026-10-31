import { z } from "zod";
import { CapabilityTrustTierSchema, type CapabilityTrustTier } from "./capability";

/**
 * Skill Review Status
 */
export const SkillReviewStatusSchema = z.enum([
  "approved",
  "rejected",
  "quarantined",
]);

export type SkillReviewStatus = z.infer<typeof SkillReviewStatusSchema>;

/**
 * Skill Frontmatter Schema (Agent Skills open standard - agentskills.io)
 *
 * INVARIANT: Skills are instructions, NEVER authority.
 * A skill cannot declare or grant permissions, roles, or security privileges.
 * Any attempt to declare permissions in frontmatter triggers a hard rejection.
 */
export const SkillFrontmatterSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(
        /^[a-z0-9_-]+$/i,
        "Skill name must contain only alphanumeric characters, dashes, and underscores"
      ),
    description: z.string().min(1, "Skill description is required"),
    version: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Version must be a strictly pinned semantic version (e.g. 1.0.0, floating versions like 'latest' or '^1.0' are forbidden)"
      ),
    author: z.string().optional(),
    license: z.string().optional(),
    allowedTools: z.array(z.string()).default([]),
    trustTier: CapabilityTrustTierSchema.default("community"),
    compatibility: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // Explicitly reject permission-granting attempts
    permissions: z.unknown().optional(),
    privileges: z.unknown().optional(),
    roles: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.permissions !== undefined && data.permissions !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["permissions"],
        message:
          "Security violation: A skill cannot grant permissions or declare privileges. Skills are instructions, never authority.",
      });
    }
    if (data.privileges !== undefined && data.privileges !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["privileges"],
        message:
          "Security violation: A skill cannot declare privileges. Skills are instructions, never authority.",
      });
    }
    if (data.roles !== undefined && data.roles !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roles"],
        message:
          "Security violation: A skill cannot grant roles. Skills are instructions, never authority.",
      });
    }
  });

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

/**
 * Skill Review Record Schema
 *
 * Implements deterministic verification requirement:
 * No skill can be activated without an approved, cryptographically pinned review record.
 */
export const SkillReviewRecordSchema = z.object({
  id: z.string().min(1),
  skillName: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Review record must pin exact semantic version"),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Content hash must be valid SHA-256 hex string"),
  reviewedBy: z.string().min(1, "Reviewer identifier required"),
  reviewedAt: z.string().datetime(),
  status: SkillReviewStatusSchema,
  trustTier: CapabilityTrustTierSchema.default("community"),
  notes: z.string().optional(),
});

export type SkillReviewRecord = z.infer<typeof SkillReviewRecordSchema>;

/**
 * Parsed Skill Definition
 */
export interface SkillDefinition {
  frontmatter: SkillFrontmatter;
  instructions: string;
  contentHash: string;
  filePath: string;
  reviewRecord: SkillReviewRecord | null;
  isActive: boolean;
  isReviewed: boolean;
}

/**
 * Skill Errors
 */
export class SkillValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(`[SkillValidationError] ${message}`);
    this.name = "SkillValidationError";
  }
}

export class SkillPermissionForbiddenError extends Error {
  constructor(skillName: string, field: string) {
    super(
      `[SkillPermissionForbiddenError] Skill "${skillName}" attempted to declare "${field}". Skills are instructions, never authority, and cannot grant permissions.`
    );
    this.name = "SkillPermissionForbiddenError";
  }
}

export class SkillNotReviewedError extends Error {
  constructor(skillName: string, version: string) {
    super(
      `[SkillNotReviewedError] Skill "${skillName}" (v${version}) has no approved review record. Activation requires explicit founder/security review.`
    );
    this.name = "SkillNotReviewedError";
  }
}

export class SkillReviewRejectedError extends Error {
  constructor(skillName: string, status: SkillReviewStatus, reason?: string) {
    super(
      `[SkillReviewRejectedError] Skill "${skillName}" cannot be activated because review status is "${status}". Reason: ${reason || "none specified"}`
    );
    this.name = "SkillReviewRejectedError";
  }
}

export class SkillVersionMismatchError extends Error {
  constructor(skillName: string, skillVersion: string, reviewedVersion: string) {
    super(
      `[SkillVersionMismatchError] Skill "${skillName}" version (v${skillVersion}) does not match pinned review record version (v${reviewedVersion}).`
    );
    this.name = "SkillVersionMismatchError";
  }
}

export class SkillTamperingDetectedError extends Error {
  constructor(skillName: string, actualHash: string, expectedHash: string) {
    super(
      `[SkillTamperingDetectedError] Tampering detected for skill "${skillName}". Content hash (${actualHash}) does not match reviewed SHA-256 (${expectedHash}).`
    );
    this.name = "SkillTamperingDetectedError";
  }
}

export class UntrustedSkillError extends Error {
  constructor(skillName: string) {
    super(
      `[UntrustedSkillError] Skill "${skillName}" is treated as untrusted and quarantined. Activation requires an explicit founder review record promoting trust tier.`
    );
    this.name = "UntrustedSkillError";
  }
}
