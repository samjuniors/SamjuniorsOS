/**
 * PHASE 2.6 — Database outage fail-closed probe.
 *
 * Run ONLY while the real PostgreSQL instance is intentionally STOPPED.
 * Every authoritative operation must fail with DatabaseAuthorityError —
 * no silent in-memory/file fallback, no fabricated success, no crash.
 *
 * Exits 0 when ALL probe paths fail closed correctly; exits 1 otherwise.
 */

import { PostgresLeaseManager } from '../lib/server/coordination/lease-manager';
import { PostgresIdempotencyStore } from '../lib/server/idempotency/store';
import { PostgresWorkflowStore } from '../lib/server/workflow/store';
import { PostgresApprovalStore } from '../lib/server/authorization/approval-store';
import { DatabaseAuthorityError } from '../lib/server/db/authority';
import { isDatabaseAvailable } from '../lib/server/db/prisma';

async function expectFailClosed(name: string, fn: () => Promise<any>): Promise<boolean> {
  try {
    const result = await fn();
    // A resolved promise here means the operation fabricated success (or fell back) — violation.
    console.error(`  ✗ FAIL-CLOSED VIOLATION: ${name} resolved with: ${JSON.stringify(result)?.slice(0, 200)}`);
    return false;
  } catch (err: any) {
    if (err instanceof DatabaseAuthorityError) {
      console.log(`  ✓ FAIL-CLOSED OK: ${name} → DatabaseAuthorityError`);
      return true;
    }
    // Some drivers surface raw connection errors instead of wrapping; acceptable only if
    // the error clearly indicates unavailability (P1001 = can't reach database server).
    const code = err?.code || err?.clientVersion;
    if (code === 'P1001' || /Can't reach database server|ECONNREFUSED|terminate/i.test(err?.message || '')) {
      console.log(`  ✓ FAIL-CLOSED OK: ${name} → connection failure (${code || 'raw'})`);
      return true;
    }
    console.error(`  ✗ FAIL-CLOSED VIOLATION: ${name} threw unexpected ${err?.name}: ${err?.message?.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  console.log('================================================================');
  console.log('🔌  PHASE 2.6 — DATABASE OUTAGE FAIL-CLOSED PROBE');
  console.log('================================================================');

  const online = await isDatabaseAvailable();
  if (online) {
    console.error('FATAL: database appears ONLINE — this probe must run with PostgreSQL stopped.');
    process.exit(1);
  }

  let allOk = true;

  allOk = (await expectFailClosed('lease acquire', () =>
    PostgresLeaseManager.getInstance().acquire('p26-outage-lease', 'outage-worker', 30000)
  )) && allOk;
  allOk = (await expectFailClosed('lease renew', () =>
    PostgresLeaseManager.getInstance().renew('p26-outage-lease', 'outage-worker', 30000)
  )) && allOk;
  allOk = (await expectFailClosed('idempotency claim', () =>
    PostgresIdempotencyStore.getInstance().claim({ key: 'p26-outage-idem', actionName: 'probe' })
  )) && allOk;
  allOk = (await expectFailClosed('workflow claimStepAtomic', () =>
    PostgresWorkflowStore.getInstance().claimStepAtomic('p26-outage-inst', 'step-1', 'outage-worker')
  )) && allOk;
  allOk = (await expectFailClosed('approval consume', () =>
    PostgresApprovalStore.getInstance().consume('p26-outage-appr')
  )) && allOk;

  console.log(allOk ? '\nOUTAGE PROBE VERDICT: PASS — all paths fail closed.' : '\nOUTAGE PROBE VERDICT: FAIL');
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
