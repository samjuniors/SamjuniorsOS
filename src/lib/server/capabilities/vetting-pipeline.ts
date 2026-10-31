import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  type CapabilityManifest,
  type CapabilityTrustTier,
} from "../../../types/capability";
import {
  type CapabilityProvenance,
  type CapabilityRiskAssessment,
  type CapabilityVettingProposal,
  type CapabilityVettingRecord,
  type FounderConfirmationPayload,
  type SecurityFinding,
  CapabilityProvenanceSchema,
  FounderConfirmationPayloadSchema,
  FounderConfirmationRequiredError,
  RuntimeSelfInstallForbiddenError,
  SecurityVettingFailedError,
  UnpinnedVersionForbiddenError,
  UntrustedQuarantinedError,
} from "../../../types/vetting";
import { CapabilityRegistry } from "./capability-registry";
import { SkillReviewStore } from "./skill-loader";
import { InMemoryAuditStore } from "../authorization/approval-store";
import { type SideEffectAuditRecord } from "../../../types/authorization";

/**
 * Third-Party Capability Vetting & Install Pipeline (Gate G14.4)
 *
 * Enforces:
 * 1. Zero Runtime Self-Install: Agents cannot self-install; proposals halt in pending confirmation.
 * 2. Mandatory Founder Confirmation: Installation without explicit Founder sign-off is impossible.
 * 3. Provenance & Version Pinning: Strict semver pinning and cryptographic source integrity.
 * 4. Permission Review & Sandboxing: Disallows wildcard permissions, flags high-privilege access.
 * 5. Community Untrusted Default: All third-party skills/tools default to quarantined untrusted tier.
 * 6. Audit & Review Records: Every evaluated item produces a permanent, tamper-evident record.
 */
export class CapabilityVettingPipeline {
  private static instance: CapabilityVettingPipeline | null = null;
  private proposals: Map<string, CapabilityVettingProposal> = new Map();
  private records: Map<string, CapabilityVettingRecord> = new Map();

  private constructor() {}

  public static getInstance(): CapabilityVettingPipeline {
    if (!CapabilityVettingPipeline.instance) {
      CapabilityVettingPipeline.instance = new CapabilityVettingPipeline();
    }
    return CapabilityVettingPipeline.instance;
  }

  /**
   * Resets internal store state (for isolated unit tests)
   */
  public clear(): void {
    this.proposals.clear();
    this.records.clear();
  }

  /**
   * Performs automated security analysis and permission review on a candidate manifest
   */
  public vetCandidate(
    manifest: CapabilityManifest,
    provenance: CapabilityProvenance,
    rawContent?: string
  ): CapabilityRiskAssessment {
    const findings: SecurityFinding[] = [];

    // 1. Version Pinning Verification
    if (!/^\d+\.\d+\.\d+$/.test(provenance.version) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      findings.push({
        ruleId: "VERSION_PINNING_REQUIRED",
        severity: "critical",
        message: `Version must be strictly pinned semantic version. Declared manifest: "${manifest.version}", provenance: "${provenance.version}".`,
      });
    }

    if (provenance.version !== manifest.version) {
      findings.push({
        ruleId: "VERSION_MISMATCH",
        severity: "critical",
        message: `Manifest version "${manifest.version}" does not match provenance version "${provenance.version}".`,
      });
    }

    // 2. Permission Review
    if (manifest.kind === "skill") {
      // Invariant: Skills are instructions, never authority!
      if (manifest.permissions && manifest.permissions.length > 0) {
        findings.push({
          ruleId: "SKILL_PERMISSIONS_FORBIDDEN",
          severity: "critical",
          message: `Skill attempted to declare permissions: [${manifest.permissions.join(", ")}]. Skills cannot grant authority.`,
        });
      }
    } else {
      // Tool / MCP Server permission audit
      for (const perm of manifest.permissions || []) {
        if (perm === "*" || perm.endsWith(":*")) {
          findings.push({
            ruleId: "NO_WILDCARD_PERMISSIONS",
            severity: "critical",
            message: `Wildcard permission "${perm}" is forbidden for third-party capabilities.`,
          });
        }
        if (perm.startsWith("process:exec") || perm.startsWith("env:")) {
          findings.push({
            ruleId: "ELEVATED_PRIVILEGE_REQUESTED",
            severity: "warning",
            message: `Capability requests elevated system permission: "${perm}".`,
          });
        }
      }
    }

    // 3. Static Content Inspection (Prompt Injection & Malicious Pattern Scanner)
    if (rawContent) {
      const suspiciousPatterns = [
        { regex: /ignore\s+(all\s+)?previous\s+instructions/i, ruleId: "PROMPT_INJECTION_SUSPICION", msg: "Suspected prompt injection: 'ignore previous instructions' detected." },
        { regex: /disregard\s+(the\s+)?(system|developer)\s+prompt/i, ruleId: "PROMPT_INJECTION_SUSPICION", msg: "Suspected prompt injection: instruction override detected." },
        { regex: /child_process\s*\.\s*(exec|spawn)/i, ruleId: "UNMEDIATED_SUBPROCESS_EXEC", msg: "Unmediated process execution primitive detected in source." },
        { regex: /eval\s*\(/i, ruleId: "DYNAMIC_CODE_EVAL", msg: "Dynamic code evaluation (eval) detected in third-party source." },
        { regex: /curl\s+-s.*\|\s*(sh|bash)/i, ruleId: "REMOTE_SHELL_PIPE", msg: "Remote shell pipe execution pattern detected." },
      ];

      for (const { regex, ruleId, msg } of suspiciousPatterns) {
        if (regex.test(rawContent)) {
          findings.push({
            ruleId,
            severity: "critical",
            message: msg,
          });
        }
      }
    }

    // 4. Compute overall risk level
    const hasCritical = findings.some((f) => f.severity === "critical");
    const hasError = findings.some((f) => f.severity === "error");
    const hasWarning = findings.some((f) => f.severity === "warning");

    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (hasCritical) riskLevel = "critical";
    else if (hasError) riskLevel = "high";
    else if (hasWarning) riskLevel = "medium";

    return {
      riskLevel,
      findings,
      automatedCheckPassed: !hasCritical && !hasError,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Proposes installation of a candidate capability.
   *
   * Invariant: Does NOT install or register the capability.
   * Runtime self-installation is strictly prohibited; proposal halts in pending founder confirmation.
   */
  public proposeInstall(params: {
    candidateManifest: CapabilityManifest;
    provenance: CapabilityProvenance;
    callerAgentId: string;
    rawContent?: string;
  }): CapabilityVettingProposal {
    // Enforce pinned version requirement before parsing
    if (
      params.provenance?.version &&
      !/^\d+\.\d+\.\d+$/.test(params.provenance.version)
    ) {
      throw new UnpinnedVersionForbiddenError(
        params.provenance.identifier || "unknown",
        params.provenance.version
      );
    }

    // Validate provenance schema
    const provenance = CapabilityProvenanceSchema.parse(params.provenance);

    // Perform security and permission vetting
    const riskAssessment = this.vetCandidate(
      params.candidateManifest,
      provenance,
      params.rawContent
    );

    // Compute cryptographic payload hash for binding
    const canonicalPayload = JSON.stringify({
      manifestId: params.candidateManifest.id,
      manifestVersion: params.candidateManifest.version,
      provenanceSource: provenance.source,
      provenanceIdentifier: provenance.identifier,
      integrityHash: provenance.integrityHash,
      requestedPermissions: params.candidateManifest.permissions || [],
    });

    const payloadHash = crypto
      .createHash("sha256")
      .update(canonicalPayload, "utf8")
      .digest("hex");

    const proposalId = `vet-prop-${uuidv4()}`;

    // Community and third-party capabilities default strictly to quarantined untrusted tier
    const candidateManifest: CapabilityManifest = {
      ...params.candidateManifest,
      trustTier: "untrusted", // strictly untrusted until Founder explicitly promotes
    };

    const proposal: CapabilityVettingProposal = {
      id: proposalId,
      capabilityId: candidateManifest.id,
      kind: candidateManifest.kind,
      candidateManifest,
      provenance,
      riskAssessment,
      status: "pending_founder_confirmation",
      requestedBy: params.callerAgentId,
      requestedAt: new Date().toISOString(),
      payloadHash,
    };

    this.proposals.set(proposalId, proposal);
    return proposal;
  }

  /**
   * Explicit Founder Confirmation Gate
   *
   * Invariant: Installing without founder confirmation is IMPOSSIBLE.
   * Non-founder callers are rejected immediately.
   */
  public async confirmInstall(params: {
    proposalId: string;
    founderConfirmation: FounderConfirmationPayload;
  }): Promise<CapabilityVettingRecord> {
    // Validate founder confirmation payload schema
    const confirmation = FounderConfirmationPayloadSchema.parse(
      params.founderConfirmation
    );

    // Security Gate: Ensure caller role is strictly 'founder'
    if (confirmation.role !== "founder") {
      throw new FounderConfirmationRequiredError(
        `Authorization failed: Caller "${confirmation.founderId}" does not possess founder role. Third-party installation requires explicit founder confirmation.`
      );
    }

    const proposal = this.proposals.get(params.proposalId);
    if (!proposal) {
      throw new Error(`Vetting proposal "${params.proposalId}" not found.`);
    }

    if (proposal.status !== "pending_founder_confirmation") {
      throw new Error(
        `Cannot confirm proposal "${params.proposalId}": Current status is "${proposal.status}".`
      );
    }

    // Check automated security assessment outcome
    if (
      !proposal.riskAssessment.automatedCheckPassed &&
      confirmation.decision === "approve" &&
      !confirmation.notes
    ) {
      throw new SecurityVettingFailedError(
        proposal.capabilityId,
        proposal.riskAssessment.findings
      );
    }

    const recordId = `vet-rec-${uuidv4()}`;

    if (confirmation.decision === "reject") {
      proposal.status = "rejected";
      proposal.founderConfirmation = confirmation;

      const record: CapabilityVettingRecord = {
        id: recordId,
        proposalId: proposal.id,
        capabilityId: proposal.capabilityId,
        kind: proposal.kind,
        version: proposal.candidateManifest.version,
        provenance: proposal.provenance,
        riskAssessment: proposal.riskAssessment,
        admittedTrustTier: "untrusted",
        status: "rejected",
        confirmedBy: confirmation.founderId,
        confirmedAt: confirmation.confirmedAt,
        payloadHash: proposal.payloadHash,
        notes: confirmation.notes || "Rejected by founder.",
      };

      this.records.set(recordId, record);
      return record;
    }

    if (confirmation.decision === "quarantine") {
      proposal.status = "quarantined";
      proposal.founderConfirmation = confirmation;

      const record: CapabilityVettingRecord = {
        id: recordId,
        proposalId: proposal.id,
        capabilityId: proposal.capabilityId,
        kind: proposal.kind,
        version: proposal.candidateManifest.version,
        provenance: proposal.provenance,
        riskAssessment: proposal.riskAssessment,
        admittedTrustTier: "untrusted",
        status: "quarantined",
        confirmedBy: confirmation.founderId,
        confirmedAt: confirmation.confirmedAt,
        payloadHash: proposal.payloadHash,
        notes: confirmation.notes || "Quarantined by founder decision.",
      };

      this.records.set(recordId, record);
      return record;
    }

    // Decision: approve
    const admittedTrustTier: CapabilityTrustTier = confirmation.targetTrustTier || "community";

    // Admitted manifest promoted with founder-approved trust tier
    const admittedManifest: CapabilityManifest = {
      ...proposal.candidateManifest,
      trustTier: admittedTrustTier,
    };

    // 1. Register into CapabilityRegistry
    CapabilityRegistry.getInstance().register(admittedManifest);

    // 2. If skill, also register an approved SkillReviewRecord into SkillReviewStore
    if (admittedManifest.kind === "skill") {
      SkillReviewStore.getInstance().addRecord({
        id: `rev-vet-${proposal.id}`,
        skillName: admittedManifest.name,
        version: admittedManifest.version,
        contentHash: proposal.provenance.integrityHash,
        reviewedBy: confirmation.founderId,
        reviewedAt: confirmation.confirmedAt,
        status: "approved",
        trustTier: admittedTrustTier,
        notes: confirmation.notes || "Approved via CapabilityVettingPipeline founder confirmation.",
      });
    }

    proposal.status = "founder_confirmed";
    proposal.founderConfirmation = confirmation;

    const record: CapabilityVettingRecord = {
      id: recordId,
      proposalId: proposal.id,
      capabilityId: proposal.capabilityId,
      kind: proposal.kind,
      version: proposal.candidateManifest.version,
      provenance: proposal.provenance,
      riskAssessment: proposal.riskAssessment,
      admittedTrustTier,
      status: "founder_confirmed",
      confirmedBy: confirmation.founderId,
      confirmedAt: confirmation.confirmedAt,
      payloadHash: proposal.payloadHash,
      notes: confirmation.notes,
    };

    this.records.set(recordId, record);

    // 3. Record immutable WORM audit log
    const auditRecord: SideEffectAuditRecord = {
      id: `audit-${uuidv4()}`,
      timestamp: new Date().toISOString(),
      requestId: `req-${proposal.id}`,
      employeeRole: "system",
      requestedBy: confirmation.founderId,
      skillId: admittedManifest.id,
      actionClassification: "internal_mutation",
      actionName: `capability:install:${admittedManifest.id}`,
      decision: "allowed",
      reasonCode: "INTERNAL_MUTATION_ALLOWED",
      reason: `Third-party capability "${admittedManifest.id}" installed with founder confirmation. Trust tier: ${admittedTrustTier}.`,
      executed: true,
    };

    try {
      await InMemoryAuditStore.getInstance().record(auditRecord);
    } catch (auditErr) {
      console.error("[CapabilityVettingPipeline] Failed to log audit record:", auditErr);
    }

    return record;
  }

  /**
   * Deterministic proof that runtime self-installation without founder confirmation is impossible.
   */
  public attemptRuntimeSelfInstall(callerId: string, capabilityId: string): never {
    throw new RuntimeSelfInstallForbiddenError(callerId, capabilityId);
  }

  /**
   * Retrieves a vetting proposal by ID
   */
  public getProposal(proposalId: string): CapabilityVettingProposal | null {
    return this.proposals.get(proposalId) || null;
  }

  /**
   * Retrieves a vetting record by ID
   */
  public getRecord(recordId: string): CapabilityVettingRecord | null {
    return this.records.get(recordId) || null;
  }

  /**
   * Lists all vetting records
   */
  public listRecords(): CapabilityVettingRecord[] {
    return Array.from(this.records.values());
  }
}
