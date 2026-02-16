/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseFindDeadCode,
  codebaseFindDuplicates,
  codebaseGetDiagnostics,
  codebaseGetImportGraph,
  type DeadCodeResult,
  type DuplicateDetectionResult,
  type DiagnosticsResult,
  type DiagnosticItem,
  type ImportGraphResult,
  type CircularChain,
} from '../../client-pipe.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
} from '../ToolDefinition.js';
import {appendIgnoreContextMarkdown, buildIgnoreContextJson} from './ignore-context.js';

// ── Tool Definition ──────────────────────────────────────

export const lint = defineTool({
  name: 'codebase_lint',
  description: 'Find dead code, unused exports, and code quality issues.\n\n' +
    'Runs automated checks on TypeScript/JavaScript files. Use the `checks` parameter\n' +
    'to control which analyses to run.\n\n' +
    '**Available checks:**\n' +
    '- `dead-code` — Find unused exports, unreachable functions, dead variables\n' +
    '- `duplicates` — Find structurally duplicate code using AST hashing\n' +
    '- `errors` — Show compile/TypeScript errors from VS Code diagnostics\n' +
    '- `warnings` — Show warnings (deprecations, etc.) from VS Code diagnostics\n' +
    '- `circular-deps` — Find circular import dependencies\n' +
    '- `all` — Run all available checks\n\n' +
    'Each result includes a `reason` explaining why the symbol is flagged and a\n' +
    '`confidence` level (high, medium, low).\n\n' +
    '**PARAMETERS:**\n' +
    '- `rootDir` (string): Project root path. Defaults to workspace root\n' +
    '- `checks` (string[]): Which checks to run. Default: [\'all\']\n' +
    '- `exportedOnly` (boolean): Only check exported symbols. Default: true\n' +
    '- `excludeTests` (boolean): Skip test files. Default: true\n' +
    '- `kinds` (string[]): Filter by symbol kind\n' +
    '- `limit` (number): Max results per check. Default: 100\n' +
    '- `duplicateThreshold` (number): Min similarity for duplicates (0.5-1.0). Default: 0.75\n\n' +
    '**EXAMPLES:**\n' +
    '- Find unused exports: `{}`\n' +
    '- Full dead code scan: `{ exportedOnly: false }`\n' +
    '- Only functions: `{ kinds: [\'function\'], exportedOnly: false }`\n' +
    '- Include test files: `{ excludeTests: false }`\n' +
    '- Check for errors: `{ checks: [\'errors\'] }`\n' +
    '- Check for circular deps: `{ checks: [\'circular-deps\'] }`',
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
        zod.enum(['all', 'dead-code', 'duplicates', 'errors', 'warnings', 'circular-deps']),
      )
      .optional()
      .default(['all'])
      .describe(
        "Which lint checks to run. Default: ['all']. " +
          "Available: 'dead-code', 'duplicates', 'errors', 'warnings', 'circular-deps'.",
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
    duplicateThreshold: zod
      .number()
      .min(0.5)
      .max(1.0)
      .optional()
      .default(0.75)
      .describe(
        'Minimum similarity score for duplicate detection. ' +
          '1.0 = exact structural match only. Default: 0.75.',
      ),
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
    const {params} = request;
    const checks = params.checks;
    const runAll = checks.includes('all');
    const runDeadCode = runAll || checks.includes('dead-code');
    const runDuplicates = runAll || checks.includes('duplicates');
    const runErrors = runAll || checks.includes('errors');
    const runWarnings = runAll || checks.includes('warnings');
    const runCircularDeps = runAll || checks.includes('circular-deps');

    const sections: LintSection[] = [];

    // Run diagnostics (errors/warnings) — fast, reads VS Code state
    if (runErrors || runWarnings) {
      try {
        const severityFilter: string[] = [];
        if (runErrors) severityFilter.push('error');
        if (runWarnings) severityFilter.push('warning');

        const result = await codebaseGetDiagnostics(
          severityFilter,
          params.includePatterns,
          params.excludePatterns,
          params.limit,
        );
        sections.push({check: 'diagnostics', diagnosticsResult: result});
      } catch {
        // Diagnostics not available — silently skip
      }
    }

    // Run static analysis — expensive, full project scan
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

    if (runDuplicates) {
      const result = await codebaseFindDuplicates(
        params.rootDir,
        params.kinds,
        params.limit,
        params.includePatterns,
        params.excludePatterns,
      );
      sections.push({check: 'duplicates', duplicatesResult: result});
    }

    if (runCircularDeps) {
      try {
        const result = await codebaseGetImportGraph(
          params.rootDir,
          params.includePatterns,
          params.excludePatterns,
        );
        sections.push({check: 'circular-deps', circularDepsResult: result});
      } catch {
        // Import graph not available — silently skip
      }
    }

    if (params.response_format === ResponseFormat.JSON) {
      const jsonResult = buildJsonResult(sections);
      if (jsonResult.summary.totalIssues === 0) {
        const rootDir = resolveRootDirFromSections(sections, params.rootDir);
        if (rootDir) {
          const withIgnore = {...jsonResult, ignoredBy: buildIgnoreContextJson(rootDir)};
          response.appendResponseLine(JSON.stringify(withIgnore, null, 2));
          return;
        }
      }
      response.appendResponseLine(JSON.stringify(jsonResult, null, 2));
      return;
    }

    const markdown = formatLintReport(sections, params.rootDir);
    response.appendResponseLine(markdown);
  },
});

// ── Types ────────────────────────────────────────────────

interface LintSection {
  check: string;
  deadCodeResult?: DeadCodeResult;
  duplicatesResult?: DuplicateDetectionResult;
  diagnosticsResult?: DiagnosticsResult;
  circularDepsResult?: ImportGraphResult;
}

interface LintJsonResult {
  checks: string[];
  diagnostics?: DiagnosticItem[];
  deadCode?: DeadCodeResult;
  duplicates?: DuplicateDetectionResult;
  circularDeps?: CircularChain[];
  summary: {
    totalIssues: number;
    totalErrors?: number;
    totalWarnings?: number;
    totalDeadCode?: number;
    totalDuplicateGroups?: number;
    totalCircularDeps?: number;
    checksRun: string[];
  };
}

// ── JSON Builder ─────────────────────────────────────────

function buildJsonResult(sections: LintSection[]): LintJsonResult {
  let totalIssues = 0;
  const checksRun: string[] = [];
  let deadCode: DeadCodeResult | undefined;
  let duplicates: DuplicateDetectionResult | undefined;
  let diagnosticItems: DiagnosticItem[] | undefined;
  let circularDeps: CircularChain[] | undefined;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalDeadCode = 0;
  let totalDuplicateGroups = 0;
  let totalCircularDeps = 0;

  for (const section of sections) {
    checksRun.push(section.check);
    if (section.deadCodeResult) {
      deadCode = section.deadCodeResult;
      totalDeadCode = section.deadCodeResult.summary.totalDead;
      totalIssues += totalDeadCode;
    }
    if (section.duplicatesResult) {
      duplicates = section.duplicatesResult;
      totalDuplicateGroups = section.duplicatesResult.summary.totalGroups;
      totalIssues += totalDuplicateGroups;
    }
    if (section.diagnosticsResult) {
      diagnosticItems = section.diagnosticsResult.diagnostics;
      totalErrors = section.diagnosticsResult.summary.totalErrors;
      totalWarnings = section.diagnosticsResult.summary.totalWarnings;
      totalIssues += totalErrors + totalWarnings;
    }
    if (section.circularDepsResult) {
      circularDeps = section.circularDepsResult.circular;
      totalCircularDeps = section.circularDepsResult.stats.circularCount;
      totalIssues += totalCircularDeps;
    }
  }

  return {
    checks: checksRun,
    diagnostics: diagnosticItems,
    deadCode,
    duplicates,
    circularDeps,
    summary: {
      totalIssues,
      totalErrors: diagnosticItems ? totalErrors : undefined,
      totalWarnings: diagnosticItems ? totalWarnings : undefined,
      totalDeadCode: deadCode ? totalDeadCode : undefined,
      totalDuplicateGroups: duplicates ? totalDuplicateGroups : undefined,
      totalCircularDeps: circularDeps ? totalCircularDeps : undefined,
      checksRun,
    },
  };
}

// ── Markdown Formatting ──────────────────────────────────

function formatLintReport(sections: LintSection[], requestedRootDir?: string): string {
  const lines: string[] = [];
  lines.push('## 🔍 Codebase Lint Report\n');

  let totalIssues = 0;

  for (const section of sections) {
    if (section.check === 'diagnostics' && section.diagnosticsResult) {
      const diagCount = section.diagnosticsResult.diagnostics.length;
      totalIssues += diagCount;
      formatDiagnosticsSection(section.diagnosticsResult, lines);
    }
    if (section.check === 'dead-code' && section.deadCodeResult) {
      totalIssues += section.deadCodeResult.summary.totalDead;
      formatDeadCodeSection(section.deadCodeResult, lines);
    }
    if (section.check === 'duplicates' && section.duplicatesResult) {
      totalIssues += section.duplicatesResult.summary.totalGroups;
      formatDuplicatesSection(section.duplicatesResult, lines);
    }
    if (section.check === 'circular-deps' && section.circularDepsResult) {
      totalIssues += section.circularDepsResult.stats.circularCount;
      formatCircularDepsSection(section.circularDepsResult, lines);
    }
  }

  lines.push('---');
  if (totalIssues === 0) {
    lines.push('✅ **No issues found across all checks.**');
    const rootDir = resolveRootDirFromSections(sections, requestedRootDir);
    if (rootDir) {
      appendIgnoreContextMarkdown(lines, rootDir);
    }
  } else {
    lines.push(`**Total issues: ${totalIssues}**`);
  }

  return lines.join('\n');
}

function resolveRootDirFromSections(sections: LintSection[], fallback?: string): string | undefined {
  for (const s of sections) {
    if (s.deadCodeResult?.resolvedRootDir) return s.deadCodeResult.resolvedRootDir;
    if (s.duplicatesResult?.resolvedRootDir) return s.duplicatesResult.resolvedRootDir;
  }
  return fallback;
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

function formatDuplicatesSection(result: DuplicateDetectionResult, lines: string[]): void {
  lines.push('### 🔁 Duplicate Code\n');

  if (result.errorMessage) {
    lines.push(`❌ **Error:** ${result.errorMessage}\n`);
    return;
  }

  const {totalGroups, totalDuplicateInstances, filesWithDuplicates, scanDurationMs} = result.summary;
  lines.push(
    `**${totalGroups}** duplicate groups (${totalDuplicateInstances} instances across ${filesWithDuplicates} files) · ${scanDurationMs}ms\n`,
  );

  if (result.resolvedRootDir) {
    lines.push(`*Project root: \`${result.resolvedRootDir}\`*\n`);
  }

  if (result.groups.length === 0) {
    lines.push('✅ No structural duplicates found.\n');
    return;
  }

  for (let i = 0; i < result.groups.length; i++) {
    const group = result.groups[i];
    const kindIcon = group.kind === 'function' ? '⚡' : group.kind === 'class' ? '🔷' : group.kind === 'interface' ? '🔶' : '📋';
    lines.push(`#### ${kindIcon} Group ${i + 1} — ${group.kind} (${group.lineCount} lines, ${group.instances.length} copies)\n`);

    for (const instance of group.instances) {
      lines.push(`- \`${instance.name}\` in \`${instance.file}\` (lines ${instance.line}–${instance.endLine})`);
    }
    lines.push('');
  }
}

function formatDiagnosticsSection(result: DiagnosticsResult, lines: string[]): void {
  lines.push('### 🔴 Diagnostics\n');

  if (result.errorMessage) {
    lines.push(`❌ **Error:** ${result.errorMessage}\n`);
    return;
  }

  const {totalErrors, totalWarnings, totalFiles} = result.summary;
  const total = totalErrors + totalWarnings;
  lines.push(
    `**${total}** diagnostics across **${totalFiles}** files ` +
      `(${totalErrors} errors, ${totalWarnings} warnings)\n`,
  );

  if (result.diagnostics.length === 0) {
    lines.push('✅ No diagnostics found.\n');
    return;
  }

  // Group by file
  const byFile = new Map<string, DiagnosticItem[]>();
  for (const item of result.diagnostics) {
    const existing = byFile.get(item.file) ?? [];
    existing.push(item);
    byFile.set(item.file, existing);
  }

  for (const [file, items] of byFile) {
    lines.push(`#### ${file}\n`);
    for (const item of items) {
      const icon = item.severity === 'error' ? '❌' : '⚠️';
      const codeStr = item.code ? ` [${item.code}]` : '';
      lines.push(
        `- ${icon} **${item.severity}** at line ${item.line}:${item.column}${codeStr}`,
      );
      lines.push(`  ${item.message} *(${item.source})*`);
    }
    lines.push('');
  }
}

function formatCircularDepsSection(result: ImportGraphResult, lines: string[]): void {
  lines.push('### 🔄 Circular Dependencies\n');

  if (result.errorMessage) {
    lines.push(`❌ **Error:** ${result.errorMessage}\n`);
    return;
  }

  const {circularCount} = result.stats;
  lines.push(`**${circularCount}** circular dependency chains found\n`);

  if (result.circular.length === 0) {
    lines.push('✅ No circular dependencies found.\n');
    return;
  }

  for (let i = 0; i < result.circular.length; i++) {
    const cycle = result.circular[i];
    lines.push(`${i + 1}. ⚠️ ${cycle.chain.join(' → ')}`);
  }
  lines.push('');
}
