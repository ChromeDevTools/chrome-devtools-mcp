/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Development diagnostic tool: execute arbitrary JavaScript in the VS Code
 * workbench renderer via CDP Runtime.evaluate.
 *
 * Hidden in production — kept for development and troubleshooting.
 * Gives direct access to the Electron renderer context (DOM, window, document).
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {sendCdp} from '../browser.js';

export const debugEvaluate = defineTool({
  name: 'debug_evaluate',
  description: `[DEV] Execute arbitrary JavaScript in the VS Code workbench renderer context via CDP Runtime.evaluate.
Returns the result as JSON. Use for inspecting DOM state, console output, window properties,
or any renderer-side diagnostics. The expression runs in the Electron renderer process context
(document, window, etc.).

Examples:
- \`document.title\` — get window title
- \`document.querySelector('.monaco-workbench')?.className\` — check workbench state
- \`JSON.stringify(performance.getEntriesByType('navigation'))\` — navigation timing
- \`Array.from(document.querySelectorAll('.notification-toast')).map(n => n.textContent)\` — list notifications`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['devDiagnostic'],
  },
  schema: {
    expression: zod
      .string()
      .describe(
        'JavaScript expression to evaluate in the VS Code renderer context. ' +
          'Must be a valid expression (not a statement). For multi-line logic, ' +
          'wrap in an IIFE: `(() => { ... })()`.',
      ),
    returnByValue: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to return the result by value (serialized). Default true.',
      ),
  },
  handler: async (request, response) => {
    const {expression, returnByValue} = request.params;

    const result = await sendCdp('Runtime.evaluate', {
      expression,
      returnByValue: returnByValue ?? true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      const errText =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Unknown evaluation error';
      response.appendResponseLine('**Evaluation error:**');
      response.appendResponseLine('```');
      response.appendResponseLine(errText);
      response.appendResponseLine('```');
      return;
    }

    const value = result.result?.value;
    response.appendResponseLine('**Result:**');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    );
    response.appendResponseLine('```');
  },
});
