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
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

const dblClickSchema = zod
  .boolean()
  .optional()
  .describe('Set to true for double clicks. Default is false.');

const includeSnapshotSchema = zod
  .boolean()
  .optional()
  .describe('Whether to include a snapshot in the response. Default is false.');

const InputActionOutputSchema = zod.object({
  action: zod.string(),
  success: zod.boolean(),
  changes: zod.string().optional(),
});

/**
 * Execute an action and show either the diff or full snapshot.
 * Always shows diff by default; if includeSnapshot is true, shows full snapshot instead.
 */
async function executeWithChanges<T>(
  action: () => Promise<T>,
  includeSnapshot: boolean | undefined,
  response: {appendResponseLine(v: string): void},
  responseFormat?: string,
): Promise<{result: T; changes?: string}> {
  if (includeSnapshot) {
    const result = await action();
    const {formatted} = await fetchAXTree(false);
    if (responseFormat !== ResponseFormat.JSON) {
      response.appendResponseLine('## Latest page snapshot');
      response.appendResponseLine(formatted);
    }
    return {result, changes: formatted};
  }

  const {result, summary} = await executeWithDiff(action, 1500);
  if (responseFormat !== ResponseFormat.JSON) {
    response.appendResponseLine('## Changes detected');
    response.appendResponseLine(summary);
  }
  return {result, changes: summary};
}

export const click = defineTool({
  name: 'mouse_click',
  description: `Clicks on the provided element.

Args:
  - uid (string): Element uid from page snapshot
  - dblClick (boolean): Double click. Default: false
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'click', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation

Examples:
  - "Click button" -> { uid: "abc123" }
  - "Double click" -> { uid: "abc123", dblClick: true }`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    dblClick: dblClickSchema,
    includeSnapshot: includeSnapshotSchema,
  },
  outputSchema: InputActionOutputSchema,
  handler: async (request, response) => {
    const {uid, dblClick, includeSnapshot} = request.params;
    const {changes} = await executeWithChanges(
      async () => clickElement(uid, dblClick ? 2 : 1),
      includeSnapshot,
      response,
      request.params.response_format,
    );

    const actionText = dblClick ? 'Double clicked on the element' : 'Clicked on the element';

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: dblClick ? 'double_click' : 'click',
        success: true,
        ...(changes ? { changes } : {}),
      }, null, 2));
      return;
    }

    response.appendResponseLine(actionText);
  },
});

export const hover = defineTool({
  name: 'mouse_hover',
  description: `Hover over the provided element.

Args:
  - uid (string): Element uid from page snapshot
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'hover', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  outputSchema: InputActionOutputSchema,
  handler: async (request, response) => {
    const {uid, includeSnapshot} = request.params;
    const {changes} = await executeWithChanges(
      async () => hoverElement(uid),
      includeSnapshot,
      response,
      request.params.response_format,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: 'hover',
        success: true,
        ...(changes ? { changes } : {}),
      }, null, 2));
      return;
    }

    response.appendResponseLine('Hovered over the element');
  },
});

export const keyboardType = defineTool({
  name: 'keyboard_type',
  description: `Type text into a input, text area or select an option from a <select> element.

Args:
  - uid (string): Element uid from page snapshot
  - value (string): Text to type or option to select
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'type', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    value: zod.string().describe('The value to fill in'),
    includeSnapshot: includeSnapshotSchema,
  },
  outputSchema: InputActionOutputSchema,
  handler: async (request, response) => {
    const {uid, value, includeSnapshot} = request.params;
    const {changes} = await executeWithChanges(
      async () => fillElement(uid, value),
      includeSnapshot,
      response,
      request.params.response_format,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: 'type',
        success: true,
        ...(changes ? { changes } : {}),
      }, null, 2));
      return;
    }

    response.appendResponseLine('Filled out the element');
  },
});

export const drag = defineTool({
  name: 'mouse_drag',
  description: `Drag an element onto another element.

Args:
  - from_uid (string): Element uid to drag
  - to_uid (string): Element uid to drop onto
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'drag', success: true, changes?: string }
  Markdown format: Changes detected + action confirmation`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    from_uid: zod.string().describe('The uid of the element to drag'),
    to_uid: zod.string().describe('The uid of the element to drop into'),
    includeSnapshot: includeSnapshotSchema,
  },
  outputSchema: InputActionOutputSchema,
  handler: async (request, response) => {
    const {from_uid, to_uid, includeSnapshot} = request.params;
    const {changes} = await executeWithChanges(
      async () => dragElement(from_uid, to_uid),
      includeSnapshot,
      response,
      request.params.response_format,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: 'drag',
        success: true,
        ...(changes ? { changes } : {}),
      }, null, 2));
      return;
    }

    response.appendResponseLine('Dragged the element');
  },
});

export const keyboardHotkey = defineTool({
  name: 'keyboard_hotkey',
  description: `Press a key or key combination. Use this when other input methods like keyboard_type() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

Args:
  - key (string): Key or combination (e.g., "Enter", "Control+A", "Control+Shift+R")
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'hotkey', key: string, success: true, changes?: string }
  Markdown format: Changes detected + key pressed confirmation

Examples:
  - "Press Enter" -> { key: "Enter" }
  - "Select all" -> { key: "Control+A" }
  - "Hard refresh" -> { key: "Control+Shift+R" }`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    key: zod
      .string()
      .describe(
        'A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  outputSchema: zod.object({
    action: zod.string(),
    key: zod.string(),
    success: zod.boolean(),
    changes: zod.string().optional(),
  }),
  handler: async (request, response) => {
    const {key, includeSnapshot} = request.params;
    const {changes} = await executeWithChanges(
      async () => pressKey(key),
      includeSnapshot,
      response,
      request.params.response_format,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: 'hotkey',
        key,
        success: true,
        ...(changes ? { changes } : {}),
      }, null, 2));
      return;
    }

    response.appendResponseLine(`Pressed key: ${key}`);
  },
});

export const scroll = defineTool({
  name: 'mouse_scroll',
  description: `Scroll an element into view, or scroll within a scrollable element in a given direction. If no direction is provided, the element is simply scrolled into the viewport.

Args:
  - uid (string): Element uid from page snapshot
  - direction ('up'|'down'|'left'|'right'): Scroll direction. Optional
  - amount (number): Scroll distance in pixels. Default: 300
  - includeSnapshot (boolean): Include full snapshot. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { action: 'scroll', direction?, amount?, success: true, changes?: string }
  Markdown format: Changes detected + scroll confirmation

Examples:
  - "Scroll element into view" -> { uid: "abc123" }
  - "Scroll down 500px" -> { uid: "abc123", direction: "down", amount: 500 }`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
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
  outputSchema: zod.object({
    action: zod.string(),
    direction: zod.string().optional(),
    amount: zod.number().optional(),
    success: zod.boolean(),
    changes: zod.string().optional(),
  }),
  handler: async (request, response) => {
    const {uid, direction, amount, includeSnapshot} = request.params;
    const {changes} = await executeWithChanges(
      async () => scrollElement(uid, direction, amount),
      includeSnapshot,
      response,
      request.params.response_format,
    );

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify({
        action: 'scroll',
        ...(direction ? { direction } : {}),
        ...(amount ? { amount } : {}),
        success: true,
        ...(changes ? { changes } : {}),
      }, null, 2));
      return;
    }

    if (direction) {
      response.appendResponseLine(`Scrolled ${direction} by ${amount ?? 300}px within the element`);
    } else {
      response.appendResponseLine('Scrolled element into view');
    }
  },
});
