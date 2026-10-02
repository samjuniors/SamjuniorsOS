/**
 * PHASE 4.4E — EPISTEMIC CLOSING LOOP + EVIDENCE LINEAGE TESTS.
 *
 * Exercises the REAL EpistemicPipeline (ingestSource → extractSignal →
 * submitClaim → verifyClaim → promoteClaimToFact → promoteFactToMemory →
 * rejectClaim), the REAL dual-mode EpistemicClaimStore (in-memory +
 * DurableFileStore persistence), the REAL board projection
 * (src/lib/server/epistemic/board.ts), the REAL CompanyMemoryStore, the REAL
 * OperationalLearningLoop and the REAL SideEffectAuthorizationGate. No
 * doubles: every epistemic transition runs through the production pipeline.
 *
 * Invariants pinned (founder directive 4.4E):
 *   [B1] pending claim appears in the founder board projection
 *   [L1] evidence provenance renders correctly (Source→Signal→Claim lineage)
 *   [V1] founder verifies a claim (passed verification, stage 'verified')
 *   [F1] unverified claim cannot become Fact (fail-closed)
 *   [F2] verified claim can become Fact (founder promoter; stage 'fact')
 *   [M1] Fact→Memory requires a founder principal (string/missing/agent all fail)
 *   [M2] founder Fact→Memory works and carries fact lineage evidenceReferences
 *   [C1] promoted Memory is retrievable by future context assembly
 *   [C2] memory stays labeled as historical precedent, NOT new evidence
 *   [G1] pending claims/facts/memories NEVER become execution authority
 *        (real gate: financial action still approval_required with a full
 *        epistemic board present; identical decision with empty stores)
 *   [G2] the authorization layer never imports the epistemic/memory layer
 *        (source-level isolation scan — self-improving ≠ self-authorizing)
 *   [R1] Source→Signal→Claim lineage survives a REAL process restart
 *        (fresh bun child cold-starts the durable store)
 *   [N1] no fabricated provenance (sourceless claims carry no lineage; a
 *        dangling sourceId honestly resolves to nothing)
 *   [U1] unauthorized epistemic operations fail closed (non-founder
 *        principals rejected at every promotion/rejection entry point)
 */
import "./env-setup";
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { EpistemicPipeline } from "../../src/lib/server/epistemic/pipeline";
import { EpistemicClaimStore } from "../../src/lib/server/epistemic/claim-store";
import { deriveEpistemicBoard } from "../../src/lib/server/epistemic/board";
import { CompanyMemoryStore } from "../../src/lib/server/memory/memory-store";
import { OperationalLearningLoop } from "../../src/lib/server/memory/learning-loop";
import { SideEffectAuthorizationGate } from "../../src/lib/server/authorization/gate";
import { v4 as uuidv4 } from "uuid";

/* ----------------------------------------------------------- artifact hygiene */

const pipeline = EpistemicPipeline.getInstance();
const claimStore = EpistemicClaimStore.getInstance();
const memoryStore = CompanyMemoryStore.getInstance();
const gate = SideEffectAuthorizationGate.getInstance();

// Snapshot pre-existing store contents so the suite can surgically purge
// exactly what IT added — never the live dev artifacts.
const initialSources = new Map(claimStore.sources);
const initialSignals = new Map(claimStore.signals);
const initialClaims = new Map(claimStore.claims);
const initialFacts = new Map(claimStore.facts);
const initialVerifications = new Map(claimStore.verifications);

const addedSources = new Set<string>();
const addedSignals = new Set<string>();
const addedClaims = new Set<string>();
const addedFacts = new Set<string>();
const addedMemories = new Set<string>();

async function snapshotInitialMemories() {
  return memoryStore.getAllMemories();
}
let initialMemories: Awaited<ReturnType<typeof snapshotInitialMemories>> = [];

function pruneDurableCollection(collection: string, ids: Set<string>): void {
  const file = join(process.cwd(), ".data", `${collection}.json`);
  try {
    if (!existsSync(file) || ids.size === 0) return;
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    let changed = false;
    for (const id of ids) {
      if (raw[id] !== undefined) {
        delete raw[id];
        changed = true;
      }
    }
    if (changed) writeFileSync(file, JSON.stringify(raw), "utf-8");
  } catch {
    /* best-effort hygiene */
  }
}

/* ------------------------------------------------------------- principals */

const FOUNDER = {
  userId: "founder-test-44e",
  role: "FOUNDER" as const,
  isVerified: true as const,
  email: "founder@test.samjuniors.com",
  name: "Founder Test",
};

const AGENT_PRINCIPAL = {
  userId: "researcher-agent",
  role: "AGENT" as const,
  isVerified: true as const,
};

/* --------------------------------------------------------------- helpers */

/** Real ingestion through the production pipeline (Stage 1 + 2 + 3). */
async function submitLineageClaim(opts: {
  statement: string;
  subject: string;
  rawContent?: string;
}): Promise<{ claimId: string; sourceId: string; signalId: string }> {
  const source = await pipeline.ingestSource({
    sourceSystem: "web_research",
    uri: "https://example.com/44e-evidence",
    title: `Web research: ${opts.subject}`,
    rawContent:
      opts.rawContent ||
      JSON.stringify({ query: opts.subject, sources: [{ title: "Example", url: "https://example.com/44e-evidence" }] }),
    capturedBy: "researcher",
    provenanceKind: "live_operational",
    metadata: { toolId: "web_research", capturedVia: "gated_orchestration_tool_execution" },
  });
  addedSources.add(source.id);

  const signal = await pipeline.extractSignal({
    sourceId: source.id,
    signalType: "system_event",
    extractedObservation: opts.statement,
    data: { statement: opts.statement, supportingSourceUrls: ["https://example.com/44e-evidence"] },
    confidence: "high_confidence",
  });
  addedSignals.add(signal.id);

  const claim = await pipeline.submitClaim({
    sourceId: source.id,
    signalId: signal.id,
    statement: opts.statement,
    subject: opts.subject,
    category: "market_research",
    proposedBy: "researcher",
    confidence: "high_confidence",
    evidenceReferences: ["https://example.com/44e-evidence"],
    verificationNotes: "Source-backed observation persisted from gated web_research execution.",
  });
  addedClaims.add(claim.id);

  return { claimId: claim.id, sourceId: source.id, signalId: signal.id };
}

/* ------------------------------------------------------------------- suite */

beforeAll(async () => {
  initialMemories = await snapshotInitialMemories();
});

afterAll(async () => {
  // Restore the singleton in-memory state exactly as we found it.
  claimStore.sources = new Map(initialSources);
  claimStore.signals = new Map(initialSignals);
  claimStore.claims = new Map(initialClaims);
  claimStore.facts = new Map(initialFacts);
  claimStore.verifications = new Map(initialVerifications);
  await memoryStore.setMemories(initialMemories);
  // Purge exactly the durable records this suite added.
  pruneDurableCollection("epistemic_sources", addedSources);
  pruneDurableCollection("epistemic_signals", addedSignals);
  pruneDurableCollection("epistemic_claims", addedClaims);
  pruneDurableCollection("epistemic_verifications", addedClaims);
  pruneDurableCollection("canonical_facts", addedFacts);
  pruneDurableCollection("company_memories", addedMemories);
});

describe("Phase 4.4E — epistemic closing loop (real pipeline + real stores)", () => {
  test("[B1]+[L1] lineage-backed pending claim appears in the founder board with correct provenance", async () => {
    const { claimId, sourceId, signalId } = await submitLineageClaim({
      statement: "Competitor X announced a new serverless container pricing tier with zero idle cost.",
      subject: "market research: competitor pricing 44e",
    });

    const board = await deriveEpistemicBoard();
    const projected = board.claims.find((c) => c.id === claimId);
    expect(projected).toBeDefined();
    expect(projected!.stage).toBe("pending"); // [B1] pending appears in founder surface
    expect(projected!.proposedBy).toBe("researcher");
    expect(projected!.evidenceReferences.length).toBeGreaterThan(0);

    // [L1] evidence provenance renders correctly: Source → Signal → Claim.
    expect(projected!.lineage).toBeDefined();
    expect(projected!.lineage!.source.id).toBe(sourceId);
    expect(projected!.lineage!.source.sourceSystem).toBe("web_research");
    expect(projected!.lineage!.source.uri).toBe("https://example.com/44e-evidence");
    expect(projected!.lineage!.signal).toBeDefined();
    expect(projected!.lineage!.signal!.id).toBe(signalId);
    expect(projected!.lineage!.signal!.signalType).toBe("system_event");

    // The board counts are honest.
    expect(board.counts.pending).toBeGreaterThanOrEqual(1);
  });

  test("[N1] no fabricated provenance — sourceless claims honestly carry no lineage", async () => {
    // A model-takeaway claim with no source (the executor's keyTakeaways path).
    const claim = await pipeline.submitClaim({
      statement: "Model-inferred takeaway with no recorded external evidence for 44e.",
      subject: "model takeaway 44e",
      category: "operational",
      proposedBy: "coo",
      confidence: "unverified",
    });
    addedClaims.add(claim.id);

    // A claim whose sourceId points at a record that does not exist.
    const dangling = await pipeline.submitClaim({
      sourceId: "src-does-not-exist-44e",
      statement: "Claim referencing a missing source record must not fabricate lineage.",
      subject: "dangling source 44e",
      category: "operational",
      proposedBy: "pm",
      confidence: "unverified",
    });
    addedClaims.add(dangling.id);

    const board = await deriveEpistemicBoard();
    const plain = board.claims.find((c) => c.id === claim.id);
    const broken = board.claims.find((c) => c.id === dangling.id);
    expect(plain).toBeDefined();
    expect(broken).toBeDefined();
    expect(plain!.lineage).toBeUndefined(); // honest absence — never fabricated
    expect(broken!.lineage).toBeUndefined(); // dangling reference resolves to nothing
  });

  test("[V1] founder verifies a pending claim → passed verification, stage 'verified'", async () => {
    const { claimId } = await submitLineageClaim({
      statement: "Verified market observation: three competitors now publish uptime SLAs above 99.9 percent.",
      subject: "market research: uptime sla 44e",
    });

    const verification = await pipeline.verifyClaim(claimId, {
      role: "founder",
      userId: FOUNDER.userId,
    });
    expect(verification.passed).toBe(true);
    expect(verification.policyOutcome).toBe("approved_for_promotion");

    const stored = await claimStore.getClaim(claimId);
    expect(stored!.verificationStatus).toBe("under_review");
    expect(stored!.reviewedBy).toBe(FOUNDER.userId);

    const board = await deriveEpistemicBoard();
    const projected = board.claims.find((c) => c.id === claimId);
    expect(projected!.stage).toBe("verified");
    expect(projected!.verification!.passed).toBe(true);
  });

  test("[F1] unverified claim cannot become Fact (fail-closed)", async () => {
    const claim = await pipeline.submitClaim({
      statement: "Unverified claim that must never reach canonical fact state.",
      subject: "unverified 44e",
      category: "operational",
      proposedBy: "researcher",
      confidence: "unverified",
    });
    addedClaims.add(claim.id);

    let threw = false;
    try {
      await pipeline.promoteClaimToFact(claim.id, FOUNDER);
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain("verification has not passed");
    }
    expect(threw).toBe(true);

    const board = await deriveEpistemicBoard();
    expect(board.claims.find((c) => c.id === claim.id)!.stage).toBe("pending");
    expect(await claimStore.listActiveFacts({ subject: "unverified 44e" })).toHaveLength(0);
  });

  test("[F2]+[M2]+[C1]+[C2] verified claim → Fact → Memory → retrievable precedent (the closing loop)", async () => {
    const { claimId } = await submitLineageClaim({
      statement: "Cloud Run serverless containers incur zero idle compute cost for the staging environment.",
      subject: "container architecture cost 44e",
    });

    // Founder verification first.
    await pipeline.verifyClaim(claimId, { role: "founder", userId: FOUNDER.userId });

    // [F2] verified claim can become a Fact through the founder principal.
    const fact = await pipeline.promoteClaimToFact(claimId, FOUNDER);
    addedFacts.add(fact.id);
    expect(fact.validityState).toBe("active");
    expect(fact.promotedBy).toBe(FOUNDER.userId);
    expect(fact.claimId).toBe(claimId);

    const promotedClaim = await claimStore.getClaim(claimId);
    expect(promotedClaim!.verificationStatus).toBe("promoted_to_fact");

    // Board reflects the fact stage + lineage carried onto the fact record.
    const boardMid = await deriveEpistemicBoard();
    expect(boardMid.claims.find((c) => c.id === claimId)!.stage).toBe("fact");
    const factDto = boardMid.facts.find((f) => f.id === fact.id);
    expect(factDto).toBeDefined();
    expect(factDto!.promotedToMemory).toBe(false);

    // [M2] founder Fact→Memory works and carries fact lineage.
    const memory = await pipeline.promoteFactToMemory({
      factId: fact.id,
      approvedAction: fact.statement,
      executionOutcome: "Staging migrated to serverless; idle cost verified at zero.",
      promoter: FOUNDER,
    });
    addedMemories.add(memory.id);
    expect(memory.evidenceReferences).toContain(fact.id);
    expect(memory.epistemicConfidence).toBe("verified_fact");

    // The board now classifies the memory as fact-lineage (not seed).
    const board = await deriveEpistemicBoard();
    const memoryDto = board.memories.find((m) => m.id === memory.id);
    expect(memoryDto).toBeDefined();
    expect(memoryDto!.origin).toBe("fact_lineage");
    expect(memoryDto!.factId).toBe(fact.id);
    expect(board.facts.find((f) => f.id === fact.id)!.promotedToMemory).toBe(true);
    expect(board.counts.memoriesWithFactLineage).toBeGreaterThanOrEqual(1);
    // Seed memories remain honestly classified.
    expect(board.counts.seedMemories).toBeGreaterThanOrEqual(5);

    // [C1] the promoted memory is retrievable by future context assembly
    // through the REAL CompanyMemoryStore query path.
    const retrieved = await memoryStore.queryMemories({
      queryText: "serverless containers staging idle cost cloud run",
      limit: 5,
    });
    const mine = retrieved.find((r) => r.memoryId === memory.id);
    expect(mine).toBeDefined();

    // [C2] memory stays labeled as historical precedent — NOT new evidence.
    expect(mine!.provenance).toBeDefined();
    expect(mine!.provenance!.epistemicType).toBe("historical_memory");
    expect(mine!.provenance!.notes).toContain("Precedent only");

    const formatted = OperationalLearningLoop.formatForPromptInjection(retrieved);
    expect(formatted).toContain("NOT NEW EVIDENCE");
    expect(formatted).toContain(memory.approvedAction.slice(0, 30));
  });

  test("[M1] Fact→Memory only through a founder-authorized path (string/missing/agent principals fail)", async () => {
    const { claimId } = await submitLineageClaim({
      statement: "Founder-authorized memory promotion path verification claim for 44e.",
      subject: "memory promotion 44e",
    });
    await pipeline.verifyClaim(claimId, { role: "founder", userId: FOUNDER.userId });
    const fact = await pipeline.promoteClaimToFact(claimId, FOUNDER);
    addedFacts.add(fact.id);

    // String promoter — prohibited unconditionally.
    await expect(
      pipeline.promoteFactToMemory({
        factId: fact.id,
        approvedAction: "x",
        executionOutcome: "y",
        promoter: "founder-test-44e" as any,
      })
    ).rejects.toThrow("String-based promoter identities are strictly prohibited");

    // Missing promoter — fails closed (a principal is REQUIRED).
    await expect(
      pipeline.promoteFactToMemory({
        factId: fact.id,
        approvedAction: "x",
        executionOutcome: "y",
        promoter: undefined as any,
      })
    ).rejects.toThrow("Only an authenticated and verified Founder principal");

    // Agent principal — never sufficient, even when "verified".
    await expect(
      pipeline.promoteFactToMemory({
        factId: fact.id,
        approvedAction: "x",
        executionOutcome: "y",
        promoter: AGENT_PRINCIPAL,
      })
    ).rejects.toThrow("Only an authenticated and verified Founder principal");

    // Nothing was recorded by the failed attempts.
    const memories = await memoryStore.getAllMemories();
    expect(memories.find((m) => m.decisionId === `fact-decision-${fact.id}`)).toBeUndefined();
  });

  test("[U1] unauthorized claim verification-authority paths fail closed", async () => {
    const claim = await pipeline.submitClaim({
      statement: "Claim used to prove non-founder principals cannot reject or promote.",
      subject: "unauthorized 44e",
      category: "governance",
      proposedBy: "researcher",
      confidence: "unverified",
    });
    addedClaims.add(claim.id);

    // String rejector — prohibited.
    await expect(pipeline.rejectClaim(claim.id, "founder" as any)).rejects.toThrow(
      "String-based rejector identities are strictly prohibited"
    );

    // Agent principal cannot reject.
    await expect(pipeline.rejectClaim(claim.id, AGENT_PRINCIPAL)).rejects.toThrow(
      "Only an authenticated and verified Founder principal"
    );

    // String promoter for fact promotion — prohibited.
    await expect(pipeline.promoteClaimToFact(claim.id, "founder" as any)).rejects.toThrow(
      "String-based promoter identities are strictly prohibited"
    );

    // Agent principal cannot promote.
    await expect(pipeline.promoteClaimToFact(claim.id, AGENT_PRINCIPAL)).rejects.toThrow(
      "Only an authenticated and verified Founder principal"
    );

    // The claim is untouched by all failed attempts.
    const untouched = await claimStore.getClaim(claim.id);
    expect(untouched!.verificationStatus).toBe("pending");

    // Founder CAN reject (the existing model's 'rejected' lifecycle state).
    const rejected = await pipeline.rejectClaim(claim.id, FOUNDER, "Founder test rejection");
    expect(rejected.verificationStatus).toBe("rejected");
    expect(rejected.reviewedBy).toBe(FOUNDER.userId);
    const verification = await claimStore.getVerification(claim.id);
    expect(verification!.passed).toBe(false);
    expect(verification!.policyOutcome).toBe("rejected_by_founder");

    // A rejected claim can no longer be promoted (fail-closed).
    await expect(pipeline.promoteClaimToFact(claim.id, FOUNDER)).rejects.toThrow();
  });

  test("[G1] pending claims / facts / memories NEVER become execution authority (real gate)", async () => {
    // Populate the epistemic stores with a full board: pending claim,
    // verified claim, an active fact and a promoted memory.
    const pending = await pipeline.submitClaim({
      statement: "Pending claim that must not authorize any side effect.",
      subject: "authority isolation 44e",
      category: "operational",
      proposedBy: "coo",
      confidence: "high_confidence",
    });
    addedClaims.add(pending.id);

    const { claimId: verifiedClaimId } = await submitLineageClaim({
      statement: "Verified fact for authority isolation testing in 44e.",
      subject: "authority isolation fact 44e",
    });
    await pipeline.verifyClaim(verifiedClaimId, { role: "founder", userId: FOUNDER.userId });
    const fact = await pipeline.promoteClaimToFact(verifiedClaimId, FOUNDER);
    addedFacts.add(fact.id);
    const memory = await pipeline.promoteFactToMemory({
      factId: fact.id,
      approvedAction: fact.statement,
      executionOutcome: "Isolation test outcome.",
      promoter: FOUNDER,
    });
    addedMemories.add(memory.id);

    // A financial side-effect request through the REAL gate with the FULL
    // epistemic state present: still approval_required — claims, facts and
    // memories grant no execution authority.
    const decisionWithFullBoard = await gate.evaluateAuthorization({
      employeeRole: "finance",
      actionName: "finance_transfer",
      classification: "financial_action",
      target: { targetSystem: "stripe", summary: "Test transfer for authority isolation" },
      payload: { amount: 100 },
    } as any);
    expect(decisionWithFullBoard.effect).toBe("approval_required");

    // Identical request with the epistemic stores emptied: byte-identical
    // decision semantics (the gate never consults epistemic state).
    const savedSources = new Map(claimStore.sources);
    const savedSignals = new Map(claimStore.signals);
    const savedClaims = new Map(claimStore.claims);
    const savedFacts = new Map(claimStore.facts);
    const savedVerifications = new Map(claimStore.verifications);
    const savedMemories = await memoryStore.getAllMemories();
    claimStore.sources = new Map();
    claimStore.signals = new Map();
    claimStore.claims = new Map();
    claimStore.facts = new Map();
    claimStore.verifications = new Map();
    await memoryStore.setMemories([]);
    try {
      const decisionWithEmptyBoard = await gate.evaluateAuthorization({
        employeeRole: "finance",
        actionName: "finance_transfer",
        classification: "financial_action",
        target: { targetSystem: "stripe", summary: "Test transfer for authority isolation" },
        payload: { amount: 100 },
      } as any);
      expect(decisionWithEmptyBoard.effect).toBe(decisionWithFullBoard.effect);
      expect(decisionWithEmptyBoard.reason).toBe(decisionWithFullBoard.reason);
    } finally {
      claimStore.sources = savedSources;
      claimStore.signals = savedSignals;
      claimStore.claims = savedClaims;
      claimStore.facts = savedFacts;
      claimStore.verifications = savedVerifications;
      await memoryStore.setMemories(savedMemories);
    }
  });

  test("[G2] the authorization layer never imports epistemic/memory modules (self-improving ≠ self-authorizing)", async () => {
    const authDir = resolve("src/lib/server/authorization");
    const files: string[] = [join(authDir, "gate.ts"), join(authDir, "policy-evaluator.ts")];

    // Forbidden MODULE SPECIFIERS (paths, not identifier names — the word
    // "Memory" inside e.g. InMemoryApprovalStore is not an epistemic import).
    const forbiddenModule = /(\/|^)(epistemic|memory|claim-store|learning-loop)(\/|['"]|$)/;

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      // Extract every static import / require module specifier.
      const specifiers: string[] = [];
      const importMatches = source.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const m of importMatches) specifiers.push(m[1]);
      const requireMatches = source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const m of requireMatches) specifiers.push(m[1]);

      expect(specifiers.length).toBeGreaterThan(0); // sanity: we actually scanned imports
      for (const spec of specifiers) {
        expect(`${file} → ${spec}`).not.toMatch(forbiddenModule);
      }
    }
  });

  test("[R1] Source→Signal→Claim lineage survives a REAL process restart (fresh bun child)", async () => {
    const { claimId, sourceId, signalId } = await submitLineageClaim({
      statement: "Restart-survival observation: lineage must rehydrate from durable storage.",
      subject: "restart survival 44e",
    });
    // Founder-verify so the claim state itself is also durable-rich.
    await pipeline.verifyClaim(claimId, { role: "founder", userId: FOUNDER.userId });

    // Seed a temp environment with EXACTLY the durable state a restart finds.
    const restartDir = join(tmpdir(), `44e-restart-${uuidv4()}`);
    const dataDir = join(restartDir, ".data");
    mkdirSync(dataDir, { recursive: true });

    const writeCollection = (collection: string, record: unknown, id: string) => {
      writeFileSync(join(dataDir, `${collection}.json`), JSON.stringify({ [id]: record }));
    };
    writeCollection("epistemic_sources", claimStore.sources.get(sourceId)!, sourceId);
    writeCollection("epistemic_signals", claimStore.signals.get(signalId)!, signalId);
    writeCollection("epistemic_claims", claimStore.claims.get(claimId)!, claimId);
    writeCollection(
      "epistemic_verifications",
      claimStore.verifications.get(claimId)!,
      claimId
    );

    try {
      const proc = Bun.spawn(
        ["bun", resolve("tests/scheduler/epistemic-child.ts"), claimId],
        {
          stdout: "pipe",
          stderr: "pipe",
          cwd: restartDir,
          env: {
            ...process.env,
            DATABASE_URL: `file:${join(restartDir, "restart.db")}`,
          },
        }
      );
      const out = await new Response(proc.stdout).text();
      const errText = await new Response(proc.stderr).text();
      await proc.exited;

      expect(errText).not.toContain("error");
      const recovered = JSON.parse(out.trim());
      expect(recovered.found).toBe(true);
      expect(recovered.claim.id).toBe(claimId);
      expect(recovered.claim.verificationStatus).toBe("under_review");
      expect(recovered.source).not.toBeNull();
      expect(recovered.source.id).toBe(sourceId);
      expect(recovered.source.sourceSystem).toBe("web_research");
      expect(recovered.signal).not.toBeNull();
      expect(recovered.signal.id).toBe(signalId);
      expect(recovered.signal.signalType).toBe("system_event");
    } finally {
      rmSync(restartDir, { recursive: true, force: true });
    }
  });
});
