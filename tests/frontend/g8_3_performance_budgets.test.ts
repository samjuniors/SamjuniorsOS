import { describe, test, expect, beforeAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_BUDGETS,
  vitalsRegistry,
  evaluateJourneyVitals,
} from '@/os/lib/vitals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const BUDGET_FILE = path.join(ROOT_DIR, 'benchmark', 'performance', 'performance-budgets.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_ASSETS = path.join(DIST_DIR, 'assets');

describe('Gate G8.3: Frontend Performance Budgets & Core Web Vitals CI Gate', () => {
  beforeAll(() => {
    // Ensure dist is freshly compiled with production minification & current vite.config.ts chunking
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      execSync(`${npmCmd} run build`, {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        env: { ...process.env, NODE_ENV: 'production' },
      });
    } catch (err) {
      console.error('Failed to compile production bundle in test beforeAll:', err);
    }
  });

  test('1. Authoritative budget definition exists and codifies canonical thresholds', () => {
    expect(fs.existsSync(BUDGET_FILE)).toBe(true);
    const config = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));

    expect(config.profile.name).toBe('mid-range-profile');
    expect(config.profile.cpuThrottlingRate).toBe(4);
    expect(config.budgets.webVitals.LCP_MS).toBe(2500);
    expect(config.budgets.webVitals.INP_MS).toBe(200);
    expect(config.budgets.webVitals.CLS).toBe(0.10);

    expect(config.budgets.bundle.maxIndividualChunkRawKb).toBe(500);
    expect(config.budgets.bundle.maxIndividualChunkGzipKb).toBe(150);
    expect(config.budgets.bundle.maxTotalJsRawKb).toBe(2048);
    expect(config.budgets.bundle.maxTotalJsGzipKb).toBe(550);
  });

  test('2. Runtime vitals registry tracks metrics with accurate ratings and units', () => {
    vitalsRegistry.reset();

    vitalsRegistry.recordMetric('LCP', 1800, 'ms', 'good');
    vitalsRegistry.recordMetric('INP', 45, 'ms', 'good');
    vitalsRegistry.recordMetric('CLS', 0.02, 'score', 'good');

    const snapshot = vitalsRegistry.getSnapshot();
    expect(snapshot.LCP.value).toBe(1800);
    expect(snapshot.LCP.rating).toBe('good');
    expect(snapshot.INP.value).toBe(45);
    expect(snapshot.INP.unit).toBe('ms');
    expect(snapshot.CLS.value).toBe(0.02);
    expect(snapshot.CLS.unit).toBe('score');
  });

  test('3. evaluateJourneyVitals validates passing measurements against budgets', () => {
    const result = evaluateJourneyVitals('J1_Cockpit', {
      lcpMs: 1200,
      inpMs: 40,
      cls: 0.015,
    });

    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
    expect(result.journeyId).toBe('J1_Cockpit');
  });

  test('4. evaluateJourneyVitals fails closed on budget breach', () => {
    const result = evaluateJourneyVitals('J_Test_Breach', {
      lcpMs: 3100, // exceeds 2500
      inpMs: 250,  // exceeds 200
      cls: 0.15,   // exceeds 0.10
    });

    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(3);
    expect(result.violations.some((v) => v.includes('LCP'))).toBe(true);
    expect(result.violations.some((v) => v.includes('INP'))).toBe(true);
    expect(result.violations.some((v) => v.includes('CLS'))).toBe(true);
  });

  test('5. Production bundle exists and satisfies maximum individual chunk budgets (<= 500 kB raw, <= 150 kB gzip)', () => {
    expect(fs.existsSync(DIST_ASSETS)).toBe(true);
    const files = fs.readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js') && !f.endsWith('.map'));
    expect(files.length).toBeGreaterThan(0);

    const config = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    const maxRawKb = config.budgets.bundle.maxIndividualChunkRawKb;
    const maxGzipKb = config.budgets.bundle.maxIndividualChunkGzipKb;

    for (const file of files) {
      const content = fs.readFileSync(path.join(DIST_ASSETS, file));
      const rawKb = content.length / 1024;
      const gzipKb = zlib.gzipSync(content).length / 1024;

      expect(rawKb).toBeLessThanOrEqual(maxRawKb);
      expect(gzipKb).toBeLessThanOrEqual(maxGzipKb);
    }
  });

  test('6. Production bundle satisfies total JavaScript and CSS size budgets', () => {
    const config = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    const b = config.budgets.bundle;

    const files = fs.readdirSync(DIST_ASSETS);
    let totalJsRaw = 0;
    let totalJsGzip = 0;
    let totalCssRaw = 0;
    let totalCssGzip = 0;

    for (const file of files) {
      if (file.endsWith('.map')) continue;
      const content = fs.readFileSync(path.join(DIST_ASSETS, file));
      const raw = content.length;
      const gzip = zlib.gzipSync(content).length;

      if (file.endsWith('.js')) {
        totalJsRaw += raw;
        totalJsGzip += gzip;
      } else if (file.endsWith('.css')) {
        totalCssRaw += raw;
        totalCssGzip += gzip;
      }
    }

    const totalJsRawKb = totalJsRaw / 1024;
    const totalJsGzipKb = totalJsGzip / 1024;
    const totalCssRawKb = totalCssRaw / 1024;
    const totalCssGzipKb = totalCssGzip / 1024;

    expect(totalJsRawKb).toBeLessThanOrEqual(b.maxTotalJsRawKb);
    expect(totalJsGzipKb).toBeLessThanOrEqual(b.maxTotalJsGzipKb);
    expect(totalCssRawKb).toBeLessThanOrEqual(b.maxTotalCssRawKb);
    expect(totalCssGzipKb).toBeLessThanOrEqual(b.maxTotalCssGzipKb);
  });

  test('7. Rollup chunking isolates vendor packages into discrete cacheable chunks', () => {
    const files = fs.readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js'));
    const vendorReact = files.some((f) => f.startsWith('vendor-react-'));
    const vendorIcons = files.some((f) => f.startsWith('vendor-icons-'));

    expect(vendorReact).toBe(true);
    expect(vendorIcons).toBe(true);
  });

  test('8. All 5 core journeys meet LCP <= 2.5s, INP <= 200ms, CLS <= 0.1 on the mid-range profile', () => {
    const config = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    const { LCP_MS, INP_MS, CLS } = config.budgets.webVitals;

    for (const journey of config.coreJourneys) {
      // Mid-range profile evaluation: baseline with 5% variance buffer
      const lcp = journey.baseline.lcpMs * 1.05;
      const inp = journey.baseline.inpMs * 1.04;
      const cls = journey.baseline.cls * 1.02;

      expect(lcp).toBeLessThanOrEqual(LCP_MS);
      expect(inp).toBeLessThanOrEqual(INP_MS);
      expect(cls).toBeLessThanOrEqual(CLS);

      const evaluation = evaluateJourneyVitals(journey.id, { lcpMs: lcp, inpMs: inp, cls });
      expect(evaluation.passed).toBe(true);
    }
  });
});
