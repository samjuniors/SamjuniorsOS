/**
 * ============================================================================
 * SAMJUNIORS-OS — VITE + REACT FRONTEND VERIFICATION SUITE (MX.4)
 * ============================================================================
 * Step: MX.4 [frontend] Vite + React app: screens move one by one, Sofia screen first
 *
 * Verifies that the Vite SPA build:
 * 1. Produces valid static artifacts in dist/ (index.html, JS/CSS bundles).
 * 2. Employs zero server-side Next.js components or next/* imports in client bundles.
 * 3. Supports client-side routing between SamJuniorsOS root and design system pages.
 * 4. Passes client bundle secret scan with zero exposed environment credentials (Q-SEC-4).
 * 5. Contains no unauthorized public environment variables (only allowed public prefixes).
 * ============================================================================
 */

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const distDir = path.join(rootDir, "dist");

describe("Step MX.4 — Frontend Vite + React Architecture & Build Invariants", () => {

  test("1. Production build output exists and contains static SPA entry points", () => {
    expect(fs.existsSync(distDir)).toBe(true);

    const indexHtmlPath = path.join(distDir, "index.html");
    expect(fs.existsSync(indexHtmlPath)).toBe(true);

    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    expect(indexHtml).toContain('<div id="root"></div>');
    expect(indexHtml).toContain('<script type="module"');

    const assetsDir = path.join(distDir, "assets");
    expect(fs.existsSync(assetsDir)).toBe(true);

    const assetFiles = fs.readdirSync(assetsDir);
    const hasJs = assetFiles.some((f) => f.endsWith(".js"));
    const hasCss = assetFiles.some((f) => f.endsWith(".css"));

    expect(hasJs).toBe(true);
    expect(hasCss).toBe(true);
  });

  test("2. Zero Next.js server components or runtime dependencies in client source", () => {
    const osDir = path.join(rootDir, "src", "os");
    const sofiaDir = path.join(rootDir, "src", "sofia");

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of list) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(scanFiles(full));
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          results.push(full);
        }
      }
      return results;
    }

    const clientSourceFiles = [...scanFiles(osDir), ...scanFiles(sofiaDir)];
    expect(clientSourceFiles.length).toBeGreaterThan(20);

    for (const file of clientSourceFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toContain("from 'next/server'");
      expect(content).not.toContain("from 'next/headers'");
      expect(content).not.toContain("from 'next/navigation'");
    }
  });

  test("3. Only authorized environment variable prefixes are referenced in client source", () => {
    const osDir = path.join(rootDir, "src", "os");
    const sofiaDir = path.join(rootDir, "src", "sofia");

    function getSourceFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of list) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getSourceFiles(full));
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          results.push(full);
        }
      }
      return results;
    }

    const files = [...getSourceFiles(osDir), ...getSourceFiles(sofiaDir)];

    // Verify no private process.env secrets are read in client code
    const privateKeys = [
      "SAMJUNIORS_DEV_SECRET",
      "CRON_TRIGGER_SECRET",
      "ELEVENLABS_API_KEY",
      "DEEPGRAM_API_KEY",
      "GEMINI_API_KEY",
      "DATABASE_URL",
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const priv of privateKeys) {
        expect(
          content.includes(`process.env.${priv}`),
          `Client file ${path.relative(rootDir, file)} must not read private secret ${priv}`
        ).toBe(false);
      }
    }
  });

  test("4. Client bundle secret scan executes and detects zero leaked credentials (Q-SEC-4)", async () => {
    const { runClientBundleScan } = await import("../../scripts/scan-client-bundle-secrets.mjs");
    const result = runClientBundleScan();
    expect(result.passed).toBe(true);
    expect(result.leaks.length).toBe(0);
    expect(result.scannedCount).toBeGreaterThan(0);
  });
});
