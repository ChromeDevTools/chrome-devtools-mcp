/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clickAtCoords,
  clickElement,
  dragElement,
  fetchAXTree,
  fillElement,
  hoverElement,
  pressKey,
} from '../ax-tree.js';
import {sendCdp} from '../browser.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const dblClickSchema = zod
  .boolean()
  .optional()
  .describe('Set to true for double clicks. Default is false.');

const includeSnapshotSchema = zod
  .boolean()
  .optional()
  .describe('Whether to include a snapshot in the response. Default is false.');

async function maybeSnapshot(
  includeSnapshot: boolean | undefined,
  response: {appendResponseLine(v: string): void},
): Promise<void> {
  if (includeSnapshot) {
    const {formatted} = await fetchAXTree(false);
    response.appendResponseLine('## Latest page snapshot');
    response.appendResponseLine(formatted);
  }
}

export const click = defineTool({
  name: 'click',
  description: `Clicks on the provided element`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    dblClick: dblClickSchema,
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    const {uid, dblClick} = request.params;
    await clickElement(uid, dblClick ? 2 : 1);
    response.appendResponseLine(
      dblClick
        ? 'Successfully double clicked on the element'
        : 'Successfully clicked on the element',
    );
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const clickAt = defineTool({
  name: 'click_at',
  description: `Clicks at the specified coordinates on the page`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    x: zod.number().describe('The x coordinate to click at'),
    y: zod.number().describe('The y coordinate to click at'),
    dblClick: dblClickSchema,
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    const {x, y, dblClick} = request.params;
    await clickAtCoords(x, y, dblClick ? 2 : 1);
    response.appendResponseLine(
      dblClick
        ? 'Successfully double clicked at the coordinates'
        : 'Successfully clicked at the coordinates',
    );
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const hover = defineTool({
  name: 'hover',
  description: `Hover over the provided element`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    await hoverElement(request.params.uid);
    response.appendResponseLine('Successfully hovered over the element');
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const fill = defineTool({
  name: 'fill',
  description: `Type text into a input, text area or select an option from a <select> element.`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    value: zod.string().describe('The value to fill in'),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    await fillElement(request.params.uid, request.params.value);
    response.appendResponseLine('Successfully filled out the element');
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const drag = defineTool({
  name: 'drag',
  description: `Drag an element onto another element`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    from_uid: zod.string().describe('The uid of the element to drag'),
    to_uid: zod.string().describe('The uid of the element to drop into'),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    await dragElement(request.params.from_uid, request.params.to_uid);
    response.appendResponseLine('Successfully dragged an element');
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const fillForm = defineTool({
  name: 'fill_form',
  description: `Fill out multiple form elements at once`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    elements: zod
      .array(
        zod.object({
          uid: zod.string().describe('The uid of the element to fill out'),
          value: zod.string().describe('Value for the element'),
        }),
      )
      .describe('Elements from snapshot to fill out.'),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    for (const element of request.params.elements) {
      await fillElement(element.uid, element.value);
    }
    response.appendResponseLine('Successfully filled out the form');
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const uploadFile = defineTool({
  name: 'upload_file',
  description: 'Upload a file through a provided element.',
  timeoutMs: 30000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of the file input element or an element that will open file chooser on the page from the page content snapshot',
      ),
    filePath: zod.string().describe('The local path of the file to upload'),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    const {uid, filePath} = request.params;
    // Use DOM.setFileInputFiles for file input elements
    const backendNodeId = (await import('../ax-tree.js')).getBackendNodeId(uid);
    await sendCdp('DOM.enable');
    await sendCdp('DOM.setFileInputFiles', {
      files: [filePath],
      backendNodeId,
    });
    response.appendResponseLine(`File uploaded from ${filePath}.`);
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});

export const pressKeyTool = defineTool({
  name: 'press_key',
  description: `Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    key: zod
      .string()
      .describe(
        'A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    await pressKey(request.params.key);
    response.appendResponseLine(
      `Successfully pressed key: ${request.params.key}`,
    );
    await maybeSnapshot(request.params.includeSnapshot, response);
  },
});
