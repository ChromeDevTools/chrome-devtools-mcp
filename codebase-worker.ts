// Codebase Worker Thread
// Runs all codebase analysis operations in a dedicated worker thread.
// Holds ts-morph Project instances in memory permanently for instant reuse.

import * as path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { getOverview } from './services/codebase/overview-service';
import { getExports } from './services/codebase/exports-service';
import { traceSymbol, findDeadCode } from './services/codebase/trace-symbol-service';
import { getImportGraph } from './services/codebase/import-graph-service';
import { findDuplicates } from './services/codebase/duplicate-detection-service';
import { chunkFile } from './services/codebase/chunker';
import { invalidateWorkspaceProject } from './services/codebase/ts-project';
import { extractOrphanedContent, type OrphanedContentResult } from './services/codebase/orphaned-content';
import { extractFileStructure } from './services/codebase/file-structure-extractor';
import type { UnifiedFileResult } from './services/codebase/file-structure-extractor';
import { LanguageServiceRegistry } from './services/codebase/language-service-registry';
import { TypeScriptLanguageService } from './services/codebase/language-services';
import { MarkdownLanguageService } from './services/codebase/language-services';
import type { OverviewParams, OverviewResult, FileStructure } from './services/codebase/types';
import type { ExportsParams, ExportsResult } from './services/codebase/types';
import type { TraceSymbolParams, TraceSymbolResult } from './services/codebase/types';
import type { DeadCodeParams, DeadCodeResult } from './services/codebase/types';
import type { ImportGraphParams, ImportGraphResult } from './services/codebase/types';
import type { DuplicateDetectionParams, DuplicateDetectionResult } from './services/codebase/types';
import type { ChunkFileParams, ChunkFileResult } from './services/codebase/types';

// ── Language Service Registry ────────────────────────────

const registry = new LanguageServiceRegistry();
registry.register(new TypeScriptLanguageService());
registry.register(new MarkdownLanguageService());

// ── Message Protocol ─────────────────────────────────────

interface WorkerRequest {
  id: number;
  operation: string;
  params: unknown;
}

interface WorkerResponse {
  type: 'response';
  id: number;
  result?: unknown;
  error?: string;
  stack?: string;
}

// ── Operation Registry ───────────────────────────────────

type OperationHandler = (params: never) => unknown | Promise<unknown>;

const operations: Record<string, OperationHandler> = {
  getOverview: (params: OverviewParams) => getOverview(params),
  getExports: (params: ExportsParams) => getExports(params),
  traceSymbol: (params: TraceSymbolParams) => traceSymbol(params),
  findDeadCode: (params: DeadCodeParams) => findDeadCode(params),
  getImportGraph: (params: ImportGraphParams) => getImportGraph(params),
  findDuplicates: (params: DuplicateDetectionParams) => findDuplicates(params),
  chunkFile: (params: ChunkFileParams) => chunkFile(params),
  invalidateProject: (params: { rootDir?: string }) => {
    invalidateWorkspaceProject(params.rootDir);
    return { ok: true };
  },
  extractOrphanedContent: (params: { filePath: string; symbolRanges?: Array<{ start: number; end: number }> }) => {
    return extractOrphanedContent(params.filePath, params.symbolRanges);
  },
  extractFileStructure: (params: { filePath: string }) => {
    return extractFileStructure(params.filePath);
  },
  extractStructure: async (params: { filePath: string }) => {
    const ext = path.extname(params.filePath).slice(1).toLowerCase();
    const service = registry.get(ext);
    if (!service) return undefined;
    return service.extractStructure(params.filePath);
  },
};

// ── Message Handler ──────────────────────────────────────

if (!parentPort) {
  throw new Error('codebase-worker.ts must be run as a worker thread');
}

parentPort.on('message', async (msg: WorkerRequest) => {
  const { id, operation, params } = msg;
  const handler = operations[operation];

  const port = parentPort;
  if (!port) return;

  if (!handler) {
    const response: WorkerResponse = { type: 'response', id, error: `Unknown operation: ${operation}` };
    port.postMessage(response);
    return;
  }

  try {
    const result = await handler(params as never);
    const response: WorkerResponse = { type: 'response', id, result };
    port.postMessage(response);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    const response: WorkerResponse = { type: 'response', id, error: errorMessage, stack: errorStack };
    port.postMessage(response);
  }
});

// Signal that the worker is ready
parentPort.postMessage({ type: 'ready' });
