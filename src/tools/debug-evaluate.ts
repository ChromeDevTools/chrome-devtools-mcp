/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Development diagnostic tool: execute VS Code API code via the vscode-devtools bridge
 * in the spawned Extension Development Host.
 *
 * The code runs inside `new Function('vscode', 'payload', ...)` in the extension
 * host process. `require()` is NOT available.
 */

import {bridgeExec} from '../bridge-client.js';
import {zod} from '../third_party/index.js';
import {getDevhostBridgePath} from '../vscode.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
} from './ToolDefinition.js';

const DebugEvaluateOutputSchema = zod.object({
  success: zod.boolean(),
  result: zod.unknown(),
  type: zod.string().optional(),
});

export const debugEvaluate = defineTool({
  name: 'debug_evaluate',
  description: `[DEV] Execute VS Code API code via the vscode-devtools bridge in the Extension Development Host.

The code runs inside an async function body with \`vscode\` and \`payload\` in scope.
Use \`return\` to return a value. \`await\` is available. \`require()\` is NOT available.

Args:
  - expression (string): VS Code API code to execute. Must use \`return\` to return a value
  - payload (any): Optional JSON-serializable payload passed as \`payload\` parameter
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, result: <evaluated value>, type: typeof result }
  Markdown format: Formatted result in JSON code block

Examples:
  - \`return vscode.version;\` — get VS Code version
  - \`return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath);\` — list workspace folders
  - \`return vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({label: t.label, active: t.isActive})));\` — list editor tabs
  - \`const editor = vscode.window.activeTextEditor; return editor ? { file: editor.document.fileName, line: editor.selection.active.line } : null;\` — get active editor info
  - \`return vscode.extensions.all.filter(e => e.isActive).map(e => e.id);\` — list active extensions

Error Handling:
  - Throws if Extension Development Host bridge is not connected
  - Throws if expression execution fails
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    conditions: ['devDiagnostic'],
  },
  schema: {
    response_format: responseFormatSchema,
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
  outputSchema: DebugEvaluateOutputSchema,
  handler: async (request, response) => {
    const {expression, payload} = request.params;

    const bridgePath = getDevhostBridgePath();

    if (!bridgePath) {
      throw new Error(
        'Extension Development Host bridge is not connected. ' +
          'Ensure the VS Code debug window has been launched and the vscode-devtools extension is active.',
      );
    }

    const result = await bridgeExec(bridgePath, expression, payload);

    if (request.params.response_format === ResponseFormat.JSON) {
      const output = {
        success: true,
        result,
        type: typeof result,
      };
      const jsonOutput = JSON.stringify(output, null, 2);
      checkCharacterLimit(jsonOutput, 'debug_evaluate', {
        expression: 'Use more selective queries or filters in your expression',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    const jsonResult = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    checkCharacterLimit(jsonResult, 'debug_evaluate', {
      expression: 'Use more selective queries or filters in your expression',
    });

    response.appendResponseLine('**Result:**');
    response.appendResponseLine('```json');
    response.appendResponseLine(jsonResult);
    response.appendResponseLine('```');
  },
});
