/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import {fileGetSymbols, fileReadContent} from '../../client-pipe.js';
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {CHARACTER_LIMIT, defineTool} from '../ToolDefinition.js';
import {resolveSymbolTarget, getSiblingNames, getChildNames, formatRange} from './symbol-resolver.js';

function resolveFilePath(file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(getHostWorkspace(), file);
}

export const read = defineTool({
  name: 'file_read',
  description:
    'Read file content with optional semantic symbol targeting powered by VS Code DocumentSymbols.\n\n' +
    'Read any symbol by name instead of by line number. Supports dot-path navigation.\n\n' +
    '**Targeting Priority:** `target` > `startLine/endLine` > full file\n\n' +
    '**Parameters:**\n' +
    '- `file` (required) — Path to file (relative or absolute)\n' +
    '- `target` — Symbol name: `"UserService"`, `"UserService.findById"`\n' +
    '- `startLine` / `endLine` — Fallback line-based range (1-indexed)\n' +
    '- `includeMetadata` — Include symbol kind, range, children list. Default: true\n' +
    '- `maxDepth` — Max nesting depth for children list\n\n' +
    '**EXAMPLES:**\n' +
    '- Read a function: `{ file: "src/utils.ts", target: "calculateTotal" }`\n' +
    '- Read a method: `{ file: "src/service.ts", target: "UserService.findById" }`\n' +
    '- Read by lines: `{ file: "src/config.ts", startLine: 10, endLine: 25 }`\n' +
    '- Read full file: `{ file: "src/types.ts" }`',
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
      'Symbol name to read. Supports dot-path: "Class.method". ' +
      'Uses VS Code DocumentSymbols for precise targeting.',
    ),
    startLine: zod.number().int().optional().describe(
      'Fallback: start line (1-indexed). Used when target is not specified.',
    ),
    endLine: zod.number().int().optional().describe(
      'Fallback: end line (1-indexed). Used when target is not specified.',
    ),
    includeMetadata: zod.boolean().optional().describe(
      'Include symbol kind, range, and children list. Default: true.',
    ),
    maxDepth: zod.number().int().optional().describe(
      'Max nesting depth for children list.',
    ),
  },
  handler: async (request, response) => {
    const {params} = request;
    const filePath = resolveFilePath(params.file);
    const includeMetadata = params.includeMetadata ?? true;

    // Determine read range based on targeting priority
    let readStartLine: number | undefined;
    let readEndLine: number | undefined;
    let symbolName: string | undefined;
    let symbolKind: string | undefined;
    let symbolChildren: string[] | undefined;
    let siblingNames: string[] | undefined;
    let parentName: string | undefined;

    if (params.target) {
      // Symbol targeting: resolve via DocumentSymbols
      const symbolsResult = await fileGetSymbols(filePath);
      const match = resolveSymbolTarget(symbolsResult.symbols, params.target);

      if (!match) {
        // Symbol not found — list available top-level symbols
        const available = symbolsResult.symbols.map(s => `${s.kind} ${s.name}`).join(', ');
        response.appendResponseLine(
          `Symbol "${params.target}" not found in ${params.file}.\n\n` +
          `Available symbols: ${available || 'none (no DocumentSymbol provider for this file type)'}`,
        );
        return;
      }

      readStartLine = match.symbol.range.startLine;
      readEndLine = match.symbol.range.endLine;
      symbolName = match.symbol.name;
      symbolKind = match.symbol.kind;
      symbolChildren = getChildNames(match.symbol, params.maxDepth);
      siblingNames = getSiblingNames(symbolsResult.symbols, match);
      parentName = match.parent?.name;
    } else if (params.startLine !== undefined && params.endLine !== undefined) {
      // Line-based targeting (convert 1-indexed to 0-indexed)
      readStartLine = params.startLine - 1;
      readEndLine = params.endLine - 1;
    }
    // else: full file (leave start/end undefined)

    const contentResult = await fileReadContent(filePath, readStartLine, readEndLine);

    // Truncate if necessary
    let content = contentResult.content;
    let truncated = false;
    if (content.length > CHARACTER_LIMIT) {
      content = content.substring(0, CHARACTER_LIMIT);
      truncated = true;
    }

    // Format output
    const relativePath = path.relative(getHostWorkspace(), filePath).replace(/\\/g, '/');

    if (symbolName && includeMetadata) {
      const header = params.target
        ? `## file_read: ${relativePath} → ${params.target}`
        : `## file_read: ${relativePath}`;
      response.appendResponseLine(header);
      response.appendResponseLine('');

      response.appendResponseLine(`**Symbol:** \`${symbolName}\` (${symbolKind})`);
      response.appendResponseLine(
        `**Range:** ${formatRange(contentResult.startLine, contentResult.endLine, contentResult.totalLines)}`,
      );

      if (parentName) {
        response.appendResponseLine(`**Parent:** ${parentName}`);
      }

      response.appendResponseLine('');
      response.appendResponseLine('```');
      response.appendResponseLine(content);
      response.appendResponseLine('```');

      if (symbolChildren && symbolChildren.length > 0) {
        response.appendResponseLine('');
        response.appendResponseLine(`**Children:** ${symbolChildren.join(', ')}`);
      }
      if (siblingNames && siblingNames.length > 0) {
        response.appendResponseLine(`**Siblings:** ${siblingNames.join(', ')}`);
      }
    } else {
      // Simple content output
      const header = `## file_read: ${relativePath}`;
      response.appendResponseLine(header);
      response.appendResponseLine(
        `**Range:** ${formatRange(contentResult.startLine, contentResult.endLine, contentResult.totalLines)}`,
      );
      response.appendResponseLine('');
      response.appendResponseLine('```');
      response.appendResponseLine(content);
      response.appendResponseLine('```');
    }

    if (truncated) {
      response.appendResponseLine('');
      response.appendResponseLine(
        `⚠️ Content truncated at ${CHARACTER_LIMIT} characters. ` +
        'Use `target` or `startLine`/`endLine` to read a smaller section.',
      );
    }
  },
});
