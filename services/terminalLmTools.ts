/**
 * Language Model Tools: Terminal Operations
 *
 * LM tools that allow Copilot to interact with VS Code terminals.
 * Each VS Code instance gets its own local terminal controller.
 *
 * Architecture:
 * - LM tools control terminals in the ACTIVE WORKSPACE where the extension runs
 * - MCP tools (in client-handlers.ts) have their own separate controller
 * - This allows both host and client to run terminal tools independently
 *
 * Tools:
 * - terminal_read: Read current terminal state and output
 * - terminal_execute: Run a command or send input to a terminal
 */

import * as vscode from 'vscode';
import { compressText } from 'logpare';
import type { CompressOptions } from 'logpare';
import { SingleTerminalController, type TerminalRunResult } from './singleTerminalController';
import { getUserActionTracker } from './userActionTracker';

// ============================================================================
// Local Controller (lazy initialization)
// ============================================================================

let localController: SingleTerminalController | null = null;

function getController(): SingleTerminalController {
    if (!localController) {
        console.log('[vscode-devtools:LM-tools] Initializing local terminal controller');
        localController = new SingleTerminalController();
    }
    return localController;
}

// ============================================================================
// Input Interfaces
// ============================================================================

export type LogFormat = 'summary' | 'detailed' | 'json';

export interface IReadTerminalParams {
    name?: string;
    limit?: number;
    pattern?: string;
    logFormat?: LogFormat;
}

export interface ITerminalRunParams {
    command?: string;
    cwd?: string;
    ephemeral: boolean;
    name?: string;
    waitMode?: 'completion' | 'background';
    timeout?: number;
    logFormat?: LogFormat;
    force?: boolean;
    addNewline?: boolean;
    keys?: string[];
}

// ============================================================================
// Log Consolidation (LogPare Drain algorithm)
// ============================================================================

const MIN_LINES_FOR_COMPRESSION = 5;
const MIN_COMPRESSION_RATIO = 0.1;

function consolidateOutput(text: string, format: LogFormat): string {
    const lineCount = text.split('\n').length;
    if (lineCount < MIN_LINES_FOR_COMPRESSION) return text;

    const options: CompressOptions = {
        format: format === 'json' ? 'json' : format,
        maxTemplates: 50,
    };

    const result = compressText(text, options);

    const hasCompression =
        result.stats.compressionRatio >= MIN_COMPRESSION_RATIO &&
        result.stats.uniqueTemplates < lineCount;

    if (!hasCompression) return text;
    return result.formatted;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatTerminalResult(result: TerminalRunResult, limit?: number, pattern?: string, logFormat?: LogFormat): string {
    const lines: string[] = [];

    // Inject user action alerts at the top so Copilot notices immediately
    const userActionDigest = getUserActionTracker().formatForInjection();
    if (userActionDigest) {
        lines.push(userActionDigest);
    }

    lines.push(`## Terminal: ${result.name ?? 'default'}`);
    lines.push('');
    lines.push(`**Status:** ${result.status}`);
    if (result.shell) lines.push(`**Shell:** ${result.shell}`);
    if (result.cwd) lines.push(`**CWD:** ${result.cwd}`);
    if (result.pid !== undefined) lines.push(`**PID:** ${result.pid}`);
    if (result.exitCode !== undefined) lines.push(`**Exit Code:** ${result.exitCode}`);
    if (result.durationMs !== undefined) lines.push(`**Duration:** ${result.durationMs}ms`);
    if (result.prompt) lines.push(`**Prompt:** \`${result.prompt}\``);
    lines.push('');

    let output = result.output ?? '';

    if (pattern) {
        try {
            const regex = new RegExp(pattern, 'gi');
            const outputLines = output.split('\n');
            const matchingLines = outputLines.filter(line => regex.test(line));
            output = matchingLines.join('\n');
            lines.push(`**Filtered by:** \`${pattern}\` (${matchingLines.length} matching lines)`);
        } catch {
            lines.push(`**Warning:** Invalid regex pattern "${pattern}"`);
        }
    }

    if (limit !== undefined && limit > 0) {
        const outputLines = output.split('\n');
        if (outputLines.length > limit) {
            output = outputLines.slice(-limit).join('\n');
            lines.push(`**Showing:** last ${limit} of ${outputLines.length} lines`);
        }
    }

    if (output.trim()) {
        const finalOutput = logFormat ? consolidateOutput(output, logFormat) : output;
        lines.push('');
        lines.push('**Output:**');
        lines.push('```');
        lines.push(finalOutput);
        lines.push('```');
    } else {
        lines.push('');
        lines.push('*(no output)*');
    }

    if (result.terminalSessions && result.terminalSessions.length > 0) {
        lines.push('');
        lines.push('**All Terminal Sessions:**');
        for (const session of result.terminalSessions) {
            const marker = session.isActive ? '→ ' : '  ';
            const statusTag = session.status === 'running' ? '🔄' : session.status === 'completed' ? '✓' : '○';
            lines.push(`${marker}${statusTag} **${session.name}** (${session.status})`);
        }
    }

    return lines.join('\n');
}

// ============================================================================
// ReadTerminalTool
// ============================================================================

export class TerminalReadTool implements vscode.LanguageModelTool<IReadTerminalParams> {
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IReadTerminalParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        const params = options.input;
        const terminalName = params.name ?? 'default';

        return {
            invocationMessage: `Reading terminal "${terminalName}" state`,
            confirmationMessages: {
                title: 'Read Terminal',
                message: new vscode.MarkdownString(
                    `Read current output and state from terminal "${terminalName}"?`
                ),
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IReadTerminalParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const params = options.input;
        const controller = getController();

        const result = controller.getState(params.name);
        const formatted = formatTerminalResult(result, params.limit, params.pattern, params.logFormat);

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(formatted),
        ]);
    }
}

// ============================================================================
// TerminalRunTool (unified: run commands + send input)
// ============================================================================

export class TerminalExecuteTool implements vscode.LanguageModelTool<ITerminalRunParams> {
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<ITerminalRunParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        const params = options.input;
        const terminalName = params.name ?? 'default';

        // Keys mode: interactive TUI navigation
        if (params.keys && params.keys.length > 0) {
            return {
                invocationMessage: `Sending keys [${params.keys.join(', ')}] to terminal "${terminalName}"`,
                confirmationMessages: {
                    title: 'Send Keys',
                    message: new vscode.MarkdownString(
                        `Send key sequences to terminal "${terminalName}"?\n\n` +
                        `**Keys:** ${params.keys.map(k => `\`${k}\``).join(' → ')}`
                    ),
                },
            };
        }

        const isInputMode = !params.cwd;

        if (isInputMode) {
            const cmd = params.command ?? '';
            const displayText = cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
            return {
                invocationMessage: `Sending input to terminal "${terminalName}"`,
                confirmationMessages: {
                    title: 'Terminal Input',
                    message: new vscode.MarkdownString(
                        `Send input to terminal "${terminalName}"?\n\n` +
                        `**Input:** \`${displayText}\`\n\n` +
                        `**Add newline:** ${params.addNewline !== false ? 'yes' : 'no'}`
                    ),
                },
            };
        }

        const waitMode = params.waitMode ?? 'completion';
        return {
            invocationMessage: `Running command in terminal "${terminalName}"`,
            confirmationMessages: {
                title: 'Run Command',
                message: new vscode.MarkdownString(
                    `Execute PowerShell command in terminal "${terminalName}"?\n\n` +
                    `**Command:**\n\`\`\`powershell\n${params.command}\n\`\`\`\n\n` +
                    `**Working Directory:** \`${params.cwd}\`\n\n` +
                    `**Wait Mode:** ${waitMode}` +
                    (params.force ? '\n\n⚠️ **Force:** Will kill any running process first' : '')
                ),
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ITerminalRunParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const params = options.input;
        const controller = getController();

        // Keys mode: send key sequences for interactive TUI navigation
        if (params.keys && params.keys.length > 0) {
            try {
                const result = await controller.sendKeys(params.keys, params.name);
                const formatted = formatTerminalResult(result, undefined, undefined, params.logFormat);

                if (params.ephemeral) {
                    controller.destroyTerminal(params.name);
                }

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(formatted),
                ]);
            } catch (err) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `Error: ${(err as Error).message}`
                    ),
                ]);
            }
        }

        if (!params.command || typeof params.command !== 'string') {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    'Error: command is required and must be a string (or use keys for interactive navigation)'
                ),
            ]);
        }

        const command: string = params.command;
        const isInputMode = !params.cwd;

        try {
            let result: TerminalRunResult;

            if (isInputMode) {
                // Input mode: send text to existing terminal
                result = await controller.sendInput(
                    command,
                    params.addNewline !== false,
                    params.timeout,
                    params.name
                );
            } else if (params.cwd) {
                // Run mode: execute command in terminal with cwd
                result = await controller.run(
                    command,
                    params.cwd,
                    params.timeout,
                    params.name,
                    params.waitMode ?? 'completion',
                    params.force ?? false
                );
            } else {
                // This shouldn't happen due to isInputMode logic, but TypeScript needs it
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Error: cwd is required in run mode'),
                ]);
            }

            const formatted = formatTerminalResult(result, undefined, undefined, params.logFormat);

            // Ephemeral terminals are destroyed after completed commands return output.
            // Running/waiting terminals are kept alive for continued interaction.
            if (params.ephemeral && (result.status === 'completed' || result.status === 'timeout')) {
                controller.destroyTerminal(params.name);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(formatted),
            ]);
        } catch (err) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Error: ${(err as Error).message}`
                ),
            ]);
        }
    }
}
