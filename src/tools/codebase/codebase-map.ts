/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  codebaseGetOverview,
  codebaseGetImportGraph,
  type CodebaseTreeNode,
  type CodebaseSymbolNode,
  type ImportGraphResult,
} from '../../client-pipe.js';
import {getHostWorkspace} from '../../config.js';
import {zod} from '../../third_party/index.js';
import {ToolCategory} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {buildIgnoreContextJson} from './ignore-context.js';

// ── Constants ────────────────────────────────────────────

const OUTPUT_TOKEN_LIMIT = 3_000;
const CHARS_PER_TOKEN = 4;
const INDENT = '  ';

type FileTypeCategory = 'typescript' | 'css' | 'html' | 'json' | 'yaml' | 'markdown' | 'xml' | 'unknown';

interface FileTypeSymbolConfig {
  typescript?: string[];
  css?: string[];
  html?: string[];
  json?: string[];
  yaml?: string[];
  markdown?: string[];
  xml?: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ── File Type Detection ──────────────────────────────────

const EXTENSION_TO_CATEGORY: Record<string, FileTypeCategory> = {
  ts: 'typescript', tsx: 'typescript', js: 'typescript', jsx: 'typescript', mjs: 'typescript', cjs: 'typescript',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xhtml: 'html',
  json: 'json', jsonc: 'json', json5: 'json', jsonl: 'json', webmanifest: 'json', geojson: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'yaml',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  xml: 'xml', svg: 'xml', xaml: 'xml', plist: 'xml', csproj: 'xml', vbproj: 'xml', fsproj: 'xml',
  xsl: 'xml', xslt: 'xml', xsd: 'xml', props: 'xml', targets: 'xml', resx: 'xml', config: 'xml',
};

function getFileCategory(fileName: string): FileTypeCategory {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) return 'unknown';
  const ext = fileName.slice(lastDot + 1).toLowerCase();
  return EXTENSION_TO_CATEGORY[ext] ?? 'unknown';
}

// ── Per-File-Type Symbol Kind Mapping ────────────────────

const TS_KIND_MAP: Record<string, Set<string>> = {
  functions: new Set(['function']),
  classes: new Set(['class']),
  interfaces: new Set(['interface']),
  types: new Set(['type']),
  constants: new Set(['constant', 'variable']),
  enums: new Set(['enum']),
  methods: new Set(['method']),
  properties: new Set(['property']),
  '*': new Set(['function', 'class', 'interface', 'type', 'constant', 'variable', 'enum', 'method', 'property']),
};

const CSS_KIND_MAP: Record<string, Set<string>> = {
  selectors: new Set(['selector']),
  'at-rules': new Set(['at-rule']),
  'custom-properties': new Set(['custom-property']),
  '*': new Set(['selector', 'at-rule', 'custom-property']),
};

const HTML_KIND_MAP: Record<string, Set<string>> = {
  'semantic-tags': new Set(['landmark', 'element']),
  headings: new Set(['heading']),
  forms: new Set(['form']),
  tables: new Set(['table']),
  media: new Set(['media']),
  scripts: new Set(['resource']),
  '*': new Set(['heading', 'landmark', 'form', 'table', 'resource', 'metadata', 'interactive', 'media', 'element']),
};

const JSON_KIND_MAP: Record<string, Set<string>> = {
  keys: new Set(['string', 'number', 'boolean', 'null', 'object']),
  arrays: new Set(['array']),
  '*': new Set(['string', 'number', 'boolean', 'null', 'array', 'object']),
};

const MD_KIND_MAP: Record<string, Set<string>> = {
  headings: new Set(['heading']),
  'code-blocks': new Set(['code']),
  tables: new Set(['table']),
  frontmatter: new Set(['frontmatter']),
  '*': new Set(['heading', 'code', 'table', 'frontmatter', 'key', 'column']),
};

const XML_KIND_MAP: Record<string, Set<string>> = {
  elements: new Set(['element', 'empty-element']),
  '*': new Set(['element', 'empty-element']),
};

const CATEGORY_KIND_MAPS: Record<FileTypeCategory, Record<string, Set<string>>> = {
  typescript: TS_KIND_MAP,
  css: CSS_KIND_MAP,
  html: HTML_KIND_MAP,
  json: JSON_KIND_MAP,
  yaml: JSON_KIND_MAP,
  markdown: MD_KIND_MAP,
  xml: XML_KIND_MAP,
  unknown: TS_KIND_MAP,
};

function shouldShowSymbol(symbolKind: string, category: FileTypeCategory, allowedKinds: string[]): boolean {
  const kindMap = CATEGORY_KIND_MAPS[category];
  for (const allowed of allowedKinds) {
    const validKinds = kindMap[allowed];
    if (validKinds?.has(symbolKind)) return true;
  }
  return false;
}

function getSymbolFiltersForFile(fileName: string, config: FileTypeSymbolConfig): string[] | undefined {
  const category = getFileCategory(fileName);
  const filters = config[category === 'unknown' ? 'typescript' : category];
  return filters;
}

// ── Path Helpers ─────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

// ── Markdown Tree Formatter ──────────────────────────────

interface FormatOptions {
  showFolders: boolean;
  showFiles: boolean;
  symbolConfig: FileTypeSymbolConfig;
  includeStats: boolean;
  hasAnySymbols: boolean;
}

function formatSymbol(symbol: CodebaseSymbolNode, depth: number): string {
  const indent = INDENT.repeat(depth);
  return `${indent}${symbol.kind} ${symbol.name}\n`;
}

function formatSymbols(
  symbols: CodebaseSymbolNode[],
  opts: FormatOptions,
  depth: number,
  fileName: string,
): string {
  if (!opts.hasAnySymbols) return '';

  const allowedKinds = getSymbolFiltersForFile(fileName, opts.symbolConfig);
  if (!allowedKinds) return '';

  const category = getFileCategory(fileName);

  let output = '';
  for (const sym of symbols) {
    const matches = shouldShowSymbol(sym.kind, category, allowedKinds);
    if (matches) {
      output += formatSymbol(sym, depth);
    }
    if (sym.children && sym.children.length > 0) {
      output += formatSymbolChildren(sym.children, opts, matches ? depth + 1 : depth, category, allowedKinds);
    }
  }
  return output;
}

function formatSymbolChildren(
  symbols: CodebaseSymbolNode[],
  opts: FormatOptions,
  depth: number,
  category: FileTypeCategory,
  allowedKinds: string[],
): string {
  let output = '';
  for (const sym of symbols) {
    const matches = shouldShowSymbol(sym.kind, category, allowedKinds);
    if (matches) {
      output += formatSymbol(sym, depth);
    }
    if (sym.children && sym.children.length > 0) {
      output += formatSymbolChildren(sym.children, opts, matches ? depth + 1 : depth, category, allowedKinds);
    }
  }
  return output;
}

function formatTree(
  nodes: CodebaseTreeNode[],
  opts: FormatOptions,
  depth: number = 0,
  stats?: Map<string, {files: number; lines: number}>,
): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      if (opts.showFolders) {
        let line = `${indent}${node.name}/`;
        if (opts.includeStats && stats) {
          const s = stats.get(node.name);
          if (s) line += `  (${s.files} files, ${s.lines} lines)`;
        }
        output += line + '\n';
      }
      if (node.children) {
        output += formatTree(node.children, opts, opts.showFolders ? depth + 1 : depth, stats);
      }
    } else if (node.type === 'file') {
      if (opts.showFiles) {
        output += `${indent}${node.name}\n`;
        if (node.symbols) {
          output += formatSymbols(node.symbols, opts, depth + 1, node.name);
        }
      }
    }
  }
  return output;
}

function formatFlatPaths(nodes: CodebaseTreeNode[], prefix = ''): string {
  let output = '';
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      output += path + '\n';
    } else if (node.children) {
      output += formatFlatPaths(node.children, path);
    }
  }
  return output;
}

function formatFolderSummary(nodes: CodebaseTreeNode[], depth = 0): string {
  let output = '';
  const indent = INDENT.repeat(depth);

  for (const node of nodes) {
    if (node.type === 'directory') {
      const fileCount = countFiles(node);
      output += `${indent}${node.name}/ (${fileCount} files)\n`;
      if (node.children) {
        output += formatFolderSummary(node.children, depth + 1);
      }
    }
  }
  return output;
}

function countFiles(node: CodebaseTreeNode): number {
  if (node.type === 'file') return 1;
  let count = 0;
  if (node.children) {
    for (const child of node.children) {
      count += countFiles(child);
    }
  }
  return count;
}

// ── Tool Definition ──────────────────────────────────────

export const map = defineTool({
  name: 'codebase_map',
  description: 'Get a structural map of the codebase at any granularity — folders, files, or symbols.\n\n' +
    'Returns a tree with folders ending in `/`, files with extensions, and symbols as `kind name`.\n\n' +
    '**Control what appears:**\n' +
    '- `scope` — What parts of the codebase to analyze (include/exclude globs)\n' +
    '- `show` — What entities to show (folders, files, and per-file-type symbols)\n\n' +
    '**Symbol arrays by file type:**\n' +
    '- `show.typescript`: functions, classes, interfaces, types, enums, constants, methods, properties\n' +
    '- `show.css`: selectors, at-rules, custom-properties\n' +
    '- `show.html`: semantic-tags, headings, forms, tables, media, scripts\n' +
    '- `show.json`: keys, arrays\n' +
    '- `show.yaml`: keys, arrays\n' +
    '- `show.markdown`: headings, code-blocks, tables, frontmatter\n' +
    '- `show.xml`: elements\n\n' +
    '**EXAMPLES:**\n' +
    '- Full project: `{}`\n' +
    '- TS classes: `{ show: { typescript: ["classes"] } }`\n' +
    '- CSS selectors: `{ scope: { include: "**/*.css" }, show: { css: ["selectors"] } }`\n' +
    '- Folders only: `{ show: { folders: true, files: false } }`\n' +
    '- Mixed: `{ show: { typescript: ["classes"], css: ["selectors"], html: ["*"] } }`',
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
    // ═══════════════════════════════════════════════════════
    // SCOPING — What parts of the codebase to analyze
    // ═══════════════════════════════════════════════════════
    scope: zod.object({
      include: zod.union([zod.string(), zod.array(zod.string())])
        .describe('Glob pattern(s) to include. Examples: "src", "**/*.ts", ["src", "lib"]'),
      exclude: zod.array(zod.string()).optional()
        .describe('Glob patterns to exclude. Examples: ["**/*.test.ts", "node_modules"]'),
    }).optional()
      .describe('Scope of the map. Defaults to entire workspace.'),

    // ═══════════════════════════════════════════════════════
    // VISIBILITY — What entities to show in the output
    // ═══════════════════════════════════════════════════════
    show: zod.object({
      folders: zod.boolean().optional()
        .describe('Include folder structure. If false, returns flat file paths.'),
      files: zod.boolean().optional()
        .describe('Include files in output'),
      typescript: zod.array(
        zod.enum(['functions', 'classes', 'interfaces', 'types', 'constants', 'enums', 'methods', 'properties', '*'])
      ).optional()
        .describe('TS/JS symbol kinds. Omit = no TS symbols.'),
      css: zod.array(
        zod.enum(['selectors', 'at-rules', 'custom-properties', '*'])
      ).optional()
        .describe('CSS symbol kinds. Omit = no CSS symbols.'),
      html: zod.array(
        zod.enum(['semantic-tags', 'headings', 'forms', 'tables', 'media', 'scripts', '*'])
      ).optional()
        .describe('HTML symbol kinds. Omit = no HTML symbols.'),
      json: zod.array(
        zod.enum(['keys', 'arrays', '*'])
      ).optional()
        .describe('JSON symbol kinds. Omit = no JSON symbols.'),
      yaml: zod.array(
        zod.enum(['keys', 'arrays', '*'])
      ).optional()
        .describe('YAML/TOML symbol kinds. Omit = no YAML symbols.'),
      markdown: zod.array(
        zod.enum(['headings', 'code-blocks', 'tables', 'frontmatter', '*'])
      ).optional()
        .describe('Markdown symbol kinds. Omit = no MD symbols.'),
      xml: zod.array(
        zod.enum(['elements', '*'])
      ).optional()
        .describe('XML symbol kinds. Omit = no XML symbols.'),
    }).optional()
      .describe('Control what entities appear. Use file type keys to enable symbols for that type.'),

    // ═══════════════════════════════════════════════════════
    // EXTRAS
    // ═══════════════════════════════════════════════════════
    includeImports: zod.boolean().optional()
      .describe('Include import specifiers per file'),
    includeGraph: zod.boolean().optional()
      .describe('Include module dependency graph with circular detection'),
    includeStats: zod.boolean().optional()
      .describe('Include line counts per folder'),
  },
  handler: async (request, response) => {
    const {params} = request;
    response.setSkipLedger();

    // ── Parse Parameters ─────────────────────────────────
    const scopeInclude = params.scope?.include ?? '**';
    const scopeExclude = params.scope?.exclude;
    const showFolders = params.show?.folders ?? true;
    const showFiles = params.show?.files ?? true;
    const includeStats = params.includeStats ?? false;

    // Build per-file-type symbol config
    const symbolConfig: FileTypeSymbolConfig = {};
    if (params.show?.typescript) symbolConfig.typescript = params.show.typescript;
    if (params.show?.css) symbolConfig.css = params.show.css;
    if (params.show?.html) symbolConfig.html = params.show.html;
    if (params.show?.json) symbolConfig.json = params.show.json;
    if (params.show?.yaml) symbolConfig.yaml = params.show.yaml;
    if (params.show?.markdown) symbolConfig.markdown = params.show.markdown;
    if (params.show?.xml) symbolConfig.xml = params.show.xml;

    const hasAnySymbols = Object.keys(symbolConfig).length > 0;

    // Convert scope.include to patterns - ensure directories become globs
    const rawPatterns = Array.isArray(scopeInclude) ? scopeInclude : [scopeInclude];
    const includePatterns = rawPatterns.map(p => {
      // If it looks like a directory (no glob chars, no file extension), add /**
      const isGlob = p.includes('*') || p.includes('{') || p.includes('?');
      const hasExtension = /\.\w+$/.test(p);
      if (!isGlob && !hasExtension) {
        return `${p.replace(/\/+$/, '')}/**`;
      }
      return p;
    });

    // Depth 0 = skip symbol extraction; otherwise fetch full symbol tree
    const effectiveDepth = hasAnySymbols ? 10 : 0;

    // ── Fetch Data ───────────────────────────────────────
    const overviewResult = await codebaseGetOverview(
      getHostWorkspace(),
      effectiveDepth,
      undefined,
      params.includeImports ?? false,
      includeStats,
      includePatterns,
      scopeExclude,
    );

    if (overviewResult.summary.totalFiles === 0) {
      const ignoredBy = buildIgnoreContextJson(overviewResult.projectRoot);
      response.appendResponseLine('# Empty Result\n');
      response.appendResponseLine('No files found. Check scope patterns or .devtoolsignore.\n');
      if (ignoredBy) {
        response.appendResponseLine(`Ignored by: ${JSON.stringify(ignoredBy)}`);
      }
      return;
    }

    // ── Format Options ───────────────────────────────────
    const formatOpts: FormatOptions = {
      showFolders,
      showFiles,
      symbolConfig,
      includeStats,
      hasAnySymbols,
    };

    // ── Build Markdown Output ────────────────────────────
    let output = formatTree(overviewResult.tree, formatOpts, 0);
    let reductionsApplied: string[] = [];

    // ── Adaptive Compression ─────────────────────────────
    // Level 1: Remove symbols
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && formatOpts.hasAnySymbols) {
      formatOpts.hasAnySymbols = false;
      reductionsApplied.push('remove-symbols');
      output = formatTree(overviewResult.tree, formatOpts, 0);
    }

    // Level 2: Folders only
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && formatOpts.showFiles) {
      formatOpts.showFiles = false;
      reductionsApplied.push('folders-only');
      output = formatTree(overviewResult.tree, formatOpts, 0);
    }

    // Level 3: Flat paths
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT && formatOpts.showFolders) {
      reductionsApplied.push('flat-paths');
      output = formatFlatPaths(overviewResult.tree);
    }

    // Level 4: Folder summary
    if (estimateTokens(output) > OUTPUT_TOKEN_LIMIT) {
      reductionsApplied.push('folder-summary');
      output = formatFolderSummary(overviewResult.tree);
    }

    // ── Include Import Graph ─────────────────────────────
    let graphOutput = '';
    if (params.includeGraph && estimateTokens(output) < OUTPUT_TOKEN_LIMIT * 0.5) {
      try {
        const graphResult = await codebaseGetImportGraph(
          getHostWorkspace(),
          includePatterns,
          scopeExclude,
        );
        if (graphResult) {
          graphOutput = '\nImport Graph:\n' + JSON.stringify(graphResult, null, 2);
        }
      } catch {
        // Graph not available
      }
    }

    // ── Output ───────────────────────────────────────────
    response.appendResponseLine(`Root: ${normalizePath(overviewResult.projectRoot)}\n`);

    if (reductionsApplied.length > 0) {
      response.appendResponseLine(`Compression: ${reductionsApplied.join(' → ')}\n`);
    }

    response.appendResponseLine(output.trimEnd());

    if (graphOutput) {
      response.appendResponseLine(graphOutput);
    }
  },
});
