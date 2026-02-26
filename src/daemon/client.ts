/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';

import {logger} from '../logger.js';
import {PipeTransport} from '../third_party/index.js';

import type {DaemonMessage} from './types.js';
import {
  DAEMON_SCRIPT_PATH,
  getSocketPath,
  getPidFilePath,
  isDaemonRunning,
} from './utils.js';

/**
 * Waits for a file to be created and populated.
 */
function waitForFile(filePath: string, timeout = 5000) {
  return new Promise<void>((resolve, reject) => {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      fs.unwatchFile(filePath);
      reject(
        new Error(`Timeout: file ${filePath} not found within ${timeout}ms`),
      );
    }, timeout);

    fs.watchFile(filePath, {interval: 500}, curr => {
      if (curr.size > 0) {
        clearTimeout(timer);
        fs.unwatchFile(filePath); // Always clean up your listeners!
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

  logger('Starting daemon...');
  const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH, ...mcpArgs], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });

  await new Promise<void>((resolve, reject) => {
    child.on('error', err => {
      reject(err);
    });
    child.on('exit', code => {
      logger(`Child exited with code ${code}`);
      reject(new Error(`Daemon process exited prematurely with code ${code}`));
    });

    waitForFile(getPidFilePath()).then(resolve).catch(reject);
  });

  child.unref();
  logger(`Pid file found ${getPidFilePath()}`);
}

const SEND_COMMAND_TIMEOUT = 60_000; // ms

/**
 * `sendCommand` opens a socket connection sends a single command and disconnects.
 */
async function sendCommand(command: DaemonMessage) {
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

  await sendCommand({method: 'stop'});
}
