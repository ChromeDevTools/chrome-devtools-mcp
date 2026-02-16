/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseGetOverview,
  codebaseGetExports,
  codebaseGetImportGraph,
  type CodebaseTreeNode,
  type CodebaseSymbolNode,
  type CodebaseExportInfo,
  type CodebaseExportsResult,
  type ImportGraphResult,
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
import {appendIgnoreContextMarkdown, buildIgnoreContextJson} from './ignore-context.js';

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

// ── Kind Icons ───────────────────────────────────────────

const KIND_ICONS: Record<string, string> = {
  function: 'ƒ',
  class: '◆',
  interface: '◇',
  type: '⊤',
  enum: '∈',
  constant: '●',
  variable: '○',
  namespace: '▪',
  unknown: '?',
};

// ── Tool Definition ──────────────────────────────────────

export const map = defineTool({
  name: 'codebase_map',
  description: 'Get a structural map of the codebase at any granularity — files, symbols, exports, or full API detail.\n\n' +
    'This is the single tool for understanding what EXISTS in a codebase.\n\n' +
    '**Mode selection:**\n' +
    '- **Directory/workspace mode** (path omitted or points to directory): File tree with symbols\n' +
    '- **File mode** (path points to a single file): Detailed exports with signatures and JSDoc\n\n' +
    '**Depth controls detail level:**\n' +
    '- `depth: 0` — File tree only (directories and filenames)\n' +
    '- `depth: 1` — Top-level symbols per file (functions, classes, interfaces)\n' +
    '- `depth: 2` — Symbols with type signatures (class members, method params)\n' +
    '- `depth: 3+` — Full detail including JSDoc documentation\n\n' +
    '**EXAMPLES:**\n' +
    '- Full project map: `{}`\n' +
    '- Subdirectory only: `{ path: "src/tools" }`\n' +
    '- File exports: `{ path: "src/client-pipe.ts" }`\n' +
    '- Functions only: `{ path: "src/tools", kind: "functions" }`\n' +
    '- File tree only: `{ depth: 0 }`\n' +
    '- With import graph: `{ includeGraph: true }`\n' +
    '- Deep dive: `{ path: "src/tools", depth: 3 }`',
  timeoutMs: 60_000,
  annotations: {
    title: 'Codebase Map',
    category: ToolCategory.CODEBASE_ANALYSIS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['client-pipe'],
  },
  schema: {
    response_format: responseFormatSchema,
    path: zod
      .string()
      .optional()
      .describe(
        'File, directory, or glob to map. Defaults to entire workspace. ' +
        'If a file path, shows detailed exports. If a directory, shows file tree with symbols.',
      ),
    rootDir: zod
      .string()
      .optional()
      .describe('Absolute path to the project root. Defaults to the workspace root.'),
    depth: zod
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .default(1)
      .describe(
        'Detail level: 0=files only, 1=top-level symbols, 2=symbols with signatures, ' +
        '3+=full detail (signatures + JSDoc + re-exports).',
      ),
    filter: zod
      .string()
      .optional()
      .describe('Glob pattern to include only matching files (e.g., "src/tools/**").'),
    kind: zod
      .enum(['all', 'functions', 'classes', 'interfaces', 'types', 'constants', 'enums'])
      .optional()
      .default('all')
      .describe('Filter symbols/exports by kind.'),
    includeTypes: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include type signatures (depth >= 2).'),
    includeJSDoc: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include JSDoc descriptions (depth >= 3).'),
    includeImports: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include import specifiers per file.'),
    includeGraph: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include module dependency graph with circular dependency detection.'),
    includeStats: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include line counts per file and diagnostic counts.'),
    includePatterns: zod
      .array(zod.string())
      .optional()
      .describe(
        'Glob patterns to restrict results to matching files only. ' +
        'excludePatterns further narrow within the included set.',
      ),
    excludePatterns: zod
      .array(zod.string())
      .optional()
      .describe(
        'Glob patterns to exclude files from results. ' +
        'Applied in addition to .devtoolsignore rules.',
      ),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const {params} = request;
    const isFileMode = params.path && !params.path.includes('*') && /\.\w+$/.test(params.path);

    if (isFileMode) {
      // File mode — show detailed exports
      const result = await codebaseGetExports(
        params.path!,
        params.rootDir,
        params.includeTypes,
        params.depth >= 3 ? params.includeJSDoc : false,
        params.kind,
        params.includePatterns,
        params.excludePatterns,
      );

      if (params.response_format === ResponseFormat.JSON) {
        const json = JSON.stringify(result, null, 2);
        checkCharacterLimit(json, 'codebase_map', REDUCE_HINTS);
        response.appendResponseLine(json);
        return;
      }

      const markdown = formatExportsResult(result, params.includeTypes, params.depth);
      checkCharacterLimit(markdown, 'codebase_map', REDUCE_HINTS);
      response.appendResponseLine(markdown);
      return;
    }

    // Directory/workspace mode — show file tree with symbols
    const overviewResult = await codebaseGetOverview(
      params.rootDir,
      params.depth,
      params.path ?? params.filter,
      params.includeImports,
      params.includeStats,
      params.includePatterns,
      params.excludePatterns,
    );

    // Import graph (if requested, add via separate RPC)
    let graphResult: ImportGraphResult | undefined;
    if (params.includeGraph) {
      try {
        graphResult = await codebaseGetImportGraph(params.rootDir, params.includePatterns, params.excludePatterns);
      } catch {
        // Import graph not yet available — silently skip
      }
    }

    if (params.response_format === ResponseFormat.JSON) {
      const combined = graphResult
        ? {...overviewResult, graph: graphResult}
        : overviewResult;
      if (overviewResult.summary.totalFiles === 0) {
        const withIgnore = {...combined, ignoredBy: buildIgnoreContextJson(overviewResult.projectRoot)};
        const json = JSON.stringify(withIgnore, null, 2);
        checkCharacterLimit(json, 'codebase_map', REDUCE_HINTS);
        response.appendResponseLine(json);
        return;
      }
      const json = JSON.stringify(combined, null, 2);
      checkCharacterLimit(json, 'codebase_map', REDUCE_HINTS);
      response.appendResponseLine(json);
      return;
    }

    const lines: string[] = [];
    lines.push(`## Codebase Map: ${overviewResult.projectRoot}\n`);
    renderTree(
      overviewResult.tree,
      lines,
      '',
      true,
      params.includeStats,
      params.includeImports,
    );

    lines.push('');
    lines.push('---');
    lines.push(
      `**Summary:** ${overviewResult.summary.totalFiles} files, ` +
      `${overviewResult.summary.totalDirectories} directories, ` +
      `${overviewResult.summary.totalSymbols} symbols`,
    );

    if (overviewResult.summary.diagnosticCounts) {
      const {errors, warnings} = overviewResult.summary.diagnosticCounts;
      lines.push(`**Diagnostics:** ${errors} errors, ${warnings} warnings`);
    }

    if (graphResult) {
      lines.push('');
      formatImportGraph(graphResult, lines);
    }

    if (overviewResult.summary.totalFiles === 0) {
      appendIgnoreContextMarkdown(lines, overviewResult.projectRoot);
    }

    const markdown = lines.join('\n');
    checkCharacterLimit(markdown, 'codebase_map', REDUCE_HINTS);
    response.appendResponseLine(markdown);
  },
});

// ── Reduce Hints ─────────────────────────────────────────

const REDUCE_HINTS: Record<string, string> = {
  filter: 'Glob pattern to narrow scope (e.g., "src/tools/**")',
  depth: 'Lower number = less detail (0 for file tree only)',
  kind: 'Filter to specific kind (e.g., "functions")',
  includeTypes: 'Set to false to reduce output size',
  includeJSDoc: 'Set to false to reduce output size',
};

// ── Exports Formatting ───────────────────────────────────

function formatExportsResult(
  result: CodebaseExportsResult,
  includeTypes: boolean,
  depth: number,
): string {
  const lines: string[] = [];
  lines.push(`## Codebase Map: ${result.module}\n`);
  lines.push(`**${result.summary}**\n`);

  if (result.exports.length === 0) {
    lines.push('*No exports found.*');
  } else {
    renderExportsByKind(result.exports, lines, includeTypes, depth);
  }

  if (result.reExports.length > 0) {
    lines.push('');
    lines.push('### Re-exports\n');
    for (const re of result.reExports) {
      lines.push(`- \`${re.name}\` from \`${re.from}\``);
    }
  }

  return lines.join('\n');
}

function renderExportsByKind(
  exportInfos: CodebaseExportInfo[],
  lines: string[],
  includeTypes: boolean,
  depth: number,
): void {
  const grouped = new Map<string, CodebaseExportInfo[]>();
  for (const exp of exportInfos) {
    const kindGroup = grouped.get(exp.kind) ?? [];
    kindGroup.push(exp);
    grouped.set(exp.kind, kindGroup);
  }

  const kindOrder = [
    'function', 'class', 'interface', 'type', 'enum', 'constant', 'variable', 'namespace', 'unknown',
  ];

  for (const kind of kindOrder) {
    const group = grouped.get(kind);
    if (!group || group.length === 0) continue;

    const icon = KIND_ICONS[kind] ?? '?';
    lines.push(`### ${icon} ${capitalize(kind)}${group.length > 1 ? 's' : ''}\n`);

    for (const exp of group) {
      const badges: string[] = [];
      if (exp.isDefault) badges.push('`default`');
      if (exp.isReExport) badges.push(`\`re-export from ${exp.reExportSource}\``);
      const badgeStr = badges.length > 0 ? ' ' + badges.join(' ') : '';

      if (includeTypes && exp.signature && depth >= 2) {
        lines.push(`- **\`${exp.name}\`**${badgeStr} — \`${exp.signature}\` *(line ${exp.line})*`);
      } else {
        lines.push(`- **\`${exp.name}\`**${badgeStr} *(line ${exp.line})*`);
      }

      if (exp.jsdoc && depth >= 3) {
        lines.push(`  > ${exp.jsdoc}`);
      }
    }
  }
}

// ── Tree Rendering ───────────────────────────────────────

function renderTree(
  nodes: CodebaseTreeNode[],
  lines: string[],
  prefix: string,
  isRoot: boolean,
  includeStats: boolean,
  includeImports: boolean,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');

    if (node.type === 'directory') {
      lines.push(`${prefix}${connector}📁 ${node.name}/`);
      if (node.children) {
        renderTree(
          node.children,
          lines,
          childPrefix,
          false,
          includeStats,
          includeImports,
        );
      }
    } else {
      const lineInfo =
        includeStats && node.lines !== undefined ? ` (${node.lines} lines)` : '';
      lines.push(`${prefix}${connector}📄 ${node.name}${lineInfo}`);

      if (node.symbols) {
        renderSymbols(node.symbols, lines, childPrefix);
      }

      if (includeImports && node.imports && node.imports.length > 0) {
        lines.push(
          `${childPrefix}  imports: ${node.imports.map(i => `"${i}"`).join(', ')}`,
        );
      }
    }
  }
}

function renderSymbols(
  symbols: CodebaseSymbolNode[],
  lines: string[],
  prefix: string,
): void {
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const isLast = i === symbols.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    const detail = symbol.detail ? `: ${symbol.detail}` : '';
    lines.push(`${prefix}${connector}${symbol.name} [${symbol.kind}]${detail}`);

    if (symbol.children) {
      renderSymbols(symbol.children, lines, childPrefix);
    }
  }
}

// ── Import Graph Formatting ──────────────────────────────

function formatImportGraph(graph: ImportGraphResult, lines: string[]): void {
  lines.push('### 🔗 Module Graph\n');

  lines.push(
    `**${graph.stats.totalModules} modules**, ` +
    `**${graph.stats.totalEdges} edges**` +
    (graph.stats.circularCount > 0
      ? `, ⚠️ **${graph.stats.circularCount} circular dependencies**`
      : '') +
    (graph.stats.orphanCount > 0
      ? `, 📦 **${graph.stats.orphanCount} orphan modules**`
      : ''),
  );
  lines.push('');

  if (graph.circular.length > 0) {
    lines.push('**Circular Dependencies:**');
    for (const cycle of graph.circular) {
      lines.push(`  ⚠️ ${cycle.chain.join(' → ')}`);
    }
    lines.push('');
  }

  if (graph.orphans.length > 0) {
    lines.push('**Orphan Modules** (no importers):');
    for (const orphan of graph.orphans) {
      lines.push(`  📦 ${orphan}`);
    }
    lines.push('');
  }
}

// ── Helpers ──────────────────────────────────────────────

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
