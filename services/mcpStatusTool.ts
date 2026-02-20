/**
 * MCP Status LM Tool
 *
 * A VS Code Language Model Tool that Copilot calls to wait for the MCP server
 * to be fully started after a hot-reload restart. When any MCP tool returns
 * "server is restarting," the response tells Copilot to call this tool.
 *
 * If no restart is pending, returns immediately. If a restart is in progress,
 * blocks until the MCP server sends mcpReady or the timeout is reached.
 */

import type * as vscode from 'vscode';
import { waitForMcpReady } from '../host-handlers';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;

const READY_MESSAGE = `✅ MCP server is ready.

The MCP tool cache was already cleared during the restart.
Do NOT call mcpStatus again — proceed directly to using MCP tools.

If tools are not visible or changes are not working as expected:
1. Check the MCP server's output via the output_read tool
2. Review the MCP server's source code to determine the cause`;

const TIMEOUT_MESSAGE = `⏳ MCP server did not become ready within the timeout period.

The server may still be starting. You can:
1. Call mcpStatus again to continue waiting
2. Check the MCP server's output via the output_read tool for errors
3. Review VS Code's Output panel for MCP server logs`;

// ── Input Schema ─────────────────────────────────────────────────────────────

interface IMcpStatusParams {
  timeoutMs?: number;
}

// ── LM Tool ──────────────────────────────────────────────────────────────────

export class McpStatusTool implements vscode.LanguageModelTool<IMcpStatusParams> {

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<IMcpStatusParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation | undefined> {
    return {
      invocationMessage: 'Waiting for MCP server to be ready…',
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IMcpStatusParams>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const timeoutMs = options.input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Race between MCP ready, timeout, and cancellation
    const ready = await Promise.race([
      waitForMcpReady(timeoutMs),
      new Promise<boolean>((_, reject) => {
        token.onCancellationRequested(() => reject(new Error('mcpStatus cancelled')));
      }),
    ]);

    const { LanguageModelToolResult, LanguageModelTextPart } = await import('vscode');

    if (ready) {
      return new LanguageModelToolResult([
        new LanguageModelTextPart(READY_MESSAGE),
      ]);
    }

    return new LanguageModelToolResult([
      new LanguageModelTextPart(TIMEOUT_MESSAGE),
    ]);
  }
}
