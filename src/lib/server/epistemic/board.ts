import {
  EpistemicBoardDTO,
  EpistemicBoardClaimDTO,
  EpistemicBoardFactDTO,
  EpistemicBoardMemoryDTO,
  EpistemicBoardStage,
  EpistemicClaim,
  EpistemicLineageDTO,
} from '@/types/epistemic';
import { EpistemicClaimStore } from './claim-store';
import { CompanyMemoryStore } from '../memory/memory-store';

/**
 * PHASE 4.4E — FOUNDER EPISTEMIC BOARD PROJECTION.
 *
 * Deterministic, stateless read model over the EXISTING epistemic stores
 * (EpistemicClaimStore + CompanyMemoryStore). No new persistence, no second
 * evidence store — this is the same read-projection pattern the 4.4C Activity
 * surface uses.
 *
 * Honesty rules (invariants):
 * 1. Lineage is resolved ONLY from real Source/Signal records the claim
 *    actually references. A claim without lineage carries none — provenance
 *    is NEVER fabricated.
 * 2. Seed/demo memories (no fact lineage) are explicitly classified so the
 *    founder surface can distinguish them from founder-promoted memories.
 * 3. Stages derive from authoritative records only: 'pending' (no passed
 *    verification), 'verified' (passed verification, not yet promoted),
 *    'fact' (promoted), 'rejected' (rejected status).
 * 4. Deterministic ordering: claims by createdAt DESC then id; facts by
 *    promotedAt DESC then id; memories by recordedAt DESC then id.
 */

/** Maximum claims projected to the founder board (bounded feed). */
const MAX_BOARD_CLAIMS = 60;
/** Maximum facts projected. */
const MAX_BOARD_FACTS = 40;
/** Maximum memories projected (seed + promoted). */
const MAX_BOARD_MEMORIES = 24;

export async function deriveEpistemicBoard(): Promise<EpistemicBoardDTO> {
  const claimStore = EpistemicClaimStore.getInstance();
  const memoryStore = CompanyMemoryStore.getInstance();

  const [allClaims, activeFacts, memories] = await Promise.all([
    claimStore.listClaims(),
    claimStore.listActiveFacts(),
    memoryStore.getAllMemories(),
  ]);

  // Fetch every claim's verification record once (deterministic stage
  // derivation needs it; claims without a record honestly have none).
  const verifications = await Promise.all(
    allClaims.map((c) => claimStore.getVerification(c.id))
  );
  const verificationByClaim = new Map<string, (typeof verifications)[number]>();
  allClaims.forEach((c, i) => {
    if (verifications[i]) verificationByClaim.set(c.id, verifications[i]!);
  });

  // Fact lineage sets for memory classification.
  const activeFactIds = new Set(activeFacts.map((f) => f.id));

  /* ---------------------------------------------------------------- claims */

  const orderedClaims = [...allClaims].sort((a, b) =>
    a.createdAt !== b.createdAt
      ? b.createdAt.localeCompare(a.createdAt)
      : b.id.localeCompare(a.id)
  );

  const claimDtos: EpistemicBoardClaimDTO[] = [];
  for (const claim of orderedClaims.slice(0, MAX_BOARD_CLAIMS)) {
    const verification = verificationByClaim.get(claim.id);
    const stage = deriveStage(claim, verification?.passed === true);

    // Resolve lineage ONLY from records the claim actually references.
    let lineage: EpistemicBoardClaimDTO['lineage'];
    if (claim.sourceId) {
      const source = await claimStore.getSource(claim.sourceId);
      if (source) {
        let signal: EpistemicLineageDTO['signal'];
        if (claim.signalId) {
          const sig = await claimStore.getSignal(claim.signalId);
          if (sig) {
            signal = {
              id: sig.id,
              signalType: sig.signalType,
              extractedObservation: sig.extractedObservation,
              confidence: sig.confidence,
            };
          }
        }
        lineage = {
          source: {
            id: source.id,
            sourceSystem: source.sourceSystem,
            title: source.title,
            uri: source.uri,
            capturedAt: source.capturedAt,
            provenanceKind: source.provenanceKind,
          },
          ...(signal ? { signal } : {}),
        };
      }
    }

    claimDtos.push({
      id: claim.id,
      statement: claim.statement,
      subject: claim.subject,
      category: claim.category,
      proposedBy: claim.proposedBy,
      confidence: claim.confidence,
      stage,
      createdAt: claim.createdAt,
      reviewedAt: claim.reviewedAt,
      reviewedBy: claim.reviewedBy,
      rejectionReason: claim.rejectionReason,
      agentRunId: claim.agentRunId,
      evidenceReferences: claim.evidenceReferences ?? [],
      ...(verification
        ? {
            verification: {
              passed: verification.passed,
              policyOutcome: verification.policyOutcome,
              reason: verification.reason,
              verifiedAt: verification.verifiedAt,
              verifiedBy: verification.verifiedBy,
            },
          }
        : {}),
      ...(lineage ? { lineage } : {}),
    });
  }

  /* ----------------------------------------------------------------- facts */

  const orderedFacts = [...activeFacts].sort((a, b) =>
    a.promotedAt !== b.promotedAt
      ? b.promotedAt.localeCompare(a.promotedAt)
      : b.id.localeCompare(a.id)
  );

  const factDtos: EpistemicBoardFactDTO[] = orderedFacts
    .slice(0, MAX_BOARD_FACTS)
    .map((f) => ({
      id: f.id,
      claimId: f.claimId,
      statement: f.statement,
      subject: f.subject,
      category: f.category,
      promotedAt: f.promotedAt,
      promotedBy: f.promotedBy,
      promotedToMemory: false, // set after memory classification below
    }));

  /* -------------------------------------------------------------- memories */

  const memoryDtos: EpistemicBoardMemoryDTO[] = [];
  const promotedFactIds = new Set<string>();

  const orderedMemories = [...memories].sort((a, b) =>
    (b.recordedAt || b.timestamp || '') !== (a.recordedAt || a.timestamp || '')
      ? (b.recordedAt || b.timestamp || '').localeCompare(a.recordedAt || a.timestamp || '')
      : b.id.localeCompare(a.id)
  );

  for (const mem of orderedMemories.slice(0, MAX_BOARD_MEMORIES)) {
    // A memory carries fact lineage when its evidence references resolve to a
    // known canonical fact (the promoteFactToMemory construction) or its
    // decisionId points at a fact decision. Everything else is an
    // unattributed seed/demo record — classified honestly, never deleted.
    const referencedFactId = (mem.evidenceReferences || []).find(
      (ref) => activeFactIds.has(ref)
    );
    const decisionFactId = mem.decisionId?.startsWith('fact-decision-')
      ? mem.decisionId.slice('fact-decision-'.length)
      : undefined;
    const factId = referencedFactId || (decisionFactId && activeFactIds.has(decisionFactId) ? decisionFactId : undefined);

    if (factId) {
      promotedFactIds.add(factId);
      memoryDtos.push({
        id: mem.id,
        approvedAction: mem.approvedAction,
        executionOutcome: mem.executionOutcome,
        recordedAt: mem.recordedAt || mem.timestamp,
        epistemicConfidence: mem.epistemicConfidence,
        origin: 'fact_lineage',
        factId,
      });
    } else {
      memoryDtos.push({
        id: mem.id,
        approvedAction: mem.approvedAction,
        executionOutcome: mem.executionOutcome,
        recordedAt: mem.recordedAt || mem.timestamp,
        epistemicConfidence: mem.epistemicConfidence,
        origin: 'seed_or_unattributed',
      });
    }
  }

  for (const fact of factDtos) {
    fact.promotedToMemory = promotedFactIds.has(fact.id);
  }

  /* ---------------------------------------------------------------- counts */

  // Count over the FULL claim list (not just the bounded slice) so the
  // header counts stay honest when the feed is truncated.
  const stageCounts = { pending: 0, verified: 0, rejected: 0, fact: 0 };
  for (const claim of allClaims) {
    const stage = deriveStage(claim, verificationByClaim.get(claim.id)?.passed === true);
    stageCounts[stage] += 1;
  }

  return {
    asOfTime: new Date().toISOString(),
    claims: claimDtos,
    facts: factDtos,
    memories: memoryDtos,
    counts: {
      pending: stageCounts.pending,
      verified: stageCounts.verified,
      rejected: stageCounts.rejected,
      promotedToFacts: stageCounts.fact,
      activeFacts: activeFacts.length,
      memoriesWithFactLineage: memoryDtos.filter((m) => m.origin === 'fact_lineage').length,
      seedMemories: memories.length - memoryDtos.filter((m) => m.origin === 'fact_lineage').length,
    },
  };
}

function deriveStage(claim: EpistemicClaim, hasPassedVerification: boolean): EpistemicBoardStage {
  if (claim.verificationStatus === 'promoted_to_fact') return 'fact';
  if (claim.verificationStatus === 'rejected') return 'rejected';
  if (claim.verificationStatus === 'superseded') return 'rejected';
  if (hasPassedVerification) return 'verified';
  return 'pending';
}
