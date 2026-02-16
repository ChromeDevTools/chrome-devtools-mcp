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

// ── Connection Check ─────────────────────────────────────

async function ensureClientConnection(): Promise<void> {
  const alive = await pingClient();
  if (!alive) {
    throw new Error(
      'Client pipe not available. ' +
        'Make sure the VS Code Extension Development Host window is running.',
    );
  }
}

// ── Tool Definition ──────────────────────────────────────

export const lint = defineTool({
  name: 'codebase_lint',
  description: 'Find dead code, unused exports, and code quality issues.\n\n' +
    'Runs automated checks on TypeScript/JavaScript files. Use the `checks` parameter\n' +
    'to control which analyses to run.\n\n' +
    '**Available checks:**\n' +
    '- `dead-code` — Find unused exports, unreachable functions, dead variables\n' +
    '- `all` — Run all available checks\n\n' +
    'Each result includes a `reason` explaining why the symbol is flagged and a\n' +
    '`confidence` level (high, medium, low).\n\n' +
    '**PARAMETERS:**\n' +
    '- `rootDir` (string): Project root path. Defaults to workspace root\n' +
    '- `checks` (string[]): Which checks to run. Default: [\'all\']\n' +
    '- `exportedOnly` (boolean): Only check exported symbols. Default: true\n' +
    '- `excludeTests` (boolean): Skip test files. Default: true\n' +
    '- `kinds` (string[]): Filter by symbol kind\n' +
    '- `limit` (number): Max results per check. Default: 100\n\n' +
    '**EXAMPLES:**\n' +
    '- Find unused exports: `{}`\n' +
    '- Full dead code scan: `{ exportedOnly: false }`\n' +
    '- Only functions: `{ kinds: [\'function\'], exportedOnly: false }`\n' +
    '- Include test files: `{ excludeTests: false }`',
  timeoutMs: 60_000,
  annotations: {
    title: 'Codebase Lint',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    checks: zod
      .array(
        zod.enum(['all', 'dead-code']),
      )
      .optional()
      .default(['all'])
      .describe(
        "Which lint checks to run. Default: ['all']. " +
          "Currently available: 'dead-code'.",
      ),
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

    const {params} = request;
    const checks = params.checks;
    const runAll = checks.includes('all');
    const runDeadCode = runAll || checks.includes('dead-code');

    const sections: LintSection[] = [];

    if (runDeadCode) {
      const result = await codebaseFindDeadCode(
        params.rootDir,
        undefined,
        params.exportedOnly,
        params.excludeTests,
        params.kinds,
        params.limit,
        params.includePatterns,
        params.excludePatterns,
      );
      sections.push({check: 'dead-code', deadCodeResult: result});
    }

    if (params.response_format === ResponseFormat.JSON) {
      const jsonResult = buildJsonResult(sections);
      response.appendResponseLine(JSON.stringify(jsonResult, null, 2));
      return;
    }

    const markdown = formatLintReport(sections);
    response.appendResponseLine(markdown);
  },
});

// ── Types ────────────────────────────────────────────────

interface LintSection {
  check: string;
  deadCodeResult?: DeadCodeResult;
}

interface LintJsonResult {
  checks: string[];
  deadCode?: DeadCodeResult;
  summary: {
    totalIssues: number;
    checksRun: string[];
  };
}

// ── JSON Builder ─────────────────────────────────────────

function buildJsonResult(sections: LintSection[]): LintJsonResult {
  let totalIssues = 0;
  const checksRun: string[] = [];
  let deadCode: DeadCodeResult | undefined;

  for (const section of sections) {
    checksRun.push(section.check);
    if (section.deadCodeResult) {
      deadCode = section.deadCodeResult;
      totalIssues += section.deadCodeResult.summary.totalDead;
    }
  }

  return {
    checks: checksRun,
    deadCode,
    summary: {totalIssues, checksRun},
  };
}

// ── Markdown Formatting ──────────────────────────────────

function formatLintReport(sections: LintSection[]): string {
  const lines: string[] = [];
  lines.push('## 🔍 Codebase Lint Report\n');

  let totalIssues = 0;

  for (const section of sections) {
    if (section.check === 'dead-code' && section.deadCodeResult) {
      totalIssues += section.deadCodeResult.summary.totalDead;
      formatDeadCodeSection(section.deadCodeResult, lines);
    }
  }

  lines.push('---');
  if (totalIssues === 0) {
    lines.push('✅ **No issues found across all checks.**');
  } else {
    lines.push(`**Total issues: ${totalIssues}**`);
  }

  return lines.join('\n');
}

function formatDeadCodeSection(result: DeadCodeResult, lines: string[]): void {
  lines.push('### 💀 Dead Code\n');

  if (result.errorMessage) {
    lines.push(`❌ **Error:** ${result.errorMessage}\n`);
    return;
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
    return;
  }

  const byFile = new Map<string, typeof result.deadCode>();
  for (const item of result.deadCode) {
    const existing = byFile.get(item.file) ?? [];
    existing.push(item);
    byFile.set(item.file, existing);
  }

  for (const [file, items] of byFile) {
    lines.push(`#### ${file}\n`);
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
}
