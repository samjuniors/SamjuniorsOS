/**
 * Sophia Persona Evaluation Types (Gate G6.7).
 */

export type PersonaEvaluationDimension =
  | 'conciseness_and_naturalness'
  | 'voice_chat_consistency'
  | 'anti_fabrication_refusal'
  | 'grounded_recall'
  | 'governance_boundary';

export interface PersonaTestCase {
  id: string;
  category: PersonaEvaluationDimension;
  prompt: string;
  expectedOutcome: string;
  requiredSubstrings?: string[];
  forbiddenSubstrings?: string[];
  maxWords?: number;
  plantedMemory?: {
    type: 'personal' | 'company';
    content: string;
  };
}

export interface PersonaEvaluationTestRun {
  id: string;
  category: PersonaEvaluationDimension;
  prompt: string;
  reply: string;
  passed: boolean;
  reason?: string;
  wordCount: number;
}

export interface PersonaEvaluationResult {
  timestamp: string;
  version: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number; // percentage (e.g. 100)
  fabricationCount: number; // MUST BE ZERO
  concisenessRate: number;
  consistencyRate: number;
  refusalAccuracyRate: number;
  breakdown: Record<PersonaEvaluationDimension, { total: number; passed: number }>;
  runs: PersonaEvaluationTestRun[];
}
