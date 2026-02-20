// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.

// Re-export all types
export type {
  OverviewParams,
  OverviewResult,
  TreeNode,
  SymbolNode,
  ExportsParams,
  ExportInfo,
  ExportsResult,
  TraceSymbolParams,
  TraceSymbolResult,
  SymbolLocationInfo,
  ReferenceInfo,
  ReExportInfo,
  CallChainNode,
  CallChainInfo,
  TypeFlowInfo,
  ImpactDependentInfo,
  ImpactInfo,
  TypeHierarchyNode,
  TypeHierarchyInfo,
  DeadCodeParams,
  DeadCodeResult,
  DeadCodeItem,
  ImportGraphParams,
  ImportGraphResult,
  ImportGraphModule,
  CircularChain,
  DuplicateDetectionParams,
  DuplicateDetectionResult,
  DuplicateGroup,
  DuplicateInstance,
  FileSymbol,
  FileSymbolRange,
  FileStructure,
  FileStructureStats,
  OrphanedCategory,
  OrphanedItem,
  OrphanedContent,
} from './types';

export { TS_PARSEABLE_EXTS } from './types';

// Re-export ignore rules
export { parseIgnoreRules, applyIgnoreRules } from './ignore-rules';

// Re-export file utilities
export { discoverFiles, readFileText, getPathType } from './file-utils';

// Re-export ts-morph project helpers
export { getTsProject, getWorkspaceProject } from './ts-project';

// Re-export custom parsers
export { getCustomParser } from './parsers';

// Re-export language service registry
export { LanguageServiceRegistry } from './language-service-registry';
export type { LanguageService } from './language-service-registry';

// Re-export language services
export { TypeScriptLanguageService } from './language-services';
export { MarkdownLanguageService } from './language-services';

// Re-export markdown parser
export { parseMarkdown, extractMarkdownStructure } from './markdown';

// Re-export chunker
export { chunkFile, chunkSymbols } from './chunker';

// Re-export service functions
export { getOverview } from './overview-service';
export { getExports } from './exports-service';
export { traceSymbol, findDeadCode } from './trace-symbol-service';
export { getImportGraph } from './import-graph-service';
export { findDuplicates } from './duplicate-detection-service';
export { extractOrphanedContent } from './orphaned-content';
export type { OrphanedContentResult } from './orphaned-content';
