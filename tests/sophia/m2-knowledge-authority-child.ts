/**
 * M2 knowledge AUTHORITY child processes (genuine restart simulation,
 * authoritative Prisma mode).
 *
 * Spawned with DATABASE_MODE=authoritative and DATABASE_URL pointing at a
 * throwaway SQLite database, so every mode exercises the fail-closed
 * authoritative branch of CompanyKnowledgeStore — specifically
 * ensurePrismaSeeded(), the pre-M3 correction target.
 *
 * Modes (first CLI argument):
 *   seed-count    — boot; getAllKnowledge() (triggers ensurePrismaSeeded);
 *                   print { total, canonicalSeedCount }
 *   edit-canonical — boot; getAllKnowledge() (ensure seeded); then EDIT
 *                   know-sop-001 through the explicit addKnowledge write path
 *   read-canonical — boot; getKnowledgeById('know-sop-001') (re-runs
 *                   ensurePrismaSeeded — MUST NOT overwrite the edit);
 *                   print the served content + the raw persisted row hash
 *
 * The parent suite creates the throwaway database and asserts:
 *   A. fresh db      → the 8 canonical seeds are created
 *   B. restart       → an edited canonical document is NOT overwritten
 *                      by the code constants
 */
import {
  CompanyKnowledgeStore,
  CANONICAL_COMPANY_KNOWLEDGE,
  computeKnowledgeContentHash,
} from "../../src/lib/server/knowledge/knowledge-store";

async function main() {
  const mode = process.argv[2] || "seed-count";
  const store = CompanyKnowledgeStore.getInstance();

  if (mode === "seed-count") {
    const all = await store.getAllKnowledge();
    const canonicalIds = new Set(CANONICAL_COMPANY_KNOWLEDGE.map((k) => k.id));
    const canonicalSeedCount = all.filter((k) => canonicalIds.has(k.id)).length;
    console.log(JSON.stringify({ total: all.length, canonicalSeedCount }));
    return;
  }

  if (mode === "edit-canonical") {
    // Ensure the seeds exist (fresh db), then EDIT through the explicit path.
    await store.getAllKnowledge();
    const seed = CANONICAL_COMPANY_KNOWLEDGE.find((k) => k.id === "know-sop-001");
    if (!seed) {
      console.log(JSON.stringify({ error: "know-sop-001 not found in canonical seeds" }));
      process.exitCode = 1;
      return;
    }
    await store.addKnowledge({
      ...seed,
      version: "9.9.9",
      summary: "M2-EDIT-PROBE (authoritative): deliberately edited canonical document summary.",
      content: "M2-EDIT-PROBE (authoritative): deliberately edited canonical document body (v9.9.9).",
    });
    console.log(JSON.stringify({ edited: "know-sop-001" }));
    return;
  }

  if (mode === "read-canonical") {
    // Fresh process: ensurePrismaSeeded runs again on this read — the edited
    // row must be preserved (bootstrap-only seeding, never overwrite).
    const doc = await store.getKnowledgeById("know-sop-001");
    const { prisma } = await import("../../src/lib/server/db/prisma");
    const row = await prisma.companyKnowledge.findUnique({ where: { id: "know-sop-001" } });
    console.log(
      JSON.stringify({
        servedContentHasEdit: !!doc && doc.content.includes("M2-EDIT-PROBE"),
        servedVersion: doc?.version ?? null,
        rowHash: row?.hash ?? null,
        rowHashMatchesEditedContent: row
          ? row.hash === computeKnowledgeContentHash(row.content)
          : null,
        rowHashDiffersFromSeedConstant:
          row?.hash !== computeKnowledgeContentHash(
            CANONICAL_COMPANY_KNOWLEDGE.find((k) => k.id === "know-sop-001")!.content
          ),
      })
    );
    return;
  }

  console.log(JSON.stringify({ error: `unknown mode: ${mode}` }));
  process.exitCode = 1;
}

main();
