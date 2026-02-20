import * as vscode from 'vscode';

// ============================================================================
// Input Schema Interface
// ============================================================================

interface IWaitParams {
    durationMs: number;
    reason?: string;
}

// ============================================================================
// Wait LM Tool
// ============================================================================

export class WaitTool implements vscode.LanguageModelTool<IWaitParams> {

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IWaitParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        const { durationMs, reason } = options.input;

        const reasonDesc = reason ? ` (${reason})` : '';
        return {
            invocationMessage: `Waiting ${durationMs}ms${reasonDesc}`,
            confirmationMessages: {
                title: 'Wait',
                message: new vscode.MarkdownString(
                    `Wait for **${durationMs}ms**${reasonDesc}?`
                ),
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IWaitParams>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { durationMs, reason } = options.input;

        if (durationMs < 0 || durationMs > 30000) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Error: durationMs must be between 0 and 30000. Got: ${durationMs}`
                ),
            ]);
        }

        const startTime = Date.now();

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, durationMs);
            token.onCancellationRequested(() => {
                clearTimeout(timer);
                reject(new Error('Wait cancelled'));
            });
        });

        const elapsed = Date.now() - startTime;

        const output = {
            elapsed_ms: elapsed,
            requested_ms: durationMs,
            ...(reason ? { reason } : {}),
        };

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(output, null, 2)),
        ]);
    }
}
