/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const takeMemorySnapshot = defineTool({
  name: 'take_memory_snapshot',
  description: `Capture a memory heapsnapshot of the currently selected page to memory leak debugging`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod
      .string()
      .describe('A path to a .heapsnapshot file to save the heapsnapshot to.')
      .endsWith('.heapsnapshot'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    await page.captureHeapSnapshot({
      path: request.params.filePath,
    });

    response.appendResponseLine(
      `Heap snapshot saved to ${request.params.filePath}`,
    );
  },
});
