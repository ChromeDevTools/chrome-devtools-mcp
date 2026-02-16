/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client Pipe Client
 *
 * Connects to the Client extension's pipe server (Extension Development Host)
 * to interact with terminal, output channel, and VS Code command APIs.
 *
 * Terminal methods (single-terminal model):
 * - terminal.run: Run a command, wait for completion/prompt/timeout
 * - terminal.input: Send input to a waiting prompt
 * - terminal.state: Check current terminal state
 * - terminal.kill: Send Ctrl+C to stop the running process
 * - terminal.listAll: List all terminals (tracked + untracked)
 *
 * Output methods:
 * - output.listChannels: List VS Code output channels
 * - output.read: Read output channel content
 *
 * Command methods:
 * - command.execute: Execute a VS Code command
 */

import net from 'node:net';
import {logger} from './logger.js';

// ── Constants ────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32';
const CLIENT_PIPE_PATH = IS_WINDOWS
  ? '\\\\.\\pipe\\vscode-devtools-client'
  : '/tmp/vscode-devtools-client.sock';

const DEFAULT_TIMEOUT_MS = 10_000;
// Terminal operations wait up to 35s so the 30s command timeout finishes first
const TERMINAL_TIMEOUT_MS = 35_000;

// ── Types ────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {code: number; message: string; data?: unknown};
}

// ── Type-safe result assertion ───────────────────────────

function assertResult<T extends object>(result: unknown, method: string): asserts result is T {
  if (typeof result !== 'object' || result === null) {
    throw new Error(
      `Invalid response from Client ${method}: expected object, got ${typeof result}`,
    );
  }
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jsonrpc' in value &&
    ('result' in value || 'error' in value)
  );
}

export type TerminalStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'waiting_for_input'
  | 'timeout';

export type WaitMode = 'completion' | 'background';

export interface ActiveProcess {
  terminalName: string;
  pid?: number;
  command: string;
  status: TerminalStatus;
  startedAt: string;
  durationMs: number;
  exitCode?: number;
}

export type ProcessStatus = 'running' | 'completed' | 'killed' | 'orphaned';

export interface ChildProcessInfo {
  pid: number;
  name: string;
  commandLine: string;
  parentPid: number;
}

export interface ProcessEntry {
  pid: number;
  command: string;
  terminalName: string;
  status: ProcessStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  sessionId: string;
  children?: ChildProcessInfo[];
}

export interface ProcessLedgerSummary {
  active: ProcessEntry[];
  orphaned: ProcessEntry[];
  recentlyCompleted: ProcessEntry[];
  terminalSessions: TerminalSessionInfo[];
  sessionId: string;
}

export interface TerminalRunResult {
  status: TerminalStatus;
  output: string;
  shell?: string;
  cwd?: string;
  exitCode?: number;
  prompt?: string;
  pid?: number;
  name?: string;
  durationMs?: number;
  activeProcesses?: ActiveProcess[];
  terminalSessions?: TerminalSessionInfo[];
}

export interface TerminalSessionInfo {
  name: string;
  shell?: string;
  pid?: number;
  isActive: boolean;
  status: string;
  command?: string;
}

export interface OutputChannelsResult {
  channels: string[];
}

export interface OutputReadResult {
  lines: string[];
  warning?: string;
}

export interface CommandExecuteResult {
  result: unknown;
}

// ── JSON-RPC Transport ───────────────────────────────────

/**
 * Send a JSON-RPC 2.0 request to the Client pipe and await the response.
 */
function sendClientRequest(
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    logger(`[client-pipe] ${method} → ${CLIENT_PIPE_PATH} (timeout=${timeoutMs}ms)`);
    const client = net.createConnection(CLIENT_PIPE_PATH);
    const reqId = `${method}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let response = '';
    let settled = false;
    client.setEncoding('utf8');

    const settle = (fn: typeof resolve | typeof reject, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client.destroy();
      } catch {
        /* best-effort */
      }
      fn(value);
    };

    client.on('connect', () => {
      logger(`[client-pipe] ${method} connected — sending request (id=${reqId})`);
      const request =
        JSON.stringify({jsonrpc: '2.0', id: reqId, method, params}) + '\n';
      client.write(request);
    });

    client.on('data', (chunk: string) => {
      if (settled) return;
      response += chunk;
      const nlIdx = response.indexOf('\n');
      if (nlIdx !== -1) {
        try {
          const rawParsed: unknown = JSON.parse(
            response.slice(0, nlIdx),
          );
          if (!isJsonRpcResponse(rawParsed)) {
            settle(
              reject,
              new Error(`Invalid JSON-RPC response from Client ${method}`),
            );
            return;
          }
          if (rawParsed.error) {
            logger(
              `[client-pipe] ${method} ✗ error: [${rawParsed.error.code}] ${rawParsed.error.message}`,
            );
            settle(
              reject,
              new Error(
                `Client ${method} failed [${rawParsed.error.code}]: ${rawParsed.error.message}`,
              ),
            );
          } else {
            logger(`[client-pipe] ${method} ✓ success`);
            settle(resolve, rawParsed.result);
          }
        } catch (e: unknown) {
          settle(
            reject,
            new Error(
              `Failed to parse Client response: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
        }
      }
    });

    client.on('error', (err: Error) => {
      logger(`[client-pipe] ${method} ✗ connection error: ${err.message}`);
      settle(reject, new Error(`Client connection error: ${err.message}`));
    });

    client.on('close', () => {
      settle(
        reject,
        new Error(
          `Client ${method} socket closed before response was received`,
        ),
      );
    });

    const timer = setTimeout(() => {
      logger(`[client-pipe] ${method} ✗ TIMEOUT after ${timeoutMs}ms`);
      settle(
        reject,
        new Error(`Client ${method} request timed out (${timeoutMs}ms)`),
      );
    }, timeoutMs);
  });
}

// ── Terminal Methods (Multi-Terminal Model) ─────────────

/**
 * Run a PowerShell command in a named terminal.
 * Creates terminal if needed, rejects with state if busy.
 * Waits for completion, prompt detection, or timeout.
 *
 * @param command The PowerShell command to execute
 * @param cwd Absolute path to working directory for command execution
 * @param timeout Max wait time in milliseconds (default: 120000)
 * @param name Terminal name (default: 'default')
 * @param waitMode 'completion' blocks until done; 'background' returns immediately
 */
export async function terminalRun(
  command: string,
  cwd: string,
  timeout?: number,
  name?: string,
  waitMode?: WaitMode,
): Promise<TerminalRunResult> {
  const result = await sendClientRequest(
    'terminal.run',
    {command, cwd, timeout, name, waitMode},
    TERMINAL_TIMEOUT_MS,
  );
  assertResult<TerminalRunResult>(result, 'terminal.run');
  return result;
}

/**
 * Send input to a terminal waiting for a prompt.
 * Waits for the next completion or prompt after sending.
 *
 * @param text The text to send
 * @param addNewline Whether to press Enter after (default: true)
 * @param timeout Max wait time in milliseconds (default: 30000)
 * @param name Terminal name (default: 'default')
 */
export async function terminalInput(
  text: string,
  addNewline?: boolean,
  timeout?: number,
  name?: string,
): Promise<TerminalRunResult> {
  const result = await sendClientRequest(
    'terminal.input',
    {text, addNewline, timeout, name},
    TERMINAL_TIMEOUT_MS,
  );
  assertResult<TerminalRunResult>(result, 'terminal.input');
  return result;
}

/**
 * Get the current terminal state without modifying anything.
 *
 * @param name Terminal name (default: 'default')
 */
export async function terminalGetState(name?: string): Promise<TerminalRunResult> {
  const result = await sendClientRequest('terminal.state', {name});
  assertResult<TerminalRunResult>(result, 'terminal.state');
  return result;
}

/**
 * Send Ctrl+C to kill the running process in a terminal.
 *
 * @param name Terminal name (default: 'default')
 */
export async function terminalKill(name?: string): Promise<TerminalRunResult> {
  const result = await sendClientRequest('terminal.kill', {name});
  assertResult<TerminalRunResult>(result, 'terminal.kill');
  return result;
}

// ── Output Methods ───────────────────────────────────────

/**
 * List available output channels.
 */
export async function outputListChannels(): Promise<OutputChannelsResult> {
  const result = await sendClientRequest('output.listChannels', {});
  assertResult<OutputChannelsResult>(result, 'output.listChannels');
  return result;
}

/**
 * Read content from an output channel.
 */
export async function outputRead(
  channel: string,
): Promise<OutputReadResult> {
  const result = await sendClientRequest('output.read', {channel});
  assertResult<OutputReadResult>(result, 'output.read');
  return result;
}

// ── Command Methods ──────────────────────────────────────

/**
 * Execute a VS Code command in the Client window.
 */
export async function commandExecute(
  command: string,
  args?: unknown[],
): Promise<CommandExecuteResult> {
  const result = await sendClientRequest('command.execute', {command, args});
  assertResult<CommandExecuteResult>(result, 'command.execute');
  return result;
}

// ── Codebase Types ───────────────────────────────────────

export interface CodebaseSymbolNode {
  name: string;
  kind: string;
  detail?: string;
  range: {start: number; end: number};
  children?: CodebaseSymbolNode[];
}

export interface CodebaseTreeNode {
  name: string;
  type: 'directory' | 'file';
  children?: CodebaseTreeNode[];
  symbols?: CodebaseSymbolNode[];
  imports?: string[];
  lines?: number;
}

export interface CodebaseOverviewResult {
  projectRoot: string;
  tree: CodebaseTreeNode[];
  summary: {
    totalFiles: number;
    totalDirectories: number;
    totalSymbols: number;
    diagnosticCounts?: {errors: number; warnings: number};
  };
}

export interface CodebaseExportInfo {
  name: string;
  kind: string;
  signature?: string;
  jsdoc?: string;
  line: number;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
}

export interface CodebaseExportsResult {
  module: string;
  exports: CodebaseExportInfo[];
  reExports: Array<{name: string; from: string}>;
  summary: string;
}

// ── Codebase Trace Symbol Types ──────────────────────────

export interface SymbolLocationInfo {
  file: string;
  line: number;
  column: number;
  kind?: string;
  signature?: string;
  unresolved?: boolean;
}

export interface ReferenceInfo {
  file: string;
  line: number;
  column: number;
  context: string;
  kind: 'read' | 'write' | 'call' | 'import' | 'type-ref' | 'unknown';
}

export interface ReExportInfo {
  file: string;
  line: number;
  originalName: string;
  exportedAs: string;
  from: string;
}

export interface CallChainNode {
  symbol: string;
  file: string;
  line: number;
  column: number;
}

export interface CallChainInfo {
  incomingCalls: CallChainNode[];
  outgoingCalls: CallChainNode[];
  incomingTruncated?: boolean;
  outgoingTruncated?: boolean;
}

export interface TypeFlowInfo {
  direction: 'parameter' | 'return' | 'extends' | 'implements' | 'property';
  type: string;
  traceTo?: {symbol: string; file: string; line: number};
}

export interface ImpactDependentInfo {
  symbol: string;
  file: string;
  line: number;
  kind: string;
}

export interface ImpactInfo {
  directDependents: ImpactDependentInfo[];
  transitiveDependents: ImpactDependentInfo[];
  impactSummary: {
    directFiles: number;
    transitiveFiles: number;
    totalSymbolsAffected: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export interface TypeHierarchyNode {
  name: string;
  kind: 'class' | 'interface' | 'type-alias';
  file: string;
  line: number;
  column: number;
}

export interface TypeHierarchyInfo {
  supertypes: TypeHierarchyNode[];
  subtypes: TypeHierarchyNode[];
  stats: {
    totalSupertypes: number;
    totalSubtypes: number;
    maxDepth: number;
  };
}

export interface CodebaseTraceSymbolResult {
  symbol: string;
  definition?: SymbolLocationInfo;
  references: ReferenceInfo[];
  reExports: ReExportInfo[];
  callChain: CallChainInfo;
  typeFlows: TypeFlowInfo[];
  hierarchy?: TypeHierarchyInfo;
  summary: {
    totalReferences: number;
    totalFiles: number;
    maxCallDepth: number;
  };
  impact?: ImpactInfo;
  /** True if results were truncated due to timeout or maxReferences limit. */
  partial?: boolean;
  /** Reason for partial results. */
  partialReason?: 'timeout' | 'max-references';
  /** Elapsed time in milliseconds. */
  elapsedMs?: number;
  /** Number of source files in the project. */
  sourceFileCount?: number;
  /** Calculated effective timeout in milliseconds. */
  effectiveTimeout?: number;
  /** Error message if an error occurred during tracing. */
  errorMessage?: string;
  /** Reason why symbol was not found. */
  notFoundReason?: 'no-project' | 'no-matching-files' | 'symbol-not-found' | 'file-not-in-project' | 'parse-error';
  /** Resolved absolute path used as the project root. */
  resolvedRootDir?: string;
  /** Diagnostic messages (e.g., excessive node_modules references). */
  diagnostics?: string[];
}

// ── Codebase Methods ─────────────────────────────────────

/**
 * Get a structural overview of the codebase as a recursive tree.
 */
export async function codebaseGetOverview(
  rootDir?: string,
  depth?: number,
  filter?: string,
  includeImports?: boolean,
  includeStats?: boolean,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<CodebaseOverviewResult> {
  const result = await sendClientRequest(
    'codebase.getOverview',
    {rootDir, depth, filter, includeImports, includeStats, includePatterns, excludePatterns},
    30_000,
  );
  assertResult<CodebaseOverviewResult>(result, 'codebase.getOverview');
  return result;
}

/**
 * Get detailed exports from a module/file/directory.
 */
export async function codebaseGetExports(
  path: string,
  rootDir?: string,
  includeTypes?: boolean,
  includeJSDoc?: boolean,
  kind?: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<CodebaseExportsResult> {
  const result = await sendClientRequest(
    'codebase.getExports',
    {path, rootDir, includeTypes, includeJSDoc, kind, includePatterns, excludePatterns},
    30_000,
  );
  assertResult<CodebaseExportsResult>(result, 'codebase.getExports');
  return result;
}

/**
 * Trace a symbol through the codebase: definitions, references, re-exports,
 * call hierarchy, type flows, and optional impact analysis.
 */
export async function codebaseTraceSymbol(
  symbol: string,
  rootDir?: string,
  file?: string,
  line?: number,
  column?: number,
  depth?: number,
  include?: string[],
  includeImpact?: boolean,
  maxReferences?: number,
  timeout?: number,
  forceRefresh?: boolean,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<CodebaseTraceSymbolResult> {
  const result = await sendClientRequest(
    'codebase.traceSymbol',
    {symbol, rootDir, file, line, column, depth, include, includeImpact, maxReferences, timeout, forceRefresh, includePatterns, excludePatterns},
    Math.max(60_000, (timeout ?? 30_000) + 5_000),
  );
  assertResult<CodebaseTraceSymbolResult>(result, 'codebase.traceSymbol');
  return result;
}

// ── Dead Code Detection Types ────────────────────────────

export interface DeadCodeItem {
  name: string;
  kind: string;
  file: string;
  line: number;
  exported: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DeadCodeResult {
  deadCode: DeadCodeItem[];
  summary: {
    totalScanned: number;
    totalDead: number;
    scanDurationMs: number;
    byKind?: Record<string, number>;
  };
  errorMessage?: string;
  resolvedRootDir?: string;
  diagnostics?: string[];
}

/**
 * Find dead code: unused exports, unreachable functions, dead variables.
 */
export async function codebaseFindDeadCode(
  rootDir?: string,
  pattern?: string,
  exportedOnly?: boolean,
  excludeTests?: boolean,
  kinds?: string[],
  limit?: number,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<DeadCodeResult> {
  const result = await sendClientRequest(
    'codebase.findDeadCode',
    {rootDir, pattern, exportedOnly, excludeTests, kinds, limit, includePatterns, excludePatterns},
    60_000,
  );
  assertResult<DeadCodeResult>(result, 'codebase.findDeadCode');
  return result;
}

// ── Import Graph Types ───────────────────────────────────

export interface ImportGraphModule {
  path: string;
  imports: string[];
  importedBy: string[];
}

export interface CircularChain {
  chain: string[];
}

export interface ImportGraphResult {
  modules: Record<string, ImportGraphModule>;
  circular: CircularChain[];
  orphans: string[];
  stats: {
    totalModules: number;
    totalEdges: number;
    circularCount: number;
    orphanCount: number;
  };
  errorMessage?: string;
}

/**
 * Get the import graph for a codebase: module dependencies, circular chains, orphans.
 */
export async function codebaseGetImportGraph(
  rootDir?: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<ImportGraphResult> {
  const result = await sendClientRequest(
    'codebase.getImportGraph',
    {rootDir, includePatterns, excludePatterns},
    60_000,
  );
  assertResult<ImportGraphResult>(result, 'codebase.getImportGraph');
  return result;
}

// ── Duplicate Detection Types ────────────────────────────

export interface DuplicateInstance {
  file: string;
  name: string;
  line: number;
  endLine: number;
}

export interface DuplicateGroup {
  hash: string;
  kind: string;
  lineCount: number;
  instances: DuplicateInstance[];
}

export interface DuplicateDetectionResult {
  groups: DuplicateGroup[];
  summary: {
    totalGroups: number;
    totalDuplicateInstances: number;
    filesWithDuplicates: number;
    scanDurationMs: number;
  };
  resolvedRootDir?: string;
  diagnostics?: string[];
  errorMessage?: string;
}

/**
 * Find structurally duplicate code in the codebase using AST hashing.
 */
export async function codebaseFindDuplicates(
  rootDir?: string,
  kinds?: string[],
  limit?: number,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<DuplicateDetectionResult> {
  const result = await sendClientRequest(
    'codebase.findDuplicates',
    {rootDir, kinds, limit, includePatterns, excludePatterns},
    60_000,
  );
  assertResult<DuplicateDetectionResult>(result, 'codebase.findDuplicates');
  return result;
}

// ── Diagnostics Types ────────────────────────────────────

export interface DiagnosticItem {
  file: string;
  line: number;
  column: number;
  severity: string;
  code: string;
  message: string;
  source: string;
}

export interface DiagnosticsResult {
  diagnostics: DiagnosticItem[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalFiles: number;
  };
  errorMessage?: string;
}

/**
 * Get live diagnostics (errors/warnings) from VS Code's language services.
 */
export async function codebaseGetDiagnostics(
  severityFilter?: string[],
  includePatterns?: string[],
  excludePatterns?: string[],
  limit?: number,
): Promise<DiagnosticsResult> {
  const result = await sendClientRequest(
    'codebase.getDiagnostics',
    {severityFilter, includePatterns, excludePatterns, limit},
    30_000,
  );
  assertResult<DiagnosticsResult>(result, 'codebase.getDiagnostics');
  return result;
}

// ── Recovery Handler ─────────────────────────────────────

let clientRecoveryHandler: (() => Promise<void>) | undefined;

/**
 * Register a callback that will be invoked when the client pipe
 * is unreachable. Typically wired to LifecycleService.recoverClientConnection()
 * so the Host can restart the Client window automatically.
 */
export function registerClientRecoveryHandler(handler: () => Promise<void>): void {
  clientRecoveryHandler = handler;
}

// ── Utility ──────────────────────────────────────────────

/**
 * Check if the Client pipe is reachable via a system.ping.
 */
export async function pingClient(): Promise<boolean> {
  try {
    await sendClientRequest('system.ping', {}, 3_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the Client pipe is reachable, recovering automatically if not.
 *
 * 1. Pings the Client pipe.
 * 2. If unreachable, invokes the registered recovery handler
 *    (which asks the Host to restart the Client window).
 * 3. Retries the ping with exponential back-off (up to 3 attempts).
 * 4. Throws only if all recovery attempts fail.
 */
export async function ensureClientAvailable(): Promise<void> {
  if (await pingClient()) return;

  if (!clientRecoveryHandler) {
    throw new Error(
      'Client pipe not available and no recovery handler is registered. ' +
        'Make sure the VS Code Extension Development Host window is running.',
    );
  }

  logger('[client-pipe] Client pipe not responding — triggering recovery…');

  try {
    await clientRecoveryHandler();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger(`[client-pipe] Recovery handler threw: ${msg}`);
  }

  // Retry with increasing delays: 2s, 4s, 6s
  for (let attempt = 1; attempt <= 3; attempt++) {
    const delayMs = attempt * 2000;
    await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    if (await pingClient()) {
      logger(`[client-pipe] Recovery successful (attempt ${attempt})`);
      return;
    }
    logger(`[client-pipe] Retry ${attempt}/3 — client pipe still not responding`);
  }

  throw new Error(
    'Client pipe unavailable after recovery. ' +
      'The VS Code Extension Development Host may have failed to restart.',
  );
}

/**
 * Returns the fixed Client pipe path for this platform.
 */
export function getClientPipePath(): string {
  return CLIENT_PIPE_PATH;
}

// ── Process Ledger Methods ─────────────────────────────────────

/**
 * Get the full process ledger: active, orphaned, and recently completed processes.
 * This is called before EVERY tool response for Copilot accountability.
 */
export async function getProcessLedger(): Promise<ProcessLedgerSummary> {
  try {
    const result = await sendClientRequest('system.getProcessLedger', {}, 3_000);
    assertResult<ProcessLedgerSummary>(result, 'system.getProcessLedger');
    return result;
  } catch {
    // Return empty ledger if unavailable
    return {
      active: [],
      orphaned: [],
      recentlyCompleted: [],
      terminalSessions: [],
      sessionId: 'unknown',
    };
  }
}
