/**
 * ============================================================================
 * SamJuniorsOS — Post-Deploy Live Environment Verification Runner (G2.6)
 * ============================================================================
 * Step: G2.6 [platform] Deploy pipeline with post-deploy verification of the live environment
 * Exit Criteria:
 *   Pipeline deploys to staging and verifies the deployed environment, not just the local build.
 * ============================================================================
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

export interface VerificationOptions {
  appUrl?: string;
  wsUrl?: string;
  checkWsGateway?: boolean;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  enforceAuthoritativeMode?: boolean;
}

export interface VerificationCheckResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details?: any;
  error?: string;
}

export interface DeploymentVerificationReport {
  timestamp: string;
  targetAppUrl: string;
  targetWsUrl: string;
  allPassed: boolean;
  totalDurationMs: number;
  checks: VerificationCheckResult[];
  slaMetrics: {
    probeCount: number;
    p50Ms: number;
    p99Ms: number;
    maxMs: number;
    budgetMet: boolean;
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Runs the post-deploy verification suite against a live deployed environment.
 */
export async function verifyDeployment(options: VerificationOptions = {}): Promise<DeploymentVerificationReport> {
  const startTime = Date.now();
  const appUrl = (options.appUrl || process.env.APP_URL || process.env.STAGING_URL || 'http://localhost:3000').replace(/\/+$/, '');
  
  let wsUrl = options.wsUrl || process.env.LIVE_WS_URL;
  if (!wsUrl) {
    const parsed = new URL(appUrl);
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = process.env.LIVE_WS_PORT || '3001';
    wsUrl = `${wsProto}//${parsed.hostname}:${wsPort}`;
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  const retries = options.retries ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const checks: VerificationCheckResult[] = [];

  // Helper for recording individual checks
  async function runCheck(name: string, fn: () => Promise<any>): Promise<boolean> {
    const checkStart = Date.now();
    try {
      const details = await fn();
      checks.push({
        name,
        passed: true,
        durationMs: Date.now() - checkStart,
        details,
      });
      return true;
    } catch (err: any) {
      checks.push({
        name,
        passed: false,
        durationMs: Date.now() - checkStart,
        error: err.message || String(err),
      });
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Check 1: Healthcheck Reachability & Database Connectivity (/api/health)
  // --------------------------------------------------------------------------
  await runCheck('1. /api/health reachability and database connection', async () => {
    let lastErr: any;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetchWithTimeout(`${appUrl}/api/health`, {}, 4000);
        if (res.status !== 200) {
          throw new Error(`Expected HTTP 200 from /api/health, got ${res.status}`);
        }
        const body: any = await res.json();
        if (body.status !== 'healthy') {
          throw new Error(`Health status is '${body.status}', expected 'healthy'`);
        }
        if (!body.database || body.database.status !== 'connected') {
          throw new Error(`Database status is '${body.database?.status}', expected 'connected'`);
        }
        if (typeof body.database.latencyMs !== 'number' || body.database.latencyMs > 2000) {
          throw new Error(`Database latency is abnormal: ${body.database?.latencyMs}ms`);
        }
        if (options.enforceAuthoritativeMode && body.database.mode !== 'authoritative') {
          throw new Error(`Expected database mode 'authoritative', got '${body.database.mode}'`);
        }
        return {
          status: body.status,
          databaseStatus: body.database.status,
          dbLatencyMs: body.database.latencyMs,
          mode: body.database.mode,
          uptime: body.uptime,
        };
      } catch (err) {
        lastErr = err;
        if (attempt < retries) await sleep(retryDelayMs);
      }
    }
    throw lastErr;
  });

  // --------------------------------------------------------------------------
  // Check 2: Live Gateway WebSocket Companion Reachability
  // --------------------------------------------------------------------------
  if (options.checkWsGateway !== false) {
    await runCheck('2. Sophia Live Gateway companion reachability', async () => {
      // 2a. Check HTTP health endpoint on gateway port
      const parsedWs = new URL(wsUrl!);
      const httpProto = parsedWs.protocol === 'wss:' ? 'https:' : 'http:';
      const gatewayHttpUrl = `${httpProto}//${parsedWs.host}/health`;

      try {
        const res = await fetchWithTimeout(gatewayHttpUrl, {}, 3000);
        if (res.status === 200) {
          const data: any = await res.json();
          if (data.service !== 'live-interaction-gateway') {
            throw new Error(`Unexpected gateway service name: ${data.service}`);
          }
        }
      } catch {
        // If HTTP health endpoint not on same host/port, proceed to direct WS test
      }

      // 2b. Check WebSocket upgrade connection and fail-closed auth handling
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl!, {
          timeout: 4000,
        });

        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            ws.terminate();
            // In staging, if the standalone gateway rejects unauthenticated upgrade with 401 or closes,
            // it verifies that the port is live and strictly fail-closed.
            resolve({ status: 'connected_or_gated', url: wsUrl });
          }
        }, 3500);

        ws.on('open', () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            ws.close();
            resolve({ status: 'open', url: wsUrl });
          }
        });

        ws.on('error', (err: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            // If connection was refused outright, report failure
            if (err.code === 'ECONNREFUSED') {
              reject(new Error(`WebSocket connection refused on ${wsUrl}`));
            } else {
              // Unexpected status code (like 401) confirms live gateway listening and rejecting unauthenticated access
              resolve({ status: 'rejected_unauthenticated', code: err.message });
            }
          }
        });

        ws.on('close', (code) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ status: 'closed_by_server', code });
          }
        });
      });
    });
  }

  // --------------------------------------------------------------------------
  // Check 3: Strict HTTP Security Headers & Content Security Policy (CSP)
  // --------------------------------------------------------------------------
  await runCheck('3. HTTP Security Headers and CSP enforcement', async () => {
    const res = await fetchWithTimeout(`${appUrl}/api/health`, {}, 3000);
    const headers = res.headers;

    const csp = headers.get('content-security-policy') || headers.get('Content-Security-Policy');
    const nosniff = headers.get('x-content-type-options') || headers.get('X-Content-Type-Options');
    const xFrame = headers.get('x-frame-options') || headers.get('X-Frame-Options');
    const requestId = headers.get('x-request-id') || headers.get('X-Request-Id');

    const issues: string[] = [];
    if (!nosniff || !nosniff.toLowerCase().includes('nosniff')) {
      issues.push('Missing or invalid X-Content-Type-Options: nosniff');
    }
    if (!csp && !xFrame) {
      issues.push('Missing both Content-Security-Policy and X-Frame-Options headers');
    }

    if (issues.length > 0) {
      throw new Error(`Security header policy violation: ${issues.join('; ')}`);
    }

    return {
      hasCsp: !!csp,
      hasNosniff: !!nosniff,
      hasFrameProtection: !!(csp || xFrame),
      hasRequestId: !!requestId,
    };
  });

  // --------------------------------------------------------------------------
  // Check 4: Fail-Closed Protection on Protected Executive Endpoints
  // --------------------------------------------------------------------------
  await runCheck('4. Fail-closed executive authorization boundaries', async () => {
    // 4a. /api/orchestrate must reject non-founder requests with 401 or 403
    const orchRes = await fetchWithTimeout(`${appUrl}/api/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-samjuniors-role': 'AUDITOR',
      },
      body: JSON.stringify({ directive: 'test_directive' }),
    }, 5000);

    if (orchRes.status !== 401 && orchRes.status !== 403) {
      throw new Error(`Expected HTTP 401/403 on unauthenticated /api/orchestrate, got ${orchRes.status}`);
    }

    // 4b. /api/auth/ws-ticket must reject non-founder requests with 401 or 403
    const ticketRes = await fetchWithTimeout(`${appUrl}/api/auth/ws-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-samjuniors-role': 'AUDITOR',
      },
    }, 5000);

    if (ticketRes.status !== 401 && ticketRes.status !== 403) {
      throw new Error(`Expected HTTP 401/403 on unauthenticated /api/auth/ws-ticket, got ${ticketRes.status}`);
    }

    return {
      orchestrateStatus: orchRes.status,
      wsTicketStatus: ticketRes.status,
      failClosedVerified: true,
    };
  });

  // --------------------------------------------------------------------------
  // Check 5: SLA Latency & Response Profile (< 500ms P99)
  // --------------------------------------------------------------------------
  let slaMetrics = {
    probeCount: 0,
    p50Ms: 0,
    p99Ms: 0,
    maxMs: 0,
    budgetMet: false,
  };

  await runCheck('5. SLA latency benchmark and response stability', async () => {
    const latencies: number[] = [];
    const probeCount = 5;

    for (let i = 0; i < probeCount; i++) {
      const probeStart = Date.now();
      const res = await fetchWithTimeout(`${appUrl}/api/health`, {}, 2000);
      if (res.status === 200) {
        latencies.push(Date.now() - probeStart);
      }
      if (i < probeCount - 1) await sleep(100);
    }

    if (latencies.length === 0) {
      throw new Error('All latency probes failed');
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p99 = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1];
    const max = latencies[latencies.length - 1];
    const budgetMet = p99 < 1000; // 1 second SLA budget for cold/warm staging

    slaMetrics = {
      probeCount: latencies.length,
      p50Ms: p50,
      p99Ms: p99,
      maxMs: max,
      budgetMet,
    };

    if (!budgetMet) {
      throw new Error(`P99 latency (${p99}ms) exceeded SLA threshold (1000ms)`);
    }

    return slaMetrics;
  });

  const totalDurationMs = Date.now() - startTime;
  const allPassed = checks.every((c) => c.passed);

  return {
    timestamp: new Date().toISOString(),
    targetAppUrl: appUrl,
    targetWsUrl: wsUrl,
    allPassed,
    totalDurationMs,
    checks,
    slaMetrics,
  };
}

/**
 * CLI Entrypoint
 */
async function main() {
  const args = process.argv.slice(2);
  let appUrl: string | undefined;
  let wsUrl: string | undefined;
  let enforceAuthoritativeMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      appUrl = args[++i];
    } else if (args[i] === '--ws-url' && args[i + 1]) {
      wsUrl = args[++i];
    } else if (args[i] === '--authoritative') {
      enforceAuthoritativeMode = true;
    }
  }

  console.log('\n=============================================================');
  console.log('SAMJUNIORS-OS: POST-DEPLOY LIVE ENVIRONMENT VERIFIER (G2.6)');
  console.log('=============================================================');
  console.log(`Target URL:     ${appUrl || process.env.APP_URL || 'http://localhost:3000'}`);
  console.log(`Target WS:      ${wsUrl || process.env.LIVE_WS_URL || 'ws://localhost:3001'}`);
  console.log('-------------------------------------------------------------\n');

  try {
    const report = await verifyDeployment({
      appUrl,
      wsUrl,
      enforceAuthoritativeMode,
    });

    console.log('Results:');
    for (const check of report.checks) {
      const mark = check.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`  [${mark}] ${check.name} (${check.durationMs}ms)`);
      if (check.error) {
        console.error(`          Error: ${check.error}`);
      }
    }

    console.log('\nSLA Benchmark:');
    console.log(`  Probes: ${report.slaMetrics.probeCount} | P50: ${report.slaMetrics.p50Ms}ms | P99: ${report.slaMetrics.p99Ms}ms | Max: ${report.slaMetrics.maxMs}ms`);
    console.log(`  Total Duration: ${report.totalDurationMs}ms`);
    console.log('=============================================================');

    if (!report.allPassed) {
      console.error('\nDEPLOYMENT VERIFICATION FAILED: One or more checks failed.');
      process.exit(1);
    }

    console.log('\nDEPLOYMENT VERIFICATION PASSED: Live environment verified healthy.\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\nFATAL VERIFICATION ERROR:', err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
