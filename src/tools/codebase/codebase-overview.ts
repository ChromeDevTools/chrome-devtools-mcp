/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseGetOverview,
  type CodebaseTreeNode,
  type CodebaseSymbolNode,
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

// ── Tool Definition ──────────────────────────────────────

export const overview = defineTool({
  name: 'codebase_overview',
  description: `Get a structural overview of the codebase as a file tree with optional symbol nesting.

Shows the project's directory structure with progressively deeper detail controlled by the
\`depth\` parameter:
- \`depth: 0\` — File tree only (directories and filenames)
- \`depth: 1\` — Top-level symbols per file (functions, classes, interfaces, enums, constants)
- \`depth: 2\` — Members inside containers (class methods, interface fields, enum members)
- \`depth: 3+\` — Deeper nesting (parameters, inner types, nested definitions)

Use this as the FIRST tool call when exploring an unfamiliar codebase. It provides the
structural orientation needed to know what exists and where before using more targeted
tools like codebase_trace_symbol or codebase_exports.

**Examples:**
- Full project map with top-level symbols: \`{}\`
- Focus on a subdirectory: \`{ filter: "src/tools/**" }\`
- Deep dive into class internals: \`{ filter: "src/tools/**", depth: 3 }\`
- Quick file listing: \`{ depth: 0 }\`
- With imports and line counts: \`{ includeImports: true, includeStats: true }\``,
  timeoutMs: 60_000,
  annotations: {
    title: 'Codebase Overview',
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
      .describe('Absolute path to the project root. Defaults to the workspace root.'),
    depth: zod
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .default(1)
      .describe(
        'Symbol nesting depth per file. 0=files only, 1=top-level symbols, ' +
        '2=class members, 3+=deeper nesting.',
      ),
    filter: zod
      .string()
      .optional()
      .describe('Glob pattern to include only matching files (e.g., "src/tools/**").'),
    includeImports: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include import module specifiers per file.'),
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

    const result = await codebaseGetOverview(
      request.params.rootDir,
      request.params.depth,
      request.params.filter,
      request.params.includeImports,
      request.params.includeStats,
      request.params.includePatterns,
      request.params.excludePatterns,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      const json = JSON.stringify(result, null, 2);
      checkCharacterLimit(json, 'codebase_overview', {
        filter: 'Glob pattern to narrow scope (e.g., "src/tools/**")',
        depth: 'Lower number = less detail (0 for file tree only)',
      });
      response.appendResponseLine(json);
      return;
    }

    // Markdown tree format
    const lines: string[] = [];
    lines.push(`## Codebase Overview: ${result.projectRoot}\n`);
    renderTree(
      result.tree,
      lines,
      '',
      true,
      request.params.includeStats,
      request.params.includeImports,
    );

    lines.push('');
    lines.push('---');
    lines.push(
      `**Summary:** ${result.summary.totalFiles} files, ` +
      `${result.summary.totalDirectories} directories, ` +
      `${result.summary.totalSymbols} symbols`,
    );

    if (result.summary.diagnosticCounts) {
      const {errors, warnings} = result.summary.diagnosticCounts;
      lines.push(`**Diagnostics:** ${errors} errors, ${warnings} warnings`);
    }

    // Add reminder about .devtoolsignore
    if (result.summary.totalFiles === 0) {
      lines.push('');
      lines.push('> **Note:** No files found. If this is unexpected, check if a `.devtoolsignore` file');
      lines.push('> in the workspace root may be excluding files you intended to include.');
    }

    const markdown = lines.join('\n');
    checkCharacterLimit(markdown, 'codebase_overview', {
      filter: 'Glob pattern to narrow scope (e.g., "src/tools/**")',
      depth: 'Lower number = less detail (0 for file tree only)',
    });
    response.appendResponseLine(markdown);
  },
});

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
