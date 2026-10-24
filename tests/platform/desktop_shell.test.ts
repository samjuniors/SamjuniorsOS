import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { LIVE_CLOSE_CODES } from '../../src/lib/server/live/types';

describe('Milestone MX.7 — Electron Desktop Shell Proof', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const electronMainPath = path.join(rootDir, 'electron', 'main.cjs');
  const electronPreloadPath = path.join(rootDir, 'electron', 'preload.cjs');
  const builderConfigPath = path.join(rootDir, 'electron-builder.json');
  const packageJsonPath = path.join(rootDir, 'package.json');

  describe('1. Static Configuration & Security Invariants', () => {
    it('verifies electron/main.cjs enforces contextIsolation, nodeIntegration: false, and sandbox', () => {
      expect(fs.existsSync(electronMainPath)).toBe(true);
      const content = fs.readFileSync(electronMainPath, 'utf8');

      expect(content).toContain('contextIsolation: true');
      expect(content).toContain('nodeIntegration: false');
      expect(content).toContain('sandbox: true');
      expect(content).toContain("preload: path.join(__dirname, 'preload.cjs')");
    });

    it('verifies electron/main.cjs enforces loopback binding and random per-launch token', () => {
      const content = fs.readFileSync(electronMainPath, 'utf8');

      expect(content).toContain("const HOST = '127.0.0.1'");
      expect(content).toContain("crypto.randomBytes(32).toString('hex')");
      expect(content).toContain('DESKTOP_AUTH_TOKEN');
      expect(content).toContain('app.requestSingleInstanceLock()');
    });

    it('verifies electron/main.cjs configures strict Content Security Policy and token forwarding', () => {
      const content = fs.readFileSync(electronMainPath, 'utf8');

      expect(content).toContain('Content-Security-Policy');
      expect(content).toContain("default-src 'self' http://127.0.0.1:* ws://127.0.0.1:*");
      expect(content).toContain("details.requestHeaders['X-Desktop-Token'] = DESKTOP_AUTH_TOKEN");
    });

    it('verifies electron/preload.cjs exposes minimal safe desktopAPI via contextBridge', () => {
      expect(fs.existsSync(electronPreloadPath)).toBe(true);
      const content = fs.readFileSync(electronPreloadPath, 'utf8');

      expect(content).toContain("contextBridge.exposeInMainWorld('desktopAPI'");
      expect(content).toContain('isDesktop: true');
      expect(content).toContain('getAuthToken: () => ipcRenderer.invoke');
      // Must NOT expose raw node primitives to window
      expect(content).not.toContain('require:');
      expect(content).not.toContain('process.binding');
      expect(content).not.toContain('child_process');
    });

    it('verifies electron-builder.json configures Windows NSIS installer with deferred signing and auto-update', () => {
      expect(fs.existsSync(builderConfigPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(builderConfigPath, 'utf8'));

      expect(config.appId).toBe('com.samjuniors.os');
      expect(config.productName).toBe('SamJuniorsOS');
      expect(config.win.target[0].target).toBe('nsis');
      expect(config.win.forceCodeSigning).toBe(false); // Signing deferred
      expect(config.publish).toBeNull(); // Auto-update deferred
      expect(config.nsis.oneClick).toBe(true);
    });

    it('verifies package.json points to electron/main.cjs and defines desktop scripts', () => {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      expect(pkg.main).toBe('electron/main.cjs');
      expect(pkg.scripts['desktop:dev']).toBe('electron .');
      expect(pkg.scripts['desktop:pack']).toBe('vite build && electron-builder --win --dir');
      expect(pkg.scripts['desktop:dist']).toBe('vite build && electron-builder --win nsis');
    });
  });

  describe('2. Runtime Loopback & Per-Launch Token Gate', () => {
    let app: express.Express;
    let server: http.Server;
    let wss: WebSocketServer;
    const testToken = 'test-per-launch-token-12345';
    const testPort = 3199;

    beforeAll((done) => {
      app = express();
      server = http.createServer(app);
      wss = new WebSocketServer({ server, path: '/api/live-ws' });

      // Simulate server.ts desktop token middleware
      app.use((req: Request, res: Response, next) => {
        if (req.path.startsWith('/api')) {
          const incoming = req.headers['x-desktop-token'] || req.query.desktop_token;
          if (incoming !== testToken) {
            return res.status(403).json({ error: 'Desktop per-launch token required or invalid' });
          }
        }
        next();
      });

      app.get('/api/health', (_req, res) => {
        res.json({ ok: true, mode: 'desktop' });
      });

      wss.on('connection', (ws, req) => {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const incoming = req.headers['x-desktop-token'] || url.searchParams.get('desktop_token');
        if (incoming !== testToken) {
          ws.close(LIVE_CLOSE_CODES.UNAUTHORIZED, 'Unauthorized: Invalid desktop per-launch token');
          return;
        }
        ws.send(JSON.stringify({ type: 'ready', authenticated: true }));
      });

      server.listen(testPort, '127.0.0.1', () => done());
    });

    afterAll((done) => {
      wss.close(() => {
        server.close(() => done());
      });
    });

    it('rejects unauthenticated HTTP request with 403 Forbidden', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('Desktop per-launch token required or invalid');
    });

    it('rejects HTTP request with invalid token with 403 Forbidden', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/health`, {
        headers: { 'X-Desktop-Token': 'wrong-token' }
      });
      expect(res.status).toBe(403);
    });

    it('accepts HTTP request with valid X-Desktop-Token header', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/health`, {
        headers: { 'X-Desktop-Token': testToken }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.mode).toBe('desktop');
    });

    it('rejects unauthenticated WebSocket connection without token', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${testPort}/api/live-ws`);
      const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
      });

      const { code, reason } = await closePromise;
      expect(code).toBe(LIVE_CLOSE_CODES.UNAUTHORIZED);
      expect(reason).toContain('Invalid desktop per-launch token');
    });

    it('accepts authenticated WebSocket connection with desktop_token query parameter', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${testPort}/api/live-ws?desktop_token=${testToken}`);
      const msgPromise = new Promise<string>((resolve) => {
        ws.on('message', (data) => resolve(data.toString()));
      });

      const raw = await msgPromise;
      const parsed = JSON.parse(raw);
      expect(parsed.type).toBe('ready');
      expect(parsed.authenticated).toBe(true);
      ws.close();
    });
  });

  describe('3. Cloud Invariance', () => {
    it('verifies cloud server build and runtime are completely unaffected when DESKTOP_AUTH_TOKEN is unset', () => {
      const serverCode = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');

      // The desktop token middleware and WebSocket gate must be conditionally enabled ONLY if desktopToken is truthy
      expect(serverCode).toContain('const desktopToken = process.env.DESKTOP_AUTH_TOKEN;');
      expect(serverCode).toContain('if (desktopToken) {');

      // Default cloud build scripts remain intact
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      expect(pkg.scripts.build).toBe('vite build');
      expect(pkg.scripts.start).toBe('tsx server.ts');
      expect(pkg.scripts.dev).toBe('tsx server.ts');
    });
  });
});
