/**
 * Gate G4.2: First-Class Versioned Artifact Model Verification Suite
 *
 * Verifies:
 * 1. Artifact creation, versioning, and immutable history.
 * 2. Cryptographic SHA-256 provenance calculation and lineage tracking.
 * 3. Authoritative FounderApprovalRecord binding and tamper rejection.
 * 4. CompanyBrain single-path integration for artifacts.
 * 5. Durability across simulated process restart (clean singleton reset).
 * 6. Protection against duplicate slugs and fabricated data.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { CompanyBrain } from '@/lib/server/brain/company-brain';
import { ArtifactStore } from '@/lib/server/artifacts/artifact-store';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { CreateArtifactInput, CreateArtifactVersionInput, ArtifactApprovalLinkage } from '@/types/artifact';

describe('Gate G4.2: Versioned Artifact Model', () => {
  const testSlug = `test-prd-${Date.now()}`;
  let artifactId: string;

  it('1.1 Creates a new versioned artifact with v1 and cryptographic SHA-256 content hash', async () => {
    const brain = CompanyBrain.getInstance();
    const content = '# LUMORA PRODUCT REQUIREMENTS DOCUMENT\n\nInitial version of Lumora educational AI.';
    const expectedHash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

    const input: CreateArtifactInput = {
      slug: testSlug,
      title: 'Lumora PRD',
      kind: 'PRD',
      content,
      createdBy: 'maya_lin',
      creatorRole: 'product_manager',
      workflowInstanceId: 'wf-lumora-001',
      stepId: 'step_prd_draft',
      agentRunId: 'run-maya-001',
      inputFingerprint: 'fp-lumora-spec-v1',
      tags: ['lumora', 'education', 'prd'],
      evidenceClaimIds: ['claim-ed-001'],
    };

    const created = await brain.createArtifact(input);
    assert.ok(created.id.startsWith('art-'), 'Artifact ID must start with art-');
    artifactId = created.id;

    assert.strictEqual(created.slug, testSlug);
    assert.strictEqual(created.title, 'Lumora PRD');
    assert.strictEqual(created.kind, 'PRD');
    assert.strictEqual(created.status, 'draft');
    assert.strictEqual(created.currentVersion, 1);
    assert.strictEqual(created.versions.length, 1);

    const v1 = created.versions[0];
    assert.strictEqual(v1.version, 1);
    assert.strictEqual(v1.content, content);
    assert.strictEqual(v1.provenance.createdBy, 'maya_lin');
    assert.strictEqual(v1.provenance.creatorRole, 'product_manager');
    assert.strictEqual(v1.provenance.contentHash, expectedHash);
    assert.strictEqual(v1.provenance.workflowInstanceId, 'wf-lumora-001');
    assert.strictEqual(v1.provenance.inputFingerprint, 'fp-lumora-spec-v1');
  });

  it('1.2 Rejects creating an artifact with a duplicate slug', async () => {
    const brain = CompanyBrain.getInstance();
    const duplicateInput: CreateArtifactInput = {
      slug: testSlug,
      title: 'Duplicate Lumora PRD',
      kind: 'PRD',
      content: 'Different content',
      createdBy: 'founder',
      creatorRole: 'founder',
    };

    await assert.rejects(
      async () => {
        await brain.createArtifact(duplicateInput);
      },
      /already exists/,
      'Must reject duplicate slug'
    );
  });

  it('1.3 Adds a new version (v2) and preserves version history without overwriting v1', async () => {
    const brain = CompanyBrain.getInstance();
    const v2Content = '# LUMORA PRODUCT REQUIREMENTS DOCUMENT (v2)\n\nAdded voice companion and offline mode.';
    const expectedV2Hash = crypto.createHash('sha256').update(v2Content, 'utf-8').digest('hex');

    const v2Input: CreateArtifactVersionInput = {
      content: v2Content,
      changelog: 'Added voice companion specs and offline caching requirements',
      createdBy: 'maya_lin',
      creatorRole: 'product_manager',
      agentRunId: 'run-maya-002',
    };

    const updated = await brain.addArtifactVersion(testSlug, v2Input);
    assert.strictEqual(updated.currentVersion, 2);
    assert.strictEqual(updated.versions.length, 2);

    // v1 is unchanged
    const v1 = updated.versions[0];
    assert.strictEqual(v1.version, 1);
    assert.ok(v1.content.includes('Initial version'));

    // v2 is appended
    const v2 = updated.versions[1];
    assert.strictEqual(v2.version, 2);
    assert.strictEqual(v2.content, v2Content);
    assert.strictEqual(v2.provenance.contentHash, expectedV2Hash);
    assert.strictEqual(v2.provenance.agentRunId, 'run-maya-002');
  });

  it('1.4 Binds an authoritative FounderApprovalRecord to artifact version with cryptographic validation', async () => {
    const brain = CompanyBrain.getInstance();
    const v2 = await brain.getArtifactVersion(testSlug, 2);
    assert.ok(v2, 'v2 must exist');

    const validLinkage: ArtifactApprovalLinkage = {
      approvalId: 'appr-founder-001',
      decision: 'approved',
      decidedBy: 'founder',
      decidedAt: new Date().toISOString(),
      boundPayloadHash: v2.provenance.contentHash,
    };

    const approvedArtifact = await brain.bindArtifactApproval(testSlug, 2, validLinkage);
    assert.strictEqual(approvedArtifact.status, 'approved');
    assert.strictEqual(approvedArtifact.versions[1].approval?.approvalId, 'appr-founder-001');
    assert.strictEqual(approvedArtifact.versions[1].approval?.decision, 'approved');
  });

  it('1.5 Fails closed when binding an approval with mismatched payload hash (tamper prevention)', async () => {
    const brain = CompanyBrain.getInstance();
    const fraudulentLinkage: ArtifactApprovalLinkage = {
      approvalId: 'appr-founder-fraud',
      decision: 'approved',
      boundPayloadHash: '0000000000000000000000000000000000000000000000000000000000000000',
    };

    await assert.rejects(
      async () => {
        await brain.bindArtifactApproval(testSlug, 2, fraudulentLinkage);
      },
      /Payload hash mismatch/,
      'Must reject approval binding if bound payload hash differs from artifact content hash'
    );
  });

  it('1.6 Retrieves artifact and versions by ID or Slug and filters by kind/status', async () => {
    const brain = CompanyBrain.getInstance();
    
    // By ID
    const byId = await brain.getArtifact(artifactId);
    assert.ok(byId, 'Must resolve by ID');
    assert.strictEqual(byId.id, artifactId);

    // By Slug
    const bySlug = await brain.getArtifact(testSlug);
    assert.ok(bySlug, 'Must resolve by Slug');
    assert.strictEqual(bySlug.slug, testSlug);

    // Filter list
    const prds = await brain.listArtifacts({ kind: 'PRD' });
    assert.ok(prds.some((p) => p.id === artifactId), 'Must find artifact in filtered list by kind');

    const approved = await brain.listArtifacts({ status: 'approved' });
    assert.ok(approved.some((a) => a.id === artifactId), 'Must find artifact in filtered list by status');
  });

  it('1.7 Preserves all artifacts and version history across simulated process restart (clean singleton reset)', async () => {
    // Reset in-memory singletons
    CompanyBrain.resetInstance();
    ArtifactStore.resetInstance();

    // Re-instantiate
    const freshBrain = CompanyBrain.getInstance();
    const reloaded = await freshBrain.getArtifact(testSlug);

    assert.ok(reloaded, 'Artifact must persist durably to disk across process restart');
    assert.strictEqual(reloaded.currentVersion, 2);
    assert.strictEqual(reloaded.versions.length, 2);
    assert.strictEqual(reloaded.status, 'approved');
    assert.strictEqual(reloaded.versions[1].approval?.approvalId, 'appr-founder-001');
  });
});
