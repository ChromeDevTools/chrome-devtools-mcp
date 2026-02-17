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
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {
  defineTool,
} from '../ToolDefinition.js';
import {buildIgnoreContextJson} from './ignore-context.js';

// ── Progressive Detail Reduction ─────────────────────────

const OUTPUT_TOKEN_LIMIT = 3_000;
const CHARS_PER_TOKEN = 4;

function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / CHARS_PER_TOKEN);
}

// ── Tree Flattening ──────────────────────────────────────

interface CompactFileEntry {
  path: string;
  symbols?: CodebaseSymbolNode[];
  imports?: string[];
  lines?: number;
}

/**
 * Flatten deeply nested CodebaseTreeNode[] into a compact
 * list of file entries with relative paths, stripping
 * intermediate directory nesting.
 */
function flattenTree(nodes: CodebaseTreeNode[], prefix = ''): CompactFileEntry[] {
  const entries: CompactFileEntry[] = [];
  for (const node of nodes) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      const entry: CompactFileEntry = {path: currentPath};
      if (node.symbols && node.symbols.length > 0) entry.symbols = node.symbols;
      if (node.imports && node.imports.length > 0) entry.imports = node.imports;
      if (node.lines !== undefined) entry.lines = node.lines;
      entries.push(entry);
    } else if (node.children) {
      entries.push(...flattenTree(node.children, currentPath));
    }
  }
  return entries;
}

/**
 * Make file paths relative to projectRoot (case-insensitive prefix strip for Windows).
 */
function makePathsRelative(files: CompactFileEntry[], projectRoot: string): void {
  const rootPrefix = normalizePath(projectRoot).toLowerCase();
  for (const file of files) {
    file.path = normalizePath(file.path);
    const lower = file.path.toLowerCase();
    if (lower.startsWith(rootPrefix + '/')) {
      file.path = file.path.slice(rootPrefix.length + 1);
    }
  }
}

/**
 * Collapse a flat file list into { directory: fileCount } pairs.
 * Much more compact than listing every file path individually.
 */
function buildDirectorySummary(files: CompactFileEntry[]): Record<string, number> {
  const dirs: Record<string, number> = {};
  for (const file of files) {
    const lastSlash = file.path.lastIndexOf('/');
    const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash) : '.';
    dirs[dir] = (dirs[dir] ?? 0) + 1;
  }
  return dirs;
}

// ── Path Helpers ─────────────────────────────────────────

/** Normalize backslashes to forward slashes for display */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Strip temp namespace from ts-morph type signatures (e.g. `import("/__exports_123")`) */
function stripTempNamespace(sig: string): string {
  return sig.replace(/import\("\/[^"]*__exports_[^"]*"\)\./g, '');
}

/**
 * Detect whether the given path is a file (has extension), a glob (has wildcards),
 * or a directory path.
 */
function classifyPath(p: string | undefined): 'file' | 'glob' | 'directory' | 'none' {
  if (!p) return 'none';
  if (p.includes('*') || p.includes('{') || p.includes('?')) return 'glob';
  if (/\.\w+$/.test(p)) return 'file';
  return 'directory';
}

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
  timeoutMs: 120_000,
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
    path: zod
      .string()
      .optional()
      .describe(
        'File, directory, or glob to map. Defaults to entire workspace. ' +
        'If a file path, shows detailed exports. If a directory, shows file tree with symbols.',
      ),
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
    const {params} = request;
    const pathType = classifyPath(params.path);

    response.setSkipLedger();

    // ── File Mode ──────────────────────────────────────
    if (pathType === 'file') {
      let result: CodebaseExportsResult;
      try {
        result = await codebaseGetExports(
          params.path!,
          getHostWorkspace(),
          params.includeTypes,
          params.includeJSDoc,
          params.kind,
          params.includePatterns,
          params.excludePatterns,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT') || msg.includes('FileNotFound') || msg.includes('does not exist')) {
          const errorObj = {
            error: 'File not found',
            path: params.path,
            suggestions: [
              'Check the file path for typos',
              'Use codebase_map with no path to see all files',
              'Use filter param to search by pattern (e.g., "**/*pipe*")',
            ],
          };
          response.appendResponseLine(JSON.stringify(errorObj, null, 2));
          return;
        }
        throw err;
      }

      cleanExportSignatures(result);
      response.appendResponseLine(JSON.stringify(result, null, 2));
      return;
    }

    // ── Directory/Workspace Mode ───────────────────────
    const effectiveFilter = pathType === 'directory'
      ? `${params.path!.replace(/\/+$/, '')}/**`
      : (params.path ?? params.filter);

    const reductionsApplied: string[] = [];

    // Phase 1: Adaptive depth reduction (depth N → depth 0)
    // Try requested depth, reduce if flattened file list exceeds token budget
    const requestedDepth = params.depth;
    let usedDepth = requestedDepth;
    let overviewResult = await codebaseGetOverview(
      getHostWorkspace(),
      usedDepth,
      effectiveFilter,
      params.includeImports,
      params.includeStats,
      params.includePatterns,
      params.excludePatterns,
    );

    let flatFiles = flattenTree(overviewResult.tree);
    makePathsRelative(flatFiles, overviewResult.projectRoot);

    while (estimateTokens(flatFiles) > OUTPUT_TOKEN_LIMIT && usedDepth > 0) {
      usedDepth--;
      reductionsApplied.push(`depth-${usedDepth + 1}-to-${usedDepth}`);
      overviewResult = await codebaseGetOverview(
        getHostWorkspace(),
        usedDepth,
        effectiveFilter,
        params.includeImports,
        params.includeStats,
        params.includePatterns,
        params.excludePatterns,
      );
      flatFiles = flattenTree(overviewResult.tree);
      makePathsRelative(flatFiles, overviewResult.projectRoot);
    }

    // Apply kind filter before further compression
    if (params.kind !== 'all') {
      for (const file of flatFiles) {
        if (file.symbols) {
          file.symbols = filterSymbolsByKind(file.symbols, params.kind);
          if (file.symbols.length === 0) delete file.symbols;
        }
      }
    }

    // Phase 2: Format compression (objects → strings → directory summary)
    // Level A: at depth 0, switch from objects to flat path strings
    const hasSymbols = flatFiles.some(f => f.symbols && f.symbols.length > 0);
    let filesOutput: unknown;
    if (hasSymbols) {
      filesOutput = flatFiles;
    } else {
      filesOutput = flatFiles.map(f => f.path);
      if (usedDepth < requestedDepth) reductionsApplied.push('flat-paths');
    }

    // Level B: if file paths still too large, collapse to directory summary
    if (estimateTokens(filesOutput) > OUTPUT_TOKEN_LIMIT) {
      const dirSummary = buildDirectorySummary(flatFiles);
      filesOutput = dirSummary;
      reductionsApplied.push('directory-summary');
    }

    // Import graph (if requested and not already compressed)
    let graphResult: ImportGraphResult | undefined;
    if (params.includeGraph && estimateTokens(filesOutput) < OUTPUT_TOKEN_LIMIT * 0.5) {
      try {
        graphResult = await codebaseGetImportGraph(getHostWorkspace(), params.includePatterns, params.excludePatterns);
      } catch {
        // Import graph not yet available — silently skip
      }
    }

    // Build final result
    const compactResult: Record<string, unknown> = {
      projectRoot: normalizePath(overviewResult.projectRoot),
      files: filesOutput,
      summary: overviewResult.summary,
    };

    if (graphResult) compactResult.graph = graphResult;

    if (overviewResult.summary.totalFiles === 0) {
      compactResult.ignoredBy = buildIgnoreContextJson(overviewResult.projectRoot);
    }

    if (reductionsApplied.length > 0) {
      compactResult.outputScaling = {
        requestedDepth,
        effectiveDepth: usedDepth,
        reductionsApplied,
        estimatedTokens: estimateTokens(compactResult),
        tokenLimit: OUTPUT_TOKEN_LIMIT,
        suggestions: [
          `Use filter or path to narrow scope for depth ${requestedDepth}`,
          'Use kind param to reduce symbol count',
          'Use includePatterns to select specific files',
        ],
      };
    }

    response.appendResponseLine(JSON.stringify(compactResult, null, 2));
  },
});

// ── Exports Helpers ──────────────────────────────────────

/** Strip temp namespace from all export signatures in-place */
function cleanExportSignatures(result: CodebaseExportsResult): void {
  for (const exp of result.exports) {
    if (exp.signature) {
      exp.signature = stripTempNamespace(exp.signature);
    }
  }
}

// ── Tree Filtering ───────────────────────────────────────

function filterSymbolsByKind(
  symbols: CodebaseSymbolNode[],
  kindFilter: string,
): CodebaseSymbolNode[] {
  const targetKinds = resolveKindFilter(kindFilter);
  return symbols.filter(s => targetKinds.has(s.kind));
}

function resolveKindFilter(kind: string): Set<string> {
  switch (kind) {
    case 'functions': return new Set(['function']);
    case 'classes': return new Set(['class']);
    case 'interfaces': return new Set(['interface']);
    case 'types': return new Set(['type']);
    case 'constants': return new Set(['constant', 'variable']);
    case 'enums': return new Set(['enum']);
    default: return new Set();
  }
}
