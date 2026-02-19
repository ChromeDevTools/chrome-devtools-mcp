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
import {getHostWorkspace} from '../../config.js';
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

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

// ── Formatting ───────────────────────────────────────────

function formatSymbol(symbol: CodebaseSymbolNode, depth: number): string {
  const indent = INDENT.repeat(depth);
  let output = `${indent}${symbol.kind} ${symbol.name}\n`;
  if (symbol.children) {
    for (const child of symbol.children) {
      output += formatSymbol(child, depth + 1);
    }
  }
  return output;
}

function formatTree(
  nodes: CodebaseTreeNode[],
  showSymbols: boolean,
  showFiles: boolean,
  depth: number = 0,
): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      output += `${indent}${node.name}/\n`;
      if (node.children) {
        output += formatTree(node.children, showSymbols, showFiles, depth + 1);
      }
    } else if (node.type === 'file' && showFiles) {
      output += `${indent}${node.name}\n`;
      if (showSymbols && node.symbols) {
        for (const sym of node.symbols) {
          output += formatSymbol(sym, depth + 1);
        }
      }
    }
  }
  return output;
}

function formatFlatPaths(nodes: CodebaseTreeNode[], prefix = ''): string {
  let output = '';
  for (const node of nodes) {
    const p = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      output += p + '\n';
    } else if (node.children) {
      output += formatFlatPaths(node.children, p);
    }
  }
  return output;
}

function formatFolderSummary(nodes: CodebaseTreeNode[], depth = 0): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      const fileCount = countFiles(node);
      output += `${indent}${node.name}/ (${fileCount} files)\n`;
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

// ── Tool Definition ──────────────────────────────────────

export const map = defineTool({
  name: 'exp_codebase_map',
  description: 'Get a structural map of the codebase at any granularity — folders, files, or symbols.\n\n' +
    'Returns a tree with folders ending in `/`, files with extensions, and symbols as `kind name`.\n\n' +
    '**Parameters:**\n' +
    '- `folderPath` — Folder to map (relative or absolute). Defaults to workspace root.\n' +
    '- `recursive` — Include subdirectories recursively. Default: false (immediate children only).\n' +
    '- `fileTypes` — Which files to include: `"*"` (all), `"none"` (folders only), or array of extensions.\n' +
    '- `symbols` — Include symbol skeleton (name + kind, hierarchically nested). Default: false.\n\n' +
    '**EXAMPLES:**\n' +
    '- Shallow view of root: `{}`\n' +
    '- Full project tree: `{ recursive: true }`\n' +
    '- Only TypeScript files: `{ fileTypes: [".ts"], recursive: true }`\n' +
    '- Folder structure only: `{ fileTypes: "none", recursive: true }`\n' +
    '- Specific folder with symbols: `{ folderPath: "src", recursive: true, symbols: true }`\n' +
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
  },
  handler: async (request, response) => {
    const {params} = request;
    response.setSkipLedger();

    const rootDir = getHostWorkspace();
    const folderPath = params.folderPath ?? rootDir;
    const recursive = params.recursive ?? false;
    const fileTypes = params.fileTypes ?? '*';
    const symbols = params.symbols ?? false;
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
    );

    if (overviewResult.summary.totalFiles === 0 && !isNone) {
      const ignoreContext = readIgnoreContext(overviewResult.projectRoot);
      response.appendResponseLine(`Root: ${normalizePath(overviewResult.projectRoot)}\n`);
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
    let output = formatTree(overviewResult.tree, showSymbols, showFiles);
    const reductionsApplied: string[] = [];

    // Adaptive compression — progressively reduce detail if output exceeds token limit
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && showSymbols) {
      showSymbols = false;
      reductionsApplied.push('remove-symbols');
      output = formatTree(overviewResult.tree, showSymbols, showFiles);
    }

    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && showFiles) {
      showFiles = false;
      reductionsApplied.push('folders-only');
      output = formatTree(overviewResult.tree, showSymbols, showFiles);
    }

    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
      reductionsApplied.push('flat-paths');
      output = formatFlatPaths(overviewResult.tree);
    }

    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
      reductionsApplied.push('folder-summary');
      output = formatFolderSummary(overviewResult.tree);
    }

    response.appendResponseLine(`Root: ${normalizePath(overviewResult.projectRoot)}\n`);

    if (reductionsApplied.length > 0) {
      response.appendResponseLine(`Compression: ${reductionsApplied.join(' → ')}\n`);
    }

    response.appendResponseLine(output.trimEnd());
  },
});
