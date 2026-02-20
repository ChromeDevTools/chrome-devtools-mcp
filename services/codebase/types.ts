// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure data types — no VS Code API dependency.

// ── Overview Types ───────────────────────────────────────

export interface OverviewParams {
  /** Workspace root directory (used for .devtoolsignore resolution). */
  rootDir: string;
  /** Folder to map. Absolute or relative to rootDir. */
  dir: string;
  /** When true, recurse into subdirectories. When false, show immediate children only. */
  recursive: boolean;
  /** When true, include symbol skeleton (name + kind, hierarchically nested). */
  symbols: boolean;
  /** When true, populate lineCount on file nodes and enable metadata display. */
  metadata?: boolean;
  /** Tool scope for per-tool .devtoolsignore sections (e.g. 'codebase_map'). */
  toolScope?: string;
}

export interface TreeNode {
  name: string;
  type: 'directory' | 'file';
  children?: TreeNode[];
  symbols?: SymbolNode[];
  lineCount?: number;
  ignored?: boolean;
}

export interface SymbolNode {
  name: string;
  kind: string;
  detail?: string;
  range: { start: number; end: number };
  children?: SymbolNode[];
}

export interface OverviewResult {
  projectRoot: string;
  tree: TreeNode[];
  summary: {
    totalFiles: number;
    totalDirectories: number;
    totalSymbols: number;
    diagnosticCounts?: { errors: number; warnings: number };
  };
}

// ── Exports Types ────────────────────────────────────────

export interface ExportsParams {
  path: string;
  rootDir: string;
  includeTypes?: boolean;
  includeJSDoc?: boolean;
  kind?: string;
  /** Glob patterns to include (whitelist). If specified, only matching files are considered. */
  includePatterns?: string[];
  /** Glob patterns to exclude (blacklist). Applied after include patterns to further narrow results. */
  excludePatterns?: string[];
}

export interface ExportInfo {
  name: string;
  kind: string;
  signature?: string;
  jsdoc?: string;
  line: number;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
}

export interface ExportsResult {
  module: string;
  exports: ExportInfo[];
  reExports: Array<{ name: string; from: string }>;
  summary: string;
}

// ── Trace Symbol Types ───────────────────────────────────

export interface TraceSymbolParams {
  symbol: string;
  rootDir: string;
  file?: string;
  line?: number;
  column?: number;
  depth?: number;
  include?: string[];
  includeImpact?: boolean;
  /** Max references to return (default: 500). Prevents runaway scans on large codebases. */
  maxReferences?: number;
  /** Timeout in milliseconds (default: 30000). Returns partial results if exceeded. */
  timeout?: number;
  /** Force invalidate project cache before tracing. Use after adding new files. */
  forceRefresh?: boolean;
  /** Glob patterns to include (whitelist). If specified, only matching files are considered. */
  includePatterns?: string[];
  /** Glob patterns to exclude (blacklist). Added to .devtoolsignore exclusions. */
  excludePatterns?: string[];
}

export interface SymbolLocationInfo {
  file: string;
  line: number;
  column: number;
  kind?: string;
  signature?: string;
  unresolved?: boolean;
}

export interface ReferenceInfo {
  file: string;
  line: number;
  column: number;
  context: string;
  kind: 'read' | 'write' | 'call' | 'import' | 'type-ref' | 'unknown';
}

export interface ReExportInfo {
  file: string;
  line: number;
  originalName: string;
  exportedAs: string;
  from: string;
}

export interface CallChainNode {
  symbol: string;
  file: string;
  line: number;
  column: number;
}

export interface CallChainInfo {
  incomingCalls: CallChainNode[];
  outgoingCalls: CallChainNode[];
  incomingTruncated?: boolean;
  outgoingTruncated?: boolean;
}

export interface TypeFlowInfo {
  direction: 'parameter' | 'return' | 'extends' | 'implements' | 'property';
  type: string;
  traceTo?: { symbol: string; file: string; line: number };
}

export interface ImpactDependentInfo {
  symbol: string;
  file: string;
  line: number;
  kind: string;
}

export interface ImpactInfo {
  directDependents: ImpactDependentInfo[];
  transitiveDependents: ImpactDependentInfo[];
  impactSummary: {
    directFiles: number;
    transitiveFiles: number;
    totalSymbolsAffected: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export interface TypeHierarchyNode {
  name: string;
  kind: 'class' | 'interface' | 'type-alias';
  file: string;
  line: number;
  column: number;
}

export interface TypeHierarchyInfo {
  supertypes: TypeHierarchyNode[];
  subtypes: TypeHierarchyNode[];
  stats: {
    totalSupertypes: number;
    totalSubtypes: number;
    maxDepth: number;
  };
}

export interface TraceSymbolResult {
  symbol: string;
  definition?: SymbolLocationInfo;
  references: ReferenceInfo[];
  reExports: ReExportInfo[];
  callChain: CallChainInfo;
  typeFlows: TypeFlowInfo[];
  hierarchy?: TypeHierarchyInfo;
  summary: {
    totalReferences: number;
    totalFiles: number;
    maxCallDepth: number;
  };
  impact?: ImpactInfo;
  /** True if results were truncated due to timeout or maxReferences limit. */
  partial?: boolean;
  /** Reason for partial results (e.g., 'timeout', 'max-references'). */
  partialReason?: 'timeout' | 'max-references';
  /** Elapsed time in milliseconds. */
  elapsedMs?: number;
  /** Number of source files in the project (for diagnostics). */
  sourceFileCount?: number;
  /** Calculated effective timeout in milliseconds (max of user timeout and dynamic calculation). */
  effectiveTimeout?: number;
  /** Error message if an error occurred during tracing. */
  errorMessage?: string;
  /** Reason why symbol was not found (if definition is missing). */
  notFoundReason?: 'no-project' | 'no-matching-files' | 'symbol-not-found' | 'file-not-in-project' | 'parse-error';
  /** Resolved absolute path used as the project root. */
  resolvedRootDir?: string;
  /** Diagnostic messages (e.g., excessive node_modules references, pattern match warnings). */
  diagnostics?: string[];
  /** Metadata when call hierarchy depth was auto-reduced to stay within token budget. */
  _autoOptimizedCallDepth?: {
    requestedDepth: number;
    usedDepth: number;
    reason: string;
  };
}

// ── Unused Symbol Detection Types ────────────────────────

export interface DeadCodeParams {
  rootDir: string;
  /** File or glob pattern to search within (e.g., 'src/**\/*.ts') */
  pattern?: string;
  /** Only check exported symbols (default: true). When false, also detects unreachable non-exported functions and dead variables. */
  exportedOnly?: boolean;
  /** Glob patterns to include (whitelist). If specified, only matching files are considered. */
  includePatterns?: string[];
  /** Glob patterns to exclude (blacklist). Added to .devtoolsignore exclusions. */
  excludePatterns?: string[];
  /** Symbol kinds to check (default: all) */
  kinds?: string[];
  /** Max symbols to return (default: 100) */
  limit?: number;
  /** Exclude test files (files matching *.test.*, *.spec.*, __tests__/*). Default: true */
  excludeTests?: boolean;
}

export interface DeadCodeItem {
  name: string;
  kind: string;
  file: string;
  line: number;
  exported: boolean;
  /** Why this symbol is considered dead code. */
  reason: string;
  /** Detection confidence: high = zero refs, medium = likely unused, low = possibly unused. */
  confidence: 'high' | 'medium' | 'low';
}

export interface DeadCodeResult {
  deadCode: DeadCodeItem[];
  summary: {
    totalScanned: number;
    totalDead: number;
    scanDurationMs: number;
    byKind?: Record<string, number>;
  };
  /** Error message if scan failed. */
  errorMessage?: string;
  /** Resolved absolute path used as the project root. */
  resolvedRootDir?: string;
  /** Diagnostic messages (e.g., excessive node_modules references, pattern match warnings). */
  diagnostics?: string[];
}

/** File extensions that ts-morph can parse for import extraction */
export const TS_PARSEABLE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs',
]);

// ── Shared File Structure Types (Multi-Language) ─────────

/**
 * Range within a file. Lines are 1-indexed; columns are 0-indexed and optional.
 * TS/JS provides columns, but many languages (Markdown, JSON) only need lines.
 */
export interface FileSymbolRange {
  startLine: number;
  endLine: number;
  startChar?: number;
  endChar?: number;
}

/** Shared symbol interface for all file types. */
export interface FileSymbol {
  name: string;
  kind: string;
  detail?: string;
  range: FileSymbolRange;
  children: FileSymbol[];
  exported?: boolean;
  modifiers?: string[];
}

/**
 * Categories for orphaned content — items outside of any symbol's range.
 * Maps to special target keywords (#imports, #exports, #comments) in file_read.
 */
export type OrphanedCategory =
  | 'import'
  | 'export'
  | 'comment'
  | 'directive'
  | 'footnote'
  | 'linkdef';

export interface OrphanedItem {
  name: string;
  kind: string;
  detail?: string;
  range: { start: number; end: number };
  children?: OrphanedItem[];
  category: OrphanedCategory;
}

export interface OrphanedContent {
  items: OrphanedItem[];
}

export interface FileStructureStats {
  totalSymbols: number;
  totalOrphaned: number;
  totalBlankLines: number;
  coveragePercent: number;
}

/** Shared structure returned by all language service extractors. */
export interface FileStructure {
  symbols: FileSymbol[];
  content: string;
  totalLines: number;
  fileType: 'typescript' | 'markdown' | 'json' | 'unknown';
  orphaned: OrphanedContent;
  gaps: Array<{ start: number; end: number; type: 'blank' | 'unknown' }>;
  stats: FileStructureStats;
}

// ── Chunk Types (Hierarchical Chunker) ───────────────────

/**
 * A chunk produced by the hierarchical chunker.
 * Contains text content, metadata, and parent/child relationships
 * for use across file_read, file_edit, and codebase_search.
 */
export interface Chunk {
  /** Deterministic ID derived from file path + symbol breadcrumb + range */
  id: string;
  /** Relative file path (from workspace root) */
  filePath: string;
  /** The text content of this chunk */
  content: string;
  /** Human-readable symbol name (e.g., "UserService.findById") */
  symbolName: string;
  /** Symbol kind (e.g., "class", "method", "function", "heading") */
  symbolKind: string;
  /** Full path from root symbol (e.g., "UserService > findById") */
  breadcrumb: string;
  /** Hierarchy depth (0 = file-level, 1 = top-level symbol, 2 = member, etc.) */
  depth: number;
  /** 1-indexed line range in the source file */
  range: { start: number; end: number };
  /** Chunk ID of the parent (null for top-level chunks) */
  parentChunkId: string | null;
  /** Chunk IDs of direct children */
  childChunkIds: string[];
  /** Approximate token count of the content */
  tokenCount: number;
}

/**
 * Parameters for the chunking operation.
 */
export interface ChunkFileParams {
  /** Absolute file path */
  filePath: string;
  /** Workspace root for computing relative paths */
  rootDir: string;
  /** Max hierarchy depth to chunk (default: Infinity) */
  maxDepth?: number;
  /** Max tokens per chunk before splitting (default: 512) */
  tokenBudget?: number;
}

/**
 * Result of chunking a single file.
 */
export interface ChunkFileResult {
  /** All chunks from this file, flat array with parent/child pointers */
  chunks: Chunk[];
  /** The SymbolNode tree that was used for chunking */
  symbols: SymbolNode[];
  /** Chunking statistics */
  stats: {
    totalChunks: number;
    maxDepth: number;
    oversizedSplits: number;
  };
}

// ── Import Graph Types ───────────────────────────────────

export interface ImportGraphParams {
  rootDir: string;
  /** Glob patterns to include (whitelist) */
  includePatterns?: string[];
  /** Glob patterns to exclude (blacklist) */
  excludePatterns?: string[];
}

export interface ImportGraphModule {
  /** Relative path of the module */
  path: string;
  /** Modules this file imports (relative paths) */
  imports: string[];
  /** Modules that import this file (relative paths) */
  importedBy: string[];
}

export interface CircularChain {
  /** Sequence of module paths forming the cycle, ending with a repeat of the first */
  chain: string[];
}

export interface ImportGraphResult {
  /** Map of module path → import/importedBy */
  modules: Record<string, ImportGraphModule>;
  /** Detected circular dependency chains */
  circular: CircularChain[];
  /** Modules with no importers (potential entry points or orphans) */
  orphans: string[];
  stats: {
    totalModules: number;
    totalEdges: number;
    circularCount: number;
    orphanCount: number;
  };
}

// ── Duplicate Detection Types ────────────────────────────

export interface DuplicateDetectionParams {
  rootDir: string;
  /** Minimum similarity threshold (0-1). Default: 0.9 */
  threshold?: number;
  /** Kinds to check for duplicates */
  kinds?: string[];
  /** Glob patterns to include */
  includePatterns?: string[];
  /** Glob patterns to exclude */
  excludePatterns?: string[];
  /** Max results. Default: 50 */
  limit?: number;
}

export interface DuplicateGroup {
  /** Structural hash of the duplicate */
  hash: string;
  /** Kind of the duplicated symbol (function, class, etc.) */
  kind: string;
  /** Number of lines in each instance */
  lineCount: number;
  /** The duplicate instances */
  instances: DuplicateInstance[];
}

export interface DuplicateInstance {
  /** File path */
  file: string;
  /** Symbol name */
  name: string;
  /** Start line */
  line: number;
  /** End line */
  endLine: number;
}

export interface DuplicateDetectionResult {
  /** Groups of duplicated code */
  groups: DuplicateGroup[];
  summary: {
    totalGroups: number;
    totalDuplicateInstances: number;
    filesWithDuplicates: number;
    scanDurationMs: number;
  };
  resolvedRootDir?: string;
  diagnostics?: string[];
  errorMessage?: string;
}
