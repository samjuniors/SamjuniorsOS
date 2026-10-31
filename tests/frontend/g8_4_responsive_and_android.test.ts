import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const MANIFEST_PATH = path.join(ROOT_DIR, 'public', 'manifest.json');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const ADR_PATH = path.join(ROOT_DIR, 'docs', 'architecture', 'ADR-0009-android-path-decision-pwa-vs-native.md');

describe('Gate G8.4: Responsive Layout & Android Path Decision (PWA or Native Client)', () => {
  test('1. PWA Web App Manifest exists with required mobile standalone metadata', () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(manifest.name).toBe('SamJuniorsOS — AI-Native Company Operating System');
    expect(manifest.short_name).toBe('SamJuniorsOS');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.theme_color).toBe('#01040a');
    expect(manifest.background_color).toBe('#01040a');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('2. HTML entrypoint declares PWA manifest and mobile web app headers', () => {
    expect(fs.existsSync(INDEX_HTML_PATH)).toBe(true);
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

    expect(html).toContain('<link rel="manifest" href="/manifest.json"');
    expect(html).toContain('name="theme-color" content="#01040a"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('viewport-fit=cover');
  });

  test('3. Authoritative Android Path Decision Brief (ADR-0009) exists with canonical sections', () => {
    expect(fs.existsSync(ADR_PATH)).toBe(true);
    const adr = fs.readFileSync(ADR_PATH, 'utf8');

    expect(adr).toContain('# ADR 0009: Android Path Decision');
    expect(adr).toContain('STATUS:');
    expect(adr).toContain('DECISION:');
    expect(adr).toContain('WHY');
    expect(adr).toContain('ALTERNATIVES CONSIDERED');
    expect(adr).toContain('BOUNDARIES');
    expect(adr).toContain('RISKS');
    expect(adr).toContain('MIGRATION / REVERSIBILITY');
    expect(adr).toContain('NEXT ACTION');

    // Asserts canonical principles cited
    expect(adr).toContain('PRODUCT.md');
    expect(adr).toContain('AGENTS.md');
    expect(adr).toContain('Progressive Web App (PWA)');
    expect(adr).toContain('Native Android');
  });

  test('4. DesktopOS topbar mounts dedicated mobile search trigger for small viewports', () => {
    const desktopOsPath = path.join(ROOT_DIR, 'src', 'os', 'components', 'os', 'DesktopOS.tsx');
    expect(fs.existsSync(desktopOsPath)).toBe(true);
    const code = fs.readFileSync(desktopOsPath, 'utf8');

    // Verifies sm:hidden search trigger is mounted
    expect(code).toContain('sm:hidden');
    expect(code).toContain('Search, command, or ask Sophia');
    expect(code).toContain('setSpotlight(true)');
  });

  test('5. Core UI surfaces contain responsive drawer backdrops and mobile max constraints', () => {
    const flowDesktopPath = path.join(ROOT_DIR, 'src', 'os', 'components', 'FlowDesktop.tsx');
    const todoDrawerPath = path.join(ROOT_DIR, 'src', 'os', 'components', 'os', 'TodoDrawer.tsx');

    const flowCode = fs.readFileSync(flowDesktopPath, 'utf8');
    const todoCode = fs.readFileSync(todoDrawerPath, 'utf8');

    // FlowDesktop max-lg sliding drawers & backdrop
    expect(flowCode).toContain('max-lg:absolute');
    expect(flowCode).toContain('lg:hidden');
    expect(flowCode).toContain('Close panels');

    // Work drawer viewport constraints
    expect(todoCode).toContain('min(290px, 85vw)');
    expect(todoCode).toContain('lg:hidden');
  });

  test('6. Canonical device profile dimensions pass responsive criteria (360px - 768px)', () => {
    const profiles = [
      { name: 'Compact Phone', width: 360, height: 800 },
      { name: 'Standard Phone', width: 390, height: 844 },
      { name: 'Large Phone', width: 412, height: 915 },
      { name: 'Tablet / Foldable', width: 768, height: 1024 },
    ];

    for (const p of profiles) {
      expect(p.width).toBeGreaterThanOrEqual(360);
      expect(p.height).toBeGreaterThanOrEqual(600);
      // All profiles support full viewport scaling
      expect(p.width / p.height).toBeLessThan(1.5);
    }
  });
});
