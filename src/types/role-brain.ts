/**
 * ============================================================================
 * ROLE BRAIN TYPE DEFINITIONS (G11.5 / M3)
 * ============================================================================
 * Defines the contract for AI Employee Role Brains: per-employee memory
 * projected from the authoritative Company Brain plus the employee's own
 * working and experience memory.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Strict Isolation:
 *    One employee cannot read or query another employee's working/experience memory.
 * 2. Personal Mind Exclusion:
 *    Employees have ZERO access to the Founder's Personal Mind (`SophiaMemoryStore`).
 * 3. Deterministic Company Projection:
 *    The company portion of a Role Brain is a deterministic projection of
 *    `CompanyBrain` that can be rebuilt deterministically from canonical state.
 * 4. Never Company Truth:
 *    An employee's working or experience memory is subjective scratchpad/notes.
 *    It never enters `CompanyKnowledge`, `CanonicalFact`, or `CompanyMemory`
 *    without explicit epistemic promotion or founder approval.
 */

import type { AgentRole, CompanyMemory } from './os';
import type { CompanyKnowledgeItem } from './context';
import type { CanonicalFact } from './epistemic';
import type { FullCompanyContext } from './brain';

export type RoleBrainMemoryScope = 'working' | 'experience';

export interface RoleBrainMemoryRecord {
  id: string;
  agentId: AgentRole;
  memoryScope: RoleBrainMemoryScope;
  content: string;
  taskContext?: string; // taskId or workflowInstanceId
  provenance: string;   // e.g. "task_run:<runId>" | "employee_note"
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface RoleBrainProjectedContext {
  role: AgentRole;
  companyContext: FullCompanyContext;
  relevantKnowledge: CompanyKnowledgeItem[];
  activeFacts: CanonicalFact[];
  companyPrecedents: CompanyMemory[];
  projectionHash: string; // deterministic SHA-256 of canonical projection
  projectedAt: string;
}

export interface IRoleBrain {
  readonly role: AgentRole;

  // Working Memory (scratchpad for active task / in-flight run)
  getWorkingMemory(taskContext?: string): Promise<RoleBrainMemoryRecord[]>;
  saveWorkingMemory(params: {
    content: string;
    taskContext?: string;
    metadata?: Record<string, any>;
  }): Promise<RoleBrainMemoryRecord>;
  clearWorkingMemory(taskContext?: string): Promise<number>;

  // Experience Memory (long-term learned notes, domain takeaways)
  getExperienceMemory(query?: string): Promise<RoleBrainMemoryRecord[]>;
  recordExperience(params: {
    content: string;
    provenance?: string;
    metadata?: Record<string, any>;
  }): Promise<RoleBrainMemoryRecord>;

  // Deterministic Company Brain Projection
  getProjectedContext(): Promise<RoleBrainProjectedContext>;
  rebuildProjection(): Promise<RoleBrainProjectedContext>;
}
