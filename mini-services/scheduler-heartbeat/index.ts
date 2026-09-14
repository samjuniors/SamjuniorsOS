/**
 * SamJuniorsOS — AUTOMATION HEARTBEAT (Phase 4.4A).
 *
 * Architecture role: the EXTERNAL cron-style invoker required to make the
 * backend-authoritative scheduler actually wake. This process deliberately
 * contains NO scheduling logic, NO persistence, NO workflow knowledge and
 * NO second scheduler: every tick simply POSTs the EXISTING endpoint
 * (POST /api/workflow/scheduling) with the x-cron-secret header.
 *
 * All authority stays inside the Next.js scheduler:
 *   - due-work evaluation, DistributedLease, occurrence idempotency,
 *     retry/backoff, recurrence and wake-time re-authorization all run
 *     server-side in WorkflowScheduler.evaluateDueWork.
 *   - the side-effect authorization gate is NEVER bypassed; this invoker
 *     cannot forge scheduled occurrences (occurrences derive from persisted
 *     ScheduledWorkItem state, not from requests).
 *
 * Reliability model: the process runs OUTSIDE the Next.js runtime with
 * auto-restart (`bun --hot`), so dev-server recompiles/restarts do not stop
 * the heartbeat. A failed tick logs and waits for the next tick — the
 * natural retry cadence. In a platform deployment (Vercel Cron, k8s CronJob,
 * GitHub Actions schedule) the equivalent is a platform cron hitting the same
 * endpoint with the same secret; this service is the sandbox-local
 * incarnation of that external trigger.
 *
 * Observability: a minimal /health endpoint on HEARTBEAT_PORT (default 3010)
 * reports the last tick outcome — for operators, not for the product UI.
 */

/** Ambient declaration for the Bun global available at runtime in this
 *  standalone bun mini-service (the root tsconfig is owned by Next.js and
 *  intentionally carries no bun types). */
declare const Bun: { serve(options: { port: number; fetch: (req: Request) => Response }): unknown };

const TARGET_URL = process.env.HEARTBEAT_TARGET_URL || "http://localhost:3000/api/workflow/scheduling";
const INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 60_000);
const PORT = Number(process.env.HEARTBEAT_PORT || 3010);
const CRON_SECRET = process.env.CRON_TRIGGER_SECRET;

if (!CRON_SECRET) {
  // Fail-closed at startup: without the secret every POST would be rejected
  // 401 by the endpoint. Refuse to run rather than tick uselessly.
  console.error("[heartbeat] FATAL: CRON_TRIGGER_SECRET is not set — the heartbeat cannot authenticate. Refusing to start.");
  process.exit(1);
}
if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 5000) {
  console.error("[heartbeat] FATAL: HEARTBEAT_INTERVAL_MS must be >= 5000 (got %s). Refusing to start.", process.env.HEARTBEAT_INTERVAL_MS);
  process.exit(1);
}

interface TickOutcome {
  at: string;              // ISO 8601
  ok: boolean;
  status?: number;         // HTTP status of the scheduler endpoint
  processedCount?: number; // honest counts echoed by the endpoint
  executedCount?: number;
  error?: string;
  durationMs: number;
}

let lastOutcome: TickOutcome | null = null;
let ticks = 0;

/** Small jitter (±5%) so multiple heartbeat replicas (if ever deployed)
 *  don't synchronize into a thundering herd against the lease manager. */
function jitter(): number {
  return Math.round(INTERVAL_MS * (0.95 + Math.random() * 0.1));
}

async function tick(): Promise<TickOutcome> {
  const startedAt = Date.now();
  const at = new Date().toISOString();
  try {
    const res = await fetch(TARGET_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": CRON_SECRET as string,
      },
      body: JSON.stringify({}), // default batchLimit; no asOfTime — the endpoint uses real now
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const error = body?.error || `HTTP ${res.status}`;
      console.error(`[heartbeat] ${at} REJECTED (${res.status}): ${error}`);
      return { at, ok: false, status: res.status, error, durationMs: Date.now() - startedAt };
    }
    const outcome: TickOutcome = {
      at,
      ok: true,
      status: res.status,
      processedCount: body?.processedCount ?? 0,
      executedCount: body?.executedCount ?? body?.results?.length ?? 0,
      durationMs: Date.now() - startedAt,
    };
    console.log(
      `[heartbeat] ${at} ok (${outcome.durationMs}ms) — evaluated ${outcome.processedCount} due item(s), executed ${outcome.executedCount}`
    );
    return outcome;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(`[heartbeat] ${at} UNREACHABLE: ${error} — will retry next tick`);
    return { at, ok: false, error, durationMs: Date.now() - startedAt };
  }
}

function scheduleNext() {
  setTimeout(async () => {
    ticks += 1;
    lastOutcome = await tick();
    scheduleNext();
  }, jitter());
}

// Minimal operator health endpoint (not part of the product UI).
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        service: "samjuniors-scheduler-heartbeat",
        target: TARGET_URL,
        intervalMs: INTERVAL_MS,
        ticks,
        lastOutcome,
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[heartbeat] started — target=${TARGET_URL} interval=${INTERVAL_MS}ms health=:${PORT}`);
console.log("[heartbeat] no scheduling logic lives here; all authority is server-side in WorkflowScheduler");

// First tick shortly after start (2s warm-up), then steady cadence.
setTimeout(async () => {
  ticks += 1;
  lastOutcome = await tick();
  scheduleNext();
}, 2000);
