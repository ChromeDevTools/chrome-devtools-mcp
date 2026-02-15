/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseGetExports,
  type CodebaseExportInfo,
  type CodebaseExportsResult,
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

export const exports = defineTool({
  name: 'codebase_exports',
  description: `Get detailed exports from a module, file, or directory.

Shows the public API of a TypeScript/JavaScript module including function signatures,
class hierarchies, interface definitions, type aliases, enums, and constants — all with
optional type information and JSDoc documentation.

For non-TS/JS files, falls back to VS Code's document symbol provider to list top-level
declarations.

Use this to understand what a module provides without reading the entire file. This is
the recommended way to discover a module's API before using codebase_trace_symbol to
explore specific symbols in detail.

**Examples:**
- Single file: \`{ path: "src/tools/ToolDefinition.ts" }\`
- Directory: \`{ path: "src/tools" }\`
- Only functions: \`{ path: "src/client-pipe.ts", kind: "functions" }\`
- Without types: \`{ path: "src/main.ts", includeTypes: false }\`
- Absolute path: \`{ path: "C:/project/src/index.ts" }\``,
  timeoutMs: 30_000,
  annotations: {
    title: 'Codebase Exports',
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
      .describe(
        'Path to the file or directory to analyze. ' +
        'Can be relative to rootDir/workspace root, or absolute.',
      ),
    rootDir: zod
      .string()
      .optional()
      .describe('Absolute path to the project root. Defaults to the workspace root.'),
    includeTypes: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include type signatures for each export.'),
    includeJSDoc: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include JSDoc descriptions for each export.'),
    kind: zod
      .enum(['all', 'functions', 'classes', 'interfaces', 'types', 'constants', 'enums'])
      .optional()
      .default('all')
      .describe('Filter exports by kind.'),
  },
  handler: async (request, response) => {
    await ensureClientConnection();

    const result = await codebaseGetExports(
      request.params.path,
      request.params.rootDir,
      request.params.includeTypes,
      request.params.includeJSDoc,
      request.params.kind,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      const json = JSON.stringify(result, null, 2);
      checkCharacterLimit(json, 'codebase_exports', {
        kind: 'Filter to specific export kind (e.g., "functions")',
        includeTypes: 'Set to false to reduce output size',
        includeJSDoc: 'Set to false to reduce output size',
      });
      response.appendResponseLine(json);
      return;
    }

    // Markdown format
    const lines: string[] = [];
    lines.push(`## Exports: ${result.module}\n`);
    lines.push(`**${result.summary}**\n`);

    if (result.exports.length === 0) {
      lines.push('*No exports found.*');
    } else {
      renderExportTable(result.exports, lines, request.params.includeTypes);
    }

    if (result.reExports.length > 0) {
      lines.push('');
      lines.push('### Re-exports\n');
      for (const re of result.reExports) {
        lines.push(`- \`${re.name}\` from \`${re.from}\``);
      }
    }

    const markdown = lines.join('\n');
    checkCharacterLimit(markdown, 'codebase_exports', {
      kind: 'Filter to specific export kind (e.g., "functions")',
      includeTypes: 'Set to false to reduce output size',
      includeJSDoc: 'Set to false to reduce output size',
    });
    response.appendResponseLine(markdown);
  },
});

// ── Rendering ────────────────────────────────────────────

function renderExportTable(
  exportInfos: CodebaseExportInfo[],
  lines: string[],
  includeTypes: boolean,
): void {
  // Group by kind for readability
  const grouped = new Map<string, CodebaseExportInfo[]>();
  for (const exp of exportInfos) {
    const kindGroup = grouped.get(exp.kind) ?? [];
    kindGroup.push(exp);
    grouped.set(exp.kind, kindGroup);
  }

  // Render order preference
  const kindOrder = [
    'function', 'class', 'interface', 'type', 'enum', 'constant', 'variable', 'namespace', 'unknown',
  ];

  for (const kind of kindOrder) {
    const group = grouped.get(kind);
    if (!group || group.length === 0) continue;

    const icon = KIND_ICONS[kind] ?? '?';
    lines.push(`### ${icon} ${capitalize(kind)}${group.length > 1 ? 's' : ''}\n`);

    for (const exp of group) {
      renderExport(exp, lines, includeTypes);
    }
  }
}

function renderExport(
  exp: CodebaseExportInfo,
  lines: string[],
  includeTypes: boolean,
): void {
  const badges: string[] = [];
  if (exp.isDefault) badges.push('`default`');
  if (exp.isReExport) badges.push(`\`re-export from ${exp.reExportSource}\``);

  const badgeStr = badges.length > 0 ? ' ' + badges.join(' ') : '';

  if (includeTypes && exp.signature) {
    lines.push(`- **\`${exp.name}\`**${badgeStr} — \`${exp.signature}\` *(line ${exp.line})*`);
  } else {
    lines.push(`- **\`${exp.name}\`**${badgeStr} *(line ${exp.line})*`);
  }

  if (exp.jsdoc) {
    lines.push(`  > ${exp.jsdoc}`);
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
