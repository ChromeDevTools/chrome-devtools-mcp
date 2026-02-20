/**
 * Client RPC Handlers
 *
 * IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
 * We have no access to proposed APIs. They will cause the extension to
 * enter Safe Mode and all client handlers will fail to register.
 *
 * Handles tool operations for the VS Code DevTools MCP system.
 * The Client is the Extension Development Host (the spawned VS Code window).
 *
 * API Surface (Terminal — single-terminal model):
 * - terminal.run: Run a command, wait for completion/prompt/timeout
 * - terminal.input: Send input to a waiting prompt
 * - terminal.state: Check current terminal state
 * - terminal.kill: Send Ctrl+C to stop the running process
 *
 * API Surface (Other):
 * - terminal.listAll: List all VS Code terminals
 * - command.execute: Run arbitrary VS Code commands
 */

import * as vscode from 'vscode';
import { SingleTerminalController } from './services/singleTerminalController';
import { getProcessLedger, disposeProcessLedger, type ProcessLedgerSummary } from './services/processLedger';
import { getUserActionTracker } from './services/userActionTracker';
import { getOverview, getExports, traceSymbol, findDeadCode, getImportGraph, findDuplicates, extractOrphanedContent, extractFileStructure, extractStructure } from './codebase-worker-proxy';

// ── Types ────────────────────────────────────────────────────────────────────

export type RegisterHandler = (method: string, handler: (params: Record<string, unknown>) => unknown | Promise<unknown>) => void;

// ── Type-safe param extraction ───────────────────────────────────────────────

function paramStr(p: Record<string, unknown>, k: string): string | undefined {
  const v = p[k];
  return typeof v === 'string' ? v : undefined;
}

function paramNum(p: Record<string, unknown>, k: string): number | undefined {
  const v = p[k];
  return typeof v === 'number' ? v : undefined;
}

function paramBool(p: Record<string, unknown>, k: string): boolean | undefined {
  const v = p[k];
  return typeof v === 'boolean' ? v : undefined;
}

function paramStrArray(p: Record<string, unknown>, k: string): string[] | undefined {
  const v = p[k];
  if (!Array.isArray(v)) return undefined;
  return v.filter((item): item is string => typeof item === 'string');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Module State ─────────────────────────────────────────────────────────────

let terminalController: SingleTerminalController | null = null;

// ── Read Highlight Decoration ────────────────────────────────────────────────

const readHighlightDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 213, 79, 0.25)',
  isWholeLine: false,
  overviewRulerColor: 'rgba(255, 213, 79, 0.7)',
  overviewRulerLane: vscode.OverviewRulerLane.Center,
  border: '1px solid rgba(255, 213, 79, 0.4)',
});

const collapsedRangeDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(150, 150, 150, 0.15)',
  isWholeLine: true,
  overviewRulerColor: 'rgba(150, 150, 150, 0.4)',
  overviewRulerLane: vscode.OverviewRulerLane.Center,
});

// ── Edit Diff Virtual Document Provider ──────────────────────────────────────

const EDIT_DIFF_SCHEME = 'devtools-edit-before';
const editDiffContentStore = new Map<string, string>();
let editDiffProviderDisposable: vscode.Disposable | undefined;

// Windows drive letters can differ in case between URI.from() and VS Code's internal normalization
function diffStoreKey(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').toLowerCase();
}

function ensureEditDiffProvider(): void {
  if (editDiffProviderDisposable) return;
  editDiffProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(
    EDIT_DIFF_SCHEME,
    {
      provideTextDocumentContent(uri: vscode.Uri): string {
        return editDiffContentStore.get(diffStoreKey(uri.path)) ?? '';
      },
    },
  );
}

// Per-document folding range provider so we can fold on our own boundaries
let activeFoldingProvider: vscode.Disposable | undefined;
let activeFoldingRanges: vscode.FoldingRange[] = [];

function registerFoldingRanges(
  doc: vscode.TextDocument,
  collapsedRanges: Array<{startLine: number; endLine: number}>,
): void {
  activeFoldingProvider?.dispose();
  activeFoldingRanges = collapsedRanges.map(r => {
    const s = Math.max(0, Math.min(r.startLine - 1, doc.lineCount - 1));
    const e = Math.max(s, Math.min(r.endLine - 1, doc.lineCount - 1));
    return new vscode.FoldingRange(s, e, vscode.FoldingRangeKind.Region);
  });
  activeFoldingProvider = vscode.languages.registerFoldingRangeProvider(
    {pattern: doc.uri.fsPath},
    {
      provideFoldingRanges(): vscode.FoldingRange[] {
        return activeFoldingRanges;
      },
    },
  );
}

function parseRangeArray(value: unknown): Array<{startLine: number; endLine: number}> {
  if (!Array.isArray(value)) return [];
  const ranges: Array<{startLine: number; endLine: number}> = [];
  for (const item of value) {
    if (item !== null && typeof item === 'object' && 'startLine' in item && 'endLine' in item) {
      const s = item.startLine;
      const e = item.endLine;
      if (typeof s === 'number' && typeof e === 'number') {
        ranges.push({startLine: s, endLine: e});
      }
    }
  }
  return ranges;
}


/**
 * Get the shared terminal controller (for LM tools or other consumers).
 */
export function getTerminalControllerFromClient(): SingleTerminalController | null {
  return terminalController;
}

// ── Terminal Handlers (Multi-Terminal Model) ─────────────────────────────────

/**
 * Run a command in a named terminal (PowerShell).
 * Creates the terminal if needed, rejects with current state if busy.
 * Returns when the command completes, a prompt is detected, or timeout fires.
 */
async function handleTerminalRun(params: Record<string, unknown>) {
  if (!terminalController) throw new Error('Terminal controller not initialized');

  const command = paramStr(params, 'command');
  if (!command) {
    throw new Error('command is required and must be a string');
  }

  const cwd = paramStr(params, 'cwd');
  if (!cwd) {
    throw new Error('cwd is required and must be an absolute path');
  }

  const timeout = paramNum(params, 'timeout');
  const name = paramStr(params, 'name');
  const waitModeRaw = paramStr(params, 'waitMode');
  const waitMode: 'completion' | 'background' = waitModeRaw === 'background' ? 'background' : 'completion';

  console.log(`[client] terminal.run — cwd: ${cwd}, command: ${command}, name: ${name ?? 'default'}, waitMode: ${waitMode}`);
  return terminalController.run(command, cwd, timeout, name, waitMode);
}

/**
 * Send input text to a terminal (e.g. answering a [Y/n] prompt).
 * Waits for the next completion or prompt after sending.
 */
async function handleTerminalInput(params: Record<string, unknown>) {
  if (!terminalController) throw new Error('Terminal controller not initialized');

  const text = paramStr(params, 'text');
  if (typeof text !== 'string') {
    throw new Error('text is required and must be a string');
  }

  const addNewline = paramBool(params, 'addNewline') ?? true;
  const timeout = paramNum(params, 'timeout');
  const name = paramStr(params, 'name');

  console.log(`[client] terminal.input — text: ${text}, name: ${name ?? 'default'}`);
  return terminalController.sendInput(text, addNewline, timeout, name);
}

/**
 * Get the current terminal state without modifying anything.
 */
function handleTerminalState(params: Record<string, unknown>) {
  if (!terminalController) throw new Error('Terminal controller not initialized');

  const name = paramStr(params, 'name');
  return terminalController.getState(name);
}

/**
 * Send Ctrl+C to kill the running process in a terminal.
 */
function handleTerminalKill(params: Record<string, unknown>) {
  if (!terminalController) throw new Error('Terminal controller not initialized');

  const name = paramStr(params, 'name');
  console.log(`[client] terminal.kill — name: ${name ?? 'default'}`);
  return terminalController.kill(name);
}

// ── Process Ledger Handlers ──────────────────────────────────────────────────

/**
 * Get the full process ledger (active + orphaned + recently completed + terminal sessions).
 * This is called by MCP before EVERY tool response for Copilot accountability.
 * Refreshes the child process cache if stale (PowerShell CIM query, 5s TTL).
 */
async function handleGetProcessLedger(_params: Record<string, unknown>): Promise<ProcessLedgerSummary> {
  const ledger = getProcessLedger();
  await ledger.refreshActiveChildren();
  const summary = ledger.getLedger();

  // Inject live terminal session data from the terminal controller
  if (terminalController) {
    summary.terminalSessions = terminalController.getTerminalSessions();
  }

  return summary;
}

/**
 * Kill a process by PID. Works for both active and orphaned processes.
 */
async function handleKillProcess(params: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const pid = paramNum(params, 'pid');
  if (typeof pid !== 'number' || pid <= 0) {
    throw new Error('pid is required and must be a positive number');
  }

  console.log(`[client] process.kill — PID: ${pid}`);
  const ledger = getProcessLedger();
  return ledger.killProcess(pid);
}

/**
 * Kill all orphaned processes from previous sessions.
 */
async function handleKillOrphans(_params: Record<string, unknown>): Promise<{ killed: number[]; failed: Array<{ pid: number; error: string }> }> {
  console.log('[client] process.killOrphans');
  const ledger = getProcessLedger();
  return ledger.killAllOrphans();
}

// ── Terminal ListAll Handler ─────────────────────────────────────────────────

/**
 * List ALL terminals in this VS Code window (tracked and untracked).
 * Uses the VS Code API's vscode.window.terminals.
 */
function handleTerminalListAll(_params: Record<string, unknown>): unknown {
  const terminals = vscode.window.terminals;
  const activeTerminal = vscode.window.activeTerminal;
  
  const terminalInfos = terminals.map((terminal, index) => {
    const opts = terminal.creationOptions;
    return {
      index,
      name: terminal.name,
      processId: undefined,
      creationOptions: {
        name: opts?.name,
        shellPath: opts && 'shellPath' in opts ? opts.shellPath : undefined,
      },
      exitStatus: terminal.exitStatus
        ? { code: terminal.exitStatus.code, reason: terminal.exitStatus.reason }
        : undefined,
      state: {
        isInteractedWith: terminal.state?.isInteractedWith ?? false,
      },
      isActive: terminal === activeTerminal,
    };
  });
  
  const activeIndex = terminalInfos.findIndex(t => t.isActive);
  
  return {
    total: terminalInfos.length,
    activeIndex: activeIndex >= 0 ? activeIndex : undefined,
    terminals: terminalInfos,
  };
}

// ── Command Execute Handler ──────────────────────────────────────────────────

/**
 * Execute a VS Code command in this window.
 */
async function handleCommandExecute(params: Record<string, unknown>): Promise<{ result: unknown }> {
  const command = paramStr(params, 'command');
  const args = Array.isArray(params.args) ? params.args : undefined;
  
  if (!command) {
    throw new Error('command is required');
  }
  
  const result = args
    ? await vscode.commands.executeCommand(command, ...args)
    : await vscode.commands.executeCommand(command);
  
  return { result };
}

// ── Codebase Handler ─────────────────────────────────────────────────────────

function resolveRootDir(params: Record<string, unknown>): string {
  const explicit = paramStr(params, 'rootDir');
  if (explicit) return explicit;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) return workspaceRoot;
  throw new Error('No workspace folder found. Open a folder or specify rootDir.');
}

async function handleCodebaseGetOverview(params: Record<string, unknown>) {
  const rootDir = resolveRootDir(params);
  return getOverview({
    rootDir,
    dir: paramStr(params, 'dir') ?? rootDir,
    recursive: paramBool(params, 'recursive') ?? false,
    symbols: paramBool(params, 'symbols') ?? false,
    metadata: paramBool(params, 'metadata') ?? false,
    toolScope: paramStr(params, 'toolScope') ?? undefined,
  });
}

async function handleCodebaseGetExports(params: Record<string, unknown>) {
  const pathParam = paramStr(params, 'path');
  if (!pathParam) {
    throw new Error('path is required');
  }

  return getExports({
    path: pathParam,
    rootDir: resolveRootDir(params),
    includeTypes: paramBool(params, 'includeTypes') ?? true,
    includeJSDoc: paramBool(params, 'includeJSDoc') ?? true,
    kind: paramStr(params, 'kind') ?? 'all',
    includePatterns: paramStrArray(params, 'includePatterns'),
    excludePatterns: paramStrArray(params, 'excludePatterns'),
  });
}

async function handleCodebaseTraceSymbol(params: Record<string, unknown>) {
  const symbol = paramStr(params, 'symbol');
  if (!symbol) {
    throw new Error('symbol is required');
  }

  try {
    return await traceSymbol({
      symbol,
      rootDir: resolveRootDir(params),
      file: paramStr(params, 'file'),
      line: paramNum(params, 'line'),
      column: paramNum(params, 'column'),
      depth: paramNum(params, 'depth') ?? 3,
      include: paramStrArray(params, 'include') ?? ['all'],
      includeImpact: paramBool(params, 'includeImpact') ?? false,
      maxReferences: undefined,
      timeout: paramNum(params, 'timeout'),
      forceRefresh: paramBool(params, 'forceRefresh') ?? false,
      includePatterns: paramStrArray(params, 'includePatterns'),
      excludePatterns: paramStrArray(params, 'excludePatterns'),
    });
  } catch (err: unknown) {
    console.warn('[client] traceSymbol error:', errorMessage(err));
    return {
      symbol,
      references: [],
      reExports: [],
      callChain: { incomingCalls: [], outgoingCalls: [] },
      typeFlows: [],
      summary: { totalReferences: 0, totalFiles: 0, maxCallDepth: 0 },
      partial: true,
    };
  }
}

async function handleCodebaseFindDeadCode(params: Record<string, unknown>) {
  try {
    return await findDeadCode({
      rootDir: resolveRootDir(params),
      pattern: paramStr(params, 'pattern'),
      exportedOnly: paramBool(params, 'exportedOnly') ?? true,
      excludeTests: paramBool(params, 'excludeTests') ?? true,
      kinds: paramStrArray(params, 'kinds'),
      limit: paramNum(params, 'limit') ?? 100,
      includePatterns: paramStrArray(params, 'includePatterns'),
      excludePatterns: paramStrArray(params, 'excludePatterns'),
    });
  } catch (err: unknown) {
    console.warn('[client] findDeadCode error:', errorMessage(err));
    return {
      deadCode: [],
      summary: { totalScanned: 0, totalDead: 0, scanDurationMs: 0 },
      errorMessage: errorMessage(err),
    };
  }
}

async function handleCodebaseGetImportGraph(params: Record<string, unknown>) {
  try {
    return await getImportGraph({
      rootDir: resolveRootDir(params),
      includePatterns: paramStrArray(params, 'includePatterns'),
      excludePatterns: paramStrArray(params, 'excludePatterns'),
    });
  } catch (err: unknown) {
    console.warn('[client] getImportGraph error:', errorMessage(err));
    return {
      modules: {},
      circular: [],
      orphans: [],
      stats: { totalModules: 0, totalEdges: 0, circularCount: 0, orphanCount: 0 },
      errorMessage: errorMessage(err),
    };
  }
}

async function handleCodebaseFindDuplicates(params: Record<string, unknown>) {
  try {
    return await findDuplicates({
      rootDir: resolveRootDir(params),
      kinds: paramStrArray(params, 'kinds'),
      limit: paramNum(params, 'limit') ?? 50,
      includePatterns: paramStrArray(params, 'includePatterns'),
      excludePatterns: paramStrArray(params, 'excludePatterns'),
    });
  } catch (err: unknown) {
    console.warn('[client] findDuplicates error:', errorMessage(err));
    return {
      groups: [],
      summary: { totalGroups: 0, totalDuplicateInstances: 0, filesWithDuplicates: 0, scanDurationMs: 0 },
      errorMessage: errorMessage(err),
    };
  }
}

async function handleCodebaseGetDiagnostics(params: Record<string, unknown>) {
  try {
    const severityFilter = paramStrArray(params, 'severityFilter');
    const includePatterns = paramStrArray(params, 'includePatterns');
    const excludePatterns = paramStrArray(params, 'excludePatterns');
    const limit = paramNum(params, 'limit') ?? 100;

    const allDiagnostics = vscode.languages.getDiagnostics();

    // Determine which severities to include
    const wantErrors = !severityFilter || severityFilter.includes('error');
    const wantWarnings = !severityFilter || severityFilter.includes('warning');

    const items: Array<{
      file: string;
      line: number;
      column: number;
      severity: string;
      code: string;
      message: string;
      source: string;
    }> = [];

    for (const [uri, diagnostics] of allDiagnostics) {
      const filePath = uri.fsPath;

      // Apply include/exclude pattern filters
      if (includePatterns && includePatterns.length > 0) {
        const matchesInclude = includePatterns.some(pattern => {
          const regex = globToRegex(pattern);
          return regex.test(filePath);
        });
        if (!matchesInclude) continue;
      }

      if (excludePatterns && excludePatterns.length > 0) {
        const matchesExclude = excludePatterns.some(pattern => {
          const regex = globToRegex(pattern);
          return regex.test(filePath);
        });
        if (matchesExclude) continue;
      }

      for (const diag of diagnostics) {
        const severity = diagSeverityToString(diag.severity);
        if (severity === 'error' && !wantErrors) continue;
        if (severity === 'warning' && !wantWarnings) continue;
        if (severity !== 'error' && severity !== 'warning') continue;

        if (items.length >= limit) break;

        const codeStr = typeof diag.code === 'object' && diag.code !== null
          ? String((diag.code as { value: string | number }).value)
          : String(diag.code ?? '');

        items.push({
          file: vscode.workspace.asRelativePath(uri),
          line: diag.range.start.line + 1,
          column: diag.range.start.character + 1,
          severity,
          code: codeStr,
          message: diag.message,
          source: diag.source ?? 'unknown',
        });
      }
      if (items.length >= limit) break;
    }

    const errorCount = items.filter(i => i.severity === 'error').length;
    const warningCount = items.filter(i => i.severity === 'warning').length;

    return {
      diagnostics: items,
      summary: {
        totalErrors: errorCount,
        totalWarnings: warningCount,
        totalFiles: new Set(items.map(i => i.file)).size,
      },
    };
  } catch (err: unknown) {
    console.warn('[client] getDiagnostics error:', errorMessage(err));
    return {
      diagnostics: [],
      summary: { totalErrors: 0, totalWarnings: 0, totalFiles: 0 },
      errorMessage: errorMessage(err),
    };
  }
}

function diagSeverityToString(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error: return 'error';
    case vscode.DiagnosticSeverity.Warning: return 'warning';
    case vscode.DiagnosticSeverity.Information: return 'info';
    case vscode.DiagnosticSeverity.Hint: return 'hint';
    default: return 'unknown';
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '[^/\\\\]');
  return new RegExp(escaped, 'i');
}

// ── File Service Handlers ────────────────────────────────────────────────────

/** Map VS Code SymbolKind enum to human-readable strings */
function symbolKindName(kind: vscode.SymbolKind): string {
  const names: Record<number, string> = {
    [vscode.SymbolKind.File]: 'file',
    [vscode.SymbolKind.Module]: 'module',
    [vscode.SymbolKind.Namespace]: 'namespace',
    [vscode.SymbolKind.Package]: 'package',
    [vscode.SymbolKind.Class]: 'class',
    [vscode.SymbolKind.Method]: 'method',
    [vscode.SymbolKind.Property]: 'property',
    [vscode.SymbolKind.Field]: 'field',
    [vscode.SymbolKind.Constructor]: 'constructor',
    [vscode.SymbolKind.Enum]: 'enum',
    [vscode.SymbolKind.Interface]: 'interface',
    [vscode.SymbolKind.Function]: 'function',
    [vscode.SymbolKind.Variable]: 'variable',
    [vscode.SymbolKind.Constant]: 'constant',
    [vscode.SymbolKind.String]: 'string',
    [vscode.SymbolKind.Number]: 'number',
    [vscode.SymbolKind.Boolean]: 'boolean',
    [vscode.SymbolKind.Array]: 'array',
    [vscode.SymbolKind.Object]: 'object',
    [vscode.SymbolKind.Key]: 'key',
    [vscode.SymbolKind.Null]: 'null',
    [vscode.SymbolKind.EnumMember]: 'enumMember',
    [vscode.SymbolKind.Struct]: 'struct',
    [vscode.SymbolKind.Event]: 'event',
    [vscode.SymbolKind.Operator]: 'operator',
    [vscode.SymbolKind.TypeParameter]: 'typeParameter',
  };
  return names[kind] ?? 'unknown';
}

interface SerializedFileSymbol {
  name: string;
  kind: string;
  detail?: string;
  range: { startLine: number; startChar: number; endLine: number; endChar: number };
  selectionRange: { startLine: number; startChar: number; endLine: number; endChar: number };
  children: SerializedFileSymbol[];
}

function serializeDocSymbol(sym: vscode.DocumentSymbol): SerializedFileSymbol {
  let name = sym.name;

  // Fix "<unknown>" name for module.exports patterns (VS Code limitation)
  if (name === '<unknown>' && sym.kind === vscode.SymbolKind.Variable) {
    name = 'module.exports';
  }

  return {
    name,
    kind: symbolKindName(sym.kind),
    detail: sym.detail || undefined,
    range: {
      startLine: sym.range.start.line,
      startChar: sym.range.start.character,
      endLine: sym.range.end.line,
      endChar: sym.range.end.character,
    },
    selectionRange: {
      startLine: sym.selectionRange.start.line,
      startChar: sym.selectionRange.start.character,
      endLine: sym.selectionRange.end.line,
      endChar: sym.selectionRange.end.character,
    },
    children: sym.children.map(serializeDocSymbol),
  };
}

/**
 * Get DocumentSymbols for a file, serialized with string kind names.
 */
async function handleFileGetSymbols(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  const uri = vscode.Uri.file(filePath);
  try { await vscode.workspace.openTextDocument(uri); } catch { /* best-effort open */ }

  const symbols = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
  >('vscode.executeDocumentSymbolProvider', uri);

  if (!symbols || symbols.length === 0) return { symbols: [] };

  // Only handle DocumentSymbol (not SymbolInformation)
  const docSymbols = symbols.filter(
    (s): s is vscode.DocumentSymbol => 'children' in s
  );
  return { symbols: docSymbols.map(serializeDocSymbol) };
}

/**
 * Read file content, optionally by line range.
 */
async function handleFileReadContent(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  // Track file access so we can alert Copilot if the user saves changes
  getUserActionTracker().trackFileAccess(filePath);

  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const totalLines = doc.lineCount;

  const startLine = paramNum(params, 'startLine') ?? 0;
  const endLine = paramNum(params, 'endLine') ?? (totalLines - 1);

  const clampedStart = Math.max(0, Math.min(startLine, totalLines - 1));
  const clampedEnd = Math.max(clampedStart, Math.min(endLine, totalLines - 1));

  const range = new vscode.Range(clampedStart, 0, clampedEnd, doc.lineAt(clampedEnd).text.length);
  const content = doc.getText(range);

  return { content, startLine: clampedStart, endLine: clampedEnd, totalLines };
}

/**
 * Open a file in the editor and highlight the range Copilot just read.
 * Clears any previous read highlight so only the latest read is visible.
 */
async function handleFileHighlightReadRange(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  getUserActionTracker().trackFileAccess(filePath);

  const startLine = paramNum(params, 'startLine') ?? 0;
  const endLine = paramNum(params, 'endLine') ?? 0;
  const collapsedRanges = parseRangeArray(params['collapsedRanges']);
  const sourceRanges = parseRangeArray(params['sourceRanges']);

  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);

  // Clear previous highlights on ALL visible editors
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(readHighlightDecoration, []);
    editor.setDecorations(collapsedRangeDecoration, []);
  }

  const editor = await vscode.window.showTextDocument(doc, {
    preview: true,
    preserveFocus: false,
  });

  if (collapsedRanges.length > 0 || sourceRanges.length > 0) {
    // Structured mode: source lines get yellow (skip empty lines), collapsed items fold
    const sourceDecorations: vscode.Range[] = [];
    for (const r of sourceRanges) {
      const s = Math.max(0, Math.min(r.startLine - 1, doc.lineCount - 1));
      const e = Math.max(s, Math.min(r.endLine - 1, doc.lineCount - 1));
      for (let line = s; line <= e; line++) {
        const lineText = doc.lineAt(line).text;
        if (lineText.trim().length > 0) {
          sourceDecorations.push(new vscode.Range(line, 0, line, lineText.length));
        }
      }
    }

    const collapsedDecorations: vscode.Range[] = [];
    const foldLines: number[] = [];
    for (const r of collapsedRanges) {
      const s = Math.max(0, Math.min(r.startLine - 1, doc.lineCount - 1));
      const e = Math.max(s, Math.min(r.endLine - 1, doc.lineCount - 1));
      foldLines.push(s);
      collapsedDecorations.push(new vscode.Range(s, 0, e, doc.lineAt(e).text.length));
    }

    editor.setDecorations(readHighlightDecoration, sourceDecorations);
    editor.setDecorations(collapsedRangeDecoration, collapsedDecorations);

    // Register our own folding ranges and fold them
    if (collapsedRanges.length > 0) {
      registerFoldingRanges(doc, collapsedRanges);
      // Small delay so VS Code picks up the new folding provider before we fold
      await new Promise(resolve => setTimeout(resolve, 100));
      await vscode.commands.executeCommand('editor.fold', {selectionLines: foldLines, levels: 1});
    }

    // Center viewport on the first non-collapsed (source) content
    const scrollTarget = sourceRanges[0] ?? collapsedRanges[0];
    if (scrollTarget) {
      const scrollLine = Math.max(0, scrollTarget.startLine - 1);
      editor.revealRange(
        new vscode.Range(scrollLine, 0, scrollLine, 0),
        vscode.TextEditorRevealType.InCenter,
      );
    }
  } else {
    // Legacy mode: single range highlight
    const clampedStart = Math.max(0, Math.min(startLine, doc.lineCount - 1));
    const clampedEnd = Math.max(clampedStart, Math.min(endLine, doc.lineCount - 1));
    const highlightRange = new vscode.Range(
      clampedStart, 0,
      clampedEnd, doc.lineAt(clampedEnd).text.length,
    );
    editor.revealRange(highlightRange, vscode.TextEditorRevealType.InCenter);
    editor.setDecorations(readHighlightDecoration, [highlightRange]);
  }

  return { success: true };
}

/**
 * Show an inline diff editor comparing old content vs current file after an edit.
 * Old content was pre-captured by handleFileApplyEdit before the edit was applied.
 */
async function handleFileShowEditDiff(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  const editStartLine = paramNum(params, 'editStartLine') ?? 0;

  // The "before" content was captured by handleFileApplyEdit
  const beforeUri = vscode.Uri.from({ scheme: EDIT_DIFF_SCHEME, path: filePath });
  if (!editDiffContentStore.has(diffStoreKey(filePath))) {
    return { success: false, reason: 'No pre-edit content snapshot available' };
  }

  const afterUri = vscode.Uri.file(filePath);
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'file';

  await vscode.commands.executeCommand(
    'vscode.diff',
    beforeUri,
    afterUri,
    `${fileName} (edit diff)`,
    {
      preview: false,
      renderSideBySide: false,
    },
  );

  // Scroll to the edit region in the diff editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const revealLine = Math.max(0, editStartLine);
    activeEditor.revealRange(
      new vscode.Range(revealLine, 0, revealLine, 0),
      vscode.TextEditorRevealType.InCenter,
    );
  }

  return { success: true };
}

/**
 * Apply a WorkspaceEdit (replace a range with new content).
 */
async function handleFileApplyEdit(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  // Track file access so we can alert Copilot if the user saves changes
  getUserActionTracker().trackFileAccess(filePath);

  const startLine = paramNum(params, 'startLine');
  const startChar = paramNum(params, 'startChar') ?? 0;
  const endLine = paramNum(params, 'endLine');
  const endChar = paramNum(params, 'endChar');
  const newContent = paramStr(params, 'newContent');

  if (startLine === undefined || endLine === undefined || newContent === undefined) {
    throw new Error('startLine, endLine, and newContent are required');
  }

  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);

  // Snapshot old content BEFORE applying the edit — used by the diff viewer
  ensureEditDiffProvider();
  editDiffContentStore.set(diffStoreKey(filePath), doc.getText());

  const resolvedEndChar = endChar ?? doc.lineAt(endLine).text.length;
  const range = new vscode.Range(startLine, startChar, endLine, resolvedEndChar);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, newContent);
  const applied = await vscode.workspace.applyEdit(edit);

  if (!applied) throw new Error('VS Code rejected the workspace edit');

  await doc.save();

  return { success: true, file: filePath };
}

/**
 * Get diagnostics for a specific file, returning only errors and warnings.
 */
async function handleFileGetDiagnostics(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  const uri = vscode.Uri.file(filePath);
  const diagnostics = vscode.languages.getDiagnostics(uri);

  const items = diagnostics
    .filter(d =>
      d.severity === vscode.DiagnosticSeverity.Error ||
      d.severity === vscode.DiagnosticSeverity.Warning
    )
    .map(d => ({
      line: d.range.start.line + 1,
      column: d.range.start.character + 1,
      endLine: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      severity: diagSeverityToString(d.severity),
      message: d.message,
      code: typeof d.code === 'object' && d.code !== null
        ? String((d.code as { value: string | number }).value)
        : String(d.code ?? ''),
      source: d.source ?? 'unknown',
    }));

  return { diagnostics: items };
}

/**
 * Execute rename provider at a specific position.
 */
async function handleFileExecuteRename(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  const line = paramNum(params, 'line');
  const character = paramNum(params, 'character');
  const newName = paramStr(params, 'newName');

  if (!filePath || line === undefined || character === undefined || !newName) {
    throw new Error('filePath, line, character, and newName are required');
  }

  const uri = vscode.Uri.file(filePath);
  await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(line, character);

  const workspaceEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>(
    'vscode.executeDocumentRenameProvider', uri, position, newName,
  );

  if (!workspaceEdit) {
    return { success: false, filesAffected: [], totalEdits: 0, error: 'Rename provider returned no edits' };
  }

  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (!applied) {
    return { success: false, filesAffected: [], totalEdits: 0, error: 'VS Code rejected the rename edits' };
  }

  // Clean up redundant self-aliases (e.g. `foo as foo`) left by rename provider
  const selfAliasPattern = /\b(\w+)\s+as\s+\1\b/g;
  for (const [affectedUri] of workspaceEdit.entries()) {
    try {
      const doc = await vscode.workspace.openTextDocument(affectedUri);
      const text = doc.getText();
      if (selfAliasPattern.test(text)) {
        selfAliasPattern.lastIndex = 0;
        const cleanedText = text.replace(selfAliasPattern, '$1');
        if (cleanedText !== text) {
          const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));
          const cleanupEdit = new vscode.WorkspaceEdit();
          cleanupEdit.replace(affectedUri, fullRange, cleanedText);
          await vscode.workspace.applyEdit(cleanupEdit);
        }
      }
    } catch { /* best-effort cleanup */ }
  }

  // Save all affected documents
  const filesAffected: string[] = [];
  let totalEdits = 0;
  for (const [affectedUri, edits] of workspaceEdit.entries()) {
    filesAffected.push(vscode.workspace.asRelativePath(affectedUri));
    totalEdits += edits.length;
    try {
      const doc = await vscode.workspace.openTextDocument(affectedUri);
      await doc.save();
    } catch { /* best-effort save */ }
  }

  return { success: true, filesAffected, totalEdits };
}

/**
 * Find all references to a symbol at a position.
 */
async function handleFileFindReferences(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  const line = paramNum(params, 'line');
  const character = paramNum(params, 'character');

  if (!filePath || line === undefined || character === undefined) {
    throw new Error('filePath, line, and character are required');
  }

  const uri = vscode.Uri.file(filePath);
  await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(line, character);

  const locations = await vscode.commands.executeCommand<vscode.Location[] | undefined>(
    'vscode.executeReferenceProvider', uri, position,
  );

  if (!locations) return { references: [] };

  return {
    references: locations.map(loc => ({
      file: vscode.workspace.asRelativePath(loc.uri),
      line: loc.range.start.line + 1,
      character: loc.range.start.character,
    })),
  };
}

/**
 * Get code actions for a specific range in a file.
 */
async function handleFileGetCodeActions(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  const startLine = paramNum(params, 'startLine');
  const endLine = paramNum(params, 'endLine');

  if (!filePath || startLine === undefined || endLine === undefined) {
    throw new Error('filePath, startLine, and endLine are required');
  }

  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);

  const actions = await vscode.commands.executeCommand<vscode.CodeAction[] | undefined>(
    'vscode.executeCodeActionProvider', uri, range,
  );

  if (!actions) return { actions: [] };

  return {
    actions: actions
      .filter(a => a.edit || a.command)
      .map((a, i) => ({
        index: i,
        title: a.title,
        kind: a.kind?.value ?? 'unknown',
        isPreferred: a.isPreferred ?? false,
        hasEdit: !!a.edit,
        hasCommand: !!a.command,
      })),
  };
}

/**
 * Apply a specific code action by getting it again and applying.
 */
async function handleFileApplyCodeAction(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  const startLine = paramNum(params, 'startLine');
  const endLine = paramNum(params, 'endLine');
  const actionIndex = paramNum(params, 'actionIndex');

  if (!filePath || startLine === undefined || endLine === undefined || actionIndex === undefined) {
    throw new Error('filePath, startLine, endLine, and actionIndex are required');
  }

  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);

  const actions = await vscode.commands.executeCommand<vscode.CodeAction[] | undefined>(
    'vscode.executeCodeActionProvider', uri, range,
  );

  if (!actions || actionIndex >= actions.length) {
    return { success: false, error: `Code action at index ${actionIndex} not found` };
  }

  const action = actions[actionIndex];

  if (action.edit) {
    const applied = await vscode.workspace.applyEdit(action.edit);
    if (!applied) return { success: false, error: 'VS Code rejected the code action edit' };
  }

  if (action.command) {
    await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments ?? []));
  }

  return { success: true, title: action.title };
}

// ── Unified File Structure Extraction (registry-based) ──────────────────────

async function handleFileExtractStructure(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');
  return extractStructure(filePath);
}

// ── Orphaned Content Extraction ──────────────────────────────────────────────

async function handleExtractOrphanedContent(params: Record<string, unknown>) {
  const filePath = paramStr(params, 'filePath');
  if (!filePath) throw new Error('filePath is required');

  // Optionally get symbol ranges from VS Code first (for gap calculation)
  const includeSymbols = paramBool(params, 'includeSymbols') ?? true;
  let symbolRanges: Array<{ start: number; end: number }> = [];

  if (includeSymbols) {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.openTextDocument(uri);
      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
      >('vscode.executeDocumentSymbolProvider', uri);

      if (symbols) {
        const collectRanges = (syms: vscode.DocumentSymbol[]): void => {
          for (const s of syms) {
            symbolRanges.push({
              start: s.range.start.line + 1, // Convert to 1-indexed
              end: s.range.end.line + 1,
            });
            if (s.children) collectRanges(s.children);
          }
        };

        const docSymbols = symbols.filter(
          (s): s is vscode.DocumentSymbol => 'children' in s
        );
        collectRanges(docSymbols);
      }
    } catch {
      // Continue without symbol ranges
    }
  }

  const result = await extractOrphanedContent({ filePath, symbolRanges });
  return result;
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Register all Client RPC handlers with the bootstrap.
 */
export function registerClientHandlers(register: RegisterHandler): vscode.Disposable {
  console.log('[client] Registering Client RPC handlers');

  // Initialize the process ledger (loads persisted state, detects orphans)
  const processLedger = getProcessLedger();
  processLedger.initialize().catch(err => {
    console.error('[client] Process ledger initialization failed:', err);
  });

  // Initialize the single terminal controller (for MCP tools)
  terminalController = new SingleTerminalController();

  // Terminal methods (single-terminal model)
  register('terminal.run', handleTerminalRun);
  register('terminal.input', handleTerminalInput);
  register('terminal.state', handleTerminalState);
  register('terminal.kill', handleTerminalKill);
  register('terminal.listAll', handleTerminalListAll);

  // Command methods
  register('command.execute', handleCommandExecute);

  // Process ledger methods (for global accountability)
  register('system.getProcessLedger', handleGetProcessLedger);
  register('process.kill', handleKillProcess);
  register('process.killOrphans', handleKillOrphans);

  // Codebase analysis methods
  register('codebase.getOverview', handleCodebaseGetOverview);
  register('codebase.getExports', handleCodebaseGetExports);
  register('codebase.traceSymbol', handleCodebaseTraceSymbol);
  register('codebase.findDeadCode', handleCodebaseFindDeadCode);
  register('codebase.getImportGraph', handleCodebaseGetImportGraph);
  register('codebase.findDuplicates', handleCodebaseFindDuplicates);
  register('codebase.getDiagnostics', handleCodebaseGetDiagnostics);

  // File service methods (for semantic read/edit tools)
  register('file.getSymbols', handleFileGetSymbols);
  register('file.readContent', handleFileReadContent);
  register('file.highlightReadRange', handleFileHighlightReadRange);
  register('file.showEditDiff', handleFileShowEditDiff);
  register('file.applyEdit', handleFileApplyEdit);
  register('file.getDiagnostics', handleFileGetDiagnostics);
  register('file.executeRename', handleFileExecuteRename);
  register('file.findReferences', handleFileFindReferences);
  register('file.getCodeActions', handleFileGetCodeActions);
  register('file.applyCodeAction', handleFileApplyCodeAction);
  register('file.extractOrphanedContent', handleExtractOrphanedContent);
  register('file.extractStructure', handleFileExtractStructure);

  console.log('[client] Client RPC handlers registered');

  // Return disposable for cleanup
  return new vscode.Disposable(() => {
    console.log('[client] Cleaning up Client handlers');

    if (terminalController) {
      terminalController.dispose();
      terminalController = null;
    }

    readHighlightDecoration.dispose();
    editDiffProviderDisposable?.dispose();
    editDiffContentStore.clear();
    disposeProcessLedger();
  });
}
