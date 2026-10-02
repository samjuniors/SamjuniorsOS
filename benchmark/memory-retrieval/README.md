# M5.1 — Memory Retrieval Benchmark (A0 baseline / A1+ reruns)

Deterministic, repeatable retrieval benchmark over the SamJuniorsOS memory
architecture (baseline **A0** = `origin/main` @ `b9e63ad`, the verified M4-D
state; **A1** = M5.2 retrieval hygiene, `feat/m52-retrieval-hygiene`;
**A2/A2b/A3** = M5.3 PostgreSQL-native retrieval experiment,
`feat/m53-postgres-retrieval-experiment`). This
harness exists to answer *"What exactly is M4 bad at?"* with measured
evidence — **not** to justify any particular replacement technology.

Full design, results, and analysis:
**`docs/architecture/M5_1_MEMORY_RETRIEVAL_BENCHMARK.md`** (A0),
**`docs/architecture/M5_2_RETRIEVAL_HYGIENE.md`** (A0→A1 before/after), and
**`docs/architecture/M5_3_POSTGRES_RETRIEVAL_EXPERIMENT.md`**
(A1→A2→A2b→A3 per-stage records).

## Run it

```bash
# human-readable summary (writes results/run-<label>.{json,md}; default label a1)
bun run benchmark/memory-retrieval/run.ts

# machine-readable JSON on stdout (nothing else)
bun run benchmark/memory-retrieval/run.ts --json

# explicit label (e.g. for future A2 runs)
bun run benchmark/memory-retrieval/run.ts --label a2
```

The committed A0 baseline evidence (`results/baseline-a0.{json,md}`) is
IMMUTABLE — the CLI never overwrites it; every post-M5.2 run persists under
its own label (`run-a1` = M5.2, `run-a2`/`run-a2b`/`run-a3` = the M5.3
stages — see the M5.3 doc for which code state each label measured).

The CLI runs in an isolated scratch data directory (`$TMPDIR/
samjuniors-m51-benchmark`) and resets it on entry — it never touches the
repository's real `.data`. Two consecutive runs produce byte-identical JSON
(this is asserted by the self-test suite, not assumed).

## Run the benchmark's own tests

```bash
bun run tests/sophia/m51_benchmark.test.ts
```

30 tests: fixture integrity (F1–F12), metric math on hand-computed cases
(M1–M5), classification rules (CL1–CL7), and full-run determinism + wiring
anchors (D1–D6).

## Layout

| File | Role |
|---|---|
| `types.ts` | Shared types: surfaces, categories, failure classes, gap taxonomy |
| `fixture.ts` | The synthetic gold-standard universe (all data frozen; SHA-256 digest) |
| `queries.ts` | The 13 benchmark queries (8 categories, BQ1–BQ8) with gold/forbidden sets |
| `seed.ts` | Seeds the REAL stores through their PUBLIC APIs (lifecycle machinery included) |
| `harness.ts` | Runs the exact canonical-path retrieval functions + assemble() render capture |
| `metrics.ts` | Pure Recall@K / Precision@K / MRR / union recall |
| `classify.ts` | Failure classification: RETRIEVAL vs AUTHORITY_LIFECYCLE; gap taxonomy A–J; graph-candidate flag |
| `evaluate.ts` | Per-query scoring + correctness gates + aggregation |
| `report.ts` | Deterministic markdown rendering |
| `run.ts` | CLI entry |
| `results/` | The immutable A0 baseline evidence (`baseline-a0.{json,md}`) and labeled reruns (`run-a1.{json,md}`, …) |

## Invariants

1. **No LLM anywhere.** The benchmark measures retrieval only; GENERATION
   failures are structurally out of scope (documented in every report).
2. **No production data.** The corpus is fully synthetic (Lumora, Aurorium,
   Nimbus Gateway, Helix… are invented entities).
3. **No clock in results.** Every result field is derived from frozen fixture
   timestamps and deterministic retrieval — never `Date.now()`.
4. **The architecture is preserved.** No store, schema, or production path was
   modified to build this harness (zero `src/` changes).
