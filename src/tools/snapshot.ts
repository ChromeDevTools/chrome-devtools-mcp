/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {writeFileSync} from 'node:fs';

import {fetchAXTree} from '../ax-tree.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
} from './ToolDefinition.js';

const TakeSnapshotOutputSchema = zod.object({
  success: zod.boolean(),
  savedTo: zod.string().optional(),
  snapshot: zod.string().optional(),
  elementCount: zod.number().optional(),
});

// ── Tools ──

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description: `Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

Args:
  - verbose (boolean): Include full a11y tree details. Default: false
  - filePath (string): Save to file instead of returning inline
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, savedTo?, snapshot?, elementCount? }
  Markdown format: "## Latest page snapshot" + formatted tree

Examples:
  - "Take snapshot" -> {}
  - "Verbose snapshot" -> { verbose: true }
  - "Save to file" -> { filePath: "snapshot.txt" }

Error Handling:
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars (use filePath for large pages)`,
  timeoutMs: 5000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
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
  outputSchema: TakeSnapshotOutputSchema,
  handler: async (request, response) => {
    const verbose = request.params.verbose ?? false;
    const filePath = request.params.filePath;

    const {formatted} = await fetchAXTree(verbose);

    const elementCount = (formatted.match(/uid=/g) || []).length;

    if (filePath) {
      writeFileSync(filePath, formatted, 'utf-8');

      if (request.params.response_format === ResponseFormat.JSON) {
        response.appendResponseLine(JSON.stringify({
          success: true,
          savedTo: filePath,
          elementCount,
        }, null, 2));
        return;
      }

      response.appendResponseLine(`Saved snapshot to ${filePath}.`);
    } else {
      checkCharacterLimit(formatted, 'take_snapshot', {
        filePath: 'Save large snapshots to file instead of inline',
        verbose: 'Set to false to reduce snapshot size',
      });

      if (request.params.response_format === ResponseFormat.JSON) {
        response.appendResponseLine(JSON.stringify({
          success: true,
          snapshot: formatted,
          elementCount,
        }, null, 2));
        return;
      }

      response.appendResponseLine('## Latest page snapshot');
      response.appendResponseLine(formatted);
    }
  },
});

