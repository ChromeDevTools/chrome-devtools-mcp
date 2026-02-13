/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VS Code command tools: execute VS Code commands via the Client pipe
 * in the Extension Development Host.
 */

import {commandExecute, pingClient} from '../client-pipe.js';
import {fetchAXTree} from '../ax-tree.js';
import {checkPendingNotifications} from '../notification-gate.js';
import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
} from './ToolDefinition.js';

async function ensureClientConnected(): Promise<void> {
  const alive = await pingClient();
  if (!alive) {
    throw new Error(
      'Client pipe not available. ' +
        'Ensure the VS Code Extension Development Host window is running.',
    );
  }
}

/**
 * Capture the current UI state after a bridge timeout. Always returns a
 * formatted message with the AX tree snapshot, indicating whether
 * interactive UI was detected or no visual changes occurred.
 */
async function captureInteractiveUIOnTimeout(): Promise<string> {
  try {
    const [notifications, axTree] = await Promise.all([
      checkPendingNotifications(),
      fetchAXTree(false),
    ]);

    const sections: string[] = [];

    // Blocking modals (e.g. "Save file?" dialogs)
    if (notifications.blocking.length > 0) {
      for (const modal of notifications.blocking) {
        sections.push(`**⛔ Blocking Dialog:** ${modal.message}`);
        if (modal.buttons.length > 0) {
          const btnList = modal.buttons.map(b => `"${b.label}"`).join(', ');
          sections.push(`**Buttons:** ${btnList}`);
        }
      }
    }

    // Quick input widgets (command palette, input box, quick pick)
    if (notifications.nonBlocking.some(n => n.type === 'dialog')) {
      for (const dialog of notifications.nonBlocking.filter(n => n.type === 'dialog')) {
        sections.push(`**📝 Input Dialog:** ${dialog.message}`);
      }
    }

    // Build the response with the AX tree snapshot so Copilot can interact
    const lines: string[] = [];

    if (sections.length > 0 || axTree.formatted.includes('focused')) {
      lines.push('## ⏳ Command Opened Interactive UI');
      lines.push('');
      lines.push('The command did not return a value because it opened an interactive');
      lines.push('dialog or input that is waiting for user interaction.');
      lines.push('Use the snapshot below to type into or click on the appropriate elements.');
    } else {
      lines.push('## ⏳ Command Timed Out');
      lines.push('');
      lines.push('The command did not return a value within the timeout period.');
      lines.push('No interactive UI was detected. The page snapshot is provided below.');
    }

    lines.push('');
    if (sections.length > 0) {
      for (const s of sections) {
        lines.push(s);
      }
      lines.push('');
    }
    lines.push('## Page Snapshot');
    lines.push('');
    lines.push(axTree.formatted);

    return lines.join('\n');
  } catch (err) {
    logger(`captureInteractiveUIOnTimeout failed: ${err}`);
    return `## ⏳ Command Timed Out\n\nThe command did not return a value within the timeout period.\nFailed to capture UI state: ${err}`;
  }
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

If the command opens an interactive dialog (input box, quick pick, etc.) that blocks
until user interaction, the tool returns a page snapshot with the interactive UI elements
and their UIDs so you can type into or click on them using keyboard_type, keyboard_hotkey,
or mouse_click.

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
    await ensureClientConnected();

    let result: unknown;
    try {
      const commandResult = await commandExecute(command, args as unknown[] | undefined);
      result = commandResult.result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('timed out')) {
        const interactiveUI = await captureInteractiveUIOnTimeout();
        response.appendResponseLine(`**Command:** \`${command}\``);
        response.appendResponseLine('');
        response.appendResponseLine(interactiveUI);
        return;
      }
      throw err;
    }

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

