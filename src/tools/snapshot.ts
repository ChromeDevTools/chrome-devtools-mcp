/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {writeFileSync} from 'fs';

import {fetchAXTree} from '../ax-tree.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, timeoutSchema} from './ToolDefinition.js';

// ── Tools ──

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).`,
  timeoutMs: 5000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    verbose: zod
      .boolean()
      .optional()
      .describe(
        'Whether to include all possible information available in the full a11y tree. Default is false.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.',
      ),
  },
  handler: async (request, response) => {
    const verbose = request.params.verbose ?? false;
    const filePath = request.params.filePath;

    const {formatted} = await fetchAXTree(verbose);

    if (filePath) {
      writeFileSync(filePath, formatted, 'utf-8');
      response.appendResponseLine(`Saved snapshot to ${filePath}.`);
    } else {
      response.appendResponseLine('## Latest page snapshot');
      response.appendResponseLine(formatted);
    }
  },
});

export const waitFor = defineTool({
  name: 'wait_for',
  description: `Wait for the specified text to appear on the selected page.`,
  timeoutMs: 60000,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {
    text: zod.string().describe('Text to appear on the page'),
    ...timeoutSchema,
  },
  handler: async (request, response) => {
    const text = request.params.text;
    const timeout = request.params.timeout ?? 30000;
    const pollInterval = 500;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const {formatted, nodes} = await fetchAXTree(false);

      const found = nodes.some(
        n =>
          (typeof n.name?.value === 'string' && n.name.value.includes(text)) ||
          (typeof n.value?.value === 'string' &&
            String(n.value.value).includes(text)),
      );

      if (found) {
        response.appendResponseLine(
          `Element with text "${text}" found.`,
        );
        response.appendResponseLine('## Latest page snapshot');
        response.appendResponseLine(formatted);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Timed out waiting for text "${text}" after ${timeout}ms`,
    );
  },
});
