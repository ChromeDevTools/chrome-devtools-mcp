/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Drag Race MCP Tool — VS Code Native Semantic APIs vs Custom AST Parsers
 *
 * Compares what VS Code's built-in language servers capture
 * (via vscode.executeDocumentSymbolProvider command through the client pipe)
 * against what our custom AST parsers extract (via codebase.getOverview).
 * Generates a side-by-side markdown report and per-file JSON symbol dumps.
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {
  dragraceGetDocumentSymbols,
  dragraceGetFoldingRanges,
  dragraceGetSemanticTokens,
  codebaseGetOverview,
  type CodebaseSymbolNode,
  type CodebaseTreeNode,
  type FoldingRangeResult,
  type SemanticTokensResult,
} from '../../client-pipe.js';
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

// ── Configuration ────────────────────────────────────────

const TEST_FILE_PREFIX = 'ast-parser-test';

const TEST_EXTENSIONS: ReadonlyArray<{ext: string; language: string}> = [
  {ext: 'html', language: 'HTML'},
  {ext: 'css', language: 'CSS'},
  {ext: 'json', language: 'JSON'},
  {ext: 'md', language: 'Markdown'},
  {ext: 'toml', language: 'TOML'},
  {ext: 'xml', language: 'XML'},
  {ext: 'yaml', language: 'YAML'},
  {ext: 'ts', language: 'TypeScript'},
  {ext: 'js', language: 'JavaScript'},
];

const MAX_VSCODE_ATTEMPTS = 5;
const RETRY_DELAY_BASE_MS = 1500;

// ── Normalized Symbol Type ───────────────────────────────

interface NormalizedSymbol {
  name: string;
  kind: string;
  detail?: string;
  startLine: number;
  endLine: number;
  children?: NormalizedSymbol[];
}

// ── VS Code SymbolKind enum value → readable string ──────

// These match vscode.SymbolKind numeric values from the VS Code API.
// We map them here since the MCP server does not import vscode types.
const SYMBOL_KIND_NAMES: Record<number, string> = {
  0: 'file',
  1: 'module',
  2: 'namespace',
  3: 'package',
  4: 'class',
  5: 'method',
  6: 'property',
  7: 'field',
  8: 'constructor',
  9: 'enum',
  10: 'interface',
  11: 'function',
  12: 'variable',
  13: 'constant',
  14: 'string',
  15: 'number',
  16: 'boolean',
  17: 'array',
  18: 'object',
  19: 'key',
  20: 'null',
  21: 'enumMember',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'typeParameter',
};

function symbolKindToString(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? `unknown(${kind})`;
}

// ── Serialized VS Code DocumentSymbol shape ──────────────

// When DocumentSymbol[] travels over JSON-RPC, Range objects become plain objects.
interface SerializedVscodeSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: {
    start: {line: number; character: number};
    end: {line: number; character: number};
  } | [number, number, number, number]; // Some serializations flatten to tuple
  selectionRange?: unknown;
  children?: SerializedVscodeSymbol[];
}

// ── Normalization ────────────────────────────────────────

function normalizeVscodeSymbol(symbol: SerializedVscodeSymbol): NormalizedSymbol {
  let startLine: number;
  let endLine: number;

  if (Array.isArray(symbol.range)) {
    // Tuple format: [startLine, startChar, endLine, endChar]
    startLine = symbol.range[0] + 1;
    endLine = symbol.range[2] + 1;
  } else {
    startLine = symbol.range.start.line + 1;
    endLine = symbol.range.end.line + 1;
  }

  const normalized: NormalizedSymbol = {
    name: symbol.name,
    kind: symbolKindToString(symbol.kind),
    startLine,
    endLine,
  };

  if (symbol.detail) {
    normalized.detail = symbol.detail;
  }

  if (symbol.children && symbol.children.length > 0) {
    normalized.children = symbol.children.map(normalizeVscodeSymbol);
  }

  return normalized;
}

function normalizeCustomSymbol(symbol: CodebaseSymbolNode): NormalizedSymbol {
  const normalized: NormalizedSymbol = {
    name: symbol.name,
    kind: symbol.kind,
    startLine: symbol.range.start,
    endLine: symbol.range.end,
  };

  if (symbol.detail) {
    normalized.detail = symbol.detail;
  }

  if (symbol.children && symbol.children.length > 0) {
    normalized.children = symbol.children.map(normalizeCustomSymbol);
  }

  return normalized;
}

// ── Symbol Counting ──────────────────────────────────────

function countSymbols(symbols: NormalizedSymbol[]): number {
  let total = symbols.length;
  for (const sym of symbols) {
    if (sym.children) {
      total += countSymbols(sym.children);
    }
  }
  return total;
}

function collectKinds(symbols: NormalizedSymbol[], kinds: Map<string, number>): void {
  for (const sym of symbols) {
    kinds.set(sym.kind, (kinds.get(sym.kind) ?? 0) + 1);
    if (sym.children) {
      collectKinds(sym.children, kinds);
    }
  }
}

function getMaxDepth(symbols: NormalizedSymbol[], current = 1): number {
  let max = current;
  for (const sym of symbols) {
    if (sym.children) {
      const childDepth = getMaxDepth(sym.children, current + 1);
      if (childDepth > max) max = childDepth;
    }
  }
  return max;
}

// ── Symbol Tree Rendering ────────────────────────────────

function renderSymbolTree(symbols: NormalizedSymbol[], indent = ''): string {
  const lines: string[] = [];
  for (const sym of symbols) {
    const detail = sym.detail ? ` → ${sym.detail}` : '';
    const range = sym.startLine !== 0 ? ` [L${sym.startLine}-${sym.endLine}]` : '';
    lines.push(`${indent}├─ ${sym.kind} \`${sym.name}\`${detail}${range}`);
    if (sym.children) {
      lines.push(renderSymbolTree(sym.children, indent + '│  '));
    }
  }
  return lines.join('\n');
}

// ── File Symbol Extraction from Overview Tree ────────────

function findFileSymbols(tree: CodebaseTreeNode[], fileName: string): CodebaseSymbolNode[] {
  for (const node of tree) {
    if (node.type === 'file' && node.name === fileName) {
      return node.symbols ?? [];
    }
    if (node.type === 'directory' && node.children) {
      const found = findFileSymbols(node.children, fileName);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// ── VS Code Symbol Provider (via dedicated client pipe handler) ───

interface VscodeSymbolsResult {
  symbols: SerializedVscodeSymbol[];
  error?: string;
}

async function getVscodeSymbolsViaCommand(
  filePath: string,
): Promise<VscodeSymbolsResult> {
  // Use the dedicated handler that properly converts file paths to vscode.Uri
  // and handles document opening for language server activation.

  for (let attempt = 1; attempt <= MAX_VSCODE_ATTEMPTS; attempt++) {
    const response = await dragraceGetDocumentSymbols(filePath);

    // If the provider crashed, return the error immediately (no point retrying)
    if (response.error) {
      return {symbols: [], error: response.error};
    }

    const symbols = response.symbols;

    if (Array.isArray(symbols) && symbols.length > 0) {
      // Could be DocumentSymbol[] or SymbolInformation[]
      const first = symbols[0] as Record<string, unknown>;
      if ('range' in first && 'children' in first) {
        return {symbols: symbols as SerializedVscodeSymbol[]};
      }
      // SymbolInformation[] — convert to flat DocumentSymbol-like shape
      const converted = (symbols as Array<Record<string, unknown>>).map(si => {
        const location = si.location as Record<string, unknown> | undefined;
        const range = location?.range as SerializedVscodeSymbol['range'] | undefined;
        return {
          name: si.name as string,
          kind: si.kind as number,
          detail: '',
          range: range ?? {
            start: {line: 0, character: 0},
            end: {line: 0, character: 0},
          },
          children: [],
        };
      });
      return {symbols: converted};
    }

    // Language server might not be ready — wait and retry
    if (attempt < MAX_VSCODE_ATTEMPTS) {
      await new Promise<void>(resolve =>
        setTimeout(resolve, RETRY_DELAY_BASE_MS * attempt),
      );
    }
  }

  return {symbols: []};
}


// ── Report Generation ────────────────────────────────────

interface FileResult {
  ext: string;
  language: string;
  fileName: string;
  fileLineCount: number;
  // Document Symbols
  vscodeSymbols: NormalizedSymbol[];
  customSymbols: NormalizedSymbol[];
  vscodeCount: number;
  customCount: number;
  vscodeKinds: Map<string, number>;
  customKinds: Map<string, number>;
  vscodeDepth: number;
  customDepth: number;
  vscodeDurationMs: number;
  customDurationMs: number;
  vscodeError?: string;
  // Folding Ranges
  foldingRanges: FoldingRangeResult;
  foldingDurationMs: number;
  // Semantic Tokens
  semanticTokens: SemanticTokensResult;
  semanticTokensDurationMs: number;
}

function generateReport(results: FileResult[], totalDurationMs: number): string {
  const lines: string[] = [];

  lines.push('# 🏁 AST Drag Race Report');
  lines.push('');
  lines.push('**VS Code Native Semantic APIs** vs **Custom AST Parsers**');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Total Duration: ${(totalDurationMs / 1000).toFixed(2)}s`);
  lines.push('');
  lines.push('## How It Works');
  lines.push('');
  lines.push('- **VS Code side**: Uses `vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri)` via client pipe');
  lines.push('- **Custom side**: Uses custom AST parsers (parse5, css-tree, fast-xml-parser, remark, ts-morph, etc.) via `codebase.getOverview`');
  lines.push('');

  // ── Overall Summary Table ──
  lines.push('## 📊 Overall Summary');
  lines.push('');
  lines.push('| Language | File Lines | VS Code Symbols | Custom Symbols | VS Code Depth | Custom Depth | VS Code Time | Custom Time | Winner |');
  lines.push('|----------|-----------|----------------|---------------|--------------|-------------|-------------|-------------|--------|');

  let vscodeTotal = 0;
  let customTotal = 0;
  let vscodeWins = 0;
  let customWins = 0;
  let ties = 0;

  for (const r of results) {
    vscodeTotal += r.vscodeCount;
    customTotal += r.customCount;

    let winner = '🟡 Tie';
    if (r.vscodeError) {
      winner = '💥 VS Code Crashed';
    } else if (r.vscodeCount > r.customCount) {
      winner = '🔵 VS Code';
      vscodeWins++;
    } else if (r.customCount > r.vscodeCount) {
      winner = '🟢 Custom';
      customWins++;
    } else {
      ties++;
    }

    lines.push(
      `| ${r.language} | ${r.fileLineCount} | ${r.vscodeCount} | ${r.customCount} | ${r.vscodeDepth} | ${r.customDepth} | ${r.vscodeDurationMs}ms | ${r.customDurationMs}ms | ${winner} |`,
    );
  }

  lines.push('');
  lines.push(`**Totals:** VS Code = ${vscodeTotal} symbols, Custom = ${customTotal} symbols`);
  lines.push(`**Wins:** VS Code ${vscodeWins} | Custom ${customWins} | Tie ${ties}`);
  lines.push('');

  // ── Per-Language Details ──
  lines.push('---');
  lines.push('');
  lines.push('## 🔍 Per-Language Breakdown');
  lines.push('');

  for (const r of results) {
    lines.push(`### ${r.language} (\`${r.fileName}\`)`);
    lines.push('');
    lines.push(`- **File size:** ${r.fileLineCount} lines`);
    lines.push(`- **VS Code symbols:** ${r.vscodeCount} (depth ${r.vscodeDepth}, ${r.vscodeDurationMs}ms)`);
    lines.push(`- **Custom symbols:** ${r.customCount} (depth ${r.customDepth}, ${r.customDurationMs}ms)`);
    lines.push('');

    // Symbol kind breakdown
    const allKinds = new Set([...r.vscodeKinds.keys(), ...r.customKinds.keys()]);
    if (allKinds.size > 0) {
      lines.push('#### Symbol Kinds');
      lines.push('');
      lines.push('| Kind | VS Code | Custom |');
      lines.push('|------|---------|--------|');
      for (const kind of [...allKinds].sort()) {
        const vc = r.vscodeKinds.get(kind) ?? 0;
        const cc = r.customKinds.get(kind) ?? 0;
        const marker = vc === 0 ? ' ❌' : cc === 0 ? ' ❌' : '';
        lines.push(`| ${kind} | ${vc}${vc === 0 ? ' ❌' : ''} | ${cc}${cc === 0 ? ' ❌' : ''}${marker === '' ? '' : ''} |`);
      }
      lines.push('');
    }

    // What VS Code captured
    lines.push('<details>');
    lines.push(`<summary>🔵 VS Code Symbol Tree (${r.vscodeCount} symbols)</summary>`);
    lines.push('');
    lines.push('```');
    if (r.vscodeSymbols.length > 0) {
      lines.push(renderSymbolTree(r.vscodeSymbols));
    } else if (r.vscodeError) {
      lines.push(`(provider crashed: ${r.vscodeError})`);
    } else {
      lines.push('(no symbols returned — language server may not be installed)');
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    // What Custom captured
    lines.push('<details>');
    lines.push(`<summary>🟢 Custom Symbol Tree (${r.customCount} symbols)</summary>`);
    lines.push('');
    lines.push('```');
    if (r.customSymbols.length > 0) {
      lines.push(renderSymbolTree(r.customSymbols));
    } else {
      lines.push('(no symbols returned — no custom parser for this file type)');
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    // Analysis
    lines.push('#### Analysis');
    lines.push('');

    const missingInVscode = [...r.customKinds.keys()].filter(k => !r.vscodeKinds.has(k));
    const missingInCustom = [...r.vscodeKinds.keys()].filter(k => !r.customKinds.has(k));

    if (missingInVscode.length > 0) {
      lines.push(`- **Kinds missing from VS Code:** ${missingInVscode.map(k => `\`${k}\``).join(', ')}`);
    }
    if (missingInCustom.length > 0) {
      lines.push(`- **Kinds missing from Custom:** ${missingInCustom.map(k => `\`${k}\``).join(', ')}`);
    }
    if (missingInVscode.length === 0 && missingInCustom.length === 0) {
      lines.push('- Both toolsets captured similar symbol kinds ✅');
    }

    if (r.vscodeError) {
      lines.push(`- ⚠️ **VS Code provider crashed:** \`${r.vscodeError}\``);
    }
    if (r.vscodeCount === 0 && r.customCount === 0) {
      lines.push('- ⚠️ Neither toolset returned symbols for this file');
    } else if (r.vscodeCount === 0 && !r.vscodeError) {
      lines.push('- ⚠️ VS Code returned no symbols — language server extension may not be installed');
    } else if (r.customCount === 0) {
      lines.push('- ⚠️ Custom parser returned no symbols — no parser registered for this extension');
    }

    const ratio = r.customCount > 0
      ? (r.vscodeCount / r.customCount * 100).toFixed(1)
      : r.vscodeCount > 0 ? '∞' : 'N/A';
    lines.push(`- **VS Code / Custom ratio:** ${ratio}%`);
    lines.push('');

    lines.push('---');
    lines.push('');
  }

  // ── Folding Ranges ──
  lines.push('## 📂 Folding Ranges (VS Code Only)');
  lines.push('');
  lines.push('`vscode.executeFoldingRangeProvider` returns collapsible regions — code blocks, comment groups, imports, and user-defined regions.');
  lines.push('');
  lines.push('| Language | Total Ranges | Comment | Imports | Region | Other | Time | Error |');
  lines.push('|----------|-------------|---------|---------|--------|-------|------|-------|');

  for (const r of results) {
    const ranges = r.foldingRanges.ranges;
    const comment = ranges.filter(x => x.kind === 'comment').length;
    const imports = ranges.filter(x => x.kind === 'imports').length;
    const region = ranges.filter(x => x.kind === 'region').length;
    const other = ranges.filter(x => !x.kind).length;
    const errCol = r.foldingRanges.error ? `⚠️ ${r.foldingRanges.error}` : '—';
    lines.push(`| ${r.language} | ${ranges.length} | ${comment} | ${imports} | ${region} | ${other} | ${r.foldingDurationMs}ms | ${errCol} |`);
  }

  lines.push('');

  // ── Semantic Tokens ──
  lines.push('## 🎨 Semantic Tokens (VS Code Only)');
  lines.push('');
  lines.push('`vscode.provideDocumentSemanticTokens` classifies every token in the file (variables, types, keywords, comments, etc.).');
  lines.push('These are the tokens the language server uses for semantic highlighting.');
  lines.push('');
  lines.push('| Language | Total Tokens | Top Types | Time | Error |');
  lines.push('|----------|-------------|-----------|------|-------|');

  for (const r of results) {
    const tokens = r.semanticTokens.tokens;
    const typeCounts = new Map<string, number>();
    for (const t of tokens) {
      typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
    }

    // Top 5 token types by count
    const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5).map(([type, count]) => `${type}(${count})`).join(', ');
    const errCol = r.semanticTokens.error ? `⚠️ ${r.semanticTokens.error}` : '—';
    lines.push(`| ${r.language} | ${tokens.length} | ${top5 || '—'} | ${r.semanticTokensDurationMs}ms | ${errCol} |`);
  }

  lines.push('');

  // Per-language token breakdown (details)
  for (const r of results) {
    if (r.semanticTokens.tokens.length === 0) continue;

    const typeCounts = new Map<string, number>();
    for (const t of r.semanticTokens.tokens) {
      typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
    }
    const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

    lines.push('<details>');
    lines.push(`<summary>🎨 ${r.language} — ${r.semanticTokens.tokens.length} tokens, ${typeCounts.size} types</summary>`);
    lines.push('');
    lines.push('| Token Type | Count |');
    lines.push('|-----------|-------|');
    for (const [type, count] of sorted) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');
    if (r.semanticTokens.legend.tokenModifiers.length > 0) {
      lines.push(`**Available modifiers:** ${r.semanticTokens.legend.tokenModifiers.join(', ')}`);
      lines.push('');
    }
    lines.push('</details>');
    lines.push('');
  }

  // ── Language Server Notes ──
  lines.push('## 📋 Language Server Requirements');
  lines.push('');
  lines.push('For full VS Code semantic API coverage, these extensions are needed:');
  lines.push('');
  lines.push('| Language | Built-in | Extension Required |');
  lines.push('|----------|----------|--------------------|');
  lines.push('| HTML | ✅ Yes | — |');
  lines.push('| CSS | ✅ Yes | — |');
  lines.push('| JSON | ✅ Yes | — |');
  lines.push('| TypeScript | ✅ Yes | — |');
  lines.push('| JavaScript | ✅ Yes | — |');
  lines.push('| Markdown | ✅ Partial | `yzhang.markdown-all-in-one` for enhanced |');
  lines.push('| YAML | ❌ No | `redhat.vscode-yaml` |');
  lines.push('| TOML | ❌ No | `tamasfe.even-better-toml` |');
  lines.push('| XML | ❌ No | `redhat.vscode-xml` |');
  lines.push('');

  return lines.join('\n');
}

// ── Tool Definition ──────────────────────────────────────

export const dragrace = defineTool({
  name: 'dragrace',
  description:
    'Run an AST drag race comparing VS Code native semantic APIs against custom AST parsers for 9 languages ' +
    '(HTML, CSS, JSON, Markdown, TOML, XML, YAML, TypeScript, JavaScript). ' +
    'Tests DocumentSymbolProvider (symbols), FoldingRangeProvider (collapsible regions), and SemanticTokensProvider (token classification). ' +
    'Generates a side-by-side markdown report and per-file JSON dumps in a dragrace/ folder.',
  timeoutMs: 120_000,
  annotations: {
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  schema: {
    testWorkspacePath: zod
      .string()
      .optional()
      .describe(
        'Path to the test-workspace folder containing ast-parser-test.* files. ' +
        'Defaults to <workspace>/test-workspace.',
      ),
    outputPath: zod
      .string()
      .optional()
      .describe(
        'Path where dragrace results will be written. Defaults to <workspace>/dragrace.',
      ),
    languages: zod
      .array(zod.string())
      .optional()
      .describe(
        'Filter to specific language extensions (e.g. ["html", "ts", "css"]). ' +
        'Defaults to all 9 languages.',
      ),
  },
  async handler(request, response) {
    const rootDir = getHostWorkspace();
    const testWorkspacePath = request.params.testWorkspacePath
      ?? join(rootDir, 'test-workspace');
    const dragracePath = request.params.outputPath
      ?? join(rootDir, 'dragrace');

    if (!existsSync(testWorkspacePath)) {
      throw new Error(
        `test-workspace not found at ${testWorkspacePath}. ` +
        'Ensure ast-parser-test.* files exist in the test-workspace folder.',
      );
    }

    // Create output directory
    if (!existsSync(dragracePath)) {
      mkdirSync(dragracePath, {recursive: true});
    }

    // Filter languages if requested
    const languageFilter = request.params.languages;
    const extensions = languageFilter
      ? TEST_EXTENSIONS.filter(e =>
          languageFilter.some(l => l.toLowerCase() === e.ext.toLowerCase()),
        )
      : [...TEST_EXTENSIONS];

    if (extensions.length === 0) {
      throw new Error(
        `No matching languages found for filter: ${languageFilter?.join(', ')}. ` +
        `Available: ${TEST_EXTENSIONS.map(e => e.ext).join(', ')}`,
      );
    }

    const startTime = Date.now();

    response.appendResponseLine('## 🏁 AST Drag Race');
    response.appendResponseLine('');
    response.appendResponseLine(`Processing ${extensions.length} languages...`);
    response.appendResponseLine('');

    // ── Step 1: Get custom AST symbols via codebase.getOverview ──

    response.appendResponseLine('### Step 1: Fetching custom AST symbols...');

    let overviewResult;
    try {
      overviewResult = await codebaseGetOverview(
        rootDir,
        testWorkspacePath,
        false,
        '*',
        true,
        60_000,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to get custom AST symbols: ${msg}`);
    }

    response.appendResponseLine(`Custom parser found ${overviewResult.summary.totalSymbols} total symbols across ${overviewResult.summary.totalFiles} files.`);
    response.appendResponseLine('');

    // ── Step 2: Process each language ──

    response.appendResponseLine('### Step 2: Running VS Code semantic APIs for each language...');
    response.appendResponseLine('');

    const results: FileResult[] = [];

    for (const {ext, language} of extensions) {
      const fileName = `${TEST_FILE_PREFIX}.${ext}`;
      const filePath = join(testWorkspacePath, fileName);

      if (!existsSync(filePath)) {
        response.appendResponseLine(`⏭️ Skipping ${language} — \`${fileName}\` not found`);
        continue;
      }

      response.appendResponseLine(`🔄 Processing ${language}...`);

      // Get file line count
      const fileContent = readFileSync(filePath, 'utf-8');
      const fileLineCount = fileContent.split('\n').length;

      // ── VS Code Symbols via dedicated handler ──
      const vscodeStart = Date.now();
      const vscodeResult = await getVscodeSymbolsViaCommand(filePath);
      const vscodeDurationMs = Date.now() - vscodeStart;
      const vscodeNormalized = vscodeResult.symbols.map(normalizeVscodeSymbol);

      // ── VS Code Folding Ranges ──
      const foldingStart = Date.now();
      let foldingRanges: FoldingRangeResult;
      try {
        foldingRanges = await dragraceGetFoldingRanges(filePath);
      } catch {
        foldingRanges = {ranges: [], error: 'Request failed'};
      }
      const foldingDurationMs = Date.now() - foldingStart;

      // ── VS Code Semantic Tokens ──
      const tokensStart = Date.now();
      let semanticTokens: SemanticTokensResult;
      try {
        semanticTokens = await dragraceGetSemanticTokens(filePath);
      } catch {
        semanticTokens = {tokens: [], legend: {tokenTypes: [], tokenModifiers: []}, error: 'Request failed'};
      }
      const semanticTokensDurationMs = Date.now() - tokensStart;

      // ── Custom AST Symbols from overview ──
      const customStart = Date.now();
      const customRawSymbols = findFileSymbols(overviewResult.tree, fileName);
      const customDurationMs = Date.now() - customStart;
      const customNormalized = customRawSymbols.map(normalizeCustomSymbol);

      // ── Collect stats ──
      const vscodeKinds = new Map<string, number>();
      const customKinds = new Map<string, number>();
      collectKinds(vscodeNormalized, vscodeKinds);
      collectKinds(customNormalized, customKinds);

      const result: FileResult = {
        ext,
        language,
        fileName,
        fileLineCount,
        vscodeSymbols: vscodeNormalized,
        customSymbols: customNormalized,
        vscodeCount: countSymbols(vscodeNormalized),
        customCount: countSymbols(customNormalized),
        vscodeKinds,
        customKinds,
        vscodeDepth: vscodeNormalized.length > 0 ? getMaxDepth(vscodeNormalized) : 0,
        customDepth: customNormalized.length > 0 ? getMaxDepth(customNormalized) : 0,
        vscodeDurationMs,
        customDurationMs,
        vscodeError: vscodeResult.error,
        foldingRanges,
        foldingDurationMs,
        semanticTokens,
        semanticTokensDurationMs,
      };

      results.push(result);

      // ── Save individual JSON files ──
      const vscodeJsonPath = join(dragracePath, `vscode.${ext}.json`);
      const customJsonPath = join(dragracePath, `custom.${ext}.json`);
      const foldingJsonPath = join(dragracePath, `folding.${ext}.json`);
      const tokensJsonPath = join(dragracePath, `tokens.${ext}.json`);

      writeFileSync(vscodeJsonPath, JSON.stringify(vscodeNormalized, null, 2), 'utf-8');
      writeFileSync(customJsonPath, JSON.stringify(customNormalized, null, 2), 'utf-8');
      writeFileSync(foldingJsonPath, JSON.stringify(foldingRanges.ranges, null, 2), 'utf-8');

      // Semantic tokens: save summary (not full token list — can be huge)
      const tokenTypeCounts = new Map<string, number>();
      for (const t of semanticTokens.tokens) {
        tokenTypeCounts.set(t.type, (tokenTypeCounts.get(t.type) ?? 0) + 1);
      }
      const tokensSummary = {
        totalTokens: semanticTokens.tokens.length,
        legend: semanticTokens.legend,
        tokenTypeCounts: Object.fromEntries(tokenTypeCounts),
        error: semanticTokens.error,
      };
      writeFileSync(tokensJsonPath, JSON.stringify(tokensSummary, null, 2), 'utf-8');

      if (result.vscodeError) {
        response.appendResponseLine(
          `  ⚠️ ${language}: Symbols=**CRASHED** (${result.vscodeError}), Custom=${result.customCount}, Folding=${foldingRanges.ranges.length}, Tokens=${semanticTokens.tokens.length}`,
        );
      } else {
        response.appendResponseLine(
          `  ✅ ${language}: Symbols=${result.vscodeCount}/${result.customCount}, Folding=${foldingRanges.ranges.length}, Tokens=${semanticTokens.tokens.length} (${vscodeDurationMs + foldingDurationMs + semanticTokensDurationMs}ms)`,
        );
      }
    }

    // ── Step 3: Generate & save report ──

    response.appendResponseLine('');
    response.appendResponseLine('### Step 3: Generating report...');

    const totalDuration = Date.now() - startTime;
    const report = generateReport(results, totalDuration);
    const reportPath = join(dragracePath, 'report.md');
    writeFileSync(reportPath, report, 'utf-8');

    response.appendResponseLine('');
    response.appendResponseLine(`📝 Report saved to: \`${reportPath}\``);
    response.appendResponseLine('');

    // ── Summary in tool response ──
    let vscodeTotal = 0;
    let customTotal = 0;
    let foldingTotal = 0;
    let tokensTotal = 0;
    for (const r of results) {
      vscodeTotal += r.vscodeCount;
      customTotal += r.customCount;
      foldingTotal += r.foldingRanges.ranges.length;
      tokensTotal += r.semanticTokens.tokens.length;
    }

    response.appendResponseLine('### Results Summary');
    response.appendResponseLine('');
    response.appendResponseLine(`- **Languages tested:** ${results.length}`);
    response.appendResponseLine(`- **VS Code total symbols:** ${vscodeTotal}`);
    response.appendResponseLine(`- **Custom total symbols:** ${customTotal}`);
    response.appendResponseLine(`- **Total folding ranges:** ${foldingTotal}`);
    response.appendResponseLine(`- **Total semantic tokens:** ${tokensTotal}`);
    response.appendResponseLine(`- **Duration:** ${(totalDuration / 1000).toFixed(2)}s`);
    response.appendResponseLine(`- **Output directory:** \`${dragracePath}\``);
    response.appendResponseLine('');

    // List generated files
    response.appendResponseLine('### Generated Files');
    response.appendResponseLine('');
    response.appendResponseLine(`- \`dragrace/report.md\` — Full comparison report`);
    for (const r of results) {
      response.appendResponseLine(`- \`dragrace/vscode.${r.ext}.json\` — VS Code symbols for ${r.language}`);
      response.appendResponseLine(`- \`dragrace/custom.${r.ext}.json\` — Custom symbols for ${r.language}`);
      response.appendResponseLine(`- \`dragrace/folding.${r.ext}.json\` — Folding ranges for ${r.language}`);
      response.appendResponseLine(`- \`dragrace/tokens.${r.ext}.json\` — Semantic token summary for ${r.language}`);
    }
  },
});
