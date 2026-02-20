/**
 * Language Model Tool: output_read
 * 
 * A read-only LM tool that allows Copilot to read VS Code output logs
 * from ALL active sessions (Host and Client/Extension Development Host).
 * 
 * Host logs: %APPDATA%/Code/logs/ (or platform equivalent)
 * Client logs: <workspace>/.devtools/user-data/logs/
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Input Schema Interface
// ============================================================================

export interface IReadOutputChannelsParams {
    channel?: string;
    session?: 'host' | 'client';
    limit?: number;
    pattern?: string;
    afterLine?: number;
    beforeLine?: number;
    lineLimit?: number;
}

// ============================================================================
// Log File Discovery Types
// ============================================================================

type SessionType = 'host' | 'client';

interface LogFileInfo {
    name: string;
    path: string;
    size: number;
    category: string;
    session: SessionType;
}

const categoryLabels: Record<string, string> = {
    root: 'Main Logs',
    window: 'Window Logs',
    exthost: 'Extension Host',
    extension: 'Extension Logs',
    output: 'Output Channels',
};

// ============================================================================
// Utility Functions
// ============================================================================

function getUserDataDir(): string | null {
    const platform = process.platform;
    const homeDir = os.homedir();

    switch (platform) {
        case 'win32': {
            const appData = process.env.APPDATA;
            if (appData) {
                return path.join(appData, 'Code');
            }
            return path.join(homeDir, 'AppData', 'Roaming', 'Code');
        }
        case 'darwin':
            return path.join(homeDir, 'Library', 'Application Support', 'Code');
        case 'linux':
            return path.join(homeDir, '.config', 'Code');
        default:
            return null;
    }
}

function findLogFiles(dir: string, session: SessionType, category = 'root'): LogFileInfo[] {
    const results: LogFileInfo[] = [];

    if (!fs.existsSync(dir)) {
        return results;
    }

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            let newCategory = category;
            if (entry.name.startsWith('window')) {
                newCategory = 'window';
            } else if (entry.name === 'exthost') {
                newCategory = 'exthost';
            } else if (entry.name.startsWith('output_')) {
                newCategory = 'output';
            } else if (entry.name.startsWith('vscode.')) {
                newCategory = 'extension';
            }
            results.push(...findLogFiles(fullPath, session, newCategory));
        } else if (entry.name.endsWith('.log')) {
            try {
                const stats = fs.statSync(fullPath);
                results.push({
                    name: entry.name.replace('.log', ''),
                    path: fullPath,
                    size: stats.size,
                    category,
                    session,
                });
            } catch {
                // Skip files we can't stat
            }
        }
    }

    return results;
}

function getLatestSessionDir(logsRoot: string): string | null {
    if (!fs.existsSync(logsRoot)) {
        return null;
    }

    let sessions: string[];
    try {
        sessions = fs
            .readdirSync(logsRoot, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse();
    } catch {
        return null;
    }

    if (sessions.length === 0) {
        return null;
    }

    return path.join(logsRoot, sessions[0]);
}

function getHostLogsDir(): string | null {
    const userDataDir = getUserDataDir();
    if (!userDataDir) {
        return null;
    }
    return getLatestSessionDir(path.join(userDataDir, 'logs'));
}

function getClientLogsDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }

    // The Client Extension Development Host stores its user-data at
    // <clientWorkspace>/.devtools/user-data/. The clientWorkspace can be
    // the workspace root itself, or a subdirectory (e.g. test-workspace/).
    // Scan the root and its immediate children for .devtools/user-data/logs/.
    const root = workspaceFolders[0].uri.fsPath;
    const candidates: string[] = [
        path.join(root, '.devtools', 'user-data', 'logs'),
    ];

    try {
        const rootEntries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of rootEntries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                candidates.push(
                    path.join(root, entry.name, '.devtools', 'user-data', 'logs'),
                );
            }
        }
    } catch {
        // Can't read root dir — just use the direct candidate
    }

    // Pick the candidate with the most recent log session
    let bestDir: string | null = null;
    let bestTimestamp = '';

    for (const candidate of candidates) {
        const sessionDir = getLatestSessionDir(candidate);
        if (sessionDir) {
            const sessionName = path.basename(sessionDir);
            if (sessionName > bestTimestamp) {
                bestTimestamp = sessionName;
                bestDir = sessionDir;
            }
        }
    }

    return bestDir;
}

/**
 * Discover log files from all active VS Code sessions.
 * Returns files tagged with their session origin.
 */
function discoverAllLogFiles(sessionFilter?: SessionType): LogFileInfo[] {
    const allFiles: LogFileInfo[] = [];

    if (!sessionFilter || sessionFilter === 'host') {
        const hostDir = getHostLogsDir();
        if (hostDir) {
            allFiles.push(...findLogFiles(hostDir, 'host'));
        }
    }

    if (!sessionFilter || sessionFilter === 'client') {
        const clientDir = getClientLogsDir();
        if (clientDir) {
            allFiles.push(...findLogFiles(clientDir, 'client'));
        }
    }

    return allFiles;
}

// ============================================================================
// Language Model Tool Implementation
// ============================================================================

export class OutputReadTool implements vscode.LanguageModelTool<IReadOutputChannelsParams> {

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IReadOutputChannelsParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        const params = options.input;
        
        let messageText: string;
        if (params.channel) {
            const filterParts: string[] = [];
            if (params.session) filterParts.push(`session: ${params.session}`);
            if (params.limit !== undefined) filterParts.push(`limit: ${params.limit}`);
            if (params.pattern) filterParts.push(`pattern: "${params.pattern}"`);
            if (params.afterLine !== undefined) filterParts.push(`afterLine: ${params.afterLine}`);
            if (params.beforeLine !== undefined) filterParts.push(`beforeLine: ${params.beforeLine}`);
            
            const filterDesc = filterParts.length > 0 ? ` with filters: ${filterParts.join(', ')}` : '';
            messageText = `Read output channel "${params.channel}"${filterDesc}?`;
        } else {
            const sessionDesc = params.session ? ` (${params.session} only)` : '';
            messageText = `List all available VS Code output channels${sessionDesc}?`;
        }

        return {
            invocationMessage: params.channel 
                ? `Reading output channel: ${params.channel}` 
                : 'Listing output channels',
            confirmationMessages: {
                title: 'Read Output Channels',
                message: new vscode.MarkdownString(messageText),
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IReadOutputChannelsParams>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const params = options.input;
        const sessionFilter = params.session;

        const logFiles = discoverAllLogFiles(sessionFilter);
        if (logFiles.length === 0) {
            const sessionHint = sessionFilter
                ? ` for session "${sessionFilter}"`
                : '';
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `No log files found${sessionHint}. Make sure VS Code has created log files.`
                ),
            ]);
        }

        // If no channel specified, list all available channels
        if (!params.channel) {
            return this.listChannels(logFiles);
        }

        // Find matching channels across sessions
        const needle = params.channel.toLowerCase();
        let matches = logFiles.filter(f => f.name.toLowerCase() === needle);
        if (matches.length === 0) {
            matches = logFiles.filter(f => f.name.toLowerCase().includes(needle));
        }

        if (matches.length === 0) {
            const availableChannels = [...new Set(logFiles.map(f => f.name))].join(', ');
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Channel "${params.channel}" not found. Available channels: ${availableChannels}`
                ),
            ]);
        }

        // If the channel exists in multiple sessions, return all of them
        const parts: vscode.LanguageModelTextPart[] = [];
        for (const match of matches) {
            const result = this.readChannel(match, params);
            const textParts = result.content.filter(
                (p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart
            );
            for (const tp of textParts) {
                parts.push(tp);
            }
        }

        return new vscode.LanguageModelToolResult(parts);
    }

    private listChannels(logFiles: LogFileInfo[]): vscode.LanguageModelToolResult {
        // Group files by session, then by category
        const bySessions = new Map<SessionType, Map<string, LogFileInfo[]>>();
        for (const file of logFiles) {
            let sessionMap = bySessions.get(file.session);
            if (!sessionMap) {
                sessionMap = new Map();
                bySessions.set(file.session, sessionMap);
            }
            const catFiles = sessionMap.get(file.category);
            if (catFiles) {
                catFiles.push(file);
            } else {
                sessionMap.set(file.category, [file]);
            }
        }

        const sessionLabels: Record<SessionType, string> = {
            host: 'Host Session',
            client: 'Client Session (Extension Development Host)',
        };

        const lines: string[] = ['## Available Output Channels\n'];

        for (const sessionType of ['host', 'client'] as const) {
            const sessionMap = bySessions.get(sessionType);
            if (!sessionMap) continue;

            lines.push(`### ${sessionLabels[sessionType]}\n`);

            for (const [category, files] of sessionMap) {
                lines.push(`#### ${categoryLabels[category] ?? category}\n`);
                for (const file of files) {
                    const sizeKb = (file.size / 1024).toFixed(1);
                    lines.push(`- **${file.name}** (${sizeKb} KB)`);
                }
                lines.push('');
            }
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(lines.join('\n')),
        ]);
    }

    private readChannel(
        targetFile: LogFileInfo,
        params: IReadOutputChannelsParams
    ): vscode.LanguageModelToolResult {
        let content: string;
        try {
            content = fs.readFileSync(targetFile.path, 'utf-8');
        } catch (err) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    `Error reading log file: ${(err as Error).message}`
                ),
            ]);
        }

        const { limit, pattern, afterLine, beforeLine, lineLimit } = params;

        interface LineEntry {
            line: number;
            text: string;
        }

        const allLines = content.split('\n');
        let indexedLines: LineEntry[] = allLines.map((text, idx) => ({
            line: idx + 1,
            text,
        }));

        // Apply cursor filters (afterLine/beforeLine)
        if (afterLine !== undefined) {
            indexedLines = indexedLines.filter(l => l.line > afterLine);
        }
        if (beforeLine !== undefined) {
            indexedLines = indexedLines.filter(l => l.line < beforeLine);
        }

        // Apply pattern filter
        if (pattern) {
            try {
                const regex = new RegExp(pattern, 'i');
                indexedLines = indexedLines.filter(l => regex.test(l.text));
            } catch (err) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        `Invalid regex pattern "${pattern}": ${(err as Error).message}`
                    ),
                ]);
            }
        }

        const totalMatching = indexedLines.length;
        let hasMore = false;

        // Apply limit (tail-style: take last N)
        if (limit !== undefined && indexedLines.length > limit) {
            hasMore = true;
            indexedLines = indexedLines.slice(-limit);
        }

        // Apply lineLimit (truncate long lines)
        if (lineLimit !== undefined) {
            indexedLines = indexedLines.map(l => ({
                line: l.line,
                text: l.text.length > lineLimit ? l.text.slice(0, lineLimit) + '...' : l.text,
            }));
        }

        // Build filter description for output
        const filterParts: string[] = [];
        if (pattern) filterParts.push(`pattern: ${pattern}`);
        if (afterLine !== undefined) filterParts.push(`afterLine: ${afterLine}`);
        if (beforeLine !== undefined) filterParts.push(`beforeLine: ${beforeLine}`);
        if (limit !== undefined) filterParts.push(`limit: ${limit}`);
        if (lineLimit !== undefined) filterParts.push(`lineLimit: ${lineLimit}`);
        const filtersDesc = filterParts.length > 0 ? filterParts.join(' | ') : undefined;

        const oldestLine = indexedLines.length > 0 ? indexedLines[0].line : undefined;
        const newestLine = indexedLines.length > 0 ? indexedLines[indexedLines.length - 1].line : undefined;

        // Build markdown output
        const sessionLabel = targetFile.session === 'host' ? 'Host' : 'Client';
        const outputLines: string[] = [`## Output: ${targetFile.name} [${sessionLabel}]\n`];

        let summary = `**Returned:** ${indexedLines.length} of ${totalMatching} total`;
        if (hasMore) {
            summary += ` (use \`afterLine: ${oldestLine !== undefined ? oldestLine - 1 : 0}\` or increase \`limit\` to see more)`;
        }
        outputLines.push(summary);

        if (oldestLine !== undefined && newestLine !== undefined) {
            outputLines.push(`**Line range:** ${oldestLine} - ${newestLine}`);
        }

        if (filtersDesc) {
            outputLines.push(`**Filters:** ${filtersDesc}`);
        }

        if (indexedLines.length === 0) {
            outputLines.push('\n(no matching lines)');
        } else {
            const formattedLines = indexedLines
                .map(l => `${String(l.line).padStart(5, ' ')} | ${l.text}`)
                .join('\n');
            outputLines.push('\n```\n' + formattedLines + '\n```');
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(outputLines.join('\n')),
        ]);
    }
}
