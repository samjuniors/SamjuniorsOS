const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const DESKTOP_AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
const PORT = process.env.PORT || '3000';
const HOST = '127.0.0.1';

// Single-instance application lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function pollServerReady(port, token, timeoutMs = 25000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(
        {
          host: HOST,
          port: parseInt(port, 10),
          path: '/api/health',
          headers: { 'X-Desktop-Token': token }
        },
        (res) => {
          if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 401) {
            resolve();
          } else {
            retry();
          }
        }
      );
      req.on('error', retry);
      req.end();
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Timed out waiting for embedded Express server'));
      } else {
        setTimeout(check, 350);
      }
    };

    check();
  });
}

function startServer() {
  const rootDir = path.resolve(__dirname, '..');
  const serverScript = path.join(rootDir, 'server.ts');
  const isDev = !app.isPackaged;

  const env = {
    ...process.env,
    PORT: String(PORT),
    HOST: HOST,
    NODE_ENV: isDev ? 'development' : 'production',
    DESKTOP_AUTH_TOKEN: DESKTOP_AUTH_TOKEN
  };

  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  serverProcess = spawn(process.execPath, [tsxCli, serverScript], {
    env,
    stdio: 'inherit',
    cwd: rootDir
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Electron] Embedded Express server exited with code ${code}`);
    if (!app.isQuitting) {
      app.quit();
    }
  });
}

function createWindow() {
  // Enforce Content-Security-Policy on headers received
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: blob: https:; " +
          "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://generativelanguage.googleapis.com; " +
          "media-src 'self' blob: data:;"
        ]
      }
    });
  });

  // Automatically attach per-launch desktop token to local loopback requests from renderer
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const parsedUrl = new URL(details.url);
      if (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost') {
        details.requestHeaders['X-Desktop-Token'] = DESKTOP_AUTH_TOKEN;
      }
    } catch {
      // ignore
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SamJuniorsOS — Sofia',
    backgroundColor: '#0a0a0c',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}/`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('desktop:get-token', () => DESKTOP_AUTH_TOKEN);
ipcMain.handle('desktop:get-config', () => ({
  port: PORT,
  host: HOST,
  isPackaged: app.isPackaged
}));

app.whenReady().then(async () => {
  startServer();
  try {
    await pollServerReady(PORT, DESKTOP_AUTH_TOKEN);
  } catch (err) {
    console.warn('[Electron] Server poll warning:', err.message);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
});
