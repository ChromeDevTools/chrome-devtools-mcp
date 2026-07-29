/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import {debuglog} from 'node:util';

import type {Logger} from '../types.js';

let fileLogger: ((...args: unknown[]) => void) | null = null;

export function saveLogsToFile(fileName: string): fs.WriteStream {
  const logFile = fs.createWriteStream(fileName, {flags: 'a+'});

  fileLogger = (...chunks: unknown[]) => {
    if (logFile.closed) {
      return;
    }
    logFile.write(`${chunks.join(' ')}\n`);
  };

  logFile.on('error', function (error) {
    console.error(`Error when opening/writing to log file: ${error.message}`);
    logFile.end();
    process.exit(1);
  });
  return logFile;
}

export function flushLogs(
  logFile: fs.WriteStream,
  timeoutMs = 2000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(reject, timeoutMs);
    logFile.end(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const mcpDebugNamespace = 'mcp:log';

const nodeDebugLogger = debuglog(mcpDebugNamespace);

export const logger: Logger = () => {
  if (fileLogger) {
    return fileLogger;
  } else if (nodeDebugLogger.enabled) {
    return nodeDebugLogger as unknown as Logger;
  }
  return undefined;
};
