/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VS Code DevTools MCP — Browser/Connection Layer
 *
 * Replaces Chrome DevTools MCP's browser.ts with VS Code-specific logic:
 * 1. Computes the Host VS Code's bridge path deterministically from workspace path
 * 2. Allocates dynamic ports (CDP + Extension Host inspector) via get-port
 * 3. Spawns an Extension Development Host via child_process.spawn()
 * 4. Connects via raw CDP WebSocket to the page-level target
 *    (Puppeteer browser-level connect FAILS on Electron)
 * 5. Polls for workbench readiness (.monaco-workbench + document.readyState)
 * 6. Provides lifecycle management (cleanup on exit/crash)
 *
 * SINGLETON: Only one child VS Code instance at a time. If the server exits
 * for any reason (clean, SIGINT, SIGTERM, crash) the child is killed instantly.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn, execSync, type ChildProcess} from 'node:child_process';

import getPort from 'get-port';
import WebSocket from 'ws';

import {
  computeBridgePath,
  bridgeExec,
  bridgeAttachDebugger,
} from './bridge-client.js';
import {initCdpEventSubscriptions, clearAllData} from './cdp-events.js';
import {logger} from './logger.js';
import type {Browser, ConnectionTransport} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

// ── CDP Target Types ────────────────────────────────────

interface CdpTarget {
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  id: string;
}

interface CdpVersionInfo {
  Browser: string;
  [key: string]: unknown;
}

// ── Module State (singleton — max one child at a time) ──

let cdpWs: WebSocket | undefined;
let cdpPort: number | undefined;
let inspectorPort: number | undefined;
let hostBridgePath: string | undefined;
let devhostBridgePath: string | undefined;
let childProcess: ChildProcess | undefined;
let launcherPid: number | undefined;
let electronPid: number | undefined;
let userDataDir: string | undefined;
let connectInProgress: Promise<WebSocket> | undefined;
let connectionGeneration = 0;

export function getConnectionGeneration(): number {
  return connectionGeneration;
}

export function getUserDataDir(): string | undefined {
  return userDataDir;
}

// ── Raw CDP Communication ───────────────────────────────

let cdpMessageId = 0;

/**
 * Send a CDP command over the raw WebSocket and wait for the matching response.
 */
export function sendCdp(
  method: string,
  params: Record<string, unknown> = {},
  ws?: WebSocket,
): Promise<any> {
  const socket = ws ?? cdpWs;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(
      new Error('CDP WebSocket is not connected'),
    );
  }

  return new Promise((resolve, reject) => {
    const id = ++cdpMessageId;
    const handler = (evt: WebSocket.MessageEvent) => {
      const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
      const data = JSON.parse(raw);
      if (data.id === id) {
        socket.removeEventListener('message', handler);
        if (data.error) {
          reject(new Error(`CDP ${method}: ${data.error.message}`));
        } else {
          resolve(data.result);
        }
      }
    };
    socket.addEventListener('message', handler);
    socket.send(JSON.stringify({id, method, params}));
  });
}

// ── Puppeteer ElectronTransport ─────────────────────────

/**
 * Custom ConnectionTransport that bridges a raw CDP WebSocket to Puppeteer.
 *
 * Electron's DevTools protocol doesn't support several browser-management
 * commands that Puppeteer calls during connect (Target.getBrowserContexts,
 * Target.setDiscoverTargets, Target.setAutoAttach, Browser.getVersion).
 * This transport intercepts those calls and returns mock responses, while
 * forwarding all other CDP commands to the real WebSocket.
 *
 * Modeled after Puppeteer's own ExtensionTransport which solves the same
 * problem for Chrome extensions.
 */
class ElectronTransport implements ConnectionTransport {
  onmessage?: (message: string) => void;
  onclose?: () => void;

  #ws: WebSocket;
  #targetId: string;
  #targetUrl: string;
  #targetTitle: string;
  #versionInfo: CdpVersionInfo;
  #attached = false;

  constructor(ws: WebSocket, target: CdpTarget, versionInfo: CdpVersionInfo) {
    this.#ws = ws;
    this.#targetId = target.id;
    this.#targetUrl = target.url;
    this.#targetTitle = target.title;
    this.#versionInfo = versionInfo;

    // Forward real CDP messages from the WebSocket to Puppeteer.
    // Every command forwarded to the WS had its sessionId stripped (see send()),
    // so we must inject it back on ALL messages — both responses (have id) and
    // events (no id) — so Puppeteer routes them to the correct CDPSession.
    this.#ws.addEventListener('message', (evt: WebSocket.MessageEvent) => {
      const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
      const parsed = JSON.parse(raw);

      if (!parsed.sessionId) {
        parsed.sessionId = 'pageTargetSessionId';
      }

      this.onmessage?.(JSON.stringify(parsed));
    });

    this.#ws.addEventListener('close', () => {
      this.onclose?.();
    });
  }

  #dispatchResponse(message: object): void {
    setTimeout(() => {
      this.onmessage?.(JSON.stringify(message));
    }, 0);
  }

  send(message: string): void {
    const parsed = JSON.parse(message);

    switch (parsed.method) {
      case 'Browser.getVersion': {
        this.#dispatchResponse({
          id: parsed.id,
          sessionId: parsed.sessionId,
          method: parsed.method,
          result: {
            protocolVersion: '1.3',
            product: this.#versionInfo.Browser ?? 'Electron',
            revision: 'unknown',
            userAgent: (this.#versionInfo['User-Agent'] as string) ?? 'Electron',
            jsVersion: 'unknown',
          },
        });
        return;
      }
      case 'Target.getBrowserContexts': {
        this.#dispatchResponse({
          id: parsed.id,
          sessionId: parsed.sessionId,
          method: parsed.method,
          result: {
            browserContextIds: [],
          },
        });
        return;
      }
      case 'Target.setDiscoverTargets': {
        // Emit a single "page" target representing the VS Code workbench
        this.#dispatchResponse({
          method: 'Target.targetCreated',
          params: {
            targetInfo: {
              targetId: this.#targetId,
              type: 'page',
              title: this.#targetTitle,
              url: this.#targetUrl,
              attached: false,
              canAccessOpener: false,
            },
          },
        });
        this.#dispatchResponse({
          id: parsed.id,
          sessionId: parsed.sessionId,
          method: parsed.method,
          result: {},
        });
        return;
      }
      case 'Target.setAutoAttach': {
        // Only emit attachedToTarget on the FIRST call (browser-level connect).
        // Subsequent calls come from CDPSessions trying to auto-attach to
        // sub-targets (iframes, workers). Emitting attachedToTarget again would
        // create an infinite loop: new CDPSession → setAutoAttach → attachedToTarget → ...
        if (!this.#attached) {
          this.#attached = true;
          this.#dispatchResponse({
            method: 'Target.attachedToTarget',
            params: {
              targetInfo: {
                targetId: this.#targetId,
                type: 'page',
                title: this.#targetTitle,
                url: this.#targetUrl,
                attached: true,
                canAccessOpener: false,
              },
              sessionId: 'pageTargetSessionId',
            },
          });
        }
        this.#dispatchResponse({
          id: parsed.id,
          sessionId: parsed.sessionId,
          method: parsed.method,
          result: {},
        });
        return;
      }
    }

    // Strip the synthetic sessionId before forwarding to the real WebSocket.
    // Our page-level WS doesn't use sessions — Puppeteer adds them for routing.
    if (parsed.sessionId === 'pageTargetSessionId') {
      delete parsed.sessionId;
    }

    // Forward all other commands to the real CDP WebSocket
    if (this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(parsed));
    }
  }

  close(): void {
    // WebSocket lifecycle is managed externally — don't close it here
  }
}

// ── Puppeteer Browser (singleton) ───────────────────────

let puppeteerBrowser: Browser | undefined;

export function getPuppeteerBrowser(): Browser | undefined {
  return puppeteerBrowser;
}

// ── Public Getters ──────────────────────────────────────

export function getCdpWebSocket(): WebSocket | undefined {
  return cdpWs;
}

export function getCdpPort(): number | undefined {
  return cdpPort;
}

export function getHostBridgePath(): string | undefined {
  return hostBridgePath;
}

export function getDevhostBridgePath(): string | undefined {
  return devhostBridgePath;
}

export function isConnected(): boolean {
  return cdpWs?.readyState === WebSocket.OPEN;
}

// ── Port Polling ────────────────────────────────────────

async function waitForDebugPort(
  port: number,
  timeout = 30_000,
): Promise<CdpVersionInfo> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        return (await r.json()) as CdpVersionInfo;
      }
    } catch {
      // Port not ready
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `CDP port ${port} did not become available within ${timeout}ms.\n` +
      'Possible causes:\n' +
      '- Firewall blocking the port\n' +
      '- VS Code failed to start with debugging enabled\n' +
      '- Another process claimed the port before VS Code',
  );
}

async function waitForInspectorPort(
  port: number,
  timeout = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      if (r.ok) {
        return;
      }
    } catch {
      // Port not ready
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(
    `Inspector port ${port} did not become available within ${timeout}ms`,
  );
}

// ── PID Discovery ───────────────────────────────────────

/**
 * Discover the PID of the process listening on the given port.
 *
 * On Windows: uses `netstat -ano` to find LISTENING pid on the CDP port.
 * On Linux/macOS: uses `lsof -ti :port`.
 *
 * This is necessary because Code.exe on Windows is a launcher stub that
 * forks the real Electron binary and exits. The launcher PID is useless
 * for cleanup — we need the real Electron PID.
 */
async function discoverElectronPid(port: number): Promise<number | null> {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `netstat -ano | findstr "LISTENING" | findstr ":${port} "`,
        {encoding: 'utf8', timeout: 5000},
      ).trim();
      // Lines look like: TCP  127.0.0.1:44131  0.0.0.0:0  LISTENING  12345
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) return pid;
        }
      }
    } else {
      const out = execSync(`lsof -ti :${port}`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      const pid = parseInt(out.split('\n')[0], 10);
      if (pid > 0) return pid;
    }
  } catch {
    // Command failed — maybe no process or tool not available
  }
  return null;
}

// ── Target Discovery ────────────────────────────────────

/**
 * Query CDP /json/list and find the VS Code workbench page target.
 * Returns the page-level webSocketDebuggerUrl (NOT the browser endpoint).
 */
async function findWorkbenchTarget(port: number): Promise<CdpTarget> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = (await response.json()) as CdpTarget[];

  let workbench = targets.find(
    t => t.type === 'page' && t.title.includes('Visual Studio Code'),
  );

  if (!workbench) {
    workbench = targets.find(t => t.type === 'page');
    if (workbench) {
      logger(
        `No "Visual Studio Code" title found, using first page: "${workbench.title}"`,
      );
    }
  }

  if (!workbench) {
    throw new Error(
      `Could not find VS Code workbench target among ${targets.length} targets.\n` +
        `Available: ${targets.map(t => `${t.type}: ${t.title}`).join(', ')}\n` +
        'The debug window may have opened to an unexpected state.',
    );
  }

  return workbench;
}

// ── WebSocket Connection ────────────────────────────────

async function connectCdpWebSocket(wsUrl: string): Promise<WebSocket> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (err: WebSocket.ErrorEvent) =>
      reject(new Error(`CDP WebSocket error: ${err.message}`));
  });
  return ws;
}

// ── Workbench Readiness ─────────────────────────────────

async function waitForWorkbenchReady(
  ws: WebSocket,
  timeout = 30_000,
): Promise<void> {
  logger('Waiting for VS Code workbench to finish loading...');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await sendCdp(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const hasMonaco = !!document.querySelector('.monaco-workbench');
            const readyState = document.readyState;
            return JSON.stringify({ hasMonaco, readyState });
          })()`,
          returnByValue: true,
        },
        ws,
      );
      const state = JSON.parse(result.result.value);
      if (state.hasMonaco && state.readyState === 'complete') {
        logger('Workbench ready');
        // Now wait for Extension Host to finish initializing
        await waitForExtensionHostReady(ws, Math.max(10_000, timeout - (Date.now() - start)));
        return;
      }
      logger(
        `Not ready yet: hasMonaco=${state.hasMonaco}, readyState=${state.readyState}`,
      );
    } catch {
      // Page may not be ready for evaluate yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  logger('Warning: timed out waiting for workbench — proceeding anyway');
}

/**
 * Wait for Extension Host to finish initializing.
 * Checks for:
 * 1. No active progress indicators in the status bar
 * 2. No "Activating Extensions" window state
 * 3. Stable UI (no rapid DOM changes)
 */
async function waitForExtensionHostReady(
  ws: WebSocket,
  timeout = 8_000,
): Promise<void> {
  logger('Waiting for Extension Host to finish initializing...');
  const start = Date.now();
  let stableCount = 0;
  const requiredStableChecks = 2; // Need 2 consecutive stable checks (reduced for speed)

  while (Date.now() - start < timeout) {
    try {
      const result = await sendCdp(
        'Runtime.evaluate',
        {
          expression: `(() => {
            // Check for loading/progress indicators (excluding notification center)
            const progressContainers = document.querySelectorAll('.monaco-progress-container:not(.done)');
            // Filter out progress bars in notification center
            let hasProgress = false;
            for (const p of progressContainers) {
              if (!p.closest('.notifications-center, .notifications-toasts')) {
                hasProgress = true;
                break;
              }
            }
            
            // Check for spinning icons (loading state)
            const hasSpinner = !!document.querySelector('.codicon-loading, .codicon-sync-spin');
            
            // Check if status bar shows "activating" state
            const statusBar = document.querySelector('.statusbar');
            const statusText = statusBar?.textContent || '';
            const isActivating = statusText.toLowerCase().includes('activating');
            
            return JSON.stringify({
              hasProgress,
              hasSpinner,
              isActivating,
            });
          })()`,
          returnByValue: true,
        },
        ws,
      );
      const state = JSON.parse(result.result.value);
      const isStable = !state.hasProgress && !state.hasSpinner && !state.isActivating;
      
      if (isStable) {
        stableCount++;
        logger(`Extension Host appears stable (${stableCount}/${requiredStableChecks})`);
        if (stableCount >= requiredStableChecks) {
          logger('Extension Host ready');
          return;
        }
      } else {
        stableCount = 0;
        logger(
          `Extension Host still initializing: progress=${state.hasProgress}, spinner=${state.hasSpinner}, activating=${state.isActivating}`,
        );
      }
    } catch {
      stableCount = 0;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  logger('Extension Host initialization timeout — proceeding anyway');
}

// ── Dev Host Bridge Discovery ───────────────────────────

/**
 * Wait for the vsctk bridge to activate in the Extension Dev Host.
 * The bridge path is computed deterministically from the workspace path.
 * We poll for socket connectivity to know when the bridge is ready.
 */
async function waitForDevHostBridge(
  targetFolder: string,
  timeout = 15_000,
): Promise<string | null> {
  const bridgePath = computeBridgePath(targetFolder);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Test if the socket is connectable
    const isReady = await testSocketConnectivity(bridgePath);
    if (isReady) {
      logger(`Dev Host bridge ready: ${bridgePath}`);
      return bridgePath;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  logger('Dev Host bridge not ready within timeout');
  return null;
}

/**
 * Test if a socket/pipe is connectable (bridge is running)
 */
function testSocketConnectivity(socketPath: string): Promise<boolean> {
  return new Promise(resolve => {
    const client = net.createConnection(socketPath);
    client.on('connect', () => {
      client.end();
      resolve(true);
    });
    client.on('error', () => {
      resolve(false);
    });
    // Timeout after 1 second
    setTimeout(() => {
      client.destroy();
      resolve(false);
    }, 1000);
  });
}

// ── Synchronous Child Kill ──────────────────────────────

/**
 * Force-kill the child process tree synchronously.
 *
 * On Windows: `Code.exe` is a launcher stub that forks the real Electron
 * binary and exits (code 9). The launcher PID is dead by the time CDP is
 * available. We track the REAL Electron PID (discovered from `netstat` after
 * the CDP port opens) and kill its entire process tree with `taskkill /F /T`.
 *
 * Safe to call multiple times or when no child exists.
 */
function forceKillChildSync(): void {
  // Kill the real Electron process (the one actually running VS Code)
  const ePid = electronPid;
  if (ePid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${ePid}`, {stdio: 'ignore'});
      } else {
        process.kill(ePid, 'SIGKILL');
      }
    } catch {
      // Process already exited
    }
  }

  // Also try the launcher PID (may still be alive on non-Windows)
  const lPid = launcherPid;
  if (lPid && lPid !== ePid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${lPid}`, {stdio: 'ignore'});
      } else {
        process.kill(lPid, 'SIGKILL');
      }
    } catch {
      // Process already exited
    }
  }

  childProcess = undefined;
  launcherPid = undefined;
  electronPid = undefined;
}

/**
 * Kill any existing child, close WS, and clean up temp dir.
 * Synchronous except for the WS close (best-effort).
 */
export function teardownSync(): void {
  // Disconnect Puppeteer before closing the WebSocket
  puppeteerBrowser = undefined;

  try {
    cdpWs?.close();
  } catch {
    // best-effort
  }
  cdpWs = undefined;

  forceKillChildSync();

  if (userDataDir) {
    try {
      fs.rmSync(userDataDir, {recursive: true, force: true});
    } catch {
      // best-effort
    }
    userDataDir = undefined;
  }
}

// ── Lifecycle Handlers (registered once) ────────────────

/**
 * Registers process-level handlers that guarantee the child is killed
 * on ANY exit path — clean, signal, or crash.
 *
 * On Windows, VS Code kills the MCP server by closing stdin and terminating
 * the process. We listen for 'end' on stdin as the PRIMARY shutdown trigger,
 * PLUS `process.on('exit')` as a synchronous last-resort safety net.
 */
function registerLifecycleHandlers(): void {
  // Primary: stdin 'end' fires when VS Code disconnects the MCP server.
  // This is the most reliable signal on Windows.
  process.stdin.on('end', () => {
    logger('stdin ended — killing child process');
    forceKillChildSync();
    process.exit(0);
  });

  // Synchronous safety net — guaranteed to fire on any exit path
  process.on('exit', () => {
    forceKillChildSync();
  });

  // Graceful signal handlers — try async cleanup first, then exit
  const gracefulShutdown = async () => {
    await stopDebugWindow();
    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  process.on('uncaughtException', async (err) => {
    logger('Uncaught exception:', err);
    await stopDebugWindow();
    process.exit(1);
  });
}

// Register once at module load — no flag needed
registerLifecycleHandlers();

// ── Main Entry Point ────────────────────────────────────

export interface VSCodeLaunchOptions {
  workspaceFolder: string;
  extensionBridgePath: string;
  targetFolder?: string;
  headless?: boolean;
}

/**
 * Ensure the VS Code debug window is spawned and CDP is connected.
 *
 * SINGLETON: If a healthy connection exists, returns it immediately.
 * If a stale child exists (WS dead), kills it before respawning.
 * Concurrent callers are gated — only one spawn runs at a time.
 *
 * Steps:
 * 1. Computes Host bridge path from workspace
 * 2. Allocates dynamic ports (CDP + inspector)
 * 3. Spawns Extension Development Host with vsctk extension
 * 4. Attaches debugger for full debug UI
 * 5. Connects raw CDP WebSocket to workbench page
 * 6. Polls for workbench readiness
 */
export async function ensureVSCodeConnected(
  options: VSCodeLaunchOptions,
): Promise<WebSocket> {
  // Fast path: healthy connection — reuse it
  if (cdpWs?.readyState === WebSocket.OPEN) {
    return cdpWs;
  }

  // Gate: if another connect is already in-flight, wait for it
  if (connectInProgress) {
    return connectInProgress;
  }

  connectInProgress = doConnect(options);
  try {
    return await connectInProgress;
  } finally {
    connectInProgress = undefined;
  }
}

async function doConnect(options: VSCodeLaunchOptions): Promise<WebSocket> {
  connectionGeneration++;
  // Kill any stale child before spawning a new one — no duplicates
  teardownSync();

  // 1. Compute Host bridge path (deterministic from workspace path)
  hostBridgePath = computeBridgePath(options.workspaceFolder);

  // 2. Get Electron executable path from the Host VS Code
  const electronPath = (await bridgeExec(
    hostBridgePath,
    'return process.execPath;',
  )) as string;
  logger(`Electron executable: ${electronPath}`);

  // 3. Allocate dynamic ports
  const cPort = await getPort();
  const iPort = await getPort();
  cdpPort = cPort;
  inspectorPort = iPort;
  logger(`Allocated CDP port: ${cPort}, inspector port: ${iPort}`);

  // 4. Create unique temp user-data-dir (MANDATORY for separate instance)
  userDataDir = path.join(os.tmpdir(), `vscode-mcp-${Date.now()}`);
  fs.mkdirSync(userDataDir, {recursive: true});
  logger(`User data dir: ${userDataDir}`);

  // Pre-write settings to suppress first-run modals.
  // Fresh user-data-dir has no persisted state, so the workspace trust dialog
  // ("Do you trust the authors?") appears every time and blocks all interaction.
  const settingsDir = path.join(userDataDir, 'User');
  fs.mkdirSync(settingsDir, {recursive: true});
  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify({
      'security.workspace.trust.enabled': false,
      'workbench.startupEditor': 'none',
      'workbench.tips.enabled': false,
      'update.showReleaseNotes': false,
      'extensions.ignoreRecommendations': true,
      'telemetry.telemetryLevel': 'off',
      // Use DOM-based dialogs instead of native OS dialogs
      // This allows CDP to interact with Save/Confirm dialogs
      'window.dialogStyle': 'custom',
    }, null, 2),
  );

  // 5. Spawn Extension Development Host
  //    `detached: true` is REQUIRED on Windows because Code.exe is a launcher
  //    stub that forks the real Electron binary and immediately exits (code 9).
  //    Without detached, the forked Electron process would be killed.
  //    We do NOT call unref() — Node keeps a reference so it doesn't exit early.
  const targetFolder = options.targetFolder ?? options.workspaceFolder;
  const args = [
    `--remote-debugging-port=${cPort}`,
    `--inspect-extensions=${iPort}`,
    // Load vsctk extension as development extension (includes bridge)
    `--extensionDevelopmentPath=${options.extensionBridgePath}`,
    `--user-data-dir=${userDataDir}`,
    '--new-window',
    '--skip-release-notes',
    '--skip-welcome',
    // Disable all extensions except explicitly enabled ones
    '--disable-extensions',
    '--enable-extension=vscode.typescript-language-features',
    '--enable-extension=github.copilot-chat',
    targetFolder,
  ];

  logger(`Spawning Extension Development Host: ${electronPath} ${args.join(' ')}`);
  // Strip ELECTRON_RUN_AS_NODE from the child's environment.
  // VS Code sets this when spawning MCP servers so that Code.exe acts as Node.
  // The child VS Code instance must NOT inherit it — it needs to run as Electron.
  const childEnv = {...process.env};
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.ELECTRON_NO_ASAR;  // Also strip this Electron override
  const proc = spawn(electronPath, args, {
    detached: true,
    stdio: 'ignore',
    env: childEnv,
  });
  proc.unref();
  childProcess = proc;
  launcherPid = proc.pid;
  logger(`Launcher spawned — PID: ${launcherPid} (may exit immediately on Windows)`);

  // Track launcher exit (on Windows this fires almost immediately with code=9)
  proc.on('exit', (code, signal) => {
    logger(`Launcher process exited: code=${code}, signal=${signal}`);
    if (childProcess === proc) {
      childProcess = undefined;
      launcherPid = undefined;
    }
  });

  // 6. Wait for CDP port
  const versionInfo = await waitForDebugPort(cPort);
  logger(`CDP available: ${versionInfo.Browser}`);

  // 6b. Discover the REAL Electron PID from the CDP port.
  //     On Windows, Code.exe (launcher) exits immediately — the real Electron
  //     process is the one actually listening on the CDP port.
  const realPid = await discoverElectronPid(cPort);
  if (realPid) {
    electronPid = realPid;
    logger(`Real Electron PID: ${electronPid}`);
  } else {
    logger('Warning: could not discover Electron PID — cleanup may be incomplete');
  }

  // 7. Wait for inspector, then attach debugger for full debug UI
  try {
    await waitForInspectorPort(iPort);
    await bridgeAttachDebugger(
      hostBridgePath,
      iPort,
      `Extension Host (port ${iPort})`,
    );
    logger('Debug session attached — full debug UI active');
  } catch (err) {
    logger(
      `Warning: debugger attach failed: ${(err as Error).message}. Continuing without debug UI.`,
    );
  }

  // 8. Find workbench page target and connect raw CDP WebSocket
  const workbench = await findWorkbenchTarget(cPort);
  logger(
    `Connecting to workbench target: "${workbench.title}" (${workbench.webSocketDebuggerUrl})`,
  );
  cdpWs = await connectCdpWebSocket(workbench.webSocketDebuggerUrl);

  // 9. Enable CDP domains and wait for readiness
  await sendCdp('Runtime.enable', {}, cdpWs);
  await sendCdp('Page.enable', {}, cdpWs);

  // 9a. Initialize CDP event subscriptions for console/network tracking
  await initCdpEventSubscriptions();

  await waitForWorkbenchReady(cdpWs);

  // 9b. Create Puppeteer Browser via ElectronTransport.
  //     puppeteer.connect({ browserWSEndpoint }) fails on Electron because
  //     Target.getBrowserContexts is not allowed. ElectronTransport intercepts
  //     those calls and returns mock responses, while forwarding real CDP.
  try {
    const transport = new ElectronTransport(cdpWs, workbench, versionInfo);
    puppeteerBrowser = await puppeteer.connect({
      transport,
      defaultViewport: null,
    });
    logger('Puppeteer Browser created via ElectronTransport');
  } catch (err) {
    logger(`Warning: Puppeteer connect failed: ${(err as Error).message}. Tools requiring Puppeteer will not work.`);
  }

  // 10. Discover Dev Host bridge (for VS Code API calls in the target window)
  devhostBridgePath = (await waitForDevHostBridge(targetFolder)) ?? undefined;

  // Monitor for unexpected disconnects
  cdpWs.on('close', () => {
    logger('CDP WebSocket closed unexpectedly');
    clearAllData(); // Clear all stored console/network/trace data
    cdpWs = undefined;
    puppeteerBrowser = undefined;
  });

  return cdpWs;
}

// ── Public Cleanup ──────────────────────────────────────

/**
 * Graceful cleanup: detach debugger, close WS, kill child, remove temp dir.
 * stopDebugging() only detaches — process.kill() is required to close the window
 * since the process was spawned externally, not via VS Code's launch lifecycle.
 */
export async function stopDebugWindow(): Promise<void> {
  puppeteerBrowser = undefined;

  // Clear all stored console/network/trace data
  clearAllData();

  try {
    cdpWs?.close();
  } catch {
    // best-effort
  }

  if (hostBridgePath) {
    try {
      await bridgeExec(hostBridgePath, 'await vscode.debug.stopDebugging();');
    } catch {
      // best-effort
    }
  }

  forceKillChildSync();

  if (userDataDir && fs.existsSync(userDataDir)) {
    try {
      fs.rmSync(userDataDir, {recursive: true, force: true});
    } catch {
      // best-effort
    }
  }

  cdpWs = undefined;
  cdpPort = undefined;
  inspectorPort = undefined;
  hostBridgePath = undefined;
  devhostBridgePath = undefined;
  childProcess = undefined;
  launcherPid = undefined;
  electronPid = undefined;
  userDataDir = undefined;
}
