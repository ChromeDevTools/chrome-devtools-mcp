/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseTraceSymbol,
  type CodebaseTraceSymbolResult,
  type SymbolLocationInfo,
  type ReferenceInfo,
  type ReExportInfo,
  type CallChainNode,
  type TypeFlowInfo,
  type TypeHierarchyInfo,
  type ImpactInfo,
} from '../../client-pipe.js';
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {
  defineTool,
} from '../ToolDefinition.js';
import {buildIgnoreContextJson} from './ignore-context.js';

// ── Dynamic Timeout Configuration ────────────────────────

const TIMEOUT_BASE_MS = 5_000;
const TIMEOUT_FILE_FACTOR_MS = 15;
const TIMEOUT_DEPTH_FACTOR_MS = 3_000;
const TIMEOUT_MODE_FACTOR_MS = 2_000;

// ── Progressive Detail Reduction ─────────────────────────

const OUTPUT_TOKEN_LIMIT = 3_000;
const CHARS_PER_TOKEN = 4;
const OUTPUT_CHAR_LIMIT = OUTPUT_TOKEN_LIMIT * CHARS_PER_TOKEN;

type ReductionLevel =
  | 'stripped-dts-refs'
  | 'collapsed-outgoing-calls'
  | 'collapsed-type-flows'
  | 'reduced-depth';

interface OutputScaling {
  requestedDepth: number;
  effectiveDepth: number;
  reductionsApplied: ReductionLevel[];
  estimatedTokens: number;
  tokenLimit: number;
  suggestions: string[];
}

function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / CHARS_PER_TOKEN);
}

function isDtsReference(file: string): boolean {
  return /\.d\.ts$/.test(file) || file.includes('node_modules');
}

function stripDtsReferences(result: CodebaseTraceSymbolResult): void {
  result.references = result.references.filter(r => !isDtsReference(r.file));
  result.reExports = result.reExports.filter(r => !isDtsReference(r.file));

  result.callChain.incomingCalls = result.callChain.incomingCalls.filter(c => !isDtsReference(c.file));
  result.callChain.outgoingCalls = result.callChain.outgoingCalls.filter(c => !isDtsReference(c.file));

  result.typeFlows = result.typeFlows.filter(f => !f.traceTo || !isDtsReference(f.traceTo.file));

  if (result.impact) {
    result.impact.directDependents = result.impact.directDependents.filter(d => !isDtsReference(d.file));
    result.impact.transitiveDependents = result.impact.transitiveDependents.filter(d => !isDtsReference(d.file));
  }
}

function collapseOutgoingCalls(result: CodebaseTraceSymbolResult): void {
  const count = result.callChain.outgoingCalls.length;
  if (count > 0) {
    result.callChain.outgoingCalls = [];
    result.callChain.outgoingCollapsedCount = count;
  }
}

function collapseTypeFlows(result: CodebaseTraceSymbolResult): void {
  for (const flow of result.typeFlows) {
    delete flow.traceTo;
  }
}

function applyProgressiveReduction(
  result: CodebaseTraceSymbolResult,
  requestedDepth: number,
): OutputScaling {
  const reductionsApplied: ReductionLevel[] = [];
  const suggestions: string[] = [];

  // Level 1: Strip .d.ts references
  if (estimateTokens(result) > OUTPUT_TOKEN_LIMIT) {
    stripDtsReferences(result);
    reductionsApplied.push('stripped-dts-refs');
  }

  // Level 2: Collapse outgoing calls to count only (keep incoming)
  if (estimateTokens(result) > OUTPUT_TOKEN_LIMIT) {
    collapseOutgoingCalls(result);
    reductionsApplied.push('collapsed-outgoing-calls');
    suggestions.push("Use include: ['calls'] to get full outgoing call detail");
  }

  // Level 3: Collapse type flows (drop traceTo)
  if (estimateTokens(result) > OUTPUT_TOKEN_LIMIT) {
    collapseTypeFlows(result);
    reductionsApplied.push('collapsed-type-flows');
    suggestions.push("Use include: ['type-flows'] to get full type flow detail");
  }

  // Level 4: Note that depth could be reduced (don't retry here — depth is set upstream)
  const effectiveDepth = requestedDepth;
  if (estimateTokens(result) > OUTPUT_TOKEN_LIMIT) {
    reductionsApplied.push('reduced-depth');
    suggestions.push(`Reduce depth from ${requestedDepth} to limit call hierarchy size`);
  }

  return {
    requestedDepth,
    effectiveDepth,
    reductionsApplied,
    estimatedTokens: estimateTokens(result),
    tokenLimit: OUTPUT_TOKEN_LIMIT,
    suggestions,
  };
}

// ── Tool Definition ──────────────────────────────────────

export const trace = defineTool({
  name: 'codebase_trace',
  description: 'Trace a symbol through the codebase to understand its full lifecycle.\n\n' +
    "Finds a symbol's definition, all references, re-export chains, call hierarchy\n" +
    '(who calls it / what it calls), type flows (parameter types, return types,\n' +
    'inheritance), and optionally computes blast-radius impact analysis.\n\n' +
    'Use this after codebase_map to deep-dive into a specific symbol. Provide\n' +
    'the symbol name and optionally a file path + line/column for disambiguation.\n\n' +
    '**PARAMETERS:**\n' +
    '- `symbol` (string, required): Name of the symbol to trace\n' +
    '- `file` (string): File where the symbol is defined (helps disambiguation)\n' +
    '- `line` (number): Line number of the symbol (1-based)\n' +
    '- `column` (number): Column number of the symbol (0-based)\n' +
    '- `depth` (number, 1-10): Call hierarchy traversal depth. Default: 3\n' +
    "- `include` (string[]): Which analyses to include. Default: ['all']\n" +
    '- `includeImpact` (boolean): Compute blast-radius impact analysis. Default: false\n\n' +
    '**EXAMPLES:**\n' +
    '- Trace a function: `{ symbol: "calculateTotal" }`\n' +
    '- Trace with file hint: `{ symbol: "UserService", file: "src/services/user.ts" }`\n' +
    '- Only references: `{ symbol: "config", include: ["references"] }`\n' +
    '- Call hierarchy: `{ symbol: "handleRequest", include: ["calls"], depth: 5 }`\n' +
    '- Full impact: `{ symbol: "BaseEntity", includeImpact: true }`',
  annotations: {
    title: 'Codebase Trace',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe', 'codebase-sequential'],
  },
  schema: {
    symbol: zod
      .string()
      .describe('Name of the symbol to trace (function, class, variable, etc.).'),
    file: zod
      .string()
      .optional()
      .describe(
        'File path where the symbol is defined. ' +
          'Helps disambiguate when multiple symbols share the same name. ' +
          'Can be relative or absolute.',
      ),
    line: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Line number of the symbol (1-based). Use with file for precise location.'),
    column: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Column number of the symbol (0-based). Use with file and line.'),
    depth: zod
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(3)
      .describe(
        'Call hierarchy traversal depth. Higher values find deeper call chains ' +
          'but take longer. Default: 3.',
      ),
    include: zod
      .array(
        zod.enum([
          'all',
          'definitions',
          'references',
          'reexports',
          'calls',
          'type-flows',
          'hierarchy',
        ]),
      )
      .min(1)
      .optional()
      .default(['all'])
      .describe(
        "Which analyses to include. Default: ['all']. " +
          "Use specific modes like ['references', 'calls'] to reduce output.",
      ),
    includeImpact: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Compute blast-radius impact analysis. Shows direct and transitive ' +
          'dependents with risk level assessment. Default: false.',
      ),
    forceRefresh: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Force invalidate project cache before tracing. Use after adding new files ' +
          'or when the project structure has changed. Default: false.',
      ),
    includePatterns: zod
      .array(zod.string())
      .optional()
      .describe(
        'Glob patterns to restrict analysis to matching files only. ' +
          'When provided, only files matching at least one pattern are analyzed. ' +
          'excludePatterns further narrow within the included set.',
      ),
    excludePatterns: zod
      .array(zod.string())
      .optional()
      .describe(
        'Glob patterns to exclude files from analysis. ' +
          'Applied in addition to .devtoolsignore rules. ' +
          "Example: ['**/*.test.ts', '**/fixtures/**']",
      ),
  },
  handler: async (request, response) => {
    if (!request.params.symbol || request.params.symbol.trim() === '') {
      response.setSkipLedger();
      response.appendResponseLine(JSON.stringify({ error: 'symbol is required' }, null, 2));
      return;
    }

    // Dynamic timeout: scales with request complexity
    const modeCount = request.params.include.includes('all') ? 6 : request.params.include.length;
    const dynamicTimeout =
      TIMEOUT_BASE_MS +
      (request.params.depth * TIMEOUT_DEPTH_FACTOR_MS) +
      (modeCount * TIMEOUT_MODE_FACTOR_MS);

    const result = await codebaseTraceSymbol(
      request.params.symbol,
      getHostWorkspace(),
      request.params.file,
      request.params.line,
      request.params.column,
      request.params.depth,
      request.params.include,
      request.params.includeImpact,
      undefined, // maxReferences: removed — no artificial limit
      dynamicTimeout,
      request.params.forceRefresh,
      request.params.includePatterns,
      request.params.excludePatterns,
    );

    // Adjust dynamic timeout with actual file count now that we have it
    if (result.sourceFileCount !== undefined) {
      const adjustedTimeout =
        TIMEOUT_BASE_MS +
        (result.sourceFileCount * TIMEOUT_FILE_FACTOR_MS) +
        (request.params.depth * TIMEOUT_DEPTH_FACTOR_MS) +
        (modeCount * TIMEOUT_MODE_FACTOR_MS);
      result.effectiveTimeout = adjustedTimeout;
    }

    const isEmpty = result.summary.totalReferences === 0 &&
      result.references.length === 0 &&
      result.reExports.length === 0 &&
      result.callChain.incomingCalls.length === 0 &&
      result.callChain.outgoingCalls.length === 0 &&
      result.typeFlows.length === 0 &&
      !result.definition;

    const effectiveRootDir = result.resolvedRootDir;

    response.setSkipLedger();

    // Apply progressive detail reduction
    const scaling = applyProgressiveReduction(result, request.params.depth);

    // Build final output
    const output: Record<string, unknown> = {...result};

    if (isEmpty && effectiveRootDir) {
      output.ignoredBy = buildIgnoreContextJson(effectiveRootDir);
    }

    if (scaling.reductionsApplied.length > 0) {
      output.outputScaling = scaling;
    }

    // Final size check — if still too large after all reductions, return error with summary
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
      const errorResult = {
        error: 'Response too large even after progressive reduction',
        symbol: result.symbol,
        summary: result.summary,
        definition: result.definition,
        outputScaling: {
          ...scaling,
          estimatedTokens: estimateTokens(output),
        },
        suggestions: [
          "Use include: ['references'] or include: ['calls'] to focus on one analysis mode",
          `Reduce depth from ${request.params.depth} to limit call hierarchy size`,
          'Use includePatterns to restrict analysis to specific files',
        ],
      };
      response.appendResponseLine(JSON.stringify(errorResult, null, 2));
      return;
    }

    response.appendResponseLine(JSON.stringify(output, null, 2));
  },
});

// ── Extended call chain type (outgoing can be collapsed) ─

declare module '../../client-pipe.js' {
  interface CallChainInfo {
    outgoingCollapsedCount?: number;
  }
}
