/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  fileExtractStructure,
  fileReadContent,
  fileHighlightReadRange,
  OrphanedSymbolNode,
  UnifiedFileSymbol,
  UnifiedFileResult,
} from '../../client-pipe.js';
import {getClientWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {CHARACTER_LIMIT, defineTool} from '../ToolDefinition.js';
import {resolveSymbolTarget} from './symbol-resolver.js';
import type {SymbolLike} from './symbol-resolver.js';

function resolveFilePath(file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(getClientWorkspace(), file);
}

// Supported TS/JS file extensions for structured extraction
const STRUCTURED_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs',
]);

// Special target keywords for orphaned content
const SPECIAL_TARGETS = ['#imports', '#exports', '#comments'] as const;
type SpecialTarget = typeof SPECIAL_TARGETS[number];

function isSpecialTarget(target: string): target is SpecialTarget {
  return SPECIAL_TARGETS.includes(target as SpecialTarget);
}

/**
 * Extract lines from full content by 1-indexed line range.
 */
function getContentSlice(allLines: string[], startLine: number, endLine: number): string {
  return allLines.slice(startLine - 1, endLine).join('\n');
}

/**
 * Prefix each line in a content string with its 1-indexed line number.
 */
function addLineNumbers(content: string, startLine1: number): string {
  return content.split('\n').map((line, i) => `[${startLine1 + i}] ${line}`).join('\n');
}

function formatSkeletonEntry(
  symbol: SymbolLike | OrphanedSymbolNode,
  indent = '',
  recursive = false,
): string[] {
  const lines: string[] = [];
  // Both UnifiedFileSymbol and OrphanedSymbolNode are 1-indexed
  const startLine = 'startLine' in symbol.range ? symbol.range.startLine : symbol.range.start;
  const endLine = 'startLine' in symbol.range ? symbol.range.endLine : symbol.range.end;
  const range = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

  lines.push(`${indent}[${range}] ${symbol.kind} ${symbol.name}`);

  if (recursive && symbol.children && symbol.children.length > 0) {
    for (const child of symbol.children) {
      lines.push(...formatSkeletonEntry(child, indent + '  ', recursive));
    }
  }

  return lines;
}

/**
 * Format content with child placeholders and line numbers.
 * All line ranges are 1-indexed.
 */
function formatContentWithPlaceholders(
  allLines: string[],
  symbol: SymbolLike,
  startLine: number,
  endLine: number,
): string {
  if (!symbol.children || symbol.children.length === 0) {
    return addLineNumbers(getContentSlice(allLines, startLine, endLine), startLine);
  }

  const childMap = new Map<number, SymbolLike>();
  for (const child of symbol.children) {
    for (let l = child.range.startLine; l <= child.range.endLine; l++) {
      childMap.set(l, child);
    }
  }

  const emitted = new Set<SymbolLike>();
  const result: string[] = [];

  for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
    const child = childMap.get(lineNum);
    if (child) {
      if (!emitted.has(child)) {
        emitted.add(child);
        const childRange = child.range.startLine === child.range.endLine
          ? `${child.range.startLine}`
          : `${child.range.startLine}-${child.range.endLine}`;
        result.push(`[${childRange}] ${child.kind} ${child.name}`);
      }
    } else {
      result.push(`[${lineNum}] ${allLines[lineNum - 1] ?? ''}`);
    }
  }

  return result.join('\n');
}

// ── Structured Line-Range Infrastructure ──────────────────

type NonSymbolType = 'import' | 'export' | 'comment' | 'directive' | 'gap';

interface NonSymbolBlock {
  type: NonSymbolType;
  startLine: number;  // 1-indexed
  endLine: number;    // 1-indexed
}

type LineOwner =
  | { type: 'symbol'; symbol: UnifiedFileSymbol }
  | { type: 'block'; block: NonSymbolBlock };

/**
 * Group consecutive non-symbol items of the same type into atomic blocks.
 * Each block represents a contiguous run of the same non-symbol category.
 * Lines within symbol ranges are excluded — only "between-symbol" content forms blocks.
 */
function buildNonSymbolBlocks(structure: UnifiedFileResult): NonSymbolBlock[] {
  // Build set of lines owned by symbols so we can exclude them
  const symbolLines = new Set<number>();
  for (const sym of structure.symbols) {
    for (let l = sym.range.startLine; l <= sym.range.endLine; l++) {
      symbolLines.add(l);
    }
  }

  const tagged: Array<{ line: number; type: NonSymbolType }> = [];

  for (const imp of structure.imports) {
    for (let line = imp.range.start; line <= imp.range.end; line++) {
      if (!symbolLines.has(line)) tagged.push({ line, type: 'import' });
    }
  }
  for (const exp of structure.exports) {
    for (let line = exp.range.start; line <= exp.range.end; line++) {
      if (!symbolLines.has(line)) tagged.push({ line, type: 'export' });
    }
  }
  for (const comment of structure.orphanComments) {
    for (let line = comment.range.start; line <= comment.range.end; line++) {
      if (!symbolLines.has(line)) tagged.push({ line, type: 'comment' });
    }
  }
  for (const dir of structure.directives) {
    for (let line = dir.range.start; line <= dir.range.end; line++) {
      if (!symbolLines.has(line)) tagged.push({ line, type: 'directive' });
    }
  }
  for (const gap of structure.gaps) {
    for (let line = gap.start; line <= gap.end; line++) {
      if (!symbolLines.has(line)) tagged.push({ line, type: 'gap' });
    }
  }

  tagged.sort((a, b) => a.line - b.line);

  const blocks: NonSymbolBlock[] = [];
  let current: NonSymbolBlock | undefined;

  for (const entry of tagged) {
    if (current && current.type === entry.type && entry.line === current.endLine + 1) {
      current.endLine = entry.line;
    } else {
      if (current) blocks.push(current);
      current = { type: entry.type, startLine: entry.line, endLine: entry.line };
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

/**
 * Build a map from line number → owning entity (symbol or non-symbol block).
 * Only covers lines within the requested range for efficiency.
 */
function classifyLines(
  structure: UnifiedFileResult,
  blocks: NonSymbolBlock[],
  startLine: number,
  endLine: number,
): Map<number, LineOwner> {
  const owners = new Map<number, LineOwner>();

  for (const sym of structure.symbols) {
    const symStart = sym.range.startLine;
    const symEnd = sym.range.endLine;
    if (symEnd < startLine || symStart > endLine) continue;
    const from = Math.max(symStart, startLine);
    const to = Math.min(symEnd, endLine);
    const owner: LineOwner = { type: 'symbol', symbol: sym };
    for (let line = from; line <= to; line++) {
      owners.set(line, owner);
    }
  }

  for (const block of blocks) {
    if (block.endLine < startLine || block.startLine > endLine) continue;
    const from = Math.max(block.startLine, startLine);
    const to = Math.min(block.endLine, endLine);
    const owner: LineOwner = { type: 'block', block };
    for (let line = from; line <= to; line++) {
      if (!owners.has(line)) owners.set(line, owner);
    }
  }

  return owners;
}

/**
 * Expand the requested range so that any partially-touched non-symbol block
 * is fully included. Symbols are NOT expanded (they become stubs).
 */
function expandToBlockBoundaries(
  requestedStart: number,
  requestedEnd: number,
  blocks: NonSymbolBlock[],
): { expandedStart: number; expandedEnd: number } {
  let expandedStart = requestedStart;
  let expandedEnd = requestedEnd;

  for (const block of blocks) {
    if (block.startLine <= requestedStart && block.endLine >= requestedStart) {
      expandedStart = Math.min(expandedStart, block.startLine);
    }
    if (block.startLine <= requestedEnd && block.endLine >= requestedEnd) {
      expandedEnd = Math.max(expandedEnd, block.endLine);
    }
  }

  return { expandedStart, expandedEnd };
}

/**
 * Render a structured line range: raw source for non-symbols, collapsed stubs for symbols.
 * When collapseSkeleton is true, imports/exports/comments/directives also become stubs.
 * Returns the actual source-line range that the output covers (for highlighting).
 */
function renderStructuredRange(
  structure: UnifiedFileResult,
  allLines: string[],
  requestedStart: number,
  requestedEnd: number,
  collapseSkeleton: boolean,
): {
  output: string;
  actualStart: number;
  actualEnd: number;
  collapsedRanges: Array<{startLine: number; endLine: number}>;
  sourceRanges: Array<{startLine: number; endLine: number}>;
} {
  const blocks = buildNonSymbolBlocks(structure);
  const { expandedStart, expandedEnd } = expandToBlockBoundaries(
    requestedStart,
    requestedEnd,
    blocks,
  );
  const owners = classifyLines(structure, blocks, expandedStart, expandedEnd);

  const result: string[] = [];
  const emittedSymbols = new Set<UnifiedFileSymbol>();
  const emittedBlocks = new Set<NonSymbolBlock>();

  // Track the actual source-line range that the output covers
  let actualStart = expandedEnd;
  let actualEnd = expandedStart;

  const collapsedRanges: Array<{startLine: number; endLine: number}> = [];
  const sourceRanges: Array<{startLine: number; endLine: number}> = [];
  let srcRangeStart: number | undefined;
  let srcRangeEnd: number | undefined;

  const flushSourceRange = () => {
    if (srcRangeStart !== undefined && srcRangeEnd !== undefined) {
      sourceRanges.push({startLine: srcRangeStart, endLine: srcRangeEnd});
      srcRangeStart = undefined;
      srcRangeEnd = undefined;
    }
  };

  const trackSourceLine = (l: number) => {
    if (srcRangeStart === undefined) {
      srcRangeStart = l;
      srcRangeEnd = l;
    } else {
      srcRangeEnd = l;
    }
  };

  let line = expandedStart;
  while (line <= expandedEnd) {
    const owner = owners.get(line);

    if (!owner) {
      // Unclassified line (shouldn't happen with complete coverage, but safe)
      result.push(`[${line}] ${allLines[line - 1] ?? ''}`);
      trackSourceLine(line);
      actualStart = Math.min(actualStart, line);
      actualEnd = Math.max(actualEnd, line);
      line++;
      continue;
    }

    if (owner.type === 'symbol') {
      const sym = owner.symbol;
      if (!emittedSymbols.has(sym)) {
        emittedSymbols.add(sym);
        const symRange = sym.range.startLine === sym.range.endLine
          ? `${sym.range.startLine}`
          : `${sym.range.startLine}-${sym.range.endLine}`;
        result.push(`[${symRange}] ${sym.kind} ${sym.name}`);
      }
      // Track all lines of this symbol within the range
      const symEndInRange = Math.min(sym.range.endLine, expandedEnd);
      const symStartInRange = Math.max(sym.range.startLine, expandedStart);
      actualStart = Math.min(actualStart, symStartInRange);
      actualEnd = Math.max(actualEnd, symEndInRange);
      flushSourceRange();
      collapsedRanges.push({startLine: sym.range.startLine, endLine: sym.range.endLine});
      line = symEndInRange + 1;
      continue;
    }

    // Non-symbol block
    const block = owner.block;
    if (!emittedBlocks.has(block)) {
      emittedBlocks.add(block);

      const blockStart = Math.max(block.startLine, expandedStart);
      const blockEnd = Math.min(block.endLine, expandedEnd);
      actualStart = Math.min(actualStart, blockStart);
      actualEnd = Math.max(actualEnd, blockEnd);

      if (collapseSkeleton && block.type !== 'gap') {
        // Collapse multi-line imports/exports/comments/directives to stubs
        // Single-line blocks show actual content
        if (block.startLine === block.endLine) {
          trackSourceLine(block.startLine);
          result.push(`[${block.startLine}] ${allLines[block.startLine - 1] ?? ''}`);
        } else {
          flushSourceRange();
          collapsedRanges.push({startLine: block.startLine, endLine: block.endLine});
          result.push(`[${block.startLine}-${block.endLine}] ${block.type}s`);
        }
      } else {
        // Emit raw source for the block
        for (let l = blockStart; l <= blockEnd; l++) {
          trackSourceLine(l);
          result.push(`[${l}] ${allLines[l - 1] ?? ''}`);
        }
      }
    }
    // Skip all lines of this block
    const skipTo = Math.min(block.endLine, expandedEnd);
    line = skipTo + 1;
  }

  flushSourceRange();

  return {
    output: result.join('\n'),
    actualStart,
    actualEnd,
    collapsedRanges,
    sourceRanges,
  };
}

export const read = defineTool({
  name: 'exp_file_read',
  description:
    'Read file content with flexible targeting and output modes.\n\n' +
    '**Two Simple Questions:**\n' +
    '1. Do I want code or just structure? → `skeleton`\n' +
    '2. Do I want to see children content? → `recursive`\n\n' +
    '**Parameters:**\n' +
    '- `file` (required) — Path to file (relative or absolute)\n' +
    '- `target` — What to read: symbol names, or special keywords:\n' +
    '  - `"#imports"` — All import declarations\n' +
    '  - `"#exports"` — All export declarations\n' +
    '  - `"#comments"` — Orphan comments (section headers, annotations)\n' +
    '  - `"UserService"` — Symbol by name\n' +
    '  - `"UserService.findById"` — Nested symbol\n' +
    '  - Can be array: `["#imports", "UserService"]`\n' +
    '- `skeleton` — true = structure only (names + ranges), false = content (default)\n' +
    '- `recursive` — true = expand children, false = placeholders (default)\n' +
    '- `startLine` / `endLine` — Read a structured range (1-indexed). ' +
    'Shows raw source for non-symbols, collapsed stubs for symbols. ' +
    'Cannot be used with `target`.\n\n' +
    '**Structured Range Mode (startLine/endLine):**\n' +
    'For TS/JS files, shows non-symbol content (imports, exports, comments, gaps) as raw source ' +
    'and collapses symbols into stubs. Use `target` to read a specific symbol. ' +
    'Non-symbol blocks are atomic: if the range touches any line of a block, the full block is included. ' +
    'Add `skeleton: true` to also collapse import/export/comment blocks into stubs.\n\n' +
    '**EXAMPLES:**\n' +
    '- File skeleton: `{ file: "src/service.ts", skeleton: true }`\n' +
    '- Read a function: `{ file: "src/utils.ts", target: "calculateTotal" }`\n' +
    '- Structured range: `{ file: "src/service.ts", startLine: 1, endLine: 50 }`\n' +
    '- Compact range: `{ file: "src/service.ts", startLine: 1, endLine: 50, skeleton: true }`\n' +
    '- Only imports: `{ file: "src/service.ts", target: "#imports" }`\n' +
    '- Import + symbol: `{ file: "src/service.ts", target: ["#imports", "UserService"] }`',
  annotations: {
    title: 'File Read',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    file: zod.string().describe('Path to file (relative to workspace root or absolute).'),
    target: zod.string().optional().describe(
      'What to read. Can be symbol names ("UserService.findById"), special keywords ' +
      '("#imports", "#exports", "#comments"), or a JSON array of multiple targets ' +
      '(e.g. \'["#imports", "UserService"]\').',
    ),
    skeleton: zod.boolean().optional().describe(
      'true = structure only (names + ranges), false = content (default).',
    ),
    recursive: zod.boolean().optional().describe(
      'true = expand children, false = show placeholders (default).',
    ),
    // Structured range parameters (mutually exclusive with target)
    startLine: zod.number().int().optional().describe(
      'Start line (1-indexed) for structured range reading. Shows raw source for non-symbols, ' +
      'collapsed stubs for symbols. Cannot be used with target.',
    ),
    endLine: zod.number().int().optional().describe(
      'End line (1-indexed) for structured range reading. If omitted with startLine, reads to end of file.',
    ),
  },
  handler: async (request, response) => {
    const {params} = request;
    const filePath = resolveFilePath(params.file);

    if (!fs.existsSync(filePath)) {
      response.appendResponseLine(
        `**Error:** File not found: \`${filePath}\``,
      );
      if (!path.isAbsolute(params.file)) {
        response.appendResponseLine(
          `The relative path \`${params.file}\` was resolved against the workspace root. ` +
          'Use an absolute path or a path relative to the workspace root.',
        );
      }
      return;
    }

    const skeleton = params.skeleton ?? false;
    const recursive = params.recursive ?? false;

    // Normalize target to array
    let targets: string[] = [];
    if (params.target) {
      if (Array.isArray(params.target)) {
        targets = params.target as string[];
      } else if (typeof params.target === 'string' && params.target.startsWith('[')) {
        try {
          const parsed: unknown = JSON.parse(params.target);
          if (Array.isArray(parsed)) {
            targets = parsed.filter((item): item is string => typeof item === 'string');
          }
        } catch {
          targets = [params.target];
        }
      } else {
        targets = [params.target];
      }
    }

    const relativePath = path.relative(getClientWorkspace(), filePath).replace(/\\/g, '/');

    // ── Mutual exclusivity: target + startLine/endLine ─────
    const hasLineRange = params.startLine !== undefined || params.endLine !== undefined;
    if (targets.length > 0 && hasLineRange) {
      response.appendResponseLine(
        '**Error:** `target` and `startLine`/`endLine` cannot be used together. ' +
        'Use `target` to read specific symbols, or `startLine`/`endLine` to read a structured range.',
      );
      return;
    }

    // Check if this is a TS/JS file that supports structured extraction
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const isStructuredFile = STRUCTURED_EXTS.has(ext);

    // Get unified structure for TS/JS files (one call replaces three)
    let structure: UnifiedFileResult | undefined;
    let allLines: string[] = [];
    if (isStructuredFile) {
      structure = await fileExtractStructure(filePath);
      allLines = structure.content.split('\n');
    }

    // ── Structured line-range mode ────────────────────────────
    if (hasLineRange && targets.length === 0) {
      const totalLines = structure ? structure.totalLines : allLines.length;

      // For non-structured files, fall back to raw content
      if (!structure) {
        const rawStart = params.startLine !== undefined ? params.startLine - 1 : undefined;
        const rawEnd = params.endLine !== undefined ? params.endLine - 1 : undefined;
        const content = await fileReadContent(filePath, rawStart, rawEnd);
        fileHighlightReadRange(filePath, content.startLine, content.endLine);
        const numbered = addLineNumbers(content.content, content.startLine + 1);
        response.appendResponseLine(
          numbered.length > CHARACTER_LIMIT
            ? numbered.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
            : numbered,
        );
        return;
      }

      // Structured file: symbols become stubs, non-symbols show raw content
      const reqStart = Math.max(1, params.startLine ?? 1);
      const reqEnd = Math.min(structure.totalLines, params.endLine ?? structure.totalLines);

      if (reqStart > reqEnd) {
        response.appendResponseLine(
          `**Error:** startLine (${reqStart}) is greater than endLine (${reqEnd}).`,
        );
        return;
      }
      if (reqStart > structure.totalLines) {
        response.appendResponseLine(
          `**Error:** startLine (${reqStart}) exceeds total lines (${structure.totalLines}).`,
        );
        return;
      }

      const { output, actualStart, actualEnd, collapsedRanges, sourceRanges } = renderStructuredRange(
        structure,
        allLines,
        reqStart,
        reqEnd,
        skeleton,
      );

      // Highlight source (yellow) and collapsed (grey + fold) ranges
      fileHighlightReadRange(filePath, actualStart - 1, actualEnd - 1, collapsedRanges, sourceRanges);

      response.appendResponseLine(
        output.length > CHARACTER_LIMIT
          ? output.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
          : output,
      );
      return;
    }

    // ── Skeleton mode (no targets, no line range) ─────────────
    if (targets.length === 0 && skeleton) {
      if (!structure) {
        response.appendResponseLine('Skeleton mode requires a TypeScript or JavaScript file.');
        return;
      }

      // Build source-ordered list of all items
      interface SkeletonPiece {
        startLine: number;
        endLine: number;
        category: 'imports' | 'exports' | 'comments' | 'directives' | 'symbol' | 'raw';
        symbol?: UnifiedFileSymbol;
      }

      const pieces: SkeletonPiece[] = [];

      for (const imp of structure.imports) {
        pieces.push({ startLine: imp.range.start, endLine: imp.range.end, category: 'imports' });
      }
      for (const exp of structure.exports) {
        pieces.push({ startLine: exp.range.start, endLine: exp.range.end, category: 'exports' });
      }
      for (const comment of structure.orphanComments) {
        pieces.push({ startLine: comment.range.start, endLine: comment.range.end, category: 'comments' });
      }
      for (const dir of structure.directives) {
        pieces.push({ startLine: dir.range.start, endLine: dir.range.end, category: 'directives' });
      }
      for (const sym of structure.symbols) {
        pieces.push({ startLine: sym.range.startLine, endLine: sym.range.endLine, category: 'symbol', symbol: sym });
      }
      for (const gap of structure.gaps) {
        if (gap.type === 'unknown') {
          pieces.push({ startLine: gap.start, endLine: gap.end, category: 'raw' });
        }
      }

      pieces.sort((a, b) => a.startLine - b.startLine);

      // Merge adjacent same-category block items
      const merged: SkeletonPiece[] = [];
      for (const piece of pieces) {
        const prev = merged[merged.length - 1];
        const canMerge = prev
          && piece.category !== 'symbol'
          && piece.category !== 'raw'
          && prev.category === piece.category
          && piece.startLine <= prev.endLine + 2;
        if (canMerge && prev) {
          prev.endLine = Math.max(prev.endLine, piece.endLine);
        } else {
          merged.push({ ...piece });
        }
      }

      for (const piece of merged) {
        if (piece.category === 'raw') {
          for (let l = piece.startLine; l <= piece.endLine; l++) {
            response.appendResponseLine(`[${l}] ${allLines[l - 1] ?? ''}`);
          }
        } else if (piece.symbol) {
          const entries = formatSkeletonEntry(piece.symbol, '', recursive);
          for (const entry of entries) response.appendResponseLine(entry);
        } else if (piece.startLine === piece.endLine) {
          // Single-line block: show actual content
          response.appendResponseLine(`[${piece.startLine}] ${allLines[piece.startLine - 1] ?? ''}`);
        } else {
          // Multi-line block: show collapsed stub
          response.appendResponseLine(`[${piece.startLine}-${piece.endLine}] ${piece.category}`);
        }
      }

      return;
    }

    // ── Full file mode (no targets, no skeleton, no line range) ──
    if (targets.length === 0) {
      const content = await fileReadContent(filePath);
      fileHighlightReadRange(filePath, content.startLine, content.endLine);

      const numbered = addLineNumbers(content.content, content.startLine + 1);
      response.appendResponseLine(
        numbered.length > CHARACTER_LIMIT
          ? numbered.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
          : numbered,
      );
      return;
    }

    // ── Targets mode ─────────────────────────────────────────

    // Targets require structured extraction (TS/JS only)
    if (!structure) {
      response.appendResponseLine(
        'Target-based reading requires a TypeScript or JavaScript file.',
      );
      return;
    }

    for (const target of targets) {
      if (isSpecialTarget(target)) {
        // Handle special keywords: #imports, #exports, #comments
        const items = target === '#imports'
          ? structure.imports
          : target === '#exports'
            ? structure.exports
            : structure.orphanComments;

        if (skeleton) {
          for (const item of items) {
            const entries = formatSkeletonEntry(item, '', false);
            for (const entry of entries) response.appendResponseLine(entry);
          }
        } else {
          for (const item of items) {
            const numbered = addLineNumbers(
              getContentSlice(allLines, item.range.start, item.range.end),
              item.range.start,
            );
            response.appendResponseLine(numbered);
          }
        }
      } else {
        // Symbol targeting (1-indexed ranges from ts-morph)
        const match = resolveSymbolTarget(structure.symbols, target);

        if (!match) {
          const available = structure.symbols.map(s => `${s.kind} ${s.name}`).join(', ');
          response.appendResponseLine(
            `"${target}": Not found. Available: ${available || 'none'}`,
          );
          continue;
        }

        const symbol = match.symbol;
        const startLine = symbol.range.startLine;
        const endLine = symbol.range.endLine;

        if (skeleton) {
          const entries = formatSkeletonEntry(symbol, '', recursive);
          for (const entry of entries) response.appendResponseLine(entry);
        } else {
          // Highlight in editor (convert 1-indexed to 0-indexed for VS Code)
          fileHighlightReadRange(filePath, startLine - 1, endLine - 1);

          const range = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
          response.appendResponseLine(`[${range}] ${symbol.kind} ${symbol.name}`);

          if (recursive || !symbol.children || symbol.children.length === 0) {
            const numbered = addLineNumbers(
              getContentSlice(allLines, startLine, endLine),
              startLine,
            );
            response.appendResponseLine(
              numbered.length > CHARACTER_LIMIT
                ? numbered.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
                : numbered,
            );
          } else {
            const formatted = formatContentWithPlaceholders(
              allLines,
              symbol,
              startLine,
              endLine,
            );
            response.appendResponseLine(
              formatted.length > CHARACTER_LIMIT
                ? formatted.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
                : formatted,
            );
          }
        }
      }
    }
  },
});
