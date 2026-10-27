import type {
  SophiaRoute,
  RouteMemoryScope,
  RouteSideEffectClass,
} from '../../src/types/decision';
import type { CandidateIntentProposal } from '../../src/lib/server/sophia/types';

export type LabelledItemCategory =
  | 'happy_path'
  | 'boundary'
  | 'adversarial'
  | 'ambiguous'
  | 'malformed_output';

export interface LabelledRouteItem {
  id: string;
  utterance: string;
  expectedRoute: SophiaRoute;
  expectedKind: CandidateIntentProposal['kind'];
  category: LabelledItemCategory;
  rationale: string;
  contextDescription?: string;
  mockModelOutput?: {
    route?: string;
    kind?: string;
    confidence?: unknown;
    reply?: string;
    decision?: string;
    reason?: string;
    rawText?: string;
  };
}

export interface RouteAccuracyMetric {
  route: SophiaRoute;
  total: number;
  correct: number;
  accuracy: number; // 0.0 to 1.0 (or percentage)
  misclassifications: Array<{
    id: string;
    utterance: string;
    actualRoute: SophiaRoute;
    confidence: number;
    reason: string;
  }>;
}

export interface RouterEvalReport {
  timestamp: string;
  gitCommit?: string;
  totalEvaluated: number;
  overallAccuracy: number;
  perRouteAccuracy: Record<SophiaRoute, RouteAccuracyMetric>;
  confusionMatrix: Record<SophiaRoute, Record<SophiaRoute, number>>;
  failClosedMetrics: {
    totalMalformedTested: number;
    failedClosedToClarify: number;
    failedClosedToRefuse: number;
    passed: boolean;
  };
}
