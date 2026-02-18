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
import {defineTool} from '../ToolDefinition.js';
import {executeEditWithSafetyLayer} from './safety-layer.js';
import {resolveSymbolTarget} from './symbol-resolver.js';

function resolveFilePath(file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(getHostWorkspace(), file);
}

export const edit = defineTool({
  name: 'file_edit',
  description:
    'Direct model-to-code editing with an intelligent safety layer.\n\n' +
    'The model you selected writes the code, this tool applies it directly — ' +
    'no GPT-4.1 CodeMapper middleware reinterpreting your output.\n\n' +
    'The safety layer automatically:\n' +
    '- Detects renames, deletions, additions via DocumentSymbol diff\n' +
    '- Propagates renames across the workspace via VS Code rename provider\n' +
    '- Auto-fixes cascading errors via Code Actions\n' +
    '- Reports what it could not fix\n\n' +
    '**Targeting Priority:** `target` > `startLine/endLine` > full file\n\n' +
    '**Parameters:**\n' +
    '- `file` (required) — Path to file\n' +
    '- `code` (required) — Complete new content for the targeted region\n' +
    '- `target` — Symbol name to scope: `"UserService.findById"`\n' +
    '- `startLine` / `endLine` — Fallback line-based range (1-indexed)\n\n' +
    '**EXAMPLES:**\n' +
    '- Edit a method: `{ file: "src/service.ts", target: "UserService.findById", code: "..." }`\n' +
    '- Edit by lines: `{ file: "src/config.ts", startLine: 10, endLine: 25, code: "..." }`\n' +
    '- Replace full file: `{ file: "src/types.ts", code: "..." }`',
  timeoutMs: 30_000,
  annotations: {
    title: 'File Edit',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    file: zod.string().describe('Path to file (relative to workspace root or absolute).'),
    code: zod.string().describe(
      'The complete new content for the targeted region. ' +
      'When targeting a symbol, this replaces the entire symbol body.',
    ),
    target: zod.string().optional().describe(
      'Symbol name to scope the edit: "UserService.findById". ' +
      'Uses VS Code DocumentSymbols for precise targeting.',
    ),
    startLine: zod.number().int().optional().describe(
      'Fallback: start line (1-indexed). Used when target is not specified.',
    ),
    endLine: zod.number().int().optional().describe(
      'Fallback: end line (1-indexed). Used when target is not specified.',
    ),
  },
  handler: async (request, response) => {
    const {params} = request;
    const filePath = resolveFilePath(params.file);
    const code = params.code;
    const relativePath = path.relative(getHostWorkspace(), filePath).replace(/\\/g, '/');

    // ── Input validation ──────────────────────────────────────────

    // Bug #5: startLine > endLine
    if (params.startLine !== undefined && params.endLine !== undefined && params.startLine > params.endLine) {
      response.appendResponseLine(
        `❌ Invalid line range: startLine (${params.startLine}) is greater than endLine (${params.endLine}).`,
      );
      return;
    }

    // Bug #2: Empty code targeting a symbol = accidental deletion
    if (params.target && code.trim().length === 0) {
      response.appendResponseLine(
        `❌ Refusing to apply empty code to symbol "${params.target}" — this would delete it. ` +
        `If deletion is intended, remove the symbol explicitly or use startLine/endLine.`,
      );
      return;
    }

    // Bug #6: Validate line ranges are within file bounds
    if (params.startLine !== undefined || params.endLine !== undefined) {
      try {
        const contentResult = await fileReadContent(filePath);
        const totalLines = contentResult.totalLines;

        if (params.startLine !== undefined && (params.startLine < 1 || params.startLine > totalLines)) {
          response.appendResponseLine(
            `❌ startLine ${params.startLine} is out of bounds (file has ${totalLines} lines).`,
          );
          return;
        }
        if (params.endLine !== undefined && (params.endLine < 1 || params.endLine > totalLines)) {
          response.appendResponseLine(
            `❌ endLine ${params.endLine} is out of bounds (file has ${totalLines} lines).`,
          );
          return;
        }
      } catch {
        // File might not exist yet; proceed and let the edit fail naturally
      }
    }
    let editStartLine: number;
    let editEndLine: number;
    let targetLabel: string | undefined;

    if (params.target) {
      // Symbol targeting: resolve via DocumentSymbols
      const symbolsResult = await fileGetSymbols(filePath);
      const match = resolveSymbolTarget(symbolsResult.symbols, params.target);

      if (!match) {
        const available = symbolsResult.symbols.map(s => `${s.kind} ${s.name}`).join(', ');
        response.appendResponseLine(
          `❌ Symbol "${params.target}" not found in ${relativePath}.\n\n` +
          `Available symbols: ${available || 'none'}`,
        );
        return;
      }

      editStartLine = match.symbol.range.startLine;
      editEndLine = match.symbol.range.endLine;
      targetLabel = params.target;
    } else if (params.startLine !== undefined && params.endLine !== undefined) {
      // Line-based targeting (convert 1-indexed to 0-indexed)
      editStartLine = params.startLine - 1;
      editEndLine = params.endLine - 1;
    } else {
      // Full file replacement
      const contentResult = await fileReadContent(filePath);
      editStartLine = 0;
      editEndLine = contentResult.totalLines - 1;
    }

    // Execute with safety layer
    const result = await executeEditWithSafetyLayer(
      filePath,
      editStartLine,
      editEndLine,
      code,
    );

    // Format output
    if (result.success) {
      const title = targetLabel
        ? `## file_edit: Applied edit to ${targetLabel}`
        : `## file_edit: Applied edit to ${relativePath}`;

      response.appendResponseLine(title);
      response.appendResponseLine('');

      if (result.detectedIntents.length > 0) {
        response.appendResponseLine('**Detected Intent:**');
        for (const intent of result.detectedIntents) {
          const label = intent.type === 'rename'
            ? `Rename \`${intent.symbol}\` ${intent.details ?? ''}`
            : intent.type === 'delete'
              ? `Delete \`${intent.symbol}\``
              : intent.type === 'add'
                ? `Add \`${intent.symbol}\``
                : `Body change in \`${intent.symbol}\``;
          response.appendResponseLine(`- ${label}`);
        }
        response.appendResponseLine('');
      }

      if (result.propagated.length > 0) {
        response.appendResponseLine('**Auto-Propagated:**');
        for (const p of result.propagated) {
          response.appendResponseLine(
            `- ${p.type}: ${p.totalEdits} edits across ${p.filesAffected.length} files`,
          );
          for (const f of p.filesAffected.slice(0, 10)) {
            response.appendResponseLine(`  - ${f}`);
          }
          if (p.filesAffected.length > 10) {
            response.appendResponseLine(`  - ... and ${p.filesAffected.length - 10} more`);
          }
        }
        response.appendResponseLine('');
      }

      if (result.autoFixed.length > 0) {
        response.appendResponseLine('**Auto-Fixed:**');
        for (const fix of result.autoFixed) {
          response.appendResponseLine(`- ${fix.file}: ${fix.fix}`);
        }
        response.appendResponseLine('');
      }

      const errors = result.remainingErrors.filter(r => r.severity === 'error');
      const warnings = result.remainingErrors.filter(r => r.severity === 'warning');

      if (errors.length > 0) {
        response.appendResponseLine(`**Remaining Errors (${errors.length}):**`);
        for (const err of errors.slice(0, 10)) {
          response.appendResponseLine(`- ${err.file}:${err.line} — ${err.message}`);
        }
        if (errors.length > 10) {
          response.appendResponseLine(`- ... and ${errors.length - 10} more`);
        }
        response.appendResponseLine('');
      }

      if (warnings.length > 0) {
        response.appendResponseLine(`**Warnings (${warnings.length}):**`);
        for (const w of warnings.slice(0, 5)) {
          response.appendResponseLine(`- ${w.file}:${w.line} — ${w.message}`);
        }
        if (warnings.length > 5) {
          response.appendResponseLine(`- ... and ${warnings.length - 5} more`);
        }
        response.appendResponseLine('');
      }

      const errorCount = errors.length;
      if (errorCount === 0) {
        response.appendResponseLine('✅ **Safety Check:** 0 new errors detected');
      } else {
        response.appendResponseLine(`⚠️ **Safety Check:** ${errorCount} error(s) remain`);
      }
    } else {
      response.appendResponseLine(`## file_edit: Failed`);
      response.appendResponseLine('');
      response.appendResponseLine(`❌ ${result.summary}`);
    }
  },
});
