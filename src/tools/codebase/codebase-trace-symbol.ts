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
  type ImpactInfo,
} from '../../client-pipe.js';
import {pingClient} from '../../client-pipe.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  checkCharacterLimit,
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

// ── Reference Kind Icons ─────────────────────────────────

const REF_KIND_ICONS: Record<string, string> = {
  read: '📖',
  write: '✏️',
  call: '📞',
  import: '📦',
  'type-ref': '⊤',
  unknown: '·',
};

const DIRECTION_ICONS: Record<string, string> = {
  parameter: '→',
  return: '←',
  extends: '⬆',
  implements: '◇',
  property: '●',
};

// ── Tool Definition ──────────────────────────────────────

export const traceSymbol = defineTool({
  name: 'codebase_trace_symbol',
  description: `Trace a symbol through the codebase to understand its full lifecycle.

Finds a symbol's definition, all references, re-export chains, call hierarchy
(who calls it / what it calls), type flows (parameter types, return types,
inheritance), and optionally computes blast-radius impact analysis.

Use this after codebase_exports to deep-dive into a specific symbol. Provide
the symbol name and optionally a file path + line/column for disambiguation.

**PARAMETERS:**
- \`symbol\` (string, required): Name of the symbol to trace
- \`file\` (string): File where the symbol is defined (helps disambiguation)
- \`line\` (number): Line number of the symbol (1-based)
- \`column\` (number): Column number of the symbol (0-based)
- \`rootDir\` (string): Absolute path to project root. Defaults to workspace root
- \`depth\` (number, 1-10): Call hierarchy traversal depth. Default: 3
- \`include\` (string[]): Which analyses to include. Default: ['all']
- \`includeImpact\` (boolean): Compute blast-radius impact analysis. Default: false
- \`response_format\` ('markdown'|'json'): Output format. Default: 'markdown'

**EXAMPLES:**
- Trace a function: \`{ symbol: "calculateTotal" }\`
- Trace with file hint: \`{ symbol: "UserService", file: "src/services/user.ts" }\`
- Only references: \`{ symbol: "config", include: ["references"] }\`
- Call hierarchy: \`{ symbol: "handleRequest", include: ["calls"], depth: 5 }\`
- Full impact: \`{ symbol: "BaseEntity", includeImpact: true }\``,
  timeoutMs: 60_000,
  annotations: {
    title: 'Codebase Trace Symbol',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    symbol: zod
      .string()
      .describe('Name of the symbol to trace (function, class, variable, etc.).'),
    file: zod
      .string()
      .optional()
      .describe(
        'File path where the symbol is defined. ' +
          'Helps disambiguate when multiple symbols share the same name. ' +
          'Can be relative to rootDir or absolute.',
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
    rootDir: zod
      .string()
      .optional()
      .describe('Absolute path to the project root. Defaults to the workspace root.'),
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
        ]),
      )
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
    maxReferences: zod
      .number()
      .int()
      .min(10)
      .max(5000)
      .optional()
      .default(500)
      .describe(
        'Maximum number of references to return. Prevents runaway scans on large ' +
          'codebases. Default: 500.',
      ),
    timeout: zod
      .number()
      .int()
      .min(1000)
      .max(120000)
      .optional()
      .default(30000)
      .describe(
        'Timeout in milliseconds. Returns partial results if exceeded. ' +
          'Default: 30000 (30 seconds).',
      ),
    forceRefresh: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Force invalidate project cache before tracing. Use after adding new files ' +
          'or when the project structure has changed. Default: false.',
      ),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await codebaseTraceSymbol(
      request.params.symbol,
      request.params.rootDir,
      request.params.file,
      request.params.line,
      request.params.column,
      request.params.depth,
      request.params.include,
      request.params.includeImpact,
      request.params.maxReferences,
      request.params.timeout,
      request.params.forceRefresh,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      const json = JSON.stringify(result, null, 2);
      checkCharacterLimit(json, 'codebase_trace_symbol', {
        include: "Filter to specific modes like ['references'] to reduce output",
        depth: 'Reduce depth to limit call hierarchy size',
        includeImpact: 'Set to false to skip impact analysis',
        maxReferences: 'Reduce maxReferences to limit output size',
      });
      response.appendResponseLine(json);
      return;
    }

    const markdown = formatTraceResult(result);
    checkCharacterLimit(markdown, 'codebase_trace_symbol', {
      include: "Filter to specific modes like ['references'] to reduce output",
      depth: 'Reduce depth to limit call hierarchy size',
      includeImpact: 'Set to false to skip impact analysis',
      maxReferences: 'Reduce maxReferences to limit output size',
    });
    response.appendResponseLine(markdown);
  },
});

// ── Markdown Formatters ──────────────────────────────────

function formatTraceResult(result: CodebaseTraceSymbolResult): string {
  const lines: string[] = [];

  lines.push(`## Symbol Trace: \`${result.symbol}\`\n`);

  // Summary line
  const {totalReferences, totalFiles, maxCallDepth} = result.summary;
  lines.push(
    `**${totalReferences} references** across **${totalFiles} files** · ` +
      `call depth: **${maxCallDepth}**`,
  );
  if (result.elapsedMs !== undefined) {
    lines.push(` · ${result.elapsedMs}ms`);
  }
  lines.push('\n');

  // Project diagnostics (file count and calculated timeout)
  if (result.sourceFileCount !== undefined || result.effectiveTimeout !== undefined) {
    const parts: string[] = [];
    if (result.sourceFileCount !== undefined) {
      parts.push(`${result.sourceFileCount} source files`);
    }
    if (result.effectiveTimeout !== undefined) {
      parts.push(`timeout: ${Math.round(result.effectiveTimeout / 1000)}s`);
    }
    lines.push(`*Project: ${parts.join(' · ')}*\n`);
  }

  // Partial results warning
  if (result.partial) {
    const reason = result.partialReason === 'timeout'
      ? '⚠️ **Partial results** — timeout reached'
      : '⚠️ **Partial results** — max references limit reached';
    lines.push(`${reason}\n`);
  }

  // Definition
  if (result.definition) {
    lines.push('### 📍 Definition\n');
    formatDefinition(result.definition, lines);
    lines.push('');
  }

  // References
  if (result.references.length > 0) {
    lines.push('### 📚 References\n');
    formatReferences(result.references, lines);
    lines.push('');
  }

  // Re-exports
  if (result.reExports.length > 0) {
    lines.push('### 🔄 Re-exports\n');
    formatReExports(result.reExports, lines);
    lines.push('');
  }

  // Call hierarchy
  const hasIncoming = result.callChain.incomingCalls.length > 0;
  const hasOutgoing = result.callChain.outgoingCalls.length > 0;
  if (hasIncoming || hasOutgoing) {
    lines.push('### 📞 Call Hierarchy\n');
    formatCallHierarchy(result.callChain, lines);
    lines.push('');
  }

  // Type flows
  if (result.typeFlows.length > 0) {
    lines.push('### ⊤ Type Flows\n');
    formatTypeFlows(result.typeFlows, lines);
    lines.push('');
  }

  // Impact analysis
  if (result.impact) {
    lines.push('### 💥 Impact Analysis\n');
    formatImpact(result.impact, lines);
    lines.push('');
  }

  return lines.join('\n');
}

function formatDefinition(def: SymbolLocationInfo, lines: string[]): void {
  const kindStr = def.kind ? ` (${def.kind})` : '';
  const unresolvedStr = def.unresolved ? ' ⚠️ **unresolved import**' : '';
  lines.push(`**${shortPath(def.file)}:${def.line}:${def.column}**${kindStr}${unresolvedStr}`);
  if (def.signature) {
    lines.push(`\`\`\`\n${def.signature}\n\`\`\``);
  }
}

function formatReferences(refs: ReferenceInfo[], lines: string[]): void {
  // Group by file
  const grouped = new Map<string, ReferenceInfo[]>();
  for (const ref of refs) {
    const fileRefs = grouped.get(ref.file) ?? [];
    fileRefs.push(ref);
    grouped.set(ref.file, fileRefs);
  }

  // Show count per kind
  const kindCounts = new Map<string, number>();
  for (const ref of refs) {
    kindCounts.set(ref.kind, (kindCounts.get(ref.kind) ?? 0) + 1);
  }

  const kindSummary = [...kindCounts.entries()]
    .map(([kind, count]) => `${REF_KIND_ICONS[kind] ?? '·'} ${kind}: ${count}`)
    .join(' · ');
  lines.push(`${kindSummary}\n`);

  // Limit displayed references to avoid huge output
  const MAX_REFS_PER_FILE = 10;
  const MAX_FILES = 20;
  let fileCount = 0;

  for (const [file, fileRefs] of grouped) {
    if (fileCount >= MAX_FILES) {
      lines.push(
        `\n*…and ${grouped.size - MAX_FILES} more files (use JSON format for full list)*`,
      );
      break;
    }

    lines.push(`**${shortPath(file)}**`);
    const displayRefs = fileRefs.slice(0, MAX_REFS_PER_FILE);
    for (const ref of displayRefs) {
      const icon = REF_KIND_ICONS[ref.kind] ?? '·';
      const ctx = ref.context.trim();
      lines.push(`  ${icon} L${ref.line}: \`${truncate(ctx, 80)}\``);
    }
    if (fileRefs.length > MAX_REFS_PER_FILE) {
      lines.push(`  *…and ${fileRefs.length - MAX_REFS_PER_FILE} more references*`);
    }
    fileCount++;
  }
}

function formatReExports(reExports: ReExportInfo[], lines: string[]): void {
  for (const re of reExports) {
    const alias =
      re.originalName !== re.exportedAs
        ? ` (as \`${re.exportedAs}\`)`
        : '';
    lines.push(
      `- 🔄 \`${re.originalName}\`${alias} → \`${shortPath(re.file)}\`:${re.line} from \`${re.from}\``,
    );
  }
}

function formatCallHierarchy(
  callChain: {incomingCalls: CallChainNode[]; outgoingCalls: CallChainNode[]},
  lines: string[],
): void {
  if (callChain.incomingCalls.length > 0) {
    lines.push('**Incoming (callers):**');
    const display = callChain.incomingCalls.slice(0, 20);
    for (const caller of display) {
      lines.push(
        `  ← \`${caller.symbol}\` at \`${shortPath(caller.file)}\`:${caller.line}`,
      );
    }
    if (callChain.incomingCalls.length > 20) {
      lines.push(
        `  *…and ${callChain.incomingCalls.length - 20} more callers*`,
      );
    }
    lines.push('');
  }

  if (callChain.outgoingCalls.length > 0) {
    lines.push('**Outgoing (callees):**');
    const display = callChain.outgoingCalls.slice(0, 20);
    for (const callee of display) {
      lines.push(
        `  → \`${callee.symbol}\` at \`${shortPath(callee.file)}\`:${callee.line}`,
      );
    }
    if (callChain.outgoingCalls.length > 20) {
      lines.push(
        `  *…and ${callChain.outgoingCalls.length - 20} more callees*`,
      );
    }
  }
}

function formatTypeFlows(flows: TypeFlowInfo[], lines: string[]): void {
  for (const flow of flows) {
    const icon = DIRECTION_ICONS[flow.direction] ?? '·';
    const traceStr = flow.traceTo
      ? ` → \`${flow.traceTo.symbol}\` at \`${shortPath(flow.traceTo.file)}\`:${flow.traceTo.line}`
      : '';
    lines.push(`- ${icon} **${flow.direction}**: \`${flow.type}\`${traceStr}`);
  }
}

function formatImpact(impact: ImpactInfo, lines: string[]): void {
  const {impactSummary} = impact;
  const riskEmoji =
    impactSummary.riskLevel === 'high'
      ? '🔴'
      : impactSummary.riskLevel === 'medium'
        ? '🟡'
        : '🟢';

  lines.push(
    `${riskEmoji} **Risk: ${impactSummary.riskLevel.toUpperCase()}** — ` +
      `${impactSummary.totalSymbolsAffected} symbols affected across ` +
      `${impactSummary.directFiles} direct + ${impactSummary.transitiveFiles} transitive files\n`,
  );

  if (impact.directDependents.length > 0) {
    lines.push('**Direct dependents:**');
    const display = impact.directDependents.slice(0, 15);
    for (const dep of display) {
      lines.push(
        `  · \`${dep.symbol}\` (${dep.kind}) at \`${shortPath(dep.file)}\`:${dep.line}`,
      );
    }
    if (impact.directDependents.length > 15) {
      lines.push(
        `  *…and ${impact.directDependents.length - 15} more*`,
      );
    }
    lines.push('');
  }

  if (impact.transitiveDependents.length > 0) {
    lines.push('**Transitive dependents:**');
    const display = impact.transitiveDependents.slice(0, 10);
    for (const dep of display) {
      lines.push(
        `  · \`${dep.symbol}\` (${dep.kind}) at \`${shortPath(dep.file)}\`:${dep.line}`,
      );
    }
    if (impact.transitiveDependents.length > 10) {
      lines.push(
        `  *…and ${impact.transitiveDependents.length - 10} more*`,
      );
    }
  }
}

// ── Helpers ──────────────────────────────────────────────

function shortPath(filePath: string): string {
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');
  // Try to show only the last 3 segments
  const parts = normalized.split('/');
  if (parts.length <= 3) return normalized;
  return '…/' + parts.slice(-3).join('/');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
