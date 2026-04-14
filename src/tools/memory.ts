/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod, DevTools} from '../third_party/index.js';
import {ensureExtension} from '../utils/files.js';

import {ToolCategory} from './categories.js';
import {definePageTool, defineTool} from './ToolDefinition.js';

export const takeMemorySnapshot = definePageTool({
  name: 'take_memory_snapshot',
  description: `Capture a heap snapshot of the currently selected page. Use to analyze the memory distribution of JavaScript objects and debug memory leaks.`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
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
  name: 'explored_memory_snapshot',
  description: 'Explose ',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod.string().describe('A path to a .heapsnapshot file to read.'),
    pageSize: zod.number().optional().describe('Page size for pagination.'),
    pageIdx: zod.number().optional().describe('Page index for pagination.'),
  },
  handler: async (request, response, context) => {
    const snapshot = await context.getHeapSnapshotProxy(
      request.params.filePath,
    );
    const stats = await snapshot.getStatistics();

    response.appendResponseLine(
      `Statistics: ${JSON.stringify(stats, null, 2)}`,
    );
    response.appendResponseLine(
      `Static Data: ${JSON.stringify(snapshot.staticData, null, 2)}`,
    );

    const filter =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
    const aggregates = await snapshot.aggregatesWithFilter(filter);

    const {pageSize, pageIdx} = request.params;
    response.setHeapSnapshot(aggregates, {pageSize, pageIdx});
  },
});
