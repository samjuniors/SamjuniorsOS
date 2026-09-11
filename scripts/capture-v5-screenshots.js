const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\User_S\\.gemini\\antigravity-ide\\brain\\c0067367-e875-4854-8196-da45c682d35d';
const TARGET_URL = 'file:///E:/Projects/SamjuniorsProducts/SamjuniorsOS/public/prototype/v5/index.html';
const PORT = 9556;

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
  console.log('Launching headless Chrome for Core V5 visual capture...');
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
        targets = await httpGetJson(`http://127.0.0.1:${PORT}/json/list`);
        if (targets && targets.length > 0) break;
      } catch (e) {
        await sleep(200);
      }
    }

    if (!targets || targets.length === 0) {
      throw new Error('Chrome did not expose CDP target in time');
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.ready();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.setViewport(1600, 1000);

    await sleep(1500); // Allow Core canvas to warm up

    // 1. STATE A: READY / IDLE
    console.log('Capturing State A: Ready / Idle...');
    await client.evaluate(`(() => {
      window.__v5.setCoreState('ready');
      window.__v5.speak("Good afternoon, Sam. All systems are operating smoothly. What would you like to focus on today?");
      window.__v5.collapseEventSurface();
      window.__v5.closeOsDrawer();
    })()`);
    await sleep(600);
    await client.captureScreenshot('v5_state_a_ready.png');

    // 2. STATE B: ACTIVE WORK
    console.log('Capturing State B: Active Work...');
    await client.evaluate(`(() => {
      window.__v5.handleFounderIntent("Review market positioning");
    })()`);
    await sleep(1200);
    await client.captureScreenshot('v5_state_b_active_work.png');

    // 3. STATE C: FOUNDER DECISION REQUIRED
    console.log('Capturing State C: Founder Decision Required...');
    await client.evaluate(`(() => {
      window.__v5.setCoreState('waiting_for_founder');
      window.__v5.speak("I've completed the positioning synthesis. Because this alters external brand messaging, authenticated founder authority is required.");
      window.__v5.expandEventPane(document.getElementById('paneDecision'));
    })()`);
    await sleep(800);
    await client.captureScreenshot('v5_state_c_decision_required.png');

    // 4. STATE D: OUTCOME
    console.log('Capturing State D: Outcome...');
    await client.evaluate(`(() => {
      window.__v5.setCoreState('completed');
      window.__v5.speak("Positioning update ratified and archived to Company Memory. All systems updated.");
      window.__v5.expandEventPane(document.getElementById('paneCompleted'));
    })()`);
    await sleep(800);
    await client.captureScreenshot('v5_state_d_outcome.png');

    // 5. STATE E: OS DRAWER / MANUAL MODE
    console.log('Capturing State E: OS Slide-Over Drawer...');
    await client.evaluate(`(() => {
      window.__v5.openOsDrawerTab('company');
    })()`);
    await sleep(600);
    await client.captureScreenshot('v5_state_e_os_drawer.png');

    // 6. STATE F: PROVENANCE MODAL
    console.log('Capturing State F: Provenance Modal...');
    await client.evaluate(`(() => {
      window.__v5.closeOsDrawer();
      document.getElementById('provenanceModal').hidden = false;
    })()`);
    await sleep(600);
    await client.captureScreenshot('v5_state_f_provenance.png');

    // 7. STATE G: MOBILE VIEWPORT
    console.log('Capturing State G: Mobile Layout...');
    await client.evaluate(`(() => {
      document.getElementById('provenanceModal').hidden = true;
      window.__v5.setCoreState('ready');
      window.__v5.collapseEventSurface();
    })()`);
    await client.setViewport(390, 844);
    await sleep(800);
    await client.captureScreenshot('v5_state_g_mobile.png');

    console.log('All Core V5 screenshots captured successfully!');
  } finally {
    try {
      chrome.kill('SIGKILL');
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
