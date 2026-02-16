/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseFindUnusedSymbols,
  type FindUnusedSymbolsResult,
} from '../../client-pipe.js';
import {pingClient} from '../../client-pipe.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
} from '../ToolDefinition.js';

async function ensureClientConnection(): Promise<void> {
  const alive = await pingClient();
  if (!alive) {
    throw new Error(
      'Client pipe not available. ' +
        'Make sure the VS Code Extension Development Host window is running.',
    );
  }
}

/**
 * Find symbols with zero references (potential dead code).
 */
export const findUnusedSymbols = defineTool({
  name: 'codebase_find_unused_symbols',
  description: `Find symbols with zero references (potential dead code).

Scans exported symbols in TypeScript/JavaScript files and identifies those
with no external references. Useful for:
- Identifying dead code for cleanup
- Finding unused exports
- Code health auditing

**PARAMETERS:**
- \`rootDir\` (string): Project root path. Defaults to workspace root
- \`exportedOnly\` (boolean): Only check exported symbols. Default: true
- \`kinds\` (string[]): Symbol kinds: function, class, interface, type, variable, constant, enum
- \`limit\` (number): Max results to return. Default: 100

**EXAMPLES:**
- Find all unused exports: {}
- Only functions: { kinds: ['function'] }`,
  timeoutMs: 60_000,
  annotations: {
    title: 'Find Unused Symbols',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    rootDir: zod
      .string()
      .optional()
      .describe('Project root path. Defaults to workspace root.'),
    exportedOnly: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Only check exported symbols. Default: true.'),
    kinds: zod
      .array(zod.enum(['function', 'class', 'interface', 'type', 'variable', 'constant', 'enum']))
      .optional()
      .describe('Symbol kinds to check.'),
    limit: zod
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .default(100)
      .describe('Max results to return. Default: 100.'),
    includePatterns: zod
      .array(zod.string())
      .optional()
      .describe(
        'Glob patterns to restrict analysis to matching files only. ' +
          'excludePatterns further narrow within the included set.',
      ),
    excludePatterns: zod
      .array(zod.string())
      .optional()
      .describe(
        'Glob patterns to exclude files from analysis. ' +
          'Applied in addition to .devtoolsignore rules.',
      ),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await codebaseFindUnusedSymbols(
      request.params.rootDir,
      undefined,
      request.params.exportedOnly,
      request.params.kinds,
      request.params.limit,
      request.params.includePatterns,
      request.params.excludePatterns,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify(result, null, 2));
      return;
    }

    const markdown = formatUnusedSymbolsResult(result);
    response.appendResponseLine(markdown);
  },
});

function formatUnusedSymbolsResult(result: FindUnusedSymbolsResult): string {
  const lines: string[] = [];

  lines.push('## 🔍 Unused Symbols\n');

  if (result.errorMessage) {
    lines.push(`❌ **Error:** ${result.errorMessage}\n`);
    return lines.join('');
  }

  const {totalScanned, totalUnused, scanDurationMs} = result.summary;
  lines.push(
    `**${totalUnused}** unused symbols found (${totalScanned} scanned) · ${scanDurationMs}ms\n`,
  );

  if (result.resolvedRootDir) {
    lines.push(`*Project root: \`${result.resolvedRootDir}\`*\n`);
  }

  if (result.diagnostics && result.diagnostics.length > 0) {
    for (const diag of result.diagnostics) {
      lines.push(`💡 ${diag}\n`);
    }
  }

  if (result.unusedSymbols.length === 0) {
    lines.push('✅ No unused symbols found. All exports are referenced.\n');
    return lines.join('');
  }

  // Group by file
  const byFile = new Map<string, typeof result.unusedSymbols>();
  for (const sym of result.unusedSymbols) {
    const existing = byFile.get(sym.file) ?? [];
    existing.push(sym);
    byFile.set(sym.file, existing);
  }

  for (const [file, symbols] of byFile) {
    lines.push(`### ${file}\n`);
    for (const sym of symbols) {
      const badge = sym.exported ? '📤' : '🔒';
      lines.push(`- ${badge} \`${sym.name}\` (${sym.kind}) at line ${sym.line}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
