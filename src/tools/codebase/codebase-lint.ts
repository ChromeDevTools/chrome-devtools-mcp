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
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {
  defineTool,
} from '../ToolDefinition.js';
import {buildIgnoreContextJson} from './ignore-context.js';

// ── Dynamic Timeout Configuration ────────────────────────
// Timeout scales with the number of checks being run and scope
// breadth rather than using a hardcoded ceiling.
const TIMEOUT_BASE_MS = 10_000;
const TIMEOUT_PER_CHECK_MS = 15_000;
const TIMEOUT_BROAD_SCOPE_MS = 30_000;

// ── Tool Definition ──────────────────────────────────────

export const lint = defineTool({
  name: 'exp_codebase_lint',
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
    "- `checks` (string[]): Which checks to run. Default: ['all']\n" +
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
  annotations: {
    title: 'Codebase Lint',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe', 'codebase-sequential'],
  },
  schema: {
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

    // ── Compute Dynamic Timeout ──────────────────────────
    // Scales with the number of checks and scope breadth.
    const checksCount = [runErrors || runWarnings, runDeadCode, runDuplicates, runCircularDeps].filter(Boolean).length;
    const isBroadScope = !params.includePatterns?.length ||
      params.includePatterns.some(p => p.includes('**'));
    const dynamicTimeout =
      TIMEOUT_BASE_MS +
      (checksCount * TIMEOUT_PER_CHECK_MS) +
      (isBroadScope ? TIMEOUT_BROAD_SCOPE_MS : 0);

    const sections: LintSection[] = [];

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
          dynamicTimeout,
        );
        sections.push({check: 'diagnostics', diagnosticsResult: result});
      } catch {
        // Diagnostics not available — silently skip
      }
    }

    if (runDeadCode) {
      const result = await codebaseFindDeadCode(
        getHostWorkspace(),
        undefined,
        params.exportedOnly,
        params.excludeTests,
        params.kinds,
        params.limit,
        params.includePatterns,
        params.excludePatterns,
        dynamicTimeout,
      );
      sections.push({check: 'dead-code', deadCodeResult: result});
    }

    if (runDuplicates) {
      const result = await codebaseFindDuplicates(
        getHostWorkspace(),
        params.kinds,
        params.limit,
        params.includePatterns,
        params.excludePatterns,
        dynamicTimeout,
      );
      sections.push({check: 'duplicates', duplicatesResult: result});
    }

    if (runCircularDeps) {
      try {
        const result = await codebaseGetImportGraph(
          getHostWorkspace(),
          params.includePatterns,
          params.excludePatterns,
          dynamicTimeout,
        );
        sections.push({check: 'circular-deps', circularDepsResult: result});
      } catch {
        // Import graph not available — silently skip
      }
    }

    response.setSkipLedger();

    const jsonResult = buildJsonResult(sections);
    if (jsonResult.summary.totalIssues === 0) {
      const rootDir = resolveRootDirFromSections(sections);
      if (rootDir) {
        const withIgnore = {...jsonResult, ignoredBy: buildIgnoreContextJson(rootDir)};
        response.appendResponseLine(JSON.stringify(withIgnore, null, 2));
        return;
      }
    }
    response.appendResponseLine(JSON.stringify(jsonResult, null, 2));
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

function resolveRootDirFromSections(sections: LintSection[]): string | undefined {
  for (const s of sections) {
    if (s.deadCodeResult?.resolvedRootDir) return s.deadCodeResult.resolvedRootDir;
    if (s.duplicatesResult?.resolvedRootDir) return s.duplicatesResult.resolvedRootDir;
  }
  return undefined;
}
