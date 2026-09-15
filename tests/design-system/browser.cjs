const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const URL = process.env.PREVIEW_URL || 'http://127.0.0.1:3000';

(async () => {
  fs.mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  const board = page.locator('[data-execution-board="workflow / sequence"]');
  await board.scrollIntoViewIfNeeded();
  await board.getByRole('button', { name: 'Replay execution' }).click();
  await board.getByRole('button', { name: 'pause', exact: true }).click();
  const step = board.getByRole('button', { name: 'Advance execution by 300 milliseconds' });
  const advance = async n => { for (let i = 0; i < n; i++) await step.click(); };
  await advance(4);
  assert.equal(await board.locator('[data-workflow-node="tg"]').getAttribute('data-phase'), 'igniting');
  const canvas = board.locator('[data-fluid-canvas]');
  const pixelCount = () => canvas.evaluate(el => {
    const rgba = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    let count = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) count++;
    return count;
  });
  assert.ok(await pixelCount() > 70, 'filled outline must be visible');
  await board.screenshot({ path: 'artifacts/ignition-split-fill.png' });

  // Pause freezes the execution clock, including particle lifetimes.
  const paused = await canvas.evaluate(el => el.toDataURL());
  await page.waitForTimeout(350);
  assert.equal(await canvas.evaluate(el => el.toDataURL()), paused);

  // Every socket is seated on an actual DOM outline, to sub-pixel tolerance.
  const alignment = await board.evaluate(el => {
    const outlines = [...el.querySelectorAll('[data-outline]')];
    const sockets = [...el.querySelectorAll('[data-port-x]')];
    let worst = 0;
    for (const socket of sockets) {
      const p = new DOMPoint(Number(socket.dataset.portX), Number(socket.dataset.portY)).matrixTransform(socket.getScreenCTM());
      let nearest = Infinity;
      for (const outline of outlines) {
        const length = outline.getTotalLength(), transform = outline.getScreenCTM();
        for (let distance = 0; distance <= length; distance += .5) {
          const q = outline.getPointAtLength(distance).matrixTransform(transform);
          nearest = Math.min(nearest, Math.hypot(q.x - p.x, q.y - p.y));
        }
      }
      worst = Math.max(worst, nearest);
    }
    return { worst, sockets: sockets.length };
  });
  assert.ok(alignment.sockets >= 8);
  assert.ok(alignment.worst < .8, `port alignment drift: ${alignment.worst}`);

  await advance(5);
  assert.equal(await board.locator('[data-edge-id="b1"]').getAttribute('data-edge-phase'), 'filling');
  await board.screenshot({ path: 'artifacts/ignition-pipe-fill.png' });
  const neutralStrokes = await board.locator('[data-edge-id]').evaluateAll(paths => paths.every(p => p.getAttribute('stroke') === '#3a4358'));
  assert.equal(neutralStrokes, true, 'base material never becomes permanently colored');

  // Complete a whole dependency-driven branch / join execution.
  let attempts = 0;
  while (await board.locator('[data-workflow-node="done"]').getAttribute('data-phase') !== 'success') {
    await advance(1);
    if (++attempts > 70) throw new Error('Workflow failed to complete and settle');
  }
  await advance(3);
  assert.equal(await pixelCount(), 0, 'all fire must drain and clear before replay');
  assert.ok((await board.locator('[data-edge-id]').evaluateAll(paths => paths.every(p => p.dataset.edgePhase === 'idle'))));
  await board.screenshot({ path: 'artifacts/ignition-settled.png' });

  await board.locator('[data-workflow-node="agent"]').click();
  assert.ok(await board.getByText('inspector', { exact: true }).isVisible());
  await board.getByRole('button', { name: 'Close inspector' }).click();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(URL, { waitUntil: 'networkidle' });
  const mobileBoard = mobile.locator('[data-execution-board="workflow / sequence"]');
  await mobileBoard.scrollIntoViewIfNeeded();
  const mobileLayout = await mobile.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(mobileLayout.scroll <= mobileLayout.width + 1, 'page must not overflow on mobile');
  await mobileBoard.screenshot({ path: 'artifacts/ignition-mobile.png' });

  const reduced = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  reduced.on('pageerror', error => errors.push(error.message));
  await reduced.goto(URL, { waitUntil: 'networkidle' });
  const reducedBoard = reduced.locator('[data-execution-board="workflow / sequence"]');
  await reducedBoard.scrollIntoViewIfNeeded();
  assert.ok(await reducedBoard.getByRole('button', { name: 'play', exact: true }).isVisible());
  assert.equal(await reducedBoard.locator('[data-workflow-node="tg"]').getAttribute('data-phase'), 'idle');
  assert.deepEqual(errors, [], 'no hydration or runtime errors');
  console.log(JSON.stringify({ result: 'PASS', socketCount: alignment.sockets, maximumPortErrorPx: alignment.worst, mobileLayout, checks: ['split-outline fill', 'causal comet handoff', 'drain to zero', 'pause', 'port alignment', 'inspector', 'responsive layout', 'reduced motion', 'no browser errors'] }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
