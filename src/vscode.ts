/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VS Code DevTools MCP — VS Code Launch/Connection Layer
 *
 * 1. Computes the Host VS Code's bridge path deterministically from workspace path
 * 2. Allocates dynamic ports (CDP + Extension Host inspector) via get-port
 * 3. Spawns an Extension Development Host via child_process.spawn()
 * 4. Connects via raw CDP WebSocket to the page-level target
 * 5. Polls for workbench readiness (.monaco-workbench + document.readyState)
 * 6. Provides lifecycle management (cleanup on exit/crash)
 *
 * Session data is persisted in `<targetWorkspace>/.devtools/user-data/`.
 * This directory serves as the `--user-data-dir` for the spawned VS Code
 * instance, so settings, extensions, UI state, and open editors survive
 * server restarts and crashes. To reset, delete the `.devtools` folder.
 *
 * SINGLETON: Only one child VS Code instance at a time. If the server exits
 * for any reason (clean, SIGINT, SIGTERM, crash) the child is killed instantly.
 */

import {spawn, execSync, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import getPort from 'get-port';
import WebSocket from 'ws';

import {
  computeBridgePath,
  bridgeExec,
  bridgeAttachDebugger,
} from './bridge-client.js';
import {initCdpEventSubscriptions, clearAllData} from './cdp-events.js';
import {DEFAULT_LAUNCH_FLAGS, type LaunchFlags} from './config.js';
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
  webSocketDebuggerUrl?: string;
  [key: string]: unknown;
}

// ── CDP Target Session Types (for OOPIF support) ──

/**
 * Information about an attached target, received via Target.attachedToTarget.
 */
export interface AttachedTargetInfo {
  sessionId: string;
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
}

/**
 * Target info from CDP Target.getTargets.
 */
export interface CdpTargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
  canAccessOpener: boolean;
  browserContextId?: string;
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

/** Maps sessionId to attached target info for OOPIF support. */
const attachedTargets = new Map<string, AttachedTargetInfo>();

export function getConnectionGeneration(): number {
  return connectionGeneration;
}

export function getUserDataDir(): string | undefined {
  return userDataDir;
}

// ── Raw CDP Communication ───────────────────────────────

let cdpMessageId = 0;

/**
 * CDP result type - inherently dynamic JSON from Chrome DevTools Protocol.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CdpResult = Record<string, any>;

/**
 * Options for sendCdp command.
 */
interface SendCdpOptions {
  /** Session ID for sending commands to attached targets (OOPIFs). */
  sessionId?: string;
  /** Optional WebSocket to use (defaults to main cdpWs). */
  ws?: WebSocket;
}

/**
 * Send a CDP command over the raw WebSocket and wait for the matching response.
 * 
 * @param method - CDP method name (e.g., 'Runtime.evaluate')
 * @param params - Parameters for the method
 * @param optionsOrWs - Either options object with sessionId/ws, or WebSocket for backward compat
 */
export function sendCdp(
  method: string,
  params: Record<string, unknown> = {},
  optionsOrWs?: SendCdpOptions | WebSocket,
): Promise<CdpResult> {
  // Handle backward compatibility: third arg can be WebSocket or options object
  let sessionId: string | undefined;
  let socket: WebSocket | undefined;
  
  if (optionsOrWs instanceof WebSocket) {
    socket = optionsOrWs;
  } else if (optionsOrWs) {
    sessionId = optionsOrWs.sessionId;
    socket = optionsOrWs.ws;
  }
  
  socket = socket ?? cdpWs;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(
      new Error('CDP WebSocket is not connected'),
    );
  }

  return new Promise((resolve, reject) => {
    const id = ++cdpMessageId;
    const handler = (evt: WebSocket.MessageEvent) => {
      const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.id === id) {
        socket.removeEventListener('message', handler);
        if (data.error) {
          const errorObj = data.error as {message: string};
          reject(new Error(`CDP ${method}: ${errorObj.message}`));
        } else {
          resolve(data.result as CdpResult);
        }
      }
    };
    socket.addEventListener('message', handler);
    
    // Include sessionId in message if provided (for OOPIF targets)
    const message: Record<string, unknown> = {id, method, params};
    if (sessionId) {
      message.sessionId = sessionId;
    }
    socket.send(JSON.stringify(message));
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

// ── Target Management (OOPIF Support) ───────────────────

/**
 * Get all currently attached targets (for OOPIF/webview access).
 */
export function getAttachedTargets(): AttachedTargetInfo[] {
  return Array.from(attachedTargets.values());
}

/**
 * Get attached target by sessionId.
 */
export function getAttachedTarget(sessionId: string): AttachedTargetInfo | undefined {
  return attachedTargets.get(sessionId);
}

/**
 * Clear all attached targets (called on disconnect).
 */
function clearAttachedTargets(): void {
  attachedTargets.clear();
}

/**
 * Handle CDP events for target attachment/detachment.
 */
function setupTargetEventListeners(ws: WebSocket): void {
  ws.addEventListener('message', (evt: WebSocket.MessageEvent) => {
    const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    
    // Handle Target.attachedToTarget event
    if (data.method === 'Target.attachedToTarget') {
      const params = data.params as {
        sessionId: string;
        targetInfo: {
          targetId: string;
          type: string;
          title: string;
          url: string;
          attached: boolean;
        };
      };
      
      const info: AttachedTargetInfo = {
        sessionId: params.sessionId,
        targetId: params.targetInfo.targetId,
        type: params.targetInfo.type,
        title: params.targetInfo.title,
        url: params.targetInfo.url,
        attached: true,
      };
      
      attachedTargets.set(params.sessionId, info);
      logger(`[Target] Attached: ${info.type} "${info.title}" (${info.sessionId.substring(0, 8)}...)`);
    }
    
    // Handle Target.detachedFromTarget event
    if (data.method === 'Target.detachedFromTarget') {
      const params = data.params as {sessionId: string};
      const target = attachedTargets.get(params.sessionId);
      if (target) {
        logger(`[Target] Detached: ${target.type} "${target.title}"`);
        attachedTargets.delete(params.sessionId);
      }
    }
  });
}

/**
 * Enable auto-attach to discover OOPIF targets.
 * Must be called after CDP connection is established.
 */
export async function enableTargetAutoAttach(): Promise<void> {
  if (!cdpWs) {
    throw new Error('CDP not connected');
  }
  
  // Set up event listeners first
  setupTargetEventListeners(cdpWs);
  
  // Enable Target domain
  await sendCdp('Target.setDiscoverTargets', {discover: true});
  
  // Enable auto-attach to all targets including OOPIFs
  // flatten: true means we can send commands via sessionId on the same connection
  await sendCdp('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
    filter: [
      {type: 'iframe'},
      {type: 'page'},
    ],
  });
  
  logger('[Target] Auto-attach enabled for OOPIF discovery');
}

/**
 * Get list of all targets from CDP (for debugging/listing).
 */
export async function getAllTargets(): Promise<CdpTargetInfo[]> {
  const result = await sendCdp('Target.getTargets');
  return (result.targetInfos ?? []) as CdpTargetInfo[];
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
          if (pid > 0) {return pid;}
        }
      }
    } else {
      const out = execSync(`lsof -ti :${port}`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      const pid = parseInt(out.split('\n')[0], 10);
      if (pid > 0) {return pid;}
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
 * Wait for the vscode-devtools bridge to activate in the Extension Dev Host.
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
 * Synchronously discover the PID listening on a given port.
 * Used as a fallback during cleanup if electronPid was lost.
 */
function discoverPidByPortSync(port: number): number | null {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `netstat -ano | findstr "LISTENING" | findstr ":${port} "`,
        {encoding: 'utf8', timeout: 5000},
      ).trim();
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) {return pid;}
        }
      }
    } else {
      const out = execSync(`lsof -ti :${port}`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      const pid = parseInt(out.split('\n')[0], 10);
      if (pid > 0) {return pid;}
    }
  } catch {
    // Command failed
  }
  return null;
}

/**
 * On Windows, find Code.exe processes that have our user-data-dir in their
 * command line and kill them. This is a last-resort fallback if we lost the
 * PID reference but know the user-data-dir path.
 */
function killByUserDataDirSync(dataDir: string): void {
  if (process.platform !== 'win32') {return;}
  try {
    // Escape backslashes for WMIC LIKE pattern
    const escapedPath = dataDir.replace(/\\/g, '\\\\');
    const out = execSync(
      `wmic process where "CommandLine like '%${escapedPath}%'" get ProcessId`,
      {encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'ignore']},
    ).trim();
    for (const line of out.split('\n')) {
      const pid = parseInt(line.trim(), 10);
      if (pid > 0) {
        try {
          execSync(`taskkill /F /T /PID ${pid}`, {stdio: 'ignore'});
          logger(`Killed process ${pid} by user-data-dir match`);
        } catch {
          // Already dead
        }
      }
    }
  } catch {
    // WMIC not available or no match
  }
}

/**
 * Force-kill the child process tree synchronously.
 *
 * On Windows: `Code.exe` is a launcher stub that forks the real Electron
 * binary and exits (code 9). The launcher PID is dead by the time CDP is
 * available. We track the REAL Electron PID (discovered from `netstat` after
 * the CDP port opens) and kill its entire process tree with `taskkill /F /T`.
 *
 * If electronPid is lost (e.g., after a window reload or reconnect), we try:
 * 1. Re-discover via the CDP port (if still known)
 * 2. Find by user-data-dir command-line argument (Windows only)
 *
 * Safe to call multiple times or when no child exists.
 */
function forceKillChildSync(): void {
  let ePid = electronPid;

  // Fallback 1: rediscover via CDP port if we lost the PID
  if (!ePid && cdpPort) {
    const rediscovered = discoverPidByPortSync(cdpPort);
    if (rediscovered) {
      logger(`Rediscovered Electron PID ${rediscovered} from CDP port ${cdpPort}`);
      ePid = rediscovered;
    }
  }

  // Kill the real Electron process (the one actually running VS Code)
  if (ePid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${ePid}`, {stdio: 'ignore'});
      } else {
        process.kill(ePid, 'SIGKILL');
      }
      logger(`Killed Electron PID ${ePid}`);
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

  // Fallback 2: kill by user-data-dir if we still have that path
  // This catches cases where the CDP port changed (e.g., after reload)
  if (userDataDir) {
    killByUserDataDirSync(userDataDir);
  }

  childProcess = undefined;
  launcherPid = undefined;
  electronPid = undefined;
}

// ── .gitignore Helper ───────────────────────────────────

/**
 * Ensure `.devtools` is listed in the target workspace's `.gitignore`.
 * Creates the file if it doesn't exist. No-ops if the entry is already present.
 */
function ensureGitignoreEntry(targetFolder: string): void {
  const gitignorePath = path.join(targetFolder, '.gitignore');
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (content.includes('.devtools')) {return;}
      fs.appendFileSync(gitignorePath, '\n# VS Code DevTools MCP session data\n.devtools/\n');
    } else {
      fs.writeFileSync(gitignorePath, '# VS Code DevTools MCP session data\n.devtools/\n');
    }
    logger('Added .devtools to .gitignore');
  } catch {
    logger('Warning: could not update .gitignore');
  }
}

/**
 * Kill any existing child, close WS, and clean up.
 * Synchronous except for the WS close (best-effort).
 */
export function teardownSync(): void {
  try {
    cdpWs?.close();
  } catch {
    // best-effort
  }
  cdpWs = undefined;

  forceKillChildSync();

  // .devtools/user-data is persistent — do NOT delete it on teardown.
  // The user can manually delete .devtools/ to reset.
  userDataDir = undefined;
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
  launch?: LaunchFlags;
}

interface HostTaskDefinition {
  label: string;
  command: string;
  optionsCwd?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function expandWorkspaceFolderVars(input: string, workspaceFolder: string): string {
  return input.replaceAll('${workspaceFolder}', workspaceFolder);
}

function tryReadHostTaskFromTasksJson(
  workspaceFolder: string,
  taskLabel: string,
): HostTaskDefinition | null {
  const tasksPath = path.join(workspaceFolder, '.vscode', 'tasks.json');
  if (!fs.existsSync(tasksPath)) {return null;}

  const content = fs.readFileSync(tasksPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {return null;}
  const tasksValue = parsed['tasks'];
  if (!Array.isArray(tasksValue)) {return null;}

  for (const item of tasksValue) {
    if (!isRecord(item)) {continue;}
    const label = readOptionalString(item, 'label');
    if (label !== taskLabel) {continue;}

    const command = readOptionalString(item, 'command');
    if (!command) {return null;}

    const optionsValue = item['options'];
    const optionsCwdRaw = isRecord(optionsValue)
      ? readOptionalString(optionsValue, 'cwd')
      : undefined;

    const optionsCwd = optionsCwdRaw
      ? expandWorkspaceFolderVars(optionsCwdRaw, workspaceFolder)
      : undefined;

    return {
      label,
      command,
      optionsCwd,
    };
  }

  return null;
}

export async function runHostShellTaskOrThrow(
  workspaceFolder: string,
  taskLabel: string,
  _inactivityTimeoutMs: number,
): Promise<void> {
  // Prefer using the host bridge to execute the task via VS Code's Tasks API.
  // This keeps build output in VS Code's terminal panel and uses problem matchers.
  const bridge = hostBridgePath ?? computeBridgePath(workspaceFolder);

  logger(`Running task "${taskLabel}" via host bridge…`);

  try {
    await bridgeExec(
      bridge,
      `
      const tasks = await vscode.tasks.fetchTasks();
      const target = tasks.find(t => t.name === payload.label);
      if (!target) {
        throw new Error('Task "' + payload.label + '" not found in host VS Code');
      }

      const execution = await vscode.tasks.executeTask(target);

      return new Promise((resolve, reject) => {
        const disposable = vscode.tasks.onDidEndTaskProcess(event => {
          if (event.execution === execution) {
            disposable.dispose();
            if (event.exitCode === 0) {
              resolve({ success: true, exitCode: 0 });
            } else {
              reject(new Error(
                '"' + payload.label + '" failed with exit code ' + event.exitCode
              ));
            }
          }
        });

        setTimeout(() => {
          disposable.dispose();
          reject(new Error('"' + payload.label + '" timed out after 5 minutes'));
        }, 300000);
      });
      `,
      {label: taskLabel},
    );

    logger(`Task "${taskLabel}" completed successfully via bridge`);
    return;
  } catch (bridgeErr) {
    logger(
      `Bridge task execution failed, falling back to shell: ${(bridgeErr as Error).message}`,
    );
  }

  // Fallback: run the command directly if the bridge is unavailable
  // (e.g., host VS Code not running or bridge not initialized yet).
  const task = tryReadHostTaskFromTasksJson(workspaceFolder, taskLabel);
  if (!task) {
    throw new Error(
      `Prelaunch task "${taskLabel}" not found in ${path.join(workspaceFolder, '.vscode', 'tasks.json')}`,
    );
  }

  logger(`Fallback: running "${task.label}" directly: ${task.command}`);

  await new Promise<void>((resolve, reject) => {
    const cwd = task.optionsCwd ?? workspaceFolder;
    const child = spawn(task.command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const maxOutputChars = 1_000_000;

    let inactivityTimer: NodeJS.Timeout | undefined;
    const resetInactivityTimer = () => {
      if (inactivityTimer) {clearTimeout(inactivityTimer);}
      inactivityTimer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // best-effort
        }
        reject(
          new Error(
            `Prelaunch task "${taskLabel}" produced no output for ${Math.round(_inactivityTimeoutMs / 1000)}s and was terminated.\n\n${output}`,
          ),
        );
      }, _inactivityTimeoutMs);
    };

    const appendOutput = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      logger(text.trimEnd());
      if (output.length < maxOutputChars) {
        const remaining = maxOutputChars - output.length;
        output += text.slice(0, remaining);
      }
      resetInactivityTimer();
    };

    resetInactivityTimer();

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);

    child.on('error', (err) => {
      if (inactivityTimer) {clearTimeout(inactivityTimer);}
      reject(new Error(`Prelaunch task spawn error: ${err.message}\n\n${output}`));
    });

    child.on('exit', (code) => {
      if (inactivityTimer) {clearTimeout(inactivityTimer);}
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Prelaunch task "${taskLabel}" failed with exit code ${code ?? 'unknown'}.\n\n${output}`,
        ),
      );
    });
  });
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
 * 3. Spawns Extension Development Host with vscode-devtools extension
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

interface InternalLaunchPorts {
  cdpPort: number;
  inspectorPort: number;
  extensionBridgePath: string;
  userDataDir: string;
  targetFolder: string;
}

/** Build the CLI args array for the Extension Development Host from resolved LaunchFlags. */
function buildLaunchArgs(flags: LaunchFlags, ports: InternalLaunchPorts): string[] {
  const args: string[] = [
    // Always-present flags — not configurable
    `--remote-debugging-port=${ports.cdpPort}`,
    `--inspect-extensions=${ports.inspectorPort}`,
    `--extensionDevelopmentPath=${ports.extensionBridgePath}`,
    `--user-data-dir=${ports.userDataDir}`,
    '--disable-updates',
  ];

  if (flags.newWindow) {args.push('--new-window');}
  if (flags.skipReleaseNotes) {args.push('--skip-release-notes');}
  if (flags.skipWelcome) {args.push('--skip-welcome');}
  if (flags.disableExtensions) {args.push('--disable-extensions');}
  if (flags.disableGpu) {args.push('--disable-gpu');}
  if (flags.disableWorkspaceTrust) {args.push('--disable-workspace-trust');}
  if (flags.verbose) {args.push('--verbose');}
  if (flags.locale) {args.push(`--locale=${flags.locale}`);}

  for (const ext of flags.enableExtensions) {
    args.push(`--enable-extension=${ext}`);
  }

  for (const extra of flags.extraArgs) {
    args.push(extra);
  }

  // Target folder is always last positional arg
  args.push(ports.targetFolder);

  return args;
}

async function doConnect(options: VSCodeLaunchOptions): Promise<WebSocket> {
  connectionGeneration++;
  // Kill any stale child before spawning a new one — no duplicates
  teardownSync();

  // 1. Compute Host bridge path (deterministic from workspace path)
  hostBridgePath = computeBridgePath(options.workspaceFolder);

  // 2. Get Electron executable path — prefer the Host VS Code bridge,
  //    fall back to process.execPath (available when VS Code spawns the
  //    MCP server with ELECTRON_RUN_AS_NODE).
  let electronPath: string;
  try {
    electronPath = (await bridgeExec(
      hostBridgePath,
      'return process.execPath;',
    )) as string;
  } catch (bridgeErr) {
    if (process.env.ELECTRON_RUN_AS_NODE) {
      electronPath = process.execPath;
      logger(
        `Host bridge unavailable (${(bridgeErr as Error).message}), ` +
        `falling back to process.execPath: ${electronPath}`,
      );
    } else {
      throw new Error(
        'Cannot find VS Code Electron executable. ' +
        'Either the vscode-devtools bridge extension must be active in the ' +
        'host VS Code, or the MCP server must be launched from within VS Code.\n' +
        `Bridge error: ${(bridgeErr as Error).message}`,
      );
    }
  }
  logger(`Electron executable: ${electronPath}`);

  // 3. Allocate dynamic ports
  const cPort = await getPort();
  const iPort = await getPort();
  cdpPort = cPort;
  inspectorPort = iPort;
  logger(`Allocated CDP port: ${cPort}, inspector port: ${iPort}`);

  // 4. Persistent user-data-dir inside <targetWorkspace>/.devtools/
  //    Survives server restarts/crashes so the debug window restores identically.
  //    To reset, delete the .devtools folder.
  const targetFolder = options.targetFolder ?? options.workspaceFolder;
  userDataDir = path.join(targetFolder, '.devtools', 'user-data');
  fs.mkdirSync(userDataDir, {recursive: true});
  logger(`User data dir: ${userDataDir}`);

  // Pre-flight: kill any zombie VS Code using the same user-data-dir from a crashed session.
  // This ensures we don't have port conflicts or stale locks.
  killByUserDataDirSync(userDataDir);

  // Ensure .devtools is in the target workspace's .gitignore
  ensureGitignoreEntry(targetFolder);

  // Seed default settings only on first run (when settings.json doesn't exist yet).
  // On subsequent runs the user's persisted settings take precedence.
  const settingsDir = path.join(userDataDir, 'User');
  const settingsPath = path.join(settingsDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    fs.mkdirSync(settingsDir, {recursive: true});
    fs.writeFileSync(
      settingsPath,
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
    logger('Seeded default settings for first run');
  } else {
    logger('Using existing persisted settings');
  }

  // 5. Spawn Extension Development Host
  //    `detached: true` is REQUIRED on Windows because Code.exe is a launcher
  //    stub that forks the real Electron binary and immediately exits (code 9).
  //    Without detached, the forked Electron process would be killed.
  //    We do NOT call unref() — Node keeps a reference so it doesn't exit early.
  const flags = options.launch ?? DEFAULT_LAUNCH_FLAGS;
  const args = buildLaunchArgs(flags, {
    cdpPort: cPort,
    inspectorPort: iPort,
    extensionBridgePath: options.extensionBridgePath,
    userDataDir,
    targetFolder,
  });

  logger(`Spawning Extension Development Host: ${electronPath} ${args.join(' ')}`);
  // Strip ELECTRON_RUN_AS_NODE from the child's environment.
  // VS Code sets this when spawning MCP servers so that Code.exe acts as Node.
  // The child VS Code instance must NOT inherit it — it needs to run as Electron.
  const childEnv = {...process.env};
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.ELECTRON_NO_ASAR;  // Also strip this Electron override
  // Strip VSCODE_* env vars (IPC hooks, git handles, injection flags, etc.)
  // that cause the child Code.exe to communicate with the parent instance
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('VSCODE_')) {
      delete childEnv[key];
    }
  }
  const proc = spawn(electronPath, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: childEnv,
  });

  // Capture launcher stderr for diagnostics — Code.exe may log startup failures
  if (proc.stderr) {
    let stderrOutput = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => { stderrOutput += chunk; });
    proc.stderr.on('end', () => {
      const trimmed = stderrOutput.trim();
      if (trimmed) {
        logger(`Launcher stderr: ${trimmed}`);
      }
    });
  }

  // Track spawn errors (e.g., file not found, permission denied)
  proc.on('error', (err) => {
    logger(`Spawn error: ${err.message}`);
    childProcess = undefined;
    launcherPid = undefined;
  });

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

  // 9a. Initialize CDP event subscriptions for console messages
  await initCdpEventSubscriptions();

  // 9b. Enable target auto-attach for OOPIF/webview discovery
  await enableTargetAutoAttach();

  await waitForWorkbenchReady(cdpWs);

  // 10. Discover Dev Host bridge (for VS Code API calls in the target window)
  devhostBridgePath = (await waitForDevHostBridge(targetFolder)) ?? undefined;

  // Monitor for unexpected disconnects
  cdpWs.on('close', () => {
    logger('CDP WebSocket closed unexpectedly');
    clearAllData();
    clearAttachedTargets();
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
  clearAllData();
  clearAttachedTargets();

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

  // .devtools/user-data is persistent — do NOT delete it on teardown.
  // The user can manually delete .devtools/ to reset.

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

