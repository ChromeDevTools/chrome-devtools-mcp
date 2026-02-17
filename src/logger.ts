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

const ANSI_RE = /\x1b\[[0-9;]*m/g;
// Strip the `debug` package's own prefix (ISO timestamp + namespace) and +Nms suffix
const DEBUG_PREFIX_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+mcp:log\s*/;
const DEBUG_SUFFIX_RE = /\s+\+\d+m?s$/;

function formatLogChunks(chunks: unknown[]): string {
  const raw = chunks
    .map(c => (typeof c === 'string' ? c : JSON.stringify(c)))
    .join(' ')
    .replace(ANSI_RE, '');
  return raw.replace(DEBUG_PREFIX_RE, '').replace(DEBUG_SUFFIX_RE, '');
}

// Always enable the mcp:log namespace so output is visible.
// By default, write to stderr in a clean timestamped format.
// stderr output appears in the host VS Code's MCP output channel
// as "[server stderr]" entries, giving full visibility via read_output_channels.
debug.enable(namespacesToEnable.join(','));
debug.log = function (...chunks: unknown[]) {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] ${formatLogChunks(chunks)}\n`);
};

export function saveLogsToFile(fileName: string): fs.WriteStream {
  // Re-enable (idempotent) and tee output to BOTH stderr and the log file.
  // stderr output appears in the host VS Code's MCP output channel;
  // the file provides a persistent on-disk record for post-mortem analysis.
  debug.enable(namespacesToEnable.join(','));

  const logFile = fs.createWriteStream(fileName, {flags: 'a+'});
  debug.log = function (...chunks: unknown[]) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${formatLogChunks(chunks)}\n`;
    process.stderr.write(line);
    logFile.write(line);
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

export const logger = debug(mcpDebugNamespace);
