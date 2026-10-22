/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { logger } from '../utils/logger.js';
export const DAEMON_SCRIPT_PATH = path.join(import.meta.dirname, 'daemon.js');
const APP_NAME = 'chrome-devtools-mcp';
export const DAEMON_CLIENT_NAME = 'chrome-devtools-cli-daemon';
export function assertValidSessionId(sessionId) {
    if (!sessionId) {
        return;
    }
    if (!/^[a-fA-F0-9-]+$/.test(sessionId)) {
        throw new Error(`Invalid sessionId: ${sessionId}`);
    }
}
// Using these paths due to strict limits on the POSIX socket path length.
export function getSocketPath(sessionId) {
    assertValidSessionId(sessionId);
    const username = os.userInfo().username;
    const suffix = sessionId ? `-${sessionId}` : '';
    const appName = APP_NAME + suffix;
    if (IS_WINDOWS) {
        // Windows uses Named Pipes, not file paths.
        // This format is required for server.listen()
        // Append username to prevent cross-user named pipe squatting
        return path.join('\\\\.\\pipe', `${appName}-${username}`, 'server.sock');
    }
    return path.join(getRuntimeHome(sessionId), 'server.sock');
}
export function getRuntimeHome(sessionId) {
    assertValidSessionId(sessionId);
    const platform = os.platform();
    const uid = os.userInfo().uid;
    const suffix = sessionId ? `-${sessionId}` : '';
    const appName = APP_NAME + suffix;
    // 1. Check for the modern Unix standard
    if (process.env.XDG_RUNTIME_DIR) {
        return path.join(process.env.XDG_RUNTIME_DIR, appName);
    }
    // 2. Fallback for macOS and older Linux
    if (platform === 'darwin' || platform === 'linux') {
        // /tmp is cleared on boot, making it perfect for PIDs
        return path.join('/tmp', `${appName}-${uid}`);
    }
    // 3. Windows Fallback
    return path.join(os.tmpdir(), appName);
}
export const IS_WINDOWS = os.platform() === 'win32';
export function getPidFilePath(sessionId) {
    assertValidSessionId(sessionId);
    const runtimeDir = getRuntimeHome(sessionId);
    return path.join(runtimeDir, 'daemon.pid');
}
export function getDaemonPid(sessionId) {
    assertValidSessionId(sessionId);
    try {
        const pidFile = getPidFilePath(sessionId);
        logger?.(`Daemon pid file ${pidFile} sessionId=${sessionId}`);
        if (!fs.existsSync(pidFile)) {
            return null;
        }
        const pidContent = fs.readFileSync(pidFile, 'utf-8');
        const pid = parseInt(pidContent.trim(), 10);
        logger?.(`Daemon pid: ${pid}`);
        if (isNaN(pid)) {
            return null;
        }
        return pid;
    }
    catch {
        return null;
    }
}
const verifiedDaemonPids = new Map();
function getProcessCommandLine(pid) {
    if (process.platform === 'linux' && fs.existsSync('/proc')) {
        return fs
            .readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
            .replaceAll('\0', ' ');
    }
    if (IS_WINDOWS) {
        return childProcess.execFileSync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
        ], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true,
        });
    }
    return childProcess.execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
}
function isDaemonProcess(pid) {
    const cached = verifiedDaemonPids.get(pid);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const commandLine = getProcessCommandLine(pid).trim();
        const isDaemon = commandLine === '' || /[\\/]daemon[\\/]daemon\.js/.test(commandLine);
        verifiedDaemonPids.set(pid, isDaemon);
        return isDaemon;
    }
    catch {
        verifiedDaemonPids.set(pid, true);
        return true;
    }
}
export function isDaemonRunning(sessionId) {
    assertValidSessionId(sessionId);
    const pid = getDaemonPid(sessionId);
    if (pid) {
        try {
            process.kill(pid, 0); // Throws if process doesn't exist
            return isDaemonProcess(pid);
        }
        catch {
            // Process is dead, stale PID file. Proceed with startup.
            verifiedDaemonPids.delete(pid);
        }
    }
    return false;
}
export function serializeArgs(options, argv) {
    const args = [];
    for (const key of Object.keys(options)) {
        if (argv[key] === undefined || argv[key] === null) {
            continue;
        }
        const value = argv[key];
        const option = options[key];
        // Yargs reuses the option `default` object; skip it so the daemon parser
        // still sees the original default (needed for filesystemRoot identity).
        if (option !== undefined && value === option.default) {
            continue;
        }
        const kebabKey = key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
        if (typeof value === 'boolean') {
            if (value) {
                args.push(`--${kebabKey}`);
            }
            else {
                args.push(`--no-${kebabKey}`);
            }
        }
        else if (Array.isArray(value)) {
            for (const item of value) {
                args.push(`--${kebabKey}=${String(item)}`);
            }
        }
        else {
            const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            args.push(`--${kebabKey}=${serializedValue}`);
        }
    }
    return args;
}
//# sourceMappingURL=utils.js.map