/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Development diagnostic tool: execute VS Code API code via the extension-bridge
 * in the spawned Extension Development Host.
 *
 * The code runs inside `new Function('vscode', 'payload', ...)` in the extension
 * host process. `require()` is NOT available.
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {getDevhostBridgePath} from '../browser.js';
import {bridgeExec} from '../bridge-client.js';

export const debugEvaluate = defineTool({
  name: 'debug_evaluate',
  description: `[DEV] Execute VS Code API code via the extension-bridge in the Extension Development Host.

The code runs inside an async function body with \`vscode\` and \`payload\` in scope.
Use \`return\` to return a value. \`await\` is available. \`require()\` is NOT available.

Examples:
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
        'VS Code API code to execute. Must use `return` to return a value. ' +
          'Runs inside an async function body, so `await` is available. ' +
          '`vscode` and `payload` are in scope. `require()` is NOT available.',
      ),
    payload: zod
      .unknown()
      .optional()
      .describe(
        'Optional JSON-serializable payload passed as the `payload` parameter.',
      ),
  },
  handler: async (request, response) => {
    const {expression, payload} = request.params;

    const bridgePath = getDevhostBridgePath();

    if (!bridgePath) {
      throw new Error(
        'Extension Development Host bridge is not connected. ' +
          'Ensure the VS Code debug window has been launched and extension-bridge is active.',
      );
    }

    const result = await bridgeExec(bridgePath, expression, payload);

    response.appendResponseLine('**Result:**');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    );
    response.appendResponseLine('```');
  },
});
