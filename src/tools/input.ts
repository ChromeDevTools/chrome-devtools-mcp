/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clickElement,
  dragElement,
  executeWithDiff,
  fetchAXTree,
  fillElement,
  hoverElement,
  pressKey,
  scrollElement,
} from '../ax-tree.js';
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

/**
 * Execute an action and show either the diff or full snapshot.
 * Always shows diff by default; if includeSnapshot is true, shows full snapshot instead.
 */
async function executeWithChanges<T>(
  action: () => Promise<T>,
  includeSnapshot: boolean | undefined,
  response: {appendResponseLine(v: string): void},
): Promise<T> {
  if (includeSnapshot) {
    // User explicitly wants full snapshot — skip diff, just execute and show snapshot
    const result = await action();
    const {formatted} = await fetchAXTree(false);
    response.appendResponseLine('## Latest page snapshot');
    response.appendResponseLine(formatted);
    return result;
  }

  // Default: show diff
  const {result, summary} = await executeWithDiff(action, 1500);
  response.appendResponseLine('## Changes detected');
  response.appendResponseLine(summary);
  return result;
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
    const {uid, dblClick, includeSnapshot} = request.params;
    await executeWithChanges(
      async () => clickElement(uid, dblClick ? 2 : 1),
      includeSnapshot,
      response,
    );
    response.appendResponseLine(
      dblClick
        ? 'Double clicked on the element'
        : 'Clicked on the element',
    );
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
    const {uid, includeSnapshot} = request.params;
    await executeWithChanges(
      async () => hoverElement(uid),
      includeSnapshot,
      response,
    );
    response.appendResponseLine('Hovered over the element');
  },
});

export const type = defineTool({
  name: 'type',
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
    const {uid, value, includeSnapshot} = request.params;
    await executeWithChanges(
      async () => fillElement(uid, value),
      includeSnapshot,
      response,
    );
    response.appendResponseLine('Filled out the element');
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
    const {from_uid, to_uid, includeSnapshot} = request.params;
    await executeWithChanges(
      async () => dragElement(from_uid, to_uid),
      includeSnapshot,
      response,
    );
    response.appendResponseLine('Dragged the element');
  },
});

export const hotkeyTool = defineTool({
  name: 'hotkey',
  description: `Press a key or key combination. Use this when other input methods like type() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).`,
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
    const {key, includeSnapshot} = request.params;
    await executeWithChanges(
      async () => pressKey(key),
      includeSnapshot,
      response,
    );
    response.appendResponseLine(`Pressed key: ${key}`);
  },
});

export const scroll = defineTool({
  name: 'scroll',
  description: `Scroll an element into view, or scroll within a scrollable element in a given direction. If no direction is provided, the element is simply scrolled into the viewport.`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    direction: zod
      .enum(['up', 'down', 'left', 'right'])
      .optional()
      .describe(
        'Direction to scroll within the element. If omitted, the element is scrolled into view without additional scrolling.',
      ),
    amount: zod
      .number()
      .optional()
      .describe(
        'Scroll distance in pixels. Default is 300.',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  handler: async (request, response) => {
    const {uid, direction, amount, includeSnapshot} = request.params;
    await executeWithChanges(
      async () => scrollElement(uid, direction, amount),
      includeSnapshot,
      response,
    );
    if (direction) {
      response.appendResponseLine(`Scrolled ${direction} by ${amount ?? 300}px within the element`);
    } else {
      response.appendResponseLine('Scrolled element into view');
    }
  },
});
