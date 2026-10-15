/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { PipeTransport } from '../third_party/index.js';
import { getTempFilePath } from '../utils/files.js';
import { logger, puppeteerLogger } from '../utils/logger.js';
import { DAEMON_SCRIPT_PATH, getDaemonPid, getSocketPath, getPidFilePath, isDaemonRunning, } from './utils.js';
const FILE_TIMEOUT = 10_000;
const READY_CHECK_INTERVAL = 100;
const READY_CHECK_COMMAND_TIMEOUT = 1_000;
function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
async function waitFor(check, timeoutMessage) {
    const deadline = Date.now() + FILE_TIMEOUT;
    while (Date.now() < deadline) {
        if (check()) {
            return;
        }
        const timeLeft = deadline - Date.now();
        if (timeLeft > 0) {
            await delay(Math.min(READY_CHECK_INTERVAL, timeLeft));
        }
    }
    if (check()) {
        return;
    }
    throw new Error(timeoutMessage);
}
/**
 * Waits for a file to be created and populated.
 */
async function waitForFile(filePath) {
    await waitFor(() => {
        if (!fs.existsSync(filePath)) {
            return false;
        }
        try {
            return fs.statSync(filePath).size > 0;
        }
        catch {
            return false;
        }
    }, `Timeout: file ${filePath} not found within ${FILE_TIMEOUT}ms`);
}
async function waitForDaemonReady(sessionId) {
    const deadline = Date.now() + FILE_TIMEOUT;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await sendCommand({ method: 'status' }, sessionId, READY_CHECK_COMMAND_TIMEOUT);
            if (response.success) {
                return;
            }
            lastError = new Error(String(response.error));
        }
        catch (error) {
            lastError = error;
        }
        const timeLeft = deadline - Date.now();
        if (timeLeft > 0) {
            await delay(Math.min(READY_CHECK_INTERVAL, timeLeft));
        }
    }
    throw new Error(`Timeout: daemon not ready within ${FILE_TIMEOUT}ms`, lastError === undefined ? undefined : { cause: lastError });
}
export async function startDaemon(mcpArgs = [], sessionId) {
    if (isDaemonRunning(sessionId)) {
        logger?.('Daemon is already running');
        await waitForDaemonReady(sessionId);
        return;
    }
    const pidFilePath = getPidFilePath(sessionId);
    if (fs.existsSync(pidFilePath)) {
        if (process.platform !== 'win32') {
            const pidDir = path.dirname(pidFilePath);
            if (fs.lstatSync(pidDir).isSymbolicLink() ||
                fs.lstatSync(pidFilePath).isSymbolicLink()) {
                throw new Error(`Refusing to remove daemon PID file through a symbolic link: ${pidFilePath}`);
            }
        }
        fs.unlinkSync(pidFilePath);
    }
    logger?.('Starting daemon...', ...mcpArgs);
    const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH, ...mcpArgs], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, CHROME_DEVTOOLS_MCP_SESSION_ID: sessionId },
        cwd: process.cwd(),
        windowsHide: true,
    });
    child.unref();
    await waitForFile(pidFilePath);
    await waitForDaemonReady(sessionId);
}
const SEND_COMMAND_TIMEOUT = 60_000; // ms
/**
 * `sendCommand` opens a socket connection sends a single command and disconnects.
 */
export async function sendCommand(command, sessionId, timeout = SEND_COMMAND_TIMEOUT) {
    // Before connecting and sending, verify the daemon is still alive.
    if (!isDaemonRunning(sessionId)) {
        throw new Error('Daemon is not running.');
    }
    const socketPath = getSocketPath(sessionId);
    const socket = net.createConnection({
        path: socketPath,
    });
    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error('Timeout waiting for daemon response'));
        }, timeout);
        const transport = new PipeTransport(socket, socket, puppeteerLogger);
        transport.onmessage = async (message) => {
            clearTimeout(timer);
            logger?.('onmessage', message);
            socket.end();
            resolve(JSON.parse(message));
        };
        socket.on('error', error => {
            clearTimeout(timer);
            logger?.('Socket error:', error);
            reject(error);
        });
        socket.on('close', () => {
            clearTimeout(timer);
            logger?.('Socket closed:');
            reject(new Error('Socket closed'));
        });
        logger?.('Sending message', command);
        transport.send(JSON.stringify(command));
    });
}
export async function stopDaemon(sessionId) {
    if (!isDaemonRunning(sessionId)) {
        logger?.('Daemon is not running');
        return;
    }
    const pid = getDaemonPid(sessionId);
    const pidFilePath = getPidFilePath(sessionId);
    try {
        await sendCommand({ method: 'stop' }, sessionId);
    }
    catch (error) {
        logger?.('Failed to stop daemon via socket, sending SIGTERM:', error);
        if (pid) {
            try {
                process.kill(pid, 'SIGTERM');
            }
            catch {
                // Ignore if process already exited.
            }
        }
    }
    try {
        await waitFor(() => !isDaemonRunning(sessionId), `Timeout: daemon (pid ${pid}) did not exit within ${FILE_TIMEOUT}ms`);
        fs.rmSync(pidFilePath, { force: true });
    }
    catch (error) {
        if (pid) {
            try {
                process.kill(pid, 'SIGKILL');
            }
            catch {
                // Ignore if process already exited.
            }
        }
        try {
            fs.unlinkSync(pidFilePath);
        }
        catch {
            // Ignore if file already removed.
        }
        if (isDaemonRunning(sessionId)) {
            throw error;
        }
    }
}
export async function verifyDaemonVersion(sessionId, cliVersion) {
    if (!isDaemonRunning(sessionId)) {
        return undefined;
    }
    try {
        const response = await sendCommand({ method: 'status' }, sessionId);
        if (response.success) {
            const data = JSON.parse(response.result);
            if (data?.version && data.version !== cliVersion) {
                return `Warning: Daemon server version (${data.version}) does not match CLI version (${cliVersion}). Run 'chrome-devtools start' to update and restart the daemon.`;
            }
        }
    }
    catch {
        // Suppress communication failures during check; command execution handles unreachable daemon errors.
    }
    return undefined;
}
export async function handleResponse(response, format) {
    if (response.isError) {
        if (format === 'md') {
            const chunks = [];
            for (const content of response.content) {
                if (content.type === 'text') {
                    chunks.push(content.text);
                }
            }
            return chunks.join(' ');
        }
        return JSON.stringify(response.content);
    }
    const chunks = [];
    const images = [];
    for (const content of response.content) {
        if (content.type === 'text') {
            chunks.push(content.text);
        }
        else if (content.type === 'image') {
            const imageData = content.data;
            const mimeType = content.mimeType;
            let extension = '.png';
            switch (mimeType) {
                case 'image/jpg':
                case 'image/jpeg':
                    extension = '.jpeg';
                    break;
                case 'image/webp':
                    extension = '.webp';
                    break;
            }
            const data = Buffer.from(imageData, 'base64');
            const name = crypto.randomUUID();
            const filepath = await getTempFilePath(`${name}${extension}`);
            fs.writeFileSync(filepath, data);
            images.push({ filePath: filepath, mimeType });
            chunks.push(`Saved to ${filepath}.`);
        }
        else {
            throw new Error('Not supported response content type');
        }
    }
    if (format === 'json') {
        if (response.structuredContent) {
            const structuredContent = {
                ...response.structuredContent,
                ...(images.length ? { images } : {}),
            };
            return JSON.stringify(structuredContent);
        }
        // Fall-through to text for backward compatibility.
    }
    return format === 'md' ? chunks.join(' ') : JSON.stringify(chunks);
}
//# sourceMappingURL=client.js.map