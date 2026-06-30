/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import {ensureExtension} from '../utils/files.js';

import {ToolCategory} from './categories.js';
import {definePageTool, defineTool} from './ToolDefinition.js';

export const takeHeapSnapshot = definePageTool({
  name: 'take_heapsnapshot',
  description: `Capture a heap snapshot of the currently selected page. Use to analyze the memory distribution of JavaScript objects and debug memory leaks.`,
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: false,
  },
  schema: {
    filePath: zod
      .string()
      .describe('A path to a .heapsnapshot file to save the heapsnapshot to.'),
  },
  blockedByDialog: true,
  verifyFilesSchema: ['filePath'],
  handler: async (request, response) => {
    const page = request.page;

    await page.pptrPage.captureHeapSnapshot({
      path: ensureExtension(request.params.filePath, '.heapsnapshot'),
    });

    response.appendResponseLine(
      `Heap snapshot saved to ${request.params.filePath}`,
    );
  },
});

export const getHeapSnapshotSummary = defineTool({
  name: 'get_heapsnapshot_summary',
  description:
    'Loads a memory heapsnapshot and returns snapshot summary stats.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  handler: async (request, response, context) => {
    const stats = await context.getHeapSnapshotStats(request.params.filePath);
    const staticData = await context.getHeapSnapshotStaticData(
      request.params.filePath,
    );

    response.setHeapSnapshotStats(stats, staticData);
  },
});

export const getHeapSnapshotDetails = defineTool({
  name: 'get_heapsnapshot_details',
  description:
    'Loads a memory heapsnapshot and returns all available information including statistics, static data, and aggregated node information. Supports pagination for aggregates.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    pageIdx: zod
      .number()
      .optional()
      .describe('The page index for pagination of aggregates.'),
    pageSize: zod
      .number()
      .optional()
      .describe('The page size for pagination of aggregates.'),
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  handler: async (request, response, context) => {
    const aggregates = await context.getHeapSnapshotAggregates(
      request.params.filePath,
    );

    response.setHeapSnapshotAggregates(aggregates, {
      pageIdx: request.params.pageIdx,
      pageSize: request.params.pageSize,
    });
  },
});

export const getHeapSnapshotClassNodes = defineTool({
  name: 'get_heapsnapshot_class_nodes',
  description:
    'Loads a memory heapsnapshot and returns instances of a specific class with their IDs.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    id: zod.number().describe('The ID for the class, obtained from details.'),
    pageIdx: zod.number().optional().describe('The page index for pagination.'),
    pageSize: zod.number().optional().describe('The page size for pagination.'),
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  handler: async (request, response, context) => {
    const nodes = await context.getHeapSnapshotNodesById(
      request.params.filePath,
      request.params.id,
    );

    response.setHeapSnapshotNodes(nodes, {
      pageIdx: request.params.pageIdx,
      pageSize: request.params.pageSize,
    });
  },
});

export const getHeapSnapshotRetainers = defineTool({
  name: 'get_heapsnapshot_retainers',
  description:
    'Loads a memory heapsnapshot and returns retainers for a specific node ID.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    nodeId: zod.number().describe('The node ID to get retainers for.'),
    pageIdx: zod.number().optional().describe('The page index for pagination.'),
    pageSize: zod.number().optional().describe('The page size for pagination.'),
  },
  handler: async (request, response, context) => {
    const retainers = await context.getHeapSnapshotRetainers(
      request.params.filePath,
      request.params.nodeId,
    );

    response.setHeapSnapshotNodes(retainers, {
      pageIdx: request.params.pageIdx,
      pageSize: request.params.pageSize,
    });
  },
});

export const closeHeapSnapshot = defineTool({
  name: 'close_heapsnapshot',
  description:
    'Closes a previously loaded memory heapsnapshot, freeing its memory.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: false,
    conditions: ['memoryDebugging'],
  },
  verifyFilesSchema: ['filePath'],
  schema: {
    filePath: zod
      .string()
      .describe('A path to the .heapsnapshot file to close.'),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const closed = await context.closeHeapSnapshot(request.params.filePath);
    if (!closed) {
      throw new Error(
        `Failed to close heap snapshot: ${request.params.filePath} was not loaded.`,
      );
    }
    response.appendResponseLine(
      `Closed heap snapshot: ${request.params.filePath}`,
    );
  },
});

export const getHeapSnapshotRetainingPaths = defineTool({
  name: 'get_heapsnapshot_retaining_paths',
  description:
    'Loads a memory heapsnapshot and returns retaining paths for a specific node ID. This helps to understand why a node is not being garbage collected.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  verifyFilesSchema: ['filePath'],
  blockedByDialog: false,
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    nodeId: zod.number().describe('The node ID to get retaining paths for.'),
    maxDepth: zod
      .number()
      .optional()
      .describe('The maximum depth to search for retaining paths.'),
    maxNodes: zod
      .number()
      .optional()
      .describe('The maximum number of nodes to return.'),
    maxSiblings: zod
      .number()
      .optional()
      .describe('The maximum number of siblings to return.'),
  },
  handler: async (request, response, context) => {
    const retainingPaths = await context.getHeapSnapshotRetainingPaths(
      request.params.filePath,
      request.params.nodeId,
      request.params.maxDepth,
      request.params.maxNodes,
      request.params.maxSiblings,
    );

    response.setHeapSnapshotRetainingPaths(retainingPaths);
  },
});

export const getHeapSnapshotEdges = defineTool({
  name: 'get_heapsnapshot_edges',
  description:
    'Loads a memory heapsnapshot and returns outgoing edges (references) for a specific node ID.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    nodeId: zod.number().describe('The node ID to get outgoing edges for.'),
    pageIdx: zod.number().optional().describe('The page index for pagination.'),
    pageSize: zod.number().optional().describe('The page size for pagination.'),
  },
  handler: async (request, response, context) => {
    const edges = await context.getHeapSnapshotEdges(
      request.params.filePath,
      request.params.nodeId,
    );

    response.setHeapSnapshotNodes(edges, {
      pageIdx: request.params.pageIdx,
      pageSize: request.params.pageSize,
    });
  },
});

export const getHeapSnapshotDominators = defineTool({
  name: 'get_heapsnapshot_dominators',
  description:
    'Loads a memory heapsnapshot and returns the dominator chain for a specific node ID. This helps to identify which objects are keeping the target node alive.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    nodeId: zod
      .number()
      .describe('The node ID to get the dominator chain for.'),
  },
  handler: async (request, response, context) => {
    const dominators = await context.getHeapSnapshotDominators(
      request.params.filePath,
      request.params.nodeId,
    );

    response.setHeapSnapshotDominators(dominators);
  },
});

export const compareHeapSnapshotsSummary = defineTool({
  name: 'compare_heapsnapshots_summary',
  description:
    'Loads two memory heapsnapshots and returns the summary diff between them (classes with changes).',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  verifyFilesSchema: ['baseFilePath', 'currentFilePath'],
  schema: {
    baseFilePath: zod
      .string()
      .describe('A path to the base .heapsnapshot file (earlier snapshot).'),
    currentFilePath: zod
      .string()
      .describe('A path to the current .heapsnapshot file (later snapshot).'),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const diff = await context.getHeapSnapshotClassDiffs(
      request.params.baseFilePath,
      request.params.currentFilePath,
    );

    response.setHeapSnapshotClassDiffs(diff);
  },
});

export const compareHeapSnapshotsClassNodes = defineTool({
  name: 'compare_heapsnapshots_class_nodes',
  description:
    'Loads two memory heapsnapshots and returns the diff details (added/deleted instances) for a specific class.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['memoryDebugging'],
  },
  verifyFilesSchema: ['baseFilePath', 'currentFilePath'],
  schema: {
    baseFilePath: zod
      .string()
      .describe('A path to the base .heapsnapshot file (earlier snapshot).'),
    currentFilePath: zod
      .string()
      .describe('A path to the current .heapsnapshot file (later snapshot).'),
    classIndex: zod
      .number()
      .describe(
        '0-based index of the class in the summary list to filter results, showing individual objects.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const classDiffResult = await context.getHeapSnapshotDetailedClassDiff(
      request.params.baseFilePath,
      request.params.currentFilePath,
      request.params.classIndex,
    );
    response.setHeapSnapshotDetailedClassDiff(classDiffResult);
  },
});
