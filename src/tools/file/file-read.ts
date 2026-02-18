/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import {
  fileExtractStructure,
  fileReadContent,
  fileHighlightReadRange,
  OrphanedSymbolNode,
  UnifiedFileSymbol,
  UnifiedFileResult,
} from '../../client-pipe.js';
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {CHARACTER_LIMIT, defineTool} from '../ToolDefinition.js';
import {resolveSymbolTarget, getSiblingNames, getChildNames, formatRange} from './symbol-resolver.js';
import type {SymbolLike} from './symbol-resolver.js';

function resolveFilePath(file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(getHostWorkspace(), file);
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

// Format skeleton entry for a symbol (all ranges are 1-indexed)
function formatSkeletonEntry(
  symbol: SymbolLike | OrphanedSymbolNode,
  indent = '',
  recursive = false,
): string[] {
  const lines: string[] = [];
  // Both UnifiedFileSymbol and OrphanedSymbolNode are 1-indexed
  const range = 'startLine' in symbol.range
    ? `${symbol.range.startLine}-${symbol.range.endLine}`
    : `${symbol.range.start}-${symbol.range.end}`;
  const kind = symbol.kind;
  const name = symbol.name;
  const detail = 'detail' in symbol && symbol.detail ? ` (${symbol.detail})` : '';

  lines.push(`${indent}[${range}] ${kind}: ${name}${detail}`);

  if (recursive && symbol.children && symbol.children.length > 0) {
    for (const child of symbol.children) {
      lines.push(...formatSkeletonEntry(child, indent + '  ', recursive));
    }
  }

  return lines;
}

/**
 * Format content with child placeholders.
 * contentStartLine and symbol ranges are all 1-indexed.
 */
function formatContentWithPlaceholders(
  content: string,
  symbol: SymbolLike,
  contentStartLine: number,
): string {
  if (!symbol.children || symbol.children.length === 0) {
    return content;
  }

  const lines = content.split('\n');
  const result: string[] = [];

  // Sort children by start line
  const sortedChildren = [...symbol.children].sort(
    (a, b) => a.range.startLine - b.range.startLine
  );

  let currentLine = contentStartLine;
  for (const child of sortedChildren) {
    const childStart = child.range.startLine;
    const childEnd = child.range.endLine;

    // Add lines before this child
    while (currentLine < childStart && currentLine - contentStartLine < lines.length) {
      result.push(lines[currentLine - contentStartLine]);
      currentLine++;
    }

    // Add placeholder for child (ranges already 1-indexed, no +1 needed)
    const lineCount = childEnd - childStart + 1;
    result.push(`  [${child.name}] (${child.kind}, lines ${childStart}-${childEnd}, ${lineCount} lines)`);

    // Skip child lines
    currentLine = childEnd + 1;
  }

  // Add remaining lines after last child
  while (currentLine - contentStartLine < lines.length) {
    result.push(lines[currentLine - contentStartLine]);
    currentLine++;
  }

  return result.join('\n');
}

export const read = defineTool({
  name: 'file_read',
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
    '- `recursive` — true = expand children, false = placeholders (default)\n\n' +
    '**Behavior Matrix:**\n' +
    '| skeleton | recursive | Result |\n' +
    '|----------|-----------|--------|\n' +
    '| false | false | Code with children as placeholders (DEFAULT) |\n' +
    '| false | true | Full code including all nested content |\n' +
    '| true | false | Structure: names + line ranges (1 level) |\n' +
    '| true | true | Deep structure: full symbol tree |\n\n' +
    '**EXAMPLES:**\n' +
    '- File skeleton: `{ file: "src/service.ts", skeleton: true }`\n' +
    '- Read a function: `{ file: "src/utils.ts", target: "calculateTotal" }`\n' +
    '- Class structure: `{ file: "src/service.ts", target: "UserService", skeleton: true }`\n' +
    '- Full class: `{ file: "src/service.ts", target: "UserService", recursive: true }`\n' +
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
    // Legacy parameters for backwards compatibility
    startLine: zod.number().int().optional().describe(
      'Legacy: start line (1-indexed). Prefer using target.',
    ),
    endLine: zod.number().int().optional().describe(
      'Legacy: end line (1-indexed). Prefer using target.',
    ),
  },
  handler: async (request, response) => {
    const {params} = request;
    const filePath = resolveFilePath(params.file);
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

    const relativePath = path.relative(getHostWorkspace(), filePath).replace(/\\/g, '/');
    response.appendResponseLine(`## file_read: ${relativePath}`);
    response.appendResponseLine('');

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

    // ── Skeleton mode (no targets) ────────────────────────────
    if (targets.length === 0 && skeleton) {
      if (!structure) {
        // Non-TS/JS: fall back to fileReadContent for basic content
        response.appendResponseLine('**Skeleton Mode** (0 symbols)');
        response.appendResponseLine('');
        response.appendResponseLine('Skeleton mode requires a TypeScript or JavaScript file.');
        return;
      }

      response.appendResponseLine(
        `**Skeleton Mode** (${structure.symbols.length} symbols)`,
      );
      response.appendResponseLine('');

      // Imports
      if (structure.imports.length > 0) {
        response.appendResponseLine(`**Imports (${structure.imports.length}):**`);
        for (const imp of structure.imports) {
          response.appendResponseLine(
            `  [${imp.range.start}] ${imp.kind}: ${imp.name}`,
          );
        }
        response.appendResponseLine('');
      }

      // Exports
      if (structure.exports.length > 0) {
        response.appendResponseLine(`**Exports (${structure.exports.length}):**`);
        for (const exp of structure.exports) {
          response.appendResponseLine(
            `  [${exp.range.start}] ${exp.kind}: ${exp.name}`,
          );
        }
        response.appendResponseLine('');
      }

      // Comments
      if (structure.orphanComments.length > 0) {
        response.appendResponseLine(`**Comments (${structure.orphanComments.length}):**`);
        for (const comment of structure.orphanComments) {
          response.appendResponseLine(
            `  [${comment.range.start}] ${comment.kind}: ${comment.name}`,
          );
        }
        response.appendResponseLine('');
      }

      // Directives
      if (structure.directives.length > 0) {
        response.appendResponseLine(`**Directives (${structure.directives.length}):**`);
        for (const dir of structure.directives) {
          response.appendResponseLine(
            `  [${dir.range.start}] ${dir.kind}: ${dir.name}`,
          );
        }
        response.appendResponseLine('');
      }

      // Symbols
      response.appendResponseLine(`**Symbols (${structure.symbols.length}):**`);
      for (const sym of structure.symbols) {
        const entries = formatSkeletonEntry(sym, '  ', recursive);
        for (const entry of entries) response.appendResponseLine(entry);
      }

      return;
    }

    // ── Legacy mode (no targets, no skeleton): full file or line range ──
    if (targets.length === 0) {
      // Use fileReadContent for ALL file types (basic I/O, works everywhere)
      let startLine = params.startLine !== undefined ? params.startLine - 1 : undefined;
      let endLine = params.endLine !== undefined ? params.endLine - 1 : undefined;

      const content = await fileReadContent(filePath, startLine, endLine);
      fileHighlightReadRange(filePath, content.startLine, content.endLine);

      response.appendResponseLine(
        `**Range:** ${formatRange(content.startLine, content.endLine, content.totalLines)}`,
      );
      response.appendResponseLine('');
      response.appendResponseLine('```');
      response.appendResponseLine(
        content.content.length > CHARACTER_LIMIT
          ? content.content.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
          : content.content,
      );
      response.appendResponseLine('```');
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
        if (target === '#imports') {
          response.appendResponseLine(`**Imports (${structure.imports.length}):**`);
          if (skeleton) {
            for (const imp of structure.imports) {
              response.appendResponseLine(
                `  [${imp.range.start}-${imp.range.end}] ${imp.kind}: ${imp.name}`,
              );
            }
          } else {
            for (const imp of structure.imports) {
              const content = getContentSlice(allLines, imp.range.start, imp.range.end);
              response.appendResponseLine(`\`\`\``);
              response.appendResponseLine(content);
              response.appendResponseLine(`\`\`\``);
            }
          }
          response.appendResponseLine('');
        } else if (target === '#exports') {
          response.appendResponseLine(`**Exports (${structure.exports.length}):**`);
          if (skeleton) {
            for (const exp of structure.exports) {
              response.appendResponseLine(
                `  [${exp.range.start}-${exp.range.end}] ${exp.kind}: ${exp.name}`,
              );
            }
          } else {
            for (const exp of structure.exports) {
              const content = getContentSlice(allLines, exp.range.start, exp.range.end);
              response.appendResponseLine(`\`\`\``);
              response.appendResponseLine(content);
              response.appendResponseLine(`\`\`\``);
            }
          }
          response.appendResponseLine('');
        } else if (target === '#comments') {
          response.appendResponseLine(`**Comments (${structure.orphanComments.length}):**`);
          if (skeleton) {
            for (const comment of structure.orphanComments) {
              response.appendResponseLine(
                `  [${comment.range.start}-${comment.range.end}] ${comment.kind}: ${comment.name}`,
              );
            }
          } else {
            for (const comment of structure.orphanComments) {
              const content = getContentSlice(allLines, comment.range.start, comment.range.end);
              response.appendResponseLine(`\`\`\``);
              response.appendResponseLine(content);
              response.appendResponseLine(`\`\`\``);
            }
          }
          response.appendResponseLine('');
        }
      } else {
        // Symbol targeting (1-indexed ranges from ts-morph)
        const match = resolveSymbolTarget(structure.symbols, target);

        if (!match) {
          const available = structure.symbols.map(s => `${s.kind} ${s.name}`).join(', ');
          response.appendResponseLine(
            `**"${target}":** Not found. Available: ${available || 'none'}`,
          );
          response.appendResponseLine('');
          continue;
        }

        const symbol = match.symbol;
        const startLine = symbol.range.startLine;
        const endLine = symbol.range.endLine;

        if (skeleton) {
          // Skeleton mode: show structure
          response.appendResponseLine(`**${target}** (${symbol.kind}):`);
          const entries = formatSkeletonEntry(symbol, '  ', recursive);
          for (const entry of entries) response.appendResponseLine(entry);
          response.appendResponseLine('');
        } else {
          // Content mode: read from structure.content
          const content = getContentSlice(allLines, startLine, endLine);
          // Highlight in editor (convert 1-indexed to 0-indexed for VS Code)
          fileHighlightReadRange(filePath, startLine - 1, endLine - 1);

          response.appendResponseLine(
            `**${target}** (${symbol.kind}, lines ${startLine}-${endLine}):`,
          );
          response.appendResponseLine('```');

          if (recursive || !symbol.children || symbol.children.length === 0) {
            // Full content
            response.appendResponseLine(
              content.length > CHARACTER_LIMIT
                ? content.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
                : content,
            );
          } else {
            // Content with placeholders for children
            const formatted = formatContentWithPlaceholders(
              content,
              symbol,
              startLine,
            );
            response.appendResponseLine(
              formatted.length > CHARACTER_LIMIT
                ? formatted.substring(0, CHARACTER_LIMIT) + '\n\n⚠️ Truncated'
                : formatted,
            );
          }

          response.appendResponseLine('```');
          response.appendResponseLine('');
        }
      }
    }
  },
});
