/**
 * Phase 4.4E restart child — cold-starts the REAL dual-mode epistemic store
 * from the durable .data collections (fresh process, fresh module registry)
 * and prints the resolved Source→Signal→Claim lineage for a given claim id.
 *
 * Mirrors the Phase 4.4C activity-child.ts pattern: the parent suite seeds a
 * temp cwd with exactly the durable records a restart would find, then this
 * child proves they rehydrate with lineage intact.
 */
import { EpistemicClaimStore } from "../../src/lib/server/epistemic/claim-store";

const claimId = process.argv[2];

async function main(): Promise<void> {
  // Fresh store instance → constructor loads from DurableFileStore (.data).
  const store = new EpistemicClaimStore();

  const claim = await store.getClaim(claimId!);
  if (!claim) {
    console.log(JSON.stringify({ found: false }));
    return;
  }

  const source = claim.sourceId ? await store.getSource(claim.sourceId) : null;
  const signal = claim.signalId ? await store.getSignal(claim.signalId) : null;

  console.log(
    JSON.stringify({
      found: true,
      claim: {
        id: claim.id,
        statement: claim.statement,
        sourceId: claim.sourceId,
        signalId: claim.signalId,
        verificationStatus: claim.verificationStatus,
        evidenceReferences: claim.evidenceReferences,
      },
      source: source
        ? {
            id: source.id,
            sourceSystem: source.sourceSystem,
            contentHash: source.contentHash,
            provenanceKind: source.provenanceKind,
          }
        : null,
      signal: signal
        ? {
            id: signal.id,
            signalType: signal.signalType,
            extractedObservation: signal.extractedObservation,
          }
        : null,
    })
  );
}

main().catch((err) => {
  console.error("epistemic-child failed:", err);
  process.exit(1);
});
