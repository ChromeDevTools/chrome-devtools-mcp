/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {writeFileSync} from 'fs';

import {fetchAXTree} from '../ax-tree.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

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

