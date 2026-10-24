/**
 * SamJuniorsOS — Versioned Artifact Store
 * 
 * Gate G4.2: First-Class Versioned Artifact Model
 * Provides persistent, collection-locked storage for company deliverables
 * with cryptographic SHA-256 hashing, provenance lineage, and approval binding.
 */

import crypto from 'node:crypto';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import {
  ArtifactRecord,
  ArtifactVersionRecord,
  CreateArtifactInput,
  CreateArtifactVersionInput,
  ArtifactApprovalLinkage,
  ArtifactStatus,
} from '@/types/artifact';

export interface IArtifactStore {
  createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord>;
  addVersion(artifactIdOrSlug: string, input: CreateArtifactVersionInput): Promise<ArtifactRecord>;
  getArtifact(idOrSlug: string): Promise<ArtifactRecord | null>;
  getArtifactVersion(idOrSlug: string, version: number): Promise<ArtifactVersionRecord | null>;
  listArtifacts(filter?: { kind?: string; status?: ArtifactStatus; tag?: string }): Promise<ArtifactRecord[]>;
  bindApproval(idOrSlug: string, version: number, linkage: ArtifactApprovalLinkage): Promise<ArtifactRecord>;
  updateStatus(idOrSlug: string, status: ArtifactStatus): Promise<ArtifactRecord>;
}

export class ArtifactStore implements IArtifactStore {
  private static instance: ArtifactStore | null = null;
  private readonly collection = 'artifacts';
  private fileStore: DurableFileStore;

  private constructor(fileStore?: DurableFileStore) {
    this.fileStore = fileStore || DurableFileStore.getInstance();
  }

  public static getInstance(fileStore?: DurableFileStore): ArtifactStore {
    if (!ArtifactStore.instance) {
      ArtifactStore.instance = new ArtifactStore(fileStore);
    }
    return ArtifactStore.instance;
  }

  public static resetInstance(): void {
    ArtifactStore.instance = null;
  }

  /**
   * Generates canonical SHA-256 hash of artifact content
   */
  public static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  public async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    return this.fileStore.withCollectionLockStrict(this.collection, () => {
      const all = this.fileStore.readCollection<ArtifactRecord>(this.collection);
      
      // Enforce slug uniqueness
      const existingSlug = Object.values(all).find((a) => a.slug.toLowerCase() === input.slug.toLowerCase());
      if (existingSlug) {
        throw new Error(`Artifact with slug '${input.slug}' already exists (ID: ${existingSlug.id})`);
      }

      const id = `art-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const contentHash = ArtifactStore.hashContent(input.content);

      const v1: ArtifactVersionRecord = {
        version: 1,
        content: input.content,
        changelog: 'Initial version',
        provenance: {
          createdBy: input.createdBy,
          creatorRole: input.creatorRole,
          workflowInstanceId: input.workflowInstanceId,
          stepId: input.stepId,
          agentRunId: input.agentRunId,
          inputFingerprint: input.inputFingerprint,
          contentHash,
          createdAt: now,
        },
        approval: input.approval,
        createdAt: now,
      };

      const status: ArtifactStatus = input.approval?.decision === 'approved' 
        ? 'approved' 
        : input.approval?.decision === 'pending' 
          ? 'pending_approval' 
          : 'draft';

      const record: ArtifactRecord = {
        id,
        slug: input.slug,
        title: input.title,
        kind: input.kind,
        status,
        currentVersion: 1,
        versions: [v1],
        tags: input.tags || [],
        evidenceClaimIds: input.evidenceClaimIds || [],
        createdAt: now,
        updatedAt: now,
      };

      this.fileStore.saveItemStrict(this.collection, id, record);
      return record;
    });
  }

  public async addVersion(idOrSlug: string, input: CreateArtifactVersionInput): Promise<ArtifactRecord> {
    return this.fileStore.withCollectionLockStrict(this.collection, () => {
      const all = this.fileStore.readCollection<ArtifactRecord>(this.collection);
      const artifact = Object.values(all).find(
        (a) => a.id === idOrSlug || a.slug.toLowerCase() === idOrSlug.toLowerCase()
      );

      if (!artifact) {
        throw new Error(`Artifact '${idOrSlug}' not found.`);
      }

      const now = new Date().toISOString();
      const contentHash = ArtifactStore.hashContent(input.content);
      const newVersionNum = artifact.currentVersion + 1;

      const newVersion: ArtifactVersionRecord = {
        version: newVersionNum,
        content: input.content,
        changelog: input.changelog || `Updated to v${newVersionNum}`,
        provenance: {
          createdBy: input.createdBy,
          creatorRole: input.creatorRole,
          workflowInstanceId: input.workflowInstanceId,
          stepId: input.stepId,
          agentRunId: input.agentRunId,
          inputFingerprint: input.inputFingerprint,
          contentHash,
          createdAt: now,
        },
        approval: input.approval,
        createdAt: now,
      };

      const updatedStatus: ArtifactStatus = input.approval?.decision === 'approved'
        ? 'approved'
        : input.approval?.decision === 'pending'
          ? 'pending_approval'
          : 'draft';

      const updatedRecord: ArtifactRecord = {
        ...artifact,
        status: updatedStatus,
        currentVersion: newVersionNum,
        versions: [...artifact.versions, newVersion],
        updatedAt: now,
      };

      this.fileStore.saveItemStrict(this.collection, artifact.id, updatedRecord);
      return updatedRecord;
    });
  }

  public async getArtifact(idOrSlug: string): Promise<ArtifactRecord | null> {
    const all = this.fileStore.readCollection<ArtifactRecord>(this.collection);
    const found = Object.values(all).find(
      (a) => a.id === idOrSlug || a.slug.toLowerCase() === idOrSlug.toLowerCase()
    );
    return found || null;
  }

  public async getArtifactVersion(idOrSlug: string, version: number): Promise<ArtifactVersionRecord | null> {
    const artifact = await this.getArtifact(idOrSlug);
    if (!artifact) return null;
    const v = artifact.versions.find((v) => v.version === version);
    return v || null;
  }

  public async listArtifacts(filter?: { kind?: string; status?: ArtifactStatus; tag?: string }): Promise<ArtifactRecord[]> {
    const all = this.fileStore.readCollection<ArtifactRecord>(this.collection);
    return Object.values(all).filter((a) => {
      if (filter?.kind && a.kind !== filter.kind) return false;
      if (filter?.status && a.status !== filter.status) return false;
      if (filter?.tag && !a.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  public async bindApproval(
    idOrSlug: string,
    version: number,
    linkage: ArtifactApprovalLinkage
  ): Promise<ArtifactRecord> {
    return this.fileStore.withCollectionLockStrict(this.collection, () => {
      const all = this.fileStore.readCollection<ArtifactRecord>(this.collection);
      const artifact = Object.values(all).find(
        (a) => a.id === idOrSlug || a.slug.toLowerCase() === idOrSlug.toLowerCase()
      );

      if (!artifact) {
        throw new Error(`Artifact '${idOrSlug}' not found.`);
      }

      const versionIndex = artifact.versions.findIndex((v) => v.version === version);
      if (versionIndex === -1) {
        throw new Error(`Artifact '${idOrSlug}' version ${version} not found.`);
      }

      // Check payload hash alignment
      const vRecord = artifact.versions[versionIndex];
      if (linkage.boundPayloadHash && vRecord.provenance.contentHash !== linkage.boundPayloadHash) {
        throw new Error(
          `Payload hash mismatch: Bound approval hash '${linkage.boundPayloadHash}' does not match artifact content hash '${vRecord.provenance.contentHash}'`
        );
      }

      const updatedVersions = [...artifact.versions];
      updatedVersions[versionIndex] = {
        ...vRecord,
        approval: linkage,
      };

      const newStatus: ArtifactStatus = linkage.decision === 'approved' 
        ? 'approved' 
        : linkage.decision === 'rejected' 
          ? 'rejected' 
          : 'pending_approval';

      const updatedRecord: ArtifactRecord = {
        ...artifact,
        status: newStatus,
        versions: updatedVersions,
        updatedAt: new Date().toISOString(),
      };

      this.fileStore.saveItemStrict(this.collection, artifact.id, updatedRecord);
      return updatedRecord;
    });
  }

  public async updateStatus(idOrSlug: string, status: ArtifactStatus): Promise<ArtifactRecord> {
    return this.fileStore.withCollectionLockStrict(this.collection, () => {
      const all = this.fileStore.readCollection<ArtifactRecord>(this.collection);
      const artifact = Object.values(all).find(
        (a) => a.id === idOrSlug || a.slug.toLowerCase() === idOrSlug.toLowerCase()
      );

      if (!artifact) {
        throw new Error(`Artifact '${idOrSlug}' not found.`);
      }

      const updatedRecord: ArtifactRecord = {
        ...artifact,
        status,
        updatedAt: new Date().toISOString(),
      };

      this.fileStore.saveItemStrict(this.collection, artifact.id, updatedRecord);
      return updatedRecord;
    });
  }
}
