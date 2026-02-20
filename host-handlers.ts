/**
 * Host RPC Handlers
 *
 * IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
 * We have no access to proposed APIs. Do not add enabledApiProposals
 * to package.json or use --enable-proposed-api flags.
 * 
 * Handles lifecycle management for the VS Code DevTools MCP system.
 * The Host is the VSIX-installed extension in the main VS Code window.
 * 
 * API Surface (4 methods only):
 * - mcpReady: MCP announces presence → Host spawns/reconnects Client → returns connection info
 * - hotReloadRequired: Extension files changed → Host rebuilds, restarts Client → returns new connection
 * - getStatus: Query current state
 * - takeover: Another VS Code instance wants to become Host
 */

import * as vscode from 'vscode';
import { exec, spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { createHotReloadService, getHotReloadService, type ChangeCheckResult } from './services/hotReloadService';

// ── Constants ──────────────────────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32';
const CLIENT_PIPE_PATH = IS_WINDOWS
  ? '\\\\.\\pipe\\vscode-devtools-client'
  : '/tmp/vscode-devtools-client.sock';

// ── Module State ─────────────────────────────────────────────────────────────

/** Launcher PID of the spawned Client (may exit immediately on Windows) */
let launcherPid: number | null = null;

/** Real Electron PID — discovered from CDP port after launch (the actual process to kill) */
let electronPid: number | null = null;

/** Allocated CDP port for the Client browser */
let cdpPort: number | null = null;

/** Inspector port for the Client Extension Host debugger */
let inspectorPort: number | null = null;

/** The Extension Development Host process reference */
let clientProcess: ChildProcess | null = null;

/** Debug session for the Client (simple variable, not Map) */
let currentDebugSession: vscode.DebugSession | null = null;

// ── MCP Server ID Resolution ─────────────────────────────────────────────

// VS Code constructs server definition IDs as `mcp.config.<configId>.<serverName>`.
// The configId depends on where the mcp.json lives:
//   - User-level:          'usrlocal'
//   - Remote user:         'usrremote'
//   - Workspace file:      'workspace'
//   - Workspace folder:    'ws<index>' (e.g., ws0, ws1)
const MCP_SERVER_NAME = 'vscode-devtools';

async function resolveMcpServerId(): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return `mcp.config.unknown.${MCP_SERVER_NAME}`;
  }

  // Check each workspace folder for .vscode/mcp.json containing our server
  for (let i = 0; i < workspaceFolders.length; i++) {
    const mcpJsonUri = vscode.Uri.joinPath(workspaceFolders[i].uri, '.vscode', 'mcp.json');
    try {
      const content = await vscode.workspace.fs.readFile(mcpJsonUri);
      const config = JSON.parse(Buffer.from(content).toString('utf-8'));
      if (config?.servers?.[MCP_SERVER_NAME]) {
        const serverId = `mcp.config.ws${i}.${MCP_SERVER_NAME}`;
        console.log(`[host] Resolved MCP server ID: ${serverId}`);
        return serverId;
      }
    } catch {
      // mcp.json doesn't exist in this folder, try next
    }
  }

  // Fallback: assume user-level config
  const fallbackId = `mcp.config.usrlocal.${MCP_SERVER_NAME}`;
  console.log(`[host] MCP server not found in workspace folders, using fallback: ${fallbackId}`);
  return fallbackId;
}

/** Flag to prevent MCP shutdown during hot-reload */
let hotReloadInProgress = false;

/** Timestamp when Client was started */
let clientStartedAt: number | null = null;

/** Last extension path used for Client launch */
let currentExtensionPath: string | null = null;

/** Last client workspace used for Client launch */
let currentClientWorkspace: string | null = null;

/** True while reconnecting after a Client window reload */
let clientReconnecting = false;

/** Shared reconnect promise to coalesce concurrent calls */
let reconnectPromise: Promise<boolean> | null = null;

// ── MCP Server Readiness Tracking ───────────────────────────────────────────

/**
 * Deferred promise for MCP server restart. Set when checkForChanges detects
 * MCP source changes (before readyToRestart is called). Resolved when the
 * new MCP server process calls mcpReady. Used by the mcpStatus LM tool.
 */
let mcpReadyDeferred: { promise: Promise<void>; resolve: () => void } | null = null;

function expectMcpRestart(): void {
  let resolver: () => void;
  const promise = new Promise<void>(r => { resolver = r; });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  mcpReadyDeferred = { promise, resolve: resolver! };
  console.log('[host] MCP restart expected — mcpStatus will block until mcpReady');
}

function signalMcpReady(): void {
  if (mcpReadyDeferred) {
    mcpReadyDeferred.resolve();
    mcpReadyDeferred = null;
    console.log('[host] MCP ready signaled — mcpStatus unblocked');
  }
}

/**
 * Wait for the MCP server to be ready after a restart.
 * Returns true if ready, false if timed out.
 * If no restart is pending, resolves immediately (server is already running).
 */
export function waitForMcpReady(timeoutMs: number): Promise<boolean> {
  if (!mcpReadyDeferred) {
    return Promise.resolve(true);
  }
  return Promise.race([
    mcpReadyDeferred.promise.then(() => true),
    new Promise<boolean>(r => setTimeout(() => r(false), timeoutMs)),
  ]);
}

// ── Export Types ─────────────────────────────────────────────────────────────

export type RegisterHandler = (method: string, handler: (params: Record<string, unknown>) => unknown | Promise<unknown>) => void;

// ── Session Persistence ──────────────────────────────────────────────────────

interface PersistedSession {
  clientPid: number;
  cdpPort: number;
  inspectorPort: number;
  extensionPath: string;
  startedAt: number;
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const clientPid = Reflect.get(value, 'clientPid');
  const persistedCdpPort = Reflect.get(value, 'cdpPort');
  const persistedInspectorPort = Reflect.get(value, 'inspectorPort');
  const extensionPath = Reflect.get(value, 'extensionPath');
  const startedAt = Reflect.get(value, 'startedAt');

  return (
    typeof clientPid === 'number' &&
    typeof persistedCdpPort === 'number' &&
    typeof persistedInspectorPort === 'number' &&
    typeof extensionPath === 'string' &&
    typeof startedAt === 'number'
  );
}

function getSessionFilePath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    throw new Error('No workspace folder available');
  }
  return path.join(workspaceFolder, '.devtools', 'host-session.json');
}

function getWorkspacePath(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

function computeMcpSocketPath(workspacePath: string): string {
  if (IS_WINDOWS) {
    const resolved = path.resolve(workspacePath);
    const hash = crypto
      .createHash('sha256')
      .update(resolved.toLowerCase())
      .digest('hex')
      .slice(0, 8);
    return `\\\\.\\pipe\\vscode-devtools-mcp-${hash}`;
  }
  return path.join(workspacePath, '.vscode', 'vscode-devtools-mcp.sock');
}

async function notifyMcpClientReconnected(params: {
  electronPid: number | null;
  cdpPort: number;
  inspectorPort: number;
  at: number;
}): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    return;
  }

  const socketPath = computeMcpSocketPath(workspacePath);
  await new Promise<void>((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;

    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => {
      try {
        socket.destroy();
      } catch {
        // best-effort
      }
      done();
    }, 1500);

    socket.on('connect', () => {
      const payload = {
        jsonrpc: '2.0',
        method: 'client-reconnected',
        params,
      };
      socket.write(JSON.stringify(payload) + '\n', () => {
        clearTimeout(timer);
        socket.end();
        done();
      });
    });

    socket.on('error', () => {
      clearTimeout(timer);
      done();
    });

    socket.on('close', () => {
      clearTimeout(timer);
      done();
    });
  });
}

function loadPersistedSession(): PersistedSession | null {
  try {
    const filePath = getSessionFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(data);
      if (isPersistedSession(parsed)) {
        return parsed;
      }
      console.log('[host] Ignoring invalid persisted session payload');
    }
  } catch (err) {
    console.log('[host] Failed to load persisted session:', err);
  }
  return null;
}

function persistSession(session: PersistedSession): void {
  try {
    const filePath = getSessionFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  } catch (err) {
    console.log('[host] Failed to persist session:', err);
  }
}

function clearPersistedSession(): void {
  try {
    const filePath = getSessionFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ── Client Health Checks ────────────────────────────────────────────────────

/**
 * Check if a process with the given PID is still running
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
function discoverElectronPid(port: number): number | null {
  try {
    if (IS_WINDOWS) {
      const out = execSync(
        `netstat -ano | findstr "LISTENING" | findstr ":${port} "`,
        { encoding: 'utf8', timeout: 5000 },
      ).trim();
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) { return pid; }
        }
      }
    } else {
      const out = execSync(`lsof -ti :${port}`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      const pid = parseInt(out.split('\n')[0], 10);
      if (pid > 0) { return pid; }
    }
  } catch {
    // Command failed — maybe no process or tool not available
  }
  return null;
}

/**
 * Check if a port is responding (TCP probe)
 */
async function isPortResponding(port: number, timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
    
    socket.connect(port, '127.0.0.1', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Check if the CDP HTTP server is actually ready (not just TCP port open).
 * This is the authoritative check — TCP may be open before the HTTP server is ready.
 */
async function isCdpPortReady(port: number, timeout = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

/**
 * Check if the Client pipe is connectable
 */
async function isClientPipeConnectable(timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(CLIENT_PIPE_PATH, () => {
      socket.end();
      resolve(true);
    });
    
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
    
    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
    
    socket.on('connect', () => {
      clearTimeout(timer);
    });
  });
}

/**
 * Send a real system.ping RPC to the Client pipe and verify a response.
 * Unlike isClientPipeConnectable(), this catches frozen/blocked clients
 * that accept connections but never process messages.
 */
async function pingClientPipe(timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch { /* best-effort */ }
      resolve(result);
    };

    const socket = net.createConnection(CLIENT_PIPE_PATH, () => {
      const reqId = `health-ping-${Date.now()}`;
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: reqId,
        method: 'system.ping',
        params: {},
      }) + '\n';
      socket.write(request);
    });

    let response = '';
    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      response += chunk;
      if (response.includes('\n')) {
        finish(true);
      }
    });

    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));

    const timer = setTimeout(() => finish(false), timeout);
  });
}

/**
 * Wait until the Client pipe is no longer connectable (process died, pipe released).
 * Used after stopClient() to avoid race conditions when spawning a new Client.
 */
async function waitForPipeRelease(maxWaitMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const alive = await isClientPipeConnectable(500);
    if (!alive) {
      console.log(`[host] Client pipe released after ${Date.now() - start}ms`);
      return;
    }
    await sleep(300);
  }
  console.log(`[host] Client pipe still exists after ${maxWaitMs}ms — proceeding anyway`);
}

/**
 * Comprehensive health check for existing Client.
 * Does NOT rely on launcher PID — on Windows, Code.exe exits immediately.
 * Instead checks the real Electron PID (if known), CDP port, and Client pipe.
 */
async function isClientHealthy(): Promise<boolean> {
  if (!cdpPort) {
    return false;
  }
  
  // Check real Electron PID (the actual process, not the launcher)
  if (electronPid && !isProcessAlive(electronPid)) {
    console.log('[host] Real Electron PID no longer alive');
    return false;
  }
  
  // Check CDP port (authoritative signal — if CDP responds, the process is alive)
  const cdpOk = await isPortResponding(cdpPort);
  if (!cdpOk) {
    console.log('[host] CDP port not responding');
    return false;
  }
  
  // If we don't have the real PID yet, try to discover it from the CDP port
  if (!electronPid) {
    const realPid = discoverElectronPid(cdpPort);
    if (realPid) {
      electronPid = realPid;
      console.log(`[host] Discovered real Electron PID: ${electronPid}`);
    }
  }
  
  // Check Client pipe responsiveness (not just connectivity)
  const pipeOk = await pingClientPipe(3000);
  if (!pipeOk) {
    console.log('[host] Client pipe not responding to ping');
    return false;
  }
  
  return true;
}

// ── Client Spawn & Lifecycle ─────────────────────────────────────────────────

/**
 * Allocate a free port for CDP
 */
async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Failed to get port from server'));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Get the path to the Electron executable
 */
function getElectronPath(): string {
  // process.execPath in VS Code extension points to the Electron binary
  return process.execPath;
}

/**
 * Spawn the Extension Development Host (Client)
 * @param clientWorkspace - Workspace folder the Client should open (from host config)
 * @param extensionPath - Extension development path (from host config)
 */
async function spawnClient(clientWorkspace: string, extensionPath: string, launchFlags?: Record<string, unknown>): Promise<{ cdpPort: number; userDataDir: string; clientStartedAt: number }> {
  // Allocate ports (CDP for browser debugging + inspector for Extension Host debugging)
  const allocatedCdpPort = await allocatePort();
  const allocatedInspectorPort = await allocatePort();
  console.log(`[host] Allocated CDP port: ${allocatedCdpPort}, inspector port: ${allocatedInspectorPort}`);
  
  const electronPath = getElectronPath();
  
  // User data directory for the Client (persists state, stored alongside target workspace)
  const userDataDir = path.join(clientWorkspace, '.devtools', 'user-data');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  
  // Build launch arguments — core flags first
  const args = [
    '--extensionDevelopmentPath=' + extensionPath,
    '--remote-debugging-port=' + allocatedCdpPort,
    '--inspect-extensions=' + allocatedInspectorPort,
    '--user-data-dir=' + userDataDir,
    '--new-window',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
  ];

  // Apply launch flags from MCP config (if provided)
  if (launchFlags) {
    if (launchFlags.disableExtensions) {
      args.push('--disable-extensions');
    }
    if (launchFlags.skipReleaseNotes) {
      args.push('--skip-release-notes');
    }
    if (launchFlags.skipWelcome) {
      args.push('--skip-welcome');
    }
    if (launchFlags.disableGpu) {
      args.push('--disable-gpu');
    }
    if (launchFlags.disableWorkspaceTrust) {
      args.push('--disable-workspace-trust');
    }
    if (launchFlags.verbose) {
      args.push('--verbose');
    }
    if (typeof launchFlags.locale === 'string') {
      args.push('--locale=' + launchFlags.locale);
    }
    // Re-enable critical extensions when disable-extensions is on
    // WARNING: DO NOT use --enable-proposed-api here. We do NOT have access to
    // VS Code proposed APIs. Use --enable-extension to allowlist extensions.
    const enableExts = launchFlags.enableExtensions;
    if (launchFlags.disableExtensions && Array.isArray(enableExts)) {
      for (const ext of enableExts) {
        if (typeof ext === 'string') {
          args.push('--enable-extension=' + ext);
        }
      }
    }
    // Extra raw args
    const extraArgs = launchFlags.extraArgs;
    if (Array.isArray(extraArgs)) {
      for (const arg of extraArgs) {
        if (typeof arg === 'string') {
          args.push(arg);
        }
      }
    }
  }

  // Client workspace folder — last positional arg
  args.push(clientWorkspace);
  
  console.log('[host] Spawning Client:', electronPath);
  console.log('[host] Spawn args:', JSON.stringify(args, null, 2));

  // Strip environment variables that would make the child VS Code
  // communicate with the parent instance instead of starting fresh.
  // This matches the original working vscode.ts logic.
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.ELECTRON_NO_ASAR;
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('VSCODE_')) {
      delete childEnv[key];
    }
  }

  // `detached: true` is REQUIRED on Windows because Code.exe is a launcher
  // stub that forks the real Electron binary and immediately exits (code 9).
  // We do NOT call unref() — keep a reference so Node doesn't exit early.
  // Capture stderr for diagnostics — Code.exe may log startup failures.
  const child = spawn(electronPath, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: childEnv,
  });
  
  if (!child.pid) {
    throw new Error('Failed to spawn Client: no PID');
  }

  // Capture launcher stderr for diagnostics
  if (child.stderr) {
    let stderrOutput = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderrOutput += chunk; });
    child.stderr.on('end', () => {
      const trimmed = stderrOutput.trim();
      if (trimmed) {
        console.log(`[host] Launcher stderr: ${trimmed}`);
      }
    });
  }

  console.log(`[host] Launcher spawned — PID: ${child.pid} (may exit immediately on Windows)`);

  // Track launcher exit (on Windows this fires almost immediately with code=9)
  child.on('exit', (code, signal) => {
    console.log(`[host] Launcher process exited: code=${code}, signal=${signal}`);
    if (clientProcess === child) {
      clientProcess = null;
      launcherPid = null;
    }
  });

  child.on('error', (err) => {
    console.log(`[host] Spawn error: ${err.message}`);
    clientProcess = null;
    launcherPid = null;
  });

  // Store state — note: this is the LAUNCHER PID, not the real Electron PID
  clientProcess = child;
  launcherPid = child.pid;
  electronPid = null; // Will be discovered after CDP port becomes available
  cdpPort = allocatedCdpPort;
  inspectorPort = allocatedInspectorPort;
  clientStartedAt = Date.now();
  currentExtensionPath = extensionPath;
  currentClientWorkspace = clientWorkspace;
  const spawnTimestamp = clientStartedAt;
  
  // Wait for Client to be ready (poll CDP and pipe — NOT PID)
  await waitForClientReady(allocatedCdpPort);

  // After CDP is ready, discover the REAL Electron PID from the port.
  // On Windows, Code.exe (launcher) exits immediately — the real Electron
  // process is the one actually listening on the CDP port.
  const realPid = discoverElectronPid(allocatedCdpPort);
  if (realPid) {
    electronPid = realPid;
    console.log(`[host] Real Electron PID: ${electronPid}`);
  } else {
    console.log('[host] Warning: could not discover Electron PID — cleanup may be incomplete');
  }

  // Attach debugger to the Client's Extension Host inspector.
  // This lights up the full debug UI: orange status bar, floating toolbar, call stack.
  try {
    await attachDebuggerToInspector(allocatedInspectorPort);
    console.log('[host] Debug session attached — full debug UI active');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[host] Warning: debugger attach failed: ${msg}. Continuing without debug UI.`);
  }

  // Persist session with REAL Electron PID (not launcher PID)
  persistSession({
    clientPid: electronPid ?? child.pid,
    cdpPort: allocatedCdpPort,
    inspectorPort: allocatedInspectorPort,
    extensionPath,
    startedAt: clientStartedAt,
  });
  
  return { cdpPort: allocatedCdpPort, userDataDir, clientStartedAt: spawnTimestamp };
}

/**
 * Wait for Client to be ready (CDP HTTP server responding + pipe connectable)
 * 
 * NOTE: We use isCdpPortReady() which checks the actual CDP HTTP endpoint,
 * not just TCP connectivity. The TCP port may be open before the HTTP server
 * is ready to accept WebSocket connections.
 * 
 * Adaptive timeout: if the Client pipe comes UP (extension loaded) but CDP
 * is still DOWN, the Client IS alive and making progress — extend the wait
 * up to `adaptiveMaxMs` to give CDP time to initialize.
 */
async function waitForClientReady(port: number, maxWaitMs = 90_000, adaptiveMaxMs = 120_000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 500;
  let lastLog = 0;
  let pipeSeenUp = false;
  
  console.log(`[host] Waiting for Client to be ready (CDP port=${port}, timeout=${maxWaitMs}ms, adaptiveMax=${adaptiveMaxMs}ms)...`);
  
  while (true) {
    const elapsed = Date.now() - startTime;
    const effectiveTimeout = pipeSeenUp ? adaptiveMaxMs : maxWaitMs;

    if (elapsed >= effectiveTimeout) {
      break;
    }

    const cdpOk = await isCdpPortReady(port);
    const pipeOk = await isClientPipeConnectable();
    
    if (cdpOk && pipeOk) {
      const finalElapsed = Date.now() - startTime;
      console.log(`[host] Client is ready (CDP HTTP + pipe responding) after ${finalElapsed}ms`);
      return;
    }

    if (pipeOk && !pipeSeenUp) {
      pipeSeenUp = true;
      console.log(`[host] Client pipe is UP after ${elapsed}ms — extending timeout to ${adaptiveMaxMs}ms while waiting for CDP`);
    }
    
    // Log status every 5 seconds so we can diagnose hangs
    const now = Date.now();
    if (now - lastLog >= 5000) {
      console.log(`[host] Still waiting for Client (${elapsed}ms elapsed) — CDP: ${cdpOk ? 'UP' : 'DOWN'}, pipe: ${pipeOk ? 'UP' : 'DOWN'}${pipeSeenUp ? ' (adaptive timeout active)' : ''}`);
      lastLog = now;
    }
    
    await sleep(pollInterval);
  }
  
  // Final diagnostic before throwing
  const finalCdp = await isCdpPortReady(port);
  const finalPipe = await isClientPipeConnectable();
  const totalElapsed = Date.now() - startTime;
  throw new Error(
    `Client did not become ready within ${totalElapsed}ms — CDP: ${finalCdp ? 'UP' : 'DOWN'}, pipe: ${finalPipe ? 'UP' : 'DOWN'}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll until a port becomes available (TCP connectable).
 * Used to wait for the Extension Host inspector port before attaching debugger.
 */
async function waitForPort(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortResponding(port)) {
      return;
    }
    await sleep(300);
  }
  throw new Error(`Port ${port} did not become available within ${timeout}ms`);
}

async function attachDebuggerToInspector(port: number): Promise<void> {
  await waitForPort(port);
  await vscode.debug.startDebugging(undefined, {
    type: 'node',
    request: 'attach',
    name: `Extension Host (port ${port})`,
    port,
    autoAttachChildProcesses: false,
    skipFiles: ['<node_internals>/**'],
  });
}

async function reconnectToClient(maxWaitMs = 60_000): Promise<boolean> {
  if (reconnectPromise) {
    return reconnectPromise;
  }

  reconnectPromise = (async () => {
    if (clientReconnecting) {
      return false;
    }

    if (!cdpPort || !inspectorPort) {
      console.log('[host] Reconnect skipped: missing cdpPort or inspectorPort');
      return false;
    }

    clientReconnecting = true;
    const started = Date.now();
    console.log(`[host] Reconnect started (cdp=${cdpPort}, inspector=${inspectorPort})`);

    try {
      while (Date.now() - started < maxWaitMs) {
        const cdpOk = await isCdpPortReady(cdpPort, 2000);
        const pipeOk = await isClientPipeConnectable(2000);
        if (cdpOk && pipeOk) {
          break;
        }
        await sleep(400);
      }

      const cdpAlive = await isCdpPortReady(cdpPort, 2500);
      const pipeAlive = await isClientPipeConnectable(2500);
      if (!cdpAlive || !pipeAlive) {
        console.log(`[host] Reconnect timed out — cdp=${cdpAlive}, pipe=${pipeAlive}`);
        return false;
      }

      const refreshedPid = discoverElectronPid(cdpPort);
      if (refreshedPid) {
        electronPid = refreshedPid;
        console.log(`[host] Reconnect discovered Electron PID: ${electronPid}`);
      }

      if (currentDebugSession) {
        try {
          await vscode.debug.stopDebugging(currentDebugSession);
        } catch {
          // session may have already ended
        }
      }

      await attachDebuggerToInspector(inspectorPort);
      console.log('[host] Reconnect debugger attach complete');

      const pidToPersist = electronPid ?? launcherPid;
      if (pidToPersist && currentExtensionPath && clientStartedAt) {
        persistSession({
          clientPid: pidToPersist,
          cdpPort,
          inspectorPort,
          extensionPath: currentExtensionPath,
          startedAt: clientStartedAt,
        });
      }

      void notifyMcpClientReconnected({
        electronPid,
        cdpPort,
        inspectorPort,
        at: Date.now(),
      }).catch(() => {
        // best-effort notification
      });

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[host] Reconnect failed: ${msg}`);
      return false;
    } finally {
      clientReconnecting = false;
    }
  })().finally(() => {
    reconnectPromise = null;
  });

  return reconnectPromise;
}

/**
 * Stop the Client process.
 *
 * On Windows, Code.exe is a launcher stub that exits immediately.
 * We track the REAL Electron PID (discovered from CDP port) and
 * kill its entire process tree with `taskkill /F /T`.
 */
function stopClient(): void {
  let pidToKill = electronPid;

  // Fallback: rediscover from CDP port if we lost the real PID
  if (!pidToKill && cdpPort) {
    pidToKill = discoverElectronPid(cdpPort);
    if (pidToKill) {
      console.log(`[host] Rediscovered Electron PID ${pidToKill} from CDP port ${cdpPort}`);
    }
  }

  // Kill the real Electron process
  if (pidToKill) {
    try {
      console.log('[host] Stopping real Electron PID:', pidToKill);
      if (IS_WINDOWS) {
        execSync(`taskkill /F /T /PID ${pidToKill}`, { stdio: 'ignore' });
      } else {
        process.kill(pidToKill, 'SIGKILL');
      }
    } catch {
      // Process may have already exited
    }
  }

  // Also try the launcher PID (may still be alive on non-Windows)
  if (launcherPid && launcherPid !== pidToKill) {
    try {
      if (IS_WINDOWS) {
        execSync(`taskkill /F /T /PID ${launcherPid}`, { stdio: 'ignore' });
      } else {
        process.kill(launcherPid, 'SIGKILL');
      }
    } catch {
      // Process may have already exited
    }
  }
  
  clientProcess = null;
  launcherPid = null;
  electronPid = null;
  cdpPort = null;
  inspectorPort = null;
  clientStartedAt = null;
  currentExtensionPath = null;
  currentClientWorkspace = null;
  clientReconnecting = false;
  reconnectPromise = null;
  clearPersistedSession();
}

// ── RPC Handlers ────────────────────────────────────────────────────────────

/**
 * Register all Host RPC handlers with the bootstrap
 */
export function registerHostHandlers(register: RegisterHandler, context: vscode.ExtensionContext): void {
  console.log('[host] Registering Host RPC handlers');

  // Initialize the hot reload service (content-hash change detection)
  const hotReloadService = createHotReloadService(context.workspaceState);
  
  /**
   * mcpReady — MCP announces it's online
   * Host spawns Client (or reconnects to existing) and returns connection info
   */
  register('mcpReady', async (params) => {
    console.log('[host] mcpReady called with params:', JSON.stringify(params));

    // Signal that the MCP server is ready (unblocks mcpStatus tool if waiting)
    signalMcpReady();

    // MCP tells us where the client workspace and extension are
    const clientWorkspace = typeof params.clientWorkspace === 'string' ? params.clientWorkspace : undefined;
    const extensionPath = typeof params.extensionPath === 'string' ? params.extensionPath : undefined;
    const launchFlags = typeof params.launch === 'object' && params.launch !== null
      ? params.launch as Record<string, unknown>
      : undefined;
    const forceRestart = typeof params.forceRestart === 'boolean' ? params.forceRestart : false;
    
    if (!clientWorkspace) {
      throw new Error('mcpReady: clientWorkspace is required');
    }
    if (!extensionPath) {
      throw new Error('mcpReady: extensionPath is required');
    }
    
    // Check if extension source changed (content hash, not mtime)
    const extCheck = await hotReloadService.checkExtensionOnly(extensionPath);
    if (extCheck.changed && !extCheck.rebuilt) {
      console.log('[host] Extension build failed: ' + (extCheck.buildError ?? 'unknown'));
    }

    // Check for existing healthy Client
    const session = loadPersistedSession();
    if (session) {
      electronPid = session.clientPid; // Persisted PID is the real Electron PID
      cdpPort = session.cdpPort;
      inspectorPort = session.inspectorPort;
      currentExtensionPath = session.extensionPath;

      if (forceRestart) {
        // MCP explicitly requested a restart — Client is unresponsive
        console.log('[host] forceRestart requested — stopping existing Client unconditionally');
        stopClient();
        clearPersistedSession();
        electronPid = null;
        cdpPort = null;
        inspectorPort = null;
        currentExtensionPath = null;
        await waitForPipeRelease();
      } else {
        const healthy = await isClientHealthy();
        if (healthy && !extCheck.changed) {
          console.log('[host] Existing Client is healthy and build is current, returning connection info');
          const dataDir = path.join(clientWorkspace, '.devtools', 'user-data');
          return { cdpPort: session.cdpPort, userDataDir: dataDir, clientStartedAt: session.startedAt };
        }

        // Client exists but source changed — restart with fresh code
        if (healthy && extCheck.rebuilt) {
          console.log('[host] Extension source changed — stopping existing Client to restart with fresh code');
        } else {
          console.log('[host] Persisted session exists but Client is not healthy');
        }
        stopClient();
        clearPersistedSession();
        electronPid = null;
        cdpPort = null;
        inspectorPort = null;
        currentExtensionPath = null;
        await waitForPipeRelease();
      }
    }
    
    // Spawn new Client with MCP-provided paths (build is guaranteed up-to-date)
    console.log(`[host] Spawning new Client — workspace: ${clientWorkspace}, ext: ${extensionPath}`);
    const result = await spawnClient(clientWorkspace, extensionPath, launchFlags);
    return { cdpPort: result.cdpPort, userDataDir: result.userDataDir, clientStartedAt: result.clientStartedAt };
  });
  
  /**
   * hotReloadRequired — Extension files changed
   * Host rebuilds, restarts Client, returns new connection info
   */
  register('hotReloadRequired', async (params) => {
    console.log('[host] hotReloadRequired called');
    hotReloadInProgress = true;
    
    const clientWorkspace = typeof params.clientWorkspace === 'string' ? params.clientWorkspace : undefined;
    const extensionPath = typeof params.extensionPath === 'string' ? params.extensionPath : undefined;
    const launchFlags = typeof params.launch === 'object' && params.launch !== null
      ? params.launch as Record<string, unknown>
      : undefined;
    
    if (!clientWorkspace || !extensionPath) {
      throw new Error('hotReloadRequired: clientWorkspace and extensionPath are required');
    }
    
    try {
      // Stop existing Client
      stopClient();
      
      // Wait for pipe to be released before spawning new Client
      await waitForPipeRelease();
      
      // Ensure build is up-to-date before relaunching (content hash check)
      await hotReloadService.checkExtensionOnly(extensionPath);
      
      // Spawn fresh Client with latest build
      const result = await spawnClient(clientWorkspace, extensionPath, launchFlags);
      
      return { cdpPort: result.cdpPort, userDataDir: result.userDataDir, clientStartedAt: result.clientStartedAt };
    } finally {
      hotReloadInProgress = false;
    }
  });

  /**
   * clientShuttingDown — Client notifies Host before extension host reload/deactivate.
   * If CDP is still alive, this is likely a reload and we should reconnect.
   */
  register('clientShuttingDown', async (params) => {
    const reason = typeof params.reason === 'string' ? params.reason : 'unknown';
    console.log(`[host] clientShuttingDown received: reason=${reason}`);

    if (hotReloadInProgress) {
      return { acknowledged: true, reconnecting: false, ignored: 'hot-reload' };
    }

    if (!cdpPort) {
      return { acknowledged: true, reconnecting: false, ignored: 'no-cdp-port' };
    }

    const cdpStillAlive = await isCdpPortReady(cdpPort, 2000);
    if (!cdpStillAlive) {
      console.log('[host] CDP is down after shutdown notification; treating as close');
      return { acknowledged: true, reconnecting: false, ignored: 'cdp-down' };
    }

    void reconnectToClient().then((ok) => {
      console.log(`[host] Background reconnect completed: ${ok ? 'success' : 'failed'}`);
    });

    return { acknowledged: true, reconnecting: true };
  });
  
  /**
   * getStatus — Query current state
   */
  register('getStatus', async (_params) => {
    const healthy = cdpPort ? await isClientHealthy() : false;
    
    return {
      clientConnected: healthy,
      launcherPid,
      electronPid,
      cdpPort,
      inspectorPort,
      clientReconnecting,
      hotReloadInProgress,
    };
  });
  
  /**
   * takeover — Another VS Code instance wants to become Host
   */
  register('takeover', async (params) => {
    const reason = (params.reason as string) || 'unknown';
    console.log('[host] takeover requested:', reason);
    
    // Show notification to user
    const choice = await vscode.window.showInformationMessage(
      `Your DevTools session was overridden: ${reason}`,
      'Reclaim'
    );
    
    if (choice === 'Reclaim') {
      // TODO: Send takeover to new Host
      console.log('[host] User wants to reclaim, but this is not yet implemented');
    }
    
    // Gracefully shut down
    stopClient();
    
    // Note: The pipe server will be stopped separately by the bootstrap
    // when the extension deactivates
    
    return { acknowledged: true };
  });
  
  /**
   * teardown — MCP server is shutting down
   * Stop Client, clean up debug sessions, release resources
   */
  register('teardown', async (_params) => {
    console.log('[host] teardown called — MCP server shutting down');
    
    // Stop any debug sessions first
    if (currentDebugSession) {
      try {
        await vscode.debug.stopDebugging();
        console.log('[host] Debug sessions stopped');
      } catch {
        // Session may have already ended
      }
    }
    
    // Stop the Client process
    stopClient();
    
    return { stopped: true };
  });
  
  /**
   * readyToRestart — MCP server has drained its queue and is ready to be stopped.
   *
   * The build was already completed during `checkForChanges`, so this is just:
   * stop → clear tool cache → start. Near-instant since no build step.
   *
   * Deduplication guard: if a restart is already in progress, subsequent calls
   * wait for the existing restart to complete instead of triggering another.
   */
  // ── MCP Progress Bridge ─────────────────────────────────
  // Bridges the progress notification started during checkForChanges
  // (rebuild phase) into readyToRestart (stop/clear/start phases).
  // If the MCP process crashes before calling readyToRestart, a 30s
  // safety timeout closes the notification automatically.
  interface McpProgressBridge {
    report: (message: string) => void;
    resolve: () => void;
  }
  let mcpProgressBridge: McpProgressBridge | null = null;

  let restartInProgress: Promise<Record<string, unknown>> | null = null;

  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const handleMcpRestart = async (): Promise<Record<string, unknown>> => {
    if (restartInProgress) {
      console.log('[host] MCP restart already in progress — waiting');
      return restartInProgress;
    }

    const doRestart = async (): Promise<Record<string, unknown>> => {
      console.log('[host] readyToRestart — stop → clearCache → start');
      const serverId = await resolveMcpServerId();
      const bridge = mcpProgressBridge;
      mcpProgressBridge = null;

      if (bridge) {
        // Continue in the progress notification started by checkForChanges
        bridge.report('Stopping…');
        try {
          await vscode.commands.executeCommand('workbench.mcp.stopServer', serverId);
          console.log('[host] MCP server stopped');
        } catch (stopErr) {
          const msg = stopErr instanceof Error ? stopErr.message : String(stopErr);
          console.log('[host] MCP stopServer failed: ' + msg + ' — continuing');
        }

        bridge.report('Clearing tool cache…');
        try {
          await vscode.commands.executeCommand('workbench.mcp.resetCachedTools');
          console.log('[host] Tool cache cleared');
        } catch (cacheErr) {
          const msg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr);
          console.log('[host] resetCachedTools failed: ' + msg);
        }

        bridge.report('Starting…');
        try {
          await vscode.commands.executeCommand('workbench.mcp.startServer', serverId);
          console.log('[host] MCP server started');
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          console.log('[host] MCP startServer failed: ' + msg);
          vscode.window.showWarningMessage('❌ MCP Server failed to start: ' + msg);
          bridge.resolve();
          return { restarted: false, error: msg };
        }

        bridge.resolve();
        return { restarted: true, toolCacheCleared: true };
      }

      // Fallback: no bridge (e.g., manual restart via command palette)
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'MCP Server',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Stopping…', increment: 0 });
          try {
            await vscode.commands.executeCommand('workbench.mcp.stopServer', serverId);
            console.log('[host] MCP server stopped');
          } catch (stopErr) {
            const msg = stopErr instanceof Error ? stopErr.message : String(stopErr);
            console.log('[host] MCP stopServer failed: ' + msg + ' — continuing');
          }

          progress.report({ message: 'Clearing tool cache…', increment: 33 });
          try {
            await vscode.commands.executeCommand('workbench.mcp.resetCachedTools');
            console.log('[host] Tool cache cleared');
          } catch (cacheErr) {
            const msg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr);
            console.log('[host] resetCachedTools failed: ' + msg);
          }

          progress.report({ message: 'Starting…', increment: 33 });
          try {
            await vscode.commands.executeCommand('workbench.mcp.startServer', serverId);
            console.log('[host] MCP server started');
          } catch (startErr) {
            const msg = startErr instanceof Error ? startErr.message : String(startErr);
            console.log('[host] MCP startServer failed: ' + msg);
            vscode.window.showWarningMessage('❌ MCP Server failed to start: ' + msg);
            return { restarted: false, error: msg };
          }

          progress.report({ message: '✅ Restarted', increment: 34 });
          await delay(3000);
          return { restarted: true, toolCacheCleared: true };
        },
      );
    };

    try {
      restartInProgress = doRestart();
      return await restartInProgress;
    } finally {
      restartInProgress = null;
    }
  };

  register('readyToRestart', async () => handleMcpRestart());

  /**
   * checkForChanges — MCP server asks extension to check for source changes.
   *
   * Called per-batch by the RequestPipeline. Detects changes via content
   * hashing, rebuilds if changed, and shows progress notifications:
   *   - Extension notification: Rebuilding → Stopping client → Launching client → ✅ Connected
   *   - MCP Server notification: Rebuilding → Rebuilt ✓ (bridges into readyToRestart)
   * Both notifications can appear simultaneously when both packages changed.
   */
  register('checkForChanges', async (params) => {
    const mcpServerRoot = typeof params.mcpServerRoot === 'string' ? params.mcpServerRoot : undefined;
    const extensionPath = typeof params.extensionPath === 'string' ? params.extensionPath : undefined;

    if (!mcpServerRoot || !extensionPath) {
      throw new Error('checkForChanges: mcpServerRoot and extensionPath are required');
    }

    const result: ChangeCheckResult = {
      mcpChanged: false,
      mcpRebuilt: false,
      mcpBuildError: null,
      extChanged: false,
      extRebuilt: false,
      extBuildError: null,
      extClientReloaded: false,
      newCdpPort: null,
      newClientStartedAt: null,
    };

    // Phase 1: Detect changes (fast hash checks only — no builds yet)
    const extChange = hotReloadService.detectChange(extensionPath, 'ext');
    const mcpChange = hotReloadService.detectChange(mcpServerRoot, 'mcp');
    result.extChanged = extChange.changed;
    result.mcpChanged = mcpChange.changed;

    if (!extChange.changed && !mcpChange.changed) {
      return result;
    }

    // Phase 2: Extension progress notification — rebuild → stop client → launch client
    if (extChange.changed) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Extension',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Rebuilding…' });
          const buildError = await hotReloadService.runBuild(extensionPath, 'compile');
          if (buildError) {
            result.extBuildError = buildError;
            return;
          }

          await hotReloadService.commitHash('ext', extChange.currentHash);
          result.extRebuilt = true;

          // Capture workspace before stopClient clears it
          const workspace = currentClientWorkspace;

          progress.report({ message: 'Stopping client window…' });
          stopClient();
          await waitForPipeRelease();

          if (workspace) {
            progress.report({ message: 'Launching client window…' });
            const spawnResult = await spawnClient(workspace, extensionPath);
            result.extClientReloaded = true;
            result.newCdpPort = spawnResult.cdpPort;
            result.newClientStartedAt = spawnResult.clientStartedAt;
            console.log('[host] Client restarted with fresh extension code (cdpPort: ' + spawnResult.cdpPort + ')');

            progress.report({ message: '✅ Client reconnected' });
            await delay(3000);
          }
        },
      );
    }

    // Phase 3: MCP progress notification — rebuild → bridge to readyToRestart
    if (mcpChange.changed) {
      let buildDoneResolve!: (error: string | null) => void;
      const buildDone = new Promise<string | null>(r => { buildDoneResolve = r; });

      let bridgeResolve!: () => void;
      const bridgePromise = new Promise<void>(r => { bridgeResolve = r; });

      // Fire-and-forget: the notification stays open until readyToRestart completes
      void vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'MCP Server',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Rebuilding…' });
          const buildError = await hotReloadService.runBuild(mcpServerRoot, 'build');
          buildDoneResolve(buildError);

          if (buildError) {
            return;
          }

          progress.report({ message: 'Rebuilt ✓ — restarting…' });

          // Store bridge so readyToRestart can continue this notification
          mcpProgressBridge = {
            report: (msg: string) => progress.report({ message: msg }),
            resolve: bridgeResolve,
          };

          // Keep notification open until readyToRestart resolves (or 30s safety timeout)
          const safetyTimeout = setTimeout(() => {
            if (mcpProgressBridge) {
              mcpProgressBridge = null;
              bridgeResolve();
            }
          }, 30_000);

          await bridgePromise;
          clearTimeout(safetyTimeout);

          progress.report({ message: '✅ Restarted' });
          await delay(3000);
        },
      );

      // Wait only for the build to finish, then return result to MCP
      const buildError = await buildDone;
      if (buildError) {
        result.mcpBuildError = buildError;
      } else {
        await hotReloadService.commitHash('mcp', mcpChange.currentHash);
        result.mcpRebuilt = true;
        expectMcpRestart();
      }
    }

    return result;
  });

  // Track debug session lifecycle
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      currentDebugSession = session;
      console.log('[host] Debug session started:', session.name);
    }),
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (currentDebugSession?.id === session.id) {
        currentDebugSession = null;
        console.log('[host] Debug session ended:', session.name);
      }
    })
  );
}

/**
 * Export for extension.ts to check hot-reload state
 */
export function isHotReloadInProgress(): boolean {
  return hotReloadInProgress;
}

/**
 * Export for deactivate cleanup
 */
export function cleanup(): void {
  stopClient();
}
