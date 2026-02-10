/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VS Code API tools: execute VS Code commands and API calls via the vscode-devtools bridge
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

function ensureBridgeConnected(): string {
  const bridgePath = getDevhostBridgePath();
  if (!bridgePath) {
    throw new Error(
      'Extension Development Host bridge is not connected. ' +
        'Ensure the VS Code debug window has been launched and the vscode-devtools extension is active.',
    );
  }
  return bridgePath;
}

const InvokeVscodeCommandOutputSchema = zod.object({
  success: zod.boolean(),
  command: zod.string(),
  result: zod.unknown(),
});

export const invokeVscodeCommand = defineTool({
  name: 'invoke_vscode_command',
  description: `Execute a VS Code command by ID.

Args:
  - command (string): The command ID to execute (e.g., "workbench.action.files.save", "editor.action.formatDocument")
  - args (array): Optional arguments to pass to the command
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, command: string, result: <command return value> }
  Markdown format: Command result in JSON code block

Examples:
  - Save current file: { command: "workbench.action.files.save" }
  - Format document: { command: "editor.action.formatDocument" }
  - Open file: { command: "vscode.open", args: [{ "$uri": "file:///path/to/file.ts" }] }
  - Go to line: { command: "workbench.action.gotoLine" }
  - Toggle sidebar: { command: "workbench.action.toggleSidebarVisibility" }
  - Open settings: { command: "workbench.action.openSettings" }
  - Run task: { command: "workbench.action.tasks.runTask", args: ["build"] }

Common command categories:
  - workbench.action.* — UI actions (save, open, toggle panels)
  - editor.action.* — Editor actions (format, fold, comment)
  - vscode.* — Core commands (open, diff, executeCommand)

Error Handling:
  - Throws if Extension Development Host bridge is not connected
  - Throws if command execution fails
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    conditions: ['extensionBridge'],
  },
  schema: {
    response_format: responseFormatSchema,
    command: zod
      .string()
      .describe(
        'The VS Code command ID to execute (e.g., "workbench.action.files.save", "editor.action.formatDocument")',
      ),
    args: zod
      .array(zod.unknown())
      .optional()
      .describe(
        'Optional array of arguments to pass to the command. For URI arguments, use { "$uri": "file:///path" }.',
      ),
  },
  outputSchema: InvokeVscodeCommandOutputSchema,
  handler: async (request, response) => {
    const {command, args} = request.params;
    const bridgePath = ensureBridgeConnected();

    const expression = args?.length
      ? `return await vscode.commands.executeCommand(payload.command, ...payload.args);`
      : `return await vscode.commands.executeCommand(payload.command);`;

    const payload = {command, args: args ?? []};
    const result = await bridgeExec(bridgePath, expression, payload);

    if (request.params.response_format === ResponseFormat.JSON) {
      const output = {
        success: true,
        command,
        result,
      };
      const jsonOutput = JSON.stringify(output, null, 2);
      checkCharacterLimit(jsonOutput, 'invoke_vscode_command', {
        command: 'Some commands may return large results',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    response.appendResponseLine(`**Command:** \`${command}\``);
    if (result !== undefined && result !== null) {
      const jsonResult = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      checkCharacterLimit(jsonResult, 'invoke_vscode_command', {
        command: 'Some commands may return large results',
      });
      response.appendResponseLine('**Result:**');
      response.appendResponseLine('```json');
      response.appendResponseLine(jsonResult);
      response.appendResponseLine('```');
    } else {
      response.appendResponseLine('Command executed successfully (no return value)');
    }
  },
});

const InvokeVscodeApiOutputSchema = zod.object({
  success: zod.boolean(),
  result: zod.unknown(),
  type: zod.string().optional(),
});

export const invokeVscodeApi = defineTool({
  name: 'invoke_vscode_api',
  description: `Execute VS Code API code to query editor state, workspace info, extensions, and more.

The code runs inside an async function body with \`vscode\` and \`payload\` in scope.
Use \`return\` to return a value. \`await\` is available. \`require()\` is NOT available.

Args:
  - expression (string): VS Code API code to execute. Must use \`return\` to return a value
  - payload (any): Optional JSON-serializable data passed as \`payload\` parameter
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, result: <evaluated value>, type: typeof result }
  Markdown format: Formatted result in JSON code block

Examples:
  - Get VS Code version:
    { expression: "return vscode.version;" }
  
  - List workspace folders:
    { expression: "return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath);" }
  
  - Get active editor info:
    { expression: "const e = vscode.window.activeTextEditor; return e ? { file: e.document.fileName, line: e.selection.active.line, text: e.document.getText() } : null;" }
  
  - List open tabs:
    { expression: "return vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({ label: t.label, active: t.isActive })));" }
  
  - List active extensions:
    { expression: "return vscode.extensions.all.filter(e => e.isActive).map(e => e.id);" }
  
  - Get diagnostics (linting errors):
    { expression: "return vscode.languages.getDiagnostics().map(([uri, diags]) => ({ file: uri.fsPath, errors: diags.map(d => ({ line: d.range.start.line, message: d.message })) }));" }
  
  - Read workspace setting:
    { expression: "return vscode.workspace.getConfiguration('editor').get('fontSize');" }

Error Handling:
  - Throws if Extension Development Host bridge is not connected
  - Throws if expression execution fails
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    conditions: ['extensionBridge'],
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
        'Optional JSON-serializable data passed as the `payload` parameter.',
      ),
  },
  outputSchema: InvokeVscodeApiOutputSchema,
  handler: async (request, response) => {
    const {expression, payload} = request.params;
    const bridgePath = ensureBridgeConnected();

    const result = await bridgeExec(bridgePath, expression, payload);

    if (request.params.response_format === ResponseFormat.JSON) {
      const output = {
        success: true,
        result,
        type: typeof result,
      };
      const jsonOutput = JSON.stringify(output, null, 2);
      checkCharacterLimit(jsonOutput, 'invoke_vscode_api', {
        expression: 'Use more selective queries or filters in your expression',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    const jsonResult = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    checkCharacterLimit(jsonResult, 'invoke_vscode_api', {
      expression: 'Use more selective queries or filters in your expression',
    });

    response.appendResponseLine('**Result:**');
    response.appendResponseLine('```json');
    response.appendResponseLine(jsonResult);
    response.appendResponseLine('```');
  },
});

