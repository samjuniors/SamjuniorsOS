import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  SkillFrontmatterSchema,
  SkillReviewRecordSchema,
  type SkillDefinition,
  type SkillFrontmatter,
  type SkillReviewRecord,
  SkillValidationError,
  SkillNotReviewedError,
  SkillReviewRejectedError,
  SkillVersionMismatchError,
  SkillTamperingDetectedError,
  UntrustedSkillError,
} from "../../../types/skill";
import {
  type CapabilityManifest,
  type CapabilityTrustTier,
} from "../../../types/capability";
import { CapabilityRegistry } from "./capability-registry";

/**
 * Lightweight Zero-Dependency YAML Frontmatter Parser
 *
 * Adheres to open Agent Skills specification (agentskills.io).
 * Enforces strict parsing of YAML frontmatter enclosed in `---` delimiters.
 */
export function parseYamlFrontmatter(yamlText: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlText.split(/\r?\n/);
  let currentKey: string | null = null;
  let isList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines and full-line comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // List item under an active key (indented with '-' or starting with '-')
    if (trimmed.startsWith("- ") && currentKey) {
      if (!isList) {
        result[currentKey] = [];
        isList = true;
      }
      const val = trimmed.slice(2).trim();
      result[currentKey].push(cleanValue(val));
      continue;
    }

    // Key-value pair
    const colonIndex = rawLine.indexOf(":");
    if (colonIndex !== -1) {
      const key = rawLine.slice(0, colonIndex).trim();
      const valPart = rawLine.slice(colonIndex + 1).trim();

      // Defense-in-depth: Guard against prototype pollution on untrusted YAML input
      if (
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        continue;
      }

      currentKey = key;
      isList = false;

      if (valPart.length === 0) {
        // Might be followed by list items on next lines
        result[key] = [];
        isList = true;
      } else {
        result[key] = cleanValue(valPart);
      }
    }
  }

  return result;
}

function cleanValue(raw: string): any {
  let val = raw;
  // Strip trailing comments
  const commentIdx = val.indexOf(" #");
  if (commentIdx !== -1) {
    val = val.slice(0, commentIdx).trim();
  }

  // Quoted string
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }

  // Boolean
  if (val.toLowerCase() === "true") return true;
  if (val.toLowerCase() === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return Number(val);
  }

  return val;
}

/**
 * Parses a SKILL.md file into frontmatter and instructions body
 */
export function parseSkillMarkdown(rawContent: string, filePath: string): {
  frontmatter: SkillFrontmatter;
  instructions: string;
  contentHash: string;
} {
  const contentHash = crypto
    .createHash("sha256")
    .update(rawContent, "utf8")
    .digest("hex");

  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new SkillValidationError(
      `File "${filePath}" does not contain valid YAML frontmatter between --- delimiters per Agent Skills specification.`
    );
  }

  const rawYaml = match[1];
  const instructions = match[2].trim();

  let parsedRaw: Record<string, any>;
  try {
    parsedRaw = parseYamlFrontmatter(rawYaml);
  } catch (err: any) {
    throw new SkillValidationError(
      `Failed to parse YAML frontmatter in "${filePath}": ${err.message}`,
      err
    );
  }

  const parseResult = SkillFrontmatterSchema.safeParse(parsedRaw);
  if (!parseResult.success) {
    const issues = parseResult.error.issues || (parseResult.error as any).errors || [];
    const errorDetails = issues
      .map((e: any) => `${e.path?.join(".") || "frontmatter"}: ${e.message}`)
      .join("; ");
    throw new SkillValidationError(
      `Invalid skill frontmatter in "${filePath}": ${errorDetails}`,
      parseResult.error
    );
  }

  return {
    frontmatter: parseResult.data,
    instructions,
    contentHash,
  };
}

/**
 * In-Memory Review Record Store for Skills
 */
export class SkillReviewStore {
  private static instance: SkillReviewStore | null = null;
  private records: Map<string, SkillReviewRecord> = new Map();

  static getInstance(): SkillReviewStore {
    if (!SkillReviewStore.instance) {
      SkillReviewStore.instance = new SkillReviewStore();
    }
    return SkillReviewStore.instance;
  }

  addRecord(record: SkillReviewRecord): void {
    const validated = SkillReviewRecordSchema.parse(record);
    const key = `${validated.skillName}@${validated.version}`;
    this.records.set(key, validated);
  }

  getRecord(skillName: string, version: string): SkillReviewRecord | null {
    const key = `${skillName}@${version}`;
    return this.records.get(key) || null;
  }

  listRecords(): SkillReviewRecord[] {
    return Array.from(this.records.values());
  }

  clear(): void {
    this.records.clear();
  }
}

/**
 * Skill Loader
 *
 * Responsible for:
 * 1. Discovering and parsing SKILL.md files (Agent Skills spec - agentskills.io)
 * 2. Enforcing version pinning and cryptographic content integrity
 * 3. Enforcing review records prior to activation
 * 4. Quarantining untrusted community skills
 * 5. Guaranteeing ZERO authority/permissions granted to skills
 * 6. Registering approved skills into the CapabilityRegistry behind CapabilityGateway
 */
export class SkillLoader {
  private static instance: SkillLoader | null = null;
  private loadedSkills: Map<string, SkillDefinition> = new Map();
  private reviewStore: SkillReviewStore;

  constructor(reviewStore?: SkillReviewStore) {
    this.reviewStore = reviewStore || SkillReviewStore.getInstance();
  }

  static getInstance(): SkillLoader {
    if (!SkillLoader.instance) {
      SkillLoader.instance = new SkillLoader();
    }
    return SkillLoader.instance;
  }

  /**
   * Reset loader state (primarily for test isolation)
   */
  clear(): void {
    this.loadedSkills.clear();
    this.reviewStore.clear();
  }

  /**
   * Loads a skill from a specific SKILL.md file path
   */
  loadSkillFromFile(filePath: string): SkillDefinition {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Skill file not found at path: ${filePath}`);
    }

    const rawContent = fs.readFileSync(filePath, "utf8");
    const { frontmatter, instructions, contentHash } = parseSkillMarkdown(
      rawContent,
      filePath
    );

    const reviewRecord = this.reviewStore.getRecord(
      frontmatter.name,
      frontmatter.version
    );

    const skillDef: SkillDefinition = {
      frontmatter,
      instructions,
      contentHash,
      filePath: path.resolve(filePath),
      reviewRecord,
      isActive: false,
      isReviewed: reviewRecord !== null && reviewRecord.status === "approved",
    };

    this.loadedSkills.set(frontmatter.name, skillDef);
    return skillDef;
  }

  /**
   * Scans a directory recursively for SKILL.md files
   */
  loadSkillsFromDirectory(dirPath: string): SkillDefinition[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const results: SkillDefinition[] = [];
    const scanDir = (current: string) => {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (
          entry.isFile() &&
          entry.name.toLowerCase() === "skill.md"
        ) {
          try {
            const skill = this.loadSkillFromFile(fullPath);
            results.push(skill);
          } catch (err: any) {
            console.warn(`[SkillLoader] Skipping invalid skill at ${fullPath}: ${err.message}`);
          }
        }
      }
    };

    scanDir(dirPath);
    return results;
  }

  /**
   * Retrieves a loaded skill by name
   */
  getSkill(name: string): SkillDefinition | null {
    return this.loadedSkills.get(name) || null;
  }

  /**
   * Lists all loaded skills
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.loadedSkills.values());
  }

  /**
   * Activates a skill, ensuring:
   * 1. A review record exists with status "approved"
   * 2. The skill version is pinned and matches the review record
   * 3. The content hash matches the reviewed SHA-256 (no tampering)
   * 4. Community skills are treated as untrusted unless promoted by review
   * 5. Zero permissions are granted (permissions = [])
   * 6. Registered into CapabilityRegistry for invocation via CapabilityGateway
   */
  activateSkill(
    skillName: string,
    options?: {
      targetVersion?: string;
      registry?: CapabilityRegistry;
    }
  ): CapabilityManifest {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      throw new Error(
        `Cannot activate skill "${skillName}": Skill has not been loaded from disk.`
      );
    }

    const versionToActivate =
      options?.targetVersion || skill.frontmatter.version;

    // Check version format is strictly pinned semver
    if (!/^\d+\.\d+\.\d+$/.test(versionToActivate)) {
      throw new SkillValidationError(
        `Skill "${skillName}" version must be pinned semantic version (e.g. 1.0.0), received "${versionToActivate}".`
      );
    }

    // 1. Activation requires a review record
    const reviewRecord = this.reviewStore.getRecord(
      skillName,
      versionToActivate
    );
    if (!reviewRecord) {
      throw new SkillNotReviewedError(skillName, versionToActivate);
    }

    // 2. Review record status check
    if (reviewRecord.status !== "approved") {
      throw new SkillReviewRejectedError(
        skillName,
        reviewRecord.status,
        reviewRecord.notes
      );
    }

    // 3. Version pinning check
    if (reviewRecord.version !== skill.frontmatter.version) {
      throw new SkillVersionMismatchError(
        skillName,
        skill.frontmatter.version,
        reviewRecord.version
      );
    }

    // 4. Cryptographic integrity check (tampering detection)
    if (reviewRecord.contentHash !== skill.contentHash) {
      throw new SkillTamperingDetectedError(
        skillName,
        skill.contentHash,
        reviewRecord.contentHash
      );
    }

    // 5. Untrusted community skill check:
    // If the review record assigns "untrusted", activation is refused.
    if (reviewRecord.trustTier === "untrusted") {
      throw new UntrustedSkillError(skillName);
    }

    // 6. Security Invariant: Skills are instructions, never authority!
    // A skill CANNOT grant permissions. Manifest permissions must strictly be empty [].
    const trustTier: CapabilityTrustTier = reviewRecord.trustTier;
    const capabilityId = `skill:${skillName}`;

    const manifest: CapabilityManifest = {
      id: capabilityId,
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      kind: "skill",
      version: skill.frontmatter.version,
      trustTier,
      sideEffectClass: "read_only", // Skills are read-only instruction sets
      permissions: [], // STRICT: Skills cannot grant permissions!
      cost: { perCallCents: 0, currency: "USD" },
      entrypoint: {
        type: "prompt_template",
        target: skill.filePath,
      },
      metadata: {
        author: skill.frontmatter.author,
        license: skill.frontmatter.license,
        allowedTools: skill.frontmatter.allowedTools,
        tags: skill.frontmatter.tags,
        instructions: skill.instructions,
        reviewRecordId: reviewRecord.id,
        reviewedBy: reviewRecord.reviewedBy,
        reviewedAt: reviewRecord.reviewedAt,
      },
    };

    // Register capability with executor that returns guidance instructions
    const registry = options?.registry || CapabilityRegistry.getInstance();
    registry.register(manifest, async (parameters: any) => {
      return {
        executed: true,
        skillId: capabilityId,
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        version: skill.frontmatter.version,
        instructions: skill.instructions,
        allowedTools: skill.frontmatter.allowedTools,
        parameters,
      };
    });

    skill.isActive = true;
    skill.isReviewed = true;
    skill.reviewRecord = reviewRecord;

    return manifest;
  }

  /**
   * Helper to format skill instructions with runtime parameters
   */
  renderSkill(skillName: string, context: Record<string, any> = {}): string {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      throw new Error(`Skill "${skillName}" is not loaded.`);
    }

    let rendered = skill.instructions;
    for (const [key, value] of Object.entries(context)) {
      rendered = rendered.replace(
        new RegExp(`{{\\s*${key}\\s*}}`, "g"),
        String(value)
      );
    }
    return rendered;
  }
}
