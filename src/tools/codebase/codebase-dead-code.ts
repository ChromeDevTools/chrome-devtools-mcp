/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseFindDeadCode,
  type DeadCodeResult,
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
 * Find dead code: unused exports, unreachable functions, and dead variables.
 */
export const deadCode = defineTool({
  name: 'codebase_dead_code',
  description: `Find dead code: unused exports, unreachable functions, and dead variables.

Scans TypeScript/JavaScript files and identifies:
- **Unused exports:** Exported symbols with zero external references
- **Unreachable functions:** Non-exported functions with no internal callers
- **Dead variables:** Variables assigned but never read
- **Unused types/interfaces/enums:** Non-exported declarations with no usage

Each result includes a \`reason\` explaining why the symbol is dead and a
\`confidence\` level (high, medium, low).

**PARAMETERS:**
- \`rootDir\` (string): Project root path. Defaults to workspace root
- \`exportedOnly\` (boolean): Only check exported symbols. Default: true
  Set to false to also find unreachable functions, dead variables, etc.
- \`excludeTests\` (boolean): Skip test files (*.test.*, *.spec.*, __tests__/*). Default: true
- \`kinds\` (string[]): Symbol kinds: function, class, interface, type, variable, constant, enum
- \`limit\` (number): Max results to return. Default: 100

**EXAMPLES:**
- Find unused exports: {}
- Full dead code scan: { exportedOnly: false }
- Only functions: { kinds: ['function'], exportedOnly: false }
- Include test files: { excludeTests: false }`,
  timeoutMs: 60_000,
  annotations: {
    title: 'Dead Code Detection',
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
      .describe(
        'Only check exported symbols. Default: true. ' +
          'Set to false to also find unreachable functions, dead variables, unused types, etc.',
      ),
    excludeTests: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Skip test files (*.test.*, *.spec.*, __tests__/*). Default: true.',
      ),
    kinds: zod
      .array(
        zod.enum([
          'function',
          'class',
          'interface',
          'type',
          'variable',
          'constant',
          'enum',
        ]),
      )
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

    const result = await codebaseFindDeadCode(
      request.params.rootDir,
      undefined,
      request.params.exportedOnly,
      request.params.excludeTests,
      request.params.kinds,
      request.params.limit,
      request.params.includePatterns,
      request.params.excludePatterns,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify(result, null, 2));
      return;
    }

    const markdown = formatDeadCodeResult(result);
    response.appendResponseLine(markdown);
  },
});

function formatDeadCodeResult(result: DeadCodeResult): string {
  const lines: string[] = [];

  lines.push('## 💀 Dead Code Report\n');

  if (result.errorMessage) {
    lines.push(`❌ **Error:** ${result.errorMessage}\n`);
    return lines.join('');
  }

  const {totalScanned, totalDead, scanDurationMs, byKind} = result.summary;
  lines.push(
    `**${totalDead}** dead code items found (${totalScanned} scanned) · ${scanDurationMs}ms\n`,
  );

  if (result.resolvedRootDir) {
    lines.push(`*Project root: \`${result.resolvedRootDir}\`*\n`);
  }

  if (result.diagnostics && result.diagnostics.length > 0) {
    for (const diag of result.diagnostics) {
      lines.push(`💡 ${diag}\n`);
    }
  }

  if (byKind && Object.keys(byKind).length > 0) {
    const parts = Object.entries(byKind)
      .sort(([, a], [, b]) => b - a)
      .map(([kind, count]) => `${count} ${kind}${count > 1 ? 's' : ''}`);
    lines.push(`*Breakdown: ${parts.join(', ')}*\n`);
  }

  if (result.deadCode.length === 0) {
    lines.push('✅ No dead code found. All symbols are referenced.\n');
    return lines.join('');
  }

  // Group by file
  const byFile = new Map<string, typeof result.deadCode>();
  for (const item of result.deadCode) {
    const existing = byFile.get(item.file) ?? [];
    existing.push(item);
    byFile.set(item.file, existing);
  }

  for (const [file, items] of byFile) {
    lines.push(`### ${file}\n`);
    for (const item of items) {
      const badge = item.exported ? '📤' : '🔒';
      const conf = item.confidence === 'high' ? '🔴' : item.confidence === 'medium' ? '🟡' : '🟢';
      lines.push(
        `- ${badge} ${conf} \`${item.name}\` (${item.kind}) at line ${item.line}`,
      );
      lines.push(`  *${item.reason}*`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
