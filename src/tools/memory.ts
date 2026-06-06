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
