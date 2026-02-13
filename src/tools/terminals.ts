/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tools for reading terminal information from VS Code.
 * Uses the Client pipe to access terminal data in the Extension Development Host.
 */

import {terminalListAll, pingClient} from '../client-pipe.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

interface TerminalInfo {
  name: string;
  processId: number | undefined;
  creationOptions: {
    name?: string;
    shellPath?: string;
  };
  exitStatus?: {
    code: number;
    reason: string;
  };
  state: {
    isInteractedWith: boolean;
  };
}

const TerminalInfoSchema = zod.object({
  name: zod.string(),
  processId: zod.number().optional(),
  creationOptions: zod.object({
    name: zod.string().optional(),
    shellPath: zod.string().optional(),
  }),
  exitStatus: zod.object({
    code: zod.number(),
    reason: zod.string(),
  }).optional(),
  state: zod.object({
    isInteractedWith: zod.boolean(),
  }),
});

const ListTerminalsOutputSchema = zod.object({
  total: zod.number(),
  activeIndex: zod.number().optional(),
  terminals: zod.array(TerminalInfoSchema),
});

export const listTerminals = defineTool({
  name: 'list_terminals',
  description: `List all terminals in VS Code with their status and metadata.

This tool discovers all terminals in the VS Code window, including:
- Terminal names and process IDs
- Shell information
- Active/exit status
- Interaction state

Args:
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, activeIndex?, terminals: [{ name, processId, creationOptions, exitStatus?, state }] }
  Markdown format: Formatted list of terminals with status

Note:
  - Terminal buffer content cannot be directly read through the VS Code API
  - Use the run_in_terminal tool to execute commands and get their output
  - For existing terminal output, check if there's an associated output channel`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone'],
  },
  schema: {
    response_format: responseFormatSchema,
  },
  outputSchema: ListTerminalsOutputSchema,
  handler: async (request, response) => {
    const alive = await pingClient();
    if (!alive) {
      throw new Error(
        'Client pipe not available. ' +
        'Make sure the VS Code Extension Development Host window is running.',
      );
    }

    const rawResult = await terminalListAll();
    
    const result = rawResult ?? {
      total: 0,
      activeIndex: undefined,
      terminals: [],
    };

    if (request.params.response_format === ResponseFormat.JSON) {
      response.appendResponseLine(JSON.stringify(result, null, 2));
      return;
    }

    // Markdown format
    response.appendResponseLine('## VS Code Terminals');
    response.appendResponseLine('');
    response.appendResponseLine(
      `Found **${result.total}** terminal(s)${result.activeIndex !== undefined ? ` (active: #${result.activeIndex})` : ''}`
    );
    response.appendResponseLine('');

    if (result.terminals.length === 0) {
      response.appendResponseLine('_No terminals found._');
      return;
    }

    for (const terminal of result.terminals) {
      const status = terminal.isActive ? '▶️' : 
                     terminal.exitStatus ? '⏹️' : 
                     terminal.state.isInteractedWith ? '✅' : '⚪';
      
      response.appendResponseLine(`### ${status} ${terminal.name}`);
      response.appendResponseLine('');
      
      if (terminal.processId !== undefined) {
        response.appendResponseLine(`- **PID:** ${terminal.processId}`);
      }
      
      if (terminal.creationOptions.shellPath) {
        response.appendResponseLine(`- **Shell:** ${terminal.creationOptions.shellPath}`);
      }
      
      if (terminal.exitStatus) {
        response.appendResponseLine(
          `- **Exit:** Code ${terminal.exitStatus.code} (${terminal.exitStatus.reason})`
        );
      }
      
      response.appendResponseLine(
        `- **Interacted:** ${terminal.state.isInteractedWith ? 'Yes' : 'No'}`
      );
      response.appendResponseLine('');
    }

    response.appendResponseLine('---');
    response.appendResponseLine(
      '_Note: Terminal buffer content is not directly accessible via VS Code API._'
    );
  },
});
