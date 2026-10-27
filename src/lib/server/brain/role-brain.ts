/**
 * ============================================================================
 * ROLE BRAIN ENGINE (G11.5 / M3)
 * ============================================================================
 * Specialized cognitive memory projection for an AI Employee (e.g. Dr. Aris
 * Thorne/researcher, Maya Lin/pm, Julian Cruz/finance).
 *
 * GOVERNANCE & ARCHITECTURAL INVARIANTS:
 * 1. Strict Isolation:
 *    One employee cannot read another employee's working memory or experience.
 * 2. Personal Mind Exclusion:
 *    Employees have ZERO access to the Founder's Personal Mind (`SophiaMemoryStore`).
 * 3. Deterministic Company Brain Projection:
 *    Company knowledge, state, precedents, and facts are deterministically
 *    projected from `CompanyBrain`. Rebuilding yields identical cryptographic
 *    hashes for identical company state.
 * 4. Never Company Truth:
 *    Working and experience memories are subjective employee thoughts. They
 *    remain strictly within the Role Brain and never become company truth
 *    without explicit promotion through the epistemic pipeline or founder approval.
 */

import { createHash } from 'node:crypto';
import { AgentRole } from '@/types/os';
import {
  IRoleBrain,
  RoleBrainMemoryRecord,
  RoleBrainProjectedContext,
} from '@/types/role-brain';
import { RoleBrainStore } from './role-brain-store';
import { CompanyBrain } from './company-brain';

export class RoleBrain implements IRoleBrain {
  public readonly role: AgentRole;
  private store: RoleBrainStore;
  private cachedProjection: RoleBrainProjectedContext | null = null;

  constructor(role: AgentRole) {
    this.role = role;
    this.store = RoleBrainStore.getInstance();
  }

  /**
   * Working Memory: scratchpad for active task / in-flight run.
   */
  public async getWorkingMemory(taskContext?: string): Promise<RoleBrainMemoryRecord[]> {
    return this.store.listMemories(this.role, this.role, {
      scope: 'working',
      taskContext,
    });
  }

  public async saveWorkingMemory(params: {
    content: string;
    taskContext?: string;
    metadata?: Record<string, any>;
  }): Promise<RoleBrainMemoryRecord> {
    return this.store.saveMemory({
      agentId: this.role,
      memoryScope: 'working',
      content: params.content,
      taskContext: params.taskContext,
      provenance: `role_working:${this.role}`,
      metadata: params.metadata,
    });
  }

  public async clearWorkingMemory(taskContext?: string): Promise<number> {
    return this.store.clearWorkingMemory(this.role, this.role, taskContext);
  }

  /**
   * Experience Memory: long-term learned notes, domain takeaways.
   */
  public async getExperienceMemory(query?: string): Promise<RoleBrainMemoryRecord[]> {
    return this.store.listMemories(this.role, this.role, {
      scope: 'experience',
      query,
    });
  }

  public async recordExperience(params: {
    content: string;
    provenance?: string;
    metadata?: Record<string, any>;
  }): Promise<RoleBrainMemoryRecord> {
    return this.store.saveMemory({
      agentId: this.role,
      memoryScope: 'experience',
      content: params.content,
      provenance: params.provenance || `role_experience:${this.role}`,
      metadata: params.metadata,
    });
  }

  /**
   * Deterministic Company Brain Projection.
   * Derives a cryptographic SHA-256 hash over canonical Company Brain state.
   */
  public async getProjectedContext(): Promise<RoleBrainProjectedContext> {
    if (this.cachedProjection) {
      return this.cachedProjection;
    }
    return this.rebuildProjection();
  }

  public async rebuildProjection(): Promise<RoleBrainProjectedContext> {
    const companyBrain = CompanyBrain.getInstance();

    const [canonicalContext, knowledge, facts, precedents, products] = await Promise.all([
      companyBrain.getCanonicalContext(),
      companyBrain.getKnowledge(),
      companyBrain.getActiveFacts(),
      companyBrain.getMemories(),
      companyBrain.getProducts(),
    ]);

    // Sort items for deterministic hashing
    const sortedFacts = [...facts].sort((a, b) => a.id.localeCompare(b.id));
    const sortedKnowledge = [...knowledge].sort((a, b) => a.id.localeCompare(b.id));
    const sortedPrecedents = [...precedents].sort((a, b) => a.id.localeCompare(b.id));
    const sortedProducts = [...products].sort((a, b) => a.id.localeCompare(b.id));

    // Construct deterministic projection payload
    const projectionPayload = {
      role: this.role,
      constitution: canonicalContext.constitution,
      initiatives: (canonicalContext.initiatives || []).map((i) => ({ id: i.id, title: i.title, status: i.status })),
      products: sortedProducts.map((p) => ({ id: p.id, title: p.title, status: p.status })),
      facts: sortedFacts.map((f) => ({ id: f.id, statement: f.statement, validity: f.validityState })),
      knowledge: sortedKnowledge.map((k) => ({ id: k.id, category: k.category, title: k.title })),
      precedents: sortedPrecedents.map((p) => ({ id: p.id, action: p.approvedAction, outcome: p.executionOutcome })),
    };

    const projectionHash = createHash('sha256')
      .update(JSON.stringify(projectionPayload))
      .digest('hex');

    const projected: RoleBrainProjectedContext = {
      role: this.role,
      companyContext: canonicalContext,
      relevantKnowledge: sortedKnowledge,
      activeFacts: sortedFacts,
      companyPrecedents: sortedPrecedents,
      projectionHash,
      projectedAt: new Date().toISOString(),
    };

    this.cachedProjection = projected;
    return projected;
  }
}

/**
 * Registry providing singleton RoleBrain instances for valid roles.
 */
export class RoleBrainRegistry {
  private static brains: Map<AgentRole, RoleBrain> = new Map();

  public static getRoleBrain(role: AgentRole): RoleBrain {
    const cleanRole = (role || '').trim().toLowerCase() as AgentRole;
    if (!RoleBrainRegistry.brains.has(cleanRole)) {
      RoleBrainRegistry.brains.set(cleanRole, new RoleBrain(cleanRole));
    }
    return RoleBrainRegistry.brains.get(cleanRole)!;
  }
}
