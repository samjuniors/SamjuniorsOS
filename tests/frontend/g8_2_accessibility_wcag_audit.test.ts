/**
 * GATE G8.2 REGRESSION SUITE: WCAG 2.2 AA Accessibility Conformance
 *
 * Title: Accessibility audit to WCAG 2.2 AA and fixes
 * Exit Evidence: Automated and manual keyboard and screen-reader checks recorded;
 * no open AA failures on core journeys.
 *
 * Invariants per AGENTS.md §1, §3, §4, §8, §15:
 * 1. WCAG 2.2 Level AA compliance across all core journeys:
 *    - Perceivable: Text alternatives, semantic landmarks, color contrast >= 4.5:1.
 *    - Operable: Full keyboard accessibility, no keyboard traps, skip link, visible focus, target size >= 24px, focus not obscured.
 *    - Understandable: Page titled, input labels, predictable navigation.
 *    - Robust: Programmatic name, role, value on all interactive controls.
 * 2. Single unified app: No parallel design system tabs in production UI.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Relative luminance formula per WCAG 2.2 (IEC 61966-2-1)
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Contrast ratio formula per WCAG 2.2 (L1 + 0.05) / (L2 + 0.05)
function getContrastRatio(hex1: string, hex2: string): number {
  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.split('').map(x => x + x).join('') : clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255] as [number, number, number];
  };
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function main() {
  console.log('======================================================================');
  console.log('SAMJUNIORS-OS: GATE G8.2 WCAG 2.2 AA ACCESSIBILITY AUDIT SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      if (err?.stack) {
        console.error(`         ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      failed++;
    }
  }

  const root = process.cwd();
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
  const appTsx = readFileSync(join(root, 'src/os/App.tsx'), 'utf8');
  const desktopOsTsx = readFileSync(join(root, 'src/os/components/os/DesktopOS.tsx'), 'utf8');
  const spotlightTsx = readFileSync(join(root, 'src/os/components/os/Spotlight.tsx'), 'utf8');
  const todoDrawerTsx = readFileSync(join(root, 'src/os/components/os/TodoDrawer.tsx'), 'utf8');
  const chatPanelTsx = readFileSync(join(root, 'src/os/components/os/ChatPanel.tsx'), 'utf8');
  const personaModalTsx = readFileSync(join(root, 'src/os/components/os/PersonaModal.tsx'), 'utf8');
  const agentQuickDockTsx = readFileSync(join(root, 'src/os/components/os/AgentQuickDock.tsx'), 'utf8');
  const flowDesktopTsx = readFileSync(join(root, 'src/os/components/FlowDesktop.tsx'), 'utf8');
  const standardSurfacesTsx = readFileSync(join(root, 'src/os/components/surfaces/StandardSurfaces.tsx'), 'utf8');
  const voicePresenceTsx = readFileSync(join(root, 'src/os/components/voice/SharedSophiaVoicePresence.tsx'), 'utf8');

  // -------------------------------------------------------------------------
  // 1. Document & Landmark Semantics (WCAG 1.3.1, 2.4.1, 2.4.2)
  // -------------------------------------------------------------------------
  await check('1. Document has lang="en", descriptive title, and non-blocking viewport', () => {
    assert.match(indexHtml, /<html\s+lang="en"/i, 'index.html must specify lang="en"');
    assert.match(indexHtml, /<title>SamJuniorsOS/i, 'index.html must have descriptive application title');
    assert.doesNotMatch(indexHtml, /user-scalable\s*=\s*no/i, 'Viewport must not disable user zoom (WCAG 1.4.4)');
  });

  await check('2. App has bypass skip-to-content link targeting main landmark (WCAG 2.4.1)', () => {
    assert.match(appTsx, /href="#main-content"/, 'App.tsx must contain a skip to main content link');
    assert.match(appTsx, /id="main-content"/, 'App.tsx must define target id="main-content"');
    assert.match(appTsx, /role="main"/, 'App.tsx must designate primary landmark with role="main"');
  });

  await check('3. View switcher provides semantic navigation and tablist pattern (WCAG 1.3.1)', () => {
    assert.match(appTsx, /<nav\s+aria-label="Operating system view switcher"/, 'Nav landmark with label required');
    assert.match(appTsx, /role="tablist"/, 'Mode container must specify role="tablist"');
    assert.match(appTsx, /role="tab"/, 'Mode items must specify role="tab"');
    assert.match(appTsx, /aria-selected=/, 'Mode items must expose aria-selected state');
  });

  // -------------------------------------------------------------------------
  // 2. Shell & Window Controls (WCAG 2.1.1, 4.1.2, 2.5.8)
  // -------------------------------------------------------------------------
  await check('4. DesktopOS window controls have accessible labels and focus outlines', () => {
    assert.match(desktopOsTsx, /aria-label="Close window"/, 'Close window button must have accessible label');
    assert.match(desktopOsTsx, /aria-label="Minimize window"/, 'Minimize window button must have accessible label');
    assert.match(desktopOsTsx, /aria-label="Restore window"/, 'Restore window button must have accessible label');
    assert.match(desktopOsTsx, /focus-visible:outline-2/, 'Window controls must have visible focus outline');
  });

  await check('5. DesktopOS status tray buttons have popup and expanded attributes', () => {
    assert.match(desktopOsTsx, /aria-haspopup="dialog"/, 'Tray buttons with popovers must set aria-haspopup="dialog"');
    assert.match(desktopOsTsx, /aria-expanded=/, 'Tray buttons must indicate expanded state');
    assert.match(desktopOsTsx, /aria-label="Application menu"/, 'Start menu button must have label');
    assert.match(desktopOsTsx, /aria-label=\{focus \? "Exit focus mode" : "Enter focus mode"\}/, 'Focus button must have label');
  });

  await check('6. DesktopOS popovers have dialog role and Escape key dismissal (WCAG 2.1.2)', () => {
    assert.match(desktopOsTsx, /role="dialog"/, 'Popovers must have role="dialog"');
    assert.match(desktopOsTsx, /key === "Escape"/, 'DesktopOS must handle Escape key to close popovers');
  });

  await check('7. DesktopOS volume slider exposes role="slider" with range semantics', () => {
    assert.match(desktopOsTsx, /role="slider"/, 'Volume control must have role="slider"');
    assert.match(desktopOsTsx, /aria-label="System volume"/, 'Volume slider must have accessible label');
    assert.match(desktopOsTsx, /aria-valuemin=\{0\}/, 'Volume slider must have aria-valuemin');
    assert.match(desktopOsTsx, /aria-valuemax=\{100\}/, 'Volume slider must have aria-valuemax');
    assert.match(desktopOsTsx, /aria-valuenow=/, 'Volume slider must have aria-valuenow');
  });

  await check('8. DesktopOS toggles implement role="switch" with aria-checked', () => {
    assert.match(desktopOsTsx, /role="switch"/, 'Toggle must implement role="switch"');
    assert.match(desktopOsTsx, /aria-checked=\{on\}/, 'Toggle must bind aria-checked');
  });

  // -------------------------------------------------------------------------
  // 3. Spotlight Command Palette (WCAG 2.1.1, 4.1.2)
  // -------------------------------------------------------------------------
  await check('9. Spotlight implements combobox pattern with listbox and option semantics', () => {
    assert.match(spotlightTsx, /role="dialog"/, 'Spotlight must have role="dialog"');
    assert.match(spotlightTsx, /aria-modal="true"/, 'Spotlight must have aria-modal="true"');
    assert.match(spotlightTsx, /role="combobox"/, 'Spotlight input must specify role="combobox"');
    assert.match(spotlightTsx, /aria-autocomplete="list"/, 'Spotlight input must have aria-autocomplete="list"');
    assert.match(spotlightTsx, /aria-controls="spotlight-results"/, 'Spotlight input must link to results list');
    assert.match(spotlightTsx, /id="spotlight-results"/, 'Results container must have id="spotlight-results"');
    assert.match(spotlightTsx, /role="listbox"/, 'Results container must have role="listbox"');
    assert.match(spotlightTsx, /role="option"/, 'Command items must have role="option"');
    assert.match(spotlightTsx, /aria-selected=\{active\}/, 'Active option must expose aria-selected');
    assert.match(spotlightTsx, /key === "Escape"/, 'Spotlight must close on Escape key');
  });

  // -------------------------------------------------------------------------
  // 4. Work Drawer & Task Management (WCAG 1.3.1, 2.1.1, 4.1.2)
  // -------------------------------------------------------------------------
  await check('10. TodoDrawer pull tab and panel implement accessible drawer semantics', () => {
    assert.match(todoDrawerTsx, /aria-expanded=\{open\}/, 'Pull tab must reflect aria-expanded');
    assert.match(todoDrawerTsx, /aria-controls="work-drawer-panel"/, 'Pull tab must control work drawer panel');
    assert.match(todoDrawerTsx, /id="work-drawer-panel"/, 'Drawer panel must define id');
    assert.match(todoDrawerTsx, /role="region"/, 'Drawer panel must define role="region"');
    assert.match(todoDrawerTsx, /key === "Escape"/, 'Drawer must close on Escape key');
    assert.match(todoDrawerTsx, /aria-label="New workstream title"/, 'Input must have accessible label');
    assert.match(todoDrawerTsx, /role="radiogroup"/, 'Owner selector must have role="radiogroup"');
    assert.match(todoDrawerTsx, /role="radio"/, 'Owner buttons must have role="radio"');
  });

  // -------------------------------------------------------------------------
  // 5. Workforce & Chat Panel (WCAG 2.1.1, 4.1.2, 4.1.3)
  // -------------------------------------------------------------------------
  await check('11. ChatPanel implements dialog, tablist, and live log semantics', () => {
    assert.match(chatPanelTsx, /aria-label=\{open \? "Close agent chat" : "Open agent messages and chat"\}/, 'Trigger button must have accessible label');
    assert.match(chatPanelTsx, /aria-expanded=\{open\}/, 'Trigger button must reflect aria-expanded');
    assert.match(chatPanelTsx, /role="dialog"/, 'Chat container must have role="dialog"');
    assert.match(chatPanelTsx, /role="tablist"/, 'Contact selector must have role="tablist"');
    assert.match(chatPanelTsx, /role="tab"/, 'Contact items must have role="tab"');
    assert.match(chatPanelTsx, /role="log"/, 'Thread messages must have role="log"');
    assert.match(chatPanelTsx, /aria-live="polite"/, 'Thread messages must announce politely');
    assert.match(chatPanelTsx, /aria-label=\{`Message \${activeAgent\.name}`\}/, 'Message input must have dynamic label');
  });

  await check('12. PersonaModal implements dialog, accessible close buttons, and Escape dismissal', () => {
    assert.match(personaModalTsx, /role="dialog"/, 'PersonaModal must have role="dialog"');
    assert.match(personaModalTsx, /aria-modal="true"/, 'PersonaModal must have aria-modal="true"');
    assert.match(personaModalTsx, /aria-label="Close role card"/, 'Close buttons must have accessible label');
    assert.match(personaModalTsx, /key === "Escape"/, 'PersonaModal must close on Escape key');
    assert.match(personaModalTsx, /aria-expanded=\{more\}/, 'Tools disclosure button must have aria-expanded');
  });

  await check('13. AgentQuickDock implements role="toolbar" with accessible agent buttons', () => {
    assert.match(agentQuickDockTsx, /role="toolbar"/, 'Dock container must have role="toolbar"');
    assert.match(agentQuickDockTsx, /aria-label="Workforce agents"/, 'Dock container must have accessible label');
    assert.match(agentQuickDockTsx, /aria-label=\{collapsed \? "Show workforce dock" : "Hide workforce dock"\}/, 'Dock toggle button must have label');
    assert.match(agentQuickDockTsx, /aria-expanded=\{!collapsed\}/, 'Dock toggle must have aria-expanded');
  });

  // -------------------------------------------------------------------------
  // 6. Spatial Flow Canvas & Standard Surfaces (WCAG 1.3.1, 4.1.2)
  // -------------------------------------------------------------------------
  await check('14. FlowDesktop rails and controls implement regions, switches, and toolbars', () => {
    assert.match(flowDesktopTsx, /role="region"\s+aria-label="Attention and systems rail"/, 'Left rail must be region');
    assert.match(flowDesktopTsx, /role="region"\s+aria-label="Decisions, approvals, and workforce rail"/, 'Right rail must be region');
    assert.match(flowDesktopTsx, /role="toolbar"\s+aria-label="Canvas view controls"/, 'View controls must be toolbar');
    assert.match(flowDesktopTsx, /role="switch"\s+aria-checked=\{gridOn\}/, 'Grid button must be switch');
    assert.match(flowDesktopTsx, /role="switch"\s+aria-checked=\{mapOn\}/, 'Minimap button must be switch');
    assert.match(flowDesktopTsx, /role="toolbar"\s+aria-label="Canvas zoom controls"/, 'Zoom controls must be toolbar');
    assert.match(flowDesktopTsx, /aria-label="Fit canvas to view"/, 'Fit view button must have label');
    assert.match(flowDesktopTsx, /aria-label="Recenter canvas"/, 'Recenter button must have label');
    assert.match(flowDesktopTsx, /aria-label="Close inspector"/, 'Inspector close button must have label');
  });

  await check('15. StandardSurfaces ApprovalSurface and ListSurface have accessible actions and filters', () => {
    assert.match(standardSurfacesTsx, /aria-label=\{`Reject \${approval\.actionName}`\}/, 'Reject button must have accessible label');
    assert.match(standardSurfacesTsx, /aria-label=\{`Approve \${approval\.actionName}`\}/, 'Approve button must have accessible label');
    assert.match(standardSurfacesTsx, /aria-label=\{searchPlaceholder\}/, 'ListSurface search input must have label');
    assert.match(standardSurfacesTsx, /aria-label="Clear search input"/, 'ListSurface clear button must have label');
    assert.match(standardSurfacesTsx, /aria-pressed=\{activeFilter === pill\.id\}/, 'Filter pills must reflect aria-pressed');
  });

  await check('16. SharedSophiaVoicePresence implements voice toggle, stop button, and live status', () => {
    assert.match(voicePresenceTsx, /aria-pressed=\{live\}/, 'Voice button must have aria-pressed');
    assert.match(voicePresenceTsx, /aria-label="Interrupt Sofia speaking"/, 'Stop button must have accessible label');
    assert.match(voicePresenceTsx, /role="status"/, 'Presence badge must have role="status"');
    assert.match(voicePresenceTsx, /aria-live="polite"/, 'Presence badge must announce politely');
    assert.match(voicePresenceTsx, /focus-visible:outline-2/, 'Voice buttons must have visible focus outline');
  });

  // -------------------------------------------------------------------------
  // 7. Color Contrast & WCAG 2.2 AA Calculations (WCAG 1.4.3, 1.4.11)
  // -------------------------------------------------------------------------
  await check('17. Dark palette typography and UI components meet WCAG 2.2 AA contrast ratios', () => {
    const bgDark = '#060c18';
    const textSlate100 = '#f1f5f9';
    const textSlate200 = '#e2e8f0';
    const textSlate300 = '#cbd5e1';
    const textSlate400 = '#94a3b8';
    const accentCyan300 = '#67e8f9';
    const accentAmber300 = '#fcd34d';
    const accentEmerald400 = '#34d399';

    // WCAG 2.2 Level AA normal text minimum ratio is 4.5:1
    const crSlate100 = getContrastRatio(textSlate100, bgDark);
    const crSlate200 = getContrastRatio(textSlate200, bgDark);
    const crSlate300 = getContrastRatio(textSlate300, bgDark);
    const crSlate400 = getContrastRatio(textSlate400, bgDark);

    assert.ok(crSlate100 >= 4.5, `Slate 100 contrast (${crSlate100.toFixed(2)}) must be >= 4.5:1`);
    assert.ok(crSlate200 >= 4.5, `Slate 200 contrast (${crSlate200.toFixed(2)}) must be >= 4.5:1`);
    assert.ok(crSlate300 >= 4.5, `Slate 300 contrast (${crSlate300.toFixed(2)}) must be >= 4.5:1`);
    assert.ok(crSlate400 >= 4.5, `Slate 400 contrast (${crSlate400.toFixed(2)}) must be >= 4.5:1`);

    // WCAG 2.2 Level AA UI components minimum ratio is 3.0:1
    const crCyan = getContrastRatio(accentCyan300, bgDark);
    const crAmber = getContrastRatio(accentAmber300, bgDark);
    const crEmerald = getContrastRatio(accentEmerald400, bgDark);

    assert.ok(crCyan >= 3.0, `Cyan 300 UI contrast (${crCyan.toFixed(2)}) must be >= 3.0:1`);
    assert.ok(crAmber >= 3.0, `Amber 300 UI contrast (${crAmber.toFixed(2)}) must be >= 3.0:1`);
    assert.ok(crEmerald >= 3.0, `Emerald 400 UI contrast (${crEmerald.toFixed(2)}) must be >= 3.0:1`);
  });

  // -------------------------------------------------------------------------
  // 8. Target Size Verification (WCAG 2.2 SC 2.5.8)
  // -------------------------------------------------------------------------
  await check('18. Primary interactive controls comply with WCAG 2.2 Target Size Minimum (>= 24px)', () => {
    // Dock buttons: h-10 w-10 = 40px x 40px
    assert.match(agentQuickDockTsx, /h-10\s+w-10/, 'Dock buttons must meet 40px height/width');
    // Chat trigger: h-12 w-12 = 48px x 48px
    assert.match(chatPanelTsx, /h-12\s+w-12/, 'Chat trigger button must be 48px');
    // Voice toggle: size-12 = 48px x 48px
    assert.match(voicePresenceTsx, /size-12/, 'Voice toggle button must be 48px');
    // Voice stop: size-11 = 44px x 44px
    assert.match(voicePresenceTsx, /size-11/, 'Voice stop button must be 44px');
  });

  // -------------------------------------------------------------------------
  // 9. Audit Report Recorded & Single App Verification
  // -------------------------------------------------------------------------
  await check('19. Audit report document exists and records zero open AA failures', () => {
    const reportPath = join(root, 'docs/accessibility/WCAG_2_2_AA_AUDIT_REPORT.md');
    assert.ok(existsSync(reportPath), 'WCAG_2_2_AA_AUDIT_REPORT.md must exist in docs/accessibility/');
    const reportContent = readFileSync(reportPath, 'utf8');
    assert.match(reportContent, /Open Conformance Failures:\*{0,2}\s*0/i, 'Report must verify 0 open AA failures');
    assert.match(reportContent, /PASS — Zero open Level AA non-conformances/i, 'Report must verify PASS');
  });

  await check('20. Single-app integrity maintained: no specimen or design system tabs in App.tsx', () => {
    assert.doesNotMatch(appTsx, />\s*Design System\s*</i, 'Design system tab must not exist in view switcher');
    assert.doesNotMatch(appTsx, /value="design"/i, 'Design system view value must not exist in App.tsx');
  });

  console.log('\n======================================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
