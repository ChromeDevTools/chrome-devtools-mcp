/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VS Code DevTools MCP — Browser/Connection Layer
 *
 * Replaces Chrome DevTools MCP's browser.ts with VS Code-specific logic:
 * 1. Discovers the Host VS Code's extension-bridge via sockpath marker
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
import os from 'node:os';
import path from 'node:path';
import {spawn, execSync, type ChildProcess} from 'node:child_process';

import getPort from 'get-port';
import WebSocket from 'ws';

import {
  discoverBridgePath,
  bridgeExec,
  bridgeAttachDebugger,
} from './bridge-client.js';
import {logger} from './logger.js';

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

// ── Dev Host Bridge Discovery ───────────────────────────

/**
 * Wait for extension-bridge to activate in the Extension Dev Host.
 * The Dev Host writes its own sockpath marker to the target folder.
 */
async function waitForDevHostBridge(
  targetFolder: string,
  timeout = 15_000,
): Promise<string | null> {
  const markerPath = path.join(
    targetFolder,
    '.vscode',
    'vscode-api-expose.sockpath',
  );
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fs.existsSync(markerPath)) {
      const bridgePath = fs.readFileSync(markerPath, 'utf8').trim();
      if (bridgePath) {
        logger(`Dev Host bridge discovered: ${bridgePath}`);
        return bridgePath;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  logger('Dev Host bridge not found within timeout');
  return null;
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
function teardownSync(): void {
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
 * 1. Discovers Host bridge via sockpath marker
 * 2. Allocates dynamic ports (CDP + inspector)
 * 3. Spawns Extension Development Host with extension-bridge
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
  // Kill any stale child before spawning a new one — no duplicates
  teardownSync();

  // 1. Discover Host bridge
  hostBridgePath = discoverBridgePath(options.workspaceFolder);

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

  // 5. Spawn Extension Development Host
  //    `detached: true` is REQUIRED on Windows because Code.exe is a launcher
  //    stub that forks the real Electron binary and immediately exits (code 9).
  //    Without detached, the forked Electron process would be killed.
  //    We do NOT call unref() — Node keeps a reference so it doesn't exit early.
  const targetFolder = options.targetFolder ?? options.workspaceFolder;
  const args = [
    `--remote-debugging-port=${cPort}`,
    `--inspect-extensions=${iPort}`,
    `--extensionDevelopmentPath=${options.extensionBridgePath}`,
    `--user-data-dir=${userDataDir}`,
    '--new-window',
    '--skip-release-notes',
    '--skip-welcome',
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
  await waitForWorkbenchReady(cdpWs);

  // 10. Discover Dev Host bridge (for VS Code API calls in the target window)
  devhostBridgePath = (await waitForDevHostBridge(targetFolder)) ?? undefined;

  // Monitor for unexpected disconnects
  cdpWs.on('close', () => {
    logger('CDP WebSocket closed unexpectedly');
    cdpWs = undefined;
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
