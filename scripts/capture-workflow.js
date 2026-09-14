const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function capture() {
  console.log('Launching browser via Playwright (channel: chrome)...');
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  } catch (e1) {
    console.log('Chrome channel failed, trying msedge:', e1.message);
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    } catch (e2) {
      console.log('Msedge channel failed, trying default bundled chromium:', e2.message);
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000/design-system/workflow...');
  await page.goto('http://localhost:3000/design-system/workflow', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for canvas animations, DOF blur, and cards to settle
  console.log('Waiting for layout hydration and animations...');
  await page.waitForTimeout(3000);

  const totalHeight = await page.evaluate(() => {
    const el = document.querySelector('.overflow-y-auto');
    return el ? el.scrollHeight : document.body.scrollHeight;
  });
  console.log(`Measured full page height: ${totalHeight}px`);
  await page.setViewportSize({ width: 1920, height: totalHeight + 80 });
  await page.waitForTimeout(2000);

  const artifactDir = path.resolve('C:/Users/User_S/.gemini/antigravity-ide/brain/a04cb2cb-ca54-4c74-9906-37d6b3d7499a');
  const artifactPath = path.join(artifactDir, 'workflow_fullpage_screenshot.png');
  const localPath = path.resolve('workflow_fullpage_screenshot.png');

  console.log(`Capturing full page screenshot to ${localPath}...`);
  await page.screenshot({ path: localPath, fullPage: true });

  try {
    fs.copyFileSync(localPath, artifactPath);
    console.log(`Copied screenshot to artifact directory: ${artifactPath}`);
  } catch (err) {
    console.warn('Could not copy to artifactDir:', err.message);
  }

  console.log('Screenshot capture complete!');
  await browser.close();
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
