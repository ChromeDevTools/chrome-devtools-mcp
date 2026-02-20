/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

// All logs go to stderr only.
// stderr output appears in the host VS Code's MCP output channel
// as "[server stderr]" entries, giving full visibility via read_output_channels.
debug.enable(namespacesToEnable.join(','));
debug.log = function (...chunks: unknown[]) {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] ${formatLogChunks(chunks)}\n`);
};

export const logger = debug(mcpDebugNamespace);
