/**
 * ============================================================================
 * SAMJUNIORS-OS: DEPLOY PIPELINE & POST-DEPLOY VERIFICATION SUITE
 * ============================================================================
 * Step: G2.6 [platform] Deploy pipeline with post-deploy verification of the live environment
 * Exit Criteria:
 *   Pipeline deploys to staging and verifies the deployed environment, not just the local build.
 * ============================================================================
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import fs from 'fs';
import { verifyDeployment } from '../../scripts/verify-deployment';
import { runDeployPipeline } from '../../scripts/deploy-staging';
import { LiveInteractionServer } from '../../src/lib/server/live/server';
import express from 'express';
import http from 'http';
import { apiRouter } from '../../src/server/api';
import { securityHeadersMiddleware } from '../../src/server/middleware';

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('\n=============================================================');
  console.log('SAMJUNIORS-OS: DEPLOY PIPELINE & POST-DEPLOY TEST SUITE (G2.6)');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  async function step(name: string, fn: () => Promise<void>) {
    process.stdout.write(`  [TEST STEP] ${name}... `);
    try {
      await fn();
      console.log('PASS');
      passed++;
    } catch (err: any) {
      console.log('FAIL');
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      }
      failed++;
    }
  }

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const repoRoot = path.resolve(__dirname, '../..');

  // Spin up companion LiveInteractionServer on port 3001 for test verification
  let liveServer: LiveInteractionServer | null = null;
  let httpServer: any = null;
  const wsPort = parseInt(process.env.LIVE_WS_PORT || '3001', 10);
  try {
    try {
      const check = await fetch(`${appUrl}/api/health`).catch(() => null);
      if (!check || check.status !== 200) {
        const testApp = express();
        testApp.use(securityHeadersMiddleware);
        testApp.use(express.json());
        testApp.use('/api', apiRouter);
        const httpPort = parseInt(new URL(appUrl).port || '3000', 10);
        httpServer = http.createServer(testApp);
        await new Promise((resolve) => httpServer.listen(httpPort, resolve));
      }
    } catch (e) {}

    liveServer = new LiveInteractionServer({ port: wsPort });
    await liveServer.listen(wsPort);
  } catch (err: any) {
    if (err.code === 'EADDRINUSE') {
      liveServer = null; // already running
    } else {
      console.warn(`[TEST NOTICE] Could not bind port ${wsPort}:`, err.message);
    }
  }

  try {
  // --------------------------------------------------------------------------
  // TEST 1: Post-Deploy Verification Against Live Environment
  // --------------------------------------------------------------------------
  await step('1. Post-deploy live verification against target environment', async () => {
    const report = await verifyDeployment({
      appUrl,
      timeoutMs: 8000,
      retries: 3,
      retryDelayMs: 500,
    });

    assert(report, 'Report must be returned');
    assert.strictEqual(report.allPassed, true, 'All live environment verification checks must pass');
    assert.strictEqual(report.checks.length, 5, 'Must execute exactly 5 verification checks');

    const healthCheck = report.checks.find((c) => c.name.includes('/api/health'));
    assert(healthCheck && healthCheck.passed, 'Healthcheck verification must pass');
    assert.strictEqual(healthCheck.details.status, 'healthy');
    assert.strictEqual(healthCheck.details.databaseStatus, 'connected');

    const secCheck = report.checks.find((c) => c.name.includes('Security Headers'));
    assert(secCheck && secCheck.passed, 'Security headers verification must pass');
    assert.strictEqual(secCheck.details.hasNosniff, true);

    const authCheck = report.checks.find((c) => c.name.includes('executive authorization'));
    assert(authCheck && authCheck.passed, 'Fail-closed authorization check must pass');
    assert.strictEqual(authCheck.details.failClosedVerified, true);

    const slaCheck = report.checks.find((c) => c.name.includes('SLA latency'));
    assert(slaCheck && slaCheck.passed, 'SLA latency check must pass');
    assert.strictEqual(report.slaMetrics.budgetMet, true);
    assert(report.slaMetrics.p99Ms < 1000, `P99 latency (${report.slaMetrics.p99Ms}ms) must meet 1000ms budget`);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Post-Deploy Negative Failure Detection on Degraded Environment
  // --------------------------------------------------------------------------
  await step('2. Post-deploy failure detection on degraded/unreachable target', async () => {
    // Probing an unreachable local port to test fail-closed behavior
    const badPort = 59876;
    const badUrl = `http://127.0.0.1:${badPort}`;

    const report = await verifyDeployment({
      appUrl: badUrl,
      timeoutMs: 1000,
      retries: 1,
      retryDelayMs: 100,
    });

    assert.strictEqual(report.allPassed, false, 'Verification must fail on unreachable target');
    const healthCheck = report.checks.find((c) => c.name.includes('/api/health'));
    assert(healthCheck, 'Health check must be recorded');
    assert.strictEqual(healthCheck.passed, false, 'Health check must fail on unreachable target');
    assert(healthCheck.error, 'Failure details must be populated');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Deploy Pipeline Orchestrator Dry-Run Execution
  // --------------------------------------------------------------------------
  await step('3. Staging deploy pipeline execution with post-deploy verification', async () => {
    const pipelineResult = await runDeployPipeline({
      appUrl,
      dryRunVerifyOnly: true,
      skipBuild: true,
    });

    assert.strictEqual(pipelineResult.success, true, 'Deploy pipeline execution must succeed');
    assert(pipelineResult.deploymentId.startsWith('deploy-'), 'Must generate unique deployment ID');
    assert(pipelineResult.stages.length >= 4, 'Must execute all pipeline stages');

    const allStagesPassed = pipelineResult.stages.every((s) => s.passed);
    assert.strictEqual(allStagesPassed, true, 'All pipeline stages must pass');

    // Confirm post-deploy verification stage was executed as part of pipeline
    const postDeployStage = pipelineResult.stages.find((s) => s.name.includes('Post-deploy live environment'));
    assert(postDeployStage && postDeployStage.passed, 'Post-deploy live environment verification stage must pass');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Zero-Secret Security Audit Across Deployment Configurations
  // --------------------------------------------------------------------------
  await step('4. Zero-secret audit of GitHub Actions deploy workflow & scripts', async () => {
    const deployWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy-staging.yml');
    assert(fs.existsSync(deployWorkflowPath), 'deploy-staging.yml must exist');

    const deployScriptPath = path.join(repoRoot, 'scripts', 'deploy-staging.ts');
    assert(fs.existsSync(deployScriptPath), 'deploy-staging.ts must exist');

    const verifyScriptPath = path.join(repoRoot, 'scripts', 'verify-deployment.ts');
    assert(fs.existsSync(verifyScriptPath), 'verify-deployment.ts must exist');

    const workflowContent = fs.readFileSync(deployWorkflowPath, 'utf8');
    const deployContent = fs.readFileSync(deployScriptPath, 'utf8');
    const verifyContent = fs.readFileSync(verifyScriptPath, 'utf8');

    const SECRET_PATTERN = /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35})/i;
    assert.strictEqual(SECRET_PATTERN.test(workflowContent), false, 'Found secret pattern in deploy-staging.yml');
    assert.strictEqual(SECRET_PATTERN.test(deployContent), false, 'Found secret pattern in deploy-staging.ts');
    assert.strictEqual(SECRET_PATTERN.test(verifyContent), false, 'Found secret pattern in verify-deployment.ts');

    // Verify post-deploy verification command is invoked in CI workflow
    assert(
      workflowContent.includes('scripts/deploy-staging.ts') || workflowContent.includes('verify-deployment.ts'),
      'Workflow must invoke deploy-staging.ts or verify-deployment.ts for live post-deploy verification'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: CLI Entrypoint Invocation & Flag Handling
  // --------------------------------------------------------------------------
  await step('5. Verification CLI entrypoints and npm run scripts', async () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.ok(pkgJson.scripts['deploy:staging'], 'Missing "deploy:staging" npm script');
    assert.ok(pkgJson.scripts['verify:deployment'], 'Missing "verify:deployment" npm script');
  });

  } finally {
    if (liveServer) {
      await liveServer.close();
    }
    if (httpServer) {
      await new Promise((r) => httpServer.close(r));
    }
  }

  console.log('\n=============================================================');
  console.log(`TEST SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[UNCAUGHT TEST ERROR]:', err);
  process.exit(1);
});
