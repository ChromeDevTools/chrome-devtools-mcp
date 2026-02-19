/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseGetOverview,
  type CodebaseTreeNode,
  type CodebaseSymbolNode,
} from '../../client-pipe.js';
import {getClientWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {readIgnoreContext} from './ignore-context.js';

// ── Constants ────────────────────────────────────────────

const TIMEOUT_BASE_MS = 15_000;
const TIMEOUT_RECURSIVE_MS = 45_000;
const TIMEOUT_SYMBOLS_MS = 30_000;

const OUTPUT_TOKEN_LIMIT = 3_000;
const CHARS_PER_TOKEN = 4;
const INDENT = '  ';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ── Formatting ───────────────────────────────────────────

function countSymbolsDeep(symbols: CodebaseSymbolNode[]): number {
  let count = symbols.length;
  for (const s of symbols) {
    if (s.children) count += countSymbolsDeep(s.children);
  }
  return count;
}

function countImmediateFiles(nodes: CodebaseTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'file') count++;
  }
  return count;
}

function countImmediateSubfolders(nodes: CodebaseTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'directory') count++;
  }
  return count;
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${pluralForm}`;
}

function formatSymbol(symbol: CodebaseSymbolNode, depth: number, maxSymbolDepth?: number, currentSymbolDepth = 0): string {
  const indent = INDENT.repeat(depth);
  let output = `${indent}${symbol.kind} ${symbol.name}\n`;
  if (symbol.children && (maxSymbolDepth === undefined || currentSymbolDepth < maxSymbolDepth)) {
    for (const child of symbol.children) {
      output += formatSymbol(child, depth + 1, maxSymbolDepth, currentSymbolDepth + 1);
    }
  }
  return output;
}

function formatTree(
  nodes: CodebaseTreeNode[],
  showSymbols: boolean,
  showFiles: boolean,
  showMetadata: boolean,
  depth: number = 0,
  maxSymbolDepth?: number,
): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      if (showMetadata && node.children) {
        const files = countImmediateFiles(node.children);
        const subs = countImmediateSubfolders(node.children);
        output += `${indent}[${plural(files, 'file', 'files')}, ${plural(subs, 'subfolder', 'subfolders')}] ${node.name}/\n`;
      } else {
        output += `${indent}${node.name}/\n`;
      }
      if (node.children) {
        output += formatTree(node.children, showSymbols, showFiles, showMetadata, depth + 1, maxSymbolDepth);
      }
    } else if (node.type === 'file' && showFiles) {
      if (showMetadata) {
        const linePart = node.lineCount != null ? `[${plural(node.lineCount, 'line', 'lines')}] ` : '';
        const symPart = node.symbols ? `[${plural(countSymbolsDeep(node.symbols), 'symbol', 'symbols')}] ` : '';
        output += `${indent}${linePart}${symPart}${node.name}\n`;
      } else {
        output += `${indent}${node.name}\n`;
      }
      if (showSymbols && node.symbols) {
        for (const sym of node.symbols) {
          output += formatSymbol(sym, depth + 1, maxSymbolDepth);
        }
      }
    }
  }
  return output;
}

function formatFlatPaths(nodes: CodebaseTreeNode[], showMetadata: boolean, prefix = ''): string {
  let output = '';
  for (const node of nodes) {
    const p = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      if (showMetadata) {
        const linePart = node.lineCount != null ? `[${plural(node.lineCount, 'line', 'lines')}] ` : '';
        const symPart = node.symbols ? `[${plural(countSymbolsDeep(node.symbols), 'symbol', 'symbols')}] ` : '';
        output += `${linePart}${symPart}${p}\n`;
      } else {
        output += p + '\n';
      }
    } else if (node.children) {
      output += formatFlatPaths(node.children, showMetadata, p);
    }
  }
  return output;
}

function formatFolderSummary(nodes: CodebaseTreeNode[], depth = 0): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      const files = node.children ? countImmediateFiles(node.children) : 0;
      const subs = node.children ? countImmediateSubfolders(node.children) : 0;
      output += `${indent}[${plural(files, 'file', 'files')}, ${plural(subs, 'subfolder', 'subfolders')}] ${node.name}/\n`;
      if (node.children) {
        output += formatFolderSummary(node.children, depth + 1);
      }
    }
  }
  return output;
}

function countFiles(node: CodebaseTreeNode): number {
  if (node.type === 'file') return 1;
  let count = 0;
  if (node.children) {
    for (const child of node.children) {
      count += countFiles(child);
    }
  }
  return count;
}

function maxSymbolTreeDepth(symbols: CodebaseSymbolNode[], current = 0): number {
  let max = current;
  for (const s of symbols) {
    if (s.children && s.children.length > 0) {
      max = Math.max(max, maxSymbolTreeDepth(s.children, current + 1));
    }
  }
  return max;
}

function maxTreeSymbolDepth(nodes: CodebaseTreeNode[]): number {
  let max = 0;
  for (const node of nodes) {
    if (node.type === 'file' && node.symbols) {
      max = Math.max(max, maxSymbolTreeDepth(node.symbols));
    } else if (node.type === 'directory' && node.children) {
      max = Math.max(max, maxTreeSymbolDepth(node.children));
    }
  }
  return max;
}

// ── Tool Definition ──────────────────────────────────────

export const map = defineTool({
  name: 'exp_codebase_map',
  description: 'Get a structural map of the codebase at any granularity — folders, files, or symbols.\n\n' +
    'Returns a tree with folders ending in `/`, files with extensions, and symbols as `kind name`.\n\n' +
    '**Parameters:**\n' +
    '- `folderPath` — Folder to map (relative or absolute). Defaults to workspace root.\n' +
    '- `recursive` — Include subdirectories recursively. Default: false (immediate children only).\n' +
    '- `fileTypes` — Which files to include: `"*"` (all), `"none"` (folders only), or array of extensions.\n' +
    '- `symbols` — Include symbol skeleton (name + kind, hierarchically nested). Default: false.\n' +
    '- `metadata` — Show counts: `[N lines] [M symbols]` per file, `[N files, M subfolders]` per folder. Default: false.\n\n' +
    '**EXAMPLES:**\n' +
    '- Shallow view of root: `{}`\n' +
    '- Full project tree: `{ recursive: true }`\n' +
    '- Only TypeScript files: `{ fileTypes: [".ts"], recursive: true }`\n' +
    '- Folder structure only: `{ fileTypes: "none", recursive: true }`\n' +
    '- Specific folder with symbols: `{ folderPath: "src", recursive: true, symbols: true }`\n' +
    '- Tree with metadata: `{ recursive: true, metadata: true }`\n' +
    '- Only CSS files in a subfolder: `{ folderPath: "src/styles", fileTypes: [".css", ".scss"] }`',
  annotations: {
    title: 'Codebase Map',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe', 'codebase-sequential'],
  },
  schema: {
    folderPath: zod.string().optional()
      .describe('Folder to map. Relative to workspace root or absolute. Defaults to workspace root.'),

    recursive: zod.boolean().optional()
      .describe('Include subdirectories recursively. Default: false (immediate children only).'),

    fileTypes: zod.union([
      zod.literal('*'),
      zod.literal('none'),
      zod.array(zod.string()),
    ]).optional()
      .describe('"*" = all files (default), "none" = folders only, or array of extensions like [".ts", ".md"].'),

    symbols: zod.boolean().optional()
      .describe('Include symbol skeleton (name + kind, hierarchically nested). Default: false.'),

    metadata: zod.boolean().optional()
      .describe('Show counts per file ([N lines] [M symbols]) and per folder ([N files, M subfolders]). Default: false.'),
  },
  handler: async (request, response) => {
    const {params} = request;
    response.setSkipLedger();

    const rootDir = getClientWorkspace();
    const folderPath = params.folderPath ?? rootDir;
    const recursive = params.recursive ?? false;
    const fileTypes = params.fileTypes ?? '*';
    const symbols = params.symbols ?? false;
    const metadata = params.metadata ?? false;
    const isNone = fileTypes === 'none';

    // Dynamic timeout based on request scope
    const dynamicTimeout =
      TIMEOUT_BASE_MS +
      (recursive ? TIMEOUT_RECURSIVE_MS : 0) +
      (symbols ? TIMEOUT_SYMBOLS_MS : 0);

    const overviewResult = await codebaseGetOverview(
      rootDir,
      folderPath,
      recursive,
      fileTypes,
      symbols,
      dynamicTimeout,
      metadata,
    );

    if (overviewResult.summary.totalFiles === 0 && !isNone) {
      const ignoreContext = readIgnoreContext(overviewResult.projectRoot);
      response.appendResponseLine('No files found. Check scope patterns or .devtoolsignore.\n');
      if (ignoreContext.activePatterns.length > 0) {
        response.appendResponseLine('Current .devtoolsignore patterns:\n');
        for (const pattern of ignoreContext.activePatterns) {
          response.appendResponseLine(pattern);
        }
      }
      return;
    }

    // Build output
    let showFiles = !isNone;
    let showSymbols = symbols;
    let showMetadata = metadata;
    let output = formatTree(overviewResult.tree, showSymbols, showFiles, showMetadata);
    const reductionsApplied: string[] = [];

    // Adaptive compression — progressively reduce symbol depth before removing symbols entirely
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && showSymbols) {
      showMetadata = true;
      const deepest = maxTreeSymbolDepth(overviewResult.tree);

      // Try each depth level from deepest-1 down to 0 (top-level symbols only)
      for (let d = deepest - 1; d >= 0; d--) {
        output = formatTree(overviewResult.tree, showSymbols, showFiles, showMetadata, 0, d);
        if (estimateTokens(output) <= OUTPUT_TOKEN_LIMIT) {
          reductionsApplied.push(`symbol-depth-${d}`);
          break;
        }
      }

      // If even top-level symbols (depth 0) is too large, remove symbols entirely
      if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
        showSymbols = false;
        reductionsApplied.push('remove-symbols');
        output = formatTree(overviewResult.tree, showSymbols, showFiles, showMetadata);
      }
    }

    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && showFiles) {
      showFiles = false;
      reductionsApplied.push('folders-only');
      output = formatTree(overviewResult.tree, showSymbols, showFiles, showMetadata);
    }

    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
      reductionsApplied.push('flat-paths');
      output = formatFlatPaths(overviewResult.tree, showMetadata);
    }

    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
      reductionsApplied.push('folder-summary');
      output = formatFolderSummary(overviewResult.tree);
    }

    if (reductionsApplied.length > 0) {
      const steps = reductionsApplied.join(' → ');
      response.appendResponseLine(
        `Output exceeded token limit. Compression applied: ${steps}. ` +
        'Use the returned map to navigate from here, or use file_read with a specific folder/file for full detail.\n',
      );
    }

    response.appendResponseLine(output.trimEnd());
  },
});
