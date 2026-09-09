const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\User_S\\.gemini\\antigravity-ide\\brain\\c0067367-e875-4854-8196-da45c682d35d';
const TARGET_URL = 'file:///E:/Projects/SamjuniorsProducts/SamjuniorsOS/public/prototype/v4/index.html';
const PORT = 9555;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse JSON: ' + data)); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) cb.reject(new Error(msg.error.message));
        else cb.resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res && res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails);
    }
    return res && res.result ? res.result.value : undefined;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    console.log(`✓ Saved screenshot: ${filename} (${buffer.length} bytes)`);
    return fullPath;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700
    });
  }
}

async function main() {
  console.log('Launching headless Chrome for V4.1 visual capture...');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,1000',
    TARGET_URL
  ]);

  try {
    let targets = null;
    for (let i = 0; i < 25; i++) {
      try {
        const list = await httpGetJson(`http://127.0.0.1:${PORT}/json/list`);
        const pageTarget = list.find(t => t.type === 'page' && t.url.includes('prototype/v4/index.html'));
        if (pageTarget) {
          targets = pageTarget;
          break;
        }
      } catch (e) {
        // wait
      }
      await sleep(200);
    }
    if (!targets) throw new Error('Could not find target page in Chrome');

    console.log('Connected to target page:', targets.title);
    const cdp = new CDPClient(targets.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('Waiting for canvas starfield & orb initialization...');
    await sleep(2500);

    await cdp.setViewport(1600, 1000);

    // State A: READY / IDLE
    console.log('Capturing State A: READY / IDLE...');
    await cdp.evaluate(`(() => {
      window.location.hash = '';
      document.body.className = 'mode-jarvis state-ready credits-available';
      if (window.__v4) {
        window.__v4.setCoreState('ready', false);
        window.__v4.renderAll();
      }
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_a_ready.png');

    // State B: UNDERSTANDING
    console.log('Capturing State B: UNDERSTANDING...');
    await cdp.evaluate(`(() => {
      const input = document.getElementById('commandInput');
      input.value = 'Review what changed in the company.';
      const form = document.getElementById('commandForm');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_b_understanding.png');

    // State C: ACTIVE WORK
    console.log('Capturing State C: ACTIVE WORK...');
    await sleep(1600);
    await cdp.evaluate(`(() => {
      if (window.__v4) {
        const t = window.__v4.WorkEngine.activeThread();
        if (t) {
          t.status = 'researching';
          t.evidence.sources = 4;
          t.evidence.verified = 2;
          t.evidence.pending = 1;
        }
        window.__v4.setCoreState('working', false);
        window.__v4.renderAll();
      }
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_c_active_work.png');

    // State D: WHAT MATTERS NOW / ATTENTION REQUIRED
    console.log('Capturing State D: WHAT MATTERS NOW / ATTENTION REQUIRED...');
    await cdp.evaluate(`(() => {
      if (window.__v4) {
        const t = window.__v4.WorkEngine.activeThread() || window.__v4.WorkEngine.threads[0];
        if (t) {
          t.status = 'awaiting';
          t.decision = {
            title: 'Positioning update confirmation',
            prepared: 'Positioning strategy recommendation',
            reason: 'This action has strategic market consequences. Requires founder approval before publishing.',
            recommendation: 'Approve recommendation'
          };
          window.__v4.WorkEngine.decisionRecords.push({
            id: 'dec-' + Date.now(),
            threadId: t.id,
            title: t.decision.title,
            prepared: t.decision.prepared,
            reason: t.decision.reason,
            recommendation: t.decision.recommendation,
            status: 'pending',
            createdAt: Date.now()
          });
        }
        window.__v4.setCoreState('waiting_for_founder', false);
        window.__v4.renderAll();
      }
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_d_attention_required.png');

    // State E: FOUNDER DECISION REQUIRED
    console.log('Capturing State E: FOUNDER DECISION REQUIRED...');
    await sleep(400);
    await cdp.captureScreenshot('v4_1_state_e_decision_required.png');

    // State F: EXECUTING
    console.log('Capturing State F: EXECUTING...');
    await cdp.evaluate(`(() => {
      if (window.__v4) {
        const t = window.__v4.WorkEngine.activeThread() || window.__v4.WorkEngine.threads[0];
        if (t) t.status = 'executing';
        window.__v4.setCoreState('executing', false);
        window.__v4.renderAll();
      }
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_f_executing.png');

    // State G: COMPLETED / OUTCOME
    console.log('Capturing State G: COMPLETED / OUTCOME...');
    await cdp.evaluate(`(() => {
      if (window.__v4) {
        const t = window.__v4.WorkEngine.activeThread() || window.__v4.WorkEngine.threads[0];
        if (t) {
          t.status = 'completed';
          t.outcome = 'Positioning review completed. Strategic recommendation prepared with 4 evaluated sources.';
          t.outcomeShown = t.outcome;
        }
        window.__v4.setCoreState('completed', false);
        window.__v4.renderAll();
      }
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_g_completed.png');

    // State H: PROVENANCE
    console.log('Capturing State H: PROVENANCE...');
    await cdp.evaluate(`document.getElementById('btnOutcomeProvenance').click();`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_h_provenance.png');
    await cdp.evaluate(`document.getElementById('btnCloseAudit').click();`);
    await sleep(300);

    // State I: MANUAL MODE
    console.log('Capturing State I: MANUAL MODE...');
    await cdp.evaluate(`document.getElementById('btnManualMode').click();`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_i_manual_mode.png');
    await cdp.evaluate(`document.getElementById('btnJarvisMode').click();`);
    await sleep(300);

    // State J: MESSENGER OPEN
    console.log('Capturing State J: MESSENGER OPEN...');
    await cdp.evaluate(`document.getElementById('btnOpenMessenger').click();`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_state_j_messenger.png');
    await cdp.evaluate(`document.getElementById('btnCloseMessenger').click();`);
    await sleep(300);

    // Expanded Milestones & Details view
    console.log('Capturing Expanded Milestones Context...');
    await cdp.evaluate(`(() => {
      if (window.__v4) {
        const t = window.__v4.WorkEngine.activeThread() || window.__v4.WorkEngine.threads[0];
        if (t) {
          t.status = 'researching';
          window.__v4.setCoreState('working', false);
          window.__v4.renderAll();
        }
      }
      const disclosure = document.getElementById('workDetailsDisclosure');
      if (disclosure) disclosure.open = true;
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_expanded_milestones.png');

    // Minimal Core View
    console.log('Capturing Minimal Core View...');
    await cdp.evaluate(`(() => {
      const resetBtn = document.getElementById('btnResetDemo');
      if (resetBtn) resetBtn.click();
    })()`);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_minimal_core.png');

    // Mobile Screenshot (420x900)
    console.log('Capturing Mobile View (420x900)...');
    await cdp.setViewport(420, 900);
    await sleep(600);
    await cdp.captureScreenshot('v4_1_mobile.png');

    console.log('\n🎉 All requested V4.1 screenshots captured successfully in artifact directory!');
  } finally {
    chrome.kill();
  }
}

main().catch(err => {
  console.error('Fatal error capturing screenshots:', err);
  process.exit(1);
});
