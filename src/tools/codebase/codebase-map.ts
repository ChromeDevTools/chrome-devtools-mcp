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

const OUTPUT_CHAR_LIMIT = 12_000;
const INDENT = '  ';

type MetadataMode = boolean | 'auto';

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

function folderMeta(nodes: CodebaseTreeNode[]): string {
  const f = countImmediateFiles(nodes);
  const d = countImmediateSubfolders(nodes);
  return `[${f}F|${d}D]`;
}

function fileMeta(node: CodebaseTreeNode, includeSymbols: boolean): string {
  const parts: string[] = [];
  if (node.lineCount != null) parts.push(`${node.lineCount}L`);
  if (includeSymbols && node.symbols) parts.push(`${countSymbolsDeep(node.symbols)}S`);
  return parts.length > 0 ? `[${parts.join('|')}]` : '';
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

interface TreeFormatOptions {
  showFiles: boolean;
  showSymbols: boolean;
  metadata: MetadataMode;
  maxFolderDepth?: number;
  maxFileFolderDepth?: number;
  maxSymbolFolderDepth?: number;
  maxSymbolNesting?: number;
  /** Fallback nesting for folder depths beyond deepNestingUpTo. */
  baseSymbolNesting?: number;
  /** Folder depths 0..this get maxSymbolNesting; deeper depths get baseSymbolNesting. */
  deepNestingUpTo?: number;
}

function formatTree(
  nodes: CodebaseTreeNode[],
  opts: TreeFormatOptions,
  depth: number = 0,
): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      const willRecurse = !!node.children?.length
        && (opts.maxFolderDepth === undefined || depth < opts.maxFolderDepth);

      const childFilesHidden = !opts.showFiles
        || (opts.maxFileFolderDepth !== undefined && depth >= opts.maxFileFolderDepth);

      const hasContent = !!node.children?.length;
      const isCompressed = hasContent && (!willRecurse || childFilesHidden);

      const showMeta = opts.metadata === true
        || (opts.metadata === 'auto' && isCompressed);

      if (showMeta && node.children) {
        output += `${indent}${folderMeta(node.children)} ${node.name}/\n`;
      } else {
        output += `${indent}${node.name}/\n`;
      }

      if (willRecurse && node.children) {
        output += formatTree(node.children, opts, depth + 1);
      }
    } else if (node.type === 'file') {
      if (!opts.showFiles) continue;
      if (opts.maxFileFolderDepth !== undefined && depth > opts.maxFileFolderDepth) continue;

      const showSymsHere = opts.showSymbols
        && (opts.maxSymbolFolderDepth === undefined || depth <= opts.maxSymbolFolderDepth);
      const hasSymbols = !!node.symbols?.length;
      const isCompressed = hasSymbols && !showSymsHere;

      const showMeta = opts.metadata === true
        || (opts.metadata === 'auto' && isCompressed);

      if (showMeta) {
        const meta = fileMeta(node, !showSymsHere);
        output += meta ? `${indent}${meta} ${node.name}\n` : `${indent}${node.name}\n`;
      } else {
        output += `${indent}${node.name}\n`;
      }

      if (showSymsHere && node.symbols) {
        const effectiveNesting =
          (opts.deepNestingUpTo !== undefined && depth > opts.deepNestingUpTo)
            ? (opts.baseSymbolNesting ?? opts.maxSymbolNesting)
            : opts.maxSymbolNesting;

        for (const sym of node.symbols) {
          output += formatSymbol(sym, depth + 1, effectiveNesting);
        }
      }
    }
  }
  return output;
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

function maxFolderTreeDepth(nodes: CodebaseTreeNode[], current = 0): number {
  let max = current;
  for (const node of nodes) {
    if (node.type === 'directory' && node.children) {
      max = Math.max(max, maxFolderTreeDepth(node.children, current + 1));
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
    '- `metadata` — Show counts per file/folder. Key: F=files, D=directories, L=lines, S=symbols. Example: `[5F|3D]` = 5 files, 3 dirs. `[61L|25S]` = 61 lines, 25 symbols. Default: false.\n\n' +
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
      .describe('Show counts. Key: F=files, D=directories, L=lines, S=symbols. E.g. [5F|3D] [61L|25S]. Default: false.'),
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

    // ── Incremental compression ──
    // Build output from shallowest to deepest, checking the character count at
    // each level. Stop at the first level that would exceed the limit.
    // Order: folders (by depth) → files (by folder depth) → symbols (by folder depth × nesting depth)
    const tree = overviewResult.tree;
    const maxFD = maxFolderTreeDepth(tree);
    const maxSN = symbols ? maxTreeSymbolDepth(tree) : 0;

    // Quick check: does the full output fit without any compression?
    const fullOutput = formatTree(tree, {
      showFiles: !isNone,
      showSymbols: symbols,
      metadata: metadata,
    });

    if (fullOutput.length <= OUTPUT_CHAR_LIMIT) {
      response.appendResponseLine(fullOutput.trimEnd());
      return;
    }

    // Compression needed — incrementally build up detail levels.
    // Metadata auto-enables on compressed items to show what's hidden.
    const metaMode: MetadataMode = metadata ? true : 'auto';
    let bestOutput = '';
    let compressionLabel = '';

    // Phase 1: Folders — expand folder depth level by level
    let folderLimit = 0;
    for (let fd = 0; fd <= maxFD; fd++) {
      const candidate = formatTree(tree, {
        showFiles: false, showSymbols: false, metadata: metaMode,
        maxFolderDepth: fd,
      });
      if (candidate.length > OUTPUT_CHAR_LIMIT) {
        if (fd === 0) {
          response.appendResponseLine(
            'Error: the folder structure at the root level alone exceeds the output limit. ' +
            'Try targeting a specific subfolder with the folderPath parameter.\n',
          );
          return;
        }
        folderLimit = fd - 1;
        compressionLabel = `folder depth ${folderLimit}/${maxFD}`;
        break;
      }
      folderLimit = fd;
      bestOutput = candidate;
    }

    // Phase 2: Files — expand per folder depth level
    let fileLimit = -1;
    if (!compressionLabel && !isNone) {
      for (let fd = 0; fd <= folderLimit; fd++) {
        const candidate = formatTree(tree, {
          showFiles: true, showSymbols: false, metadata: metaMode,
          maxFolderDepth: folderLimit,
          maxFileFolderDepth: fd,
        });
        if (candidate.length > OUTPUT_CHAR_LIMIT) {
          if (fd === 0) {
            compressionLabel = 'folders only';
          } else {
            fileLimit = fd - 1;
            bestOutput = formatTree(tree, {
              showFiles: true, showSymbols: false, metadata: metaMode,
              maxFolderDepth: folderLimit, maxFileFolderDepth: fileLimit,
            });
            compressionLabel = `files to depth ${fileLimit}`;
          }
          break;
        }
        fileLimit = fd;
        bestOutput = candidate;
      }
    }

    // Phase 3: Symbols — expand per folder depth, then per nesting depth
    let symbolFolderLimit = -1;
    if (!compressionLabel && symbols && fileLimit >= 0) {
      // Phase 3a: Top-level symbols (nesting 0) per folder depth
      for (let fd = 0; fd <= fileLimit; fd++) {
        const candidate = formatTree(tree, {
          showFiles: true, showSymbols: true, metadata: metaMode,
          maxFolderDepth: folderLimit, maxFileFolderDepth: fileLimit,
          maxSymbolFolderDepth: fd, maxSymbolNesting: 0,
        });
        if (candidate.length > OUTPUT_CHAR_LIMIT) {
          if (fd === 0) {
            compressionLabel = 'no symbols';
          } else {
            symbolFolderLimit = fd - 1;
            bestOutput = formatTree(tree, {
              showFiles: true, showSymbols: true, metadata: metaMode,
              maxFolderDepth: folderLimit, maxFileFolderDepth: fileLimit,
              maxSymbolFolderDepth: symbolFolderLimit, maxSymbolNesting: 0,
            });
            compressionLabel = `symbols to folder depth ${symbolFolderLimit}`;
          }
          break;
        }
        symbolFolderLimit = fd;
        bestOutput = candidate;
      }

      // Phase 3b: Deeper nesting — for each nesting level, expand per folder depth
      if (!compressionLabel && symbolFolderLimit >= 0) {
        for (let nesting = 1; nesting <= maxSN; nesting++) {
          let nestingFailed = false;

          for (let fd = 0; fd <= symbolFolderLimit; fd++) {
            const isFullCoverage = fd >= symbolFolderLimit;
            const candidate = formatTree(tree, {
              showFiles: true, showSymbols: true, metadata: metaMode,
              maxFolderDepth: folderLimit, maxFileFolderDepth: fileLimit,
              maxSymbolFolderDepth: symbolFolderLimit,
              maxSymbolNesting: nesting,
              ...(isFullCoverage ? {} : {
                baseSymbolNesting: nesting - 1,
                deepNestingUpTo: fd,
              }),
            });

            if (candidate.length > OUTPUT_CHAR_LIMIT) {
              nestingFailed = true;
              if (fd === 0) {
                compressionLabel = `symbol nesting ${nesting - 1}`;
              } else {
                bestOutput = formatTree(tree, {
                  showFiles: true, showSymbols: true, metadata: metaMode,
                  maxFolderDepth: folderLimit, maxFileFolderDepth: fileLimit,
                  maxSymbolFolderDepth: symbolFolderLimit,
                  maxSymbolNesting: nesting,
                  baseSymbolNesting: nesting - 1,
                  deepNestingUpTo: fd - 1,
                });
                compressionLabel = `symbol nesting ${nesting} to depth ${fd - 1}`;
              }
              break;
            }
            bestOutput = candidate;
          }

          if (nestingFailed) break;
        }
      }
    }

    // Emit compressed result
    if (compressionLabel) {
      response.appendResponseLine(
        `Output compressed: ${compressionLabel}. ` +
        'Use folderPath to target a specific subfolder, or file_read for full file details.\n',
      );
    }

    response.appendResponseLine(bestOutput.trimEnd());
  },
});
