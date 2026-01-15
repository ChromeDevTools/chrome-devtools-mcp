/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

import {debug} from './third_party/index.js';

const mcpDebugNamespace = 'mcp:log';

const namespacesToEnable = [
  mcpDebugNamespace,
  ...(process.env['DEBUG'] ? [process.env['DEBUG']] : []),
];

export function saveLogsToFile(fileName: string): fs.WriteStream {
  // Enable overrides everything so we need to add them
  debug.enable(namespacesToEnable.join(','));

  const logFile = fs.createWriteStream(fileName, {flags: 'a+'});
  debug.log = function (...chunks: any[]) {
    logFile.write(`${chunks.join(' ')}\n`);
  };
  logFile.on('error', function (error) {
    console.error(`Error when opening/writing to log file: ${error.message}`);
    logFile.end();
    process.exit(1);
  });
  return logFile;
}

export function saveLogsToFileSync(fileName: string): void {
  debug.enable(namespacesToEnable.join(','));

  let fd: number | undefined;
  try {
    fd = fs.openSync(fileName, 'a+');
  } catch (error) {
    console.error(`Error when opening log file: ${error.message}`);
    process.exit(1);
  }

  debug.log = function (...chunks: any[]) {
    if (fd !== undefined) {
      try {
        fs.writeSync(fd, `${chunks.join(' ')}\n`);
      } catch (error) {
        console.error(`Error when writing to log file: ${error.message}`);
      }
    }
  };
}

export const logger = debug(mcpDebugNamespace);
