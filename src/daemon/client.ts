/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';

import {logger} from '../logger.js';
import type {CallToolResult} from '../third_party/index.js';
import {PipeTransport} from '../third_party/index.js';
import {saveTemporaryFile} from '../utils/files.js';

import type {DaemonMessage, DaemonResponse} from './types.js';
import {
  DAEMON_SCRIPT_PATH,
  getSocketPath,
  getPidFilePath,
  isDaemonRunning,
} from './utils.js';

const FILE_TIMEOUT = 10_000;

/**
 * Waits for a file to be created and populated (removed = false) or removed (removed = true).
 */
function waitForFile(filePath: string, removed = false) {
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const exists = fs.existsSync(filePath);
      if (removed) {
        return !exists;
      }
      if (!exists) {
        return false;
      }
      try {
        return fs.statSync(filePath).size > 0;
      } catch {
        return false;
      }
    };

    if (check()) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      fs.unwatchFile(filePath);
      reject(
        new Error(
          `Timeout: file ${filePath} ${removed ? 'not removed' : 'not found'} within ${FILE_TIMEOUT}ms`,
        ),
      );
    }, FILE_TIMEOUT);

    fs.watchFile(filePath, {interval: 500}, () => {
      if (check()) {
        clearTimeout(timer);
        fs.unwatchFile(filePath);
        resolve();
      }
    });
  });
}

export async function startDaemon(mcpArgs: string[] = []) {
  if (isDaemonRunning()) {
    logger('Daemon is already running');
    return;
  }

  const pidFilePath = getPidFilePath();

  if (fs.existsSync(pidFilePath)) {
    fs.unlinkSync(pidFilePath);
  }

  logger('Starting daemon...', ...mcpArgs);
  const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH, ...mcpArgs], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
    cwd: process.cwd(),
    windowsHide: true,
  });
  child.unref();

  await waitForFile(pidFilePath);
}

const SEND_COMMAND_TIMEOUT = 60_000; // ms

/**
 * `sendCommand` opens a socket connection sends a single command and disconnects.
 */
export async function sendCommand(
  command: DaemonMessage,
): Promise<DaemonResponse> {
  const socketPath = getSocketPath();

  const socket = net.createConnection({
    path: socketPath,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timeout waiting for daemon response'));
    }, SEND_COMMAND_TIMEOUT);

    const transport = new PipeTransport(socket, socket);
    transport.onmessage = async (message: string) => {
      clearTimeout(timer);
      logger('onmessage', message);
      resolve(JSON.parse(message));
    };
    socket.on('error', error => {
      clearTimeout(timer);
      logger('Socket error:', error);
      reject(error);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      logger('Socket closed:');
      reject(new Error('Socket closed'));
    });
    logger('Sending message', command);
    transport.send(JSON.stringify(command));
  });
}

export async function stopDaemon() {
  if (!isDaemonRunning()) {
    logger('Daemon is not running');
    return;
  }

  const pidFilePath = getPidFilePath();

  await sendCommand({method: 'stop'});

  await waitForFile(pidFilePath, /*removed=*/ true);
}

export async function handleResponse(
  response: CallToolResult,
  format: 'json' | 'md',
): Promise<string> {
  if (response.isError) {
    return JSON.stringify(response.content);
  }
  if (format === 'json') {
    if (response.structuredContent) {
      return JSON.stringify(response.structuredContent);
    }
    // Fall-through to text for backward compatibility.
  }
  const chunks = [];
  for (const content of response.content) {
    if (content.type === 'text') {
      chunks.push(content.text);
    } else if (content.type === 'image') {
      const imageData = content.data;
      const mimeType = content.mimeType;
      let extension = '.png';
      switch (mimeType) {
        case 'image/jpg':
        case 'image/jpeg':
          extension = '.jpeg';
          break;
        case 'webp':
          extension = '.webp';
          break;
      }
      const data = Buffer.from(imageData, 'base64');
      const name = crypto.randomUUID();
      const {filepath} = await saveTemporaryFile(data, `${name}${extension}`);
      chunks.push(`Saved to ${filepath}.`);
    } else {
      throw new Error('Not supported response content type');
    }
  }
  return format === 'md' ? chunks.join(' ') : JSON.stringify(chunks);
}
