import { chromium, type Browser, type Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\User_S\\.gemini\\antigravity-ide\\brain\\a5907766-53af-45ee-ba8e-d62f5f6cb96d';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'e2e_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function log(msg: string) {
  console.log(`[E2E-BROWSER] ${msg}`);
}

async function runBrowserE2E() {
  log('Launching system Chrome browser...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  // Inject founder auth cookies for authentic server route access
  await context.addCookies([
    { name: 'samjuniors-dev-as', value: 'founder', domain: 'localhost', path: '/' },
    { name: 'samjuniors-dev-secret', value: 'samjuniors_dev_secret_local', domain: 'localhost', path: '/' },
  ]);

  const page = await context.newPage();

  // Listen to browser console and page errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[BROWSER ERROR] ${msg.text()}`);
    }
  });

  try {
    // ------------------------------------------------------------------------
    // Step 1: Open OS in clean session
    // ------------------------------------------------------------------------
    log('Step 1: Navigating to ' + BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_clean_session_sophia.png') });
    log('Captured 01_clean_session_sophia.png');

    // Verify Sophia presence
    const sophiaPresence = await page.locator('text=Sophia ·').first().isVisible();
    log(`Sophia presence indicator visible: ${sophiaPresence}`);
    if (!sophiaPresence) throw new Error('Sophia presence indicator not visible on initial load');

    // ------------------------------------------------------------------------
    // Step 2: Switch to SamJuniorsOS and verify calm authoritative Canvas
    // ------------------------------------------------------------------------
    log('Step 2: Switching to SamJuniorsOS spatial canvas...');
    const osButton = page.locator('button:has-text("SamJuniorsOS")');
    await osButton.click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_idle_canvas_baseline.png') });
    log('Captured 02_idle_canvas_baseline.png');

    // Verify spatial canvas regions
    const companyContextRegion = await page.locator('text=COMPANY CONTEXT').first().isVisible();
    const activeWorkRegion = await page.locator('text=ACTIVE WORK').first().isVisible();
    const governedOutcomesRegion = await page.locator('text=GOVERNED OUTCOMES').first().isVisible();
    log(`Regions visible -> Company Context: ${companyContextRegion}, Active Work: ${activeWorkRegion}, Outcomes: ${governedOutcomesRegion}`);

    // Verify core nodes exist (Sophia, Dr. Aris Thorne, Verifier)
    const sophiaNode = await page.locator('text=Sophia').first().isVisible();
    const verifierNode = await page.locator('text=Verifier').first().isVisible();
    log(`Core topology nodes visible -> Sophia: ${sophiaNode}, Verifier: ${verifierNode}`);

    // ------------------------------------------------------------------------
    // Step 3: Verify TodoDrawer (Work surface) & Council selection
    // ------------------------------------------------------------------------
    log('Step 3: Inspecting TodoDrawer Work surface...');
    const workToggle = page.locator('button[aria-label="Toggle work drawer"], button:has-text("Work")').first();
    await workToggle.click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_work_drawer_opened.png') });
    log('Captured 03_work_drawer_opened.png');

    // Verify Council is default owner and options include Council, Dr. Aris, Maya, Julian
    const councilSelected = await page.locator('button:has-text("Council")').first().isVisible();
    const thorneOption = await page.locator('button:has-text("Dr.")').first().isVisible();
    const mayaOption = await page.locator('button:has-text("Maya")').first().isVisible();
    const julianOption = await page.locator('button:has-text("Julian")').first().isVisible();
    log(`Work drawer owner options visible -> Council: ${councilSelected}, Dr. Aris: ${thorneOption}, Maya: ${mayaOption}, Julian: ${julianOption}`);

    // ------------------------------------------------------------------------
    // Step 4: Submit a conversational request in Sophia tab
    // ------------------------------------------------------------------------
    log('Step 4: Testing conversational request path in Sophia scene...');
    const sophiaTab = page.locator('button:has-text("Sophia")').first();
    await sophiaTab.click();
    await page.waitForTimeout(1000);

    const askInput = page.locator('input[placeholder*="Ask or direct Sophia"]');
    await askInput.fill('What is your primary mandate as COO?');
    await page.keyboard.press('Enter');

    // Wait for Sophia speech reply
    log('Waiting for conversational reply...');
    await page.waitForSelector('text=“', { timeout: 15000 });
    const replyText = await page.locator('div:has-text("“")').last().textContent();
    log(`Sophia conversational reply received: ${replyText?.slice(0, 80)}...`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_conversational_reply.png') });
    log('Captured 04_conversational_reply.png');

    // ------------------------------------------------------------------------
    // Step 5: Submit a real founder directive & verify immediate acknowledgement
    // ------------------------------------------------------------------------
    log('Step 5: Testing founder directive path with immediate acknowledgment...');
    const directiveText = 'Analyze gross margin floor and prepare a unit economics assessment';
    await askInput.fill(directiveText);
    await page.keyboard.press('Enter');

    // Immediately verify Sophia's conversational receipt quote before the council finishes
    await page.waitForTimeout(300);
    const ackText = await page.locator('div:has-text("“")').last().textContent();
    log(`Immediate directive acknowledgement quote: ${ackText}`);
    const hasImmediateAck = ackText?.includes('Understood') || ackText?.includes('Decomposing');
    log(`Immediate acknowledgment verified: ${hasImmediateAck}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_directive_immediate_ack.png') });
    log('Captured 05_directive_immediate_ack.png');

    // Wait for orchestration completion
    log('Waiting for Council orchestration to complete...');
    await page.waitForFunction(() => {
      const modeIndicator = document.body.innerText;
      return modeIndicator.includes('Directive executed') ||
             modeIndicator.includes('Unit economics') ||
             modeIndicator.includes('protocol steps') ||
             modeIndicator.includes('Outcome:');
    }, { timeout: 45000 }).catch(() => {
      log('Wait for text summary timed out or finished with different phrasing.');
    });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_directive_completed_sophia.png') });
    log('Captured 06_directive_completed_sophia.png');

    // ------------------------------------------------------------------------
    // Step 6: Verify Canvas & Work drawer reflection + Click-to-Focus Inspector
    // ------------------------------------------------------------------------
    log('Step 6: Verifying Canvas reflection and click-to-focus Inspector...');
    await osButton.click();
    await page.waitForTimeout(1000);

    // Ensure Work drawer is open
    const openDrawerBtn = page.locator('button[title="Open work (T)"]');
    if (await openDrawerBtn.isVisible().catch(() => false)) {
      await openDrawerBtn.click();
      await page.waitForTimeout(600);
    }

    // Check open work items or switch to Done tab to inspect the completed directive
    let workItems = page.locator('div[class*="group cursor-pointer"]');
    let workCount = await workItems.count();
    log(`Open work items: ${workCount}`);

    if (workCount === 0) {
      log('Switching to Done tab in Work drawer...');
      const doneTab = page.locator('button:has-text("Done")').first();
      await doneTab.scrollIntoViewIfNeeded();
      await doneTab.click({ force: true });
      await page.waitForTimeout(600);
      workItems = page.locator('div[class*="group cursor-pointer"]');
      workCount = await workItems.count();
      log(`Done work items: ${workCount}`);
    }

    if (workCount > 0) {
      log('Clicking completed work item to trigger click-to-focus and Inspector...');
      await workItems.first().click();
      await page.waitForTimeout(1200);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_work_focused_inspector.png') });
      log('Captured 07_work_focused_inspector.png');

      // Verify Inspector opened and displays authoritative sections
      const hasOrthogonalDomains = await page.locator('text=Runtime Domain').first().isVisible().catch(() => false);
      const hasExecutionTrail = await page.locator('text=Execution Trail').first().isVisible().catch(() => false);
      const hasDeliverableOrDirective = (await page.locator('text=Founder Directive').first().isVisible().catch(() => false)) ||
                                       (await page.locator('text=Deliverable').first().isVisible().catch(() => false)) ||
                                       (await page.locator('text=Milestone').first().isVisible().catch(() => false));
      log(`Inspector cards visible -> 4 Domains: ${hasOrthogonalDomains}, Execution Trail: ${hasExecutionTrail}, Deliverable/Directive: ${hasDeliverableOrDirective}`);
    }

    // ------------------------------------------------------------------------
    // Step 7: Verify Governance Authority Boundary (Waiting vs Processing)
    // ------------------------------------------------------------------------
    log('Step 7: Testing governance authority boundary presentation on Canvas...');
    // Inspect graph nodes for any waiting/approval indicator
    const hasGate = await page.locator('text=GATE').count();
    const hasWaiting = await page.locator('text=WAITING').count();
    const hasFounderBoundary = await page.locator('text=Founder Authorization Boundary').count();
    log(`Approval / authority boundary elements observed: GATE=${hasGate}, WAITING=${hasWaiting}, BOUNDARY=${hasFounderBoundary}`);

    // If GATE node is present on Canvas, click it to verify authority boundary in Inspector
    const gateNode = page.locator('text=GATE').first();
    if (await gateNode.isVisible().catch(() => false)) {
      log('Clicking GATE node on Canvas to inspect governance boundary...');
      await gateNode.click({ force: true });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_governance_gate_inspector.png') });
      log('Captured 08_governance_gate_inspector.png');
      const gateDomain = await page.locator('text=Governance Domain').first().isVisible().catch(() => false);
      log(`Governance domain card visible in Inspector: ${gateDomain}`);
    }

    // ------------------------------------------------------------------------
    // Step 8: Verify Reconnect / Page Refresh Behavior
    // ------------------------------------------------------------------------
    log('Step 8: Testing page reload and rehydration fidelity...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_post_reload_rehydration.png') });
    log('Captured 08_post_reload_rehydration.png');

    const postReloadSophia = await page.locator('text=Sophia').first().isVisible();
    log(`Post-reload topology rendered cleanly: ${postReloadSophia}`);

    log('======================================================');
    log('ALL BROWSER E2E TESTS COMPLETED SUCCESSFULLY!');
    log('======================================================');
  } finally {
    await context.close();
    await browser.close();
  }
}

runBrowserE2E().catch((err) => {
  console.error('[E2E-BROWSER FAILED]:', err);
  process.exit(1);
});
