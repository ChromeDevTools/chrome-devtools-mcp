/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import {ensureExtension} from '../utils/files.js';

import {ToolCategory} from './categories.js';
import {definePageTool, defineTool} from './ToolDefinition.js';

export const takeMemorySnapshot = definePageTool({
  name: 'take_memory_snapshot',
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
  handler: async (request, response, _context) => {
    const page = request.page;

    await page.pptrPage.captureHeapSnapshot({
      path: ensureExtension(request.params.filePath, '.heapsnapshot'),
    });

    response.appendResponseLine(
      `Heap snapshot saved to ${request.params.filePath}`,
    );
  },
});

export const exploreMemorySnapshot = defineTool({
  name: 'load_memory_snapshot',
  description:
    'Loads a memory heapsnapshot and returns snapshot summary stats.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['experimentalMemory'],
  },
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
  },
  handler: async (request, response, context) => {
    const stats = await context.getHeapSnapshotStats(request.params.filePath);
    const staticData = await context.getHeapSnapshotStaticData(
      request.params.filePath,
    );

    response.setHeapSnapshotStats(stats, staticData);
  },
});

export const getMemorySnapshotDetails = defineTool({
  name: 'get_memory_snapshot_details',
  description:
    'Loads a memory heapsnapshot and returns all available information including statistics, static data, and aggregated node information. Supports pagination for aggregates.',
  annotations: {
    category: ToolCategory.MEMORY,
    readOnlyHint: true,
    conditions: ['experimentalMemory'],
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
