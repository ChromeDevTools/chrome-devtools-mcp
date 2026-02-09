/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {writeFileSync} from 'fs';

import {sendCdp} from '../browser.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, timeoutSchema} from './ToolDefinition.js';

// ── CDP Accessibility Types ──

interface AXValue {
  type: string;
  value?: string | number | boolean;
}

interface AXProperty {
  name: string;
  value: AXValue;
}

interface AXNode {
  nodeId: string;
  ignored?: boolean;
  role?: AXValue;
  name?: AXValue;
  description?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

// ── Formatting ──

const BOOLEAN_PROPERTY_MAP: Record<string, string> = {
  disabled: 'disableable',
  expanded: 'expandable',
  focused: 'focusable',
  selected: 'selectable',
};

/**
/**
 * Roles that are purely structural or presentational — skipped in non-verbose
 * mode with their children promoted to the parent depth.
 */
const UNINTERESTING_ROLES = new Set([
  'generic',
  'none',
  'InlineTextBox',
  'StaticText',
  'LineBreak',
  'paragraph',
  'group',
]);

/**
 * In non-verbose mode a node is "interesting" if it has a semantic role
 * (not structural noise) OR carries a meaningful name on a named container.
 */
function isInteresting(node: AXNode): boolean {
  if (node.ignored) return false;
  const role = String(node.role?.value ?? '');
  if (UNINTERESTING_ROLES.has(role)) return false;
  return true;
}

/**
 * Format a flat CDP AX node array into an indented uid-based text tree.
 *
 * verbose=true  → every node, including structural/ignored ones (full detail)
 * verbose=false → only semantically interesting nodes (human-readable)
 */
function formatAXTree(nodes: AXNode[], verbose: boolean): string {
  const nodeMap = new Map<string, AXNode>();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const roots = nodes.filter(n => !n.parentId);

  let uidCounter = 0;

  function formatNode(node: AXNode, depth: number): string {
    const include = verbose || isInteresting(node);

    let result = '';
    if (include) {
      const uid = `s0_${uidCounter++}`;
      const parts: string[] = [`uid=${uid}`];

      const role = node.role?.value;
      if (role) {
        parts.push(role === 'none' ? 'ignored' : String(role));
      }

      if (node.name?.value) {
        parts.push(`"${node.name.value}"`);
      }

      if (node.properties) {
        for (const prop of node.properties) {
          const mapped = BOOLEAN_PROPERTY_MAP[prop.name];
          if (prop.value.type === 'boolean' || prop.value.type === 'booleanOrUndefined') {
            if (prop.value.value) {
              if (mapped) parts.push(mapped);
              parts.push(prop.name);
            }
          } else if (typeof prop.value.value === 'string') {
            parts.push(`${prop.name}="${prop.value.value}"`);
          } else if (typeof prop.value.value === 'number') {
            parts.push(`${prop.name}="${prop.value.value}"`);
          }
        }
      }

      if (node.value?.value !== undefined && node.value.value !== '') {
        parts.push(`value="${node.value.value}"`);
      }

      const indent = ' '.repeat(depth * 2);
      result += `${indent}${parts.join(' ')}\n`;
    }

    // Recurse into children — promote children if parent was skipped
    const childDepth = include ? depth + 1 : depth;
    if (node.childIds) {
      for (const childId of node.childIds) {
        const child = nodeMap.get(childId);
        if (child) {
          result += formatNode(child, childDepth);
        }
      }
    }

    return result;
  }

  let output = '';
  for (const root of roots) {
    output += formatNode(root, 0);
  }
  return output || '(empty accessibility tree)';
}

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

    // Enable Accessibility domain then fetch the full AX tree via CDP
    await sendCdp('Accessibility.enable');
    const result = await sendCdp('Accessibility.getFullAXTree');
    const nodes: AXNode[] = result.nodes ?? [];

    const formatted = formatAXTree(nodes, verbose);

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
      await sendCdp('Accessibility.enable');
      const result = await sendCdp('Accessibility.getFullAXTree');
      const nodes: AXNode[] = result.nodes ?? [];

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

        const formatted = formatAXTree(nodes, false);
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
