/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tools for reading terminal information from VS Code.
 * Uses the VS Code Extension API via the bridge to access terminal data.
 */

import {bridgeExec} from '../bridge-client.js';
import {zod} from '../third_party/index.js';
import {getDevhostBridgePath} from '../vscode.js';

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

const TERMINAL_LIST_CODE = `
// Get terminals synchronously - processId needs separate async handling
const terminals = vscode.window.terminals;
const activeTerminal = vscode.window.activeTerminal;

const terminalInfos = terminals.map((terminal, index) => ({
  index,
  name: terminal.name,
  processId: undefined, // processId is async, skip for now
  creationOptions: {
    name: terminal.creationOptions?.name,
    shellPath: terminal.creationOptions?.shellPath,
  },
  exitStatus: terminal.exitStatus ? {
    code: terminal.exitStatus.code,
    reason: terminal.exitStatus.reason === 1 ? 'Signal' : 
            terminal.exitStatus.reason === 2 ? 'Extension' : 'Process',
  } : undefined,
  state: {
    isInteractedWith: terminal.state?.isInteractedWith ?? false,
  },
  isActive: terminal === activeTerminal,
}));

const activeIndex = terminalInfos.findIndex(t => t.isActive);

return {
  total: terminalInfos.length,
  activeIndex: activeIndex >= 0 ? activeIndex : undefined,
  terminals: terminalInfos,
};
`;

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
    const bridgePath = getDevhostBridgePath();
    if (!bridgePath) {
      throw new Error(
        'Development host bridge not available. ' +
        'Make sure the VS Code debug window is running.',
      );
    }

    const rawResult = await bridgeExec(bridgePath, TERMINAL_LIST_CODE);
    
    // Handle null/undefined result
    const result = (rawResult ?? {
      total: 0,
      activeIndex: undefined,
      terminals: [],
    }) as {
      total: number;
      activeIndex?: number;
      terminals: Array<TerminalInfo & {index: number; isActive: boolean}>;
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
