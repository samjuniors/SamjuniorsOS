import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  SkillLoader,
  SkillReviewStore,
  parseSkillMarkdown,
  parseYamlFrontmatter,
} from "../../src/lib/server/capabilities/skill-loader";
import {
  SkillValidationError,
  SkillNotReviewedError,
  SkillReviewRejectedError,
  SkillVersionMismatchError,
  SkillTamperingDetectedError,
  UntrustedSkillError,
  type SkillReviewRecord,
} from "../../src/types/skill";
import { CapabilityRegistry } from "../../src/lib/server/capabilities/capability-registry";
import { CapabilityGateway } from "../../src/lib/server/capabilities/capability-gateway";
import { InMemoryAuditStore } from "../../src/lib/server/authorization/approval-store";

describe("Gate G14.3 — Skills Loader for SKILL.md format (Agent Skills spec)", () => {
  let skillLoader: SkillLoader;
  let reviewStore: SkillReviewStore;
  let capabilityRegistry: CapabilityRegistry;
  let tempDir: string;

  beforeEach(() => {
    skillLoader = SkillLoader.getInstance();
    reviewStore = SkillReviewStore.getInstance();
    capabilityRegistry = CapabilityRegistry.getInstance();

    skillLoader.clear();
    reviewStore.clear();
    capabilityRegistry.reset();
    InMemoryAuditStore.getInstance().clear();

    // Create a sandbox temporary directory for dynamic skill tests
    tempDir = path.join(process.cwd(), "tests", "fixtures", `temp-skills-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("1. Agent Skills Open Spec Compliance & YAML Parser", () => {
    it("parses YAML frontmatter correctly with lists, booleans, and strings", () => {
      const yaml = `
name: sample-analyzer
description: Analyzes code structure and complexity.
version: 1.2.3
author: "Sophia Dev"
license: 'Apache-2.0'
allowedTools:
  - ast_parser
  - git_log
tags:
  - analysis
  - code
`;
      const parsed = parseYamlFrontmatter(yaml);
      expect(parsed.name).toBe("sample-analyzer");
      expect(parsed.description).toBe("Analyzes code structure and complexity.");
      expect(parsed.version).toBe("1.2.3");
      expect(parsed.author).toBe("Sophia Dev");
      expect(parsed.license).toBe("Apache-2.0");
      expect(parsed.allowedTools).toEqual(["ast_parser", "git_log"]);
      expect(parsed.tags).toEqual(["analysis", "code"]);
    });

    it("rejects files missing YAML frontmatter delimiters", () => {
      const invalidContent = "# Just a markdown header without frontmatter";
      expect(() => {
        parseSkillMarkdown(invalidContent, "invalid.md");
      }).toThrow(SkillValidationError);
    });
  });

  describe("2. Loads a Skill by Name and Description", () => {
    it("loads core market-intelligence skill from disk", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      expect(skill.frontmatter.name).toBe("market-intelligence");
      expect(skill.frontmatter.description).toContain("Strategic competitive intelligence");
      expect(skill.frontmatter.version).toBe("1.0.0");
      expect(skill.frontmatter.allowedTools).toEqual(["web_search", "financial_model"]);
      expect(skill.instructions).toContain("# Market Intelligence Skill");
      expect(skill.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(skill.isActive).toBe(false); // Unactivated by default
    });

    it("discovers and loads all skills recursively from directory", () => {
      const skillsDir = path.join(process.cwd(), ".agent", "skills");
      const loaded = skillLoader.loadSkillsFromDirectory(skillsDir);

      expect(loaded.length).toBeGreaterThanOrEqual(2);
      const names = loaded.map((s) => s.frontmatter.name);
      expect(names).toContain("market-intelligence");
      expect(names).toContain("community-web-scraper");
    });
  });

  describe("3. Skills Cannot Grant Permissions (Security Invariant)", () => {
    it("rejects skill frontmatter attempting to declare permissions", () => {
      const maliciousSkill = `---
name: privilege-escalator
description: Attempts to grant itself filesystem and network access.
version: 1.0.0
permissions:
  - "fs:write:*"
  - "net:outbound:*"
---
# Malicious Skill
This skill attempts to grant permissions.
`;
      const filePath = path.join(tempDir, "malicious.md");
      fs.writeFileSync(filePath, maliciousSkill, "utf8");

      expect(() => {
        skillLoader.loadSkillFromFile(filePath);
      }).toThrow(SkillValidationError);
    });

    it("rejects skill frontmatter attempting to declare privileges or roles", () => {
      const roleEscalator = `---
name: role-hijacker
description: Attempts to declare role elevation.
version: 1.0.0
roles:
  - "founder"
privileges:
  - "admin"
---
# Role Hijacker
`;
      const filePath = path.join(tempDir, "roles.md");
      fs.writeFileSync(filePath, roleEscalator, "utf8");

      expect(() => {
        skillLoader.loadSkillFromFile(filePath);
      }).toThrow(SkillValidationError);
    });

    it("strictly ensures activated capability manifest permissions array is empty []", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      // Register valid review record
      reviewStore.addRecord({
        id: "rev-001",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: skill.contentHash,
        reviewedBy: "founder",
        reviewedAt: new Date().toISOString(),
        status: "approved",
        trustTier: "core",
        notes: "Audited and approved core skill.",
      });

      const manifest = skillLoader.activateSkill(skill.frontmatter.name);
      expect(manifest.permissions).toEqual([]);
      expect(manifest.sideEffectClass).toBe("read_only");
    });
  });

  describe("4. Activation Needs a Review Record", () => {
    it("refuses activation when no review record exists", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      skillLoader.loadSkillFromFile(skillPath);

      expect(() => {
        skillLoader.activateSkill("market-intelligence");
      }).toThrow(SkillNotReviewedError);
    });

    it("refuses activation when review record status is rejected", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      reviewStore.addRecord({
        id: "rev-rejected",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: skill.contentHash,
        reviewedBy: "security-auditor",
        reviewedAt: new Date().toISOString(),
        status: "rejected",
        trustTier: "core",
        notes: "Instruction quality does not meet company bar.",
      });

      expect(() => {
        skillLoader.activateSkill(skill.frontmatter.name);
      }).toThrow(SkillReviewRejectedError);
    });

    it("refuses activation when review record status is quarantined", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      reviewStore.addRecord({
        id: "rev-quarantined",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: skill.contentHash,
        reviewedBy: "sec-ops",
        reviewedAt: new Date().toISOString(),
        status: "quarantined",
        trustTier: "core",
        notes: "Quarantined pending deep inspection.",
      });

      expect(() => {
        skillLoader.activateSkill(skill.frontmatter.name);
      }).toThrow(SkillReviewRejectedError);
    });
  });

  describe("5. Strictly Pinned Versions & Tampering Detection", () => {
    it("rejects unpinned versions (e.g. latest, floating ranges, wildcards)", () => {
      const unpinnedSkill = `---
name: floating-version-skill
description: Tests floating version rejection.
version: "latest"
---
# Floating Version
`;
      const filePath = path.join(tempDir, "floating.md");
      fs.writeFileSync(filePath, unpinnedSkill, "utf8");

      expect(() => {
        skillLoader.loadSkillFromFile(filePath);
      }).toThrow(SkillValidationError);
    });

    it("detects version mismatch between review record and skill file", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      // Review was recorded for version 0.9.0, but skill file is 1.0.0
      reviewStore.addRecord({
        id: "rev-mismatch",
        skillName: skill.frontmatter.name,
        version: "0.9.0",
        contentHash: skill.contentHash,
        reviewedBy: "founder",
        reviewedAt: new Date().toISOString(),
        status: "approved",
        trustTier: "core",
      });

      expect(() => {
        skillLoader.activateSkill(skill.frontmatter.name);
      }).toThrow(SkillNotReviewedError);
    });

    it("detects tampering when content hash differs from reviewed hash", () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      // Review record has outdated / tampered hash
      const fakeTamperedHash = crypto
        .createHash("sha256")
        .update("tampered content", "utf8")
        .digest("hex");

      reviewStore.addRecord({
        id: "rev-tampered",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: fakeTamperedHash,
        reviewedBy: "founder",
        reviewedAt: new Date().toISOString(),
        status: "approved",
        trustTier: "core",
      });

      expect(() => {
        skillLoader.activateSkill(skill.frontmatter.name);
      }).toThrow(SkillTamperingDetectedError);
    });
  });

  describe("6. Treat Community Skills as Untrusted", () => {
    it("defaults community skills to untrusted tier and quarantines them", () => {
      const communityPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "community-web-scraper",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(communityPath);
      expect(skill.frontmatter.trustTier).toBe("community");

      // Review record explicitly flags trust tier as untrusted
      reviewStore.addRecord({
        id: "rev-untrusted",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: skill.contentHash,
        reviewedBy: "security-auditor",
        reviewedAt: new Date().toISOString(),
        status: "approved",
        trustTier: "untrusted",
        notes: "Community skill quarantined pending sandbox verification.",
      });

      expect(() => {
        skillLoader.activateSkill(skill.frontmatter.name);
      }).toThrow(UntrustedSkillError);
    });

    it("promotes community skill only when reviewed and signed off as verified_partner", () => {
      const communityPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "community-web-scraper",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(communityPath);

      // Explicit review promotes to verified_partner
      reviewStore.addRecord({
        id: "rev-promoted",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: skill.contentHash,
        reviewedBy: "founder",
        reviewedAt: new Date().toISOString(),
        status: "approved",
        trustTier: "verified_partner",
        notes: "Verified safe community scraper.",
      });

      const manifest = skillLoader.activateSkill(skill.frontmatter.name);
      expect(manifest.trustTier).toBe("verified_partner");
      expect(manifest.permissions).toEqual([]);
    });
  });

  describe("7. Full Integration Behind CapabilityGateway & Audit Trail", () => {
    it("executes activated skill through CapabilityGateway and logs audit record", async () => {
      const skillPath = path.join(
        process.cwd(),
        ".agent",
        "skills",
        "market-intelligence",
        "SKILL.md"
      );
      const skill = skillLoader.loadSkillFromFile(skillPath);

      reviewStore.addRecord({
        id: "rev-approved-gateway",
        skillName: skill.frontmatter.name,
        version: skill.frontmatter.version,
        contentHash: skill.contentHash,
        reviewedBy: "founder",
        reviewedAt: new Date().toISOString(),
        status: "approved",
        trustTier: "core",
      });

      skillLoader.activateSkill(skill.frontmatter.name);

      // Invoke through CapabilityGateway
      const result = await CapabilityGateway.invoke({
        capabilityId: "skill:market-intelligence",
        callerAgentId: "maya-lin",
        parameters: { targetCompetitor: "CompetitorX" },
        reason: "Gather market landscape for Q4 strategy briefing.",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("executed");
      expect(result.data.executed).toBe(true);
      expect(result.data.name).toBe("market-intelligence");
      expect(result.data.instructions).toContain("# Market Intelligence Skill");
      expect(result.data.parameters).toEqual({ targetCompetitor: "CompetitorX" });

      // Verify immutable audit log
      const auditRecords = await InMemoryAuditStore.getInstance().list();
      expect(auditRecords.length).toBeGreaterThanOrEqual(1);
      const audit = auditRecords.find((a) => a.actionName === "skill:market-intelligence");
      expect(audit).toBeDefined();
      expect(audit?.decision).toBe("allowed");
      expect(audit?.skillId).toBe("skill:market-intelligence");
      expect(audit?.requestedBy).toBe("maya-lin");
      expect(audit?.reasonCode).toBe("READ_ONLY_ALLOWED");
    });

    it("renders templated instruction parameters with renderSkill helper", () => {
      const templateSkill = `---
name: templated-skill
description: Demonstrates parameter substitution in instructions.
version: 1.0.0
---
Analyze {{company}} regarding {{topic}}.
`;
      const filePath = path.join(tempDir, "templated.md");
      fs.writeFileSync(filePath, templateSkill, "utf8");

      skillLoader.loadSkillFromFile(filePath);
      const rendered = skillLoader.renderSkill("templated-skill", {
        company: "Acme Corp",
        topic: "pricing models",
      });

      expect(rendered).toBe("Analyze Acme Corp regarding pricing models.");
    });
  });
});
