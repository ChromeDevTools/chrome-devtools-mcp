/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';

import debug from 'debug';

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

export const logger = debug(mcpDebugNamespace);
