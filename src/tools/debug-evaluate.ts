/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Development diagnostic tool: execute arbitrary JavaScript in the VS Code
 * workbench renderer via CDP Runtime.evaluate, or execute VS Code API code
 * via the extension-bridge named pipe/socket.
 *
 * Hidden in production — kept for development and troubleshooting.
 *
 * Supports two targets:
 * - "renderer" (default): Runs in the Electron renderer process context
 *   (document, window, etc.) via CDP Runtime.evaluate.
 * - "devhost": Runs VS Code API code via the extension-bridge in the
 *   spawned Extension Development Host. The code runs inside
 *   `new Function('vscode', 'payload', ...)` in the extension host process.
 *   `require()` is NOT available.
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {sendCdp, getDevhostBridgePath} from '../browser.js';
import {bridgeExec} from '../bridge-client.js';

export const debugEvaluate = defineTool({
  name: 'debug_evaluate',
  description: `[DEV] Execute arbitrary JavaScript in the VS Code workbench renderer context via CDP Runtime.evaluate,
or execute VS Code API code via the extension-bridge.

Use 'renderer' target (default) for DOM/window inspection via CDP.
Use 'devhost' target for VS Code API calls via the extension-bridge.

Renderer examples:
- \`document.title\` — get window title
- \`document.querySelector('.monaco-workbench')?.className\` — check workbench state
- \`JSON.stringify(performance.getEntriesByType('navigation'))\` — navigation timing
- \`Array.from(document.querySelectorAll('.notification-toast')).map(n => n.textContent)\` — list notifications

Bridge examples (target='devhost'):
- \`return vscode.version;\` — get VS Code version
- \`return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath);\` — list workspace folders
- \`return vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({label: t.label, active: t.isActive})));\` — list editor tabs
- \`const editor = vscode.window.activeTextEditor; return editor ? { file: editor.document.fileName, line: editor.selection.active.line } : null;\` — get active editor info
- \`return vscode.extensions.all.filter(e => e.isActive).map(e => e.id);\` — list active extensions`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['devDiagnostic'],
  },
  schema: {
    expression: zod
      .string()
      .describe(
        'JavaScript expression or VS Code API code to execute. ' +
          'For renderer target: must be a valid expression (not a statement). ' +
          'For multi-line logic, wrap in an IIFE: `(() => { ... })()`. ' +
          'For host/devhost targets: must use `return` to return a value. ' +
          'Runs inside an async function body, so `await` is available. ' +
          '`vscode` and `payload` are in scope. `require()` is NOT available.',
      ),
    target: zod
      .enum(['renderer', 'devhost'])
      .optional()
      .default('renderer')
      .describe(
        'Which VS Code context to target. ' +
          '"renderer" = CDP Runtime.evaluate in the Electron renderer (DOM, window). ' +
          '"devhost" = the spawned Extension Development Host window. ' +
          'Default: "renderer".',
      ),
    returnByValue: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to return the result by value (serialized). Default true. Only used for renderer target.',
      ),
    payload: zod
      .unknown()
      .optional()
      .describe(
        'Optional JSON-serializable payload passed as the `payload` parameter. Only used for host/devhost targets.',
      ),
  },
  handler: async (request, response) => {
    const {expression, target, returnByValue, payload} = request.params;

    if (target === 'devhost') {
      const bridgePath = getDevhostBridgePath();

      if (!bridgePath) {
        response.appendResponseLine(
          `**Error:** Extension Development Host bridge is not connected.\n` +
            'Ensure the VS Code debug window has been launched and extension-bridge is active.',
        );
        return;
      }

      try {
        const result = await bridgeExec(bridgePath, expression, payload);
        response.appendResponseLine('**Result:**');
        response.appendResponseLine('```json');
        response.appendResponseLine(
          typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2),
        );
        response.appendResponseLine('```');
      } catch (err) {
        response.appendResponseLine('**Bridge exec error:**');
        response.appendResponseLine('```');
        response.appendResponseLine((err as Error).message);
        response.appendResponseLine('```');
      }
      return;
    }

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
