/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Development diagnostic tool: execute arbitrary VS Code API code via the
 * extension-bridge named pipe/socket.
 *
 * Hidden in production — kept for development and troubleshooting.
 * Gives direct access to the VS Code extension API context (vscode namespace).
 *
 * The code runs inside `new Function('vscode', 'payload', ...)` in the
 * extension host process. `require()` is NOT available — only `vscode` API
 * and `payload` are in scope.
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {bridgeExec} from '../bridge-client.js';
import {getHostBridgePath, getDevhostBridgePath} from '../browser.js';

export const debugBridgeExec = defineTool({
  name: 'debug_bridge_exec',
  description: `[DEV] Execute arbitrary VS Code API code via the extension-bridge.
The code runs in a \`new Function('vscode', 'payload', ...)\` context inside the
extension host process. \`require()\` is NOT available.

Use 'host' target for the controller VS Code, or 'devhost' for the spawned
Extension Development Host window.

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
    code: zod
      .string()
      .describe(
        'VS Code API code to execute. Must use `return` to return a value. ' +
          'Runs inside an async function body, so `await` is available. ' +
          '`vscode` and `payload` are in scope. `require()` is NOT available.',
      ),
    target: zod
      .enum(['host', 'devhost'])
      .optional()
      .default('devhost')
      .describe(
        'Which VS Code instance to target. ' +
          '"host" = the controller VS Code with extension-bridge. ' +
          '"devhost" = the spawned Extension Development Host window. ' +
          'Default: "devhost".',
      ),
    payload: zod
      .unknown()
      .optional()
      .describe(
        'Optional JSON-serializable payload passed as the `payload` parameter.',
      ),
  },
  handler: async (request, response) => {
    const {code, target, payload} = request.params;

    const bridgePath =
      target === 'host' ? getHostBridgePath() : getDevhostBridgePath();

    if (!bridgePath) {
      const targetLabel =
        target === 'host' ? 'Host VS Code' : 'Extension Development Host';
      response.appendResponseLine(
        `**Error:** ${targetLabel} bridge is not connected.\n` +
          'Ensure the VS Code debug window has been launched and extension-bridge is active.',
      );
      return;
    }

    try {
      const result = await bridgeExec(bridgePath, code, payload);
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
  },
});
